/**
 * backgroundJobStore.ts — Part 11.2
 *
 * Persistent background job tracking for long backtests (>30 seconds).
 *
 * Spec:
 *   ✅ Long backtests (>30 seconds) run in background
 *   ✅ User can navigate away and return later
 *   ✅ Progress indicator in sidebar
 *
 * Architecture:
 *   - Each BacktestPage run is registered here as a BackgroundJob
 *   - Jobs persist to localStorage so they survive page navigations
 *   - When user returns to /backtest, in-progress jobs are displayed
 *     in the sidebar progress indicator
 *   - Jobs that complete while user is on another page surface as
 *     a notification badge in the sidebar nav item
 *   - Completed job results are also stored so the user can load them
 *     without re-running
 *
 * Integration with backtestQueue.ts:
 *   - backtestQueue already runs jobs asynchronously
 *   - This store adds cross-navigation visibility by persisting job state
 *   - The QueueBar (Part 6.1) shows active jobs on the BacktestPage
 *   - BacktestProgressSidebar shows them everywhere else in the app
 */

import { create } from 'zustand';
import { cloudRecordStore } from './cloudData';
import type { EnrichedBacktestOutput } from './backtestRunner';
import type { BacktestParams } from './backtestTypes';
import type { StrategyType } from './strategyTypes';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type BgJobStatus = 'running' | 'completed' | 'failed';

export interface BackgroundJob {
  id:           string;
  userId:       string;
  name:         string;                  // human-readable: "BTC/USDT 1h Grid"
  strategyType: StrategyType | 'custom';
  params:       BacktestParams;

  status:       BgJobStatus;
  startedAt:    number;                  // Date.now()
  completedAt:  number | null;
  durationMs:   number | null;

  /** Estimated total duration in ms (based on historical avg) */
  estimatedMs:  number;

  /** 0-100 progress estimate (time-based interpolation) */
  progress:     number;

  result:       EnrichedBacktestOutput | null;
  error:        string | null;

  /** Whether the user has seen the completion notification */
  acknowledged: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENCE
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY      = 'cryptoverse_bg_jobs_v1';
const JOB_RETENTION_MS = 24 * 60 * 60 * 1_000;  // 24 hours
const MAX_STORED_JOBS  = 50;

function loadJobs(): Record<string, BackgroundJob> {
  try {
    const all = cloudRecordStore.get<Record<string, BackgroundJob>>('background_jobs', STORAGE_KEY, {});
    const now = Date.now();
    // Prune old jobs
    return Object.fromEntries(
      Object.entries(all).filter(([, j]) =>
        now - j.startedAt < JOB_RETENTION_MS
      )
    );
  } catch { return {}; }
}

function saveJobs(jobs: Record<string, BackgroundJob>): void {
  try {
    // Keep only the most recent MAX_STORED_JOBS
    const sorted = Object.values(jobs)
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, MAX_STORED_JOBS);
    const obj = Object.fromEntries(sorted.map(j => [j.id, j]));
    cloudRecordStore.set('background_jobs', STORAGE_KEY, obj);
  } catch { /* cloud persistence */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// ESTIMATED DURATION HEURISTIC
// ─────────────────────────────────────────────────────────────────────────────

/** Average historical durations in ms per strategy type (tuned empirically) */
const AVG_DURATION_MS: Record<string, number> = {
  grid:        4_000,
  dca:         3_500,
  martingale:  5_000,
  arbitrage:   6_000,
  custom:      7_000,
  rebalancing: 4_500,
};

function estimateDuration(params: BacktestParams, strategyType: string): number {
  const base  = AVG_DURATION_MS[strategyType] ?? 5_000;
  const start = new Date(params.startDate).getTime();
  const end   = new Date(params.endDate).getTime();
  const days  = (end - start) / 86_400_000;
  // Scale with date range — longer range → more candles → more work
  const scale = Math.max(1, days / 90);
  return Math.round(base * scale);
}

// ─────────────────────────────────────────────────────────────────────────────
// TIME-BASED PROGRESS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns 0-99 progress estimate based on elapsed time vs estimated duration.
 * Never reaches 100 until the job actually completes.
 */
export function computeProgress(job: BackgroundJob): number {
  if (job.status === 'completed') return 100;
  if (job.status === 'failed')    return 0;

  const elapsed   = Date.now() - job.startedAt;
  const estimated = job.estimatedMs;
  if (estimated <= 0) return 50; // unknown — show halfway

  // Use eased curve: fast at start, slows near 95%
  const ratio = Math.min(elapsed / estimated, 0.95);
  // Ease-out cubic: starts fast, decelerates
  const eased = 1 - Math.pow(1 - ratio, 3);
  return Math.round(eased * 95);
}

// ─────────────────────────────────────────────────────────────────────────────
// STORE INTERFACE
// ─────────────────────────────────────────────────────────────────────────────

export interface BackgroundJobState {
  jobs: Record<string, BackgroundJob>;

  /** Register a new job (call when enqueueBacktest is called) */
  registerJob: (params: {
    id:           string;
    userId:       string;
    name:         string;
    strategyType: StrategyType | 'custom';
    params:       BacktestParams;
  }) => BackgroundJob;

  /** Mark a job as completed with its result */
  completeJob: (id: string, result: EnrichedBacktestOutput) => void;

  /** Mark a job as failed */
  failJob: (id: string, error: string) => void;

  /** Acknowledge a completed job (dismiss the notification badge) */
  acknowledgeJob: (id: string) => void;

  /** Remove a specific job from the store */
  removeJob: (id: string) => void;

  /** Remove all completed + failed jobs */
  clearFinished: (userId: string) => void;

  // ── Selectors ─────────────────────────────────────────────────────────────

  /** All jobs for a user, newest first */
  getUserJobs: (userId: string) => BackgroundJob[];

  /** Running jobs for a user */
  getRunningJobs: (userId: string) => BackgroundJob[];

  /** Number of unacknowledged completions for a user */
  getUnreadCount: (userId: string) => number;
}

// ─────────────────────────────────────────────────────────────────────────────
// STORE
// ─────────────────────────────────────────────────────────────────────────────

export const useBackgroundJobStore = create<BackgroundJobState>((set, get) => {
  const initialJobs = loadJobs();

  // Any jobs that were "running" when the page closed are now stale — mark failed
  const now = Date.now();
  for (const job of Object.values(initialJobs)) {
    if (job.status === 'running') {
      job.status    = 'failed';
      job.error     = 'Session interrupted — page was closed during the run.';
      job.completedAt = now;
    }
  }

  return {
    jobs: initialJobs,

    registerJob: ({ id, userId, name, strategyType, params }) => {
      const estimatedMs = estimateDuration(params, strategyType);
      const job: BackgroundJob = {
        id,
        userId,
        name,
        strategyType,
        params,
        status:       'running',
        startedAt:    Date.now(),
        completedAt:  null,
        durationMs:   null,
        estimatedMs,
        progress:     0,
        result:       null,
        error:        null,
        acknowledged: false,
      };
      set(s => {
        const next = { ...s.jobs, [id]: job };
        saveJobs(next);
        return { jobs: next };
      });
      return job;
    },

    completeJob: (id, result) => {
      set(s => {
        const job = s.jobs[id];
        if (!job) return s;
        const now  = Date.now();
        const done: BackgroundJob = {
          ...job,
          status:       'completed',
          completedAt:  now,
          durationMs:   now - job.startedAt,
          progress:     100,
          result,
          error:        null,
          acknowledged: false,
        };
        const next = { ...s.jobs, [id]: done };
        saveJobs(next);
        return { jobs: next };
      });
    },

    failJob: (id, error) => {
      set(s => {
        const job = s.jobs[id];
        if (!job) return s;
        const failed: BackgroundJob = {
          ...job,
          status:       'failed',
          completedAt:  Date.now(),
          durationMs:   Date.now() - job.startedAt,
          progress:     0,
          error,
          acknowledged: false,
        };
        const next = { ...s.jobs, [id]: failed };
        saveJobs(next);
        return { jobs: next };
      });
    },

    acknowledgeJob: (id) => {
      set(s => {
        const job = s.jobs[id];
        if (!job) return s;
        const next = { ...s.jobs, [id]: { ...job, acknowledged: true } };
        saveJobs(next);
        return { jobs: next };
      });
    },

    removeJob: (id) => {
      set(s => {
        const { [id]: _, ...rest } = s.jobs;
        saveJobs(rest);
        return { jobs: rest };
      });
    },

    clearFinished: (userId) => {
      set(s => {
        const next = Object.fromEntries(
          Object.entries(s.jobs).filter(([, j]) =>
            j.userId !== userId || j.status === 'running'
          )
        );
        saveJobs(next);
        return { jobs: next };
      });
    },

    getUserJobs: (userId) =>
      Object.values(get().jobs)
        .filter(j => j.userId === userId)
        .sort((a, b) => b.startedAt - a.startedAt),

    getRunningJobs: (userId) =>
      Object.values(get().jobs)
        .filter(j => j.userId === userId && j.status === 'running'),

    getUnreadCount: (userId) =>
      Object.values(get().jobs)
        .filter(j => j.userId === userId && j.status === 'completed' && !j.acknowledged)
        .length,
  };
});
