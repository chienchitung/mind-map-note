import React, { useEffect, useRef, useState } from 'react';
import { ClockIcon } from './icons';
import { useTranslation } from '../contexts/LanguageContext';
import { formatFullDate } from '../utils/fileSort';

interface NoteTimeInfoProps {
  createdAt?: number;
  updatedAt?: number;
}

const CARD_WIDTH_PX = 224;

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

const formatRelative = (timestamp: number, locale: string, justNow: string): string => {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 45) return justNow;
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, size] of UNITS) {
    if (seconds >= size || unit === 'minute') return formatter.format(-Math.max(1, Math.round(seconds / size)), unit);
  }
  return justNow;
};

// Clock button in the editor toolbar. Hovering shows the note's created and
// updated times; clicking (or tapping, where there's no hover) pins the card
// open until a click elsewhere or Esc.
const NoteTimeInfo: React.FC<NoteTimeInfoProps> = ({ createdAt, updatedAt }) => {
  const { t, language } = useTranslation();
  const locale = language === 'en' ? 'en-US' : 'zh-TW';
  const [isHovering, setIsHovering] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [, setTick] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const isOpen = isHovering || isPinned;
  // Opens toward whichever side has room: the toolbar can wrap on narrow
  // screens, leaving this button near the left edge.
  const [alignLeft, setAlignLeft] = useState(false);
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;
    setAlignLeft(containerRef.current.getBoundingClientRect().right < CARD_WIDTH_PX + 8);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const interval = window.setInterval(() => setTick(tick => tick + 1), 30_000);
    return () => window.clearInterval(interval);
  }, [isOpen]);

  useEffect(() => {
    if (!isPinned) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsPinned(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setIsPinned(false); };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPinned]);

  if (createdAt === undefined && updatedAt === undefined) return null;

  const rows: [string, number | undefined][] = [
    [t('noteTime.created'), createdAt],
    [t('noteTime.updated'), updatedAt],
  ];

  return (
    <div
      ref={containerRef}
      className="relative"
      onPointerEnter={(event) => { if (event.pointerType === 'mouse') setIsHovering(true); }}
      onPointerLeave={(event) => { if (event.pointerType === 'mouse') setIsHovering(false); }}
    >
      <button
        type="button"
        onClick={() => setIsPinned(pinned => !pinned)}
        className={`p-2 rounded-full bg-elevated shadow-apple-xs transition-all duration-150 ease-apple active:scale-90 ${isOpen ? 'text-accent ring-2 ring-accent/60' : 'text-text-secondary hover:bg-border-color/40'}`}
        aria-label={t('noteTime.label')}
        aria-expanded={isOpen}
      >
        <ClockIcon className="w-4 h-4" />
      </button>
      {isOpen && (
        <div
          role="tooltip"
          className={`glass-surface-solid absolute ${alignLeft ? 'left-0' : 'right-0'} top-full mt-2 z-30 w-56 border border-border-color/70 rounded-xl shadow-apple-md px-3 py-2.5 text-xs text-text-main space-y-1.5`}
        >
          {rows.map(([label, timestamp]) => timestamp !== undefined && (
            <div key={label}>
              <div className="flex justify-between gap-3">
                <span className="text-text-secondary">{label}</span>
                <span className="tabular-nums">{formatFullDate(timestamp, locale)}</span>
              </div>
              <div className="text-right text-[11px] text-text-secondary">
                {formatRelative(timestamp, locale, t('noteTime.justNow'))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default NoteTimeInfo;
