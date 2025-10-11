import React from 'react';
import { SearchIcon, ChevronUpIcon, ChevronDownIcon, XIcon } from './icons';

interface SearchBarProps {
    query: string;
    onQueryChange: (query: string) => void;
    onNext: () => void;
    onPrev: () => void;
    onClear: () => void;
    matchCount: number;
    activeMatchIndex: number | null;
}

const SearchBar: React.FC<SearchBarProps> = ({
    query,
    onQueryChange,
    onNext,
    onPrev,
    onClear,
    matchCount,
    activeMatchIndex,
}) => {
    const hasQuery = query.length > 0;
    const hasMatches = matchCount > 0;

    return (
        <div className="flex items-center gap-2 bg-secondary p-1 rounded-md border border-border-color w-full max-w-sm">
            <SearchIcon className="w-5 h-5 text-text-secondary ml-1 flex-shrink-0" />
            <input
                type="text"
                placeholder="搜尋筆記..."
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                className="bg-transparent focus:outline-none text-text-main w-full text-sm"
            />
            {hasQuery && (
                <div className="flex items-center gap-1">
                    {hasMatches ? (
                        <span className="text-xs text-text-secondary whitespace-nowrap px-1">
                            {activeMatchIndex !== null ? activeMatchIndex + 1 : 0} / {matchCount}
                        </span>
                    ) : (
                         <span className="text-xs text-text-secondary whitespace-nowrap px-1">無結果</span>
                    )}
                    <div className="w-px h-4 bg-border-color mx-1"></div>
                    <button onClick={onPrev} disabled={!hasMatches} className="p-1 rounded hover:bg-primary disabled:text-gray-600 disabled:cursor-not-allowed" title="上一個">
                        <ChevronUpIcon className="w-4 h-4 text-text-secondary" />
                    </button>
                    <button onClick={onNext} disabled={!hasMatches} className="p-1 rounded hover:bg-primary disabled:text-gray-600 disabled:cursor-not-allowed" title="下一個">
                        <ChevronDownIcon className="w-4 h-4 text-text-secondary" />
                    </button>
                    <button onClick={onClear} className="p-1 rounded hover:bg-primary" title="清除搜尋">
                        <XIcon className="w-4 h-4 text-text-secondary" />
                    </button>
                </div>
            )}
        </div>
    );
};

export default SearchBar;
