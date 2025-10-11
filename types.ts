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

export interface MindMapNode {
  id: string;
  name: string;
  children?: MindMapNode[];
  lineNumber: number;
  originalLine: string;
  level: number; // The calculated hierarchy level
  prefix: string; // The original markdown prefix (e.g., "## ", "  - ")
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