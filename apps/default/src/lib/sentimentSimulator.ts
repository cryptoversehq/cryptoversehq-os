/**
 * sentimentSimulator.ts
 *
 * Realistic sentiment signal generator for the CryptoVerse HQ
 * Sentiment Analysis system.
 *
 * Architecture:
 *   - Ornstein-Uhlenbeck (OU) process drives the global Fear & Greed Index,
 *     producing mean-reverting oscillations that mimic real market cycles.
 *   - Per-symbol sentiment is a market-correlated Gaussian with individual
 *     bias, volatility, and "beta" to the market signal.
 *   - Volume is modelled as a log-normal process with a fear-correlated
 *     amplifier (high fear → high volume).
 *   - All functions are pure (no side effects) — the store owns state.
 *   - seededRng() makes outputs reproducible in tests.
 *
 * No external API calls are made.
 */

import {
  SentimentSnapshot,
  FearGreedZone,
  SentimentTrend,
  getFearGreedZone,
  getSentimentTrend,
  SOURCE_META,
  TRACKED_SYMBOLS,
  MARKET_SYMBOL,
  MAX_SNAPSHOTS_PER_SYMBOL,
  COLD_START_SNAPSHOT_COUNT,
} from './sentimentTypes';
import { generateId } from './strategyUtils';

// ─────────────────────────────────────────────────────────────────────────────
// PRNG
// ─────────────────────────────────────────────────────────────────────────────

/** xorshift32 — lightweight, non-cryptographic PRNG. */
function seededRng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** Box-Muller transform → standard normal sample N(0,1). */
function boxMuller(rng: () => number): number {
  const u = rng() || 1e-10;
  const v = rng() || 1e-10;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Clamp a value to [min, max]. */
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Round to n decimal places. */
function round(v: number, n = 4): number {
  return Math.round(v * 10 ** n) / 10 ** n;
}

// ─────────────────────────────────────────────────────────────────────────────
// PER-SYMBOL PERSONALITY
// ─────────────────────────────────────────────────────────────────────────────

interface SymbolPersonality {
  bias:       number;   // long-run mean offset from market (in sentiment units)
  beta:       number;   // correlation with market Fear & Greed (0 = independent, 1 = fully correlated)
  idioVol:    number;   // idiosyncratic volatility (independent signal noise)
  volMultiplier: number; // scales mention volume relative to BTC
}

const SYMBOL_PERSONALITY: Record<string, SymbolPersonality> = {
  BTC:   { bias:  0.05, beta: 1.00, idioVol: 0.04, volMultiplier: 1.00 },
  ETH:   { bias:  0.03, beta: 0.92, idioVol: 0.06, volMultiplier: 0.85 },
  BNB:   { bias:  0.02, beta: 0.80, idioVol: 0.08, volMultiplier: 0.30 },
  SOL:   { bias:  0.04, beta: 0.85, idioVol: 0.12, volMultiplier: 0.45 },
  XRP:   { bias: -0.01, beta: 0.70, idioVol: 0.14, volMultiplier: 0.40 },
  ADA:   { bias: -0.02, beta: 0.75, idioVol: 0.10, volMultiplier: 0.25 },
  DOGE:  { bias:  0.08, beta: 0.60, idioVol: 0.20, volMultiplier: 0.55 },
  AVAX:  { bias:  0.03, beta: 0.80, idioVol: 0.13, volMultiplier: 0.20 },
  LINK:  { bias:  0.01, beta: 0.78, idioVol: 0.11, volMultiplier: 0.18 },
  DOT:   { bias: -0.01, beta: 0.72, idioVol: 0.09, volMultiplier: 0.15 },
  MATIC: { bias:  0.02, beta: 0.76, idioVol: 0.12, volMultiplier: 0.17 },
  UNI:   { bias:  0.00, beta: 0.68, idioVol: 0.10, volMultiplier: 0.12 },
  ATOM:  { bias: -0.02, beta: 0.65, idioVol: 0.09, volMultiplier: 0.10 },
  LTC:   { bias: -0.03, beta: 0.70, idioVol: 0.07, volMultiplier: 0.14 },
  INJ:   { bias:  0.06, beta: 0.82, idioVol: 0.18, volMultiplier: 0.08 },
};

function personality(symbol: string): SymbolPersonality {
  return SYMBOL_PERSONALITY[symbol] ?? { bias: 0, beta: 0.70, idioVol: 0.10, volMultiplier: 0.10 };
}

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL MARKET STATE  (module-level OU process state)
// ─────────────────────────────────────────────────────────────────────────────

interface MarketState {
  fearGreedIndex: number;     // 0–100
  twitterSignal:  number;     // -1 to 1  (market-level)
  redditSignal:   number;
  newsSignal:     number;
}

const _marketState: MarketState = {
  fearGreedIndex: 50,
  twitterSignal:  0,
  redditSignal:   0,
  newsSignal:     0,
};

/**
 * Ornstein-Uhlenbeck step for the Fear & Greed index.
 *
 * dX = θ(μ - X)dt + σ dW
 *   θ = 0.05  (mean reversion speed — slow cycles, ~days)
 *   μ = 50    (long-run mean = neutral)
 *   σ = 6.0   (volatility — produces realistic ±20 swings)
 */
function stepFearGreed(rng: () => number): number {
  const θ = 0.05;
  const μ = 50;
  const σ = 6.0;
  const dW = boxMuller(rng);
  const next = _marketState.fearGreedIndex + θ * (μ - _marketState.fearGreedIndex) + σ * dW;
  return clamp(Math.round(next * 10) / 10, 0, 100);
}

/**
 * Step the market-level sentiment signal with mean reversion.
 * Mean is derived from the Fear & Greed index: (fgi/100) * 2 - 1
 */
function stepMarketSentiment(current: number, fgi: number, rng: () => number): number {
  const targetMean = (fgi / 100) * 2 - 1;
  const θ = 0.08;
  const σ = 0.07;
  const next = current + θ * (targetMean - current) + σ * boxMuller(rng);
  return clamp(round(next, 4), -1, 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// VOLUME SIMULATION
// ─────────────────────────────────────────────────────────────────────────────

/** Base volumes for BTC at neutral sentiment. */
const BASE_VOLUMES = {
  twitter: 120_000,
  reddit:   18_000,
  news:      3_500,
};

/**
 * Generate mention volumes for a symbol.
 * High fear → higher overall volume (panic / FOMO amplifier).
 * Returns { twitter, reddit, news }.
 */
function simulateVolumes(
  symbol:   string,
  fgi:      number,
  rng:      () => number,
): { twitter: number; reddit: number; news: number } {
  const p = personality(symbol);
  // fear amplifier: 1.0 at neutral, up to 1.8 at extremes
  const fearAmplifier = 1 + 0.8 * Math.abs(fgi - 50) / 50;

  const twitter = Math.round(
    BASE_VOLUMES.twitter * p.volMultiplier * fearAmplifier * (0.7 + rng() * 0.6),
  );
  const reddit = Math.round(
    BASE_VOLUMES.reddit * p.volMultiplier * fearAmplifier * (0.7 + rng() * 0.6),
  );
  const news = Math.round(
    BASE_VOLUMES.news * p.volMultiplier * fearAmplifier * (0.7 + rng() * 0.6),
  );

  return { twitter, reddit, news };
}

// ─────────────────────────────────────────────────────────────────────────────
// PER-SYMBOL SENTIMENT GENERATION
// ─────────────────────────────────────────────────────────────────────────────

function generateSymbolSentiment(
  symbol:        string,
  marketSignal:  number,
  rng:           () => number,
): number {
  const p = personality(symbol);
  const marketComponent = p.beta * marketSignal;
  const idioComponent   = p.idioVol * boxMuller(rng);
  return clamp(round(marketComponent + idioComponent + p.bias, 4), -1, 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPUTE OVERALL SENTIMENT
// ─────────────────────────────────────────────────────────────────────────────

function computeOverall(twitter: number, reddit: number, news: number): number {
  const w = SOURCE_META;
  return round(
    twitter * w.twitter.weight +
    reddit  * w.reddit.weight  +
    news    * w.news.weight,
    4,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SEED GENERATION (deterministic from timestamp + symbol)
// ─────────────────────────────────────────────────────────────────────────────

function makeSeed(symbol: string, ts: number): number {
  let h = 2166136261;
  for (const c of symbol) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h ^ (ts / 1_000 | 0)) >>> 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: generateSnapshot()
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Advance the simulation by one tick and generate a fresh SentimentSnapshot
 * for the given symbol.
 *
 * Side effect: mutates the module-level _marketState to keep continuity.
 * Call once per tick per symbol, in the order: MARKET first, then coins.
 */
export function generateSnapshot(
  symbol:   string,
  previous: SentimentSnapshot | null,
): SentimentSnapshot {
  const now = new Date();
  const rng = seededRng(makeSeed(symbol, Date.now()));

  // Step the global Fear & Greed process
  const fgi = stepFearGreed(rng);
  _marketState.fearGreedIndex = fgi;
  _marketState.twitterSignal  = stepMarketSentiment(_marketState.twitterSignal, fgi, rng);
  _marketState.redditSignal   = stepMarketSentiment(_marketState.redditSignal,  fgi, rng);
  _marketState.newsSignal     = stepMarketSentiment(_marketState.newsSignal,    fgi, rng);

  const twitterSentiment = symbol === MARKET_SYMBOL
    ? _marketState.twitterSignal
    : generateSymbolSentiment(symbol, _marketState.twitterSignal, rng);

  const redditSentiment = symbol === MARKET_SYMBOL
    ? _marketState.redditSignal
    : generateSymbolSentiment(symbol, _marketState.redditSignal, rng);

  const newsSentiment = symbol === MARKET_SYMBOL
    ? _marketState.newsSignal
    : generateSymbolSentiment(symbol, _marketState.newsSignal, rng);

  const overallSentiment = computeOverall(twitterSentiment, redditSentiment, newsSentiment);

  const { twitter, reddit, news } = simulateVolumes(symbol, fgi, rng);

  const zone  = getFearGreedZone(fgi);
  const trend: SentimentTrend | null = previous
    ? getSentimentTrend(fgi, previous.fearGreedIndex)
    : null;

  const snapshot: SentimentSnapshot = {
    id:               generateId(),
    symbol,
    fearGreedIndex:   fgi,
    fearGreedZone:    zone,
    twitterSentiment,
    redditSentiment,
    newsSentiment,
    overallSentiment,
    twitterVolume:    twitter,
    redditVolume:     reddit,
    newsVolume:       news,
    totalVolume:      twitter + reddit + news,
    trend,
    timestamp:        now.toISOString(),
  };

  return snapshot;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: generateColdStartHistory()
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a backfilled history of snapshots for a symbol.
 * Called once per symbol on first load to populate sparkline charts.
 *
 * Uses a fixed seed so the history is deterministic across refreshes
 * (same data on every page load until the user triggers a live tick).
 *
 * @param symbol         Target coin symbol or MARKET_SYMBOL
 * @param count          Number of historical data points (default: COLD_START_SNAPSHOT_COUNT)
 * @param intervalMs     Time between data points in ms (default: 5 minutes)
 */
export function generateColdStartHistory(
  symbol:     string,
  count       = COLD_START_SNAPSHOT_COUNT,
  intervalMs  = 5 * 60 * 1_000,
): SentimentSnapshot[] {
  const now   = Date.now();
  const rng   = seededRng(makeSeed(symbol, 0));  // seed=0 → same every time

  // Walk the OU process forward from a neutral starting point
  let fgi   = 50;
  let twit  = 0.0;
  let redd  = 0.0;
  let news  = 0.0;

  const snapshots: SentimentSnapshot[] = [];

  for (let i = 0; i < count; i++) {
    const ts = now - (count - i) * intervalMs;

    // OU step (simplified — no module-level state mutation during cold start)
    fgi  = clamp(fgi  + 0.05 * (50  - fgi)  + 6.0 * boxMuller(rng), 0, 100);
    twit = clamp(twit + 0.08 * ((fgi / 50 - 1) - twit) + 0.07 * boxMuller(rng), -1, 1);
    redd = clamp(redd + 0.08 * ((fgi / 50 - 1) - redd) + 0.07 * boxMuller(rng), -1, 1);
    news = clamp(news + 0.08 * ((fgi / 50 - 1) - news) + 0.07 * boxMuller(rng), -1, 1);

    const p = personality(symbol);
    const twitterSentiment = symbol === MARKET_SYMBOL ? twit : clamp(round(p.beta * twit + p.idioVol * boxMuller(rng) + p.bias, 4), -1, 1);
    const redditSentiment  = symbol === MARKET_SYMBOL ? redd : clamp(round(p.beta * redd + p.idioVol * boxMuller(rng) + p.bias, 4), -1, 1);
    const newsSentiment    = symbol === MARKET_SYMBOL ? news : clamp(round(p.beta * news + p.idioVol * boxMuller(rng) + p.bias, 4), -1, 1);
    const overallSentiment = computeOverall(twitterSentiment, redditSentiment, newsSentiment);

    const vols = simulateVolumes(symbol, fgi, rng);
    const zone = getFearGreedZone(Math.round(fgi));

    const prev = snapshots[snapshots.length - 1] ?? null;
    const trend: SentimentTrend | null = prev ? getSentimentTrend(fgi, prev.fearGreedIndex) : null;

    snapshots.push({
      id:               generateId(),
      symbol,
      fearGreedIndex:   Math.round(fgi * 10) / 10,
      fearGreedZone:    zone,
      twitterSentiment: round(twitterSentiment, 4),
      redditSentiment:  round(redditSentiment, 4),
      newsSentiment:    round(newsSentiment, 4),
      overallSentiment: round(overallSentiment, 4),
      twitterVolume:    vols.twitter,
      redditVolume:     vols.reddit,
      newsVolume:       vols.news,
      totalVolume:      vols.twitter + vols.reddit + vols.news,
      trend,
      timestamp:        new Date(ts).toISOString(),
    });
  }

  return snapshots;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: evaluateAlertCondition()
// ─────────────────────────────────────────────────────────────────────────────

import type { SentimentAlert } from './sentimentTypes';

/**
 * Returns true if the latest snapshot satisfies the alert's condition.
 */
export function evaluateAlertCondition(
  alert:    SentimentAlert,
  snapshot: SentimentSnapshot,
): boolean {
  if (!alert.isActive) return false;
  if (alert.symbol !== snapshot.symbol && alert.symbol !== MARKET_SYMBOL) return false;

  const { condition, threshold } = alert;
  const fgi     = snapshot.fearGreedIndex;
  const overall = snapshot.overallSentiment;
  const volume  = snapshot.totalVolume;

  switch (condition) {
    case 'fear_above':    return fgi >= threshold;
    case 'fear_below':    return fgi <= threshold;
    case 'greed_above':   return fgi >= threshold;
    case 'greed_below':   return fgi <= threshold;
    case 'overall_above': return overall >= threshold;
    case 'overall_below': return overall <= threshold;
    case 'volume_spike':  return volume >= threshold;
    default:              return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: computeAggregateSentiment()
// ─────────────────────────────────────────────────────────────────────────────

import type { AggregateSentiment } from './sentimentTypes';

/**
 * Compute a live AggregateSentiment summary from the two most recent snapshots.
 */
export function computeAggregateSentiment(
  symbol:   string,
  history:  SentimentSnapshot[],
): AggregateSentiment | null {
  const sorted  = [...history].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const latest  = sorted[0];
  const previous = sorted[1] ?? null;

  if (!latest) return null;

  const fearGreedDelta  = previous ? round(latest.fearGreedIndex   - previous.fearGreedIndex,   2) : null;
  const overallDelta    = previous ? round(latest.overallSentiment - previous.overallSentiment,  4) : null;
  const volumeDelta     = previous ? latest.totalVolume - previous.totalVolume                     : null;
  const trend           = previous ? getSentimentTrend(latest.fearGreedIndex, previous.fearGreedIndex) : 'stable';

  return {
    symbol,
    latest,
    previous,
    fearGreedDelta,
    overallDelta,
    volumeDelta,
    trend,
    zone: latest.fearGreedZone,
  };
}
