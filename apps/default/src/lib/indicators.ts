/**
 * indicators.ts
 *
 * Complete technical indicator library for the CryptoVerse HQ Backtest Engine.
 * All functions are pure — no side effects, no imports beyond type declarations.
 *
 * Implemented indicators:
 *  - SMA   (Simple Moving Average)       — periods: 10, 20, 50, 200
 *  - EMA   (Exponential Moving Average)  — periods: 9, 12, 26
 *  - RSI   (Relative Strength Index)     — period: 14
 *  - MACD  (Moving Avg Convergence/Div)  — fast: 12, slow: 26, signal: 9
 *  - BB    (Bollinger Bands)             — period: 20, stdDev: 2
 *  - ATR   (Average True Range)          — period: 14
 *  - Volume — raw + SMA(20) smoothed
 *
 * All outputs are parallel arrays aligned to the input price array.
 * Indices before the warm-up period are filled with `null` (not 0) so that
 * consuming code can distinguish "no signal yet" from "zero signal".
 *
 * Reference formulas:
 *  EMA(t) = price(t) × k + EMA(t-1) × (1 - k),   k = 2 / (period + 1)
 *  RSI    = 100 - (100 / (1 + avgGain / avgLoss))
 *  MACD   = EMA(fast) - EMA(slow)
 *  Signal = EMA(9) of MACD
 *  BB     = SMA(20) ± 2 × stdDev(20)
 *  ATR    = EMA(14) of TrueRange,   TR = max(H-L, |H-prevC|, |L-prevC|)
 *  Sharpe = (mean daily return - riskFreeRate) / stdDev(returns) × √252
 */

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface IndicatorResult {
  sma10:          (number | null)[];
  sma20:          (number | null)[];
  sma50:          (number | null)[];
  sma200:         (number | null)[];
  ema9:           (number | null)[];
  ema12:          (number | null)[];
  ema26:          (number | null)[];
  rsi:            (number | null)[];
  macd:           (number | null)[];
  macdSignal:     (number | null)[];
  macdHistogram:  (number | null)[];
  bollingerUpper: (number | null)[];
  bollingerMiddle:(number | null)[];
  bollingerLower: (number | null)[];
  atr:            (number | null)[];
  volumeSma20:    (number | null)[];
}

export interface OHLCData {
  opens:   number[];
  highs:   number[];
  lows:    number[];
  closes:  number[];
  volumes: number[];
}

// ─────────────────────────────────────────────────────────────────────────────
// SMA — Simple Moving Average
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes SMA over `prices` with given `period`.
 * Returns null for indices before warm-up is complete.
 */
export function sma(prices: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(prices.length).fill(null);
  if (period <= 0 || prices.length < period) return result;

  let sum = 0;
  for (let i = 0; i < period; i++) sum += prices[i];
  result[period - 1] = sum / period;

  for (let i = period; i < prices.length; i++) {
    sum += prices[i] - prices[i - period];
    result[i] = sum / period;
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// EMA — Exponential Moving Average
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes EMA over `prices` with given `period`.
 * Seeds the first EMA value with the SMA of the first `period` values.
 * Returns null for indices before warm-up.
 */
export function ema(prices: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(prices.length).fill(null);
  if (period <= 0 || prices.length < period) return result;

  const k = 2 / (period + 1);

  // Seed with SMA of first `period` values
  let seed = 0;
  for (let i = 0; i < period; i++) seed += prices[i];
  let prev = seed / period;
  result[period - 1] = prev;

  for (let i = period; i < prices.length; i++) {
    const current = prices[i] * k + prev * (1 - k);
    result[i] = current;
    prev = current;
  }

  return result;
}

/**
 * EMA computed from a starting offset (for MACD signal computation).
 * Skips null values in the input array.
 */
function emaFromOffset(
  values: (number | null)[],
  period: number,
  startIndex: number,
): (number | null)[] {
  const result: (number | null)[] = new Array(values.length).fill(null);
  if (startIndex < 0 || startIndex >= values.length) return result;

  const k = 2 / (period + 1);

  // Find enough non-null values to seed
  let seedCount = 0;
  let seedSum   = 0;
  let seedIdx   = startIndex;

  for (let i = startIndex; i < values.length && seedCount < period; i++) {
    if (values[i] !== null) {
      seedSum += values[i] as number;
      seedCount++;
      seedIdx = i;
    }
  }

  if (seedCount < period) return result;

  let prev = seedSum / period;
  result[seedIdx] = prev;

  for (let i = seedIdx + 1; i < values.length; i++) {
    if (values[i] === null) continue;
    const current = (values[i] as number) * k + prev * (1 - k);
    result[i] = current;
    prev = current;
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// RSI — Relative Strength Index
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wilder's RSI (period=14).
 * Uses Wilder's smoothing (equivalent to EMA with k = 1/period).
 * Returns null for first `period` indices.
 */
export function rsi(closes: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= period) return result;

  let avgGain = 0;
  let avgLoss = 0;

  // Seed: average gain/loss over first `period` changes
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) avgGain += change;
    else            avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;

  const rs  = avgLoss === 0 ? Infinity : avgGain / avgLoss;
  result[period] = 100 - 100 / (1 + rs);

  // Wilder smoothing for remaining values
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain   = change > 0 ? change : 0;
    const loss   = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    const rs2   = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    result[i] = 100 - 100 / (1 + rs2);
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// MACD — Moving Average Convergence/Divergence
// ─────────────────────────────────────────────────────────────────────────────

export interface MACDResult {
  macd:      (number | null)[];
  signal:    (number | null)[];
  histogram: (number | null)[];
}

/**
 * Computes MACD (fast=12, slow=26, signal=9).
 * macd      = EMA(fast) - EMA(slow)
 * signal    = EMA(9) of macd
 * histogram = macd - signal
 */
export function macd(
  closes:      number[],
  fastPeriod  = 12,
  slowPeriod  = 26,
  signalPeriod = 9,
): MACDResult {
  const n = closes.length;
  const emaFast = ema(closes, fastPeriod);
  const emaSlow = ema(closes, slowPeriod);

  const macdLine: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (emaFast[i] !== null && emaSlow[i] !== null) {
      macdLine[i] = (emaFast[i] as number) - (emaSlow[i] as number);
    }
  }

  // Signal line = EMA(9) of MACD, starting from first non-null MACD value
  const firstMacd = macdLine.findIndex(v => v !== null);
  const signalLine = firstMacd >= 0
    ? emaFromOffset(macdLine, signalPeriod, firstMacd)
    : new Array(n).fill(null);

  const histogram: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (macdLine[i] !== null && signalLine[i] !== null) {
      histogram[i] = (macdLine[i] as number) - (signalLine[i] as number);
    }
  }

  return { macd: macdLine, signal: signalLine, histogram };
}

// ─────────────────────────────────────────────────────────────────────────────
// BOLLINGER BANDS
// ─────────────────────────────────────────────────────────────────────────────

export interface BollingerResult {
  upper:  (number | null)[];
  middle: (number | null)[];
  lower:  (number | null)[];
}

/**
 * Bollinger Bands (period=20, stdDev multiplier=2).
 * middle = SMA(20)
 * upper  = middle + 2 × rolling stdDev
 * lower  = middle - 2 × rolling stdDev
 */
export function bollingerBands(
  closes: number[],
  period = 20,
  stdMultiplier = 2,
): BollingerResult {
  const n = closes.length;
  const upper:  (number | null)[] = new Array(n).fill(null);
  const middle: (number | null)[] = new Array(n).fill(null);
  const lower:  (number | null)[] = new Array(n).fill(null);

  if (n < period) return { upper, middle, lower };

  for (let i = period - 1; i < n; i++) {
    const window = closes.slice(i - period + 1, i + 1);
    const avg    = window.reduce((a, b) => a + b, 0) / period;
    const variance = window.reduce((acc, v) => acc + (v - avg) ** 2, 0) / period;
    const std  = Math.sqrt(variance);

    middle[i] = avg;
    upper[i]  = avg + stdMultiplier * std;
    lower[i]  = avg - stdMultiplier * std;
  }

  return { upper, middle, lower };
}

// ─────────────────────────────────────────────────────────────────────────────
// ATR — Average True Range
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes ATR (period=14) using Wilder's smoothing.
 * True Range = max(High-Low, |High-PrevClose|, |Low-PrevClose|)
 * ATR = Wilder EMA of TR
 */
export function atr(
  highs:   number[],
  lows:    number[],
  closes:  number[],
  period = 14,
): (number | null)[] {
  const n = highs.length;
  const result: (number | null)[] = new Array(n).fill(null);
  if (n < period + 1) return result;

  // True Range array
  const tr: number[] = [highs[0] - lows[0]]; // first TR has no prev close
  for (let i = 1; i < n; i++) {
    const hl  = highs[i]  - lows[i];
    const hpc = Math.abs(highs[i]  - closes[i - 1]);
    const lpc = Math.abs(lows[i]   - closes[i - 1]);
    tr.push(Math.max(hl, hpc, lpc));
  }

  // Seed ATR with SMA of first `period` TRs
  let atrVal = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result[period - 1] = atrVal;

  // Wilder smoothing
  for (let i = period; i < n; i++) {
    atrVal = (atrVal * (period - 1) + tr[i]) / period;
    result[i] = atrVal;
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPUTE FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes all indicators for a complete OHLCV dataset.
 * Returns a single IndicatorResult object with parallel arrays.
 *
 * @param data  OHLCV price arrays
 * @returns     All indicators aligned to data.closes indices
 */
export function computeAllIndicators(data: OHLCData): IndicatorResult {
  const { opens, highs, lows, closes, volumes } = data;

  // SMA variants
  const sma10  = sma(closes, 10);
  const sma20  = sma(closes, 20);
  const sma50  = sma(closes, 50);
  const sma200 = sma(closes, 200);

  // EMA variants
  const ema9  = ema(closes, 9);
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);

  // RSI(14)
  const rsi14 = rsi(closes, 14);

  // MACD(12,26,9)
  const macdResult = macd(closes, 12, 26, 9);

  // Bollinger Bands(20,2)
  const bb = bollingerBands(closes, 20, 2);

  // ATR(14)
  const atr14 = atr(highs, lows, closes, 14);

  // Volume SMA(20)
  const volSma20 = sma(volumes, 20);

  return {
    sma10,
    sma20,
    sma50,
    sma200,
    ema9,
    ema12,
    ema26,
    rsi:            rsi14,
    macd:           macdResult.macd,
    macdSignal:     macdResult.signal,
    macdHistogram:  macdResult.histogram,
    bollingerUpper: bb.upper,
    bollingerMiddle: bb.middle,
    bollingerLower: bb.lower,
    atr:            atr14,
    volumeSma20:    volSma20,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXTENDED STAT HELPERS (used by enriched backtest engine)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes the annualized return from total return and holding period.
 * Formula: (1 + totalReturn/100)^(365/days) - 1
 * Returns percentage.
 */
// Spec formula: annualizedReturn = Math.pow(1 + totalReturn, 365 / days) - 1
// totalReturn here is a decimal (e.g. 0.12 for 12%).
// We receive totalReturnPct (e.g. 12 for 12%), convert, apply, convert back.
export function annualizedReturn(totalReturnPct: number, days: number): number {
  if (days <= 0) return totalReturnPct;
  const totalReturnDecimal = totalReturnPct / 100;
  const annualDecimal = Math.pow(1 + totalReturnDecimal, 365 / days) - 1;
  return Math.round(annualDecimal * 10_000) / 100; // → percentage, 2dp
}

/**
 * Computes Sharpe Ratio using the spec formula:
 *   (averageReturn - riskFreeRate) / stdDevOfReturns
 * riskFreeRate is annualised 2% → daily: 0.02/252
 */
export function sharpeRatioFromReturns(dailyReturns: number[]): number {
  if (dailyReturns.length < 2) return 0;
  const rfDaily  = 0.02 / 252;
  const mean     = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const excess   = mean - rfDaily;
  const variance = dailyReturns.reduce((acc, r) => acc + (r - mean) ** 2, 0) / dailyReturns.length;
  const std      = Math.sqrt(variance);
  if (std === 0) return 0;
  const daily = excess / std;
  return Math.round(daily * Math.sqrt(252) * 100) / 100; // annualise
}

/**
 * Computes max drawdown and its duration (in days) from an equity curve.
 * Returns { maxDrawdown (%), maxDrawdownDays }.
 */
export function drawdownStats(
  equityCurve: number[],
  timestamps:  number[], // unix ms parallel to equityCurve
): { maxDrawdown: number; maxDrawdownDays: number; drawdownCurve: number[] } {
  const n = equityCurve.length;
  if (n === 0) return { maxDrawdown: 0, maxDrawdownDays: 0, drawdownCurve: [] };

  let peak         = equityCurve[0];
  let peakTime     = timestamps[0] ?? 0;
  let maxDD        = 0;
  let maxDDDays    = 0;
  let currentDDStart = peakTime;

  const ddCurve: number[] = [];

  for (let i = 0; i < n; i++) {
    const val = equityCurve[i];
    if (val > peak) {
      peak       = val;
      peakTime   = timestamps[i] ?? peakTime;
      currentDDStart = peakTime;
    }

    const dd = peak > 0 ? ((peak - val) / peak) * 100 : 0;
    ddCurve.push(dd);

    if (dd > maxDD) {
      maxDD = dd;
      const trough = timestamps[i] ?? peakTime;
      maxDDDays = Math.round((trough - currentDDStart) / 86_400_000);
    }
  }

  return {
    maxDrawdown:     Math.round(maxDD * 100) / 100,
    maxDrawdownDays: maxDDDays,
    drawdownCurve:   ddCurve,
  };
}

/**
 * Computes monthly return percentages keyed by "YYYY-MM" → return %.
 */
export function monthlyReturns(
  equityCurve: number[],
  timestamps:  number[],
): Array<{ month: string; return: number }> {
  if (equityCurve.length < 2) return [];

  // Build month → first and last equity map
  const monthMap = new Map<string, { first: number; last: number }>();

  for (let i = 0; i < equityCurve.length; i++) {
    const d   = new Date(timestamps[i] ?? 0);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const existing = monthMap.get(key);
    if (!existing) {
      monthMap.set(key, { first: equityCurve[i], last: equityCurve[i] });
    } else {
      existing.last = equityCurve[i];
    }
  }

  const result: Array<{ month: string; return: number }> = [];
  for (const [month, { first, last }] of monthMap.entries()) {
    const ret = first > 0 ? ((last - first) / first) * 100 : 0;
    result.push({ month, return: Math.round(ret * 100) / 100 });
  }

  return result.sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Extracts daily PnL record from an equity curve + timestamps.
 * Returns Record<"YYYY-MM-DD", pnlUsd>.
 */
export function dailyPnlFromCurve(
  equityCurve: number[],
  timestamps:  number[],
): Record<string, number> {
  const result: Record<string, number> = {};
  for (let i = 1; i < equityCurve.length; i++) {
    const d = new Date(timestamps[i] ?? 0);
    const key = d.toISOString().slice(0, 10);
    const pnl = equityCurve[i] - equityCurve[i - 1];
    result[key] = (result[key] ?? 0) + pnl;
  }
  return result;
}
