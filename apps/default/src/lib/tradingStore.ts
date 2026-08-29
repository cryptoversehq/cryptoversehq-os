import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createCloudStorage } from './cloudData';
import { useAuthStore } from './authStore';
import { recordAccountReset } from './leaderboardEngine';
import {
  initPositionMonitor,
  refreshMonitorSubscriptions,
} from '@/lib/globalPositionMonitor';

// ── Notification bridge ────────────────────────────────────────────────────────
// appStore calls registerNotifyHandler() once after it initialises so
// tradingStore can fire notifications without importing appStore (avoids
// the circular-dependency / Vite virtual-fs error).
type NotifyPayload = { type: 'trade' | 'liquidation' | 'achievement' | 'system'; title: string; message: string };
let _notifyHandler: ((n: NotifyPayload) => void) | null = null;

export function registerNotifyHandler(fn: (n: NotifyPayload) => void) {
  _notifyHandler = fn;
}

function notify(n: NotifyPayload) {
  _notifyHandler?.(n);
}

export interface Position {
  id: string;
  coinId: string;
  symbol: string;
  name: string;
  side: 'long' | 'short';
  entryPrice: number;
  quantity: number;          // how many coins
  costBasis: number;         // USD spent (quantity * entryPrice / leverage for cross-margin)
  leverage: number;
  openedAt: string;
  color: string;
  // Optional stop-loss / take-profit (P5-B)
  stopLoss?: number;
  takeProfit?: number;
  // P1: Margin mode — isolated (each position independent) or cross (shared margin pool)
  marginMode?: 'isolated' | 'cross';
}

export interface TradeRecord {
  id: string;
  coinId: string;
  symbol: string;
  name: string;
  side: 'long' | 'short';
  action: 'open' | 'close';
  quantity: number;
  entryPrice: number;
  exitPrice?: number;
  costBasis: number;
  pnl: number;
  pnlPct: number;
  leverage: number;
  fee: number;
  timestamp: string;
  color: string;
}

interface TradingState {
  balance: number;
  positions: Position[];
  history: TradeRecord[];

  openPosition: (params: {
    coinId: string;
    symbol: string;
    name: string;
    side: 'long' | 'short';
    usdAmount: number;
    currentPrice: number;
    leverage: number;
    color: string;
    stopLoss?: number;
    takeProfit?: number;
    marginMode?: 'isolated' | 'cross';
  }) => { success: boolean; error?: string };

  closePosition: (positionId: string, currentPrice: number) => void;

  // P5-B: set stop-loss / take-profit on an open position
  updateOrderLevels: (positionId: string, stopLoss?: number, takeProfit?: number) => void;

  // New: adjust leverage on an already-open position — standard "isolated
  // margin" behavior on real exchanges. Position size (quantity) is
  // unchanged; only how much margin is allocated to it moves between the
  // position and available balance. Lowering leverage locks more margin
  // (safer, further liquidation price); raising it frees margin back to
  // the account (riskier, closer liquidation price).
  updateLeverage: (positionId: string, newLeverage: number) => { success: boolean; error?: string };

  // P5-D: delegated to GlobalPositionMonitor. Kept as no-op shim for
  // backward compatibility.
  checkPriceAlerts: (coinId: string, currentPrice: number) => void;

  resetBalance: () => void;

  // P0-3: Add simulation balance (bought with CP)
  addSimulationBalance: (amount: number) => void;

  // P2: paginated history access (no 50-record cap)
  getPaginatedHistory: (page: number, pageSize: number) => TradeRecord[];
  getTotalHistoryCount: () => number;

  // Sprint 3: Portfolio calculations
  getEquity: (prices: Map<string, number>) => number;
  getDrawdown: () => { current: number; max: number; pct: number };
  getROI: () => { pnl: number; pct: number };
  getTotalFees: () => number;
  initMonitor: () => void;
}

const FEE_RATE = 0.001; // 0.1% taker fee
const INITIAL_BALANCE = 100_000;

export const useTradingStore = create<TradingState>()(
  persist(
    (set, get) => ({
      balance: INITIAL_BALANCE,
      positions: [],
      history: [],

      openPosition: ({ coinId, symbol, name, side, usdAmount, currentPrice, leverage, color, stopLoss, takeProfit, marginMode = 'isolated' }) => {
        const { balance } = get();
        const fee = usdAmount * FEE_RATE;
        const totalCost = usdAmount + fee;

        if (totalCost > balance) {
          return { success: false, error: 'Insufficient balance' };
        }
        if (usdAmount <= 0) {
          return { success: false, error: 'Amount must be greater than 0' };
        }
        if (currentPrice <= 0) {
          return { success: false, error: 'Invalid price' };
        }

        const quantity = (usdAmount * leverage) / currentPrice;

        const position: Position = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          coinId,
          symbol,
          name,
          side,
          entryPrice: currentPrice,
          quantity,
          costBasis: usdAmount,
          leverage,
          openedAt: new Date().toLocaleTimeString(),
          color,
          stopLoss,
          takeProfit,
          marginMode,
        };

        const record: TradeRecord = {
          id: position.id,
          coinId,
          symbol,
          name,
          side,
          action: 'open',
          quantity,
          entryPrice: currentPrice,
          costBasis: usdAmount,
          pnl: -fee,
          pnlPct: -(fee / usdAmount) * 100,
          leverage,
          fee,
          timestamp: new Date().toLocaleTimeString(),
          color,
        };

        set(state => ({
          balance: Math.round((state.balance - totalCost) * 100) / 100,
          positions: [position, ...state.positions],
          history: [record, ...state.history],
        }));

        notify({
          type: 'trade',
          title: `${side === 'long' ? '📈 Long' : '📉 Short'} Opened — ${symbol}`,
          message: `${usdAmount.toLocaleString()} @ ${currentPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })} · ${leverage}x leverage`,
        });

        // Refresh monitor subscriptions so SL/TP/liquidation tracking
        // begins for the new position immediately
        refreshMonitorSubscriptions();

        return { success: true };
      },

      closePosition: (positionId, currentPrice) => {
        const { positions } = get();
        const pos = positions.find(p => p.id === positionId);
        if (!pos) return;

        // Raw P&L on the leveraged position
        const rawPnl =
          pos.side === 'long'
            ? (currentPrice - pos.entryPrice) * pos.quantity
            : (pos.entryPrice - currentPrice) * pos.quantity;

        const fee = pos.costBasis * FEE_RATE;
        const netPnl = rawPnl - fee;
        const pnlPct = (netPnl / pos.costBasis) * 100;

        // Return original margin + net P&L. Margin was already deducted at open.
        // If netPnl < -costBasis (loss > margin), the position is underwater.
        // The returned amount CAN be negative in extreme liquidation scenarios,
        // but we floor at 0 since margin is isolated (no cross-margin debt).
        const returned = pos.costBasis + netPnl;

        // Proper liquidation handling: if the position was liquidated
        // (returned <= 0), the user loses ONLY their margin. Excess loss
        // beyond margin is absorbed by the liquidation engine — this is
        // standard isolated-margin behavior on real exchanges.
        const balanceReturn = returned > 0 ? returned : 0;
        const isLiquidated = returned <= 0;

        const record: TradeRecord = {
          id: `close-${positionId}-${Date.now()}`,
          coinId: pos.coinId,
          symbol: pos.symbol,
          name: pos.name,
          side: pos.side,
          action: 'close',
          quantity: pos.quantity,
          entryPrice: pos.entryPrice,
          exitPrice: currentPrice,
          costBasis: pos.costBasis,
          pnl: Math.round(netPnl * 100) / 100,
          pnlPct: Math.round(pnlPct * 100) / 100,
          leverage: pos.leverage,
          fee,
          timestamp: new Date().toLocaleTimeString(),
          color: pos.color,
        };

        set(state => ({
          balance: Math.round((state.balance + balanceReturn) * 100) / 100,
          positions: state.positions.filter(p => p.id !== positionId),
          history: [record, ...state.history],
        }));

        // Refresh the position monitor's coin subscriptions after position change
        refreshMonitorSubscriptions();

        const pnlSign = netPnl >= 0 ? '+' : '';
        if (isLiquidated) {
          notify({
            type: 'liquidation',
            title: `⚠️ Position Liquidated — ${pos.symbol}`,
            message: `Your ${pos.side} position was liquidated. Margin lost: $${pos.costBasis.toLocaleString()}.`,
          });
        } else {
          notify({
            type: 'trade',
            title: `${netPnl >= 0 ? '✅' : '❌'} Position Closed — ${pos.symbol}`,
            message: `${pos.side === 'long' ? 'Long' : 'Short'} closed · P&L: ${pnlSign}${Math.abs(netPnl).toFixed(2)} (${pnlSign}${pnlPct.toFixed(2)}%)`,
          });
        }
      },

      updateOrderLevels: (positionId, stopLoss, takeProfit) => {
        set(state => ({
          positions: state.positions.map(p =>
            p.id === positionId ? { ...p, stopLoss, takeProfit } : p,
          ),
        }));
      },

      updateLeverage: (positionId, newLeverage) => {
        const { positions, balance } = get();
        const pos = positions.find(p => p.id === positionId);
        if (!pos) return { success: false, error: 'Position not found' };
        if (newLeverage < 1 || newLeverage > 100) {
          return { success: false, error: 'Leverage must be between 1x and 100x' };
        }
        if (newLeverage === pos.leverage) return { success: true };

        // Position size (quantity) stays fixed — only the margin split
        // between this position and available balance changes.
        const notional = pos.quantity * pos.entryPrice;
        const newCostBasis = notional / newLeverage;
        const delta = newCostBasis - pos.costBasis; // >0 needs more margin, <0 frees margin

        if (delta > balance) {
          return { success: false, error: 'Insufficient balance to lower leverage that much' };
        }

        set(state => ({
          balance: Math.round((state.balance - delta) * 100) / 100,
          positions: state.positions.map(p =>
            p.id === positionId ? { ...p, leverage: newLeverage, costBasis: Math.round(newCostBasis * 100) / 100 } : p,
          ),
        }));

        notify({
          type: 'system',
          title: `Leverage updated — ${pos.symbol}`,
          message: `${pos.leverage}x → ${newLeverage}x. ${delta >= 0 ? 'Locked additional' : 'Freed'} ${Math.abs(delta).toFixed(2)} USDT ${delta >= 0 ? 'from' : 'to'} available balance.`,
        });

        return { success: true };
      },

      // P5-D: delegated to GlobalPositionMonitor. Kept as no-op shim for
      // backward compatibility — callers can safely invoke it without
      // breaking, but the real monitoring now runs in globalPositionMonitor.
      checkPriceAlerts: (_coinId, _currentPrice) => {
        // GlobalPositionMonitor handles all SL/TP/Liquidation checks now.
        // This shim exists so existing ProDashboard code doesn't break.
        // forcePositionCheck can be called to trigger an immediate check.
      },

      resetBalance: () => {
        const userId = useAuthStore.getState().user?.id || 'demo_user';
        recordAccountReset(userId);
        set({ balance: INITIAL_BALANCE, positions: [], history: [] });
      },

      addSimulationBalance: (amount: number) => {
        set(state => ({
          balance: Math.round((state.balance + amount) * 100) / 100,
        }));
      },

      getPaginatedHistory: (page: number, pageSize: number) => {
        const start = (page - 1) * pageSize;
        const end = start + pageSize;
        return get().history.slice(start, end);
      },

      getTotalHistoryCount: () => {
        return get().history.length;
      },

      // ── Portfolio Calculations (Sprint 3) ────────────────────────────────

      /** Total equity = balance + unrealized P&L of all open positions. */
      getEquity: (prices: Map<string, number>) => {
        const { balance, positions } = get();
        let unrealizedPnl = 0;
        for (const pos of positions) {
          const price = prices.get(pos.coinId) ?? pos.entryPrice;
          const pnl =
            pos.side === 'long'
              ? (price - pos.entryPrice) * pos.quantity
              : (pos.entryPrice - price) * pos.quantity;
          unrealizedPnl += pnl;
        }
        return balance + unrealizedPnl;
      },

      /** Calculate all-time drawdown from trade history. */
      getDrawdown: () => {
        const { history, balance } = get();
        if (history.length === 0) return { current: 0, max: 0, pct: 0 };

        // Walk history chronologically (oldest first) to find peak equity and max drawdown
        const reversed = [...history].reverse(); // oldest first
        let peak = INITIAL_BALANCE;
        let maxDrawdown = 0;
        let runningBalance = INITIAL_BALANCE;

        for (const t of reversed) {
          if (t.action === 'open') {
            runningBalance -= (t.costBasis + t.fee);
          } else {
            runningBalance += (t.costBasis + t.pnl);
          }
          if (runningBalance > peak) peak = runningBalance;
          const dd = peak - runningBalance;
          if (dd > maxDrawdown) maxDrawdown = dd;
        }

        const drawdownPct = peak > 0 ? (maxDrawdown / peak) * 100 : 0;
        return { current: maxDrawdown, max: maxDrawdown, pct: drawdownPct };
      },

      /** Calculate total ROI since inception. */
      getROI: () => {
        const { history } = get();
        if (history.length === 0) return { pnl: 0, pct: 0 };

        let totalPnl = 0;
        for (const t of history) {
          if (t.action === 'close') {
            totalPnl += t.pnl;
          }
        }
        const pct = (totalPnl / INITIAL_BALANCE) * 100;
        return { pnl: Math.round(totalPnl * 100) / 100, pct: Math.round(pct * 100) / 100 };
      },

      /** Get total fees paid across all trades. */
      getTotalFees: () => {
        const { history } = get();
        let total = 0;
        for (const t of history) {
          total += t.fee;
        }
        return Math.round(total * 100) / 100;
      },

      /** Initialize the global position monitor (call once at app startup). */
      initMonitor: () => {
        initPositionMonitor(
          () => get().positions,
          (positionId, currentPrice, reason) => {
            const pos = get().positions.find(p => p.id === positionId);
            if (!pos) return;
            if (reason === 'stop_loss') {
              notify({
                type: 'liquidation',
                title: `🛑 Stop-Loss Hit — ${pos.symbol}`,
                message: `${pos.side === 'long' ? 'Long' : 'Short'} closed at ${currentPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })} (SL: ${pos.stopLoss})`,
              });
            } else if (reason === 'take_profit') {
              notify({
                type: 'achievement',
                title: `🎯 Take-Profit Hit — ${pos.symbol}`,
                message: `${pos.side === 'long' ? 'Long' : 'Short'} closed at ${currentPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })} (TP: ${pos.takeProfit})`,
              });
            } else if (reason === 'liquidation') {
              notify({
                type: 'liquidation',
                title: `⚠️ Liquidation — ${pos.symbol}`,
                message: `Position liquidated at ${currentPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}. Margin lost: $${pos.costBasis.toLocaleString()}.`,
              });
            }
            get().closePosition(positionId, currentPrice);
          },
        );
      },
    }),
    {
      name: 'cv_trading_data_v1',
      storage: createCloudStorage<TradingState>({ objectType: 'trading', userId: () => useAuthStore.getState().user?.email ?? null, cachePolicy: 'persistent' }),
      version: 2,
      migrate: (persistedState: any, _version: number) => {
        // Ensure new fields exist on migrated state
        return persistedState;
      },
    },
  ),
);

// Compute live P&L for a position given current price
export function calcPositionPnl(pos: Position, currentPrice: number) {
  const rawPnl =
    pos.side === 'long'
      ? (currentPrice - pos.entryPrice) * pos.quantity
      : (pos.entryPrice - currentPrice) * pos.quantity;
  const pnlPct = (rawPnl / pos.costBasis) * 100;
  return { rawPnl, pnlPct };
}
