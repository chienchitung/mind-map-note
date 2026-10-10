import { FileSystemTree } from '../types';

export type FileSortKey = 'manual' | 'name' | 'created' | 'updated';
export type FileSortDirection = 'asc' | 'desc';
export interface FileSort {
  key: FileSortKey;
  direction: FileSortDirection;
}

export const DEFAULT_FILE_SORT: FileSort = { key: 'manual', direction: 'desc' };

// The direction a key starts in when picked: names read A→Z, times newest first.
export const defaultDirectionFor = (key: FileSortKey): FileSortDirection => (key === 'name' ? 'asc' : 'desc');

const collator = new Intl.Collator('zh-Hant', { numeric: true, sensitivity: 'base' });
// Names starting with Latin letters, digits or symbols come before Chinese
// ones, as in most file managers; within each group the zh-Hant collator
// orders Chinese by stroke count and numbers naturally (2 before 10).
const startsWithAscii = (name: string) => /^[\x00-\x7F]/.test(name.trim());
const compareNames = (a: string, b: string): number =>
  Number(startsWithAscii(b)) - Number(startsWithAscii(a)) || collator.compare(a, b);

// A folder counts as updated whenever anything inside it was.
const latestUpdate = (tree: FileSystemTree, nodeId: string): number => {
  const node = tree[nodeId];
  if (!node) return 0;
  let latest = node.updatedAt ?? node.createdAt ?? 0;
  if (node.type === 'folder') {
    node.childrenIds.forEach(childId => { latest = Math.max(latest, latestUpdate(tree, childId)); });
  }
  return latest;
};

// Manual order is the stored childrenIds order. Any other order lists
// folders before notes and sorts each group, falling back to the name.
export const sortChildIds = (tree: FileSystemTree, ids: string[], sort: FileSort): string[] => {
  const present = ids.filter(id => tree[id]);
  if (sort.key === 'manual') return present;
  const sign = sort.direction === 'asc' ? 1 : -1;
  const value = (id: string): number =>
    sort.key === 'created' ? tree[id].createdAt ?? 0 : latestUpdate(tree, id);
  return [...present].sort((a, b) => {
    const folderFirst = Number(tree[b].type === 'folder') - Number(tree[a].type === 'folder');
    if (folderFirst !== 0) return folderFirst;
    const byKey = sort.key === 'name' ? compareNames(tree[a].name, tree[b].name) : value(a) - value(b);
    return byKey !== 0 ? sign * byKey : compareNames(tree[a].name, tree[b].name);
  });
};

// Compact list-row date: time of day for today, month/day this year, full date otherwise.
export const formatShortDate = (timestamp: number, locale: string): string => {
  const date = new Date(timestamp);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(locale, { month: 'numeric', day: 'numeric' });
  }
  return date.toLocaleDateString(locale, { year: 'numeric', month: 'numeric', day: 'numeric' });
};

export const formatFullDate = (timestamp: number, locale: string): string =>
  new Date(timestamp).toLocaleString(locale, {
    year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  });
