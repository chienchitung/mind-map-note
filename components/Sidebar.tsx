import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileSystemTree, MindMapNode } from '../types';
import FileExplorer from './FileExplorer';
import OutlineView from './OutlineView';
import VoiceRecordingsPanel from './VoiceRecordingsPanel';
import TrashPanel from './TrashPanel';
import useLocalStorage from '../hooks/useLocalStorage';
import { PlusIcon, FolderPlusIcon, FilterIcon, ChevronDoubleDownIcon, ChevronDoubleUpIcon } from './icons';
import type { StoredVoiceRecording } from '../services/voiceRecordingStorage';
import { useTranslation } from '../contexts/LanguageContext';

interface SidebarProps {
  tree: FileSystemTree;
  activeNoteId: string | null;
  onSelectNote: (noteId: string) => void;
  onCreateNode: (type: 'file' | 'folder', parentId: string | null) => void;
  onRenameNode: (nodeId: string, newName: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onRestoreNode: (nodeId: string) => void;
  onPermanentlyDeleteNode: (nodeId: string) => void;
  onMoveNode: (nodeId: string, newParentId: string | null, beforeNodeId?: string | null) => void;
  onExportFolderMarkdown: (folderId: string) => void;
  onExportFolderMarkdownZip: (folderId: string) => void;
  onExportFolderPDF: (folderId: string) => void;
  mindMapData: MindMapNode | null;
  activeLine: number;
  onOutlineNodeClick: (lineNumber: number) => void;
  voiceRecordingsBytes: number | null;
  onListVoiceRecordings: () => Promise<StoredVoiceRecording[]>;
  onDeleteVoiceRecording: (noteId: string) => Promise<void>;
  onClearVoiceRecordings: () => void;
}

type SidebarTab = 'files' | 'outline' | 'recordings' | 'trash';

// Combines the file explorer and the current note's outline behind a single
// tab switcher instead of two separately-collapsible panels — one set of
// open/close controls to learn, and the outline is now available in every
// view mode (previously only shown alongside the editor).
const Sidebar: React.FC<SidebarProps> = ({
  tree,
  activeNoteId,
  onSelectNote,
  onCreateNode,
  onRenameNode,
  onDeleteNode,
  onRestoreNode,
  onPermanentlyDeleteNode,
  onMoveNode,
  onExportFolderMarkdown,
  onExportFolderMarkdownZip,
  onExportFolderPDF,
  mindMapData,
  activeLine,
  onOutlineNodeClick,
  voiceRecordingsBytes,
  onListVoiceRecordings,
  onDeleteVoiceRecording,
  onClearVoiceRecordings,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useLocalStorage<SidebarTab>('mind-map-sidebar-tab', 'files');
  // Which folders are collapsed, persisted across refreshes — a folder not
  // in this list is expanded by default.
  const [collapsedFolderIds, setCollapsedFolderIds] = useLocalStorage<string[]>('mind-map-collapsed-folders', []);
  const collapsedFolderIdSet = useMemo(() => new Set(collapsedFolderIds), [collapsedFolderIds]);
  const handleToggleFolder = useCallback((folderId: string) => {
    setCollapsedFolderIds(current => (
      current.includes(folderId) ? current.filter(id => id !== folderId) : [...current, folderId]
    ));
  }, [setCollapsedFolderIds]);
  const handleExpandAll = useCallback(() => setCollapsedFolderIds([]), [setCollapsedFolderIds]);
  const handleCollapseAll = useCallback(() => {
    // The root node is a folder in the data model but never rendered as its
    // own collapsible row (FileExplorer renders its children directly), so
    // it's excluded here rather than persisted as a meaningless entry.
    setCollapsedFolderIds(Object.values(tree).filter(node => node.type === 'folder' && node.id !== 'root').map(node => node.id));
  }, [setCollapsedFolderIds, tree]);

  // A single filter-menu icon (rather than dedicated expand/collapse-all
  // buttons) keeps this whole toolbar to one row — see its own comment
  // below for why it lives here instead of inside FileExplorer.
  const [isFolderMenuOpen, setIsFolderMenuOpen] = useState(false);
  const folderMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isFolderMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (folderMenuRef.current && !folderMenuRef.current.contains(event.target as Node)) {
        setIsFolderMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isFolderMenuOpen]);

  const tabClass = (tab: SidebarTab) =>
    `flex-1 min-w-0 truncate px-2 py-1.5 text-sm font-medium rounded-full transition-all duration-150 ease-apple ${
      activeTab === tab ? 'bg-accent text-white shadow-apple-xs' : 'text-text-secondary hover:text-text-main'
    }`;

  return (
    <div className="h-full bg-primary flex flex-col">
      <div className="flex items-center gap-2 px-3 py-3 flex-shrink-0">
        <div className="flex rounded-full bg-secondary p-1 flex-grow min-w-0">
          <button onClick={() => setActiveTab('files')} className={tabClass('files')}>{t('sidebar.tabFiles')}</button>
          <button onClick={() => setActiveTab('outline')} className={tabClass('outline')}>{t('sidebar.tabOutline')}</button>
          <button onClick={() => setActiveTab('recordings')} className={tabClass('recordings')}>{t('sidebar.tabRecordings')}</button>
          <button onClick={() => setActiveTab('trash')} className={tabClass('trash')}>{t('sidebar.tabTrash')}</button>
        </div>
        {activeTab === 'files' && (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button onClick={() => onCreateNode('file', 'root')} className="p-1.5 rounded-full hover:bg-secondary transition-all duration-150 ease-apple active:scale-90 text-text-secondary" title={t('sidebar.newNote')} aria-label={t('sidebar.newNote')}>
              <PlusIcon className="w-4 h-4" />
            </button>
            <button onClick={() => onCreateNode('folder', 'root')} className="p-1.5 rounded-full hover:bg-secondary transition-all duration-150 ease-apple active:scale-90 text-text-secondary" title={t('sidebar.newFolder')} aria-label={t('sidebar.newFolder')}>
              <FolderPlusIcon className="w-4 h-4" />
            </button>
            <div className="relative" ref={folderMenuRef}>
              <button
                onClick={() => setIsFolderMenuOpen(open => !open)}
                className={`p-1.5 rounded-full hover:bg-secondary transition-all duration-150 ease-apple active:scale-90 ${isFolderMenuOpen ? 'bg-secondary text-text-main' : 'text-text-secondary'}`}
                title={t('sidebar.folderViewOptions')}
                aria-label={t('sidebar.folderViewOptions')}
                aria-expanded={isFolderMenuOpen}
              >
                <FilterIcon className="w-4 h-4" />
              </button>
              {isFolderMenuOpen && (
                <div className="glass-surface-solid absolute right-0 top-full mt-1.5 z-30 w-44 border border-border-color/70 rounded-2xl shadow-apple-md py-1.5 px-1.5 text-text-main">
                  <button
                    onClick={() => { handleExpandAll(); setIsFolderMenuOpen(false); }}
                    className="w-full text-left px-3 py-1.5 text-sm rounded-xl hover:bg-accent hover:text-white transition-colors duration-150 ease-apple flex items-center gap-2"
                  >
                    <ChevronDoubleDownIcon className="w-4 h-4" /> <span>{t('sidebar.expandAll')}</span>
                  </button>
                  <button
                    onClick={() => { handleCollapseAll(); setIsFolderMenuOpen(false); }}
                    className="w-full text-left px-3 py-1.5 text-sm rounded-xl hover:bg-accent hover:text-white transition-colors duration-150 ease-apple flex items-center gap-2"
                  >
                    <ChevronDoubleUpIcon className="w-4 h-4" /> <span>{t('sidebar.collapseAll')}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="flex-grow overflow-hidden">
        {activeTab === 'files' ? (
          <FileExplorer
            tree={tree}
            activeNoteId={activeNoteId}
            onSelectNote={onSelectNote}
            onRenameNode={onRenameNode}
            onDeleteNode={onDeleteNode}
            onMoveNode={onMoveNode}
            onExportFolderMarkdown={onExportFolderMarkdown}
            onExportFolderMarkdownZip={onExportFolderMarkdownZip}
            onExportFolderPDF={onExportFolderPDF}
            collapsedFolderIds={collapsedFolderIdSet}
            onToggleFolder={handleToggleFolder}
          />
        ) : activeTab === 'recordings' ? (
          <VoiceRecordingsPanel
            voiceRecordingsBytes={voiceRecordingsBytes}
            onListVoiceRecordings={onListVoiceRecordings}
            onDeleteVoiceRecording={onDeleteVoiceRecording}
            onClearVoiceRecordings={onClearVoiceRecordings}
            getNoteTitle={(noteId) => tree[noteId]?.name}
            onSelectNote={onSelectNote}
          />
        ) : activeTab === 'trash' ? (
          <TrashPanel
            tree={tree}
            onRestoreNode={onRestoreNode}
            onPermanentlyDeleteNode={onPermanentlyDeleteNode}
          />
        ) : mindMapData ? (
          <OutlineView data={mindMapData} activeLine={activeLine} onNodeClick={onOutlineNodeClick} />
        ) : (
          <div className="p-6 text-sm text-text-secondary text-center">{t('sidebar.selectOrCreateNote')}</div>
        )}
      </div>
    </div>
  );
};

export default Sidebar;
