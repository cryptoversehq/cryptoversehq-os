/**
 * useMarketOverview.ts — CryptoVerse HQ
 *
 * Fetches live global market data from CoinGecko API.
 * Falls back to estimated values on error.
 */

import { useState, useEffect } from 'react';

const CG_BASE = 'https://api.coingecko.com/api/v3';
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
        const key = (import.meta as Record<string, Record<string, string>>).env?.VITE_COINGECKO_API_KEY || '';
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (key) headers['x-cg-demo-api-key'] = key;

        const res = await fetch(`${CG_BASE}/global`, { headers });
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
