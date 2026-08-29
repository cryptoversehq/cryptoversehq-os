/**
 * TranslationProvider — mounts the DOM translation engine and exposes context.
 */
import React, { createContext, useContext, useEffect } from 'react';
import { LANGUAGES, LangCode } from './i18n';
import { useI18nStore } from './i18nStore';
import { initDomTranslator, destroyDomTranslator, setDomLanguage } from './domTranslator';

interface AutoTranslateContextValue {
  locale: LangCode;
  setLocale: (lang: LangCode) => void;
  availableLocales: LangCode[];
  isTranslating: boolean;
  translationProgress: number;
}

const AutoTranslateContext = createContext<AutoTranslateContextValue | null>(null);

export function useAutoTranslate(): AutoTranslateContextValue {
  const ctx = useContext(AutoTranslateContext);
  if (!ctx) throw new Error('useAutoTranslate must be used inside <TranslationProvider>');
  return ctx;
}

interface TranslationProviderProps {
  children: React.ReactNode;
  sourceLocale?: LangCode;
}

export function TranslationProvider({ children }: TranslationProviderProps) {
  const { lang, setLang, isTranslating, translationProgress } = useI18nStore();

  useEffect(() => {
    // 1. Start the MutationObserver so new DOM nodes are translated automatically
    initDomTranslator();

    // 2. If the stored language isn't English, run the initial translation pass
    //    after React has rendered the first frame
    if (lang !== 'en') {
      // Small RAF delay so the DOM is fully populated before we walk it
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setDomLanguage(lang);
        });
      });
    }

    return () => {
      destroyDomTranslator();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only on mount

  const value: AutoTranslateContextValue = {
    locale: lang,
    setLocale: setLang,
    availableLocales: LANGUAGES.map((l) => l.code),
    isTranslating,
    translationProgress,
  };

  return (
    <AutoTranslateContext.Provider value={value}>
      {children}
    </AutoTranslateContext.Provider>
  );
}
