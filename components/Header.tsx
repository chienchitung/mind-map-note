import React, { useRef } from 'react';
import { ViewMode } from '../types';
import { EditorIcon, MindMapIcon, ImportIcon, ExportIcon, UndoIcon, RedoIcon, PreviewIcon, HelpIcon } from './icons';
import SearchBar from './SearchBar';

interface HeaderProps {
  viewMode: ViewMode;
  onViewChange: (mode: ViewMode) => void;
  onImport: (file: File) => void;
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

const Header: React.FC<HeaderProps> = ({
  viewMode,
  onViewChange,
  onImport,
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onImport(file);
    }
    // Reset file input to allow importing the same file again
    event.target.value = '';
  };
  
  const iconButtonClass = "p-2 rounded-md transition-colors";
  const enabledClass = "hover:bg-secondary text-text-secondary";
  const disabledClass = "text-gray-600 cursor-not-allowed";

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

        <div className="flex items-center gap-2">
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept=".md, .txt"
            />
             <button onClick={onUndo} disabled={!canUndo} className={`${iconButtonClass} ${canUndo ? enabledClass : disabledClass}`} title="復原 (⌘Z)">
                <UndoIcon className="w-5 h-5" />
            </button>
            <button onClick={onRedo} disabled={!canRedo} className={`${iconButtonClass} ${canRedo ? enabledClass : disabledClass}`} title="重做 (⌘⇧Z)">
                <RedoIcon className="w-5 h-5" />
            </button>
            <div className="w-px h-6 bg-border-color mx-1"></div>
            <button onClick={handleImportClick} className={`${iconButtonClass} ${enabledClass}`} title="導入筆記">
                <ImportIcon className="w-5 h-5" />
            </button>
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
