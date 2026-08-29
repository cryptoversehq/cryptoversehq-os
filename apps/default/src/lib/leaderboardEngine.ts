/**
 * leaderboardEngine.ts — Enterprise Leaderboard Rules & Anti-Cheat Engine
 * Sprint 6.6.3 — Implements Anti-Wash Trading (60s minimum) and 7-Day Reset Quarantine.
 */

export interface Trade {
  id?: string;
  entryTimestamp?: number;
  exitTimestamp?: number;
  pnl?: number;
  [key: string]: unknown;
}

const RESET_QUARANTINE_DAYS = 7;
const WASH_TRADE_MIN_DURATION_MS = 60_000; // 60 seconds minimum

/**
 * Priority 3: Anti-Wash Trading Rule
 * Exclude trades shorter than 60 seconds from leaderboard calculations.
 */
export function getValidTradesForLeaderboard<T extends { entryTimestamp?: number; exitTimestamp?: number; timestamp?: string; openedAt?: string }>(trades: T[]): T[] {
  return trades.filter(t => {
    let entry = t.entryTimestamp;
    let exit  = t.exitTimestamp;

    if (!entry && t.openedAt) {
      const p = Date.parse(t.openedAt);
      if (!isNaN(p)) entry = p;
    }
    if (!exit && t.timestamp) {
      const p = Date.parse(t.timestamp);
      if (!isNaN(p)) exit = p;
    }

    if (typeof entry !== 'number' || typeof exit !== 'number') {
      // If timestamps are unavailable, include by default unless explicitly flagged
      return true;
    }
    const duration = exit - entry;
    return duration >= WASH_TRADE_MIN_DURATION_MS;
  });
}

/**
 * Gets the timestamp in milliseconds when an account was last reset.
 */
export function getLastResetDate(userId: string): number | null {
  try {
    const key = `cv_last_reset_${userId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const num = Number(raw);
    return isNaN(num) ? null : num;
  } catch {
    return null;
  }
}

/**
 * Records an account reset timestamp for leaderboard quarantine enforcement.
 */
export function recordAccountReset(userId: string): void {
  try {
    const key = `cv_last_reset_${userId}`;
    localStorage.setItem(key, String(Date.now()));
  } catch {
    // ignore storage quota errors
  }
}

/**
 * Priority 4: 7-Day Leaderboard Quarantine on Reset
 * Checks if an account is eligible to participate in the leaderboard.
 * If the account reset its balance within the last 7 days, returns false.
 */
export function canParticipateInLeaderboard(userId: string): boolean {
  const lastReset = getLastResetDate(userId);
  if (!lastReset) return true;
  const daysSinceReset = (Date.now() - lastReset) / (1000 * 60 * 60 * 24);
  return daysSinceReset >= RESET_QUARANTINE_DAYS;
}
