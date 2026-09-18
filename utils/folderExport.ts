import JSZip from 'jszip';
import { FileSystemTree, NotesContent } from '../types';
import { sanitizeFilename } from './downloadBlob';

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

// Returns a unique name for `base` within one zip directory's listing —
// JSZip silently accepts two entries at the same path (most unzip tools
// then only ever surface one of them), and the sidebar itself allows two
// notes/folders at the same level to share a display name, so a repeat
// here gets " (2)", " (3)", etc. appended rather than clobbering the
// earlier entry.
const dedupeZipName = (base: string, usedNames: Set<string>): string => {
    if (!usedNames.has(base)) {
        usedNames.add(base);
        return base;
    }
    let counter = 2;
    let candidate = `${base} (${counter})`;
    while (usedNames.has(candidate)) {
        counter += 1;
        candidate = `${base} (${counter})`;
    }
    usedNames.add(candidate);
    return candidate;
};

// Mirrors the sidebar's folder hierarchy as real zip directories, one .md
// file per note — unlike buildFolderMarkdown's combined-document mode, a
// sub-folder doesn't need any special heading treatment here: a real
// folder in the extracted archive already makes the structure obvious.
const addFolderToZip = (
    zip: JSZip,
    tree: FileSystemTree,
    notes: NotesContent,
    folderId: string,
): void => {
    const folder = tree[folderId];
    if (!folder) return;
    const usedNames = new Set<string>();
    folder.childrenIds.forEach(childId => {
        const child = tree[childId];
        if (!child) return;
        if (child.type === 'folder') {
            const dirName = dedupeZipName(sanitizeFilename(child.name), usedNames);
            const subZip = zip.folder(dirName);
            if (subZip) addFolderToZip(subZip, tree, notes, childId);
        } else {
            const fileName = `${dedupeZipName(sanitizeFilename(child.name), usedNames)}.md`;
            zip.file(fileName, notes[childId] ?? '');
        }
    });
};

export interface FolderExportArchive {
    // The folder's own name — used as the exported .zip's base filename.
    title: string;
    blob: Blob;
}

// Alternative to buildFolderExportDocument: instead of one combined
// Markdown file, packages every note under `folder` as its own .md file
// inside a .zip, preserving the folder structure.
export const buildFolderExportZip = async (
    tree: FileSystemTree,
    notes: NotesContent,
    folderId: string,
): Promise<FolderExportArchive | null> => {
    const folder = tree[folderId];
    if (!folder || folder.type !== 'folder') return null;
    const zip = new JSZip();
    const root = zip.folder(sanitizeFilename(folder.name)) ?? zip;
    addFolderToZip(root, tree, notes, folderId);
    const blob = await zip.generateAsync({ type: 'blob' });
    return { title: folder.name, blob };
};
