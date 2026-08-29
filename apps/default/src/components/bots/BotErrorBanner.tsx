/**
 * BotErrorBanner.tsx — Spec 8: Error Handling UI
 *
 * Shown when a bot's status is 'error' or it has a lastError message.
 * Displays:
 *   - Color-coded error type icon + label
 *   - Human-readable message
 *   - CTA button (Stop Bot / Auto-resume indicator / Fix Config / Restart)
 *   - Auto-resume countdown if applicable
 */

import React, { useState, useEffect } from 'react';
import {
  AlertTriangle, RefreshCw, Square, Settings,
  Wifi, DollarSign, Clock, RotateCcw,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  classifyBotError,
  BOT_ERROR_META,
  hasAutoResume,
  type BotErrorCode,
} from '../../lib/botErrorHandler';
import type { UserBot } from '../../lib/botTypes';

// ─────────────────────────────────────────────────────────────────────────────
// ICON MAP
// ─────────────────────────────────────────────────────────────────────────────

const ERROR_ICONS: Record<BotErrorCode, React.ElementType> = {
  insufficient_balance: DollarSign,
  rate_limit:           Clock,
  invalid_config:       Settings,
  max_daily_loss:       Square,
  network_error:        Wifi,
  consecutive_errors:   AlertTriangle,
  unknown:              AlertTriangle,
};

// ─────────────────────────────────────────────────────────────────────────────
// PROPS
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  bot:          UserBot;
  /** Called when user clicks the CTA (start/restart) */
  onStart?:     () => void;
  /** Called when user clicks "Fix Config" — opens config tab */
  onFixConfig?: () => void;
  /** Compact mode for BotCard; full mode for BotDetailModal */
  compact?:     boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export function BotErrorBanner({ bot, onStart, onFixConfig, compact = false }: Props) {
  const error = bot.lastError;
  if (!error && bot.status !== 'error') return null;

  const code  = error ? classifyBotError(error) : 'unknown';
  const meta  = BOT_ERROR_META[code];
  const Icon  = ERROR_ICONS[code];
  const isAutoResuming = hasAutoResume(bot.id);

  // Countdown for auto-resume (rough estimate — refreshes every second)
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!isAutoResuming) return;
    const id = setInterval(() => setTick(t => t + 1), 1_000);
    return () => clearInterval(id);
  }, [isAutoResuming]);

  // CTA logic
  const isManualRestart  = code === 'insufficient_balance' || code === 'max_daily_loss' || code === 'consecutive_errors';
  const isAutoResumeMode = code === 'rate_limit' || code === 'network_error';
  const isConfigError    = code === 'invalid_config';

  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-xl border text-xs',
        compact ? 'px-2.5 py-2' : 'px-3.5 py-3',
      )}
      style={{ background: meta.bg, borderColor: meta.border }}
    >
      {/* Icon */}
      <div
        className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center mt-0.5"
        style={{ background: `${meta.color}18` }}
      >
        <Icon className="h-3.5 w-3.5" style={{ color: meta.color }} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="font-bold text-[10px] uppercase tracking-wide" style={{ color: meta.color }}>
            {meta.icon} {meta.label}
          </span>
          {isAutoResuming && (
            <span
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full animate-pulse"
              style={{ background: `${meta.color}18`, color: meta.color }}
            >
              Auto-Resuming…
            </span>
          )}
        </div>
        <p className={cn('leading-snug', compact ? 'text-[10px]' : 'text-xs')} style={{ color: 'rgba(229,231,235,0.80)' }}>
          {error ?? 'Bot encountered an error and has been halted.'}
        </p>
      </div>

      {/* CTA */}
      {!compact && (
        <div className="shrink-0 flex flex-col items-end gap-1">
          {isAutoResumeMode && isAutoResuming ? (
            <div
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold"
              style={{ background: `${meta.color}12`, color: meta.color }}
            >
              <RefreshCw className="h-3 w-3 animate-spin" />
              Resuming…
            </div>
          ) : isAutoResumeMode ? (
            <button
              onClick={onStart}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all active:scale-[0.97]"
              style={{ background: `${meta.color}12`, color: meta.color, border: `1px solid ${meta.color}28` }}
            >
              <RefreshCw className="h-3 w-3" /> Resume Now
            </button>
          ) : isConfigError ? (
            <button
              onClick={onFixConfig}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all active:scale-[0.97]"
              style={{ background: `${meta.color}12`, color: meta.color, border: `1px solid ${meta.color}28` }}
            >
              <Settings className="h-3 w-3" /> Fix Config
            </button>
          ) : isManualRestart ? (
            <button
              onClick={onStart}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all active:scale-[0.97]"
              style={{ background: `${meta.color}12`, color: meta.color, border: `1px solid ${meta.color}28` }}
            >
              <RotateCcw className="h-3 w-3" /> Restart Bot
            </button>
          ) : (
            <button
              onClick={onStart}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all active:scale-[0.97]"
              style={{ background: `${meta.color}12`, color: meta.color, border: `1px solid ${meta.color}28` }}
            >
              <RefreshCw className="h-3 w-3" /> Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}
