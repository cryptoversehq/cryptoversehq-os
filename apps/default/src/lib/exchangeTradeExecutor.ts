/**
 * exchangeTradeExecutor.ts
 * §4.2 — Real Trade Executor
 *
 * Multi-exchange router that:
 *   – Runs all risk checks first (delegating to RiskManager)
 *   – Checks 2FA requirement
 *   – Routes to the correct exchange adapter
 *   – Simulates HMAC-SHA256 signature generation (real keys never leave the browser)
 *   – Records the trade in local store
 *   – Updates risk metrics post-trade
 *   – Sends in-app notification
 *
 * "Real" exchange calls are simulated: in production these would be
 * proxied through a backend that holds the encrypted secrets.
 */

import { ExchangeId, ExchangeConnection, RiskControls, RealTrade, TradingMode } from './exchangeTypes';
import { riskManager, TradeRequest, RiskCheckResult } from './exchangeRiskManager';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface RealTradeRequest {
  symbol:       string;
  side:         'buy' | 'sell';
  amount:       number;
  price:        number;
  orderType:    'market' | 'limit' | 'stop_limit' | 'stop_market';
  leverage?:    number;
  twoFactorCode?: string;
  mode:         TradingMode;
}

export interface RealTradeResult {
  success:    boolean;
  orderId?:   string;
  price?:     number;
  total?:     number;
  fee?:       number;
  feeCoin?:   string;
  pnl?:       number;
  status?:    string;
  error?:     string;
  riskWarnings?: string[];
}

export interface TradeNotification {
  type:    'trade_executed' | 'risk_warning' | 'kill_switch' | 'daily_limit';
  title:   string;
  message: string;
  tradeId?: string;
}

// ── Notification queue (in-memory, consumed by UI) ────────────────────────────

const _notifQueue: TradeNotification[] = [];

export function consumeTradeNotifications(): TradeNotification[] {
  return _notifQueue.splice(0);
}

function pushNotification(n: TradeNotification) {
  _notifQueue.push(n);
}

// ── Simulated signature generation ────────────────────────────────────────────
// In real implementation: HMAC-SHA256 with the secret — done on backend

function generateSignature(secret: string, params: Record<string, string | number>): string {
  // Simulate a deterministic but opaque signature for demo purposes
  const payload = Object.entries(params).map(([k, v]) => `${k}=${v}`).join('&');
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    hash = ((hash << 5) - hash + payload.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(16).padStart(16, '0') + secret.slice(0, 8);
}

// ── Exchange adapters ──────────────────────────────────────────────────────────

/** §4.2 executeBinanceTrade — simulated */
async function executeBinanceTrade(
  connection: ExchangeConnection,
  trade:      RealTradeRequest,
): Promise<RealTradeResult> {
  const timestamp = Date.now();
  const signature = generateSignature('binance_secret', {
    symbol:    trade.symbol.replace('/', ''),
    side:      trade.side.toUpperCase(),
    type:      trade.orderType.toUpperCase(),
    quantity:  trade.amount,
    price:     trade.price,
    timestamp,
  });

  // Simulate: POST https://api.binance.com/api/v3/order
  await delay(600 + Math.random() * 400);

  // Simulate 2% slippage on market orders
  const execPrice = trade.orderType === 'market'
    ? trade.price * (1 + (Math.random() - 0.5) * 0.002)
    : trade.price;

  const total  = trade.amount * execPrice;
  const fee    = total * 0.001; // BNB discount: normally 0.1%
  const orderId = `binance_${timestamp}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    success:  true,
    orderId,
    price:    parseFloat(execPrice.toFixed(2)),
    total:    parseFloat(total.toFixed(4)),
    fee:      parseFloat(fee.toFixed(6)),
    feeCoin:  'BNB',
    status:   trade.orderType === 'market' ? 'FILLED' : 'NEW',
  };
}

/** §4.2 executeCoinbaseTrade — simulated */
async function executeCoinbaseTrade(
  connection: ExchangeConnection,
  trade:      RealTradeRequest,
): Promise<RealTradeResult> {
  await delay(800 + Math.random() * 400);

  const execPrice = trade.price * (1 + (Math.random() - 0.5) * 0.0015);
  const total     = trade.amount * execPrice;
  const fee       = total * 0.006; // Coinbase ~0.6% taker fee
  const orderId   = `cb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  return {
    success: true,
    orderId,
    price:   parseFloat(execPrice.toFixed(2)),
    total:   parseFloat(total.toFixed(4)),
    fee:     parseFloat(fee.toFixed(6)),
    feeCoin: 'USD',
    status:  'done',
  };
}

/** §4.2 executeKrakenTrade — simulated */
async function executeKrakenTrade(
  connection: ExchangeConnection,
  trade:      RealTradeRequest,
): Promise<RealTradeResult> {
  await delay(700 + Math.random() * 500);

  const execPrice = trade.price * (1 + (Math.random() - 0.5) * 0.0018);
  const total     = trade.amount * execPrice;
  const fee       = total * 0.0026; // Kraken 0.26% maker fee
  const txid      = `kraken_${Math.random().toString(36).slice(2, 14).toUpperCase()}`;

  return {
    success: true,
    orderId: txid,
    price:   parseFloat(execPrice.toFixed(2)),
    total:   parseFloat(total.toFixed(4)),
    fee:     parseFloat(fee.toFixed(6)),
    feeCoin: 'USD',
    status:  'closed',
  };
}

/** §4.2 executeOKXTrade — simulated */
async function executeOKXTrade(
  connection: ExchangeConnection,
  trade:      RealTradeRequest,
): Promise<RealTradeResult> {
  const timestamp = new Date().toISOString();
  const signature = generateSignature('okx_secret', {
    timestamp,
    method: 'POST',
    path:   '/api/v5/trade/order',
  });

  await delay(500 + Math.random() * 400);

  const execPrice = trade.price * (1 + (Math.random() - 0.5) * 0.0012);
  const total     = trade.amount * execPrice;
  const fee       = total * 0.001;
  const ordId     = `okx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    success: true,
    orderId: ordId,
    price:   parseFloat(execPrice.toFixed(2)),
    total:   parseFloat(total.toFixed(4)),
    fee:     parseFloat(fee.toFixed(6)),
    feeCoin: 'USDT',
    status:  'filled',
  };
}

// ── Main executor ──────────────────────────────────────────────────────────────

export class ExchangeTradeExecutor {

  /**
   * §4.2: `executeTrade` — full pipeline.
   */
  async executeTrade(
    connection:   ExchangeConnection,
    trade:        RealTradeRequest,
    controls:     RiskControls,
    availableUSD: number,
    availableBase: number,
    requires2FA:  boolean,
  ): Promise<RealTradeResult> {

    // ── Step 1: Risk check ──────────────────────────────────────────────────
    const riskResult = riskManager.checkTradeRisk(
      connection.id,
      { ...trade },
      controls,
      availableUSD,
      availableBase,
    );

    if (!riskResult.allowed) {
      return { success: false, error: `Risk check failed: ${riskResult.reason}`, riskWarnings: [] };
    }

    // ── Step 2: 2FA check ───────────────────────────────────────────────────
    if (requires2FA && !trade.twoFactorCode) {
      return { success: false, error: '2FA code is required for real trades. Enable in Settings → Security.' };
    }

    if (requires2FA && trade.twoFactorCode) {
      // Validate format (6-digit TOTP)
      if (!/^\d{6}$/.test(trade.twoFactorCode)) {
        return { success: false, error: 'Invalid 2FA code. Enter the 6-digit code from your authenticator app.' };
      }
      // Simulate TOTP verification (always pass in demo)
    }

    // ── Step 3: Check connection is active ──────────────────────────────────
    if (connection.status !== 'connected') {
      return { success: false, error: `Exchange connection is ${connection.status}. Re-connect in Connections tab.` };
    }

    if (connection.isReadOnly) {
      return { success: false, error: 'This connection is read-only. Reconnect with trading permissions.' };
    }

    // ── Step 4: Route to exchange adapter ──────────────────────────────────
    let result: RealTradeResult;

    switch (connection.exchangeId) {
      case 'binance':
        result = await executeBinanceTrade(connection, trade);
        break;
      case 'coinbase':
        result = await executeCoinbaseTrade(connection, trade);
        break;
      case 'kraken':
        result = await executeKrakenTrade(connection, trade);
        break;
      case 'okx':
        result = await executeOKXTrade(connection, trade);
        break;
      default:
        return { success: false, error: `Unsupported exchange: ${connection.exchangeId}` };
    }

    if (!result.success) return result;

    // ── Step 5: Calculate mock PnL for sells ───────────────────────────────
    if (trade.side === 'sell') {
      // Simulate a random P&L for the sell (in reality this needs cost-basis tracking)
      result.pnl = parseFloat(((Math.random() - 0.35) * (result.total ?? 0) * 0.05).toFixed(2));
    }

    // ── Step 6: Update risk metrics ─────────────────────────────────────────
    riskManager.updateMetrics(connection.id, result.pnl ?? 0, controls, {
      onKillSwitchTriggered: (event) => {
        pushNotification({
          type:    'kill_switch',
          title:   '🛑 Kill Switch Triggered',
          message: event.message,
        });
      },
      onDailyLimitReached: (event) => {
        pushNotification({
          type:    'daily_limit',
          title:   '⚠️ Daily Loss Limit Reached',
          message: `Real Trading Disabled — Daily loss limit of $${controls.maxDailyLossUSD} reached. Trading has been automatically paused.`,
        });
      },
      onLimitWarning: (pct) => {
        if (controls.alertOnLoss) {
          pushNotification({
            type:    'risk_warning',
            title:   '⚠️ Approaching Daily Loss Limit',
            message: `You're at ${pct.toFixed(0)}% of your daily loss limit.`,
          });
        }
      },
    });

    // ── Step 7: Trade notification ──────────────────────────────────────────
    if (controls.alertOnTrade) {
      pushNotification({
        type:    'trade_executed',
        title:   `${trade.side.toUpperCase()} ${trade.symbol} Executed`,
        message: `${trade.amount.toFixed(4)} ${trade.symbol.split('/')[0]} @ $${result.price?.toFixed(2)} | Fee: $${result.fee?.toFixed(4)}`,
        tradeId: result.orderId,
      });
    }

    return { ...result, riskWarnings: riskResult.warnings };
  }

  /**
   * Build a RealTrade record from an executor result (for adding to store).
   */
  buildTradeRecord(
    connectionId: string,
    exchangeId:   ExchangeId,
    request:      RealTradeRequest,
    result:       RealTradeResult,
  ): Omit<RealTrade, 'id'> {
    return {
      connectionId,
      exchangeId,
      symbol:      request.symbol,
      side:        request.side,
      type:        request.orderType,
      status:      result.status === 'FILLED' || result.status === 'filled' || result.status === 'done' || result.status === 'closed' ? 'filled' : 'open',
      quantity:    request.amount,
      price:       request.price,
      filledQty:   request.amount,
      filledAvgPx: result.price ?? request.price,
      feePaid:     result.fee ?? 0,
      feeCurrency: result.feeCoin ?? 'USDT',
      pnl:         result.pnl,
      pnlPct:      result.pnl !== undefined && result.total
        ? (result.pnl / result.total) * 100
        : undefined,
      createdAt:   new Date().toISOString(),
      filledAt:    new Date().toISOString(),
      mode:        request.mode,
      isFromBot:   false,
    };
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ── Singleton ──────────────────────────────────────────────────────────────────

export const tradeExecutor = new ExchangeTradeExecutor();
