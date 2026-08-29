/**
 * globalPositionMonitor.ts — CryptoVerse HQ Global Position Monitor
 *
 * SINGLETON. Subscribes to GlobalPriceEngine and continuously evaluates
 * ALL positions across ALL coins for:
 *
 *   - Stop Loss breaches
 *   - Take Profit hits
 *   - Liquidation (maintenance margin)
 *   - Margin requirements
 *   - Trailing stop (future)
 *
 * Runs regardless of which page is active. Calls into tradingStore to
 * close positions when conditions are met.
 */

import { subscribePrices, getCurrentPrice, type CoinPriceSnapshot } from '@/lib/globalPriceEngine';
import type { Position } from '@/lib/tradingStore';
import { useNotificationStore, type Notification } from '@/lib/notificationStore';

// ── Types ────────────────────────────────────────────────────────────────────

export type PositionCloseHandler = (
  positionId: string,
  currentPrice: number,
  reason: 'stop_loss' | 'take_profit' | 'liquidation' | 'margin_call',
) => void;

export type MonitorEventListener = (event: MonitorEvent) => void;

export interface MonitorEvent {
  type: 'sl_hit' | 'tp_hit' | 'liquidated' | 'margin_warning' | 'position_closed';
  positionId: string;
  symbol: string;
  price: number;
  timestamp: number;
  details?: string;
}

// ── Liquidation Constants ────────────────────────────────────────────────────

/** Maintenance margin ratio — position is liquidated when margin ratio < this */
const MAINTENANCE_MARGIN_RATIO = 0.005; // 0.5%

/** Mark price buffer — use index price (spot) for liquidation calculation */
const LIQUIDATION_BUFFER = 0.975; // 2.5% buffer before forced liquidation

// ── State ────────────────────────────────────────────────────────────────────

let _closeHandler: PositionCloseHandler | null = null;
let _eventListeners = new Set<MonitorEventListener>();
let _unsubscribePrices: (() => void) | null = null;
let _positionGetter: (() => Position[]) | null = null;
let _initialized = false;
let _lastCheckTime = 0;
const CHECK_INTERVAL_MS = 500; // throttle checks to every 500ms

// ── Liquidation Price Calculator ─────────────────────────────────────────────

/**
 * Calculate the liquidation price for a position.
 *
 * For an isolated-margin long:
 *   liquidationPrice = entryPrice * (1 - 1/leverage + maintenanceMarginRatio)
 *
 * For an isolated-margin short:
 *   liquidationPrice = entryPrice * (1 + 1/leverage - maintenanceMarginRatio)
 */
export function calcLiquidationPrice(pos: Position): number {
  const mmr = MAINTENANCE_MARGIN_RATIO;
  const isLong = pos.side === 'long';

  if (isLong) {
    return pos.entryPrice * (1 - 1 / pos.leverage + mmr);
  } else {
    return pos.entryPrice * (1 + 1 / pos.leverage - mmr);
  }
}

/**
 * Calculate the current margin ratio for a position.
 * marginRatio = (margin + unrealizedPnl) / notional
 * When marginRatio < MAINTENANCE_MARGIN_RATIO, the position is liquidated.
 */
export function calcMarginRatio(pos: Position, currentPrice: number): number {
  const notional = pos.quantity * currentPrice;
  if (notional <= 0) return 1;

  const unrealizedPnl =
    pos.side === 'long'
      ? (currentPrice - pos.entryPrice) * pos.quantity
      : (pos.entryPrice - currentPrice) * pos.quantity;

  const equity = pos.costBasis + unrealizedPnl;
  return equity / notional;
}

/** Check if a position should be liquidated at the given price. */
export function isLiquidatable(pos: Position, currentPrice: number): boolean {
  const marginRatio = calcMarginRatio(pos, currentPrice);

  // Liquidation when margin ratio drops below maintenance
  if (marginRatio <= 0) return true; // fully wiped out
  if (marginRatio < MAINTENANCE_MARGIN_RATIO * LIQUIDATION_BUFFER) return true;

  // Also liquidate if unrealized loss exceeds 90% of margin
  const unrealizedPnl =
    pos.side === 'long'
      ? (currentPrice - pos.entryPrice) * pos.quantity
      : (pos.entryPrice - currentPrice) * pos.quantity;

  if (unrealizedPnl < 0 && Math.abs(unrealizedPnl) >= pos.costBasis * 0.9) {
    return true;
  }

  return false;
}

// ── Cross-Margin Health ──────────────────────────────────────────────────────

export interface CrossMarginHealth {
  totalEquity: number;
  totalMaintenanceMargin: number;
  totalNotional: number;
  healthRatio: number;     // 1.0 = exactly at maintenance; < 1.0 = liquidatable
  isLiquidatable: boolean;
  isolatedPositions: Position[];
  crossPositions: Position[];
}

/**
 * Calculate cross-margin portfolio health.
 * For cross-margin positions: equity and margin are pooled.
 * totalEquity = Σ(costBasis_i + unrealizedPnl_i) for cross positions
 * totalMaintenanceMargin = Σ(notional_i * MAINTENANCE_MARGIN_RATIO) for cross positions
 * healthRatio = totalEquity / totalMaintenanceMargin
 */
export function calcCrossMarginHealth(
  positions: Position[],
  priceMap: Map<string, number>,
): CrossMarginHealth {
  const isolated: Position[] = [];
  const cross: Position[] = [];
  let totalEquity = 0;
  let totalNotional = 0;

  for (const pos of positions) {
    const price = priceMap.get(pos.coinId);
    if (!price || price <= 0) continue;

    if (pos.marginMode === 'cross') {
      cross.push(pos);
      const notional = pos.quantity * price;
      const unrealizedPnl =
        pos.side === 'long'
          ? (price - pos.entryPrice) * pos.quantity
          : (pos.entryPrice - price) * pos.quantity;

      totalEquity += pos.costBasis + unrealizedPnl;
      totalNotional += notional;
    } else {
      isolated.push(pos);
    }
  }

  const totalMaintenanceMargin = totalNotional * MAINTENANCE_MARGIN_RATIO;
  const healthRatio = totalMaintenanceMargin > 0 ? totalEquity / totalMaintenanceMargin : Infinity;

  return {
    totalEquity,
    totalMaintenanceMargin,
    totalNotional,
    healthRatio,
    isLiquidatable: healthRatio < LIQUIDATION_BUFFER,
    isolatedPositions: isolated,
    crossPositions: cross,
  };
}

/**
 * Progressive cross-margin liquidation.
 * Closes the worst-performing cross position first, recalculates health,
 * and continues until the portfolio is healthy or all cross positions are closed.
 * Returns the list of positions closed.
 */
function liquidateCrossMargin(
  positions: Position[],
  priceMap: Map<string, number>,
  closeHandler: PositionCloseHandler,
): string[] {
  const closed: string[] = [];
  let cross = positions.filter(p => p.marginMode === 'cross');

  if (cross.length === 0) return closed;

  // Sort by unrealized PnL percentage — worst first
  const getPnlPct = (pos: Position): number => {
    const price = priceMap.get(pos.coinId);
    if (!price || price <= 0) return 0;
    const unrealizedPnl =
      pos.side === 'long'
        ? (price - pos.entryPrice) * pos.quantity
        : (pos.entryPrice - price) * pos.quantity;
    return pos.costBasis > 0 ? unrealizedPnl / pos.costBasis : 0;
  };

  let remaining = [...cross].sort((a, b) => getPnlPct(a) - getPnlPct(b));
  let health = calcCrossMarginHealth(positions, priceMap);

  while (health.isLiquidatable && remaining.length > 0) {
    const worst = remaining[0];
    const price = priceMap.get(worst.coinId);
    if (!price || price <= 0) break;

    closeHandler(worst.id, price, 'liquidation');
    closed.push(worst.id);

    // Remove from remaining and recalculate
    remaining = remaining.slice(1);
    health = calcCrossMarginHealth(
      positions.filter(p => !closed.includes(p.id)),
      priceMap,
    );
  }

  return closed;
}

// ── Main Monitor Tick ────────────────────────────────────────────────────────

function onPriceTick(snapshot: CoinPriceSnapshot): void {
  if (!_closeHandler || !_positionGetter) return;

  // Throttle checks to avoid redundant processing
  const now = Date.now();
  if (now - _lastCheckTime < CHECK_INTERVAL_MS) return;
  _lastCheckTime = now;

  const positions = _positionGetter();
  if (positions.length === 0) return;

  // Build a price map for cross-margin calculations
  const priceMap = new Map<string, number>();
  for (const pos of positions) {
    const cp = snapshot.prices.get(pos.coinId);
    if (cp && cp.price > 0) priceMap.set(pos.coinId, cp.price);
  }

  // ── 0. Cross-Margin Health Check ──
  const hasCrossPositions = positions.some(p => p.marginMode === 'cross');
  if (hasCrossPositions) {
    const health = calcCrossMarginHealth(positions, priceMap);
    if (health.isLiquidatable) {
      const liquidatedIds = liquidateCrossMargin(positions, priceMap, _closeHandler);
      for (const id of liquidatedIds) {
        const pos = positions.find(p => p.id === id);
        if (pos) {
          const price = priceMap.get(pos.coinId) ?? 0;
          emitEvent({
            type: 'liquidated',
            positionId: pos.id,
            symbol: pos.symbol,
            price,
            timestamp: now,
            details: `Cross-margin liquidation. Portfolio health: ${(health.healthRatio * 100).toFixed(1)}%`,
          });
        }
      }
    } else if (health.healthRatio < 0.05 && health.healthRatio > 0) {
      emitEvent({
        type: 'margin_warning',
        positionId: 'cross-margin-portfolio',
        symbol: 'PORTFOLIO',
        price: 0,
        timestamp: now,
        details: `Cross-margin health: ${(health.healthRatio * 100).toFixed(1)}%`,
      });
    }
  }

  // ── 1. Isolated Position Checks ──
  for (const pos of positions) {
    // Skip cross-margin positions — they're handled above
    if (pos.marginMode === 'cross') continue;

    const cp = snapshot.prices.get(pos.coinId);
    if (!cp || cp.price <= 0) continue;

    const currentPrice = cp.price;
    const isLong = pos.side === 'long';

    // ── 1a. Isolated Liquidation check ──
    if (isLiquidatable(pos, currentPrice)) {
      _closeHandler(pos.id, currentPrice, 'liquidation');
      emitEvent({
        type: 'liquidated',
        positionId: pos.id,
        symbol: pos.symbol,
        price: currentPrice,
        timestamp: now,
        details: `Liquidation price: ${calcLiquidationPrice(pos).toFixed(2)}`,
      });
      continue;
    }

    // ── 1b. Stop-Loss check ──
    if (pos.stopLoss !== undefined) {
      const slTriggered = isLong
        ? currentPrice <= pos.stopLoss
        : currentPrice >= pos.stopLoss;
      if (slTriggered) {
        _closeHandler(pos.id, currentPrice, 'stop_loss');
        emitEvent({
          type: 'sl_hit',
          positionId: pos.id,
          symbol: pos.symbol,
          price: currentPrice,
          timestamp: now,
          details: `SL: ${pos.stopLoss}`,
        });
        continue;
      }
    }

    // ── 1c. Take-Profit check ──
    if (pos.takeProfit !== undefined) {
      const tpTriggered = isLong
        ? currentPrice >= pos.takeProfit
        : currentPrice <= pos.takeProfit;
      if (tpTriggered) {
        _closeHandler(pos.id, currentPrice, 'take_profit');
        emitEvent({
          type: 'tp_hit',
          positionId: pos.id,
          symbol: pos.symbol,
          price: currentPrice,
          timestamp: now,
          details: `TP: ${pos.takeProfit}`,
        });
        continue;
      }
    }

    // ── 1d. Isolated Margin warning ──
    const marginRatio = calcMarginRatio(pos, currentPrice);
    if (marginRatio < 0.05 && marginRatio > 0) {
      emitEvent({
        type: 'margin_warning',
        positionId: pos.id,
        symbol: pos.symbol,
        price: currentPrice,
        timestamp: now,
        details: `Margin ratio: ${(marginRatio * 100).toFixed(1)}%`,
      });
    }
  }
}

function emitEvent(event: MonitorEvent): void {
  for (const fn of _eventListeners) {
    try { fn(event); } catch { /* isolate */ }
  }

  // Persist as a notification so it survives page refresh
  const notifType: Notification['type'] =
    event.type === 'sl_hit' || event.type === 'tp_hit' ? 'sl_tp_hit' :
    event.type === 'liquidated' || event.type === 'margin_warning' ? 'liquidation_warning' :
    'system';

  const title =
    event.type === 'sl_hit' ? `Stop Loss Hit — ${event.symbol}` :
    event.type === 'tp_hit' ? `Take Profit Hit — ${event.symbol}` :
    event.type === 'liquidated' ? `Liquidated — ${event.symbol}` :
    event.type === 'margin_warning' ? `Margin Warning — ${event.symbol}` :
    `${event.symbol} — ${event.type}`;

  useNotificationStore.getState().addNotification({
    type: notifType,
    title,
    message: event.details ?? `Price: $${event.price.toFixed(2)}`,
    link: `/dashboard/portfolio`,
  });
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialize the position monitor.
 * @param positionGetter - function that returns current positions from the store
 * @param closeHandler - function to call when a position must be closed
 */
export function initPositionMonitor(
  positionGetter: () => Position[],
  closeHandler: PositionCloseHandler,
): void {
  if (_initialized) return;
  _initialized = true;

  _positionGetter = positionGetter;
  _closeHandler = closeHandler;

  // Subscribe to ALL tracked prices — the monitor watches every position
  const positions = positionGetter();
  const coinIds = [...new Set(positions.map(p => p.coinId))];
  _unsubscribePrices = subscribePrices(coinIds, onPriceTick);
}

/** Re-subscribe to price engine with updated coin list (called when positions change). */
export function refreshMonitorSubscriptions(): void {
  if (!_positionGetter) return;

  const positions = _positionGetter();
  const coinIds = [...new Set(positions.map(p => p.coinId))];

  if (_unsubscribePrices) {
    _unsubscribePrices();
  }

  if (coinIds.length > 0) {
    _unsubscribePrices = subscribePrices(coinIds, onPriceTick);
  }
}

/** Subscribe to monitor events (SL hit, TP hit, liquidation, etc.). */
export function subscribeMonitorEvents(listener: MonitorEventListener): () => void {
  _eventListeners.add(listener);
  return () => { _eventListeners.delete(listener); };
}

/** Get the current state of the monitor. */
export function isMonitorRunning(): boolean {
  return _initialized;
}

/** Force an immediate check of all positions (useful after page resume). */
export function forcePositionCheck(): void {
  _lastCheckTime = 0;
  const snapshot = {
    prices: new Map(),
    timestamp: Date.now(),
  };
  // Rebuild prices from the engine
  if (_positionGetter) {
    for (const pos of _positionGetter()) {
      const cp = getCurrentPrice(pos.coinId);
      if (cp) snapshot.prices.set(pos.coinId, cp);
    }
  }
  onPriceTick(snapshot);
}
