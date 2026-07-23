import React, { useState, useRef, useEffect } from 'react';
import { ViewMode, MindMapLayout } from '../types';
import { LogoIcon, EditorIcon, MindMapIcon, ExportIcon, UndoIcon, RedoIcon, PreviewIcon, HelpIcon, MindMapLayoutIcon, LogicDiagramIcon, OrganizationalChartIcon, ChevronDownIcon, SunIcon, MoonIcon, ChatbotIcon, SettingsIcon, MenuIcon, MoreIcon, SearchIcon } from './icons';
import SearchBar from './SearchBar';
import Spinner from './Spinner';

interface HeaderProps {
  viewMode: ViewMode;
  onViewChange: (mode: ViewMode) => void;
  mindMapLayout: MindMapLayout;
  onLayoutChange: (layout: MindMapLayout) => void;
  onExport: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onClearSearch: () => void;
  results: { id: string; name: string; snippet: string }[];
  onResultClick: (noteId: string) => void;
  onShowHelp: () => void;
  searchInputRef: React.RefObject<HTMLInputElement>;
  activeNoteId: string | null;
  theme: 'light' | 'dark';
  onThemeChange: (theme: 'light' | 'dark') => void;
  onToggleAIPanel: () => void;
  isAILoading: boolean;
  isAIPanelOpen: boolean;
  onOpenSettings: () => void;
  onToggleSidebar: () => void;
  isMobile: boolean;
}

const layoutOptions = [
  { id: MindMapLayout.MindMap, label: '心智圖', Icon: MindMapLayoutIcon },
  { id: MindMapLayout.Logic, label: '邏輯圖', Icon: LogicDiagramIcon },
  { id: MindMapLayout.Organizational, label: '組織圖', Icon: OrganizationalChartIcon },
];

const Header: React.FC<HeaderProps> = ({
  viewMode,
  onViewChange,
  mindMapLayout,
  onLayoutChange,
  onExport,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  searchQuery,
  onSearchQueryChange,
  onClearSearch,
  results,
  onResultClick,
  onShowHelp,
  searchInputRef,
  activeNoteId,
  theme,
  onThemeChange,
  onToggleAIPanel,
  isAILoading,
  isAIPanelOpen,
  onOpenSettings,
  onToggleSidebar,
  isMobile,
}) => {
  const iconButtonClass = "p-2 rounded-full transition-all duration-150 ease-apple active:scale-90";
  const enabledClass = "hover:bg-secondary text-text-secondary";
  const disabledClass = "text-text-secondary/30 cursor-not-allowed";

  const [isLayoutDropdownOpen, setIsLayoutDropdownOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const layoutDropdownRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (layoutDropdownRef.current && !layoutDropdownRef.current.contains(event.target as Node)) {
        setIsLayoutDropdownOpen(false);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setIsMoreMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isMobileSearchOpen) {
      searchInputRef.current?.focus();
    }
  }, [isMobileSearchOpen, searchInputRef]);

  const handleThemeToggle = () => {
    onThemeChange(theme === 'dark' ? 'light' : 'dark');
  };

  const CurrentLayoutIcon = layoutOptions.find(opt => opt.id === mindMapLayout)?.Icon || MindMapLayoutIcon;
  const exportLabel = viewMode === ViewMode.MindMap ? '匯出心智圖圖片 (JPG)' : '導出筆記 (Markdown)';

  const moreMenuItems = [
    { key: 'theme', onClick: handleThemeToggle, disabled: false, icon: theme === 'dark' ? SunIcon : MoonIcon, label: '切換主題' },
    { key: 'undo', onClick: onUndo, disabled: !canUndo, icon: UndoIcon, label: '復原' },
    { key: 'redo', onClick: onRedo, disabled: !canRedo, icon: RedoIcon, label: '重做' },
    { key: 'export', onClick: onExport, disabled: !activeNoteId, icon: ExportIcon, label: exportLabel },
    { key: 'settings', onClick: onOpenSettings, disabled: false, icon: SettingsIcon, label: 'AI 金鑰設定' },
    { key: 'help', onClick: onShowHelp, disabled: false, icon: HelpIcon, label: '幫助' },
  ];

  return (
    <header className="glass-surface flex items-center justify-between px-3 md:px-5 py-3 md:py-3.5 border-b border-border-color/70 flex-wrap gap-3 md:gap-4 flex-shrink-0 z-30 relative">
      <div className="flex items-center gap-2 md:gap-4 flex-grow min-w-0">
        <button onClick={onToggleSidebar} className={`${iconButtonClass} ${enabledClass} flex-shrink-0`} title="側邊欄" aria-label="切換側邊欄">
          <MenuIcon className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2.5 flex-shrink-0">
            <div className="w-7 h-7 rounded-[9px] bg-accent flex items-center justify-center flex-shrink-0">
              <LogoIcon className="w-[18px] h-[18px] text-white" />
            </div>
            <h1 className="hidden md:block text-[15px] md:text-base whitespace-nowrap tracking-tight leading-none">
              <span className="font-semibold text-text-main">MindMap</span><span className="font-medium text-accent">Note</span>
            </h1>
        </div>
        {!isMobile && (
          <SearchBar
            ref={searchInputRef}
            query={searchQuery}
            onQueryChange={onSearchQueryChange}
            onClear={onClearSearch}
            results={results}
            onResultClick={onResultClick}
          />
        )}
      </div>
      <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
        {isMobile && (
          <button
            onClick={() => setIsMobileSearchOpen(prev => !prev)}
            className={`${iconButtonClass} ${isMobileSearchOpen ? 'bg-accent text-white' : `bg-secondary ${enabledClass}`}`}
            title="搜尋筆記"
            aria-label="搜尋筆記"
          >
            <SearchIcon className="w-5 h-5" />
          </button>
        )}

        <div className="flex rounded-full bg-secondary p-1">
          <button
            onClick={() => onViewChange(ViewMode.Editor)}
            title="編輯模式 (⌘1)"
            aria-label="編輯模式"
            aria-pressed={viewMode === ViewMode.Editor}
            className={`px-3 py-1.5 text-sm font-medium rounded-full transition-all duration-150 ease-apple ${
              viewMode === ViewMode.Editor ? 'bg-accent text-white shadow-apple-xs' : 'text-text-secondary hover:text-text-main'
            }`}
          >
            <EditorIcon className="w-5 h-5" />
          </button>
           <button
            onClick={() => onViewChange(ViewMode.Preview)}
            title="預覽模式 (⌘2)"
            aria-label="預覽模式"
            aria-pressed={viewMode === ViewMode.Preview}
            className={`px-3 py-1.5 text-sm font-medium rounded-full transition-all duration-150 ease-apple ${
              viewMode === ViewMode.Preview ? 'bg-accent text-white shadow-apple-xs' : 'text-text-secondary hover:text-text-main'
            }`}
          >
            <PreviewIcon className="w-5 h-5" />
          </button>
          <button
            onClick={() => onViewChange(ViewMode.MindMap)}
            title="思維導圖模式 (⌘3)"
            aria-label="思維導圖模式"
            aria-pressed={viewMode === ViewMode.MindMap}
            className={`px-3 py-1.5 text-sm font-medium rounded-full transition-all duration-150 ease-apple ${
              viewMode === ViewMode.MindMap ? 'bg-accent text-white shadow-apple-xs' : 'text-text-secondary hover:text-text-main'
            }`}
          >
            <MindMapIcon className="w-5 h-5" />
          </button>
        </div>

        {viewMode === ViewMode.MindMap && (
          <div ref={layoutDropdownRef} className="relative">
            <button
              onClick={() => setIsLayoutDropdownOpen(prev => !prev)}
              className="flex items-center gap-1.5 p-2 rounded-full bg-secondary hover:bg-border-color/60 text-text-secondary transition-colors duration-150 ease-apple"
              title="切換版面配置"
              aria-label="切換版面配置"
              aria-haspopup="menu"
              aria-expanded={isLayoutDropdownOpen}
            >
              <CurrentLayoutIcon className="w-5 h-5" />
              <ChevronDownIcon className="w-4 h-4" />
            </button>
            {isLayoutDropdownOpen && (
              <div className="absolute top-full right-0 mt-2 w-40 glass-surface border border-border-color/70 rounded-2xl shadow-apple-md z-20 p-1.5 overflow-hidden">
                {layoutOptions.map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    onClick={() => {
                      onLayoutChange(id);
                      setIsLayoutDropdownOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-sm text-left rounded-xl transition-colors duration-150 ease-apple ${
                      mindMapLayout === id ? 'bg-accent text-white' : 'text-text-secondary hover:bg-secondary'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          onClick={onToggleAIPanel}
          disabled={!activeNoteId || isAILoading}
          className={`p-2 rounded-full transition-all duration-150 ease-apple active:scale-90 ${
            isAIPanelOpen
              ? 'bg-accent text-white'
              : 'bg-secondary text-text-secondary'
          } ${activeNoteId && !isAILoading ? 'hover:bg-border-color/60' : 'cursor-not-allowed opacity-50'}`}
          title="AI 學習夥伴"
          aria-label="AI 學習夥伴"
          aria-pressed={isAIPanelOpen}
        >
          {isAILoading ? <Spinner className="w-5 h-5" /> : <ChatbotIcon className="w-5 h-5" />}
        </button>

        {isMobile ? (
          <div ref={moreMenuRef} className="relative">
            <button
              onClick={() => setIsMoreMenuOpen(prev => !prev)}
              className={`${iconButtonClass} ${enabledClass}`}
              title="更多"
              aria-label="更多選項"
              aria-haspopup="menu"
              aria-expanded={isMoreMenuOpen}
            >
              <MoreIcon className="w-5 h-5" />
            </button>
            {isMoreMenuOpen && (
              <div className="absolute top-full right-0 mt-2 w-48 glass-surface border border-border-color/70 rounded-2xl shadow-apple-md z-20 p-1.5 overflow-hidden">
                {moreMenuItems.map(({ key, onClick, disabled, icon: Icon, label }) => (
                  <button
                    key={key}
                    onClick={() => { onClick(); setIsMoreMenuOpen(false); }}
                    disabled={disabled}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-sm text-left rounded-xl transition-colors duration-150 ease-apple ${
                      disabled ? 'text-text-secondary/30 cursor-not-allowed' : 'text-text-secondary hover:bg-secondary hover:text-text-main'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1">
              <button onClick={handleThemeToggle} className={`${iconButtonClass} ${enabledClass}`} title="切換主題" aria-label="切換主題">
                {theme === 'dark' ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
              </button>
              <div className="w-px h-5 bg-border-color mx-1"></div>
               <button onClick={onUndo} disabled={!canUndo} className={`${iconButtonClass} ${canUndo ? enabledClass : disabledClass}`} title="復原 (⌘Z)" aria-label="復原">
                  <UndoIcon className="w-5 h-5" />
              </button>
              <button onClick={onRedo} disabled={!canRedo} className={`${iconButtonClass} ${canRedo ? enabledClass : disabledClass}`} title="重做 (⌘⇧Z)" aria-label="重做">
                  <RedoIcon className="w-5 h-5" />
              </button>
              <div className="w-px h-5 bg-border-color mx-1"></div>
              <button onClick={onExport} disabled={!activeNoteId} className={`${iconButtonClass} ${activeNoteId ? enabledClass : disabledClass}`} title={exportLabel} aria-label={exportLabel}>
                  <ExportIcon className="w-5 h-5" />
              </button>
              <button onClick={onOpenSettings} className={`${iconButtonClass} ${enabledClass}`} title="AI 金鑰設定" aria-label="AI 金鑰設定">
                  <SettingsIcon className="w-5 h-5" />
              </button>
               <button onClick={onShowHelp} className={`${iconButtonClass} ${enabledClass}`} title="幫助 (?)" aria-label="幫助">
                  <HelpIcon className="w-5 h-5" />
              </button>
          </div>
        )}
      </div>

      {isMobile && isMobileSearchOpen && (
        <div className="absolute top-full left-0 right-0 glass-surface border-b border-border-color/70 p-3 z-20">
          <SearchBar
            ref={searchInputRef}
            query={searchQuery}
            onQueryChange={onSearchQueryChange}
            onClear={onClearSearch}
            results={results}
            onResultClick={(id) => { onResultClick(id); setIsMobileSearchOpen(false); }}
          />
        </div>
      )}
    </header>
  );
};

export default Header;
