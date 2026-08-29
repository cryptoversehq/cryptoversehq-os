/**
 * sentimentStore.ts
 *
 * Central store for the CryptoVerse HQ Sentiment Analysis system.
 *
 * Manages two persistent tables:
 *   - snapshots  (SentimentSnapshot — time-series sentiment history per symbol)
 *   - alerts     (SentimentAlert    — user-configured threshold monitors)
 *
 * Core responsibilities:
 *   - Cold-start: seeds historical snapshots on first load via generateColdStartHistory()
 *   - Polling engine: ticks every SENTIMENT_INTERVAL_MS, generates new snapshots
 *     for all tracked symbols, evaluates active alerts, fires notifications.
 *   - Alert CRUD with validation and user caps.
 *   - Aggregate computation (live Fear & Greed summary per symbol).
 *   - Snapshot history queries with filtering, sorting, and pagination.
 *   - Admin stats.
 *
 * Persistence:
 *   - `cryptoverse_sentiment_snapshots_v1`  (ring buffer keyed by id)
 *   - `cryptoverse_sentiment_alerts_v1`     (keyed by id)
 *
 * No real API calls — all data is simulated by sentimentSimulator.ts.
 */

import { create } from 'zustand';
import { cloudRecordStore } from './cloudData';
import {
  SentimentSnapshot,
  SentimentAlert,
  SentimentAlertCondition,
  AggregateSentiment,
  SnapshotFilters,
  SentimentAlertFilters,
  SnapshotSortKey,
  AlertListSortKey,
  FearGreedZone,
  SentimentTrend,
  CreateSentimentAlertResult,
  UpdateSentimentAlertResult,
  SentimentGlobalStats,
  DEFAULT_SNAPSHOT_FILTERS,
  DEFAULT_ALERT_FILTERS,
  TRACKED_SYMBOLS,
  MARKET_SYMBOL,
  MAX_SNAPSHOTS_PER_SYMBOL,
  MAX_TOTAL_SNAPSHOTS,
  MAX_SENTIMENT_ALERTS,
  SENTIMENT_INTERVAL_MS,
  getFearGreedZone,
  CONDITION_META,
  FEAR_GREED_META,
} from './sentimentTypes';
import {
  generateSnapshot,
  generateColdStartHistory,
  evaluateAlertCondition,
  computeAggregateSentiment,
} from './sentimentSimulator';
import { generateId } from './strategyUtils';
import {
  SentimentAlertTrigger,
  SentimentScoringEngine,
  FearGreedIndexCalculator,
} from './sentimentEngine';

// Module-level singletons for the business-logic engines (Part 4)
const _scoringEngine    = new SentimentScoringEngine();
const _fgCalculator     = new FearGreedIndexCalculator();
const _alertTrigger     = new SentimentAlertTrigger();

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATION BRIDGE
// ─────────────────────────────────────────────────────────────────────────────

type SentimentNotifyPayload = {
  type:    'trade' | 'achievement' | 'system' | 'liquidation';
  title:   string;
  message: string;
};

let _sentimentNotifyHandler: ((n: SentimentNotifyPayload) => void) | null = null;

export function registerSentimentNotifyHandler(fn: (n: SentimentNotifyPayload) => void) {
  _sentimentNotifyHandler = fn;
}

function sentimentNotify(n: SentimentNotifyPayload) {
  _sentimentNotifyHandler?.(n);
}

// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENCE
// ─────────────────────────────────────────────────────────────────────────────

const SNAPSHOTS_KEY = 'cryptoverse_sentiment_snapshots_v1';
const ALERTS_KEY    = 'cryptoverse_sentiment_alerts_v1';
const SEEDED_KEY    = 'cryptoverse_sentiment_seeded_v1';

function load<T>(key: string, fallback: T): T {
  return cloudRecordStore.get<T>('sentiment', key, fallback);
}
function persist(key: string, data: unknown) {
  cloudRecordStore.set('sentiment', key, data);
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

export interface AlertValidation {
  valid:  boolean;
  errors: string[];
}

export function validateSentimentAlert(a: Partial<SentimentAlert>): AlertValidation {
  const errors: string[] = [];

  if (!a.symbol?.trim()) {
    errors.push('Symbol is required.');
  }

  if (!a.condition) {
    errors.push('Condition is required.');
  } else {
    const meta = CONDITION_META[a.condition];
    if (a.threshold === undefined || a.threshold === null || !Number.isFinite(a.threshold)) {
      errors.push('Threshold is required.');
    } else if (a.threshold < meta.min || a.threshold > meta.max) {
      errors.push(`Threshold must be between ${meta.min} and ${meta.max} for condition "${meta.label}".`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// FILTERING & SORTING — SNAPSHOTS
// ─────────────────────────────────────────────────────────────────────────────

function applySnapshotFilters(
  snapshots: SentimentSnapshot[],
  filters:   SnapshotFilters,
): SentimentSnapshot[] {
  return snapshots.filter(s => {
    if (filters.symbols.length > 0 && !filters.symbols.includes(s.symbol)) return false;
    if (filters.zones.length   > 0 && !filters.zones.includes(s.fearGreedZone))    return false;
    if (filters.trends.length  > 0 && s.trend && !filters.trends.includes(s.trend)) return false;
    if (filters.dateFrom && s.timestamp < filters.dateFrom) return false;
    if (filters.dateTo   && s.timestamp > filters.dateTo)   return false;
    return true;
  });
}

function sortSnapshots(
  snapshots: SentimentSnapshot[],
  sortBy:    SnapshotSortKey,
): SentimentSnapshot[] {
  const arr = [...snapshots];
  switch (sortBy) {
    case 'newest':              return arr.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    case 'oldest':              return arr.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    case 'highest_fear_greed':  return arr.sort((a, b) => b.fearGreedIndex - a.fearGreedIndex);
    case 'lowest_fear_greed':   return arr.sort((a, b) => a.fearGreedIndex - b.fearGreedIndex);
    case 'highest_volume':      return arr.sort((a, b) => b.totalVolume - a.totalVolume);
    default:                    return arr;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FILTERING & SORTING — ALERTS
// ─────────────────────────────────────────────────────────────────────────────

function applyAlertFilters(
  alerts:  SentimentAlert[],
  filters: SentimentAlertFilters,
): SentimentAlert[] {
  return alerts.filter(a => {
    if (filters.symbols.length    > 0 && !filters.symbols.includes(a.symbol))       return false;
    if (filters.conditions.length > 0 && !filters.conditions.includes(a.condition)) return false;
    if (filters.isActive !== null && a.isActive !== filters.isActive)                return false;
    return true;
  });
}

function sortAlerts(
  alerts: SentimentAlert[],
  sortBy: AlertListSortKey,
): SentimentAlert[] {
  const arr = [...alerts];
  switch (sortBy) {
    case 'newest':         return arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    case 'oldest':         return arr.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    case 'most_triggered': return arr.sort((a, b) => b.triggerCount - a.triggerCount);
    case 'symbol_asc':     return arr.sort((a, b) => a.symbol.localeCompare(b.symbol));
    default:               return arr;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RING BUFFER HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function pruneSnapshots(
  snapshots: Record<string, SentimentSnapshot>,
  symbol:    string,
): Record<string, SentimentSnapshot> {
  const result = { ...snapshots };

  // Per-symbol cap
  const symbolSnaps = Object.values(result)
    .filter(s => s.symbol === symbol)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  while (symbolSnaps.length >= MAX_SNAPSHOTS_PER_SYMBOL) {
    const oldest = symbolSnaps.shift()!;
    delete result[oldest.id];
  }

  // Global cap
  const allSnaps = Object.values(result)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  while (allSnaps.length >= MAX_TOTAL_SNAPSHOTS) {
    const oldest = allSnaps.shift()!;
    delete result[oldest.id];
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// POLLING ENGINE (module-level, single interval)
// ─────────────────────────────────────────────────────────────────────────────

let _sentimentInterval: ReturnType<typeof setInterval> | null = null;

function stopSentimentPolling() {
  if (_sentimentInterval !== null) {
    clearInterval(_sentimentInterval);
    _sentimentInterval = null;
  }
}

function startSentimentPolling(tick: () => void) {
  stopSentimentPolling();
  _sentimentInterval = setInterval(tick, SENTIMENT_INTERVAL_MS);
}

// ─────────────────────────────────────────────────────────────────────────────
// STATE INTERFACE
// ─────────────────────────────────────────────────────────────────────────────

export interface SentimentState {
  snapshots: Record<string, SentimentSnapshot>;
  alerts:    Record<string, SentimentAlert>;

  // ── Bootstrap ─────────────────────────────────────────────────────────────

  /**
   * Seed historical snapshots for all tracked symbols on first load.
   * No-op if already seeded (checked via the cloud record marker).
   */
  seedHistory: () => void;

  // ── Polling engine ─────────────────────────────────────────────────────────

  /** Start the live simulation ticks (one snapshot per symbol per interval). */
  startPolling: () => void;

  /** Stop the polling engine. */
  stopPolling: () => void;

  /**
   * Run one tick: generate new snapshots for all tracked symbols,
   * evaluate alerts, fire notifications.
   */
  runTick: () => { generated: number; triggered: number };

  // ── Alert CRUD ─────────────────────────────────────────────────────────────

  createAlert: (params: {
    userId:      string;
    symbol:      string;
    condition:   SentimentAlertCondition;
    threshold:   number;
    notifyInApp: boolean;
    notifyEmail: boolean;
  }) => CreateSentimentAlertResult;

  toggleAlert: (alertId: string, userId: string) => UpdateSentimentAlertResult;

  updateAlert: (
    alertId: string,
    userId:  string,
    patch:   Partial<Pick<SentimentAlert, 'symbol' | 'condition' | 'threshold' | 'notifyInApp' | 'notifyEmail'>>,
  ) => UpdateSentimentAlertResult;

  deleteAlert: (alertId: string, userId: string) => UpdateSentimentAlertResult;

  // ── Queries ────────────────────────────────────────────────────────────────

  /** Full snapshot history with optional filtering and pagination. */
  getSnapshotHistory: (
    symbol:  string,
    filters?: SnapshotFilters,
    limit?:   number,
  ) => SentimentSnapshot[];

  /** The N most recent snapshots for a symbol (sparkline data). */
  getLatestSnapshots: (symbol: string, n?: number) => SentimentSnapshot[];

  /** Live aggregate summary for a symbol. */
  getAggregate: (symbol: string) => AggregateSentiment | null;

  /** Live aggregate for all tracked symbols (dashboard overview). */
  getAllAggregates: () => AggregateSentiment[];

  /** Alerts for a user with optional filtering. */
  getUserAlerts: (userId: string, filters?: SentimentAlertFilters) => SentimentAlert[];

  /** Current market-level Fear & Greed index (from MARKET_SYMBOL snapshots). */
  getMarketFearGreed: () => { index: number; zone: FearGreedZone } | null;

  // ── Admin ──────────────────────────────────────────────────────────────────

  getGlobalStats: () => SentimentGlobalStats;
  adminDeleteAlert: (alertId: string) => UpdateSentimentAlertResult;
  adminClearSymbolHistory: (symbol: string) => { cleared: number };
}

// ─────────────────────────────────────────────────────────────────────────────
// STORE
// ─────────────────────────────────────────────────────────────────────────────

export const useSentimentStore = create<SentimentState>((set, get) => {
  const snapshots = load<Record<string, SentimentSnapshot>>(SNAPSHOTS_KEY, {});
  const alerts    = load<Record<string, SentimentAlert>>(ALERTS_KEY, {});

  return {
    snapshots,
    alerts,

    // ── Bootstrap ────────────────────────────────────────────────────────────

    seedHistory: () => {
      const alreadySeeded = cloudRecordStore.get<string>('sentiment', SEEDED_KEY, '') === '1';
      if (alreadySeeded) return;

      let newSnapshots = { ...get().snapshots };
      const allSymbols = [MARKET_SYMBOL, ...TRACKED_SYMBOLS];

      for (const symbol of allSymbols) {
        const history = generateColdStartHistory(symbol);
        for (const snap of history) {
          newSnapshots = pruneSnapshots(newSnapshots, symbol);
          newSnapshots[snap.id] = snap;
        }
      }

      persist(SNAPSHOTS_KEY, newSnapshots);
      cloudRecordStore.set('sentiment', SEEDED_KEY, '1');
      set({ snapshots: newSnapshots });
    },

    // ── Polling engine ────────────────────────────────────────────────────────

    startPolling: () => {
      startSentimentPolling(() => get().runTick());
    },

    stopPolling: () => {
      stopSentimentPolling();
    },

    runTick: () => {
      const { alerts } = get();
      let newSnapshots = { ...get().snapshots };
      const newAlerts  = { ...alerts };
      const now        = new Date().toISOString();

      let generated  = 0;
      let triggered  = 0;

      const allSymbols = [MARKET_SYMBOL, ...TRACKED_SYMBOLS];
      const activeAlerts = Object.values(alerts).filter(a => a.isActive);

      for (const symbol of allSymbols) {
        // Get the previous snapshot for trend computation
        const symbolHistory = Object.values(newSnapshots)
          .filter(s => s.symbol === symbol)
          .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        const previous = symbolHistory[0] ?? null;

        // Generate new snapshot
        const snapshot = generateSnapshot(symbol, previous);
        newSnapshots   = pruneSnapshots(newSnapshots, symbol);
        newSnapshots[snapshot.id] = snapshot;
        generated++;

        // Skip alert evaluation for MARKET_SYMBOL (alerts use coin symbols)
        if (symbol === MARKET_SYMBOL) continue;

        // Evaluate alerts for this symbol
        for (const alert of activeAlerts) {
          if (alert.symbol !== symbol) continue;
          if (!evaluateAlertCondition(alert, snapshot)) continue;

          // Throttle: don't re-fire within 60 seconds of last trigger
          const lastMs = alert.lastTriggeredAt ? new Date(alert.lastTriggeredAt).getTime() : 0;
          if (Date.now() - lastMs < 60_000) continue;

          // Update alert stats
          newAlerts[alert.id] = {
            ...alert,
            triggerCount:    alert.triggerCount + 1,
            lastTriggeredAt: now,
          };

          triggered++;

          // Notify
          if (alert.notifyInApp) {
            const zone     = getFearGreedZone(snapshot.fearGreedIndex);
            const zoneMeta = FEAR_GREED_META[zone];
            sentimentNotify({
              type:    snapshot.fearGreedIndex >= 50 ? 'trade' : 'system',
              title:   `${zoneMeta.icon} Sentiment Alert — ${symbol}`,
              message: `Fear & Greed: ${snapshot.fearGreedIndex} (${zoneMeta.label}) · ${CONDITION_META[alert.condition].label} ${alert.threshold}`,
            });
          }
        }
      }

      // ── Combined alert evaluation via SentimentAlertTrigger (Part 4.5) ──────
      // Pull the latest MARKET snapshot for global F&G
      const marketSnaps = Object.values(newSnapshots)
        .filter(s => s.symbol === MARKET_SYMBOL)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      const latestMarket = marketSnaps[0];

      if (latestMarket) {
        // Compute average social + news sentiment across all tracked coins
        const coinSnaps = TRACKED_SYMBOLS.map(sym =>
          Object.values(newSnapshots)
            .filter(s => s.symbol === sym)
            .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0],
        ).filter(Boolean);

        const avgSocial = coinSnaps.length > 0
          ? coinSnaps.reduce((s, snap) => s + snap.overallSentiment, 0) / coinSnaps.length
          : 0;
        const avgNews = coinSnaps.length > 0
          ? coinSnaps.reduce((s, snap) => s + snap.newsSentiment, 0) / coinSnaps.length
          : 0;

        // Use FearGreedIndexCalculator (Part 4.2) to compute a richer composite
        const fgComponents = _fgCalculator.calculate({
          twitterSentiment: avgSocial,
          priceChange7d:    (avgSocial * 15),  // proxy from sentiment
          btcDominance:     52,                 // default — would come from CoinGecko in live mode
          googleTrends:     Math.round((avgSocial + 1) / 2 * 80),
        });

        const triggerInput = {
          currentFearGreed: latestMarket.fearGreedIndex,
          socialSentiment:  avgSocial,
          newsSentiment:    avgNews,
        };

        // Evaluate MARKET-scoped alerts with combined trigger
        const marketAlerts = Object.values(newAlerts)
          .filter(a => a.isActive && a.symbol === MARKET_SYMBOL);

        for (const storeAlert of marketAlerts) {
          // Map store alert to trigger alert definition
          const triggerDef = {
            id:        storeAlert.id,
            userId:    storeAlert.userId,
            name:      `${storeAlert.symbol} ${storeAlert.condition} ${storeAlert.threshold}`,
            type:      (storeAlert.condition === 'fear_above' || storeAlert.condition === 'fear_below' ||
                        storeAlert.condition === 'greed_above' || storeAlert.condition === 'greed_below')
                       ? 'fear_greed' as const
                       : storeAlert.condition === 'overall_above' || storeAlert.condition === 'overall_below'
                       ? 'social' as const
                       : 'fear_greed' as const,
            condition: (storeAlert.condition.includes('above') ? 'above' : 'below') as 'above' | 'below',
            threshold: storeAlert.threshold,
          };

          const event = _alertTrigger.evaluate(triggerDef, triggerInput);
          if (!event) continue;

          const lastMs = storeAlert.lastTriggeredAt ? new Date(storeAlert.lastTriggeredAt).getTime() : 0;
          if (Date.now() - lastMs < 60_000) continue;

          newAlerts[storeAlert.id] = {
            ...storeAlert,
            triggerCount:    storeAlert.triggerCount + 1,
            lastTriggeredAt: now,
          };
          triggered++;

          if (storeAlert.notifyInApp) {
            sentimentNotify({
              type:    'system',
              title:   `🌍 Market Alert — ${storeAlert.condition}`,
              message: event.message,
            });
          }
        }
      }

      persist(SNAPSHOTS_KEY, newSnapshots);
      if (triggered > 0) persist(ALERTS_KEY, newAlerts);
      set({ snapshots: newSnapshots, alerts: newAlerts });

      return { generated, triggered };
    },

    // ── Alert CRUD ────────────────────────────────────────────────────────────

    createAlert: (params) => {
      const { userId } = params;

      const userAlerts = Object.values(get().alerts).filter(a => a.userId === userId);
      if (userAlerts.length >= MAX_SENTIMENT_ALERTS) {
        return { ok: false, errors: [`Maximum ${MAX_SENTIMENT_ALERTS} sentiment alerts per user.`] };
      }

      const draft: Partial<SentimentAlert> = {
        symbol:    params.symbol.trim().toUpperCase(),
        condition: params.condition,
        threshold: params.threshold,
      };
      const validation = validateSentimentAlert(draft);
      if (!validation.valid) return { ok: false, errors: validation.errors };

      const now     = new Date().toISOString();
      const alertId = generateId();

      const alert: SentimentAlert = {
        id:              alertId,
        userId,
        symbol:          draft.symbol!,
        condition:       draft.condition!,
        threshold:       draft.threshold!,
        isActive:        true,
        notifyInApp:     params.notifyInApp,
        notifyEmail:     params.notifyEmail,
        triggerCount:    0,
        createdAt:       now,
        lastTriggeredAt: null,
      };

      const newAlerts = { ...get().alerts, [alertId]: alert };
      persist(ALERTS_KEY, newAlerts);
      set({ alerts: newAlerts });

      return { ok: true, alertId };
    },

    toggleAlert: (alertId, userId) => {
      const { alerts } = get();
      const alert = alerts[alertId];
      if (!alert) return { ok: false, error: 'Alert not found.' };
      if (alert.userId !== userId) return { ok: false, error: 'Permission denied.' };
      const updated = { ...alert, isActive: !alert.isActive };
      const newAlerts = { ...alerts, [alertId]: updated };
      persist(ALERTS_KEY, newAlerts);
      set({ alerts: newAlerts });
      return { ok: true };
    },

    updateAlert: (alertId, userId, patch) => {
      const { alerts } = get();
      const alert = alerts[alertId];
      if (!alert) return { ok: false, error: 'Alert not found.' };
      if (alert.userId !== userId) return { ok: false, error: 'Permission denied.' };
      const merged = { ...alert, ...patch };
      const validation = validateSentimentAlert(merged);
      if (!validation.valid) return { ok: false, error: validation.errors.join(' ') };
      const newAlerts = { ...alerts, [alertId]: merged };
      persist(ALERTS_KEY, newAlerts);
      set({ alerts: newAlerts });
      return { ok: true };
    },

    deleteAlert: (alertId, userId) => {
      const { alerts } = get();
      const alert = alerts[alertId];
      if (!alert) return { ok: false, error: 'Alert not found.' };
      if (alert.userId !== userId) return { ok: false, error: 'Permission denied.' };
      const newAlerts = { ...alerts };
      delete newAlerts[alertId];
      persist(ALERTS_KEY, newAlerts);
      set({ alerts: newAlerts });
      return { ok: true };
    },

    // ── Queries ───────────────────────────────────────────────────────────────

    getSnapshotHistory: (symbol, filters = DEFAULT_SNAPSHOT_FILTERS, limit = 200) => {
      const symbolSnaps = Object.values(get().snapshots).filter(s => s.symbol === symbol);
      return sortSnapshots(applySnapshotFilters(symbolSnaps, filters), filters.sortBy).slice(0, limit);
    },

    getLatestSnapshots: (symbol, n = 48) => {
      return Object.values(get().snapshots)
        .filter(s => s.symbol === symbol)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .slice(0, n)
        .reverse(); // chronological order for charts
    },

    getAggregate: (symbol) => {
      const history = Object.values(get().snapshots).filter(s => s.symbol === symbol);
      return computeAggregateSentiment(symbol, history);
    },

    getAllAggregates: () => {
      const { snapshots } = get();
      return TRACKED_SYMBOLS.map(symbol => {
        const history = Object.values(snapshots).filter(s => s.symbol === symbol);
        return computeAggregateSentiment(symbol, history);
      }).filter((a): a is AggregateSentiment => a !== null);
    },

    getUserAlerts: (userId, filters = DEFAULT_ALERT_FILTERS) => {
      const userAlerts = Object.values(get().alerts).filter(a => a.userId === userId);
      return sortAlerts(applyAlertFilters(userAlerts, filters), filters.sortBy);
    },

    getMarketFearGreed: () => {
      const latest = Object.values(get().snapshots)
        .filter(s => s.symbol === MARKET_SYMBOL)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
      if (!latest) return null;
      return { index: latest.fearGreedIndex, zone: latest.fearGreedZone };
    },

    // ── Admin ─────────────────────────────────────────────────────────────────

    getGlobalStats: () => {
      const { snapshots, alerts } = get();
      const allSnaps  = Object.values(snapshots);
      const allAlerts = Object.values(alerts);

      const symbolSet = new Set(allSnaps.map(s => s.symbol));

      // Latest market F&G
      const latestMarket = allSnaps
        .filter(s => s.symbol === MARKET_SYMBOL)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
      const currentFearGreed = latestMarket?.fearGreedIndex ?? 50;
      const currentMarketZone = getFearGreedZone(currentFearGreed);

      // 7-day average F&G
      const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const recent7d = allSnaps.filter(s => s.symbol === MARKET_SYMBOL && s.timestamp >= sevenDaysAgo);
      const avgFearGreed7d = recent7d.length > 0
        ? Math.round(recent7d.reduce((s, n) => s + n.fearGreedIndex, 0) / recent7d.length * 10) / 10
        : currentFearGreed;

      // Most bullish / bearish symbols (from latest snapshot per coin)
      const latestBySymbol: Record<string, SentimentSnapshot> = {};
      for (const snap of allSnaps) {
        if (snap.symbol === MARKET_SYMBOL) continue;
        const existing = latestBySymbol[snap.symbol];
        if (!existing || snap.timestamp > existing.timestamp) {
          latestBySymbol[snap.symbol] = snap;
        }
      }
      const symbolSnapshots = Object.values(latestBySymbol);
      const mostBullish  = symbolSnapshots.reduce<SentimentSnapshot | null>(
        (best, s) => (!best || s.overallSentiment > best.overallSentiment) ? s : best, null,
      );
      const mostBearish  = symbolSnapshots.reduce<SentimentSnapshot | null>(
        (best, s) => (!best || s.overallSentiment < best.overallSentiment) ? s : best, null,
      );
      const highestVolume = symbolSnapshots.reduce<SentimentSnapshot | null>(
        (best, s) => (!best || s.totalVolume > best.totalVolume) ? s : best, null,
      );

      // By zone
      const zones: FearGreedZone[] = ['extreme_fear', 'fear', 'neutral', 'greed', 'extreme_greed'];
      const byZone: Record<FearGreedZone, number> = {
        extreme_fear: 0, fear: 0, neutral: 0, greed: 0, extreme_greed: 0,
      };
      for (const s of allSnaps) byZone[s.fearGreedZone]++;

      // Top user by alerts
      const alertsByUser: Record<string, number> = {};
      for (const a of allAlerts) alertsByUser[a.userId] = (alertsByUser[a.userId] ?? 0) + 1;
      const topUser = Object.entries(alertsByUser).sort((a, b) => b[1] - a[1])[0];

      return {
        totalSnapshots:    allSnaps.length,
        totalAlerts:       allAlerts.length,
        activeAlerts:      allAlerts.filter(a => a.isActive).length,
        symbolsCovered:    symbolSet.size,
        currentMarketZone,
        currentFearGreed,
        avgFearGreed7d,
        mostBullishSymbol:  mostBullish  ? { symbol: mostBullish.symbol,  overallSentiment: mostBullish.overallSentiment }  : null,
        mostBearishSymbol:  mostBearish  ? { symbol: mostBearish.symbol,  overallSentiment: mostBearish.overallSentiment }  : null,
        highestVolumeSymbol: highestVolume ? { symbol: highestVolume.symbol, totalVolume: highestVolume.totalVolume } : null,
        byZone,
        topUserByAlerts: topUser ? { userId: topUser[0], count: topUser[1] } : null,
      };
    },

    adminDeleteAlert: (alertId) => {
      const { alerts } = get();
      if (!alerts[alertId]) return { ok: false, error: 'Alert not found.' };
      const newAlerts = { ...alerts };
      delete newAlerts[alertId];
      persist(ALERTS_KEY, newAlerts);
      set({ alerts: newAlerts });
      return { ok: true };
    },

    adminClearSymbolHistory: (symbol) => {
      const { snapshots } = get();
      const newSnapshots = { ...snapshots };
      let cleared = 0;
      for (const [k, s] of Object.entries(newSnapshots)) {
        if (s.symbol === symbol) { delete newSnapshots[k]; cleared++; }
      }
      persist(SNAPSHOTS_KEY, newSnapshots);
      set({ snapshots: newSnapshots });
      return { cleared };
    },
  };
});
