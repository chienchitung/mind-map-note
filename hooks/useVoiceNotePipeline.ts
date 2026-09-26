import { useCallback, useEffect, useRef, useState } from 'react';
import {
  extensionForMimeType,
  isSupportedMediaFile,
  isVideoFile,
  MissingGroqApiKeyError,
  RateLimitError,
  InvalidGroqApiKeyError,
  type TranscriptionResult,
} from '../services/groqTranscriptionService';
import { transcribeViaBackend, MAX_BACKEND_UPLOAD_BYTES, type BackendTranscribeProgress } from '../services/backendAudioService';
// Statically imported (not `await import(...)`) so this module is bundled
// into the entry chunk rather than its own hashed lazy chunk — the same
// reasoning as VoiceNoteModal's entry-bundle move: a deployment that
// replaces this chunk's hash while a tab is mid-session would otherwise
// 404 fetching the old one right at the note-generation step, discarding
// an already-fully-transcribed recording. See index.tsx's vite:preloadError
// handler, which recovers *other* stale chunks via a reload — but a reload
// here would also wipe the in-memory transcript this step depends on.
import { generateNoteFromTranscript, MissingApiKeyError, isRetryableGeminiError, extractGeminiErrorMessage } from '../services/geminiChatService';
import { normalizeAiMarkdown } from '../utils/normalizeAiMarkdown';
import { downloadBlob } from '../utils/downloadBlob';
import { translate } from '../i18n/translations';
import useLocalStorage from './useLocalStorage';

// Persists the user's explicit microphone choice (a deviceId from
// enumerateDevices(), or '' for "system default") across sessions — see
// startRecording below. Without this, getUserMedia always follows
// whatever the OS currently reports as its default input device, which on
// macOS can silently change mid-session (e.g. an iPhone Continuity
// microphone connecting) without the user ever choosing that.
const MICROPHONE_DEVICE_ID_STORAGE_KEY = 'voice-note-microphone-device-id';

export type VoiceNoteStage = 'idle' | 'recording' | 'processing' | 'error';
export type VoiceNoteInputMode = 'record' | 'upload';
export type VoiceNoteProcessingPhase = 'uploading' | 'normalizing' | 'transcribing' | 'generating';

export interface VoiceNoteState {
  stage: VoiceNoteStage;
  inputMode: VoiceNoteInputMode;
  elapsedSeconds: number;
  // Wall-clock time spent uploading, transcribing, and generating the note.
  processingElapsedSeconds: number;
  processingPhase: VoiceNoteProcessingPhase | null;
  // While transcribing, reflects the backend's own chunk progress (a long
  // recording is split into several chunks server-side — see
  // backend/audio_pipeline.py); both stay at 0/0 for phases before that.
  totalSegments: number;
  completedSegments: number;
  transcriptSoFar: string;
  errorMessage: string;
  // Non-null while the backend is waiting out a Groq rate-limit cooldown
  // before retrying a chunk (counting down the seconds left) — driven by the
  // backend's own 'rate_limited' progress event, since retrying now happens
  // server-side rather than in this client.
  rateLimitRetrySeconds: number | null;
  // Non-null while automatically waiting out a transient Gemini failure
  // (503 "model overloaded", 429 rate limit) before retrying note
  // generation — the transcript is already fully in hand at this point, so
  // this is the very last step of a session; without a retry here, a
  // long recording's entire transcription work was thrown away by one
  // momentary overload on Gemini's side.
  generationRetrySeconds: number | null;
  // True once a Render free-tier cold start has been detected and this
  // session is retrying automatically — see backendAudioService's
  // pingBackendAwake.
  backendWakingUp: boolean;
  // Tracks automatic input recovery when an external microphone disappears.
  microphoneStatus: 'connected' | 'reconnecting' | 'recovered' | 'failed';
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
  // True right after a video recording stops, until the user explicitly
  // confirms they've had a chance to download it. Transcription still runs
  // in the background during this wait, but the pipeline holds off calling
  // finalizeAndGenerate() — which ends in resetToIdle() wiping the video —
  // until that confirmation, so the video can't be silently lost to a note
  // that finishes generating faster than the user reacts. Always false for
  // audio-only sessions and uploads.
  awaitingVideoReview: boolean;
  // How many screenshots have been auto-captured from the shared screen so
  // far this session — see startScreenshotCapture. Always 0 unless the
  // current recording kept a video track (captureVideo).
  screenshotCount: number;
}

export interface VoiceRecordingData {
  transcript: string;
  // The same transcript, but broken into per-segment `[MM:SS] text` lines
  // on a single continuous timeline across the whole recording — for
  // download/reference only; the plain `transcript` above (unmodified) is
  // still what's sent to Gemini for note generation.
  timestampedTranscript: string;
  segments: Blob[];
  // Always 0 now that a whole recording/file transcribes as a single
  // backend call (all-or-nothing) rather than a queue of client-side
  // segments that could partially fail — kept on the interface so existing
  // callers (e.g. App.tsx's "partial transcript" notice) don't need to
  // special-case its absence.
  skippedSegmentCount: number;
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
  // Hands a captured screenshot's data URL to the note's own image store
  // (the same one the rich-text editor's paste-image flow uses) and returns
  // the id it was stored under — see appendScreenshotsSection, which embeds
  // `image://<id>` references for each into the generated note.
  insertImage: (dataUrl: string) => string;
}

export interface StartRecordingOptions {
  // Also capture audio from a shared browser tab/window/screen (mixed with
  // the microphone) via getDisplayMedia — lets the transcript include the
  // other side of an online meeting, not just the user's own mic.
  captureTabAudio?: boolean;
  // Only meaningful alongside captureTabAudio: keep the shared video track
  // too. It's recorded in parallel for preview/download (never sent for
  // transcription — audio is transcribed on its own), and also drives
  // startScreenshotCapture, which periodically grabs a frame whenever the
  // shared screen changes meaningfully and embeds it in the generated note.
  captureVideo?: boolean;
}

type AudioContextWithSilentSink = AudioContext & {
  setSinkId?: (sinkId: string | { type: 'none' }) => Promise<void>;
};

// 32kbps opus is plenty for intelligible speech and keeps upload size small
// regardless of how long the recording runs.
const AUDIO_BITS_PER_SECOND = 32000;

// How many times to automatically retry note generation after a transient
// Gemini failure (503 overload, 429 rate limit) before giving up. Unlike
// Groq's rate-limit retry (now handled entirely server-side — see
// backend/audio_pipeline.py), Gemini doesn't hand back a suggested wait
// time, so this uses its own fixed backoff (see generationBackoffSeconds).
const MAX_GENERATION_RETRIES = 4;

// 15s, 30s, 45s, 60s (linear, base 15s) — mirrors ikea-data-agent's own
// retry cadence for this exact error (MINUTES_GENERATION_RETRY_BASE_SECONDS
// in its agents/meeting.py), which has proven reliable there. This used to
// be a much shorter exponential backoff (3s/6s/12s/24s, capped at 30s) on
// the assumption a 503 "high demand" spike clears within seconds — but per
// ikea's own comment, a demand spike triggered by a large-transcript
// request can outlast that; users hitting a sustained spike exhausted the
// short budget and lost an already-fully-transcribed session, while ikea's
// longer budget rode it out on the same underlying model.
const generationBackoffSeconds = (attempt: number): number => 15 * attempt;

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

// --- Screen-capture screenshots (see startScreenshotCapture) ---
// How often to sample the shared screen and check whether it changed enough
// to be worth a screenshot (a slide advancing, a new window, etc.) — cheap
// enough to run continuously for a whole recording.
const SCREENSHOT_CHECK_INTERVAL_MS = 8000;
// Never take two screenshots closer together than this, even if the screen
// keeps changing (e.g. a video playing in the shared window) — a note full
// of near-duplicate frames a few seconds apart isn't useful.
const MIN_SCREENSHOT_GAP_MS = 5000;
// Hard cap so an hours-long recording can't embed dozens of images into one
// note (each one adds to the note's stored size — see useFileSystem's
// `images` store, which persists images as base64 in localStorage).
const MAX_SCREENSHOTS_PER_SESSION = 15;
// Downscaled frame size used only for the cheap change-detection compare —
// never saved anywhere, just diffed against the previous tick's pixels.
const SCREENSHOT_COMPARE_WIDTH = 160;
const SCREENSHOT_COMPARE_HEIGHT = 90;
// Average per-channel brightness difference (0-255 scale) across the
// downscaled comparison frame needed to call the screen "changed" — tuned
// to catch a slide change or window switch while ignoring a mouse cursor
// blinking or minor video-call self-view movement. Empirically chosen, not
// derived from anything rigorous — reasonable starting point to tune later.
const SCREENSHOT_DIFF_THRESHOLD = 18;
// A saved screenshot is downscaled to at most this wide (tall side follows
// the source aspect ratio) — a shared 1080p/4K screen doesn't need to be
// saved at full resolution to be readable in a note.
const SCREENSHOT_MAX_WIDTH = 1280;

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

// Formats a running offset (seconds) as `MM:SS`, or `HH:MM:SS` once the
// recording passes an hour — for the per-line timestamps in the
// downloadable transcript.
const formatTimestamp = (totalSeconds: number): string => {
  const wholeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const seconds = wholeSeconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
};

// Turns the backend's combined TranscriptionResult into `[MM:SS] text`
// lines — its segments already sit on one continuous timeline across the
// whole recording (the backend combines every chunk itself), so no offset
// bookkeeping is needed here anymore.
const buildTimestampedLines = (result: TranscriptionResult): string[] => {
  if (result.segments.length === 0) {
    return result.text ? [`[${formatTimestamp(0)}] ${result.text}`] : [];
  }
  return result.segments.map(segment => `[${formatTimestamp(segment.start)}] ${segment.text}`);
};

const initialState: VoiceNoteState = {
  stage: 'idle',
  inputMode: 'record',
  elapsedSeconds: 0,
  processingElapsedSeconds: 0,
  processingPhase: null,
  totalSegments: 0,
  completedSegments: 0,
  transcriptSoFar: '',
  errorMessage: '',
  rateLimitRetrySeconds: null,
  generationRetrySeconds: null,
  backendWakingUp: false,
  microphoneStatus: 'connected',
  hasVideo: false,
  canDownload: false,
  previewUrl: null,
  awaitingVideoReview: false,
  screenshotCount: 0,
};

export const useVoiceNotePipeline = ({ groqApiKey, geminiApiKey, onNoteGenerated, onError, insertImage }: UseVoiceNotePipelineOptions) => {
  const [state, setState] = useState<VoiceNoteState>(initialState);
  const [microphoneDeviceId, setMicrophoneDeviceId] = useLocalStorage<string>(MICROPHONE_DEVICE_ID_STORAGE_KEY, '');
  const microphoneDeviceIdRef = useRef(microphoneDeviceId);
  useEffect(() => { microphoneDeviceIdRef.current = microphoneDeviceId; }, [microphoneDeviceId]);

  // Long-lived async work (recording, transcription upload, generation)
  // reads these instead of closing over the props directly, so it always
  // sees the latest values without needing to be torn down and restarted
  // whenever a prop changes mid-flight.
  const groqApiKeyRef = useRef(groqApiKey);
  const geminiApiKeyRef = useRef(geminiApiKey);
  const onNoteGeneratedRef = useRef(onNoteGenerated);
  const onErrorRef = useRef(onError);
  const insertImageRef = useRef(insertImage);
  useEffect(() => { groqApiKeyRef.current = groqApiKey; }, [groqApiKey]);
  useEffect(() => { geminiApiKeyRef.current = geminiApiKey; }, [geminiApiKey]);
  useEffect(() => { onNoteGeneratedRef.current = onNoteGenerated; }, [onNoteGenerated]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  useEffect(() => { insertImageRef.current = insertImage; }, [insertImage]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  // The stable audio-only stream fed to the transcription recorder. Web
  // Audio normally provides this destination so microphone sources can be
  // replaced without changing MediaRecorder's track set.
  const streamRef = useRef<MediaStream | null>(null);
  // The *original* captured streams, kept separately from streamRef because
  // stopping tracks on a Web Audio destination stream doesn't release the
  // underlying hardware capture — only stopping the original getUserMedia /
  // getDisplayMedia tracks does.
  const micStreamRef = useRef<MediaStream | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const mixAudioContextRef = useRef<AudioContext | null>(null);
  const mixerNodeRef = useRef<GainNode | null>(null);
  const microphoneSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  // Keep every node in the audio graph strongly referenced for the full
  // recording. The graph is also connected to a silent AudioContext output
  // below so Chrome continues rendering it while this page is backgrounded.
  const mixAudioNodesRef = useRef<AudioNode[]>([]);
  const isStillRecordingRef = useRef(false);
  const discardRef = useRef(false);
  const cancelledRef = useRef(false);
  const finalizedRef = useRef(false);
  const elapsedTimerRef = useRef<number | null>(null);
  const processingStartedAtRef = useRef<number | null>(null);
  const microphoneMuteTimerRef = useRef<number | null>(null);
  const microphoneRecoveryInFlightRef = useRef(false);
  const recoverMicrophoneRef = useRef<() => void>(() => undefined);
  // Background tabs throttle setInterval. Keep the actual start time so the
  // displayed duration reflects wall-clock time instead of the number of
  // timer callbacks the browser happened to run.
  const recordingStartedAtRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  // Chunks from the single continuous MediaRecorder capturing this
  // recording — concatenating chunks from the same recorder session is
  // always a valid, independently playable file (unlike stitching together
  // blobs from *separate* MediaRecorder sessions, which don't share a
  // container header).
  const chunksRef = useRef<Blob[]>([]);
  const transcriptPartsRef = useRef<string[]>([]);
  // Parallel to transcriptPartsRef, but each entry is that same result's
  // text reformatted as `[MM:SS] text` lines — see buildTimestampedLines.
  const timestampedTranscriptPartsRef = useRef<string[]>([]);
  // Every audio blob/file successfully transcribed this session, kept
  // around so the whole recording can be handed off to the caller alongside
  // the generated note — not just the transcript. Always at most one entry
  // now that transcription is a single backend call per session.
  const audioSegmentsRef = useRef<Blob[]>([]);

  // The parallel recorder that captures shared-screen video (+ mixed
  // audio) purely for download/preview — never touches transcription.
  const downloadRecorderRef = useRef<MediaRecorder | null>(null);
  const downloadChunksRef = useRef<Blob[]>([]);
  // Source material for the "download this recording" action: either the
  // originally uploaded file (kept as-is, at full original quality), or the
  // raw MediaRecorder blob from a live recording — mutually exclusive.
  const uploadedFileRef = useRef<File | null>(null);
  const rawRecordingBlobRef = useRef<Blob | null>(null);
  const hasVideoRef = useRef(false);
  const previewUrlRef = useRef<string | null>(null);
  // Gates finalizeAndGenerate() behind an explicit user confirmation after a
  // video recording stops — see awaitingVideoReview on VoiceNoteState.
  const videoReviewPendingRef = useRef(false);

  // Screenshots auto-captured from a shared screen this session — see
  // startScreenshotCapture/stopScreenshotCapture. Never touches
  // transcription; only read once, in finalizeAndGenerate's
  // appendScreenshotsSection, after note generation succeeds.
  const screenshotsRef = useRef<{ timeSeconds: number; dataUrl: string }[]>([]);
  const screenshotVideoElRef = useRef<HTMLVideoElement | null>(null);
  const screenshotCaptureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const screenshotCompareCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const screenshotIntervalRef = useRef<number | null>(null);
  const lastComparisonFrameRef = useRef<Uint8ClampedArray | null>(null);
  const lastScreenshotAtRef = useRef(0);

  useEffect(() => {
    if (state.stage !== 'processing' || state.awaitingVideoReview) {
      processingStartedAtRef.current = null;
      setState(s => s.processingElapsedSeconds === 0 ? s : { ...s, processingElapsedSeconds: 0 });
      return;
    }

    const startedAt = Date.now();
    processingStartedAtRef.current = startedAt;
    const updateProcessingElapsed = () => {
      if (processingStartedAtRef.current !== startedAt) return;
      const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
      setState(s => s.processingElapsedSeconds === seconds ? s : { ...s, processingElapsedSeconds: seconds });
    };
    updateProcessingElapsed();
    const timer = window.setInterval(updateProcessingElapsed, 1000);
    return () => {
      window.clearInterval(timer);
      if (processingStartedAtRef.current === startedAt) processingStartedAtRef.current = null;
    };
  }, [state.stage, state.awaitingVideoReview]);

  const clearElapsedTimer = () => {
    if (elapsedTimerRef.current !== null) {
      window.clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  };
  const clearMicrophoneMuteTimer = () => {
    if (microphoneMuteTimerRef.current !== null) {
      window.clearTimeout(microphoneMuteTimerRef.current);
      microphoneMuteTimerRef.current = null;
    }
  };
  const updateElapsedFromClock = useCallback(() => {
    if (recordingStartedAtRef.current === null) return;
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - recordingStartedAtRef.current) / 1000));
    setState(s => s.elapsedSeconds === elapsedSeconds ? s : { ...s, elapsedSeconds });
  }, []);
  // Tears down the hidden <video>/interval used to sample the shared screen
  // for screenshots — safe to call even if screenshot capture was never
  // started (e.g. an audio-only session). Never touches screenshotsRef
  // itself: those already-captured screenshots are still needed afterward,
  // by finalizeAndGenerate's appendScreenshotsSection.
  const stopScreenshotCapture = () => {
    if (screenshotIntervalRef.current !== null) {
      window.clearInterval(screenshotIntervalRef.current);
      screenshotIntervalRef.current = null;
    }
    if (screenshotVideoElRef.current) {
      screenshotVideoElRef.current.srcObject = null;
      screenshotVideoElRef.current = null;
    }
    screenshotCaptureCanvasRef.current = null;
    screenshotCompareCanvasRef.current = null;
    lastComparisonFrameRef.current = null;
  };

  // Periodically samples the shared-screen video track and saves a
  // screenshot whenever the screen changes meaningfully (a slide advancing,
  // a window switch) — see the SCREENSHOT_* constants for the tuning knobs.
  // Runs entirely off a hidden <video> element playing the *live* track, not
  // the download recorder's blob — that blob only exists after the
  // recording stops, and by then the frames themselves are gone.
  const startScreenshotCapture = (videoTrack: MediaStreamTrack) => {
    const videoEl = document.createElement('video');
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.srcObject = new MediaStream([videoTrack]);
    void videoEl.play().catch(error => {
      console.warn('Could not start screenshot capture from the shared screen:', error);
    });
    screenshotVideoElRef.current = videoEl;

    const compareCanvas = document.createElement('canvas');
    compareCanvas.width = SCREENSHOT_COMPARE_WIDTH;
    compareCanvas.height = SCREENSHOT_COMPARE_HEIGHT;
    screenshotCompareCanvasRef.current = compareCanvas;
    screenshotCaptureCanvasRef.current = document.createElement('canvas');

    screenshotIntervalRef.current = window.setInterval(() => {
      if (screenshotsRef.current.length >= MAX_SCREENSHOTS_PER_SESSION) return;
      const video = screenshotVideoElRef.current;
      const compare = screenshotCompareCanvasRef.current;
      if (!video || !compare || video.readyState < 2 || video.videoWidth === 0) return;

      const compareCtx = compare.getContext('2d', { willReadFrequently: true });
      if (!compareCtx) return;
      compareCtx.drawImage(video, 0, 0, compare.width, compare.height);
      const frame = compareCtx.getImageData(0, 0, compare.width, compare.height).data;

      const previousFrame = lastComparisonFrameRef.current;
      // No previous frame to compare against yet — treat the very first
      // sample as "changed" so a shared screen always gets at least one
      // screenshot near the start, rather than waiting for the first
      // detected change.
      let changed = previousFrame === null;
      if (previousFrame && previousFrame.length === frame.length) {
        let diffSum = 0;
        // Sampling every 4th pixel (16 bytes: RGBA × 4) keeps this cheap
        // enough to run every tick without a real diff library.
        for (let i = 0; i < frame.length; i += 16) {
          diffSum += Math.abs(frame[i] - previousFrame[i]);
        }
        const sampledPixelCount = Math.ceil(frame.length / 16);
        changed = (diffSum / sampledPixelCount) > SCREENSHOT_DIFF_THRESHOLD;
      }
      lastComparisonFrameRef.current = frame;

      const now = Date.now();
      if (!changed || now - lastScreenshotAtRef.current < MIN_SCREENSHOT_GAP_MS) return;
      lastScreenshotAtRef.current = now;

      const capture = screenshotCaptureCanvasRef.current;
      const captureCtx = capture?.getContext('2d');
      if (!capture || !captureCtx) return;
      const scale = Math.min(1, SCREENSHOT_MAX_WIDTH / video.videoWidth);
      capture.width = Math.max(1, Math.round(video.videoWidth * scale));
      capture.height = Math.max(1, Math.round(video.videoHeight * scale));
      captureCtx.drawImage(video, 0, 0, capture.width, capture.height);
      const dataUrl = capture.toDataURL('image/jpeg', 0.75);
      const timeSeconds = recordingStartedAtRef.current !== null
        ? Math.max(0, Math.floor((now - recordingStartedAtRef.current) / 1000))
        : 0;
      screenshotsRef.current.push({ timeSeconds, dataUrl });
      setState(s => ({ ...s, screenshotCount: screenshotsRef.current.length }));
    }, SCREENSHOT_CHECK_INTERVAL_MS);
  };

  const releaseStream = () => {
    clearMicrophoneMuteTimer();
    stopScreenshotCapture();
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    micStreamRef.current?.getTracks().forEach(track => {
      // Do not interpret our own cleanup as an unexpected input loss.
      track.onmute = null;
      track.onunmute = null;
      track.onended = null;
      track.stop();
    });
    micStreamRef.current = null;
    displayStreamRef.current?.getTracks().forEach(track => track.stop());
    displayStreamRef.current = null;
    if (mixAudioContextRef.current) {
      mixAudioContextRef.current.onstatechange = null;
      mixAudioNodesRef.current.forEach(node => node.disconnect());
      mixAudioNodesRef.current = [];
      void mixAudioContextRef.current.close();
      mixAudioContextRef.current = null;
    }
    mixerNodeRef.current = null;
    microphoneSourceNodeRef.current = null;
    microphoneRecoveryInFlightRef.current = false;
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
  // the audio-only recording that feeds transcription.
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
        rawRecordingBlobRef.current = blob;
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
    recordingStartedAtRef.current = null;
    uploadedFileRef.current = null;
    rawRecordingBlobRef.current = null;
    hasVideoRef.current = false;
    videoReviewPendingRef.current = false;
    revokePreviewUrl();
    screenshotsRef.current = [];
    setState(s => ({
      ...s,
      stage: 'idle',
      elapsedSeconds: 0,
      processingPhase: null,
      totalSegments: 0,
      completedSegments: 0,
      transcriptSoFar: '',
      errorMessage: '',
      rateLimitRetrySeconds: null,
      generationRetrySeconds: null,
      backendWakingUp: false,
      microphoneStatus: 'connected',
      hasVideo: false,
      canDownload: false,
      previewUrl: null,
      awaitingVideoReview: false,
      screenshotCount: 0,
    }));
  }, []);

  const handlePipelineError = useCallback((error: unknown) => {
    console.error('Voice note pipeline failed:', error);
    // Explicitly tear down recording rather than relying on the recorder
    // implicitly stopping once its stream is released — this can happen
    // mid-recording (e.g. transcription fails because the API key was
    // revoked), so it must stop cleanly rather than continuing to capture.
    isStillRecordingRef.current = false;
    discardRef.current = true;
    recordingStartedAtRef.current = null;
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
    videoReviewPendingRef.current = false;
    const message = error instanceof Error ? error.message : translate('pipeline.unknownError');
    setState(s => ({
      ...s, stage: 'error', processingPhase: null, errorMessage: message,
      rateLimitRetrySeconds: null, generationRetrySeconds: null, backendWakingUp: false, awaitingVideoReview: false,
    }));
    onErrorRef.current?.(message);
  }, []);

  // Counts down `rateLimitRetrySeconds` in the UI while the backend waits
  // out a Groq 429 cooldown server-side (see backend/audio_pipeline.py's
  // on_rate_limited) — purely cosmetic on this side: the actual wait and
  // retry already happen on the backend, this just mirrors it visually.
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

  // Same idea as waitForRateLimitCooldown above, but counts down
  // `generationRetrySeconds` instead — kept separate so the two can show
  // distinct messaging (this one has no "N/M segments" context, since
  // transcription is already fully done by the time generation runs).
  const waitForGenerationRetryCooldown = useCallback(async (seconds: number): Promise<void> => {
    const endAt = Date.now() + seconds * 1000;
    while (Date.now() < endAt) {
      if (cancelledRef.current) break;
      setState(s => ({ ...s, generationRetrySeconds: Math.ceil((endAt - Date.now()) / 1000) }));
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    setState(s => ({ ...s, generationRetrySeconds: null }));
  }, []);

  // Embeds every screenshot captured this session into the note's own image
  // store (insertImageRef — the same one the rich-text editor's paste-image
  // flow uses) and appends a section referencing them, so they show up as
  // ordinary images in the note rather than needing any special rendering.
  // A no-op if nothing was captured (audio-only session, or captureVideo
  // wasn't on).
  const appendScreenshotsSection = (markdown: string): string => {
    if (screenshotsRef.current.length === 0) return markdown;
    const entries = screenshotsRef.current.map(({ timeSeconds, dataUrl }) => {
      const imageId = insertImageRef.current(dataUrl);
      const label = formatTimestamp(timeSeconds);
      return `**[${label}]**\n\n![${label}](image://${imageId})`;
    });
    return `${markdown}\n\n## ${translate('voiceNote.screenshotsHeading')}\n\n${entries.join('\n\n')}`;
  };

  const finalizeAndGenerate = useCallback(async () => {
    if (cancelledRef.current) return;
    const combinedTranscript = transcriptPartsRef.current.join('\n\n');
    if (!combinedTranscript.trim()) {
      handlePipelineError(new Error(translate('pipeline.noSpeechDetected')));
      return;
    }
    setState(s => ({ ...s, processingPhase: 'generating' }));
    try {
      let attempt = 0;
      for (;;) {
        try {
          const noteMarkdown = await generateNoteFromTranscript(combinedTranscript, geminiApiKeyRef.current);
          if (cancelledRef.current) return;
          const finalMarkdown = appendScreenshotsSection(normalizeAiMarkdown(noteMarkdown));
          onNoteGeneratedRef.current(finalMarkdown, {
            transcript: combinedTranscript,
            timestampedTranscript: timestampedTranscriptPartsRef.current.join('\n'),
            segments: audioSegmentsRef.current,
            skippedSegmentCount: 0,
          });
          resetToIdle();
          return;
        } catch (error) {
          if (cancelledRef.current) return;
          if (error instanceof MissingApiKeyError) {
            handlePipelineError(new Error(translate('pipeline.missingGeminiKey')));
            return;
          }
          // The transcript is already fully in hand at this point — a
          // transient overload here shouldn't cost the user everything a
          // long recording just spent minutes transcribing. Anything that
          // isn't retryable (or that's exhausted its retries) still falls
          // through to the normal error screen below.
          if (isRetryableGeminiError(error) && attempt < MAX_GENERATION_RETRIES) {
            attempt += 1;
            await waitForGenerationRetryCooldown(generationBackoffSeconds(attempt));
            if (cancelledRef.current) return;
            continue;
          }
          // A raw ApiError's own .message is the unparsed JSON error body
          // (needed above for the instanceof/status check, since wrapping
          // it earlier would have erased that), so it still has to be
          // converted to a human-readable message before it reaches the
          // error screen — same treatment every other failure already gets
          // inside generateNoteFromTranscript itself.
          handlePipelineError(new Error(extractGeminiErrorMessage(error)));
          return;
        }
      }
    } catch (error) {
      if (cancelledRef.current) return;
      handlePipelineError(error);
    }
  }, [handlePipelineError, resetToIdle, waitForGenerationRetryCooldown]);

  // Uploads one whole recording/file to the backend and waits for its
  // combined transcription result — replaces the old client-side segment
  // queue: the backend itself splits an oversized file into Groq-sized
  // chunks and retries rate-limited ones (see backend/audio_pipeline.py),
  // so there's only ever one request to make here regardless of length.
  const uploadAndTranscribe = useCallback(async (blobOrFile: Blob, filename: string) => {
    if (cancelledRef.current) return;
    setState(s => ({
      ...s, processingPhase: 'uploading', totalSegments: 0, completedSegments: 0,
      backendWakingUp: false,
    }));
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const result = await transcribeViaBackend(blobOrFile, filename, groqApiKeyRef.current, {
        signal: controller.signal,
        onWakeupRetry: () => {
          if (cancelledRef.current) return;
          setState(s => ({ ...s, backendWakingUp: true }));
        },
        onProgress: (progress: BackendTranscribeProgress) => {
          if (cancelledRef.current) return;
          if (progress.phase === 'normalizing' || progress.phase === 'splitting') {
            setState(s => ({ ...s, processingPhase: 'normalizing', backendWakingUp: false }));
          } else if (progress.phase === 'transcribing') {
            setState(s => ({
              ...s, processingPhase: 'transcribing', backendWakingUp: false,
              totalSegments: progress.total ?? s.totalSegments,
              completedSegments: progress.completed ?? s.completedSegments,
            }));
          } else if (progress.phase === 'rate_limited') {
            setState(s => ({
              ...s,
              totalSegments: progress.total ?? s.totalSegments,
              completedSegments: progress.completed ?? s.completedSegments,
            }));
            void waitForRateLimitCooldown(progress.waitSeconds ?? 15);
          }
        },
      });
      if (cancelledRef.current) return;

      transcriptPartsRef.current.push(result.text);
      timestampedTranscriptPartsRef.current.push(...buildTimestampedLines(result));
      audioSegmentsRef.current.push(blobOrFile);
      setState(s => ({ ...s, transcriptSoFar: result.text, totalSegments: 1, completedSegments: 1 }));

      if (videoReviewPendingRef.current || finalizedRef.current) {
        // Either the user hasn't confirmed they've had a chance to download
        // the video yet (confirmVideoReviewed() picks this up once they
        // do), or something else already finalized this session — either
        // way, nothing more to do here.
        return;
      }
      finalizedRef.current = true;
      await finalizeAndGenerate();
    } catch (error) {
      if (cancelledRef.current) return;
      handlePipelineError(error);
    }
  }, [finalizeAndGenerate, handlePipelineError, waitForRateLimitCooldown]);

  const stopRecording = useCallback(() => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;
    isStillRecordingRef.current = false;
    discardRef.current = false;
    updateElapsedFromClock();
    recordingStartedAtRef.current = null;
    clearElapsedTimer();
    // A video recording pauses before generating the note — see
    // awaitingVideoReview — so stopping it isn't a race against losing the
    // video. Audio-only sessions are unaffected and proceed exactly as
    // before.
    videoReviewPendingRef.current = hasVideoRef.current;
    setState(s => ({ ...s, stage: 'processing', processingPhase: 'uploading', awaitingVideoReview: hasVideoRef.current }));
    mediaRecorderRef.current.stop();
    if (downloadRecorderRef.current && downloadRecorderRef.current.state !== 'inactive') {
      downloadRecorderRef.current.stop();
    }
  }, [updateElapsedFromClock]);

  const stopForMicrophoneDisconnect = useCallback(() => {
    if (!isStillRecordingRef.current) return;
    clearMicrophoneMuteTimer();
    setState(s => ({ ...s, microphoneStatus: 'failed' }));
    stopRecording();
  }, [stopRecording]);

  const monitorMicrophoneStream = useCallback((stream: MediaStream) => {
    stream.getAudioTracks().forEach(track => {
      track.onmute = () => {
        clearMicrophoneMuteTimer();
        microphoneMuteTimerRef.current = window.setTimeout(() => {
          microphoneMuteTimerRef.current = null;
          if (track.muted) recoverMicrophoneRef.current();
        }, 3000);
      };
      track.onunmute = clearMicrophoneMuteTimer;
      track.onended = () => recoverMicrophoneRef.current();
    });
  }, []);

  const recoverMicrophone = useCallback(async () => {
    if (!isStillRecordingRef.current || microphoneRecoveryInFlightRef.current) return;
    microphoneRecoveryInFlightRef.current = true;
    clearMicrophoneMuteTimer();
    setState(s => ({ ...s, microphoneStatus: 'reconnecting' }));

    try {
      for (let attempt = 0; attempt < 3 && isStillRecordingRef.current; attempt += 1) {
        let replacementStream: MediaStream | null = null;
        try {
          const previousTrack = micStreamRef.current?.getAudioTracks()[0];
          const previousDeviceId = previousTrack?.getSettings().deviceId;
          const inputs = await navigator.mediaDevices.enumerateDevices();
          const availableInputs = inputs.filter(device =>
            device.kind === 'audioinput'
            && device.deviceId !== 'default'
            && device.deviceId !== previousDeviceId
          );
          const builtInInput = availableInputs.find(device =>
            /macbook|built-in|內建|imac|studio display|mac studio/i.test(device.label)
          );
          replacementStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              ...(builtInInput ? { deviceId: { exact: builtInInput.deviceId } } : {}),
            },
          });
          if (!isStillRecordingRef.current) {
            replacementStream.getTracks().forEach(track => track.stop());
            return;
          }

          const audioContext = mixAudioContextRef.current;
          const mixer = mixerNodeRef.current;
          if (!audioContext || !mixer) {
            replacementStream.getTracks().forEach(track => track.stop());
            break;
          }

          const replacementTrack = replacementStream.getAudioTracks()[0];
          if (!replacementTrack || replacementTrack.readyState !== 'live' || replacementTrack.muted) {
            replacementStream.getTracks().forEach(track => track.stop());
            replacementStream = null;
            throw new Error('Replacement microphone is not live');
          }

          const replacementSource = audioContext.createMediaStreamSource(replacementStream);
          replacementSource.connect(mixer);

          const previousStream = micStreamRef.current;
          previousStream?.getTracks().forEach(track => {
            track.onmute = null;
            track.onunmute = null;
            track.onended = null;
            track.stop();
          });
          microphoneSourceNodeRef.current?.disconnect();
          microphoneSourceNodeRef.current = replacementSource;
          mixAudioNodesRef.current.push(replacementSource);
          micStreamRef.current = replacementStream;
          monitorMicrophoneStream(replacementStream);
          replacementStream = null;
          setState(s => ({ ...s, microphoneStatus: 'recovered' }));
          return;
        } catch (error) {
          replacementStream?.getTracks().forEach(track => track.stop());
          console.warn(`Could not reconnect the microphone (attempt ${attempt + 1}):`, error);
          if (attempt < 2) await new Promise(resolve => window.setTimeout(resolve, 1000));
        }
      }
      stopForMicrophoneDisconnect();
    } finally {
      microphoneRecoveryInFlightRef.current = false;
    }
  }, [monitorMicrophoneStream, stopForMicrophoneDisconnect]);
  recoverMicrophoneRef.current = () => { void recoverMicrophone(); };

  // Lets a paused-for-video-review pipeline proceed to note generation —
  // see awaitingVideoReview. A no-op if there's nothing pending, or if
  // transcription hasn't produced a result yet (uploadAndTranscribe's own
  // success handler picks this up once it does, since videoReviewPendingRef
  // will already be false by then).
  const confirmVideoReviewed = useCallback(() => {
    if (!videoReviewPendingRef.current) return;
    videoReviewPendingRef.current = false;
    setState(s => ({ ...s, awaitingVideoReview: false }));
    if (!finalizedRef.current && transcriptPartsRef.current.length > 0) {
      finalizedRef.current = true;
      void finalizeAndGenerate();
    }
  }, [finalizeAndGenerate]);

  const startRecording = useCallback(async (options?: StartRecordingOptions) => {
    setState(s => ({ ...s, errorMessage: '' }));
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      handlePipelineError(new Error(translate('pipeline.recordingUnsupported')));
      return;
    }
    const wantsTabAudio = !!options?.captureTabAudio;
    if (wantsTabAudio && typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
      handlePipelineError(new Error(translate('pipeline.tabShareUnsupported')));
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
      // Explicit rather than bare `audio: true` — leaving these unset
      // relies on each browser's own default, which isn't guaranteed to
      // enable noise suppression/echo cancellation consistently, and shows
      // up as noticeably noisier recordings on some platforms.
      const baseAudioConstraints: MediaTrackConstraints = {
        echoCancellation: true, noiseSuppression: true, autoGainControl: true,
      };
      const pinnedDeviceId = microphoneDeviceIdRef.current;
      let usedFallbackDevice = false;
      let micStream: MediaStream;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: pinnedDeviceId
            ? { ...baseAudioConstraints, deviceId: { exact: pinnedDeviceId } }
            : baseAudioConstraints,
        });
      } catch (micError) {
        // The device the user explicitly pinned (see the microphone-source
        // dropdown) has been unplugged since they picked it — fall back to
        // the system default rather than blocking recording entirely; the
        // stored pin is left as-is so it's used again once that device
        // reappears.
        if (
          pinnedDeviceId
          && micError instanceof DOMException
          && (micError.name === 'OverconstrainedError' || micError.name === 'NotFoundError')
        ) {
          micStream = await navigator.mediaDevices.getUserMedia({ audio: baseAudioConstraints });
          usedFallbackDevice = true;
          onErrorRef.current?.(translate('voiceNote.selectedMicrophoneUnavailable'));
        } else {
          throw micError;
        }
      }
      if (cancelledRef.current) {
        micStream.getTracks().forEach(track => track.stop());
        return;
      }
      micStreamRef.current = micStream;

      let mixedAudioStream = micStream;
      let videoTrack: MediaStreamTrack | undefined;
      let displayAudioTrack: MediaStreamTrack | undefined;

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

        displayAudioTrack = displayStream.getAudioTracks()[0];
      }

      // Always record a stable Web Audio destination track. Keeping the
      // MediaRecorder attached to this destination lets us replace a lost
      // iPhone/USB microphone source without changing the recorder's track
      // set or splitting the WebM file into incompatible recorder sessions.
      const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        const audioContext = new AudioContextClass();
        mixAudioContextRef.current = audioContext;
        const destination = audioContext.createMediaStreamDestination();
        const mixer = audioContext.createGain();
        const micSource = audioContext.createMediaStreamSource(micStream);
        micSource.connect(mixer);
        const nodes: AudioNode[] = [micSource, mixer, destination];
        if (displayAudioTrack) {
          const tabSource = audioContext.createMediaStreamSource(new MediaStream([displayAudioTrack]));
          tabSource.connect(mixer);
          nodes.push(tabSource);
        }
        mixer.connect(destination);
        mixerNodeRef.current = mixer;
        microphoneSourceNodeRef.current = micSource;
        mixAudioNodesRef.current = nodes;

        // A graph connected only to MediaStreamDestination can be suspended
        // in a hidden tab. Chrome/Edge's silent sink keeps it rendering
        // without playing the captured sound through the speakers.
        const contextWithSink = audioContext as AudioContextWithSilentSink;
        if (contextWithSink.setSinkId) {
          try {
            await contextWithSink.setSinkId({ type: 'none' });
            mixer.connect(audioContext.destination);
          } catch (sinkError) {
            console.warn('Could not enable the silent audio-mixing sink:', sinkError);
          }
        }
        if (audioContext.state === 'suspended') await audioContext.resume();
        audioContext.onstatechange = () => {
          if (isStillRecordingRef.current && audioContext.state === 'suspended') {
            void audioContext.resume().catch(error => {
              console.warn('Could not resume background audio mixing:', error);
            });
          }
        };
        mixedAudioStream = destination.stream;
      }

      // Give the browser's audio-processing pipeline (echo cancellation /
      // noise suppression / auto gain control) a moment to calibrate before
      // capture actually starts recording — skipping this warm-up meant the
      // very first ~1s of speech was frequently muted or heavily
      // attenuated, since that calibration runs on the track's first audio
      // samples. The UI only switches to "recording" after this wait, so
      // there's no indicator inviting the user to start speaking too early.
      await new Promise(resolve => setTimeout(resolve, 400));
      if (cancelledRef.current) {
        releaseStream();
        return;
      }

      streamRef.current = mixedAudioStream;
      discardRef.current = false;
      finalizedRef.current = false;
      isStillRecordingRef.current = true;
      transcriptPartsRef.current = [];
      timestampedTranscriptPartsRef.current = [];
      audioSegmentsRef.current = [];
      chunksRef.current = [];
      rawRecordingBlobRef.current = null;
      uploadedFileRef.current = null;
      hasVideoRef.current = !!videoTrack;
      revokePreviewUrl();
      screenshotsRef.current = [];
      lastScreenshotAtRef.current = 0;

      setState(s => ({
        ...s,
        stage: 'recording',
        elapsedSeconds: 0,
        processingPhase: null,
        totalSegments: 0,
        completedSegments: 0,
        transcriptSoFar: '',
        rateLimitRetrySeconds: null,
        generationRetrySeconds: null,
        backendWakingUp: false,
        microphoneStatus: usedFallbackDevice ? 'recovered' : 'connected',
        hasVideo: !!videoTrack,
        canDownload: false,
        previewUrl: null,
        screenshotCount: 0,
      }));

      const mimeType = pickSupportedMimeType();
      const recorder = mimeType
        ? new MediaRecorder(mixedAudioStream, { mimeType, audioBitsPerSecond: AUDIO_BITS_PER_SECOND })
        : new MediaRecorder(mixedAudioStream, { audioBitsPerSecond: AUDIO_BITS_PER_SECOND });

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        isStillRecordingRef.current = false;
        releaseStream();
        if (discardRef.current || cancelledRef.current) return;

        const capturedMimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: capturedMimeType });
        if (blob.size === 0) {
          handlePipelineError(new Error(translate('pipeline.noSpeechDetected')));
          return;
        }

        // Only treat this audio-only blob as the downloadable source when
        // there's no separate video recording running — when there is,
        // startDownloadRecorder's own onstop is the canonical source
        // instead, so as not to clobber it with the audio-only blob.
        if (!hasVideoRef.current) {
          rawRecordingBlobRef.current = blob;
          setState(s => ({ ...s, canDownload: true }));
        }

        const filename = `recording-${Date.now()}.${extensionForMimeType(capturedMimeType)}`;
        void uploadAndTranscribe(blob, filename);
      };

      mediaRecorderRef.current = recorder;
      recordingStartedAtRef.current = Date.now();
      recorder.start();
      monitorMicrophoneStream(micStream);
      const initialMicrophoneTrack = micStream.getAudioTracks()[0];
      if (!initialMicrophoneTrack || initialMicrophoneTrack.readyState !== 'live' || initialMicrophoneTrack.muted) {
        recoverMicrophoneRef.current();
      }
      if (videoTrack) {
        startDownloadRecorder(mixedAudioStream, videoTrack);
        startScreenshotCapture(videoTrack);
      }
      elapsedTimerRef.current = window.setInterval(() => {
        updateElapsedFromClock();
      }, 1000);
    } catch (error) {
      releaseStream();
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        handlePipelineError(new Error(translate('pipeline.micPermissionDenied')));
      } else if (error instanceof DOMException && error.name === 'NotFoundError') {
        handlePipelineError(new Error(translate('pipeline.micNotFound')));
      } else {
        handlePipelineError(new Error(translate('pipeline.recordingStartFailed')));
      }
    }
  }, [handlePipelineError, monitorMicrophoneStream, stopRecording, updateElapsedFromClock, uploadAndTranscribe]);

  // Synchronize immediately when a background tab becomes visible again;
  // otherwise the UI can briefly show the last throttled timer value.
  useEffect(() => {
    if (state.stage !== 'recording') return;
    const syncOnVisibilityChange = () => {
      if (document.visibilityState === 'visible') updateElapsedFromClock();
      const audioContext = mixAudioContextRef.current;
      if (audioContext?.state === 'suspended') {
        void audioContext.resume().catch(error => {
          console.warn('Could not resume audio mixing after a tab switch:', error);
        });
      }
    };
    document.addEventListener('visibilitychange', syncOnVisibilityChange);
    window.addEventListener('focus', updateElapsedFromClock);
    return () => {
      document.removeEventListener('visibilitychange', syncOnVisibilityChange);
      window.removeEventListener('focus', updateElapsedFromClock);
    };
  }, [state.stage, updateElapsedFromClock]);

  // Every file (audio or video, any size up to MAX_BACKEND_UPLOAD_BYTES)
  // goes through the same backend call — the backend's normalize step
  // extracts the audio track from a video file exactly like it does for a
  // recorded one (see backend/audio_pipeline.py's normalize_audio).
  const selectFile = useCallback(async (file: File) => {
    setState(s => ({ ...s, errorMessage: '' }));
    if (!isSupportedMediaFile(file)) {
      handlePipelineError(new Error(translate('pipeline.unsupportedFileFormat')));
      return;
    }
    if (file.size > MAX_BACKEND_UPLOAD_BYTES) {
      handlePipelineError(new Error(translate('pipeline.fileTooLargeToSplit', { maxMb: Math.round(MAX_BACKEND_UPLOAD_BYTES / (1024 * 1024)) })));
      return;
    }

    const fileIsVideo = isVideoFile(file);

    cancelledRef.current = false;
    finalizedRef.current = false;
    transcriptPartsRef.current = [];
    timestampedTranscriptPartsRef.current = [];
    audioSegmentsRef.current = [];
    rawRecordingBlobRef.current = null;
    uploadedFileRef.current = file;
    hasVideoRef.current = fileIsVideo;
    revokePreviewUrl();
    if (fileIsVideo) previewUrlRef.current = URL.createObjectURL(file);

    setState(s => ({
      ...s,
      stage: 'processing',
      processingPhase: 'uploading',
      totalSegments: 0,
      completedSegments: 0,
      transcriptSoFar: '',
      rateLimitRetrySeconds: null,
      generationRetrySeconds: null,
      backendWakingUp: false,
      microphoneStatus: 'connected',
      hasVideo: fileIsVideo,
      canDownload: true,
      previewUrl: previewUrlRef.current,
    }));

    await uploadAndTranscribe(file, file.name);
  }, [handlePipelineError, uploadAndTranscribe]);

  // Downloads whatever raw source material is currently available —
  // the originally uploaded file at full quality, or the raw recorded
  // blob — regardless of whether transcription has finished or even
  // succeeded. A no-op if nothing is available yet.
  const downloadRecording = useCallback(() => {
    if (uploadedFileRef.current) {
      downloadBlob(uploadedFileRef.current, uploadedFileRef.current.name);
      return;
    }
    if (!rawRecordingBlobRef.current) return;

    const mimeType = rawRecordingBlobRef.current.type || 'audio/webm';
    const extension = extensionForDownload(mimeType);
    downloadBlob(rawRecordingBlobRef.current, `recording-${Date.now()}.${extension}`);
  }, []);

  // Aborts everything in flight and returns to a clean idle state — used
  // both for "discard this recording" (mid-recording) and "cancel" (mid
  // transcription/generation), since both need to do the same cleanup.
  const cancel = useCallback(() => {
    cancelledRef.current = true;
    isStillRecordingRef.current = false;
    discardRef.current = true;
    recordingStartedAtRef.current = null;
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
    transcriptPartsRef.current = [];
    timestampedTranscriptPartsRef.current = [];
    audioSegmentsRef.current = [];
    chunksRef.current = [];
    rawRecordingBlobRef.current = null;
    uploadedFileRef.current = null;
    hasVideoRef.current = false;
    videoReviewPendingRef.current = false;
    revokePreviewUrl();
    screenshotsRef.current = [];
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
      transcriptSoFar: '',
      errorMessage: '',
      rateLimitRetrySeconds: null,
      generationRetrySeconds: null,
      backendWakingUp: false,
      microphoneStatus: 'connected',
      hasVideo: false,
      canDownload: false,
      previewUrl: null,
      awaitingVideoReview: false,
      screenshotCount: 0,
    }));
  }, []);

  const setInputMode = useCallback((mode: VoiceNoteInputMode) => {
    setState(s => ({ ...s, inputMode: mode }));
  }, []);

  // Retrying from an error screen that still has a fully-transcribed
  // transcript in hand (e.g. automatic retries on a transient Gemini
  // overload were exhausted, but the overload was actually a longer-lived
  // spike) picks generation back up from that transcript instead of
  // discarding it — resetToIdle used to run unconditionally here, silently
  // throwing away a long recording's finished transcription and forcing a
  // full re-record just because Gemini needed more than the automatic
  // retry window to recover. Only a failure with nothing usable to retry
  // (e.g. a missing API key before any transcript existed) still falls
  // back to the old "just go back to idle" behavior.
  const retry = useCallback(() => {
    if (transcriptPartsRef.current.length === 0) {
      resetToIdle();
      return;
    }
    cancelledRef.current = false;
    setState(s => ({ ...s, stage: 'processing', errorMessage: '' }));
    void finalizeAndGenerate();
  }, [resetToIdle, finalizeAndGenerate]);

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
      recordingStartedAtRef.current = null;
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

  // Warns before an accidental page refresh/close/navigation while a
  // recording or the upload/transcribe/generate pipeline is active — a
  // reload destroys all of it, since the captured audio only lives in this
  // tab's memory (chunksRef/audioSegmentsRef) until finalizeAndGenerate()
  // successfully hands a finished note off to the caller. This can only
  // stop an *accidental* reload (browsers show their own generic "Leave
  // site?" text regardless of what's set here, and there's no way to
  // recover a session that's already gone) — a deliberate reload still
  // loses everything, same as before.
  useEffect(() => {
    if (state.stage === 'idle') return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [state.stage]);

  return {
    state,
    microphoneDeviceId,
    actions: {
      startRecording, stopRecording, selectFile, cancel, retry, setInputMode, downloadRecording, confirmVideoReviewed,
      setMicrophoneDeviceId,
    },
  };
};
