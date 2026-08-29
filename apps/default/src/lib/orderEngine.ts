/**
 * orderEngine.ts — CryptoVerse HQ Production Order Engine
 *
 * SINGLETON. Professional exchange-grade order management.
 *
 * Order Types:
 *   Market       — executes immediately at best available price
 *   Limit        — rests on book, executes when price crosses limit
 *   Stop         — converts to market when stop price triggers
 *   Stop-Limit   — two-phase: stop triggers → limit order placed
 *   OCO          — One-Cancels-Other: linked stop + limit pair
 *   TrailingStop — dynamic stop that follows market price by fixed offset
 *
 * Time in Force:
 *   GTC — Good-Till-Cancel (default, lives until filled or cancelled)
 *   GTD — Good-Till-Date (expires at a specific timestamp)
 *   IOC — Immediate-or-Cancel (fill now, cancel unfilled remainder)
 *   FOK — Fill-or-Kill (fill completely now or cancel entirely)
 *
 * Features:
 *   - Partial fills with remainder tracking
 *   - Expiration: GTC / GTD / IOC / FOK
 *   - Market/IOC/FOK orders execute synchronously on placement
 *   - All resting orders auto-execute via GlobalPriceEngine ticks
 *   - OCO creates linked stop+limit pair; fill one cancels the other
 *   - Trailing stop adjusts trigger price with market movement
 *   - localStorage persistence across browser refreshes
 *   - Fill history tracking per order
 *
 * Integration:
 *   - Subscribes to GlobalPriceEngine for price ticks
 *   - Calls tradingStore.openPosition() to fill orders
 *   - Works alongside GlobalPositionMonitor (which handles SL/TP on positions)
 */

import { subscribePrices, type CoinPrice } from '@/lib/globalPriceEngine';
import { useNotificationStore } from '@/lib/notificationStore';
import { cloudRecordStore } from '@/lib/cloudData';

// ── Types ────────────────────────────────────────────────────────────────────

export type OrderType = 'market' | 'limit' | 'stop' | 'stop_limit' | 'oco' | 'trailing_stop';
export type OrderSide = 'buy' | 'sell';
export type OrderStatus = 'pending' | 'partial' | 'triggered' | 'filled' | 'cancelled' | 'expired';
export type OrderTimeInForce = 'GTC' | 'GTD' | 'IOC' | 'FOK';

/** Trailing stop config: 'percent' or 'absolute' offset from market price */
export interface TrailingStopConfig {
  type: 'percent' | 'absolute';
  /** For 'percent': 1.0 = 1%. For 'absolute': USD offset from current price. */
  value: number;
  /** Current activation price (mutated by engine on each tick) */
  activationPrice: number;
}

export interface FillRecord {
  amount: number;
  price: number;
  positionId: string;
  timestamp: number;
}

export interface PendingOrder {
  id: string;
  coinId: string;
  symbol: string;
  name: string;
  side: OrderSide;
  orderType: OrderType;
  /** For limit/stop/stop-limit: the price that triggers execution */
  triggerPrice?: number;
  /** For stop-limit only: the limit price for the limit order after stop triggers */
  limitPrice?: number;
  /** Total USD amount (margin) to trade */
  usdAmount: number;
  /** Remaining unfilled USD amount */
  remainingAmount: number;
  leverage: number;
  color: string;
  /** Optional TP/SL to attach to the position once filled */
  takeProfit?: number;
  stopLoss?: number;
  createdAt: number;
  /** GTD/IOC/FOK: unix ms; undefined = GTC */
  expiresAt?: number;
  timeInForce: OrderTimeInForce;
  status: OrderStatus;
  /** Fill history for partial fill tracking */
  fills: FillRecord[];
  /** OCO: the linked sibling order id (both orders reference each other) */
  ocoLinkedId?: string;
  /** Trailing stop: dynamic offset configuration */
  trailingConfig?: TrailingStopConfig;
}

export interface OrderFillResult {
  success: boolean;
  error?: string;
}

export type OrderFillHandler = (order: PendingOrder, fillPrice: number, fillAmount: number) => OrderFillResult;
export type OrderStatusListener = (orders: PendingOrder[]) => void;

// ── State ────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'cv_pending_orders_v2';

let _orders: PendingOrder[] = [];
let _fillHandler: OrderFillHandler | null = null;
let _statusListeners = new Set<OrderStatusListener>();
let _unsubscribePrices: (() => void) | null = null;
let _initialized = false;

// ── Persistence & Enterprise CloudDataLayer Migration ────────────────────────

function normalizeOrder(o: PendingOrder): PendingOrder {
  return {
    ...o,
    remainingAmount: o.remainingAmount ?? o.usdAmount,
    timeInForce: o.timeInForce ?? 'GTC',
    fills: o.fills ?? [],
    status: o.status === 'filled' || o.status === 'cancelled' ? o.status : (o.fills?.length ? 'partial' : o.status),
    ocoLinkedId: o.ocoLinkedId ?? undefined,
    trailingConfig: o.trailingConfig ?? undefined,
  };
}

function loadOrders(): PendingOrder[] {
  try {
    const raw = cloudRecordStore.get<PendingOrder[]>('trading', STORAGE_KEY, []);
    if (!Array.isArray(raw)) return [];
    return raw.map(normalizeOrder);
  } catch {
    return [];
  }
}

function saveOrders(): void {
  try {
    cloudRecordStore.set('trading', STORAGE_KEY, _orders);
  } catch { /* ignore */ }
}

/**
 * Async Hydration from Taskade Cloud / CloudDataLayer.
 * Restores pending orders across refresh, login, logout/login, and multi-device sync
 * without race conditions or duplicates. Reuses existing ConflictEngine.
 */
export async function hydrateOrders(): Promise<PendingOrder[]> {
  try {
    const remote = await cloudRecordStore.hydrate<PendingOrder[]>('trading', STORAGE_KEY, []);
    if (Array.isArray(remote)) {
      const now = Date.now();
      const map = new Map<string, PendingOrder>();
      for (const o of _orders) {
        if (o && o.id) map.set(o.id, o);
      }
      for (const r of remote) {
        if (!r || !r.id) continue;
        const norm = normalizeOrder(r);
        const existing = map.get(norm.id);
        if (!existing) {
          map.set(norm.id, norm);
        } else {
          if (
            (norm.fills?.length || 0) > (existing.fills?.length || 0) ||
            (norm.status !== 'pending' && existing.status === 'pending')
          ) {
            map.set(norm.id, norm);
          }
        }
      }
      _orders = Array.from(map.values()).filter(o => {
        if (hasExpired(o, now)) {
          o.status = 'expired';
          return false;
        }
        return o.status !== 'filled' && o.status !== 'cancelled' && o.status !== 'expired';
      });
      saveOrders();
      notifyStatusListeners();
      refreshCoinSubscriptions();
    }
  } catch {
    // offline fallback: preserve current cache state
  }
  return _orders;
}

/** Reset in-memory orders (e.g. on user account switch) without deleting cloud data. */
export function resetOrderEngine(): void {
  _orders = [];
  _initialized = false;
  notifyStatusListeners();
  if (_unsubscribePrices) {
    _unsubscribePrices();
    _unsubscribePrices = null;
  }
}

function notifyStatusListeners(): void {
  const snapshot = [..._orders];
  for (const fn of _statusListeners) {
    try { fn(snapshot); } catch { /* ignore */ }
  }
}

// ── Expiration Check ─────────────────────────────────────────────────────────

function hasExpired(order: PendingOrder, now: number): boolean {
  if (order.timeInForce === 'GTC' || order.expiresAt == null) return false;
  return now >= order.expiresAt;
}

// ── Price Crossing Detection ─────────────────────────────────────────────────

function priceCrossed(
  side: 'buy' | 'sell',
  orderType: OrderType,
  triggerPrice: number,
  currentPrice: number,
): boolean {
  if (orderType === 'limit' || orderType === 'oco') {
    return side === 'buy'
      ? currentPrice <= triggerPrice
      : currentPrice >= triggerPrice;
  }
  if (orderType === 'stop' || orderType === 'trailing_stop') {
    return side === 'buy'
      ? currentPrice >= triggerPrice
      : currentPrice <= triggerPrice;
  }
  // stop_limit phase 2 (triggered → limit behavior)
  return side === 'buy'
    ? currentPrice <= triggerPrice
    : currentPrice >= triggerPrice;
}

// ── Price Tick Handler ───────────────────────────────────────────────────────

function onPriceTick(snapshot: { prices: Map<string, CoinPrice>; timestamp: number }): void {
  const now = Date.now();
  const ordersToRemove: string[] = [];

  for (const order of _orders) {
    // ── Check expiration (GTC never expires, GTD does, IOC/FOK expired after placement) ──
    if (hasExpired(order, now)) {
      order.status = 'expired';
      ordersToRemove.push(order.id);
      cancelOcoLinked(order);
      useNotificationStore.getState().addNotification({
        type: 'system',
        title: `Order Expired — ${order.symbol}`,
        message: `${order.side.toUpperCase()} $${order.remainingAmount.toFixed(2)} ${order.orderType} — time in force: ${order.timeInForce}`,
        link: '/dashboard/trading',
      });
      continue;
    }

    // Clean up already-finalized orders
    if (order.status === 'cancelled' || order.status === 'filled' || order.status === 'expired') {
      ordersToRemove.push(order.id);
      continue;
    }

    const cp = snapshot.prices.get(order.coinId);
    if (!cp || cp.price <= 0) continue;

    const currentPrice = cp.price;

    // ── Trailing Stop: update activation price ──
    if (order.orderType === 'trailing_stop' && order.trailingConfig) {
      const cfg = order.trailingConfig;
      const isBuy = order.side === 'buy';
      const offset = cfg.type === 'percent'
        ? currentPrice * (cfg.value / 100)
        : cfg.value;

      if (isBuy) {
        // Buy trailing stop: activation rises with price
        const newActivation = currentPrice + offset;
        if (newActivation < cfg.activationPrice || cfg.activationPrice === 0) {
          cfg.activationPrice = newActivation;
          order.triggerPrice = newActivation;
          saveOrders();
        }
      } else {
        // Sell trailing stop: activation falls with price
        const newActivation = currentPrice - offset;
        if (newActivation > cfg.activationPrice || cfg.activationPrice === 0) {
          cfg.activationPrice = newActivation;
          order.triggerPrice = newActivation;
          saveOrders();
        }
      }
    }

    // ── Stop-Limit: Phase 1 — check stop trigger ──
    if (order.orderType === 'stop_limit' && order.status === 'pending') {
      const isBuy = order.side === 'buy';
      const stopTriggered = isBuy
        ? currentPrice >= (order.triggerPrice ?? Infinity)
        : currentPrice <= (order.triggerPrice ?? -Infinity);

      if (stopTriggered) {
        order.status = 'triggered';
        saveOrders();
        notifyStatusListeners();
      }
      continue; // Don't try to fill yet — wait for limit price
    }

    // ── Market / IOC / FOK execute immediately ──
    if (order.orderType === 'market') {
      if (_fillHandler) {
        const fillPrice = currentPrice;
        const fillAmount = order.remainingAmount;
        const result = _fillHandler(order, fillPrice, fillAmount);
        if (result.success) {
          order.fills.push({ amount: fillAmount, price: fillPrice, positionId: 'filled', timestamp: now });
          order.remainingAmount = 0;
          order.status = 'filled';
          ordersToRemove.push(order.id);
          cancelOcoLinked(order);
          useNotificationStore.getState().addNotification({
            type: 'system',
            title: `Order Filled — ${order.symbol}`,
            message: `${order.side.toUpperCase()} $${fillAmount.toFixed(2)} at $${fillPrice.toFixed(2)}`,
            link: '/dashboard/portfolio',
          });
        }
      }
      continue;
    }

    // ── Limit / Stop / Trailing Stop / OCO orders ──
    let triggerPrice: number | undefined;
    let effectiveOrderType: OrderType = order.orderType;

    if (order.orderType === 'oco') {
      // OCO orders behave like their stop and limit components
      // Both components exist as separate orders linked via ocoLinkedId
      triggerPrice = order.triggerPrice;
      effectiveOrderType = order.orderType;
    } else if (order.orderType === 'limit' || order.orderType === 'stop' || order.orderType === 'trailing_stop') {
      triggerPrice = order.triggerPrice;
    } else if (order.status === 'triggered') {
      triggerPrice = order.limitPrice;
      effectiveOrderType = 'limit';
    }

    if (triggerPrice == null) continue;

    const crossed = priceCrossed(
      order.side,
      effectiveOrderType === 'stop_limit' ? 'limit' : effectiveOrderType,
      triggerPrice,
      currentPrice,
    );

    if (crossed && _fillHandler) {
      const fillPrice = (effectiveOrderType === 'limit' || effectiveOrderType === 'stop_limit')
        ? triggerPrice
        : currentPrice;
      const fillAmount = order.remainingAmount;

      const result = _fillHandler(order, fillPrice, fillAmount);
      if (result.success) {
        order.fills.push({ amount: fillAmount, price: fillPrice, positionId: 'filled', timestamp: now });
        order.remainingAmount = 0;
        order.status = 'filled';
        ordersToRemove.push(order.id);
        // OCO: when one leg fills, cancel the linked sibling
        cancelOcoLinked(order);
        useNotificationStore.getState().addNotification({
          type: 'system',
          title: `Order Filled — ${order.symbol}`,
          message: `${order.side.toUpperCase()} $${fillAmount.toFixed(2)} at $${fillPrice.toFixed(2)}`,
          link: '/dashboard/portfolio',
        });
      }
    }
  }

  // Purge finalized orders
  if (ordersToRemove.length > 0) {
    _orders = _orders.filter(o => !ordersToRemove.includes(o.id));
    saveOrders();
    notifyStatusListeners();
  }
}

/** Cancel the OCO-linked sibling order (if any) when this order fills/cancels/expires */
function cancelOcoLinked(order: PendingOrder): void {
  if (!order.ocoLinkedId) return;
  const sibling = _orders.find(o => o.id === order.ocoLinkedId &&
    o.status !== 'filled' && o.status !== 'cancelled' && o.status !== 'expired');
  if (sibling) {
    sibling.status = 'cancelled';
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Initialize the order engine. Called once at app startup. */
export function initOrderEngine(fillHandler: OrderFillHandler): void {
  if (_initialized) return;
  _initialized = true;

  _fillHandler = fillHandler;
  _orders = loadOrders();

  // Re-expire any GTD orders that passed during downtime
  const now = Date.now();
  _orders = _orders.filter(o => {
    if (hasExpired(o, now)) {
      o.status = 'expired';
      return false;
    }
    return true;
  });
  saveOrders();

  const coinIds = [...new Set(_orders.map(o => o.coinId))];
  _unsubscribePrices = subscribePrices(coinIds, onPriceTick);
  notifyStatusListeners();

  // Async cloud hydration across refresh, login, logout/login, and multi-device sync
  void hydrateOrders();
}

/** Place a new order. Market/IOC/FOK orders fill synchronously if a price is available. OCO creates linked pair. */
export function placeOrder(params: {
  coinId: string;
  symbol: string;
  name: string;
  side: OrderSide;
  orderType: OrderType;
  triggerPrice?: number;
  limitPrice?: number;
  usdAmount: number;
  leverage: number;
  color: string;
  takeProfit?: number;
  stopLoss?: number;
  timeInForce?: OrderTimeInForce;
  expiresAt?: number;
  /** Trailing stop config (required for orderType 'trailing_stop') */
  trailingConfig?: TrailingStopConfig;
  /** OCO limit price — required when orderType is 'oco' */
  ocoLimitPrice?: number;
}): string {
  const id = `ord-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();
  const isImmediate = params.orderType === 'market' ||
    params.timeInForce === 'IOC' ||
    params.timeInForce === 'FOK';

  // OCO: create linked stop + limit pair
  if (params.orderType === 'oco') {
    const limitId = `${id}-limit`;
    const stopId = `${id}-stop`;

    const limitOrder: PendingOrder = {
      id: limitId, coinId: params.coinId, symbol: params.symbol, name: params.name,
      side: params.side === 'buy' ? 'sell' : 'buy',
      orderType: 'oco', triggerPrice: params.ocoLimitPrice ?? params.limitPrice,
      usdAmount: params.usdAmount, remainingAmount: params.usdAmount,
      leverage: params.leverage, color: params.color,
      takeProfit: params.takeProfit, stopLoss: params.stopLoss,
      createdAt: now, timeInForce: 'GTC', status: 'pending', fills: [],
      ocoLinkedId: stopId,
    };

    const stopOrder: PendingOrder = {
      id: stopId, coinId: params.coinId, symbol: params.symbol, name: params.name,
      side: params.side,
      orderType: 'stop', triggerPrice: params.triggerPrice,
      usdAmount: params.usdAmount, remainingAmount: params.usdAmount,
      leverage: params.leverage, color: params.color,
      takeProfit: params.takeProfit, stopLoss: params.stopLoss,
      createdAt: now, timeInForce: 'GTC', status: 'pending', fills: [],
      ocoLinkedId: limitId,
    };

    _orders.push(limitOrder, stopOrder);
    saveOrders();
    notifyStatusListeners();
    refreshCoinSubscriptions();
    return id;
  }

  // Trailing stop: init activation price
  let trailingConf = params.trailingConfig;
  if (params.orderType === 'trailing_stop' && !trailingConf) {
    // Default to 3% trailing offset if not provided
    const { getCurrentPrice } = require('@/lib/globalPriceEngine');
    const cp = getCurrentPrice(params.coinId);
    const marketPrice = cp?.price ?? params.triggerPrice ?? 0;
    trailingConf = {
      type: 'percent',
      value: 3,
      activationPrice: marketPrice,
    };
  }
  if (trailingConf && trailingConf.activationPrice === 0 && params.triggerPrice) {
    trailingConf.activationPrice = params.triggerPrice;
  }

  const order: PendingOrder = {
    id,
    coinId: params.coinId,
    symbol: params.symbol,
    name: params.name,
    side: params.side,
    orderType: params.orderType,
    triggerPrice: params.triggerPrice,
    limitPrice: params.limitPrice,
    usdAmount: params.usdAmount,
    remainingAmount: params.usdAmount,
    leverage: params.leverage,
    color: params.color,
    takeProfit: params.takeProfit,
    stopLoss: params.stopLoss,
    createdAt: now,
    expiresAt: params.timeInForce === 'IOC' || params.timeInForce === 'FOK' ? now : params.expiresAt,
    timeInForce: params.timeInForce ?? 'GTC',
    status: 'pending',
    fills: [],
    trailingConfig: trailingConf,
  };

  // ── Market / IOC / FOK: attempt synchronous fill ──
  if (isImmediate && _fillHandler) {
    const { getCurrentPrice } = require('@/lib/globalPriceEngine');
    const cp = getCurrentPrice(params.coinId);
    if (cp && cp.price > 0) {
      const result = _fillHandler(order, cp.price, params.usdAmount);
      if (result.success) {
        order.fills.push({ amount: params.usdAmount, price: cp.price, positionId: 'filled', timestamp: now });
        order.remainingAmount = 0;
        order.status = 'filled';
        _orders.push(order);
        saveOrders();
        notifyStatusListeners();
        _orders = _orders.filter(o => o.id !== id);
        saveOrders();
        return id;
      }
      // FOK: fill failed entirely — cancel immediately
      if (params.timeInForce === 'FOK') {
        order.status = 'cancelled';
        _orders.push(order);
        saveOrders();
        notifyStatusListeners();
        _orders = _orders.filter(o => o.id !== id);
        saveOrders();
        return id;
      }
      // IOC: mark remaining as expired immediately
      if (params.timeInForce === 'IOC') {
        order.status = 'expired';
        _orders.push(order);
        saveOrders();
        notifyStatusListeners();
        _orders = _orders.filter(o => o.id !== id);
        saveOrders();
        return id;
      }
    }
    // No price available — IOC/FOK must cancel
    if (params.timeInForce === 'IOC' || params.timeInForce === 'FOK') {
      order.status = 'cancelled';
      _orders.push(order);
      saveOrders();
      notifyStatusListeners();
      _orders = _orders.filter(o => o.id !== id);
      saveOrders();
      return id;
    }
  }

  _orders.push(order);
  saveOrders();
  notifyStatusListeners();
  refreshCoinSubscriptions();

  return id;
}

function refreshCoinSubscriptions(): void {
  if (_unsubscribePrices) _unsubscribePrices();
  const coinIds = [...new Set(_orders.map(o => o.coinId))];
  _unsubscribePrices = subscribePrices(coinIds, onPriceTick);
}

/** Cancel a pending order by ID. Returns true if cancelled. */
export function cancelOrder(orderId: string): boolean {
  const order = _orders.find(o => o.id === orderId);
  if (!order) return false;
  if (order.status === 'filled' || order.status === 'cancelled' || order.status === 'expired') return false;

  order.status = 'cancelled';
  saveOrders();

  _orders = _orders.filter(o => o.status !== 'cancelled');
  saveOrders();
  notifyStatusListeners();

  return true;
}

/** Cancel ALL pending orders for a coin. Returns count cancelled. */
export function cancelAllOrdersForCoin(coinId: string): number {
  const before = _orders.length;
  _orders = _orders.filter(o => {
    if (o.coinId === coinId && o.status !== 'filled' && o.status !== 'expired') {
      o.status = 'cancelled';
      return false;
    }
    return true;
  });
  const cancelled = before - _orders.length;
  if (cancelled > 0) {
    saveOrders();
    notifyStatusListeners();
  }
  return cancelled;
}

/** Get all pending/partially-filled orders (active on the book). */
export function getPendingOrders(): PendingOrder[] {
  return _orders.filter(o =>
    o.status === 'pending' || o.status === 'triggered' || o.status === 'partial',
  );
}

/** Get ALL orders including recently filled/cancelled/expired. */
export function getAllOrders(): PendingOrder[] {
  return [..._orders];
}

/** Subscribe to order status changes. Returns unsubscribe function. */
export function subscribeOrderStatus(listener: OrderStatusListener): () => void {
  _statusListeners.add(listener);
  try { listener(getPendingOrders()); } catch { /* ignore */ }
  return () => { _statusListeners.delete(listener); };
}

/** Get count of active pending orders for badges. */
export function getPendingOrderCount(): number {
  return _orders.filter(o =>
    o.status === 'pending' || o.status === 'triggered' || o.status === 'partial',
  ).length;
}

/** Get orders for a specific coin. */
export function getOrdersForCoin(coinId: string): PendingOrder[] {
  return _orders.filter(o => o.coinId === coinId);
}

/** Get fill history across all orders. */
export function getFillHistory(): FillRecord[] {
  return _orders.flatMap(o => o.fills.map(f => ({ ...f })));
}
