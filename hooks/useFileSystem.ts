// hooks/useFileSystem.ts
import { useState, useCallback, useEffect, useRef } from 'react';
import { FileSystemTree, NotesContent, FileSystemNode, Images } from '../types';

const initialMarkdown = `# 歡迎使用思維導圖筆記工具

## 核心理念
- **輕鬆寫作，自動成圖**：您只需專注於使用 Markdown 語法（如標題 '#' 和列表 '-'）來撰寫筆記，應用程式會自動將其轉換為結構化的思維導圖。
- **階層式結構**：透過標題層級和列表縮排，輕鬆建立複雜的思緒層次。

## 開始使用
- **試著編輯看看！**
  - 直接修改這份文件，新增您自己的標題或列表項。
- **查看快捷鍵**
  - 按下 \`?\` 鍵可以打開快捷鍵說明，了解更多高效操作。

> 現在，開始您的第一次思維導圖筆記之旅吧！
`;

const TREE_STORAGE_KEY = 'mind-map-file-tree';
const NOTES_STORAGE_KEY = 'mind-map-notes-content';
const IMAGES_STORAGE_KEY = 'mind-map-images';

const generateId = () => `id_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Writes to localStorage are debounced by this many ms so rapid successive
// edits (typing, dragging nodes, etc.) don't serialize the whole workspace
// — including any base64 images — on every single state change.
const PERSIST_DEBOUNCE_MS = 400;

// Matches `![alt](image://<id>)` references embedded in note markdown.
const IMAGE_REFERENCE_REGEX = /!\[.*?\]\(image:\/\/(.*?)\)/g;

const extractReferencedImageIds = (content: string): string[] => {
    const ids: string[] = [];
    const regex = new RegExp(IMAGE_REFERENCE_REGEX);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
        ids.push(match[1]);
    }
    return ids;
};

const getInitialFileSystem = () => {
    const savedTree = localStorage.getItem(TREE_STORAGE_KEY);
    const savedNotes = localStorage.getItem(NOTES_STORAGE_KEY);
    const savedImages = localStorage.getItem(IMAGES_STORAGE_KEY);

    if (savedTree && savedNotes) {
        try {
            return {
                tree: JSON.parse(savedTree) as FileSystemTree,
                notes: JSON.parse(savedNotes) as NotesContent,
                images: savedImages ? (JSON.parse(savedImages) as Images) : {},
            };
        } catch (error) {
            console.error("Failed to parse file system from localStorage", error);
        }
    }

    // Create a default initial state
    const rootId = 'root';
    const initialNoteId = generateId();
    
    const initialTree: FileSystemTree = {
        [rootId]: { id: rootId, name: 'Root', type: 'folder', parentId: null, childrenIds: [initialNoteId] },
        [initialNoteId]: { id: initialNoteId, name: '我的第一篇筆記', type: 'file', parentId: rootId, childrenIds: [] },
    };
    
    const initialNotes: NotesContent = {
        [initialNoteId]: initialMarkdown,
    };
    
    return { tree: initialTree, notes: initialNotes, images: {} };
};

export const useFileSystem = () => {
    const [{ tree, notes, images }, setState] = useState(getInitialFileSystem);
    // Surfaced to the UI so a full storage quota doesn't fail silently —
    // without this, edits keep "working" on screen but stop persisting,
    // and the user only finds out after losing them on the next reload.
    const [storageError, setStorageError] = useState<string | null>(null);

    // Keep a ref to the latest state so the unload flush (below) and the
    // debounce timer always write the most current data, not a stale closure.
    const latestStateRef = useRef({ tree, notes, images });
    useEffect(() => {
        latestStateRef.current = { tree, notes, images };
    });

    const flushToStorage = useCallback(() => {
        try {
            const { tree, notes, images } = latestStateRef.current;
            localStorage.setItem(TREE_STORAGE_KEY, JSON.stringify(tree));
            localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
            localStorage.setItem(IMAGES_STORAGE_KEY, JSON.stringify(images));
            setStorageError(null);
        } catch (error) {
            console.error("Failed to save notes to local storage — it may be full. Try removing large images.", error);
            const isQuotaError = error instanceof DOMException &&
                (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
            setStorageError(
                isQuotaError
                    ? '儲存空間已滿，最新的變更目前無法儲存。請刪除較大的圖片或筆記以釋出空間。'
                    : '筆記儲存失敗，變更可能會在重新整理後遺失。'
            );
        }
    }, []);

    // Debounce persistence so a burst of edits results in one write, not one per keystroke.
    useEffect(() => {
        const timeoutId = setTimeout(flushToStorage, PERSIST_DEBOUNCE_MS);
        return () => clearTimeout(timeoutId);
    }, [tree, notes, images, flushToStorage]);

    // Make sure the latest changes are still written if the tab closes before the debounce fires.
    useEffect(() => {
        window.addEventListener('beforeunload', flushToStorage);
        return () => window.removeEventListener('beforeunload', flushToStorage);
    }, [flushToStorage]);

    const addImage = useCallback((dataUrl: string): string => {
        const id = generateId();
        setState(prevState => ({
            ...prevState,
            images: { ...prevState.images, [id]: dataUrl },
        }));
        return id;
    }, []);

    const createNode = useCallback((type: 'file' | 'folder', parentId: string | null = 'root') => {
        const id = generateId();
        const defaultName = type === 'file' ? '無標題筆記' : '新資料夾';
        const newNode: FileSystemNode = { id, name: defaultName, type, parentId, childrenIds: [] };
        
        setState(prevState => {
            const newTree = { ...prevState.tree, [id]: newNode };
            if (parentId && newTree[parentId]) {
                newTree[parentId] = { ...newTree[parentId], childrenIds: [...newTree[parentId].childrenIds, id] };
            }
            
            let newNotes = prevState.notes;
            if (type === 'file') {
                newNotes = { ...prevState.notes, [id]: `# ${defaultName}\n\n` };
            }

            return { tree: newTree, notes: newNotes, images: prevState.images };
        });
        return id;
    }, []);

    const updateNote = useCallback((noteId: string, content: string) => {
        setState(prevState => ({
            ...prevState,
            notes: { ...prevState.notes, [noteId]: content },
        }));
    }, []);

    const renameNode = useCallback((nodeId: string, newName: string) => {
        if (!newName.trim()) return;
        setState(prevState => {
            const newTree = { ...prevState.tree };
            if (newTree[nodeId]) {
                newTree[nodeId] = { ...newTree[nodeId], name: newName.trim() };
            }
            return { ...prevState, tree: newTree };
        });
    }, []);

    const deleteNode = useCallback((nodeId: string) => {
        setState(prevState => {
            const newTree = { ...prevState.tree };
            const newNotes = { ...prevState.notes };
            const nodeToDelete = newTree[nodeId];

            if (!nodeToDelete) return prevState;

            const nodesToDelete = new Set<string>();
            const queue = [nodeId];

            while (queue.length > 0) {
                const currentId = queue.shift()!;
                nodesToDelete.add(currentId);
                newTree[currentId]?.childrenIds.forEach(childId => queue.push(childId));
            }

            nodesToDelete.forEach(id => {
                delete newTree[id];
                if (id in newNotes) {
                    delete newNotes[id];
                }
            });

            if (nodeToDelete.parentId && newTree[nodeToDelete.parentId]) {
                const parent = newTree[nodeToDelete.parentId];
                newTree[parent.id] = { ...parent, childrenIds: parent.childrenIds.filter(id => id !== nodeId) };
            }

            // Garbage-collect any images that were only referenced by the deleted note(s),
            // so pasted screenshots don't silently accumulate in storage forever.
            let newImages = prevState.images;
            if (Object.keys(prevState.images).length > 0) {
                const stillReferenced = new Set<string>();
                Object.keys(newNotes).forEach(id => {
                    extractReferencedImageIds(newNotes[id]).forEach(imageId => stillReferenced.add(imageId));
                });
                const orphanedIds = Object.keys(prevState.images).filter(id => !stillReferenced.has(id));
                if (orphanedIds.length > 0) {
                    newImages = { ...prevState.images };
                    orphanedIds.forEach(id => delete newImages[id]);
                }
            }

            return { tree: newTree, notes: newNotes, images: newImages };
        });
    }, []);

    const moveNode = useCallback((nodeId: string, newParentId: string | null) => {
        setState(prevState => {
            const newTree = { ...prevState.tree };
            const nodeToMove = newTree[nodeId];
            if (!nodeToMove || nodeToMove.parentId === newParentId) return prevState;
            
            // Prevent moving a folder into itself
            let tempParentId = newParentId;
            while(tempParentId) {
                if(tempParentId === nodeId) return prevState;
                tempParentId = newTree[tempParentId].parentId;
            }

            // Remove from old parent
            if (nodeToMove.parentId && newTree[nodeToMove.parentId]) {
                const oldParent = newTree[nodeToMove.parentId];
                newTree[oldParent.id] = { ...oldParent, childrenIds: oldParent.childrenIds.filter(id => id !== nodeId) };
            }
            
            // Add to new parent
            if (newParentId && newTree[newParentId]) {
                const newParent = newTree[newParentId];
                newTree[newParent.id] = { ...newParent, childrenIds: [...newParent.childrenIds, nodeId] };
            }

            // Update moved node's parentId
            newTree[nodeId] = { ...nodeToMove, parentId: newParentId };

            return { ...prevState, tree: newTree };
        });
    }, []);

    return { tree, notes, images, createNode, updateNote, renameNode, deleteNode, moveNode, addImage, storageError, dismissStorageError: () => setStorageError(null) };
};