import React from 'react';
import { FileSystemTree, MindMapNode } from '../types';
import FileExplorer from './FileExplorer';
import OutlineView from './OutlineView';
import useLocalStorage from '../hooks/useLocalStorage';
import { PlusIcon, FolderPlusIcon, XIcon } from './icons';

interface SidebarProps {
  tree: FileSystemTree;
  activeNoteId: string | null;
  onSelectNote: (noteId: string) => void;
  onCreateNode: (type: 'file' | 'folder', parentId: string | null) => void;
  onRenameNode: (nodeId: string, newName: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onMoveNode: (nodeId: string, newParentId: string | null) => void;
  mindMapData: MindMapNode | null;
  activeLine: number;
  onOutlineNodeClick: (lineNumber: number) => void;
  onClose: () => void;
}

type SidebarTab = 'files' | 'outline';

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
  onMoveNode,
  mindMapData,
  activeLine,
  onOutlineNodeClick,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useLocalStorage<SidebarTab>('mind-map-sidebar-tab', 'files');

  const tabClass = (tab: SidebarTab) =>
    `flex-1 px-3 py-1.5 text-sm font-medium rounded-full transition-all duration-150 ease-apple ${
      activeTab === tab ? 'bg-accent text-white shadow-apple-xs' : 'text-text-secondary hover:text-text-main'
    }`;

  return (
    <div className="h-full bg-primary flex flex-col">
      <div className="flex items-center gap-2 px-3 py-3 flex-shrink-0">
        <div className="flex rounded-full bg-secondary p-1 flex-grow">
          <button onClick={() => setActiveTab('files')} className={tabClass('files')}>檔案</button>
          <button onClick={() => setActiveTab('outline')} className={tabClass('outline')}>大綱</button>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {activeTab === 'files' && (
            <>
              <button onClick={() => onCreateNode('file', 'root')} className="p-1.5 rounded-full hover:bg-secondary transition-all duration-150 ease-apple active:scale-90 text-text-secondary" title="新增筆記" aria-label="新增筆記">
                <PlusIcon className="w-4 h-4" />
              </button>
              <button onClick={() => onCreateNode('folder', 'root')} className="p-1.5 rounded-full hover:bg-secondary transition-all duration-150 ease-apple active:scale-90 text-text-secondary" title="新增資料夾" aria-label="新增資料夾">
                <FolderPlusIcon className="w-4 h-4" />
              </button>
            </>
          )}
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-secondary transition-all duration-150 ease-apple active:scale-90 text-text-secondary" title="收合側邊欄" aria-label="收合側邊欄">
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
        ) : mindMapData ? (
          <OutlineView data={mindMapData} activeLine={activeLine} onNodeClick={onOutlineNodeClick} />
        ) : (
          <div className="p-6 text-sm text-text-secondary text-center">請先選擇或建立一篇筆記</div>
        )}
      </div>
    </div>
  );
};

export default Sidebar;
