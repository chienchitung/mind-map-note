/**
 * Thrown when no Groq API key has been configured yet. The caller is
 * expected to catch this and prompt the user to set one in Settings.
 */
export class MissingGroqApiKeyError extends Error {
    constructor() {
        super("尚未設定 Groq API 金鑰。");
        this.name = "MissingGroqApiKeyError";
    }
}

const GROQ_TRANSCRIPTION_ENDPOINT = 'https://api.groq.com/openai/v1/audio/transcriptions';
// Groq's fast, general-purpose Whisper endpoint — a good balance of speed
// and accuracy for spoken notes.
const GROQ_WHISPER_MODEL = 'whisper-large-v3-turbo';

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
// common video containers — a video file's audio track is extracted
// client-side (see isVideoFile / audioSplitter.ts) before ever reaching
// Groq, so the video container itself never needs to be something Groq
// understands. Checked client-side on upload so a wrong file type is
// rejected instantly with a clear message instead of round-tripping to the
// API first — drag-and-drop in particular bypasses the file picker's own
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
// sources omit it). A file classified as video is always routed through
// client-side audio extraction rather than uploaded as-is (see
// useVoiceNotePipeline's selectFile), so a false positive here just costs a
// bit of extra local processing, never a correctness problem.
const VIDEO_ONLY_EXTENSIONS = ['mov', 'mkv', 'm4v', 'avi', 'mp4', 'webm', 'ogv'];

export const isVideoFile = (file: File): boolean => {
    if (file.type) return file.type.startsWith('video/');
    const extension = file.name.split('.').pop()?.toLowerCase();
    return extension ? VIDEO_ONLY_EXTENSIONS.includes(extension) : false;
};

// Groq's documented per-file cap for the free tier (paid "dev tier" allows
// up to 100MB). Checked client-side before an upload even starts so a file
// that's too large is rejected instantly with a clear message, rather than
// after a long upload only to be rejected by the API anyway.
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export class FileTooLargeError extends Error {
    constructor() {
        super(`檔案超過 ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB 的轉錄上限，請先壓縮音檔，或改用「錄音」分段轉錄。`);
        this.name = "FileTooLargeError";
    }
}

/**
 * Thrown on an HTTP 429 from Groq — the account's per-hour audio-processing
 * quota (ASPH) is temporarily exhausted. `retryAfterSeconds` is the
 * server-suggested cooldown, parsed from the `Retry-After` header if present
 * or from the error message's own "try again in Ns" text otherwise, so
 * callers can wait it out and retry the same request instead of failing
 * outright.
 */
export class RateLimitError extends Error {
    retryAfterSeconds: number;
    constructor(message: string, retryAfterSeconds: number) {
        super(message);
        this.name = "RateLimitError";
        this.retryAfterSeconds = retryAfterSeconds;
    }
}

interface TranscribeOptions {
    // AbortSignal so an in-flight request can be cancelled if the user
    // closes the recording dialog or cancels the pipeline early.
    signal?: AbortSignal;
    // Fired with a 0-1 fraction as the upload progresses. `fetch` has no
    // reliable cross-browser way to observe upload (as opposed to download)
    // progress, so this uses XMLHttpRequest instead, which exposes it via
    // `xhr.upload.onprogress`.
    onUploadProgress?: (fraction: number) => void;
}

// One Whisper-identified span of speech within the submitted clip — start/end
// are seconds *relative to that clip*, not the overall recording (a live
// recording or a split upload sends many separate clips; useVoiceNotePipeline
// is what turns these into one continuous timeline).
export interface TranscriptionSegment {
    start: number;
    end: number;
    text: string;
}

export interface TranscriptionResult {
    text: string;
    segments: TranscriptionSegment[];
    // Duration of the submitted clip in seconds, per Groq's own reporting —
    // used to advance the running offset for the *next* clip's timestamps.
    duration: number;
}

// Whisper defaults to Simplified Chinese characters for Mandarin speech
// regardless of the speaker's actual variant, and Groq's API has no
// parameter to request Traditional output directly — so any Simplified
// text is converted to Traditional (Taiwan, with phrase-level
// localization — e.g. 软件 -> 軟體, not just 软件 -> 軟件) after the fact.
// A no-op for text with no Simplified characters, so this is safe to run
// unconditionally without language detection. Dynamically imported (and
// memoized) so the conversion dictionary only loads for users who actually
// transcribe audio, not on every page load.
let toTraditionalPromise: Promise<(text: string) => string> | null = null;
const getToTraditionalConverter = (): Promise<(text: string) => string> => {
    if (!toTraditionalPromise) {
        toTraditionalPromise = import('opencc-js/cn2t').then(({ default: OpenCC }) => OpenCC.Converter({ from: 'cn', to: 'twp' }));
    }
    return toTraditionalPromise;
};

/**
 * Sends an audio clip — either a live recording or an uploaded file — to
 * Groq's Whisper transcription API and returns the resulting transcript,
 * both as plain text and as the individual timed segments Whisper broke it
 * into (requesting `verbose_json` rather than plain `json` is what makes the
 * segment timestamps available at all).
 *
 * @param audioBlob The audio to transcribe (a MediaRecorder Blob, or an
 *   uploaded File — File extends Blob).
 * @param filename The filename to upload it as. Groq uses this extension as
 *   its main hint for how to decode the audio, so it must be a real one —
 *   an uploaded File's own `.name` works as-is; a live recording needs one
 *   synthesized from its MediaRecorder mimeType (see `extensionForMimeType`).
 * @param apiKey The user's Groq API key.
 */
export const transcribeAudio = (
    audioBlob: Blob,
    filename: string,
    apiKey: string,
    options: TranscribeOptions = {},
): Promise<TranscriptionResult> => {
    const { signal, onUploadProgress } = options;

    return new Promise<TranscriptionResult>((resolve, reject) => {
        if (!apiKey) {
            reject(new MissingGroqApiKeyError());
            return;
        }
        if (audioBlob.size > MAX_UPLOAD_BYTES) {
            reject(new FileTooLargeError());
            return;
        }
        if (signal?.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
        }

        // Kicked off now, in parallel with the network request below, so the
        // conversion dictionary is very likely already loaded (or in
        // flight) by the time a response arrives — the finished
        // transcription isn't held up waiting on it separately.
        const converterPromise = getToTraditionalConverter();

        const formData = new FormData();
        formData.append('file', audioBlob, filename);
        formData.append('model', GROQ_WHISPER_MODEL);
        formData.append('response_format', 'verbose_json');
        // Without an explicit language hint, Whisper auto-detects the
        // language from roughly the first 30s of each *submitted clip* —
        // when that happens to be silence or ambient noise (e.g. before the
        // user starts speaking), it tends to hallucinate plausible-sounding
        // English phrases instead of returning nothing, and later portions
        // of the same recording can then flip back and forth between
        // languages as detection re-runs. Recordings here are predominantly
        // Mandarin with occasional English terms, so pinning the language
        // sidesteps the misdetection outright — Whisper still transcribes
        // genuine English loanwords/terms within otherwise-Chinese speech
        // reasonably well even with this set.
        formData.append('language', 'zh');

        const xhr = new XMLHttpRequest();
        xhr.open('POST', GROQ_TRANSCRIPTION_ENDPOINT);
        xhr.setRequestHeader('Authorization', `Bearer ${apiKey}`);

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
                onUploadProgress?.(event.loaded / event.total);
            }
        };

        xhr.onload = async () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const data = JSON.parse(xhr.responseText);
                    const rawText = typeof data?.text === 'string' ? data.text.trim() : '';
                    if (!rawText) {
                        reject(new Error('沒有辨識到任何語音內容，請確認錄音時有清楚說話。'));
                        return;
                    }
                    const convert = await converterPromise;
                    const text = convert(rawText);
                    const segments: TranscriptionSegment[] = Array.isArray(data?.segments)
                        ? data.segments
                            .map((seg: any) => ({ start: Number(seg?.start) || 0, end: Number(seg?.end) || 0, text: convert(typeof seg?.text === 'string' ? seg.text.trim() : '') }))
                            .filter((seg: TranscriptionSegment) => seg.text)
                        : [];
                    const duration = Number(data?.duration) || segments[segments.length - 1]?.end || 0;
                    resolve({ text, segments, duration });
                } catch {
                    reject(new Error('無法解析語音轉錄的回應內容。'));
                }
                return;
            }
            let message = `語音轉錄失敗（HTTP ${xhr.status}）。`;
            try {
                const data = JSON.parse(xhr.responseText);
                if (typeof data?.error?.message === 'string') message = data.error.message;
            } catch {
                // Response body wasn't JSON — keep the generic message above.
            }

            if (xhr.status === 429) {
                const retryAfterHeader = xhr.getResponseHeader('Retry-After');
                let retryAfterSeconds = retryAfterHeader ? parseFloat(retryAfterHeader) : NaN;
                if (!Number.isFinite(retryAfterSeconds)) {
                    // Groq embeds the actual wait time in the message text
                    // itself (e.g. "...Please try again in 53s."), since it
                    // doesn't reliably send a Retry-After header.
                    const match = message.match(/try again in ([\d.]+)\s*s/i);
                    retryAfterSeconds = match ? parseFloat(match[1]) : 15;
                }
                reject(new RateLimitError(message, retryAfterSeconds));
                return;
            }

            reject(new Error(message));
        };
        xhr.onerror = () => reject(new Error('網路連線發生錯誤，語音轉錄失敗。'));
        xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'));

        signal?.addEventListener('abort', () => xhr.abort());

        xhr.send(formData);
    });
};
