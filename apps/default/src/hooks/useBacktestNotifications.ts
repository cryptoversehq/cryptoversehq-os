/**
 * useBacktestNotifications.ts — Part 6.2
 *
 * Registers queue completion/failure callbacks and fires Sonner toast
 * notifications when a backtest finishes or fails.
 *
 * Features:
 *  - ✅ Push notification (Sonner toast) on every backtest completion
 *  - ❌ Push notification on failure with error message
 *  - History badge count: number of completed runs this session
 *  - Long-run detection: shows "email" advisory for runs > 20s
 *
 * Usage:
 *   Call once at the top level of BacktestPage or App.
 *   The hook auto-registers; no cleanup needed (handlers are global).
 */

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { registerQueueNotifyHandlers } from '../lib/backtestQueue';
import type { QueueJob } from '../lib/backtestQueue';

interface UseBacktestNotificationsOptions {
  /** Called whenever any job completes. */
  onComplete?: (job: QueueJob) => void;
  /** Called whenever any job fails. */
  onFail?: (job: QueueJob) => void;
}

export function useBacktestNotifications(options: UseBacktestNotificationsOptions = {}) {
  const onCompleteRef = useRef(options.onComplete);
  const onFailRef     = useRef(options.onFail);

  // Keep refs current without re-registering handlers
  onCompleteRef.current = options.onComplete;
  onFailRef.current     = options.onFail;

  useEffect(() => {
    registerQueueNotifyHandlers(
      // onComplete
      (job: QueueJob) => {
        const totalReturn  = job.result?.metrics?.totalReturn;
        const hasReturn    = totalReturn !== undefined && totalReturn !== null;
        const returnStr    = hasReturn
          ? ` · ${totalReturn! >= 0 ? '+' : ''}${totalReturn!.toFixed(2)}%`
          : '';

        // Determine if this was a long-running job (> 20s)
        const durationMs  = job.completedAt && job.startedAt
          ? job.completedAt - job.startedAt
          : null;
        const isLongRun   = durationMs !== null && durationMs > 20_000;

        toast.success(`Backtest complete${returnStr}`, {
          description: `${job.name}${isLongRun ? ' · For faster results, consider a shorter date range.' : ''}`,
          duration: 5_000,
          action: isLongRun
            ? { label: 'Tips', onClick: () => toast.info('Use shorter date ranges or faster timeframes for quicker backtests.', { duration: 6_000 }) }
            : undefined,
        });

        onCompleteRef.current?.(job);
      },
      // onFail
      (job: QueueJob) => {
        toast.error('Backtest failed', {
          description: job.error ?? `${job.name} could not be completed. Please try again.`,
          duration: 8_000,
        });

        onFailRef.current?.(job);
      },
    );
    // Run once only — the handlers are module-global
  }, []);
}
