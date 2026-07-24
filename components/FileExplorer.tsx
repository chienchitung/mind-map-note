import React, { useState, useRef, useEffect, useContext } from 'react';
import { FileSystemTree, FileSystemNode } from '../types';
import { FolderIcon, FileIcon, ChevronDownIcon, ChevronUpIcon, PencilIcon, TrashIcon, XIcon } from './icons';

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

  // The close button's own tooltip promises "關閉 (Esc)" — actually wire it
  // up; App.tsx's global Escape handler doesn't know about this modal's
  // local state.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

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
                {childId === nodeToMove.parentId && <span className="ml-auto text-xs text-accent">（目前位置）</span>}
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
      <div className="modal-content text-text-main" role="dialog" aria-modal="true" aria-labelledby="move-modal-title" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-full text-text-secondary hover:bg-secondary hover:text-text-main transition-colors duration-150 ease-apple" title="關閉 (Esc)" aria-label="關閉">
          <XIcon className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-accent/10 text-accent flex items-center justify-center flex-shrink-0">
            <FolderIcon className="w-5 h-5" />
          </div>
          <h2 id="move-modal-title" className="text-lg font-semibold tracking-tight truncate">
            移動「<span className="text-accent">{nodeToMove.name}</span>」到...
          </h2>
        </div>

        <div className="max-h-[60vh] overflow-y-auto pr-2">
            <div
              className={`flex items-center p-2 rounded-xl transition-colors duration-150 ease-apple ${nodeToMove.parentId === 'root' ? 'text-text-secondary/50 cursor-not-allowed' : 'text-text-secondary hover:bg-secondary hover:text-text-main cursor-pointer'}`}
              onClick={() => {
                  if (nodeToMove.parentId !== 'root') {
                      onMoveNode(nodeToMove.id, 'root');
                      onClose();
                  }
              }}
            >
              <FolderIcon className="w-5 h-5 mr-2 flex-shrink-0" />
              <span>根目錄</span>
              {nodeToMove.parentId === 'root' && <span className="ml-auto text-xs text-accent">（目前位置）</span>}
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
  onRenameNode: (nodeId: string, newName: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onMoveNode: (nodeId: string, newParentId: string | null) => void;
}

interface IFileExplorerContext {
  renamingNodeId: string | null;
  setRenamingNodeId: (id: string | null) => void;
  onRenameNode: (nodeId: string, newName: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onContextMenu: (event: React.MouseEvent, nodeId: string) => void;
  draggingNodeId: string | null;
  setDraggingNodeId: (id: string | null) => void;
}

// Whether `targetId` is `draggedId` itself or one of its descendants — used
// to reject a drop before it happens rather than after, since dropping a
// folder into itself/its own descendant would either no-op or create a
// cycle depending on where the check lived.
const isNodeOrDescendant = (tree: FileSystemTree, draggedId: string, targetId: string): boolean => {
  if (draggedId === targetId) return true;
  const queue = [...(tree[draggedId]?.childrenIds ?? [])];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (currentId === targetId) return true;
    if (tree[currentId]) queue.push(...tree[currentId].childrenIds);
  }
  return false;
};

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

  const { renamingNodeId, setRenamingNodeId, onRenameNode, onDeleteNode, onContextMenu, draggingNodeId, setDraggingNodeId } = context;

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
    setDraggingNodeId(node.id);
  };

  const handleDragEnd = () => {
    setDraggingNodeId(null);
  };

  // Only claim the drop (preventDefault) when it would actually be valid —
  // dropping a folder into itself or one of its own descendants used to
  // still show the green "valid drop" highlight and then silently no-op on
  // release, with nothing telling the user why. Skipping preventDefault()
  // here instead makes the browser show its native "not allowed" cursor and
  // refuses the drop outright.
  const isValidDropTarget = node.type === 'folder' && draggingNodeId !== null && !isNodeOrDescendant(tree, draggingNodeId, node.id);

  const handleDragOver = (e: React.DragEvent) => {
    if (isValidDropTarget) {
      e.preventDefault();
      setIsDropTarget(true);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    if (isValidDropTarget) {
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
        onDragEnd={handleDragEnd}
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
            <button onClick={(e) => { e.stopPropagation(); setRenamingNodeId(node.id); }} title="重新命名" aria-label="重新命名" className={`p-1 rounded-full transition-colors duration-150 ease-apple ${isActive ? 'hover:bg-white/20' : 'hover:bg-border-color/60'}`}><PencilIcon className="w-3.5 h-3.5" /></button>
            {node.parentId !== null && <button onClick={(e) => { e.stopPropagation(); if(confirm(`確定要刪除 "${node.name}" 嗎？`)) onDeleteNode(node.id); }} title="刪除" aria-label="刪除" className={`p-1 rounded-full transition-colors duration-150 ease-apple ${isActive ? 'hover:bg-white/20' : 'hover:bg-border-color/60'}`}><TrashIcon className="w-3.5 h-3.5" /></button>}
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
  const { tree, activeNoteId, onSelectNote, onRenameNode, onDeleteNode, onMoveNode } = props;
  const rootNode = tree['root'];
  
  const [renamingNodeId, setRenamingNodeId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, nodeId: string } | null>(null);
  const [moveToModalNodeId, setMoveToModalNodeId] = useState<string | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);

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
  const contextValue: IFileExplorerContext = { renamingNodeId, setRenamingNodeId, onRenameNode, onDeleteNode, onContextMenu: handleContextMenu, draggingNodeId, setDraggingNodeId };

  // Only nested items (not already at root) need a way back out — dropping
  // a folder's contents anywhere but onto another folder previously did
  // nothing, with no feedback, so notes could get stuck once filed away.
  const showRootDropZone = draggingNodeId !== null && tree[draggingNodeId]?.parentId !== 'root';

  return (
    <FileExplorerContext.Provider value={contextValue}>
      <div className="h-full bg-primary text-text-secondary text-sm flex flex-col">
        <div className="flex-grow overflow-y-auto px-2.5 pt-2 pb-2 space-y-0.5">
          {showRootDropZone && (
            <div
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
              onDrop={(e) => {
                e.preventDefault();
                const droppedNodeId = e.dataTransfer.getData('text/plain');
                if (droppedNodeId) onMoveNode(droppedNodeId, 'root');
                setDraggingNodeId(null);
              }}
              className="flex items-center gap-2 px-3 py-2 mb-1 rounded-xl border-2 border-dashed border-accent/50 bg-accent/5 text-accent text-xs font-medium"
            >
              <FolderIcon className="w-4 h-4 flex-shrink-0" />
              <span>拖放到此處以移出資料夾</span>
            </div>
          )}
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
            className="glass-surface-solid absolute z-30 w-48 border border-border-color/70 rounded-2xl shadow-apple-md py-1.5 px-1.5 text-text-main"
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
