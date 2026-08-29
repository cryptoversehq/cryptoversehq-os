/**
 * onChainStore.ts
 *
 * Central store for the CryptoVerse HQ On-Chain Analysis system.
 *
 * Manages two persistent tables:
 *   - alerts  (OnChainAlert — user-configured blockchain monitors)
 *   - events  (OnChainEvent — detected transactions matching alerts)
 *
 * Core responsibilities:
 *   - Alert CRUD: create / update / toggle / delete
 *   - Polling engine: calls simulateTick() on a configurable interval,
 *     evaluates every active alert against the generated transactions,
 *     and writes matching OnChainEvents.
 *   - Notification bridge: fires app-wide notifications for alert triggers.
 *   - Event management: mark-as-read, clear, paginate, filter.
 *   - Admin functions: global stats, force-clear, bulk operations.
 *
 * Persistence:
 *   - `cryptoverse_onchain_alerts_v1`  (ring buffer)
 *   - `cryptoverse_onchain_events_v1`  (ring buffer)
 *
 * Simulation notes:
 *   - The polling engine ticks every SIMULATION_INTERVAL_MS (12s default).
 *   - Only chains covered by at least one active alert are simulated.
 *   - The interval auto-starts/stops as alerts are added/removed.
 *   - No real blockchain calls are made in this module.
 */

import { create } from 'zustand';
import { cloudRecordStore } from './cloudData';
import {
  OnChainAlert,
  OnChainEvent,
  OnChainAlertFilters,
  OnChainEventFilters,
  AlertSortKey,
  EventSortKey,
  MonitoredChain,
  WhaleTier,
  WHALE_TIER_META,
  CHAIN_META,
  CreateAlertResult,
  UpdateAlertResult,
  OnChainGlobalStats,
  DEFAULT_ALERT_FILTERS,
  DEFAULT_EVENT_FILTERS,
  MAX_ALERTS_PER_USER,
  MAX_EVENTS_PER_USER,
  MAX_TOTAL_EVENTS,
  MAX_EVENTS_PER_ALERT,
  MIN_ALERT_VALUE,
  SIMULATION_INTERVAL_MS,
} from './onChainTypes';
import { simulateTick } from './onChainSimulator';
import { whaleEngine } from './whaleDetectionEngine';
import { triggerSystem } from './alertTriggerSystem';
import { generateId } from './strategyUtils';
import { fetchLatestTransactions } from './etherscanAPI';

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATION BRIDGE
// ─────────────────────────────────────────────────────────────────────────────

type OnChainNotifyPayload = {
  type:    'trade' | 'achievement' | 'system' | 'liquidation';
  title:   string;
  message: string;
};

let _onChainNotifyHandler: ((n: OnChainNotifyPayload) => void) | null = null;

export function registerOnChainNotifyHandler(fn: (n: OnChainNotifyPayload) => void) {
  _onChainNotifyHandler = fn;
}

function onChainNotify(n: OnChainNotifyPayload) {
  _onChainNotifyHandler?.(n);
}

// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENCE
// ─────────────────────────────────────────────────────────────────────────────

const ALERTS_KEY = 'cryptoverse_onchain_alerts_v1';
const EVENTS_KEY = 'cryptoverse_onchain_events_v1';

function load<T>(key: string, fallback: T): T {
  return cloudRecordStore.get<T>('on_chain', key, fallback);
}
function persist(key: string, data: unknown) {
  cloudRecordStore.set('on_chain', key, data);
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

export interface AlertValidation {
  valid:  boolean;
  errors: string[];
}

export function validateAlert(a: Partial<OnChainAlert>): AlertValidation {
  const errors: string[] = [];

  if (!a.name?.trim())                errors.push('Alert name is required.');
  else if (a.name.trim().length > 80) errors.push('Alert name must be 80 characters or fewer.');

  if (!a.chain)                       errors.push('Chain is required.');

  if (a.minValue === undefined || a.minValue === null) {
    errors.push('Threshold value is required.');
  } else if (!Number.isFinite(a.minValue) || a.minValue < MIN_ALERT_VALUE) {
    errors.push(`Threshold must be at least $${MIN_ALERT_VALUE.toLocaleString()}.`);
  }

  if (a.condition && !['above', 'below'].includes(a.condition)) {
    errors.push("Condition must be 'above' or 'below'.");
  }

  return { valid: errors.length === 0, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// FILTERING & SORTING — ALERTS
// ─────────────────────────────────────────────────────────────────────────────

function applyAlertFilters(alerts: OnChainAlert[], filters: OnChainAlertFilters): OnChainAlert[] {
  return alerts.filter(a => {
    if (filters.chains.length > 0 && !filters.chains.includes(a.chain)) return false;
    if (filters.isActive !== null && a.isActive !== filters.isActive) return false;
    if (filters.search.trim()) {
      const q = filters.search.toLowerCase();
      if (!a.name.toLowerCase().includes(q) && !a.address.toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

function sortAlerts(alerts: OnChainAlert[], sortBy: AlertSortKey): OnChainAlert[] {
  const arr = [...alerts];
  switch (sortBy) {
    case 'newest':           return arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    case 'oldest':           return arr.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    case 'most_triggered':   return arr.sort((a, b) => b.triggerCount - a.triggerCount);
    case 'highest_threshold':return arr.sort((a, b) => b.minValue - a.minValue);
    default:                 return arr;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FILTERING & SORTING — EVENTS
// ─────────────────────────────────────────────────────────────────────────────

function applyEventFilters(events: OnChainEvent[], filters: OnChainEventFilters): OnChainEvent[] {
  return events.filter(e => {
    if (filters.chains.length > 0 && !filters.chains.includes(e.chain)) return false;
    if (filters.whaleTiers.length > 0 && !filters.whaleTiers.includes(e.whaleTier)) return false;
    if (filters.alertIds.length > 0 && !filters.alertIds.includes(e.alertId)) return false;
    if (filters.unreadOnly && e.isRead) return false;
    if (e.value < filters.minValue) return false;
    if (filters.maxValue !== Infinity && e.value > filters.maxValue) return false;
    if (filters.search.trim()) {
      const q = filters.search.toLowerCase();
      const hit =
        e.txHash.toLowerCase().includes(q) ||
        e.fromAddress.toLowerCase().includes(q) ||
        e.toAddress.toLowerCase().includes(q) ||
        (e.fromLabel ?? '').toLowerCase().includes(q) ||
        (e.toLabel ?? '').toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  });
}

function sortEvents(events: OnChainEvent[], sortBy: EventSortKey): OnChainEvent[] {
  const arr = [...events];
  switch (sortBy) {
    case 'newest':        return arr.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    case 'oldest':        return arr.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    case 'highest_value': return arr.sort((a, b) => b.value - a.value);
    case 'lowest_value':  return arr.sort((a, b) => a.value - b.value);
    default:              return arr;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POLLING ENGINE (module-level, shared single interval)
// ─────────────────────────────────────────────────────────────────────────────

let _pollInterval: ReturnType<typeof setInterval> | null = null;

function stopPolling() {
  if (_pollInterval !== null) {
    clearInterval(_pollInterval);
    _pollInterval = null;
  }
}

function startPolling(tick: () => void) {
  stopPolling();
  _pollInterval = setInterval(tick, SIMULATION_INTERVAL_MS);
}

// ─────────────────────────────────────────────────────────────────────────────
// RING-BUFFER HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function pruneEvents(
  events:    Record<string, OnChainEvent>,
  alertId:   string,
  userId:    string,
): Record<string, OnChainEvent> {
  const newEvents = { ...events };

  // Per-alert cap
  const alertEvents = Object.values(newEvents)
    .filter(e => e.alertId === alertId)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  if (alertEvents.length >= MAX_EVENTS_PER_ALERT) {
    delete newEvents[alertEvents[0].id];
  }

  // Per-user cap
  const userEvents = Object.values(newEvents)
    .filter(e => e.userId === userId)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  if (userEvents.length >= MAX_EVENTS_PER_USER) {
    delete newEvents[userEvents[0].id];
  }

  // Global cap
  const allEvents = Object.values(newEvents)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  if (allEvents.length >= MAX_TOTAL_EVENTS) {
    delete newEvents[allEvents[0].id];
  }

  return newEvents;
}

// ─────────────────────────────────────────────────────────────────────────────
// STATE INTERFACE
// ─────────────────────────────────────────────────────────────────────────────

export interface OnChainState {
  alerts: Record<string, OnChainAlert>;
  events: Record<string, OnChainEvent>;
  /** Data source: 'live' when Etherscan is connected, 'simulated' when using the PRNG engine. */
  dataSource: 'live' | 'simulated';

  // ── Alert CRUD ────────────────────────────────────────────────────────────

  /**
   * Create a new alert. Validates input, checks cap, starts polling if needed.
   */
  createAlert: (params: {
    userId:           string;
    name:             string;
    chain:            MonitoredChain;
    address:          string;
    minValue:         number;
    condition:        'above' | 'below';
    notifyEmail:      boolean;
    notifyInApp:      boolean;
    tokenAddress?:    string;
    tokenStandard?:   OnChainAlert['tokenStandard'];
    alertType?:       OnChainAlert['alertType'];
    minSignificance?: number;
  }) => CreateAlertResult;

  /** Enable or disable an alert. */
  toggleAlert: (alertId: string, userId: string) => UpdateAlertResult;

  /** Update mutable fields on an alert. */
  updateAlert: (
    alertId: string,
    userId:  string,
    patch:   Partial<Pick<
      OnChainAlert,
      'name' | 'address' | 'minValue' | 'condition' | 'notifyEmail' | 'notifyInApp' | 'tokenAddress' | 'tokenStandard'
    >>,
  ) => UpdateAlertResult;

  /** Permanently delete an alert and all its associated events. */
  deleteAlert: (alertId: string, userId: string) => UpdateAlertResult;

  // ── Event management ──────────────────────────────────────────────────────

  /** Mark a single event as read. */
  markEventRead: (eventId: string) => void;

  /** Mark all events for a user as read. */
  markAllRead: (userId: string) => void;

  /** Delete a single event. */
  deleteEvent: (eventId: string, userId: string) => void;

  /** Clear all read events for a user. */
  clearReadEvents: (userId: string) => { cleared: number };

  // ── Queries ───────────────────────────────────────────────────────────────

  /** Alerts for a user, with optional filtering. */
  getUserAlerts: (userId: string, filters?: OnChainAlertFilters) => OnChainAlert[];

  /** Events for a user, with optional filtering. */
  getUserEvents: (userId: string, filters?: OnChainEventFilters) => OnChainEvent[];

  /** Events for a specific alert. */
  getAlertEvents: (alertId: string, limit?: number) => OnChainEvent[];

  /** Unread event count for a user. */
  getUnreadCount: (userId: string) => number;

  /** Which chains have at least one active alert for a user. */
  getActiveChains: (userId: string) => MonitoredChain[];

  // ── Polling engine ────────────────────────────────────────────────────────

  /**
   * Start the simulation polling loop for a specific user.
   * Stops automatically when no active alerts remain.
   */
  startPollingForUser: (userId: string) => void;

  /** Manually stop the polling engine. */
  stopPolling: () => void;

  /**
   * Internal: run one tick of the simulation engine.
   * Public so it can be called manually for testing.
   */
  runTick: (userId: string) => Promise<{ eventsCreated: number }>;

  // ── Admin ─────────────────────────────────────────────────────────────────

  getGlobalStats: () => OnChainGlobalStats;

  adminDeleteAlert: (alertId: string, adminId: string) => UpdateAlertResult;
  adminClearUserEvents: (userId: string, adminId: string) => { cleared: number };
}

// ─────────────────────────────────────────────────────────────────────────────
// STORE
// ─────────────────────────────────────────────────────────────────────────────

export const useOnChainStore = create<OnChainState>((set, get) => {
  const alerts = load<Record<string, OnChainAlert>>(ALERTS_KEY, {});
  const events = load<Record<string, OnChainEvent>>(EVENTS_KEY, {});

  return {
    alerts,
    events,
    dataSource: 'simulated',

    // ── Alert CRUD ──────────────────────────────────────────────────────────

    createAlert: (params) => {
      const { userId } = params;

      // User cap
      const userAlerts = Object.values(get().alerts).filter(a => a.userId === userId);
      if (userAlerts.length >= MAX_ALERTS_PER_USER) {
        return { ok: false, errors: [`Maximum ${MAX_ALERTS_PER_USER} alerts per user.`] };
      }

      const draft: Partial<OnChainAlert> = {
        name:          params.name?.trim(),
        chain:         params.chain,
        address:       params.address?.trim() ?? '',
        minValue:      params.minValue,
        condition:     params.condition,
        tokenAddress:  params.tokenAddress ?? '',
        tokenStandard: params.tokenStandard ?? '',
      };

      const validation = validateAlert(draft);
      if (!validation.valid) return { ok: false, errors: validation.errors };

      const now     = new Date().toISOString();
      const alertId = generateId();

      const alert: OnChainAlert = {
        id:              alertId,
        userId,
        name:            draft.name!,
        chain:           draft.chain!,
        address:         draft.address!,
        minValue:        draft.minValue!,
        condition:       draft.condition!,
        tokenAddress:    draft.tokenAddress!,
        tokenStandard:   draft.tokenStandard!,
        alertType:       params.alertType       ?? 'whale_transaction',
        minSignificance: params.minSignificance ?? 0.7,
        isActive:        true,
        notifyEmail:     params.notifyEmail,
        notifyInApp:     params.notifyInApp,
        triggerCount:    0,
        createdAt:       now,
        lastTriggeredAt: null,
      };

      const newAlerts = { ...get().alerts, [alertId]: alert };
      persist(ALERTS_KEY, newAlerts);
      set({ alerts: newAlerts });

      // Ensure polling is running
      get().startPollingForUser(userId);

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
      const validation = validateAlert(merged);
      if (!validation.valid) return { ok: false, error: validation.errors.join(' ') };

      const newAlerts = { ...alerts, [alertId]: merged };
      persist(ALERTS_KEY, newAlerts);
      set({ alerts: newAlerts });
      return { ok: true };
    },

    deleteAlert: (alertId, userId) => {
      const { alerts, events } = get();
      const alert = alerts[alertId];
      if (!alert) return { ok: false, error: 'Alert not found.' };
      if (alert.userId !== userId) return { ok: false, error: 'Permission denied.' };

      const newAlerts = { ...alerts };
      delete newAlerts[alertId];

      // Remove associated events
      const newEvents = { ...events };
      Object.values(newEvents)
        .filter(e => e.alertId === alertId)
        .forEach(e => delete newEvents[e.id]);

      persist(ALERTS_KEY, newAlerts);
      persist(EVENTS_KEY, newEvents);
      set({ alerts: newAlerts, events: newEvents });

      // Stop polling if no more active alerts for any user
      const anyActive = Object.values(newAlerts).some(a => a.isActive);
      if (!anyActive) stopPolling();

      return { ok: true };
    },

    // ── Event management ────────────────────────────────────────────────────

    markEventRead: (eventId) => {
      const { events } = get();
      const event = events[eventId];
      if (!event || event.isRead) return;
      const newEvents = { ...events, [eventId]: { ...event, isRead: true } };
      persist(EVENTS_KEY, newEvents);
      set({ events: newEvents });
    },

    markAllRead: (userId) => {
      const { events } = get();
      const newEvents: Record<string, OnChainEvent> = {};
      for (const [k, e] of Object.entries(events)) {
        newEvents[k] = e.userId === userId ? { ...e, isRead: true } : e;
      }
      persist(EVENTS_KEY, newEvents);
      set({ events: newEvents });
    },

    deleteEvent: (eventId, userId) => {
      const { events } = get();
      const event = events[eventId];
      if (!event || event.userId !== userId) return;
      const newEvents = { ...events };
      delete newEvents[eventId];
      persist(EVENTS_KEY, newEvents);
      set({ events: newEvents });
    },

    clearReadEvents: (userId) => {
      const { events } = get();
      const newEvents = { ...events };
      let cleared = 0;
      for (const [k, e] of Object.entries(newEvents)) {
        if (e.userId === userId && e.isRead) {
          delete newEvents[k];
          cleared++;
        }
      }
      persist(EVENTS_KEY, newEvents);
      set({ events: newEvents });
      return { cleared };
    },

    // ── Queries ─────────────────────────────────────────────────────────────

    getUserAlerts: (userId, filters = DEFAULT_ALERT_FILTERS) => {
      const userAlerts = Object.values(get().alerts).filter(a => a.userId === userId);
      return sortAlerts(applyAlertFilters(userAlerts, filters), filters.sortBy);
    },

    getUserEvents: (userId, filters = DEFAULT_EVENT_FILTERS) => {
      const userEvents = Object.values(get().events).filter(e => e.userId === userId);
      return sortEvents(applyEventFilters(userEvents, filters), filters.sortBy);
    },

    getAlertEvents: (alertId, limit = 50) => {
      return Object.values(get().events)
        .filter(e => e.alertId === alertId)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .slice(0, limit);
    },

    getUnreadCount: (userId) => {
      return Object.values(get().events).filter(e => e.userId === userId && !e.isRead).length;
    },

    getActiveChains: (userId) => {
      const chains = new Set<MonitoredChain>();
      Object.values(get().alerts)
        .filter(a => a.userId === userId && a.isActive)
        .forEach(a => chains.add(a.chain));
      return [...chains];
    },

    // ── Polling engine ───────────────────────────────────────────────────────

    startPollingForUser: (userId) => {
      const hasActive = Object.values(get().alerts).some(
        a => a.userId === userId && a.isActive,
      );
      if (!hasActive) return;

      // Only restart if not already running
      if (_pollInterval !== null) return;

      startPolling(() => get().runTick(userId));
    },

    stopPolling: () => {
      stopPolling();
    },

    runTick: async (userId) => {
      const { alerts, events } = get();

      // Collect active alerts for this user
      const activeAlerts = Object.values(alerts).filter(
        a => a.userId === userId && a.isActive,
      );
      if (activeAlerts.length === 0) {
        stopPolling();
        return { eventsCreated: 0 };
      }

      const activeChains = [...new Set(activeAlerts.map(a => a.chain))];

      // ── §P2: Try real Etherscan API first, fall back to simulation ──────
      let rawTxs = simulateTick(activeChains);
      let ds: 'live' | 'simulated' = 'simulated';

      try {
        const realTxs = await fetchLatestTransactions('', '1');
        if (realTxs && realTxs.length > 0) {
          const ethPrice = 3000;
          const converted: typeof rawTxs = realTxs.map(tx => ({
            txHash:        tx.hash,
            chain:         'ethereum' as const,
            fromAddress:   tx.from,
            fromLabel:     null,
            toAddress:     tx.to,
            toLabel:       null,
            valueUsd:      tx.value * ethPrice,
            valueNative:   `${tx.value.toFixed(4)} ETH`,
            tokenSymbol:   'ETH',
            tokenStandard: 'native' as const,
            blockNumber:   tx.blockNumber,
            whaleTier:     tx.value >= 100 ? ('mega' as const) : tx.value >= 10 ? ('whale' as const) : ('dolphin' as const),
            timestamp:     tx.timestamp.toISOString(),
          }));
          if (converted.length > 0) {
            rawTxs = converted;
            ds = 'live';
          }
        }
      } catch (err) {
        console.warn('[OnChainStore] Etherscan fetch failed, using simulated data:', (err as Error).message);
      }

      // Pre-filter: only pass txs that meet global significance floor
      const scoredTxs = rawTxs.map(tx => ({
        tx,
        breakdown: whaleEngine.scoreTx(tx),
      }));

      // ── §4.4 AlertTriggerSystem: check all alerts against scored txs ──────
      const triggerResults = triggerSystem.checkAndTriggerAlerts(
        activeAlerts,
        rawTxs,
      );

      let eventsCreated = 0;
      let newEvents     = { ...events };
      const newAlerts   = { ...alerts };
      const now         = new Date().toISOString();

      for (const result of triggerResults) {
        const alert = newAlerts[result.alertId];
        if (!alert) continue;

        // Use matched tx if available, otherwise create a synthetic entry
        const tx = result.matchedTx ?? rawTxs[0];
        if (!tx) continue;

        // Prune ring buffer before inserting
        newEvents = pruneEvents(newEvents, result.alertId, userId);

        const eventId = generateId();
        const event: OnChainEvent = {
          id:                 eventId,
          alertId:            result.alertId,
          userId,
          txHash:             tx.txHash,
          fromAddress:        tx.fromAddress,
          toAddress:          tx.toAddress,
          value:              tx.valueUsd,
          valueNative:        tx.valueNative,
          blockNumber:        tx.blockNumber,
          chain:              tx.chain,
          tokenSymbol:        tx.tokenSymbol,
          tokenStandard:      tx.tokenStandard,
          whaleTier:          tx.whaleTier,
          fromLabel:          tx.fromLabel,
          toLabel:            tx.toLabel,
          isRead:             false,
          timestamp:          now,
          significance:       result.significance,
          significanceReason: result.significanceReason,
        };

        newEvents[eventId] = event;
        eventsCreated++;

        // Update alert stats
        newAlerts[result.alertId] = {
          ...alert,
          triggerCount:    alert.triggerCount + 1,
          lastTriggeredAt: now,
        };

        // ── In-app notification with significance context ─────────────────
        if (alert.notifyInApp) {
          const tier  = WHALE_TIER_META[tx.whaleTier];
          const chain = CHAIN_META[tx.chain];
          const sigPct = Math.round(result.significance * 100);
          onChainNotify({
            type:    'trade',
            title:   `${tier.icon} ${tier.label} Alert — ${alert.name}`,
            message: `${tx.valueNative} (${(tx.valueUsd / 1_000_000).toFixed(2)}M) · ${chain.name} · significance ${sigPct}%`,
          });

          // ── P2: Push significant whale alerts to Lynx AI context ──
          if (tx.valueUsd >= 5_000_000 && result.significance >= 0.7) {
            onChainNotify({
              type:    'system',
              title:   `🐋 ${tier.icon} Major Whale Move Detected`,
              message: `${tx.tokenSymbol}: ${(tx.valueUsd / 1_000_000).toFixed(2)}M moved on ${chain.name}. ${result.significanceReason}. Consider checking exchange flows and smart money activity for confirmation.`,
            });
          }
        }
      }

      persist(EVENTS_KEY, newEvents);
      persist(ALERTS_KEY, newAlerts);
      set({ events: newEvents, alerts: newAlerts, dataSource: ds });

      return { eventsCreated };
    },

    // ── Admin ────────────────────────────────────────────────────────────────

    getGlobalStats: () => {
      const { alerts, events } = get();
      const allAlerts = Object.values(alerts);
      const allEvents = Object.values(events);

      const totalVolumeUsd  = allEvents.reduce((s, e) => s + e.value, 0);
      const avgEventValue   = allEvents.length > 0 ? totalVolumeUsd / allEvents.length : 0;
      const largestEvent    = allEvents.reduce<OnChainEvent | null>(
        (max, e) => (!max || e.value > max.value) ? e : max, null,
      );

      // By chain
      const chains: MonitoredChain[] = ['ethereum', 'bitcoin', 'bnb', 'solana', 'polygon'];
      const byChain: OnChainGlobalStats['byChain'] = {} as OnChainGlobalStats['byChain'];
      for (const chain of chains) {
        const chainAlerts = allAlerts.filter(a => a.chain === chain);
        const chainEvents = allEvents.filter(e => e.chain === chain);
        byChain[chain] = {
          alertCount: chainAlerts.length,
          eventCount: chainEvents.length,
          volumeUsd:  chainEvents.reduce((s, e) => s + e.value, 0),
        };
      }

      // By whale tier
      const whaleTiers: WhaleTier[] = ['shrimp', 'fish', 'dolphin', 'whale', 'mega'];
      const byWhaleTier: Record<WhaleTier, number> = {
        shrimp: 0, fish: 0, dolphin: 0, whale: 0, mega: 0,
      };
      for (const e of allEvents) byWhaleTier[e.whaleTier]++;

      // Top user by alerts
      const alertsByUser: Record<string, number> = {};
      for (const a of allAlerts) alertsByUser[a.userId] = (alertsByUser[a.userId] ?? 0) + 1;
      const topUserAlerts = Object.entries(alertsByUser).sort((a, b) => b[1] - a[1])[0];

      // Top user by events
      const eventsByUser: Record<string, number> = {};
      for (const e of allEvents) eventsByUser[e.userId] = (eventsByUser[e.userId] ?? 0) + 1;
      const topUserEvents = Object.entries(eventsByUser).sort((a, b) => b[1] - a[1])[0];

      return {
        totalAlerts:       allAlerts.length,
        activeAlerts:      allAlerts.filter(a => a.isActive).length,
        totalEvents:       allEvents.length,
        unreadEvents:      allEvents.filter(e => !e.isRead).length,
        totalVolumeUsd:    Math.round(totalVolumeUsd),
        avgEventValue:     Math.round(avgEventValue),
        largestEventUsd:   largestEvent?.value ?? 0,
        largestEventTxHash: largestEvent?.txHash ?? null,
        byChain,
        byWhaleTier,
        topUserByAlerts:   topUserAlerts ? { userId: topUserAlerts[0], count: topUserAlerts[1] } : null,
        topUserByEvents:   topUserEvents ? { userId: topUserEvents[0], count: topUserEvents[1] } : null,
      };
    },

    adminDeleteAlert: (alertId, _adminId) => {
      const { alerts, events } = get();
      if (!alerts[alertId]) return { ok: false, error: 'Alert not found.' };

      const newAlerts = { ...alerts };
      delete newAlerts[alertId];

      const newEvents = { ...events };
      Object.values(newEvents)
        .filter(e => e.alertId === alertId)
        .forEach(e => delete newEvents[e.id]);

      persist(ALERTS_KEY, newAlerts);
      persist(EVENTS_KEY, newEvents);
      set({ alerts: newAlerts, events: newEvents });
      return { ok: true };
    },

    adminClearUserEvents: (userId, _adminId) => {
      const { events } = get();
      const newEvents = { ...events };
      let cleared = 0;
      for (const [k, e] of Object.entries(newEvents)) {
        if (e.userId === userId) { delete newEvents[k]; cleared++; }
      }
      persist(EVENTS_KEY, newEvents);
      set({ events: newEvents });
      return { cleared };
    },
  };
});
