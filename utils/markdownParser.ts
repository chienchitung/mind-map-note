import { MindMapNode } from '../types';

/**
 * Strips common inline Markdown syntax (bold, italic, strikethrough, inline
 * code, links) for display in compact UI surfaces — the mind map canvas and
 * outline sidebar — that render node labels as plain text rather than
 * running them through a Markdown renderer. Bold must be stripped before
 * italic so a leftover single `*`/`_` from an already-consumed `**`/`__`
 * pair isn't mistaken for italic markup.
 */
export const stripInlineMarkdown = (text: string): string => {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`([^`]+?)`/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/(?<![A-Za-z0-9])_(.+?)_(?![A-Za-z0-9])/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
};

/**
 * Determines the hierarchical level and content of a given line of markdown.
 * @param line The markdown line to parse.
 * @returns An object with level, name, and prefix, or null if not a valid node.
 */
const getLineInfo = (line: string): { level: number; name: string; prefix: string } | null => {
  // Match headings like #, ##, etc.
  const headingMatch = line.match(/^(#+)\s+(.*)/);
  if (headingMatch && headingMatch[2].trim()) {
    return {
      level: headingMatch[1].length, // Level is the number of '#'
      name: headingMatch[2].trim(),
      prefix: `${headingMatch[1]} `,
    };
  }

  // Match list items like -, *, +
  const listItemMatch = line.match(/^(\s*)(-|\*|\+)\s+(.*)/);
  if (listItemMatch && listItemMatch[3].trim()) {
    const indent = Math.floor(listItemMatch[1].length / 2);
    // To avoid conflicts with heading levels (1-6), we assign list items
    // a higher base level. Each indent increases the level.
    return {
      level: 10 + indent,
      name: listItemMatch[3].trim(),
      prefix: `${listItemMatch[1]}${listItemMatch[2]} `,
    };
  }

  return null;
};

// Matches a fenced code block delimiter (``` or ~~~, any indent). Lines
// inside a fence must never be parsed as headings/list items — e.g. a code
// comment that happens to start with "#" — and must be preserved
// byte-for-byte (including the fence markers) as trailing content on
// whichever node precedes the block.
const FENCE_REGEX = /^(\s*)(`{3,}|~{3,})/;

// Builds a stable, content-independent id for a node from its position among
// siblings (e.g. "0/2/1") rather than its line number and text, so
// collapse/selection state in the mind map survives renames and edits
// elsewhere in the document that shift line numbers without moving the node.
const buildPathId = (parentPathId: string, siblingIndex: number): string =>
  parentPathId ? `${parentPathId}/${siblingIndex}` : `${siblingIndex}`;

export const parseMarkdownToMindMap = (markdown: string, noteName: string): MindMapNode | null => {
  const lines = markdown.split('\n');
  if (lines.every(line => line.trim() === '')) {
    return {
        id: 'root-empty',
        name: noteName,
        children: [],
        level: 0,
        lineNumber: -1,
        originalLine: '',
        prefix: '',
    };
  }

  const root: MindMapNode = {
    id: 'root',
    name: noteName,
    children: [],
    level: 0, // The virtual root is at level 0
    lineNumber: -1,
    originalLine: '',
    prefix: '',
  };

  const path: MindMapNode[] = [root];
  // How many children each still-open ancestor has produced so far, keyed by
  // that ancestor's own path id — used to assign each new node's path id.
  const childCounts = new Map<string, number>();
  let lastNode: MindMapNode = root;
  let inFence = false;
  let fenceMarker = '';
  const pendingContentLines: string[] = [];

  const flushPendingContent = () => {
    if (pendingContentLines.length === 0) return;
    const joined = pendingContentLines.join('\n');
    lastNode.trailingContent = lastNode.trailingContent
      ? `${lastNode.trailingContent}\n${joined}`
      : joined;
    pendingContentLines.length = 0;
  };

  const imageRegex = /!\[(.*?)\]\((.*?)\)/;

  lines.forEach((line, index) => {
    const fenceMatch = line.match(FENCE_REGEX);
    if (fenceMatch) {
      if (!inFence) {
        inFence = true;
        fenceMarker = fenceMatch[2][0];
      } else if (fenceMatch[2][0] === fenceMarker) {
        inFence = false;
      }
      pendingContentLines.push(line);
      return;
    }

    if (inFence) {
      pendingContentLines.push(line);
      return;
    }

    const lineInfo = getLineInfo(line);

    if (!lineInfo) {
      pendingContentLines.push(line);
      return;
    }

    // A real heading/list line starts — whatever plain content had been
    // accumulating belongs to the *previous* node, not this new one.
    flushPendingContent();

    let { level, name, prefix } = lineInfo;
    let imageUrl: string | undefined = undefined;

    const imageMatch = name.match(imageRegex);

    if (imageMatch) {
        imageUrl = imageMatch[2];
        name = name.replace(imageRegex, '').trim();
        if (!name) {
            name = imageMatch[1] || 'Image'; // Use alt text if no other text
        }
    }

    // Traverse up the path to find the correct parent. The parent's level
    // must be less than the new node's level. This correctly handles
    // cases like an H1 appearing after an H2.
    while (path.length > 1 && path[path.length - 1].level >= level) {
        path.pop();
    }

    const parent = path[path.length - 1];
    const siblingIndex = childCounts.get(parent.id) ?? 0;
    childCounts.set(parent.id, siblingIndex + 1);

    const newNode: MindMapNode = {
        name,
        children: [],
        id: buildPathId(parent.id === 'root' ? '' : parent.id, siblingIndex),
        lineNumber: index,
        originalLine: line,
        level: level,
        prefix: prefix,
        imageUrl,
    };

    parent.children = parent.children || [];
    parent.children.push(newNode);
    path.push(newNode);
    lastNode = newNode;
  });

  flushPendingContent();

  if (root.children.length === 0) {
     return root; // Return the root with the note's name if no parsable content
  }

  // If there's only one top-level node and there's no leading preamble to
  // preserve, collapse straight to it for a cleaner view (unchanged from
  // before). If there *is* leading content, keep the wrapping root so that
  // content isn't silently lost on the next structural regeneration.
  if (root.children.length === 1 && !root.trailingContent) {
    return root.children[0];
  }

  // If there are multiple top-level nodes, return the virtual root that holds them.
  return root;
};

/**
 * Flattens a MindMapNode tree into the ordered list of real nodes it
 * contains — depth-first, parent before children, same order OutlineView
 * renders them in. Excludes the synthetic virtual root (lineNumber -1,
 * used only to wrap multiple top-level headings/leading content), which
 * isn't an addressable block in the document.
 */
export const flattenMindMapNodes = (node: MindMapNode): MindMapNode[] => {
  const result: MindMapNode[] = [];
  const visit = (n: MindMapNode) => {
    if (n.lineNumber >= 0) result.push(n);
    (n.children ?? []).forEach(visit);
  };
  visit(node);
  return result;
};

/**
 * Finds a node's position among all headings/list-items in the document
 * (depth-first, document order) — this ordinal is what lets a completely
 * different rendering of the same Markdown (TipTap's rich-text editor,
 * the HTML preview) locate "the same block": each independently counts its
 * own headings/list-items in its own document order and jumps to whichever
 * one sits at this same position, without needing to share a parser.
 */
export const findBlockOrdinal = (root: MindMapNode, targetLineNumber: number): number | null => {
  if (targetLineNumber < 0) return null;
  const index = flattenMindMapNodes(root).findIndex(n => n.lineNumber === targetLineNumber);
  return index === -1 ? null : index;
};