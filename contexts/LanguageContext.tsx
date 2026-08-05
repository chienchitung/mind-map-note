import React, { createContext, useContext, useCallback, useMemo } from 'react';
import useLocalStorage from '../hooks/useLocalStorage';
import { translations, TranslationKey } from '../i18n/translations';

export type Language = 'zh' | 'en';

// Simple `{{name}}` placeholder interpolation — the only substitution style
// this app's strings need (counts, seconds remaining, etc.), so a full i18n
// library (ICU plurals, RTL, namespaces) would be more machinery than the
// app actually uses anywhere.
type TranslateParams = Record<string, string | number>;

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey, params?: TranslateParams) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const interpolate = (template: string, params?: TranslateParams): string => {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, name) => (
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
  ));
};

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useLocalStorage<Language>('mind-map-language', 'zh');

  const t = useCallback((key: TranslationKey, params?: TranslateParams): string => {
    const dict = translations[language] ?? translations.zh;
    const template = dict[key] ?? translations.zh[key] ?? key;
    return interpolate(template, params);
  }, [language]);

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useTranslation = (): LanguageContextValue => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useTranslation must be used within a LanguageProvider');
  return context;
};
