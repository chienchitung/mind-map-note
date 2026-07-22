import { GoogleGenAI, Chat } from "@google/genai";

/**
 * Thrown when no Gemini API key has been configured yet. The caller is
 * expected to catch this and prompt the user to set one in Settings.
 */
export class MissingApiKeyError extends Error {
    constructor() {
        super("尚未設定 Gemini API 金鑰。");
        this.name = "MissingApiKeyError";
    }
}

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
 * @returns A promise that resolves to a Chat instance.
 */
export const createChatSession = async (noteContent: string, apiKey: string): Promise<Chat> => {
    if (!apiKey) {
        throw new MissingApiKeyError();
    }

    try {
        const ai = new GoogleGenAI({ apiKey });
        const chat: Chat = ai.chats.create({
            model: 'gemini-2.5-flash',
            config: {
                systemInstruction: 'You are an AI learning assistant. A user has provided you with their notes. Your role is to help them understand, summarize, or quiz them on the provided content in a conversational manner. Be helpful and encouraging.',
            },
        });

        // Send the note content as the first message to establish context for the conversation.
        // We don't need to wait for this response before returning the chat object. The user's first
        // visible message will be the one that gets the first visible response.
        chat.sendMessage({ message: `Here are my notes, please use them as the context for our conversation:\n\n---\n\n${noteContent}` });

        return chat;
    } catch (error) {
        console.error("Error creating Gemini chat session:", error);
        throw new Error("Failed to create a chat session with the AI model.");
    }
};
