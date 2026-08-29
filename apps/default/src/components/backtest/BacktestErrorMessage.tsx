/**
 * BacktestErrorMessage.tsx — Part 12
 *
 * Animated, accessible error display for the Backtest Engine.
 *
 * Features:
 *   ✅ Specific icon per error type
 *   ✅ Primary message + recovery hint
 *   ✅ Action button (retry, open editor, fix balance, etc.)
 *   ✅ Auto-countdown for RATE_LIMIT (30s → retry)
 *   ✅ Dismiss button
 *   ✅ Stacked multi-error list (validation errors)
 *   ✅ Slide-in animation, shake on new error
 *
 * Usage:
 *   <BacktestErrorMessage errors={errorInfoList} onAction={handleAction} onDismiss={fn} />
 *   <BacktestErrorMessage errors={errorInfoList} />   // no dismiss
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle, WifiOff, Clock, Code2, Ban,
  Calendar, Database, RefreshCw, ChevronDown, ChevronUp,
  X, Loader2,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { ErrorInfo, BacktestErrorCode } from '../../lib/backtestErrors';

// ─────────────────────────────────────────────────────────────────────────────
// ICON MAP
// ─────────────────────────────────────────────────────────────────────────────

function ErrorIcon({ code, className }: { code: BacktestErrorCode; className?: string }) {
  const cls = cn('h-4 w-4 shrink-0', className);
  switch (code) {
    case 'NO_DATA':              return <Database     className={cls} />;
    case 'INVALID_CODE':         return <Code2        className={cls} />;
    case 'RATE_LIMIT':           return <Clock        className={cls} />;
    case 'TIMEOUT':              return <Clock        className={cls} />;
    case 'INSUFFICIENT_BALANCE': return <Ban          className={cls} />;
    case 'NETWORK_ERROR':        return <WifiOff      className={cls} />;
    case 'FUTURE_DATE':
    case 'INVALID_DATE_RANGE':
    case 'DATE_RANGE_TOO_LONG':
    case 'DATE_RANGE_TOO_SHORT': return <Calendar     className={cls} />;
    default:                     return <AlertTriangle className={cls} />;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// COLOR MAP
// ─────────────────────────────────────────────────────────────────────────────

function errorColors(code: BacktestErrorCode) {
  switch (code) {
    case 'RATE_LIMIT':
    case 'TIMEOUT':
    case 'NETWORK_ERROR':
      return {
        border: 'border-amber-500/25',
        bg:     'bg-amber-500/6',
        icon:   'text-amber-400',
        title:  'text-amber-300',
        badge:  'bg-amber-500/12 text-amber-400',
        action: 'bg-amber-500/10 border-amber-500/25 text-amber-300 hover:bg-amber-500/20',
      };
    case 'INVALID_CODE':
      return {
        border: 'border-violet-500/25',
        bg:     'bg-violet-500/6',
        icon:   'text-violet-400',
        title:  'text-violet-300',
        badge:  'bg-violet-500/12 text-violet-400',
        action: 'bg-violet-500/10 border-violet-500/25 text-violet-300 hover:bg-violet-500/20',
      };
    default:
      return {
        border: 'border-red-500/25',
        bg:     'bg-red-500/6',
        icon:   'text-red-400',
        title:  'text-red-300',
        badge:  'bg-red-500/12 text-red-400',
        action: 'bg-red-500/10 border-red-500/25 text-red-300 hover:bg-red-500/20',
      };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// COUNTDOWN HOOK (for RATE_LIMIT auto-retry)
// ─────────────────────────────────────────────────────────────────────────────

function useCountdown(seconds: number, onDone: () => void) {
  const [remaining, setRemaining] = useState(seconds);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    setRemaining(seconds);
    if (seconds <= 0) return;
    const id = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          clearInterval(id);
          doneRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1_000);
    return () => clearInterval(id);
  }, [seconds]);

  return remaining;
}

// ─────────────────────────────────────────────────────────────────────────────
// SINGLE ERROR CARD
// ─────────────────────────────────────────────────────────────────────────────

interface SingleErrorProps {
  info:        ErrorInfo;
  onAction?:   (actionId: ErrorInfo['actionId']) => void;
  onDismiss?:  () => void;
  isOnly?:     boolean;   // true when it's the only error (no collapse needed)
}

function SingleErrorCard({ info, onAction, onDismiss, isOnly = true }: SingleErrorProps) {
  const colors    = errorColors(info.code);
  const isRateLimit = info.code === 'RATE_LIMIT';
  const [waiting, setWaiting] = useState(false);

  const handleAutoRetry = useCallback(() => {
    setWaiting(false);
    onAction?.('retry');
  }, [onAction]);

  const countdown = useCountdown(
    isRateLimit && waiting ? (info.retryAfterSec ?? 30) : 0,
    handleAutoRetry,
  );

  const handleAction = () => {
    if (isRateLimit) {
      setWaiting(true);
    } else {
      onAction?.(info.actionId);
    }
  };

  return (
    <div className={cn(
      'rounded-xl border p-3.5 space-y-2',
      colors.border, colors.bg,
    )}>
      {/* Top row */}
      <div className="flex items-start gap-2.5">
        <div className={cn('mt-0.5', colors.icon)}>
          <ErrorIcon code={info.code} />
        </div>

        <div className="flex-1 min-w-0">
          <p className={cn('text-sm font-semibold leading-snug', colors.title)}>
            {info.message}
          </p>
        </div>

        {onDismiss && isOnly && (
          <button
            onClick={onDismiss}
            className="shrink-0 p-0.5 rounded text-muted-foreground/40 hover:text-muted-foreground transition-colors"
            aria-label="Dismiss error"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Hint */}
      {info.hint && (
        <p className="text-xs text-muted-foreground/80 leading-relaxed pl-6">
          {info.hint}
        </p>
      )}

      {/* Action */}
      {info.actionLabel && (
        <div className="pl-6">
          {isRateLimit && waiting ? (
            <div className={cn(
              'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border',
              colors.action,
            )}>
              <Loader2 className="h-3 w-3 animate-spin" />
              Retrying in {countdown}s…
              <div
                className="ml-1 h-1 rounded-full bg-current/30 relative overflow-hidden"
                style={{ width: 40 }}
              >
                <div
                  className="absolute inset-y-0 left-0 bg-current rounded-full transition-all duration-1000"
                  style={{ width: `${(countdown / (info.retryAfterSec ?? 30)) * 100}%` }}
                />
              </div>
            </div>
          ) : (
            <button
              onClick={handleAction}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                colors.action,
              )}
            >
              {info.actionId === 'open_code_editor' && <Code2 className="h-3 w-3" />}
              {info.actionId === 'retry'             && <RefreshCw className="h-3 w-3" />}
              {info.actionId === 'wait_retry'        && <Clock className="h-3 w-3" />}
              {info.message.includes('Balance')     && <Ban className="h-3 w-3" />}
              {info.actionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export interface BacktestErrorMessageProps {
  errors:     ErrorInfo[];
  onAction?:  (actionId: ErrorInfo['actionId'], errorCode?: BacktestErrorCode) => void;
  onDismiss?: () => void;
  className?: string;
}

export function BacktestErrorMessage({
  errors,
  onAction,
  onDismiss,
  className,
}: BacktestErrorMessageProps) {
  const [expanded, setExpanded] = useState(true);
  // Track key so shake animation re-fires on new errors
  const [shakeKey, setShakeKey] = useState(0);
  const prevLen = useRef(errors.length);

  useEffect(() => {
    if (errors.length > 0 && errors.length !== prevLen.current) {
      setShakeKey(k => k + 1);
      setExpanded(true);
    }
    prevLen.current = errors.length;
  }, [errors.length]);

  if (errors.length === 0) return null;

  const primary   = errors[0];
  const secondary = errors.slice(1);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={`error-${shakeKey}`}
        initial={{ opacity: 0, y: -6, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -4, scale: 0.97 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className={cn('space-y-1.5', className)}
      >
        {/* Primary error */}
        <SingleErrorCard
          info={primary}
          onAction={id => onAction?.(id, primary.code)}
          onDismiss={errors.length === 1 ? onDismiss : undefined}
          isOnly={errors.length === 1}
        />

        {/* Additional errors (collapsible) */}
        {secondary.length > 0 && (
          <div className="space-y-1">
            <button
              onClick={() => setExpanded(e => !e)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors pl-1"
            >
              {expanded
                ? <ChevronUp   className="h-3 w-3" />
                : <ChevronDown className="h-3 w-3" />}
              {expanded ? 'Hide' : `Show ${secondary.length} more issue${secondary.length > 1 ? 's' : ''}`}
            </button>

            <AnimatePresence>
              {expanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="overflow-hidden space-y-1.5"
                >
                  {secondary.map((info, i) => (
                    <SingleErrorCard
                      key={i}
                      info={info}
                      onAction={id => onAction?.(id, info.code)}
                      isOnly={false}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Dismiss all */}
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors pl-1"
              >
                Dismiss all
              </button>
            )}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INLINE FIELD ERROR (for individual form inputs)
// ─────────────────────────────────────────────────────────────────────────────

export function FieldError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <motion.p
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="mt-1 text-xs text-red-400 flex items-center gap-1"
    >
      <AlertTriangle className="h-3 w-3 shrink-0" />
      {message}
    </motion.p>
  );
}
