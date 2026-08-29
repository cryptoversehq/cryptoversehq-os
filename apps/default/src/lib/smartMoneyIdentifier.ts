/**
 * smartMoneyIdentifier.ts — §4.2 Smart Money Identification
 *
 * Calculates rich per-wallet performance metrics and assigns a composite
 * "smart score" (0-100). Wallets scoring ≥ 70 are classified as "smart money".
 *
 * Metrics computed per spec:
 *   - Win rate             > 60%  → +30 pts
 *   - Total profit %       > 20%  → +25 pts
 *   - Sharpe ratio         > 1.5  → +20 pts
 *   - Trade consistency    > 0.7  → +15 pts
 *   - Max drawdown         < 15%  → +10 pts
 *
 * Design: Pure, deterministic simulation from an address seed.
 *         No async calls — results are computed in memory.
 */

import type { MonitoredChain } from './onChainTypes';
import type { WalletMetrics, ScoredWallet } from './onChainTypes';

// ── Trade record (simulated) ──────────────────────────────────────────────────

interface SimulatedTrade {
  timestamp: number;
  pnl:       number;    // USD (positive = profit)
  amount:    number;    // USD notional
  side:      'buy' | 'sell';
}

// ── Deterministic random from address string ──────────────────────────────────

function seedFromAddress(address: string): number {
  let h = 2166136261;
  for (const c of address) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0);
}

function mulberry32(seed: number) {
  let s = seed;
  return function(): number {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Trade simulation ──────────────────────────────────────────────────────────

/**
 * Generate a realistic-looking trade history for an address over `period` days.
 * The distribution is seeded from the address so results are stable across renders.
 */
function generateTradeHistory(address: string, trades: number, period: number): SimulatedTrade[] {
  const rng  = mulberry32(seedFromAddress(address));
  const base = Date.now() - period * 86400_000;

  return Array.from({ length: trades }, (_, i) => {
    const t      = base + rng() * period * 86400_000;
    const amount = 10_000 + rng() * 490_000;
    const isBull = rng() > 0.38;   // slightly biased to winners for smart wallets
    const pnlPct = isBull
      ? rng() * 0.35   // +0% to +35%
      : -(rng() * 0.20);  // -0% to -20%
    return {
      timestamp: t,
      pnl:       amount * pnlPct,
      amount,
      side:      isBull ? 'buy' : 'sell',
    };
  }).sort((a, b) => a.timestamp - b.timestamp);
}

// ── Metric calculators (§4.2) ─────────────────────────────────────────────────

/** Win rate as a percentage */
function calcWinRate(trades: SimulatedTrade[]): number {
  if (trades.length === 0) return 0;
  const wins = trades.filter(t => t.pnl > 0).length;
  return (wins / trades.length) * 100;
}

/** Net PnL % of initial estimated balance */
function calcTotalProfitPercent(trades: SimulatedTrade[]): number {
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const avgAmount = trades.reduce((s, t) => s + t.amount, 0) / Math.max(trades.length, 1);
  const initialBalance = avgAmount * 10;  // proxy
  return (totalPnl / initialBalance) * 100;
}

/**
 * Simplified Sharpe ratio:
 *   sharpe = meanReturn / stdReturn  (annualized roughly)
 */
function calcSharpeRatio(trades: SimulatedTrade[]): number {
  if (trades.length < 2) return 0;
  const returns = trades.map(t => t.pnl / t.amount);
  const mean    = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / returns.length;
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  return parseFloat((mean / std * Math.sqrt(252)).toFixed(2));  // annualized
}

/**
 * Trade consistency: how regularly does this wallet trade?
 * Measures coefficient of variation in inter-trade intervals (lower = more consistent).
 * Returns 0-1 where 1 = perfectly consistent.
 */
function calcTradeConsistency(trades: SimulatedTrade[]): number {
  if (trades.length < 3) return 0.5;
  const intervals: number[] = [];
  for (let i = 1; i < trades.length; i++) {
    intervals.push(trades[i].timestamp - trades[i - 1].timestamp);
  }
  const mean = intervals.reduce((s, v) => s + v, 0) / intervals.length;
  if (mean === 0) return 0;
  const std  = Math.sqrt(intervals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / intervals.length);
  const cv   = std / mean;
  return parseFloat(Math.max(0, Math.min(1, 1 - cv)).toFixed(3));
}

/**
 * Max drawdown: largest peak-to-trough cumulative PnL drop.
 * Returns as a positive percentage.
 */
function calcMaxDrawdown(trades: SimulatedTrade[]): number {
  let peak = 0, cumPnl = 0, maxDD = 0;
  for (const t of trades) {
    cumPnl += t.pnl;
    if (cumPnl > peak) peak = cumPnl;
    const dd = peak > 0 ? ((peak - cumPnl) / peak) * 100 : 0;
    if (dd > maxDD) maxDD = dd;
  }
  return parseFloat(maxDD.toFixed(2));
}

// ── Composite smart score (§4.2) ─────────────────────────────────────────────

function calcSmartScore(m: Omit<WalletMetrics, 'smartScore'>): number {
  let score = 0;
  if (m.winRate > 60)             score += 30;
  else if (m.winRate > 50)        score += 15;
  if (m.totalProfitPercent > 20)  score += 25;
  else if (m.totalProfitPercent > 10) score += 12;
  if (m.sharpeRatio > 1.5)        score += 20;
  else if (m.sharpeRatio > 0.8)   score += 10;
  if (m.tradeConsistency > 0.7)   score += 15;
  else if (m.tradeConsistency > 0.5) score += 7;
  if (m.maxDrawdown < 15)         score += 10;
  else if (m.maxDrawdown < 30)    score += 5;
  return Math.min(100, score);
}

// ── Public API ────────────────────────────────────────────────────────────────

export const SMART_SCORE_THRESHOLD = 70;

/**
 * Calculate full WalletMetrics for an address over `period` days.
 * All values are deterministically simulated from the address string.
 */
export function calculateWalletMetrics(
  address: string,
  period:  number = 30,
  numTrades?: number,
): WalletMetrics {
  const seed   = seedFromAddress(address);
  const trades = numTrades ?? Math.round(5 + (seed % 200));
  const history = generateTradeHistory(address, trades, period);

  const winRate            = parseFloat(calcWinRate(history).toFixed(1));
  const totalProfitPercent = parseFloat(calcTotalProfitPercent(history).toFixed(1));
  const sharpeRatio        = calcSharpeRatio(history);
  const tradeConsistency   = calcTradeConsistency(history);
  const maxDrawdown        = calcMaxDrawdown(history);
  const averageTradeSize   = history.reduce((s, t) => s + t.amount, 0) / Math.max(history.length, 1);

  const base: Omit<WalletMetrics, 'smartScore'> = {
    winRate, totalProfitPercent, sharpeRatio, tradeConsistency,
    maxDrawdown, totalTrades: trades,
    averageTradeSize: parseFloat(averageTradeSize.toFixed(0)),
  };

  return { ...base, smartScore: calcSmartScore(base) };
}

// ── SmartMoneyIdentifier class (§4.2 spec interface) ─────────────────────────

export class SmartMoneyIdentifier {
  private scoreThreshold: number;

  constructor(options?: { scoreThreshold?: number }) {
    this.scoreThreshold = options?.scoreThreshold ?? SMART_SCORE_THRESHOLD;
  }

  /**
   * Given a list of candidate addresses, compute metrics for each and return
   * only those that qualify as "smart money" (score ≥ threshold), sorted by score.
   */
  identifySmartWallets(
    candidates: Array<{ address: string; chain: MonitoredChain; label?: string }>,
    period:     number = 30,
  ): ScoredWallet[] {
    const results: ScoredWallet[] = [];

    for (const c of candidates) {
      const metrics = calculateWalletMetrics(c.address, period);
      if (metrics.smartScore >= this.scoreThreshold) {
        results.push({
          address: c.address,
          chain:   c.chain,
          score:   metrics.smartScore,
          rank:    0,      // set below
          metrics,
          label:   c.label,
        });
      }
    }

    // Sort by score descending, then assign ranks
    results.sort((a, b) => b.score - a.score);
    results.forEach((w, i) => { w.rank = i + 1; });

    return results;
  }

  /**
   * Score a single address — useful for real-time wallet lookup.
   */
  scoreAddress(address: string, chain: MonitoredChain, period = 30): ScoredWallet {
    const metrics = calculateWalletMetrics(address, period);
    return { address, chain, score: metrics.smartScore, rank: 1, metrics };
  }

  setThreshold(v: number) { this.scoreThreshold = Math.max(0, Math.min(100, v)); }
  get threshold() { return this.scoreThreshold; }
}

/** Shared singleton */
export const smartMoneyId = new SmartMoneyIdentifier();
