/**
 * backtestErrors.ts — Part 12
 *
 * Typed error system for the Backtest Engine.
 *
 * Error codes map to specific, actionable user-facing messages so users
 * know exactly what went wrong and what to do next.
 *
 * Spec errors:
 *   ✅ NO_DATA           — No historical data for selected date range
 *   ✅ INVALID_CODE      — Strategy code contains errors (line X)
 *   ✅ RATE_LIMIT        — API rate limit hit (wait 30 seconds)
 *   ✅ TIMEOUT           — Backtest timed out
 *   ✅ INSUFFICIENT_BALANCE — Balance below $1,000 minimum
 *
 * Additional handled errors:
 *   - INVALID_DATE_RANGE  — start ≥ end, future dates, too long
 *   - NETWORK_ERROR       — general fetch failure
 *   - UNKNOWN             — catch-all with generic message
 */

// ─────────────────────────────────────────────────────────────────────────────
// ERROR CODES
// ─────────────────────────────────────────────────────────────────────────────

export type BacktestErrorCode =
  | 'NO_DATA'
  | 'INVALID_CODE'
  | 'RATE_LIMIT'
  | 'TIMEOUT'
  | 'INSUFFICIENT_BALANCE'
  | 'INVALID_DATE_RANGE'
  | 'DATE_RANGE_TOO_LONG'
  | 'DATE_RANGE_TOO_SHORT'
  | 'FUTURE_DATE'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

// ─────────────────────────────────────────────────────────────────────────────
// TYPED ERROR CLASS
// ─────────────────────────────────────────────────────────────────────────────

export class BacktestError extends Error {
  readonly code:    BacktestErrorCode;
  /** Optional structured detail — e.g. { line: 42 } for INVALID_CODE */
  readonly detail?: Record<string, unknown>;

  constructor(code: BacktestErrorCode, message?: string, detail?: Record<string, unknown>) {
    super(message ?? errorMessage(code, detail));
    this.name   = 'BacktestError';
    this.code   = code;
    this.detail = detail;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// USER-FACING MESSAGES
// ─────────────────────────────────────────────────────────────────────────────

export function errorMessage(code: BacktestErrorCode, detail?: Record<string, unknown>): string {
  switch (code) {
    case 'NO_DATA':
      return 'No historical data available for the selected date range. Please try a different range.';

    case 'INVALID_CODE': {
      const line = detail?.line as number | undefined;
      return line != null
        ? `Strategy code contains errors. Please check line ${line}.`
        : 'Strategy code contains errors. Please review your custom strategy.';
    }

    case 'RATE_LIMIT':
      return 'Market data API is busy. Please wait 30 seconds and try again.';

    case 'TIMEOUT':
      return 'Backtest took too long. Try reducing the date range or simplifying your strategy.';

    case 'INSUFFICIENT_BALANCE':
      return 'Cannot run backtest. Minimum balance required: $1,000.';

    case 'INVALID_DATE_RANGE':
      return 'Start date must be before end date. Please adjust your date range.';

    case 'DATE_RANGE_TOO_LONG':
      return 'Date range cannot exceed 365 days. Please select a shorter range.';

    case 'DATE_RANGE_TOO_SHORT':
      return 'Date range must be at least 7 days to generate meaningful results.';

    case 'FUTURE_DATE':
      return 'End date cannot be in the future. Historical data is not available for future dates.';

    case 'NETWORK_ERROR':
      return 'Unable to fetch market data. Please check your connection and try again.';

    default:
      return 'An unexpected error occurred. Please try again.';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RECOVERY HINTS  (secondary actionable text shown below the message)
// ─────────────────────────────────────────────────────────────────────────────

export interface ErrorInfo {
  code:         BacktestErrorCode;
  message:      string;
  hint?:        string;
  /** Label for the recovery action button (if any) */
  actionLabel?: string;
  /** ID of the recovery action to perform */
  actionId?:    'retry' | 'reduce_range' | 'fix_balance' | 'wait_retry' | 'open_code_editor';
  /** For RATE_LIMIT: seconds to wait before auto-retry */
  retryAfterSec?: number;
}

export function getErrorInfo(code: BacktestErrorCode, detail?: Record<string, unknown>): ErrorInfo {
  const message = errorMessage(code, detail);

  switch (code) {
    case 'NO_DATA':
      return {
        code, message,
        hint: 'Try selecting a range after 2020, or choose a more widely-traded asset like BTC or ETH.',
        actionLabel: 'Adjust Dates',
        actionId:    'reduce_range',
      };

    case 'INVALID_CODE':
      return {
        code, message,
        hint: 'Common issues: missing return statement, unclosed brackets, or undefined variables.',
        actionLabel: 'Open Editor',
        actionId:    'open_code_editor',
      };

    case 'RATE_LIMIT':
      return {
        code, message,
        hint: 'CoinGecko free tier allows ~30 requests/minute. A retry will happen automatically.',
        actionLabel: 'Retry in 30s',
        actionId:    'wait_retry',
        retryAfterSec: 30,
      };

    case 'TIMEOUT':
      return {
        code, message,
        hint: 'Reduce the date range to under 90 days, or switch to a simpler built-in strategy.',
        actionLabel: 'Reduce Range',
        actionId:    'reduce_range',
      };

    case 'INSUFFICIENT_BALANCE':
      return {
        code, message,
        hint: 'Set Initial Balance to at least $1,000 to cover trading fees and position sizing.',
        actionLabel: 'Fix Balance',
        actionId:    'fix_balance',
      };

    case 'INVALID_DATE_RANGE':
    case 'DATE_RANGE_TOO_SHORT':
      return {
        code, message,
        hint: 'A minimum of 7 days is needed to calculate meaningful indicators like RSI and MACD.',
        actionLabel: 'Adjust Dates',
        actionId:    'reduce_range',
      };

    case 'DATE_RANGE_TOO_LONG':
      return {
        code, message,
        hint: 'For long-term analysis, try multiple shorter backtests and compare results.',
        actionLabel: 'Adjust Dates',
        actionId:    'reduce_range',
      };

    case 'FUTURE_DATE':
      return {
        code, message,
        hint: 'Set the end date to today or earlier.',
        actionLabel: 'Fix Date',
        actionId:    'reduce_range',
      };

    case 'NETWORK_ERROR':
      return {
        code, message,
        hint: 'The simulation will fall back to synthetic data if the API remains unreachable.',
        actionLabel: 'Retry',
        actionId:    'retry',
      };

    default:
      return {
        code, message,
        hint: 'If the problem persists, try refreshing the page.',
        actionLabel: 'Retry',
        actionId:    'retry',
      };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CLASSIFIER — raw Error → BacktestErrorCode
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inspects an unknown error thrown by the backtest pipeline and returns the
 * matching BacktestErrorCode. Handles HTTP status codes, timeout signals,
 * strategy code errors, and validation failures.
 */
export function classifyError(err: unknown): BacktestErrorCode {
  // Already typed
  if (err instanceof BacktestError) return err.code;

  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();

  // Timeout — AbortController signal or explicit message
  if (
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('aborted') ||
    (err instanceof DOMException && err.name === 'AbortError')
  ) return 'TIMEOUT';

  // Rate limit — HTTP 429 or explicit message
  if (msg.includes('429') || msg.includes('rate limit') || msg.includes('too many requests'))
    return 'RATE_LIMIT';

  // No data
  if (
    msg.includes('no data') ||
    msg.includes('empty response') ||
    msg.includes('no candles') ||
    msg.includes('no historical')
  ) return 'NO_DATA';

  // Network errors
  if (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network error') ||
    msg.includes('load failed') ||
    msg.includes('err_network') ||
    msg.includes('coingecko') && (msg.includes('error 5') || msg.includes('error 4'))
  ) return 'NETWORK_ERROR';

  // Strategy code errors
  if (
    msg.includes('syntaxerror') ||
    msg.includes('referenceerror') ||
    msg.includes('strategy code') ||
    msg.includes('custom strategy') ||
    msg.includes('unexpected token')
  ) return 'INVALID_CODE';

  // Balance
  if (msg.includes('balance') || msg.includes('insufficient')) return 'INSUFFICIENT_BALANCE';

  // Date range
  if (msg.includes('date range') || msg.includes('start date') || msg.includes('end date'))
    return 'INVALID_DATE_RANGE';

  return 'UNKNOWN';
}

/**
 * Fully classify an error and return the complete ErrorInfo.
 * Use this as the single entry point from catch blocks.
 */
export function resolveError(err: unknown): ErrorInfo {
  if (err instanceof BacktestError) {
    return getErrorInfo(err.code, err.detail);
  }
  const code = classifyError(err);
  return getErrorInfo(code);
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION — parameter-level checks that emit typed errors
// ─────────────────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid:  boolean;
  errors: ErrorInfo[];
}

export function validateParamsFull(params: {
  initialBalance: number;
  startDate:      string;
  endDate:        string;
}): ValidationResult {
  const errors: ErrorInfo[] = [];
  const MIN_BALANCE = 1_000;
  const MAX_DAYS    = 365;
  const MIN_DAYS    = 7;

  // Balance check
  if (!params.initialBalance || params.initialBalance < MIN_BALANCE) {
    errors.push(getErrorInfo('INSUFFICIENT_BALANCE'));
  }

  if (params.startDate && params.endDate) {
    const start = new Date(params.startDate);
    const end   = new Date(params.endDate);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const days  = (end.getTime() - start.getTime()) / 86_400_000;

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      errors.push(getErrorInfo('INVALID_DATE_RANGE'));
    } else if (start >= end) {
      errors.push(getErrorInfo('INVALID_DATE_RANGE'));
    } else if (end > today) {
      errors.push(getErrorInfo('FUTURE_DATE'));
    } else if (days > MAX_DAYS) {
      errors.push(getErrorInfo('DATE_RANGE_TOO_LONG'));
    } else if (days < MIN_DAYS) {
      errors.push(getErrorInfo('DATE_RANGE_TOO_SHORT'));
    }
  }

  return { valid: errors.length === 0, errors };
}
