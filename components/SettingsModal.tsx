import React, { useState, useEffect, useRef } from 'react';
import { XIcon, KeyIcon, SettingsIcon, ArchiveIcon, ExportIcon, ImportIcon } from './icons';
import { useTranslation } from '../contexts/LanguageContext';
import type { TranscriptionLanguage } from '../utils/transcriptionLanguage';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  onSaveApiKey: (key: string) => void;
  groqApiKey: string;
  onSaveGroqApiKey: (key: string) => void;
  transcriptionLanguage: TranscriptionLanguage;
  onSaveTranscriptionLanguage: (language: TranscriptionLanguage) => void;
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
  transcriptionLanguage,
  onSaveTranscriptionLanguage,
  onExportBackup,
  onImportBackup,
}) => {
  const { language, setLanguage, t } = useTranslation();
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
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-full text-text-secondary hover:bg-secondary hover:text-text-main transition-colors duration-150 ease-apple z-10" title={t('common.closeEsc')} aria-label={t('common.close')}>
          <XIcon className="w-5 h-5" />
        </button>

        <div className="modal-content-scroll">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-accent/10 text-accent flex items-center justify-center flex-shrink-0">
            <SettingsIcon className="w-5 h-5" />
          </div>
          <h2 id="settings-modal-title" className="text-xl font-semibold text-text-main">{t('settings.title')}</h2>
        </div>

        <section>
          <h3 className="text-sm font-semibold text-text-main mb-2">{t('settings.language')}</h3>
          <p className="text-sm text-text-secondary mb-3 leading-relaxed">{t('settings.languageDescription')}</p>
          <div className="flex rounded-full bg-secondary p-1 w-fit">
            <button
              type="button"
              onClick={() => setLanguage('zh')}
              aria-pressed={language === 'zh'}
              className={`px-4 py-1.5 text-sm font-medium rounded-full transition-all duration-150 ease-apple ${
                language === 'zh' ? 'bg-accent text-white shadow-apple-xs' : 'text-text-secondary hover:text-text-main'
              }`}
            >
              {t('settings.languageZh')}
            </button>
            <button
              type="button"
              onClick={() => setLanguage('en')}
              aria-pressed={language === 'en'}
              className={`px-4 py-1.5 text-sm font-medium rounded-full transition-all duration-150 ease-apple ${
                language === 'en' ? 'bg-accent text-white shadow-apple-xs' : 'text-text-secondary hover:text-text-main'
              }`}
            >
              {t('settings.languageEn')}
            </button>
          </div>
        </section>

        <div className="h-px bg-border-color my-6"></div>

        <section>
          <div className="flex items-center gap-2 mb-2">
            <KeyIcon className="w-4 h-4 text-accent" />
            <h3 className="text-sm font-semibold text-text-main">{t('settings.aiPartnerSectionTitle')}</h3>
          </div>

          <p className="text-sm text-text-secondary mb-4 leading-relaxed">{t('settings.aiPartnerDescription')}</p>

          <label htmlFor="gemini-api-key" className="block text-sm font-medium text-text-main mb-1.5">
            {t('settings.geminiApiKeyLabel')}
          </label>
          <div className="flex items-center gap-2 mb-2">
            <input
              id="gemini-api-key"
              type={isRevealed ? 'text' : 'password'}
              value={draftKey}
              onChange={(e) => setDraftKey(e.target.value)}
              placeholder={t('settings.apiKeyPlaceholder')}
              autoComplete="off"
              spellCheck={false}
              className="flex-grow px-3.5 py-2.5 bg-secondary border border-transparent rounded-xl text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors duration-150 ease-apple"
            />
            <button
              type="button"
              onClick={() => setIsRevealed(prev => !prev)}
              className="px-3 py-2.5 text-xs font-medium rounded-xl bg-secondary hover:bg-border-color/60 text-text-secondary transition-colors duration-150 ease-apple flex-shrink-0"
            >
              {isRevealed ? t('settings.hide') : t('settings.reveal')}
            </button>
          </div>

          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-accent hover:underline"
          >
            {t('settings.getGeminiKey')}
          </a>

          <div className="mt-3">
            <button
              type="button"
              onClick={handleClear}
              disabled={!apiKey}
              className="text-sm text-red-500 hover:text-red-400 disabled:text-text-secondary/40 disabled:cursor-not-allowed transition-colors duration-150 ease-apple"
            >
              {t('settings.clearKey')}
            </button>
          </div>
        </section>

        <div className="h-px bg-border-color my-6"></div>

        <section>
          <div className="flex items-center gap-2 mb-2">
            <KeyIcon className="w-4 h-4 text-accent" />
            <h3 className="text-sm font-semibold text-text-main">{t('settings.voiceNoteSectionTitle')}</h3>
          </div>

          <p className="text-sm text-text-secondary mb-4 leading-relaxed">{t('settings.voiceNoteDescription')}</p>

          <label htmlFor="groq-api-key" className="block text-sm font-medium text-text-main mb-1.5">
            {t('settings.groqApiKeyLabel')}
          </label>
          <div className="flex items-center gap-2 mb-2">
            <input
              id="groq-api-key"
              type={isGroqRevealed ? 'text' : 'password'}
              value={draftGroqKey}
              onChange={(e) => setDraftGroqKey(e.target.value)}
              placeholder={t('settings.apiKeyPlaceholder')}
              autoComplete="off"
              spellCheck={false}
              className="flex-grow px-3.5 py-2.5 bg-secondary border border-transparent rounded-xl text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors duration-150 ease-apple"
            />
            <button
              type="button"
              onClick={() => setIsGroqRevealed(prev => !prev)}
              className="px-3 py-2.5 text-xs font-medium rounded-xl bg-secondary hover:bg-border-color/60 text-text-secondary transition-colors duration-150 ease-apple flex-shrink-0"
            >
              {isGroqRevealed ? t('settings.hide') : t('settings.reveal')}
            </button>
          </div>

          <a
            href="https://console.groq.com/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-accent hover:underline"
          >
            {t('settings.getGroqKey')}
          </a>

          <div className="mt-3">
            <button
              type="button"
              onClick={handleClearGroq}
              disabled={!groqApiKey}
              className="text-sm text-red-500 hover:text-red-400 disabled:text-text-secondary/40 disabled:cursor-not-allowed transition-colors duration-150 ease-apple"
            >
              {t('settings.clearKey')}
            </button>
          </div>

          <div className="mt-5">
            <h4 className="text-sm font-medium text-text-main mb-1.5">{t('settings.transcriptionLanguage')}</h4>
            <p className="text-sm text-text-secondary mb-3 leading-relaxed">{t('settings.transcriptionLanguageDescription')}</p>
            <div className="flex rounded-full bg-secondary p-1 w-fit">
              {(['auto', 'zh', 'en'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => onSaveTranscriptionLanguage(option)}
                  aria-pressed={transcriptionLanguage === option}
                  className={`px-4 py-1.5 text-sm font-medium rounded-full transition-all duration-150 ease-apple ${
                    transcriptionLanguage === option ? 'bg-accent text-white shadow-apple-xs' : 'text-text-secondary hover:text-text-main'
                  }`}
                >
                  {option === 'auto' ? t('settings.transcriptionLanguageAuto') : option === 'zh' ? t('settings.languageZh') : t('settings.languageEn')}
                </button>
              ))}
            </div>
          </div>
        </section>

        <div className="flex items-center justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-full text-text-secondary hover:bg-secondary transition-all duration-150 ease-apple active:scale-95"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium rounded-full bg-accent text-white hover:opacity-90 transition-all duration-150 ease-apple active:scale-95"
          >
            {t('common.save')}
          </button>
        </div>

        <div className="h-px bg-border-color my-6"></div>

        <section>
          <div className="flex items-center gap-2 mb-2">
            <ArchiveIcon className="w-4 h-4 text-accent" />
            <h3 className="text-sm font-semibold text-text-main">{t('settings.backupSectionTitle')}</h3>
          </div>

          <p className="text-sm text-text-secondary mb-4 leading-relaxed">{t('settings.backupDescription')}</p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onExportBackup}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-secondary hover:bg-border-color/60 text-text-main transition-colors duration-150 ease-apple"
            >
              <ExportIcon className="w-4 h-4" />
              {t('settings.exportBackup')}
            </button>
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-secondary hover:bg-border-color/60 text-text-main transition-colors duration-150 ease-apple"
            >
              <ImportIcon className="w-4 h-4" />
              {t('settings.importBackup')}
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleImportFileChange}
            />
          </div>

          <StorageUsage />
        </section>
        </div>
      </div>
    </div>
  );
};

// Browsers cap localStorage (which holds the notes' text) at roughly 5M
// characters per origin; images and recordings live in IndexedDB, whose
// quota follows free disk space.
const LOCAL_STORAGE_LIMIT_CHARS = 5 * 1024 * 1024;

const formatBytes = (bytes: number): string => {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

const StorageUsage: React.FC = () => {
  const { t } = useTranslation();
  const [textChars, setTextChars] = useState(0);
  const [media, setMedia] = useState<{ usage: number; quota: number } | null>(null);

  useEffect(() => {
    let chars = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) chars += key.length + (localStorage.getItem(key)?.length ?? 0);
    }
    setTextChars(chars);
    navigator.storage?.estimate?.()
      .then(({ usage, quota }) => {
        if (usage !== undefined && quota !== undefined) setMedia({ usage, quota });
      })
      .catch(() => {});
  }, []);

  const ratio = Math.min(1, textChars / LOCAL_STORAGE_LIMIT_CHARS);
  const nearlyFull = ratio >= 0.8;
  return (
    <div className="mt-5 space-y-2 text-sm">
      <p className="font-medium text-text-main">{t('settings.storageTitle')}</p>
      <div>
        <div className="flex justify-between text-text-secondary">
          <span>{t('settings.storageNotes')}</span>
          <span>{formatBytes(textChars)} / {formatBytes(LOCAL_STORAGE_LIMIT_CHARS)}</span>
        </div>
        <div className="mt-1 h-1.5 rounded-full bg-secondary overflow-hidden">
          <div
            className={`h-full rounded-full ${nearlyFull ? 'bg-red-500' : 'bg-accent'}`}
            style={{ width: `${Math.max(ratio * 100, 1)}%` }}
          />
        </div>
        {nearlyFull && <p className="mt-1 text-xs text-red-500">{t('settings.storageNearlyFull')}</p>}
      </div>
      {media && (
        <div className="flex justify-between text-text-secondary">
          <span>{t('settings.storageMedia')}</span>
          <span>{t('settings.storageMediaDetail', { used: formatBytes(media.usage), quota: formatBytes(media.quota) })}</span>
        </div>
      )}
    </div>
  );
};

export default SettingsModal;
