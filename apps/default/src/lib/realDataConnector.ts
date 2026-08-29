/**
 * realDataConnector.ts - Lynx AI Real Data Connector
 * Bridges Lynx AI to ALL application stores and external APIs.
 */

import { useAuthStore } from './authStore';
import { useTradingStore } from './tradingStore';
import { useAcademyStore } from './academyStore';
import { useUnifiedBalanceStore } from './unifiedBalanceStore';
import { useCpCoinsStore } from './cpCoinsStore';
import { useSubscriptionStore } from './subscriptionStore';
import { useExchangeStore } from './exchangeStore';
import { useOnChainStore } from './onChainStore';
import { useNftStore } from './nftStore';
import { useSentimentStore } from './sentimentStore';
import { useLiveEventStore } from './liveEventStore';
import { useNationsStore } from './nationsStore';
import { useTwinLeagueStore } from './twinLeagueStore';
import { useBotStore } from './botStore';
import { useBotMarketplaceStore } from './botMarketplaceStore';
import { useCopyTradingStore } from './copyTradingStore';
import { useNationsCompetitionStore } from './nationsCompetitionStore';
import { deepSeekChat } from './deepSeekClient';
import type { DSMessage } from './deepSeekClient';

export interface AppData {
  users: { total: number; active7d: number; active30d: number; plans: { free: number; pro: number; pro_plus: number } };
  trading: { totalTrades: number; openPositions: number; volume24h: number; avgWinRate: number };
  academy: { totalLessons: number; completedLessons: number; avgLevel: number; totalXP: number };
  cp: { balance: number; price: number; circulatingSupply: number };
  payments: { today: number; todayValue: number; pending: number };
}

export interface AllAppData {
  auth: any;
  trading: any;
  academy: any;
  balance: any;
  cp: any;
  subscription: any;
  exchange: any;
  onChain: any;
  nft: any;
  sentiment: any;
  events: any;
  nations: any;
  twinLeague: any;
  bots: any;
  marketplace: any;
  copyTrading: any;
  competitions: any;
}

export interface MarketData {
  prices: Record<string, number>;
  globalMarketCap: number | null;
  btcDominance: number | null;
  fearGreedIndex: number | null;
  source: 'live' | 'cached' | 'unavailable';
  fetchedAt: number | null;
}

export type DataType = 'users' | 'revenue' | 'trades' | 'academy' | 'subscription' | 'wallet' | 'platform_health' | 'simulator' | 'inventory' | 'portfolio' | 'assets' | 'holdings' | 'bots' | 'marketplace' | 'rewards' | 'copy_trading' | 'competitions';

class RealDataConnector {
  private coinGeckoCache: { data: MarketData | null; ts: number } = { data: null, ts: 0 };
  private CACHE_TTL = 60000;

  /** Get ALL store data at once */
  getAllData(): AllAppData {
    return {
      auth: useAuthStore.getState(),
      trading: useTradingStore.getState(),
      academy: useAcademyStore.getState(),
      balance: useUnifiedBalanceStore.getState(),
      cp: useCpCoinsStore.getState(),
      subscription: useSubscriptionStore.getState(),
      exchange: useExchangeStore.getState(),
      onChain: useOnChainStore.getState(),
      nft: useNftStore.getState(),
      sentiment: useSentimentStore.getState(),
      events: useLiveEventStore.getState(),
      nations: useNationsStore.getState(),
      twinLeague: useTwinLeagueStore.getState(),
      bots: useBotStore.getState(),
      marketplace: useBotMarketplaceStore.getState(),
      copyTrading: useCopyTradingStore.getState(),
      competitions: useNationsCompetitionStore.getState(),
    };
  }

  /** Get data for a specific section */
  getSectionData(section: string): any {
    const all = this.getAllData();
    return (all as any)[section] || null;
  }

  /** Detect the domain data type a query refers to (intent classification) */
  detectDataType(query: string): DataType | null {
    const lower = query.toLowerCase();
    if (/simulator|practice trading|paper trade|demo trade/.test(lower)) return 'simulator';
    if (/inventory|rewards?|holdings?|assets?/.test(lower)) return /reward/.test(lower) ? 'rewards' : /inventory/.test(lower) ? 'inventory' : /holding/.test(lower) ? 'holdings' : 'assets';
    if (/portfolio/.test(lower)) return 'portfolio';
    if (/bots?|robots?|automated strategy/.test(lower)) return 'bots';
    if (/marketplace|marketplace items?/.test(lower)) return 'marketplace';
    if (/copy trading|copied trades?/.test(lower)) return 'copy_trading';
    if (/competitions?|tournaments?/.test(lower)) return 'competitions';
    if (/user|account|signup|member|active|inactive/.test(lower)) return 'users';
    if (/revenue|income|payment|earning|money|sales/.test(lower)) return 'revenue';
    if (/trade|position|order|buy|sell|profit|loss/.test(lower)) return 'trades';
    if (/academy|lesson|quiz|course|learn|study/.test(lower)) return 'academy';
    if (/subscription|plan|premium|pro|upgrade/.test(lower)) return 'subscription';
    if (/wallet|balance|cp|credit|coin/.test(lower)) return 'wallet';
    if (/health|status|uptime|system|platform/.test(lower)) return 'platform_health';
    return null;
  }

  // ── Helper: Active Users ──────────────────────────────────────────────

  /** Get count of users active within the last N days */
  getActiveUsers(days: number): number {
    const authState = useAuthStore.getState();
    const users = authState.users || [];
    const now = Date.now();
    const cutoff = now - days * 24 * 60 * 60 * 1000;

    return users.filter((u: any) => {
      const lastLogin = u.lastLoginAt || u.lastLogin || 0;
      return new Date(lastLogin).getTime() > cutoff;
    }).length;
  }

  /** Get plan breakdown of all users */
  getPlanBreakdown(): { free: number; pro: number; pro_plus: number } {
    const authState = useAuthStore.getState();
    const users = authState.users || [];
    const plans = { free: 0, pro: 0, pro_plus: 0 };

    users.forEach((u: any) => {
      const plan = u.plan || 'free';
      if (plan === 'free') plans.free++;
      else if (plan === 'pro') plans.pro++;
      else if (plan === 'pro_plus') plans.pro_plus++;
    });

    return plans;
  }

  /** Get online users (active within last 5 minutes) */
  getOnlineUsers(): number {
    return this.getActiveUsers(0.0035); // 5 minutes = 0.0035 days
  }

  /** Get AI request stats. count is real (local events); latency/error are not
   *  measured yet and are reported as -1 (unavailable), never a fabricated 0. */
  getAIRequests(): { count: number; avgMs: number; errorRate: number } {
    try {
      const stored = JSON.parse(localStorage.getItem('cv_lynx_events') || '[]');
      const chatMsgs = stored.filter((e: any) => e.type === 'CHAT_MESSAGE');
      return { count: chatMsgs.length, avgMs: -1, errorRate: -1 };
    } catch (err) {
      console.warn('[realDataConnector] getAIRequests failed:', err instanceof Error ? err.message : err);
      return { count: 0, avgMs: -1, errorRate: -1 };
    }
  }

  /** Payment stats are not backed by a real payments source yet. Every field is
   *  reported as -1 (unavailable) so consumers never show a fabricated 0 as if
   *  it were live data. */
  getPaymentStats(): { today: number; todayValue: number; pending: number } {
    return { today: -1, todayValue: -1, pending: -1 };
  }

  // ── User Analytics ────────────────────────────────────────────────────

  /** Get real user statistics from auth data */
  getUserStats() {
    const authState = useAuthStore.getState();
    const users = authState.users || [];
    const now = Date.now();
    const activeThreshold = 7 * 24 * 60 * 60 * 1000;

    const active = users.filter((u: any) => {
      const lastLogin = u.lastLoginAt || u.lastLogin || 0;
      return now - new Date(lastLogin).getTime() < activeThreshold;
    });
    const inactive = users.filter((u: any) => {
      const lastLogin = u.lastLoginAt || u.lastLogin || 0;
      return now - new Date(lastLogin).getTime() >= activeThreshold;
    });

    // Calculate growth over last week
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const newThisWeek = users.filter((u: any) => {
      const created = u.createdAt || u.created_at || 0;
      return new Date(created).getTime() > weekAgo;
    }).length;
    const totalBeforeWeek = Math.max(1, users.length - newThisWeek);
    const growth = ((newThisWeek / totalBeforeWeek) * 100);

    return {
      total: users.length,
      active: active.length,
      inactive: inactive.length,
      activeRate: users.length > 0 ? Math.round((active.length / users.length) * 100) : null,
      active7d: this.getActiveUsers(7),
      active30d: this.getActiveUsers(30),
      lastWeekGrowth: users.length > 0 ? Math.round(growth * 10) / 10 : null,
      newToday: newThisWeek,
      currentPlan: authState.user?.plan || null,
      userLevel: null,
    };
  }

  // ── Personal User Data ────────────────────────────────────────────────

  getUserPersonalData(userId?: string): any | null {
    const all = this.getAllData();
    const user = all.auth?.user;
    if (!user) return null;
    const targetUserId = userId || user.id;
    const trading = all.trading || {};
    const academy = all.academy || {};
    const balanceData = all.balance?.balance || {};

    const history = Array.isArray(trading.history) ? trading.history : [];
    const positions = Array.isArray(trading.positions) ? trading.positions : [];
    const closedTrades = history.filter((h: any) => h?.action === 'close');
    const wins = closedTrades.filter((t: any) => t.pnl > 0).length;

    const completedLessons = academy.completedLessons
      ? (Array.isArray(academy.completedLessons) ? academy.completedLessons : [...academy.completedLessons])
      : [];

    return {
      userId,
      name: user.displayName,
      email: user.email,
      plan: user.plan,
      level: academy.level,
      totalXP: academy.totalXP,
      completedLessons,
      totalLessons: academy.totalLessons,
      balance: balanceData.cpBalance,
      positions: positions.length,
      winRate: closedTrades.length > 0 ? Math.round((wins / closedTrades.length) * 100) : null,
      totalTrades: history.length,
      openPositions: positions.map((p: any) => ({ symbol: p.symbol, side: p.side, entryPrice: p.entryPrice })),
      bots: Object.values(all.bots?.bots || {}).filter((b: any) => b.userId === userId),
      inventory: all.cp?.getHistory?.(userId) || [],
      rewards: all.academy?.xpHistory || [],
      marketplaceAssets: (all.marketplace?.getAllBots?.() || []).filter((b: any) => b.authorId === userId || b.starredBy?.includes(userId)),
      simulator: { balance: all.balance?.balance?.simBalance, positions, history },
      copyTrading: Object.values(all.copyTrading?.relationships || {}).filter((r: any) => r.followerId === userId),
    };
  }

  // ── Summarized App Data ───────────────────────────────────────────────

  getAppData(): AppData {
    const all = this.getAllData();
    const history = Array.isArray(all.trading.history) ? all.trading.history : [];
    const positions = Array.isArray(all.trading.positions) ? all.trading.positions : [];
    const closed = history.filter((h: any) => h?.action === 'close');
    const wins = closed.filter((t: any) => t.pnl > 0).length;

    return {
      users: {
        total: all.auth?.users?.length || 0,
        active7d: this.getActiveUsers(7),
        active30d: this.getActiveUsers(30),
        plans: this.getPlanBreakdown(),
      },
      trading: {
        totalTrades: history.length,
        openPositions: positions.length,
        volume24h: positions.reduce((s: number, p: any) => s + (p.costBasis || 0), 0),
        avgWinRate: closed.length > 0 ? (wins / closed.length) * 100 : 0,
      },
      academy: {
        totalLessons: all.academy.totalLessons ?? 0,
        completedLessons: all.academy.completedLessons?.size ?? 0,
        avgLevel: all.academy.level ?? 0,
        totalXP: all.academy.totalXP ?? 0,
      },
      cp: {
        balance: all.balance.balance?.cpBalance ?? 0,
        price: all.cp?.price ?? 0,
        circulatingSupply: all.cp?.circulatingSupply ?? 0,
      },
      payments: this.getPaymentStats(),
    };
  }

  // ── External APIs ─────────────────────────────────────────────────────

  async getMarketData(): Promise<MarketData> {
    const now = Date.now();
    if (this.coinGeckoCache.data && (now - this.coinGeckoCache.ts) < this.CACHE_TTL) {
      return { ...this.coinGeckoCache.data, source: 'cached' };
    }
    try {
      const resp = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true');
      if (!resp.ok) throw new Error('CoinGecko request failed');
      const data = await resp.json();
      const prices = { BTC: data.bitcoin?.usd, ETH: data.ethereum?.usd, SOL: data.solana?.usd };
      const presentPrices = Object.fromEntries(Object.entries(prices).filter(([, value]) => typeof value === 'number')) as Record<string, number>;
      if (Object.keys(presentPrices).length === 0) throw new Error('CoinGecko returned no prices');
      const md: MarketData = {
        prices: presentPrices,
        globalMarketCap: null,
        btcDominance: null,
        fearGreedIndex: null,
        source: 'live',
        fetchedAt: now,
      };
      this.coinGeckoCache = { data: md, ts: now };
      return md;
    } catch {
      return this.coinGeckoCache.data
        ? { ...this.coinGeckoCache.data, source: 'cached' }
        : { prices: {}, globalMarketCap: null, btcDominance: null, fearGreedIndex: null, source: 'unavailable', fetchedAt: null };
    }
  }

  async checkCoinGecko(): Promise<{ status: 'healthy' | 'degraded' | 'down'; latency: number }> {
    const start = Date.now();
    try {
      const resp = await fetch('https://api.coingecko.com/api/v3/ping');
      return { status: resp.ok ? 'healthy' : 'degraded', latency: Date.now() - start };
    } catch { return { status: 'down', latency: Date.now() - start }; }
  }

  async checkDeepSeek(): Promise<{ status: 'healthy' | 'degraded' | 'down'; latency: number }> {
    const start = Date.now();
    try {
      await deepSeekChat([{ role: 'user', content: 'ping' }]);
      return { status: 'healthy', latency: Date.now() - start };
    } catch { return { status: 'down', latency: Date.now() - start }; }
  }

  async analyzeWithAI(prompt: string): Promise<string> {
    try {
      const msgs: DSMessage[] = [
        { role: 'system', content: 'You are Lynx AI, the admin intelligence system for CryptoVerse HQ. Provide concise, data-driven analysis.' },
        { role: 'user', content: prompt },
      ];
      const response = await deepSeekChat(msgs);
      return response?.content || 'Unable to generate analysis.';
    } catch { return 'AI analysis unavailable. Using offline data.'; }
  }
}

export const realDataConnector = new RealDataConnector();
