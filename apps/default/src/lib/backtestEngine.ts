/**
 * backtestEngine.ts
 *
 * Pure, deterministic backtest simulation engine for CryptoVerse HQ.
 * No side-effects — safe to call from a web worker or directly on the main thread.
 *
 * Architecture:
 *   1. generateHistoricalCandles()  — synthesise OHLCV candle history
 *   2. runBacktest()                — main entry point; dispatches to per-type simulator
 *   3. simulateGrid/Martingale/Dca/Arbitrage/Rebalancing/Custom()
 *      — each returns a BacktestSessionTrade[]
 *   4. computeMetrics()             — derives all BacktestMetrics from the trade log
 *
 * Determinism:
 *   The candle generator is seeded by coinId + startDate so the same
 *   parameters always produce the same price history and trades.
 *
 * Reuses:
 *   - marketEngine.ts  TF_MS map for interval durations
 *   - strategyUtils.ts computeSharpeRatio / computeMaxDrawdown
 *   - backtestTypes.ts all domain types
 */

import { TF_MS, Timeframe } from './marketEngine';
import { computeSharpeRatio, computeMaxDrawdown, deriveRiskLevel } from './strategyUtils';
import {
  BacktestParams,
  BacktestMetrics,
  BacktestSessionTrade,
  BacktestSignalReason,
  BacktestSession,
  MAX_SESSION_TRADES,
  MAX_EQUITY_POINTS,
  COIN_BASE_PRICES,
  DEFAULT_FEE_RATE,
} from './backtestTypes';
import type { StrategyType } from './strategyTypes';

// ─────────────────────────────────────────────────────────────────────────────
// CANDLE SHAPE (internal — subset of marketEngine.Candle)
// ─────────────────────────────────────────────────────────────────────────────

interface Candle {
  time:   number; // unix ms
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// SEEDED PRNG
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A simple mulberry32 PRNG — fast, deterministic, and seedable.
 * Returns a function that yields floats in [0, 1).
 */
function createRng(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = s + 0x6d2b79f5 | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Derives a numeric seed from a string (coinId + startDate). */
function stringSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// HISTORICAL CANDLE GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a sequence of synthetic OHLCV candles over a date range.
 * Uses Geometric Brownian Motion with seeded randomness for determinism.
 */
export function generateHistoricalCandles(
  coinId:    string,
  tf:        Timeframe,
  startDate: string,
  endDate:   string,
): Candle[] {
  const startMs  = new Date(startDate).getTime();
  const endMs    = new Date(endDate).getTime();
  const intervalMs = TF_MS[tf];

  if (endMs <= startMs || intervalMs <= 0) return [];

  const count = Math.min(Math.floor((endMs - startMs) / intervalMs), 10_000);
  if (count === 0) return [];

  const basePrice  = COIN_BASE_PRICES[coinId] ?? 100;
  const seed       = stringSeed(`${coinId}:${startDate}:${tf}`);
  const rng        = createRng(seed);

  // Volatility scales with timeframe — shorter bars = less per-bar move
  const volatility = Math.sqrt(intervalMs / TF_MS['1D']) * 0.022;
  const drift      = 0.00005; // slight upward drift per bar

  const candles: Candle[] = [];
  let price = basePrice * (0.85 + rng() * 0.3);

  for (let i = 0; i < count; i++) {
    const open  = price;
    const move  = drift + volatility * (rng() * 2 - 1);
    const close = Math.max(open * (1 + move), 0.000001);
    const span  = Math.abs(close - open);
    const high  = Math.max(open, close) + span * (0.2 + rng() * 0.8);
    const low   = Math.max(Math.min(open, close) - span * (0.2 + rng() * 0.8), 0.000001);

    candles.push({
      time:   startMs + i * intervalMs,
      open:   roundPrice(open,  basePrice),
      high:   roundPrice(high,  basePrice),
      low:    roundPrice(low,   basePrice),
      close:  roundPrice(close, basePrice),
      volume: Math.round(basePrice * (20 + rng() * 200)),
    });

    price = close;
  }

  return candles;
}

function roundPrice(p: number, ref: number): number {
  const dec = ref > 10_000 ? 1 : ref > 1_000 ? 2 : ref > 10 ? 4 : ref > 1 ? 5 : 8;
  return +p.toFixed(dec);
}

// ─────────────────────────────────────────────────────────────────────────────
// METRIC COMPUTATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derives all BacktestMetrics from a completed trade list and final balance.
 */
export function computeMetrics(
  trades:         BacktestSessionTrade[],
  initialBalance: number,
  periodDays:     number,
): BacktestMetrics {
  if (trades.length === 0) {
    return emptyMetrics(initialBalance);
  }

  const finalBalance = trades[trades.length - 1].equityAfter;
  const totalReturn  = ((finalBalance / initialBalance) - 1) * 100;

  let winningTrades = 0;
  let losingTrades  = 0;
  let grossProfit   = 0;
  let grossLoss     = 0;
  let totalFee      = 0;
  let sumWin        = 0;
  let sumLoss       = 0;
  let sumDuration   = 0;
  let longestWin    = 0;
  let longestLoss   = 0;
  let curWin        = 0;
  let curLoss       = 0;

  const equityRaw: number[] = [initialBalance];
  const dailyPnl: Record<string, number> = {};

  for (const t of trades) {
    totalFee     += t.fee;
    sumDuration  += t.durationMinutes;
    equityRaw.push(t.equityAfter);

    const day = t.exitAt.slice(0, 10);
    dailyPnl[day] = (dailyPnl[day] ?? 0) + t.netPnl;

    if (t.isWinner) {
      winningTrades++;
      grossProfit += t.netPnl;
      sumWin      += t.netPnl;
      curWin++;
      curLoss = 0;
      if (curWin > longestWin) longestWin = curWin;
    } else {
      losingTrades++;
      grossLoss += Math.abs(t.netPnl);
      sumLoss   += t.netPnl;
      curLoss++;
      curWin = 0;
      if (curLoss > longestLoss) longestLoss = curLoss;
    }
  }

  const winRate     = trades.length > 0 ? (winningTrades / trades.length) * 100 : 0;
  const lossRate    = 100 - winRate;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
  const averageWin  = winningTrades > 0 ? sumWin / winningTrades : 0;
  const averageLoss = losingTrades  > 0 ? sumLoss / losingTrades  : 0;
  const expectancy  = (winRate / 100) * averageWin + (lossRate / 100) * averageLoss;

  // Downsample equity curve to MAX_EQUITY_POINTS
  const equityCurve = downsampleEquity(equityRaw, MAX_EQUITY_POINTS);
  const maxDrawdown = computeMaxDrawdown(equityCurve);
  const sharpeRatio = computeSharpeRatio(equityCurve, Math.max(periodDays, 1));

  const annualisedReturn = periodDays > 0
    ? (totalReturn / 100) * (365 / periodDays) * 100
    : totalReturn;
  const calmarRatio = maxDrawdown > 0 ? annualisedReturn / maxDrawdown : 0;

  return {
    finalBalance:     roundUsd(finalBalance),
    totalReturn:      roundPct(totalReturn),
    totalTrades:      trades.length,
    winningTrades,
    losingTrades,
    winRate:          roundPct(winRate),
    profitFactor:     Math.round(profitFactor * 100) / 100,
    sharpeRatio:      Math.round(sharpeRatio * 100) / 100,
    maxDrawdown:      roundPct(maxDrawdown),
    averageWin:       roundUsd(averageWin),
    averageLoss:      roundUsd(averageLoss),
    averageTradePnl:  roundUsd((grossProfit - grossLoss) / trades.length),
    longestWinStreak:  longestWin,
    longestLossStreak: longestLoss,
    totalFeePaid:      roundUsd(totalFee),
    averageDuration:   Math.round(sumDuration / trades.length),
    calmarRatio:       Math.round(calmarRatio * 100) / 100,
    expectancy:        roundUsd(expectancy),
    equityCurve,
    dailyPnl,
  };
}

function emptyMetrics(initialBalance: number): BacktestMetrics {
  return {
    finalBalance: initialBalance, totalReturn: 0, totalTrades: 0,
    winningTrades: 0, losingTrades: 0, winRate: 0, profitFactor: 0,
    sharpeRatio: 0, maxDrawdown: 0, averageWin: 0, averageLoss: 0,
    averageTradePnl: 0, longestWinStreak: 0, longestLossStreak: 0,
    totalFeePaid: 0, averageDuration: 0, calmarRatio: 0, expectancy: 0,
    equityCurve: [initialBalance], dailyPnl: {},
  };
}

function downsampleEquity(curve: number[], maxPoints: number): number[] {
  if (curve.length <= maxPoints) return curve;
  const step = curve.length / maxPoints;
  return Array.from({ length: maxPoints }, (_, i) => {
    const idx = Math.min(Math.round(i * step), curve.length - 1);
    return roundUsd(curve[idx]);
  });
}

function roundUsd(n: number): number { return Math.round(n * 100) / 100; }
function roundPct(n: number): number { return Math.round(n * 100) / 100; }

// ─────────────────────────────────────────────────────────────────────────────
// TRADE BUILDER HELPER
// ─────────────────────────────────────────────────────────────────────────────

function makeTrade(params: {
  n:            number;
  side:         'long' | 'short';
  entryPrice:   number;
  exitPrice:    number;
  entryAt:      number; // unix ms
  exitAt:       number; // unix ms
  quantity:     number;
  feeRate:      number;
  balance:      number;
  entryReason:  BacktestSignalReason;
  exitReason:   BacktestSignalReason;
}): { trade: BacktestSessionTrade; newBalance: number } {
  const { n, side, entryPrice, exitPrice, entryAt, exitAt, quantity, feeRate, balance, entryReason, exitReason } = params;
  const entryValue = entryPrice * quantity;
  const exitValue  = exitPrice  * quantity;
  const grossPnl   = side === 'long' ? exitValue - entryValue : entryValue - exitValue;
  const fee        = (entryValue + exitValue) * feeRate;
  const netPnl     = grossPnl - fee;
  const pnlPct     = entryValue > 0 ? (netPnl / entryValue) * 100 : 0;
  const newBalance = roundUsd(balance + netPnl);

  const trade: BacktestSessionTrade = {
    tradeNumber:     n,
    side,
    entryPrice:      roundUsd(entryPrice),
    exitPrice:       roundUsd(exitPrice),
    entryAt:         new Date(entryAt).toISOString(),
    exitAt:          new Date(exitAt).toISOString(),
    durationMinutes: Math.round((exitAt - entryAt) / 60_000),
    quantity:        +quantity.toFixed(8),
    entryValue:      roundUsd(entryValue),
    exitValue:       roundUsd(exitValue),
    grossPnl:        roundUsd(grossPnl),
    fee:             roundUsd(fee),
    netPnl:          roundUsd(netPnl),
    pnlPct:          roundPct(pnlPct),
    equityAfter:     newBalance,
    entryReason,
    exitReason,
    isWinner:        netPnl > 0,
  };

  return { trade, newBalance };
}

// ─────────────────────────────────────────────────────────────────────────────
// PER-TYPE SIMULATORS
// ─────────────────────────────────────────────────────────────────────────────

/** Grid Bot simulation — fires trades whenever price crosses a grid level. */
function simulateGrid(
  candles:  Candle[],
  params:   BacktestParams,
  config:   Record<string, unknown>,
): BacktestSessionTrade[] {
  const balance0  = params.initialBalance;
  const feeRate   = params.feeRate ?? DEFAULT_FEE_RATE;
  const gridCount = Number(config.gridCount ?? 10);
  const invest    = Number(config.totalInvestment ?? balance0);

  // Estimate price range from candle history
  const allLows  = candles.map(c => c.low);
  const allHighs = candles.map(c => c.high);
  const lo = Number(config.lowerPrice ?? (Math.min(...allLows)  * 0.98));
  const hi = Number(config.upperPrice ?? (Math.max(...allHighs) * 1.02));

  if (hi <= lo || gridCount < 2) return [];

  const step     = (hi - lo) / (gridCount - 1);
  const levels   = Array.from({ length: gridCount }, (_, i) => lo + i * step);
  const orderUsd = invest / gridCount;

  const trades: BacktestSessionTrade[] = [];
  let balance   = balance0;
  let tradeNum  = 0;

  // Track which levels have pending buy fills (price → entry data)
  const openBuys: Map<number, { price: number; qty: number; time: number }> = new Map();

  for (const candle of candles) {
    for (const level of levels) {
      // Buy signal: candle low crossed below level
      if (!openBuys.has(level) && candle.low <= level && candle.close > level) {
        const qty = orderUsd / level;
        openBuys.set(level, { price: level, qty, time: candle.time });
      }
      // Sell signal: candle high crossed above level + one step (take profit)
      const tpLevel = level + step;
      const buy = openBuys.get(level);
      if (buy && tpLevel <= hi && candle.high >= tpLevel) {
        tradeNum++;
        const { trade, newBalance } = makeTrade({
          n: tradeNum, side: 'long',
          entryPrice: buy.price, exitPrice: tpLevel,
          entryAt: buy.time, exitAt: candle.time,
          quantity: buy.qty, feeRate, balance,
          entryReason: 'grid_level_crossed', exitReason: 'grid_level_crossed',
        });
        balance = newBalance;
        trades.push(trade);
        openBuys.delete(level);
        if (trades.length >= MAX_SESSION_TRADES) break;
      }
    }
    if (trades.length >= MAX_SESSION_TRADES) break;
  }

  // Close any open grid positions at last candle close
  const last = candles[candles.length - 1];
  for (const [level, buy] of openBuys) {
    if (trades.length >= MAX_SESSION_TRADES) break;
    tradeNum++;
    const { trade, newBalance } = makeTrade({
      n: tradeNum, side: 'long',
      entryPrice: buy.price, exitPrice: last.close,
      entryAt: buy.time, exitAt: last.time,
      quantity: buy.qty, feeRate, balance,
      entryReason: 'grid_level_crossed', exitReason: 'session_end',
    });
    balance = newBalance;
    trades.push(trade);
  }

  return trades;
}

/** Martingale Bot simulation — doubles down on loss, takes profit on recovery. */
function simulateMartingale(
  candles:  Candle[],
  params:   BacktestParams,
  config:   Record<string, unknown>,
): BacktestSessionTrade[] {
  const feeRate         = params.feeRate ?? DEFAULT_FEE_RATE;
  const baseOrderUsd    = Number(config.baseOrderSize ?? params.initialBalance * 0.05);
  const maxSafetyOrders = Number(config.maxSafetyOrders ?? 5);
  const priceDeviation  = Number(config.priceDeviation ?? 2.5) / 100;
  const volumeMult      = Number(config.volumeMultiplier ?? 2.0);
  const tpPct           = Number(config.takeProfitPct ?? 1.5) / 100;
  const side: 'long' | 'short' = (config.side as 'long' | 'short') ?? 'long';

  const trades: BacktestSessionTrade[] = [];
  let balance  = params.initialBalance;
  let tradeNum = 0;

  // State per cycle
  let cycleOpen       = false;
  let safetyFilled    = 0;
  let totalCoin       = 0;
  let totalUsd        = 0;
  let weightedEntry   = 0;
  let lastOrderPrice  = 0;
  let cycleStartTime  = 0;
  let currentOrderUsd = baseOrderUsd;

  for (const candle of candles) {
    if (!cycleOpen) {
      // Open base order at candle open
      const qty = baseOrderUsd / candle.open;
      totalCoin     = qty;
      totalUsd      = baseOrderUsd;
      weightedEntry = candle.open;
      lastOrderPrice = candle.open;
      cycleStartTime = candle.time;
      cycleOpen       = true;
      safetyFilled    = 0;
      currentOrderUsd = baseOrderUsd;
      continue;
    }

    // Take-profit check
    const tp = side === 'long'
      ? weightedEntry * (1 + tpPct)
      : weightedEntry * (1 - tpPct);

    const tpHit = side === 'long' ? candle.high >= tp : candle.low <= tp;

    if (tpHit) {
      tradeNum++;
      const { trade, newBalance } = makeTrade({
        n: tradeNum, side,
        entryPrice: weightedEntry, exitPrice: tp,
        entryAt: cycleStartTime, exitAt: candle.time,
        quantity: totalCoin, feeRate, balance,
        entryReason: safetyFilled === 0 ? 'martingale_base' : 'martingale_safety',
        exitReason: 'martingale_take_profit',
      });
      balance = newBalance;
      trades.push(trade);
      cycleOpen = false;
      totalCoin = 0; totalUsd = 0;
      if (trades.length >= MAX_SESSION_TRADES) break;
      continue;
    }

    // Safety order check
    if (safetyFilled < maxSafetyOrders) {
      const nextSafetyPrice = side === 'long'
        ? lastOrderPrice * (1 - priceDeviation * Math.pow(1.05, safetyFilled))
        : lastOrderPrice * (1 + priceDeviation * Math.pow(1.05, safetyFilled));

      const safetyHit = side === 'long' ? candle.low <= nextSafetyPrice : candle.high >= nextSafetyPrice;

      if (safetyHit) {
        currentOrderUsd *= volumeMult;
        const safetyQty = currentOrderUsd / nextSafetyPrice;
        totalCoin      += safetyQty;
        totalUsd       += currentOrderUsd;
        weightedEntry   = totalUsd / totalCoin;
        lastOrderPrice  = nextSafetyPrice;
        safetyFilled++;
      }
    }
  }

  // Close open cycle at last candle
  if (cycleOpen && totalCoin > 0) {
    const last = candles[candles.length - 1];
    tradeNum++;
    const { trade, newBalance } = makeTrade({
      n: tradeNum, side,
      entryPrice: weightedEntry, exitPrice: last.close,
      entryAt: cycleStartTime, exitAt: last.time,
      quantity: totalCoin, feeRate, balance,
      entryReason: 'martingale_base', exitReason: 'session_end',
    });
    balance = newBalance;
    trades.push(trade);
  }

  return trades;
}

/** DCA Bot simulation — buys on a fixed schedule, optionally sells at TP. */
function simulateDca(
  candles:  Candle[],
  params:   BacktestParams,
  config:   Record<string, unknown>,
): BacktestSessionTrade[] {
  const feeRate       = params.feeRate ?? DEFAULT_FEE_RATE;
  const orderUsd      = Number(config.orderSize ?? 100);
  const intervalMs    = TF_MS['1D']; // default: 1 day
  const tpPct         = Number(config.takeProfitPct ?? 0) / 100;
  const dipThreshold  = Number(config.dipThresholdPct ?? 5) / 100;
  const dipMult       = Number(config.dipMultiplier ?? 2);

  const trades:    BacktestSessionTrade[] = [];
  let balance      = params.initialBalance;
  let tradeNum     = 0;
  let nextBuyTime  = candles[0]?.time ?? 0;
  let totalCoin    = 0;
  let totalUsd     = 0;
  let avgEntry     = 0;
  let lastBuyPrice = 0;
  const buyTimes:  number[] = [];
  const buyPrices: number[] = [];

  for (const candle of candles) {
    if (candle.time < nextBuyTime) continue;

    const dip = lastBuyPrice > 0 ? (lastBuyPrice - candle.close) / lastBuyPrice : 0;
    const effectiveUsd = dip >= dipThreshold ? orderUsd * dipMult : orderUsd;

    const qty = effectiveUsd / candle.close;
    totalCoin  += qty;
    totalUsd   += effectiveUsd;
    avgEntry    = totalUsd / totalCoin;
    lastBuyPrice = candle.close;
    nextBuyTime  = candle.time + intervalMs;
    buyTimes.push(candle.time);
    buyPrices.push(candle.close);

    // Sell check (take-profit)
    if (tpPct > 0 && candle.high >= avgEntry * (1 + tpPct)) {
      tradeNum++;
      const entryTime = buyTimes[0] ?? candle.time;
      const { trade, newBalance } = makeTrade({
        n: tradeNum, side: 'long',
        entryPrice: avgEntry, exitPrice: avgEntry * (1 + tpPct),
        entryAt: entryTime, exitAt: candle.time,
        quantity: totalCoin, feeRate, balance,
        entryReason: 'dca_schedule', exitReason: 'take_profit',
      });
      balance = newBalance;
      trades.push(trade);
      totalCoin = 0; totalUsd = 0; avgEntry = 0;
      buyTimes.length = 0; buyPrices.length = 0;
      if (trades.length >= MAX_SESSION_TRADES) break;
    }
  }

  // Close remaining position at last candle
  if (totalCoin > 0 && candles.length > 0) {
    const last = candles[candles.length - 1];
    tradeNum++;
    const { trade, newBalance } = makeTrade({
      n: tradeNum, side: 'long',
      entryPrice: avgEntry, exitPrice: last.close,
      entryAt: buyTimes[0] ?? last.time, exitAt: last.time,
      quantity: totalCoin, feeRate, balance,
      entryReason: 'dca_schedule', exitReason: 'session_end',
    });
    balance = newBalance;
    trades.push(trade);
  }

  return trades;
}

/** Arbitrage simulation — captures simulated spread between pairs. */
function simulateArbitrage(
  candles:   Candle[],
  params:    BacktestParams,
  config:    Record<string, unknown>,
  rng:       () => number,
): BacktestSessionTrade[] {
  const feeRate      = params.feeRate ?? DEFAULT_FEE_RATE;
  const minSpreadPct = Number(config.minSpreadPct ?? 0.2) / 100;
  const maxPos       = Number(config.maxPositionUsd ?? 500);
  const maxHoldMs    = Number(config.maxHoldMinutes ?? 60) * 60_000;

  const trades:   BacktestSessionTrade[] = [];
  let balance     = params.initialBalance;
  let tradeNum    = 0;
  let openAt: number | null = null;
  let openPrice   = 0;
  let openQty     = 0;

  for (const candle of candles) {
    // Close open arb position
    if (openAt !== null && candle.time - openAt >= maxHoldMs) {
      tradeNum++;
      const { trade, newBalance } = makeTrade({
        n: tradeNum, side: 'long',
        entryPrice: openPrice, exitPrice: candle.close,
        entryAt: openAt, exitAt: candle.time,
        quantity: openQty, feeRate, balance,
        entryReason: 'arb_spread_open', exitReason: 'arb_spread_close',
      });
      balance = newBalance;
      trades.push(trade);
      openAt = null;
      if (trades.length >= MAX_SESSION_TRADES) break;
    }

    // Open new arb position (5% chance per bar, spread meets minimum)
    if (openAt === null && rng() < 0.05) {
      const spread = rng() * 0.008; // 0–0.8%
      if (spread >= minSpreadPct) {
        openAt    = candle.time;
        openPrice = candle.close;
        openQty   = maxPos / candle.close;
      }
    }
  }

  // Force-close at end
  if (openAt !== null) {
    const last = candles[candles.length - 1];
    tradeNum++;
    const { trade, newBalance } = makeTrade({
      n: tradeNum, side: 'long',
      entryPrice: openPrice, exitPrice: last.close,
      entryAt: openAt, exitAt: last.time,
      quantity: openQty, feeRate, balance,
      entryReason: 'arb_spread_open', exitReason: 'session_end',
    });
    balance = newBalance;
    trades.push(trade);
  }

  return trades;
}

/** Rebalancing simulation — rebalances portfolio when drift exceeds threshold. */
function simulateRebalancing(
  candles:  Candle[],
  params:   BacktestParams,
  config:   Record<string, unknown>,
  rng:      () => number,
): BacktestSessionTrade[] {
  const feeRate      = params.feeRate ?? DEFAULT_FEE_RATE;
  const driftPct     = Number(config.driftThresholdPct ?? 5) / 100;
  const checkMs      = TF_MS['4h'];

  const trades:  BacktestSessionTrade[] = [];
  let balance    = params.initialBalance;
  let tradeNum   = 0;
  let lastCheck  = candles[0]?.time ?? 0;

  for (const candle of candles) {
    if (candle.time - lastCheck < checkMs) continue;
    lastCheck = candle.time;

    // Simulate drift check — random drift level seeded by price change
    const drift = Math.abs((candle.close - candle.open) / candle.open);
    if (drift < driftPct * (0.5 + rng() * 1.5)) continue;

    // Rebalancing trade — small buy or sell
    const rebalUsd = balance * driftPct * 0.5;
    const side: 'long' | 'short' = rng() > 0.5 ? 'long' : 'short';

    tradeNum++;
    const { trade, newBalance } = makeTrade({
      n: tradeNum, side,
      entryPrice: candle.open, exitPrice: candle.close,
      entryAt: candle.time, exitAt: candle.time + checkMs,
      quantity: rebalUsd / candle.open,
      feeRate, balance,
      entryReason: 'rebalance_trigger', exitReason: 'rebalance_trigger',
    });
    balance = newBalance;
    trades.push(trade);
    if (trades.length >= MAX_SESSION_TRADES) break;
  }

  return trades;
}

/** Custom / generic signal simulation using SMA crossover logic. */
function simulateCustom(
  candles:  Candle[],
  params:   BacktestParams,
  config:   Record<string, unknown>,
): BacktestSessionTrade[] {
  const feeRate = params.feeRate ?? DEFAULT_FEE_RATE;
  const fast    = Number(config.fastPeriod ?? 10);
  const slow    = Number(config.slowPeriod ?? 30);
  const posUsd  = Number(config.positionSizeUsd ?? params.initialBalance * 0.1);

  const trades:  BacktestSessionTrade[] = [];
  let balance    = params.initialBalance;
  let tradeNum   = 0;
  let inTrade    = false;
  let entryPrice = 0;
  let entryQty   = 0;
  let entryTime  = 0;

  const closes = candles.map(c => c.close);

  function sma(i: number, period: number): number {
    if (i < period - 1) return 0;
    return closes.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
  }

  for (let i = slow; i < candles.length; i++) {
    const fastNow  = sma(i, fast);
    const fastPrev = sma(i - 1, fast);
    const slowNow  = sma(i, slow);
    const slowPrev = sma(i - 1, slow);

    // Golden cross — buy
    if (!inTrade && fastPrev <= slowPrev && fastNow > slowNow) {
      entryPrice = candles[i].close;
      entryQty   = posUsd / entryPrice;
      entryTime  = candles[i].time;
      inTrade    = true;
    }

    // Death cross — sell
    if (inTrade && fastPrev >= slowPrev && fastNow < slowNow) {
      tradeNum++;
      const { trade, newBalance } = makeTrade({
        n: tradeNum, side: 'long',
        entryPrice, exitPrice: candles[i].close,
        entryAt: entryTime, exitAt: candles[i].time,
        quantity: entryQty, feeRate, balance,
        entryReason: 'custom_signal', exitReason: 'custom_signal',
      });
      balance = newBalance;
      trades.push(trade);
      inTrade = false;
      if (trades.length >= MAX_SESSION_TRADES) break;
    }
  }

  // Close open trade
  if (inTrade && candles.length > 0) {
    const last = candles[candles.length - 1];
    tradeNum++;
    const { trade, newBalance } = makeTrade({
      n: tradeNum, side: 'long',
      entryPrice, exitPrice: last.close,
      entryAt: entryTime, exitAt: last.time,
      quantity: entryQty, feeRate, balance,
      entryReason: 'custom_signal', exitReason: 'session_end',
    });
    balance = newBalance;
    trades.push(trade);
  }

  return trades;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

export interface RunBacktestInput {
  params:       BacktestParams;
  strategyType: StrategyType | 'custom';
  /** Optional session name for logging */
  sessionName?: string;
}

export interface RunBacktestOutput {
  trades:     BacktestSessionTrade[];
  metrics:    BacktestMetrics;
  durationMs: number;
  /** Derived risk level for the completed session */
  riskLevel:  'low' | 'medium' | 'high' | 'very-high';
}

/**
 * Main backtest runner — call this to simulate a full strategy run.
 *
 * @param input  Strategy type, params, and optional config override
 * @returns      Trades, metrics, and execution duration
 */
export function runBacktest(input: RunBacktestInput): RunBacktestOutput {
  const started = performance.now();
  const { params, strategyType } = input;

  // 1. Generate candle history
  const candles = generateHistoricalCandles(
    params.coinId,
    params.timeframe,
    params.startDate,
    params.endDate,
  );

  if (candles.length === 0) {
    const metrics = emptyMetrics(params.initialBalance);
    return { trades: [], metrics, durationMs: 0, riskLevel: 'low' };
  }

  const config = params.strategyConfig ?? {};
  const seed   = stringSeed(`${params.coinId}:${params.startDate}:${strategyType}`);
  const rng    = createRng(seed);

  // 2. Simulate trades
  let trades: BacktestSessionTrade[];
  switch (strategyType) {
    case 'grid':        trades = simulateGrid(candles, params, config);         break;
    case 'martingale':  trades = simulateMartingale(candles, params, config);   break;
    case 'dca':         trades = simulateDca(candles, params, config);          break;
    case 'arbitrage':   trades = simulateArbitrage(candles, params, config, rng); break;
    case 'rebalancing': trades = simulateRebalancing(candles, params, config, rng); break;
    default:            trades = simulateCustom(candles, params, config);       break;
  }

  // 3. Compute period in days
  const startMs  = new Date(params.startDate).getTime();
  const endMs    = new Date(params.endDate).getTime();
  const periodDays = Math.max((endMs - startMs) / 86_400_000, 1);

  // 4. Derive metrics
  const metrics = computeMetrics(trades, params.initialBalance, periodDays);

  // 5. Derive risk level
  const riskLevel = deriveRiskLevel(metrics.maxDrawdown, metrics.sharpeRatio);

  const durationMs = Math.round(performance.now() - started);

  return { trades, metrics, durationMs, riskLevel };
}
