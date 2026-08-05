import React, { useEffect } from 'react';
import { SearchIcon, XIcon, FileIcon } from './icons';
import { HighlightMatch } from './SearchBar';
import type { SearchResultItem } from '../types';
import { useTranslation } from '../contexts/LanguageContext';

interface MobileSearchOverlayProps {
  query: string;
  onQueryChange: (query: string) => void;
  onClose: () => void;
  results: SearchResultItem[];
  onResultClick: (noteId: string) => void;
  inputRef: React.RefObject<HTMLInputElement>;
}

// A dedicated full-screen search view for mobile, replacing the old small
// dropdown-style overlay — that left results squeezed into a sliver of
// screen below the header, worse still once the on-screen keyboard opens.
// Rendered as a sibling of <header> (not a descendant — see Header.tsx),
// since the header's backdrop-filter would otherwise trap this element's
// `fixed` positioning to the header's own bounding box instead of the
// viewport.
const MobileSearchOverlay: React.FC<MobileSearchOverlayProps> = ({
  query,
  onQueryChange,
  onClose,
  results,
  onResultClick,
  inputRef,
}) => {
  const { t } = useTranslation();
  useEffect(() => {
    inputRef.current?.focus();
  }, [inputRef]);

  // Every other overlay in the app (modals, AI panel, sidebar drawer)
  // closes on Escape; this one should too for consistency and keyboard
  // accessibility (e.g. an external keyboard on a tablet).
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-primary flex flex-col">
      <div className="flex items-center gap-2 px-3 py-3 border-b border-border-color/70 flex-shrink-0">
        <div className="flex items-center gap-2 bg-secondary px-3 py-2.5 rounded-full border border-transparent focus-within:border-accent transition-colors duration-150 ease-apple flex-grow min-w-0">
          <SearchIcon className="w-4 h-4 text-text-secondary flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={t('search.mobilePlaceholder')}
            aria-label={t('search.ariaLabel')}
            autoComplete="off"
            className="bg-transparent focus:outline-none text-text-main w-full text-base placeholder:text-text-secondary min-w-0"
          />
          {query.length > 0 && (
            <button
              onClick={() => onQueryChange('')}
              title={t('search.clear')}
              aria-label={t('search.clear')}
              className="p-1 rounded-full hover:bg-border-color/60 transition-colors flex-shrink-0"
            >
              <XIcon className="w-3.5 h-3.5 text-text-secondary" />
            </button>
          )}
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 text-sm font-medium text-accent px-1 py-2"
        >
          {t('search.cancel')}
        </button>
      </div>

      <div className="flex-grow overflow-y-auto">
        {query.trim().length === 0 ? (
          <div className="p-8 text-center text-sm text-text-secondary">{t('search.typeToSearch')}</div>
        ) : results.length > 0 ? (
          <ul className="p-2">
            {results.map(result => (
              <li key={result.id}>
                <button
                  onClick={() => onResultClick(result.id)}
                  className="group w-full text-left px-3 py-3 rounded-xl active:bg-secondary transition-colors duration-150 ease-apple flex items-start gap-3"
                >
                  <FileIcon className="w-5 h-5 mt-0.5 flex-shrink-0 text-text-secondary" />
                  <div className="flex-grow overflow-hidden min-w-0">
                    {result.path && (
                      <p className="text-xs text-text-secondary/70 truncate">{result.path}</p>
                    )}
                    <p className="font-medium text-text-main truncate">{result.name}</p>
                    <p className="text-sm text-text-secondary line-clamp-2 mt-0.5">
                      <HighlightMatch text={result.snippet} query={query} />
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-8 text-center text-sm text-text-secondary">{t('search.noResultsFor', { query })}</div>
        )}
      </div>
    </div>
  );
};

export default MobileSearchOverlay;
