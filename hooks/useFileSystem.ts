// hooks/useFileSystem.ts
import { useState, useCallback, useEffect, useRef } from 'react';
import { FileSystemTree, NotesContent, FileSystemNode, Images } from '../types';
import { deleteVoiceRecording } from '../services/voiceRecordingStorage';
// A plain (non-hook) translator is used throughout this file rather than
// useTranslation() — getInitialFileSystem in particular runs inside a lazy
// useState initializer, outside the normal component render where hooks are
// allowed to be called, and the rest (createNode, flushToStorage) are
// useCallback-memoized with empty deps; translate() reads the current
// language fresh from localStorage on every call, so it's always correct
// without needing to be added as a dependency anywhere.
import { translate } from '../i18n/translations';

const TREE_STORAGE_KEY = 'mind-map-file-tree';
const NOTES_STORAGE_KEY = 'mind-map-notes-content';
const IMAGES_STORAGE_KEY = 'mind-map-images';

const generateId = () => `id_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Writes to localStorage are debounced by this many ms so rapid successive
// edits (typing, dragging nodes, etc.) don't serialize the whole workspace
// — including any base64 images — on every single state change.
const PERSIST_DEBOUNCE_MS = 400;

// How long a trashed node sticks around before it's purged for good.
const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

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

// Removes any image no longer referenced by any note's content. Previously
// this only ran when a whole note was deleted, so an image orphaned by a
// regular edit — deleting just the image line, or undoing a paste — never
// got cleaned up and sat in storage forever. Returns the same `images`
// reference when nothing changed, so callers can skip an update.
const garbageCollectImages = (notes: NotesContent, images: Images): Images => {
    if (Object.keys(images).length === 0) return images;
    const stillReferenced = new Set<string>();
    Object.keys(notes).forEach(id => {
        extractReferencedImageIds(notes[id]).forEach(imageId => stillReferenced.add(imageId));
    });
    const orphanedIds = Object.keys(images).filter(id => !stillReferenced.has(id));
    if (orphanedIds.length === 0) return images;
    const newImages = { ...images };
    orphanedIds.forEach(id => delete newImages[id]);
    return newImages;
};

// Permanently removes one or more subtrees (each root plus every
// descendant) from a state snapshot: drops them from tree/notes, cleans up
// any voice recording saved against them, detaches each root from its
// parent's childrenIds (a no-op if it was already detached, as a trashed
// node already is), and garbage-collects any image left orphaned by the
// removed notes. Shared by permanentlyDeleteNode (an explicit "delete
// forever" from the trash) and the on-load expired-trash sweep.
const purgeNodesFromState = (
    state: { tree: FileSystemTree; notes: NotesContent; images: Images },
    rootIds: string[]
): { tree: FileSystemTree; notes: NotesContent; images: Images } => {
    const newTree = { ...state.tree };
    const newNotes = { ...state.notes };

    const nodesToDelete = new Set<string>();
    const queue = [...rootIds];
    while (queue.length > 0) {
        const currentId = queue.shift()!;
        if (nodesToDelete.has(currentId)) continue;
        nodesToDelete.add(currentId);
        newTree[currentId]?.childrenIds.forEach(childId => queue.push(childId));
    }

    nodesToDelete.forEach(id => {
        delete newTree[id];
        if (id in newNotes) {
            delete newNotes[id];
        }
    });

    // Best-effort cleanup of any voice recording saved against a deleted
    // note — IndexedDB deletes on a missing key are silent no-ops.
    nodesToDelete.forEach(id => { void deleteVoiceRecording(id); });

    rootIds.forEach(rootId => {
        const node = state.tree[rootId];
        if (node?.parentId && newTree[node.parentId]) {
            const parent = newTree[node.parentId];
            newTree[parent.id] = { ...parent, childrenIds: parent.childrenIds.filter(id => id !== rootId) };
        }
    });

    const newImages = garbageCollectImages(newNotes, state.images);
    return { tree: newTree, notes: newNotes, images: newImages };
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
        [initialNoteId]: { id: initialNoteId, name: translate('app.firstNoteName'), type: 'file', parentId: rootId, childrenIds: [] },
    };

    const initialNotes: NotesContent = {
        [initialNoteId]: translate('app.welcomeNote'),
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
                    ? translate('app.storageFullError')
                    : translate('app.storageSaveError')
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
        const defaultName = type === 'file' ? translate('app.untitledNoteName') : translate('app.newFolderName');
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
        setState(prevState => {
            // Guard against resurrecting a note that's been deleted since this
            // update was queued (e.g. a debounced flush racing a deletion) —
            // without this, a stale write silently recreates an orphaned
            // entry in `notes` with no corresponding tree node, which then
            // persists to storage forever with no way to see or remove it.
            if (!prevState.tree[noteId]) return prevState;
            const newNotes = { ...prevState.notes, [noteId]: content };
            const newImages = garbageCollectImages(newNotes, prevState.images);
            return { ...prevState, notes: newNotes, images: newImages };
        });
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

    // Moves a node (and, implicitly, its whole subtree) to the trash: marks
    // it with a deletedAt timestamp and detaches it from its parent's
    // childrenIds so it disappears from the normal file tree, but leaves
    // it — and every descendant, its notes, and any voice recording —
    // completely untouched otherwise, so it can be restored intact later.
    // Descendants aren't individually marked; they stay attached under the
    // trashed root and come back automatically when it's restored.
    const deleteNode = useCallback((nodeId: string) => {
        setState(prevState => {
            const nodeToDelete = prevState.tree[nodeId];
            if (!nodeToDelete) return prevState;

            const newTree = { ...prevState.tree, [nodeId]: { ...nodeToDelete, deletedAt: Date.now() } };
            if (nodeToDelete.parentId && newTree[nodeToDelete.parentId]) {
                const parent = newTree[nodeToDelete.parentId];
                newTree[parent.id] = { ...parent, childrenIds: parent.childrenIds.filter(id => id !== nodeId) };
            }

            return { ...prevState, tree: newTree };
        });
    }, []);

    // Brings a trashed node back: re-attaches it to its original parent's
    // childrenIds (or to root, if that parent no longer exists or is
    // itself currently trashed) and clears deletedAt.
    const restoreNode = useCallback((nodeId: string) => {
        setState(prevState => {
            const node = prevState.tree[nodeId];
            if (!node || !node.deletedAt) return prevState;

            const newTree = { ...prevState.tree };
            const originalParent = node.parentId ? newTree[node.parentId] : undefined;
            const targetParentId = originalParent && !originalParent.deletedAt ? node.parentId as string : 'root';

            const { deletedAt, ...restoredNode } = node;
            newTree[nodeId] = { ...restoredNode, parentId: targetParentId };

            const targetParent = newTree[targetParentId];
            if (targetParent) {
                newTree[targetParentId] = { ...targetParent, childrenIds: [...targetParent.childrenIds, nodeId] };
            }

            return { ...prevState, tree: newTree };
        });
    }, []);

    // Deletes a trashed node for good — same hard-delete behavior deleteNode
    // used to have directly, now reserved for an explicit "delete forever"
    // from the trash (or the expired-trash sweep below).
    const permanentlyDeleteNode = useCallback((nodeId: string) => {
        setState(prevState => (prevState.tree[nodeId] ? purgeNodesFromState(prevState, [nodeId]) : prevState));
    }, []);

    // Sweeps anything that's been sitting in the trash past the retention
    // window and purges it for good. Runs once per app load — trashed
    // items are also swept next time the app is opened, so nothing needs a
    // running timer while the tab stays open.
    useEffect(() => {
        setState(prevState => {
            const now = Date.now();
            const expiredRootIds = Object.values(prevState.tree)
                .filter(node => node.deletedAt !== undefined && now - node.deletedAt > TRASH_RETENTION_MS)
                .map(node => node.id);
            return expiredRootIds.length > 0 ? purgeNodesFromState(prevState, expiredRootIds) : prevState;
        });
    }, []);

    // Moves (or reorders) a node. With no `beforeNodeId`, it's appended to the
    // end of the new parent's children — the original "move into this
    // folder" behavior. Passing `beforeNodeId` inserts it immediately ahead
    // of that sibling instead, which is what lets a node be reordered among
    // its siblings (including within the same parent, previously a no-op).
    const moveNode = useCallback((nodeId: string, newParentId: string | null, beforeNodeId?: string | null) => {
        setState(prevState => {
            const newTree = { ...prevState.tree };
            const nodeToMove = newTree[nodeId];
            if (!nodeToMove) return prevState;
            if (nodeToMove.parentId === newParentId && beforeNodeId === undefined) return prevState;
            // A node can never be its own anchor: this happens when dropping
            // just after a node's own immediate predecessor, since that
            // predecessor's "next sibling" is the node itself. It's already
            // in the requested position, so treat it as a no-op rather than
            // falling through to indexOf(beforeNodeId) below, which would
            // fail (the node is removed from the array first) and push the
            // node to the end instead of leaving it where it was.
            if (beforeNodeId === nodeId) return prevState;

            // Prevent moving a folder into itself or one of its own descendants.
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

            // Add to new parent — spliced in just ahead of beforeNodeId if
            // given and still present (post-removal), otherwise appended.
            if (newParentId && newTree[newParentId]) {
                const newParent = newTree[newParentId];
                const children = [...newParent.childrenIds];
                const insertAt = beforeNodeId ? children.indexOf(beforeNodeId) : -1;
                if (insertAt === -1) {
                    children.push(nodeId);
                } else {
                    children.splice(insertAt, 0, nodeId);
                }
                newTree[newParent.id] = { ...newParent, childrenIds: children };
            }

            // Update moved node's parentId
            newTree[nodeId] = { ...nodeToMove, parentId: newParentId };

            return { ...prevState, tree: newTree };
        });
    }, []);

    // Wholesale replace of the workspace, used to restore a backup. Callers
    // are responsible for confirming with the user first — this has no undo.
    const restoreFromBackup = useCallback((data: { tree: FileSystemTree; notes: NotesContent; images: Images }) => {
        setState(data);
    }, []);

    return { tree, notes, images, createNode, updateNote, renameNode, deleteNode, restoreNode, permanentlyDeleteNode, moveNode, addImage, restoreFromBackup, storageError, dismissStorageError: () => setStorageError(null) };
};