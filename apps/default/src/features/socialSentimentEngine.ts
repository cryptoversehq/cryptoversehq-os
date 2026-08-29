/**
 * socialSentimentEngine.ts — CryptoVerse HQ Feature #1
 *
 * Social Sentiment Engine: analyzes sentiment for 10 major coins via DeepSeek,
 * computes 0-100 Social Sentiment Score per coin, renders Market Mood widget.
 * Pro+ users only. Integrates with Taskade Sentiment Agent.
 *
 * Usage:
 *   import { fetchSentimentSnapshot, getMoodWidgetData, checkSentimentAlerts } from '@/features/socialSentimentEngine';
 *   const snap = await fetchSentimentSnapshot();
 *   const mood = getMoodWidgetData(snap);
 */

import { deepSeekAsk } from '@/lib/deepSeekClient';

// ─── Constants ─────────────────────────────────────────────────────────────

export const TRACKED_COINS = ['BTC','ETH','BNB','SOL','XRP','ADA','DOGE','MATIC','DOT','LINK'] as const;
export const CACHE_KEY = 'cv_feat_sentiment';
const CACHE_TTL_MS = 15 * 60_000; // 15 min

// ─── Types ────────────────────────────────────────────────────────────────

export interface CoinSentiment {
  coin: string;
  score: number;         // 0-100
  label: 'positive' | 'neutral' | 'negative';
  summary: string;
}

export interface SentimentSnapshot {
  coins: CoinSentiment[];
  marketMood: number;    // 0-100 weighted avg
  moodLabel: string;
  updatedAt: string;     // ISO-8601
}

// ─── Cache ─────────────────────────────────────────────────────────────────

function readCache(): SentimentSnapshot | null {
  try {
    const r = localStorage.getItem(CACHE_KEY);
    if (!r) return null;
    const s = JSON.parse(r) as SentimentSnapshot;
    if (Date.now() - new Date(s.updatedAt).getTime() > CACHE_TTL_MS) return null;
    return s;
  } catch { return null; }
}

function writeCache(s: SentimentSnapshot): void {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(s)); } catch {}
}

// ─── AI analysis ────────────────────────────────────────────────────────────

async function analyzeCoin(coin: string): Promise<CoinSentiment> {
  const p = `Analyze current social media sentiment for ${coin} cryptocurrency. Return ONLY valid JSON: {"label":"positive|neutral|negative","score":0-100,"summary":"one brief sentence"}`;
  const r = await deepSeekAsk(p);
  try {
    const j = JSON.parse(r.replace(/```json\n?/g,'').replace(/\n?```/g,'').trim()) as {label:string;score:number;summary:string};
    return {
      coin,
      score: Math.min(100,Math.max(0,Math.round(j.score||50))),
      label: (['positive','neutral','negative'].includes(j.label) ? j.label : 'neutral') as CoinSentiment['label'],
      summary: j.summary || `${coin} sentiment is ${j.label}.`,
    };
  } catch {
    return { coin, score:50, label:'neutral', summary:`No sentiment data for ${coin}.` };
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

export async function fetchSentimentSnapshot(): Promise<SentimentSnapshot> {
  const cached = readCache();
  if (cached) return cached;

  const coins = await Promise.all(TRACKED_COINS.map(analyzeCoin));
  const avg = Math.round(coins.reduce((s,c)=>s+c.score,0)/coins.length);
  let label = 'Neutral';
  if (avg>=70) label='Bullish 🟢';
  else if (avg>=55) label='Slightly Bullish';
  else if (avg<=30) label='Fearful 🔴';
  else if (avg<=45) label='Slightly Bearish';

  const snap: SentimentSnapshot = { coins, marketMood:avg, moodLabel:label, updatedAt:new Date().toISOString() };
  writeCache(snap);
  return snap;
}

export async function checkSentimentAlerts(prev: SentimentSnapshot, curr: SentimentSnapshot): Promise<string[]> {
  const alerts: string[] = [];
  for (const c of curr.coins) {
    const p = prev.coins.find(x=>x.coin===c.coin);
    if (p && Math.abs(c.score-p.score)>=20)
      alerts.push(`⚠ ${c.coin} sentiment ${c.score>p.score?'surged':'dropped'} ${p.score}→${c.score}: ${c.summary}`);
  }
  if (Math.abs(curr.marketMood-prev.marketMood)>=15)
    alerts.push(`🌍 Market mood: ${prev.moodLabel} → ${curr.moodLabel}`);
  return alerts;
}

export function getMoodWidgetData(snap: SentimentSnapshot) {
  const top = snap.coins.reduce((a,b)=>a.score>b.score?a:b);
  const bot = snap.coins.reduce((a,b)=>a.score<b.score?a:b);
  return { score:snap.marketMood, label:snap.moodLabel, topGainer:top, topLoser:bot };
}
