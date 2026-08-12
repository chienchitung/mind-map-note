import React, { useState, useRef, useEffect, useMemo, Suspense, lazy } from 'react';
import { CopyIcon, CheckIcon, ImageIcon } from './icons';
import Spinner from './Spinner';
import { Images } from '../types';
import { compressImageFile } from '../utils/imageCompression';
import { computeTextStats } from '../utils/textStats';
import { useTranslation } from '../contexts/LanguageContext';

// TipTap/ProseMirror add real weight (~300KB gzip) and are only needed once
// a user opts into rich mode, so keep them out of the initial bundle that
// every load — including plain-text-only users — would otherwise pay for.
const RichTextEditor = lazy(() => import('./RichTextEditor'));

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  onImagePasted: (dataUrl: string) => string;
  images: Images;
  scrollToLine?: number | null;
  onScrollComplete: () => void;
  // Consumed by rich (Aa) mode only — plain mode's textarea uses
  // scrollToLine instead. See findBlockOrdinal in utils/markdownParser.ts.
  scrollToBlockOrdinal?: number | null;
  onBlockScrollComplete: () => void;
  onCursorActivity: (lineNumber: number) => void;
}

const LINE_HEIGHT = 24; // Approximation of line height in pixels for scrolling

type EditMode = 'plain' | 'rich';

const Editor: React.FC<EditorProps> = ({
  value,
  onChange,
  onImagePasted,
  images,
  scrollToLine,
  onScrollComplete,
  scrollToBlockOrdinal,
  onBlockScrollComplete,
  onCursorActivity,
}) => {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  // Plain mode is the existing raw-Markdown textarea; rich mode is a
  // toolbar-driven WYSIWYG view (headings/bold/lists/quote buttons) backed
  // by the same underlying Markdown string — neither replaces the other,
  // both edit the identical `value`/`onChange`.
  const [mode, setMode] = useState<EditMode>('plain');


  useEffect(() => {
    if (scrollToLine !== null && textareaRef.current) {
      // Scroll to a specific line number from the outline view
      textareaRef.current.scrollTop = scrollToLine * LINE_HEIGHT;
      onScrollComplete();
    }
  }, [scrollToLine, onScrollComplete]);

  const handleCursorActivity = () => {
    if (textareaRef.current) {
        const cursorPosition = textareaRef.current.selectionStart;
        const textUpToCursor = textareaRef.current.value.substring(0, cursorPosition);
        const lineNumber = textUpToCursor.split('\n').length - 1;
        onCursorActivity(lineNumber);
    }
  };
  
  const handleScroll = () => {
    if (textareaRef.current && backdropRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop;
      backdropRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  const renderHighlightedText = () => {
    // Add a newline to prevent scroll height miscalculation on empty editor
    return <>{value + '\n'}</>;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    const { selectionStart, selectionEnd, value } = target;

    // Handle automatic list continuation on Enter
    if (e.key === 'Enter' && selectionStart === selectionEnd) {
      // Find the current line's text
      const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
      const lineEnd = value.indexOf('\n', selectionStart);
      const currentLine = value.substring(lineStart, lineEnd === -1 ? value.length : lineEnd);

      // Check for bulleted list item (e.g., "- ", "* ", "+ ")
      const bulletMatch = currentLine.match(/^(\s*[-*+]\s+)(.*)$/);
      if (bulletMatch) {
        e.preventDefault();
        const prefix = bulletMatch[1];
        const content = bulletMatch[2];
        
        if (content.trim() === '') { // Empty list item, so break out
          const newValue = value.substring(0, lineStart) + value.substring(selectionStart);
          onChange(newValue);
          setTimeout(() => { target.selectionStart = target.selectionEnd = lineStart; }, 0);
        } else { // Continue list
          const newValue = `${value.substring(0, selectionStart)}\n${prefix}${value.substring(selectionEnd)}`;
          onChange(newValue);
          setTimeout(() => { target.selectionStart = target.selectionEnd = selectionStart + 1 + prefix.length; }, 0);
        }
        return;
      }
      
      // Check for numbered list item (e.g., "1. ")
      const numberedMatch = currentLine.match(/^(\s*)(\d+)(\.\s+)(.*)$/);
      if (numberedMatch) {
        e.preventDefault();
        const indent = numberedMatch[1];
        const number = parseInt(numberedMatch[2], 10);
        const delimiter = numberedMatch[3];
        const content = numberedMatch[4];

        if (content.trim() === '') { // Empty list item, so break out
            const newValue = value.substring(0, lineStart) + value.substring(selectionStart);
            onChange(newValue);
            setTimeout(() => { target.selectionStart = target.selectionEnd = lineStart; }, 0);
        } else { // Continue list with incremented number
            const newPrefix = `${indent}${number + 1}${delimiter}`;
            const newValue = `${value.substring(0, selectionStart)}\n${newPrefix}${value.substring(selectionEnd)}`;
            onChange(newValue);
            setTimeout(() => { target.selectionStart = target.selectionEnd = selectionStart + 1 + newPrefix.length; }, 0);
        }
        return;
      }
    }

    // Handle Tab for indentation/outdentation
    if (e.key === 'Tab') {
      e.preventDefault();
      const lines = value.split('\n');
      const startLineIndex = value.substring(0, selectionStart).split('\n').length - 1;
      const endLineIndex = value.substring(0, selectionEnd).split('\n').length - 1;
      
      let newMarkdown = value;
      let newCursorStart = selectionStart;
      let newCursorEnd = selectionEnd;

      if (!e.shiftKey) { // Indent
        let addedChars = 0;
        for (let i = startLineIndex; i <= endLineIndex; i++) {
          lines[i] = '  ' + lines[i];
          if (i === startLineIndex) newCursorStart += 2;
          addedChars += 2;
        }
        newCursorEnd += addedChars;
      } else { // Outdent
        let removedCharsTotal = 0;
        // FIX: Define lineStart to calculate cursor position correctly when outdenting.
        const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
        for (let i = startLineIndex; i <= endLineIndex; i++) {
          let removedCharsLine = 0;
          if (lines[i].startsWith('  ')) {
            lines[i] = lines[i].substring(2);
            removedCharsLine = 2;
          } else if (lines[i].startsWith(' ')) {
            lines[i] = lines[i].substring(1);
            removedCharsLine = 1;
          }
          if (i === startLineIndex) newCursorStart = Math.max(lineStart, newCursorStart - removedCharsLine);
          removedCharsTotal += removedCharsLine;
        }
        newCursorEnd -= removedCharsTotal;
      }
      
      newMarkdown = lines.join('\n');
      
      if (newMarkdown !== value) {
        onChange(newMarkdown);
        // Defer cursor position update to after the re-render
        setTimeout(() => {
          target.selectionStart = newCursorStart;
          target.selectionEnd = newCursorEnd;
        }, 0);
      }
    }
  };

  const handleCopy = () => {
    if (value) {
      navigator.clipboard.writeText(value).then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      }).catch(err => {
        console.error('Failed to copy text: ', err);
      });
    }
  };
  
  const processAndInsertImage = async (file: File) => {
    const dataUrl = await compressImageFile(file);
    const imageId = onImagePasted(dataUrl);
    const markdownImage = `![${file.name}](image://${imageId})\n`;

    const textarea = textareaRef.current;
    if (textarea) {
      const { selectionStart, selectionEnd, value } = textarea;
      const newValue =
        value.substring(0, selectionStart) +
        markdownImage +
        value.substring(selectionEnd);

      onChange(newValue);

      // Move cursor after the inserted markdown
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = selectionStart + markdownImage.length;
      }, 0);
    }
  };

  // FIX: Using a traditional for-loop to iterate over clipboard items. This can be more
  // robust for type inference in some TypeScript environments, preventing items from
  // being incorrectly typed as `unknown`.
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            e.preventDefault();
            const file = item.getAsFile();
            if (file) {
              processAndInsertImage(file);
            }
            return; // Handle only the first image
        }
    }
  };
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processAndInsertImage(file);
    }
    e.target.value = ''; // Allow uploading the same file again
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      // FIX: Using a traditional for-loop to iterate over dropped files. This can be more
      // robust for type inference in some TypeScript environments, preventing files from
      // being incorrectly typed as `unknown`.
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const file = e.dataTransfer.files[i];
        if (file && file.type.startsWith('image/')) {
          processAndInsertImage(file);
          break; // Process only the first valid image file
        }
      }
    }
  };

  // A pending outline-jump request (scrollToLine or scrollToBlockOrdinal)
  // only ever gets consumed by whichever sub-mode is actually mounted —
  // the other one just leaves it sitting there unconsumed. Switching modes
  // must clear both explicitly, or a stale request would fire an
  // unexpected jump the moment the other renderer mounts.
  const handleModeChange = (newMode: EditMode) => {
    setMode(newMode);
    onScrollComplete();
    onBlockScrollComplete();
  };

  const modeToggle = (
    <div className="flex items-center bg-elevated rounded-full p-0.5 shadow-apple-xs">
      <button
        onClick={() => handleModeChange('plain')}
        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors duration-150 ease-apple ${mode === 'plain' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-main'}`}
        title={t('editor.plainMode')}
        aria-label={t('editor.plainModeLabel')}
        aria-pressed={mode === 'plain'}
      >
        MD
      </button>
      <button
        onClick={() => handleModeChange('rich')}
        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors duration-150 ease-apple ${mode === 'rich' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-main'}`}
        title={t('editor.richMode')}
        aria-label={t('editor.richModeLabel')}
        aria-pressed={mode === 'rich'}
      >
        Aa
      </button>
    </div>
  );

  const copyButton = (
    <button
      onClick={handleCopy}
      className="p-2 rounded-full bg-elevated shadow-apple-xs hover:bg-border-color/40 transition-all duration-150 ease-apple active:scale-90 text-text-secondary"
      title={isCopied ? t('editor.copied') : t('editor.copyContent')}
      aria-label={isCopied ? t('editor.copiedLabel') : t('editor.copyContent')}
    >
      {isCopied ? (
        <CheckIcon className="w-4 h-4 text-green-500" />
      ) : (
        <CopyIcon className="w-4 h-4" />
      )}
    </button>
  );

  const uploadButton = (
    <button
      onClick={() => fileInputRef.current?.click()}
      className="p-2 rounded-full bg-elevated shadow-apple-xs hover:bg-border-color/40 transition-all duration-150 ease-apple active:scale-90 text-text-secondary"
      title={t('editor.uploadImage')}
      aria-label={t('editor.uploadImage')}
    >
      <ImageIcon className="w-4 h-4" />
    </button>
  );

  const { characters, words } = useMemo(() => computeTextStats(value), [value]);
  const statsBadge = (
    <div
      className="px-2.5 py-1 rounded-full bg-elevated shadow-apple-xs text-xs text-text-secondary whitespace-nowrap select-none"
      title={t('editor.statsLabel')}
    >
      {t('editor.stats', { chars: characters.toLocaleString(), words: words.toLocaleString() })}
    </div>
  );

  return (
    <div
      className="h-full w-full editor-wrapper relative flex flex-col"
      onDragOver={mode === 'plain' ? handleDragOver : undefined}
      onDragLeave={mode === 'plain' ? handleDragLeave : undefined}
      onDrop={mode === 'plain' ? handleDrop : undefined}
    >
      {isDraggingOver && (
        <div className="absolute inset-0 bg-accent/40 backdrop-blur-sm border-2 border-dashed border-white rounded-2xl flex items-center justify-center z-20 pointer-events-none">
          <span className="text-white font-semibold text-xl tracking-tight">{t('editor.dropImageHint')}</span>
        </div>
      )}

      {mode === 'plain' && (
        <>
          {/* Mobile: a normal in-flow toolbar row above the text, so it
              never sits on top of the first line the user is writing —
              unlike the floating desktop version, narrow screens have no
              margin for it to float in without covering content. */}
          <div className="flex md:hidden items-center gap-1.5 px-3 pt-3 pb-1 flex-shrink-0">
            {modeToggle}
            {uploadButton}
            <div className="flex-grow" />
            {statsBadge}
            {copyButton}
          </div>
          <div className="hidden md:flex absolute top-3 right-3 z-10 items-center gap-1.5">
            {statsBadge}
            {modeToggle}
            {uploadButton}
            {copyButton}
          </div>
        </>
      )}

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />

      {mode === 'plain' ? (
        <div className="relative flex-1 min-h-0">
          <div ref={backdropRef} className="editor-backdrop">
            {renderHighlightedText()}
          </div>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onClick={handleCursorActivity}
            onKeyUp={handleCursorActivity}
            onScroll={handleScroll}
            placeholder={t('editor.placeholder')}
            className="editor-textarea"
            spellCheck="false"
            autoCapitalize="off"
            autoCorrect="off"
          />
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <Suspense fallback={<div className="h-full flex items-center justify-center"><Spinner className="w-6 h-6 text-accent" /></div>}>
            <RichTextEditor
              value={value}
              onChange={onChange}
              onImagePasted={onImagePasted}
              images={images}
              toolbarExtras={<>{statsBadge}{modeToggle}{copyButton}</>}
              scrollToBlockOrdinal={scrollToBlockOrdinal}
              onScrollComplete={onBlockScrollComplete}
            />
          </Suspense>
        </div>
      )}
    </div>
  );
};

export default Editor;
