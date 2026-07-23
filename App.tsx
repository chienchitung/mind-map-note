import React, { useState, useMemo, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import { ViewMode, MindMapNode, MindMapLayout, FileSystemTree, NotesContent, Images } from './types';
import { useHistory } from './hooks/useHistory';
import { useFileSystem } from './hooks/useFileSystem';
import useLocalStorage from './hooks/useLocalStorage';
import { useIsMobile } from './hooks/useMediaQuery';
import Header from './components/Header';
import Editor from './components/Editor';
import MindMap, { MindMapHandle } from './components/MindMap';
import MarkdownPreview from './components/MarkdownPreview';
import HelpModal from './components/HelpModal';
import Sidebar from './components/Sidebar';
import type { ChatMessage } from './components/AIPanel';
import SettingsModal from './components/SettingsModal';
import Toast from './components/Toast';
import Spinner from './components/Spinner';
import type { Chat } from '@google/genai';
import { parseMarkdownToMindMap } from './utils/markdownParser';
import { mindMapToMarkdown } from './utils/markdownGenerator';
import { escapeRegExp } from './utils/escapeRegExp';

// The AI chat panel (and the @google/genai SDK it pulls in) is only ever
// needed once a user with an API key opens it, so it's loaded on demand
// instead of padding out everyone's initial bundle.
const AIPanel = lazy(() => import('./components/AIPanel'));

// Identifies exported workspace backup files so imports can sanity-check
// they're not some unrelated JSON file.
const BACKUP_APP_ID = 'mind-map-note';
const BACKUP_VERSION = 1;

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
  const { tree, notes, images, createNode, updateNote, renameNode, deleteNode, moveNode, addImage, restoreFromBackup, storageError, dismissStorageError } = useFileSystem();
  
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

  // The last-opened note is remembered across reloads (and validated against
  // the current tree, in case it was since deleted or storage was cleared).
  const [persistedActiveNoteId, setPersistedActiveNoteId] = useLocalStorage<string | null>('mind-map-last-active-note-id', null);

  const [activeNoteId, setActiveNoteIdState] = useState<string | null>(() => {
    if (persistedActiveNoteId && tree[persistedActiveNoteId]?.type === 'file') {
      return persistedActiveNoteId;
    }
    return findFirstFile();
  });

  const setActiveNoteId = useCallback((id: string | null) => {
    setActiveNoteIdState(id);
    setPersistedActiveNoteId(id);
  }, [setPersistedActiveNoteId]);

  // If the active note disappears (deleted from another view), fall back to another file.
  useEffect(() => {
    if (activeNoteId && !tree[activeNoteId]) {
      setActiveNoteId(findFirstFile());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, activeNoteId]);

  const activeNoteContent = useMemo(() => activeNoteId ? notes[activeNoteId] ?? '' : '', [notes, activeNoteId]);

  // `markdown` is the live text bound to the editor/mind map and updates on every
  // keystroke. Undo/redo history and localStorage persistence only record a new
  // snapshot once typing settles (see the debounced effect below) instead of once
  // per keystroke, so the undo stack stays meaningful and writes stay cheap.
  const [markdown, setMarkdown] = useState<string>(activeNoteContent);
  const markdownRef = useRef(markdown);
  useEffect(() => { markdownRef.current = markdown; }, [markdown]);

  const {
    state: committedMarkdown,
    set: commitMarkdown,
    undo,
    redo,
    canUndo,
    canRedo,
    reset: resetHistory,
  } = useHistory<string>(activeNoteContent);

  const debouncedMarkdown = useDebounce(markdown, 500);

  useEffect(() => {
    const noteId = activeNoteId;
    const content = noteId ? notes[noteId] ?? '' : '';
    setMarkdown(content);
    resetHistory(content);

    return () => {
      // Flush any edits to the outgoing note that hadn't been persisted yet
      // (typed within the last debounce window right before switching away).
      if (noteId && markdownRef.current !== (notes[noteId] ?? '')) {
        updateNote(noteId, markdownRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNoteId]);

  // Commit a history snapshot and persist to storage once typing settles.
  // Deliberately depends only on `debouncedMarkdown` (not `activeNoteId`) so a
  // note switch can never fire this with a stale, not-yet-updated debounce value.
  useEffect(() => {
    const noteId = activeNoteId;
    if (!noteId) return;
    if (debouncedMarkdown !== committedMarkdown) {
      commitMarkdown(debouncedMarkdown);
    }
    if (debouncedMarkdown !== (notes[noteId] ?? '')) {
      updateNote(noteId, debouncedMarkdown);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedMarkdown]);

  // Undo/redo moves the committed snapshot; mirror it back into the live editor text.
  useEffect(() => {
    setMarkdown(committedMarkdown);
  }, [committedMarkdown]);

  // Discrete, already-atomic edits (renaming a node, dragging to reparent in the
  // mind map) should land in undo history immediately rather than waiting for
  // the typing-pause debounce used for continuous keystrokes.
  const commitMarkdownNow = useCallback((newMarkdown: string) => {
    setMarkdown(newMarkdown);
    commitMarkdown(newMarkdown);
  }, [commitMarkdown]);


  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Editor);
  const [mindMapLayout, setMindMapLayout] = useState<MindMapLayout>(MindMapLayout.MindMap);
  const [theme, setTheme] = useLocalStorage<'light' | 'dark'>('theme', 'light');
  
  const [scrollToLine, setScrollToLine] = useState<number | null>(null);
  const [activeLine, setActiveLine] = useState<number>(0);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [apiKey, setApiKey] = useLocalStorage<string>('gemini-api-key', '');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Transient confirmation/error feedback (e.g. backup exported/imported),
  // distinct from storageError which persists until the underlying problem
  // is resolved.
  const [actionMessage, setActionMessage] = useState<{ text: string; variant: 'success' | 'warning' } | null>(null);
  useEffect(() => {
    if (!actionMessage) return;
    const timeoutId = setTimeout(() => setActionMessage(null), 5000);
    return () => clearTimeout(timeoutId);
  }, [actionMessage]);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const mindMapRef = useRef<MindMapHandle>(null);

  const [searchQuery, setSearchQuery] = useState('');

  // The file explorer + outline sidebar is one unified panel now. Its open
  // state is remembered on desktop (where it sits inline next to the
  // content); on mobile it's a full-screen drawer that always starts closed
  // so it doesn't eat the whole screen on load.
  const isMobile = useIsMobile();
  const [isSidebarOpenDesktop, setIsSidebarOpenDesktop] = useLocalStorage<boolean>('mind-map-sidebar-open', true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const isSidebarVisible = isMobile ? isMobileSidebarOpen : isSidebarOpenDesktop;
  const toggleSidebar = useCallback(() => {
    if (isMobile) setIsMobileSidebarOpen(prev => !prev);
    else setIsSidebarOpenDesktop(prev => !prev);
  }, [isMobile, setIsSidebarOpenDesktop]);
  const closeSidebar = useCallback(() => {
    if (isMobile) setIsMobileSidebarOpen(false);
    else setIsSidebarOpenDesktop(false);
  }, [isMobile, setIsSidebarOpenDesktop]);

  // State for the new AI Panel
  const [isAIPanelOpen, setIsAIPanelOpen] = useState(false);
  const [chatSession, setChatSession] = useState<Chat | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isAILoading, setIsAILoading] = useState(false);
  // On desktop the panel stays mounted (width just collapses to 0) so its
  // open/close slide animates — but mounting it unconditionally from the
  // start would trigger the lazy AIPanel chunk immediately for everyone.
  // Only start mounting it once the user has actually opened it.
  const [hasOpenedAIPanel, setHasOpenedAIPanel] = useState(false);
  useEffect(() => {
    if (isAIPanelOpen) setHasOpenedAIPanel(true);
  }, [isAIPanelOpen]);

  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const activeNoteName = activeNoteId ? tree[activeNoteId]?.name ?? '筆記' : '筆記';
  const mindMapData = useMemo(() => parseMarkdownToMindMap(markdown, activeNoteName), [markdown, activeNoteName]);

  const globalSearchResults = useMemo(() => {
    if (!debouncedSearchQuery.trim()) return [];

    const results: { id: string; name: string; snippet: string }[] = [];
    const SNIPPET_RADIUS = 50; // Characters before and after the match

    try {
      const query = debouncedSearchQuery.trim();
      const regex = new RegExp(escapeRegExp(query), 'gi');

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
        if (isSettingsOpen) setIsSettingsOpen(false);
        if (isMobile && isMobileSidebarOpen) setIsMobileSidebarOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canUndo, canRedo, undo, redo, isHelpModalOpen, isAIPanelOpen, isSettingsOpen, isMobile, isMobileSidebarOpen]);

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

  const handleExportBackup = () => {
    // Include the active note's latest keystrokes even if the typing-pause
    // debounce hasn't flushed them into `notes` yet.
    const notesToExport: NotesContent = activeNoteId
      ? { ...notes, [activeNoteId]: markdown }
      : notes;

    const backup = {
      app: BACKUP_APP_ID,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      tree,
      notes: notesToExport,
      images,
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    a.download = `mindmap-note-backup-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setActionMessage({ text: '已匯出備份檔案。', variant: 'success' });
  };

  const handleImportBackup = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      let data: any;
      try {
        data = JSON.parse(reader.result as string);
      } catch (error) {
        console.error('Failed to parse backup file', error);
        setActionMessage({ text: '無法讀取備份檔案，請確認檔案格式正確。', variant: 'warning' });
        return;
      }

      const isValid = data && typeof data === 'object' &&
        data.tree && typeof data.tree === 'object' &&
        data.notes && typeof data.notes === 'object';

      if (!isValid) {
        setActionMessage({ text: '這不是有效的備份檔案。', variant: 'warning' });
        return;
      }

      if (!window.confirm('匯入備份將會取代目前所有的筆記與資料夾，此動作無法復原。確定要繼續嗎？')) {
        return;
      }

      restoreFromBackup({
        tree: data.tree as FileSystemTree,
        notes: data.notes as NotesContent,
        images: (data.images && typeof data.images === 'object') ? data.images as Images : {},
      });
      setActionMessage({ text: '已成功匯入備份。', variant: 'success' });
    };
    reader.onerror = () => {
      setActionMessage({ text: '讀取檔案時發生錯誤。', variant: 'warning' });
    };
    reader.readAsText(file);
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
        commitMarkdownNow(lines.join('\n'));
    }
  };

  const handleStructureUpdate = (newRootNode: MindMapNode) => {
    const newMarkdown = mindMapToMarkdown(newRootNode);
    commitMarkdownNow(newMarkdown);
  };
  
  const handleOutlineNodeClick = (lineNumber: number) => {
    setScrollToLine(lineNumber);
    setSearchQuery('');
    if (isMobile) setIsMobileSidebarOpen(false);
  };

  // On mobile the sidebar is a full-screen drawer, so picking a note should
  // also dismiss it — staying open would just cover the note you just opened.
  const handleSelectNote = useCallback((noteId: string) => {
    setActiveNoteId(noteId);
    if (isMobile) setIsMobileSidebarOpen(false);
  }, [setActiveNoteId, isMobile]);

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

    if (!apiKey) {
      setIsSettingsOpen(true);
      return;
    }

    // Only start a new session if one isn't already active for this note,
    // or if the note content has significantly changed. For simplicity,
    // we'll start a new one each time it's opened for now.
    setIsAIPanelOpen(true);
    setIsAILoading(true);
    setChatMessages([]);

    try {
      const { createChatSession } = await import('./services/geminiChatService');
      const session = await createChatSession(markdown, apiKey);
      setChatSession(session);
      setChatMessages([{ role: 'model', text: `你好！我已經閱讀完 **${activeNoteName}** 的內容了。我可以協助你做什麼呢？試試看問我：\n\n- 幫我總結這份筆記\n- 根據筆記內容出幾道練習題\n- 用更簡單的方式解釋第二段` }]);
    } catch (error) {
      console.error("Failed to start chat session:", error);
      const { MissingApiKeyError, extractGeminiErrorMessage } = await import('./services/geminiChatService');
      if (error instanceof MissingApiKeyError) {
        setIsAIPanelOpen(false);
        setIsSettingsOpen(true);
        return;
      }
      const errorMessage = extractGeminiErrorMessage(error);
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
      const { extractGeminiErrorMessage } = await import('./services/geminiChatService');
      const errorMessage = extractGeminiErrorMessage(error);
      const modelErrorMessage: ChatMessage = { role: 'model', text: `抱歉，發生錯誤： ${errorMessage}` };
      setChatMessages(prev => [...prev, modelErrorMessage]);
    } finally {
      setIsAILoading(false);
    }
  };

  const sidebarElement = (
    <Sidebar
      tree={tree}
      activeNoteId={activeNoteId}
      onSelectNote={handleSelectNote}
      onCreateNode={createNode}
      onRenameNode={renameNode}
      onDeleteNode={deleteNode}
      onMoveNode={moveNode}
      mindMapData={mindMapData}
      activeLine={activeLine}
      onOutlineNodeClick={handleOutlineNodeClick}
      onClose={closeSidebar}
    />
  );

  const aiPanelElement = (
    <Suspense fallback={<div className="h-full flex items-center justify-center"><Spinner className="w-6 h-6 text-accent" /></div>}>
      <AIPanel
        onToggleCollapse={() => setIsAIPanelOpen(false)}
        messages={chatMessages}
        onSendMessage={handleSendChatMessage}
        isLoading={isAILoading}
        images={images}
      />
    </Suspense>
  );

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
        onOpenSettings={() => setIsSettingsOpen(true)}
        onToggleSidebar={toggleSidebar}
        isMobile={isMobile}
      />
      <div className="flex-grow flex overflow-hidden relative">
        {isMobile ? (
          isMobileSidebarOpen && (
            <>
              <div className="fixed inset-0 bg-black/40 z-40" onClick={closeSidebar} />
              <aside className="fixed inset-y-0 left-0 w-[85vw] max-w-sm bg-primary z-50 shadow-apple-lg">
                {sidebarElement}
              </aside>
            </>
          )
        ) : (
          <aside className={`h-full flex-shrink-0 transition-all duration-300 ease-in-out ${isSidebarVisible ? 'w-1/4 max-w-xs border-r border-border-color/60' : 'w-0'}`}>
            <div className="h-full overflow-hidden">
              {sidebarElement}
            </div>
          </aside>
        )}

        <main className="flex-grow flex overflow-hidden">
          {!activeNoteId ? (
              <div className="w-full h-full flex items-center justify-center text-text-secondary text-sm">
                請選擇一篇筆記或建立新筆記
              </div>
          ) : viewMode === ViewMode.Editor || viewMode === ViewMode.Preview ? (
            <div className="flex h-full w-full relative">
              {(viewMode === ViewMode.Editor || !isMobile) && (
                <div className={`flex-grow h-full ${viewMode === ViewMode.Preview && !isMobile ? 'w-1/2' : 'w-full'}`}>
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
              )}
              {viewMode === ViewMode.Preview && (
                  <div className={`flex-grow h-full p-4 md:p-6 lg:p-8 overflow-y-auto ${!isMobile ? 'w-1/2 border-l border-border-color/60' : 'w-full'}`}>
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
              ) : <div className="text-center text-text-secondary text-sm">請在編輯器中新增內容以生成思維導圖。</div>}
            </div>
          )}
        </main>

        {isMobile ? (
          isAIPanelOpen && (
            <>
              <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setIsAIPanelOpen(false)} />
              <aside className="fixed inset-y-0 right-0 w-[90vw] max-w-md bg-secondary z-50 shadow-apple-lg">
                {aiPanelElement}
              </aside>
            </>
          )
        ) : (
          <aside className={`h-full flex-shrink-0 transition-all duration-300 ease-in-out ${isAIPanelOpen ? 'w-1/3 max-w-md border-l border-border-color/60' : 'w-0'}`}>
              <div className="h-full overflow-hidden">
                  {hasOpenedAIPanel && aiPanelElement}
              </div>
          </aside>
        )}
      </div>
      <HelpModal isOpen={isHelpModalOpen} onClose={() => setIsHelpModalOpen(false)} />
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        apiKey={apiKey}
        onSaveApiKey={setApiKey}
        onExportBackup={handleExportBackup}
        onImportBackup={handleImportBackup}
      />
      {(actionMessage || storageError) && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-2rem)] max-w-md flex flex-col gap-2">
          {actionMessage && (
            <Toast message={actionMessage.text} variant={actionMessage.variant} onDismiss={() => setActionMessage(null)} />
          )}
          {storageError && <Toast message={storageError} onDismiss={dismissStorageError} />}
        </div>
      )}
    </div>
  );
};

export default App;
