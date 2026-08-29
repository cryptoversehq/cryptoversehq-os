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

import {
  ExchangeId, ExchangeConnection, ConnectionStatus,
  RiskControls, DEFAULT_RISK_CONTROLS, RealTrade,
  DeployedStrategy, DeployStatus, RealPortfolioSnapshot,
  PortfolioAsset, ExchangePermission, TradingMode, OrderSide,
} from './exchangeTypes';

import { connectionManager }  from './exchangeConnectionManager';
import { riskManager, RiskMetrics, RiskLimitReachedEvent } from './exchangeRiskManager';
import { tradeExecutor, RealTradeRequest, RealTradeResult, consumeTradeNotifications } from './exchangeTradeExecutor';
import { portfolioSyncer, SyncResult } from './exchangePortfolioSyncer';
import { strategyDeployer, DeploymentResult, ApprovalQueueItem } from './exchangeStrategyDeployer';
import { toast } from 'sonner';

// ── Internal helpers ───────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function randFloat(min: number, max: number, dp = 2): number {
  return parseFloat((Math.random() * (max - min) + min).toFixed(dp));
}

function daysAgo(d: number): string {
  return new Date(Date.now() - d * 86400000).toISOString();
}

// ── Mock trade history (for initial load after connect) ────────────────────────

const MOCK_SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT', 'AVAX/USDT'];
const MOCK_PRICES: Record<string, number> = {
  'BTC/USDT': 67000, 'ETH/USDT': 3400, 'SOL/USDT': 180,
  'BNB/USDT': 590,   'XRP/USDT': 0.62, 'AVAX/USDT': 38,
};

function generateMockTrades(connectionId: string, exchangeId: ExchangeId, count = 25): RealTrade[] {
  const trades: RealTrade[] = [];
  for (let i = 0; i < count; i++) {
    const symbol    = MOCK_SYMBOLS[Math.floor(Math.random() * MOCK_SYMBOLS.length)];
    const basePrice = MOCK_PRICES[symbol] ?? 100;
    const side: OrderSide = Math.random() > 0.5 ? 'buy' : 'sell';
    const price = basePrice * (1 + randFloat(-0.02, 0.02));
    const qty   = randFloat(0.001, 0.5, 6);
    const pnl   = side === 'sell' ? randFloat(-50, 200) : undefined;
    trades.push({
      id: uid(),
      connectionId,
      exchangeId,
      symbol,
      side,
      type:       Math.random() > 0.7 ? 'limit' : 'market',
      status:     Math.random() > 0.1 ? 'filled' : 'partial',
      quantity:   qty,
      price,
      filledQty:  qty * (Math.random() > 0.1 ? 1 : randFloat(0.5, 0.9)),
      filledAvgPx: price * (1 + randFloat(-0.001, 0.001)),
      feePaid:    price * qty * 0.001,
      feeCurrency:'USDT',
      pnl,
      pnlPct:     pnl !== undefined ? (pnl / (price * qty)) * 100 : undefined,
      createdAt:  daysAgo(randFloat(0, 30, 0)),
      filledAt:   daysAgo(randFloat(0, 30, 0)),
      mode:       'spot',
      isFromBot:  Math.random() > 0.7,
    });
  }
  return trades.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
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

  disconnectExchange: (connectionId: string) => void;

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

      connectExchange: async ({ exchangeId, label, apiKey, apiSecret, passphrase, modes, permissions, isReadOnly }) => {
        const result = await connectionManager.connectWithApiKey({
          exchangeId, apiKey, apiSecret, passphrase,
          modes,
          requestedPermissions: permissions,
        });

        if (!result.success) {
          return { success: false, error: result.error };
        }

        const id = uid();
        const connection: ExchangeConnection = {
          id,
          exchangeId,
          label:       label || `${EXCHANGE_MAP[exchangeId]} Account`,
          status:      'connected',
          connectedAt: new Date().toISOString(),
          lastSyncAt:  new Date().toISOString(),
          maskedKey:   result.maskedKey,
          permissions: result.permissions ?? ['read', 'trade'],
          modes,
          balanceUSD:  result.balanceUSD ?? 0,
          balanceBTC:  result.balanceBTC ?? 0,
          isReadOnly,
        };

        const rc: RiskControls = { ...DEFAULT_RISK_CONTROLS, connectionId: id };
        const mockTrades  = generateMockTrades(id, exchangeId);

        // Do initial portfolio sync with real syncer
        const syncResult = await portfolioSyncer.syncPortfolio(connection);
        const portfolio   = syncResult.snapshot ?? buildFallbackPortfolio(id, connection.balanceUSD);

        set(s => ({
          connections:  [...s.connections, connection],
          riskControls: { ...s.riskControls, [id]: rc },
          trades:       { ...s.trades, [id]: mockTrades },
          portfolios:   { ...s.portfolios, [id]: portfolio },
          activeConnectionId: s.activeConnectionId ?? id,
        }));

        return { success: true, connectionId: id };
      },

      connectOAuth: async ({ exchangeId, label }) => {
        const result = await connectionManager.connectOAuth({
          exchangeId,
          requestedScopes: ['read', 'trade'],
        });

        if (!result.success) return { success: false, error: result.error };

        const id = uid();
        const connection: ExchangeConnection = {
          id,
          exchangeId,
          label:       label || `${EXCHANGE_MAP[exchangeId]} Account`,
          status:      'connected',
          connectedAt: new Date().toISOString(),
          lastSyncAt:  new Date().toISOString(),
          permissions: result.permissions ?? ['read', 'trade'],
          modes:       ['spot'],
          balanceUSD:  result.balanceUSD ?? 0,
          balanceBTC:  result.balanceBTC ?? 0,
          isReadOnly:  false,
          oauthToken:  `oauth_${uid()}`,
        };

        const rc      = { ...DEFAULT_RISK_CONTROLS, connectionId: id };
        const trades  = generateMockTrades(id, exchangeId, 15);
        const syncRes = await portfolioSyncer.syncPortfolio(connection);
        const portfolio = syncRes.snapshot ?? buildFallbackPortfolio(id, connection.balanceUSD);

        set(s => ({
          connections:  [...s.connections, connection],
          riskControls: { ...s.riskControls, [id]: rc },
          trades:       { ...s.trades, [id]: trades },
          portfolios:   { ...s.portfolios, [id]: portfolio },
          activeConnectionId: s.activeConnectionId ?? id,
        }));

        return { success: true, connectionId: id };
      },

      disconnectExchange: (connectionId) => {
        set(s => {
          const filtered  = s.connections.filter(c => c.id !== connectionId);
          const newActive = s.activeConnectionId === connectionId
            ? (filtered[0]?.id ?? null)
            : s.activeConnectionId;
          // Stop any deployed strategies for this connection
          const strats = s.deployedStrategies.map(d =>
            d.connectionId === connectionId ? { ...d, status: 'stopped' as DeployStatus } : d,
          );
          return { connections: filtered, activeConnectionId: newActive, deployedStrategies: strats };
        });
      },

      testConnection: async (connectionId) => {
        const conn = get().connections.find(c => c.id === connectionId);
        if (!conn) return { success: false, error: 'Connection not found' };
        const result = await connectionManager.testConnection(conn.exchangeId, conn.maskedKey ?? '');
        return { success: result.reachable, latencyMs: result.latencyMs, error: result.error };
      },

      // ── §4.4 Sync ──────────────────────────────────────────────────────────────

      syncExchange: async (connectionId) => {
        set({ isSyncing: true, syncError: null });
        const conn = get().connections.find(c => c.id === connectionId);
        if (!conn) { set({ isSyncing: false, syncError: 'Connection not found' }); return; }

        const result: SyncResult = await portfolioSyncer.syncPortfolio(conn);

        // Also fetch some new simulated trades
        const newTrades = generateMockTrades(connectionId, conn.exchangeId, 3);

        set(s => ({
          isSyncing:  false,
          lastSyncAt: new Date().toISOString(),
          syncError:  result.success ? null : (result.error ?? 'Sync failed'),
          portfolios: result.success && result.snapshot
            ? { ...s.portfolios, [connectionId]: result.snapshot }
            : s.portfolios,
          trades: {
            ...s.trades,
            [connectionId]: [...newTrades, ...(s.trades[connectionId] ?? [])].slice(0, 100),
          },
          connections: s.connections.map(c =>
            c.id === connectionId
              ? { ...c, lastSyncAt: new Date().toISOString(), balanceUSD: result.snapshot?.totalUSD ?? c.balanceUSD }
              : c,
          ),
        }));
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

      executeTrade: async (connectionId, trade, requires2FA) => {
        set({ isExecutingTrade: true, tradeError: null, tradeWarnings: [] });

        const conn     = get().connections.find(c => c.id === connectionId);
        const controls = get().getRiskControls(connectionId);

        if (!conn) {
          set({ isExecutingTrade: false, tradeError: 'Exchange not connected' });
          return { success: false, error: 'Exchange not connected' };
        }

        const availableUSD  = conn.balanceUSD * 0.82;
        const availableBase = (get().portfolios[connectionId]?.assets ?? [])
          .find(a => a.symbol === trade.symbol.split('/')[0])?.quantity ?? 0;

        const result = await tradeExecutor.executeTrade(
          conn, trade, controls, availableUSD, availableBase, requires2FA,
        );

        if (result.success) {
          // Record trade
          const tradeRecord = tradeExecutor.buildTradeRecord(connectionId, conn.exchangeId, trade, result);
          const fullTrade: RealTrade = { ...tradeRecord, id: uid() };

          // Update daily loss tracking in UI
          const metrics = riskManager.getMetrics(connectionId);

          set(s => ({
            isExecutingTrade: false,
            tradeWarnings:    result.riskWarnings ?? [],
            trades:           { ...s.trades, [connectionId]: [fullTrade, ...(s.trades[connectionId] ?? [])] },
            dailyLossUSD:     { ...s.dailyLossUSD, [connectionId]: metrics.dailyLossUSD },
            killSwitchActive: { ...s.killSwitchActive, [connectionId]: metrics.killSwitchTriggered },
          }));
        } else {
          set({ isExecutingTrade: false, tradeError: result.error ?? 'Trade failed' });
        }

        // Drain notification queue → toast
        get().pollNotifications();

        return result;
      },

      clearTradeError: () => set({ tradeError: null, tradeWarnings: [] }),

      // ── §4.5 Strategy deployment ───────────────────────────────────────────────

      deployStrategy: async ({
        connectionId, strategyId, strategyName, strategyInfo,
        symbol, mode, allocatedUSD, userLevel, pairs, maxDailyLoss,
      }) => {
        const conn = get().connections.find(c => c.id === connectionId);
        if (!conn) return { success: false, error: 'Connection not found' };

        const result: DeploymentResult = await strategyDeployer.deployStrategy(
          {
            connectionId,
            strategyId,
            strategyName,
            settings: { symbol, mode, allocatedUSD, maxPositionUSD: allocatedUSD / 10, maxDailyLossUSD: maxDailyLoss, tradingHours: '00:00-23:59', pairs },
            userLevel,
          },
          conn,
          { id: strategyId, name: strategyName, ...strategyInfo },
        );

        if (result.success && result.status === 'active') {
          const id = result.deployId ?? uid();
          const rc = get().getRiskControls(connectionId);
          const ds: DeployedStrategy = {
            id,
            connectionId,
            exchangeId:      conn.exchangeId,
            strategyId,
            strategyName,
            symbol,
            mode,
            status:          'running',
            deployedAt:      new Date().toISOString(),
            lastRunAt:       new Date().toISOString(),
            allocatedUSD,
            currentValueUSD: allocatedUSD * (1 + randFloat(-0.01, 0.03)),
            realizedPnl:     0,
            unrealizedPnl:   allocatedUSD * randFloat(-0.005, 0.015),
            totalTrades:     0,
            winRate:         strategyInfo.winRate,
            maxDrawdown:     strategyInfo.maxDrawdown,
            riskControls:    rc,
          };
          set(s => ({ deployedStrategies: [...s.deployedStrategies, ds] }));
        }

        // Refresh approval queue
        get().refreshApprovalQueue();

        return { success: result.success, deployId: result.deployId, error: result.error, status: result.status };
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

// ── Exchange name map ──────────────────────────────────────────────────────────

const EXCHANGE_MAP: Record<ExchangeId, string> = {
  binance:  'Binance',
  coinbase: 'Coinbase',
  kraken:   'Kraken',
  okx:      'OKX',
};

// ── Fallback portfolio (if sync fails) ────────────────────────────────────────

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
