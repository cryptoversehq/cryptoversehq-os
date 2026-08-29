/**
 * useLynxContext.ts - Detect user's current context for Lynx AI guidance.
 */

import { useMemo, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '@/lib/authStore';
import { useTradingStore } from '@/lib/tradingStore';

export interface LynxContext {
  page: string;
  userLevel: number;
  winRate: number;
  lastTradeTimestamp: string | null;
  lastTradeDaysAgo: number | null;
  openPositions: number;
  isBeginner: boolean;
  sessionTime: number;
}

const sessionStart = Date.now();

function safeArr<T>(v: unknown, fallback: T[] = []): T[] {
  return Array.isArray(v) ? v as T[] : fallback;
}

export function useLynxContext(): LynxContext {
  const location = useLocation();
  const { user } = useAuthStore();
  const all = useTradingStore();
  const rerender = useRef(0);

  useEffect(() => {
    const id = setInterval(() => { rerender.current += 1; }, 30000);
    return () => clearInterval(id);
  }, []);

  return useMemo(() => {
    const positions = safeArr(all?.positions);
    const history = safeArr(all?.history);

    const pnlTrades = history.filter((h: any) => h?.pnl != null);
    const wins = pnlTrades.filter((h: any) => h.pnl > 0).length;
    const total = pnlTrades.length || 1;
    const winRate = (wins / total) * 100;

    const lastTrade = history.length > 0 ? history[history.length - 1] : null;
    const lastTradeTimestamp = lastTrade?.timestamp ?? null;
    const lastTradeDaysAgo = lastTradeTimestamp
      ? Math.floor((Date.now() - new Date(lastTradeTimestamp).getTime()) / 86400000)
      : null;

    const userLevel = user?.level ?? 1;

    return {
      page: location.pathname,
      userLevel,
      winRate,
      lastTradeTimestamp,
      lastTradeDaysAgo,
      openPositions: positions.length,
      isBeginner: userLevel < 5,
      sessionTime: Math.floor((Date.now() - sessionStart) / 1000),
    };
  }, [location.pathname, user, all?.positions, all?.history, rerender.current]);
}
