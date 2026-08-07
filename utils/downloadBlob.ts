// Triggers a browser "save file" for an in-memory Blob via a briefly
// clicked, throwaway anchor — the standard way to save client-side-only
// data to disk without a server round-trip.
export const downloadBlob = (blob: Blob, filename: string): void => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// Strips characters illegal in filenames on Windows/macOS/Linux
// (\ / : * ? " < > |), collapses the resulting whitespace, and trims
// trailing dots/spaces (Windows rejects both) — so a note's freeform
// display name can be used directly as a download filename without the
// browser silently mangling or rejecting it.
export const sanitizeFilename = (name: string): string => {
    const cleaned = name
        .replace(/[\\/:*?"<>|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[.\s]+$/, '');
    return cleaned || 'untitled';
};
