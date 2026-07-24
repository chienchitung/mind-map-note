import React, { useContext, useEffect } from 'react';
import { useEditor, EditorContent, ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TiptapImage from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import { Images } from '../types';
import { BoldIcon, ItalicIcon, QuoteIcon, BulletListIcon, OrderedListIcon } from './icons';

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
  const rawSrc: string = node.attrs.src || '';
  const resolvedSrc = rawSrc.startsWith('image://')
    ? images[rawSrc.slice('image://'.length)]
    : rawSrc;

  return (
    <NodeViewWrapper as="span" className="inline-block max-w-full">
      {resolvedSrc ? (
        <img src={resolvedSrc} alt={node.attrs.alt || ''} className="max-w-full rounded-lg my-1" />
      ) : (
        <span className="inline-block px-2 py-1 rounded bg-secondary text-text-secondary text-xs">圖片載入中…</span>
      )}
    </NodeViewWrapper>
  );
};

const ResolvingImage = TiptapImage.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
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

const RichTextEditor: React.FC<RichTextEditorProps> = ({ value, onChange, onImagePasted, images, toolbarExtras }) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      ResolvingImage,
      Placeholder.configure({ placeholder: '在這裡開始您的筆記…' }),
      Markdown.configure({ html: false, transformPastedText: true, transformCopiedText: true }),
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

  const insertImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl && editor) {
        const imageId = onImagePasted(dataUrl);
        editor.chain().focus().setImage({ src: `image://${imageId}`, alt: file.name }).run();
      }
    };
    reader.readAsDataURL(file);
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

  if (!editor) return null;

  return (
    <div className="h-full w-full flex flex-col">
      <div className="flex items-center gap-1 px-2 py-2 border-b border-border-color/70 flex-wrap flex-shrink-0">
        <ToolbarButton title="標題 1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
          H1
        </ToolbarButton>
        <ToolbarButton title="標題 2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          H2
        </ToolbarButton>
        <ToolbarButton title="標題 3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          H3
        </ToolbarButton>
        <div className="w-px h-5 bg-border-color mx-1"></div>
        <ToolbarButton title="粗體 (⌘B)" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
          <BoldIcon className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton title="斜體 (⌘I)" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <ItalicIcon className="w-4 h-4" />
        </ToolbarButton>
        <div className="w-px h-5 bg-border-color mx-1"></div>
        <ToolbarButton title="引言" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <QuoteIcon className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton title="項目清單" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <BulletListIcon className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton title="編號清單" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <OrderedListIcon className="w-4 h-4" />
        </ToolbarButton>
        {toolbarExtras && <div className="ml-auto flex items-center gap-1.5">{toolbarExtras}</div>}
      </div>
      <div className="flex-grow overflow-y-auto">
        <ImagesContext.Provider value={images}>
          <EditorContent editor={editor} className="h-full" />
        </ImagesContext.Provider>
      </div>
    </div>
  );
};

export default RichTextEditor;
