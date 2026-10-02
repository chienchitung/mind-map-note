// Note images live in IndexedDB rather than localStorage: localStorage is
// capped at roughly 5MB per origin, which a handful of pasted pictures or a
// screen-shared voice note's screenshots can fill on their own, after which
// even plain text edits stop saving. IndexedDB's quota tracks free disk
// space instead.
import { Images } from '../types';

const DB_NAME = 'mind-map-images';
const STORE_NAME = 'images';
const DB_VERSION = 1;

export const isImageStorageAvailable = (): boolean => typeof indexedDB !== 'undefined';

const openDb = (): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(STORE_NAME)) {
                request.result.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

export const loadAllImages = async (): Promise<Images> => {
    const db = await openDb();
    try {
        return await new Promise<Images>((resolve, reject) => {
            const images: Images = {};
            const tx = db.transaction(STORE_NAME, 'readonly');
            const cursorRequest = tx.objectStore(STORE_NAME).openCursor();
            cursorRequest.onsuccess = () => {
                const cursor = cursorRequest.result;
                if (!cursor) return;
                images[String(cursor.key)] = cursor.value as string;
                cursor.continue();
            };
            tx.oncomplete = () => resolve(images);
            tx.onerror = () => reject(tx.error);
        });
    } finally {
        db.close();
    }
};

// Applies only what changed since the last save, so adding one image
// doesn't rewrite every other image's data.
export const saveImageChanges = async (put: Images, remove: string[]): Promise<void> => {
    if (Object.keys(put).length === 0 && remove.length === 0) return;
    const db = await openDb();
    try {
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            Object.entries(put).forEach(([id, dataUrl]) => store.put(dataUrl, id));
            remove.forEach(id => store.delete(id));
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    } finally {
        db.close();
    }
};
