import { useAuthStore } from './authStore';

const MAX_FREE_TRADES = 10;

function getTodayKey() {
  return `cv_daily_trades_${new Date().toISOString().slice(0, 10)}`;
}

function getDailyTradeCount(): number {
  try {
    return parseInt(localStorage.getItem(getTodayKey()) || '0', 10) || 0;
  } catch { return 0; }
}

function incrementDailyTradeCount(): number {
  const key = getTodayKey();
  const count = getDailyTradeCount() + 1;
  localStorage.setItem(key, String(count));
  return count;
}

export interface DailyTradeCheck {
  canTrade: boolean;
  remaining: number;
  used: number;
  max: number;
}

/**
 * Check if the current user can execute another trade today.
 * Returns full status. Free users are limited to 10/day.
 * Call this directly — no need for a React hook.
 */
export function checkDailyTradeLimit(): DailyTradeCheck {
  const user = useAuthStore.getState().user;
  const plan = user?.plan ?? 'free';
  const isFree = plan === 'free';
  const max = isFree ? MAX_FREE_TRADES : Infinity;
  const used = getDailyTradeCount();
  const remaining = isFree ? Math.max(0, max - used) : Infinity;
  const canTrade = isFree ? used < max : true;
  return { canTrade, remaining, used, max };
}

/**
 * Record a trade and return updated status.
 */
export function recordDailyTrade(): DailyTradeCheck {
  const user = useAuthStore.getState().user;
  const plan = user?.plan ?? 'free';
  if (plan !== 'free') {
    return { canTrade: true, remaining: Infinity, used: 0, max: Infinity };
  }
  incrementDailyTradeCount();
  const used = getDailyTradeCount();
  const remaining = Math.max(0, MAX_FREE_TRADES - used);
  return { canTrade: used <= MAX_FREE_TRADES, remaining, used, max: MAX_FREE_TRADES };
}

export { MAX_FREE_TRADES };
