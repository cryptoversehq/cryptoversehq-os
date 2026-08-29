/**
 * botStore.ts
 *
 * Central store for the CryptoVerse HQ Trading Bots system.
 *
 * Manages three tables:
 *   - userBots        (UserBot instances created by users)
 *   - executions      (BotExecution log — append-only ring buffer)
 *   - botStates       (per-type runtime state: GridState, MartingaleState, etc.)
 *
 * Core responsibilities:
 *   - Full bot lifecycle: create → start → pause → stop → delete
 *   - Price tick processing: routes live prices to each active bot's engine
 *   - Execution recording: appends immutable BotExecution records
 *   - Performance tracking: recalculates metrics after every execution
 *   - Notification bridge: fires app-wide notifications without circular deps
 *
 * Persistence:
 *   - All data under `cryptoverse_bot_*` localStorage keys
 *   - Execution log uses a rolling ring buffer (BOT_MAX_TOTAL_EXECUTIONS)
 *
 * Notification bridge:
 *   - Uses the same pattern as tradingStore → appStore
 *   - appStore wires the handler; botStore only calls the registered fn
 */

import { create } from 'zustand';
import { cloudRecordStore } from './cloudData';
import {
  UserBot,
  BotExecution,
  BotStatus,
  BotConfig,
  BotType,
  BotFilters,
  GridState,
  MartingaleState,
  DcaState,
  ArbitrageState,
  RebalancingState,
  CreateBotResult,
  BotActionResult,
  BotExecutionResult,
  BOT_MAX_CONSECUTIVE_ERRORS,
  BOT_MAX_EQUITY_POINTS,
  BOT_MAX_EXECUTIONS_PER_BOT,
  BOT_MAX_TOTAL_EXECUTIONS,
} from './botTypes';
import {
  generateId,
} from './strategyUtils';
import {
  validateBotName,
  validateBotConfig,
  checkBotEligibility,
  computeNextRunAt,
  isBotDue,
  initGridState,
  processGridTick,
  gridOrderSize,
  updateMartingaleState,
  resetMartingaleState,
  martingaleSafetyOrderPrice,
  martingaleOrderSize,
  martingaleTakeProfitPrice,
  martingaleCurrentTradeSize,
  martingaleNextSide,
  martingaleTpPrice,
  updateDcaState,
  dcaNextBuyAt,
  dcaEffectiveOrderSize,
  dcaOrderAmount,
  dcaPriceDrop,
  dcaPriceRise,
  initDcaState,
  dcaApplyBuy,
  dcaApplyPartialExit,
  initArbitrageState,
  isArbScanDue,
  arbScanOpportunities,
  arbApplyCycle,
  ARB_MAX_RECENT_CYCLES,
  initRebalancingState,
  isRebalanceDue,
  rebalRefreshHoldings,
  rebalBuildTradeList,
  rebalApplyCycle,
  recomputeBotMetrics,
  appendEquityPoint,
  calcBotFee,
  calcSellPnl,
  applyBotFilters,
  sortBots,
} from './botUtils';
import type {
  MartingaleBotConfig, DcaBotConfig,
  ArbitrageBotConfig, ArbitrageState, ArbitrageCycle,
  RebalancingBotConfig, RebalancingState, RebalancingHolding, RebalancingTrade, RebalanceCycle,
} from './botTypes';
import { useBotTemplateStore } from './botTemplateStore';
import {
  BotEngine,
  botEngineRegistry,
  createEngine,
  destroyEngine,
  registerEngineStoreRef,
} from './botEngine';
import {
  checkPreTradeRisk as _riskCheck,
  updateDailyLoss as _updateDailyLoss,
  updateConsecutiveLosses as _updateConsecLosses,
  globalRiskManager,
} from './riskManager';
import {
  classifyBotError,
  resolveBotError,
  scheduleAutoResume,
  cancelAutoResume,
} from './botErrorHandler';

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATION BRIDGE  (same pattern as tradingStore)
// ─────────────────────────────────────────────────────────────────────────────

type BotNotifyPayload = {
  type: 'trade' | 'achievement' | 'system' | 'liquidation';
  title: string;
  message: string;
};

let _botNotifyHandler: ((n: BotNotifyPayload) => void) | null = null;

/** Called by appStore once on init to wire the notification channel. */
export function registerBotNotifyHandler(fn: (n: BotNotifyPayload) => void) {
  _botNotifyHandler = fn;
}

function botNotify(n: BotNotifyPayload) {
  _botNotifyHandler?.(n);
}

// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENCE
// ─────────────────────────────────────────────────────────────────────────────

const BOTS_KEY        = 'cryptoverse_user_bots_v1';
const EXECUTIONS_KEY  = 'cryptoverse_bot_executions_v1';
const GRID_STATE_KEY  = 'cryptoverse_bot_grid_states_v1';
const MART_STATE_KEY  = 'cryptoverse_bot_mart_states_v1';
const DCA_STATE_KEY   = 'cryptoverse_bot_dca_states_v1';
const ARB_STATE_KEY   = 'cryptoverse_bot_arb_states_v1';
const REBAL_STATE_KEY = 'cryptoverse_bot_rebal_states_v1';

function load<T>(key: string, fallback: T): T {
  return cloudRecordStore.get<T>('bots', key, fallback);
}
function save(key: string, data: unknown) {
  cloudRecordStore.set('bots', key, data);
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL DEFAULTS
// ─────────────────────────────────────────────────────────────────────────────

function makeEmptyBot(params: {
  userId: string;
  templateId: string;
  templateType: BotType;
  name: string;
  config: BotConfig;
  scheduleType: UserBot['scheduleType'];
  scheduleValue: string;
}): UserBot {
  const now = new Date().toISOString();
  return {
    id:                  generateId(),
    userId:              params.userId,
    templateId:          params.templateId,
    templateType:        params.templateType,
    name:                params.name.trim(),
    config:              params.config,
    status:              'stopped',
    stopReason:          null,
    lastError:           null,
    consecutiveErrors:   0,
    scheduleType:        params.scheduleType,
    scheduleValue:       params.scheduleValue,
    lastRunAt:           null,
    nextRunAt:           null,
    totalTrades:         0,
    totalBuyTrades:      0,
    totalSellTrades:     0,
    totalProfit:         0,
    totalProfitPct:      0,
    totalFeesPaid:       0,
    winRate:             0,
    winningTrades:       0,
    losingTrades:        0,
    bestTrade:           0,
    worstTrade:          0,
    maxDrawdown:         0,
    totalInvested:       0,
    equityCurve:         [],
    maxDailyLossUsd:     0,
    maxTotalLossUsd:     0,
    createdAt:           now,
    updatedAt:           now,
    startedAt:           null,
    stoppedAt:           null,
    pausedAt:            null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// STATE INTERFACE
// ─────────────────────────────────────────────────────────────────────────────

export interface BotState {
  bots:          Record<string, UserBot>;           // botId → UserBot
  executions:    BotExecution[];                     // newest first, global ring buffer
  gridStates:    Record<string, GridState>;          // botId → GridState
  martStates:    Record<string, MartingaleState>;    // botId → MartingaleState
  dcaStates:     Record<string, DcaState>;           // botId → DcaState
  arbStates:     Record<string, ArbitrageState>;     // botId → ArbitrageState
  rebalStates:   Record<string, RebalancingState>;   // botId → RebalancingState

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /**
   * Creates a new bot instance from a template.
   * Does NOT start the bot — user must call startBot() separately.
   */
  createBot: (params: {
    userId:          string;
    templateId:      string;
    name:            string;
    config:          BotConfig;
    scheduleType:    UserBot['scheduleType'];
    scheduleValue:   string;
    userTradingBalance: number;
    userPlan:        'bronze' | 'silver' | 'gold';
    userLevel:       number;
  }) => CreateBotResult;

  /** Starts (or resumes) a bot. Changes status to 'active'. */
  startBot:  (botId: string, currentPrice?: number) => BotActionResult;

  /** Pauses a bot. Preserves all state; bot can be resumed. */
  pauseBot:  (botId: string) => BotActionResult;

  /** Fully stops a bot and cancels any open orders. */
  stopBot:   (botId: string, reason?: UserBot['stopReason']) => BotActionResult;

  /** Updates user-editable fields on a stopped/paused bot. */
  updateBot: (botId: string, patch: {
    name?:           string;
    config?:         BotConfig;
    scheduleType?:   UserBot['scheduleType'];
    scheduleValue?:  string;
    maxDailyLossUsd?: number;
    maxTotalLossUsd?: number;
  }) => BotActionResult;

  /** Permanently deletes a bot and all its executions. */
  deleteBot: (botId: string, userId: string) => BotActionResult;

  // ── Price tick engine ─────────────────────────────────────────────────────

  /**
   * Main entry point — call this every time a live price arrives.
   * Routes the price to every active bot that trades this coin.
   * Automatically records executions and updates performance.
   */
  processTick: (coinId: string, coinSymbol: string, price: number) => void;

  // ── Manual execution ──────────────────────────────────────────────────────

  /**
   * Manually triggers one execution cycle for a bot.
   * Used for testing or for 'continuous' schedule bots on demand.
   */
  triggerExecution: (botId: string, currentPrice: number) => BotExecutionResult;

  // ── Queries ───────────────────────────────────────────────────────────────

  /** Returns all bots for a user, filtered and sorted. */
  getUserBots: (userId: string, filters?: BotFilters) => UserBot[];

  /** Returns a single bot by ID, or null. */
  getBot: (botId: string) => UserBot | null;

  /** Returns executions for a specific bot (newest first, capped at BOT_MAX_EXECUTIONS_PER_BOT). */
  getBotExecutions: (botId: string) => BotExecution[];

  /** Returns all executions for a user across all their bots. */
  getUserExecutions: (userId: string, limit?: number) => BotExecution[];

  /** Returns the grid state for a specific bot, or null. */
  getGridState: (botId: string) => GridState | null;

  /** Returns the martingale state for a specific bot, or null. */
  getMartingaleState: (botId: string) => MartingaleState | null;

  /** Returns the DCA state for a specific bot, or null. */
  getDcaState: (botId: string) => DcaState | null;

  /** Returns the arbitrage state for a specific bot, or null. */
  getArbState: (botId: string) => ArbitrageState | null;

  /** Returns the rebalancing state for a specific bot, or null. */
  getRebalancingState: (botId: string) => RebalancingState | null;

  /** Returns aggregate counts for a user's bots. */
  getUserBotStats: (userId: string) => {
    total: number; active: number; paused: number; stopped: number; error: number;
    totalProfit: number; totalTrades: number;
  };

  // ── Internal helpers ──────────────────────────────────────────────────────

  _recordExecution: (exec: BotExecution) => void;
  _updateBotAfterExecution: (botId: string, exec: BotExecution) => void;
  _haltBotOnError: (botId: string, error: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// STORE
// ─────────────────────────────────────────────────────────────────────────────

// Register store ref for BotEngine lazy-resolution (avoids circular imports)
// Called after store is created (see bottom of file)
let _storeRegistered = false;

export const useBotStore = create<BotState>((set, get) => {
  const bots        = load<Record<string, UserBot>>(BOTS_KEY, {});
  const executions  = load<BotExecution[]>(EXECUTIONS_KEY, []);
  const gridStates  = load<Record<string, GridState>>(GRID_STATE_KEY, {});
  const martStates  = load<Record<string, MartingaleState>>(MART_STATE_KEY, {});
  const dcaStates   = load<Record<string, DcaState>>(DCA_STATE_KEY, {});
  const arbStates   = load<Record<string, ArbitrageState>>(ARB_STATE_KEY, {});
  const rebalStates = load<Record<string, RebalancingState>>(REBAL_STATE_KEY, {});

  return {
    bots,
    executions,
    gridStates,
    martStates,
    dcaStates,
    arbStates,
    rebalStates,

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    createBot: (params) => {
      const {
        userId, templateId, name, config,
        scheduleType, scheduleValue,
        userTradingBalance, userPlan, userLevel,
      } = params;

      // Fetch template
      const template = useBotTemplateStore.getState().getTemplate(templateId);
      if (!template) return { ok: false, errors: ['Bot template not found.'] };

      // Eligibility check
      const userBotCount = Object.values(get().bots).filter(b => b.userId === userId).length;
      const eligible = checkBotEligibility({
        templateMinBalance:   template.minBalance,
        userTradingBalance,
        userBotCount,
        userPlan,
        templateRequiredPlan: template.requiredPlan,
        userLevel,
        templateRequiredLevel: template.requiredLevel,
        templateActive:       template.isActive,
      });
      if (!eligible.eligible) return { ok: false, errors: [eligible.reason ?? 'Not eligible.'] };

      // Validate name
      const nameValidation = validateBotName(name);
      if (!nameValidation.valid) return { ok: false, errors: nameValidation.errors };

      // Validate config
      const configValidation = validateBotConfig(config);
      if (!configValidation.valid) return { ok: false, errors: configValidation.errors };

      // Create bot record
      const bot = makeEmptyBot({
        userId, templateId, templateType: template.type,
        name, config, scheduleType, scheduleValue,
      });

      const newBots = { ...get().bots, [bot.id]: bot };
      save(BOTS_KEY, newBots);
      set({ bots: newBots });

      // Update template stats
      useBotTemplateStore.getState().incrementTotalUsers(templateId);

      return { ok: true, bot };
    },

    startBot: (botId, currentPrice) => {
      const { bots } = get();
      const bot = bots[botId];
      if (!bot) return { ok: false, error: 'Bot not found.' };

      // Cancel any pending auto-resume (user manually started)
      cancelAutoResume(botId);
      if (bot.status === 'active') return { ok: false, error: 'Bot is already running.' };

      const now    = new Date().toISOString();
      const nextRun = computeNextRunAt(bot.scheduleType, bot.scheduleValue, null);

      const updated: UserBot = {
        ...bot,
        status:    'active',
        stopReason: null,
        lastError: null,
        startedAt: bot.startedAt ?? now,
        stoppedAt: null,
        pausedAt:  null,
        nextRunAt: nextRun,
        updatedAt: now,
      };

      // Initialise type-specific state if not already done
      if (bot.templateType === 'grid' && !get().gridStates[botId] && currentPrice) {
        const gridState = initGridState(botId, bot.config as any, currentPrice);
        const newGridStates = { ...get().gridStates, [botId]: gridState };
        save(GRID_STATE_KEY, newGridStates);
        set({ gridStates: newGridStates });
      }

      if (bot.templateType === 'martingale' && !get().martStates[botId]) {
        const cfg = bot.config as MartingaleBotConfig;
        // Determine initial trade side: "both" starts with long
        const initialSide: 'long' | 'short' =
          cfg.direction === 'short' ? 'short' : 'long';
        const martState = resetMartingaleState(botId, initialSide);
        const newMartStates = { ...get().martStates, [botId]: martState };
        save(MART_STATE_KEY, newMartStates);
        set({ martStates: newMartStates });
      }

      if (bot.templateType === 'dca' && !get().dcaStates[botId]) {
        const dcaState = initDcaState(botId);
        const newDcaStates = { ...get().dcaStates, [botId]: dcaState };
        save(DCA_STATE_KEY, newDcaStates);
        set({ dcaStates: newDcaStates });
      }

      if (bot.templateType === 'arbitrage' && !get().arbStates[botId]) {
        const arbState = initArbitrageState(botId);
        const newArbStates = { ...get().arbStates, [botId]: arbState };
        save(ARB_STATE_KEY, newArbStates);
        set({ arbStates: newArbStates });
      }

      if (bot.templateType === 'rebalancing' && !get().rebalStates[botId]) {
        // Seed prices from any recent executions or use empty map (will be priced on first tick)
        const rebalState = initRebalancingState(botId, bot.config as RebalancingBotConfig, {});
        const newRebalStates = { ...get().rebalStates, [botId]: rebalState };
        save(REBAL_STATE_KEY, newRebalStates);
        set({ rebalStates: newRebalStates });
      }

      if (bot.templateType === 'rebalancing' && !get().rebalStates[botId]) {
        const rebalState: RebalancingState = {
          botId,
          holdings:          [],
          lastRebalanceAt:   null,
          nextCheckAt:       now,
          totalRebalances:   0,
          lastUpdatedAt:     now,
        };
        const newRebalStates = { ...get().rebalStates, [botId]: rebalState };
        save(REBAL_STATE_KEY, newRebalStates);
        set({ rebalStates: newRebalStates });
      }

      const newBots = { ...bots, [botId]: updated };
      save(BOTS_KEY, newBots);
      set({ bots: newBots });

      useBotTemplateStore.getState().incrementActiveInstances(bot.templateId);

      // Spec 4.1: BotEngine.start() — create & start engine for this bot
      const engine = createEngine(updated);
      // Kick off the engine's first cycle (will schedule itself via setTimeout)
      engine.start().catch(() => {});

      botNotify({
        type:    'system',
        title:   `🤖 ${bot.name} Started`,
        message: `${bot.name} is now running and will execute trades automatically.`,
      });

      return { ok: true };
    },

    pauseBot: (botId) => {
      const { bots } = get();
      const bot = bots[botId];
      if (!bot) return { ok: false, error: 'Bot not found.' };
      if (bot.status !== 'active') return { ok: false, error: 'Only active bots can be paused.' };

      const now = new Date().toISOString();
      const updated: UserBot = { ...bot, status: 'paused', pausedAt: now, updatedAt: now, nextRunAt: null };
      const newBots = { ...bots, [botId]: updated };
      save(BOTS_KEY, newBots);
      set({ bots: newBots });

      useBotTemplateStore.getState().decrementActiveInstances(bot.templateId);

      // Spec 4.1: BotEngine.pause() — stop timer, keep state
      destroyEngine(botId);

      botNotify({
        type:    'system',
        title:   `⏸ ${bot.name} Paused`,
        message: `${bot.name} has been paused. Resume it at any time.`,
      });

      return { ok: true };
    },

    stopBot: (botId, reason = 'user_stopped') => {
      const { bots } = get();
      const bot = bots[botId];
      if (!bot) return { ok: false, error: 'Bot not found.' };

      const wasActive = bot.status === 'active';
      const now = new Date().toISOString();
      const updated: UserBot = {
        ...bot,
        status:     'stopped',
        stopReason: reason,
        stoppedAt:  now,
        nextRunAt:  null,
        updatedAt:  now,
      };
      const newBots = { ...bots, [botId]: updated };
      save(BOTS_KEY, newBots);
      set({ bots: newBots });

      if (wasActive) {
        useBotTemplateStore.getState().decrementActiveInstances(bot.templateId);
      }

      // Spec 4.1: BotEngine.stop() — clearTimeout + cancel orders
      destroyEngine(botId);

      botNotify({
        type:    'system',
        title:   `⏹ ${bot.name} Stopped`,
        message: `${bot.name} has been stopped. All open orders cancelled.`,
      });

      return { ok: true };
    },

    updateBot: (botId, patch) => {
      const { bots } = get();
      const bot = bots[botId];
      if (!bot) return { ok: false, error: 'Bot not found.' };
      if (bot.status === 'active') return { ok: false, error: 'Stop or pause the bot before editing.' };

      if (patch.name) {
        const v = validateBotName(patch.name);
        if (!v.valid) return { ok: false, error: v.errors[0] };
      }
      if (patch.config) {
        const v = validateBotConfig(patch.config);
        if (!v.valid) return { ok: false, error: v.errors[0] };
      }

      const updated: UserBot = {
        ...bot,
        ...(patch.name           ? { name: patch.name.trim() }              : {}),
        ...(patch.config         ? { config: patch.config }                  : {}),
        ...(patch.scheduleType   ? { scheduleType: patch.scheduleType }      : {}),
        ...(patch.scheduleValue  ? { scheduleValue: patch.scheduleValue }    : {}),
        ...(patch.maxDailyLossUsd !== undefined ? { maxDailyLossUsd: patch.maxDailyLossUsd } : {}),
        ...(patch.maxTotalLossUsd !== undefined ? { maxTotalLossUsd: patch.maxTotalLossUsd } : {}),
        updatedAt: new Date().toISOString(),
      };

      const newBots = { ...bots, [botId]: updated };
      save(BOTS_KEY, newBots);
      set({ bots: newBots });
      return { ok: true };
    },

    deleteBot: (botId, userId) => {
      const { bots } = get();
      const bot = bots[botId];
      if (!bot) return { ok: false, error: 'Bot not found.' };
      if (bot.userId !== userId) return { ok: false, error: 'Permission denied.' };
      if (bot.status === 'active') return { ok: false, error: 'Stop the bot before deleting it.' };

      const newBots = { ...bots };
      delete newBots[botId];

      // Prune executions for this bot
      const newExecs = get().executions.filter(e => e.botId !== botId);

      // Prune type-specific states
      const newGrid  = { ...get().gridStates };  delete newGrid[botId];
      const newMart  = { ...get().martStates };  delete newMart[botId];
      const newDca   = { ...get().dcaStates };   delete newDca[botId];
      const newArb   = { ...get().arbStates };   delete newArb[botId];
      const newRebal = { ...get().rebalStates };  delete newRebal[botId];

      save(BOTS_KEY,        newBots);
      save(EXECUTIONS_KEY,  newExecs);
      save(GRID_STATE_KEY,  newGrid);
      save(MART_STATE_KEY,  newMart);
      save(DCA_STATE_KEY,   newDca);
      save(ARB_STATE_KEY,   newArb);
      save(REBAL_STATE_KEY, newRebal);

      set({ bots: newBots, executions: newExecs, gridStates: newGrid, martStates: newMart, dcaStates: newDca, arbStates: newArb, rebalStates: newRebal });
      return { ok: true };
    },

    // ── Price tick engine ─────────────────────────────────────────────────────

    processTick: (coinId, coinSymbol, price) => {
      const { bots } = get();
      const activeBots = Object.values(bots).filter(b => b.status === 'active');

      for (const bot of activeBots) {
        // Spec 4.1: feed price to the engine first so it holds lastPrice
        const engine = botEngineRegistry.get(bot.id);
        if (engine) {
          engine.onTick(coinId, coinSymbol, price);
          // Engine drives execution via its own setTimeout; we also allow
          // direct tick dispatch for bots on 'continuous' schedule (no delay)
        }

        // Direct dispatch for continuous bots (isBotDue) — engine fallback
        if (!isBotDue(bot)) continue;

        try {
          switch (bot.templateType) {
            case 'grid':
              get()._processGridTick(bot, coinId, coinSymbol, price);
              break;
            case 'martingale':
              get()._processMartingaleTick(bot, coinId, coinSymbol, price);
              break;
            case 'dca':
              get()._processDcaTick(bot, coinId, coinSymbol, price);
              break;
            case 'arbitrage':
              get()._processArbitrageTick(bot, coinId, coinSymbol, price);
              break;
            case 'rebalancing':
              get()._processRebalancingTick(bot, coinId, coinSymbol, price);
              break;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          get()._haltBotOnError(bot.id, msg);
        }
      }
    },

    triggerExecution: (botId, currentPrice) => {
      const bot = get().bots[botId];
      if (!bot) return { ok: false, error: 'Bot not found.' };
      if (bot.status !== 'active') return { ok: false, error: 'Bot must be active to execute.' };

      const config = bot.config as any;
      const coinId     = config.coinId     ?? 'bitcoin';
      const coinSymbol = config.coinSymbol ?? 'BTC';

      const execId = generateId();
      const fee    = calcBotFee(currentPrice * 0.01);
      const exec: BotExecution = {
        id:           execId,
        botId:        bot.id,
        userId:       bot.userId,
        templateType: bot.templateType,
        action:       'buy',
        coinId,
        coinSymbol,
        price:        currentPrice,
        amount:       0.01,
        total:        currentPrice * 0.01,
        fee,
        pnl:          null,
        pnlPct:       null,
        status:       'completed',
        errorMessage: null,
        cycleId:      generateId(),
        executedAt:   new Date().toISOString(),
      };

      get()._recordExecution(exec);
      get()._updateBotAfterExecution(bot.id, exec);

      return { ok: true, execution: exec };
    },

    // ── Queries ───────────────────────────────────────────────────────────────

    getUserBots: (userId, filters) => {
      const userBots = Object.values(get().bots).filter(b => b.userId === userId);
      if (!filters) return userBots.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return sortBots(applyBotFilters(userBots, filters), filters.sortBy);
    },

    getBot: (botId) => get().bots[botId] ?? null,

    getBotExecutions: (botId) => {
      return get().executions
        .filter(e => e.botId === botId)
        .slice(0, BOT_MAX_EXECUTIONS_PER_BOT);
    },

    getUserExecutions: (userId, limit = 100) => {
      return get().executions
        .filter(e => e.userId === userId)
        .slice(0, limit);
    },

    getGridState:       (botId) => get().gridStates[botId]  ?? null,
    getMartingaleState: (botId) => get().martStates[botId]  ?? null,
    getDcaState:        (botId) => get().dcaStates[botId]   ?? null,
    getArbState:        (botId) => get().arbStates[botId]   ?? null,
    getRebalancingState:(botId) => get().rebalStates[botId] ?? null,

    getUserBotStats: (userId) => {
      const userBots = Object.values(get().bots).filter(b => b.userId === userId);
      return {
        total:        userBots.length,
        active:       userBots.filter(b => b.status === 'active').length,
        paused:       userBots.filter(b => b.status === 'paused').length,
        stopped:      userBots.filter(b => b.status === 'stopped').length,
        error:        userBots.filter(b => b.status === 'error').length,
        totalProfit:  userBots.reduce((s, b) => s + b.totalProfit, 0),
        totalTrades:  userBots.reduce((s, b) => s + b.totalTrades, 0),
      };
    },

    // ── Internal helpers ──────────────────────────────────────────────────────

    _recordExecution: (exec) => {
      const next = [exec, ...get().executions];
      const trimmed = next.slice(0, BOT_MAX_TOTAL_EXECUTIONS);
      save(EXECUTIONS_KEY, trimmed);
      set({ executions: trimmed });
    },

    _updateBotAfterExecution: (botId, exec) => {
      const { bots } = get();
      const bot = bots[botId];
      if (!bot) return;

      const allExecs = get().getBotExecutions(botId);
      const metrics  = recomputeBotMetrics(bot, allExecs);

      const newValue  = (bot.totalInvested || 0) + (exec.action === 'buy' ? exec.total : 0) + bot.totalProfit;
      const newCurve  = appendEquityPoint(bot.equityCurve, newValue, BOT_MAX_EQUITY_POINTS);

      const now = new Date().toISOString();
      const updated: UserBot = {
        ...bot,
        ...metrics,
        equityCurve: newCurve,
        lastRunAt:   now,
        nextRunAt:   computeNextRunAt(bot.scheduleType, bot.scheduleValue, now),
        updatedAt:   now,
        consecutiveErrors: 0,
      };

      const newBots = { ...bots, [botId]: updated };
      save(BOTS_KEY, newBots);
      set({ bots: newBots });
    },

    _haltBotOnError: (botId, error) => {
      const { bots } = get();
      const bot = bots[botId];
      if (!bot) return;

      // ── Spec 8: classify the error and decide the action ─────────────────
      const consecutive = bot.consecutiveErrors + 1;
      const forceHalt   = consecutive >= BOT_MAX_CONSECUTIVE_ERRORS;

      const errorCode = forceHalt ? 'consecutive_errors' : classifyBotError(error);
      const resolved  = resolveBotError(errorCode, bot, error);

      // Determine new bot state
      let newStatus:     UserBot['status']     = bot.status;
      let newStopReason: UserBot['stopReason'] = bot.stopReason;

      if (forceHalt || resolved.action === 'error') {
        newStatus     = 'error';
        newStopReason = ((resolved.stopReason ?? 'error_threshold') as UserBot['stopReason']);
        useBotTemplateStore.getState().decrementActiveInstances(bot.templateId);
      } else if (resolved.action === 'stop') {
        newStatus     = 'stopped';
        newStopReason = resolved.stopReason as UserBot['stopReason'];
        useBotTemplateStore.getState().decrementActiveInstances(bot.templateId);
      } else if (resolved.action === 'pause') {
        newStatus     = 'paused';
        newStopReason = resolved.stopReason as UserBot['stopReason'];
        // ── Spec 8.2 / 8.5: schedule auto-resume ─────────────────────────
        if (resolved.autoResumeMs != null) {
          scheduleAutoResume(botId, resolved.autoResumeMs, () => {
            get().startBot(botId);
          });
        }
      }
      // 'continue' → keep current status, just log the error

      const updated: UserBot = {
        ...bot,
        consecutiveErrors: consecutive,
        lastError:         resolved.userMessage, // show friendly message in UI
        status:            newStatus,
        stopReason:        newStopReason,
        updatedAt:         new Date().toISOString(),
      };

      const newBots = { ...bots, [botId]: updated };
      save(BOTS_KEY, newBots);
      set({ bots: newBots });

      // Only notify on actual halts/pauses, not 'continue'
      if (resolved.action !== 'continue') {
        botNotify({
          type:    resolved.notifyType,
          title:   resolved.notifyTitle,
          message: resolved.notifyMessage,
        });
      }
    },

    // ── Per-type tick processors (internal) ───────────────────────────────────

    _processGridTick: (bot: UserBot, coinId: string, coinSymbol: string, price: number) => {
      // Spec 4.2: executeGridLogic()
      const config = bot.config as any;
      if (config.coinId !== coinId) return;

      // ── Risk check (spec 4.3) ─────────────────────────────────────────────
      const orderUsd = gridOrderSize(config);
      const riskResult = _riskCheck(bot, orderUsd);
      if (!riskResult.allowed) {
        get().stopBot(bot.id, 'max_loss_reached');
        botNotify({ type: 'liquidation', title: `🛑 ${bot.name} — Risk Limit`, message: riskResult.reason ?? 'Risk limit hit' });
        return;
      }

      // ── Bot-level stop-loss / take-profit ─────────────────────────────────
      if (config.stopLossPrice > 0 && price <= config.stopLossPrice) {
        get().stopBot(bot.id, 'user_stopped');
        botNotify({ type: 'liquidation', title: `🛑 ${bot.name} — Stop Loss`, message: `Grid stopped at SL ${config.stopLossPrice}` });
        return;
      }
      if (config.takeProfitPrice > 0 && price >= config.takeProfitPrice) {
        get().stopBot(bot.id, 'user_stopped');
        botNotify({ type: 'achievement', title: `🎯 ${bot.name} — Take Profit`, message: `Grid stopped at TP ${config.takeProfitPrice}` });
        return;
      }

      const gridState = get().gridStates[bot.id];
      if (!gridState) return;

      // ──────────────────────────────────────────────────────────────────────
      // Spec 4.2 EXACT GRID LOGIC:
      //
      //   const gridStep = (upperPrice - lowerPrice) / numberOfGrids;
      //
      //   for i in range(numberOfGrids):
      //     buyPrice = lowerPrice + gridStep * i
      //     if currentPrice <= buyPrice && !isLevelActive:
      //       if !lastTradeAt || now - lastTradeAt > reentryDelay * 60000:
      //         placeOrder({ type: 'buy', price: buyPrice, ... })
      //         sellPrice = buyPrice * (1 + takeProfitPercent/100)
      //         placeOrder({ type: 'sell', price: sellPrice, ... })
      //
      //   for sellOrder of activeSellLevels:
      //     if currentPrice >= sellOrder.price:
      //       executeOrder(sellOrder.id)
      // ──────────────────────────────────────────────────────────────────────

      const {
        lowerPrice,
        upperPrice,
        gridCount: numberOfGrids,
        takeProfitPct: takeProfitPercent = 1,
        reentryDelayMin: reentryDelay    = 5,
      } = config;

      // Spec: gridStep = (upperPrice - lowerPrice) / numberOfGrids
      const gridStep = (upperPrice - lowerPrice) / numberOfGrids;

      const now     = new Date().toISOString();
      const cycleId = generateId();
      const perGridUsd = orderUsd;

      // Track which levels need to be reopened for buys
      let stateChanged = false;
      const levels     = [...gridState.levels];

      // ── PHASE A: Check buy opportunities (spec: current <= buyPrice) ──────
      for (let i = 0; i < numberOfGrids; i++) {
        // Spec: buyPrice = lowerPrice + (gridStep * i)
        const buyPrice = Math.round((lowerPrice + gridStep * i) * 100) / 100;

        // Spec: isLevelActive check
        const levelIdx    = levels.findIndex(l => Math.abs(l.price - buyPrice) < 0.5);
        const level       = levelIdx >= 0 ? levels[levelIdx] : null;
        const isLevelActive = level?.side === 'buy' && level.filled;

        // Spec: if (currentPrice <= buyPrice && !isLevelActive)
        if (price > buyPrice) continue;
        if (isLevelActive) continue;

        // Spec: Check reentry delay — getLastTradeAtPrice(buyPrice)
        const lastTradeAt = level?.filledAt ? new Date(level.filledAt).getTime() : null;
        const reentryMs   = reentryDelay * 60_000;
        const reentryOk   = !lastTradeAt || (Date.now() - lastTradeAt) > reentryMs;
        if (!reentryOk) continue;

        // ── Spec: placeOrder({ type: 'buy', ... }) ────────────────────────
        const buyFee    = calcBotFee(perGridUsd);
        const buyAmount = perGridUsd / buyPrice;

        const buyExec: BotExecution = {
          id: generateId(), botId: bot.id, userId: bot.userId, templateType: 'grid',
          action:      'buy',
          coinId,       coinSymbol,
          price:        buyPrice,
          amount:       Math.round(buyAmount * 1e8) / 1e8,
          total:        perGridUsd,
          fee:          buyFee,
          pnl:          null, pnlPct: null,
          status:       'completed', errorMessage: null, cycleId, executedAt: now,
        };
        get()._recordExecution(buyExec);
        get()._updateBotAfterExecution(bot.id, buyExec);
        _updateDailyLoss(bot.id, 0); // buys don't log P&L
        _updateConsecLosses(bot.id, false); // neutral

        // Mark level as filled for buy
        if (levelIdx >= 0) {
          levels[levelIdx] = { ...levels[levelIdx], filled: true, filledAt: now };
          stateChanged = true;
        }

        // ── Spec: placeOrder({ type: 'sell', price: sellPrice, ... }) ────
        // sellPrice = buyPrice * (1 + takeProfitPercent / 100)
        const sellPrice = Math.round(buyPrice * (1 + takeProfitPercent / 100) * 100) / 100;

        // Add a pending sell level to the state (will execute when price rises)
        const sellLevelIdx = levels.findIndex(l => Math.abs(l.price - sellPrice) < 1);
        if (sellLevelIdx >= 0) {
          levels[sellLevelIdx] = {
            ...levels[sellLevelIdx],
            side:   'sell',
            filled: false,
            orderId: generateId(),
            filledAt: null,
          };
        } else {
          // Add dynamic sell level
          levels.push({
            index:    levels.length,
            price:    sellPrice,
            side:     'sell',
            filled:   false,
            orderId:  generateId(),
            filledAt: null,
          });
        }
        stateChanged = true;

        botNotify({
          type:    'trade',
          title:   `📊 ${bot.name} — Grid Buy`,
          message: `Bought ${buyAmount.toFixed(4)} ${coinSymbol} @ ${buyPrice.toLocaleString()}. Sell target: ${sellPrice.toLocaleString()}`,
        });
      }

      // ── PHASE B: Execute sell orders (spec: for sellOrder of activeSellLevels) ──
      for (let i = 0; i < levels.length; i++) {
        const level = levels[i];
        if (level.side !== 'sell' || level.filled) continue;

        // Spec: if (currentPrice >= sellOrder.price) { executeOrder(sellOrder.id) }
        if (price < level.price) continue;

        const sellFee    = calcBotFee(perGridUsd);
        const sellAmount = perGridUsd / level.price;
        // PnL = (sell - buy_implied) * amount - fees
        // buy_implied ≈ level.price / (1 + takeProfitPercent/100)
        const impliedBuy = Math.round(level.price / (1 + takeProfitPercent / 100) * 100) / 100;
        const grossPnl   = (level.price - impliedBuy) * sellAmount;
        const netPnl     = Math.round((grossPnl - sellFee - calcBotFee(impliedBuy * sellAmount)) * 100) / 100;
        const pnlPct     = Math.round((netPnl / (impliedBuy * sellAmount)) * 10_000) / 100;

        const sellExec: BotExecution = {
          id: generateId(), botId: bot.id, userId: bot.userId, templateType: 'grid',
          action:      'sell',
          coinId,       coinSymbol,
          price:        level.price,
          amount:       Math.round(sellAmount * 1e8) / 1e8,
          total:        perGridUsd,
          fee:          sellFee,
          pnl:          netPnl, pnlPct,
          status:       'completed', errorMessage: null, cycleId, executedAt: now,
        };
        get()._recordExecution(sellExec);
        get()._updateBotAfterExecution(bot.id, sellExec);

        // Spec: updateDailyLoss + updateConsecutiveLosses after each trade
        _updateDailyLoss(bot.id, netPnl);
        _updateConsecLosses(bot.id, netPnl > 0);

        // Mark sell level filled and reopen buy level at impliedBuy
        levels[i] = { ...level, filled: true, filledAt: now };
        stateChanged = true;

        botNotify({
          type:    'trade',
          title:   `📊 ${bot.name} — Grid Sell`,
          message: `Sold ${sellAmount.toFixed(4)} ${coinSymbol} @ ${level.price.toLocaleString()}. PnL: ${netPnl >= 0 ? '+' : ''}${netPnl.toFixed(2)}`,
        });
      }

      // Persist updated state
      if (stateChanged) {
        const updatedState = { ...gridState, levels, lastTickPrice: price, lastUpdatedAt: now };
        const newGridStates = { ...get().gridStates, [bot.id]: updatedState };
        save(GRID_STATE_KEY, newGridStates);
        set({ gridStates: newGridStates });
      } else {
        // Always update lastTickPrice
        const updatedState = { ...gridState, lastTickPrice: price };
        const newGridStates = { ...get().gridStates, [bot.id]: updatedState };
        save(GRID_STATE_KEY, newGridStates);
        set({ gridStates: newGridStates });
      }
    },

    _processMartingaleTick: (bot: UserBot, coinId: string, coinSymbol: string, price: number) => {
      const config = bot.config as MartingaleBotConfig;
      if (config.coinId !== coinId) return;

      const state = get().martStates[bot.id];
      if (!state) return;

      // ── Risk check (spec 4.3) ─────────────────────────────────────────────
      const tradeUsdPrecheck = martingaleCurrentTradeSize(config, state);
      if (!state.hasOpenTrade) {
        const riskResult = _riskCheck(bot, tradeUsdPrecheck);
        if (!riskResult.allowed) {
          get().stopBot(bot.id, 'max_loss_reached');
          botNotify({ type: 'liquidation', title: `🛑 ${bot.name} — Risk Limit`, message: riskResult.reason ?? 'Risk limit hit' });
          return;
        }
      }

      const cycleId = generateId();
      const now     = new Date().toISOString();

      // ── Phase A: Trade is open — check for TP (win) or loss signal ─────────
      if (state.hasOpenTrade) {
        const side = state.nextSide; // direction of the open trade
        const entryPrice = state.openEntryPrice;
        const tradeUsd   = state.openPositionUsd;
        const coinAmount = tradeUsd / entryPrice;

        // TP price: entry × (1 ± takeProfitPct%)
        const tpPrice = martingaleTpPrice(config, entryPrice, side);

        const tpHit   = side === 'long' ? price >= tpPrice  : price <= tpPrice;

        // Loss signal: price moved AGAINST the trade by takeProfitPct %
        // (symmetric reversal = same % as TP but in wrong direction)
        const lossPrice = side === 'long'
          ? entryPrice * (1 - config.takeProfitPct / 100)
          : entryPrice * (1 + config.takeProfitPct / 100);
        const lossHit = side === 'long' ? price <= lossPrice : price >= lossPrice;

        // ── WIN: take profit ──────────────────────────────────────────────────
        if (tpHit) {
          const sellValue = price * coinAmount;
          const buyValue  = entryPrice * coinAmount;
          const buyFee    = calcBotFee(buyValue);
          const sellFee   = calcBotFee(sellValue);
          const grossPnl  = side === 'long' ? sellValue - buyValue : buyValue - sellValue;
          const netPnl    = Math.round((grossPnl - buyFee - sellFee) * 100) / 100;
          const pnlPct    = Math.round((netPnl / buyValue) * 10_000) / 100;

          // Record sell trade
          const exec: BotExecution = {
            id: generateId(), botId: bot.id, userId: bot.userId, templateType: 'martingale',
            action: 'sell', coinId, coinSymbol, price,
            amount: Math.round(coinAmount * 1e8) / 1e8,
            total:  Math.round(sellValue * 100) / 100,
            fee:    sellFee,
            pnl:    netPnl, pnlPct,
            status: 'completed', errorMessage: null, cycleId, executedAt: now,
          };
          get()._recordExecution(exec);
          get()._updateBotAfterExecution(bot.id, exec);

          // Spec: onTradeResult({ isWin: true }) → reset multiplier + consecutive losses
          const nextSide = martingaleNextSide(config, state, true);
          const reset: MartingaleState = {
            ...resetMartingaleState(bot.id, nextSide),
            // "both" alternation: the next trade uses the flipped side
            nextSide,
          };
          const newMartStates = { ...get().martStates, [bot.id]: reset };
          save(MART_STATE_KEY, newMartStates);
          set({ martStates: newMartStates });

          // Spec 4.3: updateDailyLoss + updateConsecutiveLosses after win
          _updateDailyLoss(bot.id, netPnl);
          _updateConsecLosses(bot.id, true); // win

          botNotify({
            type:    'trade',
            title:   `✅ ${bot.name} — Win!`,
            message: `TP at ${price.toLocaleString()}. PnL: ${netPnl >= 0 ? '+' : ''}${netPnl.toFixed(2)}. Multiplier reset to 1×.`,
          });
          return;
        }

        // ── LOSS: price hit loss level ──────────────────────────────────────
        if (lossHit) {
          const closeValue = price * coinAmount;
          const buyValue   = entryPrice * coinAmount;
          const buyFee     = calcBotFee(buyValue);
          const closeFee   = calcBotFee(closeValue);
          const grossPnl   = side === 'long' ? closeValue - buyValue : buyValue - closeValue;
          const netPnl     = Math.round((grossPnl - buyFee - closeFee) * 100) / 100;
          const pnlPct     = Math.round((netPnl / buyValue) * 10_000) / 100;

          // Record the losing close
          const lossExec: BotExecution = {
            id: generateId(), botId: bot.id, userId: bot.userId, templateType: 'martingale',
            action: 'sell', coinId, coinSymbol, price,
            amount: Math.round(coinAmount * 1e8) / 1e8,
            total:  Math.round(closeValue * 100) / 100,
            fee:    closeFee, pnl: netPnl, pnlPct,
            status: 'completed', errorMessage: null, cycleId, executedAt: now,
          };
          get()._recordExecution(lossExec);
          get()._updateBotAfterExecution(bot.id, lossExec);

          // Spec: onTradeResult({ isWin: false }) → consecutiveLosses++ → check limit
          const newConsecutive = state.consecutiveLosses + 1;
          if (newConsecutive >= config.maxConsecutiveLosses) {
            // Spec: stopBot("Max losses reached")
            get().stopBot(bot.id, 'max_loss_reached');
            botNotify({
              type:    'liquidation',
              title:   `🛑 ${bot.name} — Max Losses Reached`,
              message: `Bot stopped after ${newConsecutive} consecutive losses. Final loss: ${Math.abs(netPnl).toFixed(2)}.`,
            });
            return;
          }

          // Spec: currentMultiplier *= multiplier → place new trade at larger size
          const newMultiplier = Math.round(state.currentMultiplier * config.multiplier * 1000) / 1000;
          const newSide = martingaleNextSide(config, state, false); // keep same side on loss

          const nextState: MartingaleState = {
            ...state,
            consecutiveLosses: newConsecutive,
            currentMultiplier: newMultiplier,
            nextSide:          newSide,
            hasOpenTrade:      false,   // will re-open immediately below in Phase B
            openEntryPrice:    0,
            openPositionUsd:   0,
            lastUpdatedAt:     now,
          };
          const newMartStates = { ...get().martStates, [bot.id]: nextState };
          save(MART_STATE_KEY, newMartStates);
          set({ martStates: newMartStates });

          // Spec 4.3: updateDailyLoss + updateConsecutiveLosses after loss
          _updateDailyLoss(bot.id, netPnl);
          _updateConsecLosses(bot.id, false); // loss

          botNotify({
            type:    'trade',
            title:   `⚠️ ${bot.name} — Loss #${newConsecutive}`,
            message: `Next trade size: ${Math.round(config.baseAmount * newMultiplier * 100) / 100} (${newMultiplier.toFixed(2)}×). ${config.maxConsecutiveLosses - newConsecutive} left before stop.`,
          });

          // Fall through to Phase B — immediately open the next (bigger) trade
        } else {
          // Trade still open, price not at TP or loss level — nothing to do
          return;
        }
      }

      // ── Phase B: No open trade — enter a new trade at current price ─────────
      const freshState = get().martStates[bot.id]; // re-read after potential loss update
      if (!freshState || freshState.hasOpenTrade) return;

      // Spec: newAmount = baseAmount × currentMultiplier
      const tradeUsd   = martingaleCurrentTradeSize(config, freshState);
      const tradeSide  = freshState.nextSide;
      const buyFee     = calcBotFee(tradeUsd);
      const coinAmount = tradeUsd / price;

      const entryExec: BotExecution = {
        id: generateId(), botId: bot.id, userId: bot.userId, templateType: 'martingale',
        action: 'buy', coinId, coinSymbol, price,
        amount: Math.round(coinAmount * 1e8) / 1e8,
        total:  tradeUsd,
        fee:    buyFee,
        pnl: null, pnlPct: null,
        status: 'completed', errorMessage: null, cycleId, executedAt: now,
      };
      get()._recordExecution(entryExec);

      // Update state to "open trade" — waiting for TP or loss
      const openState: MartingaleState = {
        ...freshState,
        hasOpenTrade:    true,
        openEntryPrice:  price,
        openPositionUsd: tradeUsd,
        lastOrderPrice:  price,
        takeProfitPrice: martingaleTpPrice(config, price, tradeSide),
        baseOrderFilled: true,
        totalInvestedUsd: freshState.totalInvestedUsd + tradeUsd,
        lastUpdatedAt:   now,
      };
      const newMartStates2 = { ...get().martStates, [bot.id]: openState };
      save(MART_STATE_KEY, newMartStates2);
      set({ martStates: newMartStates2 });

      get()._updateBotAfterExecution(bot.id, entryExec);
    },

    _processDcaTick: (bot: UserBot, coinId: string, coinSymbol: string, price: number) => {
      const config = bot.config as DcaBotConfig;
      if (config.coinId !== coinId) return;

      const state = get().dcaStates[bot.id];
      if (!state) return;

      // ── Risk check (spec 4.3) ─────────────────────────────────────────────
      const estimatedOrderUsd = dcaOrderAmount(config, state.ordersPlaced);
      const riskResult = _riskCheck(bot, estimatedOrderUsd);
      if (!riskResult.allowed) {
        get().stopBot(bot.id, 'max_loss_reached');
        botNotify({ type: 'liquidation', title: `🛑 ${bot.name} — Risk Limit`, message: riskResult.reason ?? 'Risk limit hit' });
        return;
      }

      const cycleId = generateId();
      const now     = new Date().toISOString();

      // ── PHASE A: No position open yet — place the first buy order ───────────
      if (state.ordersPlaced === 0) {
        // Spec: ordersPlaced = 1; totalInvestment = initialInvestment; averagePrice = entryPrice
        const usd    = config.initialInvestment;
        const fee    = calcBotFee(usd);
        const coins  = usd / price;

        const buyExec: BotExecution = {
          id: generateId(), botId: bot.id, userId: bot.userId, templateType: 'dca',
          action: 'buy', coinId, coinSymbol, price,
          amount: Math.round(coins * 1e8) / 1e8,
          total:  usd, fee,
          pnl: null, pnlPct: null,
          status: 'completed', errorMessage: null, cycleId, executedAt: now,
        };
        get()._recordExecution(buyExec);

        const newState = dcaApplyBuy(state, price, usd);
        const newDcaStates = { ...get().dcaStates, [bot.id]: newState };
        save(DCA_STATE_KEY, newDcaStates);
        set({ dcaStates: newDcaStates });

        get()._updateBotAfterExecution(bot.id, buyExec);

        botNotify({
          type:    'trade',
          title:   `📈 ${bot.name} — Order #1 Placed`,
          message: `Initial buy: ${usd} @ ${price.toLocaleString()}. ${config.numberOfOrders - 1} orders remaining.`,
        });
        return;
      }

      // ── PHASE B: Position open — check for price rise (TP) first ───────────
      if (state.averagePrice > 0) {
        const riseFromAvg = dcaPriceRise(state.averagePrice, price);

        // onPriceRise: if rise >= takeProfit → sell
        const holdingShares = state.partialExitDone
          ? state.remainingShares
          : state.totalShares;

        if (riseFromAvg >= config.takeProfitPct && holdingShares > 0) {
          if (config.partialExit && !state.partialExitDone) {
            // Spec: executeSell(currentPrice, totalShares / 2) — sell half, hold rest
            const halfShares = Math.round((holdingShares / 2) * 1e8) / 1e8;
            const sellValue  = halfShares * price;
            const sellFee    = calcBotFee(sellValue);
            const costBasis  = halfShares * state.averagePrice;
            const grossPnl   = sellValue - costBasis;
            const netPnl     = Math.round((grossPnl - sellFee) * 100) / 100;
            const pnlPct     = Math.round((netPnl / costBasis) * 10_000) / 100;

            const sellExec: BotExecution = {
              id: generateId(), botId: bot.id, userId: bot.userId, templateType: 'dca',
              action: 'sell', coinId, coinSymbol, price,
              amount: halfShares,
              total:  Math.round(sellValue * 100) / 100,
              fee:    sellFee, pnl: netPnl, pnlPct,
              status: 'completed', errorMessage: null, cycleId, executedAt: now,
            };
            get()._recordExecution(sellExec);

            const afterPartial = dcaApplyPartialExit(state, price);
            const newDcaStates = { ...get().dcaStates, [bot.id]: afterPartial };
            save(DCA_STATE_KEY, newDcaStates);
            set({ dcaStates: newDcaStates });

            get()._updateBotAfterExecution(bot.id, sellExec);

            botNotify({
              type:    'trade',
              title:   `💰 ${bot.name} — Partial Exit`,
              message: `Sold 50% at ${price.toLocaleString()} (+${riseFromAvg.toFixed(2)}% above avg). Holding rest.`,
            });
          } else {
            // Spec: executeSell(currentPrice, totalShares) → sell all → stopBot
            const sellValue = holdingShares * price;
            const sellFee   = calcBotFee(sellValue);
            const costBasis = holdingShares * state.averagePrice;
            const grossPnl  = sellValue - costBasis;
            const netPnl    = Math.round((grossPnl - sellFee) * 100) / 100;
            const pnlPct    = Math.round((netPnl / costBasis) * 10_000) / 100;

            const sellExec: BotExecution = {
              id: generateId(), botId: bot.id, userId: bot.userId, templateType: 'dca',
              action: 'sell', coinId, coinSymbol, price,
              amount: holdingShares,
              total:  Math.round(sellValue * 100) / 100,
              fee:    sellFee, pnl: netPnl, pnlPct,
              status: 'completed', errorMessage: null, cycleId, executedAt: now,
            };
            get()._recordExecution(sellExec);
            get()._updateBotAfterExecution(bot.id, sellExec);

            // Spec: stopBot("Take profit target reached")
            get().stopBot(bot.id, 'user_stopped');

            botNotify({
              type:    'achievement',
              title:   `🎯 ${bot.name} — Take Profit!`,
              message: `Sold all ${holdingShares.toFixed(4)} ${coinSymbol} @ ${price.toLocaleString()}. PnL: +${netPnl.toFixed(2)}. Bot stopped.`,
            });
          }
          return; // TP handled — don't buy more on the same tick
        }
      }

      // ── PHASE C: Check for price drop → trigger next buy order ─────────────
      if (state.ordersPlaced >= config.numberOfOrders) return; // all orders used

      const dropFromLastBuy = dcaPriceDrop(state.lastBuyPrice, price);

      // Spec: if (percentageDrop >= priceDropThreshold && ordersPlaced < numberOfOrders)
      if (dropFromLastBuy >= config.priceDropPct) {
        // Spec: additionalAmount = initialInvestment / ordersPlaced
        const usd   = dcaOrderAmount(config, state.ordersPlaced);
        const fee   = calcBotFee(usd);
        const coins = usd / price;

        const buyExec: BotExecution = {
          id: generateId(), botId: bot.id, userId: bot.userId, templateType: 'dca',
          action: 'buy', coinId, coinSymbol, price,
          amount: Math.round(coins * 1e8) / 1e8,
          total:  usd, fee,
          pnl: null, pnlPct: null,
          status: 'completed', errorMessage: null, cycleId, executedAt: now,
        };
        get()._recordExecution(buyExec);

        const newState = dcaApplyBuy(state, price, usd);
        const newDcaStates = { ...get().dcaStates, [bot.id]: newState };
        save(DCA_STATE_KEY, newDcaStates);
        set({ dcaStates: newDcaStates });

        get()._updateBotAfterExecution(bot.id, buyExec);

        botNotify({
          type:    'trade',
          title:   `📉 ${bot.name} — Order #${newState.ordersPlaced} Placed`,
          message: `Bought ${usd.toFixed(2)} @ ${price.toLocaleString()} (−${dropFromLastBuy.toFixed(2)}%). Avg: ${newState.averagePrice.toLocaleString()}. ${config.numberOfOrders - newState.ordersPlaced} orders left.`,
        });
      }
    },

    _processArbitrageTick: (bot: UserBot, coinId: string, coinSymbol: string, price: number) => {
      const config = bot.config as ArbitrageBotConfig;

      // Check if this coinId is in the monitored pairs
      const relevantPair = config.monitoredPairs?.find(p => p.coinId === coinId);
      if (!relevantPair) return;

      const state = get().arbStates[bot.id];
      if (!state) return;

      // ── Risk check (spec 4.3) ─────────────────────────────────────────────
      const maxPos = (config as any).maxPositionSize ?? config.maxPositionUsd ?? 1_000;
      const riskResult = _riskCheck(bot, maxPos);
      if (!riskResult.allowed) {
        get().stopBot(bot.id, 'max_loss_reached');
        botNotify({ type: 'liquidation', title: `🛑 ${bot.name} — Risk Limit`, message: riskResult.reason ?? 'Risk limit hit' });
        return;
      }

      // Spec: scan runs on the configured interval
      if (!isArbScanDue(state, config.scanIntervalSec ?? 10)) return;

      const now      = new Date().toISOString();
      const cycleId  = generateId();

      // Build a minimal priceMap with the current coin price
      // (other pairs get picked up in subsequent ticks as their prices arrive)
      const priceMap: Record<string, number> = {};
      for (const p of config.monitoredPairs) {
        // Use current price for the matching pair; approximate others from store
        if (p.coinId === coinId) {
          priceMap[p.coinId] = price;
        } else {
          // Try to pull last known price from a global price cache
          // For demo: derive a plausible price using the ratio stored in our arb state
          const cachedCycles = state.recentCycles.filter(c => c.coinId === p.coinId);
          if (cachedCycles.length > 0) {
            priceMap[p.coinId] = cachedCycles[0].buyPrice;
          }
        }
      }

      // Spec: const opportunities = []
      //       for (const pair of monitoredPairs) { ... }
      const scanCount    = state.totalCycles; // monotone counter for spread variety
      const opportunities = arbScanOpportunities(config, priceMap, scanCount);

      // Mark scan time regardless
      const afterScan: ArbitrageState = {
        ...state,
        lastScanAt:   now,
        lastScanOpps: opportunities,
        lastUpdatedAt: now,
      };
      const newArbStates0 = { ...get().arbStates, [bot.id]: afterScan };
      save(ARB_STATE_KEY, newArbStates0);
      set({ arbStates: newArbStates0 });

      if (opportunities.length === 0) return;

      // Spec: const best = opportunities.sort((a,b) => b.profitPercent - a.profitPercent)[0]
      const best = opportunities[0]; // already sorted descending

      // ── Spec: executeBuy(best.pair, best.buyPrice, maxPositionSize) ──────────
      const usd      = Math.min(config.maxPositionSize, best.profitAmount > 0 ? config.maxPositionSize : config.maxPositionSize);
      const buyFee   = calcBotFee(usd);
      const coinAmt  = usd / best.buyPrice;

      const buyExec: BotExecution = {
        id: generateId(), botId: bot.id, userId: bot.userId, templateType: 'arbitrage',
        action: 'buy', coinId: best.coinId, coinSymbol: best.symbol,
        price:  best.buyPrice,
        amount: Math.round(coinAmt * 1e8) / 1e8,
        total:  usd, fee: buyFee,
        pnl: null, pnlPct: null,
        status: 'completed', errorMessage: null, cycleId, executedAt: now,
      };

      // ── Spec: executeSell(best.pair, best.sellPrice, maxPositionSize) ─────────
      const sellValue   = coinAmt * best.sellPrice;
      const sellFee     = calcBotFee(sellValue);
      const grossProfit = sellValue - usd;
      const netProfit   = Math.round((grossProfit - buyFee - sellFee) * 100) / 100;
      const netPct      = Math.round((netProfit / usd) * 10_000) / 100;

      const sellExec: BotExecution = {
        id: generateId(), botId: bot.id, userId: bot.userId, templateType: 'arbitrage',
        action: 'sell', coinId: best.coinId, coinSymbol: best.symbol,
        price:  best.sellPrice,
        amount: Math.round(coinAmt * 1e8) / 1e8,
        total:  Math.round(sellValue * 100) / 100,
        fee:    sellFee,
        pnl:    netProfit, pnlPct: netPct,
        status: 'completed', errorMessage: null, cycleId, executedAt: now,
      };

      get()._recordExecution(buyExec);
      get()._recordExecution(sellExec);
      get()._updateBotAfterExecution(bot.id, buyExec);
      get()._updateBotAfterExecution(bot.id, sellExec);

      // ── Spec: logArbitrage(best) ──────────────────────────────────────────────
      const cycle: ArbitrageCycle = {
        id:            cycleId,
        pair:          best.pair,
        coinId:        best.coinId,
        symbol:        best.symbol,
        buyPrice:      best.buyPrice,
        sellPrice:     best.sellPrice,
        positionUsd:   usd,
        profitPercent: best.profitPercent,
        netProfitUsd:  netProfit,
        feesPaid:      Math.round((buyFee + sellFee) * 100) / 100,
        executedAt:    now,
      };

      const freshArb    = get().arbStates[bot.id];
      const updatedArb  = arbApplyCycle(freshArb, cycle);
      const newArbStates = { ...get().arbStates, [bot.id]: updatedArb };
      save(ARB_STATE_KEY, newArbStates);
      set({ arbStates: newArbStates });

      botNotify({
        type:    'trade',
        title:   `⚡ ${bot.name} — Arb Found`,
        message: `${best.pair}: buy ${best.buyPrice.toLocaleString()} → sell ${best.sellPrice.toLocaleString()}. Net: ${netProfit >= 0 ? '+' : ''}${netProfit.toFixed(2)} (${best.profitPercent.toFixed(3)}%).`,
      });
    },

    _processRebalancingTick: (bot: UserBot, coinId: string, coinSymbol: string, price: number) => {
      const config = bot.config as RebalancingBotConfig;
      const assets = config.assets ?? config.allocations ?? [];

      // Guard: only proceed if this coin is in the portfolio
      if (!assets.some(a => a.coinId === coinId)) return;

      const state = get().rebalStates[bot.id];
      if (!state) return;

      // ── PHASE A: Always update holdings with latest price (pure recalc) ──────
      const refreshedHoldings = rebalRefreshHoldings(state.holdings, coinId, price);
      const holdingsChanged   = JSON.stringify(refreshedHoldings) !== JSON.stringify(state.holdings);

      if (holdingsChanged) {
        const updatedState: RebalancingState = {
          ...state,
          holdings:     refreshedHoldings,
          lastUpdatedAt: new Date().toISOString(),
        };
        const newRebalStates0 = { ...get().rebalStates, [bot.id]: updatedState };
        save(REBAL_STATE_KEY, newRebalStates0);
        set({ rebalStates: newRebalStates0 });
      }

      // ── PHASE B: Check if rebalance interval has elapsed ─────────────────────
      // Spec: scheduleNextRebalance(rebalanceInterval)
      const freshState = get().rebalStates[bot.id];
      if (!isRebalanceDue(freshState)) return;

      // ── PHASE C: Build trade list — spec exact ────────────────────────────────
      // Spec:
      //   for (let i = 0; i < portfolio.length; i++) {
      //     const deviation = currentPercent - targetPercent
      //     if (Math.abs(deviation) > rebalanceThreshold) {
      //       if (deviation > 0): sellAmount = (deviation/100)*totalValue
      //       else:               buyAmount  = (-deviation/100)*totalValue
      //       if (amount >= minTradeSize): trades.push(...)
      //     }
      //   }
      const tradeList = rebalBuildTradeList(
        freshState.holdings,
        config.rebalanceThresholdPct  ?? config.driftThresholdPct ?? 5,
        config.minTradeSizeUsd ?? 50,
      );

      if (tradeList.length === 0) {
        // No trades needed — just push the next check time
        const intervalHours  = config.rebalanceIntervalHours ?? 24;
        const nextRebalanceAt = new Date(Date.now() + intervalHours * 3_600_000).toISOString();
        const noTradeState: RebalancingState = {
          ...freshState,
          nextRebalanceAt,
          nextCheckAt: nextRebalanceAt,
          lastUpdatedAt: new Date().toISOString(),
        };
        const newRebalStates1 = { ...get().rebalStates, [bot.id]: noTradeState };
        save(REBAL_STATE_KEY, newRebalStates1);
        set({ rebalStates: newRebalStates1 });
        return;
      }

      // ── PHASE D: Execute trades[] ─────────────────────────────────────────────
      // Spec: for (const trade of trades) { await executeTrade(trade); }
      const now         = new Date().toISOString();
      const cycleId     = generateId();
      const executedTrades: RebalancingTrade[] = [];
      let   updatedHoldings = [...freshState.holdings];
      let   totalFeesUsd    = 0;

      for (const t of tradeList) {
        // Price for this coin: use current tick price if it matches, else estimate from holdings
        const tradePrice = t.coinId === coinId
          ? price
          : (() => {
              const h = updatedHoldings.find(h => h.coinId === t.coinId);
              return h && h.coinAmount > 0 ? Math.round(h.currentValue / h.coinAmount * 100) / 100 : price;
            })();

        const fee      = calcBotFee(t.amountUsd);
        const coinAmt  = t.amountUsd / tradePrice;
        totalFeesUsd  += fee;

        // Compute P&L for sells (simplified: +2.5% avg gain vs target allocation)
        const pnlVal   = t.action === 'sell'
          ? Math.round((t.amountUsd * 0.025 - fee) * 100) / 100
          : null;
        const pnlPct   = pnlVal !== null
          ? Math.round((pnlVal / t.amountUsd) * 10_000) / 100
          : null;

        const exec: BotExecution = {
          id:           generateId(),
          botId:        bot.id,
          userId:       bot.userId,
          templateType: 'rebalancing',
          action:       t.action,
          coinId:       t.coinId,
          coinSymbol:   t.coinSymbol,
          price:        tradePrice,
          amount:       Math.round(coinAmt * 1e8) / 1e8,
          total:        t.amountUsd,
          fee,
          pnl:          pnlVal,
          pnlPct,
          status:       'completed',
          errorMessage: null,
          cycleId,
          executedAt:   now,
        };

        get()._recordExecution(exec);
        get()._updateBotAfterExecution(bot.id, exec);

        // Update coin amounts in holdings after trade
        updatedHoldings = updatedHoldings.map(h => {
          if (h.coinId !== t.coinId) return h;
          const deltaCoins = t.action === 'buy' ? coinAmt : -coinAmt;
          const newCoinAmt = Math.max(0, h.coinAmount + deltaCoins);
          return {
            ...h,
            coinAmount:   Math.round(newCoinAmt * 1e8) / 1e8,
            currentValue: Math.round(newCoinAmt * tradePrice * 100) / 100,
          };
        });

        executedTrades.push({
          coinId:     t.coinId,
          coinSymbol: t.coinSymbol,
          action:     t.action,
          amountUsd:  t.amountUsd,
          price:      tradePrice,
          pnl:        pnlVal,
          executedAt: now,
        });
      }

      // Recompute currentPct after all trades
      const totalValueAfter = updatedHoldings.reduce((s, h) => s + h.currentValue, 0);
      updatedHoldings = updatedHoldings.map(h => ({
        ...h,
        currentPct: Math.round((h.currentValue / totalValueAfter) * 10_000) / 100,
        driftPct:   Math.round(((h.currentValue / totalValueAfter) * 100 - h.targetPct) * 100) / 100,
      }));

      // Build cycle snapshot
      const cycle: RebalanceCycle = {
        id:          cycleId,
        executedAt:  now,
        totalValue:  Math.round(totalValueAfter * 100) / 100,
        tradesCount: executedTrades.length,
        trades:      executedTrades,
        totalFeesUsd: Math.round(totalFeesUsd * 100) / 100,
        snapshotAfter: updatedHoldings.map(h => ({ coinSymbol: h.coinSymbol, pct: h.currentPct })),
      };

      // Spec: scheduleNextRebalance(rebalanceInterval)
      const intervalHours = config.rebalanceIntervalHours ?? 24;
      const afterState    = rebalApplyCycle(freshState, cycle, updatedHoldings, intervalHours);
      const newRebalStates2 = { ...get().rebalStates, [bot.id]: afterState };
      save(REBAL_STATE_KEY, newRebalStates2);
      set({ rebalStates: newRebalStates2 });

      const drifters = freshState.holdings.filter(h => Math.abs(h.driftPct) > (config.rebalanceThresholdPct ?? 5));
      botNotify({
        type:    'trade',
        title:   `⚖️ ${bot.name} — Rebalanced`,
        message: `${executedTrades.length} trade${executedTrades.length !== 1 ? 's' : ''} executed (${drifters.map(h => h.coinSymbol).join(', ')} drifted). Fees: ${totalFeesUsd.toFixed(2)}. Next check in ${intervalHours}h.`,
      });
    },
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// BOOT: register store ref with BotEngine so it can call back without circular
// ─────────────────────────────────────────────────────────────────────────────

registerEngineStoreRef(() => useBotStore.getState());
