/**
 * useLiveCoinGeckoPrice.ts
 *
 * Shared "poll CoinGecko for a live price, fail silently, keep simulating"
 * hook. Both trading terminals need this exact pattern:
 *   - Dashboard.tsx previously hand-rolled its own `fetch()` call with its
 *     own header/env handling (inconsistent with the rest of the app, per
 *     the Dashboard audit's "CoinGecko API key handled inconsistently"
 *     finding).
 *   - ProDashboard.tsx already used `liveMarketService.fetchLivePrices`,
 *     which is the correct, cached, shared service.
 *
 * This hook wraps `liveMarketService.fetchLivePrices` (single source of
 * truth for CoinGecko access, including its 5-minute cache and CORS
 * fallback) behind one small interface so any terminal can opt in without
 * re-implementing fetch/interval/cleanup logic.
 */
import { useEffect, useRef, useState } from 'react';
import { fetchLivePrices, LivePrice } from '@/lib/liveMarketService';

export interface UseLiveCoinGeckoPriceResult {
  /** null until the first successful fetch, or whenever the coin has no live data. */
  live: LivePrice | null;
  /** true once at least one successful fetch has completed for the current coinId. */
  isLive: boolean;
}

/**
 * Polls CoinGecko (via the shared, cached liveMarketService) for a single
 * coin's live price on an interval. Silently keeps `live` as-is on fetch
 * failure so callers can fall back to their own simulation.
 */
export function useLiveCoinGeckoPrice(coinId: string, intervalMs = 30_000): UseLiveCoinGeckoPriceResult {
  const [live, setLive] = useState<LivePrice | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    setLive(null); // reset when switching coins so stale prices never leak across symbols

    const poll = async () => {
      try {
        const data = await fetchLivePrices([coinId]);
        const lp = data[coinId];
        if (lp && !cancelledRef.current) setLive(lp);
      } catch {
        // keep simulated — this is an intentional silent fallback, not a bug
      }
    };

    poll();
    const id = setInterval(poll, intervalMs);
    return () => { cancelledRef.current = true; clearInterval(id); };
  }, [coinId, intervalMs]);

  return { live, isLive: live != null };
}
