import React, { useState, useRef, useEffect } from 'react';
import { ViewMode, MindMapLayout, SearchResultItem } from '../types';
import { LogoIcon, EditorIcon, MindMapIcon, ExportIcon, DocumentIcon, UndoIcon, RedoIcon, PreviewIcon, HelpIcon, MindMapLayoutIcon, LogicDiagramIcon, OrganizationalChartIcon, ChevronDownIcon, SunIcon, MoonIcon, ChatbotIcon, SettingsIcon, MenuIcon, MoreIcon, SearchIcon, MicIcon } from './icons';
import SearchBar from './SearchBar';
import MobileSearchOverlay from './MobileSearchOverlay';
import Spinner from './Spinner';
import { useTranslation } from '../contexts/LanguageContext';

interface HeaderProps {
  viewMode: ViewMode;
  onViewChange: (mode: ViewMode) => void;
  mindMapLayout: MindMapLayout;
  onLayoutChange: (layout: MindMapLayout) => void;
  onExportMindMapImage: () => void;
  onExportMarkdown: () => void;
  onExportPDF: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onClearSearch: () => void;
  results: SearchResultItem[];
  onResultClick: (noteId: string) => void;
  onShowHelp: () => void;
  searchInputRef: React.RefObject<HTMLInputElement>;
  activeNoteId: string | null;
  theme: 'light' | 'dark';
  onThemeChange: (theme: 'light' | 'dark') => void;
  onToggleAIPanel: () => void;
  isAILoading: boolean;
  isAIPanelOpen: boolean;
  onOpenVoiceNote: () => void;
  onOpenSettings: () => void;
  onToggleSidebar: () => void;
  isMobile: boolean;
}

const Header: React.FC<HeaderProps> = ({
  viewMode,
  onViewChange,
  mindMapLayout,
  onLayoutChange,
  onExportMindMapImage,
  onExportMarkdown,
  onExportPDF,
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
  onOpenVoiceNote,
  onOpenSettings,
  onToggleSidebar,
  isMobile,
}) => {
  const { t } = useTranslation();
  const iconButtonClass = "p-2 rounded-full transition-all duration-150 ease-apple active:scale-90";
  const enabledClass = "hover:bg-secondary text-text-secondary";
  const disabledClass = "text-text-secondary/30 cursor-not-allowed";

  const layoutOptions = [
    { id: MindMapLayout.MindMap, label: t('header.layoutMindMap'), Icon: MindMapLayoutIcon },
    { id: MindMapLayout.Logic, label: t('header.layoutLogic'), Icon: LogicDiagramIcon },
    { id: MindMapLayout.Organizational, label: t('header.layoutOrganizational'), Icon: OrganizationalChartIcon },
  ];

  const [isLayoutDropdownOpen, setIsLayoutDropdownOpen] = useState(false);
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const layoutDropdownRef = useRef<HTMLDivElement>(null);
  const exportDropdownRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (layoutDropdownRef.current && !layoutDropdownRef.current.contains(event.target as Node)) {
        setIsLayoutDropdownOpen(false);
      }
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target as Node)) {
        setIsExportDropdownOpen(false);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setIsMoreMenuOpen(false);
      }
      // The mobile search panel floats below the header rather than living
      // inside a dropdown, so a tap anywhere outside the header entirely
      // (e.g. on the canvas underneath it) needs to dismiss it too —
      // otherwise it stays stuck open, floating over whatever view the
      // user switches to next.
      if (headerRef.current && !headerRef.current.contains(event.target as Node)) {
        setIsMobileSearchOpen(false);
      }
    };
    // Capture phase: the mind map canvas has its own mousedown handling
    // (d3-zoom/d3-drag) that can stop the event from bubbling up to
    // document, which would otherwise make this listener never see clicks
    // on the canvas at all. Capturing runs before that, so it always fires.
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => document.removeEventListener('mousedown', handleClickOutside, true);
  }, []);

  useEffect(() => {
    if (isMobileSearchOpen) {
      searchInputRef.current?.focus();
    }
  }, [isMobileSearchOpen, searchInputRef]);

  const handleThemeToggle = () => {
    onThemeChange(theme === 'dark' ? 'light' : 'dark');
  };

  // Switching views should dismiss the mobile search overlay — otherwise it
  // stays floating over whatever the user navigates to next.
  const handleViewChange = (mode: ViewMode) => {
    setIsMobileSearchOpen(false);
    onViewChange(mode);
  };

  const CurrentLayoutIcon = layoutOptions.find(opt => opt.id === mindMapLayout)?.Icon || MindMapLayoutIcon;
  const isMindMapView = viewMode === ViewMode.MindMap;

  // In Mind Map view there's only one export format, so it's a direct
  // click; in Editor/Preview there's a choice, so it's a small dropdown.
  const exportMenuItems = isMindMapView
    ? [{ key: 'export-jpg', onClick: onExportMindMapImage, icon: ExportIcon, label: t('header.exportMindMapImage') }]
    : [
        { key: 'export-md', onClick: onExportMarkdown, icon: ExportIcon, label: t('header.exportMarkdown') },
        { key: 'export-pdf', onClick: onExportPDF, icon: DocumentIcon, label: t('header.exportPDF') },
      ];

  const moreMenuItems = [
    { key: 'theme', onClick: handleThemeToggle, disabled: false, icon: theme === 'dark' ? SunIcon : MoonIcon, label: t('header.toggleTheme') },
    { key: 'undo', onClick: onUndo, disabled: !canUndo, icon: UndoIcon, label: t('header.undo') },
    { key: 'redo', onClick: onRedo, disabled: !canRedo, icon: RedoIcon, label: t('header.redo') },
    ...exportMenuItems.map(item => ({ ...item, disabled: !activeNoteId })),
    { key: 'voice-note', onClick: onOpenVoiceNote, disabled: false, icon: MicIcon, label: t('header.voiceNote') },
    { key: 'settings', onClick: onOpenSettings, disabled: false, icon: SettingsIcon, label: t('header.settings') },
    { key: 'help', onClick: onShowHelp, disabled: false, icon: HelpIcon, label: t('header.help') },
  ];

  return (
    <>
    <header ref={headerRef} className="glass-surface flex items-center justify-between px-3 md:px-5 py-3 md:py-3.5 border-b border-border-color/70 flex-wrap gap-3 md:gap-4 flex-shrink-0 z-30 relative">
      <div className="flex items-center gap-2 md:gap-4 flex-grow min-w-0">
        <button onClick={onToggleSidebar} className={`${iconButtonClass} ${enabledClass} flex-shrink-0`} title={t('header.sidebar')} aria-label={t('header.toggleSidebar')}>
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
            title={t('header.searchNotes')}
            aria-label={t('header.searchNotes')}
          >
            <SearchIcon className="w-5 h-5" />
          </button>
        )}

        <div className="flex rounded-full bg-secondary p-1">
          <button
            onClick={() => handleViewChange(ViewMode.Editor)}
            title={`${t('header.editorMode')} (⌘1)`}
            aria-label={t('header.editorMode')}
            aria-pressed={viewMode === ViewMode.Editor}
            className={`px-3 py-1.5 text-sm font-medium rounded-full transition-all duration-150 ease-apple ${
              viewMode === ViewMode.Editor ? 'bg-accent text-white shadow-apple-xs' : 'text-text-secondary hover:text-text-main'
            }`}
          >
            <EditorIcon className="w-5 h-5" />
          </button>
           <button
            onClick={() => handleViewChange(ViewMode.Preview)}
            title={`${t('header.previewMode')} (⌘2)`}
            aria-label={t('header.previewMode')}
            aria-pressed={viewMode === ViewMode.Preview}
            className={`px-3 py-1.5 text-sm font-medium rounded-full transition-all duration-150 ease-apple ${
              viewMode === ViewMode.Preview ? 'bg-accent text-white shadow-apple-xs' : 'text-text-secondary hover:text-text-main'
            }`}
          >
            <PreviewIcon className="w-5 h-5" />
          </button>
          <button
            onClick={() => handleViewChange(ViewMode.MindMap)}
            title={`${t('header.mindMapMode')} (⌘3)`}
            aria-label={t('header.mindMapMode')}
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
              title={t('header.switchLayout')}
              aria-label={t('header.switchLayout')}
              aria-haspopup="menu"
              aria-expanded={isLayoutDropdownOpen}
            >
              <CurrentLayoutIcon className="w-5 h-5" />
              <ChevronDownIcon className="w-4 h-4" />
            </button>
            {isLayoutDropdownOpen && (
              <div className="absolute top-full right-0 mt-2 w-40 glass-surface-solid border border-border-color/70 rounded-2xl shadow-apple-md z-20 p-1.5 overflow-hidden">
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

        {!isMobile && (
          <button
            onClick={onOpenVoiceNote}
            className={`${iconButtonClass} bg-secondary ${enabledClass}`}
            title={t('header.voiceNote')}
            aria-label={t('header.voiceNote')}
          >
            <MicIcon className="w-5 h-5" />
          </button>
        )}

        <button
          onClick={onToggleAIPanel}
          disabled={!activeNoteId || isAILoading}
          className={`p-2 rounded-full transition-all duration-150 ease-apple active:scale-90 ${
            isAIPanelOpen
              ? 'bg-accent text-white'
              : 'bg-secondary text-text-secondary'
          } ${activeNoteId && !isAILoading ? 'hover:bg-border-color/60' : 'cursor-not-allowed opacity-50'}`}
          title={t('header.aiPartner')}
          aria-label={t('header.aiPartner')}
          aria-pressed={isAIPanelOpen}
        >
          {isAILoading ? <Spinner className="w-5 h-5" /> : <ChatbotIcon className="w-5 h-5" />}
        </button>

        {isMobile ? (
          <div ref={moreMenuRef} className="relative">
            <button
              onClick={() => setIsMoreMenuOpen(prev => !prev)}
              className={`${iconButtonClass} ${enabledClass}`}
              title={t('header.more')}
              aria-label={t('header.moreOptions')}
              aria-haspopup="menu"
              aria-expanded={isMoreMenuOpen}
            >
              <MoreIcon className="w-5 h-5" />
            </button>
            {isMoreMenuOpen && (
              <div className="absolute top-full right-0 mt-2 w-48 glass-surface-solid border border-border-color/70 rounded-2xl shadow-apple-md z-20 p-1.5 overflow-hidden">
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
              <button onClick={handleThemeToggle} className={`${iconButtonClass} ${enabledClass}`} title={t('header.toggleTheme')} aria-label={t('header.toggleTheme')}>
                {theme === 'dark' ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
              </button>
              <div className="w-px h-5 bg-border-color mx-1"></div>
               <button onClick={onUndo} disabled={!canUndo} className={`${iconButtonClass} ${canUndo ? enabledClass : disabledClass}`} title={`${t('header.undo')} (⌘Z)`} aria-label={t('header.undo')}>
                  <UndoIcon className="w-5 h-5" />
              </button>
              <button onClick={onRedo} disabled={!canRedo} className={`${iconButtonClass} ${canRedo ? enabledClass : disabledClass}`} title={`${t('header.redo')} (⌘⇧Z)`} aria-label={t('header.redo')}>
                  <RedoIcon className="w-5 h-5" />
              </button>
              <div className="w-px h-5 bg-border-color mx-1"></div>
              {isMindMapView ? (
                <button onClick={onExportMindMapImage} disabled={!activeNoteId} className={`${iconButtonClass} ${activeNoteId ? enabledClass : disabledClass}`} title={exportMenuItems[0].label} aria-label={exportMenuItems[0].label}>
                    <ExportIcon className="w-5 h-5" />
                </button>
              ) : (
                <div ref={exportDropdownRef} className="relative">
                  <button
                    onClick={() => setIsExportDropdownOpen(prev => !prev)}
                    disabled={!activeNoteId}
                    className={`${iconButtonClass} ${activeNoteId ? enabledClass : disabledClass}`}
                    title={t('header.exportNote')}
                    aria-label={t('header.exportNote')}
                    aria-haspopup="menu"
                    aria-expanded={isExportDropdownOpen}
                  >
                    <ExportIcon className="w-5 h-5" />
                  </button>
                  {isExportDropdownOpen && (
                    <div className="absolute top-full right-0 mt-2 w-56 glass-surface-solid border border-border-color/70 rounded-2xl shadow-apple-md z-20 p-1.5 overflow-hidden">
                      {exportMenuItems.map(({ key, onClick, icon: Icon, label }) => (
                        <button
                          key={key}
                          onClick={() => { onClick(); setIsExportDropdownOpen(false); }}
                          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-left rounded-xl transition-colors duration-150 ease-apple text-text-secondary hover:bg-secondary hover:text-text-main"
                        >
                          <Icon className="w-5 h-5" />
                          <span>{label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <button onClick={onOpenSettings} className={`${iconButtonClass} ${enabledClass}`} title={t('header.settings')} aria-label={t('header.settings')}>
                  <SettingsIcon className="w-5 h-5" />
              </button>
               <button onClick={onShowHelp} className={`${iconButtonClass} ${enabledClass}`} title={`${t('header.help')} (?)`} aria-label={t('header.help')}>
                  <HelpIcon className="w-5 h-5" />
              </button>
          </div>
        )}
      </div>
    </header>
    {isMobile && isMobileSearchOpen && (
      <MobileSearchOverlay
        query={searchQuery}
        onQueryChange={onSearchQueryChange}
        onClose={() => setIsMobileSearchOpen(false)}
        results={results}
        onResultClick={(id) => { onResultClick(id); setIsMobileSearchOpen(false); }}
        inputRef={searchInputRef}
      />
    )}
    </>
  );
};

export default Header;
