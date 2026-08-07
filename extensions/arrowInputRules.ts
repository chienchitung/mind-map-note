import { Extension, textInputRule } from '@tiptap/core';

// Typing an ASCII arrow (as you'd write in plain text) auto-converts to the
// real Unicode arrow character as soon as the closing character is typed —
// matches the shorthand notation used throughout AI-generated notes (see
// e.g. the $\rightarrow$ LaTeX MarkdownPreview.tsx already renders) without
// needing math-mode syntax for something this simple in the rich editor.
export const ArrowInputRules = Extension.create({
  name: 'arrowInputRules',

  addInputRules() {
    return [
      textInputRule({ find: /-->$/, replace: '→' }),
      textInputRule({ find: /<--$/, replace: '←' }),
    ];
  },
});

export default ArrowInputRules;
