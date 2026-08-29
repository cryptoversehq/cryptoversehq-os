/**
 * adminBacktestStore.ts
 *
 * Admin-side store for the CryptoVerse HQ Backtest Engine.
 *
 * Responsibilities:
 *   - Platform-wide backtest analytics (BacktestGlobalStats)
 *   - Queue oversight (view all pending/processing entries)
 *   - Force-cancel any running or pending session
 *   - Per-user session summaries for the admin user table
 *   - Clearing stuck/stale sessions from the queue
 *
 * Follows the same thin-facade pattern as adminBotStore / adminStrategyStore:
 * reads from primary stores; writes only through their public actions.
 */

import { create } from 'zustand';
import {
  BacktestGlobalStats,
  BacktestSession,
  BacktestQueueEntry,
} from './backtestTypes';
import { useBacktestStore } from './backtestStore';
import type { StrategyType } from './strategyTypes';
import type { Timeframe } from './marketEngine';

// ─────────────────────────────────────────────────────────────────────────────
// STATE INTERFACE
// ─────────────────────────────────────────────────────────────────────────────

export interface AdminBacktestState {

  // ── Analytics ─────────────────────────────────────────────────────────────

  /** Returns platform-wide backtest statistics (computed on demand). */
  getGlobalStats: () => BacktestGlobalStats;

  /** Returns all sessions across all users, newest first. */
  getAllSessions: (filter?: {
    userId?:       string;
    strategyType?: StrategyType | 'custom';
    status?:       BacktestSession['status'];
    symbol?:       string;
    limit?:        number;
  }) => BacktestSession[];

  /** Returns all queue entries (including completed/failed history). */
  getAllQueueEntries: (filter?: {
    status?: BacktestQueueEntry['status'];
    userId?: string;
    limit?:  number;
  }) => BacktestQueueEntry[];

  /** Returns aggregate stats per user. */
  getUserSummaries: () => Array<{
    userId:        string;
    total:         number;
    completed:     number;
    failed:        number;
    avgReturn:     number;
    avgWinRate:    number;
    totalTrades:   number;
  }>;

  /** Returns the current queue depth (pending + processing). */
  getQueueDepth: () => { queued: number; processing: number; total: number };

  // ── Intervention ──────────────────────────────────────────────────────────

  /**
   * Force-cancels a pending or running session.
   * Marks it as 'failed' with a reason string.
   * Admin-only — bypasses userId ownership check.
   */
  forceCancelSession: (params: {
    sessionId: string;
    adminId:   string;
    reason:    string;
  }) => { ok: boolean; error?: string };

  /**
   * Removes all stale 'processing' entries from the queue that have
   * been in that state for longer than staleThresholdMs.
   * Returns the number of entries cleared.
   */
  clearStaleQueue: (staleThresholdMs?: number) => { cleared: number };

  /**
   * Clears the full completed/failed queue history for housekeeping.
   */
  clearQueueHistory: () => { cleared: number };

  // ── Top-N helpers ─────────────────────────────────────────────────────────

  /** Returns sessions sorted by a metric, optionally limited. */
  getTopSessions: (params: {
    metric: 'totalReturn' | 'winRate' | 'sharpeRatio' | 'maxDrawdown';
    limit?:  number;
    ascending?: boolean;
  }) => BacktestSession[];
}

// ─────────────────────────────────────────────────────────────────────────────
// STORE
// ─────────────────────────────────────────────────────────────────────────────

export const useAdminBacktestStore = create<AdminBacktestState>(() => ({

  // ── Analytics ───────────────────────────────────────────────────────────────

  getGlobalStats: (): BacktestGlobalStats => {
    const { sessions, queue } = useBacktestStore.getState();
    const allSessions  = Object.values(sessions);
    const allQueue     = Object.values(queue);
    const completed    = allSessions.filter(s => s.status === 'completed');

    // Aggregations
    const avgReturnPct = completed.length > 0
      ? completed.reduce((s, x) => s + (x.metrics?.totalReturn ?? 0), 0) / completed.length
      : 0;
    const avgWinRate = completed.length > 0
      ? completed.reduce((s, x) => s + (x.metrics?.winRate ?? 0), 0) / completed.length
      : 0;
    const avgDrawdown = completed.length > 0
      ? completed.reduce((s, x) => s + (x.metrics?.maxDrawdown ?? 0), 0) / completed.length
      : 0;
    const avgDurationMs = completed.length > 0
      ? completed.reduce((s, x) => s + (x.durationMs ?? 0), 0) / completed.length
      : 0;
    const totalTrades = completed.reduce((s, x) => s + (x.metrics?.totalTrades ?? 0), 0);

    // By strategy type
    const allTypes: Array<StrategyType | 'custom'> = ['grid', 'martingale', 'dca', 'arbitrage', 'rebalancing', 'custom'];
    const byStrategyType: BacktestGlobalStats['byStrategyType'] = {};
    for (const t of allTypes) {
      const group = completed.filter(s => s.strategyType === t);
      byStrategyType[t] = {
        count:      group.length,
        avgReturn:  group.length > 0 ? group.reduce((s, x) => s + (x.metrics?.totalReturn ?? 0), 0) / group.length : 0,
        avgWinRate: group.length > 0 ? group.reduce((s, x) => s + (x.metrics?.winRate ?? 0), 0) / group.length : 0,
      };
    }

    // By symbol
    const symbolSet = new Set(allSessions.map(s => s.params.symbol));
    const bySymbol: BacktestGlobalStats['bySymbol'] = {};
    for (const sym of symbolSet) {
      const group = completed.filter(s => s.params.symbol === sym);
      bySymbol[sym] = {
        count:     allSessions.filter(s => s.params.symbol === sym).length,
        avgReturn: group.length > 0 ? group.reduce((s, x) => s + (x.metrics?.totalReturn ?? 0), 0) / group.length : 0,
      };
    }

    // By timeframe
    const tfSet = new Set(allSessions.map(s => s.params.timeframe));
    const byTimeframe: BacktestGlobalStats['byTimeframe'] = {};
    for (const tf of tfSet) {
      byTimeframe[tf] = { count: allSessions.filter(s => s.params.timeframe === tf).length };
    }

    return {
      totalSessions:     allSessions.length,
      completedSessions: completed.length,
      failedSessions:    allSessions.filter(s => s.status === 'failed').length,
      runningSessions:   allSessions.filter(s => s.status === 'running').length,
      pendingSessions:   allSessions.filter(s => s.status === 'pending').length,
      totalTrades,
      avgReturnPct:      Math.round(avgReturnPct * 100) / 100,
      avgWinRate:        Math.round(avgWinRate * 100) / 100,
      avgDrawdown:       Math.round(avgDrawdown * 100) / 100,
      avgDurationMs:     Math.round(avgDurationMs),
      byStrategyType,
      bySymbol,
      byTimeframe,
      queueDepth:        allQueue.filter(e => e.status === 'queued').length,
      processingCount:   allQueue.filter(e => e.status === 'processing').length,
    };
  },

  getAllSessions: (filter = {}) => {
    let sessions = Object.values(useBacktestStore.getState().sessions);
    if (filter.userId)       sessions = sessions.filter(s => s.userId === filter.userId);
    if (filter.strategyType) sessions = sessions.filter(s => s.strategyType === filter.strategyType);
    if (filter.status)       sessions = sessions.filter(s => s.status === filter.status);
    if (filter.symbol)       sessions = sessions.filter(s => s.params.symbol === filter.symbol);
    sessions = sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (filter.limit)        sessions = sessions.slice(0, filter.limit);
    return sessions;
  },

  getAllQueueEntries: (filter = {}) => {
    let entries = Object.values(useBacktestStore.getState().queue);
    if (filter.status) entries = entries.filter(e => e.status === filter.status);
    if (filter.userId) entries = entries.filter(e => e.userId === filter.userId);
    entries = entries.sort((a, b) =>
      a.priority - b.priority || b.createdAt.localeCompare(a.createdAt),
    );
    if (filter.limit) entries = entries.slice(0, filter.limit);
    return entries;
  },

  getUserSummaries: () => {
    const allSessions = Object.values(useBacktestStore.getState().sessions);
    const map: Record<string, {
      userId: string; total: number; completed: number;
      failed: number; returns: number[]; winRates: number[]; totalTrades: number;
    }> = {};

    for (const s of allSessions) {
      if (!map[s.userId]) {
        map[s.userId] = { userId: s.userId, total: 0, completed: 0, failed: 0, returns: [], winRates: [], totalTrades: 0 };
      }
      const m = map[s.userId];
      m.total++;
      if (s.status === 'completed') {
        m.completed++;
        m.returns.push(s.metrics?.totalReturn ?? 0);
        m.winRates.push(s.metrics?.winRate ?? 0);
        m.totalTrades += s.metrics?.totalTrades ?? 0;
      }
      if (s.status === 'failed') m.failed++;
    }

    return Object.values(map).map(m => ({
      userId:      m.userId,
      total:       m.total,
      completed:   m.completed,
      failed:      m.failed,
      avgReturn:   m.returns.length > 0 ? Math.round((m.returns.reduce((a, b) => a + b, 0) / m.returns.length) * 100) / 100 : 0,
      avgWinRate:  m.winRates.length > 0 ? Math.round((m.winRates.reduce((a, b) => a + b, 0) / m.winRates.length) * 100) / 100 : 0,
      totalTrades: m.totalTrades,
    })).sort((a, b) => b.total - a.total);
  },

  getQueueDepth: () => {
    const entries = Object.values(useBacktestStore.getState().queue);
    return {
      queued:     entries.filter(e => e.status === 'queued').length,
      processing: entries.filter(e => e.status === 'processing').length,
      total:      entries.filter(e => e.status === 'queued' || e.status === 'processing').length,
    };
  },

  // ── Intervention ────────────────────────────────────────────────────────────

  forceCancelSession: ({ sessionId, adminId, reason }) => {
    if (!reason.trim()) return { ok: false, error: 'A reason is required.' };

    const { sessions, queue } = useBacktestStore.getState();
    const session = sessions[sessionId];
    if (!session) return { ok: false, error: 'Session not found.' };
    if (session.status === 'completed') return { ok: false, error: 'Cannot cancel a completed session.' };

    const now = new Date().toISOString();
    const cancelledSession: BacktestSession = {
      ...session,
      status:       'failed',
      errorMessage: `Cancelled by admin (${adminId}): ${reason}`,
      completedAt:  now,
    };

    const newSessions = { ...sessions, [sessionId]: cancelledSession };

    // Also cancel associated queue entries
    const newQueue = { ...queue };
    for (const entry of Object.values(newQueue)) {
      if (entry.sessionId === sessionId && (entry.status === 'queued' || entry.status === 'processing')) {
        newQueue[entry.id] = { ...entry, status: 'failed', errorMessage: `Admin cancelled: ${reason}` };
      }
    }

    const { localStorage: ls } = window;
    ls.setItem('cryptoverse_backtest_sessions_v1', JSON.stringify(newSessions));
    ls.setItem('cryptoverse_backtest_queue_v1',    JSON.stringify(newQueue));

    // Trigger re-render via store
    useBacktestStore.setState({ sessions: newSessions, queue: newQueue });

    return { ok: true };
  },

  clearStaleQueue: (staleThresholdMs = 5 * 60_000) => {
    const { sessions, queue } = useBacktestStore.getState();
    const now = Date.now();
    const newQueue = { ...queue };
    let cleared = 0;

    for (const entry of Object.values(newQueue)) {
      if (entry.status !== 'processing') continue;
      const ageMs = now - new Date(entry.processedAt ?? entry.createdAt).getTime();
      if (ageMs >= staleThresholdMs) {
        newQueue[entry.id] = { ...entry, status: 'failed', errorMessage: 'Stale — timed out.' };

        // Also mark the associated session as failed
        const s = sessions[entry.sessionId];
        if (s && s.status === 'running') {
          const failedSession: BacktestSession = {
            ...s,
            status:       'failed',
            errorMessage: 'Timed out — cleared by admin.',
            completedAt:  new Date().toISOString(),
          };
          sessions[entry.sessionId] = failedSession;
        }
        cleared++;
      }
    }

    if (cleared > 0) {
      window.localStorage.setItem('cryptoverse_backtest_queue_v1', JSON.stringify(newQueue));
      window.localStorage.setItem('cryptoverse_backtest_sessions_v1', JSON.stringify(sessions));
      useBacktestStore.setState({ queue: newQueue, sessions: { ...sessions } });
    }

    return { cleared };
  },

  clearQueueHistory: () => {
    const { queue } = useBacktestStore.getState();
    const newQueue = { ...queue };
    let cleared = 0;

    for (const entry of Object.values(newQueue)) {
      if (entry.status === 'completed' || entry.status === 'failed') {
        delete newQueue[entry.id];
        cleared++;
      }
    }

    window.localStorage.setItem('cryptoverse_backtest_queue_v1', JSON.stringify(newQueue));
    useBacktestStore.setState({ queue: newQueue });

    return { cleared };
  },

  // ── Top-N ───────────────────────────────────────────────────────────────────

  getTopSessions: ({ metric, limit = 10, ascending = false }) => {
    const sessions = Object.values(useBacktestStore.getState().sessions)
      .filter(s => s.status === 'completed' && s.metrics !== null);

    const getter = (s: BacktestSession): number => {
      switch (metric) {
        case 'totalReturn':  return s.metrics?.totalReturn  ?? 0;
        case 'winRate':      return s.metrics?.winRate      ?? 0;
        case 'sharpeRatio':  return s.metrics?.sharpeRatio  ?? 0;
        case 'maxDrawdown':  return s.metrics?.maxDrawdown  ?? 0;
      }
    };

    return sessions
      .sort((a, b) => ascending ? getter(a) - getter(b) : getter(b) - getter(a))
      .slice(0, limit);
  },
}));
