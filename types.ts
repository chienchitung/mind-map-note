// types.ts
export enum ViewMode {
  Editor = 'EDITOR',
  MindMap = 'MIND_MAP',
  Preview = 'PREVIEW',
}

export enum MindMapLayout {
  MindMap = 'MIND_MAP',           // Two-sided horizontal from the center
  Logic = 'LOGIC',               // Standard horizontal from left to right
  Organizational = 'ORGANIZATIONAL', // Vertical from top to bottom
}

export interface FileSystemNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  parentId: string | null;
  childrenIds: string[];
}

export interface FileSystemTree {
  [id:string]: FileSystemNode;
}

export interface NotesContent {
  [id: string]: string;
}

export interface Images {
  [id: string]: string; // id -> base64 data URL
}


export interface MindMapNode {
  id: string;
  name: string;
  children?: MindMapNode[];
  lineNumber: number;
  originalLine: string;
  level: number; // The calculated hierarchy level
  prefix: string; // The original markdown prefix (e.g., "## ", "  - ")
  imageUrl?: string;
  // Raw markdown lines that followed this node's own line in the source
  // document, up to (but not including) the next heading/list line —
  // paragraphs, blockquotes, tables, code fences, standalone images, blank
  // lines. Preserved verbatim so structural edits (drag-and-drop reparent
  // in the mind map) regenerate this content instead of silently dropping
  // it. For the synthetic virtual root, holds any leading content that
  // appeared before the first heading/list line in the whole document.
  trailingContent?: string;
  // For D3
  x0?: number;
  y0?: number;
  // For custom layouts
  side?: 'left' | 'right';
}

export interface SearchResult {
    startIndex: number;
    endIndex: number;
}

export interface SearchResultItem {
    id: string;
    name: string;
    snippet: string;
    // Ancestor folder names joined with " / ", e.g. "工作 / 專案A" — empty
    // string for a note that lives directly at the root. Lets a result
    // list disambiguate notes that share a name in different folders.
    path: string;
}