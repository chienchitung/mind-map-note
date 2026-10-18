import { FileSystemTree, NotesContent, Images } from '../types';

export interface BackupData {
  tree: FileSystemTree;
  notes: NotesContent;
  images: Images;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Checks a parsed backup file's shape before it replaces everything in the
 * app. A restored backup is saved straight to storage and loaded on every
 * start, so a damaged or hand-edited file that slipped through (no root
 * folder, a malformed node, a note that isn't text) would break
 * the app on every load, not just once. Returns null when the file can't be
 * used as a backup.
 */
export const parseBackup = (data: unknown): BackupData | null => {
  if (!isPlainObject(data) || !isPlainObject(data.tree) || !isPlainObject(data.notes)) return null;
  const tree = data.tree;

  const root = tree.root;
  if (!isPlainObject(root) || root.type !== 'folder' || root.parentId !== null) return null;

  for (const [id, node] of Object.entries(tree)) {
    if (!isPlainObject(node) || node.id !== id || typeof node.name !== 'string') return null;
    if (node.type !== 'file' && node.type !== 'folder') return null;
    // Types only, not whether every id still resolves: a trashed note can
    // outlive its parent folder, and the app already skips a missing child.
    if (node.parentId !== null && typeof node.parentId !== 'string') return null;
    if (!Array.isArray(node.childrenIds) || !node.childrenIds.every(childId => typeof childId === 'string')) return null;
  }

  if (!Object.values(data.notes).every(content => typeof content === 'string')) return null;

  // Images are optional; anything that isn't an image data URL is dropped
  // rather than failing the whole restore.
  const images: Images = {};
  if (isPlainObject(data.images)) {
    for (const [id, dataUrl] of Object.entries(data.images)) {
      if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/')) images[id] = dataUrl;
    }
  }

  return { tree: tree as unknown as FileSystemTree, notes: data.notes as NotesContent, images };
};
