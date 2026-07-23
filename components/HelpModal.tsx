import React from 'react';
import { XIcon } from './icons';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const Shortcut: React.FC<{ keys: string[], description: string }> = ({ keys, description }) => (
  <div className="flex items-center justify-between py-2 text-sm">
    <span className="text-text-secondary">{description}</span>
    <div>
      {keys.map((key, i) => (
        <kbd key={i} className="shortcut-key">{key}</kbd>
      ))}
    </div>
  </div>
);


const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby="help-modal-title" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-full text-text-secondary hover:bg-secondary hover:text-text-main transition-colors duration-150 ease-apple" title="關閉 (Esc)" aria-label="關閉">
          <XIcon className="w-5 h-5" />
        </button>
        <h2 id="help-modal-title" className="text-xl font-semibold mb-6 text-text-main tracking-tight">鍵盤快捷鍵</h2>
        
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-accent mb-2 border-b border-border-color pb-1">通用</h3>
            <Shortcut keys={['?']} description="顯示/隱藏此幫助" />
            <Shortcut keys={['⌘', '1']} description="切換到編輯器視圖" />
            <Shortcut keys={['⌘', '2']} description="切換到預覽視圖" />
            <Shortcut keys={['⌘', '3']} description="切換到思維導圖視圖" />
            <Shortcut keys={['⌘', 'F']} description="搜尋筆記" />
            <Shortcut keys={['⌘', 'Z']} description="復原" />
            <Shortcut keys={['⌘', 'Shift', 'Z']} description="重做" />
          </div>

          <div>
            <h3 className="text-lg font-semibold text-accent mb-2 border-b border-border-color pb-1">思維導圖視圖</h3>
            <Shortcut keys={['↑', '↓', '←', '→']} description="導航節點" />
            <Shortcut keys={['Enter']} description="編輯選定的節點" />
            <Shortcut keys={['Space']} description="展開/折疊節點" />
            <Shortcut keys={['⌘', '+']} description="放大" />
            <Shortcut keys={['⌘', '-']} description="縮小" />
            <Shortcut keys={['⌘', '0']} description="重置視圖" />
          </div>
          
           <div>
            <h3 className="text-lg font-semibold text-accent mb-2 border-b border-border-color pb-1">編輯器</h3>
            <Shortcut keys={['Tab']} description="縮排" />
            <Shortcut keys={['Shift', 'Tab']} description="減少縮排" />
            <Shortcut keys={['Enter']} description="自動繼續列表" />
          </div>

        </div>
         <div className="text-xs text-text-secondary mt-6 text-center">
            提示：在 Windows 和 Linux 上，使用 <kbd className="shortcut-key text-xs">Ctrl</kbd> 代替 <kbd className="shortcut-key text-xs">⌘</kbd>。
        </div>
      </div>
    </div>
  );
};

export default HelpModal;
