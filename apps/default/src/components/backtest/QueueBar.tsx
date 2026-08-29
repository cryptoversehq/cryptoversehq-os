/**
 * QueueBar.tsx — Part 6.1
 *
 * Persistent banner shown at the top of the backtest results area when the
 * user has queued or running jobs.
 *
 * Displays:
 *  - "Backtest queued"  banner with position + ETA   (status: queued)
 *  - "Running…"         banner with spinner           (status: running)
 *  - "Completed ✓"      brief success flash           (status: completed)
 *  - "Failed ✗"         error flash with message      (status: failed)
 *
 * Multiple concurrent jobs are listed in a compact stack.
 * Max 3 concurrent enforced by backtestQueue.ts.
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, CheckCircle2, XCircle, Clock, BarChart2, Layers } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useBacktestQueueStore, MAX_CONCURRENT } from '../../lib/backtestQueue';
import type { QueueJob } from '../../lib/backtestQueue';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function fmtWait(sec: number): string {
  if (sec <= 0) return 'starting soon';
  if (sec < 60) return `~${sec}s`;
  return `~${Math.ceil(sec / 60)}min`;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ─────────────────────────────────────────────────────────────────────────────
// SINGLE JOB ROW
// ─────────────────────────────────────────────────────────────────────────────

function JobRow({ job }: { job: QueueJob }) {
  return (
    <div className={cn(
      'flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs border transition-all',
      job.status === 'queued'    && 'bg-amber-500/10 border-amber-500/20 text-amber-300',
      job.status === 'running'   && 'bg-primary/10 border-primary/20 text-primary',
      job.status === 'completed' && 'bg-green-500/10 border-green-500/20 text-green-400',
      job.status === 'failed'    && 'bg-red-500/10 border-red-500/20 text-red-400',
    )}>
      {/* Icon */}
      {job.status === 'running'   && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />}
      {job.status === 'queued'    && <Clock   className="h-3.5 w-3.5 shrink-0" />}
      {job.status === 'completed' && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
      {job.status === 'failed'    && <XCircle className="h-3.5 w-3.5 shrink-0" />}

      {/* Label */}
      <div className="flex-1 min-w-0">
        <span className="font-medium truncate block">{job.name}</span>
        {job.status === 'queued' && (
          <span className="opacity-80">
            {ordinal(job.position)} in queue · estimated wait {fmtWait(job.estimatedWaitSec)}
          </span>
        )}
        {job.status === 'running' && (
          <span className="opacity-80">Fetching data & running simulation…</span>
        )}
        {job.status === 'completed' && (
          <span className="opacity-80">Complete ✓</span>
        )}
        {job.status === 'failed' && (
          <span className="opacity-80 truncate">{job.error ?? 'Failed'}</span>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// QUEUE BAR
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  userId: string;
}

export function QueueBar({ userId }: Props) {
  const { getActiveJobs, getRunningCount } = useBacktestQueueStore();

  const activeJobs   = getActiveJobs(userId);
  const runningCount = getRunningCount(userId);

  if (activeJobs.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8, height: 0 }}
        animate={{ opacity: 1, y: 0, height: 'auto' }}
        exit={{ opacity: 0, y: -8, height: 0 }}
        transition={{ type: 'spring', damping: 22, stiffness: 260 }}
        className="overflow-hidden"
      >
        <div className="px-5 pt-3 pb-2 space-y-1.5">
          {/* Header */}
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Layers className="h-3.5 w-3.5" />
              <span>
                Backtest Queue
                <span className="ml-1.5 text-foreground font-medium">
                  {runningCount}/{MAX_CONCURRENT} running
                </span>
              </span>
            </div>
            <div className="flex gap-0.5">
              {Array.from({ length: MAX_CONCURRENT }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    'w-6 h-1.5 rounded-full transition-colors',
                    i < runningCount ? 'bg-primary' : 'bg-secondary/40',
                  )}
                />
              ))}
            </div>
          </div>

          {/* Job rows */}
          <AnimatePresence initial={false}>
            {activeJobs.map(job => (
              <motion.div
                key={job.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 6, height: 0 }}
                layout
              >
                <JobRow job={job} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
