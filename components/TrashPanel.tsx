import React from 'react';
import { FileSystemTree } from '../types';
import { FolderIcon, FileIcon, TrashIcon, RestartIcon } from './icons';
import { useTranslation } from '../contexts/LanguageContext';

interface TrashPanelProps {
  tree: FileSystemTree;
  onRestoreNode: (nodeId: string) => void;
  onPermanentlyDeleteNode: (nodeId: string) => void;
}

const TRASH_RETENTION_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Lists trashed top-level items (a trashed node's descendants stay attached
// underneath it and aren't listed separately — restoring or permanently
// deleting a row acts on that whole subtree at once). Mirrors the
// VoiceRecordingsPanel tab's layout: scrollable list + a footer action.
const TrashPanel: React.FC<TrashPanelProps> = ({ tree, onRestoreNode, onPermanentlyDeleteNode }) => {
  const { t } = useTranslation();
  const trashedNodes = Object.values(tree)
    .filter(node => node.deletedAt !== undefined)
    .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));

  const handlePermanentDelete = (nodeId: string, name: string) => {
    if (confirm(t('trash.deleteForeverConfirm', { name }))) {
      onPermanentlyDeleteNode(nodeId);
    }
  };

  const handleEmptyTrash = () => {
    if (!confirm(t('trash.emptyTrashConfirm'))) return;
    trashedNodes.forEach(node => onPermanentlyDeleteNode(node.id));
  };

  return (
    <div className="h-full bg-primary text-text-secondary text-sm flex flex-col">
      <div className="flex-grow overflow-y-auto px-2.5 pt-2 pb-2">
        {trashedNodes.length === 0 ? (
          <p className="text-xs text-text-secondary px-1 leading-relaxed">{t('trash.empty')}</p>
        ) : (
          <div className="space-y-2">
            {trashedNodes.map(node => {
              const deletedAt = node.deletedAt ?? Date.now();
              const daysLeft = Math.max(0, TRASH_RETENTION_DAYS - Math.floor((Date.now() - deletedAt) / MS_PER_DAY));
              return (
                <div key={node.id} className="p-3 bg-secondary rounded-xl">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-4 h-4 flex-shrink-0">
                      {node.type === 'folder' ? <FolderIcon /> : <FileIcon />}
                    </div>
                    <span className="text-sm font-medium text-text-main truncate">{node.name}</span>
                  </div>
                  <p className="text-xs text-text-secondary mb-2">
                    {daysLeft > 0 ? t('trash.autoDeleteIn', { days: daysLeft }) : t('trash.autoDeleteToday')}
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => onRestoreNode(node.id)}
                      className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                    >
                      <RestartIcon className="w-3.5 h-3.5" />
                      {t('trash.restore')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePermanentDelete(node.id, node.name)}
                      className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-400"
                    >
                      <TrashIcon className="w-3.5 h-3.5" />
                      {t('trash.deleteForever')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {trashedNodes.length > 0 && (
        <div className="flex-shrink-0 px-2.5 py-2 border-t border-border-color">
          <button
            type="button"
            onClick={handleEmptyTrash}
            className="flex items-center gap-2 text-xs text-red-500 hover:text-red-400 transition-colors duration-150 ease-apple"
          >
            <TrashIcon className="w-3.5 h-3.5" />
            {t('trash.emptyTrash')}
          </button>
        </div>
      )}
    </div>
  );
};

export default TrashPanel;
