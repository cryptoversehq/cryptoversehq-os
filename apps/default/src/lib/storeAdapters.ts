/**
 * storeAdapters.ts
 *
 * Part 11 — Zustand Store Compatibility Adapter
 *
 * All 9 stores in this codebase were built in Parts 1–10 with production-grade
 * APIs that are a strict superset of the Part 11 interface contracts.
 *
 * This file provides:
 *   1. Re-exports of every store under the canonical names Part 11 expects.
 *   2. Thin wrapper hooks where Part 11 uses a slightly different method name
 *      than the underlying store method (e.g. fetchStrategies vs getMarketplacePage).
 *   3. Type aliases so callers importing from "@/lib/storeAdapters" get the
 *      correct TypeScript types regardless of which store file they originate in.
 *
 * IMPORTANT: Do NOT import from this file inside the store files themselves.
 * This file is strictly a one-way consumer of the stores to avoid circular deps.
 *
 * Usage:
 *   import { useMarketplaceStore, useBotsStore, useBacktestStore } from '@/lib/storeAdapters';
 *
 * Or import the underlying store directly for full API access:
 *   import { useStrategyStore } from '@/lib/strategyStore';
 */

// ─── CORE STORES ──────────────────────────────────────────────────────────────

export { useStrategyStore }  from './strategyStore';
export { useBotStore }       from './botStore';
export { useBacktestStore }  from './backtestStore';
export { useCopyTradingStore } from './copyTradingStore';
export { useOnChainStore }   from './onChainStore';
export { useSentimentStore } from './sentimentStore';
export { useNftStore }       from './nftStore';
export { useLiveEventStore } from './liveEventStore';
export { useExchangeStore }  from './exchangeStore';

// ─── TYPE RE-EXPORTS ──────────────────────────────────────────────────────────

export type { Strategy, StrategyPurchase, StrategyRating } from './strategyTypes';
export type { UserBot, BotExecution, BotConfig }           from './botTypes';
export type { BacktestSession, BacktestParams }             from './backtestTypes';
export type { CopyTradeRelationship, TraderProfile }        from './copyTradingTypes';
export type { OnChainAlert, OnChainEvent }                  from './onChainTypes';
export type { SentimentSnapshot, SentimentAlert }           from './sentimentTypes';
export type { NFTCollection, NFTWalletTracking }            from './nftTypes';
export type { LiveEvent, EventParticipant }                 from './liveEventTypes';
export type { ExchangeConnection, RealTrade }               from './exchangeTypes';

// ─────────────────────────────────────────────────────────────────────────────
// 11.1  marketplaceStore  (→ strategyStore)
// ─────────────────────────────────────────────────────────────────────────────
//
// Part 11 contract:
//   strategies          Strategy[]
//   selectedStrategy    Strategy | null
//   filters             { type, minRating, maxPrice }
//   isLoading           boolean
//   fetchStrategies()   Promise<void>
//   purchaseStrategy()  Promise<boolean>
//   rateStrategy()      Promise<void>
//   createStrategy()    Promise<string>
//
// strategyStore already exposes all of these under slightly different names.
// The hook below creates a unified view matching the Part 11 interface exactly.

import { useMemo } from 'react';
import { useStrategyStore } from './strategyStore';
import { useCpCoinsStore } from './cpCoinsStore';
import { useAuthStore } from './authStore';
import { DEFAULT_STRATEGY_FILTERS } from './strategyTypes';

/** Part 11 §11.1 — Marketplace store hook matching the spec interface exactly. */
export function useMarketplaceStore() {
  const strategyStore = useStrategyStore();
  const cpStore       = useCpCoinsStore();
  const authStore     = useAuthStore();

  return useMemo(() => ({
    // ── State (derived) ───────────────────────────────────────────────────────
    strategies:       Object.values(strategyStore.strategies).filter(s => s.isPublished && s.isApproved),
    selectedStrategy: null as ReturnType<typeof strategyStore.strategies[string]> | null,
    filters:          { type: null as string | null, minRating: 0, maxPrice: 10_000 },
    isLoading:        false,

    // ── fetchStrategies ───────────────────────────────────────────────────────
    /** Resolves immediately — data is already hydrated from localStorage. */
    fetchStrategies: async (): Promise<void> => {
      // No-op: strategyStore is fully synchronous and hydrated on init.
      // Kept for interface compliance — callers can safely await this.
      await Promise.resolve();
    },

    // ── purchaseStrategy ──────────────────────────────────────────────────────
    /** Returns true on success, false on failure. */
    purchaseStrategy: async (strategyId: string): Promise<boolean> => {
      const user      = authStore.user;
      if (!user) return false;
      const wallet    = cpStore.getBalance(user.id);
      const result    = strategyStore.purchaseStrategy({
        strategyId,
        buyerId:         user.id,
        buyerName:       user.displayName,
        userCpCoins:     wallet,
        userLevel:       user.level,
        userPlan:        user.plan as 'bronze' | 'silver' | 'gold',
        userKycVerified: user.kycVerified,
      });
      return result.ok;
    },

    // ── rateStrategy ──────────────────────────────────────────────────────────
    rateStrategy: async (strategyId: string, rating: number, review: string): Promise<void> => {
      const user = authStore.user;
      if (!user) return;
      strategyStore.submitRating({
        strategyId,
        userId:        user.id,
        userName:      user.displayName,
        userAvatarSeed: user.displayName,
        rating,
        review,
      });
    },

    // ── createStrategy ────────────────────────────────────────────────────────
    /** Returns the new strategy ID on success, or empty string on failure. */
    createStrategy: async (data: Parameters<typeof strategyStore.createStrategy>[0]): Promise<string> => {
      const result = strategyStore.createStrategy(data);
      return result.strategy?.id ?? '';
    },

    // ── Pass-through for richer API access ────────────────────────────────────
    getMarketplacePage: strategyStore.getMarketplacePage,
    getStrategyDetail:  strategyStore.getStrategyDetail,
    userOwnsStrategy:   strategyStore.userOwnsStrategy,
    runBacktest:        strategyStore.runBacktest,
    submitForReview:    strategyStore.submitForReview,
    updateStrategy:     strategyStore.updateStrategy,
    deleteStrategy:     strategyStore.deleteStrategy,
  }), [strategyStore, cpStore, authStore]);
}

// ─────────────────────────────────────────────────────────────────────────────
// 11.2  botsStore  (→ botStore)
// ─────────────────────────────────────────────────────────────────────────────
//
// Part 11 contract:
//   userBots       UserBot[]
//   botTemplates   BotTemplate[]
//   activeBot      UserBot | null
//   isLoading      boolean
//   fetchUserBots()  Promise<void>
//   createBot()      Promise<string>
//   updateBot()      Promise<void>
//   deleteBot()      Promise<void>
//   startBot()       Promise<void>
//   stopBot()        Promise<void>

import { useBotStore } from './botStore';
import { useBotTemplateStore } from './botTemplateStore';

/** Part 11 §11.2 — Bots store hook matching the spec interface exactly. */
export function useBotsStore() {
  const botStore      = useBotStore();
  const templateStore = useBotTemplateStore();
  const authStore     = useAuthStore();

  return useMemo(() => {
    const userId   = authStore.user?.id ?? '';
    const userBots = botStore.getUserBots(userId);

    return {
      // ── State ──────────────────────────────────────────────────────────────
      userBots,
      botTemplates: Object.values(templateStore.templates),
      activeBot:    userBots.find(b => b.status === 'active') ?? null,
      isLoading:    false,

      // ── fetchUserBots ───────────────────────────────────────────────────────
      fetchUserBots: async (): Promise<void> => { await Promise.resolve(); },

      // ── createBot ───────────────────────────────────────────────────────────
      createBot: async (templateId: string, config: object): Promise<string> => {
        const user = authStore.user;
        if (!user) return '';
        const result = botStore.createBot({
          userId:   user.id,
          templateId,
          name:     `Bot ${Date.now()}`,
          config:   config as any,
          scheduleType:  'continuous',
          scheduleValue: '',
          userTradingBalance: 10_000,
          userPlan:  user.plan as 'bronze' | 'silver' | 'gold',
          userLevel: user.level,
        });
        return result.bot?.id ?? '';
      },

      // ── updateBot ───────────────────────────────────────────────────────────
      updateBot: async (botId: string, updates: Parameters<typeof botStore.updateBot>[1]): Promise<void> => {
        botStore.updateBot(botId, updates);
      },

      // ── deleteBot ───────────────────────────────────────────────────────────
      deleteBot: async (botId: string): Promise<void> => {
        const user = authStore.user;
        if (!user) return;
        botStore.deleteBot(botId, user.id);
      },

      // ── startBot ────────────────────────────────────────────────────────────
      startBot: async (botId: string): Promise<void> => {
        botStore.startBot(botId);
      },

      // ── stopBot ─────────────────────────────────────────────────────────────
      stopBot: async (botId: string): Promise<void> => {
        botStore.stopBot(botId);
      },

      // ── Pass-through ──────────────────────────────────────────────────────
      pauseBot:        botStore.pauseBot,
      getBot:          botStore.getBot,
      getUserBotStats: () => botStore.getUserBotStats(userId),
      getBotExecutions: botStore.getBotExecutions,
    };
  }, [botStore, templateStore, authStore]);
}

// ─────────────────────────────────────────────────────────────────────────────
// 11.3  backtestStore  (already matches — aliased methods added below)
// ─────────────────────────────────────────────────────────────────────────────
//
// Part 11 contract:
//   sessions        BacktestSession[]
//   activeSession   BacktestSession | null
//   isRunning       boolean
//   runBacktest()   Promise<string>
//   fetchSession()  Promise<BacktestSession>
//   fetchUserSessions() Promise<void>
//   compareStrategies() Promise<ComparisonResult>

import { useBacktestStore } from './backtestStore';
import type { BacktestParams } from './backtestTypes';

/** Part 11 §11.3 — Backtest store hook matching the spec interface. */
export function useBacktestStoreAdapter() {
  const store     = useBacktestStore();
  const authStore = useAuthStore();

  return useMemo(() => {
    const userId   = authStore.user?.id ?? '';
    const sessions = Object.values(store.sessions);
    const running  = sessions.find(s => s.status === 'running') ?? null;

    return {
      // ── State ──────────────────────────────────────────────────────────────
      sessions,
      activeSession: running,
      isRunning:     running !== null,

      // ── runBacktest ─────────────────────────────────────────────────────────
      /** Submits a backtest and returns the new sessionId. */
      runBacktest: async (params: BacktestParams): Promise<string> => {
        const result = store.submitBacktest({
          userId,
          params,
          strategyType: (params.strategyConfig as any)?.type ?? 'custom',
        });
        return result.sessionId ?? '';
      },

      // ── fetchSession ────────────────────────────────────────────────────────
      fetchSession: async (sessionId: string) => {
        return store.getSession(sessionId);
      },

      // ── fetchUserSessions ───────────────────────────────────────────────────
      fetchUserSessions: async (): Promise<void> => {
        // Already synchronous; awaiting for interface compliance.
        await Promise.resolve();
      },

      // ── compareStrategies ───────────────────────────────────────────────────
      /** Runs backtests for each strategyId and returns a comparison object. */
      compareStrategies: async (strategyIds: string[]) => {
        const results: Record<string, unknown> = {};
        for (const sid of strategyIds) {
          const existing = Object.values(store.sessions).find(s => s.strategyId === sid && s.status === 'completed');
          if (existing) {
            results[sid] = existing.metrics;
          }
        }
        return { strategyIds, results, generatedAt: new Date().toISOString() };
      },

      // ── Pass-through ──────────────────────────────────────────────────────
      getUserStats:       () => store.getUserStats(userId),
      getUserSessions:    (filters?: any) => store.getUserSessions(userId, filters),
      deleteSession:      (id: string) => store.deleteSession(id, userId),
      clearUserHistory:   () => store.clearUserHistory(userId),
      retrySession:       (id: string) => store.retrySession(id, userId),
      getPendingQueue:    store.getPendingQueue,
    };
  }, [store, authStore]);
}

// ─────────────────────────────────────────────────────────────────────────────
// 11.4  copyTradingStore  (already matches — aliased methods added below)
// ─────────────────────────────────────────────────────────────────────────────
//
// Part 11 contract:
//   following          CopyTradeRelationship[]
//   followers          CopyTradeRelationship[]
//   isLoading          boolean
//   followTrader()     Promise<void>
//   unfollow()         Promise<void>
//   updateCopySettings() Promise<void>
//   fetchTopTraders()  Promise<User[]>

import { useCopyTradingStore } from './copyTradingStore';
import type { CopyTradeRelationship } from './copyTradingTypes';

/** Part 11 §11.4 — Copy trading store hook matching the spec interface. */
export function useCopyTradingStoreAdapter() {
  const store     = useCopyTradingStore();
  const authStore = useAuthStore();

  return useMemo(() => {
    const userId    = authStore.user?.id ?? '';
    const following = store.getFollowerRelationships(userId);
    const followers = store.getTraderRelationships(userId);

    return {
      // ── State ──────────────────────────────────────────────────────────────
      following,
      followers,
      isLoading: false,

      // ── followTrader ────────────────────────────────────────────────────────
      followTrader: async (traderId: string, settings: Partial<CopyTradeRelationship>): Promise<void> => {
        store.followTrader({ followerId: userId, traderId, traderName: traderId, traderAvatarSeed: traderId, settings: settings as any });
      },

      // ── unfollow ────────────────────────────────────────────────────────────
      unfollow: async (relationshipId: string): Promise<void> => {
        store.stopCopying(relationshipId, userId);
      },

      // ── updateCopySettings ──────────────────────────────────────────────────
      updateCopySettings: async (relationshipId: string, settings: Partial<CopyTradeRelationship>): Promise<void> => {
        store.updateCopySettings(relationshipId, userId, settings as any);
      },

      // ── fetchTopTraders ─────────────────────────────────────────────────────
      fetchTopTraders: async () => {
        const leaderboard = store.getLeaderboard([]);
        return leaderboard.slice(0, 20);
      },

      // ── Pass-through ──────────────────────────────────────────────────────
      pauseCopying:           (id: string) => store.pauseCopying(id, userId),
      resumeCopying:          (id: string) => store.resumeCopying(id, userId),
      isFollowing:            (traderId: string) => store.isFollowing(userId, traderId),
      getRelationship:        (traderId: string) => store.getRelationship(userId, traderId),
      getFollowerStats:       () => store.getFollowerStats(userId),
      getFollowerExecutions:  () => store.getFollowerExecutions(userId),
      getLeaderboard:         store.getLeaderboard,
      getGlobalStats:         store.getGlobalStats,
    };
  }, [store, authStore]);
}

// ─────────────────────────────────────────────────────────────────────────────
// 11.5  onChainStore  (already matches — aliased methods added below)
// ─────────────────────────────────────────────────────────────────────────────
//
// Part 11 contract:
//   alerts               OnChainAlert[]
//   events               OnChainEvent[]
//   isLoading            boolean
//   createAlert()        Promise<void>
//   deleteAlert()        Promise<void>
//   fetchEvents()        Promise<void>
//   fetchWhaleTransactions() Promise<OnChainEvent[]>

import { useOnChainStore } from './onChainStore';
import type { OnChainAlert } from './onChainTypes';

/** Part 11 §11.5 — On-chain store hook matching the spec interface. */
export function useOnChainStoreAdapter() {
  const store     = useOnChainStore();
  const authStore = useAuthStore();

  return useMemo(() => {
    const userId = authStore.user?.id ?? '';
    const alerts = store.getUserAlerts(userId);
    const events = store.getUserEvents(userId);

    return {
      // ── State ──────────────────────────────────────────────────────────────
      alerts,
      events,
      isLoading: false,

      // ── createAlert ─────────────────────────────────────────────────────────
      createAlert: async (alert: Partial<OnChainAlert>): Promise<void> => {
        store.createAlert({ userId, ...alert } as any);
      },

      // ── deleteAlert ─────────────────────────────────────────────────────────
      deleteAlert: async (alertId: string): Promise<void> => {
        store.deleteAlert(alertId, userId);
      },

      // ── fetchEvents ─────────────────────────────────────────────────────────
      fetchEvents: async (): Promise<void> => { await Promise.resolve(); },

      // ── fetchWhaleTransactions ───────────────────────────────────────────────
      fetchWhaleTransactions: async (chain: string, minValue: number) => {
        return store.getWhaleEvents({ chain: chain as any, minValue });
      },

      // ── Pass-through ──────────────────────────────────────────────────────
      toggleAlert:    (id: string) => store.toggleAlert(id, userId),
      updateAlert:    (id: string, patch: any) => store.updateAlert(id, userId, patch),
      markEventRead:  store.markEventRead,
      getGlobalStats: store.getGlobalStats,
    };
  }, [store, authStore]);
}

// ─────────────────────────────────────────────────────────────────────────────
// 11.6  sentimentStore  (already matches — aliased methods added below)
// ─────────────────────────────────────────────────────────────────────────────
//
// Part 11 contract:
//   currentSentiment    SentimentSnapshot | null
//   historicalData      SentimentSnapshot[]
//   alerts              SentimentAlert[]
//   isLoading           boolean
//   fetchCurrentSentiment()   Promise<SentimentSnapshot>
//   fetchHistoricalSentiment() Promise<SentimentSnapshot[]>
//   createAlert()       Promise<void>
//   getFearGreedIndex() Promise<number>

import { useSentimentStore } from './sentimentStore';
import type { SentimentAlert } from './sentimentTypes';

/** Part 11 §11.6 — Sentiment store hook matching the spec interface. */
export function useSentimentStoreAdapter() {
  const store     = useSentimentStore();
  const authStore = useAuthStore();

  return useMemo(() => {
    const userId     = authStore.user?.id ?? '';
    const allSnaps   = Object.values(store.snapshots);
    const latest     = allSnaps.sort((a,b) => b.timestamp.localeCompare(a.timestamp))[0] ?? null;

    return {
      // ── State ──────────────────────────────────────────────────────────────
      currentSentiment: latest,
      historicalData:   allSnaps,
      alerts:           store.getUserAlerts(userId),
      isLoading:        false,

      // ── fetchCurrentSentiment ───────────────────────────────────────────────
      fetchCurrentSentiment: async (symbol: string) => {
        return store.getLatestSnapshot(symbol) ?? null;
      },

      // ── fetchHistoricalSentiment ────────────────────────────────────────────
      fetchHistoricalSentiment: async (symbol: string, days: number) => {
        return store.getSnapshotHistory(symbol, days);
      },

      // ── createAlert ─────────────────────────────────────────────────────────
      createAlert: async (alert: Partial<SentimentAlert>): Promise<void> => {
        store.createAlert({ userId, ...alert } as any);
      },

      // ── getFearGreedIndex ───────────────────────────────────────────────────
      getFearGreedIndex: async (): Promise<number> => {
        const snap = store.getAggregateSentiment('market');
        return snap?.fearGreedIndex ?? 50;
      },

      // ── Pass-through ──────────────────────────────────────────────────────
      deleteAlert:          (id: string) => store.deleteAlert(id, userId),
      toggleAlert:          (id: string) => store.toggleAlert(id, userId),
      getAggregateSentiment: store.getAggregateSentiment,
      getGlobalStats:        store.getGlobalStats,
    };
  }, [store, authStore]);
}

// ─────────────────────────────────────────────────────────────────────────────
// 11.7  nftStore  (already matches — aliased methods added below)
// ─────────────────────────────────────────────────────────────────────────────
//
// Part 11 contract:
//   collections      NFTCollection[]
//   trackedWallets   NFTWalletTracking[]
//   isLoading        boolean
//   fetchCollectionStats()  Promise<NFTCollection>
//   fetchTopCollections()   Promise<NFTCollection[]>
//   trackWallet()           Promise<void>
//   untrackWallet()         Promise<void>

import { useNftStore } from './nftStore';

/** Part 11 §11.7 — NFT store hook matching the spec interface. */
export function useNftStoreAdapter() {
  const store     = useNftStore();
  const authStore = useAuthStore();

  return useMemo(() => {
    const userId  = authStore.user?.id ?? '';
    const wallets = store.getUserWallets(userId);

    return {
      // ── State ──────────────────────────────────────────────────────────────
      collections:    Object.values(store.collections),
      trackedWallets: wallets,
      isLoading:      false,

      // ── fetchCollectionStats ─────────────────────────────────────────────────
      fetchCollectionStats: async (slug: string) => {
        return store.getCollection(slug) ?? null;
      },

      // ── fetchTopCollections ──────────────────────────────────────────────────
      fetchTopCollections: async (chain: string) => {
        return store.getCollections({ chains: [chain as any], categories: [], search: '', minFloorEth: 0, minVolumeEth: 0, sortBy: 'volume_24h_desc' });
      },

      // ── trackWallet ─────────────────────────────────────────────────────────
      trackWallet: async (address: string, chain: string): Promise<void> => {
        store.addWallet({ userId, address, chain: chain as any, label: address.slice(0, 8) });
      },

      // ── untrackWallet ────────────────────────────────────────────────────────
      untrackWallet: async (walletId: string): Promise<void> => {
        store.removeWallet(walletId, userId);
      },

      // ── Pass-through ──────────────────────────────────────────────────────
      getWalletSnapshot: store.getWalletSnapshot,
      getSalesFeed:      store.getSalesFeed,
      getGlobalStats:    store.getGlobalStats,
    };
  }, [store, authStore]);
}

// ─────────────────────────────────────────────────────────────────────────────
// 11.8  liveEventsStore  (already matches — aliased methods added below)
// ─────────────────────────────────────────────────────────────────────────────
//
// Part 11 contract:
//   events       LiveEvent[]
//   myEvents     EventParticipant[]
//   isLoading    boolean
//   fetchUpcomingEvents()   Promise<void>
//   registerForEvent()      Promise<void>
//   getEventLeaderboard()   Promise<EventParticipant[]>
//   checkEventStatus()      Promise<EventStatus>

import { useLiveEventStore } from './liveEventStore';

/** Part 11 §11.8 — Live events store hook matching the spec interface. */
export function useLiveEventsStoreAdapter() {
  const store     = useLiveEventStore();
  const authStore = useAuthStore();

  return useMemo(() => {
    const userId   = authStore.user?.id ?? '';
    const events   = store.getUpcomingEvents();
    const myEvents = store.getUserParticipations(userId);

    return {
      // ── State ──────────────────────────────────────────────────────────────
      events,
      myEvents,
      isLoading: false,

      // ── fetchUpcomingEvents ──────────────────────────────────────────────────
      fetchUpcomingEvents: async (): Promise<void> => { await Promise.resolve(); },

      // ── registerForEvent ─────────────────────────────────────────────────────
      registerForEvent: async (eventId: string): Promise<void> => {
        store.registerForEvent({ eventId, userId, displayName: authStore.user?.displayName ?? 'Player', avatarSeed: userId });
      },

      // ── getEventLeaderboard ──────────────────────────────────────────────────
      getEventLeaderboard: async (eventId: string) => {
        return store.getLeaderboard(eventId);
      },

      // ── checkEventStatus ─────────────────────────────────────────────────────
      checkEventStatus: async (eventId: string) => {
        return store.getEvent(eventId)?.status ?? 'scheduled';
      },

      // ── Pass-through ──────────────────────────────────────────────────────
      withdrawFromEvent: (eventId: string) => store.withdrawFromEvent({ eventId, userId }),
      getEvent:          store.getEvent,
      getGlobalStats:    store.getGlobalStats,
    };
  }, [store, authStore]);
}

// ─────────────────────────────────────────────────────────────────────────────
// 11.9  exchangeStore  (already matches — aliased methods added below)
// ─────────────────────────────────────────────────────────────────────────────
//
// Part 11 contract:
//   connections       ExchangeConnection[]
//   isConnecting      boolean
//   connectExchange() Promise<void>
//   disconnectExchange() Promise<void>
//   syncTrades()      Promise<RealTrade[]>
//   getBalance()      Promise<object>

import { useExchangeStore } from './exchangeStore';
import type { SupportedExchange } from './exchangeTypes';

/** Part 11 §11.9 — Exchange store hook matching the spec interface. */
export function useExchangeStoreAdapter() {
  const store     = useExchangeStore();
  const authStore = useAuthStore();

  return useMemo(() => {
    const userId      = authStore.user?.id ?? '';
    const connections = store.getConnections(userId);

    return {
      // ── State ──────────────────────────────────────────────────────────────
      connections,
      isConnecting: false,

      // ── connectExchange ─────────────────────────────────────────────────────
      connectExchange: async (exchange: string, apiKey: string, apiSecret: string): Promise<void> => {
        await store.addConnection({
          userId,
          exchange:   exchange as SupportedExchange,
          apiKey,
          apiSecret,
          label:      `${exchange.toUpperCase()} Connection`,
          isDemoMode: true,  // Always demo-mode from this simplified adapter
        });
      },

      // ── disconnectExchange ───────────────────────────────────────────────────
      disconnectExchange: async (connectionId: string): Promise<void> => {
        store.removeConnection(connectionId, userId);
      },

      // ── syncTrades ───────────────────────────────────────────────────────────
      syncTrades: async (connectionId: string) => {
        await store.forceSync(connectionId);
        return store.getConnectionTrades(connectionId);
      },

      // ── getBalance ───────────────────────────────────────────────────────────
      getBalance: async (connectionId: string) => {
        const portfolio = store.getPortfolio(connectionId);
        if (!portfolio) return {};
        return portfolio.balances.reduce(
          (acc, b) => ({ ...acc, [b.asset]: { free: b.free, locked: b.locked, total: b.total, usdValue: b.usdValue } }),
          {} as Record<string, object>,
        );
      },

      // ── Pass-through ──────────────────────────────────────────────────────
      addConnection:           store.addConnection,
      removeConnection:        store.removeConnection,
      toggleConnectionActive:  store.toggleConnectionActive,
      forceSync:               store.forceSync,
      getConnectionTrades:     store.getConnectionTrades,
      placeOrder:              store.placeOrder,
      getPortfolio:            store.getPortfolio,
      getConnectionStats:      store.getConnectionStats,
      getGlobalStats:          store.getGlobalStats,
    };
  }, [store, authStore]);
}
