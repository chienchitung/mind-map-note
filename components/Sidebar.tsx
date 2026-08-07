import React from 'react';
import { FileSystemTree, MindMapNode } from '../types';
import FileExplorer from './FileExplorer';
import OutlineView from './OutlineView';
import VoiceRecordingsPanel from './VoiceRecordingsPanel';
import TrashPanel from './TrashPanel';
import useLocalStorage from '../hooks/useLocalStorage';
import { PlusIcon, FolderPlusIcon, XIcon } from './icons';
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
  mindMapData: MindMapNode | null;
  activeLine: number;
  onOutlineNodeClick: (lineNumber: number) => void;
  onClose: () => void;
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
  mindMapData,
  activeLine,
  onOutlineNodeClick,
  onClose,
  voiceRecordingsBytes,
  onListVoiceRecordings,
  onDeleteVoiceRecording,
  onClearVoiceRecordings,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useLocalStorage<SidebarTab>('mind-map-sidebar-tab', 'files');

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
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {activeTab === 'files' && (
            <>
              <button onClick={() => onCreateNode('file', 'root')} className="p-1.5 rounded-full hover:bg-secondary transition-all duration-150 ease-apple active:scale-90 text-text-secondary" title={t('sidebar.newNote')} aria-label={t('sidebar.newNote')}>
                <PlusIcon className="w-4 h-4" />
              </button>
              <button onClick={() => onCreateNode('folder', 'root')} className="p-1.5 rounded-full hover:bg-secondary transition-all duration-150 ease-apple active:scale-90 text-text-secondary" title={t('sidebar.newFolder')} aria-label={t('sidebar.newFolder')}>
                <FolderPlusIcon className="w-4 h-4" />
              </button>
            </>
          )}
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-secondary transition-all duration-150 ease-apple active:scale-90 text-text-secondary" title={t('sidebar.collapseSidebar')} aria-label={t('sidebar.collapseSidebar')}>
            <XIcon className="w-4 h-4" />
          </button>
        </div>
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
