/** languageDetector.ts — Detects 20 languages from text via script analysis + common words. */
import { SUPPORTED_LANGUAGES } from './cryptoDictionary';
export interface LanguageDetectionResult { code: string; name: string; confidence: number; isSupported: boolean; }

export class LanguageDetector {
  detect(text: string): LanguageDetectionResult {
    const c = text.trim();
    if (!c) return { code: 'en', name: 'English', confidence: 1, isSupported: true };
    // Arabic script: Persian vs Arabic
    if (/[\u0600-\u06FF]/.test(c)) {
      if (/[گچپژک]/.test(c)) return { code: 'fa', name: 'Persian', confidence: 0.95, isSupported: true };
      return { code: 'ar', name: 'Arabic', confidence: 0.85, isSupported: true };
    }
    // CJK: Chinese, Japanese, Korean
    if (/[\u4E00-\u9FFF]/.test(c)) {
      if (/[\u3040-\u30FF]/.test(c)) return { code: 'ja', name: 'Japanese', confidence: 0.85, isSupported: true };
      if (/[\uAC00-\uD7AF]/.test(c)) return { code: 'ko', name: 'Korean', confidence: 0.85, isSupported: true };
      return { code: 'zh', name: 'Chinese', confidence: 0.8, isSupported: true };
    }
    // Cyrillic: Russian vs Ukrainian
    if (/[\u0400-\u04FF]/.test(c)) {
      if (/[\u0491\u0454\u0456\u0457]/.test(c)) return { code: 'uk', name: 'Ukrainian', confidence: 0.8, isSupported: true };
      return { code: 'ru', name: 'Russian', confidence: 0.8, isSupported: true };
    }
    // Latin: use common word patterns
    const l = c.toLowerCase();
    if (/\b(the|and|for|with|this|that|have)\b/.test(l)) return { code: 'en', name: 'English', confidence: 0.9, isSupported: true };
    if (/\b(el|la|los|las|por|para|que|con)\b/.test(l)) return { code: 'es', name: 'Spanish', confidence: 0.85, isSupported: true };
    if (/\b(le|la|les|des|pour|avec|que|est)\b/.test(l)) return { code: 'fr', name: 'French', confidence: 0.85, isSupported: true };
    if (/\b(der|die|das|und|mit|auf|von)\b/.test(l)) return { code: 'de', name: 'German', confidence: 0.85, isSupported: true };
    if (/\b(bir|ve|ile|için|bu|ben|sen)\b/.test(l)) return { code: 'tr', name: 'Turkish', confidence: 0.8, isSupported: true };
    if (/\b(il|lo|la|gli|le|di|da|in|con)\b/.test(l)) return { code: 'it', name: 'Italian', confidence: 0.8, isSupported: true };
    if (/\b(o|a|os|as|em|para|com|que)\b/.test(l)) return { code: 'pt', name: 'Portuguese', confidence: 0.8, isSupported: true };
    if (/\b(de|het|een|van|op|voor|zijn)\b/.test(l)) return { code: 'nl', name: 'Dutch', confidence: 0.75, isSupported: true };
    if (/\b(się|nie|na|w|z|do|po|przez)\b/.test(l)) return { code: 'pl', name: 'Polish', confidence: 0.75, isSupported: true };
    if (/\b(mein|hai|ke|ko|ka|ki|se|aur)\b/.test(l)) return { code: 'hi', name: 'Hindi', confidence: 0.7, isSupported: true };
    if (/\b(dan|atau|dengan|untuk|dari|di)\b/.test(l)) return { code: 'id', name: 'Indonesian', confidence: 0.7, isSupported: true };
    if (/[ăâêôơưđ]/.test(l)) return { code: 'vi', name: 'Vietnamese', confidence: 0.7, isSupported: true };
    if (/\b(khun|phom|chan|mai|la|hai)\b/.test(l)) return { code: 'th', name: 'Thai', confidence: 0.6, isSupported: true };
    if (/[a-zA-Z]/.test(c)) return { code: 'en', name: 'English', confidence: 0.5, isSupported: true };
    return { code: 'en', name: 'English', confidence: 0.3, isSupported: true };
  }
  detectBatch(texts: string[]): LanguageDetectionResult[] { return texts.map(t => this.detect(t)); }
  getLanguageName(code: string): string { const x = SUPPORTED_LANGUAGES.find(l => l.code === code); return x?.name || code; }
  getNativeName(code: string): string { const x = SUPPORTED_LANGUAGES.find(l => l.code === code); return x?.native || code; }
  isSupported(code: string): boolean { return SUPPORTED_LANGUAGES.some(l => l.code === code); }
  getSupportedLanguages() { return SUPPORTED_LANGUAGES; }
}
export const languageDetector = new LanguageDetector();