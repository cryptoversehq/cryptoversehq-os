/**
 * coinGeckoService.ts
 *
 * CoinGecko API v3 integration for the Backtest Engine.
 *
 * Features:
 *  - Fetches historical OHLCV data via CoinGecko free-tier endpoints
 *  - 1-hour in-memory + localStorage cache to minimise API calls
 *  - Converts raw API response into the internal BacktestData format
 *  - Falls back gracefully to generated synthetic candles on network failure
 *  - Supports all 10 listed coins across any date range ≤ 365 days
 *
 * CoinGecko endpoints used:
 *  - /coins/{id}/ohlc?vs_currency=usd&days={n}
 *    Returns [timestamp, open, high, low, close] arrays (no volume).
 *    Max 90 days for free tier OHLC endpoint.
 *  - /coins/{id}/market_chart/range?vs_currency=usd&from={unix}&to={unix}
 *    Returns prices[], market_caps[], total_volumes[] arrays.
 *    Used to derive volume + additional price points for longer ranges.
 *
 * Note: CoinGecko free tier imposes ~30 calls/min rate limit.
 *       The 1-hour cache ensures we stay within limits for typical usage.
 */

import { generateHistoricalCandles } from './backtestEngine';
import { COIN_BASE_PRICES } from './backtestTypes';
import type { Timeframe } from './marketEngine';
import { BacktestError } from './backtestErrors';
import { isApiEnabled, markApiUsed } from './apiStatusService';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface OHLCVCandle {
  timestamp: number; // unix ms
  open:      number;
  high:      number;
  low:       number;
  close:     number;
  volume:    number;
}

export interface BacktestData {
  symbol:     string;
  coinId:     string;
  timeframe:  string;
  startDate:  Date;
  endDate:    Date;
  prices:     number[];   // close prices
  opens:      number[];
  highs:      number[];
  lows:       number[];
  volumes:    number[];
  timestamps: Date[];
  candles:    OHLCVCandle[];
  source:     'coingecko' | 'simulated';
}

// ─────────────────────────────────────────────────────────────────────────────
// CACHE
// ─────────────────────────────────────────────────────────────────────────────

interface CacheEntry {
  data:      OHLCVCandle[];
  fetchedAt: number; // unix ms
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const CACHE_KEY    = 'cryptoverse_coingecko_cache_v2';

const _memCache = new Map<string, CacheEntry>();

function cacheKey(coinId: string, days: number): string {
  return `${coinId}:${days}`;
}

function loadCacheFromStorage(): void {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const stored: Record<string, CacheEntry> = JSON.parse(raw);
    const now = Date.now();
    for (const [k, v] of Object.entries(stored)) {
      if (now - v.fetchedAt < CACHE_TTL_MS) {
        _memCache.set(k, v);
      }
    }
  } catch { /* ignore */ }
}

function saveCacheToStorage(): void {
  try {
    const obj: Record<string, CacheEntry> = {};
    for (const [k, v] of _memCache.entries()) {
      obj[k] = v;
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(obj));
  } catch { /* ignore — storage quota */ }
}

// Initialise from storage on module load
loadCacheFromStorage();

// ─────────────────────────────────────────────────────────────────────────────
// COINGECKO FETCH HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const BASE = 'https://api.coingecko.com/api/v3';

/**
 * Fetches OHLC candles from CoinGecko.
 * /coins/{id}/ohlc returns [[timestamp, open, high, low, close], ...]
 * days param: 1 | 7 | 14 | 30 | 90 | 180 | 365 (free tier max 90 for OHLC)
 */
async function fetchOhlc(coinId: string, days: number): Promise<OHLCVCandle[]> {
  // Admin kill switch — callers fall back to synthetic candles automatically.
  if (!isApiEnabled('coingecko')) {
    throw new BacktestError('NETWORK_ERROR', 'CoinGecko is disabled by the administrator');
  }
  markApiUsed('coingecko');
  const url = `${BASE}/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`;
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new BacktestError('TIMEOUT');
    throw new BacktestError('NETWORK_ERROR');
  }
  if (res.status === 429) throw new BacktestError('RATE_LIMIT');
  if (!res.ok) throw new BacktestError('NETWORK_ERROR', `CoinGecko OHLC error ${res.status}`);
  const data: [number, number, number, number, number][] = await res.json();
  return data.map(([ts, o, h, l, c]) => ({
    timestamp: ts,
    open:  o,
    high:  h,
    low:   l,
    close: c,
    volume: 0, // OHLC endpoint has no volume
  }));
}

/**
 * Fetches market chart range data (prices + volumes) from CoinGecko.
 * Returns prices at ~daily granularity for ranges > 90 days.
 */
async function fetchMarketChartRange(
  coinId: string,
  fromUnix: number,
  toUnix:   number,
): Promise<{ prices: [number, number][]; volumes: [number, number][] }> {
  // Admin kill switch — callers fall back to synthetic candles automatically.
  if (!isApiEnabled('coingecko')) {
    throw new BacktestError('NETWORK_ERROR', 'CoinGecko is disabled by the administrator');
  }
  markApiUsed('coingecko');
  const url = `${BASE}/coins/${coinId}/market_chart/range?vs_currency=usd&from=${fromUnix}&to=${toUnix}`;
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(14_000) });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new BacktestError('TIMEOUT');
    throw new BacktestError('NETWORK_ERROR');
  }
  if (res.status === 429) throw new BacktestError('RATE_LIMIT');
  if (!res.ok) throw new BacktestError('NETWORK_ERROR', `CoinGecko market chart error ${res.status}`);
  const data = await res.json();
  return { prices: data.prices ?? [], volumes: data.total_volumes ?? [] };
}

// ─────────────────────────────────────────────────────────────────────────────
// CANDLE BUILDER FROM MARKET CHART DATA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts market chart price + volume arrays into synthetic OHLCV candles.
 * Since market_chart/range returns one point per day (for long ranges),
 * we treat each consecutive pair of points as open/close and estimate H/L.
 */
function buildCandlesFromChartData(
  prices:  [number, number][],
  volumes: [number, number][],
): OHLCVCandle[] {
  if (prices.length < 2) return [];

  const volMap = new Map(volumes.map(([ts, v]) => [ts, v]));
  const candles: OHLCVCandle[] = [];

  for (let i = 0; i < prices.length - 1; i++) {
    const [ts,   open]  = prices[i];
    const [,     close] = prices[i + 1];
    const spread = Math.abs(close - open);
    const high   = Math.max(open, close) + spread * 0.3;
    const low    = Math.max(Math.min(open, close) - spread * 0.3, 0.000001);

    // Find nearest volume data point
    const vol = volMap.get(ts) ?? 0;

    candles.push({ timestamp: ts, open, high, low, close, volume: vol });
  }

  return candles;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN DATA FETCHER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches historical OHLCV data for a coin over a date range.
 *
 * Strategy:
 *  - ≤ 90 days  → use /ohlc endpoint (true OHLCV) + market_chart for volume
 *  - > 90 days  → use /market_chart/range (daily candles derived from price points)
 *
 * Cache: 1-hour TTL, persisted to localStorage.
 * Fallback: synthetic candles if fetch fails (network error, rate limit, etc.)
 */
export async function fetchHistoricalData(
  coinId:    string,
  symbol:    string,
  timeframe: string,
  startDate: Date,
  endDate:   Date,
): Promise<BacktestData> {
  const days = Math.ceil((endDate.getTime() - startDate.getTime()) / 86_400_000);
  const key  = cacheKey(coinId, days);
  const now  = Date.now();

  // ── Cache hit ──
  const cached = _memCache.get(key);
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return buildBacktestData(cached.data, coinId, symbol, timeframe, startDate, endDate, 'coingecko');
  }

  // ── Try fetching from API ──
  try {
    let candles: OHLCVCandle[];

    if (days <= 90) {
      // Use true OHLC endpoint + volume from market chart
      const [ohlc, chart] = await Promise.all([
        fetchOhlc(coinId, Math.min(days, 90)),
        fetchMarketChartRange(
          coinId,
          Math.floor(startDate.getTime() / 1000),
          Math.floor(endDate.getTime() / 1000),
        ),
      ]);

      const volMap = new Map(chart.volumes.map(([ts, v]: [number, number]) => [
        // Round to nearest OHLC timestamp (4h buckets)
        Math.round(ts / (4 * 3600_000)) * (4 * 3600_000),
        v,
      ]));

      candles = ohlc.map(c => ({
        ...c,
        volume: volMap.get(Math.round(c.timestamp / (4 * 3600_000)) * (4 * 3600_000)) ?? 0,
      }));
    } else {
      // Use market_chart/range for longer periods
      const chart = await fetchMarketChartRange(
        coinId,
        Math.floor(startDate.getTime() / 1000),
        Math.floor(endDate.getTime() / 1000),
      );
      candles = buildCandlesFromChartData(chart.prices, chart.volumes);
    }

    // Filter to requested date range
    const startMs = startDate.getTime();
    const endMs   = endDate.getTime();
    candles = candles.filter(c => c.timestamp >= startMs && c.timestamp <= endMs);

    if (candles.length > 0) {
      _memCache.set(key, { data: candles, fetchedAt: now });
      saveCacheToStorage();
      return buildBacktestData(candles, coinId, symbol, timeframe, startDate, endDate, 'coingecko');
    }

    // Empty response — no data for this range
    throw new BacktestError('NO_DATA', 'No candles returned for selected date range');

  } catch (err) {
    // Re-throw typed errors (RATE_LIMIT, TIMEOUT, NO_DATA) so callers can surface them
    if (err instanceof BacktestError && (err.code === 'RATE_LIMIT' || err.code === 'NO_DATA' || err.code === 'TIMEOUT')) {
      throw err;
    }
    console.warn(`[CoinGecko] Fetch failed (${coinId}, ${days}d):`, err);
    // Fall back to synthetic candle generation for network errors
    return buildSimulatedData(coinId, symbol, timeframe, startDate, endDate);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA BUILDERS
// ─────────────────────────────────────────────────────────────────────────────

function buildBacktestData(
  candles:   OHLCVCandle[],
  coinId:    string,
  symbol:    string,
  timeframe: string,
  startDate: Date,
  endDate:   Date,
  source:    'coingecko' | 'simulated',
): BacktestData {
  return {
    symbol,
    coinId,
    timeframe,
    startDate,
    endDate,
    prices:     candles.map(c => c.close),
    opens:      candles.map(c => c.open),
    highs:      candles.map(c => c.high),
    lows:       candles.map(c => c.low),
    volumes:    candles.map(c => c.volume),
    timestamps: candles.map(c => new Date(c.timestamp)),
    candles,
    source,
  };
}

function buildSimulatedData(
  coinId:    string,
  symbol:    string,
  timeframe: string,
  startDate: Date,
  endDate:   Date,
): BacktestData {
  // Use the existing seeded engine from backtestEngine.ts
  const raw = generateHistoricalCandles(
    coinId,
    timeframe as Timeframe,
    startDate.toISOString().slice(0, 10),
    endDate.toISOString().slice(0, 10),
  );

  const candles: OHLCVCandle[] = raw.map(c => ({
    timestamp: c.time,
    open:      c.open,
    high:      c.high,
    low:       c.low,
    close:     c.close,
    volume:    c.volume,
  }));

  return buildBacktestData(candles, coinId, symbol, timeframe, startDate, endDate, 'simulated');
}

// ─────────────────────────────────────────────────────────────────────────────
// CACHE MANAGEMENT UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

/** Returns cache stats for display in the UI. */
export function getCacheStats(): { entries: number; oldestMs: number | null } {
  const now = Date.now();
  let oldestMs: number | null = null;
  for (const entry of _memCache.values()) {
    const age = now - entry.fetchedAt;
    if (oldestMs === null || age > oldestMs) oldestMs = age;
  }
  return { entries: _memCache.size, oldestMs };
}

/** Clears the entire cache (in-memory + storage). */
export function clearDataCache(): void {
  _memCache.clear();
  localStorage.removeItem(CACHE_KEY);
}

/** Returns how many milliseconds remain before a cached entry expires. */
export function cacheTimeRemaining(coinId: string, days: number): number {
  const entry = _memCache.get(cacheKey(coinId, days));
  if (!entry) return 0;
  return Math.max(0, CACHE_TTL_MS - (Date.now() - entry.fetchedAt));
}
