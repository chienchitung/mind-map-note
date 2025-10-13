import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ViewMode, MindMapNode, MindMapLayout } from './types';
import { useHistory } from './hooks/useHistory';
import { useFileSystem } from './hooks/useFileSystem';
import useLocalStorage from './hooks/useLocalStorage';
import Header from './components/Header';
import Editor from './components/Editor';
import MindMap, { MindMapHandle } from './components/MindMap';
import OutlineView from './components/OutlineView';
import MarkdownPreview from './components/MarkdownPreview';
import HelpModal from './components/HelpModal';
import FileExplorer from './components/FileExplorer';
import AIPanel, { ChatMessage } from './components/AIPanel';
import { createChatSession } from './services/geminiChatService';
import { Chat } from '@google/genai';
import { parseMarkdownToMindMap } from './utils/markdownParser';
import { mindMapToMarkdown } from './utils/markdownGenerator';
import { ChevronDoubleRightIcon, ChevronDoubleLeftIcon } from './components/icons';

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
  const [theme, setTheme] = useLocalStorage<'light' | 'dark'>('theme', 'light');
  
  const [scrollToLine, setScrollToLine] = useState<number | null>(null);
  const [activeLine, setActiveLine] = useState<number>(0);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const mindMapRef = useRef<MindMapHandle>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [isFileExplorerCollapsed, setIsFileExplorerCollapsed] = useState(false);
  const [isOutlineViewCollapsed, setIsOutlineViewCollapsed] = useState(false);
  
  // State for the new AI Panel
  const [isAIPanelOpen, setIsAIPanelOpen] = useState(false);
  const [chatSession, setChatSession] = useState<Chat | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isAILoading, setIsAILoading] = useState(false);

  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const activeNoteName = activeNoteId ? tree[activeNoteId]?.name ?? '筆記' : '筆記';
  const mindMapData = useMemo(() => parseMarkdownToMindMap(markdown, activeNoteName), [markdown, activeNoteName]);

  const globalSearchResults = useMemo(() => {
    if (!debouncedSearchQuery.trim()) return [];

    const results: { id: string; name: string; snippet: string }[] = [];
    const SNIPPET_RADIUS = 50; // Characters before and after the match

    try {
      const query = debouncedSearchQuery.trim();
      const regex = new RegExp(query, 'gi');

      Object.keys(notes).forEach(noteId => {
        const content = notes[noteId];
        
        regex.lastIndex = 0;
        
        const match = regex.exec(content);

        if (match) {
          if (tree[noteId]) {
            const matchIndex = match.index;
            const start = Math.max(0, matchIndex - SNIPPET_RADIUS);
            const end = Math.min(
              content.length,
              matchIndex + match[0].length + SNIPPET_RADIUS
            );

            let snippet = content.substring(start, end).replace(/\n/g, ' ');

            if (start > 0) snippet = '... ' + snippet;
            if (end < content.length) snippet = snippet + ' ...';

            results.push({ id: noteId, name: tree[noteId].name, snippet });
          }
        }
      });
    } catch (e) {
      console.error('Search regex error:', e);
      return [];
    }
    return results;
  }, [debouncedSearchQuery, notes, tree]);


  useEffect(() => {
    const body = document.body;
    body.classList.remove('light', 'dark');
    body.classList.add(theme);
  }, [theme]);

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
        if (isAIPanelOpen) setIsAIPanelOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canUndo, canRedo, undo, redo, isHelpModalOpen, isAIPanelOpen]);

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
  
  const handleSearchResultClick = (noteId: string) => {
    setActiveNoteId(noteId);
    setSearchQuery('');
  };

  const handleToggleAIPanel = async () => {
    if (isAIPanelOpen) {
      setIsAIPanelOpen(false);
      return;
    }

    if (!activeNoteId || !markdown) return;
    
    // Only start a new session if one isn't already active for this note,
    // or if the note content has significantly changed. For simplicity,
    // we'll start a new one each time it's opened for now.
    setIsAIPanelOpen(true);
    setIsAILoading(true);
    setChatMessages([]);

    try {
      const session = await createChatSession(markdown);
      setChatSession(session);
      setChatMessages([{ role: 'model', text: `你好！我已經閱讀完 **${activeNoteName}** 的內容了。我可以協助你做什麼呢？試試看問我：\n\n- 幫我總結這份筆記\n- 根據筆記內容出幾道練習題\n- 用更簡單的方式解釋第二段` }]);
    } catch (error) {
      console.error("Failed to start chat session:", error);
      const errorMessage = error instanceof Error ? error.message : "無法啟動 AI 助理。";
      setChatMessages([{ role: 'model', text: `抱歉，發生錯誤：${errorMessage}` }]);
    } finally {
      setIsAILoading(false);
    }
  };

  const handleSendChatMessage = async (message: string) => {
    if (!chatSession || !message.trim()) return;

    const userMessage: ChatMessage = { role: 'user', text: message };
    setChatMessages(prev => [...prev, userMessage]);
    setIsAILoading(true);

    try {
      const response = await chatSession.sendMessage({ message });
      const modelMessage: ChatMessage = { role: 'model', text: response.text };
      setChatMessages(prev => [...prev, modelMessage]);
    } catch (error) {
      console.error("Chat error:", error);
      const errorMessage = error instanceof Error ? error.message : "我無法回覆。";
      const modelErrorMessage: ChatMessage = { role: 'model', text: `抱歉，發生錯誤： ${errorMessage}` };
      setChatMessages(prev => [...prev, modelErrorMessage]);
    } finally {
      setIsAILoading(false);
    }
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
        onClearSearch={() => setSearchQuery('')}
        results={globalSearchResults}
        onResultClick={handleSearchResultClick}
        onShowHelp={() => setIsHelpModalOpen(true)}
        searchInputRef={searchInputRef}
        activeNoteId={activeNoteId}
        theme={theme}
        onThemeChange={setTheme}
        onToggleAIPanel={handleToggleAIPanel}
        isAILoading={isAILoading && !isAIPanelOpen}
        isAIPanelOpen={isAIPanelOpen}
      />
      <div className="flex-grow flex overflow-hidden relative">
        {isFileExplorerCollapsed && (
            <button
                onClick={() => setIsFileExplorerCollapsed(false)}
                className="absolute top-1/2 -translate-y-1/2 left-0 z-20 p-1 h-16 rounded-r-lg bg-secondary hover:bg-border-color focus:outline-none text-text-secondary"
                title="展開檔案總管"
            >
                <ChevronDoubleRightIcon className="w-4 h-4" />
            </button>
        )}
        <aside className={`h-full flex-shrink-0 transition-all duration-300 ease-in-out ${isFileExplorerCollapsed ? 'w-0' : 'w-1/4 max-w-xs border-r border-border-color'}`}>
          <div className="h-full overflow-hidden">
            <FileExplorer 
              tree={tree}
              activeNoteId={activeNoteId}
              onSelectNote={setActiveNoteId}
              onCreateNode={createNode}
              onRenameNode={renameNode}
              onDeleteNode={deleteNode}
              onMoveNode={moveNode}
              onToggleCollapse={() => setIsFileExplorerCollapsed(true)}
            />
          </div>
        </aside>
        
        <main className="flex-grow flex overflow-hidden">
          {!activeNoteId ? (
              <div className="w-full h-full flex items-center justify-center text-text-secondary">
                請選擇一篇筆記或建立新筆記
              </div>
          ) : viewMode === ViewMode.Editor || viewMode === ViewMode.Preview ? (
            <div className="flex h-full w-full relative">
              {mindMapData && (
                <>
                  {isOutlineViewCollapsed && (
                    <button
                        onClick={() => setIsOutlineViewCollapsed(false)}
                        className="absolute top-1/2 -translate-y-1/2 left-0 z-20 p-1 h-16 rounded-r-lg bg-secondary hover:bg-border-color focus:outline-none text-text-secondary"
                        title="展開大綱"
                    >
                        <ChevronDoubleRightIcon className="w-4 h-4" />
                    </button>
                  )}
                  <aside className={`h-full flex-shrink-0 transition-all duration-300 ease-in-out ${isOutlineViewCollapsed ? 'w-0' : 'w-1/3 max-w-xs border-r border-border-color'}`}>
                    <div className="h-full overflow-hidden">
                      <OutlineView 
                        data={mindMapData}
                        activeLine={activeLine}
                        onNodeClick={handleOutlineNodeClick}
                        onToggleCollapse={() => setIsOutlineViewCollapsed(true)}
                      />
                    </div>
                  </aside>
                </>
              )}
              <div className={`flex-grow h-full ${viewMode === ViewMode.Preview ? 'w-1/2' : 'w-full'}`}>
                  <div className="p-4 md:p-6 lg:p-8 h-full">
                      <Editor 
                          value={markdown} 
                          onChange={setMarkdown}
                          onImagePasted={addImage}
                          scrollToLine={scrollToLine}
                          onScrollComplete={() => {
                            setScrollToLine(null)
                          }}
                          onCursorActivity={setActiveLine}
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
                      theme={theme}
                  />
              ) : <div className="text-center text-text-secondary">請在編輯器中新增內容以生成思維導圖。</div>}
            </div>
          )}
        </main>
        
        <aside className={`h-full flex-shrink-0 transition-all duration-300 ease-in-out ${isAIPanelOpen ? 'w-1/3 max-w-md border-l border-border-color' : 'w-0'}`}>
            <div className="h-full overflow-hidden">
                <AIPanel
                    onToggleCollapse={() => setIsAIPanelOpen(false)}
                    messages={chatMessages}
                    onSendMessage={handleSendChatMessage}
                    isLoading={isAILoading}
                    images={images}
                />
            </div>
        </aside>
        
        {!isAIPanelOpen && activeNoteId && (
            <button
                onClick={handleToggleAIPanel}
                className="absolute top-1/2 -translate-y-1/2 right-0 z-20 p-1 h-16 rounded-l-lg bg-secondary hover:bg-border-color focus:outline-none text-text-secondary"
                title="展開 AI 學習夥伴"
            >
                <ChevronDoubleLeftIcon className="w-4 h-4" />
            </button>
        )}

      </div>
      <HelpModal isOpen={isHelpModalOpen} onClose={() => setIsHelpModalOpen(false)} />
    </div>
  );
};

export default App;
