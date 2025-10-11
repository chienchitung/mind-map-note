import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ViewMode, MindMapNode, SearchResult, MindMapLayout } from './types';
import { useHistory } from './hooks/useHistory';
import Header from './components/Header';
import Editor from './components/Editor';
import MindMap, { MindMapHandle } from './components/MindMap';
import OutlineView from './components/OutlineView';
import MarkdownPreview from './components/MarkdownPreview';
import HelpModal from './components/HelpModal';
import { parseMarkdownToMindMap } from './utils/markdownParser';
import { mindMapToMarkdown } from './utils/markdownGenerator';

const initialMarkdown = `# 歡迎使用思維導圖筆記工具

## 核心理念
- **輕鬆寫作，自動成圖**：您只需專注於使用 Markdown 語法（如標題 '#' 和列表 '-'）來撰寫筆記，應用程式會自動將其轉換為結構化的思維導圖。
- **階層式結構**：透過標題層級和列表縮排，輕鬆建立複雜的思緒層次。

## 主要功能
### 三種檢視模式
- **編輯器 (⌘1)**
  - 這是您的主要工作區，一個純粹、無干擾的 Markdown 編輯環境。
- **預覽 (⌘2)**
  - 即時查看您的 Markdown 筆記渲染後的樣子。
- **思維導圖 (⌘3)**
  - 將您的筆記內容視覺化，一目了然地看到整體結構。

### 互動式思維導圖
- **節點編輯**
  - 在圖上雙擊任何節點即可直接修改其內容。
- **拖放重組**
  - 想要改變結構？只需拖放節點到新的父節點上即可。
- **展開與折疊**
  - 點擊節點旁的 +/- 按鈕，或選中節點後按 \`空白鍵\`，即可專注於特定分支。
- **鍵盤導航**
  - 使用 \`↑ ↓ ← →\` 箭頭鍵在節點之間快速移動。

### 實用工具
- **全文搜尋 (⌘F)**
  - 快速在您的筆記中找到任何關鍵字。
- **匯出功能**
  - 將您的筆記匯出為 \`.md\` 檔案。
  - 在思維導圖模式下，可以將圖表匯出為 \`.jpg\` 圖片。
- **復原與重做 (⌘Z / ⌘⇧Z)**
  - 不用擔心失誤，輕鬆返回上一步或重做。

## 開始使用
- **試著編輯看看！**
  - 直接修改這份文件，新增您自己的標題或列表項。
- **查看快捷鍵**
  - 按下 \`?\` 鍵可以打開快捷鍵說明，了解更多高效操作。

> 現在，開始您的第一次思維導圖筆記之旅吧！
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
  const [mindMapLayout, setMindMapLayout] = useState<MindMapLayout>(MindMapLayout.MindMap);
  
  const [scrollToLine, setScrollToLine] = useState<number | null>(null);
  const [scrollToMatchIndex, setScrollToMatchIndex] = useState<number | null>(null);
  const [activeLine, setActiveLine] = useState<number>(0);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const mindMapRef = useRef<MindMapHandle>(null);

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


  const handleExport = () => {
    if (viewMode === ViewMode.MindMap) {
      mindMapRef.current?.exportAsJPG();
      return;
    }

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
        mindMapLayout={mindMapLayout}
        onLayoutChange={setMindMapLayout}
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
                    ref={mindMapRef}
                    data={mindMapData}
                    layout={mindMapLayout}
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