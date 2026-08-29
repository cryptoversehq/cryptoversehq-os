/** translationEngine.ts — Crypto-Aware Translation Engine */
import { languageDetector } from './languageDetector';

export interface TranslationOptions { sourceLanguage?: string; targetLanguage: string; preserveCryptoTerms?: boolean; context?: 'general' | 'trading' | 'defi' | 'nft' | 'technical'; }
export interface TranslationResult { translated: string; sourceLanguage: string; targetLanguage: string; confidence: number; cryptoTermsFound: string[]; wasCached: boolean; }

const DICT: Record<string, Record<string, string>> = {}; // populated below

const cache = new Map<string, TranslationResult>();

export class TranslationEngine {
  private apiUrl = 'https://api.deepl.com/v2/translate';

  async translate(text: string, opts: TranslationOptions): Promise<TranslationResult> {
    const src = opts.sourceLanguage || languageDetector.detect(text).code;
    const tgt = opts.targetLanguage;
    if (src === tgt) return { translated: text, sourceLanguage: src, targetLanguage: tgt, confidence: 1, cryptoTermsFound: [], wasCached: false };
    const ck = src + ':' + tgt + ':' + text;
    if (cache.has(ck)) return { ...cache.get(ck)!, wasCached: true };
    const { processed, terms } = this.extractTerms(text, src, tgt);
    let translated = await this.apiTranslate(processed, src, tgt);
    for (const t of terms.reverse()) translated = translated.replace(t.placeholder, t.targetTerm);
    const r: TranslationResult = { translated, sourceLanguage: src, targetLanguage: tgt, confidence: terms.length > 0 ? 0.95 : 0.7, cryptoTermsFound: terms.map(t => t.id), wasCached: false };
    cache.set(ck, r); return r;
  }

  private extractTerms(text: string, src: string, tgt: string): { processed: string; terms: Array<{ id: string; placeholder: string; targetTerm: string }> } {
    const terms: Array<{ id: string; placeholder: string; targetTerm: string }> = [];
    let processed = text;
    const entries = Object.entries(DICT).sort((a, b) => (b[1][src] || '').length - (a[1][src] || '').length);
    for (const [id, lm] of entries) {
      const st = lm[src]; if (!st) continue;
      const rx = new RegExp('\\b' + st.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
      if (rx.test(processed)) {
        const ph = '__T_' + id + '_' + terms.length + '__';
        processed = processed.replace(rx, ph);
        terms.push({ id, placeholder: ph, targetTerm: lm[tgt] || lm.en });
      }
    }
    return { processed, terms };
  }

  private async apiTranslate(text: string, from: string, to: string): Promise<string> {
    const key = process.env['NEXT_PUBLIC_TRANSLATE_API_KEY'] || '';
    if (!key) return text;
    try {
      const r = await fetch(this.apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'DeepL-Auth-Key ' + key }, body: JSON.stringify({ text: [text], target_lang: to.toUpperCase(), source_lang: from.toUpperCase() }) });
      if (!r.ok) throw new Error('Status ' + r.status);
      const d = await r.json(); return d.translations?.[0]?.text || text;
    } catch { return text; }
  }

  translateTerm(id: string, lang: string): string | null { return DICT[id]?.[lang] || DICT[id]?.en || null; }
  getSupportedLanguages(): string[] { return ['en','fa','ar','es','fr','de','ru','zh','ja','ko','hi','tr','it','pt','nl','pl','uk','vi','th','id']; }
  addTerm(id: string, translations: Record<string, string>): void { DICT[id] = translations; }
  addTerms(terms: Record<string, Record<string, string>>): void { Object.assign(DICT, terms); }
}

export const translationEngine = new TranslationEngine();