import React, { useContext, useEffect, useMemo, useRef } from 'react';
import { useEditor, EditorContent, ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import { Extension, Node, type NodeViewProps } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import TiptapImage from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import DOMPurify from 'dompurify';
import 'katex/dist/katex.min.css';
import { Markdown } from 'tiptap-markdown';
import { JoinAdjacentLists } from '../extensions/joinAdjacentLists';
import { ArrowInputRules } from '../extensions/arrowInputRules';
import { Images } from '../types';
import { BoldIcon, ItalicIcon, QuoteIcon, BulletListIcon, OrderedListIcon, ImageIcon } from './icons';
import { compressImageFile } from '../utils/imageCompression';
import { renderMathToHtml } from '../utils/renderMathToHtml';
import { useTranslation } from '../contexts/LanguageContext';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  onImagePasted: (dataUrl: string) => string;
  images: Images;
  // Editor.tsx's mode toggle / copy button — rendered inline at the end of
  // this component's own toolbar row instead of floating in the corner
  // (unlike plain-text mode, this toolbar already occupies that corner,
  // and the two would otherwise overlap on narrow/mobile widths).
  toolbarExtras?: React.ReactNode;
  // Set by the outline view to jump to a specific heading/list-item — see
  // findBlockOrdinal in utils/markdownParser.ts for what this index means.
  scrollToBlockOrdinal?: number | null;
  onScrollComplete?: () => void;
}

// ReactNodeViewRenderer mounts node views via a portal into the same React
// tree, so — unlike `extension.options`, which is only read once at editor
// construction — a context value here stays live: the node view re-renders
// whenever `images` changes, even though the underlying ProseMirror node
// (and its `image://<id>` attrs.src) never does.
const ImagesContext = React.createContext<Images>({});

// The doc model only ever stores `image://<id>` as the node's `src` (kept
// byte-for-byte identical to how plain-text mode already writes it, via the
// stock markdown serializer — nothing custom needed there). This node view
// is purely a *display* concern: it resolves that reference to the actual
// base64 data URL from `images` so the picture actually shows up while
// editing, without ever writing the (huge) data URL back into the document.
const ImageNodeView: React.FC<NodeViewProps> = ({ node }) => {
  const images = useContext(ImagesContext);
  const { t } = useTranslation();
  const rawSrc: string = node.attrs.src || '';
  const resolvedSrc = rawSrc.startsWith('image://')
    ? images[rawSrc.slice('image://'.length)]
    : rawSrc;

  return (
    <NodeViewWrapper as="span" className="inline-block max-w-full">
      {resolvedSrc ? (
        <img src={resolvedSrc} alt={node.attrs.alt || ''} className="max-w-full rounded-lg my-1" />
      ) : (
        <span className="inline-block px-2 py-1 rounded bg-secondary text-text-secondary text-xs">{t('richEditor.imageLoading')}</span>
      )}
    </NodeViewWrapper>
  );
};

const ResolvingImage = TiptapImage.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },
});

// Renders the node's stored LaTeX via the same shared renderer
// MarkdownPreview.tsx uses (same backslash-quirk handling, same
// html-only-output choice), so a note's math renders identically whether
// viewed in Preview or edited here in Aa mode. Unlike MarkdownPreview,
// nothing downstream sanitizes this node's output afterward, so it's
// sanitized right here before injection.
const MathNodeView: React.FC<NodeViewProps> = ({ node }) => {
  const latex: string = node.attrs.latex || '';
  const displayMode: boolean = !!node.attrs.displayMode;
  const html = useMemo(
    () => DOMPurify.sanitize(renderMathToHtml(latex, displayMode)),
    [latex, displayMode]
  );

  return (
    <NodeViewWrapper
      as="span"
      className={displayMode ? 'block my-1' : 'inline'}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

// An atomic (not directly text-editable) inline node — same trade-off as
// images above: editing means deleting and retyping it, not clicking in to
// tweak the source, but that keeps this consistent with how images already
// work here rather than building a second, different in-place-edit
// interaction just for math.
const MathNode = Node.create({
  name: 'math',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      latex: { default: '' },
      displayMode: { default: false },
    };
  },

  parseHTML() {
    return [{
      tag: 'span[data-math-latex]',
      getAttrs: (element) => ({
        latex: (element as HTMLElement).getAttribute('data-math-latex') || '',
        displayMode: (element as HTMLElement).getAttribute('data-math-display') === 'true',
      }),
    }];
  },

  renderHTML({ node }) {
    return ['span', { 'data-math-latex': node.attrs.latex, 'data-math-display': String(node.attrs.displayMode) }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathNodeView);
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: { write: (text: string) => void }, node: { attrs: { latex: string; displayMode: boolean } }) {
          const latex = node.attrs.latex || '';
          state.write(node.attrs.displayMode ? `$$${latex}$$` : `$${latex}$`);
        },
      },
    };
  },
});

// tiptap-markdown's underlying parser has no notion of $...$/$$...$$ math
// (it isn't CommonMark), so raw LaTeX just comes through as plain text —
// this converts it into MathNode after the fact instead, the same
// heal-after-the-edit approach JoinAdjacentLists uses, rather than hooking
// into the markdown-it tokenizer directly. Runs on every transaction, so it
// also fires while live-typing: the moment a closing `$` completes a match,
// that span converts immediately, the same as the arrow input rules do.
// Skips text inside inline code or a code block, so e.g. a shell snippet's
// `$HOME` isn't mistaken for math. Mirrors extractMath's heuristics in
// MarkdownPreview.tsx: the inline pattern requires a non-whitespace
// character on both sides of the `$`s (and no `$`/newline in between) so
// ordinary prose like "$5 and $10" isn't matched as math.
const BLOCK_MATH_PATTERN = /\$\$([\s\S]+?)\$\$/;
const INLINE_MATH_PATTERN = /\$(?!\s)((?:\\\$|[^$\n])+?)(?<!\s)\$/;

const MathConversion = Extension.create({
  name: 'mathConversion',

  addProseMirrorPlugins() {
    const extension = this;

    // Finds the first remaining $...$/$$...$$ run and replaces it, as its
    // own transaction dispatched directly against the view. Returns whether
    // it found (and converted) one, so the caller can loop until none are
    // left — a single edit (e.g. pasting a note with several formulas) can
    // contain more than one.
    const convertOnce = (): boolean => {
      const { view } = extension.editor;
      const mathType = view.state.schema.nodes.math;
      if (!mathType) return false;

      let match: { from: number; to: number; latex: string; displayMode: boolean } | null = null;
      view.state.doc.descendants((node, pos, parent) => {
        if (match) return false;
        if (!node.isText || !node.text) return true;
        if (node.marks.some((mark) => mark.type.name === 'code')) return true;
        if (parent?.type.name === 'codeBlock') return true;

        const blockMatch = BLOCK_MATH_PATTERN.exec(node.text);
        const inlineMatch = !blockMatch ? INLINE_MATH_PATTERN.exec(node.text) : null;
        const found = blockMatch || inlineMatch;
        if (!found || found.index === undefined) return true;

        match = {
          from: pos + found.index,
          to: pos + found.index + found[0].length,
          latex: found[1],
          displayMode: !!blockMatch,
        };
        return false;
      });

      if (!match) return false;
      const { from, to, latex, displayMode } = match;
      view.dispatch(view.state.tr.replaceWith(from, to, mathType.create({ latex, displayMode })));
      return true;
    };

    return [
      new Plugin({
        key: new PluginKey('mathConversion'),
        appendTransaction(transactions) {
          if (!transactions.some((transaction) => transaction.docChanged)) return null;
          // Creating a NodeView-backed node synchronously inside
          // appendTransaction can fire while React is still mid-render for
          // the keystroke that triggered it ("flushSync was called from
          // inside a lifecycle method"). Deferring to a microtask lets that
          // render finish first; each dispatch below becomes its own
          // independent update cycle instead of nesting inside the original one.
          queueMicrotask(() => {
            if (extension.editor.isDestroyed) return;
            let guard = 0;
            while (convertOnce() && guard++ < 50) {
              // keep converting until nothing's left to convert
            }
          });
          return null;
        },
      }),
    ];
  },
});

interface ToolbarButtonProps {
  onClick: () => void;
  active: boolean;
  title: string;
  children: React.ReactNode;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({ onClick, active, title, children }) => (
  <button
    type="button"
    onMouseDown={(e) => e.preventDefault()} // keep the editor selection from collapsing before the command runs
    onClick={onClick}
    title={title}
    aria-label={title}
    aria-pressed={active}
    className={`px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors duration-150 ease-apple ${
      active ? 'bg-accent text-white' : 'text-text-secondary hover:bg-secondary hover:text-text-main'
    }`}
  >
    {children}
  </button>
);

// React StrictMode's dev-only double-mount can hand back a not-yet-fully-
// initialized (or already-torn-down) editor instance for one render pass;
// guard every access instead of assuming `.storage.markdown` is there.
const getMarkdownStorage = (editor: ReturnType<typeof useEditor>): { getMarkdown: () => string } | null =>
  (editor?.storage as any)?.markdown ?? null;

const RichTextEditor: React.FC<RichTextEditorProps> = ({ value, onChange, onImagePasted, images, toolbarExtras, scrollToBlockOrdinal, onScrollComplete }) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      ResolvingImage,
      Placeholder.configure({ placeholder: t('richEditor.placeholder') }),
      Markdown.configure({ html: false, transformPastedText: true, transformCopiedText: true }),
      JoinAdjacentLists,
      ArrowInputRules,
      MathNode,
      MathConversion,
    ],
    content: value,
    onUpdate: ({ editor }) => {
      const markdownStorage = getMarkdownStorage(editor);
      if (markdownStorage) onChange(markdownStorage.getMarkdown());
    },
    editorProps: {
      attributes: {
        class: 'rich-editor-content',
      },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.kind === 'file' && item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) {
              event.preventDefault();
              insertImageFile(file);
            }
            return true;
          }
        }
        return false;
      },
      handleDrop: (view, event) => {
        const files = event.dataTransfer?.files;
        if (files && files.length > 0 && files[0].type.startsWith('image/')) {
          event.preventDefault();
          insertImageFile(files[0]);
          return true;
        }
        return false;
      },
    },
  }, []);

  const insertImageFile = async (file: File) => {
    const dataUrl = await compressImageFile(file);
    if (editor) {
      const imageId = onImagePasted(dataUrl);
      editor.chain().focus().setImage({ src: `image://${imageId}`, alt: file.name }).run();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) insertImageFile(file);
    e.target.value = ''; // allow uploading the same file again
  };

  // Keep the editor in sync with external changes (undo/redo, switching
  // notes) without fighting the user's own typing: only push `value` in
  // when it actually differs from what the editor would itself produce,
  // and skip re-emitting `onUpdate` for that programmatic write.
  useEffect(() => {
    const markdownStorage = getMarkdownStorage(editor);
    if (!editor || !markdownStorage) return;
    const currentMarkdown = markdownStorage.getMarkdown();
    if (value !== currentMarkdown) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  // Jumps to the ordinal-th heading/list-item node in the document — see
  // findBlockOrdinal in utils/markdownParser.ts. ProseMirror's own
  // doc.descendants() walk visits nodes in document order (parent before
  // its own children), the same order that ordinal was computed in, so the
  // count-as-you-go below lands on the same block regardless of the two
  // completely different parsers involved.
  useEffect(() => {
    if (scrollToBlockOrdinal == null || !editor) return;
    let count = 0;
    let targetPos: number | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (targetPos !== null) return false;
      if (node.type.name === 'heading' || node.type.name === 'listItem') {
        if (count === scrollToBlockOrdinal) {
          targetPos = pos;
          return false;
        }
        count++;
      }
      return true;
    });
    if (targetPos !== null) {
      const dom = editor.view.nodeDOM(targetPos);
      if (dom instanceof HTMLElement) {
        dom.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
    }
    onScrollComplete?.();
  }, [scrollToBlockOrdinal, editor, onScrollComplete]);

  if (!editor) return null;

  return (
    <div className="h-full w-full flex flex-col">
      <div className="flex items-center gap-1 px-2 py-2 border-b border-border-color/70 flex-wrap flex-shrink-0">
        <ToolbarButton title={t('richEditor.heading1')} active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
          H1
        </ToolbarButton>
        <ToolbarButton title={t('richEditor.heading2')} active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          H2
        </ToolbarButton>
        <ToolbarButton title={t('richEditor.heading3')} active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          H3
        </ToolbarButton>
        <div className="w-px h-5 bg-border-color mx-1"></div>
        <ToolbarButton title={t('richEditor.bold')} active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
          <BoldIcon className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton title={t('richEditor.italic')} active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <ItalicIcon className="w-4 h-4" />
        </ToolbarButton>
        <div className="w-px h-5 bg-border-color mx-1"></div>
        <ToolbarButton title={t('richEditor.blockquote')} active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <QuoteIcon className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton title={t('richEditor.bulletList')} active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <BulletListIcon className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton title={t('richEditor.orderedList')} active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <OrderedListIcon className="w-4 h-4" />
        </ToolbarButton>
        <div className="w-px h-5 bg-border-color mx-1"></div>
        <ToolbarButton title={t('richEditor.insertImage')} active={false} onClick={() => fileInputRef.current?.click()}>
          <ImageIcon className="w-4 h-4" />
        </ToolbarButton>
        {toolbarExtras && <div className="ml-auto flex items-center gap-1.5">{toolbarExtras}</div>}
      </div>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />
      <div className="flex-grow overflow-y-auto">
        <ImagesContext.Provider value={images}>
          <EditorContent editor={editor} className="h-full" />
        </ImagesContext.Provider>
      </div>
    </div>
  );
};

export default RichTextEditor;
