import { useCallback, useEffect, useRef, useState } from 'react';
import {
  transcribeAudio,
  extensionForMimeType,
  isSupportedAudioFile,
  MAX_UPLOAD_BYTES,
  FileTooLargeError,
} from '../services/groqTranscriptionService';
import { normalizeAiMarkdown } from '../utils/normalizeAiMarkdown';

export type VoiceNoteStage = 'idle' | 'recording' | 'processing' | 'error';
export type VoiceNoteInputMode = 'record' | 'upload';
export type VoiceNoteProcessingPhase = 'uploading' | 'transcribing' | 'generating';

export interface VoiceNoteState {
  stage: VoiceNoteStage;
  inputMode: VoiceNoteInputMode;
  elapsedSeconds: number;
  processingPhase: VoiceNoteProcessingPhase | null;
  // For a live recording, the total grows as segments are produced and is
  // only final once recording stops; for an upload it's fixed at 1.
  totalSegments: number;
  completedSegments: number;
  // 0-1 fractional progress of whatever is currently uploading — blended
  // with completedSegments/totalSegments so the bar advances smoothly
  // instead of only jumping at segment boundaries.
  currentUploadFraction: number;
  transcriptSoFar: string;
  errorMessage: string;
}

interface UseVoiceNotePipelineOptions {
  groqApiKey: string;
  geminiApiKey: string;
  onNoteGenerated: (markdown: string) => void;
  // Fired whenever the pipeline lands in the 'error' stage — App-level code
  // uses this to surface a toast when the modal isn't open to show it inline.
  onError?: (message: string) => void;
}

// A long recording is split into segments that are transcribed as they
// complete (rather than one giant upload at the very end) so: (1) Groq's
// per-file size cap can't be exceeded no matter how long the recording
// runs, and (2) most segments are already transcribed by the time the user
// stops, so there's only a short remainder to wait through instead of the
// whole thing.
//
// Overridable via VITE_VOICE_SEGMENT_MS for testing — real usage always
// falls back to 15 minutes.
const SEGMENT_DURATION_MS = Number(import.meta.env.VITE_VOICE_SEGMENT_MS) || 15 * 60 * 1000;

// 32kbps opus is plenty for intelligible speech and keeps a 15-minute
// segment around ~3.6MB — comfortably under Groq's 25MB free-tier cap even
// with encoding overhead.
const AUDIO_BITS_PER_SECOND = 32000;

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
const pickSupportedMimeType = (): string | undefined => {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return MIME_CANDIDATES.find(type => MediaRecorder.isTypeSupported?.(type));
};

const initialState: VoiceNoteState = {
  stage: 'idle',
  inputMode: 'record',
  elapsedSeconds: 0,
  processingPhase: null,
  totalSegments: 0,
  completedSegments: 0,
  currentUploadFraction: 0,
  transcriptSoFar: '',
  errorMessage: '',
};

export const useVoiceNotePipeline = ({ groqApiKey, geminiApiKey, onNoteGenerated, onError }: UseVoiceNotePipelineOptions) => {
  const [state, setState] = useState<VoiceNoteState>(initialState);

  // Long-lived async work (recording, the transcription queue, generation)
  // reads these instead of closing over the props directly, so it always
  // sees the latest values without needing to be torn down and restarted
  // whenever a prop changes mid-flight.
  const groqApiKeyRef = useRef(groqApiKey);
  const geminiApiKeyRef = useRef(geminiApiKey);
  const onNoteGeneratedRef = useRef(onNoteGenerated);
  const onErrorRef = useRef(onError);
  useEffect(() => { groqApiKeyRef.current = groqApiKey; }, [groqApiKey]);
  useEffect(() => { geminiApiKeyRef.current = geminiApiKey; }, [geminiApiKey]);
  useEffect(() => { onNoteGeneratedRef.current = onNoteGenerated; }, [onNoteGenerated]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isStillRecordingRef = useRef(false);
  const discardRef = useRef(false);
  const cancelledRef = useRef(false);
  const finalizedRef = useRef(false);
  const elapsedTimerRef = useRef<number | null>(null);
  const segmentTimerRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const segmentQueueRef = useRef<{ blob: Blob; filename: string }[]>([]);
  const queueRunningRef = useRef(false);
  const transcriptPartsRef = useRef<string[]>([]);

  const clearElapsedTimer = () => {
    if (elapsedTimerRef.current !== null) {
      window.clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  };
  const clearSegmentTimer = () => {
    if (segmentTimerRef.current !== null) {
      window.clearInterval(segmentTimerRef.current);
      segmentTimerRef.current = null;
    }
  };
  const releaseStream = () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  };

  const resetToIdle = useCallback(() => {
    cancelledRef.current = false;
    setState(s => ({
      ...s,
      stage: 'idle',
      elapsedSeconds: 0,
      processingPhase: null,
      totalSegments: 0,
      completedSegments: 0,
      currentUploadFraction: 0,
      transcriptSoFar: '',
      errorMessage: '',
    }));
  }, []);

  const handlePipelineError = useCallback((error: unknown) => {
    console.error('Voice note pipeline failed:', error);
    // Explicitly tear down recording rather than relying on the recorder
    // implicitly stopping once its stream is released — this can happen
    // mid-recording (e.g. a background segment fails to transcribe because
    // the API key was revoked), so it must stop cleanly rather than trying
    // to rotate into yet another doomed segment.
    isStillRecordingRef.current = false;
    discardRef.current = true;
    clearSegmentTimer();
    clearElapsedTimer();
    releaseStream();
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      recorder.stop();
    }
    const message = error instanceof Error ? error.message : '發生未知的錯誤，請再試一次。';
    setState(s => ({ ...s, stage: 'error', processingPhase: null, errorMessage: message }));
    onErrorRef.current?.(message);
  }, []);

  const finalizeAndGenerate = useCallback(async () => {
    if (cancelledRef.current) return;
    const combinedTranscript = transcriptPartsRef.current.join('\n\n');
    if (!combinedTranscript.trim()) {
      handlePipelineError(new Error('沒有辨識到任何語音內容，請確認錄音或音檔中有清楚的說話聲。'));
      return;
    }
    setState(s => ({ ...s, processingPhase: 'generating' }));
    try {
      const { generateNoteFromTranscript, MissingApiKeyError } = await import('../services/geminiChatService');
      try {
        const noteMarkdown = await generateNoteFromTranscript(combinedTranscript, geminiApiKeyRef.current);
        if (cancelledRef.current) return;
        onNoteGeneratedRef.current(normalizeAiMarkdown(noteMarkdown));
        resetToIdle();
      } catch (error) {
        if (cancelledRef.current) return;
        if (error instanceof MissingApiKeyError) {
          handlePipelineError(new Error('尚未設定 Gemini API 金鑰，請至設定頁面新增。'));
        } else {
          handlePipelineError(error);
        }
      }
    } catch (error) {
      if (cancelledRef.current) return;
      handlePipelineError(error);
    }
  }, [handlePipelineError, resetToIdle]);

  const drainQueue = useCallback(async () => {
    if (queueRunningRef.current) return;
    queueRunningRef.current = true;
    try {
      while (segmentQueueRef.current.length > 0) {
        if (cancelledRef.current) return;
        const next = segmentQueueRef.current.shift()!;
        const controller = new AbortController();
        abortControllerRef.current = controller;
        try {
          const text = await transcribeAudio(next.blob, next.filename, groqApiKeyRef.current, {
            signal: controller.signal,
            onUploadProgress: (fraction) => {
              if (cancelledRef.current) return;
              setState(s => ({ ...s, currentUploadFraction: fraction }));
            },
          });
          if (cancelledRef.current) return;
          transcriptPartsRef.current.push(text);
          setState(s => ({
            ...s,
            completedSegments: s.completedSegments + 1,
            currentUploadFraction: 0,
            transcriptSoFar: transcriptPartsRef.current.join('\n\n'),
          }));
        } catch (error) {
          if (cancelledRef.current) return;
          handlePipelineError(error);
          return;
        }
      }
    } finally {
      queueRunningRef.current = false;
    }

    if (!isStillRecordingRef.current && !cancelledRef.current && !finalizedRef.current) {
      finalizedRef.current = true;
      await finalizeAndGenerate();
    }
  }, [finalizeAndGenerate, handlePipelineError]);

  const startSegment = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const mimeType = pickSupportedMimeType();
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: AUDIO_BITS_PER_SECOND })
      : new MediaRecorder(stream, { audioBitsPerSecond: AUDIO_BITS_PER_SECOND });
    const chunks: Blob[] = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    recorder.onstop = () => {
      const capturedMimeType = recorder.mimeType || 'audio/webm';
      const blob = new Blob(chunks, { type: capturedMimeType });

      if (discardRef.current || cancelledRef.current) {
        return;
      }

      if (blob.size > 0) {
        const filename = `segment-${Date.now()}.${extensionForMimeType(capturedMimeType)}`;
        segmentQueueRef.current.push({ blob, filename });
        setState(s => ({ ...s, totalSegments: s.totalSegments + 1 }));
      }

      if (isStillRecordingRef.current) {
        startSegment();
      } else {
        releaseStream();
      }

      void drainQueue();
    };

    mediaRecorderRef.current = recorder;
    recorder.start();
  }, [drainQueue]);

  const startRecording = useCallback(async () => {
    setState(s => ({ ...s, errorMessage: '' }));
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      handlePipelineError(new Error('這個瀏覽器不支援錄音功能，請改用最新版的 Chrome、Edge 或 Safari。'));
      return;
    }

    // A fresh session always starts clean, regardless of whether the
    // previous one ended via a normal finish or a cancel() (which
    // deliberately leaves this flag set — see cancel()'s own comment).
    // Cleared *before* the async getUserMedia call below, so the check
    // after it can still correctly detect a cancel that happens while this
    // very call is in flight, without being confused by a stale one.
    cancelledRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (cancelledRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      streamRef.current = stream;
      discardRef.current = false;
      finalizedRef.current = false;
      isStillRecordingRef.current = true;
      transcriptPartsRef.current = [];
      segmentQueueRef.current = [];

      setState(s => ({
        ...s,
        stage: 'recording',
        elapsedSeconds: 0,
        processingPhase: null,
        totalSegments: 0,
        completedSegments: 0,
        currentUploadFraction: 0,
        transcriptSoFar: '',
      }));

      startSegment();
      elapsedTimerRef.current = window.setInterval(() => {
        setState(s => ({ ...s, elapsedSeconds: s.elapsedSeconds + 1 }));
      }, 1000);
      segmentTimerRef.current = window.setInterval(() => {
        // Rotating to a new MediaRecorder finalizes a complete, independently
        // transcribable file for the segment that just ended (a raw
        // MediaRecorder `timeslice` chunk isn't independently decodable —
        // only the very first one carries the container header).
        mediaRecorderRef.current?.stop();
      }, SEGMENT_DURATION_MS);
    } catch (error) {
      releaseStream();
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        handlePipelineError(new Error('麥克風權限被拒絕，請至瀏覽器設定允許存取麥克風後再試一次。'));
      } else if (error instanceof DOMException && error.name === 'NotFoundError') {
        handlePipelineError(new Error('找不到可用的麥克風裝置。'));
      } else {
        handlePipelineError(new Error('無法啟動錄音，請確認麥克風已連接並授權存取。'));
      }
    }
  }, [handlePipelineError, startSegment]);

  const stopRecording = useCallback(() => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;
    isStillRecordingRef.current = false;
    discardRef.current = false;
    clearSegmentTimer();
    clearElapsedTimer();
    setState(s => ({ ...s, stage: 'processing', processingPhase: 'transcribing' }));
    mediaRecorderRef.current.stop();
  }, []);

  const selectFile = useCallback(async (file: File) => {
    setState(s => ({ ...s, errorMessage: '' }));
    if (!isSupportedAudioFile(file)) {
      handlePipelineError(new Error('不支援的檔案格式，請上傳 mp3、wav、m4a、webm 等常見音訊格式。'));
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      handlePipelineError(new FileTooLargeError());
      return;
    }

    cancelledRef.current = false;
    finalizedRef.current = false;
    transcriptPartsRef.current = [];
    setState(s => ({
      ...s,
      stage: 'processing',
      processingPhase: 'uploading',
      totalSegments: 1,
      completedSegments: 0,
      currentUploadFraction: 0,
      transcriptSoFar: '',
    }));

    const controller = new AbortController();
    abortControllerRef.current = controller;
    try {
      const text = await transcribeAudio(file, file.name, groqApiKeyRef.current, {
        signal: controller.signal,
        onUploadProgress: (fraction) => {
          if (cancelledRef.current) return;
          setState(s => ({
            ...s,
            currentUploadFraction: fraction,
            processingPhase: fraction >= 1 ? 'transcribing' : 'uploading',
          }));
        },
      });
      if (cancelledRef.current) return;
      transcriptPartsRef.current.push(text);
      setState(s => ({ ...s, completedSegments: 1, transcriptSoFar: text }));
      finalizedRef.current = true;
      await finalizeAndGenerate();
    } catch (error) {
      if (cancelledRef.current) return;
      handlePipelineError(error);
    }
  }, [finalizeAndGenerate, handlePipelineError]);

  // Aborts everything in flight and returns to a clean idle state — used
  // both for "discard this recording" (mid-recording) and "cancel" (mid
  // transcription/generation), since both need to do the same cleanup.
  const cancel = useCallback(() => {
    cancelledRef.current = true;
    isStillRecordingRef.current = false;
    discardRef.current = true;
    clearSegmentTimer();
    clearElapsedTimer();
    abortControllerRef.current?.abort();
    releaseStream();
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      recorder.stop();
    }
    segmentQueueRef.current = [];
    transcriptPartsRef.current = [];
    // Resets the visible UI state but deliberately does NOT flip
    // cancelledRef back to false the way resetToIdle() does — the abort()
    // call above doesn't reject its in-flight request synchronously, so
    // that rejection is still going to arrive at a `catch` block a
    // microtask or two from now. Those catch blocks check cancelledRef to
    // tell "this failed because we cancelled it" apart from a real error;
    // clearing the flag here would already be too early and make an
    // intentional cancellation surface as a scary "Aborted" error. The flag
    // is only cleared for real once a fresh recording/upload actually
    // starts (see startRecording / selectFile).
    setState(s => ({
      ...s,
      stage: 'idle',
      elapsedSeconds: 0,
      processingPhase: null,
      totalSegments: 0,
      completedSegments: 0,
      currentUploadFraction: 0,
      transcriptSoFar: '',
      errorMessage: '',
    }));
  }, []);

  const setInputMode = useCallback((mode: VoiceNoteInputMode) => {
    setState(s => ({ ...s, inputMode: mode }));
  }, []);

  // Retrying from an error goes back to idle, keeping whatever input mode
  // the user had selected (so an upload failure doesn't bounce them back to
  // the recording tab).
  const retry = resetToIdle;

  // Release the mic / abort in-flight work if the whole app unmounts.
  // (Doesn't fire on ordinary modal open/close — that's the point.) Also
  // clears any stale cancellation flag on (re)mount — React's StrictMode
  // deliberately mounts, unmounts, and remounts once in development to
  // surface exactly this kind of bug: without this, the dev-only fake
  // unmount would permanently poison cancelledRef, silently no-opping every
  // future recording/upload attempt for the rest of the session.
  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
      clearSegmentTimer();
      clearElapsedTimer();
      abortControllerRef.current?.abort();
      releaseStream();
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.onstop = null;
        recorder.stop();
      }
    };
  }, []);

  return {
    state,
    actions: { startRecording, stopRecording, selectFile, cancel, retry, setInputMode },
  };
};
