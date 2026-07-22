import React, { useState, useRef, useEffect, useContext } from 'react';
import { FileSystemTree, FileSystemNode } from '../types';
import { FolderIcon, FileIcon, ChevronDownIcon, ChevronUpIcon, PlusIcon, FolderPlusIcon, PencilIcon, TrashIcon, XIcon, ChevronDoubleLeftIcon } from './icons';

// A modal component for moving a node to a new folder.
const MoveToModal: React.FC<{
  tree: FileSystemTree;
  nodeToMove: FileSystemNode;
  onClose: () => void;
  onMoveNode: (nodeId: string, newParentId: string | null) => void;
}> = ({ tree, nodeToMove, onClose, onMoveNode }) => {

  // Helper to find all descendants of a folder to prevent moving a folder into itself.
  const getDescendantIds = (nodeId: string): Set<string> => {
    const descendants = new Set<string>();
    const queue = [nodeId];
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      descendants.add(currentId);
      if (tree[currentId]) {
        tree[currentId].childrenIds.forEach(childId => queue.push(childId));
      }
    }
    return descendants;
  };

  const disabledIds = nodeToMove.type === 'folder' ? getDescendantIds(nodeToMove.id) : new Set<string>();

  // A recursive component to render the folder hierarchy.
  const FolderTree: React.FC<{ parentId: string, level: number }> = ({ parentId, level }) => {
    const parent = tree[parentId];
    if (!parent || !parent.childrenIds) return null;

    return (
      <>
        {parent.childrenIds.map(childId => {
          const child = tree[childId];
          if (!child || child.type !== 'folder') return null;
          
          const isDisabled = disabledIds.has(childId) || childId === nodeToMove.parentId;

          return (
            <div key={childId}>
              <div
                className={`flex items-center p-2 rounded-xl transition-colors duration-150 ease-apple ${isDisabled ? 'text-text-secondary/50 cursor-not-allowed' : 'text-text-secondary hover:bg-secondary hover:text-text-main cursor-pointer'}`}
                style={{ paddingLeft: `${level * 20 + 12}px` }}
                onClick={() => {
                  if (!isDisabled) {
                    onMoveNode(nodeToMove.id, childId);
                    onClose();
                  }
                }}
              >
                <FolderIcon className="w-5 h-5 mr-2 flex-shrink-0" />
                <span className="truncate">{child.name}</span>
                {childId === nodeToMove.parentId && <span className="ml-auto text-xs text-accent">(current)</span>}
              </div>
              <FolderTree parentId={childId} level={level + 1} />
            </div>
          );
        })}
      </>
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content text-text-main" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-full text-text-secondary hover:bg-secondary hover:text-text-main transition-colors duration-150 ease-apple" title="Close (Esc)">
          <XIcon className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-semibold mb-4 tracking-tight">Move "<span className="text-accent">{nodeToMove.name}</span>" to...</h2>
        
        <div className="max-h-[60vh] overflow-y-auto pr-2">
            <div
              className={`flex items-center p-2 rounded-md transition-colors ${nodeToMove.parentId === 'root' ? 'text-text-secondary/50 cursor-not-allowed' : 'text-text-secondary hover:bg-secondary hover:text-text-main cursor-pointer'}`}
              onClick={() => {
                  if (nodeToMove.parentId !== 'root') {
                      onMoveNode(nodeToMove.id, 'root');
                      onClose();
                  }
              }}
            >
              <FolderIcon className="w-5 h-5 mr-2 flex-shrink-0" />
              <span>(Root Folder)</span>
              {nodeToMove.parentId === 'root' && <span className="ml-auto text-xs text-accent">(current)</span>}
            </div>
            <FolderTree parentId="root" level={0} />
        </div>
      </div>
    </div>
  );
};


interface FileExplorerProps {
  tree: FileSystemTree;
  activeNoteId: string | null;
  onSelectNote: (noteId: string) => void;
  onCreateNode: (type: 'file' | 'folder', parentId: string | null) => void;
  onRenameNode: (nodeId: string, newName: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onMoveNode: (nodeId: string, newParentId: string | null) => void;
  onToggleCollapse: () => void;
}

interface IFileExplorerContext {
  renamingNodeId: string | null;
  setRenamingNodeId: (id: string | null) => void;
  onRenameNode: (nodeId: string, newName: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onContextMenu: (event: React.MouseEvent, nodeId: string) => void;
}

const FileExplorerContext = React.createContext<IFileExplorerContext | null>(null);

const Node: React.FC<{
  node: FileSystemNode;
  tree: FileSystemTree;
  level: number;
  activeNoteId: string | null;
  onSelectNote: (noteId: string) => void;
  onMoveNode: (nodeId: string, newParentId: string | null) => void;
}> = ({ node, tree, level, activeNoteId, onSelectNote, onMoveNode }) => {
  const context = useContext(FileExplorerContext);
  if (!context) throw new Error("Node must be used within a FileExplorerContext");

  const { renamingNodeId, setRenamingNodeId, onRenameNode, onDeleteNode, onContextMenu } = context;

  const [isExpanded, setIsExpanded] = useState(true);
  const [name, setName] = useState(node.name);
  const [isHovering, setIsHovering] = useState(false);
  const [isDropTarget, setIsDropTarget] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  const isRenaming = renamingNodeId === node.id;

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  useEffect(() => {
    if (!isRenaming) setName(node.name);
  }, [node.name, isRenaming]);

  const handleFinishRename = () => {
    if (name.trim() && name.trim() !== node.name) {
      onRenameNode(node.id, name.trim());
    }
    setRenamingNodeId(null);
  };
  
  const handleCancelRename = () => {
    setName(node.name);
    setRenamingNodeId(null);
  }

  const handleClick = () => {
    if (node.type === 'folder') {
      setIsExpanded(!isExpanded);
    } else {
      onSelectNote(node.id);
    }
  };
  
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', node.id);
    e.dataTransfer.effectAllowed = 'move';
  };
  
  const handleDragOver = (e: React.DragEvent) => {
    if (node.type === 'folder') {
      e.preventDefault();
      setIsDropTarget(true);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    if (node.type === 'folder') {
      e.preventDefault();
      const droppedNodeId = e.dataTransfer.getData('text/plain');
      if (droppedNodeId) onMoveNode(droppedNodeId, node.id);
      setIsDropTarget(false);
    }
  };

  const isActive = node.type === 'file' && node.id === activeNoteId;
  const ChevronIcon = isExpanded ? ChevronDownIcon : ChevronUpIcon;

  return (
    <div>
      <div
        className={`flex items-center rounded-lg py-1.5 px-1.5 group transition-colors duration-150 ease-apple ${isActive ? 'bg-accent text-white' : 'hover:bg-secondary'} ${isDropTarget ? 'bg-green-500/20 ring-2 ring-green-500' : ''}`}
        style={{ paddingLeft: `${level * 16 + 6}px` }}
        onClick={handleClick}
        onContextMenu={(e) => onContextMenu(e, node.id)}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        draggable={node.parentId !== null} // Root items cannot be dragged
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={() => setIsDropTarget(false)}
        onDrop={handleDrop}
      >
        {node.type === 'folder' && <ChevronIcon className="w-4 h-4 mr-1 flex-shrink-0" />}
        <div className="w-5 h-5 mr-2 flex-shrink-0">
          {node.type === 'folder' ? <FolderIcon /> : <FileIcon />}
        </div>
        {isRenaming ? (
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleFinishRename}
            onKeyDown={(e) => { if (e.key === 'Enter') handleFinishRename(); else if (e.key === 'Escape') handleCancelRename(); }}
            onClick={(e) => e.stopPropagation()}
            className="bg-primary border border-accent rounded-md px-1.5 py-0.5 w-full text-text-main"
          />
        ) : (
          <span className="truncate flex-grow cursor-pointer text-[13px]">{node.name}</span>
        )}
        {isHovering && !isRenaming && (
          <div className="flex-shrink-0 ml-auto flex items-center gap-0.5">
            <button onClick={(e) => { e.stopPropagation(); setRenamingNodeId(node.id); }} className={`p-1 rounded-full transition-colors duration-150 ease-apple ${isActive ? 'hover:bg-white/20' : 'hover:bg-border-color/60'}`}><PencilIcon className="w-3.5 h-3.5" /></button>
            {node.parentId !== null && <button onClick={(e) => { e.stopPropagation(); if(confirm(`確定要刪除 "${node.name}" 嗎？`)) onDeleteNode(node.id); }} className={`p-1 rounded-full transition-colors duration-150 ease-apple ${isActive ? 'hover:bg-white/20' : 'hover:bg-border-color/60'}`}><TrashIcon className="w-3.5 h-3.5" /></button>}
          </div>
        )}
      </div>
      {isExpanded && node.type === 'folder' && (
        <div>
          {node.childrenIds.map(childId => (
            tree[childId] && <Node
              key={childId}
              node={tree[childId]}
              tree={tree}
              level={level + 1}
              activeNoteId={activeNoteId}
              onSelectNote={onSelectNote}
              onMoveNode={onMoveNode}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const FileExplorer: React.FC<FileExplorerProps> = (props) => {
  const { tree, activeNoteId, onSelectNote, onCreateNode, onRenameNode, onDeleteNode, onMoveNode, onToggleCollapse } = props;
  const rootNode = tree['root'];
  
  const [renamingNodeId, setRenamingNodeId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, nodeId: string } | null>(null);
  const [moveToModalNodeId, setMoveToModalNodeId] = useState<string | null>(null);
  
  const contextMenuRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  const handleContextMenu = (event: React.MouseEvent, nodeId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY, nodeId });
  };
  
  const closeContextMenu = () => setContextMenu(null);

  const contextNode = contextMenu ? tree[contextMenu.nodeId] : null;
  const contextValue: IFileExplorerContext = { renamingNodeId, setRenamingNodeId, onRenameNode, onDeleteNode, onContextMenu: handleContextMenu };

  return (
    <FileExplorerContext.Provider value={contextValue}>
      <div className="h-full bg-primary text-text-secondary text-sm flex flex-col">
        <div className="flex items-center justify-between px-3 py-3 flex-shrink-0">
            <h2 className="font-semibold text-text-main text-[13px] tracking-tight">檔案總管</h2>
            <div className="flex items-center gap-0.5">
                <button onClick={() => onCreateNode('file', 'root')} className="p-1.5 rounded-full hover:bg-secondary transition-all duration-150 ease-apple active:scale-90" title="新增筆記">
                    <PlusIcon className="w-4 h-4" />
                </button>
                <button onClick={() => onCreateNode('folder', 'root')} className="p-1.5 rounded-full hover:bg-secondary transition-all duration-150 ease-apple active:scale-90" title="新增資料夾">
                    <FolderPlusIcon className="w-4 h-4" />
                </button>
                <div className="w-px h-4 bg-border-color mx-1"></div>
                <button onClick={onToggleCollapse} className="p-1.5 rounded-full hover:bg-secondary transition-all duration-150 ease-apple active:scale-90" title="收合檔案總管">
                    <ChevronDoubleLeftIcon className="w-4 h-4" />
                </button>
            </div>
        </div>
        <div className="flex-grow overflow-y-auto px-2.5 pb-2 space-y-0.5">
          {rootNode.childrenIds.map(childId => (
            tree[childId] ? (
              <Node
                  key={childId}
                  node={tree[childId]}
                  tree={tree}
                  level={0}
                  activeNoteId={activeNoteId}
                  onSelectNote={onSelectNote}
                  onMoveNode={onMoveNode}
              />
            ) : null
          ))}
        </div>

        {contextMenu && contextNode && (
          <div
            ref={contextMenuRef}
            style={{ top: contextMenu.y, left: contextMenu.x }}
            className="glass-surface absolute z-30 w-48 border border-border-color/70 rounded-2xl shadow-apple-md py-1.5 px-1.5 text-text-main"
          >
            <button
              onClick={() => { setRenamingNodeId(contextMenu.nodeId); closeContextMenu(); }}
              className="w-full text-left px-3 py-1.5 text-sm rounded-xl hover:bg-accent hover:text-white transition-colors duration-150 ease-apple flex items-center gap-2"
            >
              <PencilIcon className="w-4 h-4" /> <span>重新命名</span>
            </button>
            <button
              onClick={() => { setMoveToModalNodeId(contextMenu.nodeId); closeContextMenu(); }}
              className="w-full text-left px-3 py-1.5 text-sm rounded-xl hover:bg-accent hover:text-white transition-colors duration-150 ease-apple flex items-center gap-2"
            >
              <FolderIcon className="w-4 h-4" /> <span>移動到...</span>
            </button>
            {contextNode.parentId !== null && (
              <>
                <div className="h-px bg-border-color my-1 mx-1"></div>
                <button
                  onClick={() => {
                    if(confirm(`確定要刪除 "${contextNode.name}" 嗎？`)) {
                      onDeleteNode(contextMenu.nodeId);
                    }
                    closeContextMenu();
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm rounded-xl text-red-500 hover:bg-red-500 hover:text-white transition-colors duration-150 ease-apple flex items-center gap-2"
                >
                  <TrashIcon className="w-4 h-4" /> <span>刪除</span>
                </button>
              </>
            )}
          </div>
        )}

        {moveToModalNodeId && tree[moveToModalNodeId] && (
          <MoveToModal
            tree={tree}
            nodeToMove={tree[moveToModalNodeId]}
            onClose={() => setMoveToModalNodeId(null)}
            onMoveNode={onMoveNode}
          />
        )}
      </div>
    </FileExplorerContext.Provider>
  );
};

export default FileExplorer;
