import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ViewMode, MindMapNode, SearchResult, MindMapLayout } from './types';
import { useHistory } from './hooks/useHistory';
import { useFileSystem } from './hooks/useFileSystem';
import Header from './components/Header';
import Editor from './components/Editor';
import MindMap, { MindMapHandle } from './components/MindMap';
import OutlineView from './components/OutlineView';
import MarkdownPreview from './components/MarkdownPreview';
import HelpModal from './components/HelpModal';
import FileExplorer from './components/FileExplorer';
import { parseMarkdownToMindMap } from './utils/markdownParser';
import { mindMapToMarkdown } from './utils/markdownGenerator';

// Custom hook to debounce a value.
const useDebounce = <T,>(value: T, delay: number): T => {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);
        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);
    return debouncedValue;
};


const App: React.FC = () => {
  const { tree, notes, images, createNode, updateNote, renameNode, deleteNode, moveNode, addImage } = useFileSystem();
  
  const findFirstFile = () => {
      const root = tree['root'];
      if (!root) return null;
      const queue = [...root.childrenIds];
      while (queue.length > 0) {
        const nodeId = queue.shift()!;
        const node = tree[nodeId];
        if (node.type === 'file') return node.id;
        if (node.type === 'folder') {
            queue.push(...node.childrenIds);
        }
      }
      return null;
  };

  const [activeNoteId, setActiveNoteId] = useState<string | null>(findFirstFile);
  
  const activeNoteContent = useMemo(() => activeNoteId ? notes[activeNoteId] ?? '' : '', [notes, activeNoteId]);
  
  const {
    state: markdown,
    set: setMarkdown,
    undo,
    redo,
    canUndo,
    canRedo,
    reset: resetHistory,
  } = useHistory<string>(activeNoteContent);

  const debouncedMarkdown = useDebounce(markdown, 500);

  useEffect(() => {
    if (activeNoteId) {
      resetHistory(notes[activeNoteId] ?? '');
    }
  }, [activeNoteId]);
  
  useEffect(() => {
    if (activeNoteId && debouncedMarkdown !== (notes[activeNoteId] ?? '')) {
      updateNote(activeNoteId, debouncedMarkdown);
    }
  }, [debouncedMarkdown, activeNoteId]);

  
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Editor);
  const [mindMapLayout, setMindMapLayout] = useState<MindMapLayout>(MindMapLayout.MindMap);
  
  const [scrollToLine, setScrollToLine] = useState<number | null>(null);
  const [scrollToMatchIndex, setScrollToMatchIndex] = useState<number | null>(null);
  const [activeLine, setActiveLine] = useState<number>(0);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const mindMapRef = useRef<MindMapHandle>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeMatchIndex, setActiveMatchIndex] = useState<number | null>(null);

  const activeNoteName = activeNoteId ? tree[activeNoteId]?.name ?? '筆記' : '筆記';
  const mindMapData = useMemo(() => parseMarkdownToMindMap(markdown, activeNoteName), [markdown, activeNoteName]);

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

      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        if (!isEditing) {
          e.preventDefault();
          setIsHelpModalOpen(prev => !prev);
        }
      }
      
      if (e.metaKey || e.ctrlKey) {
          switch (e.key.toLowerCase()) {
              case '1': e.preventDefault(); setViewMode(ViewMode.Editor); break;
              case '2': e.preventDefault(); setViewMode(ViewMode.Preview); break;
              case '3': e.preventDefault(); setViewMode(ViewMode.MindMap); break;
              case 'f': e.preventDefault(); searchInputRef.current?.focus(); break;
              case 'z':
                  e.preventDefault();
                  if (e.shiftKey) { if (canRedo) redo(); } else { if (canUndo) undo(); }
                  break;
              case 'y': e.preventDefault(); if (canRedo) redo(); break;
          }
      }

      if (e.key === 'Escape') {
        if (isHelpModalOpen) setIsHelpModalOpen(false);
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
    a.download = `${activeNoteName}.md`;
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
        // This replacement is simple; it might fail if the old name appears multiple times.
        // A more robust solution would rebuild the line from the prefix, new name, and image URL if present.
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
    setSearchQuery('');
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
        activeNoteId={activeNoteId}
      />
      <div className="flex-grow flex overflow-hidden">
        <aside className="w-1/4 max-w-xs h-full border-r border-border-color flex-shrink-0">
          <FileExplorer 
            tree={tree}
            activeNoteId={activeNoteId}
            onSelectNote={setActiveNoteId}
            onCreateNode={createNode}
            onRenameNode={renameNode}
            onDeleteNode={deleteNode}
            onMoveNode={moveNode}
          />
        </aside>
        <main className="flex-grow flex overflow-hidden">
          {!activeNoteId ? (
              <div className="w-full h-full flex items-center justify-center text-text-secondary">
                請選擇一篇筆記或建立新筆記
              </div>
          ) : viewMode === ViewMode.Editor || viewMode === ViewMode.Preview ? (
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
                          onImagePasted={addImage}
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
                    <MarkdownPreview markdown={markdown} images={images} />
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
                      images={images}
                  />
              ) : <div className="text-center text-text-secondary">請在編輯器中新增內容以生成思維導圖。</div>}
            </div>
          )}
        </main>
      </div>
      <HelpModal isOpen={isHelpModalOpen} onClose={() => setIsHelpModalOpen(false)} />
    </div>
  );
};

export default App;