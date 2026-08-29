// lynxUniversalLanguage.ts - Universal Language Engine
import { languageDetector } from './languageDetector';
import { languageCache } from './languageCache';
import { translationEngine } from './translationEngine';
import { lynxPipeline } from './lynxPipeline';
import { isRelevantQuestion } from './relevanceFilter';

export interface ULEQuery { query: string; userId: string; contextSection?: string; preferredLanguage?: string; }
export interface ULEResponse { content: string; source: 'cache'|'local'|'deepseek'|'translated'; language: string; confidence: number; isTranslated: boolean; cryptoTerms: string[]; processingTime: number; }

export class LynxUniversalLanguage {
  private s = { t:0, ch:0, cm:0, l:0, d:0, tr:0 };

  async processQuery(req: ULEQuery): Promise<ULEResponse> {
    const t0 = Date.now(); this.s.t++;

    // Off-topic guard: refuse non-crypto / non-app questions before spending any
    // pipeline work. (Role-based DATA access is enforced by permissionEngine +
    // memoryAccessGateway, not here.)
    if (!isRelevantQuestion(req.query)) {
      return {
        content: "I'm 🦊 Lynx AI, CryptoVerse HQ's assistant. I focus on crypto, trading, and the CryptoVerse app — I can't help with that, but ask me anything about markets, the Academy, bots, your portfolio, or the app!",
        source: 'local', language: 'en', confidence: 1, isTranslated: false,
        cryptoTerms: [], processingTime: Date.now() - t0,
      };
    }

    const lang = req.preferredLanguage || languageDetector.detect(req.query).code;
    const ck = lang + req.query; const c = languageCache.get(req.query, lang);
    if (c) { this.s.ch++; return { content:c, source:'cache', language:lang, confidence:1, isTranslated:false, cryptoTerms:[], processingTime:Date.now()-t0 }; }
    this.s.cm++;
    // Persian + English: route through the permission-checked pipeline.
    // (The former direct lynxResponder.answerQuestion() fast path was removed
    // so a local answer can no longer bypass Identity → Permission → Brain Fusion.)
    if (lang==='fa'||lang==='en') {
      const p = await lynxPipeline.processQuery({ userId:req.userId, query:req.query, context:{ currentSection:req.contextSection, language:lang } });
      languageCache.set(req.query,p.content,lang); this.s.d++; return { content:p.content, source:'deepseek', language:lang, confidence:.85, isTranslated:false, cryptoTerms:[], processingTime:Date.now()-t0 };
    }
    // Other languages: translate to EN, process, translate back
    const ctx = this.ctx(req.query);
    const en = await translationEngine.translate(req.query, { targetLanguage:'en', preserveCryptoTerms:true, context:ctx });
    const p = await lynxPipeline.processQuery({ userId:req.userId, query:en.translated, context:{ currentSection:req.contextSection, language:'en', isTranslated:true } });
    const bk = await translationEngine.translate(p.content, { targetLanguage:lang, preserveCryptoTerms:true, context:this.ctx(p.content) });
    languageCache.set(req.query,bk.translated,lang); this.s.tr++;
    return { content:bk.translated, source:'translated', language:lang, confidence:.8, isTranslated:true, cryptoTerms:en.cryptoTermsFound, processingTime:Date.now()-t0 };
  }

  private ctx(t: string): 'general'|'trading'|'defi'|'nft'|'technical' {
    const l = t.toLowerCase();
    if (/trade|buy|sell|price|market|volume|chart|order|pnl|profit|loss|signal|leverage/.test(l)) return 'trading';
    if (/staking|yield|liquidity|pool|swap|dex|amm|lending|borrow/.test(l)) return 'defi';
    if (/nft|collectible|art|metadata|mint|auction|royalty/.test(l)) return 'nft';
    if (/blockchain|consensus|node|validator|hash|merkle|rollup|layer2|sharding|oracle/.test(l)) return 'technical';
    return 'general';
  }

  getStats() { return { ...this.s, rate: this.s.t>0 ? (this.s.ch/this.s.t)*100 : 0 }; }
  reset() { this.s = { t:0, ch:0, cm:0, l:0, d:0, tr:0 }; }
}

export const lynxULE = new LynxUniversalLanguage();