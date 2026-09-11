/**
 * useMarketOverview.ts — CryptoVerse HQ
 *
 * Fetches live global market data from CoinGecko API.
 * Falls back to estimated values on error.
 */

import { useState, useEffect } from 'react';

import { coinGeckoProxyUrl } from '@/lib/coinGeckoProxy';

const FALLBACK_MCAP = 2_480_000_000_000;
const FALLBACK_VOL = 98_300_000_000;

export interface MarketOverview {
  marketCap: number;
  volume24h: number;
  loading: boolean;
  error: string | null;
}

export function useMarketOverview(): MarketOverview {
  const [data, setData] = useState<MarketOverview>({
    marketCap: FALLBACK_MCAP,
    volume24h: FALLBACK_VOL,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        const res = await fetch(coinGeckoProxyUrl('global'), {
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json() as { data?: { total_market_cap?: { usd?: number }; total_volume?: { usd?: number } } };

        if (!cancelled && json.data) {
          setData({
            marketCap: json.data.total_market_cap?.usd || FALLBACK_MCAP,
            volume24h: json.data.total_volume?.usd || FALLBACK_VOL,
            loading: false,
            error: null,
          });
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('[MarketOverview] CoinGecko fetch failed, using fallback:', err);
          setData(prev => ({ ...prev, loading: false, error: null }));
        }
      }
    }

    fetchData();
    const id = setInterval(fetchData, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return data;
}
