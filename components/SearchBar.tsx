import React, { forwardRef, useState, useRef, useEffect } from 'react';
import { SearchIcon, XIcon, FileIcon } from './icons';
import { escapeRegExp } from '../utils/escapeRegExp';

interface SearchResultItem {
  id: string;
  name: string;
  snippet: string;
}

interface SearchBarProps {
    query: string;
    onQueryChange: (query: string) => void;
    onClear: () => void;
    results: SearchResultItem[];
    onResultClick: (noteId: string) => void;
}

const HighlightMatch: React.FC<{ text: string; query: string }> = ({ text, query }) => {
    if (!query.trim()) {
      return <span>{text}</span>;
    }
    try {
      const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
      const parts = text.split(regex);
      return (
        <>
          {parts.map((part, index) =>
            part.toLowerCase() === query.toLowerCase() ? (
              <strong key={index} className="text-accent group-hover:text-white font-bold">
                {part}
              </strong>
            ) : (
              <span key={index}>{part}</span>
            )
          )}
        </>
      );
    } catch (e) {
      // Fallback for invalid regex
      return <span>{text}</span>;
    }
};

const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>((
    {
        query,
        onQueryChange,
        onClear,
        results,
        onResultClick,
    },
    ref
) => {
    const [isFocused, setIsFocused] = useState(false);
    const searchContainerRef = useRef<HTMLDivElement>(null);

    const showResults = isFocused && query.length > 0;

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
                setIsFocused(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);
    
    const handleResultClick = (noteId: string) => {
        onResultClick(noteId);
        setIsFocused(false);
    };

    return (
        <div ref={searchContainerRef} className="relative w-full max-w-sm">
            <div className={`flex items-center gap-2 bg-secondary px-3 py-1.5 rounded-full border w-full transition-colors duration-150 ease-apple ${isFocused ? 'border-accent' : 'border-transparent'}`}>
                <SearchIcon className="w-4 h-4 text-text-secondary flex-shrink-0" />
                <input
                    ref={ref}
                    type="text"
                    placeholder="搜尋所有筆記... (⌘F)"
                    aria-label="搜尋所有筆記"
                    value={query}
                    onChange={(e) => onQueryChange(e.target.value)}
                    onFocus={() => setIsFocused(true)}
                    className="bg-transparent focus:outline-none text-text-main w-full text-sm placeholder:text-text-secondary"
                />
                {query.length > 0 && (
                    <button onClick={onClear} className="p-1 rounded-full hover:bg-border-color/60 transition-colors" title="清除搜尋" aria-label="清除搜尋">
                        <XIcon className="w-3.5 h-3.5 text-text-secondary" />
                    </button>
                )}
            </div>

            {showResults && (
                <div className="absolute top-full mt-2 w-full glass-surface-solid border border-border-color/70 rounded-2xl shadow-apple-md z-30 max-h-80 overflow-y-auto p-1.5">
                    {results.length > 0 ? (
                        <ul>
                            {results.map(result => (
                                <li key={result.id}>
                                    <button
                                        onClick={() => handleResultClick(result.id)}
                                        className="group w-full text-left px-3 py-2.5 rounded-xl hover:bg-accent hover:text-white transition-colors duration-150 ease-apple flex items-start gap-3"
                                    >
                                        <FileIcon className="w-4 h-4 mt-0.5 flex-shrink-0 text-text-secondary group-hover:text-white" />
                                        <div className="flex-grow overflow-hidden">
                                            <p className="font-medium truncate">{result.name}</p>
                                            <p className="text-xs text-text-secondary group-hover:text-white/80 truncate">
                                                <HighlightMatch text={result.snippet} query={query} />
                                            </p>
                                        </div>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="px-3 py-4 text-center text-sm text-text-secondary">
                            無符合 "{query}" 的結果
                        </div>
                    )}
                </div>
            )}
        </div>
    );
});

export default SearchBar;