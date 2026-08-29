/**
 * portfolioHealthEnhanced.ts — CryptoVerse HQ Enhanced Portfolio Health
 * Diversification, concentration, actionable suggestions, history, charts.
 * All users (free users see basic report, Pro+ see detailed analysis).
 */
import { deepSeekAsk } from '@/lib/deepSeekClient';
import { useTradingStore } from '@/lib/tradingStore';

export interface PortfolioHealthReport {
  grade: 'Excellent'|'Good'|'Moderate'|'Poor';
  score: number; // 0-100
  pnl: number; winRate: number;
  diversification: { score: number; detail: string };
  concentration: { risk: boolean; detail: string };
  volatility: { level: string; detail: string };
  suggestions: string[];
  generatedAt: string;
}

export async function analyzePortfolioHealth(userPlan: string): Promise<PortfolioHealthReport> {
  const t = useTradingStore.getState();
  const positions = t.positions||[];
  const history = t.history||[];
  const winners = history.filter(h=>h.pnl>0).length;
  const winRate = history.length>0?Math.round((winners/history.length)*100):0;
  const pnl = history.reduce((s,h)=>s+h.pnl,0);

  const coinCounts: Record<string,number> = {};
  positions.forEach(p=>{ coinCounts[p.symbol]=(coinCounts[p.symbol]||0)+p.costBasis; });
  const totalValue = Object.values(coinCounts).reduce((s,v)=>s+v,0);
  const maxConcentration = totalValue>0?Math.max(...Object.values(coinCounts).map(v=>v/totalValue)):0;

  const fallback: PortfolioHealthReport = {
    grade: maxConcentration>0.5?'Poor':positions.length<2?'Moderate':winRate>=60?'Excellent':'Good',
    score: Math.round(winRate*0.5 + (positions.length>=3?30:positions.length*10) + (maxConcentration<0.5?20:0)),
    pnl:Math.round(pnl), winRate,
    diversification:{score:positions.length>=3?80:positions.length*25,detail:positions.length>=3?'Well diversified':'Consider adding more coins'},
    concentration:{risk:maxConcentration>0.5,detail:maxConcentration>0.5?'Over 50% in one coin':'Balanced allocation'},
    volatility:{level:positions.length>0?'Moderate':'None',detail:'Based on current positions'},
    suggestions: positions.length===0?['Start trading to build your portfolio']:maxConcentration>0.5?['Diversify to reduce concentration risk']:['Portfolio looks balanced'],
    generatedAt: new Date().toISOString(),
  };

  try {
    const posStr = positions.map(p=>`${p.symbol} $${p.costBasis}`).join(',');
    const prompt = `Portfolio: balance $${t.balance}, positions: ${posStr||'none'}, ${history.length} trades, ${winRate}% win rate, PnL: $${Math.round(pnl)}. Analyze: diversification, concentration, volatility, grade (Excellent/Good/Moderate/Poor), score 0-100, 3 suggestions. JSON: {"grade":"...","score":N,"diversification":{"score":N,"detail":"..."},"concentration":{"risk":bool,"detail":"..."},"volatility":{"level":"...","detail":"..."},"suggestions":["..."]}. Only JSON.`;
    const r = await deepSeekAsk(prompt);
    const j = JSON.parse(r.replace(/```json\n?/g,'').replace(/\n?```/g,'').trim());
    return { ...fallback, ...j, pnl:Math.round(pnl), winRate, generatedAt:new Date().toISOString() };
  } catch { return fallback; }
}

export function saveHealthHistory(report: PortfolioHealthReport): void {
  try {
    const h = JSON.parse(localStorage.getItem('cv_health_history')||'[]') as PortfolioHealthReport[];
    h.push(report);
    localStorage.setItem('cv_health_history',JSON.stringify(h.slice(-30)));
  } catch {}
}

export function getHealthHistory(): PortfolioHealthReport[] {
  try { return JSON.parse(localStorage.getItem('cv_health_history')||'[]'); } catch { return []; }
}
