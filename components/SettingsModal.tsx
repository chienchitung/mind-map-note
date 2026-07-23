import React, { useState, useEffect } from 'react';
import { XIcon, KeyIcon } from './icons';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  onSaveApiKey: (key: string) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, apiKey, onSaveApiKey }) => {
  const [draftKey, setDraftKey] = useState(apiKey);
  const [isRevealed, setIsRevealed] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDraftKey(apiKey);
      setIsRevealed(false);
    }
  }, [isOpen, apiKey]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveApiKey(draftKey.trim());
    onClose();
  };

  const handleClear = () => {
    setDraftKey('');
    onSaveApiKey('');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby="settings-modal-title" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-full text-text-secondary hover:bg-secondary hover:text-text-main transition-colors duration-150 ease-apple" title="關閉 (Esc)" aria-label="關閉">
          <XIcon className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-full bg-accent/10 text-accent flex items-center justify-center flex-shrink-0">
            <KeyIcon className="w-5 h-5" />
          </div>
          <h2 id="settings-modal-title" className="text-xl font-semibold text-text-main">AI 學習夥伴設定</h2>
        </div>

        <p className="text-sm text-text-secondary mb-5 leading-relaxed">
          此應用程式的 AI 功能由 Google Gemini 提供。您的金鑰只會保存在
          <strong className="text-text-main"> 這台裝置的瀏覽器</strong>
          裡，不會上傳到任何伺服器。
        </p>

        <label htmlFor="gemini-api-key" className="block text-sm font-medium text-text-main mb-1.5">
          Gemini API 金鑰
        </label>
        <div className="flex items-center gap-2 mb-2">
          <input
            id="gemini-api-key"
            type={isRevealed ? 'text' : 'password'}
            value={draftKey}
            onChange={(e) => setDraftKey(e.target.value)}
            placeholder="貼上您的 API 金鑰..."
            autoComplete="off"
            spellCheck={false}
            className="flex-grow px-3.5 py-2.5 bg-secondary border border-transparent rounded-xl text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors duration-150 ease-apple"
          />
          <button
            type="button"
            onClick={() => setIsRevealed(prev => !prev)}
            className="px-3 py-2.5 text-xs font-medium rounded-xl bg-secondary hover:bg-border-color/60 text-text-secondary transition-colors duration-150 ease-apple flex-shrink-0"
          >
            {isRevealed ? '隱藏' : '顯示'}
          </button>
        </div>

        <a
          href="https://aistudio.google.com/apikey"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-accent hover:underline"
        >
          還沒有金鑰？前往 Google AI Studio 免費取得 →
        </a>

        <div className="flex items-center justify-between mt-7">
          <button
            type="button"
            onClick={handleClear}
            disabled={!apiKey}
            className="text-sm text-red-500 hover:text-red-400 disabled:text-text-secondary/40 disabled:cursor-not-allowed transition-colors duration-150 ease-apple"
          >
            清除金鑰
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-full text-text-secondary hover:bg-secondary transition-all duration-150 ease-apple active:scale-95"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 text-sm font-medium rounded-full bg-accent text-white hover:opacity-90 transition-all duration-150 ease-apple active:scale-95"
            >
              儲存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
