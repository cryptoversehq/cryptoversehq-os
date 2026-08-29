/**
 * tradeReplay.ts — CryptoVerse HQ Feature #2
 *
 * Trade Replay: replays past trades with AI coaching at 3 moments.
 * Pro+ users only. Integrates with Lynx AI agent.
 *
 * Usage:
 *   import { analyzeTradeInReplay, REPLAY_SPEEDS } from '@/features/tradeReplay';
 *   const analysis = await analyzeTradeInReplay(trade);
 */

import { deepSeekAsk } from '@/lib/deepSeekClient';
import type { TradeRecord } from '@/lib/tradingStore';

export const REPLAY_SPEEDS = [1,2,5] as const;
export type ReplaySpeed = typeof REPLAY_SPEEDS[number];

export interface TradeAnalysis {
  beforeEntry: string;
  duringTrade: string;
  afterExit: string;
  summary: { strengths: string[]; weaknesses: string[]; score: number };
}

export async function analyzeTradeInReplay(trade: TradeRecord): Promise<TradeAnalysis> {
  const ctx = `${trade.side} ${trade.symbol} | Entry:$${trade.entryPrice} | Exit:$${trade.exitPrice??'open'} | PnL:$${trade.pnl} | ${trade.leverage}x | ${trade.timestamp}`;

  const [before, during, after, sumRaw] = await Promise.all([
    deepSeekAsk(`For this trade: ${ctx}. Before entry, what 2-3 factors could help a better decision? Be concise.`),
    deepSeekAsk(`During this trade: ${ctx}. Give 2-3 risk management tips (stop-loss, sizing). Be concise.`),
    deepSeekAsk(`After this trade: ${ctx}. Key lessons? Rate performance 0-100. Be concise.`),
    deepSeekAsk(`Return JSON: strengths & weaknesses of trade ${ctx}. Format: {"strengths":["..."],"weaknesses":["..."],"score":0-100}. Only JSON.`),
  ]);

  let summary = { strengths: ['Trade executed'], weaknesses: ['Insufficient data'], score: 50 };
  try {
    const j = JSON.parse(sumRaw.replace(/```json\n?/g,'').replace(/\n?```/g,'').trim());
    summary = { strengths: j.strengths||summary.strengths, weaknesses: j.weaknesses||summary.weaknesses, score: j.score||50 };
  } catch {}

  return { beforeEntry:before, duringTrade:during, afterExit:after, summary };
}
