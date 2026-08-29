/**
 * portfolioPriceService.ts — CryptoVerse HQ Live Portfolio Prices
 *
 * Consumes GlobalPriceEngine (shared market data source) for real-time
 * portfolio pricing. No longer runs its own CoinGecko polling — all
 * components (Trading, Portfolio, Watchlist, Notifications) now share
 * one price feed.
 *
 * Falls back to simulated prices via the engine if live data is unavailable.
 */

import { useTradingStore, calcPositionPnl } from '@/lib/tradingStore';
import { subscribePrices, getCurrentPrice, type CoinPriceSnapshot } from '@/lib/globalPriceEngine';

export interface LivePrice {
  coinId: string;
  usd: number;
  change24h: number;
  lastUpdated: number;
}

export interface PositionPnl {
  positionId: string;
  symbol: string;
  side: 'long' | 'short';
  entryPrice: number;
  quantity: number;
  costBasis: number;
  currentPrice: number;
  valueUsd: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  leverage: number;
  color: string;
  stopLoss?: number;
  takeProfit?: number;
}

// ── Subscriber-based price feed (from GlobalPriceEngine) ─────────────────────

type PriceListener = (prices: Map<string, LivePrice>) => void;
let _listeners = new Set<PriceListener>();
let _unsubscribeEngine: (() => void) | null = null;
let _latestPrices = new Map<string, LivePrice>();
let _started = false;

function onEngineTick(snapshot: CoinPriceSnapshot): void {
  const map = new Map<string, LivePrice>();
  for (const [id, cp] of snapshot.prices) {
    map.set(id, {
      coinId: id,
      usd: cp.price,
      change24h: cp.change24h,
      lastUpdated: cp.lastLiveUpdate || snapshot.timestamp,
    });
  }
  _latestPrices = map;
  for (const fn of _listeners) {
    try { fn(map); } catch { /* ignore */ }
  }
}

/** Subscribe to live price updates from GlobalPriceEngine. Returns unsubscribe function. */
export function subscribePortfolioPrices(listener: PriceListener): () => void {
  _listeners.add(listener);

  if (_latestPrices.size > 0) {
    try { listener(new Map(_latestPrices)); } catch { /* ignore */ }
  }

  if (!_started) {
    _started = true;
    _unsubscribeEngine = subscribePrices([], onEngineTick);
  }

  return () => {
    _listeners.delete(listener);
    if (_listeners.size === 0 && _unsubscribeEngine) {
      _unsubscribeEngine();
      _unsubscribeEngine = null;
      _started = false;
    }
  };
}

/** Get a snapshot of the latest prices. */
export function getLatestPrices(): Map<string, LivePrice> {
  return new Map(_latestPrices);
}

/** Get the current USD price for a coin symbol. */
export function getPriceForSymbol(symbol: string): number | null {
  // Match by coinId (the engine uses CoinGecko IDs as coinIds)
  const cgId = symbol.toLowerCase();
  const entry = _latestPrices.get(cgId);
  if (entry) return entry.usd;
  // Try direct lookup from engine
  const cp = getCurrentPrice(cgId);
  return cp?.price ?? null;
}

// ── Position P&L computer ────────────────────────────────────────────────────

export function computePositionsWithPnl(): PositionPnl[] {
  const positions = useTradingStore.getState().positions;
  return positions.map(pos => {
    const cgId = pos.coinId.toLowerCase();
    const price = _latestPrices.get(cgId)?.usd ?? pos.entryPrice;
    const { rawPnl, pnlPct } = calcPositionPnl(pos, price);
    const valueUsd = pos.quantity * price;
    return {
      positionId: pos.id,
      symbol: pos.symbol,
      side: pos.side,
      entryPrice: pos.entryPrice,
      quantity: pos.quantity,
      costBasis: pos.costBasis,
      currentPrice: price,
      valueUsd,
      unrealizedPnl: rawPnl,
      unrealizedPnlPct: pnlPct,
      leverage: pos.leverage,
      color: pos.color,
      stopLoss: pos.stopLoss,
      takeProfit: pos.takeProfit,
    };
  });
}
