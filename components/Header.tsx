import React, { useState, useRef, useEffect } from 'react';
import { ViewMode, MindMapLayout } from '../types';
import { EditorIcon, MindMapIcon, ExportIcon, UndoIcon, RedoIcon, PreviewIcon, HelpIcon, MindMapLayoutIcon, LogicDiagramIcon, OrganizationalChartIcon, ChevronDownIcon } from './icons';
import SearchBar from './SearchBar';

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
  onNextMatch: () => void;
  onPrevMatch: () => void;
  onClearSearch: () => void;
  searchMatchCount: number;
  activeMatchIndex: number | null;
  onShowHelp: () => void;
  searchInputRef: React.RefObject<HTMLInputElement>;
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
  onNextMatch,
  onPrevMatch,
  onClearSearch,
  searchMatchCount,
  activeMatchIndex,
  onShowHelp,
  searchInputRef,
}) => {
  const iconButtonClass = "p-2 rounded-md transition-colors";
  const enabledClass = "hover:bg-secondary text-text-secondary";
  const disabledClass = "text-gray-600 cursor-not-allowed";
  
  const [isLayoutDropdownOpen, setIsLayoutDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsLayoutDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const CurrentLayoutIcon = layoutOptions.find(opt => opt.id === mindMapLayout)?.Icon || MindMapLayoutIcon;

  return (
    <header className="flex items-center justify-between p-4 bg-primary border-b border-border-color shadow-md flex-wrap gap-4">
      <div className="flex items-center gap-4 flex-grow">
        <h1 className="text-lg md:text-xl font-bold text-text-main whitespace-nowrap">
          思維導讀筆記工具
        </h1>
        {(viewMode === ViewMode.Editor || viewMode === ViewMode.Preview) && (
           <SearchBar
              ref={searchInputRef}
              query={searchQuery}
              onQueryChange={onSearchQueryChange}
              onNext={onNextMatch}
              onPrev={onPrevMatch}
              onClear={onClearSearch}
              matchCount={searchMatchCount}
              activeMatchIndex={activeMatchIndex}
            />
        )}
      </div>
      <div className="flex items-center gap-2 md:gap-4">
        <div className="flex rounded-md bg-secondary p-1">
          <button
            onClick={() => onViewChange(ViewMode.Editor)}
            title="編輯模式 (⌘1)"
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              viewMode === ViewMode.Editor ? 'bg-accent text-white' : 'text-text-secondary hover:bg-gray-700'
            }`}
          >
            <EditorIcon className="w-5 h-5" />
          </button>
           <button
            onClick={() => onViewChange(ViewMode.Preview)}
            title="預覽模式 (⌘2)"
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              viewMode === ViewMode.Preview ? 'bg-accent text-white' : 'text-text-secondary hover:bg-gray-700'
            }`}
          >
            <PreviewIcon className="w-5 h-5" />
          </button>
          <button
            onClick={() => onViewChange(ViewMode.MindMap)}
            title="思維導圖模式 (⌘3)"
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              viewMode === ViewMode.MindMap ? 'bg-accent text-white' : 'text-text-secondary hover:bg-gray-700'
            }`}
          >
            <MindMapIcon className="w-5 h-5" />
          </button>
        </div>
        
        {viewMode === ViewMode.MindMap && (
          <div ref={dropdownRef} className="relative">
            <button
              onClick={() => setIsLayoutDropdownOpen(prev => !prev)}
              className="flex items-center gap-2 p-2 rounded-md bg-secondary hover:bg-gray-700 text-text-secondary transition-colors"
            >
              <CurrentLayoutIcon className="w-5 h-5" />
              <ChevronDownIcon className="w-4 h-4" />
            </button>
            {isLayoutDropdownOpen && (
              <div className="absolute top-full right-0 mt-2 w-40 bg-secondary border border-border-color rounded-md shadow-lg z-20">
                {layoutOptions.map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    onClick={() => {
                      onLayoutChange(id);
                      setIsLayoutDropdownOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-sm text-left transition-colors ${
                      mindMapLayout === id ? 'bg-accent text-white' : 'text-text-secondary hover:bg-gray-700'
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

        <div className="flex items-center gap-2">
             <button onClick={onUndo} disabled={!canUndo} className={`${iconButtonClass} ${canUndo ? enabledClass : disabledClass}`} title="復原 (⌘Z)">
                <UndoIcon className="w-5 h-5" />
            </button>
            <button onClick={onRedo} disabled={!canRedo} className={`${iconButtonClass} ${canRedo ? enabledClass : disabledClass}`} title="重做 (⌘⇧Z)">
                <RedoIcon className="w-5 h-5" />
            </button>
            <div className="w-px h-6 bg-border-color mx-1"></div>
            <button onClick={onExport} className={`${iconButtonClass} ${enabledClass}`} title="導出筆記">
                <ExportIcon className="w-5 h-5" />
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