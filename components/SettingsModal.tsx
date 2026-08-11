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
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-full text-text-secondary hover:bg-secondary hover:text-text-main transition-colors duration-150 ease-apple" title={t('common.closeEsc')} aria-label={t('common.close')}>
          <XIcon className="w-5 h-5" />
        </button>

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
        </section>
      </div>
    </div>
  );
};

export default SettingsModal;
