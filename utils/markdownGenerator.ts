import { MindMapNode } from '../types';

// `parentHeadingLevel` and `parentListIndent` are tracked independently
// rather than as a single shared "level", since a list nested directly under
// a heading starts a fresh indent run (0), not one relative to the heading's
// own numeric level — and vice versa, a heading's # count is unrelated to
// how deep any list above it happened to be indented.
const generateNodeMarkdown = (node: MindMapNode, parentHeadingLevel: number, parentListIndent: number): string => {
    const markdownLines: string[] = [];

    const isHeading = node.prefix.trim().startsWith('#');
    let currentPrefix: string;
    let newHeadingLevel = parentHeadingLevel;
    let newListIndent = parentListIndent;

    if (isHeading) {
        newHeadingLevel = Math.min(6, Math.max(1, parentHeadingLevel + 1));
        newListIndent = -1; // a list directly under this heading starts a fresh, unindented run
        currentPrefix = `${'#'.repeat(newHeadingLevel)} `;
    } else {
        newListIndent = parentListIndent + 1;
        const indent = '  '.repeat(Math.max(0, newListIndent));
        const bullet = (node.prefix.trim().match(/^[-*+]/) || ['-'])[0];
        currentPrefix = `${indent}${bullet} `;
    }

    markdownLines.push(`${currentPrefix}${node.name}`);
    // A captured trailing blank-line separator is an empty string, which is
    // falsy but still meaningful — check presence, not truthiness.
    if (node.trailingContent !== undefined) {
        markdownLines.push(node.trailingContent);
    }

    if (node.children) {
        node.children.forEach(child => {
            markdownLines.push(generateNodeMarkdown(child, newHeadingLevel, newListIndent));
        });
    }

    return markdownLines.join('\n');
};

export const mindMapToMarkdown = (rootNode: MindMapNode | null): string => {
    if (!rootNode) return '';

    // The synthetic virtual root (used only when the source document had
    // zero or multiple top-level heading/list nodes) has no real markdown
    // line of its own — regenerating it as a literal "# <note name>" heading
    // would inject a heading that never existed in the original document.
    // Skip straight to its children (as fresh top-level nodes) instead, and
    // re-emit any leading content that preceded the first heading/list line.
    if (rootNode.id === 'root') {
        const lines: string[] = [];
        if (rootNode.trailingContent !== undefined) lines.push(rootNode.trailingContent);
        (rootNode.children || []).forEach(child => {
            lines.push(generateNodeMarkdown(child, 0, -1));
        });
        return lines.join('\n');
    }

    return generateNodeMarkdown(rootNode, 0, -1);
};