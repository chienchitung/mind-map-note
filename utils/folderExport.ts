import { FileSystemTree, NotesContent } from '../types';

// Walks a folder's subtree in sidebar order (childrenIds — the same order
// drag-and-drop reordering maintains) and concatenates every note's content
// into one combined document. Sub-folders become heading lines, one level
// deeper than their parent, so the combined document still shows the
// original structure. Notes are inserted as-is with no synthesized title
// line: every note already starts with its own `#` heading (see
// createNode/getInitialFileSystem in useFileSystem.ts), so adding another
// one here would just duplicate it.
const buildFolderMarkdown = (
    tree: FileSystemTree,
    notes: NotesContent,
    folderId: string,
    depth: number,
): string => {
    const folder = tree[folderId];
    if (!folder) return '';

    const parts: string[] = [`${'#'.repeat(Math.min(depth, 6))} ${folder.name}`];
    folder.childrenIds.forEach(childId => {
        const child = tree[childId];
        if (!child) return;
        if (child.type === 'folder') {
            const nested = buildFolderMarkdown(tree, notes, childId, depth + 1);
            if (nested) parts.push(nested);
        } else {
            const content = (notes[childId] ?? '').trim();
            if (content) parts.push(content);
        }
    });
    return parts.join('\n\n');
};

export interface FolderExportDocument {
    // The folder's own name — used as both the exported file's base name
    // and the document <title> swapped in during PDF export.
    title: string;
    markdown: string;
}

// Returns null for a missing node or one that isn't a folder — callers only
// ever invoke this from a folder's own context menu, but the tree can
// technically be stale by the time a click handler runs (e.g. the folder
// was deleted in the same tick), so this stays a soft no-op rather than a
// thrown error.
export const buildFolderExportDocument = (
    tree: FileSystemTree,
    notes: NotesContent,
    folderId: string,
): FolderExportDocument | null => {
    const folder = tree[folderId];
    if (!folder || folder.type !== 'folder') return null;
    return { title: folder.name, markdown: buildFolderMarkdown(tree, notes, folderId, 1) };
};
