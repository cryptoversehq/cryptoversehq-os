import { useAuthStore } from '@/lib/authStore';
import { toast } from 'sonner';

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

export function useDailyTradeLimit() {
  const user = useAuthStore(s => s.user);
  const plan = user?.plan ?? 'free';
  const isFree = plan === 'free';
  const maxTrades = isFree ? MAX_FREE_TRADES : Infinity;
  const currentCount = getDailyTradeCount();
  const remaining = maxTrades - currentCount;

  function tryTrade(): boolean {
    if (plan !== 'free') return true;
    const count = getDailyTradeCount();
    if (count >= MAX_FREE_TRADES) {
      toast.error(`Daily trade limit reached (${MAX_FREE_TRADES}/day). Upgrade to Pro for unlimited trading.`);
      return false;
    }
    incrementDailyTradeCount();
    const newCount = getDailyTradeCount();
    if (newCount >= MAX_FREE_TRADES) {
      toast.warning('You have reached your daily trade limit. Upgrade to Pro for unlimited trading.');
    }
    return true;
  }

  return { isLimited: isFree, maxTrades, currentCount, remaining, tryTrade };
}
