/**
 * botEngine.ts — Spec 4.1: BotEngine
 *
 * Implements the exact class structure from the spec:
 *
 *   class BotEngine {
 *     private botId:      string
 *     private isRunning:  boolean
 *     private interval:   NodeJS.Timeout | null
 *
 *     async start()         — check risk limits, dispatch bot logic, scheduleNext
 *     private scheduleNext()— setTimeout(start, getIntervalForBotType)
 *     async stop(reason?)   — clearTimeout, logStop, updateBotStatus('stopped')
 *     async pause()         — clearTimeout, updateBotStatus('paused')
 *     async resume()        — updateBotStatus('active'), start()
 *   }
 *
 * Each BotEngine instance is a lightweight coordinator:
 *   - It owns its own timer so multiple bots run independently.
 *   - All heavy logic stays in botStore._processXxxTick (pure, testable).
 *   - RiskManager is called once per cycle BEFORE dispatching.
 *
 * Global registry (botEngineRegistry) maps botId → BotEngine so the store
 * can address a running engine without storing it in React state.
 */

import type { UserBot } from './botTypes';

// ─────────────────────────────────────────────────────────────────────────────
// FORWARD REFERENCES (broken at import time to avoid circular deps)
// ─────────────────────────────────────────────────────────────────────────────

// Use `any` for the store ref type to break the circular dependency:
// botStore → botEngine → botStore would form a cycle; any + runtime cast is safe.
let _getStore: (() => any) | null = null;
let _getRiskManager: (() => any) | null = null;

export function registerEngineStoreRef(fn: () => any) {
  _getStore = fn;
}
export function registerRiskManagerRef(fn: () => any) {
  _getRiskManager = fn;
}

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT INTERVALS PER BOT TYPE  (spec: getIntervalForBotType)
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_INTERVAL_MS: Record<string, number> = {
  grid:        500,     // fast — rides each tick
  martingale:  750,
  dca:         1_000,
  arbitrage:   350,     // scan-intensive, runs faster
  rebalancing: 2_000,   // slower — only needs to check drift
};

// ─────────────────────────────────────────────────────────────────────────────
// BOT ENGINE CLASS  (spec 4.1 exact structure)
// ─────────────────────────────────────────────────────────────────────────────

export class BotEngine {
  private botId:     string;
  private isRunning: boolean;
  private interval:  ReturnType<typeof setTimeout> | null = null;

  /** Last price received for this bot's coin — drives manual tick execution. */
  private lastPrice:  number = 0;
  private lastCoinId: string = '';
  private lastSymbol: string = '';

  constructor(bot: UserBot) {
    this.botId     = bot.id;
    this.isRunning = bot.status === 'active';
  }

  // ── spec: async start() ──────────────────────────────────────────────────

  async start(): Promise<void> {
    if (!this.isRunning) return;
    if (!_getStore || !_getRiskManager) return;

    const store = _getStore();
    const bot: UserBot | undefined = store.bots[this.botId];
    if (!bot || bot.status !== 'active') { this.isRunning = false; return; }

    // ── Spec: check risk limits before each cycle ─────────────────────────
    const rm = _getRiskManager ? _getRiskManager() : null;

    // 1. Daily loss limit
    if (rm) {
      const dailyLoss = rm.getDailyLoss(this.botId);
      if (bot.maxDailyLossUsd > 0 && dailyLoss >= bot.maxDailyLossUsd) {
        await this.stop('daily_loss_limit');
        return;
      }
    }

    // 2. Total loss limit
    if (bot.maxTotalLossUsd > 0 && bot.totalProfit <= -bot.maxTotalLossUsd) {
      await this.stop('max_loss_reached');
      return;
    }

    // ── Spec: execute bot-specific logic ─────────────────────────────────
    if (this.lastPrice > 0) {
      this._dispatch(store, bot);
    }

    // ── Spec: scheduleNext() ──────────────────────────────────────────────
    this._scheduleNext(bot.templateType);
  }

  // ── spec: private scheduleNext() ─────────────────────────────────────────

  private _scheduleNext(type: string): void {
    if (!this.isRunning) return;
    const ms = DEFAULT_INTERVAL_MS[type] ?? 1_000;
    // Clear any previous timer to avoid accumulation
    if (this.interval) clearTimeout(this.interval);
    this.interval = setTimeout(() => this.start(), ms);
  }

  // ── spec: async stop(reason?) ────────────────────────────────────────────

  async stop(reason?: UserBot['stopReason']): Promise<void> {
    this.isRunning = false;
    if (this.interval) { clearTimeout(this.interval); this.interval = null; }
    if (!_getStore) return;
    const store = _getStore();
    // Spec: logStop(reason) + updateBotStatus('stopped')
    store.stopBot(this.botId, reason ?? 'user_stopped');
    // Remove from global registry
    botEngineRegistry.delete(this.botId);
  }

  // ── spec: async pause() ──────────────────────────────────────────────────

  async pause(): Promise<void> {
    this.isRunning = false;
    if (this.interval) { clearTimeout(this.interval); this.interval = null; }
    if (!_getStore) return;
    const store = _getStore();
    // Spec: updateBotStatus('paused')
    store.pauseBot(this.botId);
  }

  // ── spec: async resume() ─────────────────────────────────────────────────

  async resume(): Promise<void> {
    if (!_getStore) return;
    const store = _getStore();
    // Spec: updateBotStatus('active') → start()
    store.startBot(this.botId);
    this.isRunning = true;
    await this.start();
  }

  // ── Price feed hook (called by processTick) ───────────────────────────────

  /**
   * Receives a live price and drives the engine's dispatch.
   * Called by botStore.processTick on every market tick.
   * The engine does NOT run its own setTimeout here — it is driven externally
   * by the live WebSocket feed, which provides a natural cadence.
   */
  onTick(coinId: string, coinSymbol: string, price: number): void {
    this.lastPrice  = price;
    this.lastCoinId = coinId;
    this.lastSymbol = coinSymbol;
  }

  // ── Internal dispatch (spec: switch(bot.type) { case 'grid': … }) ─────────

  private _dispatch(store: any, bot: UserBot): void {
    const { lastCoinId: coinId, lastSymbol: coinSymbol, lastPrice: price } = this;
    if (!price) return;

    try {
      switch (bot.templateType) {
        case 'grid':
          store._processGridTick(bot, coinId, coinSymbol, price);
          break;
        case 'martingale':
          store._processMartingaleTick(bot, coinId, coinSymbol, price);
          break;
        case 'dca':
          store._processDcaTick(bot, coinId, coinSymbol, price);
          break;
        case 'arbitrage':
          store._processArbitrageTick(bot, coinId, coinSymbol, price);
          break;
        case 'rebalancing':
          store._processRebalancingTick(bot, coinId, coinSymbol, price);
          break;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      store._haltBotOnError(this.botId, msg);
      this.isRunning = false;
      botEngineRegistry.delete(this.botId);
    }
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  get running(): boolean { return this.isRunning; }
  get id():      string  { return this.botId; }
}

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL REGISTRY  — botId → BotEngine
// ─────────────────────────────────────────────────────────────────────────────

export const botEngineRegistry = new Map<string, BotEngine>();

/** Creates and registers a new engine; replaces any existing one for the bot. */
export function createEngine(bot: UserBot): BotEngine {
  const existing = botEngineRegistry.get(bot.id);
  if (existing) {
    existing['isRunning'] = false;
    if (existing['interval']) clearTimeout(existing['interval'] as any);
  }
  const engine = new BotEngine(bot);
  botEngineRegistry.set(bot.id, engine);
  return engine;
}

/** Retrieves the engine for a bot, if running. */
export function getEngine(botId: string): BotEngine | undefined {
  return botEngineRegistry.get(botId);
}

/** Removes and stops the engine for a bot. */
export function destroyEngine(botId: string): void {
  const engine = botEngineRegistry.get(botId);
  if (engine) {
    engine['isRunning'] = false;
    if (engine['interval']) clearTimeout(engine['interval'] as any);
    botEngineRegistry.delete(botId);
  }
}
