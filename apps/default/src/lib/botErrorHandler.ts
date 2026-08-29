/**
 * botErrorHandler.ts — Spec 8: Bot Error Handling
 *
 * Defines every error type the bot engine can encounter, what action to take,
 * and exposes helpers used by botStore to classify + handle each error.
 *
 * Error types:
 *   1. insufficient_balance  — stop, manual restart required
 *   2. rate_limit            — auto-resume after 5 minutes (cooldown)
 *   3. invalid_config        — error status, manual fix required
 *   4. max_daily_loss        — stop, manual restart required
 *   5. network_error         — auto-resume when connection restored
 *
 * Each error returns:
 *   - userMessage   : shown in the bot card / detail modal
 *   - action        : 'stop' | 'pause' | 'error' | 'continue'
 *   - autoResume    : how long until auto-resume (null = manual)
 *   - stopReason    : stored on the UserBot record
 *   - notifyType    : which notification style to use
 */

import type { UserBot } from './botTypes';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type BotErrorCode =
  | 'insufficient_balance'
  | 'rate_limit'
  | 'invalid_config'
  | 'max_daily_loss'
  | 'network_error'
  | 'consecutive_errors'
  | 'unknown';

export type BotErrorAction =
  | 'stop'       // Set status=stopped, stopReason set
  | 'pause'      // Set status=paused temporarily (auto-resume)
  | 'error'      // Set status=error (manual intervention needed)
  | 'continue';  // Log the error but keep running

export interface BotErrorResult {
  code:          BotErrorCode;
  /** Human-readable message displayed in the UI */
  userMessage:   string;
  /** What the bot store should do to the bot */
  action:        BotErrorAction;
  /** If non-null, the store will auto-resume the bot after this many ms */
  autoResumeMs:  number | null;
  /** Reason code stored on the bot record */
  stopReason:    UserBot['stopReason'] | null;
  /** Notification severity */
  notifyType:    'trade' | 'achievement' | 'system' | 'liquidation';
  /** Notification title */
  notifyTitle:   string;
  /** Notification body */
  notifyMessage: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLASSIFY ERROR STRING → ERROR CODE
// ─────────────────────────────────────────────────────────────────────────────

export function classifyBotError(errorMsg: string): BotErrorCode {
  const msg = errorMsg.toLowerCase();

  if (msg.includes('balance') || msg.includes('insufficient') || msg.includes('funds'))
    return 'insufficient_balance';

  if (msg.includes('rate limit') || msg.includes('too many requests') || msg.includes('429'))
    return 'rate_limit';

  if (msg.includes('config') || msg.includes('invalid') || msg.includes('validation'))
    return 'invalid_config';

  if (msg.includes('daily loss') || msg.includes('max loss'))
    return 'max_daily_loss';

  if (
    msg.includes('network') || msg.includes('connection') ||
    msg.includes('fetch') || msg.includes('timeout') ||
    msg.includes('econnrefused') || msg.includes('offline')
  )
    return 'network_error';

  if (msg.includes('consecutive') || msg.includes('threshold'))
    return 'consecutive_errors';

  return 'unknown';
}

// ─────────────────────────────────────────────────────────────────────────────
// RESOLVE ERROR → FULL RESULT
// ─────────────────────────────────────────────────────────────────────────────

const FIVE_MINUTES_MS = 5 * 60 * 1_000;

export function resolveBotError(
  code: BotErrorCode,
  bot:  UserBot,
  rawError?: string,
): BotErrorResult {
  const name = bot.name;

  switch (code) {

    // ── 8.1: Insufficient balance ──────────────────────────────────────────
    case 'insufficient_balance': {
      const minBalance = (bot.config as any).totalInvestment
        ?? (bot.config as any).baseAmount
        ?? (bot.config as any).initialInvestment
        ?? 100;
      return {
        code,
        userMessage:   `Bot requires a minimum balance of $${minBalance.toLocaleString()}. Please add funds.`,
        action:        'stop',
        autoResumeMs:  null,
        stopReason:    'insufficient_balance',
        notifyType:    'liquidation',
        notifyTitle:   `🔴 ${name} — Insufficient Balance`,
        notifyMessage: `Bot stopped: requires $${minBalance.toLocaleString()} minimum.`,
      };
    }

    // ── 8.2: API rate limit ────────────────────────────────────────────────
    case 'rate_limit': {
      return {
        code,
        userMessage:   'Market data temporarily unavailable. Bot paused for 5 minutes.',
        action:        'pause',
        autoResumeMs:  FIVE_MINUTES_MS,
        stopReason:    'rate_limited',
        notifyType:    'system',
        notifyTitle:   `⏸ ${name} — Rate Limited`,
        notifyMessage: 'Market data unavailable. Auto-resuming in 5 minutes.',
      };
    }

    // ── 8.3: Invalid configuration ────────────────────────────────────────
    case 'invalid_config': {
      return {
        code,
        userMessage:   'Bot configuration contains errors. Please review parameters.',
        action:        'error',
        autoResumeMs:  null,
        stopReason:    null,
        notifyType:    'liquidation',
        notifyTitle:   `⚠️ ${name} — Config Error`,
        notifyMessage: rawError ?? 'Bot halted: invalid configuration. Please fix and restart.',
      };
    }

    // ── 8.4: Max daily loss reached ───────────────────────────────────────
    case 'max_daily_loss': {
      const limit = bot.maxDailyLossUsd;
      return {
        code,
        userMessage:   `Daily loss limit of ${limit.toLocaleString()} reached. Bot stopped.`,
        action:        'stop',
        autoResumeMs:  null,
        stopReason:    'daily_loss_limit',
        notifyType:    'liquidation',
        notifyTitle:   `🛑 ${name} — Daily Loss Limit`,
        notifyMessage: `Bot stopped: daily loss limit of ${limit.toLocaleString()} hit.`,
      };
    }

    // ── 8.5: Network error ─────────────────────────────────────────────────
    case 'network_error': {
      return {
        code,
        userMessage:   'Connection lost. Bot will resume when connection is restored.',
        action:        'pause',
        autoResumeMs:  30_000, // retry after 30s
        stopReason:    'network_error',
        notifyType:    'system',
        notifyTitle:   `📡 ${name} — Network Error`,
        notifyMessage: 'Connection lost. Bot paused — will auto-resume.',
      };
    }

    // ── Consecutive errors threshold ───────────────────────────────────────
    case 'consecutive_errors': {
      return {
        code,
        userMessage:   `Bot halted after too many consecutive errors. Last: ${rawError ?? 'unknown error'}`,
        action:        'error',
        autoResumeMs:  null,
        stopReason:    'error_threshold',
        notifyType:    'liquidation',
        notifyTitle:   `🔴 ${name} — Error Threshold`,
        notifyMessage: `Bot halted: ${rawError ?? 'consecutive errors exceeded'}.`,
      };
    }

    // ── Unknown ────────────────────────────────────────────────────────────
    default: {
      return {
        code:          'unknown',
        userMessage:   rawError ?? 'An unexpected error occurred.',
        action:        'continue',
        autoResumeMs:  null,
        stopReason:    null,
        notifyType:    'system',
        notifyTitle:   `⚠️ ${name} — Error`,
        notifyMessage: rawError ?? 'An unexpected error occurred.',
      };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-RESUME SCHEDULER
// ─────────────────────────────────────────────────────────────────────────────

/** Active auto-resume timers keyed by botId */
const _resumeTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

/**
 * Schedule an auto-resume for a bot.
 * When the timer fires, calls the provided `resumeFn` (which calls startBot).
 * Cancels any existing timer for the same bot.
 */
export function scheduleAutoResume(
  botId:     string,
  delayMs:   number,
  resumeFn:  () => void,
) {
  cancelAutoResume(botId); // clear existing timer
  const timer = setTimeout(() => {
    _resumeTimers.delete(botId);
    resumeFn();
  }, delayMs);
  _resumeTimers.set(botId, timer);
}

/** Cancel a pending auto-resume for a bot (e.g. if user manually starts). */
export function cancelAutoResume(botId: string) {
  const existing = _resumeTimers.get(botId);
  if (existing) { clearTimeout(existing); _resumeTimers.delete(botId); }
}

/** Check whether a bot has a pending auto-resume. */
export function hasAutoResume(botId: string): boolean {
  return _resumeTimers.has(botId);
}

/** Get remaining time (ms) for a bot's auto-resume, or null if none. */
export function getAutoResumeInfo(botId: string): { hasTimer: boolean } {
  return { hasTimer: _resumeTimers.has(botId) };
}

// ─────────────────────────────────────────────────────────────────────────────
// DISPLAY HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Icon + color for each error code — used in error banners. */
export const BOT_ERROR_META: Record<BotErrorCode, {
  icon:    string;
  color:   string;
  bg:      string;
  border:  string;
  label:   string;
  action:  string;  // CTA button label shown to user
}> = {
  insufficient_balance: {
    icon: '💰', color: '#ff3b30', bg: 'rgba(255,59,48,0.08)',
    border: 'rgba(255,59,48,0.22)', label: 'Insufficient Balance',
    action: 'Add Funds',
  },
  rate_limit: {
    icon: '⏱', color: '#ff9500', bg: 'rgba(255,149,0,0.08)',
    border: 'rgba(255,149,0,0.22)', label: 'Rate Limited',
    action: 'Auto-Resuming…',
  },
  invalid_config: {
    icon: '⚙️', color: '#af52de', bg: 'rgba(175,82,222,0.08)',
    border: 'rgba(175,82,222,0.22)', label: 'Config Error',
    action: 'Fix Config',
  },
  max_daily_loss: {
    icon: '🛑', color: '#ff3b30', bg: 'rgba(255,59,48,0.08)',
    border: 'rgba(255,59,48,0.22)', label: 'Daily Loss Limit',
    action: 'Restart Bot',
  },
  network_error: {
    icon: '📡', color: '#ff9500', bg: 'rgba(255,149,0,0.08)',
    border: 'rgba(255,149,0,0.22)', label: 'Network Error',
    action: 'Auto-Resuming…',
  },
  consecutive_errors: {
    icon: '🔴', color: '#ff3b30', bg: 'rgba(255,59,48,0.08)',
    border: 'rgba(255,59,48,0.22)', label: 'Error Threshold',
    action: 'View Logs',
  },
  unknown: {
    icon: '⚠️', color: '#ff9500', bg: 'rgba(255,149,0,0.08)',
    border: 'rgba(255,149,0,0.22)', label: 'Unknown Error',
    action: 'Retry',
  },
};
