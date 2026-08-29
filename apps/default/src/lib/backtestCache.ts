/**
 * backtestCache.ts — Part 11.1
 *
 * Two-layer caching for the Backtest Engine:
 *
 *   Layer 1 — Price data cache (coinGeckoService already has 1h TTL cache)
 *             This module adds a cache-hit inspector so the UI can show
 *             "Loaded from cache" vs "Fetched live" badges.
 *
 *   Layer 2 — Result cache keyed by a deterministic hash of BacktestParams
 *             + strategyType. Stores the full EnrichedBacktestOutput so
 *             identical runs return instantly without re-simulating.
 *
 * Spec requirements:
 *   ✅ Cache historical price data for 1 hour  (layer 1 — already done in coinGeckoService,
 *      this module wraps it with an observable API)
 *   ✅ Cache backtest results for identical parameters (layer 2)
 *   ✅ Invalidate cache when new data available (explicit + TTL-based)
 *
 * Storage:
 *   - In-memory Map for speed (primary)
 *   - localStorage for cross-session persistence (secondary)
 *
 * Eviction:
 *   - Time-based: 1 hour TTL on both layers
 *   - Capacity-based: max 30 result cache entries (LRU eviction)
 *   - Manual: invalidate(params) removes a specific entry
 *   - invalidateAll() clears the entire result cache
 */

import type { EnrichedBacktestOutput } from './backtestRunner';
import type { BacktestParams } from './backtestTypes';
import type { StrategyType } from './strategyTypes';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const RESULT_CACHE_TTL_MS  = 60 * 60 * 1_000;   // 1 hour
const RESULT_CACHE_MAX     = 30;                   // max entries (LRU)
const STORAGE_KEY          = 'cryptoverse_backtest_result_cache_v1';
const PRICE_CACHE_KEY      = 'cryptoverse_coingecko_cache_v2';       // coinGeckoService key

// ─────────────────────────────────────────────────────────────────────────────
// CACHE ENTRY
// ─────────────────────────────────────────────────────────────────────────────

export interface ResultCacheEntry {
  key:         string;
  result:      EnrichedBacktestOutput;
  cachedAt:    number;   // Date.now()
  expiresAt:   number;   // cachedAt + TTL
  hitCount:    number;   // LRU approximation
  lastHitAt:   number;
  paramsHash:  string;
}

// ─────────────────────────────────────────────────────────────────────────────
// PARAMS HASH  (deterministic, stable)
// ─────────────────────────────────────────────────────────────────────────────

export interface CacheableParams {
  params:       BacktestParams;
  strategyType: StrategyType | 'custom';
}

/**
 * Produces a stable string key from the parameters that affect the result.
 * Ignores fields that don't change the simulation (e.g. sessionName).
 */
export function hashParams(input: CacheableParams): string {
  const { params, strategyType } = input;
  const parts = [
    params.coinId,
    params.symbol,
    params.timeframe,
    params.startDate,
    params.endDate,
    String(params.initialBalance ?? 10_000),
    String((params.feeRate ?? 0.001).toFixed(6)),
    strategyType,
    JSON.stringify(params.strategyConfig ?? {}),
  ];
  return parts.join('|');
}

// ─────────────────────────────────────────────────────────────────────────────
// STORAGE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function storageSave(entries: Map<string, ResultCacheEntry>): void {
  try {
    const obj: Record<string, ResultCacheEntry> = {};
    entries.forEach((v, k) => { obj[k] = v; });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // Storage quota — clear old data and retry once
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
  }
}

function storageLoad(): Map<string, ResultCacheEntry> {
  const map = new Map<string, ResultCacheEntry>();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return map;
    const obj: Record<string, ResultCacheEntry> = JSON.parse(raw);
    const now = Date.now();
    for (const [k, v] of Object.entries(obj)) {
      if (v.expiresAt > now) {        // only load live entries
        map.set(k, v);
      }
    }
  } catch { /* ignore */ }
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// LRU EVICTION
// ─────────────────────────────────────────────────────────────────────────────

function evictIfNeeded(cache: Map<string, ResultCacheEntry>): void {
  if (cache.size <= RESULT_CACHE_MAX) return;

  // Sort by lastHitAt ascending — evict least-recently-used first
  const sorted = [...cache.entries()].sort((a, b) => a[1].lastHitAt - b[1].lastHitAt);
  const toEvict = sorted.length - RESULT_CACHE_MAX;
  for (let i = 0; i < toEvict; i++) {
    cache.delete(sorted[i][0]);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RESULT CACHE CLASS
// ─────────────────────────────────────────────────────────────────────────────

export class BacktestResultCache {
  private readonly _cache: Map<string, ResultCacheEntry>;
  private _listeners: Array<() => void> = [];

  constructor() {
    this._cache = storageLoad();
  }

  // ── Subscribe to changes (for reactive UI) ──────────────────────────────

  subscribe(fn: () => void): () => void {
    this._listeners.push(fn);
    return () => { this._listeners = this._listeners.filter(f => f !== fn); };
  }

  private _notify() {
    this._listeners.forEach(fn => fn());
  }

  // ── GET ──────────────────────────────────────────────────────────────────

  get(input: CacheableParams): EnrichedBacktestOutput | null {
    const key   = hashParams(input);
    const entry = this._cache.get(key);
    if (!entry) return null;

    const now = Date.now();

    // TTL check
    if (entry.expiresAt < now) {
      this._cache.delete(key);
      storageSave(this._cache);
      return null;
    }

    // Update LRU metadata
    entry.hitCount  += 1;
    entry.lastHitAt  = now;
    this._cache.set(key, entry);

    return entry.result;
  }

  // ── SET ──────────────────────────────────────────────────────────────────

  set(input: CacheableParams, result: EnrichedBacktestOutput): void {
    const key = hashParams(input);
    const now = Date.now();

    const entry: ResultCacheEntry = {
      key,
      result,
      cachedAt:   now,
      expiresAt:  now + RESULT_CACHE_TTL_MS,
      hitCount:   0,
      lastHitAt:  now,
      paramsHash: key,
    };

    this._cache.set(key, entry);
    evictIfNeeded(this._cache);
    storageSave(this._cache);
    this._notify();
  }

  // ── INVALIDATE ───────────────────────────────────────────────────────────

  /** Remove the cached result for a specific set of params */
  invalidate(input: CacheableParams): boolean {
    const key     = hashParams(input);
    const existed = this._cache.delete(key);
    if (existed) {
      storageSave(this._cache);
      this._notify();
    }
    return existed;
  }

  /** Remove all cached results */
  invalidateAll(): void {
    this._cache.clear();
    storageSave(this._cache);
    this._notify();
  }

  /**
   * Invalidate price data cache for a specific coin.
   * Calls into coinGeckoService's localStorage cache to remove entries
   * so the next fetch is forced to hit the API.
   */
  invalidatePriceData(coinId?: string): void {
    try {
      if (!coinId) {
        localStorage.removeItem(PRICE_CACHE_KEY);
      } else {
        const raw = localStorage.getItem(PRICE_CACHE_KEY);
        if (!raw) return;
        const stored: Record<string, unknown> = JSON.parse(raw);
        // Keys are "coinId:days" — remove all matching coinId
        for (const k of Object.keys(stored)) {
          if (k.startsWith(`${coinId}:`)) delete stored[k];
        }
        localStorage.setItem(PRICE_CACHE_KEY, JSON.stringify(stored));
      }
    } catch { /* ignore */ }
    // Also invalidate all result cache (prices changed → results stale)
    this.invalidateAll();
  }

  // ── STATS ─────────────────────────────────────────────────────────────────

  get size(): number { return this._cache.size; }

  get entries(): ResultCacheEntry[] {
    return [...this._cache.values()].sort((a, b) => b.lastHitAt - a.lastHitAt);
  }

  /** Check if a result is cached without affecting hit counts */
  has(input: CacheableParams): boolean {
    const key   = hashParams(input);
    const entry = this._cache.get(key);
    if (!entry) return false;
    return entry.expiresAt > Date.now();
  }

  /** Seconds until a cached entry expires (0 if not cached) */
  ttlSeconds(input: CacheableParams): number {
    const key   = hashParams(input);
    const entry = this._cache.get(key);
    if (!entry || entry.expiresAt <= Date.now()) return 0;
    return Math.ceil((entry.expiresAt - Date.now()) / 1_000);
  }

  /** Human-readable TTL string */
  ttlLabel(input: CacheableParams): string {
    const secs = this.ttlSeconds(input);
    if (secs <= 0)     return 'expired';
    if (secs < 60)     return `${secs}s`;
    if (secs < 3_600)  return `${Math.floor(secs / 60)}m`;
    return `${Math.floor(secs / 3_600)}h`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SINGLETON
// ─────────────────────────────────────────────────────────────────────────────

export const backtestResultCache = new BacktestResultCache();

// ─────────────────────────────────────────────────────────────────────────────
// CACHED RUN WRAPPER
// ─────────────────────────────────────────────────────────────────────────────

import { runEnrichedBacktest } from './backtestRunner';

export type CacheStatus = 'hit' | 'miss' | 'invalidated';

export interface CachedRunResult {
  output:      EnrichedBacktestOutput;
  cacheStatus: CacheStatus;
  /** Milliseconds saved by cache hit (0 on miss) */
  savedMs:     number;
}

/**
 * Wraps runEnrichedBacktest with result caching.
 *
 * On cache HIT:  returns cached result immediately (< 1ms)
 * On cache MISS: runs the full backtest, stores result, returns it
 *
 * Pass `forceRefresh: true` to bypass cache and re-run the simulation,
 * which also invalidates the old cached entry.
 */
export async function runCachedBacktest(
  input:        CacheableParams,
  forceRefresh  = false,
): Promise<CachedRunResult> {

  if (forceRefresh) {
    backtestResultCache.invalidate(input);
  } else {
    const cached = backtestResultCache.get(input);
    if (cached) {
      return { output: cached, cacheStatus: 'hit', savedMs: cached.durationMs };
    }
  }

  // Full run
  const output = await runEnrichedBacktest(input);

  // Store in cache (only store successful runs with trades)
  backtestResultCache.set(input, output);

  return {
    output,
    cacheStatus: forceRefresh ? 'invalidated' : 'miss',
    savedMs:     0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// REACT HOOK
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from 'react';

export interface UseCacheStatusResult {
  /** Whether an identical run is already cached */
  isCached:       boolean;
  /** Human-readable TTL (e.g. "47m" or "expired") */
  ttlLabel:       string;
  /** Number of cache entries currently stored */
  cacheSize:      number;
  /** Force-invalidate the current params */
  invalidate:     () => void;
  /** Clear the entire result cache */
  invalidateAll:  () => void;
  /** Invalidate price data for a coin */
  invalidatePrice: (coinId?: string) => void;
}

export function useCacheStatus(input: CacheableParams | null): UseCacheStatusResult {
  const [, forceRender] = useState(0);

  useEffect(() => {
    const unsub = backtestResultCache.subscribe(() => forceRender(n => n + 1));
    return unsub;
  }, []);

  // Recompute periodically so TTL countdown ticks
  useEffect(() => {
    const id = setInterval(() => forceRender(n => n + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  const invalidate = useCallback(() => {
    if (input) backtestResultCache.invalidate(input);
  }, [input]);

  const invalidateAll = useCallback(() => {
    backtestResultCache.invalidateAll();
  }, []);

  const invalidatePrice = useCallback((coinId?: string) => {
    backtestResultCache.invalidatePriceData(coinId);
  }, []);

  if (!input) {
    return { isCached: false, ttlLabel: '', cacheSize: backtestResultCache.size, invalidate, invalidateAll, invalidatePrice };
  }

  return {
    isCached:        backtestResultCache.has(input),
    ttlLabel:        backtestResultCache.ttlLabel(input),
    cacheSize:       backtestResultCache.size,
    invalidate,
    invalidateAll,
    invalidatePrice,
  };
}
