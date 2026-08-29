/**
 * backtestRunner.ts
 *
 * Async orchestration layer for the Backtest Engine (Part 3).
 *
 * Sits above backtestEngine.ts (synchronous simulation) and adds:
 *  1. Real historical data via coinGeckoService (with 1h cache + fallback)
 *  2. Full indicator computation via indicators.ts
 *  3. Indicator-aware strategy simulators (RSI, MACD, SMA crossover, BB)
 *  4. Extended BacktestResult matching the Part 3 spec:
 *     - annualizedReturn (using spec formula)
 *     - maxDrawdownDuration (in days)
 *     - drawdownCurve [{date, drawdown}]
 *     - monthlyReturns [{month, return}]
 *     - largestWin / largestLoss
 *     - averageHoldTime (hours)
 *     - Sharpe with 2% risk-free rate
 *
 * Usage:
 *   const result = await runEnrichedBacktest({ params, strategyType });
 *
 * The function returns EnrichedBacktestResult which extends BacktestSession
 * with all Part 3 fields. The UI can use this in place of the sync result.
 */

import { fetchHistoricalData } from './coinGeckoService';
import { BacktestError, resolveError } from './backtestErrors';
import {
  computeAllIndicators,
  annualizedReturn,
  sharpeRatioFromReturns,
  drawdownStats,
  monthlyReturns,
  dailyPnlFromCurve,
} from './indicators';
import type { OHLCData, IndicatorResult } from './indicators';
import type { BacktestData } from './coinGeckoService';
import {
  BacktestParams,
  BacktestMetrics,
  BacktestSessionTrade,
  BacktestSignalReason,
  MAX_SESSION_TRADES,
  MAX_EQUITY_POINTS,
  DEFAULT_FEE_RATE,
} from './backtestTypes';
import type { StrategyType } from './strategyTypes';
import { deriveRiskLevel } from './strategyUtils';

// ─────────────────────────────────────────────────────────────────────────────
// EXTENDED RESULT TYPE (Part 3 spec)
// ─────────────────────────────────────────────────────────────────────────────

export interface ExtendedBacktestMetrics extends BacktestMetrics {
  annualizedReturn:      number;  // % per year
  maxDrawdownDuration:   number;  // days
  largestWin:            number;  // USD
  largestLoss:           number;  // USD (negative)
  averageHoldTimeHours:  number;  // hours
  drawdownCurve:         Array<{ date: string; drawdown: number }>;
  monthlyReturnsList:    Array<{ month: string; return: number }>;
  dataSource:            'coingecko' | 'simulated';
}

export interface EnrichedBacktestOutput {
  trades:     BacktestSessionTrade[];
  metrics:    ExtendedBacktestMetrics;
  durationMs: number;
  riskLevel:  'low' | 'medium' | 'high' | 'very-high';
  data:       BacktestData;
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUNDING HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function r2(n: number) { return Math.round(n * 100) / 100; }
function r4(n: number) { return Math.round(n * 10_000) / 10_000; }

// ─────────────────────────────────────────────────────────────────────────────
// TRADE BUILDER
// ─────────────────────────────────────────────────────────────────────────────

function buildTrade(params: {
  n:           number;
  side:        'long' | 'short';
  entryPrice:  number;
  exitPrice:   number;
  entryTs:     number;
  exitTs:      number;
  quantity:    number;
  feeRate:     number;
  balance:     number;
  entryReason: BacktestSignalReason;
  exitReason:  BacktestSignalReason;
}): { trade: BacktestSessionTrade; newBalance: number } {
  const { n, side, entryPrice, exitPrice, entryTs, exitTs, quantity, feeRate, balance, entryReason, exitReason } = params;
  const entryValue = r2(entryPrice * quantity);
  const exitValue  = r2(exitPrice  * quantity);
  const grossPnl   = r2(side === 'long' ? exitValue - entryValue : entryValue - exitValue);
  const fee        = r2((entryValue + exitValue) * feeRate);
  const netPnl     = r2(grossPnl - fee);
  const pnlPct     = r4(entryValue > 0 ? (netPnl / entryValue) * 100 : 0);
  const newBalance = r2(balance + netPnl);

  return {
    trade: {
      tradeNumber:     n,
      side,
      entryPrice:      r2(entryPrice),
      exitPrice:       r2(exitPrice),
      entryAt:         new Date(entryTs).toISOString(),
      exitAt:          new Date(exitTs).toISOString(),
      durationMinutes: Math.round((exitTs - entryTs) / 60_000),
      quantity:        r4(quantity),
      entryValue,
      exitValue,
      grossPnl,
      fee,
      netPnl,
      pnlPct,
      equityAfter:     newBalance,
      entryReason,
      exitReason,
      isWinner:        netPnl > 0,
    },
    newBalance,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// INDICATOR-AWARE SIMULATORS
// ─────────────────────────────────────────────────────────────────────────────

/** RSI Mean Reversion: buy when RSI < 30, sell when RSI > 70 */
function simulateRsi(
  data: BacktestData,
  ind: IndicatorResult,
  params: BacktestParams,
): BacktestSessionTrade[] {
  const { candles } = data;
  const feeRate = params.feeRate ?? DEFAULT_FEE_RATE;
  const posUsd  = params.initialBalance * 0.1;
  const trades: BacktestSessionTrade[] = [];
  let balance = params.initialBalance;
  let n = 0;
  let inTrade = false;
  let entryPrice = 0;
  let entryQty   = 0;
  let entryTs    = 0;

  for (let i = 14; i < candles.length; i++) {
    const rsiVal = ind.rsi[i];
    if (rsiVal === null) continue;
    const price = candles[i].close;
    const ts    = candles[i].timestamp;

    if (!inTrade && rsiVal < 30) {
      entryPrice = price;
      entryQty   = posUsd / price;
      entryTs    = ts;
      inTrade    = true;
    } else if (inTrade && rsiVal > 70) {
      n++;
      const { trade, newBalance } = buildTrade({
        n, side: 'long',
        entryPrice, exitPrice: price,
        entryTs, exitTs: ts,
        quantity: entryQty,
        feeRate, balance,
        entryReason: 'custom_signal',
        exitReason:  'custom_signal',
      });
      balance = newBalance;
      trades.push(trade);
      inTrade = false;
      if (trades.length >= MAX_SESSION_TRADES) break;
    }
  }

  if (inTrade && candles.length > 0) {
    const last = candles[candles.length - 1];
    n++;
    const { trade, newBalance } = buildTrade({
      n, side: 'long',
      entryPrice, exitPrice: last.close,
      entryTs, exitTs: last.timestamp,
      quantity: entryQty,
      feeRate, balance,
      entryReason: 'custom_signal',
      exitReason:  'session_end',
    });
    balance = newBalance;
    trades.push(trade);
  }

  return trades;
}

/** MACD Crossover: buy on golden cross, sell on death cross */
function simulateMacd(
  data: BacktestData,
  ind: IndicatorResult,
  params: BacktestParams,
): BacktestSessionTrade[] {
  const { candles } = data;
  const feeRate = params.feeRate ?? DEFAULT_FEE_RATE;
  const posUsd  = params.initialBalance * 0.15;
  const trades: BacktestSessionTrade[] = [];
  let balance = params.initialBalance;
  let n = 0;
  let inTrade = false;
  let entryPrice = 0;
  let entryQty   = 0;
  let entryTs    = 0;

  for (let i = 27; i < candles.length; i++) {
    const m    = ind.macd[i];
    const s    = ind.macdSignal[i];
    const mp   = ind.macd[i - 1];
    const sp   = ind.macdSignal[i - 1];
    if (m === null || s === null || mp === null || sp === null) continue;

    const price = candles[i].close;
    const ts    = candles[i].timestamp;

    // Golden cross: MACD crosses above signal
    if (!inTrade && mp <= sp && m > s) {
      entryPrice = price;
      entryQty   = posUsd / price;
      entryTs    = ts;
      inTrade    = true;
    }
    // Death cross: MACD crosses below signal
    else if (inTrade && mp >= sp && m < s) {
      n++;
      const { trade, newBalance } = buildTrade({
        n, side: 'long',
        entryPrice, exitPrice: price,
        entryTs, exitTs: ts,
        quantity: entryQty,
        feeRate, balance,
        entryReason: 'custom_signal',
        exitReason:  'custom_signal',
      });
      balance = newBalance;
      trades.push(trade);
      inTrade = false;
      if (trades.length >= MAX_SESSION_TRADES) break;
    }
  }

  if (inTrade && candles.length > 0) {
    const last = candles[candles.length - 1];
    n++;
    const { trade, newBalance } = buildTrade({
      n, side: 'long',
      entryPrice, exitPrice: last.close,
      entryTs, exitTs: last.timestamp,
      quantity: entryQty,
      feeRate, balance,
      entryReason: 'custom_signal',
      exitReason:  'session_end',
    });
    balance = newBalance;
    trades.push(trade);
  }

  return trades;
}

/** SMA Crossover: SMA(10) vs SMA(30) */
function simulateSma(
  data: BacktestData,
  ind: IndicatorResult,
  params: BacktestParams,
): BacktestSessionTrade[] {
  const { candles } = data;
  const feeRate = params.feeRate ?? DEFAULT_FEE_RATE;
  const posUsd  = params.initialBalance * 0.12;
  const trades: BacktestSessionTrade[] = [];
  let balance = params.initialBalance;
  let n = 0;
  let inTrade = false;
  let entryPrice = 0;
  let entryQty   = 0;
  let entryTs    = 0;

  for (let i = 30; i < candles.length; i++) {
    const fast  = ind.sma10[i];
    const slow  = ind.sma20[i];
    const fastP = ind.sma10[i - 1];
    const slowP = ind.sma20[i - 1];
    if (fast === null || slow === null || fastP === null || slowP === null) continue;

    const price = candles[i].close;
    const ts    = candles[i].timestamp;

    if (!inTrade && fastP <= slowP && fast > slow) {
      entryPrice = price;
      entryQty   = posUsd / price;
      entryTs    = ts;
      inTrade    = true;
    } else if (inTrade && fastP >= slowP && fast < slow) {
      n++;
      const { trade, newBalance } = buildTrade({
        n, side: 'long',
        entryPrice, exitPrice: price,
        entryTs, exitTs: ts,
        quantity: entryQty,
        feeRate, balance,
        entryReason: 'custom_signal',
        exitReason:  'custom_signal',
      });
      balance = newBalance;
      trades.push(trade);
      inTrade = false;
      if (trades.length >= MAX_SESSION_TRADES) break;
    }
  }

  if (inTrade && candles.length > 0) {
    const last = candles[candles.length - 1];
    n++;
    const { trade, newBalance } = buildTrade({
      n, side: 'long',
      entryPrice, exitPrice: last.close,
      entryTs, exitTs: last.timestamp,
      quantity: entryQty,
      feeRate, balance,
      entryReason: 'custom_signal',
      exitReason:  'session_end',
    });
    balance = newBalance;
    trades.push(trade);
  }

  return trades;
}

/** Bollinger Band Bounce: buy at lower band, sell at upper band, stop at -2% */
function simulateBollinger(
  data: BacktestData,
  ind: IndicatorResult,
  params: BacktestParams,
): BacktestSessionTrade[] {
  const { candles } = data;
  const feeRate = params.feeRate ?? DEFAULT_FEE_RATE;
  const posUsd  = params.initialBalance * 0.12;
  const trades: BacktestSessionTrade[] = [];
  let balance = params.initialBalance;
  let n = 0;
  let inTrade = false;
  let entryPrice = 0;
  let entryQty   = 0;
  let entryTs    = 0;

  for (let i = 20; i < candles.length; i++) {
    const upper  = ind.bollingerUpper[i];
    const lower  = ind.bollingerLower[i];
    if (upper === null || lower === null) continue;

    const price = candles[i].close;
    const ts    = candles[i].timestamp;

    if (!inTrade && price <= lower) {
      entryPrice = price;
      entryQty   = posUsd / price;
      entryTs    = ts;
      inTrade    = true;
    } else if (inTrade) {
      const stopHit = price < entryPrice * 0.98;
      const tpHit   = price >= upper;
      if (stopHit || tpHit) {
        n++;
        const { trade, newBalance } = buildTrade({
          n, side: 'long',
          entryPrice, exitPrice: price,
          entryTs, exitTs: ts,
          quantity: entryQty,
          feeRate, balance,
          entryReason: 'custom_signal',
          exitReason:  stopHit ? 'stop_loss' : 'take_profit',
        });
        balance = newBalance;
        trades.push(trade);
        inTrade = false;
        if (trades.length >= MAX_SESSION_TRADES) break;
      }
    }
  }

  if (inTrade && candles.length > 0) {
    const last = candles[candles.length - 1];
    n++;
    const { trade, newBalance } = buildTrade({
      n, side: 'long',
      entryPrice, exitPrice: last.close,
      entryTs, exitTs: last.timestamp,
      quantity: entryQty,
      feeRate, balance,
      entryReason: 'custom_signal',
      exitReason:  'session_end',
    });
    balance = newBalance;
    trades.push(trade);
  }

  return trades;
}

/** ATR-based trailing stop strategy */
function simulateAtr(
  data: BacktestData,
  ind: IndicatorResult,
  params: BacktestParams,
): BacktestSessionTrade[] {
  const { candles } = data;
  const feeRate    = params.feeRate ?? DEFAULT_FEE_RATE;
  const posUsd     = params.initialBalance * 0.1;
  const atrMult    = 2.5;
  const trades: BacktestSessionTrade[] = [];
  let balance = params.initialBalance;
  let n = 0;
  let inTrade    = false;
  let entryPrice = 0;
  let entryQty   = 0;
  let entryTs    = 0;
  let stopPrice  = 0;

  for (let i = 15; i < candles.length; i++) {
    const atrVal = ind.atr[i];
    const smaVal = ind.sma20[i];
    if (atrVal === null || smaVal === null) continue;

    const price = candles[i].close;
    const ts    = candles[i].timestamp;

    if (!inTrade && price > smaVal) {
      entryPrice = price;
      entryQty   = posUsd / price;
      entryTs    = ts;
      stopPrice  = price - atrMult * atrVal;
      inTrade    = true;
    } else if (inTrade) {
      // Trail the stop upward
      const newStop = price - atrMult * atrVal;
      if (newStop > stopPrice) stopPrice = newStop;

      if (price < stopPrice || price < entryPrice * 0.97) {
        n++;
        const { trade, newBalance } = buildTrade({
          n, side: 'long',
          entryPrice, exitPrice: price,
          entryTs, exitTs: ts,
          quantity: entryQty,
          feeRate, balance,
          entryReason: 'custom_signal',
          exitReason:  'stop_loss',
        });
        balance = newBalance;
        trades.push(trade);
        inTrade = false;
        if (trades.length >= MAX_SESSION_TRADES) break;
      }
    }
  }

  if (inTrade && candles.length > 0) {
    const last = candles[candles.length - 1];
    n++;
    const { trade, newBalance } = buildTrade({
      n, side: 'long',
      entryPrice, exitPrice: last.close,
      entryTs, exitTs: last.timestamp,
      quantity: entryQty,
      feeRate, balance,
      entryReason: 'custom_signal',
      exitReason:  'session_end',
    });
    balance = newBalance;
    trades.push(trade);
  }

  return trades;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXTENDED METRICS COMPUTATION
// ─────────────────────────────────────────────────────────────────────────────

function computeExtendedMetrics(
  trades:         BacktestSessionTrade[],
  initialBalance: number,
  periodDays:     number,
  data:           BacktestData,
): ExtendedBacktestMetrics {
  const n = trades.length;

  if (n === 0) {
    return emptyExtMetrics(initialBalance, data.source);
  }

  const finalBalance = trades[n - 1].equityAfter;
  const totalReturn  = r2(((finalBalance / initialBalance) - 1) * 100);

  let winCount = 0, lossCount = 0;
  let grossProfit = 0, grossLoss = 0;
  let sumWin = 0, sumLoss = 0;
  let sumDuration = 0;
  let totalFee = 0;
  let largestWin  = 0;
  let largestLoss = 0;
  let longestWin  = 0, longestLoss = 0;
  let curWin      = 0, curLoss     = 0;

  const equityCurve: number[] = [initialBalance];
  const eqTimestamps: number[] = [data.candles[0]?.timestamp ?? 0];
  const dailyPnlMap: Record<string, number> = {};

  for (const t of trades) {
    totalFee    += t.fee;
    sumDuration += t.durationMinutes;
    equityCurve.push(t.equityAfter);
    eqTimestamps.push(new Date(t.exitAt).getTime());

    const day = t.exitAt.slice(0, 10);
    dailyPnlMap[day] = (dailyPnlMap[day] ?? 0) + t.netPnl;

    if (t.isWinner) {
      winCount++;
      grossProfit += t.netPnl;
      sumWin      += t.netPnl;
      if (t.netPnl > largestWin) largestWin = t.netPnl;
      curWin++;
      curLoss = 0;
      if (curWin > longestWin) longestWin = curWin;
    } else {
      lossCount++;
      grossLoss   += Math.abs(t.netPnl);
      sumLoss     += t.netPnl;
      if (t.netPnl < largestLoss) largestLoss = t.netPnl;
      curLoss++;
      curWin = 0;
      if (curLoss > longestLoss) longestLoss = curLoss;
    }
  }

  const winRate      = n > 0 ? r2((winCount / n) * 100) : 0;
  const profitFactor = grossLoss > 0 ? r2(grossProfit / grossLoss) : grossProfit > 0 ? Infinity : 0;
  const averageWin   = winCount  > 0 ? r2(sumWin  / winCount)  : 0;
  const averageLoss  = lossCount > 0 ? r2(sumLoss / lossCount) : 0;
  const expectancy   = r2((winRate / 100) * averageWin + ((100 - winRate) / 100) * averageLoss);
  const avgDuration  = Math.round(sumDuration / n);

  // Downsample equity curve
  const eqDown = downsample(equityCurve, MAX_EQUITY_POINTS);
  const tsDown = downsample(eqTimestamps, MAX_EQUITY_POINTS);

  // Daily returns for Sharpe
  const dailyReturns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1];
    if (prev > 0) dailyReturns.push((equityCurve[i] - prev) / prev);
  }

  const sharpeRatio   = sharpeRatioFromReturns(dailyReturns);
  const annReturn     = annualizedReturn(totalReturn, periodDays);
  const { maxDrawdown, maxDrawdownDays, drawdownCurve } = drawdownStats(eqDown, tsDown.map(v => v));
  const calmarRatio   = r2(maxDrawdown > 0 ? annReturn / maxDrawdown : 0);
  const monthlyList   = monthlyReturns(equityCurve, eqTimestamps);

  // Drawdown curve with date strings
  const ddCurveWithDates = eqDown.map((_, i) => ({
    date:     new Date(tsDown[i] ?? 0).toISOString(),
    drawdown: r2(drawdownCurve[i] ?? 0),
  }));

  // Monthly PnL as Record for compatibility with base BacktestMetrics
  const monthlyPnlRecord: Record<string, number> = {};
  for (const m of monthlyList) {
    monthlyPnlRecord[m.month] = m.return;
  }

  return {
    // Base BacktestMetrics fields
    finalBalance:       r2(finalBalance),
    totalReturn,
    totalTrades:        n,
    winningTrades:      winCount,
    losingTrades:       lossCount,
    winRate,
    profitFactor:       isFinite(profitFactor) ? profitFactor : 999,
    sharpeRatio,
    maxDrawdown,
    averageWin,
    averageLoss,
    averageTradePnl:    r2((grossProfit - grossLoss) / n),
    longestWinStreak:   longestWin,
    longestLossStreak:  longestLoss,
    totalFeePaid:       r2(totalFee),
    averageDuration:    avgDuration,
    calmarRatio,
    expectancy,
    equityCurve:        eqDown,
    dailyPnl:           dailyPnlMap,

    // Extended fields (Part 3)
    annualizedReturn:      annReturn,
    maxDrawdownDuration:   maxDrawdownDays,
    largestWin:            r2(largestWin),
    largestLoss:           r2(largestLoss),
    averageHoldTimeHours:  r2(avgDuration / 60),
    drawdownCurve:         ddCurveWithDates,
    monthlyReturnsList:    monthlyList,
    dataSource:            data.source,
  };
}

function emptyExtMetrics(initialBalance: number, source: 'coingecko' | 'simulated'): ExtendedBacktestMetrics {
  return {
    finalBalance: initialBalance, totalReturn: 0, annualizedReturn: 0,
    totalTrades: 0, winningTrades: 0, losingTrades: 0,
    winRate: 0, profitFactor: 0, sharpeRatio: 0, maxDrawdown: 0,
    maxDrawdownDuration: 0, averageWin: 0, averageLoss: 0,
    averageTradePnl: 0, longestWinStreak: 0, longestLossStreak: 0,
    totalFeePaid: 0, averageDuration: 0, calmarRatio: 0, expectancy: 0,
    equityCurve: [initialBalance], dailyPnl: {},
    largestWin: 0, largestLoss: 0, averageHoldTimeHours: 0,
    drawdownCurve: [], monthlyReturnsList: [],
    dataSource: source,
  };
}

function downsample<T>(arr: T[], maxLen: number): T[] {
  if (arr.length <= maxLen) return arr;
  const step = arr.length / maxLen;
  return Array.from({ length: maxLen }, (_, i) => arr[Math.min(Math.round(i * step), arr.length - 1)]);
}

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY DISPATCHER
// ─────────────────────────────────────────────────────────────────────────────

function dispatchStrategy(
  strategyType: StrategyType | 'custom',
  data:         BacktestData,
  ind:          IndicatorResult,
  params:       BacktestParams,
): BacktestSessionTrade[] {
  switch (strategyType) {
    case 'dca':        return simulateRsi(data, ind, params);       // DCA → RSI-guided
    case 'martingale': return simulateMacd(data, ind, params);      // Martingale → MACD
    case 'grid':       return simulateSma(data, ind, params);       // Grid → SMA crossover
    case 'arbitrage':  return simulateBollinger(data, ind, params); // Arb → BB bounce
    case 'custom':     return simulateAtr(data, ind, params);       // Custom → ATR trailing
    default:           return simulateSma(data, ind, params);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ASYNC RUNNER
// ─────────────────────────────────────────────────────────────────────────────

export interface EnrichedRunInput {
  params:       BacktestParams;
  strategyType: StrategyType | 'custom';
}

/**
 * Main async backtest runner.
 * 1. Fetches real historical data from CoinGecko (with fallback)
 * 2. Computes all technical indicators
 * 3. Runs indicator-aware strategy simulator
 * 4. Returns extended metrics matching Part 3 spec
 */
/** Overall timeout for a single backtest run — 60 seconds */
const BACKTEST_TIMEOUT_MS = 60_000;

export async function runEnrichedBacktest(input: EnrichedRunInput): Promise<EnrichedBacktestOutput> {
  const started = performance.now();
  const { params, strategyType } = input;

  // ── Global timeout wrapper ──────────────────────────────────────────────
  const timeoutId = setTimeout(() => {
    throw new BacktestError('TIMEOUT', 'Backtest exceeded 60 second limit');
  }, BACKTEST_TIMEOUT_MS);

  try {
    return await _runEnrichedBacktest(input, started);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function _runEnrichedBacktest(
  input:   EnrichedRunInput,
  started: number,
): Promise<EnrichedBacktestOutput> {
  const { params, strategyType } = input;

  // 1. Fetch historical data (typed errors bubble from coinGeckoService)
  const data = await fetchHistoricalData(
    params.coinId,
    params.symbol,
    params.timeframe,
    new Date(params.startDate),
    new Date(params.endDate),
  );

  if (data.candles.length === 0) {
    throw new BacktestError('NO_DATA', 'No historical data available for selected date range');
  }

  // 2. Compute all indicators
  const ohlcData: OHLCData = {
    opens:   data.opens,
    highs:   data.highs,
    lows:    data.lows,
    closes:  data.prices,
    volumes: data.volumes,
  };
  const ind = computeAllIndicators(ohlcData);

  // 3. Simulate trades
  const trades = dispatchStrategy(strategyType, data, ind, params);

  // 4. Period days
  const startMs   = new Date(params.startDate).getTime();
  const endMs     = new Date(params.endDate).getTime();
  const periodDays = Math.max((endMs - startMs) / 86_400_000, 1);

  // 5. Compute extended metrics
  const metrics   = computeExtendedMetrics(trades, params.initialBalance, periodDays, data);
  const riskLevel = deriveRiskLevel(metrics.maxDrawdown, metrics.sharpeRatio);
  const durationMs = Math.round(performance.now() - started);

  return { trades, metrics, durationMs, riskLevel, data };
}
