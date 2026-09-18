import { translate } from '../i18n/translations';

/**
 * Thrown when no Groq API key has been configured yet. The caller is
 * expected to catch this and prompt the user to set one in Settings.
 */
export class MissingGroqApiKeyError extends Error {
    constructor() {
        super(translate('groq.missingApiKey'));
        this.name = "MissingGroqApiKeyError";
    }
}

// Maps a MediaRecorder mimeType (e.g. "audio/webm;codecs=opus") to the file
// extension Groq's transcription endpoint expects to see on the uploaded
// filename, which it uses as its main hint for how to decode the audio. Only
// needed for live recordings — an uploaded file already has a real filename.
export const extensionForMimeType = (mimeType: string): string => {
    const base = mimeType.split(';')[0].trim().toLowerCase();
    const map: Record<string, string> = {
        'audio/webm': 'webm',
        'audio/ogg': 'ogg',
        'audio/mp4': 'mp4',
        'audio/mpeg': 'mp3',
        'audio/wav': 'wav',
    };
    return map[base] ?? 'webm';
};

// File extensions Groq's transcription endpoint documents support for, plus
// common video containers — a video file's audio track is extracted by the
// backend (see isVideoFile / services/backendAudioService.ts) before ever
// reaching Groq, so the video container itself never needs to be something
// Groq understands. Checked client-side on upload so a wrong file type is
// rejected instantly with a clear message instead of round-tripping to the
// backend first — drag-and-drop in particular bypasses the file picker's own
// `accept` filter.
const SUPPORTED_UPLOAD_EXTENSIONS = [
    'flac', 'mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'ogg', 'wav', 'webm',
    'mov', 'mkv', 'm4v', 'avi',
];

export const isSupportedMediaFile = (file: File): boolean => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension && SUPPORTED_UPLOAD_EXTENSIONS.includes(extension)) return true;
    return file.type.startsWith('audio/') || file.type.startsWith('video/');
};

// `.mp4`/`.webm` are ambiguous (audio-only or audio+video), so this prefers
// the browser-reported MIME type when available — it's sniffed from the
// actual file content, not just the extension — and only falls back to
// extension-based guessing when the type is empty (some drag-and-drop
// sources omit it). Used purely for UI purposes (whether to show a <video>
// preview) — the backend's normalize step extracts the audio track from any
// container it's handed, so a false positive here has no correctness impact.
const VIDEO_ONLY_EXTENSIONS = ['mov', 'mkv', 'm4v', 'avi', 'mp4', 'webm', 'ogv'];

export const isVideoFile = (file: File): boolean => {
    if (file.type) return file.type.startsWith('video/');
    const extension = file.name.split('.').pop()?.toLowerCase();
    return extension ? VIDEO_ONLY_EXTENSIONS.includes(extension) : false;
};

/**
 * Thrown on an HTTP 429 from Groq — the account's per-hour audio-processing
 * quota (ASPH) is temporarily exhausted. `retryAfterSeconds` is the
 * server-suggested cooldown, so callers can wait it out and retry instead of
 * failing outright.
 */
export class RateLimitError extends Error {
    retryAfterSeconds: number;
    constructor(message: string, retryAfterSeconds: number) {
        super(message);
        this.name = "RateLimitError";
        this.retryAfterSeconds = retryAfterSeconds;
    }
}

/**
 * Thrown when Groq rejects the configured API key (401/403) — as opposed to
 * MissingGroqApiKeyError (no key configured at all). Affects every
 * remaining chunk of a recording identically, so callers should treat it as
 * fatal for the whole session.
 */
export class InvalidGroqApiKeyError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "InvalidGroqApiKeyError";
    }
}

// One Whisper-identified span of speech within the recording — start/end are
// seconds relative to the overall recording's timeline (the backend already
// combines multiple transcribed chunks onto one continuous timeline before
// returning this).
export interface TranscriptionSegment {
    start: number;
    end: number;
    text: string;
}

export interface TranscriptionResult {
    text: string;
    segments: TranscriptionSegment[];
    // Duration of the whole recording in seconds.
    duration: number;
}
