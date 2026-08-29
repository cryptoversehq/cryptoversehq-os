/**
 * botBacktestBridge.ts — Spec 6.1
 *
 * Translates a UserBot / BotConfig into a BacktestConfig so the user
 * can run a backtest using exactly the same logic as their live bot.
 *
 * Also provides helpers for the reverse flow:
 *   backtest result → proposed BotConfig (used by "Deploy Bot" action).
 */

import type { UserBot, BotConfig } from './botTypes';
import type { BacktestConfig }     from '../components/backtest/BacktestConfigPanel';
import { DEFAULT_INITIAL_BALANCE, DEFAULT_FEE_RATE } from './backtestTypes';

// ─────────────────────────────────────────────────────────────────────────────
// BOT → BACKTEST CONFIG
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert a live bot into a BacktestConfig pre-filled with its parameters.
 * The UI can pass this directly to <BacktestPage> / BacktestConfigPanel.
 */
export function botToBacktestConfig(bot: UserBot): BacktestConfig {
  const cfg = bot.config;

  const today    = new Date();
  const yearAgo  = new Date(today);
  yearAgo.setFullYear(today.getFullYear() - 1);
  const startDate = yearAgo.toISOString().slice(0, 10);
  const endDate   = today.toISOString().slice(0, 10);

  // ── resolve symbol + coinId from the bot config ───────────────────────────
  let coinId  = 'bitcoin';
  let symbol  = 'BTC/USDT';
  let timeframe: string = '1h';

  if (cfg.type === 'grid' || cfg.type === 'dca' || cfg.type === 'martingale') {
    coinId    = (cfg as any).coinId      ?? 'bitcoin';
    symbol    = (cfg as any).coinSymbol  ? `${(cfg as any).coinSymbol}/USDT` : 'BTC/USDT';
    timeframe = (cfg as any).checkInterval ?? '1h';
  } else if (cfg.type === 'arbitrage') {
    // Arb bots monitor multiple pairs; backtest the first one
    const pairs = (cfg as any).monitoredPairs as Array<{ symbol: string; coinId: string }> | undefined;
    if (pairs?.length) {
      symbol = pairs[0].symbol ?? symbol;
      coinId = pairs[0].coinId ?? coinId;
    } else {
      coinId = (cfg as any).coinAId ?? 'bitcoin';
    }
  } else if (cfg.type === 'rebalancing') {
    // Rebalancing bots manage a basket; backtest using portfolio value as capital
    coinId = 'bitcoin'; symbol = 'BTC/USDT';
  }

  // Normalise symbol → "BTC/USDT" if it's just "BTCUSDT" etc.
  if (!symbol.includes('/') && symbol.length >= 6) {
    symbol = symbol.slice(0, symbol.length - 4) + '/' + symbol.slice(symbol.length - 4);
  }

  // ── strategy config passthrough ───────────────────────────────────────────
  const strategyConfig = buildStrategyConfig(cfg);

  // ── initial balance ───────────────────────────────────────────────────────
  const initialBalance = resolveInitialBalance(cfg);

  return {
    mode:            'my_strategy',
    strategyId:      null,
    strategyName:    `${bot.name} (Bot Backtest)`,
    strategyType:    botTypeToStrategyType(cfg.type),
    params: {
      coinId,
      symbol,
      timeframe: timeframe as any,
      startDate,
      endDate,
      initialBalance,
      feeRate: DEFAULT_FEE_RATE,
      strategyConfig,
    },
    enableSlippage:  true,
    includeWeekends: true,
    customCode:      '',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function botTypeToStrategyType(type: BotConfig['type']): BacktestConfig['strategyType'] {
  const map: Record<string, BacktestConfig['strategyType']> = {
    grid:        'grid',
    martingale:  'martingale',
    dca:         'dca',
    arbitrage:   'grid',    // approximate with grid logic in backtest
    rebalancing: 'dca',     // approximate with dca logic in backtest
  };
  return map[type] ?? 'grid';
}

function resolveInitialBalance(cfg: BotConfig): number {
  if (cfg.type === 'grid')        return (cfg as any).totalInvestment      ?? DEFAULT_INITIAL_BALANCE;
  if (cfg.type === 'martingale')  return (cfg as any).baseAmount * 20      ?? DEFAULT_INITIAL_BALANCE;
  if (cfg.type === 'dca')         return (cfg as any).initialInvestment * 5 ?? DEFAULT_INITIAL_BALANCE;
  if (cfg.type === 'rebalancing') return (cfg as any).totalPortfolioUsd    ?? DEFAULT_INITIAL_BALANCE;
  return DEFAULT_INITIAL_BALANCE;
}

function buildStrategyConfig(cfg: BotConfig): Record<string, any> {
  if (cfg.type === 'grid') {
    return {
      gridCount:       (cfg as any).gridCount       ?? 10,
      lowerPrice:      (cfg as any).lowerPrice       ?? 0,
      upperPrice:      (cfg as any).upperPrice       ?? 0,
      totalInvestment: (cfg as any).totalInvestment  ?? 1000,
      stopLossPrice:   (cfg as any).stopLossPrice    ?? 0,
      takeProfitPrice: (cfg as any).takeProfitPrice  ?? 0,
    };
  }
  if (cfg.type === 'martingale') {
    return {
      baseAmount:             (cfg as any).baseAmount             ?? 100,
      multiplier:             (cfg as any).multiplier             ?? 2,
      maxConsecutiveLosses:   (cfg as any).maxConsecutiveLosses   ?? 5,
      takeProfitPct:          (cfg as any).takeProfitPct          ?? 3,
      direction:              (cfg as any).direction              ?? 'long',
    };
  }
  if (cfg.type === 'dca') {
    return {
      initialInvestment: (cfg as any).initialInvestment ?? 500,
      numberOfOrders:    (cfg as any).numberOfOrders    ?? 5,
      priceDropPct:      (cfg as any).priceDropPct      ?? 5,
      takeProfitPct:     (cfg as any).takeProfitPct     ?? 8,
    };
  }
  return {};
}

// ─────────────────────────────────────────────────────────────────────────────
// BACKTEST RESULT → PROPOSED BOT NAME
// ─────────────────────────────────────────────────────────────────────────────

export function suggestBotNameFromBacktest(strategyName: string, returnPct: number): string {
  const sign = returnPct >= 0 ? '+' : '';
  return `${strategyName} (${sign}${returnPct.toFixed(1)}% bt)`;
}
