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