import { FileSystemTree, NotesContent } from '../types';

const escapeHtml = (text: string): string =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Walks a folder's subtree in sidebar order (childrenIds — the same order
// drag-and-drop reordering maintains) and concatenates every note's content
// into one combined document. Notes are inserted as-is with no synthesized
// title line: every note already starts with its own `#` heading (see
// createNode/getInitialFileSystem in useFileSystem.ts), so adding another
// one here would just duplicate it.
//
// Sub-folders (depth > 0 — the exported folder itself is depth 0 and never
// gets a heading line here, since its name is already shown on the PDF
// export's title page, see App.tsx's #print-only-content) become raw
// `<h2>`/`<h3>`/... elements carrying a `print-section-heading` class,
// rather than plain `#`/`##` Markdown syntax. That's deliberate: a folder
// heading needs to look visually distinct from a note's own (equally
// heading-level) title so a reader can tell "this starts a new note" from
// "this starts a new folder" at a glance — a plain Markdown heading has no
// way to carry that extra class, but marked passes raw HTML blocks through
// untouched (see MarkdownPreview.tsx), so this reaches the print stylesheet
// exactly as written.
const buildFolderMarkdown = (
    tree: FileSystemTree,
    notes: NotesContent,
    folderId: string,
    depth: number,
): string => {
    const folder = tree[folderId];
    if (!folder) return '';

    const parts: string[] = [];
    if (depth > 0) {
        const level = Math.min(depth + 1, 6);
        parts.push(`<h${level} class="print-section-heading">${escapeHtml(folder.name)}</h${level}>`);
    }
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
    // The folder's own name — used as the exported file's base name and as
    // the title shown on the PDF export's title page (see App.tsx).
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
    return { title: folder.name, markdown: buildFolderMarkdown(tree, notes, folderId, 0) };
};
