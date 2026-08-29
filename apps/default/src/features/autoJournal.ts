/**
 * autoJournal.ts — CryptoVerse HQ Feature #9
 * Automated trade journaling with AI analysis per trade. Monthly reports.
 * Fully automatic — zero config needed. Pro+ only.
 */
import { deepSeekAsk } from '@/lib/deepSeekClient';
import type { TradeRecord } from '@/lib/tradingStore';

const JRNL_KEY = 'cv_feat_journal';
const NOTES_KEY = 'cv_feat_journal_notes';

export interface JournalEntry {
  tradeId: string; coin: string; side: string; entry: number; exit?: number;
  pnl: number; leverage: number; timestamp: string;
  aiAnalysis: string; personalNote?: string;
}

// ─── Load / Save ───────────────────────────────────────────────────────────

function loadJournal(): JournalEntry[] {
  try { return JSON.parse(localStorage.getItem(JRNL_KEY)||'[]'); } catch { return []; }
}
function saveJournal(entries: JournalEntry[]): void {
  try { localStorage.setItem(JRNL_KEY, JSON.stringify(entries.slice(0,500))); } catch {}
}

// ─── Auto-journal a trade ──────────────────────────────────────────────────

export async function journalTrade(trade: TradeRecord): Promise<JournalEntry> {
  const analysis = await deepSeekAsk(
    `Analyze this trade: ${trade.side} ${trade.symbol}, Entry:$${trade.entryPrice}, Exit:$${trade.exitPrice??'open'}, PnL:$${trade.pnl}, ${trade.leverage}x. Give one supportive sentence about what went well or what could improve. Be concise.`
  );

  const entry: JournalEntry = {
    tradeId: trade.id, coin: trade.symbol, side: trade.side,
    entry: trade.entryPrice, exit: trade.exitPrice, pnl: trade.pnl,
    leverage: trade.leverage, timestamp: trade.timestamp,
    aiAnalysis: analysis,
  };

  const journal = [entry, ...loadJournal()].slice(0,500);
  saveJournal(journal);
  return entry;
}

// ─── Personal notes ────────────────────────────────────────────────────────

export function addPersonalNote(tradeId: string, note: string): void {
  const journal = loadJournal().map(e => e.tradeId===tradeId ? {...e, personalNote:note} : e);
  saveJournal(journal);
}

// ─── Monthly Report ────────────────────────────────────────────────────────

export async function generateMonthlyReport(): Promise<string> {
  const journal = loadJournal();
  const monthAgo = Date.now() - 30 * 86400000;
  const recent = journal.filter(e => new Date(e.timestamp).getTime() > monthAgo);

  if (recent.length === 0) return 'No trades this month to report.';

  const totalPnl = recent.reduce((s,e)=>s+e.pnl,0);
  const wins = recent.filter(e=>e.pnl>0).length;
  const winRate = Math.round((wins/recent.length)*100);
  const best = recent.reduce((a,b)=>a.pnl>b.pnl?a:b);
  const worst = recent.reduce((a,b)=>a.pnl<b.pnl?a:b);

  const summary = `${recent.length} trades | ${winRate}% win rate | Total PnL: $${Math.round(totalPnl)} | Best: ${best.coin} $${best.pnl} | Worst: ${worst.coin} $${worst.pnl}`;

  const report = await deepSeekAsk(
    `Monthly trading summary: ${summary}. Give a 3-4 sentence monthly report: patterns noticed, behavioral insights, 1-2 tips for improvement. Be supportive.`
  );

  return `📊 **Monthly Trading Report**\n\n${summary}\n\n---\n\n${report}`;
}

// ─── Export ─────────────────────────────────────────────────────────────────

export function exportJournalCSV(): string {
  const journal = loadJournal();
  const header = 'Date,Coin,Side,Entry,Exit,PnL,Leverage,AI Analysis,Notes';
  const rows = journal.map(e =>
    `"${e.timestamp}","${e.coin}","${e.side}",${e.entry},${e.exit||''},${e.pnl},${e.leverage}x,"${e.aiAnalysis.replace(/"/g,'""')}","${(e.personalNote||'').replace(/"/g,'""')}"`
  );
  return [header, ...rows].join('\n');
}

export function getJournalStats() {
  const journal = loadJournal();
  if (journal.length===0) return null;
  const totalPnl = journal.reduce((s,e)=>s+e.pnl,0);
  const wins = journal.filter(e=>e.pnl>0).length;
  const bestDay = journal.reduce((a,b)=>a.pnl>b.pnl?a:b);
  return {
    totalTrades: journal.length,
    winRate: Math.round((wins/journal.length)*100),
    totalPnl: Math.round(totalPnl),
    bestTrade: `${bestDay.coin} $${bestDay.pnl}`,
  };
}
