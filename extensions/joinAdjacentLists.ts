import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { canJoin } from '@tiptap/pm/transform';

// ProseMirror's default handling of Backspace on an emptied *middle* list
// item "lifts" that item out into a plain paragraph instead of properly
// removing it — fine at the very end of a list (that's the standard way to
// exit one), but in the middle it leaves a stray empty paragraph sitting
// between what's now two separate <ol>/<ul> elements, each restarting its
// own numbering from 1. This heals that after every edit: any same-type
// list directly followed by another (with or without an empty paragraph
// between them) gets joined back into one continuous list, whichever input
// path produced the split.
export const JoinAdjacentLists = Extension.create({
  name: 'joinAdjacentLists',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('joinAdjacentLists'),
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((transaction) => transaction.docChanged)) return null;

          const tr = newState.tr;
          let modified = false;

          const tryFixOnce = (): boolean => {
            let fixed = false;
            tr.doc.descendants((node, pos) => {
              if (fixed) return false;
              if (node.type.name !== 'orderedList' && node.type.name !== 'bulletList') return true;

              const afterListPos = pos + node.nodeSize;
              const nextSibling = tr.doc.resolve(afterListPos).nodeAfter;
              if (!nextSibling) return true;

              if (nextSibling.type === node.type) {
                if (canJoin(tr.doc, afterListPos)) {
                  tr.join(afterListPos);
                  fixed = true;
                  return false;
                }
              } else if (nextSibling.type.name === 'paragraph' && nextSibling.content.size === 0) {
                const afterParagraphPos = afterListPos + nextSibling.nodeSize;
                const nextNextSibling = tr.doc.resolve(afterParagraphPos).nodeAfter;
                if (nextNextSibling && nextNextSibling.type === node.type) {
                  tr.delete(afterListPos, afterParagraphPos);
                  if (canJoin(tr.doc, afterListPos)) {
                    tr.join(afterListPos);
                  }
                  fixed = true;
                  return false;
                }
              }
              return true;
            });
            return fixed;
          };

          // A single edit can produce more than one split (e.g. deleting a
          // multi-line selection spanning several items), so keep healing
          // until nothing's left to fix rather than assuming one pass covers it.
          let guard = 0;
          while (tryFixOnce() && guard++ < 10) {
            modified = true;
          }

          return modified ? tr : null;
        },
      }),
    ];
  },
});

export default JoinAdjacentLists;
