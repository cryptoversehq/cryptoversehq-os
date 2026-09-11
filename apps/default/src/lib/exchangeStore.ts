/**
 * exchangeStore.ts — Zustand store for Real Exchange Connection feature
 *
 * Now wired to all 5 business logic services:
 *   – ExchangeConnectionManager  (§4.1)
 *   – ExchangeRiskManager        (§4.3)
 *   – ExchangeTradeExecutor      (§4.2)
 *   – ExchangePortfolioSyncer    (§4.4)
 *   – ExchangeStrategyDeployer   (§4.5)
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createCloudStorage } from './cloudData';
import { useAuthStore } from './authStore';
import { request } from '../api/client';
import type {
  ExchangeConnectionItem,
  GetExchangeBalanceResponse,
  SyncExchangeResponse,
  ExecuteExchangeOrderRequest,
  ExecuteExchangeOrderResponse,
  DeployExchangeStrategyRequest,
  DeployExchangeStrategyResponse,
} from '../api/types';

import {
  ExchangeId, ExchangeConnection,
  RiskControls, DEFAULT_RISK_CONTROLS, RealTrade,
  DeployedStrategy, DeployStatus, RealPortfolioSnapshot,
  PortfolioAsset, ExchangePermission, TradingMode,
} from './exchangeTypes';

import { riskManager, RiskMetrics } from './exchangeRiskManager';
import { RealTradeRequest, RealTradeResult, consumeTradeNotifications } from './exchangeTradeExecutor';
import { strategyDeployer, ApprovalQueueItem } from './exchangeStrategyDeployer';
import { toast } from 'sonner';

// ── Internal helpers ───────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function mapServerConnection(item: ExchangeConnectionItem): ExchangeConnection {
  const exchangeId = item.exchange as ExchangeId;
  return {
    id: item.id,
    exchangeId,
    label: item.label,
    status: item.isActive ? 'connected' : 'error',
    connectedAt: item.connectedAt,
    lastSyncAt: item.lastSyncAt ?? undefined,
    maskedKey: undefined,
    permissions: ['read', 'trade'],
    modes: ['spot'],
    balanceUSD: 0,
    balanceBTC: 0,
    isReadOnly: false,
  };
}

function mapServerTrade(item: import('../api/types').ExchangeTradeItem): RealTrade {
  return {
    id: item.id,
    connectionId: item.connectionId,
    exchangeId: (item.exchange ?? 'binance') as ExchangeId,
    symbol: item.symbol,
    side: item.side,
    type: item.orderType ?? 'market',
    status: item.status,
    quantity: item.quantity,
    price: item.price,
    filledQty: item.filledQuantity ?? item.quantity,
    filledAvgPx: item.filledPrice ?? item.price,
    feePaid: item.fee ?? 0,
    feeCurrency: item.feeCurrency ?? 'USDT',
    pnl: item.pnl,
    pnlPct: item.pnlPct,
    createdAt: item.createdAt,
    filledAt: item.filledAt ?? item.createdAt,
    mode: 'spot',
    isFromBot: false,
  };
}

function randFloat(min: number, max: number, dp = 2): number {
  return parseFloat((Math.random() * (max - min) + min).toFixed(dp));
}


// ── Store interface ────────────────────────────────────────────────────────────

export interface ExchangeState {
  // ── Data ────────────────────────────────────────────────────────────────────
  connections:         ExchangeConnection[];
  riskControls:        Record<string, RiskControls>;
  trades:              Record<string, RealTrade[]>;
  deployedStrategies:  DeployedStrategy[];
  portfolios:          Record<string, RealPortfolioSnapshot>;
  approvalQueue:       ApprovalQueueItem[];

  // ── UI state ─────────────────────────────────────────────────────────────────
  activeConnectionId:  string | null;
  isSyncing:           boolean;
  syncError:           string | null;
  lastSyncAt:          string | null;
  isExecutingTrade:    boolean;
  tradeError:          string | null;
  tradeWarnings:       string[];

  // ── §4.3 Kill switch state ────────────────────────────────────────────────────
  killSwitchActive:    Record<string, boolean>;
  dailyLossUSD:        Record<string, number>;

  // ── Selectors ───────────────────────────────────────────────────────────────
  getConnection:          (id: string) => ExchangeConnection | undefined;
  getActiveConnection:    () => ExchangeConnection | undefined;
  getConnections:         () => ExchangeConnection[];
  getConnectedCount:      () => number;
  getRiskControls:        (connectionId: string) => RiskControls;
  getTrades:              (connectionId: string) => RealTrade[];
  getPortfolio:           (connectionId: string) => RealPortfolioSnapshot | undefined;
  getDeployedStrategies:  (connectionId: string) => DeployedStrategy[];
  getTotalRealPnL:        () => number;
  getTotalRealBalance:    () => number;
  getRiskMetrics:         (connectionId: string) => RiskMetrics;
  isKillSwitchActive:     (connectionId: string) => boolean;

  // ── Server-authoritative cache actions ─────────────────────────────────────
  refreshConnections: () => Promise<{ success: boolean; error?: string }>;

  // ── §4.1 Connection actions ────────────────────────────────────────────────
  connectExchange: (params: {
    exchangeId:  ExchangeId;
    label:       string;
    apiKey:      string;
    apiSecret:   string;
    passphrase?: string;
    modes:       TradingMode[];
    permissions: ExchangePermission[];
    isReadOnly:  boolean;
  }) => Promise<{ success: boolean; connectionId?: string; error?: string }>;

  connectOAuth: (params: {
    exchangeId: ExchangeId;
    label:      string;
  }) => Promise<{ success: boolean; connectionId?: string; error?: string }>;

  disconnectExchange: (connectionId: string) => Promise<{ success: boolean; error?: string }>;

  testConnection: (connectionId: string) => Promise<{ success: boolean; latencyMs?: number; error?: string }>;

  // ── §4.4 Portfolio sync ────────────────────────────────────────────────────
  syncExchange: (connectionId: string) => Promise<void>;

  // ── §4.3 Risk controls ────────────────────────────────────────────────────
  updateRiskControls:   (connectionId: string, controls: Partial<RiskControls>) => void;
  resetKillSwitch:      (connectionId: string) => void;

  setActiveConnection: (id: string | null) => void;

  // ── §4.2 Trade execution ──────────────────────────────────────────────────
  executeTrade: (
    connectionId: string,
    trade:        RealTradeRequest,
    requires2FA:  boolean,
  ) => Promise<RealTradeResult>;

  clearTradeError: () => void;

  // ── §4.5 Strategy deployment ──────────────────────────────────────────────
  deployStrategy: (params: {
    connectionId:  string;
    strategyId:    string;
    strategyName:  string;
    strategyInfo: {
      isBacktested: boolean;
      winRate:      number;
      backtestMonths: number;
      maxDrawdown:  number;
      riskLevel:    'low' | 'medium' | 'high';
    };
    symbol:        string;
    mode:          TradingMode;
    allocatedUSD:  number;
    userLevel:     number;
    pairs:         string[];
    maxDailyLoss:  number;
  }) => Promise<{ success: boolean; deployId?: string; error?: string; status?: string }>;

  toggleDeployedStrategy:  (deployId: string, status: DeployStatus) => void;
  removeDeployedStrategy:  (deployId: string) => void;
  refreshApprovalQueue:    () => void;
  adminApproveDeployment:  (deployId: string, approved: boolean, note?: string) => void;

  // ── Real-time simulation ──────────────────────────────────────────────────
  addTrade:        (connectionId: string, trade: Omit<RealTrade, 'id'>) => void;
  tickStrategies:  () => void;
  pollNotifications: () => void;
}

// ── Store implementation ───────────────────────────────────────────────────────

export const useExchangeStore = create<ExchangeState>()(
  persist(
    (set, get) => ({
      connections:        [],
      riskControls:       {},
      trades:             {},
      deployedStrategies: [],
      portfolios:         {},
      approvalQueue:      [],
      activeConnectionId: null,
      isSyncing:          false,
      syncError:          null,
      lastSyncAt:         null,
      isExecutingTrade:   false,
      tradeError:         null,
      tradeWarnings:      [],
      killSwitchActive:   {},
      dailyLossUSD:       {},

      // ── Selectors ────────────────────────────────────────────────────────────

      getConnection: (id) => get().connections.find(c => c.id === id),

      getActiveConnection: () => {
        const { connections, activeConnectionId } = get();
        if (!activeConnectionId) return connections[0];
        return connections.find(c => c.id === activeConnectionId);
      },

      getConnections:  () => get().connections,

      getConnectedCount: () => get().connections.filter(c => c.status === 'connected').length,

      getRiskControls: (id) =>
        get().riskControls[id] ?? { ...DEFAULT_RISK_CONTROLS, connectionId: id },

      getTrades:   (id) => get().trades[id] ?? [],

      getPortfolio: (id) => get().portfolios[id],

      getDeployedStrategies: (id) =>
        get().deployedStrategies.filter(s => s.connectionId === id),

      getTotalRealBalance: () =>
        Object.values(get().portfolios).reduce((s, p) => s + p.totalUSD, 0),

      getTotalRealPnL: () =>
        Object.values(get().portfolios).reduce((s, p) => s + p.dailyPnL, 0),

      getRiskMetrics: (id) => riskManager.getMetrics(id),

      isKillSwitchActive: (id) =>
        get().killSwitchActive[id] ?? riskManager.isKillSwitchActive(id),

      // ── §4.1 Connection ───────────────────────────────────────────────────────

      refreshConnections: async () => {
        try {
          const response = await request<{ connections: ExchangeConnectionItem[] }>('GET', '/api/exchange/connections');
          const connections = (response.connections ?? []).map(mapServerConnection);
          set(state => ({
            connections,
            activeConnectionId: connections.some(c => c.id === state.activeConnectionId)
              ? state.activeConnectionId
              : (connections[0]?.id ?? null),
            syncError: null,
          }));
          return { success: true };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unable to load exchange connections.';
          set({ syncError: message });
          return { success: false, error: message };
        }
      },

      connectExchange: async ({ exchangeId, label, apiKey, apiSecret, passphrase }) => {
        try {
          const result = await request<{ connectionId: string }>('POST', '/api/exchange/connect', {
            exchange: exchangeId,
            apiKey,
            apiSecret,
            label,
            isDemoMode: false,
            ...(passphrase ? { passphrase } : {}),
          });
          await get().refreshConnections();
          set({ activeConnectionId: result.connectionId, syncError: null });
          return { success: true, connectionId: result.connectionId };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Connection failed.' };
        }
      },

      connectOAuth: async () => ({
        success: false,
        error: 'OAuth connection is not exposed by the current Render exchange contract.',
      }),

      disconnectExchange: async (connectionId) => {
        try {
          await request<{ ok: boolean }>('DELETE', `/api/exchange/connections/${encodeURIComponent(connectionId)}`);
          set(s => {
            const filtered = s.connections.filter(c => c.id !== connectionId);
            const newActive = s.activeConnectionId === connectionId ? (filtered[0]?.id ?? null) : s.activeConnectionId;
            const strats = s.deployedStrategies.map(d =>
              d.connectionId === connectionId ? { ...d, status: 'stopped' as DeployStatus } : d,
            );
            return { connections: filtered, activeConnectionId: newActive, deployedStrategies: strats };
          });
          return { success: true };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Disconnect failed.' };
        }
      },

      testConnection: async () => ({
        success: false,
        error: 'Connection testing is performed by the Render connect endpoint.',
      }),

      // ── §4.4 Sync ──────────────────────────────────────────────────────────────

      syncExchange: async (connectionId) => {
        set({ isSyncing: true, syncError: null });
        try {
          const result = await request<SyncExchangeResponse>('POST', `/api/exchange/sync/${encodeURIComponent(connectionId)}`, {});
          const balance: GetExchangeBalanceResponse | undefined = result.balance;
          if (balance) {
            const total = balance.totalUsdValue;
            const assets: PortfolioAsset[] = balance.balances.map(asset => ({
              symbol: asset.asset,
              name: asset.asset,
              logoEmoji: '◈',
              quantity: asset.total,
              avgCostUSD: asset.total ? asset.usdValue / asset.total : 0,
              currentUSD: asset.total ? asset.usdValue / asset.total : 0,
              valueUSD: asset.usdValue,
              pnl: 0,
              pnlPct: 0,
              allocation: total ? (asset.usdValue / total) * 100 : 0,
            }));
            set(s => ({
              isSyncing: false,
              syncError: null,
              lastSyncAt: result.syncedAt,
              portfolios: { ...s.portfolios, [connectionId]: {
                connectionId,
                takenAt: balance.updatedAt,
                totalUSD: total,
                assets,
                dailyPnL: 0,
                dailyPnLPct: 0,
                weeklyPnL: 0,
                monthlyPnL: 0,
              } },
              connections: s.connections.map(c => c.id === connectionId
                ? { ...c, lastSyncAt: balance.updatedAt, balanceUSD: total }
                : c),
              trades: result.trades ? { ...s.trades, [connectionId]: result.trades.map(mapServerTrade) } : s.trades,
            }));
          } else {
            set({ isSyncing: false, syncError: null, lastSyncAt: result.syncedAt });
          }
        } catch (error) {
          set({ isSyncing: false, syncError: error instanceof Error ? error.message : 'Sync failed.' });
        }
      },

      // ── §4.3 Risk controls ─────────────────────────────────────────────────────

      updateRiskControls: (connectionId, controls) => {
        set(s => ({
          riskControls: {
            ...s.riskControls,
            [connectionId]: {
              ...(s.riskControls[connectionId] ?? { ...DEFAULT_RISK_CONTROLS, connectionId }),
              ...controls,
            },
          },
        }));
      },

      resetKillSwitch: (connectionId) => {
        riskManager.resetKillSwitch(connectionId);
        set(s => ({
          killSwitchActive: { ...s.killSwitchActive, [connectionId]: false },
        }));
        toast.success('Kill switch reset. Trading re-enabled.');
      },

      setActiveConnection: (id) => set({ activeConnectionId: id }),

      // ── §4.2 Trade execution ───────────────────────────────────────────────────

      executeTrade: async (connectionId, trade) => {
        set({ isExecutingTrade: true, tradeError: null, tradeWarnings: [] });
        try {
          const order = await request<ExecuteExchangeOrderResponse>('POST', '/api/exchange/order', {
            connectionId,
            symbol: trade.symbol,
            side: trade.side,
            quantity: trade.amount,
            orderType: trade.orderType,
            price: trade.orderType === 'market' ? undefined : trade.price,
          } satisfies ExecuteExchangeOrderRequest);
          set({ isExecutingTrade: false, tradeError: null });
          if (order.trade) {
            set(state => ({ trades: { ...state.trades, [connectionId]: [mapServerTrade(order.trade!), ...(state.trades[connectionId] ?? [])] } }));
          }
          await get().syncExchange(connectionId);
          return { success: true, orderId: order.orderId };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Trade failed.';
          set({ isExecutingTrade: false, tradeError: message });
          return { success: false, error: message };
        }
      },

      clearTradeError: () => set({ tradeError: null, tradeWarnings: [] }),

      // ── §4.5 Strategy deployment ───────────────────────────────────────────────

      deployStrategy: async (params) => {
        try {
          const payload: DeployExchangeStrategyRequest = {
            connectionId: params.connectionId,
            strategyId: params.strategyId,
            strategyName: params.strategyName,
            strategyInfo: params.strategyInfo,
            symbol: params.symbol,
            mode: params.mode,
            allocatedUSD: params.allocatedUSD,
            userLevel: params.userLevel,
            pairs: params.pairs,
            maxDailyLoss: params.maxDailyLoss,
          };
          const result = await request<DeployExchangeStrategyResponse>('POST', '/api/exchange/deploy', payload);
          if (result.status === 'failed') {
            return { success: false, deployId: result.deployId, status: result.status, error: result.message ?? 'Deployment failed.' };
          }
          set(state => ({
            deployedStrategies: [
              ...state.deployedStrategies.filter(strategy => strategy.id !== result.deployId),
              {
                id: result.deployId,
                connectionId: params.connectionId,
                strategyId: params.strategyId,
                strategyName: params.strategyName,
                status: result.status === 'running' ? 'running' : 'pending',
                allocatedUSD: params.allocatedUSD,
                currentValueUSD: params.allocatedUSD,
                realizedPnl: 0,
                unrealizedPnl: 0,
                totalTrades: 0,
                winRate: 0,
                deployedAt: new Date().toISOString(),
                lastRunAt: null,
              } as DeployedStrategy,
            ],
          }));
          return { success: true, deployId: result.deployId, status: result.status };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Deployment failed.' };
        }
      },

      toggleDeployedStrategy: (deployId, status) => {
        set(s => ({
          deployedStrategies: s.deployedStrategies.map(d =>
            d.id === deployId ? { ...d, status } : d,
          ),
        }));
      },

      removeDeployedStrategy: (deployId) => {
        set(s => ({
          deployedStrategies: s.deployedStrategies.filter(d => d.id !== deployId),
        }));
      },

      refreshApprovalQueue: () => {
        set({ approvalQueue: strategyDeployer.getApprovalQueue() });
      },

      adminApproveDeployment: (deployId, approved, note) => {
        strategyDeployer.approveDeployment(deployId, approved, note);
        set({ approvalQueue: strategyDeployer.getApprovalQueue() });
      },

      // ── Simulation helpers ─────────────────────────────────────────────────────

      addTrade: (connectionId, trade) => {
        const t: RealTrade = { ...trade, id: uid() };
        set(s => ({
          trades: { ...s.trades, [connectionId]: [t, ...(s.trades[connectionId] ?? [])] },
        }));
      },

      tickStrategies: () => {
        set(s => ({
          deployedStrategies: s.deployedStrategies.map(d => {
            if (d.status !== 'running') return d;
            const delta       = d.allocatedUSD * randFloat(-0.002, 0.003);
            const newUnrealized = d.unrealizedPnl + delta;
            const newValue    = d.allocatedUSD + newUnrealized + d.realizedPnl;
            return {
              ...d,
              currentValueUSD: Math.max(0, newValue),
              unrealizedPnl:   newUnrealized,
              lastRunAt:       new Date().toISOString(),
            };
          }),
        }));
      },

      pollNotifications: () => {
        const notifs = consumeTradeNotifications();
        for (const n of notifs) {
          switch (n.type) {
            case 'kill_switch':
              toast.error(`${n.title}\n${n.message}`, { duration: 8000 });
              fireExchangeNotify({ type: 'system', title: n.title, message: n.message });
              break;
            case 'daily_limit':
              toast.warning(n.title, { description: n.message, duration: 8000 });
              fireExchangeNotify({ type: 'system', title: n.title, message: n.message });
              break;
            case 'risk_warning':
              toast.warning(n.message);
              break;
            case 'trade_executed':
              toast.success(n.title, { description: n.message });
              fireExchangeNotify({ type: 'trade', title: n.title, message: n.message });
              break;
          }
        }
      },
    }),
    {
      name:    'cryptoverse-exchange-store-v2',
      version: 2,
      storage: createCloudStorage<ExchangeState>({
        objectType: 'exchange',
        userId: () => useAuthStore.getState().user?.email ?? null,
        cachePolicy: 'persistent',
      }),
    },
  ),
);





function buildFallbackPortfolio(connectionId: string, baseUSD: number): RealPortfolioSnapshot {
  const assets: PortfolioAsset[] = [
    { symbol: 'BTC',  name: 'Bitcoin',  logoEmoji: '₿',  quantity: 0.42, avgCostUSD: 58000, currentUSD: 67000 },
    { symbol: 'ETH',  name: 'Ethereum', logoEmoji: 'Ξ',  quantity: 3.1,  avgCostUSD: 3000,  currentUSD: 3400  },
    { symbol: 'USDT', name: 'Tether',   logoEmoji: '💵', quantity: 1200, avgCostUSD: 1,     currentUSD: 1     },
  ].map(a => {
    const valueUSD  = a.quantity * a.currentUSD;
    const costBasis = a.quantity * a.avgCostUSD;
    const pnl       = valueUSD - costBasis;
    return { ...a, valueUSD, pnl, pnlPct: (pnl / costBasis) * 100, allocation: 0 };
  });
  const total = assets.reduce((s, a) => s + a.valueUSD, 0);
  assets.forEach(a => { a.allocation = (a.valueUSD / total) * 100; });
  return {
    connectionId,
    takenAt:    new Date().toISOString(),
    totalUSD:   total,
    assets,
    dailyPnL:    (Math.random() - 0.3) * 300,
    dailyPnLPct: (Math.random() - 0.3) * 2,
    weeklyPnL:   (Math.random() - 0.25) * 800,
    monthlyPnL:  (Math.random() - 0.2) * 2000,
  };
}

// ── Notification bridge (consumed by appStore) ────────────────────────────────

interface ExchangeNotifyPayload {
  type: 'trade' | 'liquidation' | 'achievement' | 'system';
  title: string;
  message: string;
}
type ExchangeNotifyHandler = (n: ExchangeNotifyPayload) => void;

let _exchangeNotifyHandler: ExchangeNotifyHandler | null = null;

export function registerExchangeNotifyHandler(handler: ExchangeNotifyHandler): void {
  _exchangeNotifyHandler = handler;
}

function fireExchangeNotify(n: ExchangeNotifyPayload): void {
  _exchangeNotifyHandler?.(n);
}

// ── Strategy/portfolio auto-tick ───────────────────────────────────────────────

let _tickTimer:  ReturnType<typeof setInterval> | null = null;
let _notifTimer: ReturnType<typeof setInterval> | null = null;

export function startExchangeTicker() {
  if (_tickTimer) return;
  _tickTimer = setInterval(() => {
    useExchangeStore.getState().tickStrategies();
  }, 15000);

  // Poll notification queue every 3s
  if (!_notifTimer) {
    _notifTimer = setInterval(() => {
      useExchangeStore.getState().pollNotifications();
    }, 3000);
  }
}

export function stopExchangeTicker() {
  if (_tickTimer)  { clearInterval(_tickTimer);  _tickTimer  = null; }
  if (_notifTimer) { clearInterval(_notifTimer); _notifTimer = null; }
}
