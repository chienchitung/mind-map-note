import React, { useEffect, useRef } from 'react';
import { ChevronUpIcon, ChevronDownIcon, XIcon } from './icons';
import { useTranslation } from '../contexts/LanguageContext';

interface FindReplaceBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  replacement: string;
  onReplacementChange: (replacement: string) => void;
  matchCase: boolean;
  onToggleMatchCase: () => void;
  matchCount: number;
  currentIndex: number;
  notice: string | null;
  onPrevious: () => void;
  onNext: () => void;
  onReplace: () => void;
  onReplaceAll: () => void;
  onClose: () => void;
  focusToken: number;
}

const FindReplaceBar: React.FC<FindReplaceBarProps> = ({
  query, onQueryChange, replacement, onReplacementChange, matchCase, onToggleMatchCase,
  matchCount, currentIndex, notice, onPrevious, onNext, onReplace, onReplaceAll, onClose, focusToken,
}) => {
  const { t } = useTranslation();
  const queryRef = useRef<HTMLInputElement>(null);

  // Re-focus (and select) the query each time the bar is summoned, even if
  // it was already open.
  useEffect(() => {
    queryRef.current?.focus();
    queryRef.current?.select();
  }, [focusToken]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>, field: 'query' | 'replacement') => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      if (field === 'replacement') onReplace();
      else if (event.shiftKey) onPrevious();
      else onNext();
    }
  };

  const status = query
    ? (matchCount > 0 ? `${currentIndex + 1} / ${matchCount}` : t('findReplace.noResults'))
    : '';
  const iconButton = 'p-1 rounded-md text-text-secondary hover:bg-border-color/60 hover:text-text-main disabled:opacity-40 disabled:hover:bg-transparent transition-colors duration-150 ease-apple';
  const textButton = 'px-2.5 py-1 rounded-md text-xs font-medium bg-secondary text-text-main hover:bg-border-color/60 disabled:opacity-40 disabled:hover:bg-secondary transition-colors duration-150 ease-apple whitespace-nowrap';
  const inputClass = 'flex-1 min-w-0 bg-secondary rounded-md px-2 py-1 text-sm text-text-main placeholder:text-text-secondary/70 outline-none focus:ring-2 focus:ring-accent/50';

  return (
    <div
      className="glass-surface-solid w-full md:w-[22rem] border border-border-color/70 rounded-xl shadow-apple-md p-2 space-y-1.5"
      role="search"
      aria-label={t('findReplace.title')}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div className="flex items-center gap-1">
        <input
          ref={queryRef}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => handleKeyDown(event, 'query')}
          placeholder={t('findReplace.findPlaceholder')}
          aria-label={t('findReplace.findPlaceholder')}
          className={inputClass}
        />
        <span className="w-14 text-center text-[11px] tabular-nums text-text-secondary flex-shrink-0">{status}</span>
        <button
          type="button"
          onClick={onToggleMatchCase}
          className={`px-1.5 py-0.5 rounded-md text-xs font-semibold transition-colors duration-150 ease-apple ${matchCase ? 'bg-accent text-white' : 'text-text-secondary hover:bg-border-color/60'}`}
          title={t('findReplace.matchCase')}
          aria-label={t('findReplace.matchCase')}
          aria-pressed={matchCase}
        >
          A/a
        </button>
        <button type="button" onClick={onPrevious} disabled={matchCount === 0} className={iconButton} title={t('findReplace.previous')} aria-label={t('findReplace.previous')}>
          <ChevronUpIcon className="w-4 h-4" />
        </button>
        <button type="button" onClick={onNext} disabled={matchCount === 0} className={iconButton} title={t('findReplace.next')} aria-label={t('findReplace.next')}>
          <ChevronDownIcon className="w-4 h-4" />
        </button>
        <button type="button" onClick={onClose} className={iconButton} title={t('findReplace.close')} aria-label={t('findReplace.close')}>
          <XIcon className="w-4 h-4" />
        </button>
      </div>
      <div className="flex items-center gap-1">
        <input
          value={replacement}
          onChange={(event) => onReplacementChange(event.target.value)}
          onKeyDown={(event) => handleKeyDown(event, 'replacement')}
          placeholder={t('findReplace.replacePlaceholder')}
          aria-label={t('findReplace.replacePlaceholder')}
          className={inputClass}
        />
        <button type="button" onClick={onReplace} disabled={matchCount === 0} className={textButton}>{t('findReplace.replace')}</button>
        <button type="button" onClick={onReplaceAll} disabled={matchCount === 0} className={textButton}>{t('findReplace.replaceAll')}</button>
      </div>
      {notice && <p className="px-1 text-[11px] text-text-secondary">{notice}</p>}
    </div>
  );
};

export default FindReplaceBar;
