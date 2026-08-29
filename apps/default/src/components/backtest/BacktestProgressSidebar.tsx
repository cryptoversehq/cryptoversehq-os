/**
 * BacktestProgressSidebar.tsx — Part 11.2
 *
 * Persistent sidebar widget that shows background backtest job progress.
 * Renders on ALL pages (not just /backtest) so users can monitor jobs
 * while navigating elsewhere.
 *
 * Features:
 *   ✅ Live animated progress bar (time-based eased interpolation)
 *   ✅ Elapsed + estimated remaining time
 *   ✅ Notification badge on the sidebar nav item when jobs complete
 *   ✅ Click to load result when job completes
 *   ✅ Collapsible — minimises to a single badge line
 *   ✅ Shows last 3 recent completed jobs
 *   ✅ Dismiss individual jobs
 *
 * Usage (in App.tsx sidebar):
 *   <BacktestProgressSidebar onLoadResult={fn} />
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FlaskConical, CheckCircle2, XCircle, ChevronUp,
  ChevronDown, Loader2, Clock, X, ArrowRight, Zap,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../lib/authStore';
import {
  useBackgroundJobStore,
  computeProgress,
  type BackgroundJob,
} from '../../lib/backgroundJobStore';
import type { EnrichedBacktestOutput } from '../../lib/backtestRunner';

// ─────────────────────────────────────────────────────────────────────────────
// LIVE TIMER HOOK
// ─────────────────────────────────────────────────────────────────────────────

function useNow(intervalMs = 500): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function fmtDuration(ms: number): string {
  const sec = Math.floor(ms / 1_000);
  const min = Math.floor(sec / 60);
  if (min > 0) return `${min}m ${sec % 60}s`;
  return `${sec}s`;
}

function fmtRemaining(job: BackgroundJob, now: number): string {
  const elapsed  = now - job.startedAt;
  const progress = computeProgress(job);
  if (progress >= 95) return '< 5s';
  if (progress === 0)  return 'estimating…';
  const totalEst = elapsed / (progress / 100);
  const remaining = Math.max(0, totalEst - elapsed);
  return `~${fmtDuration(remaining)} left`;
}

// ─────────────────────────────────────────────────────────────────────────────
// JOB PROGRESS ROW
// ─────────────────────────────────────────────────────────────────────────────

function JobRow({
  job, now, onAcknowledge, onRemove, onLoad,
}: {
  job:           BackgroundJob;
  now:           number;
  onAcknowledge: (id: string) => void;
  onRemove:      (id: string) => void;
  onLoad:        (result: EnrichedBacktestOutput) => void;
}) {
  const progress  = job.status === 'running' ? computeProgress(job) : job.status === 'completed' ? 100 : 0;
  const elapsed   = now - job.startedAt;
  const isRunning = job.status === 'running';
  const isDone    = job.status === 'completed';
  const isFailed  = job.status === 'failed';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className={cn(
        'relative rounded-xl border overflow-hidden',
        isDone  ? 'bg-green-500/5 border-green-500/15'
        : isFailed ? 'bg-red-500/5 border-red-500/15'
        : 'bg-secondary/20 border-white/8',
      )}
    >
      {/* Animated progress fill */}
      {isRunning && (
        <div
          className="absolute inset-0 bg-primary/6 transition-[width] duration-500 pointer-events-none"
          style={{ width: `${progress}%` }}
        />
      )}

      <div className="relative p-3">
        {/* Header */}
        <div className="flex items-start gap-2">
          <div className={cn(
            'w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
            isDone   ? 'bg-green-500/15'  :
            isFailed ? 'bg-red-500/15'    :
            'bg-primary/10',
          )}>
            {isRunning && <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />}
            {isDone    && <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />}
            {isFailed  && <XCircle      className="h-3.5 w-3.5 text-red-400" />}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-foreground truncate leading-tight">{job.name}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {job.strategyType} · {job.params.symbol} · {job.params.timeframe}
            </p>
          </div>

          {/* Dismiss */}
          {(isDone || isFailed) && (
            <button
              onClick={() => { onAcknowledge(job.id); onRemove(job.id); }}
              className="p-0.5 rounded text-muted-foreground/40 hover:text-muted-foreground transition-colors shrink-0"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Progress bar + stats */}
        {isRunning && (
          <div className="mt-2.5 space-y-1.5">
            <div className="h-1 bg-white/8 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-primary rounded-full"
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5, ease: 'linear' }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />
                {fmtDuration(elapsed)}
              </span>
              <span>{fmtRemaining(job, now)}</span>
              <span className="font-semibold text-primary">{progress}%</span>
            </div>
          </div>
        )}

        {/* Completed — load result button */}
        {isDone && job.result && (
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="text-[10px] text-green-400/80">
              Completed in {fmtDuration(job.durationMs ?? 0)}
              {job.result.metrics.totalReturn !== 0 && (
                <span className={cn(
                  'ml-1.5 font-bold',
                  job.result.metrics.totalReturn >= 0 ? 'text-green-400' : 'text-red-400',
                )}>
                  {job.result.metrics.totalReturn >= 0 ? '+' : ''}
                  {job.result.metrics.totalReturn.toFixed(1)}%
                </span>
              )}
            </div>
            <Link
              to="/backtest"
              onClick={() => { onLoad(job.result!); onAcknowledge(job.id); }}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 transition-colors shrink-0"
            >
              View <ArrowRight className="h-2.5 w-2.5" />
            </Link>
          </div>
        )}

        {/* Failed */}
        {isFailed && (
          <p className="mt-1.5 text-[10px] text-red-400/80 truncate">{job.error ?? 'Unknown error'}</p>
        )}
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PROPS
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  /** Called when user clicks "View" on a completed job to load the result */
  onLoadResult?: (result: EnrichedBacktestOutput) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN WIDGET
// ─────────────────────────────────────────────────────────────────────────────

export function BacktestProgressSidebar({ onLoadResult }: Props) {
  const { user }       = useAuthStore();
  const store          = useBackgroundJobStore();
  const now            = useNow(500);
  const [expanded, setExpanded] = useState(true);

  if (!user?.id) return null;

  const running  = store.getRunningJobs(user.id);
  const allJobs  = store.getUserJobs(user.id).slice(0, 5);
  const unread   = store.getUnreadCount(user.id);

  // Only render if there is something to show
  if (allJobs.length === 0) return null;

  const handleLoad = useCallback((result: EnrichedBacktestOutput) => {
    onLoadResult?.(result);
  }, [onLoadResult]);

  return (
    <div className="mx-2 mb-2">
      {/* Header toggle */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-secondary/20 hover:bg-secondary/30 border border-white/8 transition-colors"
      >
        <div className="flex items-center gap-2">
          <FlaskConical className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-xs font-bold text-foreground">Backtest Jobs</span>
          {running.length > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse inline-block" />
              {running.length} running
            </span>
          )}
          {unread > 0 && (
            <span className="text-[10px] font-bold text-green-400 bg-green-500/15 px-1.5 py-0.5 rounded-full">
              {unread} done
            </span>
          )}
        </div>
        {expanded
          ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>

      {/* Job list */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="pt-1.5 space-y-1.5">
              <AnimatePresence initial={false}>
                {allJobs.map(job => (
                  <JobRow
                    key={job.id}
                    job={job}
                    now={now}
                    onAcknowledge={store.acknowledgeJob}
                    onRemove={store.removeJob}
                    onLoad={handleLoad}
                  />
                ))}
              </AnimatePresence>

              {/* Clear finished */}
              {allJobs.some(j => j.status !== 'running') && (
                <button
                  onClick={() => store.clearFinished(user.id)}
                  className="w-full text-[10px] text-muted-foreground/50 hover:text-muted-foreground py-1 transition-colors"
                >
                  Clear finished
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SIDEBAR BADGE (for the FlaskConical nav item)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Small dot badge placed next to the Backtest nav item when jobs are running
 * or have completed unread. Use in App.tsx SidebarItem.
 */
export function BacktestNavBadge() {
  const { user }  = useAuthStore();
  const store     = useBackgroundJobStore();

  if (!user?.id) return null;

  const running = store.getRunningJobs(user.id).length;
  const unread  = store.getUnreadCount(user.id);

  if (running === 0 && unread === 0) return null;

  return (
    <span className={cn(
      'ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0',
      running > 0
        ? 'bg-primary/20 text-primary animate-pulse'
        : 'bg-green-500/20 text-green-400',
    )}>
      {running > 0 ? `${running}` : `${unread}✓`}
    </span>
  );
}
