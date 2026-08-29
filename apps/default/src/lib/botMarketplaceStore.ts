/**
 * botMarketplaceStore.ts — Spec 6.2: Bot Strategy Marketplace
 *
 * Handles publishing bots, auto-updating their performance,
 * and copying them (with attribution).
 */

import { create } from 'zustand';
import { cloudRecordStore } from './cloudData';
import type { UserBot, BotConfig, BotType } from './botTypes';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface MarketplaceBot {
  id:              string;
  authorId:        string;
  authorName:      string;
  originalBotId:   string;
  name:            string;
  description:     string;
  botType:         BotType;
  config:          BotConfig;
  publishedAt:     number;
  /** Live-updated by the store whenever the source bot runs */
  metrics: {
    totalReturn:    number;   // %
    winRate:        number;   // %
    totalTrades:    number;
    sharpeRatio:    number;
    maxDrawdown:    number;
    avgMonthlyPct:  number;
  };
  copies:          number;   // how many users copied this bot
  stars:           number;   // up-votes / stars
  starredBy:       string[]; // userId[]
  tags:            string[];
  verified:        boolean;  // earned from enough backtest runs
}

interface BotMarketplaceState {
  bots:          Record<string, MarketplaceBot>;

  // Publish a live user bot to the marketplace
  publishBot: (
    bot:         UserBot,
    authorName:  string,
    description: string,
    tags?:       string[],
    verified?:   boolean,
  ) => { ok: boolean; id?: string; error?: string };

  // Refresh metrics for a published bot from its live source
  refreshMetrics: (
    marketBotId: string,
    bot:         UserBot,
  ) => void;

  // Copy / fork a marketplace bot — returns the new bot config for createBot()
  copyBot: (
    marketBotId: string,
    userId:       string,
  ) => { ok: boolean; config?: BotConfig; name?: string; error?: string };

  // Toggle star on a marketplace bot
  toggleStar: (marketBotId: string, userId: string) => void;

  // Getters
  getAllBots:     ()           => MarketplaceBot[];
  getBotsByType: (type: BotType) => MarketplaceBot[];
  getTopBots:    (n?: number) => MarketplaceBot[];
}

// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENCE
// ─────────────────────────────────────────────────────────────────────────────

const KEY = 'cv_bot_marketplace_v1';

function load(): Record<string, MarketplaceBot> {
  return cloudRecordStore.get<Record<string, MarketplaceBot>>('bot_marketplace', KEY, {});
}
function save(bots: Record<string, MarketplaceBot>) {
  cloudRecordStore.set('bot_marketplace', KEY, bots);
}

// ─────────────────────────────────────────────────────────────────────────────
// SEED DATA — some featured bots so the marketplace isn't empty
// ─────────────────────────────────────────────────────────────────────────────

function seedMarketplace(): Record<string, MarketplaceBot> {
  const now = Date.now();
  return {
    'mkt-001': {
      id: 'mkt-001', authorId: 'system', authorName: 'CryptoVerse HQ',
      originalBotId: 'system', name: '⚡ BTC Grid Pro',
      description: 'Tight BTC grid optimized for sideways markets. 10 levels, auto-rebalancing, low drawdown.',
      botType: 'grid',
      config: {
        type: 'grid', coinId: 'bitcoin', coinSymbol: 'BTC',
        lowerPrice: 55000, upperPrice: 75000, gridCount: 10,
        totalInvestment: 2000, stopLossPrice: 50000, takeProfitPrice: 80000,
        checkInterval: '1h',
      } as any,
      publishedAt: now - 30 * 86400_000,
      metrics: { totalReturn: 18.4, winRate: 71.2, totalTrades: 342, sharpeRatio: 1.42, maxDrawdown: 4.8, avgMonthlyPct: 3.1 },
      copies: 214, stars: 87, starredBy: [], tags: ['BTC', 'Grid', 'Low Risk'], verified: true,
    },
    'mkt-002': {
      id: 'mkt-002', authorId: 'system', authorName: 'CryptoVerse HQ',
      originalBotId: 'system', name: '📈 ETH DCA Master',
      description: 'Dollar-cost averaging into ETH on every 5% dip. Best for long-term accumulation.',
      botType: 'dca',
      config: {
        type: 'dca', coinId: 'ethereum', coinSymbol: 'ETH',
        initialInvestment: 500, numberOfOrders: 5,
        priceDropPct: 5, takeProfitPct: 10, partialExit: false,
        checkInterval: '4h',
      } as any,
      publishedAt: now - 45 * 86400_000,
      metrics: { totalReturn: 31.7, winRate: 78.5, totalTrades: 112, sharpeRatio: 1.81, maxDrawdown: 9.3, avgMonthlyPct: 4.8 },
      copies: 378, stars: 142, starredBy: [], tags: ['ETH', 'DCA', 'Accumulation'], verified: true,
    },
    'mkt-003': {
      id: 'mkt-003', authorId: 'system', authorName: 'CryptoVerse HQ',
      originalBotId: 'system', name: '🎲 SOL Martingale X2',
      description: 'Aggressive SOL martingale with 2× multiplier. High risk, high reward for trend markets.',
      botType: 'martingale',
      config: {
        type: 'martingale', coinId: 'solana', coinSymbol: 'SOL',
        baseAmount: 200, multiplier: 2, maxConsecutiveLosses: 4,
        takeProfitPct: 4, direction: 'long', checkInterval: '15m',
      } as any,
      publishedAt: now - 20 * 86400_000,
      metrics: { totalReturn: 44.2, winRate: 61.4, totalTrades: 289, sharpeRatio: 0.94, maxDrawdown: 22.1, avgMonthlyPct: 7.3 },
      copies: 95, stars: 38, starredBy: [], tags: ['SOL', 'Martingale', 'High Risk'], verified: false,
    },
    'mkt-004': {
      id: 'mkt-004', authorId: 'system', authorName: 'CryptoVerse HQ',
      originalBotId: 'system', name: '⚖️ Crypto Rebalancer',
      description: 'Auto-rebalances BTC/ETH/SOL/BNB portfolio every 24h when drift exceeds 5%.',
      botType: 'rebalancing',
      config: {
        type: 'rebalancing', totalPortfolioUsd: 10000,
        assets: [
          { coinId: 'bitcoin',  coinSymbol: 'BTC', targetPct: 40, coinColor: '#F7931A' },
          { coinId: 'ethereum', coinSymbol: 'ETH', targetPct: 30, coinColor: '#627EEA' },
          { coinId: 'solana',   coinSymbol: 'SOL', targetPct: 20, coinColor: '#9945FF' },
          { coinId: 'binancecoin', coinSymbol: 'BNB', targetPct: 10, coinColor: '#F3BA2F' },
        ],
        allocations: [],
        rebalanceThresholdPct: 5, rebalanceIntervalHours: 24,
        driftThresholdPct: 5, minTradeSizeUsd: 50, checkInterval: '1d',
      } as any,
      publishedAt: now - 60 * 86400_000,
      metrics: { totalReturn: 22.9, winRate: 68.0, totalTrades: 58, sharpeRatio: 1.65, maxDrawdown: 6.7, avgMonthlyPct: 2.9 },
      copies: 167, stars: 61, starredBy: [], tags: ['Portfolio', 'Rebalancing', 'Multi-Coin'], verified: true,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// STORE
// ─────────────────────────────────────────────────────────────────────────────

export const useBotMarketplaceStore = create<BotMarketplaceState>((set, get) => {
  const stored = load();
  const initial = Object.keys(stored).length > 0 ? stored : seedMarketplace();

  return {
    bots: initial,

    publishBot(bot, authorName, description, tags = [], verified = false) {
      if (!bot.id) return { ok: false, error: 'Invalid bot.' };
      const exists = Object.values(get().bots).find(m => m.originalBotId === bot.id);
      if (exists) return { ok: false, error: 'This bot is already published.' };

      const id: string = `mkt-${Date.now().toString(36)}`;
      const entry: MarketplaceBot = {
        id,
        authorId:        bot.userId,
        authorName,
        originalBotId:   bot.id,
        name:            bot.name,
        description,
        botType:         bot.templateType,
        config:          JSON.parse(JSON.stringify(bot.config)),
        publishedAt:     Date.now(),
        metrics: {
          totalReturn:   bot.totalProfitPct,
          winRate:       bot.winRate,
          totalTrades:   bot.totalTrades,
          sharpeRatio:   (bot as any).sharpeRatio ?? 0,
          maxDrawdown:   bot.maxDrawdown ?? 0,
          avgMonthlyPct: bot.totalProfitPct / Math.max(1, ((bot as any).activeDays ?? 30) / 30),
        },
        copies:    0,
        stars:     0,
        starredBy: [],
        tags,
        verified,
      };

      const updated = { ...get().bots, [id]: entry };
      save(updated);
      set({ bots: updated });
      return { ok: true, id };
    },

    refreshMetrics(marketBotId, bot) {
      const bots = get().bots;
      const entry = bots[marketBotId];
      if (!entry) return;
      const updated = {
        ...bots,
        [marketBotId]: {
          ...entry,
          metrics: {
            totalReturn:   bot.totalProfitPct,
            winRate:       bot.winRate,
            totalTrades:   bot.totalTrades,
            sharpeRatio:   (bot as any).sharpeRatio ?? 0,
            maxDrawdown:   bot.maxDrawdown ?? 0,
            avgMonthlyPct: bot.totalProfitPct / Math.max(1, ((bot as any).activeDays ?? 30) / 30),
          },
        },
      };
      save(updated);
      set({ bots: updated });
    },

    copyBot(marketBotId, userId) {
      const entry = get().bots[marketBotId];
      if (!entry) return { ok: false, error: 'Bot not found.' };

      const copiedConfig = JSON.parse(JSON.stringify(entry.config));
      const copiedName   = `${entry.name} (copy)`;

      // Increment copy count
      const updated = {
        ...get().bots,
        [marketBotId]: { ...entry, copies: entry.copies + 1 },
      };
      save(updated);
      set({ bots: updated });

      return { ok: true, config: copiedConfig, name: copiedName };
    },

    toggleStar(marketBotId, userId) {
      const entry = get().bots[marketBotId];
      if (!entry) return;
      const alreadyStarred = entry.starredBy.includes(userId);
      const starredBy = alreadyStarred
        ? entry.starredBy.filter(id => id !== userId)
        : [...entry.starredBy, userId];
      const updated = {
        ...get().bots,
        [marketBotId]: { ...entry, starredBy, stars: starredBy.length },
      };
      save(updated);
      set({ bots: updated });
    },

    getAllBots()         { return Object.values(get().bots).sort((a, b) => b.stars - a.stars); },
    getBotsByType(type) { return get().getAllBots().filter(b => b.botType === type); },
    getTopBots(n = 6)   { return get().getAllBots().slice(0, n); },
  };
});
