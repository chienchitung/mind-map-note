import React, { useState, useMemo, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import { ViewMode, MindMapNode, MindMapLayout, FileSystemTree, NotesContent, Images, SearchResultItem } from './types';
import { useHistory } from './hooks/useHistory';
import { useFileSystem } from './hooks/useFileSystem';
import useLocalStorage from './hooks/useLocalStorage';
import { useIsMobile } from './hooks/useMediaQuery';
import { useVoiceNotePipeline, VoiceRecordingData } from './hooks/useVoiceNotePipeline';
import { useVoiceRecordingsStorage } from './hooks/useVoiceRecordingsStorage';
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
import VoiceNoteStatusPill from './components/VoiceNoteStatusPill';
import type { Chat } from '@google/genai';
import { parseMarkdownToMindMap, findBlockOrdinal } from './utils/markdownParser';
import { escapeRegExp } from './utils/escapeRegExp';
import { normalizeAiMarkdown } from './utils/normalizeAiMarkdown';
import { useTranslation } from './contexts/LanguageContext';
import { TRANSCRIPTION_LANGUAGE_STORAGE_KEY, type TranscriptionLanguage } from './utils/transcriptionLanguage';

// The AI chat panel (and the @google/genai SDK it pulls in) is only ever
// needed once a user with an API key opens it, so it's loaded on demand
// instead of padding out everyone's initial bundle.
const AIPanel = lazy(() => import('./components/AIPanel'));
// Same reasoning: the voice note recorder is only needed once a user with
// both API keys configured actually opens it.
const VoiceNoteModal = lazy(() => import('./components/VoiceNoteModal'));

// Identifies exported workspace backup files so imports can sanity-check
// they're not some unrelated JSON file.
const BACKUP_APP_ID = 'mind-map-note';
const BACKUP_VERSION = 1;

// Walks a note's ancestor folders (skipping the implicit "root") to build a
// breadcrumb like "工作 / 專案A", so search results can disambiguate notes
// that share a name in different folders.
const getFolderPath = (tree: FileSystemTree, nodeId: string): string => {
  const segments: string[] = [];
  let currentId = tree[nodeId]?.parentId;
  while (currentId && currentId !== 'root') {
    const node = tree[currentId];
    if (!node) break;
    segments.unshift(node.name);
    currentId = node.parentId;
  }
  return segments.join(' / ');
};

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
  const { t } = useTranslation();
  const { tree, notes, images, createNode, updateNote, renameNode, deleteNode, restoreNode, permanentlyDeleteNode, moveNode, addImage, restoreFromBackup, storageError, dismissStorageError } = useFileSystem();
  
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

  // If the active note disappears — deleted from another view, or just
  // moved to the trash — fall back to another file.
  useEffect(() => {
    if (activeNoteId && (!tree[activeNoteId] || tree[activeNoteId].deletedAt)) {
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
  // Consumed by RichTextEditor (Aa mode) and MarkdownPreview — unlike
  // scrollToLine (a raw textarea line offset, meaningless to either of
  // those), this identifies "the Nth heading/list-item in document order",
  // which each can locate independently in its own rendering. See
  // findBlockOrdinal in utils/markdownParser.ts.
  const [scrollToBlockOrdinal, setScrollToBlockOrdinal] = useState<number | null>(null);
  const [activeLine, setActiveLine] = useState<number>(0);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [apiKey, setApiKey] = useLocalStorage<string>('gemini-api-key', '');
  const [groqApiKey, setGroqApiKey] = useLocalStorage<string>('groq-api-key', '');
  const [transcriptionLanguage, setTranscriptionLanguage] = useLocalStorage<TranscriptionLanguage>(TRANSCRIPTION_LANGUAGE_STORAGE_KEY, 'auto');
  const [isVoiceNoteModalOpen, setIsVoiceNoteModalOpen] = useState(false);
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

  // Bumped on every new session and on note switch, so a fire-and-forget
  // callback from an old/abandoned session (e.g. a context-priming failure
  // that lands after the user has already moved on) can recognize it's
  // stale and skip updating state for whatever session is current now.
  const chatSessionTokenRef = useRef(0);
  const previousNoteIdForChatRef = useRef(activeNoteId);
  // Each note keeps its own conversation — switching notes doesn't discard
  // one, it just stashes it here and swaps in whichever conversation (if
  // any) belongs to the note being switched to, so leaving and coming back
  // continues right where it left off instead of restarting every time.
  const chatSessionsByNoteRef = useRef<Record<string, { session: Chat; messages: ChatMessage[] }>>({});
  useEffect(() => {
    const previousNoteId = previousNoteIdForChatRef.current;
    if (previousNoteId === activeNoteId) return;
    previousNoteIdForChatRef.current = activeNoteId;

    // Invalidate any in-flight priming callback from the outgoing note's
    // session so it can't land after we've already moved on to another one.
    chatSessionTokenRef.current++;

    if (previousNoteId && chatSession) {
      chatSessionsByNoteRef.current[previousNoteId] = { session: chatSession, messages: chatMessages };
    }

    const cached = activeNoteId ? chatSessionsByNoteRef.current[activeNoteId] : undefined;
    if (cached) {
      setChatSession(cached.session);
      setChatMessages(cached.messages);
    } else {
      setChatSession(null);
      setChatMessages([]);
      // The panel was already open and showing a different note's
      // conversation — prime a fresh one for this note right away instead
      // of leaving it looking stuck/empty until the user does something.
      // `notes[activeNoteId]` (not the live `markdown` state) is used here
      // since `markdown` is a separate, debounced editor buffer that hasn't
      // necessarily caught up to the new note yet at this exact point.
      if (isAIPanelOpen && activeNoteId && apiKey) {
        void startNewChatSession(notes[activeNoteId]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNoteId]);

  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const activeNoteName = activeNoteId ? tree[activeNoteId]?.name ?? t('app.untitledNote') : t('app.untitledNote');
  const mindMapData = useMemo(() => parseMarkdownToMindMap(markdown, activeNoteName), [markdown, activeNoteName]);

  const globalSearchResults = useMemo(() => {
    if (!debouncedSearchQuery.trim()) return [];

    const results: SearchResultItem[] = [];
    const SNIPPET_RADIUS = 50; // Characters before and after the match

    try {
      const query = debouncedSearchQuery.trim();
      const regex = new RegExp(escapeRegExp(query), 'gi');

      Object.keys(notes).forEach(noteId => {
        const content = notes[noteId];
        
        regex.lastIndex = 0;
        
        const match = regex.exec(content);

        if (match) {
          if (tree[noteId] && !tree[noteId].deletedAt) {
            const matchIndex = match.index;
            const start = Math.max(0, matchIndex - SNIPPET_RADIUS);
            const end = Math.min(
              content.length,
              matchIndex + match[0].length + SNIPPET_RADIUS
            );

            let snippet = content.substring(start, end).replace(/\n/g, ' ');

            if (start > 0) snippet = '... ' + snippet;
            if (end < content.length) snippet = snippet + ' ...';

            results.push({ id: noteId, name: tree[noteId].name, snippet, path: getFolderPath(tree, noteId) });
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
        if (isVoiceNoteModalOpen) setIsVoiceNoteModalOpen(false);
        if (isMobile && isMobileSidebarOpen) setIsMobileSidebarOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canUndo, canRedo, undo, redo, isHelpModalOpen, isAIPanelOpen, isSettingsOpen, isVoiceNoteModalOpen, isMobile, isMobileSidebarOpen]);

  useEffect(() => {
    if (viewMode === ViewMode.MindMap && mindMapData) {
        setSelectedNodeId(mindMapData.id);
    } else {
        setSelectedNodeId(null);
    }
  }, [viewMode, mindMapData]);


  const handleExportMindMapImage = () => {
    mindMapRef.current?.exportAsJPG();
  };

  const handleExportMarkdown = () => {
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

  // PDF export leans on the browser's native print-to-PDF instead of a
  // client-side PDF library: the hidden #print-only container (rendered
  // below) is styled to show only itself under `@media print` (see
  // index.css), so triggering print produces a real, text-searchable PDF
  // with no added dependency.
  //
  // The note's name is deliberately not repeated as a heading inside that
  // container (the note's own content almost always already starts with
  // one) — instead this swaps `document.title` to the note's name for the
  // duration of the print, so it shows up in the browser's own native print
  // header instead of being duplicated in the page body. Restored via the
  // `afterprint` event rather than immediately after `window.print()`
  // returns, since some browsers treat the print dialog as async.
  const handleExportPDF = () => {
    const previousTitle = document.title;
    document.title = activeNoteName || previousTitle;
    const restoreTitle = () => {
      document.title = previousTitle;
      window.removeEventListener('afterprint', restoreTitle);
    };
    window.addEventListener('afterprint', restoreTitle);
    window.print();
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

    setActionMessage({ text: t('app.exportedBackup'), variant: 'success' });
  };

  const handleImportBackup = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      let data: any;
      try {
        data = JSON.parse(reader.result as string);
      } catch (error) {
        console.error('Failed to parse backup file', error);
        setActionMessage({ text: t('app.importBackupReadError'), variant: 'warning' });
        return;
      }

      const isValid = data && typeof data === 'object' &&
        data.tree && typeof data.tree === 'object' &&
        data.notes && typeof data.notes === 'object';

      if (!isValid) {
        setActionMessage({ text: t('app.importBackupInvalid'), variant: 'warning' });
        return;
      }

      if (!window.confirm(t('app.importBackupConfirm'))) {
        return;
      }

      restoreFromBackup({
        tree: data.tree as FileSystemTree,
        notes: data.notes as NotesContent,
        images: (data.images && typeof data.images === 'object') ? data.images as Images : {},
      });
      setActionMessage({ text: t('app.importBackupSuccess'), variant: 'success' });
    };
    reader.onerror = () => {
      setActionMessage({ text: t('app.importBackupReadFileError'), variant: 'warning' });
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

  const handleOutlineNodeClick = (lineNumber: number) => {
    setScrollToLine(lineNumber);
    setScrollToBlockOrdinal(mindMapData ? findBlockOrdinal(mindMapData, lineNumber) : null);
    // Marks the clicked entry active (blue highlight) immediately. Without
    // this, activeLine only ever moved via the plain textarea's own cursor
    // tracking (see Editor's onCursorActivity) — scrolling to a line, on
    // its own, never touches the cursor, so a click here never highlighted
    // anything, in any editor mode.
    setActiveLine(lineNumber);
    setSearchQuery('');
    if (isMobile) setIsMobileSidebarOpen(false);
  };

  const voiceRecordingsStorage = useVoiceRecordingsStorage();

  // Creates a new note from the AI-generated Markdown once the record →
  // transcribe → generate pipeline finishes, naming it after the note's own
  // first heading when there is one (falling back to the default name the
  // same way a blank new note does). Runs regardless of whether the voice
  // note modal is currently open or minimized to the background.
  //
  // Also persists the raw transcript and audio segments behind the note
  // (see useVoiceRecordingsStorage) — this is best-effort: the note itself
  // is already created and saved by this point, so a failure here (e.g. the
  // browser's storage quota) is surfaced as a warning rather than treated
  // as the whole operation failing.
  const handleVoiceNoteGenerated = (generatedMarkdown: string, recording: VoiceRecordingData) => {
    const newNoteId = createNode('file', 'root');
    updateNote(newNoteId, generatedMarkdown);
    const firstHeadingMatch = generatedMarkdown.match(/^#{1,6}\s+(.+)$/m);
    if (firstHeadingMatch) {
      renameNode(newNoteId, firstHeadingMatch[1].trim());
    }
    setActiveNoteId(newNoteId);
    setIsVoiceNoteModalOpen(false);
    // A segment Groq couldn't transcribe (e.g. rejected as an undecodable
    // clip) is skipped rather than aborting the whole recording — the note
    // still gets generated from whatever did transcribe, but the user
    // should know it may be missing a piece rather than assuming it's
    // complete.
    setActionMessage(
      recording.skippedSegmentCount > 0
        ? { text: t('app.voiceNotePartialTranscript', { count: recording.skippedSegmentCount }), variant: 'warning' }
        : { text: t('app.voiceNoteCreated'), variant: 'success' }
    );

    voiceRecordingsStorage.saveRecording(newNoteId, recording.transcript, recording.timestampedTranscript, recording.segments).catch(error => {
      console.error('Failed to save voice recording:', error);
      setActionMessage({ text: t('app.voiceNoteSaveError'), variant: 'warning' });
    });
  };

  // Only toast a pipeline error if the modal isn't open to show it inline —
  // this is what makes an error surfaceable while the recorder is minimized.
  const handleVoiceNoteError = useCallback((message: string) => {
    if (!isVoiceNoteModalOpen) {
      setActionMessage({ text: t('app.voiceNoteErrorPrefix', { message }), variant: 'warning' });
    }
  }, [isVoiceNoteModalOpen, t]);

  // Lives at the App level (not inside the modal) so recording and the
  // transcribe/generate pipeline keep running even while the modal is
  // minimized — closing the modal only hides the UI, never cancels it.
  const voiceNotePipeline = useVoiceNotePipeline({
    groqApiKey,
    geminiApiKey: apiKey,
    onNoteGenerated: handleVoiceNoteGenerated,
    onError: handleVoiceNoteError,
  });

  // Gated the same way as the AI panel: rather than opening the recorder and
  // only then discovering a key is missing, send the user straight to
  // Settings with an explanation. Both keys are required up front since the
  // pipeline needs Groq for transcription and Gemini for note generation —
  // but only for a *fresh* session; reopening onto one that's already
  // running (e.g. after minimizing) skips the check, since it was already
  // validated when that session started.
  const handleOpenVoiceNote = () => {
    if (voiceNotePipeline.state.stage !== 'idle') {
      setIsVoiceNoteModalOpen(true);
      return;
    }
    if (!apiKey || !groqApiKey) {
      setIsSettingsOpen(true);
      setActionMessage({ text: t('app.voiceNoteMissingKeys'), variant: 'warning' });
      return;
    }
    setIsVoiceNoteModalOpen(true);
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

  // Shared by the initial open (when no session exists yet), the panel's
  // own "clear conversation, start over" button, and auto-priming a fresh
  // conversation when switching to a note that doesn't have one cached yet
  // (see chatSessionsByNoteRef) — that last caller passes `contentOverride`
  // since it can't rely on the live `markdown` buffer, which lags a note
  // switch by a render.
  const startNewChatSession = async (contentOverride?: string) => {
    const content = contentOverride ?? markdown;
    if (!activeNoteId || !content || !apiKey) return;

    setIsAILoading(true);
    setChatMessages([]);

    const sessionToken = ++chatSessionTokenRef.current;

    try {
      const { createChatSession } = await import('./services/geminiChatService');
      const session = await createChatSession(content, apiKey, (errorMessage) => {
        // Fire-and-forget context priming can fail well after this function
        // returns — only surface it if the user hasn't since closed the
        // panel or switched to a different note's session in the meantime.
        if (chatSessionTokenRef.current !== sessionToken) return;
        setChatMessages(prev => [...prev, { role: 'model', text: t('aiPanel.contextErrorReminder', { error: errorMessage }) }]);
      });
      if (chatSessionTokenRef.current !== sessionToken) return;
      setChatSession(session);
      setChatMessages([{ role: 'model', text: t('aiPanel.greeting', { noteName: activeNoteName }) }]);
    } catch (error) {
      console.error("Failed to start chat session:", error);
      const { MissingApiKeyError, extractGeminiErrorMessage } = await import('./services/geminiChatService');
      if (error instanceof MissingApiKeyError) {
        setIsAIPanelOpen(false);
        setIsSettingsOpen(true);
        return;
      }
      const errorMessage = extractGeminiErrorMessage(error);
      setChatMessages([{ role: 'model', text: t('aiPanel.errorPrefix', { error: errorMessage }) }]);
    } finally {
      setIsAILoading(false);
    }
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

    setIsAIPanelOpen(true);

    // A session for this note is already active — either the panel was
    // just collapsed, or the note-switch effect above already restored this
    // note's own cached conversation. Either way, show it as-is instead of
    // discarding it and re-priming a brand new session.
    if (chatSession) return;

    await startNewChatSession();
  };

  // The AI panel's own "clear conversation" button — explicitly discards
  // the current conversation and primes a fresh session for the active note.
  const handleNewConversation = () => {
    chatSessionTokenRef.current++; // invalidate any in-flight callback from the old session
    startNewChatSession();
  };

  const handleSendChatMessage = async (message: string) => {
    if (!chatSession || !message.trim()) return;

    const userMessage: ChatMessage = { role: 'user', text: message };
    setChatMessages(prev => [...prev, userMessage]);
    setIsAILoading(true);

    try {
      const response = await chatSession.sendMessage({ message });
      const modelMessage: ChatMessage = { role: 'model', text: normalizeAiMarkdown(response.text ?? '') };
      setChatMessages(prev => [...prev, modelMessage]);
    } catch (error) {
      console.error("Chat error:", error);
      const { extractGeminiErrorMessage } = await import('./services/geminiChatService');
      const errorMessage = extractGeminiErrorMessage(error);
      const modelErrorMessage: ChatMessage = { role: 'model', text: t('app.chatErrorPrefix', { error: errorMessage }) };
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
      onRestoreNode={restoreNode}
      onPermanentlyDeleteNode={permanentlyDeleteNode}
      onMoveNode={moveNode}
      mindMapData={mindMapData}
      activeLine={activeLine}
      onOutlineNodeClick={handleOutlineNodeClick}
      onClose={closeSidebar}
      voiceRecordingsBytes={voiceRecordingsStorage.totalBytes}
      onListVoiceRecordings={voiceRecordingsStorage.listRecordings}
      onDeleteVoiceRecording={async (noteId) => {
        try {
          await voiceRecordingsStorage.deleteRecording(noteId);
        } catch (error) {
          console.error('Failed to delete voice recording:', error);
          setActionMessage({ text: t('app.deleteRecordingError'), variant: 'warning' });
        }
      }}
      onClearVoiceRecordings={async () => {
        try {
          await voiceRecordingsStorage.clearAll();
          setActionMessage({ text: t('app.clearRecordingsSuccess'), variant: 'success' });
        } catch (error) {
          console.error('Failed to clear voice recordings:', error);
          setActionMessage({ text: t('app.clearRecordingsError'), variant: 'warning' });
        }
      }}
    />
  );

  const aiPanelElement = (
    <Suspense fallback={<div className="h-full flex items-center justify-center"><Spinner className="w-6 h-6 text-accent" /></div>}>
      <AIPanel
        onToggleCollapse={() => setIsAIPanelOpen(false)}
        onNewConversation={handleNewConversation}
        messages={chatMessages}
        onSendMessage={handleSendChatMessage}
        isLoading={isAILoading}
        images={images}
      />
    </Suspense>
  );

  return (
    <div className="flex flex-col h-screen font-sans bg-primary print:h-auto print:overflow-visible print:bg-white">
    <div className="print:hidden flex flex-col h-full">
      <Header
        viewMode={viewMode}
        onViewChange={setViewMode}
        mindMapLayout={mindMapLayout}
        onLayoutChange={setMindMapLayout}
        onExportMindMapImage={handleExportMindMapImage}
        onExportMarkdown={handleExportMarkdown}
        onExportPDF={handleExportPDF}
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
        onOpenVoiceNote={handleOpenVoiceNote}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onToggleSidebar={toggleSidebar}
        isMobile={isMobile}
      />
      <div className="flex-grow flex overflow-hidden relative">
        {isMobile ? (
          <>
            {/* Both stay mounted (rather than only rendering while open) so
                closing animates too, not just opening — a transform/opacity
                transition needs the element present on both sides of the
                state change to have something to animate between. */}
            <div
              className={`fixed inset-0 bg-black/40 z-40 transition-opacity duration-300 ease-apple ${
                isMobileSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
              onClick={closeSidebar}
            />
            <aside
              className={`fixed inset-y-0 left-0 w-[85vw] max-w-sm bg-primary z-50 shadow-apple-lg transition-transform duration-300 ease-apple ${
                isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
              }`}
            >
              {sidebarElement}
            </aside>
          </>
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
                {t('app.selectOrCreateNote')}
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
                            images={images}
                            scrollToLine={scrollToLine}
                            onScrollComplete={() => {
                              setScrollToLine(null)
                            }}
                            scrollToBlockOrdinal={scrollToBlockOrdinal}
                            onBlockScrollComplete={() => setScrollToBlockOrdinal(null)}
                            onCursorActivity={setActiveLine}
                        />
                    </div>
                </div>
              )}
              {viewMode === ViewMode.Preview && (
                  <div className={`flex-grow h-full p-4 md:p-6 lg:p-8 overflow-y-auto ${!isMobile ? 'w-1/2 border-l border-border-color/60' : 'w-full'}`}>
                    <MarkdownPreview
                      markdown={markdown}
                      images={images}
                      scrollToBlockOrdinal={scrollToBlockOrdinal}
                      onScrollComplete={() => setScrollToBlockOrdinal(null)}
                    />
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
                      selectedNodeId={selectedNodeId}
                      setSelectedNodeId={setSelectedNodeId}
                      images={images}
                      theme={theme}
                      noteId={activeNoteId}
                  />
              ) : <div className="text-center text-text-secondary text-sm">{t('mindMap.emptyState')}</div>}
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
        groqApiKey={groqApiKey}
        onSaveGroqApiKey={setGroqApiKey}
        transcriptionLanguage={transcriptionLanguage}
        onSaveTranscriptionLanguage={setTranscriptionLanguage}
        onExportBackup={handleExportBackup}
        onImportBackup={handleImportBackup}
      />
      {isVoiceNoteModalOpen && (
        <Suspense fallback={null}>
          <VoiceNoteModal
            isOpen={isVoiceNoteModalOpen}
            onClose={() => setIsVoiceNoteModalOpen(false)}
            state={voiceNotePipeline.state}
            actions={voiceNotePipeline.actions}
          />
        </Suspense>
      )}
      {!isVoiceNoteModalOpen && voiceNotePipeline.state.stage !== 'idle' && (
        <VoiceNoteStatusPill state={voiceNotePipeline.state} onClick={() => setIsVoiceNoteModalOpen(true)} />
      )}
      {(actionMessage || storageError) && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-2rem)] max-w-md flex flex-col gap-2">
          {actionMessage && (
            <Toast message={actionMessage.text} variant={actionMessage.variant} onDismiss={() => setActionMessage(null)} />
          )}
          {storageError && <Toast message={storageError} onDismiss={dismissStorageError} />}
        </div>
      )}
    </div>

    {/* Rendered only under @media print (see index.css) — window.print()
        in handleExportPDF turns this into the entire page, giving a real,
        text-searchable "PDF" via the browser's own print-to-PDF instead of
        pulling in a client-side PDF library. */}
    <div id="print-only-content" className="hidden print:block">
      <MarkdownPreview markdown={markdown} images={images} />
    </div>
    </div>
  );
};

export default App;
