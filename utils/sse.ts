// Minimal Server-Sent-Events parser for a `fetch()` response body — used
// instead of `EventSource` because EventSource can't do POST/multipart
// requests, which the backend's streaming endpoints require (the request
// carries the audio file itself).

export interface SseEvent {
    event: string;
    data: any;
}

export const parseSseEvent = (rawEvent: string): SseEvent | null => {
    const lines = rawEvent.split(/\r?\n/);
    let event = 'message';
    const dataLines: string[] = [];

    lines.forEach(line => {
        if (line.startsWith('event:')) {
            event = line.slice(6).trim() || 'message';
        } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trimStart());
        }
    });

    if (dataLines.length === 0) return null;

    const raw = dataLines.join('\n');
    try {
        return { event, data: JSON.parse(raw) };
    } catch {
        return { event, data: raw };
    }
};

export const readSseStream = async (response: Response, onEvent: (event: string, data: any) => void): Promise<void> => {
    const reader = response.body?.getReader();
    if (!reader) {
        throw new Error('Streaming response is not readable.');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf('\n\n');
        while (boundary !== -1) {
            const rawEvent = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const parsed = parseSseEvent(rawEvent);
            if (parsed) onEvent(parsed.event, parsed.data);
            boundary = buffer.indexOf('\n\n');
        }
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
        const parsed = parseSseEvent(buffer.trim());
        if (parsed) onEvent(parsed.event, parsed.data);
    }
};
