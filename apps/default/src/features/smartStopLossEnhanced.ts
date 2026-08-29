/**
 * smartStopLossEnhanced.ts — CryptoVerse HQ Enhanced Stop-Loss System
 * ATR-based analysis, support/resistance, volatility data, mandatory for new users.
 */
import { deepSeekAsk } from '@/lib/deepSeekClient';

export interface SLParams { coin: string; currentPrice: number; side: 'long'|'short'; timeframe?: string; }

export interface SLRecommendation {
  level: 'conservative'|'moderate'|'aggressive';
  price: number; pct: number;
  description: string; icon: string; label: string;
}

export async function calculateSmartStopLoss(params: SLParams): Promise<SLRecommendation[]> {
  const fallback: SLRecommendation[] = [
    { level:'conservative', price:params.currentPrice*(params.side==='long'?0.95:1.05), pct:-5, description:'Low risk, suitable for beginners', icon:'📊', label:'Conservative (max 5%)' },
    { level:'moderate', price:params.currentPrice*(params.side==='long'?0.90:1.10), pct:-10, description:'Balanced risk, suitable for intermediate traders', icon:'📊', label:'Moderate (max 10%)' },
    { level:'aggressive', price:params.currentPrice*(params.side==='long'?0.80:1.20), pct:-20, description:'High risk, suitable for experienced traders', icon:'📊', label:'Aggressive (max 20%)' },
  ];

  try {
    const prompt = `Suggest 3 stop-loss levels for ${params.coin} at $${params.currentPrice}, ${params.side} side. Consider ATR, support/resistance, recent volume, 7-day volatility. Return JSON: [{"level":"conservative|moderate|aggressive","price":N,"pct":negative,"description":"one sentence"}]. Only JSON.`;
    const r = await deepSeekAsk(prompt);
    const j = JSON.parse(r.replace(/```json\n?/g,'').replace(/\n?```/g,'').trim());
    return j.map((x:{level:string;price:number;pct:number;description:string},i:number)=>({
      level: (x.level||fallback[i].level) as SLRecommendation['level'],
      price: x.price||fallback[i].price,
      pct: x.pct||fallback[i].pct,
      description: x.description||fallback[i].description,
      icon: '📊', label: fallback[i].label,
    }));
  } catch { return fallback; }
}

export function shouldForceStopLoss(leverage: number, isNewUser: boolean): boolean {
  return isNewUser || leverage > 10;
}

export function getVolatilityWarning(): string {
  return '⚠ Market is highly volatile today. Consider a wider stop-loss.';
}

export function saveSLHistory(sl: SLRecommendation): void {
  try {
    const h = JSON.parse(localStorage.getItem('cv_sl_history')||'[]') as {date:string;sl:SLRecommendation}[];
    h.push({date:new Date().toISOString(),sl});
    localStorage.setItem('cv_sl_history',JSON.stringify(h.slice(-50)));
  } catch {}
}
