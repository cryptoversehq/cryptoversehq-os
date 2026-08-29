/**
 * strategyTypes.ts
 *
 * Complete type definitions for the CryptoVerse HQ Strategy Marketplace.
 *
 * Covers:
 *   - Strategy (creation, publishing, approval lifecycle)
 *   - StrategyPurchase (acquisition records)
 *   - StrategyRating   (reviews and star ratings)
 *   - CP Coins         (platform currency)
 *   - Backtest         (result schema)
 *   - Derived helpers  (filters, sort options, pagination)
 */

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY
// ─────────────────────────────────────────────────────────────────────────────

/** Strategy algorithm families supported by the marketplace. */
export type StrategyType =
  | 'grid'        // Grid trading — buys and sells at set intervals
  | 'dca'         // Dollar-Cost Averaging — periodic fixed buys
  | 'martingale'  // Doubles position size after each loss
  | 'arbitrage'   // Exploits price differences across assets
  | 'custom';     // User-defined / hybrid approaches

/** Full lifecycle states a strategy passes through. */
export type StrategyStatus =
  | 'draft'       // Creator is still editing, not visible
  | 'pending'     // Submitted for admin review
  | 'approved'    // Admin approved — visible in marketplace
  | 'rejected'    // Admin rejected — returned to creator
  | 'suspended';  // Temporarily hidden by admin after publishing

/** Risk classification used for marketplace display badges. */
export type RiskLevel = 'low' | 'medium' | 'high' | 'very-high';

/**
 * Core strategy entity — the single source of truth for a trading strategy.
 * All numeric performance fields are updated after each backtest run.
 */
export interface Strategy {
  // ── Identity ──────────────────────────────────────────────────────────────
  id: string;                     // UUIDv4 primary key
  creatorId: string;              // references UserProfile.id
  creatorName: string;            // denormalized for display (snapshot at creation)
  creatorAvatarSeed: string;      // denormalized for fast avatar rendering

  // ── Core info ─────────────────────────────────────────────────────────────
  name: string;                   // max 100 chars
  description: string;            // max 2000 chars — rich markdown supported
  shortDescription: string;       // max 200 chars — marketplace card tagline
  type: StrategyType;
  tags: string[];                 // e.g. ['scalping', 'btc', 'long-term'], max 10

  // ── Access control ────────────────────────────────────────────────────────
  requiredLevel: number;          // minimum academy XP level (0 = anyone)
  requiresKyc: boolean;           // if true, buyer must have KYC verified
  requiredPlan: 'bronze' | 'silver' | 'gold' | 'any'; // minimum subscription tier

  // ── Pricing ───────────────────────────────────────────────────────────────
  price: number;                  // CP coins; 0 = free
  isFree: boolean;                // derived: price === 0 (stored for fast queries)
  verified?: boolean;             // Verified Track Record badge

  // ── Backtest / Performance metrics ────────────────────────────────────────
  winRate: number;                // 0-100 percentage
  totalTrades: number;            // number of backtest trades executed
  totalProfit: number;            // cumulative net profit in virtual USD
  totalProfitPct: number;         // total profit as % of starting capital
  maxDrawdown: number;            // maximum peak-to-trough drawdown %
  sharpeRatio: number;            // risk-adjusted return (annualised)
  avgTradeDuration: number;       // average minutes per trade
  backtestPeriodDays: number;     // duration of backtest in days
  backtestStartCapital: number;   // starting capital used in backtest
  riskLevel: RiskLevel;           // derived from maxDrawdown / sharpe

  // ── Community ─────────────────────────────────────────────────────────────
  rating: number;                 // 0-5, weighted average (stored to 2dp)
  ratingCount: number;            // total number of submitted ratings

  // ── Versioning (P1-3) ───────────────────────────────────────────────────────
  version: string;                // "1.0.0", "1.1.0", etc.
  updateLog: string;              // Description of changes in this version
  createdAt: string;              // ISO-8601
  updatedAt: string;              // ISO-8601

  // ── Community Q&A (P2-5) ────────────────────────────────────────────────────
  questions: StrategyQuestion[];
  favoriteCount: number;          // number of users who favourited

  // ── Strategy logic ────────────────────────────────────────────────────────
  /**
   * JSON-serialised strategy config/pseudocode.
   * Schema is free-form; the UI renders it via a code editor.
   * Max serialised size: 64 KB.
   */
  code: string;

  /** Human-readable parameter documentation (markdown). */
  paramDocs: string;

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  status: StrategyStatus;
  isPublished: boolean;           // true only when status === 'approved'
  isApproved: boolean;            // admin has signed off
  version: number;                // starts at 1, increments on each edit+resubmit
  rejectionReason: string | null; // populated when status === 'rejected'

  // ── Sales ─────────────────────────────────────────────────────────────────
  totalSales: number;             // number of unique purchases
  totalRevenue: number;           // CP coins earned by creator (net of platform fee)

  // ── Timestamps (ISO-8601 strings) ─────────────────────────────────────────
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;     // null until first approval
  lastSoldAt: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY PURCHASE
// ─────────────────────────────────────────────────────────────────────────────

export type PurchaseStatus = 'active' | 'expired' | 'refunded';

/**
 * Records a single acquisition of a strategy by a user.
 * Free strategies generate a purchase record with price === 0.
 */
export interface StrategyPurchase {
  id: string;                     // UUIDv4
  strategyId: string;             // references Strategy.id
  strategyName: string;           // snapshot at purchase time
  buyerId: string;                // references UserProfile.id
  buyerName: string;              // snapshot
  price: number;                  // CP coins paid (0 for free)
  status: PurchaseStatus;
  /** null for perpetual licences; set for time-limited access */
  expiresAt: string | null;
  purchasedAt: string;            // ISO-8601
  refundedAt: string | null;      // ISO-8601, if refunded
  refundReason: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY RATING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single user's rating and optional text review for a strategy.
 * Only users with an active StrategyPurchase may submit a rating.
 */
export interface StrategyRating {
  id: string;                     // UUIDv4
  strategyId: string;             // references Strategy.id
  userId: string;                 // references UserProfile.id
  userName: string;               // snapshot
  userAvatarSeed: string;         // snapshot
  rating: number;                 // integer 1-5
  review: string;                 // max 500 chars; empty string if no text
  isVerifiedPurchase: boolean;    // always true (enforced at write time)
  isEdited: boolean;              // true if user updated their review
  createdAt: string;              // ISO-8601
  updatedAt: string;              // ISO-8601
}

// ── Strategy Question (P2-5) ──────────────────────────────────────────────────

export interface StrategyQuestion {
  id: string;
  strategyId: string;
  userId: string;
  userName: string;
  question: string;
  answer: string | null;
  answeredAt: string | null;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// BACKTEST RESULT
// ─────────────────────────────────────────────────────────────────────────────

export interface BacktestTrade {
  tradeNumber: number;
  side: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  entryAt: string;               // ISO-8601
  exitAt: string;                // ISO-8601
  pnl: number;                   // net USD after fees
  pnlPct: number;                // % return on this trade
  durationMinutes: number;
  fee: number;
}

/**
 * Full result of running a strategy backtest.
 * Stored as JSON in the strategy record's `code` field meta section,
 * and also accessible via strategyStore.backtestResults.
 */
export interface BacktestResult {
  strategyId: string;
  runAt: string;                  // ISO-8601
  periodDays: number;
  startCapital: number;
  endCapital: number;
  totalProfit: number;
  totalProfitPct: number;
  winRate: number;                // 0-100
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  maxDrawdown: number;
  sharpeRatio: number;
  avgTradeDuration: number;       // minutes
  equityCurve: number[];          // sampled equity at regular intervals
  trades: BacktestTrade[];        // full trade log
  riskLevel: RiskLevel;
}

// ─────────────────────────────────────────────────────────────────────────────
// CP COINS
// ─────────────────────────────────────────────────────────────────────────────

export type CpTransactionType =
  | 'purchase_strategy'       // user buys a strategy
  | 'sell_strategy'           // creator earns from a sale
  | 'platform_fee'            // platform cut on a sale
  | 'refund_strategy'         // buyer receives refund
  | 'admin_grant'             // manual admin credit
  | 'admin_deduct'            // manual admin debit
  | 'referral_bonus'          // earned from referrals
  | 'achievement_reward'      // earned from academy/competition achievements
  | 'competition_prize'       // won in a trading competition
  | 'subscription_reward'     // bonus coins awarded with subscription tiers
  | 'subscription_purchase'   // subscription plan purchased with CP
  | 'cp_purchase'             // bought with real money via NOWPayments
  | 'withdraw_to_balance';    // CP coins converted to simulation trading balance

export type CpTransactionDirection = 'credit' | 'debit';

export interface CpTransaction {
  id: string;                   // UUIDv4
  userId: string;               // owner of this ledger entry
  type: CpTransactionType;
  direction: CpTransactionDirection;
  amount: number;               // always positive; direction indicates +/-
  balanceAfter: number;         // balance snapshot after this transaction
  description: string;          // human-readable label
  referenceId: string | null;   // e.g. strategyId, purchaseId, competitionId
  createdAt: string;            // ISO-8601
}

// ─────────────────────────────────────────────────────────────────────────────
// MARKETPLACE FILTERS & SORTING
// ─────────────────────────────────────────────────────────────────────────────

export type StrategySortKey =
  | 'newest'
  | 'oldest'
  | 'best_rating'
  | 'most_sales'
  | 'highest_profit'
  | 'lowest_price'
  | 'highest_price'
  | 'best_win_rate'
  | 'lowest_drawdown'
  | 'best_sharpe';

export interface StrategyFilters {
  search: string;
  types: StrategyType[];
  tags: string[];
  priceRange: [number, number];   // [min, max] in CP coins; [0, Infinity] = any
  ratingMin: number;              // 0 = any
  riskLevels: RiskLevel[];
  requiredPlan: Array<'bronze' | 'silver' | 'gold' | 'any'>;
  onlyFree: boolean;
  onlyVerified: boolean;          // only admin-approved strategies
  sortBy: StrategySortKey;
}

export const DEFAULT_STRATEGY_FILTERS: StrategyFilters = {
  search: '',
  types: [],
  tags: [],
  priceRange: [0, Infinity],
  ratingMin: 0,
  riskLevels: [],
  requiredPlan: [],
  onlyFree: false,
  onlyVerified: false,
  sortBy: 'newest',
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN REVIEW
// ─────────────────────────────────────────────────────────────────────────────

export type AdminStrategyAction = 'approve' | 'reject' | 'suspend' | 'restore';

export interface AdminStrategyReview {
  id: string;                     // UUIDv4
  strategyId: string;
  adminId: string;
  adminName: string;
  action: AdminStrategyAction;
  reason: string;                 // required for reject/suspend
  reviewedAt: string;             // ISO-8601
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** Platform fee taken from every strategy sale (20%). */
export const STRATEGY_PLATFORM_FEE_PCT = 0.20;

/** Creator receives this fraction of the sale price. */
export const STRATEGY_CREATOR_SHARE_PCT = 1 - STRATEGY_PLATFORM_FEE_PCT;

/** Minimum win rate (%) required to publish a strategy. */
export const MIN_PUBLISH_WIN_RATE = 50;

/** Maximum drawdown (%) allowed for a publishable strategy. */
export const MAX_PUBLISH_DRAWDOWN = 30;

/** 1-star + scam keyword → auto-flag for admin review. */
export const ABUSE_KEYWORDS = ['scam', 'fraud', 'fake', 'stolen', 'cheat', 'rigged', 'ponzi'] as const;

/** Maximum number of tags per strategy. */
export const MAX_STRATEGY_TAGS = 10;

/** Maximum serialised size of strategy code in bytes (64 KB). */
export const MAX_STRATEGY_CODE_BYTES = 65_536;

/** Default initial CP coins balance for new users. */
export const CP_COINS_INITIAL_BALANCE = 500;

/** CP coins earned per referral that results in a purchase. */
export const CP_COINS_PER_REFERRAL = 50;

/** All available strategy tags users can choose from. */
export const STRATEGY_TAGS = [
  'scalping', 'day-trading', 'swing', 'long-term', 'position',
  'momentum', 'mean-reversion', 'trend-following', 'contrarian',
  'breakout', 'range', 'high-frequency', 'low-risk', 'high-reward',
  'btc', 'eth', 'altcoins', 'stablecoins', 'multi-asset',
  'automated', 'manual', 'beginner-friendly', 'advanced', 'expert',
] as const;

export type StrategyTag = typeof STRATEGY_TAGS[number];

// ─────────────────────────────────────────────────────────────────────────────
// HELPER / DERIVED TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Lightweight card representation — used in marketplace listings. */
export type StrategyCard = Pick<
  Strategy,
  | 'id' | 'name' | 'shortDescription' | 'type' | 'tags'
  | 'price' | 'isFree' | 'rating' | 'ratingCount'
  | 'winRate' | 'totalTrades' | 'totalProfit' | 'totalProfitPct'
  | 'maxDrawdown' | 'sharpeRatio' | 'riskLevel'
  | 'totalSales' | 'creatorName' | 'creatorAvatarSeed'
  | 'isPublished' | 'requiredLevel' | 'requiredPlan'
  | 'publishedAt' | 'createdAt' | 'verified'
>;

/** What the creator sees in their personal dashboard for their strategy. */
export type StrategyCreatorView = Strategy & {
  purchases: StrategyPurchase[];
  ratings: StrategyRating[];
  recentReviews: StrategyRating[];
  pendingReview: AdminStrategyReview | null;
};

/** Full detail view — shown on the strategy detail page. */
export type StrategyDetail = Strategy & {
  ratings: StrategyRating[];
  userPurchase: StrategyPurchase | null; // null if current user hasn't purchased
  backtestResult: BacktestResult | null;
};

/** Result shape from strategyStore.purchaseStrategy(). */
export interface PurchaseResult {
  ok: boolean;
  purchase?: StrategyPurchase;
  error?: string;
}

/** Result shape from strategyStore.submitRating(). */
export interface RatingResult {
  ok: boolean;
  rating?: StrategyRating;
  error?: string;
}

/** Paginated result for marketplace queries. */
export interface StrategyPage {
  items: StrategyCard[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
