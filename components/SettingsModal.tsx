import React, { useState, useEffect, useRef } from 'react';
import { XIcon, KeyIcon, SettingsIcon, ArchiveIcon, ExportIcon, ImportIcon } from './icons';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  onSaveApiKey: (key: string) => void;
  groqApiKey: string;
  onSaveGroqApiKey: (key: string) => void;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  apiKey,
  onSaveApiKey,
  groqApiKey,
  onSaveGroqApiKey,
  onExportBackup,
  onImportBackup,
}) => {
  const [draftKey, setDraftKey] = useState(apiKey);
  const [isRevealed, setIsRevealed] = useState(false);
  const [draftGroqKey, setDraftGroqKey] = useState(groqApiKey);
  const [isGroqRevealed, setIsGroqRevealed] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setDraftKey(apiKey);
      setIsRevealed(false);
      setDraftGroqKey(groqApiKey);
      setIsGroqRevealed(false);
    }
  }, [isOpen, apiKey, groqApiKey]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveApiKey(draftKey.trim());
    onSaveGroqApiKey(draftGroqKey.trim());
    onClose();
  };

  const handleClear = () => {
    setDraftKey('');
    onSaveApiKey('');
  };

  const handleClearGroq = () => {
    setDraftGroqKey('');
    onSaveGroqApiKey('');
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file next time
    if (!file) return;
    onImportBackup(file);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby="settings-modal-title" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-full text-text-secondary hover:bg-secondary hover:text-text-main transition-colors duration-150 ease-apple" title="關閉 (Esc)" aria-label="關閉">
          <XIcon className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-accent/10 text-accent flex items-center justify-center flex-shrink-0">
            <SettingsIcon className="w-5 h-5" />
          </div>
          <h2 id="settings-modal-title" className="text-xl font-semibold text-text-main">設定</h2>
        </div>

        <section>
          <div className="flex items-center gap-2 mb-2">
            <KeyIcon className="w-4 h-4 text-accent" />
            <h3 className="text-sm font-semibold text-text-main">AI 學習夥伴</h3>
          </div>

          <p className="text-sm text-text-secondary mb-4 leading-relaxed">
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

          <div className="mt-3">
            <button
              type="button"
              onClick={handleClear}
              disabled={!apiKey}
              className="text-sm text-red-500 hover:text-red-400 disabled:text-text-secondary/40 disabled:cursor-not-allowed transition-colors duration-150 ease-apple"
            >
              清除金鑰
            </button>
          </div>
        </section>

        <div className="h-px bg-border-color my-6"></div>

        <section>
          <div className="flex items-center gap-2 mb-2">
            <KeyIcon className="w-4 h-4 text-accent" />
            <h3 className="text-sm font-semibold text-text-main">語音筆記</h3>
          </div>

          <p className="text-sm text-text-secondary mb-4 leading-relaxed">
            語音轉錄功能由 Groq 提供。您的金鑰只會保存在
            <strong className="text-text-main"> 這台裝置的瀏覽器</strong>
            裡，不會上傳到任何伺服器。每次生成筆記後，原始錄音與逐字稿會保存在側邊欄的「錄音」分頁中，可以在那裡下載或刪除。
          </p>

          <label htmlFor="groq-api-key" className="block text-sm font-medium text-text-main mb-1.5">
            Groq API 金鑰
          </label>
          <div className="flex items-center gap-2 mb-2">
            <input
              id="groq-api-key"
              type={isGroqRevealed ? 'text' : 'password'}
              value={draftGroqKey}
              onChange={(e) => setDraftGroqKey(e.target.value)}
              placeholder="貼上您的 API 金鑰..."
              autoComplete="off"
              spellCheck={false}
              className="flex-grow px-3.5 py-2.5 bg-secondary border border-transparent rounded-xl text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors duration-150 ease-apple"
            />
            <button
              type="button"
              onClick={() => setIsGroqRevealed(prev => !prev)}
              className="px-3 py-2.5 text-xs font-medium rounded-xl bg-secondary hover:bg-border-color/60 text-text-secondary transition-colors duration-150 ease-apple flex-shrink-0"
            >
              {isGroqRevealed ? '隱藏' : '顯示'}
            </button>
          </div>

          <a
            href="https://console.groq.com/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-accent hover:underline"
          >
            還沒有金鑰？前往 Groq Console 免費取得 →
          </a>

          <div className="mt-3">
            <button
              type="button"
              onClick={handleClearGroq}
              disabled={!groqApiKey}
              className="text-sm text-red-500 hover:text-red-400 disabled:text-text-secondary/40 disabled:cursor-not-allowed transition-colors duration-150 ease-apple"
            >
              清除金鑰
            </button>
          </div>
        </section>

        <div className="flex items-center justify-end gap-2 mt-6">
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

        <div className="h-px bg-border-color my-6"></div>

        <section>
          <div className="flex items-center gap-2 mb-2">
            <ArchiveIcon className="w-4 h-4 text-accent" />
            <h3 className="text-sm font-semibold text-text-main">資料備份與還原</h3>
          </div>

          <p className="text-sm text-text-secondary mb-4 leading-relaxed">
            所有筆記都只保存在<strong className="text-text-main">這台裝置的瀏覽器</strong>裡。
            建議定期匯出備份，換裝置或清除瀏覽器資料前也別忘了先備份。
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onExportBackup}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-secondary hover:bg-border-color/60 text-text-main transition-colors duration-150 ease-apple"
            >
              <ExportIcon className="w-4 h-4" />
              匯出備份
            </button>
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-secondary hover:bg-border-color/60 text-text-main transition-colors duration-150 ease-apple"
            >
              <ImportIcon className="w-4 h-4" />
              匯入備份
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleImportFileChange}
            />
          </div>
        </section>
      </div>
    </div>
  );
};

export default SettingsModal;
