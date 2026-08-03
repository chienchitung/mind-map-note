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
