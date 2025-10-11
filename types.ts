// types.ts
export enum ViewMode {
  Editor = 'EDITOR',
  MindMap = 'MIND_MAP',
  Preview = 'PREVIEW',
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
}

export interface SearchResult {
    startIndex: number;
    endIndex: number;
}