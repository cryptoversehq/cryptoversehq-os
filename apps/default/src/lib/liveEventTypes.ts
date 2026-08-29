/**
 * liveEventTypes.ts
 *
 * Complete type definitions for the CryptoVerse HQ Live Events system.
 *
 * Covers:
 *   - LiveEvent          (scheduled competitions, tournaments, webinars)
 *   - EventParticipant   (registration + performance record)
 *   - EventType          (weekend_challenge, monthly_tournament, …)
 *   - EventStatus        (scheduled → active → completed | cancelled)
 *   - EventRules         (per-type rule schemas)
 *   - PrizeDistribution  (rank-based CP coin awards)
 *   - LeaderboardEntry   (live ranked view during an event)
 *   - EventNotification  (in-app events triggered by status changes)
 *   - Filters / sort
 *   - Constants
 */

// ─────────────────────────────────────────────────────────────────────────────
// EVENT TYPE
// ─────────────────────────────────────────────────────────────────────────────

export type EventType =
  | 'weekend_challenge'   // 48h trading simulation — max profit wins
  | 'monthly_tournament'  // month-long points accumulation
  | 'team_battle'         // team vs team — aggregate score
  | 'live_webinar'        // educational live-stream event (no score)
  | 'market_analysis';    // research / prediction contest

export const EVENT_TYPE_META: Record<EventType, {
  label:       string;
  icon:        string;
  color:       string;
  bg:          string;
  text:        string;
  border:      string;
  description: string;
  hasScore:    boolean;
  hasPrize:    boolean;
}> = {
  weekend_challenge: {
    label: 'Weekend Challenge', icon: '⚡', color: '#f59e0b',
    bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30',
    description: '48-hour simulated trading blitz. Highest P&L wins.',
    hasScore: true, hasPrize: true,
  },
  monthly_tournament: {
    label: 'Monthly Tournament', icon: '🏆', color: '#6366f1',
    bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/30',
    description: 'Month-long points competition. Consistent performance rewarded.',
    hasScore: true, hasPrize: true,
  },
  team_battle: {
    label: 'Team Battle', icon: '⚔️', color: '#ef4444',
    bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30',
    description: 'Squads compete — aggregate team score determines the winner.',
    hasScore: true, hasPrize: true,
  },
  live_webinar: {
    label: 'Live Webinar', icon: '🎙️', color: '#22c55e',
    bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30',
    description: 'Educational live session with expert traders. Free to join.',
    hasScore: false, hasPrize: false,
  },
  market_analysis: {
    label: 'Market Analysis', icon: '📊', color: '#06b6d4',
    bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/30',
    description: 'Submit your market prediction. Closest to reality wins.',
    hasScore: true, hasPrize: true,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// EVENT STATUS
// ─────────────────────────────────────────────────────────────────────────────

export type EventStatus = 'scheduled' | 'active' | 'completed' | 'cancelled';

export const EVENT_STATUS_META: Record<EventStatus, {
  label:  string;
  color:  string;
  bg:     string;
  text:   string;
  border: string;
  icon:   string;
}> = {
  scheduled:  { label: 'Scheduled', color: '#94a3b8', bg: 'bg-slate-500/10',   text: 'text-slate-400',   border: 'border-slate-500/30',   icon: '🕐' },
  active:     { label: 'Live Now',  color: '#22c55e', bg: 'bg-green-500/10',   text: 'text-green-400',   border: 'border-green-500/30',   icon: '🟢' },
  completed:  { label: 'Ended',     color: '#6366f1', bg: 'bg-indigo-500/10',  text: 'text-indigo-400',  border: 'border-indigo-500/30',  icon: '✅' },
  cancelled:  { label: 'Cancelled', color: '#ef4444', bg: 'bg-red-500/10',     text: 'text-red-400',     border: 'border-red-500/30',     icon: '❌' },
};

// ─────────────────────────────────────────────────────────────────────────────
// RULES SCHEMA (per event type)
// ─────────────────────────────────────────────────────────────────────────────

export interface WeekendChallengeRules {
  type:              'weekend_challenge';
  scoringMetric:     'pnl_percent' | 'total_profit' | 'sharpe_ratio';
  allowedAssets:     string[];   // e.g. ['BTC', 'ETH', 'SOL'] — empty = all
  startingBalance:   number;     // simulated balance in USD
  maxLeverage:       number;
  shortingAllowed:   boolean;
}

export interface MonthlyTournamentRules {
  type:          'monthly_tournament';
  scoringMetric: 'cumulative_pnl' | 'win_rate' | 'risk_adjusted';
  pointsPerWin:  number;
  allowedAssets: string[];
  maxPositions:  number;
}

export interface TeamBattleRules {
  type:          'team_battle';
  teamSize:      number;         // max members per team
  scoringMetric: 'avg_pnl' | 'total_pnl' | 'best_member';
  allowedAssets: string[];
}

export interface LiveWebinarRules {
  type:        'live_webinar';
  presenter:   string;
  topic:       string;
  platform:    'zoom' | 'discord' | 'youtube' | 'in_app';
  recordingAvailable: boolean;
}

export interface MarketAnalysisRules {
  type:          'market_analysis';
  asset:         string;          // e.g. 'BTC'
  predictionType:'price_target' | 'direction' | 'range';
  targetDate:    string;          // ISO-8601 date
  scoringMethod: 'closest_wins' | 'percent_error';
}

export type EventRules =
  | WeekendChallengeRules
  | MonthlyTournamentRules
  | TeamBattleRules
  | LiveWebinarRules
  | MarketAnalysisRules;

// ─────────────────────────────────────────────────────────────────────────────
// PRIZE DISTRIBUTION
// ─────────────────────────────────────────────────────────────────────────────

export interface PrizeRank {
  rank:       number;
  amount:     number;   // CP coins
  percentage: number;   // % of prize pool (for display)
  label:      string;   // e.g. "1st Place", "Top 10%"
}

export interface PrizeDistribution {
  type:   'top_n' | 'percentage_split' | 'all_participants' | 'winner_takes_all';
  ranks:  PrizeRank[];
}

/** Generate a standard top-N prize distribution for a prize pool. */
export function makeTopNDistribution(
  prizePool:   number,
  topN:        number,
  splitRatios: number[],  // must sum to 1.0; length = topN
): PrizeDistribution {
  const ranks: PrizeRank[] = splitRatios.slice(0, topN).map((ratio, i) => ({
    rank:       i + 1,
    amount:     Math.floor(prizePool * ratio),
    percentage: Math.round(ratio * 100),
    label:      i === 0 ? '🥇 1st Place' : i === 1 ? '🥈 2nd Place' : i === 2 ? '🥉 3rd Place' : `#${i + 1}`,
  }));
  return { type: 'top_n', ranks };
}

/** Standard distributions by event type. */
export const STANDARD_DISTRIBUTIONS: Record<EventType, (pool: number) => PrizeDistribution> = {
  weekend_challenge:   (p) => makeTopNDistribution(p, 5,  [0.40, 0.25, 0.15, 0.10, 0.10]),
  monthly_tournament:  (p) => makeTopNDistribution(p, 10, [0.30, 0.20, 0.15, 0.10, 0.08, 0.06, 0.04, 0.03, 0.02, 0.02]),
  team_battle:         (p) => makeTopNDistribution(p, 3,  [0.50, 0.30, 0.20]),
  live_webinar:        (_) => ({ type: 'all_participants', ranks: [] }),
  market_analysis:     (p) => makeTopNDistribution(p, 3,  [0.60, 0.25, 0.15]),
};

// ─────────────────────────────────────────────────────────────────────────────
// LIVE EVENT
// ─────────────────────────────────────────────────────────────────────────────

export interface LiveEvent {
  // ── Identity ──────────────────────────────────────────────────────────────
  id:          string;   // UUIDv4 primary key
  title:       string;
  description: string;
  type:        EventType;

  // ── Schedule ──────────────────────────────────────────────────────────────
  startTime: string;   // ISO-8601
  endTime:   string;   // ISO-8601

  // ── Rules ─────────────────────────────────────────────────────────────────
  rules:           EventRules;
  minLevel:        number;   // minimum academy level required (0 = open)
  entryFee:        number;   // in CP coins (0 = free)

  // ── Prizes ────────────────────────────────────────────────────────────────
  prizePool:          number;             // CP coins
  prizeDistribution:  PrizeDistribution;

  // ── Participation ─────────────────────────────────────────────────────────
  participants:    number;
  maxParticipants: number | null;   // null = unlimited
  registrationOpen: boolean;

  // ── Status ────────────────────────────────────────────────────────────────
  status:    EventStatus;
  createdAt: string;   // ISO-8601
  createdBy: string;   // admin user ID

  // ── Media ─────────────────────────────────────────────────────────────────
  bannerColor:  string;   // CSS hex — used for the event card gradient
  tags:         string[];
  featured:     boolean;  // shown in the hero banner
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENT PARTICIPANT
// ─────────────────────────────────────────────────────────────────────────────

export interface EventParticipant {
  // ── Identity ──────────────────────────────────────────────────────────────
  id:      string;   // UUIDv4 primary key
  eventId: string;   // references LiveEvent.id
  userId:  string;   // references users.id

  // ── Performance ───────────────────────────────────────────────────────────
  rank:  number | null;
  score: number | null;   // depends on event type scoring metric
  prize: number | null;   // CP coins won (null = not yet distributed)

  // ── Team (for team_battle) ────────────────────────────────────────────────
  teamId:   string | null;
  teamName: string | null;

  // ── Submission (for market_analysis) ─────────────────────────────────────
  prediction: number | null;   // submitted price prediction

  // ── Metadata ──────────────────────────────────────────────────────────────
  registrationTime: string;    // ISO-8601
  completedAt:      string | null;
  entryFeePaid:     number;    // CP coins paid at registration
  prizeClaimed:     boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// LEADERBOARD
// ─────────────────────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  rank:      number;
  userId:    string;
  displayName: string;   // anonymized: "Trader #4821" during live events
  score:     number;
  prize:     number | null;
  teamName:  string | null;
  isCurrentUser: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// FILTERS & SORTING — EVENTS
// ─────────────────────────────────────────────────────────────────────────────

export type EventSortKey =
  | 'start_asc'       // soonest first (default for scheduled)
  | 'start_desc'      // latest first
  | 'prize_desc'      // highest prize pool
  | 'participants_desc'
  | 'newest';

export interface EventFilters {
  types:      EventType[];
  statuses:   EventStatus[];
  featured:   boolean | null;
  freeOnly:   boolean;
  minPrizePool: number;
  search:     string;
  sortBy:     EventSortKey;
}

export const DEFAULT_EVENT_FILTERS: EventFilters = {
  types:        [],
  statuses:     [],
  featured:     null,
  freeOnly:     false,
  minPrizePool: 0,
  search:       '',
  sortBy:       'start_asc',
};

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** Maximum events stored in the registry. */
export const MAX_EVENTS = 200;

/** Maximum participants per event (hard cap for simulation). */
export const MAX_PARTICIPANTS_HARD_CAP = 10_000;

/** How often the status engine checks for scheduled → active transitions (ms). */
export const EVENT_STATUS_CHECK_INTERVAL_MS = 15_000;

/** Score simulation tick — how often live scores update during active events (ms). */
export const SCORE_TICK_INTERVAL_MS = 20_000;

/** CP coin transaction type for event entry fees. */
export const EVENT_ENTRY_FEE_TX_TYPE = 'event_entry' as const;

/** CP coin transaction type for prize payouts. */
export const EVENT_PRIZE_TX_TYPE = 'competition_prize' as const;

/** Number of pre-seeded historical events on first load. */
export const SEED_PAST_EVENTS    = 8;
export const SEED_FUTURE_EVENTS  = 6;
export const SEED_ACTIVE_EVENTS  = 2;

// ─────────────────────────────────────────────────────────────────────────────
// RESULT TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface RegisterForEventResult {
  ok:            boolean;
  participantId?: string;
  errors?:       string[];
}

export interface WithdrawFromEventResult {
  ok:     boolean;
  refund: number;   // CP coins refunded (0 if non-refundable)
  error?: string;
}

export interface AdminCreateEventResult {
  ok:      boolean;
  eventId?: string;
  errors?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN STATS
// ─────────────────────────────────────────────────────────────────────────────

export interface LiveEventGlobalStats {
  totalEvents:         number;
  activeEvents:        number;
  scheduledEvents:     number;
  completedEvents:     number;
  cancelledEvents:     number;
  totalParticipations: number;
  totalPrizePool:      number;   // all-time CP coins offered
  totalPrizesAwarded:  number;   // all-time CP coins paid out
  avgParticipantsPerEvent: number;
  byType:              Record<EventType, number>;
  mostPopularEvent:    { title: string; participants: number } | null;
  largestPrizeEvent:   { title: string; prizePool: number } | null;
}
