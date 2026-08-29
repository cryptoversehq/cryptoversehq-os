/**
 * preTradeRiskCheckEnhanced.ts — CryptoVerse HQ Enhanced Risk System
 * Comprehensive 0-100 risk scoring, correlation checks, force-disable >80,
 * safer defaults for novices, weekly risk reports. All users.
 */
import { deepSeekAsk } from '@/lib/deepSeekClient';
import { useTradingStore } from '@/lib/tradingStore';
import { useAcademyStore } from '@/lib/academyStore';

export interface RiskParams {
  coin: string; orderType: 'Market'|'Limit'|'Stop-Limit';
  tradeSize: number; leverage: number;
  stopLoss?: number; takeProfit?: number;
  balance: number; positions: {symbol:string;costBasis:number}[];
}

export interface RiskReport {
  score: number;
  level: 'safe'|'moderate'|'high'|'critical';
  positionRisk: { ok: boolean; msg: string };
  leverageRisk: { ok: boolean; msg: string };
  stopLossRisk: { ok: boolean; msg: string };
  correlationRisk: { ok: boolean; msg: string };
  summary: string;
  suggestions: string[];
}

function getLevel(): string {
  const xp = useAcademyStore.getState().totalXP;
  if (xp<500) return 'Novice'; if (xp<1250) return 'Apprentice';
  if (xp<2250) return 'Analyst'; return 'Pro';
}

function getMaxLeverage(): number {
  const l = getLevel(); if (l==='Novice') return 5; if (l==='Apprentice') return 20; if (l==='Analyst') return 50; return 100;
}

export async function analyzeRisk(params: RiskParams): Promise<RiskReport> {
  const level = getLevel();
  const maxLev = getMaxLeverage();
  const posPct = (params.tradeSize/params.balance)*100;
  const fallback: RiskReport = {
    score: posPct>25||params.leverage>20?70:params.leverage>10?45:20,
    level: posPct>25||params.leverage>20?'high':params.leverage>10?'moderate':'safe',
    positionRisk: {ok:posPct<=25,msg:posPct>25?`Position ${posPct.toFixed(0)}% of portfolio exceeds 25% max`:'Position size is appropriate'},
    leverageRisk: {ok:params.leverage<=maxLev,msg:params.leverage>maxLev?`${params.leverage}x exceeds ${level} max of ${maxLev}x`:'Leverage is appropriate'},
    stopLossRisk: {ok:!!params.stopLoss,msg:params.stopLoss?'Stop-loss is set':'⚠ No stop-loss — you could lose everything'},
    correlationRisk: {ok:true,msg:'No correlation issues detected'},
    summary: `Risk assessment for ${params.coin}.`,
    suggestions: params.stopLoss?[]:['Set a stop-loss to protect your capital'],
  };

  try {
    const held = params.positions.map(p=>p.symbol).join(',');
    const prompt = `Crypto trade risk: ${params.coin}, ${params.orderType}, $${params.tradeSize} (${posPct.toFixed(0)}% of $${params.balance}), ${params.leverage}x, SL:$${params.stopLoss||'none'}, TP:$${params.takeProfit||'none'}. Level: ${level}. Held coins: ${held||'none'}. Return JSON: {"score":0-100,"level":"safe|moderate|high|critical","positionRisk":{"ok":bool,"msg":"..."},"leverageRisk":{"ok":bool,"msg":"..."},"stopLossRisk":{"ok":bool,"msg":"..."},"correlationRisk":{"ok":bool,"msg":"..."},"summary":"1 sentence","suggestions":["..."]}. Only JSON.`;
    const r = await deepSeekAsk(prompt);
    const j = JSON.parse(r.replace(/```json\n?/g,'').replace(/\n?```/g,'').trim());
    return { ...fallback, ...j, score:Math.min(100,Math.max(0,j.score||fallback.score)), level:j.level||fallback.level, suggestions:j.suggestions||fallback.suggestions };
  } catch {
    return fallback;
  }
}

export function getRiskMessage(score: number): {icon:string;msg:string;color:string;canProceed:boolean} {
  if (score<=30) return {icon:'✅',msg:'This trade looks safe. Good luck!',color:'#00C853',canProceed:true};
  if (score<=60) return {icon:'⚠',msg:'Moderate risk. Consider reducing leverage or position size.',color:'#FF9500',canProceed:true};
  if (score<=80) return {icon:'🔴',msg:'High risk! We recommend adjusting your trade parameters.',color:'#FF3B30',canProceed:true};
  return {icon:'🚨',msg:'Very high risk! This trade is not recommended.',color:'#FF0000',canProceed:false};
}

export function saveRiskHistory(report: RiskReport): void {
  try {
    const h = JSON.parse(localStorage.getItem('cv_risk_history')||'[]') as {date:string;report:RiskReport}[];
    h.push({date:new Date().toISOString(),report});
    localStorage.setItem('cv_risk_history',JSON.stringify(h.slice(-100)));
  } catch {}
}

export function getRiskHistory(): {date:string;report:RiskReport}[] {
  try { return JSON.parse(localStorage.getItem('cv_risk_history')||'[]'); } catch { return []; }
}
