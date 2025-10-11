import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ViewMode, MindMapNode, SearchResult } from './types';
import { useHistory } from './hooks/useHistory';
import Header from './components/Header';
import Editor from './components/Editor';
import MindMap from './components/MindMap';
import OutlineView from './components/OutlineView';
import MarkdownPreview from './components/MarkdownPreview';
import HelpModal from './components/HelpModal';
import { parseMarkdownToMindMap } from './utils/markdownParser';
import { mindMapToMarkdown } from './utils/markdownGenerator';

const initialMarkdown = `# 思維導讀筆記工具

## 核心功能
- Markdown 編輯器
- 自動生成思維導圖
- 本地實時保存
- 導入/導出筆記

## 如何使用
1. 在此編輯器中撰寫您的筆記。
2. 使用 Markdown 的標題語法 (##, ###) 和列表來組織結構。
3. 點擊上方的 "思維導圖" 圖標切換視圖。
4. 您的筆記將會被自動轉換為一個可視化的思維導圖。
`;

const App: React.FC = () => {
  const {
    state: markdown,
    set: setMarkdown,
    undo,
    redo,
    canUndo,
    canRedo,
    clear: clearHistory,
  } = useHistory<string>('mind-map-notes', initialMarkdown);
  
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Editor);
  const [error, setError] = useState<string | null>(null);
  
  const [scrollToLine, setScrollToLine] = useState<number | null>(null);
  const [scrollToMatchIndex, setScrollToMatchIndex] = useState<number | null>(null);
  const [activeLine, setActiveLine] = useState<number>(0);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMatchIndex, setActiveMatchIndex] = useState<number | null>(null);

  const mindMapData = useMemo(() => parseMarkdownToMindMap(markdown), [markdown]);

  const searchResults = useMemo((): SearchResult[] => {
    if (!searchQuery) return [];
    const results: SearchResult[] = [];
    try {
      const regex = new RegExp(searchQuery, 'gi');
      let match;
      while ((match = regex.exec(markdown)) !== null) {
        results.push({ startIndex: match.index, endIndex: match.index + match[0].length });
      }
    } catch (e) {
      // Invalid regex, return no results
      return [];
    }
    return results;
  }, [markdown, searchQuery]);

  useEffect(() => {
    if (searchResults.length > 0) {
        setActiveMatchIndex(0);
        setScrollToMatchIndex(0);
    } else {
        setActiveMatchIndex(null);
    }
  }, [searchResults]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isEditing = 
        e.target instanceof HTMLInputElement || 
        e.target instanceof HTMLTextAreaElement || 
        (e.target instanceof HTMLElement && e.target.isContentEditable);

      // Help Modal Toggle
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        if (!isEditing) {
          e.preventDefault();
          setIsHelpModalOpen(prev => !prev);
        }
      }
      
      // Global shortcuts with Ctrl/Cmd
      if (e.metaKey || e.ctrlKey) {
          switch (e.key.toLowerCase()) {
              case '1':
                  e.preventDefault();
                  setViewMode(ViewMode.Editor);
                  break;
              case '2':
                  e.preventDefault();
                  setViewMode(ViewMode.Preview);
                  break;
              case '3':
                  e.preventDefault();
                  setViewMode(ViewMode.MindMap);
                  break;
              case 'f':
                  e.preventDefault();
                  searchInputRef.current?.focus();
                  break;
              case 'z':
                  e.preventDefault();
                  if (e.shiftKey) {
                      if (canRedo) redo();
                  } else {
                      if (canUndo) undo();
                  }
                  break;
              case 'y': // Redo for Windows
                  e.preventDefault();
                  if (canRedo) redo();
                  break;
          }
      }

      // Escape key
      if (e.key === 'Escape') {
        if (isHelpModalOpen) {
          setIsHelpModalOpen(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canUndo, canRedo, undo, redo, isHelpModalOpen]);

  useEffect(() => {
    if (viewMode === ViewMode.MindMap && mindMapData) {
        setSelectedNodeId(mindMapData.id);
    } else {
        setSelectedNodeId(null);
    }
  }, [viewMode, mindMapData]);


  const handleImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setMarkdown(text);
      clearHistory();
      setViewMode(ViewMode.Editor);
      setError(null);
    };
    reader.onerror = () => {
        setError("讀取文件失敗。");
    }
    reader.readAsText(file);
  };

  const handleExport = () => {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'notes.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleNodeUpdate = (nodeId: string, newName: string) => {
    if (!mindMapData) return;

    const findNode = (node: MindMapNode, id: string): MindMapNode | null => {
        if (node.id === id) return node;
        if (node.children) {
            for (const child of node.children) {
                const found = findNode(child, id);
                if (found) return found;
            }
        }
        return null;
    };

    const targetNode = findNode(mindMapData, nodeId);
    
    if (targetNode && targetNode.name !== newName && newName.trim() !== '') {
        const lines = markdown.split('\n');
        const originalLine = targetNode.originalLine;
        const updatedLine = originalLine.replace(targetNode.name, newName.trim());
        lines[targetNode.lineNumber] = updatedLine;
        setMarkdown(lines.join('\n'));
    }
  };
  
  const handleStructureUpdate = (newRootNode: MindMapNode) => {
    const newMarkdown = mindMapToMarkdown(newRootNode);
    setMarkdown(newMarkdown);
  };
  
  const handleOutlineNodeClick = (lineNumber: number) => {
    setScrollToLine(lineNumber);
    setSearchQuery(''); // Clear search when navigating from outline
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setActiveMatchIndex(null);
  };

  const handleNextMatch = () => {
    if (searchResults.length === 0) return;
    const nextIndex = activeMatchIndex === null || activeMatchIndex === searchResults.length - 1 ? 0 : activeMatchIndex + 1;
    setActiveMatchIndex(nextIndex);
    setScrollToMatchIndex(nextIndex);
  };

  const handlePrevMatch = () => {
    if (searchResults.length === 0) return;
    const prevIndex = activeMatchIndex === null || activeMatchIndex === 0 ? searchResults.length - 1 : activeMatchIndex - 1;
    setActiveMatchIndex(prevIndex);
    setScrollToMatchIndex(prevIndex);
  };

  return (
    <div className="flex flex-col h-screen font-sans bg-primary">
      <Header
        viewMode={viewMode}
        onViewChange={setViewMode}
        onImport={handleImport}
        onExport={handleExport}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        onNextMatch={handleNextMatch}
        onPrevMatch={handlePrevMatch}
        onClearSearch={handleClearSearch}
        searchMatchCount={searchResults.length}
        activeMatchIndex={activeMatchIndex}
        onShowHelp={() => setIsHelpModalOpen(true)}
        searchInputRef={searchInputRef}
      />
      <main className="flex-grow flex overflow-hidden">
        {error && (
            <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-red-500 text-white p-3 rounded-lg shadow-lg z-50">
                <p>{error}</p>
                <button onClick={() => setError(null)} className="absolute top-1 right-2 text-white font-bold">&times;</button>
            </div>
        )}
        {viewMode === ViewMode.Editor || viewMode === ViewMode.Preview ? (
          <div className="flex h-full w-full">
            {mindMapData && (
              <aside className="w-1/3 max-w-xs h-full overflow-y-auto p-4 border-r border-border-color flex-shrink-0">
                <OutlineView 
                  data={mindMapData}
                  activeLine={activeLine}
                  onNodeClick={handleOutlineNodeClick}
                />
              </aside>
            )}
            <div className={`flex-grow h-full ${viewMode === ViewMode.Preview ? 'w-1/2' : 'w-full'}`}>
                <div className="p-4 md:p-6 lg:p-8 h-full">
                    <Editor 
                        value={markdown} 
                        onChange={setMarkdown}
                        scrollToLine={scrollToLine}
                        scrollToMatchIndex={scrollToMatchIndex}
                        onScrollComplete={() => {
                        setScrollToLine(null)
                        setScrollToMatchIndex(null)
                        }}
                        onCursorActivity={setActiveLine}
                        searchQuery={searchQuery}
                        searchResults={searchResults}
                        activeMatchIndex={activeMatchIndex}
                    />
                </div>
            </div>
            {viewMode === ViewMode.Preview && (
                <div className="flex-grow w-1/2 h-full p-4 md:p-6 lg:p-8 overflow-y-auto border-l border-border-color">
                   <MarkdownPreview markdown={markdown} />
                </div>
            )}
          </div>
        ) : (
          <div className="p-4 md:p-6 lg:p-8 h-full w-full">
            {mindMapData ? (
                <MindMap 
                    data={mindMapData} 
                    onNodeUpdate={handleNodeUpdate} 
                    onStructureUpdate={handleStructureUpdate}
                    selectedNodeId={selectedNodeId}
                    setSelectedNodeId={setSelectedNodeId}
                />
            ) : <div className="text-center text-text-secondary">請在編輯器中新增內容以生成思維導圖。</div>}
          </div>
        )}
      </main>
      <HelpModal isOpen={isHelpModalOpen} onClose={() => setIsHelpModalOpen(false)} />
    </div>
  );
};

export default App;
