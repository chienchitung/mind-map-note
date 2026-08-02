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

// Groq's transcription API is OpenAI-compatible, so error bodies follow the
// same `{"error":{"message":"..."}}` shape as the rest of that ecosystem.
const extractGroqErrorMessage = async (response: Response): Promise<string> => {
    try {
        const data = await response.json();
        if (typeof data?.error?.message === 'string') {
            return data.error.message;
        }
    } catch {
        // Response body wasn't JSON — fall through to the generic message below.
    }
    return `語音轉錄失敗（HTTP ${response.status}）。`;
};

// Maps a MediaRecorder mimeType (e.g. "audio/webm;codecs=opus") to the file
// extension Groq's transcription endpoint expects to see on the uploaded
// filename, which it uses as its main hint for how to decode the audio.
const extensionForMimeType = (mimeType: string): string => {
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

/**
 * Sends a locally recorded audio clip to Groq's Whisper transcription API
 * and returns the resulting plain-text transcript.
 *
 * @param audioBlob The recorded audio (from MediaRecorder).
 * @param mimeType The MediaRecorder mimeType the blob was recorded with —
 *   used to pick a matching file extension for the upload.
 * @param apiKey The user's Groq API key.
 * @param signal Optional AbortSignal so an in-flight request can be
 *   cancelled if the user closes the recording dialog early.
 */
export const transcribeAudio = async (
    audioBlob: Blob,
    mimeType: string,
    apiKey: string,
    signal?: AbortSignal,
): Promise<string> => {
    if (!apiKey) {
        throw new MissingGroqApiKeyError();
    }

    const formData = new FormData();
    formData.append('file', audioBlob, `recording.${extensionForMimeType(mimeType)}`);
    formData.append('model', GROQ_WHISPER_MODEL);
    formData.append('response_format', 'json');

    const response = await fetch(GROQ_TRANSCRIPTION_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
        signal,
    });

    if (!response.ok) {
        throw new Error(await extractGroqErrorMessage(response));
    }

    const data = await response.json();
    const text = typeof data?.text === 'string' ? data.text.trim() : '';
    if (!text) {
        throw new Error('沒有辨識到任何語音內容，請確認錄音時有清楚說話。');
    }
    return text;
};
