import { useCallback, useEffect, useRef, useState } from 'react';
import {
  transcribeAudio,
  extensionForMimeType,
  isSupportedMediaFile,
  isVideoFile,
  MAX_UPLOAD_BYTES,
  RateLimitError,
} from '../services/groqTranscriptionService';
import { normalizeAiMarkdown } from '../utils/normalizeAiMarkdown';
import { splitAudioFileIntoSegments, MAX_SPLITTABLE_FILE_BYTES } from '../utils/audioSplitter';

export type VoiceNoteStage = 'idle' | 'recording' | 'processing' | 'error';
export type VoiceNoteInputMode = 'record' | 'upload';
export type VoiceNoteProcessingPhase = 'splitting' | 'uploading' | 'transcribing' | 'generating';

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
  // Non-null while automatically waiting out a Groq rate-limit cooldown
  // before retrying the current segment, counting down the seconds left.
  rateLimitRetrySeconds: number | null;
  // Whether the current session's source material includes a video track
  // (an uploaded video file, or a screen recording that kept its video) —
  // drives the "extracting audio" label, the <video> preview, and download
  // filenames. Transcription itself is unaffected either way: it always
  // runs on audio only.
  hasVideo: boolean;
  // Whether there's currently a raw recording/file available to download,
  // independent of whether transcription has finished or even succeeded.
  canDownload: boolean;
  // Object URL for the <video> preview when hasVideo is true; null otherwise
  // (including for audio-only sessions, which don't need a preview).
  previewUrl: string | null;
}

export interface VoiceRecordingData {
  transcript: string;
  segments: Blob[];
}

interface UseVoiceNotePipelineOptions {
  groqApiKey: string;
  geminiApiKey: string;
  // `recording` carries the raw transcript and every audio segment that
  // went into it, for callers that want to persist the source material
  // alongside the generated note.
  onNoteGenerated: (markdown: string, recording: VoiceRecordingData) => void;
  // Fired whenever the pipeline lands in the 'error' stage — App-level code
  // uses this to surface a toast when the modal isn't open to show it inline.
  onError?: (message: string) => void;
}

export interface StartRecordingOptions {
  // Also capture audio from a shared browser tab/window/screen (mixed with
  // the microphone) via getDisplayMedia — lets the transcript include the
  // other side of an online meeting, not just the user's own mic.
  captureTabAudio?: boolean;
  // Only meaningful alongside captureTabAudio: keep the shared video track
  // too and record it in parallel (for preview/download), purely for the
  // user's own reference — it's never sent for transcription.
  captureVideo?: boolean;
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

// How many times to automatically wait out a Groq rate-limit (429) cooldown
// and retry the SAME segment before giving up and surfacing a real error.
// Each retry reuses the server's own suggested wait time, so this only caps
// runaway retrying against a persistently exhausted quota.
const MAX_RATE_LIMIT_RETRIES = 5;

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
const pickSupportedMimeType = (): string | undefined => {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return MIME_CANDIDATES.find(type => MediaRecorder.isTypeSupported?.(type));
};

// Candidates for the parallel recorder that captures shared-screen video
// (plus mixed audio) purely for download/preview — kept separate from
// MIME_CANDIDATES above because that list is audio-only and invalid for a
// stream that includes a video track.
const VIDEO_MIME_CANDIDATES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
const pickSupportedVideoMimeType = (): string | undefined => {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return VIDEO_MIME_CANDIDATES.find(type => MediaRecorder.isTypeSupported?.(type));
};

// Maps a recorded/uploaded Blob's mimeType to a download filename extension.
// Deliberately different from extensionForMimeType (which picks an
// extension Groq's API will accept as an upload hint) — this is purely
// about what a user's OS/media player expects to see locally.
const extensionForDownload = (mimeType: string): string => {
  const isVideoMime = mimeType.startsWith('video/');
  const hasMp4 = mimeType.includes('mp4');
  if (isVideoMime) return hasMp4 ? 'mp4' : 'webm';
  return hasMp4 ? 'm4a' : 'webm';
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
  rateLimitRetrySeconds: null,
  hasVideo: false,
  canDownload: false,
  previewUrl: null,
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
  // The stream actually fed to the transcription recorder above — either
  // the raw mic stream, or (when tab-audio capture is on) the mixed
  // mic+display audio destination stream. Always audio-only.
  const streamRef = useRef<MediaStream | null>(null);
  // The *original* captured streams, kept separately from streamRef because
  // stopping tracks on a Web Audio destination stream doesn't release the
  // underlying hardware capture — only stopping the original getUserMedia /
  // getDisplayMedia tracks does.
  const micStreamRef = useRef<MediaStream | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const mixAudioContextRef = useRef<AudioContext | null>(null);
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
  // Every segment successfully transcribed this session (recorded or
  // split from an upload), kept around so the whole recording can be
  // handed off to the caller alongside the generated note — not just the
  // transcript.
  const audioSegmentsRef = useRef<Blob[]>([]);

  // The parallel recorder that captures shared-screen video (+ mixed
  // audio) purely for download/preview — never touches transcription.
  const downloadRecorderRef = useRef<MediaRecorder | null>(null);
  const downloadChunksRef = useRef<Blob[]>([]);
  // Source material for the "download this recording" action: either the
  // originally uploaded file (kept as-is, at full original quality), or the
  // raw MediaRecorder blob(s) from a live recording — mutually exclusive.
  const uploadedFileRef = useRef<File | null>(null);
  const rawRecordingBlobsRef = useRef<Blob[]>([]);
  const hasVideoRef = useRef(false);
  const previewUrlRef = useRef<string | null>(null);

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
    micStreamRef.current?.getTracks().forEach(track => track.stop());
    micStreamRef.current = null;
    displayStreamRef.current?.getTracks().forEach(track => track.stop());
    displayStreamRef.current = null;
    if (mixAudioContextRef.current) {
      void mixAudioContextRef.current.close();
      mixAudioContextRef.current = null;
    }
  };
  const revokePreviewUrl = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  };

  // Starts a second, independent MediaRecorder over the shared video track
  // (plus the same mixed audio the transcription recorder is using) so the
  // user can preview/download what was on screen — entirely separate from
  // the audio-only segment queue that feeds transcription.
  const startDownloadRecorder = (audioStream: MediaStream, capturedVideoTrack: MediaStreamTrack) => {
    const combinedStream = new MediaStream([...audioStream.getAudioTracks(), capturedVideoTrack]);
    const mimeType = pickSupportedVideoMimeType();
    const recorder = mimeType
      ? new MediaRecorder(combinedStream, { mimeType })
      : new MediaRecorder(combinedStream);
    downloadChunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) downloadChunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      if (discardRef.current || cancelledRef.current) return;
      const capturedMimeType = recorder.mimeType || 'video/webm';
      const blob = new Blob(downloadChunksRef.current, { type: capturedMimeType });
      if (blob.size > 0) {
        rawRecordingBlobsRef.current = [blob];
        revokePreviewUrl();
        previewUrlRef.current = URL.createObjectURL(blob);
        setState(s => ({ ...s, canDownload: true, previewUrl: previewUrlRef.current }));
      }
    };

    downloadRecorderRef.current = recorder;
    recorder.start();
  };

  const resetToIdle = useCallback(() => {
    cancelledRef.current = false;
    uploadedFileRef.current = null;
    rawRecordingBlobsRef.current = [];
    hasVideoRef.current = false;
    revokePreviewUrl();
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
      rateLimitRetrySeconds: null,
      hasVideo: false,
      canDownload: false,
      previewUrl: null,
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
    const downloadRecorder = downloadRecorderRef.current;
    if (downloadRecorder && downloadRecorder.state !== 'inactive') {
      downloadRecorder.onstop = null;
      downloadRecorder.stop();
    }
    // Deliberately leaves canDownload/hasVideo/previewUrl untouched — a
    // failed transcription shouldn't cost the user their raw recording too;
    // the error screen still offers a download of whatever was captured.
    const message = error instanceof Error ? error.message : '發生未知的錯誤，請再試一次。';
    setState(s => ({ ...s, stage: 'error', processingPhase: null, errorMessage: message, rateLimitRetrySeconds: null }));
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
        onNoteGeneratedRef.current(normalizeAiMarkdown(noteMarkdown), {
          transcript: combinedTranscript,
          segments: audioSegmentsRef.current,
        });
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

  // Counts down `rateLimitRetrySeconds` in the UI while waiting out a Groq
  // 429 cooldown. Clamped to a sane range in case the server ever suggests
  // something absurd — Groq's own hourly window is at most an hour, but a
  // malformed response shouldn't be able to hang the pipeline that long.
  const waitForRateLimitCooldown = useCallback(async (seconds: number): Promise<void> => {
    const clampedSeconds = Math.max(1, Math.min(Math.ceil(seconds), 120));
    const endAt = Date.now() + clampedSeconds * 1000;
    while (Date.now() < endAt) {
      if (cancelledRef.current) break;
      setState(s => ({ ...s, rateLimitRetrySeconds: Math.ceil((endAt - Date.now()) / 1000) }));
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    setState(s => ({ ...s, rateLimitRetrySeconds: null }));
  }, []);

  // Wraps a single transcription call so a Groq rate-limit (429) response
  // waits out the server's own suggested cooldown and retries the exact
  // same blob, instead of failing the whole pipeline outright. Used by both
  // the segment queue and a direct small-file upload, since neither should
  // force the user to re-upload or re-transcribe already-completed work
  // just because the account's hourly quota happened to run dry mid-way.
  const transcribeWithRateLimitRetry = useCallback(async (
    blob: Blob,
    filename: string,
    onUploadProgress?: (fraction: number) => void,
  ): Promise<string> => {
    let attempt = 0;
    for (;;) {
      if (cancelledRef.current) throw new DOMException('Aborted', 'AbortError');
      const controller = new AbortController();
      abortControllerRef.current = controller;
      try {
        return await transcribeAudio(blob, filename, groqApiKeyRef.current, {
          signal: controller.signal,
          onUploadProgress,
        });
      } catch (error) {
        if (cancelledRef.current) throw error;
        if (error instanceof RateLimitError && attempt < MAX_RATE_LIMIT_RETRIES) {
          attempt += 1;
          await waitForRateLimitCooldown(error.retryAfterSeconds);
          if (cancelledRef.current) throw error;
          continue;
        }
        throw error;
      }
    }
  }, [waitForRateLimitCooldown]);

  const drainQueue = useCallback(async () => {
    if (queueRunningRef.current) return;
    queueRunningRef.current = true;
    try {
      while (segmentQueueRef.current.length > 0) {
        if (cancelledRef.current) return;
        const next = segmentQueueRef.current.shift()!;
        try {
          const text = await transcribeWithRateLimitRetry(next.blob, next.filename, (fraction) => {
            if (cancelledRef.current) return;
            setState(s => ({ ...s, currentUploadFraction: fraction }));
          });
          if (cancelledRef.current) return;
          transcriptPartsRef.current.push(text);
          audioSegmentsRef.current.push(next.blob);
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
  }, [finalizeAndGenerate, handlePipelineError, transcribeWithRateLimitRetry]);

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

        // Only treat these audio-only segments as the downloadable source
        // when there's no separate video recording running — when there
        // is, startDownloadRecorder's own onstop is the canonical source
        // instead, so as not to clobber it with audio-only chunks.
        if (!hasVideoRef.current) {
          rawRecordingBlobsRef.current.push(blob);
          setState(s => ({ ...s, canDownload: true }));
        }
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

  const stopRecording = useCallback(() => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;
    isStillRecordingRef.current = false;
    discardRef.current = false;
    clearSegmentTimer();
    clearElapsedTimer();
    setState(s => ({ ...s, stage: 'processing', processingPhase: 'transcribing' }));
    mediaRecorderRef.current.stop();
    if (downloadRecorderRef.current && downloadRecorderRef.current.state !== 'inactive') {
      downloadRecorderRef.current.stop();
    }
  }, []);

  const startRecording = useCallback(async (options?: StartRecordingOptions) => {
    setState(s => ({ ...s, errorMessage: '' }));
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      handlePipelineError(new Error('這個瀏覽器不支援錄音功能，請改用最新版的 Chrome、Edge 或 Safari。'));
      return;
    }
    const wantsTabAudio = !!options?.captureTabAudio;
    if (wantsTabAudio && typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
      handlePipelineError(new Error('這個瀏覽器不支援分享分頁擷取，請改用 Chrome 或 Edge，或取消勾選該選項。'));
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
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (cancelledRef.current) {
        micStream.getTracks().forEach(track => track.stop());
        return;
      }
      micStreamRef.current = micStream;

      let mixedAudioStream = micStream;
      let videoTrack: MediaStreamTrack | undefined;

      if (wantsTabAudio) {
        let displayStream: MediaStream;
        try {
          // Chrome only shows a "Share tab audio" checkbox in its share
          // picker when video is requested — even when only the audio is
          // wanted, video: true must be passed or the tab-sharing option
          // (and its audio checkbox) never appears at all. The video track
          // this unavoidably grants is simply discarded below unless the
          // caller also asked to keep it.
          displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        } catch (shareError) {
          micStream.getTracks().forEach(track => track.stop());
          micStreamRef.current = null;
          if (cancelledRef.current) return;
          if (shareError instanceof DOMException && shareError.name === 'NotAllowedError') {
            // User backed out of the share picker — quietly stay idle
            // rather than surfacing this as an error.
            return;
          }
          throw shareError;
        }
        if (cancelledRef.current) {
          micStream.getTracks().forEach(track => track.stop());
          displayStream.getTracks().forEach(track => track.stop());
          return;
        }
        displayStreamRef.current = displayStream;

        const displayVideoTrack = displayStream.getVideoTracks()[0];
        if (options?.captureVideo && displayVideoTrack) {
          videoTrack = displayVideoTrack;
        } else {
          displayStream.getVideoTracks().forEach(track => track.stop());
        }

        // If the user stops sharing via the browser's own "Stop sharing"
        // bar instead of our own stop button, treat it exactly like
        // pressing stop ourselves rather than leaving the pipeline
        // recording from now-dead tracks indefinitely.
        const trackedTracks = videoTrack ? [...displayStream.getAudioTracks(), videoTrack] : displayStream.getAudioTracks();
        trackedTracks.forEach(track => { track.onended = () => stopRecording(); });

        const displayAudioTrack = displayStream.getAudioTracks()[0];
        if (displayAudioTrack) {
          // Mixes mic + shared-tab audio into one track via Web Audio —
          // both are spoken voice, so no special channel handling needed.
          const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (AudioContextClass) {
            const audioContext = new AudioContextClass();
            mixAudioContextRef.current = audioContext;
            const destination = audioContext.createMediaStreamDestination();
            audioContext.createMediaStreamSource(micStream).connect(destination);
            audioContext.createMediaStreamSource(new MediaStream([displayAudioTrack])).connect(destination);
            mixedAudioStream = destination.stream;
          }
        }
        // If the shared source has no audio track at all (e.g. a window or
        // whole screen was shared instead of a tab, which don't offer
        // "share tab audio"), mixedAudioStream just stays mic-only — video,
        // if kept, still gets recorded for download.
      }

      streamRef.current = mixedAudioStream;
      discardRef.current = false;
      finalizedRef.current = false;
      isStillRecordingRef.current = true;
      transcriptPartsRef.current = [];
      segmentQueueRef.current = [];
      audioSegmentsRef.current = [];
      rawRecordingBlobsRef.current = [];
      uploadedFileRef.current = null;
      hasVideoRef.current = !!videoTrack;
      revokePreviewUrl();

      setState(s => ({
        ...s,
        stage: 'recording',
        elapsedSeconds: 0,
        processingPhase: null,
        totalSegments: 0,
        completedSegments: 0,
        currentUploadFraction: 0,
        transcriptSoFar: '',
        rateLimitRetrySeconds: null,
        hasVideo: !!videoTrack,
        canDownload: false,
        previewUrl: null,
      }));

      startSegment();
      if (videoTrack) {
        startDownloadRecorder(mixedAudioStream, videoTrack);
      }
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
  }, [handlePipelineError, startSegment, stopRecording]);

  // A file under Groq's cap uploads directly; a larger one — or a video
  // file of any size, since its audio track needs extracting first — is
  // decoded and re-encoded into a series of smaller WAV segments
  // client-side (see utils/audioSplitter.ts), then fed through the exact
  // same segment queue used for chunked live recording — drainQueue's own
  // "nothing left and not still recording" check picks up from there and
  // finalizes once they've all been transcribed.
  const selectFile = useCallback(async (file: File) => {
    setState(s => ({ ...s, errorMessage: '' }));
    if (!isSupportedMediaFile(file)) {
      handlePipelineError(new Error('不支援的檔案格式，請上傳 mp3、wav、m4a、webm 等常見音訊格式，或 mp4、mov、webm 等常見影片格式。'));
      return;
    }
    if (file.size > MAX_SPLITTABLE_FILE_BYTES) {
      handlePipelineError(new Error(`檔案超過 ${Math.round(MAX_SPLITTABLE_FILE_BYTES / (1024 * 1024))} MB，瀏覽器端無法處理這麼大的檔案，請先壓縮或改用「錄音」功能分段錄製。`));
      return;
    }

    const fileIsVideo = isVideoFile(file);

    cancelledRef.current = false;
    finalizedRef.current = false;
    transcriptPartsRef.current = [];
    segmentQueueRef.current = [];
    audioSegmentsRef.current = [];
    rawRecordingBlobsRef.current = [];
    uploadedFileRef.current = file;
    hasVideoRef.current = fileIsVideo;
    revokePreviewUrl();
    if (fileIsVideo) previewUrlRef.current = URL.createObjectURL(file);

    if (!fileIsVideo && file.size <= MAX_UPLOAD_BYTES) {
      setState(s => ({
        ...s,
        stage: 'processing',
        processingPhase: 'uploading',
        totalSegments: 1,
        completedSegments: 0,
        currentUploadFraction: 0,
        transcriptSoFar: '',
        rateLimitRetrySeconds: null,
        hasVideo: false,
        canDownload: true,
        previewUrl: null,
      }));

      try {
        const text = await transcribeWithRateLimitRetry(file, file.name, (fraction) => {
          if (cancelledRef.current) return;
          setState(s => ({
            ...s,
            currentUploadFraction: fraction,
            processingPhase: fraction >= 1 ? 'transcribing' : 'uploading',
          }));
        });
        if (cancelledRef.current) return;
        transcriptPartsRef.current.push(text);
        audioSegmentsRef.current.push(file);
        setState(s => ({ ...s, completedSegments: 1, transcriptSoFar: text }));
        finalizedRef.current = true;
        await finalizeAndGenerate();
      } catch (error) {
        if (cancelledRef.current) return;
        handlePipelineError(error);
      }
      return;
    }

    // Too large to upload as-is, or a video file whose audio track needs
    // extracting first — either way, split it client-side. For a video
    // file under the size cap this typically produces a single segment;
    // splitAudioFileIntoSegments handles that exactly like any other
    // single-segment case.
    setState(s => ({
      ...s,
      stage: 'processing',
      processingPhase: 'splitting',
      totalSegments: 0,
      completedSegments: 0,
      currentUploadFraction: 0,
      transcriptSoFar: '',
      rateLimitRetrySeconds: null,
      hasVideo: fileIsVideo,
      canDownload: true,
      previewUrl: previewUrlRef.current,
    }));
    try {
      const segments = await splitAudioFileIntoSegments(file, MAX_UPLOAD_BYTES);
      if (cancelledRef.current) return;
      if (segments.length === 0) {
        handlePipelineError(new Error('無法解析這個檔案，請確認檔案未損毀。'));
        return;
      }
      segmentQueueRef.current = segments;
      setState(s => ({ ...s, processingPhase: 'transcribing', totalSegments: segments.length }));
      void drainQueue();
    } catch (error) {
      if (cancelledRef.current) return;
      // splitAudioFileIntoSegments always rejects with an already
      // user-presentable message (it wraps the browser's own terse decode
      // errors itself), so it's safe to surface directly here.
      handlePipelineError(error);
    }
  }, [drainQueue, finalizeAndGenerate, handlePipelineError, transcribeWithRateLimitRetry]);

  // Downloads whatever raw source material is currently available —
  // the originally uploaded file at full quality, or the raw recorded
  // blob(s) — regardless of whether transcription has finished or even
  // succeeded. A no-op if nothing is available yet.
  const downloadRecording = useCallback(() => {
    let blob: Blob;
    let filename: string;

    if (uploadedFileRef.current) {
      blob = uploadedFileRef.current;
      filename = uploadedFileRef.current.name;
    } else if (rawRecordingBlobsRef.current.length > 0) {
      const mimeType = rawRecordingBlobsRef.current[0].type || 'audio/webm';
      // Concatenating multiple independent recorder blobs isn't a fully
      // well-formed single container (each carries its own header) — in
      // practice this only affects recordings long enough to rotate past
      // SEGMENT_DURATION_MS (15 minutes by default), where some players may
      // only play the first segment. The common case (one segment) is a
      // perfectly valid file.
      blob = rawRecordingBlobsRef.current.length === 1
        ? rawRecordingBlobsRef.current[0]
        : new Blob(rawRecordingBlobsRef.current, { type: mimeType });
      filename = `recording-${Date.now()}.${extensionForDownload(mimeType)}`;
    } else {
      return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, []);

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
    const downloadRecorder = downloadRecorderRef.current;
    if (downloadRecorder && downloadRecorder.state !== 'inactive') {
      downloadRecorder.onstop = null;
      downloadRecorder.stop();
    }
    segmentQueueRef.current = [];
    transcriptPartsRef.current = [];
    audioSegmentsRef.current = [];
    rawRecordingBlobsRef.current = [];
    uploadedFileRef.current = null;
    hasVideoRef.current = false;
    revokePreviewUrl();
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
      rateLimitRetrySeconds: null,
      hasVideo: false,
      canDownload: false,
      previewUrl: null,
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
      const downloadRecorder = downloadRecorderRef.current;
      if (downloadRecorder && downloadRecorder.state !== 'inactive') {
        downloadRecorder.onstop = null;
        downloadRecorder.stop();
      }
      revokePreviewUrl();
    };
  }, []);

  return {
    state,
    actions: { startRecording, stopRecording, selectFile, cancel, retry, setInputMode, downloadRecording },
  };
};
