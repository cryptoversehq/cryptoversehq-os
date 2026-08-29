/**
 * useBinanceLiveFeed.ts
 *
 * Optional, opt-in real-time price + order-book feed via Binance's public
 * WebSocket streams (no API key required — this is public market data).
 *
 * This is intentionally the FIRST real-time data source added to the app:
 * every other "live" number in the trading terminal is either a polled
 * REST call (CoinGecko, every 30s+) or a fully synthetic GBM tick. A
 * WebSocket push feed is qualitatively different — sub-second updates with
 * no polling interval to drift out of sync with anything else.
 *
 * Design constraints, matching the rest of the app's data philosophy:
 *   - OFF by default. The caller passes `enabled` — nothing connects until
 *     the user explicitly opts in via a UI toggle.
 *   - Fails silently and falls back. If the socket can't connect (network
 *     policy, firewall, symbol not listed, etc.) `connected` simply stays
 *     false forever and the caller keeps using its existing simulated/
 *     polled price — exactly like the CoinGecko fallback pattern.
 *   - Bounded reconnect attempts with backoff, so a permanently-blocked
 *     environment doesn't retry forever in the background.
 */
import { useEffect, useRef, useState } from 'react';
import type { OrderBook as OBType, OrderBookLevel } from '@/lib/marketEngine';

export interface BinanceLiveTicker {
  price:        number;
  changePct24h: number;
  high24h:      number;
  low24h:       number;
  volumeQuote:  number; // 24h quote-asset (USDT) volume
}

export interface UseBinanceLiveFeedResult {
  connected: boolean;
  ticker:    BinanceLiveTicker | null;
  book:      OBType | null;
}

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 1_500;

/** Converts raw Binance depth20 levels ([priceStr, qtyStr][]) into the app's OrderBook shape. */
function convertDepth(rawBids: [string, string][], rawAsks: [string, string][]): OBType {
  // Binance sends bids best→worst (high→low) and asks best→worst (low→high) —
  // this matches the pre-sort convention marketEngine.generateOrderBook() uses
  // internally, so cumulative totals/depth bars are computed the same way.
  const bids: OrderBookLevel[] = rawBids.map(([p, q]) => ({
    price: parseFloat(p), amount: parseFloat(q), total: 0, depth: 0,
  }));
  const asksAsc: OrderBookLevel[] = rawAsks.map(([p, q]) => ({
    price: parseFloat(p), amount: parseFloat(q), total: 0, depth: 0,
  }));

  let cumBid = 0;
  for (const b of bids) { cumBid += b.amount; b.total = +cumBid.toFixed(6); }
  let cumAsk = 0;
  for (const a of asksAsc) { cumAsk += a.amount; a.total = +cumAsk.toFixed(6); }

  const maxCum = Math.max(cumBid, cumAsk) || 1;
  for (const b of bids)   b.depth = b.total / maxCum;
  for (const a of asksAsc) a.depth = a.total / maxCum;

  const bestBid = bids[0]?.price ?? 0;
  const bestAsk = asksAsc[0]?.price ?? 0;
  const midPrice = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : (bestBid || bestAsk || 1);
  const spread = bestAsk && bestBid ? bestAsk - bestBid : 0;

  return {
    bids,
    // OBType contract: asks sorted low → high (best ask first). Binance
    // already delivers asks in this order; generateOrderBook() now follows
    // the same contract, so no re-sort is needed.
    asks: asksAsc,
    spread: +spread.toFixed(6),
    spreadPct: +((spread / midPrice) * 100).toFixed(4),
  };
}

/**
 * Opts into a live Binance ticker + top-20 depth feed for `symbol`
 * (e.g. "btcusdt"). Pass `enabled={false}` or `symbol={null}` to stay
 * fully disconnected — the default, safe state.
 */
export function useBinanceLiveFeed(symbol: string | null, enabled: boolean): UseBinanceLiveFeedResult {
  const [connected, setConnected] = useState(false);
  const [ticker, setTicker] = useState<BinanceLiveTicker | null>(null);
  const [book, setBook]     = useState<OBType | null>(null);

  const attemptsRef = useRef(0);
  const wsRef        = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Reset everything on symbol/enabled change so stale data never leaks
    // across coins or across an enable→disable→enable toggle.
    setConnected(false);
    setTicker(null);
    setBook(null);
    attemptsRef.current = 0;

    if (!enabled || !symbol) return;

    let cancelled = false;

    function connect() {
      if (cancelled) return;
      const streams = `${symbol}@ticker/${symbol}@depth20@1000ms`;
      let ws: WebSocket;
      try {
        ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);
      } catch {
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        attemptsRef.current = 0;
        setConnected(true);
      };

      ws.onmessage = (evt) => {
        if (cancelled) return;
        try {
          const parsed = JSON.parse(evt.data as string) as { stream: string; data: Record<string, unknown> };
          if (parsed.stream.endsWith('@ticker')) {
            const d = parsed.data as { c: string; P: string; h: string; l: string; q: string };
            setTicker({
              price:        parseFloat(d.c),
              changePct24h: parseFloat(d.P),
              high24h:      parseFloat(d.h),
              low24h:       parseFloat(d.l),
              volumeQuote:  parseFloat(d.q),
            });
          } else if (parsed.stream.endsWith('@depth20@1000ms')) {
            const d = parsed.data as { bids: [string, string][]; asks: [string, string][] };
            setBook(convertDepth(d.bids, d.asks));
          }
        } catch {
          // malformed frame — ignore, next message will arrive shortly
        }
      };

      ws.onerror = () => {
        // onclose fires right after in browsers — reconnect handled there
      };

      ws.onclose = () => {
        if (cancelled) return;
        setConnected(false);
        scheduleReconnect();
      };
    }

    function scheduleReconnect() {
      if (cancelled) return;
      if (attemptsRef.current >= MAX_RECONNECT_ATTEMPTS) return; // give up quietly
      const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, attemptsRef.current);
      attemptsRef.current += 1;
      reconnectTimerRef.current = setTimeout(connect, delay);
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [symbol, enabled]);

  return { connected, ticker, book };
}
