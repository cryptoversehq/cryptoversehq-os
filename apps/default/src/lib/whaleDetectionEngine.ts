/**
 * whaleDetectionEngine.ts — §4.1 Whale Detection Engine
 *
 * Evaluates simulated transactions and scores their significance on a 0-1 scale.
 * A transaction is considered a "whale alert" when significance ≥ 0.7 (configurable).
 *
 * Significance components (mirrors the spec exactly):
 *   - Size:        up to 0.4  ($1M → 0.2 | $5M → 0.3 | $10M → 0.4)
 *   - Destination: up to 0.3  (exchange deposit = high significance)
 *   - Source:      up to 0.3  (known whale/entity = high significance)
 *   - Pattern:     up to 0.2  (unusual timing / velocity / repetition)
 *
 * Caps at 1.0. Returns a SignificanceBreakdown for UI display.
 *
 * Design: Pure functions — no side effects, no async calls.
 *         The store/simulator pipes transactions through this engine.
 */

import type { SimulatedTx } from './onChainSimulator';
import type { SignificanceBreakdown } from './onChainTypes';

// ── Known exchange address registry ──────────────────────────────────────────

/**
 * Canonical exchange name → partial address list.
 * In simulation we match by known labels, not real address lookup.
 */
const EXCHANGE_LABELS = new Set([
  'binance cold wallet', 'binance hot wallet', 'binance btc hot',
  'coinbase custody', 'kraken exchange',
  'raydium', 'quickswap router', 'pancakeswap', 'uniswap v2 router',
  'polygon bridge',
]);

const WHALE_ENTITY_LABELS = new Set([
  'mt. gox trustee', 'polygon staking',
  'binance cold wallet', // large cold wallets = whale-tier source
]);

// ── Unusual pattern detection ─────────────────────────────────────────────────

/**
 * Heuristic to detect unusual patterns in a simulated tx.
 * Flags:
 *   - Round USD values (likely OTC/pre-arranged)
 *   - Very large native token amounts (supply % moves)
 *   - Self-send patterns (same address prefix)
 */
function isUnusualPattern(tx: SimulatedTx): boolean {
  // Round million USD values (OTC signal)
  const remainder = tx.valueUsd % 1_000_000;
  if (remainder < 50_000) return true;     // within $50K of a round million

  // Very large native value relative to chain norms
  const nativeVal = parseFloat(tx.valueNative.split(' ')[0] ?? '0');
  if (tx.chain === 'bitcoin'  && nativeVal > 500)   return true;
  if (tx.chain === 'ethereum' && nativeVal > 10_000) return true;
  if (tx.chain === 'solana'   && nativeVal > 500_000) return true;

  // Similar address prefix (self-send / consolidation)
  if (tx.fromAddress.slice(0, 6).toLowerCase() === tx.toAddress.slice(0, 6).toLowerCase()) {
    return true;
  }

  return false;
}

// ── Core scoring function (§4.1 spec) ────────────────────────────────────────

/**
 * Calculate the significance score for a single transaction.
 * Returns a breakdown with per-component scores and a human reason string.
 */
export function calculateSignificance(tx: SimulatedTx): SignificanceBreakdown {
  let sizePart        = 0;
  let destinationPart = 0;
  let sourcePart      = 0;
  let patternPart     = 0;

  // ── 1. Size significance ────────────────────────────────────────────────────
  if (tx.valueUsd >= 10_000_000)     sizePart = 0.4;  // $10M+
  else if (tx.valueUsd >= 5_000_000) sizePart = 0.3;  // $5M+
  else if (tx.valueUsd >= 1_000_000) sizePart = 0.2;  // $1M+
  else if (tx.valueUsd >= 500_000)   sizePart = 0.1;  // $500K+

  // ── 2. Destination significance (exchange deposit) ──────────────────────────
  const toLabel = (tx.toLabel ?? '').toLowerCase();
  if (EXCHANGE_LABELS.has(toLabel)) {
    destinationPart = 0.3;
  } else if (toLabel.includes('exchange') || toLabel.includes('binance') || toLabel.includes('coinbase')) {
    destinationPart = 0.2;
  }

  // ── 3. Source significance (known whale / entity) ───────────────────────────
  const fromLabel = (tx.fromLabel ?? '').toLowerCase();
  if (WHALE_ENTITY_LABELS.has(fromLabel)) {
    sourcePart = 0.3;
  } else if (fromLabel.includes('wallet') || fromLabel.includes('custody') || fromLabel.includes('cold')) {
    sourcePart = 0.2;
  } else if (tx.fromLabel !== null) {
    // Any known entity label adds some significance
    sourcePart = 0.15;
  }

  // ── 4. Unusual pattern bonus ─────────────────────────────────────────────────
  if (isUnusualPattern(tx)) {
    patternPart = 0.2;
  }

  const total = Math.min(1.0, sizePart + destinationPart + sourcePart + patternPart);

  // ── Reason string ─────────────────────────────────────────────────────────────
  const reasons: string[] = [];
  if (sizePart > 0)        reasons.push(`$${(tx.valueUsd / 1e6).toFixed(1)}M transfer`);
  if (destinationPart > 0) reasons.push(`sent to ${tx.toLabel ?? 'exchange'}`);
  if (sourcePart > 0)      reasons.push(`from ${tx.fromLabel ?? 'known entity'}`);
  if (patternPart > 0)     reasons.push('unusual pattern detected');

  const reason = reasons.length > 0
    ? reasons.join(', ')
    : `${tx.valueNative} moved on ${tx.chain}`;

  return { total, sizePart, destinationPart, sourcePart, patternPart, reason };
}

// ── Whale Detection Engine class (§4.1 spec interface) ───────────────────────

export const SIGNIFICANCE_THRESHOLD = 0.7;  // 70% — matches spec

export class WhaleDetectionEngine {
  private minValueUSD: number;
  private significanceThreshold: number;

  constructor(options?: { minValueUSD?: number; significanceThreshold?: number }) {
    this.minValueUSD           = options?.minValueUSD           ?? 1_000_000;
    this.significanceThreshold = options?.significanceThreshold ?? SIGNIFICANCE_THRESHOLD;
  }

  /**
   * Filter and score a batch of simulated transactions.
   * Returns only those that pass the value threshold AND significance threshold.
   */
  scanTransactions(txs: SimulatedTx[]): Array<SimulatedTx & { breakdown: SignificanceBreakdown }> {
    const results: Array<SimulatedTx & { breakdown: SignificanceBreakdown }> = [];

    for (const tx of txs) {
      // Pre-filter by value
      if (tx.valueUsd < this.minValueUSD) continue;

      const breakdown = calculateSignificance(tx);

      if (breakdown.total >= this.significanceThreshold) {
        results.push({ ...tx, breakdown });
      }
    }

    // Sort by significance descending
    results.sort((a, b) => b.breakdown.total - a.breakdown.total);

    return results;
  }

  /**
   * Score a single transaction — useful for the store's runTick loop.
   */
  scoreTx(tx: SimulatedTx): SignificanceBreakdown {
    return calculateSignificance(tx);
  }

  /** Update threshold at runtime (e.g., from user settings) */
  setThreshold(v: number) {
    this.significanceThreshold = Math.max(0, Math.min(1, v));
  }

  get threshold() { return this.significanceThreshold; }
}

/** Shared singleton — import and reuse across the app */
export const whaleEngine = new WhaleDetectionEngine();
