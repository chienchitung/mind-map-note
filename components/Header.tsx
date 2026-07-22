import React, { useState, useRef, useEffect } from 'react';
import { ViewMode, MindMapLayout } from '../types';
import { LogoIcon, EditorIcon, MindMapIcon, ExportIcon, UndoIcon, RedoIcon, PreviewIcon, HelpIcon, MindMapLayoutIcon, LogicDiagramIcon, OrganizationalChartIcon, ChevronDownIcon, SunIcon, MoonIcon, ChatbotIcon, SettingsIcon } from './icons';
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
}) => {
  const iconButtonClass = "p-2 rounded-full transition-all duration-150 ease-apple active:scale-90";
  const enabledClass = "hover:bg-secondary text-text-secondary";
  const disabledClass = "text-text-secondary/30 cursor-not-allowed";
  
  const [isLayoutDropdownOpen, setIsLayoutDropdownOpen] = useState(false);
  const layoutDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (layoutDropdownRef.current && !layoutDropdownRef.current.contains(event.target as Node)) {
        setIsLayoutDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleThemeToggle = () => {
    onThemeChange(theme === 'dark' ? 'light' : 'dark');
  };

  const CurrentLayoutIcon = layoutOptions.find(opt => opt.id === mindMapLayout)?.Icon || MindMapLayoutIcon;

  return (
    <header className="glass-surface flex items-center justify-between px-5 py-3.5 border-b border-border-color/70 flex-wrap gap-4 flex-shrink-0 z-30 relative">
      <div className="flex items-center gap-4 flex-grow">
        <div className="flex items-center gap-2">
            <LogoIcon className="w-6 h-6 text-accent"/>
            <h1 className="text-[15px] md:text-base font-semibold text-text-main whitespace-nowrap tracking-tight">
            MindMapNote
            </h1>
        </div>
        <SearchBar
          ref={searchInputRef}
          query={searchQuery}
          onQueryChange={onSearchQueryChange}
          onClear={onClearSearch}
          results={results}
          onResultClick={onResultClick}
        />
      </div>
      <div className="flex items-center gap-2 md:gap-3">
        <div className="flex rounded-full bg-secondary p-1">
          <button
            onClick={() => onViewChange(ViewMode.Editor)}
            title="編輯模式 (⌘1)"
            className={`px-3 py-1.5 text-sm font-medium rounded-full transition-all duration-150 ease-apple ${
              viewMode === ViewMode.Editor ? 'bg-accent text-white shadow-apple-xs' : 'text-text-secondary hover:text-text-main'
            }`}
          >
            <EditorIcon className="w-5 h-5" />
          </button>
           <button
            onClick={() => onViewChange(ViewMode.Preview)}
            title="預覽模式 (⌘2)"
            className={`px-3 py-1.5 text-sm font-medium rounded-full transition-all duration-150 ease-apple ${
              viewMode === ViewMode.Preview ? 'bg-accent text-white shadow-apple-xs' : 'text-text-secondary hover:text-text-main'
            }`}
          >
            <PreviewIcon className="w-5 h-5" />
          </button>
          <button
            onClick={() => onViewChange(ViewMode.MindMap)}
            title="思維導圖模式 (⌘3)"
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
        >
          {isAILoading ? <Spinner className="w-5 h-5" /> : <ChatbotIcon className="w-5 h-5" />}
        </button>

        <div className="flex items-center gap-1">
            <button onClick={handleThemeToggle} className={`${iconButtonClass} ${enabledClass}`} title="切換主題">
              {theme === 'dark' ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
            </button>
            <div className="w-px h-5 bg-border-color mx-1"></div>
             <button onClick={onUndo} disabled={!canUndo} className={`${iconButtonClass} ${canUndo ? enabledClass : disabledClass}`} title="復原 (⌘Z)">
                <UndoIcon className="w-5 h-5" />
            </button>
            <button onClick={onRedo} disabled={!canRedo} className={`${iconButtonClass} ${canRedo ? enabledClass : disabledClass}`} title="重做 (⌘⇧Z)">
                <RedoIcon className="w-5 h-5" />
            </button>
            <div className="w-px h-5 bg-border-color mx-1"></div>
            <button onClick={onExport} disabled={!activeNoteId} className={`${iconButtonClass} ${activeNoteId ? enabledClass : disabledClass}`} title="導出筆記">
                <ExportIcon className="w-5 h-5" />
            </button>
            <button onClick={onOpenSettings} className={`${iconButtonClass} ${enabledClass}`} title="AI 金鑰設定">
                <SettingsIcon className="w-5 h-5" />
            </button>
             <button onClick={onShowHelp} className={`${iconButtonClass} ${enabledClass}`} title="幫助 (?)">
                <HelpIcon className="w-5 h-5" />
            </button>
        </div>
      </div>
    </header>
  );
};

export default Header;