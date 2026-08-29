/**
 * botUtils.ts
 *
 * Pure utility functions for the CryptoVerse HQ Trading Bots system.
 * No side-effects, no store imports — safe to call from anywhere.
 *
 * Covers:
 *   - Schedule parsing and next-run calculation
 *   - Config validation (per bot type)
 *   - Grid level generation
 *   - Martingale order math
 *   - DCA timing and cost-basis tracking
 *   - Rebalancing drift detection
 *   - Performance metric computation
 *   - Display / formatting helpers
 */

import {
  BotType,
  BotStatus,
  BotConfig,
  BotFilters,
  BotSortKey,
  UserBot,
  BotExecution,
  GridLevel,
  GridState,
  MartingaleState,
  DcaState,
  ArbitrageState,
  ArbitrageOpportunity,
  ArbitrageCycle,
  RebalancingState,
  RebalancingHolding,
  RebalancingTrade,
  RebalanceCycle,
  GridBotConfig,
  MartingaleBotConfig,
  DcaBotConfig,
  ArbitrageBotConfig,
  RebalancingBotConfig,
  BOT_FEE_RATE,
  BOT_INTERVAL_OPTIONS,
  GRID_MAX_LEVELS,
  MARTINGALE_MAX_SAFETY_ORDERS,
  BOT_MAX_PER_USER,
} from './botTypes';
import { generateId } from './strategyUtils';

// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parses a schedule value string and returns the interval in milliseconds.
 * Returns null for 'continuous' or invalid values.
 */
export function parseIntervalMs(scheduleValue: string): number | null {
  const option = BOT_INTERVAL_OPTIONS.find(o => o.value === scheduleValue);
  return option ? option.ms : null;
}

/**
 * Computes the next run timestamp (ISO-8601) for a bot based on its schedule.
 * Returns null for continuous bots (runs every tick).
 */
export function computeNextRunAt(
  scheduleType: UserBot['scheduleType'],
  scheduleValue: string,
  lastRunAt: string | null,
): string | null {
  if (scheduleType === 'continuous') return null;

  const ms = parseIntervalMs(scheduleValue);
  if (ms === null) return null;

  const base = lastRunAt ? new Date(lastRunAt).getTime() : Date.now();
  return new Date(base + ms).toISOString();
}

/**
 * Returns true if a bot should execute now based on its schedule.
 * Always returns true for continuous bots.
 */
export function isBotDue(bot: UserBot): boolean {
  if (bot.scheduleType === 'continuous') return true;
  if (!bot.nextRunAt) return true;
  return Date.now() >= new Date(bot.nextRunAt).getTime();
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

export interface BotValidationResult {
  valid: boolean;
  errors: string[];
}

/** Validates the user-supplied bot name. */
export function validateBotName(name: string): BotValidationResult {
  const errors: string[] = [];
  if (!name.trim()) errors.push('Bot name is required.');
  if (name.trim().length > 60) errors.push('Bot name must be 60 characters or fewer.');
  return { valid: errors.length === 0, errors };
}

/** Validates a GridBotConfig. */
export function validateGridConfig(c: GridBotConfig): BotValidationResult {
  const errors: string[] = [];
  if (!c.coinId) errors.push('Coin is required.');
  if (c.totalInvestment <= 0) errors.push('Total investment must be greater than 0.');
  if (c.gridCount < 2) errors.push('Grid must have at least 2 levels.');
  if (c.gridCount > GRID_MAX_LEVELS) errors.push(`Grid cannot exceed ${GRID_MAX_LEVELS} levels.`);
  if (c.lowerPrice <= 0) errors.push('Lower price must be greater than 0.');
  if (c.upperPrice <= c.lowerPrice) errors.push('Upper price must be greater than lower price.');
  if (c.stopLossPrice > 0 && c.stopLossPrice >= c.lowerPrice) {
    errors.push('Stop-loss price must be below the lower grid price.');
  }
  if (c.takeProfitPrice > 0 && c.takeProfitPrice <= c.upperPrice) {
    errors.push('Take-profit price must be above the upper grid price.');
  }
  if (c.feeRate < 0 || c.feeRate >= 0.1) errors.push('Fee rate must be between 0 and 10%.');
  return { valid: errors.length === 0, errors };
}

/** Validates a MartingaleBotConfig (spec-aligned fields). */
export function validateMartingaleConfig(c: MartingaleBotConfig): BotValidationResult {
  const errors: string[] = [];
  if (!c.coinId) errors.push('Coin is required.');
  if (c.baseAmount < 10 || c.baseAmount > 1_000) {
    errors.push('Base amount must be between $10 and $1,000.');
  }
  if (c.multiplier < 1.5 || c.multiplier > 3.0) {
    errors.push('Multiplier must be between 1.5× and 3.0×.');
  }
  if (c.maxConsecutiveLosses < 3 || c.maxConsecutiveLosses > 10) {
    errors.push('Max consecutive losses must be between 3 and 10.');
  }
  if (c.takeProfitPct < 1 || c.takeProfitPct > 5) {
    errors.push('Take-profit % must be between 1% and 5%.');
  }
  if (!['long', 'short', 'both'].includes(c.direction)) {
    errors.push('Direction must be long, short, or both.');
  }
  return { valid: errors.length === 0, errors };
}

/** Validates a DcaBotConfig (spec-aligned fields). */
export function validateDcaConfig(c: DcaBotConfig): BotValidationResult {
  const errors: string[] = [];
  if (!c.coinId) errors.push('Coin is required.');
  if (c.initialInvestment < 100 || c.initialInvestment > 10_000) {
    errors.push('Initial investment must be between $100 and $10,000.');
  }
  if (c.numberOfOrders < 2 || c.numberOfOrders > 20) {
    errors.push('Number of orders must be between 2 and 20.');
  }
  if (c.priceDropPct < 1 || c.priceDropPct > 10) {
    errors.push('Price drop % must be between 1% and 10%.');
  }
  if (c.takeProfitPct < 2 || c.takeProfitPct > 20) {
    errors.push('Take profit % must be between 2% and 20%.');
  }
  return { valid: errors.length === 0, errors };
}

// validateArbitrageConfig and validateRebalancingConfig are defined later
// in this file with the full spec-aligned implementations.

/**
 * Validates any BotConfig using the appropriate typed validator.
 * Returns a unified ValidationResult.
 */
export function validateBotConfig(config: BotConfig): BotValidationResult {
  switch (config.type) {
    case 'grid':        return validateGridConfig(config);
    case 'martingale':  return validateMartingaleConfig(config);
    case 'dca':         return validateDcaConfig(config);
    case 'arbitrage':   return validateArbitrageConfig(config);
    case 'rebalancing': return validateRebalancingConfig(config);
  }
}

/**
 * Checks if a user is eligible to create a bot.
 * Returns { eligible: true } or { eligible: false, reason }.
 */
export function checkBotEligibility(params: {
  templateMinBalance:  number;
  userTradingBalance:  number;
  userBotCount:        number;
  userPlan:            'bronze' | 'silver' | 'gold';
  templateRequiredPlan: 'bronze' | 'silver' | 'gold' | 'any';
  userLevel:           number;
  templateRequiredLevel: number;
  templateActive:      boolean;
}): { eligible: boolean; reason?: string } {
  if (!params.templateActive) {
    return { eligible: false, reason: 'This bot template is currently unavailable.' };
  }
  if (params.userBotCount >= BOT_MAX_PER_USER) {
    return { eligible: false, reason: `Maximum ${BOT_MAX_PER_USER} bots per user.` };
  }
  if (params.userTradingBalance < params.templateMinBalance) {
    return {
      eligible: false,
      reason: `Insufficient balance. Required: $${params.templateMinBalance.toLocaleString()}, you have: $${params.userTradingBalance.toLocaleString()}.`,
    };
  }
  const planOrder: Record<string, number> = { bronze: 0, silver: 1, gold: 2 };
  const required = params.templateRequiredPlan === 'any' ? 0 : (planOrder[params.templateRequiredPlan] ?? 0);
  if (planOrder[params.userPlan] < required) {
    return { eligible: false, reason: `Requires ${params.templateRequiredPlan} plan or higher.` };
  }
  if (params.userLevel < params.templateRequiredLevel) {
    return {
      eligible: false,
      reason: `Requires Academy Level ${params.templateRequiredLevel}. Your level: ${params.userLevel}.`,
    };
  }
  return { eligible: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// GRID HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates the initial grid level array for a grid bot.
 * Levels are evenly spaced between lowerPrice and upperPrice.
 * Levels below current price → buy orders; above → sell orders.
 */
export function buildGridLevels(config: GridBotConfig, currentPrice: number): GridLevel[] {
  const { lowerPrice, upperPrice, gridCount } = config;
  const step = (upperPrice - lowerPrice) / (gridCount - 1);

  return Array.from({ length: gridCount }, (_, i) => {
    const price = lowerPrice + step * i;
    return {
      index:    i,
      price:    Math.round(price * 100) / 100,
      side:     price <= currentPrice ? 'buy' : 'sell',
      filled:   false,
      orderId:  '',
      filledAt: null,
    };
  });
}

/**
 * Initialises a GridState for a new grid bot.
 */
export function initGridState(botId: string, config: GridBotConfig, currentPrice: number): GridState {
  return {
    botId,
    levels:         buildGridLevels(config, currentPrice),
    initialPrice:   currentPrice,
    lastTickPrice:  currentPrice,
    lastUpdatedAt:  new Date().toISOString(),
  };
}

/**
 * Calculates the USD amount per grid level (investment ÷ gridCount).
 */
export function gridOrderSize(config: GridBotConfig): number {
  return Math.round((config.totalInvestment / config.gridCount) * 100) / 100;
}

/**
 * Processes a price tick against a grid state.
 * Returns the list of levels that were triggered (crossed) by the price move.
 */
export function processGridTick(
  state: GridState,
  config: GridBotConfig,
  newPrice: number,
): { triggeredLevels: GridLevel[]; updatedState: GridState } {
  const prevPrice  = state.lastTickPrice;
  const triggered: GridLevel[] = [];

  const levels = state.levels.map(level => {
    if (level.filled) return level;

    // Price crossed a sell level upward
    const crossedSell = level.side === 'sell' && prevPrice < level.price && newPrice >= level.price;
    // Price crossed a buy level downward
    const crossedBuy  = level.side === 'buy'  && prevPrice > level.price && newPrice <= level.price;

    if (crossedSell || crossedBuy) {
      const filled: GridLevel = { ...level, filled: true, orderId: generateId(), filledAt: new Date().toISOString() };
      triggered.push(filled);
      return filled;
    }
    return level;
  });

  // Flip each triggered level to the opposite side and un-fill it
  const updatedLevels = levels.map(l => {
    const wasTriggered = triggered.some(t => t.index === l.index);
    if (!wasTriggered) return l;
    return { ...l, side: l.side === 'buy' ? 'sell' : ('buy' as 'buy' | 'sell'), filled: false, orderId: '', filledAt: null };
  });

  return {
    triggeredLevels: triggered,
    updatedState: { ...state, levels: updatedLevels, lastTickPrice: newPrice, lastUpdatedAt: new Date().toISOString() },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MARTINGALE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes the safety order size for step N (0-indexed, 0 = base order).
 */
export function martingaleOrderSize(config: MartingaleBotConfig, step: number): number {
  if (step === 0) return config.baseOrderSize;
  const size = config.safetyOrderSize * Math.pow(config.volumeMultiplier, step - 1);
  return Math.round(size * 100) / 100;
}

/**
 * Computes the price at which safety order N should be placed.
 * Each successive order is placed deeper (priceDeviation × stepScale^(N-1) below previous).
 */
export function martingaleSafetyOrderPrice(
  config: MartingaleBotConfig,
  basePrice: number,
  safetyOrderIndex: number, // 1-indexed
): number {
  let deviationPct = config.priceDeviation;
  let price = basePrice;

  for (let i = 1; i <= safetyOrderIndex; i++) {
    price *= 1 - deviationPct / 100;
    deviationPct *= config.stepScale;
  }

  return Math.round(price * 100) / 100;
}

/**
 * Computes the take-profit price given a weighted average entry.
 */
export function martingaleTakeProfitPrice(
  config: MartingaleBotConfig,
  weightedAvgEntry: number,
): number {
  const side = config.side === 'long' ? 1 : -1;
  return Math.round(weightedAvgEntry * (1 + side * (config.takeProfitPct / 100)) * 100) / 100;
}

/**
 * Updates a MartingaleState after a new order is filled.
 */
export function updateMartingaleState(
  state: MartingaleState,
  config: MartingaleBotConfig,
  filledPrice: number,
  filledUsd: number,
): MartingaleState {
  const coinAmount = filledUsd / filledPrice;
  const newTotalUsd    = state.totalInvestedUsd + filledUsd;
  const newCoinAmount  = state.totalCoinAmount  + coinAmount;
  const newAvgEntry    = newTotalUsd / newCoinAmount;
  const safetyCount    = state.baseOrderFilled ? state.safetyOrdersFilled + 1 : 0;

  return {
    ...state,
    safetyOrdersFilled: safetyCount,
    weightedAvgEntry:   Math.round(newAvgEntry * 1e6) / 1e6,
    totalInvestedUsd:   Math.round(newTotalUsd * 100) / 100,
    totalCoinAmount:    Math.round(newCoinAmount * 1e8) / 1e8,
    baseOrderFilled:    true,
    lastOrderPrice:     filledPrice,
    takeProfitPrice:    martingaleTakeProfitPrice(config, newAvgEntry),
    lastUpdatedAt:      new Date().toISOString(),
  };
}

/**
 * Resets a MartingaleState to the initial cycle start.
 * Used after a win or when the bot is first started.
 */
export function resetMartingaleState(
  botId: string,
  initialSide: 'long' | 'short' = 'long',
): MartingaleState {
  return {
    botId,
    // spec fields
    consecutiveLosses: 0,
    currentMultiplier: 1,
    nextSide:          initialSide,
    openEntryPrice:    0,
    openPositionUsd:   0,
    hasOpenTrade:      false,
    // legacy compat
    safetyOrdersFilled: 0,
    weightedAvgEntry:   0,
    totalInvestedUsd:   0,
    totalCoinAmount:    0,
    baseOrderFilled:    false,
    lastOrderPrice:     0,
    takeProfitPrice:    0,
    lastUpdatedAt:      new Date().toISOString(),
  };
}

/**
 * Returns the current trade size in USD for this martingale cycle step.
 * Spec formula: currentSize = baseAmount × currentMultiplier
 */
export function martingaleCurrentTradeSize(
  config: MartingaleBotConfig,
  state:  MartingaleState,
): number {
  return Math.round(config.baseAmount * state.currentMultiplier * 100) / 100;
}

/**
 * Resolves the next direction based on config.direction and the last trade result.
 * "both" → alternate: first trade long, flip on each win.
 */
export function martingaleNextSide(
  config:    MartingaleBotConfig,
  state:     MartingaleState,
  isWin:     boolean,
): 'long' | 'short' {
  if (config.direction === 'long')  return 'long';
  if (config.direction === 'short') return 'short';
  // "both" — alternate only on win (reset), keep same direction on loss
  if (!isWin) return state.nextSide;
  return state.nextSide === 'long' ? 'short' : 'long';
}

/**
 * Computes the take-profit exit price for a martingale trade.
 * long:  entryPrice × (1 + takeProfitPct / 100)
 * short: entryPrice × (1 - takeProfitPct / 100)
 */
export function martingaleTpPrice(
  config:     MartingaleBotConfig,
  entryPrice: number,
  side:       'long' | 'short',
): number {
  const factor = side === 'long'
    ? 1 + config.takeProfitPct / 100
    : 1 - config.takeProfitPct / 100;
  return Math.round(entryPrice * factor * 100) / 100;
}

// ─────────────────────────────────────────────────────────────────────────────
// DCA HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes the next DCA buy time from the last buy timestamp.
 * @deprecated The spec-aligned engine uses price-drop triggers, not time intervals.
 * Kept for legacy compat.
 */
export function dcaNextBuyAt(config: DcaBotConfig, lastBuyAt: string | null): string {
  const ms   = BOT_INTERVAL_OPTIONS.find(o => o.value === config.interval)?.ms ?? 60_000;
  const base = lastBuyAt ? new Date(lastBuyAt).getTime() : Date.now();
  return new Date(base + ms).toISOString();
}

/**
 * Returns the effective order size for a DCA buy.
 * Spec formula: additionalAmount = initialInvestment / ordersPlaced
 * (where ordersPlaced is the count BEFORE this buy, matching the spec's variable)
 */
export function dcaOrderAmount(config: DcaBotConfig, ordersPlacedBefore: number): number {
  // Spec: const additionalAmount = initialInvestment / ordersPlaced
  // ordersPlaced is the count of prior orders at the time of this buy
  const divisor = Math.max(1, ordersPlacedBefore);
  return Math.round((config.initialInvestment / divisor) * 100) / 100;
}

/**
 * Returns the effective order size for a DCA buy, applying dip multiplier if applicable.
 * @deprecated Use dcaOrderAmount for spec-aligned logic.
 */
export function dcaEffectiveOrderSize(
  config: DcaBotConfig,
  currentPrice: number,
  lastBuyPrice: number,
): number {
  return config.initialInvestment;
}

/**
 * Computes the % drop of currentPrice relative to lastBuyPrice.
 * Returns a positive number (e.g. 5 = 5% drop).
 */
export function dcaPriceDrop(lastBuyPrice: number, currentPrice: number): number {
  if (lastBuyPrice <= 0) return 0;
  return Math.round(((lastBuyPrice - currentPrice) / lastBuyPrice) * 10_000) / 100;
}

/**
 * Computes the % rise of currentPrice relative to averagePrice.
 * Returns a positive number (e.g. 5 = 5% rise above avg entry).
 */
export function dcaPriceRise(averagePrice: number, currentPrice: number): number {
  if (averagePrice <= 0) return 0;
  return Math.round(((currentPrice - averagePrice) / averagePrice) * 10_000) / 100;
}

/**
 * Creates the initial DcaState for a newly started bot (no position yet).
 */
export function initDcaState(botId: string): DcaState {
  const now = new Date().toISOString();
  return {
    botId,
    // spec
    ordersPlaced:    0,
    totalInvestment: 0,
    totalShares:     0,
    averagePrice:    0,
    firstBuyPrice:   0,
    lastBuyPrice:    0,
    partialExitDone: false,
    remainingShares: 0,
    // legacy
    totalBuys:        0,
    totalInvestedUsd: 0,
    totalCoinAmount:  0,
    weightedAvgEntry: 0,
    lastBuyAt:        null,
    nextBuyAt:        null,
    lastUpdatedAt:    now,
  };
}

/**
 * Returns a new DcaState after recording a successful buy execution.
 * Implements the spec accumulation logic exactly.
 */
export function dcaApplyBuy(
  state:        DcaState,
  price:        number,
  usdAmount:    number,
): DcaState {
  const newShares          = usdAmount / price;
  const newTotalInvestment = state.totalInvestment + usdAmount;
  const newTotalShares     = state.totalShares + newShares;
  const newAvgPrice        = newTotalInvestment / newTotalShares;
  const newOrdersPlaced    = state.ordersPlaced + 1;
  const now                = new Date().toISOString();

  return {
    ...state,
    ordersPlaced:    newOrdersPlaced,
    totalInvestment: Math.round(newTotalInvestment * 100) / 100,
    totalShares:     Math.round(newTotalShares * 1e8) / 1e8,
    averagePrice:    Math.round(newAvgPrice * 1e6) / 1e6,
    firstBuyPrice:   state.firstBuyPrice > 0 ? state.firstBuyPrice : price,
    lastBuyPrice:    price,
    remainingShares: Math.round(newTotalShares * 1e8) / 1e8, // stays in sync until partial exit
    // legacy
    totalBuys:        newOrdersPlaced,
    totalInvestedUsd: Math.round(newTotalInvestment * 100) / 100,
    totalCoinAmount:  Math.round(newTotalShares * 1e8) / 1e8,
    weightedAvgEntry: Math.round(newAvgPrice * 1e6) / 1e6,
    lastBuyAt:        now,
    lastUpdatedAt:    now,
  };
}

/**
 * Returns a new DcaState after a partial exit (sell half).
 */
export function dcaApplyPartialExit(state: DcaState, price: number): DcaState {
  const halfShares   = Math.round((state.totalShares / 2) * 1e8) / 1e8;
  const now          = new Date().toISOString();
  return {
    ...state,
    partialExitDone: true,
    remainingShares: halfShares,
    totalCoinAmount: halfShares,
    lastUpdatedAt:   now,
  };
}

/**
 * Updates a DcaState after a new buy execution.
 */
export function updateDcaState(
  state: DcaState,
  config: DcaBotConfig,
  filledPrice: number,
  filledUsd: number,
): DcaState {
  const coinAmount    = filledUsd / filledPrice;
  const newTotal      = state.totalInvestedUsd + filledUsd;
  const newCoin       = state.totalCoinAmount  + coinAmount;
  const newAvgEntry   = newTotal / newCoin;
  const now           = new Date().toISOString();

  return {
    botId:             state.botId,
    totalBuys:         state.totalBuys + 1,
    totalInvestedUsd:  Math.round(newTotal * 100) / 100,
    totalCoinAmount:   Math.round(newCoin * 1e8) / 1e8,
    weightedAvgEntry:  Math.round(newAvgEntry * 1e6) / 1e6,
    lastBuyAt:         now,
    nextBuyAt:         dcaNextBuyAt(config, now),
    lastUpdatedAt:     now,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ARBITRAGE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Maximum number of recent cycles to store in ArbitrageState. */
export const ARB_MAX_RECENT_CYCLES = 50;

/**
 * Creates a fresh ArbitrageState for a newly started bot.
 */
export function initArbitrageState(botId: string): ArbitrageState {
  return {
    botId,
    lastScanAt:    null,
    totalCycles:   0,
    totalNetProfit: 0,
    recentCycles:  [],
    lastScanOpps:  [],
    lastUpdatedAt: new Date().toISOString(),
  };
}

/**
 * Returns true when it is time to run the next scan.
 * Spec: Scan Interval (seconds between scans)
 */
export function isArbScanDue(state: ArbitrageState, scanIntervalSec: number): boolean {
  if (!state.lastScanAt) return true;
  const elapsed = (Date.now() - new Date(state.lastScanAt).getTime()) / 1_000;
  return elapsed >= scanIntervalSec;
}

/**
 * Simulates the spread for a single pair at a given market price.
 *
 * Spec: buyPrice  = getCurrentPrice(pair)
 *       sellPrice = buyPrice * (1 + simulatedSpread / 100)
 *
 * The simulated spread is derived from a deterministic "market noise" model
 * so different pairs produce meaningfully different spreads on the same tick.
 * Range: 0.05% – 1.8% (realistic inter-exchange simulation).
 */
export function arbSimulateSpread(
  coinId:     string,
  currentPrice: number,
  /** monotonically increasing scan counter — adds slight temporal variation */
  scanCount:  number,
): { buyPrice: number; sellPrice: number; spreadPct: number } {
  // Deterministic seed from coinId chars + price hash + scan
  const seed = coinId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  // Pseudo-random in [0,1) — cycles with scanCount for variation
  const pseudo = ((seed * 9301 + 49297 + scanCount * 233) % 233280) / 233280;
  // Spread in [0.04 , 1.80] %
  const spreadPct = 0.04 + pseudo * 1.76;

  const buyPrice  = currentPrice;
  const sellPrice = Math.round(buyPrice * (1 + spreadPct / 100) * 100) / 100;
  return { buyPrice, sellPrice, spreadPct: Math.round(spreadPct * 1000) / 1000 };
}

/**
 * Scans all monitored pairs and returns viable arbitrage opportunities.
 *
 * Spec:
 *   for (const pair of monitoredPairs) {
 *     const buyPrice   = getCurrentPrice(pair);
 *     const sellPrice  = buyPrice * (1 + simulatedSpread / 100);
 *     const profitPercent = (sellPrice - buyPrice) / buyPrice * 100;
 *     if (profitPercent >= minProfitPercent) opportunities.push(...)
 *   }
 *   return opportunities sorted desc by profitPercent
 */
export function arbScanOpportunities(
  config:      ArbitrageBotConfig,
  priceMap:    Record<string, number>, // coinId → current USD price
  scanCount:   number,
): ArbitrageOpportunity[] {
  const opportunities: ArbitrageOpportunity[] = [];

  for (const p of config.monitoredPairs) {
    const currentPrice = priceMap[p.coinId];
    if (!currentPrice) continue;

    const { buyPrice, sellPrice, spreadPct } = arbSimulateSpread(p.coinId, currentPrice, scanCount);
    const profitPercent = spreadPct; // (sellPrice - buyPrice) / buyPrice * 100
    const profitAmount  = Math.round(config.maxPositionSize * (profitPercent / 100) * 100) / 100;

    // Spec: if (profitPercent >= minProfitPercent) → push
    if (profitPercent >= config.minProfitPct) {
      opportunities.push({
        pair:   p.pair,
        coinId: p.coinId,
        symbol: p.symbol,
        buyPrice:      Math.round(buyPrice * 100) / 100,
        sellPrice:     Math.round(sellPrice * 100) / 100,
        profitPercent: Math.round(profitPercent * 1000) / 1000,
        profitAmount,
      });
    }
  }

  // Spec: sort by profitPercent descending, pick best
  return opportunities.sort((a, b) => b.profitPercent - a.profitPercent);
}

/**
 * Validates an ArbitrageBotConfig.
 */
export function validateArbitrageConfig(c: ArbitrageBotConfig): BotValidationResult {
  const errors: string[] = [];
  if (!c.monitoredPairs || c.monitoredPairs.length === 0) {
    errors.push('At least one trading pair must be selected.');
  }
  if (c.monitoredPairs && c.monitoredPairs.length > 5) {
    errors.push('Maximum 5 trading pairs allowed.');
  }
  if (c.minProfitPct < 0.1 || c.minProfitPct > 2) {
    errors.push('Minimum profit % must be between 0.1% and 2%.');
  }
  if (c.maxPositionSize < 100 || c.maxPositionSize > 50_000) {
    errors.push('Max position size must be between $100 and $50,000.');
  }
  if (c.scanIntervalSec < 5 || c.scanIntervalSec > 60) {
    errors.push('Scan interval must be between 5 and 60 seconds.');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Records a completed arb cycle into the ArbitrageState.
 * Caps recentCycles at ARB_MAX_RECENT_CYCLES.
 */
export function arbApplyCycle(
  state:  ArbitrageState,
  cycle:  ArbitrageCycle,
): ArbitrageState {
  const recentCycles = [cycle, ...state.recentCycles].slice(0, ARB_MAX_RECENT_CYCLES);
  return {
    ...state,
    totalCycles:   state.totalCycles + 1,
    totalNetProfit: Math.round((state.totalNetProfit + cycle.netProfitUsd) * 100) / 100,
    recentCycles,
    lastUpdatedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// REBALANCING HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Maximum rebalance cycles stored in state history. */
export const REBAL_MAX_HISTORY = 20;

/**
 * Creates the initial RebalancingState, allocating the portfolio evenly
 * according to target percentages using a reference price.
 *
 * Spec: currentValues = await getCurrentPortfolioValues()
 */
export function initRebalancingState(
  botId:   string,
  config:  RebalancingBotConfig,
  /** Seed price per coin (coinId → price). Can be partial; missing ones use a placeholder. */
  priceMap: Record<string, number>,
): RebalancingState {
  const assets    = config.assets ?? config.allocations ?? [];
  const totalUsd  = config.totalPortfolioUsd;
  const now       = new Date().toISOString();

  const holdings: RebalancingHolding[] = assets.map(a => {
    const price      = priceMap[a.coinId] ?? 1_000; // fallback so division is safe
    const targetUsd  = totalUsd * (a.targetPct / 100);
    const coinAmount = targetUsd / price;
    return {
      coinId:       a.coinId,
      coinSymbol:   a.coinSymbol,
      coinColor:    a.coinColor,
      targetPct:    a.targetPct,
      currentPct:   a.targetPct,   // starts perfectly balanced
      currentValue: Math.round(targetUsd * 100) / 100,
      coinAmount:   Math.round(coinAmount * 1e8) / 1e8,
      driftPct:     0,
    };
  });

  const nextRebalanceAt = new Date(
    Date.now() + (config.rebalanceIntervalHours ?? 24) * 3_600_000
  ).toISOString();

  return {
    botId,
    holdings,
    lastRebalanceAt:  null,
    nextRebalanceAt,
    totalRebalances:  0,
    rebalanceHistory: [],
    lastTrades:       [],
    lastUpdatedAt:    now,
    nextCheckAt:      nextRebalanceAt, // legacy compat
  };
}

/**
 * Returns true when the rebalance interval has elapsed.
 * Spec: scheduleNextRebalance(rebalanceInterval)
 */
export function isRebalanceDue(state: RebalancingState): boolean {
  if (!state.nextRebalanceAt) return true;
  return Date.now() >= new Date(state.nextRebalanceAt).getTime();
}

/**
 * Refreshes holdings' currentPct / driftPct when a new price arrives.
 * Does NOT execute any trades — pure recalculation.
 *
 * Spec: currentPercent = (currentValues[asset] / totalValue) * 100
 *       deviation = currentPercent - targetPercent
 */
export function rebalRefreshHoldings(
  holdings: RebalancingHolding[],
  coinId:   string,
  price:    number,
): RebalancingHolding[] {
  // Update the value of the coin whose price just ticked
  const updated = holdings.map(h =>
    h.coinId === coinId
      ? { ...h, currentValue: Math.round(h.coinAmount * price * 100) / 100 }
      : h
  );

  // Spec: totalValue = sum(currentValues)
  const totalValue = updated.reduce((s, h) => s + h.currentValue, 0);

  return updated.map(h => {
    const currentPct = totalValue > 0 ? (h.currentValue / totalValue) * 100 : h.targetPct;
    const driftPct   = currentPct - h.targetPct;
    return {
      ...h,
      currentPct: Math.round(currentPct * 100) / 100,
      driftPct:   Math.round(driftPct * 100) / 100,
    };
  });
}

/**
 * Builds the trade list for a rebalance cycle from current holdings.
 *
 * Spec exact:
 *   for each asset:
 *     deviation = currentPercent - targetPercent
 *     if |deviation| > rebalanceThreshold:
 *       if deviation > 0: sell (deviation/100)*totalValue
 *       else:             buy  (-deviation/100)*totalValue
 *       skip if amount < minTradeSize
 *   return trades[]
 */
export function rebalBuildTradeList(
  holdings:              RebalancingHolding[],
  rebalanceThresholdPct: number,
  minTradeSizeUsd:       number,
): Array<{ coinId: string; coinSymbol: string; action: 'buy' | 'sell'; amountUsd: number }> {
  const totalValue = holdings.reduce((s, h) => s + h.currentValue, 0);
  const trades: Array<{ coinId: string; coinSymbol: string; action: 'buy' | 'sell'; amountUsd: number }> = [];

  for (const h of holdings) {
    const deviation = h.driftPct; // currentPct - targetPct

    // Spec: if (Math.abs(deviation) > rebalanceThreshold)
    if (Math.abs(deviation) > rebalanceThresholdPct) {
      if (deviation > 0) {
        // Spec: sellAmount = (deviation / 100) * totalValue
        const sellAmount = Math.round((deviation / 100) * totalValue * 100) / 100;
        if (sellAmount >= minTradeSizeUsd) {
          trades.push({ coinId: h.coinId, coinSymbol: h.coinSymbol, action: 'sell', amountUsd: sellAmount });
        }
      } else {
        // Spec: buyAmount = (-deviation / 100) * totalValue
        const buyAmount = Math.round((-deviation / 100) * totalValue * 100) / 100;
        if (buyAmount >= minTradeSizeUsd) {
          trades.push({ coinId: h.coinId, coinSymbol: h.coinSymbol, action: 'buy', amountUsd: buyAmount });
        }
      }
    }
  }

  return trades;
}

/**
 * Applies a completed rebalance cycle — updates coin amounts and schedules next check.
 * Spec: scheduleNextRebalance(rebalanceInterval)
 */
export function rebalApplyCycle(
  state:                 RebalancingState,
  cycle:                 RebalanceCycle,
  updatedHoldings:       RebalancingHolding[],
  rebalanceIntervalHours: number,
): RebalancingState {
  const nextRebalanceAt = new Date(
    Date.now() + rebalanceIntervalHours * 3_600_000
  ).toISOString();
  const rebalanceHistory = [cycle, ...state.rebalanceHistory].slice(0, REBAL_MAX_HISTORY);

  return {
    ...state,
    holdings:        updatedHoldings,
    lastRebalanceAt: cycle.executedAt,
    nextRebalanceAt,
    nextCheckAt:     nextRebalanceAt, // legacy compat
    totalRebalances: state.totalRebalances + 1,
    rebalanceHistory,
    lastTrades:      cycle.trades,
    lastUpdatedAt:   cycle.executedAt,
  };
}

/**
 * Computes current holdings state from market prices.
 * @deprecated Use rebalRefreshHoldings + rebalBuildTradeList instead.
 */
export function computeRebalancingHoldings(
  config:          RebalancingBotConfig,
  currentHoldings: Record<string, number>,
  priceMap:        Record<string, number>,
): RebalancingHolding[] {
  const assets     = config.assets ?? config.allocations ?? [];
  const totalValue = assets.reduce((sum, a) => {
    return sum + (currentHoldings[a.coinId] ?? 0) * (priceMap[a.coinId] ?? 0);
  }, 0);

  return assets.map(a => {
    const coins        = currentHoldings[a.coinId] ?? 0;
    const price        = priceMap[a.coinId] ?? 0;
    const currentValue = coins * price;
    const currentPct   = totalValue > 0 ? (currentValue / totalValue) * 100 : 0;
    const driftPct     = currentPct - a.targetPct;
    return {
      coinId:       a.coinId,
      coinSymbol:   a.coinSymbol,
      coinColor:    a.coinColor,
      targetPct:    a.targetPct,
      currentPct:   Math.round(currentPct * 100) / 100,
      currentValue: Math.round(currentValue * 100) / 100,
      coinAmount:   coins,
      driftPct:     Math.round(driftPct * 100) / 100,
    };
  });
}

/**
 * Returns true if any holding's drift exceeds the configured threshold.
 */
export function needsRebalancing(
  holdings:          RebalancingHolding[],
  driftThresholdPct: number,
): boolean {
  return holdings.some(h => Math.abs(h.driftPct) >= driftThresholdPct);
}

/** Validates a RebalancingBotConfig (spec-aligned). */
export function validateRebalancingConfig(c: RebalancingBotConfig): BotValidationResult {
  const errors: string[] = [];
  const assets = c.assets ?? c.allocations ?? [];
  if (assets.length < 2) errors.push('At least 2 assets are required.');
  if (assets.length > 10) errors.push('Maximum 10 assets allowed.');
  const total = assets.reduce((s, a) => s + a.targetPct, 0);
  if (Math.abs(total - 100) > 0.5) errors.push(`Target percentages must sum to 100% (currently ${total.toFixed(1)}%).`);
  if (c.rebalanceThresholdPct < 1 || c.rebalanceThresholdPct > 15) {
    errors.push('Rebalance threshold must be between 1% and 15%.');
  }
  if (c.rebalanceIntervalHours < 1 || c.rebalanceIntervalHours > 168) {
    errors.push('Rebalance interval must be between 1 and 168 hours.');
  }
  if (c.minTradeSizeUsd < 10 || c.minTradeSizeUsd > 500) {
    errors.push('Min trade size must be between $10 and $500.');
  }
  if (c.totalPortfolioUsd <= 0) errors.push('Total portfolio value must be positive.');
  return { valid: errors.length === 0, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// PERFORMANCE METRICS
// ─────────────────────────────────────────────────────────────────────────────

/** Re-computes all UserBot performance fields from its execution log. */
export function recomputeBotMetrics(
  bot: UserBot,
  executions: BotExecution[],
): Pick<UserBot,
  | 'totalTrades' | 'totalBuyTrades' | 'totalSellTrades'
  | 'totalProfit' | 'totalProfitPct' | 'totalFeesPaid'
  | 'winRate' | 'winningTrades' | 'losingTrades'
  | 'bestTrade' | 'worstTrade' | 'maxDrawdown' | 'totalInvested'
> {
  const botExecs = executions.filter(e => e.botId === bot.id && e.status === 'completed');

  let totalProfit = 0;
  let totalFees   = 0;
  let totalInvested = 0;
  let winningTrades = 0;
  let losingTrades  = 0;
  let bestTrade  = 0;
  let worstTrade = 0;

  let buyCount  = 0;
  let sellCount = 0;

  for (const exec of botExecs) {
    totalFees += exec.fee;

    if (exec.action === 'buy') {
      buyCount++;
      totalInvested += exec.total;
    } else {
      sellCount++;
      const pnl = exec.pnl ?? 0;
      totalProfit += pnl;
      if (pnl > 0) winningTrades++;
      else         losingTrades++;
      if (pnl > bestTrade)  bestTrade  = pnl;
      if (pnl < worstTrade) worstTrade = pnl;
    }
  }

  const totalTrades = buyCount + sellCount;
  const winRate = sellCount > 0 ? (winningTrades / sellCount) * 100 : 0;

  // Simple drawdown from equity curve
  const equityValues = bot.equityCurve.map(p => p.value);
  let maxDrawdown = 0;
  let peak = equityValues[0] ?? 0;
  for (const v of equityValues) {
    if (v > peak) peak = v;
    const dd = peak > 0 ? ((peak - v) / peak) * 100 : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  return {
    totalTrades,
    totalBuyTrades:  buyCount,
    totalSellTrades: sellCount,
    totalProfit:     Math.round(totalProfit * 100) / 100,
    totalProfitPct:  totalInvested > 0 ? Math.round((totalProfit / totalInvested) * 10_000) / 100 : 0,
    totalFeesPaid:   Math.round(totalFees * 100) / 100,
    winRate:         Math.round(winRate * 100) / 100,
    winningTrades,
    losingTrades,
    bestTrade:       Math.round(bestTrade * 100) / 100,
    worstTrade:      Math.round(worstTrade * 100) / 100,
    maxDrawdown:     Math.round(maxDrawdown * 100) / 100,
    totalInvested:   Math.round(totalInvested * 100) / 100,
  };
}

/**
 * Appends a new equity curve data point, trimming to BOT_MAX_EQUITY_POINTS.
 */
export function appendEquityPoint(
  curve: Array<{ ts: number; value: number }>,
  value: number,
  maxPoints: number,
): Array<{ ts: number; value: number }> {
  const next = [...curve, { ts: Date.now(), value: Math.round(value * 100) / 100 }];
  return next.length > maxPoints ? next.slice(next.length - maxPoints) : next;
}

// ─────────────────────────────────────────────────────────────────────────────
// FEE CALCULATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculates the fee for a trade.
 * Returns fee in USD, always rounded to 6 decimal places.
 */
export function calcBotFee(usdTotal: number, feeRate = BOT_FEE_RATE): number {
  return Math.round(usdTotal * feeRate * 1e6) / 1e6;
}

/**
 * Computes a sell trade P&L.
 * pnl = (sellPrice - buyAvgPrice) × coinAmount − fee
 */
export function calcSellPnl(params: {
  coinAmount:   number;
  sellPrice:    number;
  avgBuyPrice:  number;
  fee:          number;
}): { pnl: number; pnlPct: number } {
  const rawPnl = (params.sellPrice - params.avgBuyPrice) * params.coinAmount;
  const net    = rawPnl - params.fee;
  const basis  = params.avgBuyPrice * params.coinAmount;
  const pct    = basis > 0 ? (net / basis) * 100 : 0;
  return {
    pnl:    Math.round(net * 100) / 100,
    pnlPct: Math.round(pct * 100) / 100,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// FILTERING & SORTING
// ─────────────────────────────────────────────────────────────────────────────

/** Filters a list of UserBots by the given BotFilters. */
export function applyBotFilters(bots: UserBot[], filters: BotFilters): UserBot[] {
  return bots.filter(b => {
    if (filters.search.trim()) {
      const q = filters.search.toLowerCase();
      if (!b.name.toLowerCase().includes(q) && !b.templateType.includes(q)) return false;
    }
    if (filters.types.length > 0 && !filters.types.includes(b.templateType)) return false;
    if (filters.statuses.length > 0 && !filters.statuses.includes(b.status)) return false;
    return true;
  });
}

/** Sorts a list of UserBots by the given key. Does not mutate. */
export function sortBots(bots: UserBot[], sortBy: BotSortKey): UserBot[] {
  const arr = [...bots];
  switch (sortBy) {
    case 'newest':
      return arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    case 'oldest':
      return arr.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    case 'most_profit':
      return arr.sort((a, b) => b.totalProfit - a.totalProfit);
    case 'best_win_rate':
      return arr.sort((a, b) => b.winRate - a.winRate);
    case 'most_trades':
      return arr.sort((a, b) => b.totalTrades - a.totalTrades);
    case 'lowest_drawdown':
      return arr.sort((a, b) => a.maxDrawdown - b.maxDrawdown);
    case 'name_asc':
      return arr.sort((a, b) => a.name.localeCompare(b.name));
    default:
      return arr;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DISPLAY HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Human-readable label for a BotType. */
export function botTypeLabel(type: BotType): string {
  switch (type) {
    case 'grid':        return 'Grid Bot';
    case 'martingale':  return 'Martingale Bot';
    case 'dca':         return 'DCA Bot';
    case 'arbitrage':   return 'Arbitrage Bot';
    case 'rebalancing': return 'Rebalancing Bot';
  }
}

/** Emoji icon for a BotType. */
export function botTypeIcon(type: BotType): string {
  switch (type) {
    case 'grid':        return '📊';
    case 'martingale':  return '🎲';
    case 'dca':         return '💰';
    case 'arbitrage':   return '⚡';
    case 'rebalancing': return '⚖️';
  }
}

/** Tailwind badge class for a BotStatus. */
export function botStatusColor(status: BotStatus): string {
  switch (status) {
    case 'active':  return 'bg-green-400/10 border-green-400/20 text-green-400';
    case 'paused':  return 'bg-yellow-400/10 border-yellow-400/20 text-yellow-400';
    case 'stopped': return 'bg-white/5 border-white/10 text-white/40';
    case 'error':   return 'bg-red-400/10 border-red-400/20 text-red-400';
  }
}

/** Human-readable label for a BotStatus. */
export function botStatusLabel(status: BotStatus): string {
  switch (status) {
    case 'active':  return 'Running';
    case 'paused':  return 'Paused';
    case 'stopped': return 'Stopped';
    case 'error':   return 'Error';
  }
}

/** Formats a USD value with sign prefix, 2dp. */
export function formatBotPnl(pnl: number): string {
  const sign = pnl >= 0 ? '+' : '';
  return `${sign}$${Math.abs(pnl).toFixed(2)}`;
}

/** Formats a % value with sign prefix. */
export function formatBotPnlPct(pct: number): string {
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}
