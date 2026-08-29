/**
 * copyTradingStore.ts
 * Zustand store for the complete Copy Trading system.
 * Persists to localStorage. Seeds rich demo data for UX preview.
 */
import { create } from 'zustand';
import { cloudRecordStore } from './cloudData';

// ─────────────────────────────────────────────────────────────────────────────
// §6 Notification bridge — same pattern as tradingStore to avoid circular deps
// ─────────────────────────────────────────────────────────────────────────────

export type CopyNotifyType =
  | 'trade'
  | 'achievement'
  | 'system';

export type CopyNotifyPayload = {
  type:    CopyNotifyType;
  title:   string;
  message: string;
};

let _copyNotifyHandler: ((n: CopyNotifyPayload) => void) | null = null;

/** Called once by appStore to wire notifications without circular imports. */
export function registerCopyNotifyHandler(fn: (n: CopyNotifyPayload) => void) {
  _copyNotifyHandler = fn;
}

/** Internal helper — fires into appStore NotificationPanel. */
export function copyNotify(n: CopyNotifyPayload) {
  _copyNotifyHandler?.(n);
}
import {
  TopTrader,
  CopyRelationship,
  CopyExecution,
  CopySettings,
  CopyStatus,
  DEFAULT_COPY_SETTINGS,
  MonthlyReturn,
  TraderTrade,
} from './copyTradingTypes';
import { useCpCoinsStore } from './cpCoinsStore';

// ─────────────────────────────────────────────────────────────────────────────
// Persistence helpers
// ─────────────────────────────────────────────────────────────────────────────

const TRADERS_KEY       = 'cryptoverse_copy_traders_v1';
const RELATIONS_KEY     = 'cryptoverse_copy_relations_v1';
const EXECUTIONS_KEY    = 'cryptoverse_copy_executions_v1';

function load<T>(key: string, fallback: T): T {
  return cloudRecordStore.get<T>('copy_trading', key, fallback);
}
function save(key: string, val: unknown) {
  cloudRecordStore.set('copy_trading', key, val);
}

let _seq = 0;
function uid(): string {
  return `ct_${Date.now()}_${++_seq}_${Math.random().toString(36).slice(2, 7)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed data helpers
// ─────────────────────────────────────────────────────────────────────────────

function months(): MonthlyReturn[] {
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => ({
    month: names[(now.getMonth() - 11 + i + 12) % 12],
    returnPct: +(( Math.random() * 20 - 4)).toFixed(1),
  }));
}

function equity(base: number, pts = 30): number[] {
  const arr: number[] = [base];
  for (let i = 1; i < pts; i++) arr.push(+(arr[i - 1] * (1 + (Math.random() * 0.04 - 0.008))).toFixed(2));
  return arr;
}

function recentTrades(winRate: number, n = 8): TraderTrade[] {
  const symbols = ['BTC', 'ETH', 'SOL', 'BNB', 'ARB', 'MATIC'];
  const prices: Record<string, number> = { BTC: 43_000, ETH: 2_600, SOL: 105, BNB: 380, ARB: 1.8, MATIC: 0.9 };
  const trades: TraderTrade[] = [];
  for (let i = 0; i < n; i++) {
    const sym  = symbols[Math.floor(Math.random() * symbols.length)];
    const win  = Math.random() < winRate / 100;
    const type = i % 2 === 0 ? 'BUY' : 'SELL';
    const px   = prices[sym] * (1 + (Math.random() * 0.04 - 0.02));
    const amt  = Math.random() * 800 + 200;
    const pnl  = type === 'SELL' ? +(amt * (win ? 1 : -1) * (Math.random() * 0.04 + 0.005)).toFixed(2) : null;
    const pnlP = pnl ? +((pnl / amt) * 100).toFixed(2) : null;
    const d = new Date(Date.now() - i * 1_800_000);
    trades.push({ id: uid(), symbol: sym, type, price: +px.toFixed(2), amount: +amt.toFixed(2), pnl, pnlPct: pnlP, openedAt: d.toISOString(), closedAt: type === 'SELL' ? d.toISOString() : null });
  }
  return trades;
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed traders
// ─────────────────────────────────────────────────────────────────────────────

const SEED_TRADERS: TopTrader[] = [
  {
    id: 'trader_01', displayName: 'CryptoKing', avatarSeed: 'cryptoking', userId: 'system_01',
    rank: 1, badge: 'gold', joinedAt: '2024-01-15T00:00:00Z',
    winRate: 78.5, totalProfitPct: 156, avgTradeSizeUsd: 1_234, maxDrawdownPct: 8.5, sharpeRatio: 2.4,
    totalTrades: 1_823, totalFollowers: 2_345, activeFollowers: 1_987, copyFeePct: 5,
    totalEarningsCP: 12_450, rating: 4.9, ratingCount: 1_203,
    monthlyReturns: [
      { month: 'Jan', returnPct: 12 }, { month: 'Feb', returnPct: 8 }, { month: 'Mar', returnPct: 15 },
      { month: 'Apr', returnPct: -2 }, { month: 'May', returnPct: 10 }, { month: 'Jun', returnPct: 5 },
      { month: 'Jul', returnPct: 18 }, { month: 'Aug', returnPct: 7 }, { month: 'Sep', returnPct: -3 },
      { month: 'Oct', returnPct: 11 }, { month: 'Nov', returnPct: 9 }, { month: 'Dec', returnPct: 14 },
    ],
    equityCurve: equity(100_000),
    recentTrades: recentTrades(78.5),
    bio: 'Professional crypto trader since 2019. Specialising in BTC/ETH swing trades with strict risk management.',
    isVerified: true,
  },
  {
    id: 'trader_02', displayName: 'BTCWhale', avatarSeed: 'btcwhale', userId: 'system_02',
    rank: 2, badge: 'silver', joinedAt: '2024-02-01T00:00:00Z',
    winRate: 72.3, totalProfitPct: 112, avgTradeSizeUsd: 3_456, maxDrawdownPct: 12.1, sharpeRatio: 1.9,
    totalTrades: 934, totalFollowers: 1_892, activeFollowers: 1_540, copyFeePct: 3,
    totalEarningsCP: 8_900, rating: 4.7, ratingCount: 876,
    monthlyReturns: [
      { month: 'Jan', returnPct: 8 }, { month: 'Feb', returnPct: 14 }, { month: 'Mar', returnPct: -5 },
      { month: 'Apr', returnPct: 12 }, { month: 'May', returnPct: 7 }, { month: 'Jun', returnPct: 9 },
      { month: 'Jul', returnPct: -1 }, { month: 'Aug', returnPct: 16 }, { month: 'Sep', returnPct: 5 },
      { month: 'Oct', returnPct: 8 }, { month: 'Nov', returnPct: -3 }, { month: 'Dec', returnPct: 11 },
    ],
    equityCurve: equity(90_000),
    recentTrades: recentTrades(72.3),
    bio: 'Whale-scale BTC accumulation strategy. Large position swing trader with focus on macro cycles.',
    isVerified: true,
  },
  {
    id: 'trader_03', displayName: 'MoonTrader', avatarSeed: 'moontrader', userId: 'system_03',
    rank: 3, badge: 'bronze', joinedAt: '2024-02-15T00:00:00Z',
    winRate: 68.9, totalProfitPct: 89, avgTradeSizeUsd: 876, maxDrawdownPct: 15.3, sharpeRatio: 1.6,
    totalTrades: 2_341, totalFollowers: 1_456, activeFollowers: 1_102, copyFeePct: 2,
    totalEarningsCP: 5_600, rating: 4.5, ratingCount: 543,
    monthlyReturns: months(),
    equityCurve: equity(75_000),
    recentTrades: recentTrades(68.9),
    bio: 'Altcoin specialist targeting 2–5x setups. High frequency, tight stops.',
    isVerified: true,
  },
  {
    id: 'trader_04', displayName: 'SmartTrader', avatarSeed: 'smarttrader', userId: 'system_04',
    rank: 4, badge: 'none', joinedAt: '2024-03-01T00:00:00Z',
    winRate: 65.2, totalProfitPct: 67, avgTradeSizeUsd: 540, maxDrawdownPct: 10.8, sharpeRatio: 1.4,
    totalTrades: 1_102, totalFollowers: 987, activeFollowers: 756, copyFeePct: 2,
    totalEarningsCP: 3_400, rating: 4.3, ratingCount: 321,
    monthlyReturns: months(),
    equityCurve: equity(65_000),
    recentTrades: recentTrades(65.2),
    bio: 'Systematic quant trader. Rule-based entries, never deviate from the plan.',
    isVerified: false,
  },
  {
    id: 'trader_05', displayName: 'ScalperPro', avatarSeed: 'scalperpro', userId: 'system_05',
    rank: 5, badge: 'none', joinedAt: '2024-03-15T00:00:00Z',
    winRate: 61.8, totalProfitPct: 54, avgTradeSizeUsd: 230, maxDrawdownPct: 18.4, sharpeRatio: 1.1,
    totalTrades: 5_432, totalFollowers: 743, activeFollowers: 589, copyFeePct: 1,
    totalEarningsCP: 1_800, rating: 4.1, ratingCount: 198,
    monthlyReturns: months(),
    equityCurve: equity(55_000),
    recentTrades: recentTrades(61.8),
    bio: '1-minute scalper. High trade frequency, small but consistent gains.',
    isVerified: false,
  },
  {
    id: 'trader_06', displayName: 'RiskTaker', avatarSeed: 'risktaker', userId: 'system_06',
    rank: 6, badge: 'none', joinedAt: '2024-04-01T00:00:00Z',
    winRate: 55.0, totalProfitPct: 38, avgTradeSizeUsd: 450, maxDrawdownPct: 24.1, sharpeRatio: 0.9,
    totalTrades: 712, totalFollowers: 412, activeFollowers: 298, copyFeePct: 3,
    totalEarningsCP: 900, rating: 3.8, ratingCount: 87,
    monthlyReturns: months(),
    equityCurve: equity(45_000),
    recentTrades: recentTrades(55),
    bio: 'High risk, high reward plays. Only follow if you understand the volatility.',
    isVerified: false,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Seed follower executions helper
// ─────────────────────────────────────────────────────────────────────────────

function seedExecutions(rel: CopyRelationship): CopyExecution[] {
  const trader = SEED_TRADERS.find(t => t.id === rel.traderId)!;
  if (!trader) return [];
  const execs: CopyExecution[] = [];
  const count = rel.totalCopiedTrades;
  for (let i = 0; i < count; i++) {
    const trade = trader.recentTrades[i % trader.recentTrades.length];
    const copiedAmt = +(trade.amount * (rel.settings.copyPct / 100)).toFixed(2);
    const isClosed  = trade.type === 'SELL';
    const pnl  = isClosed ? +((trade.pnl ?? 0) * (rel.settings.copyPct / 100)).toFixed(2) : null;
    const pnlP = isClosed && pnl !== null ? +((pnl / copiedAmt) * 100).toFixed(2) : null;
    const fee  = isClosed && pnl !== null && pnl > 0 ? +(pnl * (trader.copyFeePct / 100)).toFixed(2) : 0;
    execs.push({
      id: uid(),
      relationshipId: rel.id,
      followerId: rel.followerId,
      traderId: rel.traderId,
      traderName: rel.traderName,
      originalTradeId: trade.id,
      symbol: trade.symbol,
      type: trade.type,
      originalPriceUsd: trade.price,
      copiedAmountUsd: copiedAmt,
      pnlUsd: pnl,
      pnlPct: pnlP,
      feePaidCP: fee,
      executedAt: trade.openedAt,
      closedAt: trade.closedAt,
      status: isClosed ? 'closed' : 'open',
    });
  }
  return execs;
}

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

interface CopyTradingState {
  traders: Record<string, TopTrader>;
  relationships: Record<string, CopyRelationship>;
  executions: Record<string, CopyExecution>;

  // Queries
  getTopTraders: () => TopTrader[];
  getTrader: (traderId: string) => TopTrader | undefined;
  getMyRelationships: (userId: string) => CopyRelationship[];
  getActiveRelationships: (userId: string) => CopyRelationship[];
  getPausedRelationships: (userId: string) => CopyRelationship[];
  getStoppedRelationships: (userId: string) => CopyRelationship[];
  getRelationshipWith: (userId: string, traderId: string) => CopyRelationship | undefined;
  getMyExecutions: (userId: string) => CopyExecution[];
  getExecutionsForRelationship: (relationshipId: string) => CopyExecution[];
  isFollowing: (userId: string, traderId: string) => boolean;

  // Follower stats (when the current user is a trader being copied)
  getFollowersOf: (traderId: string) => CopyRelationship[];
  getTraderEarnings: (traderId: string) => { totalCP: number; thisMonthCP: number; totalFollowers: number; activeFollowers: number };

  // Actions
  startCopying: (params: { followerId: string; traderId: string; settings: CopySettings }) => { ok: boolean; error?: string };
  updateSettings: (relationshipId: string, settings: Partial<CopySettings>) => { ok: boolean };
  pauseCopying: (relationshipId: string, reason: 'manual' | 'daily_loss_limit') => void;
  resumeCopying: (relationshipId: string) => void;
  stopCopying: (relationshipId: string) => void;
  updateCopyFee: (traderId: string, newFeePct: number) => void;

  /**
   * Low-level method used by the engine to atomically persist exec + rel updates.
   * Not intended for direct UI calls — use CopyTradeEngine.onTraderTrade() instead.
   */
  _persistEngineResult: (exec: CopyExecution, updatedRel: CopyRelationship) => void;

  /**
   * Simulate a copy trade execution using the full CopyTradeEngine pipeline.
   * Returns the resulting execution or null if the engine blocked it.
   */
  simulateCopyExecution: (relationshipId: string) => Promise<CopyExecution | null>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

export const useCopyTradingStore = create<CopyTradingState>((set, get) => {
  // Build initial seed relationships for the demo user
  const seedRelations: Record<string, CopyRelationship> = load(RELATIONS_KEY, {});
  const seedExecs: Record<string, CopyExecution>        = load(EXECUTIONS_KEY, {});

  // Only seed if no relationships exist yet
  if (Object.keys(seedRelations).length === 0) {
    const demoUserId = 'demo_follower';

    const makeRel = (traderId: string, copyPct: number, profit: number, totalCopied: number, status: CopyStatus, pauseReason: string | null = null): CopyRelationship => {
      const trader = SEED_TRADERS.find(t => t.id === traderId)!;
      const id = uid();
      return {
        id, followerId: demoUserId, traderId, traderName: trader.displayName,
        traderAvatarSeed: trader.avatarSeed,
        settings: { ...DEFAULT_COPY_SETTINGS, copyPct },
        status, pauseReason,
        startedAt: new Date(Date.now() - Math.random() * 30 * 86_400_000).toISOString(),
        stoppedAt: status === 'stopped' ? new Date().toISOString() : null,
        totalCopiedTrades: totalCopied,
        winCopied: Math.round(totalCopied * (trader.winRate / 100)),
        lossCopied: Math.round(totalCopied * (1 - trader.winRate / 100)),
        totalInvestedUsd: +(totalCopied * trader.avgTradeSizeUsd * (copyPct / 100)).toFixed(2),
        totalProfitUsd: profit,
        totalFeesPaidCP: +(Math.max(0, profit) * (trader.copyFeePct / 100)).toFixed(2),
        dailyLossAccumUsd: 0,
        lastTradeAt: new Date(Date.now() - 3_600_000).toISOString(),
      };
    };

    const r1 = makeRel('trader_01', 50, 234.50, 89, 'active');
    const r2 = makeRel('trader_04', 25, 89.20, 34, 'active');
    const r3 = makeRel('trader_02', 100, -123.00, 12, 'active');
    const r4 = makeRel('trader_03', 75, 567.80, 67, 'active');
    const r5 = makeRel('trader_06', 50, -890.00, 45, 'paused', 'daily_loss_limit');
    const r6 = makeRel('trader_05', 100, -234.00, 23, 'paused', 'manual');

    [r1, r2, r3, r4, r5, r6].forEach(r => {
      seedRelations[r.id] = r;
      const execs = seedExecutions(r);
      execs.forEach(e => { seedExecs[e.id] = e; });
    });

    save(RELATIONS_KEY, seedRelations);
    save(EXECUTIONS_KEY, seedExecs);
  }

  const tradersMap: Record<string, TopTrader> = load(TRADERS_KEY, {});
  if (Object.keys(tradersMap).length === 0) {
    SEED_TRADERS.forEach(t => { tradersMap[t.id] = t; });
    save(TRADERS_KEY, tradersMap);
  }

  return {
    traders:       tradersMap,
    relationships: seedRelations,
    executions:    seedExecs,

    // ── Queries ────────────────────────────────────────────────────────────

    getTopTraders: () =>
      Object.values(get().traders).sort((a, b) => a.rank - b.rank),

    getTrader: (tid) => get().traders[tid],

    getMyRelationships: (uid) =>
      Object.values(get().relationships).filter(r => r.followerId === uid),

    getActiveRelationships: (uid) =>
      Object.values(get().relationships).filter(r => r.followerId === uid && r.status === 'active'),

    getPausedRelationships: (uid) =>
      Object.values(get().relationships).filter(r => r.followerId === uid && r.status === 'paused'),

    getStoppedRelationships: (uid) =>
      Object.values(get().relationships).filter(r => r.followerId === uid && r.status === 'stopped'),

    getRelationshipWith: (uid, tid) =>
      Object.values(get().relationships).find(r => r.followerId === uid && r.traderId === tid),

    getMyExecutions: (uid) =>
      Object.values(get().executions)
        .filter(e => e.followerId === uid)
        .sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime()),

    getExecutionsForRelationship: (relId) =>
      Object.values(get().executions)
        .filter(e => e.relationshipId === relId)
        .sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime()),

    isFollowing: (uid, tid) =>
      Object.values(get().relationships).some(
        r => r.followerId === uid && r.traderId === tid && r.status !== 'stopped',
      ),

    getFollowersOf: (traderId) =>
      Object.values(get().relationships).filter(r => r.traderId === traderId),

    getTraderEarnings: (traderId) => {
      const followers = get().getFollowersOf(traderId);
      const trader    = get().traders[traderId];
      const thisMonthStart = new Date();
      thisMonthStart.setDate(1);
      thisMonthStart.setHours(0, 0, 0, 0);

      const execs = Object.values(get().executions).filter(e => e.traderId === traderId);
      const thisMonthExecs = execs.filter(e => new Date(e.executedAt) >= thisMonthStart);

      const totalCP     = execs.reduce((s, e) => s + e.feePaidCP, 0);
      const thisMonthCP = thisMonthExecs.reduce((s, e) => s + e.feePaidCP, 0);

      return {
        totalCP:        trader?.totalEarningsCP ?? totalCP,
        thisMonthCP,
        totalFollowers: followers.length,
        activeFollowers: followers.filter(f => f.status === 'active').length,
      };
    },

    // ── Actions ────────────────────────────────────────────────────────────

    startCopying: ({ followerId, traderId, settings }) => {
      const { traders, relationships } = get();
      const trader = traders[traderId];
      if (!trader) return { ok: false, error: 'Trader not found.' };

      const existing = Object.values(relationships).find(
        r => r.followerId === followerId && r.traderId === traderId && r.status !== 'stopped',
      );
      if (existing) return { ok: false, error: 'You are already copying this trader.' };

      const rel: CopyRelationship = {
        id: uid(), followerId, traderId, traderName: trader.displayName,
        traderAvatarSeed: trader.avatarSeed, settings,
        status: 'active', pauseReason: null,
        startedAt: new Date().toISOString(), stoppedAt: null,
        totalCopiedTrades: 0, winCopied: 0, lossCopied: 0,
        totalInvestedUsd: 0, totalProfitUsd: 0, totalFeesPaidCP: 0,
        dailyLossAccumUsd: 0, lastTradeAt: null,
      };

      // ── P1: CP Payment Flow ──────────────────────────────────────────
      // Follower pays a setup fee: 50 CP (platform fee for starting copy)
      // Plus an estimated trader fee hold based on trader's copyFeePct
      const COPY_SETUP_FEE_CP = 50;
      const estimatedProfit   = trader.avgTradeSizeUsd * (settings.copyPct / 100) * (trader.winRate / 100) * 0.03;
      const estimatedTraderFee = Math.max(10, Math.round(estimatedProfit * (trader.copyFeePct / 100)));
      const totalRequiredFee   = COPY_SETUP_FEE_CP + estimatedTraderFee;

      try {
        const cpStore = useCpCoinsStore.getState();
        const followerBalance = cpStore.getBalance(followerId);

        if (followerBalance < COPY_SETUP_FEE_CP) {
          return { ok: false, error: `Insufficient CP. You need at least ${COPY_SETUP_FEE_CP} CP to start copying. Please buy more CP.` };
        }

        // If balance falls short of estimated total, still allow but warn
        if (followerBalance < totalRequiredFee) {
          console.warn(`[CopyTrading] Follower ${followerId} may have insufficient CP for trader fees. Balance: ${followerBalance}, Estimated required: ${totalRequiredFee}`);
        }

        // Debit platform setup fee upfront
        cpStore.debit({
          userId: followerId,
          amount: COPY_SETUP_FEE_CP,
          type: 'platform_fee',
          description: `Copy trading setup fee — copying ${trader.displayName}`,
        });

        // Hold estimated trader fee as a reserve (will be settled on profitable trades)
        if (followerBalance >= totalRequiredFee) {
          cpStore.debit({
            userId: followerId,
            amount: estimatedTraderFee,
            type: 'copy_trading_reserve',
            description: `Copy trading reserve fee for ${trader.displayName} (${trader.copyFeePct}% of profit) — returned if no profit`,
          });
        }
      } catch (e) {
        console.error('[CopyTrading] CP debit failed:', e);
        return { ok: false, error: 'Payment processing failed. Please try again.' };
      }

      // Increment follower counts on trader
      const updatedTrader = {
        ...trader,
        totalFollowers:  trader.totalFollowers + 1,
        activeFollowers: trader.activeFollowers + 1,
      };

      const newRels = { ...relationships, [rel.id]: rel };
      const newTraders = { ...get().traders, [traderId]: updatedTrader };
      save(RELATIONS_KEY, newRels);
      save(TRADERS_KEY, newTraders);
      set({ relationships: newRels, traders: newTraders });

      // §6 — New follower notification (fires to TRADER)
      copyNotify({
        type:    'achievement',
        title:   '👥 New Follower!',
        message: `${followerId} started copying your trades at ${settings.copyPct}%!`,
      });

      return { ok: true };
    },

    updateSettings: (relId, partial) => {
      const rel = get().relationships[relId];
      if (!rel) return { ok: false };
      const updated = { ...rel, settings: { ...rel.settings, ...partial } };
      const newRels = { ...get().relationships, [relId]: updated };
      save(RELATIONS_KEY, newRels);
      set({ relationships: newRels });
      return { ok: true };
    },

    pauseCopying: (relId, reason) => {
      const rel = get().relationships[relId];
      if (!rel) return;
      const updated = { ...rel, status: 'paused' as CopyStatus, pauseReason: reason };
      const newRels = { ...get().relationships, [relId]: updated };
      save(RELATIONS_KEY, newRels);
      set({ relationships: newRels });

      // §6 — Copy paused notification
      const reasonLabel = reason === 'daily_loss_limit' ? 'Daily loss limit reached' : 'Manually paused';
      copyNotify({
        type:    'system',
        title:   '⏸ Copy Trading Paused',
        message: `Copying ${rel.traderName} paused. Reason: ${reasonLabel}.`,
      });
    },

    resumeCopying: (relId) => {
      const rel = get().relationships[relId];
      if (!rel) return;
      const updated = { ...rel, status: 'active' as CopyStatus, pauseReason: null };
      const newRels = { ...get().relationships, [relId]: updated };
      save(RELATIONS_KEY, newRels);
      set({ relationships: newRels });

      // §6 — Copy resumed notification
      copyNotify({
        type:    'system',
        title:   '▶️ Copy Trading Resumed',
        message: `Copying ${rel.traderName} has resumed.`,
      });
    },

    stopCopying: (relId) => {
      const rel = get().relationships[relId];
      if (!rel) return;
      const trader    = get().traders[rel.traderId];
      const updated   = { ...rel, status: 'stopped' as CopyStatus, stoppedAt: new Date().toISOString() };
      const newRels   = { ...get().relationships, [relId]: updated };
      const newTraders = trader ? {
        ...get().traders,
        [rel.traderId]: {
          ...trader,
          activeFollowers: Math.max(0, trader.activeFollowers - 1),
        },
      } : get().traders;
      save(RELATIONS_KEY, newRels);
      save(TRADERS_KEY, newTraders);
      set({ relationships: newRels, traders: newTraders });
    },

    updateCopyFee: (traderId, newFeePct) => {
      const trader = get().traders[traderId];
      if (!trader) return;
      const updated = { ...trader, copyFeePct: newFeePct };
      const newTraders = { ...get().traders, [traderId]: updated };
      save(TRADERS_KEY, newTraders);
      set({ traders: newTraders });
    },

    // ── Engine persistence bridge ───────────────────────────────────────────
    // Called internally by CopyTradeEngine to atomically write exec + rel
    _persistEngineResult: (exec, updatedRel) => {
      const newExecs = { ...get().executions, [exec.id]: exec };
      const newRels  = { ...get().relationships, [updatedRel.id]: updatedRel };
      save(EXECUTIONS_KEY, newExecs);
      save(RELATIONS_KEY, newRels);
      set({ executions: newExecs, relationships: newRels });
    },

    // ── simulateCopyExecution — uses full engine pipeline ──────────────────
    simulateCopyExecution: async (relId) => {
      const rel    = get().relationships[relId];
      const trader = rel ? get().traders[rel.traderId] : null;
      if (!rel || !trader || rel.status !== 'active') return null;

      // Pick a random recent trade from the trader to simulate
      const srcTrade = trader.recentTrades[Math.floor(Math.random() * trader.recentTrades.length)];
      const win      = Math.random() < trader.winRate / 100;
      const isSell   = srcTrade.type === 'SELL';
      const pnl      = isSell
        ? +(srcTrade.amount * (win ? 1 : -1) * (Math.random() * 0.04 + 0.005)).toFixed(2)
        : null;

      // Build IncomingTrade to feed into the engine
      const incomingTrade = {
        id:     uid(),
        symbol: srcTrade.symbol,
        type:   srcTrade.type,
        price:  srcTrade.price,
        amount: srcTrade.amount,
        pnl:    pnl,
        pnlPct: pnl !== null ? +((pnl / srcTrade.amount) * 100).toFixed(2) : null,
      };

      // Lazy import avoids circular dep at module load time
      const { CopyTradeEngine, CopyRiskManager } = await import('./copyTradeEngine');
      const engine = new CopyTradeEngine(relId);
      const result = await engine.onTraderTrade(incomingTrade);

      if (!result.ok) return null;

      // After execution, run risk checks
      CopyRiskManager.checkAndPauseRiskyCopies(rel.followerId);

      return result.execution;
    },
  };
});
