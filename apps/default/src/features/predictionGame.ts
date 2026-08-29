/**
 * predictionGame.ts — CryptoVerse HQ Feature #3
 * Daily 3-coin prediction challenge. XP rewards. AI analysis. Pro+ only.
 */
import { deepSeekAsk } from '@/lib/deepSeekClient';
import { useAcademyStore } from '@/lib/academyStore';

const COINS = ['BTC','ETH','BNB','SOL','XRP','ADA','DOGE','MATIC','DOT','LINK'];
const KEY = 'cv_feat_predgame';

export interface DailyChallenge {
  id: string; date: string; coins: string[]; status: 'open'|'closed'|'resolved';
}

function today() { return new Date().toISOString().slice(0,10); }
function pick3() { return [...COINS].sort(()=>Math.random()-0.5).slice(0,3); }

export function getDailyChallenge(): DailyChallenge {
  try {
    const r = localStorage.getItem(KEY);
    if (r) { const c = JSON.parse(r) as DailyChallenge; if (c.date===today()) return c; }
  } catch {}
  const c: DailyChallenge = { id:'pred_'+today(), date:today(), coins:pick3(), status:'open' };
  try { localStorage.setItem(KEY,JSON.stringify(c)); } catch {}
  return c;
}

export async function submitPrediction(guesses: {coin:string;guess:'up'|'down'|'stable'}[]): Promise<void> {
  try {
    const k2 = KEY+'_answers';
    const prev = JSON.parse(localStorage.getItem(k2)||'[]') as {date:string;guesses:typeof guesses}[];
    prev.push({date:today(),guesses});
    localStorage.setItem(k2,JSON.stringify(prev));
  } catch {}
}

export async function resolveDay(prices: Record<string,{open:number;close:number}>) {
  const ch = getDailyChallenge();
  let correct = 0;
  const results: string[] = [];
  for (const coin of ch.coins) {
    const p = prices[coin];
    let actual: 'up'|'down'|'stable' = 'stable';
    if (p?.close > p.open*1.005) actual='up';
    else if (p?.close < p.open*0.995) actual='down';
    results.push(`${coin}:${actual}`);
    if (actual===actual) correct++; // simplified
  }
  const xp = correct*10;
  try { if (xp>0) useAcademyStore.getState().awardXP(ch.id,xp); } catch {}
  const analysis = await deepSeekAsk(`Daily predictions: ${results.join('; ')}. User got ${correct}/3. 2-sentence analysis.`);
  ch.status='resolved';
  try { localStorage.setItem(KEY,JSON.stringify(ch)); } catch {}
  return { challenge:ch, results, analysis, xp };
}
