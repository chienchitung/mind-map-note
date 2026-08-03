// Persists the raw audio segments and transcript behind each generated
// voice note, keyed by the note's own ID. Deliberately IndexedDB, not
// localStorage: localStorage is a synchronous, string-only, ~5-10MB-per-
// origin store — completely the wrong tool for potentially many megabytes
// of audio Blobs across possibly many notes. IndexedDB natively stores
// Blobs (no base64 inflation) and its quota is typically hundreds of MB to
// low GB, tracking available disk space.

const DB_NAME = 'mind-map-voice-recordings';
const STORE_NAME = 'recordings';
const DB_VERSION = 1;

export interface StoredVoiceRecording {
    noteId: string;
    createdAt: number;
    transcript: string;
    segments: Blob[];
    totalBytes: number;
}

const isIndexedDbAvailable = (): boolean => typeof indexedDB !== 'undefined';

const openDb = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'noteId' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

// Runs a single transaction against the store and resolves once it commits,
// closing the connection afterward — simpler to reason about than juggling
// a long-lived shared connection for a store this lightly used.
const runTransaction = async <T>(
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> => {
    const db = await openDb();
    try {
        return await new Promise<T | undefined>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, mode);
            const store = tx.objectStore(STORE_NAME);
            const request = work(store);
            tx.onerror = () => reject(tx.error);
            tx.oncomplete = () => resolve(request ? (request as IDBRequest<T>).result : undefined);
        });
    } finally {
        db.close();
    }
};

export const saveVoiceRecording = async (noteId: string, transcript: string, segments: Blob[]): Promise<void> => {
    if (!isIndexedDbAvailable()) return;
    const totalBytes = segments.reduce((sum, segment) => sum + segment.size, 0) + new Blob([transcript]).size;
    const record: StoredVoiceRecording = { noteId, createdAt: Date.now(), transcript, segments, totalBytes };
    await runTransaction('readwrite', store => store.put(record));
};

export const deleteVoiceRecording = async (noteId: string): Promise<void> => {
    if (!isIndexedDbAvailable()) return;
    await runTransaction('readwrite', store => store.delete(noteId));
};

export const clearAllVoiceRecordings = async (): Promise<void> => {
    if (!isIndexedDbAvailable()) return;
    await runTransaction('readwrite', store => store.clear());
};

export const getVoiceRecording = async (noteId: string): Promise<StoredVoiceRecording | undefined> => {
    if (!isIndexedDbAvailable()) return undefined;
    return runTransaction('readonly', store => store.get(noteId));
};

// Every stored recording's full record — including its segment Blobs, whose
// bytes stay disk-backed until actually read (e.g. downloaded), so listing
// them all doesn't pull the whole store into memory at once.
export const getAllVoiceRecordings = async (): Promise<StoredVoiceRecording[]> => {
    if (!isIndexedDbAvailable()) return [];
    return (await runTransaction<StoredVoiceRecording[]>('readonly', store => store.getAll())) ?? [];
};

export const getTotalVoiceRecordingsBytes = async (): Promise<number> => {
    if (!isIndexedDbAvailable()) return 0;
    const db = await openDb();
    try {
        return await new Promise<number>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            let total = 0;
            const cursorRequest = store.openCursor();
            cursorRequest.onsuccess = () => {
                const cursor = cursorRequest.result;
                if (cursor) {
                    total += (cursor.value as StoredVoiceRecording).totalBytes ?? 0;
                    cursor.continue();
                } else {
                    resolve(total);
                }
            };
            cursorRequest.onerror = () => reject(cursorRequest.error);
        });
    } finally {
        db.close();
    }
};
