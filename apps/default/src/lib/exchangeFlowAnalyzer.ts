/**
 * exchangeFlowAnalyzer.ts — §4.3 Exchange Flow Analyzer
 *
 * Computes net inflow/outflow for major exchanges across supported chains.
 * Generates a FlowSignal ('bullish' | 'bearish' | 'neutral') per exchange
 * and an overall market signal.
 *
 * Logic (mirrors spec §4.3):
 *   - net > 0  → inflow  → accumulation → 'bullish'
 *   - net < 0  → outflow → distribution → 'bearish'
 *   - overall: 'bullish' when bullishCount > bearishCount + 2
 *             'bearish' when bearishCount > bullishCount + 2
 *             otherwise 'neutral'
 *
 * Design: Deterministic simulation — no real API calls.
 *         Values are seeded from exchange name + period so results
 *         are stable within a 5-minute window (good for demo).
 */

import type {
  MonitoredChain, ExchangeFlowReport, ExchangeFlowEntry, FlowSignal,
} from './onChainTypes';

// ── Exchange registry (§4.3 spec) ─────────────────────────────────────────────

export const SUPPORTED_EXCHANGES = ['Binance', 'Coinbase', 'Kraken', 'OKX', 'Bybit'] as const;
export type SupportedExchange = typeof SUPPORTED_EXCHANGES[number];

/** Pseudo exchange addresses used for label matching in simulation */
const EXCHANGE_CHAIN_MAP: Record<SupportedExchange, MonitoredChain[]> = {
  Binance:  ['ethereum', 'bitcoin', 'bnb', 'solana', 'polygon'],
  Coinbase: ['ethereum', 'bitcoin'],
  Kraken:   ['ethereum', 'bitcoin'],
  OKX:      ['ethereum', 'bitcoin', 'bnb', 'solana'],
  Bybit:    ['ethereum', 'bnb', 'polygon'],
};

// ── Deterministic PRNG seeded from string ─────────────────────────────────────

function strHash(s: string): number {
  let h = 2166136261;
  for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function seededRng(seed: number) {
  let s = seed;
  return (): number => {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Returns a time-bucketed seed stable for N minutes */
function timeBucketSeed(exchange: string, symbol: string, period: number, bucketMinutes = 5): number {
  const bucket = Math.floor(Date.now() / (bucketMinutes * 60_000));
  return strHash(`${exchange}:${symbol}:${period}:${bucket}`);
}

// ── Volume generators ─────────────────────────────────────────────────────────

interface ExchangeProfile {
  baseInflowUsd:  number;
  baseOutflowUsd: number;
  netBias:        number;  // positive = net inflow tendency
}

const EXCHANGE_PROFILES: Record<SupportedExchange, ExchangeProfile> = {
  Binance:  { baseInflowUsd: 1_200_000_000, baseOutflowUsd: 1_000_000_000, netBias:  0.15 },
  Coinbase: { baseInflowUsd:   450_000_000, baseOutflowUsd:   600_000_000, netBias: -0.10 },
  Kraken:   { baseInflowUsd:   180_000_000, baseOutflowUsd:   150_000_000, netBias:  0.08 },
  OKX:      { baseInflowUsd:   600_000_000, baseOutflowUsd:   520_000_000, netBias:  0.05 },
  Bybit:    { baseInflowUsd:   350_000_000, baseOutflowUsd:   300_000_000, netBias:  0.12 },
};

function generateFlowEntry(
  exchange: SupportedExchange,
  symbol:   string,
  period:   number,
): ExchangeFlowEntry {
  const profile = EXCHANGE_PROFILES[exchange];
  const rng     = seededRng(timeBucketSeed(exchange, symbol, period));

  // Scale by period (24h = 1, 7d = 7, 30d = 30)
  const scale = period;

  // Symbol modifier: BTC flows are larger USD-wise
  const symMult = symbol === 'BTC' ? 1.0 : symbol === 'ETH' ? 0.8 : 1.2;

  const inflow  = profile.baseInflowUsd  * scale * symMult * (0.85 + rng() * 0.30);
  const outflow = profile.baseOutflowUsd * scale * symMult * (0.85 + rng() * 0.30)
                  * (1 - profile.netBias);

  const netFlow = inflow - outflow;
  const signal: FlowSignal = netFlow > inflow * 0.03
    ? 'bullish'
    : netFlow < -outflow * 0.03
    ? 'bearish'
    : 'neutral';

  return {
    exchange,
    inflow:  Math.round(inflow),
    outflow: Math.round(outflow),
    netFlow: Math.round(netFlow),
    signal,
  };
}

// ── ExchangeFlowAnalyzer class (§4.3 spec interface) ─────────────────────────

export class ExchangeFlowAnalyzer {
  private exchanges: readonly SupportedExchange[];

  constructor(exchanges: readonly SupportedExchange[] = SUPPORTED_EXCHANGES) {
    this.exchanges = exchanges;
  }

  /**
   * Analyze exchange flow for a given symbol over `days`.
   * Returns a complete ExchangeFlowReport with per-exchange entries and overall signal.
   */
  analyzeExchangeFlow(
    _chain:  MonitoredChain,
    symbol:  string = 'BTC',
    days:    number = 1,
  ): ExchangeFlowReport {
    const entries: ExchangeFlowEntry[] = this.exchanges.map(ex =>
      generateFlowEntry(ex, symbol, days)
    );

    let bullishCount = 0;
    let bearishCount = 0;
    for (const e of entries) {
      if (e.signal === 'bullish') bullishCount++;
      if (e.signal === 'bearish') bearishCount++;
    }

    // §4.3 spec: bullish if bullishCount > bearishCount + 2
    let overallSignal: FlowSignal = 'neutral';
    if (bullishCount > bearishCount + 2) overallSignal = 'bullish';
    else if (bearishCount > bullishCount + 2) overallSignal = 'bearish';

    return {
      period:    days,
      symbol,
      entries,
      overallSignal,
      bullishCount,
      bearishCount,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get net flow summary across all exchanges for a quick market signal.
   */
  getMarketSignal(symbol = 'BTC', days = 1): FlowSignal {
    return this.analyzeExchangeFlow('ethereum', symbol, days).overallSignal;
  }

  /**
   * Get per-exchange breakdown for a specific exchange.
   */
  getExchangeEntry(exchange: SupportedExchange, symbol = 'BTC', days = 1): ExchangeFlowEntry {
    return generateFlowEntry(exchange, symbol, days);
  }
}

/** Shared singleton */
export const flowAnalyzer = new ExchangeFlowAnalyzer();
