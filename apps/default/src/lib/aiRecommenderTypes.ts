/**
 * aiRecommenderTypes.ts
 *
 * Complete type definitions for the CryptoVerse HQ Personalised Recommender system.
 *
 * Covers:
 *   - AIRecommendation    (personalised recommendation record)
 *   - UserBehaviorLog     (anonymous behavioral event for signal extraction)
 *   - RecommendationType  (strategy, bot, lesson, competition, trader)
 *   - BehaviorEventType   (page_view, button_click, trade, lesson_complete, etc.)
 *   - ScoringSignal       (individual signal component feeding into the score)
 *   - UserProfile         (lightweight interest vector derived from behavior)
 *   - SessionContext      (current session state for real-time scoring)
 *   - EngineConfig        (tunable weights and thresholds)
 *   - Filters / sort
 *   - Constants
 */

// ─────────────────────────────────────────────────────────────────────────────
// RECOMMENDATION TYPE
// ─────────────────────────────────────────────────────────────────────────────

export type RecommendationType = 'strategy' | 'bot' | 'lesson' | 'competition' | 'trader';

export const RECOMMENDATION_TYPE_META: Record<RecommendationType, {
  label:       string;
  icon:        string;
  color:       string;
  bg:          string;
  text:        string;
  border:      string;
  description: string;
  routePrefix: string;   // used for constructing deep links
}> = {
  strategy: {
    label: 'Strategy', icon: '⚡', color: '#6366f1',
    bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/30',
    description: 'A trading strategy that matches your style and risk profile.',
    routePrefix: '/strategies',
  },
  bot: {
    label: 'Trading Bot', icon: '🤖', color: '#22c55e',
    bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30',
    description: 'An automated bot that aligns with your trading frequency.',
    routePrefix: '/bots',
  },
  lesson: {
    label: 'Lesson', icon: '📚', color: '#f59e0b',
    bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30',
    description: 'An educational module to close a skill gap detected in your activity.',
    routePrefix: '/academy',
  },
  competition: {
    label: 'Competition', icon: '🏆', color: '#ef4444',
    bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30',
    description: 'A live event that suits your current skill level.',
    routePrefix: '/events',
  },
  trader: {
    label: 'Trader to Follow', icon: '👤', color: '#06b6d4',
    bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/30',
    description: 'A top performer whose style complements yours.',
    routePrefix: '/traders',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// BEHAVIOR EVENT TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type BehaviorEventType =
  | 'page_view'
  | 'button_click'
  | 'trade'
  | 'lesson_complete'
  | 'lesson_start'
  | 'strategy_purchase'
  | 'strategy_view'
  | 'strategy_like'
  | 'bot_activate'
  | 'bot_deactivate'
  | 'competition_join'
  | 'competition_view'
  | 'trader_follow'
  | 'trader_view'
  | 'recommendation_click'
  | 'recommendation_dismiss'
  | 'search'
  | 'filter_apply'
  | 'backtest_run'
  | 'copy_trade_start';

/** Signal weight of each event type — how strongly it influences the profile. */
export const BEHAVIOR_EVENT_WEIGHT: Record<BehaviorEventType, number> = {
  page_view:              0.1,
  button_click:           0.2,
  trade:                  1.5,
  lesson_complete:        1.2,
  lesson_start:           0.4,
  strategy_purchase:      2.0,
  strategy_view:          0.5,
  strategy_like:          0.8,
  bot_activate:           1.8,
  bot_deactivate:         0.3,
  competition_join:       1.5,
  competition_view:       0.4,
  trader_follow:          1.2,
  trader_view:            0.4,
  recommendation_click:   1.0,
  recommendation_dismiss: -0.5,
  search:                 0.3,
  filter_apply:           0.2,
  backtest_run:           1.0,
  copy_trade_start:       1.8,
};

// ─────────────────────────────────────────────────────────────────────────────
// EVENT DATA (per event type, loosely typed — stored as JSON in the log)
// ─────────────────────────────────────────────────────────────────────────────

export interface PageViewData      { path: string; referrer: string; timeOnPage?: number; }
export interface ButtonClickData   { buttonId: string; context: string; }
export interface TradeData         { symbol: string; side: 'buy' | 'sell'; amount: number; strategyTag?: string; }
export interface LessonData        { lessonId: string; moduleId: string; category: string; score?: number; }
export interface StrategyEventData { strategyId: string; category: string; price?: number; riskLevel?: string; }
export interface BotEventData      { botId: string; category: string; frequency?: string; }
export interface CompetitionData   { eventId: string; eventType: string; prizePool?: number; }
export interface TraderEventData   { traderId: string; winRate?: number; style?: string; }
export interface SearchData        { query: string; resultCount?: number; }
export interface RecommendationInteractionData { recommendationId: string; type: RecommendationType; action: 'click' | 'dismiss'; }

export type BehaviorEventData =
  | PageViewData | ButtonClickData | TradeData | LessonData
  | StrategyEventData | BotEventData | CompetitionData | TraderEventData
  | SearchData | RecommendationInteractionData | Record<string, unknown>;

// ─────────────────────────────────────────────────────────────────────────────
// USER BEHAVIOR LOG
// ─────────────────────────────────────────────────────────────────────────────

export interface UserBehaviorLog {
  id:        string;              // UUIDv4 primary key
  userId:    string;              // references users.id
  eventType: BehaviorEventType;
  eventData: BehaviorEventData;
  sessionId: string;              // session identifier (rotates per browser session)
  timestamp: string;              // ISO-8601
}

// ─────────────────────────────────────────────────────────────────────────────
// USER INTEREST VECTOR (derived from behavioral logs)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A lightweight interest profile extracted from behavioral signals.
 * Updated incrementally every time a new behavior event is logged.
 * Each dimension is a normalised score 0–100.
 */
export interface UserInterestVector {
  userId:       string;

  // ── Asset interests ──────────────────────────────────────────────────────
  assetWeights: Record<string, number>;    // e.g. { 'BTC': 80, 'ETH': 60, 'SOL': 30 }

  // ── Category interests ───────────────────────────────────────────────────
  categoryWeights: Record<string, number>; // e.g. { 'grid': 75, 'dca': 40 }

  // ── Risk appetite ─────────────────────────────────────────────────────────
  riskAppetite:  'conservative' | 'moderate' | 'aggressive';
  riskScore:     number;  // 0 = ultra-safe, 100 = max risk

  // ── Activity patterns ─────────────────────────────────────────────────────
  sessionFrequency: 'low' | 'medium' | 'high';  // sessions per week
  prefersAutomation: boolean;   // bots > manual trading
  prefersLearning:   boolean;   // lessons > trading activity
  prefersCompeting:  boolean;   // competitions > strategy browsing

  // ── Social orientation ────────────────────────────────────────────────────
  socialScore: number;   // 0 = lone wolf, 100 = highly social (follows, copies, etc.)

  // ── Signals summary ───────────────────────────────────────────────────────
  totalSignalWeight: number;    // sum of all event weights so far
  lastUpdatedAt:     string;    // ISO-8601
}

export function makeEmptyInterestVector(userId: string): UserInterestVector {
  return {
    userId,
    assetWeights:    {},
    categoryWeights: {},
    riskAppetite:    'moderate',
    riskScore:       50,
    sessionFrequency:'low',
    prefersAutomation: false,
    prefersLearning:   false,
    prefersCompeting:  false,
    socialScore:     30,
    totalSignalWeight: 0,
    lastUpdatedAt:   new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SCORING SIGNALS
// ─────────────────────────────────────────────────────────────────────────────

export type SignalSource =
  | 'interest_vector'    // derived from user's behavior history
  | 'collaborative'      // "users like you also liked"
  | 'popularity'         // trending / high engagement
  | 'recency'            // recently added / updated
  | 'skill_gap'          // lesson recommendation to fill knowledge gap
  | 'risk_alignment'     // matches user's risk appetite
  | 'diversity_boost'    // diversification bonus to avoid filter bubbles
  | 'completion_chain'   // next step after a completed lesson/strategy
  | 'time_aware';        // time-of-day or day-of-week signal

export interface ScoringSignal {
  source:      SignalSource;
  weight:      number;     // configured weight for this signal
  rawScore:    number;     // computed raw score 0–1
  contribution: number;    // weight × rawScore (contribution to final score)
  reason:      string;     // human-readable explanation of this signal
}

// ─────────────────────────────────────────────────────────────────────────────
// AI RECOMMENDATION
// ─────────────────────────────────────────────────────────────────────────────

export interface AIRecommendation {
  // ── Identity ──────────────────────────────────────────────────────────────
  id:       string;   // UUIDv4 primary key
  userId:   string;   // references users.id

  // ── What is recommended ───────────────────────────────────────────────────
  type:     RecommendationType;
  targetId: string;   // ID of the recommended entity

  // ── Scoring ───────────────────────────────────────────────────────────────
  score:    number;   // composite relevance score 0–100
  signals:  ScoringSignal[];   // breakdown of how the score was computed

  // ── Display ───────────────────────────────────────────────────────────────
  reason:   string;   // human-readable "why we recommend this"
  headline: string;   // short display headline (≤80 chars)
  thumbnail: string;  // emoji or icon for fast rendering
  tags:     string[];

  // ── Interaction state ─────────────────────────────────────────────────────
  isViewed:    boolean;
  isClicked:   boolean;
  isDismissed: boolean;

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  createdAt:  string;   // ISO-8601
  expiresAt:  string;   // ISO-8601 — recommendation expires after TTL_DAYS
  refreshedAt: string;  // ISO-8601 — last time score was recomputed
}

// ─────────────────────────────────────────────────────────────────────────────
// ENGINE CONFIG
// ─────────────────────────────────────────────────────────────────────────────

export interface RecommenderEngineConfig {
  /** Weight applied to each ScoringSignal source (must sum to ~1.0). */
  signalWeights: Record<SignalSource, number>;

  /** Minimum score (0–100) for a recommendation to be surfaced. */
  minScoreThreshold: number;

  /** Maximum active recommendations kept per user. */
  maxRecommendationsPerUser: number;

  /** How many recommendations to generate per type per refresh. */
  recommendationsPerType: number;

  /** TTL in days before a recommendation expires. */
  ttlDays: number;

  /** How often the engine re-ranks recommendations (ms). */
  refreshIntervalMs: number;

  /** Minimum behavior events required before personalization kicks in. */
  minEventsForPersonalization: number;
}

export const DEFAULT_ENGINE_CONFIG: RecommenderEngineConfig = {
  signalWeights: {
    interest_vector:  0.30,
    collaborative:    0.20,
    popularity:       0.15,
    recency:          0.10,
    skill_gap:        0.10,
    risk_alignment:   0.08,
    diversity_boost:  0.04,
    completion_chain: 0.02,
    time_aware:       0.01,
  },
  minScoreThreshold:         30,
  maxRecommendationsPerUser: 50,
  recommendationsPerType:     5,
  ttlDays:                    7,
  refreshIntervalMs:      120_000,  // 2 minutes
  minEventsForPersonalization: 3,
};

// ─────────────────────────────────────────────────────────────────────────────
// SESSION CONTEXT
// ─────────────────────────────────────────────────────────────────────────────

export interface SessionContext {
  sessionId:       string;
  userId:          string;
  startedAt:       string;   // ISO-8601
  lastActivityAt:  string;
  pageViews:       number;
  eventsThisSession: number;
  currentPath:     string;
  referrer:        string;
}

// ─────────────────────────────────────────────────────────────────────────────
// FILTERS & SORTING
// ─────────────────────────────────────────────────────────────────────────────

export type RecommendationSortKey =
  | 'score_desc'    // highest relevance first (default)
  | 'newest'
  | 'type_asc';

export interface RecommendationFilters {
  types:        RecommendationType[];
  minScore:     number;
  hideViewed:   boolean;
  hideDismissed: boolean;
  sortBy:       RecommendationSortKey;
}

export const DEFAULT_RECOMMENDATION_FILTERS: RecommendationFilters = {
  types:         [],
  minScore:      0,
  hideViewed:    false,
  hideDismissed: true,
  sortBy:        'score_desc',
};

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** Max behavior events kept per user in local storage. */
export const MAX_BEHAVIOR_LOGS_PER_USER = 500;

/** Max sessions stored per user. */
export const MAX_SESSIONS_PER_USER = 50;

/** Session timeout — new session if gap > this value (ms). */
export const SESSION_TIMEOUT_MS = 30 * 60 * 1000;  // 30 minutes

/** Number of pre-seeded behavior events on first load. */
export const SEED_BEHAVIOR_EVENTS = 25;

// ─────────────────────────────────────────────────────────────────────────────
// RESULT TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface LogBehaviorResult {
  ok:       boolean;
  logId?:   string;
  error?:   string;
}

export interface RefreshResult {
  userId:        string;
  generated:     number;   // new recommendations created
  pruned:        number;   // expired/dismissed recommendations removed
  durationMs:    number;
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN / ANALYTICS TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface RecommenderGlobalStats {
  totalRecommendations:   number;
  activeRecommendations:  number;
  expiredRecommendations: number;
  dismissedRecommendations: number;
  totalBehaviorEvents:    number;
  totalSessions:          number;
  avgScorePerType:        Record<RecommendationType, number>;
  clickThroughRate:       number;   // clicked / viewed
  dismissalRate:          number;   // dismissed / viewed
  topRecommendationType:  RecommendationType | null;
}
