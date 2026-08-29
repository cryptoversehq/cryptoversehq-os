/**
 * strategyStore.ts
 *
 * Single source of truth for the CryptoVerse HQ Strategy Marketplace.
 *
 * Manages three tables:
 *   - strategies       (the marketplace catalogue)
 *   - strategyPurchases (who owns what)
 *   - strategyRatings  (reviews and star ratings)
 *
 * Also maintains an in-memory cache of BacktestResults keyed by strategyId.
 *
 * Persistence:
 *   - All three tables are written to localStorage under `cryptoverse_*` keys
 *   - Seed data populates an empty store on first load (deterministic)
 *
 * Currency:
 *   - All CP coin movements are delegated to cpCoinsStore (no duplication)
 *   - strategyStore calls cpCoinsStore.transfer() during purchase
 */

import { create } from 'zustand';
import { cloudRecordStore } from './cloudData';
import {
  Strategy,
  StrategyPurchase,
  StrategyRating,
  BacktestResult,
  PurchaseResult,
  RatingResult,
  StrategyFilters,
  StrategyPage,
  StrategyDetail,
  StrategyCreatorView,
  DEFAULT_STRATEGY_FILTERS,
  MIN_PUBLISH_WIN_RATE,
  MAX_PUBLISH_DRAWDOWN,
  ABUSE_KEYWORDS,
} from './strategyTypes';
import {
  generateId,
  validateStrategy,
  validateRating,
  checkPurchaseEligibility,
  computeWeightedRating,
  applyBacktestMetrics,
  generateSimulatedBacktest,
  paginateStrategies,
  computeSaleSplit,
} from './strategyUtils';
import { useCpCoinsStore } from './cpCoinsStore';
import { useMonetizationStore } from './monetizationStore';

// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENCE KEYS
// ─────────────────────────────────────────────────────────────────────────────

const STRATEGIES_KEY  = 'cryptoverse_strategies_v1';
const PURCHASES_KEY   = 'cryptoverse_strategy_purchases_v1';
const RATINGS_KEY     = 'cryptoverse_strategy_ratings_v1';
const NOTIFS_KEY      = 'cryptoverse_mkt_notifications_v1';
const FLAGS_KEY       = 'cryptoverse_mkt_flags_v1';
const _inFlightPurchases = new Set<string>();

function load<T>(key: string, fallback: T): T {
  return cloudRecordStore.get<T>('marketplace', key, fallback);
}
function save(key: string, data: unknown) {
  cloudRecordStore.set('marketplace', key, data);
}

// ─────────────────────────────────────────────────────────────────────────────
// STATE INTERFACE
// ─────────────────────────────────────────────────────────────────────────────

export interface MarketplaceNotification {
  id:          string;
  type:        'strategy_published' | 'strategy_rejected' | 'strategy_pending' | 'strategy_purchased' | 'strategy_sold' | 'strategy_flagged';
  userId:      string;   // recipient
  strategyId:  string;
  message:     string;
  createdAt:   string;
  read:        boolean;
}

export interface FlaggedStrategy {
  strategyId: string;
  flaggedAt:  string;
  reason:     string;        // e.g. "1-star abuse: 'scam'"
  flaggedByUserId: string;
  resolved:   boolean;
}

export interface StrategyState {
  strategies:      Record<string, Strategy>;
  purchases:       Record<string, StrategyPurchase>;
  ratings:         Record<string, StrategyRating>;
  backtestResults: Record<string, BacktestResult>;

  /** Abuse flags raised by the system; reviewed by admins */
  flaggedStrategies: FlaggedStrategy[];

  /** In-app notifications for creators and buyers */
  notifications: MarketplaceNotification[];

  // ── Strategy CRUD ────────────────────────────────────────────────────────

  /**
   * Creates a new strategy draft owned by the given user.
   * Generates simulated backtest metrics immediately.
   * Returns the new Strategy object.
   */
  createStrategy: (params: {
    creatorId:        string;
    creatorName:      string;
    creatorAvatarSeed: string;
    name:             string;
    description:      string;
    shortDescription: string;
    type:             Strategy['type'];
    price:            number;
    tags:             string[];
    requiredLevel:    number;
    requiredPlan:     Strategy['requiredPlan'];
    requiresKyc:      boolean;
    code:             string;
    paramDocs:        string;
  }) => { ok: boolean; strategy?: Strategy; errors?: string[] };

  /**
   * Updates editable fields of an existing strategy.
   * Only the creator (or admin) may update.
   * Increments version and resets status to 'draft'.
   */
  updateStrategy: (
    strategyId: string,
    requestorId: string,
    patch: Partial<Pick<Strategy,
      | 'name' | 'description' | 'shortDescription'
      | 'type' | 'price' | 'tags' | 'requiredLevel'
      | 'requiredPlan' | 'requiresKyc' | 'code' | 'paramDocs'
    >>,
    isAdmin?: boolean,
  ) => { ok: boolean; strategy?: Strategy; errors?: string[] };

  /**
   * Submits a draft strategy for admin review.
   * Changes status from 'draft' to 'pending'.
   */
  submitForReview: (strategyId: string, creatorId: string) => { ok: boolean; error?: string };

  /** Deletes a strategy. Only creator or admin may delete. */
  deleteStrategy: (strategyId: string, requestorId: string, isAdmin?: boolean) => { ok: boolean; error?: string };

  // ── Purchase flow ─────────────────────────────────────────────────────────

  /**
   * Purchases a strategy for the given user.
   * Validates eligibility, deducts CP coins, credits creator, records purchase.
   */
  purchaseStrategy: (params: {
    strategyId:      string;
    buyerId:         string;
    buyerName:       string;
    userCpCoins:     number;
    userLevel:       number;
    userPlan:        'bronze' | 'silver' | 'gold';
    userKycVerified: boolean;
  }) => PurchaseResult;

  /**
   * Processes a refund for a strategy purchase.
   * Returns CP coins to buyer, debits creator (if balance allows).
   * Admin-only operation.
   */
  refundPurchase: (
    purchaseId: string,
    adminId:    string,
    reason:     string,
  ) => { ok: boolean; error?: string };

  // ── Ratings ───────────────────────────────────────────────────────────────

  /**
   * Submits or updates a rating for a strategy.
   * User must have an active purchase to rate.
   */
  submitRating: (params: {
    strategyId: string;
    userId:     string;
    userName:   string;
    userAvatarSeed: string;
    rating:     number;
    review:     string;
  }) => RatingResult;

  /** Deletes a rating. User may delete their own; admin may delete any. */
  deleteRating: (ratingId: string, requestorId: string, isAdmin?: boolean) => { ok: boolean; error?: string };

  // ── Backtest ───────────────────────────────────────────────────────────────

  /** Runs (or re-runs) the simulated backtest for a strategy and persists the result. */
  runBacktest: (strategyId: string) => BacktestResult | null;

  // ── Queries ───────────────────────────────────────────────────────────────

  /** Returns the paginated marketplace listing. Only approved strategies. */
  getMarketplacePage: (filters: StrategyFilters, page: number, pageSize?: number) => StrategyPage;

  /** Returns all strategies created by a specific user. */
  getCreatorStrategies: (creatorId: string) => Strategy[];

  /** Returns a detailed view for a single strategy. */
  getStrategyDetail: (strategyId: string, requestorUserId: string) => StrategyDetail | null;

  /** Returns the creator dashboard view for a specific strategy. */
  getCreatorView: (strategyId: string, creatorId: string) => StrategyCreatorView | null;

  /** Returns all purchases for a user (newest first). */
  getUserPurchases: (userId: string) => StrategyPurchase[];

  /** Returns all ratings for a strategy (newest first). */
  getStrategyRatings: (strategyId: string) => StrategyRating[];

  /** Returns a user's rating for a specific strategy, or null. */
  getUserRating: (strategyId: string, userId: string) => StrategyRating | null;

  /** Checks if a user owns a strategy (active purchase). */
  userOwnsStrategy: (strategyId: string, userId: string) => boolean;

  /** Returns all strategies pending admin approval. */
  getPendingStrategies: () => Strategy[];

  // ── Notifications ─────────────────────────────────────────────────────────

  /** Returns all unread marketplace notifications for a user. */
  getNotifications: (userId: string) => MarketplaceNotification[];

  /** Marks a notification as read. */
  markNotificationRead: (notificationId: string) => void;

  // ── Flagging ──────────────────────────────────────────────────────────────

  /** Returns all unresolved flagged strategies (admin use). */
  getFlaggedStrategies: () => FlaggedStrategy[];

  /** Resolves a flag (admin use). */
  resolveFlag: (strategyId: string, adminId: string) => void;

  // ── Internal ──────────────────────────────────────────────────────────────

  /** Rebuilds the average rating on a strategy from its ratings table. */
  _rebuildRating: (strategyId: string) => void;

  /** Internal: adds an in-app notification. */
  _notify: (params: Omit<MarketplaceNotification, 'id' | 'createdAt' | 'read'>) => void;

  /** Internal: raises an abuse flag on a strategy. */
  _flagStrategy: (strategyId: string, flaggedByUserId: string, reason: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// SEED DATA (realistic marketplace entries)
// ─────────────────────────────────────────────────────────────────────────────

function buildSeedStrategies(): Record<string, Strategy> {
  const now = new Date().toISOString();

  const seeds: Omit<Strategy, 'id' | 'createdAt' | 'updatedAt'>[] = [
    {
      creatorId:          'system_creator_1',
      creatorName:        'QuantEdge Pro',
      creatorAvatarSeed:  'QuantEdge',
      name:               'BTC Grid Master v2',
      description:        'A battle-tested grid trading strategy for Bitcoin that automatically places buy and sell orders at set intervals around the current price. Profits from volatility regardless of market direction. Includes dynamic grid spacing that adapts to ATR volatility.',
      shortDescription:   'Auto grid on BTC/USDT — profits from volatility in both directions.',
      type:               'grid',
      tags:               ['grid', 'btc', 'automated', 'low-risk'],
      price:              250,
      isFree:             false,
      verified:           true,
      requiredLevel:      2,
      requiredPlan:       'silver',
      requiresKyc:        false,
      winRate:            68.4,
      totalTrades:        312,
      totalProfit:        4_820.50,
      totalProfitPct:     48.21,
      maxDrawdown:        8.3,
      sharpeRatio:        1.94,
      avgTradeDuration:   145,
      backtestPeriodDays: 90,
      backtestStartCapital: 10_000,
      riskLevel:          'low',
      rating:             4.6,
      ratingCount:        87,
      favoriteCount:      234,
      code:               JSON.stringify({ strategy: 'grid', gridSpacing: 0.5, levels: 10, baseOrderSize: 100, useATR: true }),
      paramDocs:          '## Parameters\n- **gridSpacing**: % gap between grid levels (default 0.5%)\n- **levels**: Number of grid orders above/below entry (default 10)\n- **baseOrderSize**: USD per grid order\n- **useATR**: Adapt spacing to 14-period ATR',
      status:             'approved',
      isPublished:        true,
      isApproved:         true,
      version:            2,
      rejectionReason:    null,
      totalSales:         312,
      totalRevenue:       66_300,
      createdAt:          now,
      updatedAt:          now,
      publishedAt:        now,
      lastSoldAt:         now,
    },
    {
      creatorId:          'system_creator_2',
      creatorName:        'AlgoWave Signals',
      creatorAvatarSeed:  'AlgoWave',
      name:               'ETH DCA Accumulator',
      description:        'Dollar-cost averaging strategy for Ethereum. Buys a fixed USD amount of ETH at configurable intervals (daily, weekly). Includes a smart rebalancing feature that doubles the order size when ETH drops more than 5% from the last entry price.',
      shortDescription:   'Smart DCA for ETH with automatic dip-buying amplification.',
      type:               'dca',
      tags:               ['dca', 'eth', 'long-term', 'beginner-friendly'],
      price:              0,
      isFree:             true,
      requiredLevel:      0,
      requiredPlan:       'any',
      requiresKyc:        false,
      winRate:            72.1,
      totalTrades:        156,
      totalProfit:        2_340.00,
      totalProfitPct:     23.4,
      maxDrawdown:        14.2,
      sharpeRatio:        1.28,
      avgTradeDuration:   2_880,
      backtestPeriodDays: 180,
      backtestStartCapital: 10_000,
      riskLevel:          'medium',
      rating:             4.3,
      ratingCount:        214,
      favoriteCount:      891,
      code:               JSON.stringify({ strategy: 'dca', interval: 'daily', orderSize: 100, dipMultiplier: 2, dipThreshold: 5 }),
      paramDocs:          '## Parameters\n- **interval**: Buy frequency (daily/weekly)\n- **orderSize**: USD per buy order\n- **dipMultiplier**: Size multiplier on dips (default 2x)\n- **dipThreshold**: Dip % to trigger multiplier (default 5%)',
      status:             'approved',
      isPublished:        true,
      isApproved:         true,
      version:            1,
      rejectionReason:    null,
      totalSales:         1_048,
      totalRevenue:       0,
      createdAt:          now,
      updatedAt:          now,
      publishedAt:        now,
      lastSoldAt:         now,
    },
    {
      creatorId:          'system_creator_3',
      creatorName:        'RiskMatrix Labs',
      creatorAvatarSeed:  'RiskMatrix',
      name:               'Multi-Coin Arbitrage Scanner',
      description:        'Scans price discrepancies between BTC, ETH, and top 20 altcoins to identify arbitrage windows. Executes simultaneous long/short positions to capture the spread. Includes slippage and fee modelling for realistic results.',
      shortDescription:   'Exploits momentary price spreads across top 20 coins automatically.',
      type:               'arbitrage',
      tags:               ['arbitrage', 'multi-asset', 'advanced', 'high-frequency'],
      price:              750,
      isFree:             false,
      requiredLevel:      5,
      requiredPlan:       'gold',
      requiresKyc:        true,
      winRate:            81.3,
      totalTrades:        1_840,
      totalProfit:        9_120.00,
      totalProfitPct:     91.2,
      maxDrawdown:        4.1,
      sharpeRatio:        3.12,
      avgTradeDuration:   8,
      backtestPeriodDays: 90,
      backtestStartCapital: 10_000,
      riskLevel:          'low',
      rating:             4.8,
      ratingCount:        42,
      favoriteCount:      178,
      code:               JSON.stringify({ strategy: 'arbitrage', pairs: ['BTC/USDT', 'ETH/USDT'], minSpreadPct: 0.15, maxPositionPct: 10 }),
      paramDocs:          '## Parameters\n- **pairs**: Asset pairs to monitor\n- **minSpreadPct**: Minimum spread to enter (default 0.15%)\n- **maxPositionPct**: Max portfolio % per arb trade',
      status:             'approved',
      isPublished:        true,
      isApproved:         true,
      version:            1,
      rejectionReason:    null,
      totalSales:         56,
      totalRevenue:       35_700,
      createdAt:          now,
      updatedAt:          now,
      publishedAt:        now,
      lastSoldAt:         now,
    },
    {
      creatorId:          'system_creator_4',
      creatorName:        'MomentumAI',
      creatorAvatarSeed:  'MomentumAI',
      name:               'Trend Rider Pro',
      description:        'Momentum-based strategy using a combination of EMA crossovers, RSI confirmation, and MACD divergence to capture medium-term trends. Trades BTC and ETH on 4-hour candles. Automatically sizes positions based on ATR to keep risk consistent.',
      shortDescription:   'EMA + RSI + MACD trend strategy with dynamic position sizing.',
      type:               'custom',
      tags:               ['trend-following', 'momentum', 'btc', 'eth', 'swing'],
      price:              400,
      isFree:             false,
      requiredLevel:      3,
      requiredPlan:       'silver',
      requiresKyc:        false,
      winRate:            61.8,
      totalTrades:        204,
      totalProfit:        6_340.00,
      totalProfitPct:     63.4,
      maxDrawdown:        18.7,
      sharpeRatio:        1.54,
      avgTradeDuration:   720,
      backtestPeriodDays: 120,
      backtestStartCapital: 10_000,
      riskLevel:          'medium',
      rating:             4.4,
      ratingCount:        61,
      favoriteCount:      312,
      code:               JSON.stringify({ strategy: 'custom', emaFast: 12, emaSlow: 26, rsiPeriod: 14, macdSignal: 9, riskPerTrade: 2 }),
      paramDocs:          '## Parameters\n- **emaFast / emaSlow**: EMA lengths (default 12/26)\n- **rsiPeriod**: RSI lookback (default 14)\n- **macdSignal**: MACD signal line (default 9)\n- **riskPerTrade**: % of capital risked per trade',
      status:             'approved',
      isPublished:        true,
      isApproved:         true,
      version:            1,
      rejectionReason:    null,
      totalSales:         148,
      totalRevenue:       50_320,
      createdAt:          now,
      updatedAt:          now,
      publishedAt:        now,
      lastSoldAt:         now,
    },
    {
      creatorId:          'system_creator_5',
      creatorName:        'CryptoVerse HQ Research',
      creatorAvatarSeed:  'CVResearch',
      name:               'Safe Martingale — Limited Edition',
      description:        'A conservative variant of the martingale strategy that caps the multiplier at 3x (instead of 2x infinite) and enforces a hard stop-loss after 4 consecutive losses to prevent catastrophic drawdown. Best suited for ranging markets.',
      shortDescription:   'Capped martingale with hard stop-loss — safer than classic variants.',
      type:               'martingale',
      tags:               ['martingale', 'high-reward', 'advanced', 'range'],
      price:              500,
      isFree:             false,
      requiredLevel:      4,
      requiredPlan:       'gold',
      requiresKyc:        false,
      winRate:            55.2,
      totalTrades:        98,
      totalProfit:        3_890.00,
      totalProfitPct:     38.9,
      maxDrawdown:        31.4,
      sharpeRatio:        0.87,
      avgTradeDuration:   240,
      backtestPeriodDays: 60,
      backtestStartCapital: 10_000,
      riskLevel:          'high',
      rating:             3.9,
      ratingCount:        28,
      favoriteCount:      95,
      code:               JSON.stringify({ strategy: 'martingale', maxMultiplier: 3, maxLosses: 4, baseOrderSize: 200 }),
      paramDocs:          '## Parameters\n- **maxMultiplier**: Cap on position size multiplier (default 3x)\n- **maxLosses**: Hard stop after N consecutive losses (default 4)\n- **baseOrderSize**: USD for the initial position',
      status:             'approved',
      isPublished:        true,
      isApproved:         true,
      version:            1,
      rejectionReason:    null,
      totalSales:         34,
      totalRevenue:       14_450,
      createdAt:          now,
      updatedAt:          now,
      publishedAt:        now,
      lastSoldAt:         now,
    },
  ];

  const record: Record<string, Strategy> = {};
  seeds.forEach(s => {
    const id = generateId();
    record[id] = { ...s, id, createdAt: now, updatedAt: now };
  });
  return record;
}

function buildSeedRatings(strategies: Record<string, Strategy>): Record<string, StrategyRating> {
  const now = new Date().toISOString();
  const ratings: Record<string, StrategyRating> = {};

  const reviewPool: Array<{ rating: number; review: string }> = [
    { rating: 5, review: 'Absolutely incredible strategy. Running it for 3 weeks now with consistent profits.' },
    { rating: 5, review: 'Best strategy I have purchased on this platform. Clear documentation and works as advertised.' },
    { rating: 4, review: 'Solid performer. Slightly higher drawdown in bear markets but overall very satisfied.' },
    { rating: 4, review: 'Great results so far. The param docs are excellent and easy to customise.' },
    { rating: 3, review: 'Decent strategy but requires more tuning than expected for my risk profile.' },
    { rating: 5, review: 'Exceeded expectations. The backtests were accurate to what I saw live.' },
    { rating: 4, review: 'Very good. Would love to see an ETH version as well.' },
    { rating: 3, review: 'Works well in trending markets but struggles in sideways action.' },
    { rating: 5, review: 'Creator is very responsive to questions. The strategy itself is a gem.' },
    { rating: 4, review: 'Profitable after the first month. Worth every CP coin.' },
  ];

  Object.values(strategies).forEach((strategy, si) => {
    const numRatings = Math.min(strategy.ratingCount, 6);
    for (let i = 0; i < numRatings; i++) {
      const pool = reviewPool[(si * 3 + i) % reviewPool.length];
      const id = generateId();
      ratings[id] = {
        id,
        strategyId:         strategy.id,
        userId:             `seed_user_${si}_${i}`,
        userName:           ['Alex T.', 'Maria K.', 'James W.', 'Priya S.', 'Lucas M.', 'Chen L.'][i % 6],
        userAvatarSeed:     ['Alex', 'Maria', 'James', 'Priya', 'Lucas', 'Chen'][i % 6],
        rating:             pool.rating,
        review:             pool.review,
        isVerifiedPurchase: true,
        isEdited:           false,
        createdAt:          now,
        updatedAt:          now,
      };
    }
  });

  return ratings;
}

// ─────────────────────────────────────────────────────────────────────────────
// STORE
// ─────────────────────────────────────────────────────────────────────────────

export const useStrategyStore = create<StrategyState>((set, get) => {
  // Hydrate
  let strategies: Record<string, Strategy>         = load(STRATEGIES_KEY, {});
  let purchases:  Record<string, StrategyPurchase> = load(PURCHASES_KEY, {});
  let ratings:    Record<string, StrategyRating>   = load(RATINGS_KEY, {});
  const notifications: MarketplaceNotification[]   = load(NOTIFS_KEY, []);
  const flaggedStrategies: FlaggedStrategy[]        = load(FLAGS_KEY, []);

  // Seed on first load
  if (Object.keys(strategies).length === 0) {
    strategies = buildSeedStrategies();
    ratings    = buildSeedRatings(strategies);
    save(STRATEGIES_KEY, strategies);
    save(RATINGS_KEY, ratings);
  }

  return {
    strategies,
    purchases,
    ratings,
    backtestResults: {},
    notifications,
    flaggedStrategies,

    // ── Strategy CRUD ─────────────────────────────────────────────────────────

    createStrategy: (params) => {
      const validation = validateStrategy({
        name:             params.name,
        shortDescription: params.shortDescription,
        description:      params.description,
        price:            params.price,
        tags:             params.tags,
        code:             params.code,
        requiredLevel:    params.requiredLevel,
      });

      if (!validation.valid) {
        return { ok: false, errors: validation.errors };
      }

      const id  = generateId();
      const now = new Date().toISOString();

      // Run simulated backtest immediately
      const backtest = generateSimulatedBacktest(id, params.name);
      const metrics  = applyBacktestMetrics(backtest);

      const strategy: Strategy = {
        id,
        creatorId:           params.creatorId,
        creatorName:         params.creatorName,
        creatorAvatarSeed:   params.creatorAvatarSeed,
        name:                params.name.trim(),
        description:         params.description.trim(),
        shortDescription:    params.shortDescription.trim(),
        type:                params.type,
        tags:                params.tags,
        price:               params.price,
        isFree:              params.price === 0,
        requiredLevel:       params.requiredLevel,
        requiredPlan:        params.requiredPlan,
        requiresKyc:         params.requiresKyc,
        code:                params.code,
        paramDocs:           params.paramDocs,
        status:              'draft',
        isPublished:         false,
        isApproved:          false,
        version:             1,
        rejectionReason:     null,
        rating:              0,
        ratingCount:         0,
        favoriteCount:       0,
        totalSales:          0,
        totalRevenue:        0,
        createdAt:           now,
        updatedAt:           now,
        publishedAt:         null,
        lastSoldAt:          null,
        ...metrics,
      };

      const newStrategies = { ...get().strategies, [id]: strategy };
      save(STRATEGIES_KEY, newStrategies);
      set({ strategies: newStrategies, backtestResults: { ...get().backtestResults, [id]: backtest } });

      return { ok: true, strategy };
    },

    updateStrategy: (strategyId, requestorId, patch, isAdmin = false) => {
      const { strategies } = get();
      const existing = strategies[strategyId];
      if (!existing) return { ok: false, errors: ['Strategy not found.'] };

      if (!isAdmin && existing.creatorId !== requestorId) {
        return { ok: false, errors: ['You do not have permission to edit this strategy.'] };
      }

      const merged = { ...existing, ...patch };
      const validation = validateStrategy(merged);
      if (!validation.valid) return { ok: false, errors: validation.errors };

      const updated: Strategy = {
        ...merged,
        isFree:    (patch.price !== undefined ? patch.price : existing.price) === 0,
        status:    isAdmin ? existing.status : 'draft',   // resets to draft on creator edit
        isPublished: isAdmin ? existing.isPublished : false,
        isApproved:  isAdmin ? existing.isApproved : false,
        version:   existing.version + 1,
        updatedAt: new Date().toISOString(),
      };

      const newStrategies = { ...strategies, [strategyId]: updated };
      save(STRATEGIES_KEY, newStrategies);
      set({ strategies: newStrategies });

      return { ok: true, strategy: updated };
    },

    submitForReview: (strategyId, creatorId) => {
      const { strategies, backtestResults } = get();
      const existing = strategies[strategyId];
      if (!existing) return { ok: false, error: 'Strategy not found.' };
      if (existing.creatorId !== creatorId) return { ok: false, error: 'Permission denied.' };
      if (existing.status === 'pending')  return { ok: false, error: 'Already pending review.' };
      if (existing.status === 'approved') return { ok: false, error: 'Already approved.' };

      // ── Step 1: Code must exist ───────────────────────────────────────────
      if (!existing.code?.trim()) {
        return { ok: false, error: 'Strategy code is required before submission.' };
      }

      // ── Step 2: Validate JSON code ────────────────────────────────────────
      try {
        JSON.parse(existing.code);
      } catch {
        return { ok: false, error: 'Strategy code must be valid JSON before submission.' };
      }

      // ── Step 3: Run or re-use backtest ────────────────────────────────────
      //    If no backtest result exists yet, generate one now.
      let btResult = backtestResults[strategyId];
      if (!btResult) {
        // Auto-run backtest (Step 2 of the publisher flow)
        btResult = get().runBacktest(strategyId)!;
      }

      // ── Step 4: Check minimum performance requirements ────────────────────
      if (btResult.winRate < MIN_PUBLISH_WIN_RATE) {
        return {
          ok: false,
          error: `Strategy must have at least ${MIN_PUBLISH_WIN_RATE}% win rate to be published. ` +
                 `Current win rate: ${btResult.winRate.toFixed(1)}%.`,
        };
      }

      if (btResult.maxDrawdown > MAX_PUBLISH_DRAWDOWN) {
        return {
          ok: false,
          error: `Strategy max drawdown must be less than ${MAX_PUBLISH_DRAWDOWN}%. ` +
                 `Current max drawdown: ${btResult.maxDrawdown.toFixed(1)}%.`,
        };
      }

      // ── Step 5: Transition to pending + notify admins ─────────────────────
      const now = new Date().toISOString();
      const updated: Strategy = {
        ...existing,
        status:    'pending',
        updatedAt: now,
      };
      const newStrategies = { ...strategies, [strategyId]: updated };
      save(STRATEGIES_KEY, newStrategies);
      set({ strategies: newStrategies });

      // Notify the creator that the strategy is under review
      get()._notify({
        type:       'strategy_pending',
        userId:     creatorId,
        strategyId,
        message:    `"${existing.name}" has been submitted for review. You'll be notified once approved.`,
      });

      return { ok: true };
    },

    deleteStrategy: (strategyId, requestorId, isAdmin = false) => {
      const { strategies } = get();
      const existing = strategies[strategyId];
      if (!existing) return { ok: false, error: 'Strategy not found.' };
      if (!isAdmin && existing.creatorId !== requestorId) {
        return { ok: false, error: 'Permission denied.' };
      }
      if (!isAdmin && existing.totalSales > 0) {
        return { ok: false, error: 'Cannot delete a strategy that has been purchased. Contact support.' };
      }

      const newStrategies = { ...strategies };
      delete newStrategies[strategyId];
      save(STRATEGIES_KEY, newStrategies);
      set({ strategies: newStrategies });

      return { ok: true };
    },

    // ── Purchase flow ─────────────────────────────────────────────────────────

    // ── Enterprise Atomic Purchase Transaction with Automatic Rollback ────────

    purchaseStrategy: (params) => {
      const {
        strategyId, buyerId, buyerName,
        userCpCoins, userLevel, userPlan, userKycVerified,
      } = params;
      const { strategies, purchases } = get();

      // ── Step 1: Get strategy ──────────────────────────────────────────────
      const strategy = strategies[strategyId];
      if (!strategy) return { ok: false, error: 'Strategy not found.' };

      // ── Step 2: Idempotency & Ownership Verification (Phase 6) ────────────
      const alreadyOwns = strategy.isFree
        ? false
        : Object.values(purchases).some(
            p => p.strategyId === strategyId && p.buyerId === buyerId && p.status === 'active',
          );

      if (alreadyOwns) {
        return { ok: false, error: 'You already own this strategy.' };
      }

      const idempotencyKey = `tx_purchase_${buyerId}_${strategyId}`;
      if (_inFlightPurchases.has(idempotencyKey)) {
        return { ok: false, error: 'Purchase transaction is already in progress.' };
      }

      // ── Step 3: Full eligibility check ────────────────────────────────────
      const eligibility = checkPurchaseEligibility({
        strategy,
        userCpCoins,
        userLevel,
        userPlan,
        userKycVerified,
        alreadyOwns: false,
      });

      if (!eligibility.eligible) {
        return { ok: false, error: eligibility.reason };
      }

      _inFlightPurchases.add(idempotencyKey);

      // ── Step 4: Atomic State Snapshots for Enterprise Rollback (Phase 3) ──
      const cpStore  = useCpCoinsStore.getState();
      const monStore = useMonetizationStore.getState();

      const buyerLedgerBefore     = [...(cpStore.ledger[buyerId] ?? [])];
      const creatorLedgerBefore   = [...(cpStore.ledger[strategy.creatorId] ?? [])];
      const buyerBalanceBefore    = cpStore.balances[buyerId] ?? 0;
      const creatorBalanceBefore  = cpStore.balances[strategy.creatorId] ?? 0;

      const pendingEarningsBefore = [...monStore.pendingEarnings];
      const revenueLogBefore      = [...monStore.revenueLog];
      const purchasesBefore       = { ...purchases };
      const strategiesBefore      = { ...strategies };

      try {
        // ── Step 5 & 6: Debit Buyer & Credit Creator Reward ────────────────
        let creatorEarnsCP = 0;
        if (strategy.price > 0) {
          cpStore.initUser(buyerId);
          cpStore.initUser(strategy.creatorId);

          const feeResult = monStore.recordStrategyFee({
            buyerId,
            creatorId:    strategy.creatorId,
            strategyName: strategy.name,
            priceCP:      strategy.price,
          });

          if (!feeResult.ok) {
            _inFlightPurchases.delete(idempotencyKey);
            return { ok: false, error: 'Insufficient CP Coins to complete this purchase.' };
          }
          creatorEarnsCP = feeResult.creatorShare;
        }

        // ── Step 7: Build Ownership & History Records ──────────────────────
        const purchaseId = generateId();
        const now        = new Date().toISOString();
        const purchase: StrategyPurchase = {
          id:           purchaseId,
          strategyId,
          strategyName: strategy.name,
          buyerId,
          buyerName,
          price:        strategy.price,
          status:       'active',
          expiresAt:    null,
          purchasedAt:  now,
          refundedAt:   null,
          refundReason: null,
        };

        const updatedStrategy: Strategy = {
          ...strategy,
          totalSales:   strategy.totalSales + 1,
          totalRevenue: strategy.totalRevenue + creatorEarnsCP,
          lastSoldAt:   now,
          updatedAt:    now,
        };

        const newPurchases  = { ...purchasesBefore, [purchaseId]: purchase };
        const newStrategies = { ...strategiesBefore, [strategyId]: updatedStrategy };

        // ── Step 8: Cloud Persistence via CloudDataLayer (Phase 4 & 5) ─────
        save(PURCHASES_KEY, newPurchases);
        save(STRATEGIES_KEY, newStrategies);
        set({ purchases: newPurchases, strategies: newStrategies });

        // ── Step 9: Send Notifications ─────────────────────────────────────
        get()._notify({
          type:       'strategy_purchased',
          userId:     buyerId,
          strategyId,
          message:    `You purchased "${strategy.name}" for ${strategy.price > 0 ? `${strategy.price.toLocaleString()} CP` : 'free'}. Access is now unlocked.`,
        });

        get()._notify({
          type:       'strategy_sold',
          userId:     strategy.creatorId,
          strategyId,
          message:    `"${strategy.name}" was purchased by ${buyerName}! You earned ${creatorEarnsCP.toLocaleString()} CP.`,
        });

        return { ok: true, purchase };
      } catch (err) {
        // ── AUTOMATIC ROLLBACK ACROSS ALL 6 DOMAINS (Phase 3) ──────────────
        cpStore.setState({
          ledger: {
            ...cpStore.ledger,
            [buyerId]: buyerLedgerBefore,
            [strategy.creatorId]: creatorLedgerBefore,
          },
          balances: {
            ...cpStore.balances,
            [buyerId]: buyerBalanceBefore,
            [strategy.creatorId]: creatorBalanceBefore,
          },
        });

        monStore.setState({
          pendingEarnings: pendingEarningsBefore,
          revenueLog:      revenueLogBefore,
        });

        set({
          purchases:  purchasesBefore,
          strategies: strategiesBefore,
        });

        return {
          ok:    false,
          error: `Purchase transaction failed and was safely rolled back: ${(err as Error)?.message || 'Storage error'}`,
        };
      } finally {
        _inFlightPurchases.delete(idempotencyKey);
      }
    },

    refundPurchase: (purchaseId, adminId, reason) => {
      const { purchases, strategies } = get();
      const purchase = purchases[purchaseId];
      if (!purchase) return { ok: false, error: 'Purchase not found.' };
      if (purchase.status === 'refunded') return { ok: false, error: 'Already refunded.' };

      const strategy = strategies[purchase.strategyId];
      const cpStore  = useCpCoinsStore.getState();

      // Return CP coins to buyer
      if (purchase.price > 0) {
        cpStore.credit({
          userId:      purchase.buyerId,
          amount:      purchase.price,
          type:        'refund_strategy',
          description: `Refund: ${purchase.strategyName}`,
          referenceId: purchaseId,
        });
      }

      const now = new Date().toISOString();
      const updatedPurchase: StrategyPurchase = {
        ...purchase,
        status:       'refunded',
        refundedAt:   now,
        refundReason: reason,
      };

      const newPurchases = { ...purchases, [purchaseId]: updatedPurchase };

      // Decrement strategy sales counter
      if (strategy) {
        const { creatorEarns } = purchase.price > 0
          ? computeSaleSplit(purchase.price)
          : { creatorEarns: 0 };

        const updatedStrategy: Strategy = {
          ...strategy,
          totalSales:   Math.max(0, strategy.totalSales - 1),
          totalRevenue: Math.max(0, strategy.totalRevenue - creatorEarns),
          updatedAt:    now,
        };
        const newStrategies = { ...strategies, [strategy.id]: updatedStrategy };
        save(STRATEGIES_KEY, newStrategies);
        set({ strategies: newStrategies });
      }

      save(PURCHASES_KEY, newPurchases);
      set({ purchases: newPurchases });

      return { ok: true };
    },

    // ── Ratings ───────────────────────────────────────────────────────────────

    submitRating: (params) => {
      const { strategyId, userId, userName, userAvatarSeed, rating, review } = params;
      const { strategies, ratings, purchases } = get();

      // ── Step 1: Strategy must exist ───────────────────────────────────────
      const strategy = strategies[strategyId];
      if (!strategy) return { ok: false, error: 'Strategy not found.' };

      // ── Step 2 (spec §3.3): Verify user purchased the strategy ───────────
      const hasActivePurchase = strategy.isFree || Object.values(purchases).some(
        p => p.strategyId === strategyId && p.buyerId === userId && p.status === 'active',
      );
      if (!hasActivePurchase) {
        return { ok: false, error: 'Only verified purchasers can rate this strategy.' };
      }

      // ── Step 3 (spec §3.3): Validate rating fields ────────────────────────
      const validation = validateRating(rating, review);
      if (!validation.valid) {
        return { ok: false, error: validation.errors[0] };
      }

      const now = new Date().toISOString();

      // Check for an existing rating from this user
      const existingEntry = Object.values(ratings).find(
        r => r.strategyId === strategyId && r.userId === userId,
      );

      let ratingRecord: StrategyRating;

      if (existingEntry) {
        // Allow editing of own review (spec says check — we allow update but track it)
        ratingRecord = {
          ...existingEntry,
          rating,
          review:    review.slice(0, 500),
          isEdited:  true,
          updatedAt: now,
        };
      } else {
        // ── Step 3: Create new rating record ─────────────────────────────
        ratingRecord = {
          id:                 generateId(),
          strategyId,
          userId,
          userName,
          userAvatarSeed,
          rating,
          review:             review.slice(0, 500),
          isVerifiedPurchase: true,
          isEdited:           false,
          createdAt:          now,
          updatedAt:          now,
        };
      }

      const newRatings = { ...ratings, [ratingRecord.id]: ratingRecord };
      save(RATINGS_KEY, newRatings);
      set({ ratings: newRatings });

      // ── Step 4: Update strategy average rating ────────────────────────────
      get()._rebuildRating(strategyId);

      // ── Step 5 (spec §3.3): Abuse detection ──────────────────────────────
      // Flag if: 1-star AND review contains any abuse keyword
      if (rating === 1 && review.trim()) {
        const lowerReview = review.toLowerCase();
        const abuseHit = ABUSE_KEYWORDS.find(kw => lowerReview.includes(kw));
        if (abuseHit) {
          get()._flagStrategy(
            strategyId,
            userId,
            `1-star abuse keyword detected: "${abuseHit}" in review`,
          );
        }
      }

      return { ok: true, rating: ratingRecord };
    },

    deleteRating: (ratingId, requestorId, isAdmin = false) => {
      const { ratings } = get();
      const rating = ratings[ratingId];
      if (!rating) return { ok: false, error: 'Rating not found.' };
      if (!isAdmin && rating.userId !== requestorId) {
        return { ok: false, error: 'Permission denied.' };
      }

      const newRatings = { ...ratings };
      delete newRatings[ratingId];
      save(RATINGS_KEY, newRatings);
      set({ ratings: newRatings });

      get()._rebuildRating(rating.strategyId);

      return { ok: true };
    },

    // ── Backtest ──────────────────────────────────────────────────────────────

    runBacktest: (strategyId) => {
      const { strategies } = get();
      const strategy = strategies[strategyId];
      if (!strategy) return null;

      const result  = generateSimulatedBacktest(strategyId, strategy.name);
      const metrics = applyBacktestMetrics(result);

      const updatedStrategy: Strategy = {
        ...strategy,
        ...metrics,
        updatedAt: new Date().toISOString(),
      };

      const newStrategies = { ...strategies, [strategyId]: updatedStrategy };
      save(STRATEGIES_KEY, newStrategies);
      set({
        strategies:      newStrategies,
        backtestResults: { ...get().backtestResults, [strategyId]: result },
      });

      return result;
    },

    // ── Queries ───────────────────────────────────────────────────────────────

    getMarketplacePage: (filters, page, pageSize = 12) => {
      const allStrategies = Object.values(get().strategies);
      return paginateStrategies(allStrategies, filters, page, pageSize);
    },

    getCreatorStrategies: (creatorId) => {
      return Object.values(get().strategies)
        .filter(s => s.creatorId === creatorId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    getStrategyDetail: (strategyId, requestorUserId) => {
      const { strategies, ratings, purchases, backtestResults } = get();
      const strategy = strategies[strategyId];
      if (!strategy) return null;

      const strategyRatings = Object.values(ratings)
        .filter(r => r.strategyId === strategyId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      const userPurchase = Object.values(purchases).find(
        p => p.strategyId === strategyId && p.buyerId === requestorUserId && p.status === 'active',
      ) ?? null;

      return {
        ...strategy,
        ratings:        strategyRatings,
        userPurchase,
        backtestResult: backtestResults[strategyId] ?? null,
      };
    },

    getCreatorView: (strategyId, creatorId) => {
      const { strategies, ratings, purchases } = get();
      const strategy = strategies[strategyId];
      if (!strategy || strategy.creatorId !== creatorId) return null;

      const strategyPurchases = Object.values(purchases)
        .filter(p => p.strategyId === strategyId)
        .sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt));

      const strategyRatings = Object.values(ratings)
        .filter(r => r.strategyId === strategyId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      return {
        ...strategy,
        purchases:      strategyPurchases,
        ratings:        strategyRatings,
        recentReviews:  strategyRatings.slice(0, 5),
        pendingReview:  null,
      };
    },

    getUserPurchases: (userId) => {
      return Object.values(get().purchases)
        .filter(p => p.buyerId === userId)
        .sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt));
    },

    getStrategyRatings: (strategyId) => {
      return Object.values(get().ratings)
        .filter(r => r.strategyId === strategyId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    getUserRating: (strategyId, userId) => {
      return Object.values(get().ratings).find(
        r => r.strategyId === strategyId && r.userId === userId,
      ) ?? null;
    },

    userOwnsStrategy: (strategyId, userId) => {
      const { strategies, purchases } = get();
      const strategy = strategies[strategyId];
      if (!strategy) return false;
      if (strategy.isFree) return true; // Free strategies are always "owned"

      return Object.values(purchases).some(
        p => p.strategyId === strategyId && p.buyerId === userId && p.status === 'active',
      );
    },

    getPendingStrategies: () => {
      return Object.values(get().strategies)
        .filter(s => s.status === 'pending')
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    // ── Notifications ─────────────────────────────────────────────────────────

    getNotifications: (userId) => {
      return get().notifications.filter(n => n.userId === userId);
    },

    markNotificationRead: (notificationId) => {
      const updated = get().notifications.map(n =>
        n.id === notificationId ? { ...n, read: true } : n,
      );
      save(NOTIFS_KEY, updated);
      set({ notifications: updated });
    },

    // ── Flagging ───────────────────────────────────────────────────────────────

    getFlaggedStrategies: () => {
      return get().flaggedStrategies.filter(f => !f.resolved);
    },

    resolveFlag: (strategyId, _adminId) => {
      const updated = get().flaggedStrategies.map(f =>
        f.strategyId === strategyId ? { ...f, resolved: true } : f,
      );
      save(FLAGS_KEY, updated);
      set({ flaggedStrategies: updated });
    },

    // ── Internal ─────────────────────────────────────────────────────────────

    _rebuildRating: (strategyId) => {
      const { strategies, ratings } = get();
      const strategy = strategies[strategyId];
      if (!strategy) return;

      const strategyRatings = Object.values(ratings).filter(r => r.strategyId === strategyId);
      const average = computeWeightedRating(strategyRatings.map(r => r.rating));

      const updated: Strategy = {
        ...strategy,
        rating:      average,
        ratingCount: strategyRatings.length,
        updatedAt:   new Date().toISOString(),
      };

      const newStrategies = { ...strategies, [strategyId]: updated };
      save(STRATEGIES_KEY, newStrategies);
      set({ strategies: newStrategies });
    },

    _notify: (params) => {
      const notif: MarketplaceNotification = {
        id:        generateId(),
        ...params,
        createdAt: new Date().toISOString(),
        read:      false,
      };
      const updated = [notif, ...get().notifications].slice(0, 200); // cap at 200
      save(NOTIFS_KEY, updated);
      set({ notifications: updated });
    },

    _flagStrategy: (strategyId, flaggedByUserId, reason) => {
      // Avoid duplicate flags for the same strategy+reason combo
      const existing = get().flaggedStrategies.find(
        f => f.strategyId === strategyId && f.reason === reason && !f.resolved,
      );
      if (existing) return;

      const flag: FlaggedStrategy = {
        strategyId,
        flaggedAt:       new Date().toISOString(),
        reason,
        flaggedByUserId,
        resolved:        false,
      };
      const updated = [...get().flaggedStrategies, flag];
      save(FLAGS_KEY, updated);
      set({ flaggedStrategies: updated });

      // §6 — Notify the strategy creator that their strategy has been flagged
      const strategy = get().strategies[strategyId];
      if (strategy) {
        get()._notify({
          type:       'strategy_flagged',
          userId:     strategy.creatorId,
          strategyId,
          message:    `⚠️ Your strategy "${strategy.name}" has been flagged for review. Please check the marketplace for details.`,
        });
      }
    },
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// CONVENIENCE SELECTORS (stable references, no re-renders on unrelated changes)
// ─────────────────────────────────────────────────────────────────────────────

/** Returns all published + approved strategies as an array. */
export function selectPublishedStrategies(state: StrategyState): Strategy[] {
  return Object.values(state.strategies).filter(s => s.isPublished && s.isApproved);
}

/** Returns the default (empty) marketplace filters. */
export { DEFAULT_STRATEGY_FILTERS };
