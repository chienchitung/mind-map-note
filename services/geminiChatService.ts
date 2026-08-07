import { GoogleGenAI, Chat } from "@google/genai";
import { getCurrentLanguage, translate } from '../i18n/translations';

/**
 * Thrown when no Gemini API key has been configured yet. The caller is
 * expected to catch this and prompt the user to set one in Settings.
 */
export class MissingApiKeyError extends Error {
    constructor() {
        super(translate('gemini.missingApiKey'));
        this.name = "MissingApiKeyError";
    }
}

/**
 * The @google/genai SDK often throws with `message` set to the raw JSON error
 * body (e.g. `{"error":{"code":404,"message":"...","status":"NOT_FOUND"}}`).
 * Pull out the human-readable message so the chat UI shows plain text
 * instead of a raw JSON blob.
 */
export const extractGeminiErrorMessage = (error: unknown): string => {
    if (error instanceof Error) {
        try {
            const parsed = JSON.parse(error.message);
            if (typeof parsed?.error?.message === 'string') {
                return parsed.error.message;
            }
        } catch {
            // Not JSON — fall through to the raw message below.
        }
        return error.message;
    }
    return translate('gemini.unknownError');
};

/**
 * Creates a new conversational chat session with the Gemini API.
 * The session is initialized with the content of the user's note for context.
 *
 * The API key is supplied by the caller (sourced from the user's own
 * browser-local Settings) rather than baked in at build time, so it is
 * never bundled into shipped JS and each user supplies their own key.
 *
 * @param noteContent The text of the current note to provide as context.
 * @param apiKey The user's Gemini API key.
 * @param onContextError Called if the context-priming message below fails —
 *   the caller doesn't wait for it (see comment), so a failure can't just
 *   throw; it has to be reported out-of-band once it happens.
 * @returns A promise that resolves to a Chat instance.
 */
export const createChatSession = async (
    noteContent: string,
    apiKey: string,
    onContextError?: (message: string) => void,
): Promise<Chat> => {
    if (!apiKey) {
        throw new MissingApiKeyError();
    }

    try {
        const ai = new GoogleGenAI({ apiKey });
        const language = getCurrentLanguage();
        const systemInstruction = language === 'en'
            ? 'You are an AI learning assistant. A user has provided you with their notes. Your role is to help them understand, summarize, or quiz them on the provided content in a conversational manner. Be helpful and encouraging. Always respond in English. For a simple logical or flow relationship (e.g. "A leads to B"), just write the arrow directly as plain text (A → B) — no special syntax needed. Reserve LaTeX for genuine mathematical or chemical formulas (fractions, exponents, equations, etc.): wrap inline formulas in a single `$` (e.g. `$x^2$`) and standalone block formulas in `$$` (e.g. `$$E=mc^2$$`). LaTeX commands always use a single backslash (e.g. `\\frac{a}{b}`) — never double it.'
            : 'You are an AI learning assistant. A user has provided you with their notes. Your role is to help them understand, summarize, or quiz them on the provided content in a conversational manner. Be helpful and encouraging. Always respond in Traditional Chinese (繁體中文). 單純的邏輯/流程關係（例如「A 導致 B」）請直接用文字箭頭表示（A → B），不需要任何特殊語法。LaTeX 語法只留給真正的數學或化學公式（分數、次方、方程式等）：行內公式用單一 `$` 包住（如 `$x^2$`），獨立成行的公式用 `$$` 包住（如 `$$E=mc^2$$`）。LaTeX 指令一律使用單一反斜線（如 `\\frac{a}{b}`），不要重複跳脫。';
        const chat: Chat = ai.chats.create({
            model: 'gemini-3.6-flash',
            config: {
                systemInstruction,
            },
        });

        // Send the note content as the first message to establish context for the conversation.
        // We don't need to wait for this response before returning the chat object. The user's first
        // visible message will be the one that gets the first visible response. A failure here must
        // still be caught, though — left unhandled, the user has no idea the AI never actually saw
        // their note and just silently answers with no context.
        chat.sendMessage({ message: `Here are my notes, please use them as the context for our conversation:\n\n---\n\n${noteContent}` })
            .catch((error) => {
                console.error('Failed to prime chat session with note context:', error);
                onContextError?.(extractGeminiErrorMessage(error));
            });

        return chat;
    } catch (error) {
        console.error("Error creating Gemini chat session:", error);
        throw new Error("Failed to create a chat session with the AI model.");
    }
};

// A raw speech transcript reads as an unstructured stream of words — filler
// words, false starts, no clear headings — so it isn't dropped straight into
// a note as-is. This turns it into the same kind of structured Markdown
// (headings + bullet points) the rest of the app expects to turn into a mind
// map, via a single one-shot generation call rather than a chat session.
export const generateNoteFromTranscript = async (transcript: string, apiKey: string): Promise<string> => {
    if (!apiKey) {
        throw new MissingApiKeyError();
    }
    if (!transcript.trim()) {
        throw new Error(translate('gemini.emptyTranscript'));
    }

    try {
        const ai = new GoogleGenAI({ apiKey });
        const language = getCurrentLanguage();
        const contents = language === 'en'
            ? `Please organize the following speech transcript into a well-structured note. Use "#"/"##" headings to divide topics, and "-" bullet lists to present key points, preserving the original meaning and important details while removing filler words, repetition, and off-topic content. Headings alone are enough to separate sections — do not insert "---" horizontal rule dividers between them. For a simple logical or flow relationship (e.g. "A leads to B"), just write the arrow directly as plain text (A → B) — no special syntax needed. Reserve LaTeX for genuine mathematical or chemical formulas (fractions, exponents, equations, etc.): wrap inline formulas in a single \`$\` (e.g. \`$x^2$\`) and standalone block formulas in \`$$\` (e.g. \`$$E=mc^2$$\`). LaTeX commands always use a single backslash (e.g. \`\\frac{a}{b}\`) — never double it. Regardless of what language the transcript itself is in, write the note entirely in English (proper nouns, technical terms, code, etc. that can't be translated accurately may stay in their original form). Output only the Markdown note itself, with no explanatory text or Markdown code block markers.\n\nTranscript:\n${transcript}`
            : `請將以下語音逐字稿整理成一份結構清楚的筆記。使用「#」「##」等標題劃分主題，並用「-」列表呈現重點，保留原意與重要細節，並移除口語贅字、重複與離題內容。標題本身就足以區隔段落，不要在段落之間插入「---」之類的分隔線。若逐字稿只是單純的邏輯/流程關係（例如「A 導致 B」），請直接用文字箭頭表示（A → B），不需要任何特殊語法。LaTeX 語法只留給真正的數學或化學公式（分數、次方、方程式等）：行內公式用單一 \`$\` 包住（如 \`$x^2$\`），獨立成行的公式用 \`$$\` 包住（如 \`$$E=mc^2$$\`）。LaTeX 指令一律使用單一反斜線（如 \`\\frac{a}{b}\`），不要重複跳脫。不論逐字稿本身是什麼語言，筆記內容一律使用繁體中文撰寫（人名、專有名詞、程式碼等無法翻譯或翻譯後會失真的內容可保留原文）。只輸出 Markdown 筆記本身，不要加上任何說明文字或 Markdown 程式碼區塊符號。\n\n逐字稿：\n${transcript}`;
        const systemInstruction = language === 'en'
            ? 'You are an expert note-taker. Convert raw speech transcripts into well-organized Markdown notes with clear headings and bullet points, preserving the original meaning and key details without adding commentary. Always write the note in English, regardless of what language the transcript itself is in — proper nouns, technical terms, and code may stay in their original form when translating them would be inaccurate or lose meaning. Do not insert horizontal rule dividers ("---") between sections — headings alone are enough to separate them. For a simple logical or flow relationship (e.g. A leads to B), just write the arrow directly as plain text (A → B) — no special syntax needed. Reserve LaTeX for genuine math or chemical formulas, always with a single backslash per command (e.g. `\\frac{a}{b}`, never doubled) — inline formulas wrapped in a single `$`, block formulas in `$$`.'
            : 'You are an expert note-taker. Convert raw speech transcripts into well-organized Markdown notes with clear headings and bullet points, preserving the original meaning and key details without adding commentary. Always write the note in Traditional Chinese (繁體中文), regardless of what language the transcript itself is in — proper nouns, technical terms, and code may stay in their original form when translating them would be inaccurate or lose meaning. Do not insert horizontal rule dividers ("---") between sections — headings alone are enough to separate them. 單純的邏輯/流程關係（例如「A 導致 B」）請直接用文字箭頭表示（A → B），不需要特殊語法。LaTeX 語法只留給真正的數學或化學公式，指令一律用單一反斜線（如 `\\frac{a}{b}`，絕不要重複），行內公式用單一 `$` 包住，獨立成行則用 `$$` 包住。';
        const response = await ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents,
            config: {
                systemInstruction,
            },
        });

        const noteMarkdown = response.text?.trim();
        if (!noteMarkdown) {
            throw new Error(translate('gemini.noteGenerationFailed'));
        }
        return noteMarkdown;
    } catch (error) {
        if (error instanceof MissingApiKeyError) throw error;
        console.error('Error generating note from transcript:', error);
        throw new Error(extractGeminiErrorMessage(error));
    }
};
