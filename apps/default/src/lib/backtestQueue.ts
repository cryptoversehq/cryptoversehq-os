/**
 * backtestQueue.ts — Part 6.1
 *
 * In-browser queue for backtest runs with:
 *   - Max 3 concurrent runs per user (spec: "Max 3 concurrent backtests per user")
 *   - FIFO ordering with a numeric queue position
 *   - Estimated wait time (15s per queued run, actual measured from history)
 *   - Reactive Zustand state so the QueueBar can subscribe
 *   - Notification callbacks on completion/failure
 *
 * Usage:
 *   const jobId = enqueueBacktest(params);
 *   // QueueBar subscribes to useBacktestQueueStore
 *   // runEnrichedBacktest wraps this for callers
 */

import { create } from 'zustand';
import { runEnrichedBacktest as _run } from './backtestRunner';
import type { EnrichedBacktestOutput } from './backtestRunner';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_CONCURRENT  = 3;
const ESTIMATED_WAIT_PER_JOB = 15; // seconds per queued job ahead

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type QueueJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface QueueJob {
  id:          string;
  name:        string;   // human-readable label e.g. "BTC/USDT 1h grid"
  userId:      string;
  status:      QueueJobStatus;
  position:    number;   // 1-indexed position in queue (0 = running)
  enqueuedAt:  number;   // Date.now()
  startedAt:   number | null;
  completedAt: number | null;
  estimatedWaitSec: number;
  result:      EnrichedBacktestOutput | null;
  error:       string | null;
}

export type BacktestQueueParams = Parameters<typeof _run>[0] & {
  jobId:  string;
  name:   string;
  userId: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATION BRIDGE
// ─────────────────────────────────────────────────────────────────────────────

type NotifyFn = (job: QueueJob) => void;

let _onComplete: NotifyFn | null = null;
let _onFail:     NotifyFn | null = null;

export function registerQueueNotifyHandlers(onComplete: NotifyFn, onFail: NotifyFn) {
  _onComplete = onComplete;
  _onFail     = onFail;
}

// ─────────────────────────────────────────────────────────────────────────────
// STORE
// ─────────────────────────────────────────────────────────────────────────────

export interface BacktestQueueState {
  jobs: Record<string, QueueJob>;   // jobId → QueueJob

  // Derived selectors
  getJob:           (jobId: string) => QueueJob | null;
  getActiveJobs:    (userId: string) => QueueJob[];
  getRunningCount:  (userId: string) => number;
  getQueuedJobs:    (userId: string) => QueueJob[];
  isAtCapacity:     (userId: string) => boolean;

  // Internal mutations (called by the queue runner, not by UI)
  _upsertJob:   (job: QueueJob) => void;
  _removeJob:   (jobId: string) => void;
}

export const useBacktestQueueStore = create<BacktestQueueState>((set, get) => ({
  jobs: {},

  getJob:          id => get().jobs[id] ?? null,
  getActiveJobs:   uid => Object.values(get().jobs).filter(j => j.userId === uid && j.status !== 'completed' && j.status !== 'failed'),
  getRunningCount: uid => Object.values(get().jobs).filter(j => j.userId === uid && j.status === 'running').length,
  getQueuedJobs:   uid => Object.values(get().jobs).filter(j => j.userId === uid && j.status === 'queued').sort((a, b) => a.enqueuedAt - b.enqueuedAt),
  isAtCapacity:    uid => get().getRunningCount(uid) >= MAX_CONCURRENT,

  _upsertJob: job => set(s => ({ jobs: { ...s.jobs, [job.id]: job } })),
  _removeJob: id  => set(s => {
    const { [id]: _, ...rest } = s.jobs;
    return { jobs: rest };
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// ID GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

function genJobId() {
  return `bt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// QUEUE PROCESSOR (internal)
// ─────────────────────────────────────────────────────────────────────────────

// Pending run queue: [jobId, params, resolve, reject]
type PendingEntry = [string, Parameters<typeof _run>[0], (r: EnrichedBacktestOutput) => void, (e: unknown) => void];
const pendingQueue: PendingEntry[] = [];

// Map of currently running promises by userId
const runningByUser: Map<string, Set<string>> = new Map();

function getRunningSet(userId: string): Set<string> {
  if (!runningByUser.has(userId)) runningByUser.set(userId, new Set());
  return runningByUser.get(userId)!;
}

async function dispatchNextForUser(userId: string) {
  const running = getRunningSet(userId);
  if (running.size >= MAX_CONCURRENT) return;

  // Find next queued job for this user
  const idx = pendingQueue.findIndex(([jobId]) => {
    const job = useBacktestQueueStore.getState().getJob(jobId);
    return job?.userId === userId && job?.status === 'queued';
  });

  if (idx === -1) return;

  const [jobId, params, resolve, reject] = pendingQueue[idx];
  pendingQueue.splice(idx, 1);

  running.add(jobId);

  // Mark running
  const store = useBacktestQueueStore.getState();
  const existing = store.getJob(jobId);
  if (existing) {
    store._upsertJob({ ...existing, status: 'running', startedAt: Date.now(), position: 0, estimatedWaitSec: 0 });
  }

  try {
    const result = await _run(params);

    running.delete(jobId);

    const job = useBacktestQueueStore.getState().getJob(jobId);
    if (job) {
      const done: QueueJob = { ...job, status: 'completed', completedAt: Date.now(), result, error: null };
      store._upsertJob(done);
      _onComplete?.(done);

      // Auto-remove completed job after 8s
      setTimeout(() => store._removeJob(jobId), 8_000);
    }

    resolve(result);
  } catch (err) {
    running.delete(jobId);

    const job = useBacktestQueueStore.getState().getJob(jobId);
    const msg = err instanceof Error ? err.message : 'Backtest failed';
    if (job) {
      const failed: QueueJob = { ...job, status: 'failed', completedAt: Date.now(), error: msg };
      store._upsertJob(failed);
      _onFail?.(failed);
      setTimeout(() => store._removeJob(jobId), 12_000);
    }

    reject(err);
  }

  // Try to dispatch next queued job for this user
  dispatchNextForUser(userId);
}

function recomputePositions(userId: string) {
  const store  = useBacktestQueueStore.getState();
  const queued = store.getQueuedJobs(userId);
  const running = getRunningSet(userId);

  queued.forEach((job, i) => {
    const ahead = running.size + i;
    store._upsertJob({
      ...job,
      position:         i + 1,
      estimatedWaitSec: ahead * ESTIMATED_WAIT_PER_JOB,
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Enqueues a backtest run.
 * Returns a Promise<EnrichedBacktestOutput> that resolves when the run completes.
 * If ≥ MAX_CONCURRENT runs are already running for this user, the job is queued.
 */
export function enqueueBacktest(
  params: Parameters<typeof _run>[0],
  meta: { jobId?: string; name: string; userId: string },
): Promise<EnrichedBacktestOutput> {
  const jobId  = meta.jobId ?? genJobId();
  const store  = useBacktestQueueStore.getState();
  const running = getRunningSet(meta.userId);

  const position    = store.getQueuedJobs(meta.userId).length + 1;
  const waitSec     = (running.size + position - 1) * ESTIMATED_WAIT_PER_JOB;
  const isImmediate = running.size < MAX_CONCURRENT;

  const job: QueueJob = {
    id:           jobId,
    name:         meta.name,
    userId:       meta.userId,
    status:       isImmediate ? 'queued' : 'queued',
    position:     isImmediate ? 0 : position,
    enqueuedAt:   Date.now(),
    startedAt:    null,
    completedAt:  null,
    estimatedWaitSec: isImmediate ? 0 : waitSec,
    result:       null,
    error:        null,
  };

  store._upsertJob(job);
  recomputePositions(meta.userId);

  return new Promise<EnrichedBacktestOutput>((resolve, reject) => {
    pendingQueue.push([jobId, params, resolve, reject]);
    dispatchNextForUser(meta.userId);
  });
}
