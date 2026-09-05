/**
 * exchangeSimulator.ts
 *
 * Simulation + security layer for the CryptoVerse HQ Exchange Connection system.
 *
 * Provides:
 *   encryptCredential()       client-side AES-GCM-256 encryption of API keys
 *   decryptCredential()       decryption (only used for live API calls, never for display)
 *   maskApiKey()              safe display mask — shows only last 4 chars
 *   generateDemoTrades()      realistic demo trade history for a new connection
 *   simulateDemoOrder()       instant demo order execution with realistic slippage
 *   buildDemoPortfolio()      simulated balance snapshot for a demo connection
 *   syncSimulation()          mimics a real exchange sync response
 *
 * SECURITY RULES enforced in this module:
 *   1. Raw credentials are zeroed (overwritten) immediately after encryption.
 *   2. No credential value is ever returned to a caller in plaintext.
 *   3. decryptCredential() is present for completeness but flagged as
 *      "live-only" — it should only be called immediately before an API request
 *      and the result must be zeroed after use.
 *   4. No credential is ever logged or appended to any analytics payload.
 *
 * All simulation functions are pure (no side effects). The store owns state.
 */

import {
  SupportedExchange,
  EncryptedCredential,
  RawCredentials,
  RealTrade,
  ExchangeConnection,
  ExchangePortfolio,
  AssetBalance,
  TradeSide,
  OrderType,
  SyncResult,
  EXCHANGE_TAKER_FEE,
  EXCHANGE_FEE_CURRENCY,
  DEMO_STARTING_BALANCE_USD,
} from './exchangeTypes';
import { generateId } from './strategyUtils';

// ─── PRNG ─────────────────────────────────────────────────────────────────────

function seededRng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function strHash(s: string): number {
  let h = 2166136261;
  for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function r2(v: number) { return Math.round(v * 100) / 100; }
function r6(v: number) { return Math.round(v * 1000000) / 1000000; }

function assertDemoConnection(connection: ExchangeConnection): void {
  if (!connection.isDemoMode) {
    throw new Error('Demo simulation is unavailable for live exchange connections.');
  }
}

// ─── CLIENT-SIDE CREDENTIAL ENCRYPTION ───────────────────────────────────────
// Browser encryption and decryption are intentionally disabled. Live exchange
// secrets must be handled by the authenticated server boundary.

/**
 * Encrypts a single plaintext string with AES-GCM-256.
 * SECURITY: The caller is responsible for zeroing `plaintext` after this call.
 */
export async function encryptCredential(
  _plaintext: string,
  _userId:    string,
): Promise<EncryptedCredential> {
  throw new Error('Exchange credentials must be stored and encrypted server-side.');
}

/**
 * Decrypts a credential bundle.
 * ⚠️  LIVE USE ONLY — zero the result immediately after the API call.
 */
export async function decryptCredential(
  _cred:   EncryptedCredential,
  _userId: string,
): Promise<string> {
  throw new Error('Exchange credentials are never decrypted in the browser.');
}

/**
 * Encrypt both halves of a RawCredentials bundle, then zero the originals.
 * Returns the encrypted pair + a masked display key.
 */
export async function encryptRawCredentials(
  _raw:    RawCredentials,
  _userId: string,
): Promise<{
  apiKey:       EncryptedCredential;
  apiSecret:    EncryptedCredential;
  apiKeyMasked: string;
}> {
  throw new Error('Raw exchange credentials must never be handled by browser crypto.');
}

/**
 * Returns a safe display string showing only the last 4 chars of an API key.
 * e.g. "wBXzUq...3f8a" → "••••••••3f8a"
 */
export function maskApiKey(key: string): string {
  if (key.length <= 4) return '••••';
  return '•'.repeat(Math.min(12, key.length - 4)) + key.slice(-4);
}

// ─── DEMO TRADE SYMBOLS ───────────────────────────────────────────────────────

const DEMO_SYMBOLS: Record<SupportedExchange, { symbol: string; base: string; quote: string; basePrice: number }[]> = {
  binance: [
    { symbol: 'BTCUSDT',  base: 'BTC',  quote: 'USDT', basePrice: 65_000 },
    { symbol: 'ETHUSDT',  base: 'ETH',  quote: 'USDT', basePrice: 3_400  },
    { symbol: 'SOLUSDT',  base: 'SOL',  quote: 'USDT', basePrice: 170    },
    { symbol: 'BNBUSDT',  base: 'BNB',  quote: 'USDT', basePrice: 580    },
    { symbol: 'XRPUSDT',  base: 'XRP',  quote: 'USDT', basePrice: 0.62   },
  ],
  coinbase: [
    { symbol: 'BTC-USD',  base: 'BTC',  quote: 'USD', basePrice: 65_000 },
    { symbol: 'ETH-USD',  base: 'ETH',  quote: 'USD', basePrice: 3_400  },
    { symbol: 'SOL-USD',  base: 'SOL',  quote: 'USD', basePrice: 170    },
    { symbol: 'AVAX-USD', base: 'AVAX', quote: 'USD', basePrice: 38     },
  ],
  kraken: [
    { symbol: 'XBTUSD',   base: 'BTC',  quote: 'USD', basePrice: 65_000 },
    { symbol: 'ETHUSD',   base: 'ETH',  quote: 'USD', basePrice: 3_400  },
    { symbol: 'SOLUSD',   base: 'SOL',  quote: 'USD', basePrice: 170    },
    { symbol: 'DOTUSD',   base: 'DOT',  quote: 'USD', basePrice: 8.5    },
  ],
  okx: [
    { symbol: 'BTC-USDT', base: 'BTC',  quote: 'USDT', basePrice: 65_000 },
    { symbol: 'ETH-USDT', base: 'ETH',  quote: 'USDT', basePrice: 3_400  },
    { symbol: 'SOL-USDT', base: 'SOL',  quote: 'USDT', basePrice: 170    },
    { symbol: 'OKB-USDT', base: 'OKB',  quote: 'USDT', basePrice: 45     },
  ],
};

// ─── generateDemoTrades ───────────────────────────────────────────────────────

/**
 * Generate `count` realistic demo trade records for a newly connected account.
 * Trades are spread over the last `days` days with random timestamps.
 */
export function generateDemoTrades(
  connection: ExchangeConnection,
  count:      number = 20,
  days:       number = 30,
): RealTrade[] {
  assertDemoConnection(connection);
  const rng      = seededRng(strHash(connection.id));
  const symbols  = DEMO_SYMBOLS[connection.exchange];
  const feeRate  = EXCHANGE_TAKER_FEE[connection.exchange];
  const feeCcy   = EXCHANGE_FEE_CURRENCY[connection.exchange];
  const now      = Date.now();
  const ONE_DAY  = 86_400_000;

  const trades: RealTrade[] = [];
  const pairPrices: Record<string, number> = {};  // running mid-price per symbol

  for (const sym of symbols) pairPrices[sym.symbol] = sym.basePrice;

  for (let i = 0; i < count; i++) {
    const sym      = symbols[Math.floor(rng() * symbols.length)];
    const side     = rng() < 0.55 ? 'buy' : 'sell';

    // Evolve price slightly between trades
    pairPrices[sym.symbol] *= 0.99 + rng() * 0.02;
    const price = r2(pairPrices[sym.symbol] * (1 + (rng() - 0.5) * 0.002));

    // Amount: small fraction of starting balance
    const targetTotal = DEMO_STARTING_BALANCE_USD * (0.01 + rng() * 0.08);
    const amount      = r6(targetTotal / price);
    const total       = r2(price * amount);
    const fee         = r2(total * feeRate);

    const orderTypes: OrderType[] = ['market','market','market','limit','limit'];
    const orderType = orderTypes[Math.floor(rng() * orderTypes.length)];

    // Timestamp: spread over last `days` days, newest first
    const ageMs     = Math.floor(rng() * days * ONE_DAY);
    const execTime  = new Date(now - ageMs).toISOString();

    // P&L: only meaningful for sells
    let realizedPnl: number | null = null;
    let realizedPnlPct: number | null = null;
    if (side === 'sell') {
      const costBasis = price * (1 - (rng() - 0.4) * 0.08);
      realizedPnl    = r2((price - costBasis) * amount);
      realizedPnlPct = r2(((price - costBasis) / costBasis) * 100);
    }

    trades.push({
      id:             generateId(),
      connectionId:   connection.id,
      userId:         connection.userId,
      orderId:        `DEMO-${Date.now()}-${i}`,
      clientOrderId:  generateId(),
      symbol:         sym.symbol,
      baseAsset:      sym.base,
      quoteAsset:     sym.quote,
      side:           side as TradeSide,
      orderType,
      timeInForce:    orderType === 'market' ? 'IOC' : 'GTC',
      requestedPrice: orderType === 'limit' ? r2(price * (1 + (rng() - 0.5) * 0.005)) : null,
      price,
      amount,
      total,
      fee,
      feeCurrency:    feeCcy,
      feeRate,
      status:         'completed',
      isDemoMode:     connection.isDemoMode,
      realizedPnl,
      realizedPnlPct,
      exchange:       connection.exchange,
      executedAt:     execTime,
      updatedAt:      execTime,
      notes:          '',
    });
  }

  return trades.sort((a, b) => b.executedAt.localeCompare(a.executedAt));
}

// ─── simulateDemoOrder ────────────────────────────────────────────────────────

/**
 * Instantly simulate a demo order execution with realistic slippage.
 * Returns a completed RealTrade (no async API call needed in demo mode).
 */
export function simulateDemoOrder(params: {
  connection:    ExchangeConnection;
  symbol:        string;
  side:          TradeSide;
  orderType:     OrderType;
  price:         number;   // requested price (mid for market orders)
  amount:        number;
}): RealTrade {
  const { connection, symbol, side, orderType, price, amount } = params;
  assertDemoConnection(connection);
  const rng        = seededRng(strHash(connection.id + symbol + Date.now()));
  const feeRate    = EXCHANGE_TAKER_FEE[connection.exchange];
  const feeCcy     = EXCHANGE_FEE_CURRENCY[connection.exchange];

  // Market order slippage: up to 0.15%
  const slippage   = orderType === 'market'
    ? (side === 'buy' ? 1 + rng() * 0.0015 : 1 - rng() * 0.0015)
    : 1;
  const execPrice  = r2(price * slippage);
  const total      = r2(execPrice * amount);
  const fee        = r2(total * feeRate);
  const now        = new Date().toISOString();
  const symbolParts = symbol.split(/[-/]/);

  return {
    id:             generateId(),
    connectionId:   connection.id,
    userId:         connection.userId,
    orderId:        `DEMO-${Date.now()}`,
    clientOrderId:  generateId(),
    symbol,
    baseAsset:      symbolParts[0] ?? 'BTC',
    quoteAsset:     symbolParts[1] ?? 'USDT',
    side,
    orderType,
    timeInForce:    orderType === 'market' ? 'IOC' : 'GTC',
    requestedPrice: price,
    price:          execPrice,
    amount,
    total,
    fee,
    feeCurrency:    feeCcy,
    feeRate,
    status:         'completed',
    isDemoMode:     true,
    realizedPnl:    null,
    realizedPnlPct: null,
    exchange:       connection.exchange,
    executedAt:     now,
    updatedAt:      now,
    notes:          '[Demo] Simulated fill',
  };
}

// ─── buildDemoPortfolio ───────────────────────────────────────────────────────

/**
 * Build a simulated portfolio balance for a demo connection.
 * Assets are derived from the trade history (buy increases, sell decreases).
 */
export function buildDemoPortfolio(
  connection: ExchangeConnection,
  trades:     RealTrade[],
): ExchangePortfolio {
  assertDemoConnection(connection);
  const rng     = seededRng(strHash(connection.id + 'portfolio'));
  const symbols = DEMO_SYMBOLS[connection.exchange];

  // Start with USD/USDT
  const quoteBalance = r2(DEMO_STARTING_BALANCE_USD * (0.3 + rng() * 0.4));
  const quoteAsset   = symbols[0]?.quote ?? 'USDT';

  // Accumulate asset positions from trades
  const assetHoldings: Record<string, number> = {};
  for (const trade of trades) {
    if (!assetHoldings[trade.baseAsset]) assetHoldings[trade.baseAsset] = 0;
    if (trade.side === 'buy')  assetHoldings[trade.baseAsset] = r6(assetHoldings[trade.baseAsset] + trade.amount);
    if (trade.side === 'sell') assetHoldings[trade.baseAsset] = r6(assetHoldings[trade.baseAsset] - trade.amount);
  }

  const prices: Record<string, number> = {};
  for (const sym of symbols) prices[sym.base] = sym.basePrice * (0.95 + rng() * 0.1);

  const balances: AssetBalance[] = [];
  let totalUsd = quoteBalance;

  for (const [asset, qty] of Object.entries(assetHoldings)) {
    if (qty <= 0) continue;
    const usdValue = r2(qty * (prices[asset] ?? 1));
    totalUsd += usdValue;
    balances.push({ asset, free: qty, locked: 0, total: qty, usdValue, pct: 0 });
  }

  // Add quote balance
  balances.push({ asset: quoteAsset, free: quoteBalance, locked: 0, total: quoteBalance, usdValue: quoteBalance, pct: 0 });

  // Normalise percentages
  const total = balances.reduce((s, b) => s + b.usdValue, 0);
  for (const b of balances) b.pct = r2((b.usdValue / (total || 1)) * 100);

  const BTC_PRICE = prices['BTC'] ?? 65_000;

  return {
    connectionId:  connection.id,
    exchange:      connection.exchange,
    isDemoMode:    connection.isDemoMode,
    balances:      balances.sort((a, b) => b.usdValue - a.usdValue),
    totalUsdValue: r2(totalUsd),
    btcValue:      r6(totalUsd / BTC_PRICE),
    timestamp:     new Date().toISOString(),
  };
}

// ─── syncSimulation ───────────────────────────────────────────────────────────

/**
 * Simulate a sync pass for a demo connection.
 * Returns a SyncResult and 0–3 new demo trades.
 */
export function syncSimulation(
  connection: ExchangeConnection,
): { result: SyncResult; newTrades: RealTrade[] } {
  if (!connection.isDemoMode) {
    return {
      result: {
        connectionId: connection.id,
        success: false,
        newTradesFound: 0,
        portfolioUpdated: false,
        error: 'Demo simulation is unavailable for live exchange connections.',
        timestamp: new Date().toISOString(),
      },
      newTrades: [],
    };
  }

  const rng = seededRng(strHash(connection.id + Date.now()));

  // 95% success rate
  const success = rng() < 0.95;

  const newTrades: RealTrade[] = [];
  if (success && connection.isDemoMode) {
    const n = Math.floor(rng() * 3);  // 0, 1, or 2 new trades per sync
    const symbols = DEMO_SYMBOLS[connection.exchange];
    for (let i = 0; i < n; i++) {
      const sym  = symbols[Math.floor(rng() * symbols.length)];
      const side = rng() < 0.55 ? 'buy' : 'sell';
      newTrades.push(simulateDemoOrder({
        connection,
        symbol:    sym.symbol,
        side:      side as TradeSide,
        orderType: 'market',
        price:     sym.basePrice * (0.99 + rng() * 0.02),
        amount:    r6((DEMO_STARTING_BALANCE_USD * 0.03) / sym.basePrice),
      }));
    }
  }

  return {
    result: {
      connectionId:     connection.id,
      success,
      newTradesFound:   newTrades.length,
      portfolioUpdated: success,
      error:            success ? null : 'Simulated sync timeout — will retry.',
      timestamp:        new Date().toISOString(),
    },
    newTrades,
  };
}

// ─── Validation helpers ───────────────────────────────────────────────────────

export function validateApiKey(key: string, exchange: SupportedExchange): string[] {
  const errors: string[] = [];
  const cleaned = key.trim();
  if (!cleaned) { errors.push('API key is required.'); return errors; }
  // OKX keys are UUIDs (36 chars), others are 56–64 chars
  const minLen = exchange === 'okx' ? 32 : 56;
  if (cleaned.length < minLen) {
    errors.push(`API key appears too short for ${exchange.toUpperCase()} (min ${minLen} chars).`);
  }
  return errors;
}

export function validateApiSecret(secret: string): string[] {
  const errors: string[] = [];
  if (!secret.trim()) errors.push('API secret is required.');
  return errors;
}

export function validateConnectionLabel(label: string): string[] {
  const errors: string[] = [];
  if (!label.trim()) errors.push('Label is required.');
  if (label.trim().length > 60) errors.push('Label must be 60 characters or fewer.');
  return errors;
}
