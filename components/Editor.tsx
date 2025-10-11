import React, { useState, useRef, useEffect } from 'react';
import { SearchResult } from '../types';

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  scrollToLine?: number | null;
  scrollToMatchIndex?: number | null;
  onScrollComplete: () => void;
  onCursorActivity: (lineNumber: number) => void;
  searchQuery: string;
  searchResults: SearchResult[];
  activeMatchIndex: number | null;
}

const LINE_HEIGHT = 24; // Approximation of line height in pixels for scrolling

const Editor: React.FC<EditorProps> = ({
  value,
  onChange,
  scrollToLine,
  scrollToMatchIndex,
  onScrollComplete,
  onCursorActivity,
  searchQuery,
  searchResults,
  activeMatchIndex,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollToLine !== null && textareaRef.current) {
      // Scroll to a specific line number from the outline view
      textareaRef.current.scrollTop = scrollToLine * LINE_HEIGHT;
      onScrollComplete();
    }
  }, [scrollToLine, onScrollComplete]);

  useEffect(() => {
    if (scrollToMatchIndex !== null && textareaRef.current && searchResults[scrollToMatchIndex]) {
      // Scroll to a specific search result
      const match = searchResults[scrollToMatchIndex];
      const textUpToMatch = value.substring(0, match.startIndex);
      const linesUpToMatch = textUpToMatch.split('\n').length - 1;
      // Scroll the match to the vertical center of the textarea
      const targetScrollTop = (linesUpToMatch * LINE_HEIGHT) - (textareaRef.current.clientHeight / 2);
      textareaRef.current.scrollTop = Math.max(0, targetScrollTop);
      onScrollComplete();
    }
  }, [scrollToMatchIndex, searchResults, value, onScrollComplete]);


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
    if (!searchQuery || searchResults.length === 0) {
      // Add a newline to prevent scroll height miscalculation on empty editor
      return <>{value + '\n'}</>;
    }
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;

    searchResults.forEach((match, index) => {
      if (match.startIndex > lastIndex) {
        parts.push(value.substring(lastIndex, match.startIndex));
      }
      parts.push(
        <mark key={`match-${index}`} className={index === activeMatchIndex ? 'active-match' : ''}>
          {value.substring(match.startIndex, match.endIndex)}
        </mark>
      );
      lastIndex = match.endIndex;
    });

    if (lastIndex < value.length) {
      parts.push(value.substring(lastIndex));
    }
    // Add a newline to prevent scroll height miscalculation
    parts.push('\n');
    return parts;
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

  return (
    <div className="h-full w-full editor-wrapper relative">
       <div ref={backdropRef} className="editor-backdrop">
        {renderHighlightedText()}
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
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
