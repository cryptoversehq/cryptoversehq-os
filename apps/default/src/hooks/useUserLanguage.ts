// Safe localStorage wrapper that handles quota errors
function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key: string, value: string): boolean {
  try { localStorage.setItem(key, value); return true; }
  catch { console.warn('[useUserLanguage] localStorage write failed (quota exceeded). Preference will be in-memory only.'); return false; }
}
function safeRemove(key: string): void {
  try { localStorage.removeItem(key); return; } catch { return; }
}

import { useState, useEffect, useCallback } from 'react';
import { languageDetector, type LanguageDetectionResult } from '@/lib/languageDetector';

const USER_LANGUAGE_KEY = 'cv_user_lang';

export interface UserLanguage { code: string; name: string; native: string; isDetected: boolean; isManual: boolean; confidence: number; }

export function useUserLanguage() {
  const [userLanguage, setUserLanguage] = useState<UserLanguage | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Load saved preference (tiny JSON, ~100 bytes)
    const stored = safeGet(USER_LANGUAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.code) { setUserLanguage(parsed); setIsLoading(false); return; }
      } catch { safeRemove(USER_LANGUAGE_KEY); }
    }
    // Detect browser language
    try {
      const browserLang = navigator.language.split('-')[0];
      if (languageDetector.isSupported(browserLang)) {
        const result: UserLanguage = { code: browserLang, name: languageDetector.getLanguageName(browserLang), native: languageDetector.getNativeName(browserLang), isDetected: true, isManual: false, confidence: 0.8 };
        setUserLanguage(result);
        safeSet(USER_LANGUAGE_KEY, JSON.stringify(result));
        setIsLoading(false);
        return;
      }
    } catch {}
    // Default English
    const def: UserLanguage = { code: 'en', name: 'English', native: 'English', isDetected: true, isManual: false, confidence: 1 };
    setUserLanguage(def);
    setIsLoading(false);
  }, []);

  const detectFromText = useCallback((text: string): LanguageDetectionResult => languageDetector.detect(text), []);

  const setManualLanguage = useCallback((code: string) => {
    if (!languageDetector.isSupported(code)) return;
    const lang: UserLanguage = { code, name: languageDetector.getLanguageName(code), native: languageDetector.getNativeName(code), isDetected: false, isManual: true, confidence: 1 };
    setUserLanguage(lang);
    safeSet(USER_LANGUAGE_KEY, JSON.stringify(lang));
  }, []);

  const resetToAutoDetect = useCallback(() => { safeRemove(USER_LANGUAGE_KEY); setUserLanguage(null); setIsLoading(true); },
  // Re-trigger detection
  []);

  const getQueryLanguage = useCallback((query: string): string => {
    if (userLanguage?.isManual) return userLanguage.code;
    const d = languageDetector.detect(query);
    if (d.confidence > 0.6) return d.code;
    return userLanguage?.code || 'en';
  }, [userLanguage]);

  return { userLanguage, isLoading, detectFromText, setManualLanguage, resetToAutoDetect, getQueryLanguage, supportedLanguages: languageDetector.getSupportedLanguages() };
}