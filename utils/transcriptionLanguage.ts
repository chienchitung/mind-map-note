// Which spoken language to tell Whisper to expect when transcribing a voice
// recording — deliberately independent from the interface display language
// (see i18n/translations.ts's getCurrentLanguage): a user reading the UI in
// English isn't necessarily speaking English into the mic, and vice versa.
// 'auto' leaves the language undetermined so Whisper detects it per clip;
// 'zh'/'en' pins it explicitly for users who find auto-detection misfires
// (e.g. a quiet/noisy opening segment gets misdetected, or a recording
// flip-flops languages mid-way through).
export type TranscriptionLanguage = 'auto' | 'zh' | 'en';

const STORAGE_KEY = 'mind-map-transcription-language';

// Non-reactive read for plain (non-component) modules — mirrors
// getCurrentLanguage()'s pattern in i18n/translations.ts. Always current
// since it's read fresh from localStorage on each call; the Settings UI
// writes to the same key via useLocalStorage, so no synchronization beyond
// that shared key is needed.
export const getTranscriptionLanguage = (): TranscriptionLanguage => {
    if (typeof window === 'undefined') return 'auto';
    try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        const parsed = stored ? JSON.parse(stored) : null;
        return parsed === 'zh' || parsed === 'en' ? parsed : 'auto';
    } catch {
        return 'auto';
    }
};

export const TRANSCRIPTION_LANGUAGE_STORAGE_KEY = STORAGE_KEY;
