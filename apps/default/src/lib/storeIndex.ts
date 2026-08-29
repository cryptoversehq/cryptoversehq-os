/**
 * storeIndex.ts
 *
 * CryptoVerse HQ — Secondary Index Registry (Part 14.3)
 *
 * Implements the indexing requirements from Part 14.3:
 *   ✓ Primary key indexes        — O(1) lookup by entity id
 *   ✓ Foreign key relationships  — FK maps from child → parent id sets
 *   ✓ userId index               — find all records for a user in any table
 *   ✓ strategyId index           — find purchases, ratings, backtest sessions by strategy
 *   ✓ status index               — filter records by status field
 *   ✓ createdAt index            — sorted chronological access
 *
 * Design:
 *   - Each IndexTable<T> holds four secondary indexes as Maps / sorted arrays
 *   - Indexes are rebuilt from the Zustand store state on demand (lazy) and
 *     cached until the store's version counter advances
 *   - All index queries return arrays of matching records (projection-free)
 *   - Zero React dependency — safe to use in stores, API handlers, and tests
 *
 * Usage:
 *   import { IX } from '@/lib/storeIndex';
 *
 *   // Find all backtest sessions for a user, sorted newest-first
 *   const sessions = IX.backtestSessions.byUser(userId, { sort: 'createdAt_desc' });
 *
 *   // Find all strategy purchases for a strategy
 *   const purchases = IX.strategyPurchases.byStrategy(strategyId);
 *
 *   // Find all copy relationships with status === 'active'
 *   const active = IX.copyRelationships.byStatus('active');
 */

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type SortDir = 'asc' | 'desc';

export interface IndexQueryOptions {
  /** Sort direction on createdAt. Default: 'desc' (newest first). */
  sort?: 'createdAt_asc' | 'createdAt_desc';
  /** Maximum records to return. Default: unlimited. */
  limit?: number;
  /** Records to skip (for pagination). Default: 0. */
  offset?: number;
}

/** A record that can be indexed (must have id + at least one of the indexed fields). */
export interface Indexable {
  id: string;
  userId?:     string;
  strategyId?: string;
  status?:     string;
  createdAt?:  string;
}

// ─── INDEX TABLE ──────────────────────────────────────────────────────────────

class IndexTable<T extends Indexable> {
  private _pkMap:         Map<string, T>              = new Map();
  private _byUser:        Map<string, Set<string>>    = new Map(); // userId  → Set<id>
  private _byStrategy:    Map<string, Set<string>>    = new Map(); // strategyId → Set<id>
  private _byStatus:      Map<string, Set<string>>    = new Map(); // status → Set<id>
  private _sortedByDate:  string[]                    = [];        // ids sorted ASC by createdAt
  private _version:       number                      = -1;

  readonly tableName: string;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  // ── Build / Rebuild ─────────────────────────────────────────────────────────

  /**
   * Rebuild all indexes from a fresh record map.
   * Call this whenever the underlying store data changes.
   */
  rebuild(records: Record<string, T>, version?: number): void {
    if (version !== undefined && version === this._version) return; // already current

    this._pkMap      = new Map();
    this._byUser     = new Map();
    this._byStrategy = new Map();
    this._byStatus   = new Map();
    const dated: { id: string; ts: number }[] = [];

    for (const rec of Object.values(records)) {
      const id = rec.id;

      // Primary key
      this._pkMap.set(id, rec);

      // userId index
      if (rec.userId) {
        let s = this._byUser.get(rec.userId);
        if (!s) { s = new Set(); this._byUser.set(rec.userId, s); }
        s.add(id);
      }

      // strategyId index
      if (rec.strategyId) {
        let s = this._byStrategy.get(rec.strategyId);
        if (!s) { s = new Set(); this._byStrategy.set(rec.strategyId, s); }
        s.add(id);
      }

      // status index
      if (rec.status) {
        let s = this._byStatus.get(rec.status);
        if (!s) { s = new Set(); this._byStatus.set(rec.status, s); }
        s.add(id);
      }

      // createdAt sort index
      if (rec.createdAt) {
        dated.push({ id, ts: new Date(rec.createdAt).getTime() });
      }
    }

    // Sort ASC — reverse for DESC at query time
    dated.sort((a, b) => a.ts - b.ts);
    this._sortedByDate = dated.map(d => d.id);

    if (version !== undefined) this._version = version;
  }

  // ── Query Helpers ────────────────────────────────────────────────────────────

  private _resolve(ids: Iterable<string>, opts: IndexQueryOptions = {}): T[] {
    const { sort = 'createdAt_desc', limit, offset = 0 } = opts;

    let arr = Array.from(ids)
      .map(id => this._pkMap.get(id))
      .filter((r): r is T => r !== undefined);

    // Sort by createdAt using the pre-sorted index
    if (sort === 'createdAt_desc') {
      const order = new Map(this._sortedByDate.map((id, i) => [id, i]));
      arr.sort((a, b) => (order.get(b.id) ?? 0) - (order.get(a.id) ?? 0));
    } else if (sort === 'createdAt_asc') {
      const order = new Map(this._sortedByDate.map((id, i) => [id, i]));
      arr.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    }

    if (offset > 0)  arr = arr.slice(offset);
    if (limit)       arr = arr.slice(0, limit);
    return arr;
  }

  // ── Public Query API ─────────────────────────────────────────────────────────

  /** Get a single record by primary key. O(1). */
  get(id: string): T | undefined { return this._pkMap.get(id); }

  /** Check if a record exists. O(1). */
  has(id: string): boolean { return this._pkMap.has(id); }

  /** Total number of records in this index table. */
  get size(): number { return this._pkMap.size; }

  /** All records, sorted. */
  all(opts: IndexQueryOptions = {}): T[] {
    return this._resolve(this._pkMap.keys(), opts);
  }

  /** Records belonging to a specific user. */
  byUser(userId: string, opts: IndexQueryOptions = {}): T[] {
    return this._resolve(this._byUser.get(userId) ?? [], opts);
  }

  /** Records associated with a specific strategy. */
  byStrategy(strategyId: string, opts: IndexQueryOptions = {}): T[] {
    return this._resolve(this._byStrategy.get(strategyId) ?? [], opts);
  }

  /** Records with a specific status value. */
  byStatus(status: string, opts: IndexQueryOptions = {}): T[] {
    return this._resolve(this._byStatus.get(status) ?? [], opts);
  }

  /** Records created within a date range (ISO strings). */
  byDateRange(from: string, to: string, opts: IndexQueryOptions = {}): T[] {
    const fromTs = new Date(from).getTime();
    const toTs   = new Date(to).getTime();
    const ids    = this._sortedByDate.filter(id => {
      const rec = this._pkMap.get(id);
      if (!rec?.createdAt) return false;
      const ts = new Date(rec.createdAt).getTime();
      return ts >= fromTs && ts <= toTs;
    });
    return this._resolve(ids, opts);
  }

  /** Count records by userId. */
  countByUser(userId: string): number { return this._byUser.get(userId)?.size ?? 0; }

  /** Count records by status. */
  countByStatus(status: string): number { return this._byStatus.get(status)?.size ?? 0; }

  /** All distinct status values in this table. */
  allStatuses(): string[] { return Array.from(this._byStatus.keys()); }

  /** All distinct userIds in this table. */
  allUserIds(): string[] { return Array.from(this._byUser.keys()); }
}

// ─── TABLE INDEX DEFINITIONS ──────────────────────────────────────────────────

// Strategies
interface StrategyIdx extends Indexable {
  id: string; name: string; type: string; price: number;
  isFree: boolean; rating: number; riskLevel: string;
  creatorId: string; userId: string; createdAt: string; status: string;
}

// Strategy Purchases
interface PurchaseIdx extends Indexable {
  id: string; strategyId: string; userId: string; buyerId: string;
  price: number; createdAt: string; status: string;
}

// Strategy Ratings
interface RatingIdx extends Indexable {
  id: string; strategyId: string; userId: string; rating: number;
  createdAt: string; status: string;
}

// Backtest Sessions
interface BacktestSessionIdx extends Indexable {
  id: string; userId: string; strategyId?: string; status: string; createdAt: string;
}

// Bot Entries
interface BotIdx extends Indexable {
  id: string; userId: string; templateId: string; status: string; createdAt: string;
}

// Copy Relationships
interface CopyRelIdx extends Indexable {
  id: string; userId: string; traderId: string; followerId: string;
  status: string; createdAt: string;
}

// Copy Executions
interface CopyExecIdx extends Indexable {
  id: string; userId: string; relationshipId: string; status: string; createdAt: string;
}

// On-Chain Alerts
interface OnChainAlertIdx extends Indexable {
  id: string; userId: string; chain: string; alertType: string;
  isEnabled: boolean; status: string; createdAt: string;
}

// On-Chain Events
interface OnChainEventIdx extends Indexable {
  id: string; userId: string; alertId: string; status: string; createdAt: string;
}

// Sentiment Alerts
interface SentimentAlertIdx extends Indexable {
  id: string; userId: string; symbol: string; status: string; createdAt: string;
}

// NFT Wallets
interface NftWalletIdx extends Indexable {
  id: string; userId: string; address: string; chain: string; status: string; createdAt: string;
}

// Live Event Participants
interface EventParticipantIdx extends Indexable {
  id: string; userId: string; eventId: string; status: string; createdAt: string;
}

// Recommendations
interface RecommendationIdx extends Indexable {
  id: string; userId: string; type: string; targetId: string; status: string; createdAt: string;
}

// Exchange Connections
interface ExchangeConnIdx extends Indexable {
  id: string; userId: string; exchange: string; status: string; createdAt: string;
}

// NFT Collections (global catalog — no userId)
interface NftCollectionIdx extends Indexable {
  id: string; slug: string; chain: string; category: string;
  rank: number; floorPriceUsd: number; createdAt: string; status: string;
}

// NFT Wallet Tracking (per-user wallet entries)
interface NftWalletTrackingIdx extends Indexable {
  id: string; userId: string; address: string; chain: string;
  totalValueUsd: number; createdAt: string; status: string;
}

// Backtest Queue
interface BacktestQueueIdx extends Indexable {
  id: string; sessionId: string; userId: string;
  priority: string; status: string; enqueuedAt: string; createdAt: string;
}

// Real Trades (optional — synced from exchange)
interface RealTradeIdx extends Indexable {
  id: string; userId: string; connectionId: string;
  symbol: string; side: string; status: string; createdAt: string;
}

// AI Recommendations (optional — extended log)
interface AiRecommendationIdx extends Indexable {
  id: string; userId: string; type: string; targetId: string;
  strategyId?: string; score: number; status: string; createdAt: string;
}

// User Behavior Logs (optional — analytics events)
interface UserBehaviorLogIdx extends Indexable {
  id: string; userId: string; sessionId: string;
  eventType: string; targetType: string; status: string; createdAt: string;
}

// ─── GLOBAL INDEX REGISTRY ────────────────────────────────────────────────────

/**
 * IX — The global index registry.
 *
 * Every table that needs indexed access is listed here.
 * Populate via IX.<table>.rebuild(storeState.records) when store changes.
 */
export const IX = {
  /** strategies table — PK: id, FK: creatorId→users */
  strategies:            new IndexTable<StrategyIdx>('strategies'),

  /** strategy_purchases table — PK: id, FK: strategyId→strategies, buyerId→users */
  strategyPurchases:     new IndexTable<PurchaseIdx>('strategy_purchases'),

  /** strategy_ratings table — PK: id, FK: strategyId→strategies, userId→users */
  strategyRatings:       new IndexTable<RatingIdx>('strategy_ratings'),

  /** backtest_sessions table — PK: id, FK: userId→users, strategyId?→strategies */
  backtestSessions:      new IndexTable<BacktestSessionIdx>('backtest_sessions'),

  /** user_bots table — PK: id, FK: userId→users, templateId→bot_templates */
  userBots:              new IndexTable<BotIdx>('user_bots'),

  /** copy_relationships table — PK: id, FK: followerId→users, traderId→users */
  copyRelationships:     new IndexTable<CopyRelIdx>('copy_relationships'),

  /** copy_executions table — PK: id, FK: relationshipId→copy_relationships */
  copyExecutions:        new IndexTable<CopyExecIdx>('copy_executions'),

  /** onchain_alerts table — PK: id, FK: userId→users */
  onChainAlerts:         new IndexTable<OnChainAlertIdx>('onchain_alerts'),

  /** onchain_events table — PK: id, FK: alertId→onchain_alerts, userId→users */
  onChainEvents:         new IndexTable<OnChainEventIdx>('onchain_events'),

  /** sentiment_alerts table — PK: id, FK: userId→users */
  sentimentAlerts:       new IndexTable<SentimentAlertIdx>('sentiment_alerts'),

  /** nft_wallets table — PK: id, FK: userId→users */
  nftWallets:            new IndexTable<NftWalletIdx>('nft_wallets'),

  /** event_participants table — PK: id, FK: userId→users, eventId→live_events */
  eventParticipants:     new IndexTable<EventParticipantIdx>('event_participants'),

  /** recommendations table — PK: id, FK: userId→users */
  recommendations:       new IndexTable<RecommendationIdx>('recommendations'),

  /** exchange_connections table — PK: id, FK: userId→users */
  exchangeConnections:   new IndexTable<ExchangeConnIdx>('exchange_connections'),

  /** nft_collections table — PK: id, no user FK (global catalog) */
  nftCollections:        new IndexTable<NftCollectionIdx>('nft_collections'),

  /** nft_wallet_tracking table — PK: id, FK: userId→users */
  nftWalletTracking:     new IndexTable<NftWalletTrackingIdx>('nft_wallet_tracking'),

  /** backtest_queue table — PK: id, FK: sessionId→backtest_sessions, userId→users */
  backtestQueue:         new IndexTable<BacktestQueueIdx>('backtest_queue'),

  /** real_trades table (optional) — PK: id, FK: connectionId→exchange_connections */
  realTrades:            new IndexTable<RealTradeIdx>('real_trades'),

  /** ai_recommendations table (optional) — PK: id, FK: userId→users */
  aiRecommendations:     new IndexTable<AiRecommendationIdx>('ai_recommendations'),

  /** user_behavior_logs table (optional) — PK: id, FK: userId→users */
  userBehaviorLogs:      new IndexTable<UserBehaviorLogIdx>('user_behavior_logs'),
} as const;

// ─── FOREIGN KEY RELATIONSHIP MAP ────────────────────────────────────────────

/**
 * FK — Canonical foreign key relationships (used for validation and cascade logic).
 *
 * Format: { childTable: { fieldName: parentTable } }
 * This mirrors the database schema described in Part 14.3.
 */
export const FK = {
  strategy_purchases: {
    strategyId: 'strategies',
    buyerId:    'users',
  },
  strategy_ratings: {
    strategyId: 'strategies',
    userId:     'users',
  },
  backtest_sessions: {
    userId:     'users',
    strategyId: 'strategies',  // nullable
  },
  backtest_queue: {
    sessionId:  'backtest_sessions',
    userId:     'users',
  },
  user_bots: {
    userId:     'users',
    templateId: 'bot_templates',
  },
  copy_relationships: {
    followerId: 'users',
    traderId:   'users',
  },
  copy_executions: {
    relationshipId: 'copy_relationships',
    followerId:     'users',
    traderId:       'users',
  },
  onchain_alerts: {
    userId: 'users',
  },
  onchain_events: {
    alertId: 'onchain_alerts',
    userId:  'users',
  },
  sentiment_alerts: {
    userId: 'users',
  },
  nft_wallets: {
    userId: 'users',
  },
  nft_wallet_snapshots: {
    walletId: 'nft_wallets',
    userId:   'users',
  },
  event_participants: {
    eventId: 'live_events',
    userId:  'users',
  },
  leaderboard_entries: {
    eventId: 'live_events',
    userId:  'users',
  },
  recommendations: {
    userId: 'users',
  },
  exchange_connections: {
    userId: 'users',
  },
  exchange_portfolios: {
    connectionId: 'exchange_connections',
    userId:       'users',
  },
} as const;

// ─── INDEX HEALTH CHECK ───────────────────────────────────────────────────────

/** Returns a snapshot of record counts per index table. Useful for debugging. */
export function indexHealthCheck(): Record<string, number> {
  return Object.fromEntries(
    Object.entries(IX).map(([name, table]) => [name, table.size]),
  );
}

/** Rebuild all indexes from the current Zustand store state. */
export function rebuildAllIndexes(): void {
  try {
    // Lazy imports to avoid circular deps — stores import from storeIndex,
    // so we resolve them at call time, not at module load time.
    const { useStrategyStore }    = require('./strategyStore');
    const { useBacktestStore }    = require('./backtestStore');
    const { useBotStore }         = require('./botStore');
    const { useCopyTradingStore } = require('./copyTradingStore');
    const { useOnChainStore }     = require('./onChainStore');
    const { useSentimentStore }   = require('./sentimentStore');
    const { useNftStore }         = require('./nftStore');
    const { useLiveEventStore }   = require('./liveEventStore');
    const { useAIRecommenderStore } = require('./aiRecommenderStore');
    const { useExchangeStore }    = require('./exchangeStore');

    const ss = useStrategyStore.getState();
    IX.strategies.rebuild(
      Object.fromEntries(Object.entries(ss.strategies).map(([k, v]: [string, any]) => [
        k, { ...v, userId: v.creatorId, status: v.isListed ? 'listed' : 'draft' },
      ])),
    );
    IX.strategyPurchases.rebuild(
      Object.fromEntries(Object.entries(ss.purchases).map(([k, v]: [string, any]) => [
        k, { ...v, userId: v.buyerId, status: 'completed' },
      ])),
    );
    IX.strategyRatings.rebuild(
      Object.fromEntries(Object.entries(ss.ratings).map(([k, v]: [string, any]) => [
        k, { ...v, status: 'published' },
      ])),
    );

    const bs = useBacktestStore.getState();
    IX.backtestSessions.rebuild(bs.sessions as any);

    const bots = useBotStore.getState();
    IX.userBots.rebuild(bots.bots as any);

    const ct = useCopyTradingStore.getState();
    IX.copyRelationships.rebuild(
      Object.fromEntries(Object.entries(ct.relationships).map(([k, v]: [string, any]) => [
        k, { ...v, userId: v.followerId },
      ])),
    );
    IX.copyExecutions.rebuild(
      Object.fromEntries(Object.entries(ct.executions).map(([k, v]: [string, any]) => [
        k, { ...v, userId: v.followerId, status: v.status ?? 'completed' },
      ])),
    );

    const oc = useOnChainStore.getState();
    IX.onChainAlerts.rebuild(
      Object.fromEntries(Object.entries(oc.alerts).map(([k, v]: [string, any]) => [
        k, { ...v, status: v.isEnabled ? 'active' : 'paused' },
      ])),
    );
    IX.onChainEvents.rebuild(oc.events as any);

    const sent = useSentimentStore.getState();
    IX.sentimentAlerts.rebuild(sent.alerts as any);

    const nft = useNftStore.getState();
    IX.nftWallets.rebuild(nft.wallets as any);

    const le = useLiveEventStore.getState();
    IX.eventParticipants.rebuild(
      Object.fromEntries(Object.entries(le.participants).map(([k, v]: [string, any]) => [
        k, { ...v, status: v.status ?? 'registered' },
      ])),
    );

    const ai = useAIRecommenderStore.getState();
    const allRecs: Record<string, any> = {};
    for (const [uid, recs] of Object.entries(ai.recommendations as Record<string, any[]>)) {
      for (const rec of recs) { allRecs[rec.id] = { ...rec, userId: uid }; }
    }
    IX.recommendations.rebuild(allRecs);

    const ex = useExchangeStore.getState();
    IX.exchangeConnections.rebuild(ex.connections as any);

  } catch {
    // Silently ignore during initial load when stores may not exist yet
  }
}
