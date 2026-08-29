/**
 * backtestStore.ts
 *
 * Central store for the CryptoVerse HQ Backtest Engine.
 *
 * Manages two tables:
 *   - sessions   (BacktestSession — parameters + results, keyed by id)
 *   - queue      (BacktestQueueEntry — scheduler queue, keyed by id)
 *
 * Core responsibilities:
 *   - Session lifecycle: submit → queue → run → complete / fail
 *   - Queue processing: priority-ordered, FIFO within same priority, retry logic
 *   - Simulation dispatch: calls backtestEngine.runBacktest() synchronously
 *     (fast enough for in-browser use; can be moved to a Worker later)
 *   - Session querying: filter, sort, paginate for the UI
 *   - Notification bridge: fires app-wide notifications for completions
 *
 * Persistence:
 *   - `cryptoverse_backtest_sessions_v1`  — all sessions (ring buffer)
 *   - `cryptoverse_backtest_queue_v1`     — queue entries (ring buffer)
 *
 * Integration:
 *   - strategyStore.backtestResults is updated after a session completes
 *     so the marketplace strategy cards always show fresh metrics.
 */

import { create } from 'zustand';
import {
  BacktestSession,
  BacktestQueueEntry,
  BacktestParams,
  BacktestFilters,
  BacktestSortKey,
  BacktestSessionStatus,
  SubmitBacktestResult,
  BacktestRunResult,
  DEFAULT_BACKTEST_FILTERS,
  MAX_SESSIONS_PER_USER,
  MAX_TOTAL_SESSIONS,
  MAX_QUEUE_HISTORY,
  MAX_QUEUE_RETRIES,
  MIN_BACKTEST_DAYS,
  MAX_BACKTEST_DAYS,
  DEFAULT_INITIAL_BALANCE,
  DEFAULT_FEE_RATE,
} from './backtestTypes';
import { runBacktest } from './backtestEngine';
import { useCpCoinsStore } from './cpCoinsStore';
import { generateId } from './strategyUtils';
import type { StrategyType } from './strategyTypes';

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATION BRIDGE
// ─────────────────────────────────────────────────────────────────────────────

type BtNotifyPayload = {
  type:    'trade' | 'achievement' | 'system' | 'liquidation';
  title:   string;
  message: string;
};

let _btNotifyHandler: ((n: BtNotifyPayload) => void) | null = null;

export function registerBacktestNotifyHandler(fn: (n: BtNotifyPayload) => void) {
  _btNotifyHandler = fn;
}

function btNotify(n: BtNotifyPayload) {
  _btNotifyHandler?.(n);
}

// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENCE
// ─────────────────────────────────────────────────────────────────────────────

const SESSIONS_KEY = 'cryptoverse_backtest_sessions_v1';
const QUEUE_KEY    = 'cryptoverse_backtest_queue_v1';

function load<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
}
function save(key: string, data: unknown) {
  localStorage.setItem(key, JSON.stringify(data));
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

export interface BacktestValidationResult {
  valid:  boolean;
  errors: string[];
}

export function validateBacktestParams(p: BacktestParams): BacktestValidationResult {
  const errors: string[] = [];

  if (!p.coinId)   errors.push('Coin is required.');
  if (!p.symbol)   errors.push('Symbol is required.');
  if (!p.timeframe) errors.push('Timeframe is required.');

  const startMs = p.startDate ? new Date(p.startDate).getTime() : NaN;
  const endMs   = p.endDate   ? new Date(p.endDate).getTime()   : NaN;

  if (isNaN(startMs)) errors.push('Start date is required.');
  if (isNaN(endMs))   errors.push('End date is required.');

  if (!isNaN(startMs) && !isNaN(endMs)) {
    const days = (endMs - startMs) / 86_400_000;
    if (endMs <= startMs)        errors.push('End date must be after start date.');
    else if (days < MIN_BACKTEST_DAYS)  errors.push(`Minimum backtest period is ${MIN_BACKTEST_DAYS} days.`);
    else if (days > MAX_BACKTEST_DAYS)  errors.push(`Maximum backtest period is ${MAX_BACKTEST_DAYS} days.`);
  }

  if ((p.initialBalance ?? 0) < 100) errors.push('Initial balance must be at least $100.');
  if ((p.feeRate ?? 0) < 0 || (p.feeRate ?? 0) >= 0.1) errors.push('Fee rate must be between 0 and 10%.');

  return { valid: errors.length === 0, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// FILTERING & SORTING
// ─────────────────────────────────────────────────────────────────────────────

function applyBacktestFilters(sessions: BacktestSession[], filters: BacktestFilters): BacktestSession[] {
  return sessions.filter(s => {
    if (filters.search.trim()) {
      const q = filters.search.toLowerCase();
      if (!s.sessionName.toLowerCase().includes(q) && !s.params.symbol.toLowerCase().includes(q)) return false;
    }
    if (filters.statuses.length > 0 && !filters.statuses.includes(s.status)) return false;
    if (filters.strategyTypes.length > 0 && !filters.strategyTypes.includes(s.strategyType)) return false;
    if (filters.symbols.length > 0 && !filters.symbols.includes(s.params.symbol)) return false;
    if (filters.timeframes.length > 0 && !filters.timeframes.includes(s.params.timeframe)) return false;
    return true;
  });
}

function sortSessions(sessions: BacktestSession[], sortBy: BacktestSortKey): BacktestSession[] {
  const arr = [...sessions];
  switch (sortBy) {
    case 'newest':         return arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    case 'oldest':         return arr.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    case 'highest_return': return arr.sort((a, b) => (b.metrics?.totalReturn ?? -Infinity) - (a.metrics?.totalReturn ?? -Infinity));
    case 'lowest_drawdown':return arr.sort((a, b) => (a.metrics?.maxDrawdown ?? Infinity) - (b.metrics?.maxDrawdown ?? Infinity));
    case 'best_sharpe':    return arr.sort((a, b) => (b.metrics?.sharpeRatio ?? -Infinity) - (a.metrics?.sharpeRatio ?? -Infinity));
    case 'most_trades':    return arr.sort((a, b) => (b.metrics?.totalTrades ?? 0) - (a.metrics?.totalTrades ?? 0));
    case 'best_win_rate':  return arr.sort((a, b) => (b.metrics?.winRate ?? 0) - (a.metrics?.winRate ?? 0));
    default:               return arr;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STATE INTERFACE
// ─────────────────────────────────────────────────────────────────────────────

export interface BacktestState {
  sessions: Record<string, BacktestSession>;
  queue:    Record<string, BacktestQueueEntry>;

  // ── Submit ────────────────────────────────────────────────────────────────

  /**
   * Validates params, creates a BacktestSession in 'pending' state,
   * adds a BacktestQueueEntry, then immediately processes the queue.
   */
  submitBacktest: (params: {
    userId:       string;
    params:       BacktestParams;
    strategyId?:  string | null;
    strategyType: StrategyType | 'custom';
    sessionName?: string;
    priority?:    1 | 2 | 3;
  }) => SubmitBacktestResult;

  // ── Run ───────────────────────────────────────────────────────────────────

  /**
   * Synchronously runs the next pending queue entry.
   * Called automatically after submitBacktest; can also be polled externally.
   */
  processQueue: () => void;

  /**
   * Runs a specific session immediately (bypasses queue).
   * Used for high-priority or manual re-runs.
   */
  runSession: (sessionId: string) => BacktestRunResult;

  /**
   * Re-queues a failed session for retry.
   */
  retrySession: (sessionId: string, userId: string) => SubmitBacktestResult;

  // ── CRUD ──────────────────────────────────────────────────────────────────

  /** Permanently deletes a session and its queue entry (if any). */
  deleteSession: (sessionId: string, userId: string) => { ok: boolean; error?: string };

  /** Clears all completed/failed sessions for a user. */
  clearUserHistory: (userId: string) => { ok: boolean; cleared: number };

  // ── Queries ───────────────────────────────────────────────────────────────

  /** Returns all sessions for a user, filtered and sorted. */
  getUserSessions: (userId: string, filters?: BacktestFilters) => BacktestSession[];

  /** Returns a single session by ID, or null. */
  getSession: (sessionId: string) => BacktestSession | null;

  /** Returns the queue entry for a session, or null. */
  getQueueEntry: (sessionId: string) => BacktestQueueEntry | null;

  /** Returns all pending/processing queue entries, priority-sorted. */
  getPendingQueue: () => BacktestQueueEntry[];

  /** Aggregate stats for a user's sessions. */
  getUserStats: (userId: string) => {
    total:     number;
    completed: number;
    failed:    number;
    running:   number;
    avgReturn: number;
    avgWinRate: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// STORE
// ─────────────────────────────────────────────────────────────────────────────

export const useBacktestStore = create<BacktestState>((set, get) => {
  const sessions = load<Record<string, BacktestSession>>(SESSIONS_KEY, {});
  const queue    = load<Record<string, BacktestQueueEntry>>(QUEUE_KEY, {});

  return {
    sessions,
    queue,

    // ── Submit ────────────────────────────────────────────────────────────────

    submitBacktest: ({ userId, params, strategyId = null, strategyType, sessionName, priority = 2 }) => {
      // Defaults
      params = {
        ...params,
        initialBalance: params.initialBalance ?? DEFAULT_INITIAL_BALANCE,
        feeRate:        params.feeRate        ?? DEFAULT_FEE_RATE,
        strategyConfig: params.strategyConfig ?? {},
      };

      // Validate
      const validation = validateBacktestParams(params);
      if (!validation.valid) return { ok: false, errors: validation.errors };

      // User session cap
      const userCount = Object.values(get().sessions).filter(s => s.userId === userId).length;
      if (userCount >= MAX_SESSIONS_PER_USER) {
        // Prune oldest completed/failed to make room
        const oldSessions = Object.values(get().sessions)
          .filter(s => s.userId === userId && (s.status === 'completed' || s.status === 'failed'))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        if (oldSessions.length === 0) {
          return { ok: false, errors: [`Maximum ${MAX_SESSIONS_PER_USER} sessions per user.`] };
        }
        get().deleteSession(oldSessions[0].id, userId);
      }

      const now = new Date().toISOString();
      const sessionId = generateId();
      const queueId   = generateId();

      const name = sessionName?.trim() ||
        `${strategyType.charAt(0).toUpperCase() + strategyType.slice(1)} — ${params.symbol} ${params.timeframe}`;

      const session: BacktestSession = {
        id:           sessionId,
        userId,
        strategyId,
        strategyType,
        sessionName:  name,
        params,
        status:       'pending',
        durationMs:   null,
        errorMessage: null,
        metrics:      null,
        trades:       [],
        createdAt:    now,
        startedAt:    null,
        completedAt:  null,
      };

      const queueEntry: BacktestQueueEntry = {
        id:           queueId,
        sessionId,
        userId,
        priority,
        status:       'queued',
        attempts:     0,
        errorMessage: null,
        createdAt:    now,
        processedAt:  null,
      };

      const newSessions = { ...get().sessions, [sessionId]: session };
      const newQueue    = { ...get().queue,    [queueId]:   queueEntry };

      // Global ring buffer
      const allSessions = Object.values(newSessions);
      if (allSessions.length > MAX_TOTAL_SESSIONS) {
        const oldest = allSessions
          .filter(s => s.status === 'completed' || s.status === 'failed')
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
        if (oldest) delete newSessions[oldest.id];
      }

      save(SESSIONS_KEY, newSessions);
      save(QUEUE_KEY,    newQueue);
      set({ sessions: newSessions, queue: newQueue });

      // Process immediately
      setTimeout(() => get().processQueue(), 0);

      return { ok: true, sessionId, queueId };
    },

    // ── Queue processing ──────────────────────────────────────────────────────

    processQueue: () => {
      const { queue } = get();
      const pending = Object.values(queue)
        .filter(e => e.status === 'queued')
        .sort((a, b) =>
          a.priority - b.priority ||
          a.createdAt.localeCompare(b.createdAt),
        );

      if (pending.length === 0) return;

      const next = pending[0];
      get().runSession(next.sessionId);
    },

    runSession: (sessionId) => {
      const { sessions, queue } = get();
      const session = sessions[sessionId];
      if (!session) return { ok: false, error: 'Session not found.' };
      if (session.status === 'running') return { ok: false, error: 'Session is already running.' };
      if (session.status === 'completed') return { ok: false, error: 'Session already completed.' };

      const now = new Date().toISOString();

      // Mark session as running
      const runningSession: BacktestSession = { ...session, status: 'running', startedAt: now };

      // Find and mark queue entry as processing
      const queueEntry = Object.values(queue).find(e => e.sessionId === sessionId);
      const updatedEntry = queueEntry
        ? { ...queueEntry, status: 'processing' as const, attempts: queueEntry.attempts + 1, processedAt: now }
        : null;

      const newQueue = { ...queue };
      if (updatedEntry) newQueue[updatedEntry.id] = updatedEntry;

      set({ sessions: { ...sessions, [sessionId]: runningSession }, queue: newQueue });
      save(SESSIONS_KEY, { ...sessions, [sessionId]: runningSession });
      save(QUEUE_KEY, newQueue);

      // Run the engine
      try {
        const result = runBacktest({
          params:       session.params,
          strategyType: session.strategyType,
          sessionName:  session.sessionName,
        });

        const completedAt = new Date().toISOString();
        const completed: BacktestSession = {
          ...runningSession,
          status:      'completed',
          durationMs:  result.durationMs,
          metrics:     result.metrics,
          trades:      result.trades,
          completedAt,
        };

        const finalQueue = { ...get().queue };
        if (updatedEntry) {
          finalQueue[updatedEntry.id] = { ...updatedEntry, status: 'completed' };
        }

        // Prune old queue entries
        const queueEntries = Object.values(finalQueue);
        if (queueEntries.length > MAX_QUEUE_HISTORY) {
          const oldEntries = queueEntries
            .filter(e => e.status === 'completed' || e.status === 'failed')
            .sort((a, b) => (a.processedAt ?? a.createdAt).localeCompare(b.processedAt ?? b.createdAt));
          if (oldEntries[0]) delete finalQueue[oldEntries[0].id];
        }

        const finalSessions = { ...get().sessions, [sessionId]: completed };
        save(SESSIONS_KEY, finalSessions);
        save(QUEUE_KEY,    finalQueue);
        set({ sessions: finalSessions, queue: finalQueue });

        // P1.2: CP reward for first completed backtest
        if (result.metrics.totalTrades > 0) {
          const completedCount = Object.values(get().sessions).filter(
            s => s.userId === session.userId && s.status === 'completed'
          ).length;
          if (completedCount <= 1) {
            try {
              useCpCoinsStore.getState().credit({
                userId: session.userId,
                amount: 50,
                type: 'achievement_reward' as any,
                description: 'First backtest completed! 🎉 (+50 CP)',
              });
            } catch {}
          }
        }

        // Notify
        const ret = result.metrics.totalReturn;
        const sign = ret >= 0 ? '+' : '';
        btNotify({
          type:    ret >= 0 ? 'achievement' : 'system',
          title:   `📈 Backtest Complete — ${session.sessionName}`,
          message: `${session.params.symbol} ${session.params.timeframe} | Return: ${sign}${ret.toFixed(2)}% | Win Rate: ${result.metrics.winRate.toFixed(1)}%`,
        });

        // Continue processing queue
        setTimeout(() => get().processQueue(), 0);

        return { ok: true, session: completed };

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown simulation error';
        const failedAt     = new Date().toISOString();

        const attempts = updatedEntry?.attempts ?? 1;
        const shouldRetry = attempts < MAX_QUEUE_RETRIES;

        const failedSession: BacktestSession = {
          ...runningSession,
          status:       shouldRetry ? 'pending' : 'failed',
          errorMessage,
          completedAt:  failedAt,
        };

        const finalQueue = { ...get().queue };
        if (updatedEntry) {
          finalQueue[updatedEntry.id] = {
            ...updatedEntry,
            status:       shouldRetry ? 'queued' : 'failed',
            errorMessage,
          };
        }

        const finalSessions = { ...get().sessions, [sessionId]: failedSession };
        save(SESSIONS_KEY, finalSessions);
        save(QUEUE_KEY,    finalQueue);
        set({ sessions: finalSessions, queue: finalQueue });

        if (!shouldRetry) {
          btNotify({
            type:    'liquidation',
            title:   `⚠️ Backtest Failed — ${session.sessionName}`,
            message: errorMessage,
          });
        }

        // Continue processing queue
        setTimeout(() => get().processQueue(), 0);

        return { ok: false, error: errorMessage };
      }
    },

    retrySession: (sessionId, userId) => {
      const session = get().sessions[sessionId];
      if (!session) return { ok: false, errors: ['Session not found.'] };
      if (session.userId !== userId) return { ok: false, errors: ['Permission denied.'] };
      if (session.status !== 'failed') return { ok: false, errors: ['Only failed sessions can be retried.'] };

      return get().submitBacktest({
        userId,
        params:       session.params,
        strategyId:   session.strategyId,
        strategyType: session.strategyType,
        sessionName:  session.sessionName,
        priority:     1, // retry with highest priority
      });
    },

    // ── CRUD ──────────────────────────────────────────────────────────────────

    deleteSession: (sessionId, userId) => {
      const { sessions, queue } = get();
      const session = sessions[sessionId];
      if (!session) return { ok: false, error: 'Session not found.' };
      if (session.userId !== userId) return { ok: false, error: 'Permission denied.' };
      if (session.status === 'running') return { ok: false, error: 'Cannot delete a running session.' };

      const newSessions = { ...sessions };
      delete newSessions[sessionId];

      // Remove associated queue entries
      const newQueue = { ...queue };
      Object.values(newQueue)
        .filter(e => e.sessionId === sessionId)
        .forEach(e => delete newQueue[e.id]);

      save(SESSIONS_KEY, newSessions);
      save(QUEUE_KEY,    newQueue);
      set({ sessions: newSessions, queue: newQueue });
      return { ok: true };
    },

    clearUserHistory: (userId) => {
      const { sessions, queue } = get();
      const toDelete = Object.values(sessions)
        .filter(s => s.userId === userId && (s.status === 'completed' || s.status === 'failed'));

      const newSessions = { ...sessions };
      const newQueue    = { ...queue };

      for (const s of toDelete) {
        delete newSessions[s.id];
        Object.values(newQueue)
          .filter(e => e.sessionId === s.id)
          .forEach(e => delete newQueue[e.id]);
      }

      save(SESSIONS_KEY, newSessions);
      save(QUEUE_KEY,    newQueue);
      set({ sessions: newSessions, queue: newQueue });
      return { ok: true, cleared: toDelete.length };
    },

    // ── Queries ───────────────────────────────────────────────────────────────

    getUserSessions: (userId, filters = DEFAULT_BACKTEST_FILTERS) => {
      const userSessions = Object.values(get().sessions).filter(s => s.userId === userId);
      return sortSessions(applyBacktestFilters(userSessions, filters), filters.sortBy);
    },

    getSession: (sessionId) => get().sessions[sessionId] ?? null,

    getQueueEntry: (sessionId) => {
      return Object.values(get().queue).find(e => e.sessionId === sessionId) ?? null;
    },

    getPendingQueue: () => {
      return Object.values(get().queue)
        .filter(e => e.status === 'queued' || e.status === 'processing')
        .sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt));
    },

    getUserStats: (userId) => {
      const sessions = Object.values(get().sessions).filter(s => s.userId === userId);
      const completed = sessions.filter(s => s.status === 'completed');

      const avgReturn = completed.length > 0
        ? completed.reduce((sum, s) => sum + (s.metrics?.totalReturn ?? 0), 0) / completed.length
        : 0;
      const avgWinRate = completed.length > 0
        ? completed.reduce((sum, s) => sum + (s.metrics?.winRate ?? 0), 0) / completed.length
        : 0;

      return {
        total:     sessions.length,
        completed: completed.length,
        failed:    sessions.filter(s => s.status === 'failed').length,
        running:   sessions.filter(s => s.status === 'running').length,
        avgReturn: Math.round(avgReturn * 100) / 100,
        avgWinRate: Math.round(avgWinRate * 100) / 100,
      };
    },
  };
});
