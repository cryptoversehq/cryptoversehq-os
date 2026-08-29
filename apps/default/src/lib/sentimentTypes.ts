/**
 * sentimentTypes.ts
 *
 * Complete type definitions for the CryptoVerse HQ Sentiment Analysis system.
 *
 * Covers:
 *   - SentimentSnapshot  (historical sentiment readings per symbol)
 *   - SentimentAlert     (user-configured sentiment threshold alerts)
 *   - FearGreedZone      (classification bands on the 0-100 scale)
 *   - SentimentSource    (individual platform signal: Twitter, Reddit, News)
 *   - SentimentTrend     (direction of change over a rolling window)
 *   - AggregateSentiment (per-symbol live summary used in the UI)
 *   - Filters / sort     (for snapshot history and alert list views)
 *   - Admin stats
 *   - Constants
 */

// ─────────────────────────────────────────────────────────────────────────────
// FEAR & GREED
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Named zone on the 0-100 Fear & Greed Index.
 * Matches the classification bands used by Alternative.me.
 */
export type FearGreedZone =
  | 'extreme_fear'   // 0 – 24
  | 'fear'           // 25 – 44
  | 'neutral'        // 45 – 55
  | 'greed'          // 56 – 74
  | 'extreme_greed'; // 75 – 100

export function getFearGreedZone(index: number): FearGreedZone {
  if (index <= 24) return 'extreme_fear';
  if (index <= 44) return 'fear';
  if (index <= 55) return 'neutral';
  if (index <= 74) return 'greed';
  return 'extreme_greed';
}

export const FEAR_GREED_META: Record<FearGreedZone, {
  label:     string;
  shortLabel: string;
  color:     string;   // CSS hex
  bg:        string;   // Tailwind bg class
  text:      string;   // Tailwind text class
  border:    string;   // Tailwind border class
  icon:      string;
  description: string;
}> = {
  extreme_fear: {
    label:      'Extreme Fear',
    shortLabel: 'X Fear',
    color:      '#ef4444',
    bg:         'bg-red-500/10',
    text:       'text-red-400',
    border:     'border-red-500/30',
    icon:       '😱',
    description: 'Market participants are extremely fearful. Historically a buy signal.',
  },
  fear: {
    label:      'Fear',
    shortLabel: 'Fear',
    color:      '#f97316',
    bg:         'bg-orange-500/10',
    text:       'text-orange-400',
    border:     'border-orange-500/30',
    icon:       '😟',
    description: 'Significant fear in the market. Caution advised.',
  },
  neutral: {
    label:      'Neutral',
    shortLabel: 'Neutral',
    color:      '#a3a3a3',
    bg:         'bg-neutral-500/10',
    text:       'text-neutral-400',
    border:     'border-neutral-500/30',
    icon:       '😐',
    description: 'Market sentiment is balanced. No strong directional signal.',
  },
  greed: {
    label:      'Greed',
    shortLabel: 'Greed',
    color:      '#22c55e',
    bg:         'bg-green-500/10',
    text:       'text-green-400',
    border:     'border-green-500/30',
    icon:       '🤑',
    description: 'Market participants are greedy. Consider profit-taking.',
  },
  extreme_greed: {
    label:      'Extreme Greed',
    shortLabel: 'X Greed',
    color:      '#4ade80',
    bg:         'bg-emerald-500/10',
    text:       'text-emerald-400',
    border:     'border-emerald-500/30',
    icon:       '🚀',
    description: 'Extreme greed. Historically a risk signal — market may be overextended.',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// SENTIMENT DIRECTION
// ─────────────────────────────────────────────────────────────────────────────

export type SentimentTrend = 'rising' | 'falling' | 'stable';

export function getSentimentTrend(current: number, previous: number): SentimentTrend {
  const delta = current - previous;
  if (delta > 2)  return 'rising';
  if (delta < -2) return 'falling';
  return 'stable';
}

// ─────────────────────────────────────────────────────────────────────────────
// SENTIMENT SOURCES
// ─────────────────────────────────────────────────────────────────────────────

/** Individual platform sentiment channel. */
export type SentimentSource = 'twitter' | 'reddit' | 'news';

export const SOURCE_META: Record<SentimentSource, {
  label:   string;
  icon:    string;
  color:   string;
  weight:  number;  // contribution to overallSentiment (must sum to 1.0)
}> = {
  twitter: { label: 'X / Twitter', icon: '𝕏',  color: '#1d9bf0', weight: 0.45 },
  reddit:  { label: 'Reddit',      icon: '🤖', color: '#ff4500', weight: 0.30 },
  news:    { label: 'News',        icon: '📰', color: '#6366f1', weight: 0.25 },
};

/** Sanity check: weights must sum to 1.0. */
const _totalWeight = Object.values(SOURCE_META).reduce((s, m) => s + m.weight, 0);
if (Math.abs(_totalWeight - 1.0) > 0.001) {
  console.warn('[sentimentTypes] Source weights do not sum to 1.0:', _totalWeight);
}

// ─────────────────────────────────────────────────────────────────────────────
// SENTIMENT SNAPSHOT  (one data point in history)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A historical sentiment reading for one symbol at one point in time.
 * Stored in a ring-buffer per symbol.
 */
export interface SentimentSnapshot {
  // ── Identity ──────────────────────────────────────────────────────────────
  id:     string;  // UUIDv4 primary key
  symbol: string;  // e.g. "BTC"

  // ── Fear & Greed ──────────────────────────────────────────────────────────
  /** 0 (extreme fear) – 100 (extreme greed). Applies to the whole crypto market. */
  fearGreedIndex: number;
  /** Derived zone from fearGreedIndex. */
  fearGreedZone:  FearGreedZone;

  // ── Source signals (-1 very negative, 0 neutral, +1 very positive) ────────
  twitterSentiment: number;
  redditSentiment:  number;
  newsSentiment:    number;

  /**
   * Weighted average of the three source signals.
   * = twitterSentiment × 0.45 + redditSentiment × 0.30 + newsSentiment × 0.25
   */
  overallSentiment: number;

  // ── Volume counts ─────────────────────────────────────────────────────────
  twitterVolume: number;   // tweet/mention count in the period
  redditVolume:  number;   // post/comment count in the period
  newsVolume:    number;   // article count in the period

  // ── Derived fields ────────────────────────────────────────────────────────
  /** Total mention volume across all sources. */
  totalVolume: number;
  /** Trend vs. the previous snapshot (may be null for the first record). */
  trend: SentimentTrend | null;

  timestamp: string;  // ISO-8601
}

// ─────────────────────────────────────────────────────────────────────────────
// AGGREGATE SENTIMENT  (live summary for one symbol, used in UI)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A live, pre-computed summary of the current sentiment for one symbol.
 * Computed from the latest two snapshots in history.
 */
export interface AggregateSentiment {
  symbol:           string;
  latest:           SentimentSnapshot;
  previous:         SentimentSnapshot | null;

  // Deltas (latest - previous; null if no previous)
  fearGreedDelta:   number | null;
  overallDelta:     number | null;
  volumeDelta:      number | null;

  trend:            SentimentTrend;
  zone:             FearGreedZone;
}

// ─────────────────────────────────────────────────────────────────────────────
// SENTIMENT ALERT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Condition types for sentiment alerts.
 *
 * fear_above  / fear_below  → triggers on fearGreedIndex
 * greed_above / greed_below → alias (greed_above = fear above 75, etc.)
 * overall_above / overall_below → triggers on overallSentiment (-1 to 1)
 * volume_spike → triggers when totalVolume exceeds threshold
 */
export type SentimentAlertCondition =
  | 'fear_above'     // fearGreedIndex >= threshold
  | 'fear_below'     // fearGreedIndex <= threshold
  | 'greed_above'    // fearGreedIndex >= threshold (semantic alias — threshold typically 75+)
  | 'greed_below'    // fearGreedIndex <= threshold (threshold typically 56+)
  | 'overall_above'  // overallSentiment >= threshold (threshold in -1..1)
  | 'overall_below'  // overallSentiment <= threshold
  | 'volume_spike';  // totalVolume >= threshold

export const CONDITION_META: Record<SentimentAlertCondition, {
  label:       string;
  description: string;
  unit:        string;  // unit shown in threshold input
  min:         number;
  max:         number;
}> = {
  fear_above:    { label: 'Fear Index ≥',       description: 'Triggers when F&G index is above threshold', unit: 'pts', min: 0,    max: 100   },
  fear_below:    { label: 'Fear Index ≤',       description: 'Triggers when F&G index is below threshold', unit: 'pts', min: 0,    max: 100   },
  greed_above:   { label: 'Greed Index ≥',      description: 'Triggers when greed level is above threshold', unit: 'pts', min: 0,  max: 100   },
  greed_below:   { label: 'Greed Index ≤',      description: 'Triggers when greed level drops below threshold', unit: 'pts', min: 0, max: 100 },
  overall_above: { label: 'Overall Sentiment ≥', description: 'Triggers when weighted sentiment score rises above threshold', unit: '', min: -1, max: 1 },
  overall_below: { label: 'Overall Sentiment ≤', description: 'Triggers when weighted sentiment score falls below threshold', unit: '', min: -1, max: 1 },
  volume_spike:  { label: 'Volume Spike ≥',      description: 'Triggers when total mention volume exceeds threshold',        unit: 'K', min: 0, max: 10_000_000 },
};

/**
 * A user-configured sentiment threshold alert.
 * Fires once per snapshot when the condition is met.
 */
export interface SentimentAlert {
  // ── Identity ──────────────────────────────────────────────────────────────
  id:     string;  // UUIDv4 primary key
  userId: string;  // references users.id

  // ── Config ────────────────────────────────────────────────────────────────
  symbol:     string;                    // e.g. "BTC" — or "MARKET" for global F&G
  condition:  SentimentAlertCondition;
  threshold:  number;
  isActive:   boolean;

  // ── Notification ──────────────────────────────────────────────────────────
  notifyInApp: boolean;
  notifyEmail: boolean;

  // ── Stats ─────────────────────────────────────────────────────────────────
  triggerCount:    number;
  createdAt:       string;          // ISO-8601
  lastTriggeredAt: string | null;   // ISO-8601
}

// ─────────────────────────────────────────────────────────────────────────────
// FILTERS & SORTING — SNAPSHOTS
// ─────────────────────────────────────────────────────────────────────────────

export type SnapshotSortKey = 'newest' | 'oldest' | 'highest_fear_greed' | 'lowest_fear_greed' | 'highest_volume';

export interface SnapshotFilters {
  symbols:   string[];
  zones:     FearGreedZone[];
  trends:    SentimentTrend[];
  dateFrom:  string | null;  // ISO-8601 date
  dateTo:    string | null;  // ISO-8601 date
  sortBy:    SnapshotSortKey;
}

export const DEFAULT_SNAPSHOT_FILTERS: SnapshotFilters = {
  symbols:  [],
  zones:    [],
  trends:   [],
  dateFrom: null,
  dateTo:   null,
  sortBy:   'newest',
};

// ─────────────────────────────────────────────────────────────────────────────
// FILTERS & SORTING — ALERTS
// ─────────────────────────────────────────────────────────────────────────────

export type AlertListSortKey = 'newest' | 'oldest' | 'most_triggered' | 'symbol_asc';

export interface SentimentAlertFilters {
  symbols:    string[];
  conditions: SentimentAlertCondition[];
  isActive:   boolean | null;
  sortBy:     AlertListSortKey;
}

export const DEFAULT_ALERT_FILTERS: SentimentAlertFilters = {
  symbols:    [],
  conditions: [],
  isActive:   null,
  sortBy:     'newest',
};

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** How often the simulator generates new snapshots (ms). */
export const SENTIMENT_INTERVAL_MS = 30_000;  // every 30 seconds

/** Max snapshots stored per symbol before ring-buffering. */
export const MAX_SNAPSHOTS_PER_SYMBOL = 288;  // 24h at 5-minute resolution

/** Max total snapshots stored globally. */
export const MAX_TOTAL_SNAPSHOTS = 10_000;

/** Max alerts per user. */
export const MAX_SENTIMENT_ALERTS = 30;

/** Symbols tracked by the sentiment simulator (top coins). */
export const TRACKED_SYMBOLS: string[] = [
  'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'AVAX',
  'LINK', 'DOT', 'MATIC', 'UNI', 'ATOM', 'LTC', 'INJ',
];

/**
 * Global Fear & Greed seed symbol.
 * The market-wide F&G index is modelled independently of per-coin sentiment.
 */
export const MARKET_SYMBOL = 'MARKET';

/** How many snapshots to seed on first load (cold start). */
export const COLD_START_SNAPSHOT_COUNT = 48;  // ~4h of history at 5m intervals

// ─────────────────────────────────────────────────────────────────────────────
// RESULT TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateSentimentAlertResult {
  ok:      boolean;
  alertId?: string;
  errors?: string[];
}

export interface UpdateSentimentAlertResult {
  ok:     boolean;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN STATS
// ─────────────────────────────────────────────────────────────────────────────

export interface SentimentGlobalStats {
  totalSnapshots:    number;
  totalAlerts:       number;
  activeAlerts:      number;
  symbolsCovered:    number;
  currentMarketZone: FearGreedZone;
  currentFearGreed:  number;
  avgFearGreed7d:    number;
  mostBullishSymbol: { symbol: string; overallSentiment: number } | null;
  mostBearishSymbol: { symbol: string; overallSentiment: number } | null;
  highestVolumeSymbol: { symbol: string; totalVolume: number } | null;
  byZone:            Record<FearGreedZone, number>;
  topUserByAlerts:   { userId: string; count: number } | null;
}
