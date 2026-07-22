import React, { useState, useRef, useEffect } from 'react';
import { CopyIcon, CheckIcon, ImageIcon } from './icons';

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  onImagePasted: (dataUrl: string) => string;
  scrollToLine?: number | null;
  onScrollComplete: () => void;
  onCursorActivity: (lineNumber: number) => void;
}

const LINE_HEIGHT = 24; // Approximation of line height in pixels for scrolling

const Editor: React.FC<EditorProps> = ({
  value,
  onChange,
  onImagePasted,
  scrollToLine,
  onScrollComplete,
  onCursorActivity,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);


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
  
  const processAndInsertImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
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
      }
    };
    reader.readAsDataURL(file);
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

  return (
    <div
      className="h-full w-full editor-wrapper relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDraggingOver && (
        <div className="absolute inset-0 bg-accent/40 backdrop-blur-sm border-2 border-dashed border-white rounded-2xl flex items-center justify-center z-20 pointer-events-none">
          <span className="text-white font-semibold text-xl tracking-tight">拖曳圖片至此以上傳</span>
        </div>
      )}

      <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-2 rounded-full bg-elevated shadow-apple-xs hover:bg-border-color/40 transition-all duration-150 ease-apple active:scale-90 text-text-secondary"
          title="上傳圖片"
        >
          <ImageIcon className="w-4 h-4" />
        </button>
        <button
          onClick={handleCopy}
          className="p-2 rounded-full bg-elevated shadow-apple-xs hover:bg-border-color/40 transition-all duration-150 ease-apple active:scale-90 text-text-secondary"
          title={isCopied ? "已複製！" : "複製內容"}
        >
          {isCopied ? (
            <CheckIcon className="w-4 h-4 text-green-500" />
          ) : (
            <CopyIcon className="w-4 h-4" />
          )}
        </button>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />

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
        placeholder="在這裡開始您的筆記..."
        className="editor-textarea"
        spellCheck="false"
        autoCapitalize="off"
        autoCorrect="off"
      />
    </div>
  );
};

export default Editor;
