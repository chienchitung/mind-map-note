import { translate } from '../i18n/translations';
import { readSseStream } from '../utils/sse';
import { MissingGroqApiKeyError, RateLimitError, InvalidGroqApiKeyError, type TranscriptionResult } from './groqTranscriptionService';
import { getTranscriptionLanguage } from '../utils/transcriptionLanguage';

// The backend's own /audio/transcribe/stream endpoint does everything the
// browser used to do itself (normalize/split via ffmpeg, transcribe via
// Groq, Simplified->Traditional conversion) — see backend/main.py and
// backend/audio_pipeline.py. Falls back to the local dev server so a
// missing env var fails obviously instead of silently trying to hit a
// same-origin path that doesn't exist.
const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string | undefined) || 'http://localhost:8000';

// Meeting uploads land on the backend's disk — an unbounded upload could
// exhaust it on its own. 500MB comfortably covers a long recording at
// normal compression; anything bigger is rejected client-side before it's
// ever sent. Mirrors ikea-data-agent's MeetingRecorderModal.jsx MAX_UPLOAD_BYTES.
export const MAX_BACKEND_UPLOAD_BYTES = 500 * 1024 * 1024;

export class FileTooLargeError extends Error {
    constructor() {
        super(translate('groq.fileTooLarge', { maxMb: Math.round(MAX_BACKEND_UPLOAD_BYTES / (1024 * 1024)) }));
        this.name = 'FileTooLargeError';
    }
}

// Render's free tier spins the backend down after inactivity; the first
// request after that can take 30-60s+ just to get a response header back.
// Bounds how long a bodyless /health check waits before assuming this is a
// cold start and retrying once with a clear message, instead of the UI
// hanging on "Uploading..." with no explanation. The real upload/transcribe
// request is never raced against this timeout — only the fast, bodyless
// health check is, so a large file's genuine (possibly minutes-long)
// transfer time is never misread as a cold start.
const COLD_START_TIMEOUT_MS = 25000;

class ColdStartTimeoutError extends Error {}

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> => {
    let timer: number;
    const timeout = new Promise<T>((_, reject) => {
        timer = window.setTimeout(() => reject(new ColdStartTimeoutError('cold_start_timeout')), ms);
    });
    return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
};

const pingBackendAwake = async (signal: AbortSignal | undefined, onRetrying?: () => void): Promise<void> => {
    try {
        await withTimeout(fetch(`${BACKEND_URL}/health`, { signal }), COLD_START_TIMEOUT_MS);
    } catch (error) {
        if (error instanceof ColdStartTimeoutError) {
            onRetrying?.();
            await fetch(`${BACKEND_URL}/health`, { signal });
            return;
        }
        throw error;
    }
};

export interface BackendTranscribeProgress {
    phase: 'downloading' | 'normalizing' | 'splitting' | 'transcribing' | 'rate_limited';
    percent?: number;
    completed?: number;
    total?: number;
    waitSeconds?: number;
}

interface TranscribeViaBackendOptions {
    signal?: AbortSignal;
    onProgress?: (progress: BackendTranscribeProgress) => void;
    onWakeupRetry?: () => void;
}

/**
 * Uploads a recorded/selected audio (or video) blob to the backend and
 * returns the combined transcription result once the backend finishes
 * normalizing, splitting, and transcribing it — the backend equivalent of
 * the old client-side transcribeAudio() + audioSplitter.ts pipeline.
 */
export const transcribeViaBackend = async (
    audioBlob: Blob,
    filename: string,
    groqApiKey: string,
    options: TranscribeViaBackendOptions = {},
): Promise<TranscriptionResult> => {
    const { signal, onProgress, onWakeupRetry } = options;

    if (!groqApiKey) {
        throw new MissingGroqApiKeyError();
    }
    if (audioBlob.size > MAX_BACKEND_UPLOAD_BYTES) {
        throw new FileTooLargeError();
    }

    await pingBackendAwake(signal, onWakeupRetry);

    const formData = new FormData();
    formData.append('audio', audioBlob, filename);
    formData.append('groq_api_key', groqApiKey);
    formData.append('language', getTranscriptionLanguage());

    const response = await fetch(`${BACKEND_URL}/audio/transcribe/stream`, {
        method: 'POST',
        body: formData,
        signal,
    });

    return readTranscriptionStream(response, onProgress);
};

/** Reads the backend's progress/final/error SSE stream into a result. */
const readTranscriptionStream = async (
    response: Response,
    onProgress?: (progress: BackendTranscribeProgress) => void,
): Promise<TranscriptionResult> => {
    if (!response.ok) {
        const data = await response.json().catch(() => null);
        if (data?.error_type) throw mapBackendError(data);
        throw new Error(data?.message || translate('groq.transcriptionFailedHttp', { status: response.status }));
    }

    let finalResult: TranscriptionResult | null = null;
    let rejection: Error | null = null;

    await readSseStream(response, (event, data) => {
        if (event === 'progress') {
            onProgress?.(data as BackendTranscribeProgress);
            return;
        }
        if (event === 'final') {
            finalResult = data as TranscriptionResult;
            return;
        }
        if (event === 'error') {
            rejection = mapBackendError(data);
        }
    });

    if (rejection) throw rejection;
    if (!finalResult) throw new Error(translate('pipeline.noSpeechDetected'));
    return finalResult;
};

export class YoutubeSourceError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'YoutubeSourceError';
    }
}

// Server-side reasons a YouTube link failed (see backend/youtube_audio.py's
// _classify_error), turned into something the user can act on.
const youtubeErrorMessage = (data: any): string => {
    switch (data?.error_type === 'youtube_error' ? data?.youtube_error_type : data?.error_type) {
        case 'youtube_unauthorized':
            return translate('youtube.errorUnauthorized');
        case 'youtube_bad_url':
            return translate('youtube.errorBadUrl');
        case 'bot_check':
        case 'download_forbidden':
        case 'rate_limited':
            return translate('youtube.errorBlocked');
        case 'login_required':
            return translate('youtube.errorLoginRequired');
        case 'unavailable':
            return translate('youtube.errorUnavailable');
        case 'too_long':
            return translate('youtube.errorTooLong');
        default:
            return translate('youtube.errorGeneric', { message: data?.message || '' });
    }
};

export interface YoutubeVideoInfo {
    title: string | null;
    uploader: string | null;
    duration_seconds: number | null;
    too_long: boolean;
}

const youtubeHeaders = (accessToken: string) => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
});

/** Looks up a YouTube video's title and length, for confirming before transcribing. */
export const fetchYoutubeInfo = async (
    url: string,
    accessToken: string,
    options: { signal?: AbortSignal; onWakeupRetry?: () => void } = {},
): Promise<YoutubeVideoInfo> => {
    if (!accessToken) throw new YoutubeSourceError(translate('youtube.errorMissingToken'));
    await pingBackendAwake(options.signal, options.onWakeupRetry);
    const response = await fetch(`${BACKEND_URL}/youtube/info`, {
        method: 'POST',
        headers: youtubeHeaders(accessToken),
        body: JSON.stringify({ url }),
        signal: options.signal,
    });
    const data = await response.json().catch(() => null);
    if (response.status === 404) throw new YoutubeSourceError(translate('youtube.errorNotEnabled'));
    if (!response.ok) throw new YoutubeSourceError(youtubeErrorMessage(data));
    return data as YoutubeVideoInfo;
};

/**
 * Has the backend download a YouTube video's audio and transcribe it — the
 * same result and progress events as transcribeViaBackend, with a
 * 'downloading' phase first.
 */
export const transcribeYoutubeViaBackend = async (
    url: string,
    accessToken: string,
    groqApiKey: string,
    options: TranscribeViaBackendOptions = {},
): Promise<TranscriptionResult> => {
    const { signal, onProgress, onWakeupRetry } = options;
    if (!groqApiKey) throw new MissingGroqApiKeyError();
    if (!accessToken) throw new YoutubeSourceError(translate('youtube.errorMissingToken'));

    await pingBackendAwake(signal, onWakeupRetry);
    const response = await fetch(`${BACKEND_URL}/youtube/transcribe/stream`, {
        method: 'POST',
        headers: youtubeHeaders(accessToken),
        body: JSON.stringify({ url, groq_api_key: groqApiKey, language: getTranscriptionLanguage() }),
        signal,
    });
    if (response.status === 404) throw new YoutubeSourceError(translate('youtube.errorNotEnabled'));
    return readTranscriptionStream(response, onProgress);
};

const mapBackendError = (data: any): Error => {
    const message: string = data?.message || translate('pipeline.unknownError');
    switch (data?.error_type) {
        case 'missing_groq_key':
            return new MissingGroqApiKeyError();
        case 'invalid_groq_key':
            return new InvalidGroqApiKeyError(message);
        case 'rate_limited':
            return new RateLimitError(message, Number(data?.retry_after_seconds) || 15);
        case 'no_speech':
            return new Error(translate('groq.noSpeechDetected'));
        case 'too_large':
            return new FileTooLargeError();
        case 'youtube_error':
        case 'youtube_unauthorized':
        case 'youtube_bad_url':
            return new YoutubeSourceError(youtubeErrorMessage(data));
        default:
            return new Error(message);
    }
};
