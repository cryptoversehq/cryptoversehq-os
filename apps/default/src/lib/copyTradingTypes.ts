/**
 * copyTradingTypes.ts
 * All types for the Copy Trading feature.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Trader (the person being copied)
// ─────────────────────────────────────────────────────────────────────────────

export interface TopTrader {
  id: string;
  displayName: string;
  avatarSeed: string;
  userId: string;                 // links to UserProfile
  rank: number;
  badge: 'gold' | 'silver' | 'bronze' | 'none';
  joinedAt: string;               // ISO-8601
  winRate: number;                // 0-100
  totalProfitPct: number;         // lifetime profit %
  avgTradeSizeUsd: number;
  maxDrawdownPct: number;         // positive number e.g. 8.5 means -8.5%
  sharpeRatio: number;
  totalTrades: number;
  totalFollowers: number;
  activeFollowers: number;
  copyFeePct: number;             // % of follower profit paid to trader (e.g. 5)
  totalEarningsCP: number;        // CP earned from copy fees
  rating: number;                 // 1–5
  ratingCount: number;
  monthlyReturns: MonthlyReturn[]; // last 12 months
  equityCurve: number[];           // 30 data points
  recentTrades: TraderTrade[];
  bio: string;
  isVerified: boolean;
}

export interface MonthlyReturn {
  month: string;                  // e.g. "Jan", "Feb"
  returnPct: number;              // can be negative
}

export interface TraderTrade {
  id: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  price: number;
  amount: number;
  pnl: number | null;            // null if open
  pnlPct: number | null;
  openedAt: string;
  closedAt: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Copy Relationship (follower → trader link)
// ─────────────────────────────────────────────────────────────────────────────

export type CopyStatus = 'active' | 'paused' | 'stopped';

export interface CopySettings {
  copyPct: number;                  // 1–100 % of trader's position size to mirror
  maxPerTradeUsd: number;           // 0 = no limit
  maxDailyLossUsd: number;          // 0 = no limit
  stopLossPct: number;              // portfolio stop loss %   (0 = disabled)
  takeProfitPct: number;            // portfolio take profit % (0 = disabled)
  copyLong: boolean;
  copyShort: boolean;
  minTradeSizeUsd: number;          // skip trades smaller than this
  maxTradeSizeUsd: number;          // skip trades larger than this (0 = no limit)
  skipSameSymbol: boolean;          // skip if I already have open pos in same symbol
  notifyOnCopy: boolean;
  notifyOnDailyLossApproach: boolean;
}

export const DEFAULT_COPY_SETTINGS: CopySettings = {
  copyPct: 50,
  maxPerTradeUsd: 1_000,
  maxDailyLossUsd: 500,
  stopLossPct: 20,
  takeProfitPct: 50,
  copyLong: true,
  copyShort: true,
  minTradeSizeUsd: 100,
  maxTradeSizeUsd: 0,
  skipSameSymbol: false,
  notifyOnCopy: true,
  notifyOnDailyLossApproach: true,
};

export interface CopyRelationship {
  id: string;
  followerId: string;
  traderId: string;
  traderName: string;
  traderAvatarSeed: string;
  settings: CopySettings;
  status: CopyStatus;
  pauseReason: string | null;      // 'daily_loss_limit' | 'manual' | null
  startedAt: string;
  stoppedAt: string | null;
  totalCopiedTrades: number;
  winCopied: number;
  lossCopied: number;
  totalInvestedUsd: number;
  totalProfitUsd: number;
  totalFeesPaidCP: number;
  dailyLossAccumUsd: number;       // resets each day
  lastTradeAt: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Copy Execution (one copied trade record)
// ─────────────────────────────────────────────────────────────────────────────

export interface CopyExecution {
  id: string;
  relationshipId: string;
  followerId: string;
  traderId: string;
  traderName: string;
  originalTradeId: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  originalPriceUsd: number;
  copiedAmountUsd: number;
  pnlUsd: number | null;
  pnlPct: number | null;
  feePaidCP: number;
  executedAt: string;
  closedAt: string | null;
  status: 'open' | 'closed' | 'cancelled';
}

// ─────────────────────────────────────────────────────────────────────────────
// Follower Growth row (for chart)
// ─────────────────────────────────────────────────────────────────────────────

export interface FollowerGrowthPoint {
  date: string;        // "MMM DD"
  followers: number;
}
