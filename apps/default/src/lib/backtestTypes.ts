/**
 * backtestTypes.ts
 *
 * Complete type definitions for the CryptoVerse HQ Backtest Engine.
 *
 * Covers:
 *   - BacktestSession  (run record — parameters + full results)
 *   - BacktestQueue    (scheduler queue with retry logic)
 *   - BacktestTrade    (individual trade within a session)
 *   - BacktestParams   (user-supplied run parameters)
 *   - BacktestMetrics  (computed stats extracted from trades)
 *   - Filters / sort   (for session list views)
 *   - Admin types      (global stats, queue oversight)
 *   - Constants
 *
 * Deliberately extends (not replaces) the existing BacktestResult /
 * BacktestTrade types in strategyTypes.ts which are used by the
 * marketplace strategy cards. BacktestSession is the full persistent
 * record; BacktestResult remains the lightweight in-memory snapshot.
 */

import type { Timeframe } from './marketEngine';
import type { StrategyType } from './strategyTypes';

// Re-export Timeframe so consumers only need one import
export type { Timeframe };

// ─────────────────────────────────────────────────────────────────────────────
// SESSION STATUS & QUEUE STATUS
// ─────────────────────────────────────────────────────────────────────────────

export type BacktestSessionStatus =
  | 'pending'    // Submitted to queue, not yet picked up
  | 'running'    // Engine is actively simulating
  | 'completed'  // Successfully finished
  | 'failed';    // Permanently failed (after max retries)

export type BacktestQueueStatus =
  | 'queued'      // Waiting to be processed
  | 'processing'  // Currently being worked on
  | 'completed'   // Processed successfully
  | 'failed';     // All retries exhausted

export type BacktestQueuePriority = 1 | 2 | 3; // 1 = highest

// ─────────────────────────────────────────────────────────────────────────────
// TRADE WITHIN A SESSION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single simulated trade inside a BacktestSession.
 * Richer than the lightweight BacktestTrade in strategyTypes.ts —
 * includes entry/exit reason codes and running equity at close.
 */
export interface BacktestSessionTrade {
  tradeNumber:     number;
  side:            'long' | 'short';
  entryPrice:      number;       // USD price at entry
  exitPrice:       number;       // USD price at exit
  entryAt:         string;       // ISO-8601
  exitAt:          string;       // ISO-8601
  durationMinutes: number;
  quantity:        number;       // coin amount
  entryValue:      number;       // USD: entryPrice × quantity
  exitValue:       number;       // USD: exitPrice × quantity
  grossPnl:        number;       // exitValue − entryValue (signed)
  fee:             number;       // USD fees (both legs)
  netPnl:          number;       // grossPnl − fee
  pnlPct:          number;       // netPnl / entryValue × 100
  equityAfter:     number;       // running balance after this trade
  /** Signal that triggered the entry */
  entryReason:     BacktestSignalReason;
  /** Signal that triggered the exit */
  exitReason:      BacktestSignalReason;
  isWinner:        boolean;
}

/** Reason codes for entry/exit signals */
export type BacktestSignalReason =
  | 'grid_level_crossed'
  | 'dca_schedule'
  | 'dca_dip'
  | 'martingale_base'
  | 'martingale_safety'
  | 'martingale_take_profit'
  | 'arb_spread_open'
  | 'arb_spread_close'
  | 'rebalance_trigger'
  | 'stop_loss'
  | 'take_profit'
  | 'custom_signal'
  | 'session_end';

// ─────────────────────────────────────────────────────────────────────────────
// PARAMETERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * User-supplied parameters for a single backtest run.
 * These are persisted on the session record.
 */
export interface BacktestParams {
  /** CoinGecko ID of the asset to backtest */
  coinId:         string;
  /** Human-readable trading pair e.g. "BTC/USDT" */
  symbol:         string;
  /** Candle timeframe to simulate on */
  timeframe:      Timeframe;
  /** Start of the simulated historical window (ISO-8601) */
  startDate:      string;
  /** End of the simulated historical window (ISO-8601) */
  endDate:        string;
  /** Virtual USD balance at the start of the run */
  initialBalance: number;
  /** Trade fee rate as a decimal e.g. 0.001 = 0.1% */
  feeRate:        number;
  /**
   * Strategy-specific config snapshot at run time.
   * Stored as plain JSON — not referenced live.
   */
  strategyConfig: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// BACKTEST METRICS (computed section of a completed session)
// ─────────────────────────────────────────────────────────────────────────────

export interface BacktestMetrics {
  finalBalance:       number;   // USD balance at end of simulation
  totalReturn:        number;   // percentage: (finalBalance / initialBalance − 1) × 100
  totalTrades:        number;
  winningTrades:      number;
  losingTrades:       number;
  winRate:            number;   // 0–100
  profitFactor:       number;   // gross profit / gross loss (∞ if no losses)
  sharpeRatio:        number;   // annualised Sharpe (risk-free = 0)
  maxDrawdown:        number;   // peak-to-trough % drawdown
  averageWin:         number;   // mean net PnL of winning trades (USD)
  averageLoss:        number;   // mean net PnL of losing trades (USD, negative)
  averageTradePnl:    number;   // mean net PnL across all trades
  longestWinStreak:   number;
  longestLossStreak:  number;
  totalFeePaid:       number;   // cumulative fees in USD
  averageDuration:    number;   // mean trade duration in minutes
  calmarRatio:        number;   // annualised return / maxDrawdown (0 if maxDrawdown=0)
  expectancy:         number;   // winRate × averageWin + lossRate × averageLoss
  /** Sampled equity curve (max 200 points) */
  equityCurve:        number[];
  /** Per-day PnL for calendar heat-map (dayKey "YYYY-MM-DD" → net USD) */
  dailyPnl:           Record<string, number>;
}

// ─────────────────────────────────────────────────────────────────────────────
// BACKTEST SESSION (the main persistent entity)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Full record of a single backtest run.
 * Maps to the spec's BacktestSession interface and extends it with
 * richer typed result fields.
 */
export interface BacktestSession {
  // ── Identity ──────────────────────────────────────────────────────────────
  id:          string;   // UUIDv4 primary key
  userId:      string;   // owner

  /**
   * If derived from a marketplace strategy, its ID.
   * null = custom / ad-hoc run.
   */
  strategyId:   string | null;
  /** Strategy type tag — used for analytics grouping */
  strategyType: StrategyType | 'custom';
  /** Human-readable name for display (e.g. strategy name or "Custom Run") */
  sessionName:  string;

  // ── Parameters ────────────────────────────────────────────────────────────
  params:  BacktestParams;

  // ── Status ────────────────────────────────────────────────────────────────
  status:         BacktestSessionStatus;
  /** Duration of the simulation in milliseconds (set on completion) */
  durationMs:     number | null;
  errorMessage:   string | null;

  // ── Results (null until status === 'completed') ────────────────────────────
  metrics: BacktestMetrics | null;

  /**
   * Full trade log (up to MAX_SESSION_TRADES most recent trades).
   * Stored as JSON — trade count may differ from metrics.totalTrades.
   */
  trades: BacktestSessionTrade[];

  // ── Timestamps ────────────────────────────────────────────────────────────
  createdAt:   string;        // ISO-8601
  startedAt:   string | null; // ISO-8601 — when the engine began simulating
  completedAt: string | null; // ISO-8601 — when finished or failed
}

// ─────────────────────────────────────────────────────────────────────────────
// BACKTEST QUEUE ENTRY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A queue entry that schedules a BacktestSession for execution.
 * The in-browser scheduler polls the queue and processes entries in
 * priority order (1 = highest), FIFO within same priority.
 */
export interface BacktestQueueEntry {
  id:          string;                  // UUIDv4 primary key
  sessionId:   string;                  // references BacktestSession.id
  userId:      string;                  // denormalized for quick filtering
  priority:    BacktestQueuePriority;   // 1 | 2 | 3
  status:      BacktestQueueStatus;
  attempts:    number;                  // retry counter (starts at 0)
  errorMessage: string | null;          // last failure message
  createdAt:   string;                  // ISO-8601
  processedAt: string | null;           // ISO-8601 — when processing began
}

// ─────────────────────────────────────────────────────────────────────────────
// FILTERS & SORTING
// ─────────────────────────────────────────────────────────────────────────────

export type BacktestSortKey =
  | 'newest'
  | 'oldest'
  | 'highest_return'
  | 'lowest_drawdown'
  | 'best_sharpe'
  | 'most_trades'
  | 'best_win_rate';

export interface BacktestFilters {
  search:        string;             // matches sessionName, symbol
  statuses:      BacktestSessionStatus[];
  strategyTypes: Array<StrategyType | 'custom'>;
  symbols:       string[];
  timeframes:    Timeframe[];
  sortBy:        BacktestSortKey;
}

export const DEFAULT_BACKTEST_FILTERS: BacktestFilters = {
  search:        '',
  statuses:      [],
  strategyTypes: [],
  symbols:       [],
  timeframes:    [],
  sortBy:        'newest',
};

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** Maximum number of sessions stored per user before rolling (oldest removed). */
export const MAX_SESSIONS_PER_USER = 50;

/** Maximum sessions kept in the global store. */
export const MAX_TOTAL_SESSIONS = 500;

/** Maximum number of trade records stored per session (newest kept). */
export const MAX_SESSION_TRADES = 500;

/** Maximum number of equity curve points sampled per session. */
export const MAX_EQUITY_POINTS = 200;

/** Maximum queue entries kept in history. */
export const MAX_QUEUE_HISTORY = 200;

/** Maximum retry attempts before a queue entry is permanently failed. */
export const MAX_QUEUE_RETRIES = 3;

/** Default initial balance for new backtest sessions. */
export const DEFAULT_INITIAL_BALANCE = 10_000;

/** Default fee rate. */
export const DEFAULT_FEE_RATE = 0.001;

/** Minimum historical days allowed for a backtest. */
export const MIN_BACKTEST_DAYS = 7;

/** Maximum historical days allowed for a backtest. */
export const MAX_BACKTEST_DAYS = 365;

/** All supported timeframe options for the UI select. */
export const TIMEFRAME_OPTIONS: Array<{ label: string; value: Timeframe }> = [
  { label: '1 Minute',   value: '1m' },
  { label: '5 Minutes',  value: '5m' },
  { label: '15 Minutes', value: '15m' },
  { label: '1 Hour',     value: '1h' },
  { label: '4 Hours',    value: '4h' },
  { label: '1 Day',      value: '1D' },
  { label: '1 Week',     value: '1W' },
];

/** All supported symbols for the UI select. */
export const BACKTEST_SYMBOLS: Array<{ label: string; value: string; coinId: string }> = [
  { label: 'BTC/USDT',  value: 'BTC/USDT',  coinId: 'bitcoin' },
  { label: 'ETH/USDT',  value: 'ETH/USDT',  coinId: 'ethereum' },
  { label: 'SOL/USDT',  value: 'SOL/USDT',  coinId: 'solana' },
  { label: 'BNB/USDT',  value: 'BNB/USDT',  coinId: 'binancecoin' },
  { label: 'XRP/USDT',  value: 'XRP/USDT',  coinId: 'ripple' },
  { label: 'ADA/USDT',  value: 'ADA/USDT',  coinId: 'cardano' },
  { label: 'AVAX/USDT', value: 'AVAX/USDT', coinId: 'avalanche-2' },
  { label: 'DOGE/USDT', value: 'DOGE/USDT', coinId: 'dogecoin' },
  { label: 'LINK/USDT', value: 'LINK/USDT', coinId: 'chainlink' },
  { label: 'DOT/USDT',  value: 'DOT/USDT',  coinId: 'polkadot' },
];

// ─────────────────────────────────────────────────────────────────────────────
// BASE PRICES (for simulation — no live API)
// ─────────────────────────────────────────────────────────────────────────────

/** Approximate base prices for simulation seed (USD). */
export const COIN_BASE_PRICES: Record<string, number> = {
  bitcoin:     65_000,
  ethereum:    3_400,
  solana:      170,
  binancecoin: 590,
  ripple:      0.58,
  cardano:     0.45,
  'avalanche-2': 35,
  dogecoin:    0.16,
  chainlink:   15,
  polkadot:    8,
};

// ─────────────────────────────────────────────────────────────────────────────
// RESULT TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface SubmitBacktestResult {
  ok:        boolean;
  sessionId?: string;
  queueId?:  string;
  errors?:   string[];
}

export interface BacktestRunResult {
  ok:       boolean;
  session?: BacktestSession;
  error?:   string;
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface BacktestGlobalStats {
  totalSessions:      number;
  completedSessions:  number;
  failedSessions:     number;
  runningSessions:    number;
  pendingSessions:    number;
  totalTrades:        number;
  avgReturnPct:       number;
  avgWinRate:         number;
  avgDrawdown:        number;
  avgDurationMs:      number;
  byStrategyType:     Record<string, { count: number; avgReturn: number; avgWinRate: number }>;
  bySymbol:           Record<string, { count: number; avgReturn: number }>;
  byTimeframe:        Record<string, { count: number }>;
  queueDepth:         number;       // current 'queued' entries
  processingCount:    number;       // current 'processing' entries
}
