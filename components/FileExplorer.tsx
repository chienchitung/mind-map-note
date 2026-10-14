import React, { useState, useRef, useEffect, useContext, useMemo, useCallback } from 'react';
import { sortChildIds, formatShortDate, formatFullDate, type FileSort, type FileSortKey } from '../utils/fileSort';
import { FileSystemTree, FileSystemNode } from '../types';
import { FolderIcon, FileIcon, ChevronRightIcon, PencilIcon, TrashIcon, XIcon, ExportIcon, DocumentIcon, ArchiveIcon } from './icons';
import { useTranslation } from '../contexts/LanguageContext';

// A modal component for moving a node to a new folder.
const MoveToModal: React.FC<{
  tree: FileSystemTree;
  nodeToMove: FileSystemNode;
  onClose: () => void;
  onMoveNode: (nodeId: string, newParentId: string | null, beforeNodeId?: string | null) => void;
}> = ({ tree, nodeToMove, onClose, onMoveNode }) => {
  const { t } = useTranslation();

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
                {childId === nodeToMove.parentId && <span className="ml-auto text-xs text-accent">{t('fileExplorer.currentLocation')}</span>}
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
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-full text-text-secondary hover:bg-secondary hover:text-text-main transition-colors duration-150 ease-apple z-10" title={t('common.closeEsc')} aria-label={t('common.close')}>
          <XIcon className="w-5 h-5" />
        </button>

        <div className="modal-content-scroll">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-accent/10 text-accent flex items-center justify-center flex-shrink-0">
            <FolderIcon className="w-5 h-5" />
          </div>
          <h2 id="move-modal-title" className="text-lg font-semibold tracking-tight truncate">
            {t('fileExplorer.moveModalTitle', { name: nodeToMove.name })}
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
              <span>{t('fileExplorer.rootFolder')}</span>
              {nodeToMove.parentId === 'root' && <span className="ml-auto text-xs text-accent">{t('fileExplorer.currentLocation')}</span>}
            </div>
            <FolderTree parentId="root" level={0} />
        </div>
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
  onMoveNode: (nodeId: string, newParentId: string | null, beforeNodeId?: string | null) => void;
  onExportFolderMarkdown: (folderId: string) => void;
  onExportFolderMarkdownZip: (folderId: string) => void;
  onExportFolderPDF: (folderId: string) => void;
  // Folder ids the user has explicitly collapsed — a folder not in this set
  // is expanded by default, including one just created. Owned by Sidebar
  // (persisted to localStorage) so it survives a page refresh and so its
  // "expand all"/"collapse all" filter-menu can drive it too.
  collapsedFolderIds: Set<string>;
  onToggleFolder: (folderId: string) => void;
  autoRenameNodeId?: string | null;
  sort: FileSort;
}

interface IFileExplorerContext {
  renamingNodeId: string | null;
  setRenamingNodeId: (id: string | null) => void;
  onRenameNode: (nodeId: string, newName: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onContextMenu: (event: React.MouseEvent, nodeId: string) => void;
  draggingNodeId: string | null;
  setDraggingNodeId: (id: string | null) => void;
  collapsedFolderIds: Set<string>;
  onToggleFolder: (folderId: string) => void;
  sort: FileSort;
  selectedIds: Set<string>;
  // Applies click modifiers; returns true when the click only changed the
  // selection (so the row shouldn't also open/toggle).
  handleSelectionClick: (event: React.MouseEvent, nodeId: string) => boolean;
  // The ids a drag starting on `nodeId` carries: the whole selection when
  // it's part of one, otherwise just that node.
  idsToDrag: (nodeId: string) => string[];
  draggingIds: string[];
  setDraggingIds: (ids: string[]) => void;
  moveNodes: (ids: string[], newParentId: string | null, beforeNodeId?: string | null) => void;
}

const DRAG_IDS_TYPE = 'application/x-mindmap-node-ids';
const readDraggedIds = (e: React.DragEvent): string[] => {
  try {
    const ids = JSON.parse(e.dataTransfer.getData(DRAG_IDS_TYPE) || '[]');
    if (Array.isArray(ids) && ids.length > 0) return ids;
  } catch { /* fall back to the single id below */ }
  const single = e.dataTransfer.getData('text/plain');
  return single ? [single] : [];
};

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

const SORT_LABEL_KEYS = { manual: 'sidebar.sortManual', name: 'sidebar.sortName', created: 'sidebar.sortCreated', updated: 'sidebar.sortUpdated' } as const satisfies Record<FileSortKey, string>;

const FileExplorerContext = React.createContext<IFileExplorerContext | null>(null);

const Node: React.FC<{
  node: FileSystemNode;
  tree: FileSystemTree;
  level: number;
  activeNoteId: string | null;
  onSelectNote: (noteId: string) => void;
  onMoveNode: (nodeId: string, newParentId: string | null, beforeNodeId?: string | null) => void;
}> = ({ node, tree, level, activeNoteId, onSelectNote, onMoveNode }) => {
  const context = useContext(FileExplorerContext);
  if (!context) throw new Error("Node must be used within a FileExplorerContext");
  const { t, language } = useTranslation();

  const { renamingNodeId, setRenamingNodeId, onRenameNode, onDeleteNode, onContextMenu, draggingNodeId, setDraggingNodeId, collapsedFolderIds, onToggleFolder, sort, selectedIds, handleSelectionClick, idsToDrag, draggingIds, setDraggingIds, moveNodes } = context;
  const locale = language === 'en' ? 'en-US' : 'zh-TW';

  // Not in collapsedFolderIds means expanded — so a brand-new folder starts
  // expanded without needing an explicit entry. See collapsedFolderIds'
  // own comment on FileExplorerProps for why this lives in Sidebar instead
  // of as local state here (persistence + the expand/collapse-all buttons).
  const isExpanded = node.type === 'folder' && !collapsedFolderIds.has(node.id);
  const [name, setName] = useState(node.name);
  const [isHovering, setIsHovering] = useState(false);
  // Which reorder/reparent zone the drag is currently hovering over this
  // row: 'before'/'after' insert it as a sibling above/below this node,
  // 'inside' moves it into this folder (folders only) — see handleDragOver.
  const [dropIndicator, setDropIndicator] = useState<'before' | 'inside' | 'after' | null>(null);

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

  const handleClick = (e: React.MouseEvent) => {
    if (handleSelectionClick(e, node.id)) return;
    if (node.type === 'folder') {
      onToggleFolder(node.id);
    } else {
      onSelectNote(node.id);
    }
  };
  
  const handleDragStart = (e: React.DragEvent) => {
    const ids = idsToDrag(node.id);
    e.dataTransfer.setData('text/plain', node.id);
    e.dataTransfer.setData(DRAG_IDS_TYPE, JSON.stringify(ids));
    e.dataTransfer.effectAllowed = 'move';
    if (ids.length > 1) {
      // A "N items" badge instead of the browser's snapshot of one row.
      const badge = document.createElement('div');
      badge.textContent = t('fileExplorer.dragCount', { count: ids.length });
      Object.assign(badge.style, {
        position: 'fixed', top: '-1000px', left: '0', padding: '4px 10px', borderRadius: '999px',
        background: 'var(--color-accent)', color: '#fff', font: '600 12px -apple-system, sans-serif',
      });
      document.body.appendChild(badge);
      e.dataTransfer.setDragImage(badge, 12, 12);
      setTimeout(() => badge.remove(), 0);
    }
    setDraggingIds(ids);
    // Defer the state update so the DOM doesn't shift (due to the root
    // drop-zone appearing) while the browser is still capturing the drag
    // image — a synchronous shift here can cancel the drag in some browsers.
    requestAnimationFrame(() => setDraggingNodeId(node.id));
  };

  const handleDragEnd = () => {
    setDraggingNodeId(null);
    setDraggingIds([]);
  };

  // Never claim the drop (preventDefault) over the dragged node itself or
  // one of its own descendants — dropping a folder into itself or one of
  // its own descendants used to still show a "valid drop" highlight and
  // then silently no-op on release, with nothing telling the user why.
  // Skipping preventDefault() here instead makes the browser show its
  // native "not allowed" cursor and refuses the drop outright.
  const handleDragOver = (e: React.DragEvent) => {
    // During the first frame after dragstart, draggingNodeId is still null
    // (deferred via rAF to avoid layout shift) — fall back to the
    // dataTransfer types list, which is always available during dragover.
    const hasDragData = draggingNodeId !== null || e.dataTransfer.types.includes('text/plain');
    if (!hasDragData || draggingIds.some(id => isNodeOrDescendant(tree, id, node.id))) return;
    // Sorted lists have no manual order to drop into: only moving into a
    // folder means anything there.
    if (sort.key !== 'manual') {
      if (node.type !== 'folder') return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDropIndicator('inside');
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const relativeY = (e.clientY - rect.top) / rect.height;
    if (node.type === 'folder') {
      if (relativeY < 0.25) setDropIndicator('before');
      else if (relativeY > 0.75) setDropIndicator('after');
      else setDropIndicator('inside');
    } else {
      setDropIndicator(relativeY < 0.5 ? 'before' : 'after');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    // Always reset drag state, even on early returns — relying solely on
    // the source row's `dragend` is unreliable when React unmounts the
    // source during reparenting.
    setDraggingNodeId(null);
    setDraggingIds([]);
    if (!dropIndicator) { setDropIndicator(null); return; }
    const droppedIds = readDraggedIds(e);
    setDropIndicator(null);
    if (droppedIds.length === 0) return;
    if (dropIndicator === 'inside') {
      moveNodes(droppedIds, node.id);
      return;
    }
    // When a folder's own children land on the folder row's 'after' zone
    // (the narrow strip between the folder name and its first visible
    // child), the user almost certainly overshot while trying to reorder
    // above the first child — keep them inside the folder instead of
    // ejecting them to the parent level.
    if (dropIndicator === 'after' && node.type === 'folder' && isExpanded
        && droppedIds.every(id => tree[id]?.parentId === node.id)) {
      const firstSibling = node.childrenIds.find(id => !droppedIds.includes(id));
      moveNodes(droppedIds, node.id, firstSibling ?? null);
      return;
    }
    // 'before' inserts right ahead of this node; 'after' inserts ahead of
    // whichever sibling follows it (skipping ones being moved), or appends.
    const siblings = node.parentId ? tree[node.parentId]?.childrenIds ?? [] : [];
    const ownIndex = siblings.indexOf(node.id);
    const beforeNodeId = dropIndicator === 'before'
      ? node.id
      : siblings.slice(ownIndex + 1).find(id => !droppedIds.includes(id)) ?? null;
    moveNodes(droppedIds, node.parentId, beforeNodeId);
  };

  const isActive = node.type === 'file' && node.id === activeNoteId;
  const isSelected = selectedIds.has(node.id);
  const timeTitle = [
    node.createdAt ? t('fileExplorer.createdAt', { time: formatFullDate(node.createdAt, locale) }) : null,
    node.updatedAt ? t('fileExplorer.updatedAt', { time: formatFullDate(node.updatedAt, locale) }) : null,
  ].filter(Boolean).join('\n');
  const shownTime = node.type === 'file'
    ? (sort.key === 'created' ? node.createdAt : sort.key === 'updated' ? node.updatedAt : undefined)
    : undefined;

  return (
    <div>
      <div
        data-node-row={node.id}
        className={`flex items-center rounded-lg py-1.5 px-1.5 group select-none transition-colors duration-150 ease-apple border-t-2 border-b-2 border-transparent ${isActive ? 'bg-accent text-white' : isSelected ? 'bg-accent/15 text-text-main' : 'hover:bg-secondary'} ${isActive && isSelected ? 'ring-2 ring-accent/40 ring-offset-1 ring-offset-primary' : ''} ${dropIndicator === 'inside' ? 'bg-green-500/20 ring-2 ring-green-500' : ''} ${dropIndicator === 'before' ? 'border-t-accent' : ''} ${dropIndicator === 'after' ? 'border-b-accent' : ''}`}
        style={{ paddingLeft: `${level * 16 + 6}px` }}
        onClick={handleClick}
        onContextMenu={(e) => onContextMenu(e, node.id)}
        title={timeTitle || undefined}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        draggable={node.parentId !== null} // Root items cannot be dragged
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragLeave={() => setDropIndicator(null)}
        onDrop={handleDrop}
      >
        {node.type === 'folder' && (
          <ChevronRightIcon className={`w-4 h-4 mr-1 flex-shrink-0 transition-transform duration-150 ease-apple ${isExpanded ? 'rotate-90' : ''}`} />
        )}
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
            onKeyDown={(e) => {
              // isComposing/keyCode 229 guards against an IME candidate-
              // selection Enter (e.g. picking a Chinese character while
              // typing) being misread as "finish renaming" — that Enter is
              // meant for the IME, not this input's own submit action.
              if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) handleFinishRename();
              else if (e.key === 'Escape') handleCancelRename();
            }}
            onClick={(e) => e.stopPropagation()}
            className="bg-primary border border-accent rounded-md px-1.5 py-0.5 w-full text-text-main"
          />
        ) : (
          <span className="truncate flex-grow cursor-pointer text-[13px]">{node.name}</span>
        )}
        {shownTime !== undefined && !isHovering && !isRenaming && (
          <span className={`flex-shrink-0 ml-2 text-[11px] tabular-nums ${isActive ? 'text-white/75' : 'text-text-secondary/70'}`}>
            {formatShortDate(shownTime, locale)}
          </span>
        )}
        {isHovering && !isRenaming && (
          <div className="flex-shrink-0 ml-auto flex items-center gap-0.5">
            <button onClick={(e) => { e.stopPropagation(); setRenamingNodeId(node.id); }} title={t('fileExplorer.rename')} aria-label={t('fileExplorer.rename')} className={`p-1 rounded-full transition-colors duration-150 ease-apple ${isActive ? 'hover:bg-white/20' : 'hover:bg-border-color/60'}`}><PencilIcon className="w-3.5 h-3.5" /></button>
            {node.parentId !== null && <button onClick={(e) => { e.stopPropagation(); if(confirm(t('fileExplorer.deleteConfirm', { name: node.name }))) onDeleteNode(node.id); }} title={t('common.delete')} aria-label={t('common.delete')} className={`p-1 rounded-full transition-colors duration-150 ease-apple ${isActive ? 'hover:bg-white/20' : 'hover:bg-border-color/60'}`}><TrashIcon className="w-3.5 h-3.5" /></button>}
          </div>
        )}
      </div>
      {isExpanded && node.type === 'folder' && (
        <div>
          {sortChildIds(tree, node.childrenIds, sort).map(childId => (
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
  const { t } = useTranslation();
  const { tree, activeNoteId, onSelectNote, onRenameNode, onDeleteNode, onMoveNode, onExportFolderMarkdown, onExportFolderMarkdownZip, onExportFolderPDF, collapsedFolderIds, onToggleFolder, sort } = props;
  const rootNode = tree['root'];

  const [renamingNodeId, setRenamingNodeId] = useState<string | null>(null);
  const { autoRenameNodeId } = props;
  useEffect(() => {
    if (autoRenameNodeId) setRenamingNodeId(autoRenameNodeId);
  }, [autoRenameNodeId]);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, nodeId: string } | null>(null);
  const [moveToModalNodeId, setMoveToModalNodeId] = useState<string | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [draggingIds, setDraggingIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const selectionAnchorRef = useRef<string | null>(null);

  const contextMenuRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Rows in on-screen order (sorted, skipping collapsed folders' contents),
  // for Shift-click ranges and keeping a multi-move in the order shown.
  const visibleOrder = useMemo(() => {
    const order: string[] = [];
    const walk = (ids: string[]) => sortChildIds(tree, ids, sort).forEach(id => {
      order.push(id);
      if (tree[id].type === 'folder' && !collapsedFolderIds.has(id)) walk(tree[id].childrenIds);
    });
    if (rootNode) walk(rootNode.childrenIds);
    return order;
  }, [tree, sort, collapsedFolderIds, rootNode]);

  // Drop selected ids that no longer exist (deleted, trashed elsewhere).
  useEffect(() => {
    setSelectedIds(current => {
      const kept = [...current].filter(id => tree[id] && !tree[id].deletedAt);
      return kept.length === current.size ? current : new Set(kept);
    });
  }, [tree]);

  const clearSelection = useCallback(() => setSelectedIds(current => (current.size ? new Set() : current)), []);

  useEffect(() => {
    if (selectedIds.size === 0) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key === 'Escape' && !target.closest('input, textarea, [contenteditable="true"]')) clearSelection();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, clearSelection]);

  const handleSelectionClick = useCallback((event: React.MouseEvent, nodeId: string): boolean => {
    if (event.metaKey || event.ctrlKey) {
      setSelectedIds(current => {
        const next = new Set(current);
        // Starting a selection from the open note should include it too.
        if (next.size === 0 && activeNoteId && activeNoteId !== nodeId && visibleOrder.includes(activeNoteId)) next.add(activeNoteId);
        if (next.has(nodeId)) next.delete(nodeId); else next.add(nodeId);
        return next;
      });
      selectionAnchorRef.current = nodeId;
      return true;
    }
    if (event.shiftKey) {
      const anchor = selectionAnchorRef.current ?? activeNoteId ?? nodeId;
      const from = visibleOrder.indexOf(anchor);
      const to = visibleOrder.indexOf(nodeId);
      if (from !== -1 && to !== -1) {
        setSelectedIds(new Set(visibleOrder.slice(Math.min(from, to), Math.max(from, to) + 1)));
        return true;
      }
    }
    clearSelection();
    selectionAnchorRef.current = nodeId;
    return false;
  }, [activeNoteId, visibleOrder, clearSelection]);

  // Only the outermost selected items move: a note inside a selected folder
  // travels with the folder anyway.
  const topLevelIds = useCallback((ids: Iterable<string>): string[] => {
    const set = new Set(ids);
    const hasSelectedAncestor = (id: string) => {
      let parentId = tree[id]?.parentId;
      while (parentId) {
        if (set.has(parentId)) return true;
        parentId = tree[parentId]?.parentId ?? null;
      }
      return false;
    };
    return visibleOrder.filter(id => set.has(id) && !hasSelectedAncestor(id));
  }, [tree, visibleOrder]);

  const idsToDrag = useCallback((nodeId: string): string[] => {
    if (selectedIds.has(nodeId) && selectedIds.size > 1) return topLevelIds(selectedIds);
    clearSelection();
    return [nodeId];
  }, [selectedIds, topLevelIds, clearSelection]);

  // Inserting each one ahead of the same anchor (or appending) keeps them
  // in their on-screen order.
  const moveNodes = useCallback((ids: string[], newParentId: string | null, beforeNodeId?: string | null) => {
    ids.forEach(id => onMoveNode(id, newParentId, beforeNodeId));
  }, [onMoveNode]);

  // Drag-select box, started from empty space in the list.
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const handleListMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('[data-node-row]')) return;
    const list = listRef.current;
    if (!list) return;
    event.preventDefault();
    const additive = event.metaKey || event.ctrlKey;
    const base = additive ? new Set(selectedIds) : new Set<string>();
    const start = { x: event.clientX, y: event.clientY };
    let moved = false;
    const update = (clientX: number, clientY: number) => {
      const box = {
        left: Math.min(start.x, clientX), right: Math.max(start.x, clientX),
        top: Math.min(start.y, clientY), bottom: Math.max(start.y, clientY),
      };
      const listBox = list.getBoundingClientRect();
      setMarquee({
        x0: box.left - listBox.left, x1: box.right - listBox.left,
        y0: box.top - listBox.top + list.scrollTop, y1: box.bottom - listBox.top + list.scrollTop,
      });
      const next = new Set(base);
      list.querySelectorAll<HTMLElement>('[data-node-row]').forEach(row => {
        const r = row.getBoundingClientRect();
        if (r.bottom > box.top && r.top < box.bottom && r.right > box.left && r.left < box.right) {
          next.add(row.dataset.nodeRow as string);
        }
      });
      setSelectedIds(next);
    };
    const handleMove = (move: MouseEvent) => {
      if (!moved && Math.hypot(move.clientX - start.x, move.clientY - start.y) < 4) return;
      moved = true;
      update(move.clientX, move.clientY);
    };
    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      setMarquee(null);
      if (!moved && !additive) clearSelection();
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  };

  const handleDeleteSelected = () => {
    const ids = topLevelIds(selectedIds).filter(id => tree[id]?.parentId !== null);
    if (ids.length === 0) return;
    if (!confirm(t('fileExplorer.deleteSelectedConfirm', { count: ids.length }))) return;
    ids.forEach(id => onDeleteNode(id));
    clearSelection();
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Catch-all: if dragend fires anywhere in the document (even on a
  // detached element that still bubbles), make sure we reset the drag
  // state.  This covers edge-cases where neither handleDrop nor the
  // per-row handleDragEnd fire (e.g. dropping outside any valid target
  // when the source row has been reparented/remounted).
  useEffect(() => {
    const reset = () => { setDraggingNodeId(null); setDraggingIds([]); };
    document.addEventListener('dragend', reset);
    return () => document.removeEventListener('dragend', reset);
  }, []);
  
  const handleContextMenu = (event: React.MouseEvent, nodeId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY, nodeId });
  };
  
  const closeContextMenu = () => setContextMenu(null);

  const contextNode = contextMenu ? tree[contextMenu.nodeId] : null;
  const contextValue: IFileExplorerContext = { renamingNodeId, setRenamingNodeId, onRenameNode, onDeleteNode, onContextMenu: handleContextMenu, draggingNodeId, setDraggingNodeId, collapsedFolderIds, onToggleFolder, sort, selectedIds, handleSelectionClick, idsToDrag, draggingIds, setDraggingIds, moveNodes };

  // Only nested items (not already at root) need a way back out — dropping
  // a folder's contents anywhere but onto another folder previously did
  // nothing, with no feedback, so notes could get stuck once filed away.
  const showRootDropZone = draggingIds.some(id => tree[id]?.parentId !== 'root');

  return (
    <FileExplorerContext.Provider value={contextValue}>
      <div className="relative h-full bg-primary text-text-secondary text-sm flex flex-col">
        {draggingNodeId !== null && sort.key !== 'manual' && (
          <p className="mx-2.5 mt-1 px-3 py-2 rounded-xl bg-accent/10 text-accent text-xs leading-snug">
            {t('fileExplorer.sortedDragHint', { sort: t(SORT_LABEL_KEYS[sort.key]) })}
          </p>
        )}
        <div ref={listRef} onMouseDown={handleListMouseDown} className={`relative flex-grow overflow-y-auto px-2.5 pt-2 space-y-0.5 ${selectedIds.size > 0 ? 'pb-14' : 'pb-2'}`}>
          {marquee && (
            <div
              className="absolute z-10 pointer-events-none border border-accent bg-accent/10 rounded-sm"
              style={{ left: marquee.x0, top: marquee.y0, width: marquee.x1 - marquee.x0, height: marquee.y1 - marquee.y0 }}
            />
          )}
          {sortChildIds(tree, rootNode.childrenIds, sort).map(childId => (
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
        {/* Floats over the list rather than above it, so appearing mid
            drag-select doesn't shift the rows being selected. */}
        {selectedIds.size > 0 && draggingIds.length === 0 && (
          <div className="glass-surface-solid absolute bottom-2 left-2.5 right-2.5 z-20 flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border-color/70 shadow-apple-md text-xs text-text-main">
            <span className="font-medium text-accent">{t('fileExplorer.selectedCount', { count: selectedIds.size })}</span>
            <span className="text-text-secondary truncate">{t('fileExplorer.selectedHint')}</span>
            <button onClick={handleDeleteSelected} className="ml-auto flex-shrink-0 p-1 rounded-full text-red-500 hover:bg-red-500/10" title={t('fileExplorer.deleteSelected')} aria-label={t('fileExplorer.deleteSelected')}>
              <TrashIcon className="w-3.5 h-3.5" />
            </button>
            <button onClick={clearSelection} className="flex-shrink-0 p-1 rounded-full text-text-secondary hover:bg-border-color/60" title={t('fileExplorer.clearSelection')} aria-label={t('fileExplorer.clearSelection')}>
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {showRootDropZone && (
          <div
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
            onDrop={(e) => {
              e.preventDefault();
              moveNodes(readDraggedIds(e), 'root');
              setDraggingNodeId(null);
              setDraggingIds([]);
            }}
            className="flex items-center gap-2 mx-2.5 mb-2 px-3 py-2 rounded-xl border-2 border-dashed border-accent/50 bg-accent/5 text-accent text-xs font-medium"
          >
            <FolderIcon className="w-4 h-4 flex-shrink-0" />
            <span>{t('fileExplorer.dropToMoveOut')}</span>
          </div>
        )}

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
              <PencilIcon className="w-4 h-4" /> <span>{t('fileExplorer.rename')}</span>
            </button>
            <button
              onClick={() => { setMoveToModalNodeId(contextMenu.nodeId); closeContextMenu(); }}
              className="w-full text-left px-3 py-1.5 text-sm rounded-xl hover:bg-accent hover:text-white transition-colors duration-150 ease-apple flex items-center gap-2"
            >
              <FolderIcon className="w-4 h-4" /> <span>{t('fileExplorer.moveTo')}</span>
            </button>
            {contextNode.type === 'folder' && (
              <>
                <div className="h-px bg-border-color my-1 mx-1"></div>
                <button
                  onClick={() => { onExportFolderMarkdown(contextMenu.nodeId); closeContextMenu(); }}
                  className="w-full text-left px-3 py-1.5 text-sm rounded-xl hover:bg-accent hover:text-white transition-colors duration-150 ease-apple flex items-center gap-2"
                >
                  <ExportIcon className="w-4 h-4" /> <span>{t('fileExplorer.exportFolderMarkdown')}</span>
                </button>
                <button
                  onClick={() => { onExportFolderMarkdownZip(contextMenu.nodeId); closeContextMenu(); }}
                  className="w-full text-left px-3 py-1.5 text-sm rounded-xl hover:bg-accent hover:text-white transition-colors duration-150 ease-apple flex items-center gap-2"
                >
                  <ArchiveIcon className="w-4 h-4" /> <span>{t('fileExplorer.exportFolderMarkdownZip')}</span>
                </button>
                <button
                  onClick={() => { onExportFolderPDF(contextMenu.nodeId); closeContextMenu(); }}
                  className="w-full text-left px-3 py-1.5 text-sm rounded-xl hover:bg-accent hover:text-white transition-colors duration-150 ease-apple flex items-center gap-2"
                >
                  <DocumentIcon className="w-4 h-4" /> <span>{t('fileExplorer.exportFolderPDF')}</span>
                </button>
              </>
            )}
            {contextNode.parentId !== null && (
              <>
                <div className="h-px bg-border-color my-1 mx-1"></div>
                <button
                  onClick={() => {
                    if(confirm(t('fileExplorer.deleteConfirm', { name: contextNode.name }))) {
                      onDeleteNode(contextMenu.nodeId);
                    }
                    closeContextMenu();
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm rounded-xl text-red-500 hover:bg-red-500 hover:text-white transition-colors duration-150 ease-apple flex items-center gap-2"
                >
                  <TrashIcon className="w-4 h-4" /> <span>{t('common.delete')}</span>
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
