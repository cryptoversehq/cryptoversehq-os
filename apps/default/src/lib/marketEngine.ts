// ─── Market Engine ────────────────────────────────────────────────────────────
// Generates realistic OHLCV candles, order book depth, and trade feed.
// All simulation — no external API calls needed.

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1D' | '1W';

export const TF_MS: Record<Timeframe, number> = {
  '1m':  60_000,
  '5m':  300_000,
  '15m': 900_000,
  '1h':  3_600_000,
  '4h':  14_400_000,
  '1D':  86_400_000,
  '1W':  604_800_000,
};

// ─── OHLCV Candle ─────────────────────────────────────────────────────────────

export interface Candle {
  time:   number; // unix ms
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
}

/** Generate `count` historical candles ending now, walking a random GBM. */
export function generateCandles(
  basePrice: number,
  tf: Timeframe,
  count = 120,
): Candle[] {
  const intervalMs = TF_MS[tf];
  const now = Date.now();
  const startTime = now - intervalMs * count;

  const volatility = 0.012; // 1.2 % per candle
  const drift      = 0.0001;

  const candles: Candle[] = [];
  let price = basePrice * (0.88 + Math.random() * 0.24);

  for (let i = 0; i < count; i++) {
    const open = price;
    const move = drift + volatility * (Math.random() - 0.5) * 2;
    const close = Math.max(open * (1 + move), 0.00001);
    const range = Math.abs(close - open);
    const high  = Math.max(open, close) + range * (0.3 + Math.random() * 0.7);
    const low   = Math.min(open, close) - range * (0.3 + Math.random() * 0.7);
    const volume = basePrice * (50 + Math.random() * 200);

    candles.push({
      time: startTime + i * intervalMs,
      open:   round(open,  basePrice),
      high:   round(high,  basePrice),
      low:    round(low,   basePrice),
      close:  round(close, basePrice),
      volume: Math.round(volume),
    });

    price = close;
  }

  return candles;
}

/** Evolve the last candle or append a new one based on the current price. */
export function tickCandles(
  candles: Candle[],
  currentPrice: number,
  tf: Timeframe,
): Candle[] {
  if (candles.length === 0) return candles;
  const intervalMs = TF_MS[tf];
  const now = Date.now();
  const last = candles[candles.length - 1];

  // If we're still within the same bar — update close/high/low
  if (now < last.time + intervalMs) {
    const updated: Candle = {
      ...last,
      close:  currentPrice,
      high:   Math.max(last.high, currentPrice),
      low:    Math.min(last.low,  currentPrice),
      volume: last.volume + Math.random() * 10,
    };
    return [...candles.slice(0, -1), updated];
  }

  // New bar
  const newCandle: Candle = {
    time:   last.time + intervalMs,
    open:   last.close,
    high:   Math.max(last.close, currentPrice),
    low:    Math.min(last.close, currentPrice),
    close:  currentPrice,
    volume: Math.random() * 100,
  };
  return [...candles.slice(-199), newCandle];
}

// ─── Order Book ───────────────────────────────────────────────────────────────

export interface OrderBookLevel {
  price:  number;
  amount: number;
  total:  number;
  depth:  number; // 0–1 for bar width
}

export interface OrderBook {
  bids: OrderBookLevel[]; // sorted high → low
  asks: OrderBookLevel[]; // sorted low → high
  spread: number;
  spreadPct: number;
}

export function generateOrderBook(midPrice: number, levels = 18): OrderBook {
  const tickSize = midPrice > 10_000 ? 0.1 : midPrice > 100 ? 0.01 : 0.0001;

  const bids: OrderBookLevel[] = [];
  const asks: OrderBookLevel[] = [];

  let bidTotal = 0;
  let askTotal = 0;

  for (let i = 0; i < levels; i++) {
    const bidPrice = midPrice - tickSize * (i + 1) * (1 + Math.random() * 0.4);
    const askPrice = midPrice + tickSize * (i + 1) * (1 + Math.random() * 0.4);

    // Larger orders near the mid
    const bidAmt = (0.5 + Math.random() * 3) * (1 / (i * 0.15 + 1));
    const askAmt = (0.5 + Math.random() * 3) * (1 / (i * 0.15 + 1));

    bidTotal += bidAmt;
    askTotal += askAmt;

    bids.push({ price: round(bidPrice, midPrice), amount: +bidAmt.toFixed(4), total: 0, depth: 0 });
    asks.push({ price: round(askPrice, midPrice), amount: +askAmt.toFixed(4), total: 0, depth: 0 });
  }

  // Enforce the OBType contract BEFORE computing anything: bids high → low,
  // asks low → high. The random jitter above can invert adjacent levels, and
  // the old code returned asks sorted high → low ("for display"), which
  // contradicted the documented contract and broke every consumer:
  // OrderBook.tsx's `slice(0, levels)` displayed the WORST asks and dropped
  // the best ones, the row next to the spread was the furthest price, and
  // simulated books were ordered opposite to Binance WebSocket books.
  bids.sort((a, b) => b.price - a.price); // best (highest) bid first
  asks.sort((a, b) => a.price - b.price); // best (lowest)  ask first

  // Cumulative totals & depth bars — best-first, growing away from the spread
  let cumBid = 0, cumAsk = 0;
  for (const b of bids) { cumBid += b.amount; b.total = +cumBid.toFixed(4); }
  for (const a of asks) { cumAsk += a.amount; a.total = +cumAsk.toFixed(4); }
  const maxCum = Math.max(cumBid, cumAsk);
  for (const b of bids) b.depth = b.total / maxCum;
  for (const a of asks) a.depth = a.total / maxCum;

  const spread    = asks[0].price - bids[0].price;
  const spreadPct = (spread / midPrice) * 100;

  return {
    bids,
    asks,
    spread: +spread.toFixed(6),
    spreadPct: +spreadPct.toFixed(4),
  };
}

// ─── Trade Feed ───────────────────────────────────────────────────────────────

export interface TradeFeedItem {
  id:     string;
  price:  number;
  amount: number;
  side:   'buy' | 'sell';
  time:   string;
}

export function generateTrade(midPrice: number): TradeFeedItem {
  const side  = Math.random() > 0.5 ? 'buy' : 'sell';
  const jitter = (Math.random() - 0.5) * 0.002 * midPrice;
  return {
    id:     Math.random().toString(36).slice(2),
    price:  round(midPrice + jitter, midPrice),
    amount: +(Math.random() * 2).toFixed(4),
    side,
    time:   new Date().toLocaleTimeString(),
  };
}

// ─── Indicators ──────────────────────────────────────────────────────────────

export interface IndicatorPoint {
  time:  number;
  value: number | null;
}

/** Simple Moving Average */
export function calcSMA(candles: Candle[], period: number): IndicatorPoint[] {
  return candles.map((c, i) => {
    if (i < period - 1) return { time: c.time, value: null };
    const slice = candles.slice(i - period + 1, i + 1);
    const avg   = slice.reduce((s, x) => s + x.close, 0) / period;
    return { time: c.time, value: +avg.toFixed(6) };
  });
}

/** RSI */
export function calcRSI(candles: Candle[], period = 14): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < period) { result.push({ time: candles[i].time, value: null }); continue; }
    const slice = candles.slice(i - period + 1, i + 1);
    let gains = 0, losses = 0;
    for (let j = 1; j < slice.length; j++) {
      const diff = slice[j].close - slice[j - 1].close;
      if (diff > 0) gains  += diff;
      else          losses -= diff;
    }
    const rs  = gains / (losses || 0.0001);
    const rsi = 100 - 100 / (1 + rs);
    result.push({ time: candles[i].time, value: +rsi.toFixed(2) });
  }
  return result;
}

/** MACD (12, 26, 9) */
export function calcMACD(candles: Candle[]): {
  macd:   IndicatorPoint[];
  signal: IndicatorPoint[];
  hist:   IndicatorPoint[];
} {
  const ema12 = calcEMA(candles.map(c => c.close), 12);
  const ema26 = calcEMA(candles.map(c => c.close), 26);
  const macd  = candles.map((c, i) => ({
    time:  c.time,
    value: ema12[i] !== null && ema26[i] !== null ? +((ema12[i] as number) - (ema26[i] as number)).toFixed(6) : null,
  }));
  const macdValues = macd.map(x => x.value as number);
  const signalArr  = calcEMA(macdValues, 9);
  const signal = candles.map((c, i) => ({ time: c.time, value: signalArr[i] }));
  const hist   = candles.map((c, i) => ({
    time:  c.time,
    value: macd[i].value !== null && signal[i].value !== null
      ? +((macd[i].value as number) - (signal[i].value as number)).toFixed(6)
      : null,
  }));
  return { macd, signal, hist };
}

function calcEMA(values: number[], period: number): (number | null)[] {
  const k      = 2 / (period + 1);
  const result: (number | null)[] = new Array(values.length).fill(null);
  let   ema: number | null = null;
  for (let i = 0; i < values.length; i++) {
    if (values[i] == null) continue;
    if (ema === null) { ema = values[i]; }
    else              { ema = values[i] * k + ema * (1 - k); }
    if (i >= period - 1) result[i] = +ema.toFixed(8);
  }
  return result;
}

// ─── Price precision helper ───────────────────────────────────────────────────

function round(price: number, ref: number): number {
  const dec =
    ref > 10_000 ? 1 :
    ref > 1_000  ? 2 :
    ref > 10     ? 4 :
    ref > 1      ? 5 : 8;
  return +price.toFixed(dec);
}
