/**
 * nftAlertEngine.ts — §4.4 NFT Alert System
 *
 * Implements the spec's NFTAlertSystem class as a self-contained engine.
 *
 * Two check loops (per spec):
 *
 *   checkPriceAlerts()
 *     - Loads all active alerts from localStorage
 *     - For each: compares current floor vs target price
 *     - If triggered: creates an AlertEvent + dispatches in-app notification
 *     - Supports 'above' and 'below' alert types
 *
 *   checkWhaleActivity()
 *     - Loads tracked wallets
 *     - For each wallet: checks recent whale activity from the sales feed
 *     - Avoids duplicate notifications via a "notified hashes" set
 *     - Creates WhaleAlert events and dispatches notifications
 *
 * The engine is started/stopped via startAlertLoop() / stopAlertLoop()
 * and runs every ALERT_CHECK_INTERVAL_MS.
 *
 * Persistence:
 *   cryptoverse_nft_alerts_v1        — user-defined alert rules
 *   cryptoverse_nft_alert_events_v1  — triggered alert history
 *   cryptoverse_nft_whale_alerts_v1  — whale activity events
 *   cryptoverse_nft_notified_hashes  — dedupe set for whale notifications
 */

import { generateId } from './strategyUtils';
import type { NFTChain } from './nftTypes';

// ── §4.4 Alert rule types ────────────────────────────────────────────────────

export type NFTPriceAlertType = 'above' | 'below';

export interface NFTPriceAlert {
  id:             string;
  userId:         string;
  collectionSlug: string;
  collectionName: string;
  chain:          NFTChain;
  type:           NFTPriceAlertType;   // 'above' or 'below'
  targetPrice:    number;              // native currency floor threshold
  createdAt:      string;
  isActive:       boolean;
  triggeredCount: number;
}

/** Event created each time an alert fires. */
export interface AlertEvent {
  id:             string;
  alertId:        string;
  userId:         string;
  collectionSlug: string;
  collectionName: string;
  currentPrice:   number;
  targetPrice:    number;
  type:           NFTPriceAlertType;
  chain:          NFTChain;
  timestamp:      string;
}

/** Tracked wallet entry for whale notifications. */
export interface TrackedWallet {
  id:            string;
  userId:        string;
  address:       string;
  name:          string;
  chain:         NFTChain;
  isActive:      boolean;
}

/** Whale activity event created when tracked wallet acts. */
export interface WhaleAlertEvent {
  id:            string;
  walletAddress: string;
  walletName:    string;
  action:        'bought' | 'sold' | 'listed';
  collection:    string;
  tokenId:       string;
  price:         number;
  chain:         NFTChain;
  timestamp:     string;
}

// ── Notification dispatcher interface ────────────────────────────────────────

export type NotificationPayload = {
  title:   string;
  message: string;
  type:    'nft_alert' | 'whale_alert' | 'price_drop' | 'price_pump';
};

type NotificationHandler = (payload: NotificationPayload) => void;

// ── Storage keys ──────────────────────────────────────────────────────────────

const ALERTS_KEY    = 'cryptoverse_nft_alerts_v1';
const EVENTS_KEY    = 'cryptoverse_nft_alert_events_v1';
const WHALE_KEY     = 'cryptoverse_nft_whale_alerts_v1';
const NOTIFIED_KEY  = 'cryptoverse_nft_notified_hashes';
const WALLETS_KEY   = 'cryptoverse_nft_tracked_wallets_engine_v1';

const MAX_EVENTS    = 100;
const MAX_WHALE     = 200;
const MAX_NOTIFIED  = 500;

function ls<T>(key: string, def: T): T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? def; } catch { return def; }
}
function ss(key: string, v: unknown) { localStorage.setItem(key, JSON.stringify(v)); }

// ── Floor price accessor ──────────────────────────────────────────────────────

type FloorFetcher = (slug: string) => number | null;
type SalesFetcher = () => Array<{ txHash: string; collectionSlug: string; price: number; fromAddress: string; toAddress: string; timestamp: string }>;

let _floorFetcher: FloorFetcher | null = null;
let _salesFetcher: SalesFetcher | null = null;

export function registerAlertFloorFetcher(fn: FloorFetcher)  { _floorFetcher = fn; }
export function registerAlertSalesFetcher(fn: SalesFetcher)  { _salesFetcher = fn; }

// ── NFT Alert Engine ─────────────────────────────────────────────────────────

export class NFTAlertEngine {
  private _handlers:  NotificationHandler[] = [];
  private _loopTimer: ReturnType<typeof setInterval> | null = null;

  /** §4.4: Register a notification handler (toast, push, etc.). */
  onNotification(handler: NotificationHandler) {
    this._handlers.push(handler);
  }

  private _dispatch(payload: NotificationPayload) {
    for (const h of this._handlers) { try { h(payload); } catch { /* ignore */ } }
  }

  // ── §4.4 checkPriceAlerts ────────────────────────────────────────────────

  /**
   * checkPriceAlerts
   *
   * Mirrors spec's NFTAlertSystem.checkPriceAlerts():
   *   1. Load all active alerts
   *   2. For each: get current floor price
   *   3. Determine if alert type ('above' or 'below') is triggered
   *   4. Create AlertEvent + send notification
   */
  checkPriceAlerts(): AlertEvent[] {
    const alerts = this.getActiveAlerts();
    const fired: AlertEvent[] = [];

    for (const alert of alerts) {
      if (!alert.isActive) continue;

      const currentPrice = _floorFetcher?.(alert.collectionSlug) ?? null;
      if (currentPrice === null) continue;

      const targetPrice = alert.targetPrice;
      let triggered     = false;
      let triggerType: NFTPriceAlertType = alert.type;

      // §4.4 exact spec logic:
      if (alert.type === 'above' && currentPrice >= targetPrice) {
        triggered = true; triggerType = 'above';
      } else if (alert.type === 'below' && currentPrice <= targetPrice) {
        triggered = true; triggerType = 'below';
      }

      if (triggered) {
        // §4.4 createAlertEvent:
        const event: AlertEvent = {
          id:             generateId(),
          alertId:        alert.id,
          userId:         alert.userId,
          collectionSlug: alert.collectionSlug,
          collectionName: alert.collectionName,
          currentPrice,
          targetPrice,
          type:           triggerType,
          chain:          alert.chain,
          timestamp:      new Date().toISOString(),
        };

        this._appendAlertEvent(event);
        fired.push(event);

        // Update trigger count (don't spam: pause after 3 triggers)
        const updatedAlert = { ...alert, triggeredCount: alert.triggeredCount + 1 };
        if (updatedAlert.triggeredCount >= 3) updatedAlert.isActive = false;
        this._updateAlert(updatedAlert);

        // §4.4 sendNotification:
        this._dispatch({
          title:   `Price Alert: ${alert.collectionName}`,
          message: `Floor price is now ${currentPrice.toFixed(4)} ${this._chainSymbol(alert.chain)} (${triggerType} ${targetPrice.toFixed(4)} ${this._chainSymbol(alert.chain)})`,
          type:    triggerType === 'above' ? 'price_pump' : 'price_drop',
        });
      }
    }

    return fired;
  }

  // ── §4.4 checkWhaleActivity ──────────────────────────────────────────────

  /**
   * checkWhaleActivity
   *
   * Mirrors spec's NFTAlertSystem.checkWhaleActivity():
   *   1. Load tracked wallets
   *   2. For each: fetch recent sales activity (last 60 min)
   *   3. Skip already-notified txHashes
   *   4. Create WhaleAlertEvent + send notification
   */
  checkWhaleActivity(): WhaleAlertEvent[] {
    const wallets  = this.getTrackedWallets().filter(w => w.isActive);
    const sales    = _salesFetcher?.() ?? [];
    const notified = new Set<string>(ls<string[]>(NOTIFIED_KEY, []));
    const now      = Date.now();
    const fired: WhaleAlertEvent[] = [];

    for (const wallet of wallets) {
      // Find sales in last 60 min involving this wallet
      const recentActivity = sales.filter(s => {
        const ageMs = now - new Date(s.timestamp).getTime();
        const isAddr = s.fromAddress === wallet.address || s.toAddress === wallet.address;
        return ageMs < 3_600_000 && isAddr;
      });

      for (const activity of recentActivity) {
        if (notified.has(activity.txHash)) continue;

        const action: 'bought' | 'sold' = activity.toAddress === wallet.address ? 'bought' : 'sold';

        // §4.4 createWhaleAlert:
        const event: WhaleAlertEvent = {
          id:            generateId(),
          walletAddress: wallet.address,
          walletName:    wallet.name,
          action,
          collection:    activity.collectionSlug,
          tokenId:       '',
          price:         activity.price,
          chain:         wallet.chain,
          timestamp:     activity.timestamp,
        };
        this._appendWhaleEvent(event);
        fired.push(event);

        // §4.4 sendNotification:
        this._dispatch({
          title:   `🐋 Whale Alert: ${wallet.name || wallet.address.slice(0, 10)}`,
          message: `${action} ${activity.collectionSlug} for ${activity.price.toFixed(4)} ${this._chainSymbol(wallet.chain)}`,
          type:    'whale_alert',
        });

        notified.add(activity.txHash);
      }
    }

    // Persist updated notified set (cap size)
    const arr = Array.from(notified).slice(-MAX_NOTIFIED);
    ss(NOTIFIED_KEY, arr);

    return fired;
  }

  // ── Alert CRUD ────────────────────────────────────────────────────────────

  createAlert(params: {
    userId:         string;
    collectionSlug: string;
    collectionName: string;
    chain:          NFTChain;
    type:           NFTPriceAlertType;
    targetPrice:    number;
  }): NFTPriceAlert {
    const alert: NFTPriceAlert = {
      id:             generateId(),
      userId:         params.userId,
      collectionSlug: params.collectionSlug,
      collectionName: params.collectionName,
      chain:          params.chain,
      type:           params.type,
      targetPrice:    params.targetPrice,
      createdAt:      new Date().toISOString(),
      isActive:       true,
      triggeredCount: 0,
    };
    const all = this.getAllAlerts();
    all.push(alert);
    ss(ALERTS_KEY, all);
    return alert;
  }

  getActiveAlerts(): NFTPriceAlert[] {
    return this.getAllAlerts().filter(a => a.isActive);
  }

  getAllAlerts(): NFTPriceAlert[] {
    return ls<NFTPriceAlert[]>(ALERTS_KEY, []);
  }

  deleteAlert(alertId: string) {
    const updated = this.getAllAlerts().filter(a => a.id !== alertId);
    ss(ALERTS_KEY, updated);
  }

  toggleAlert(alertId: string) {
    const updated = this.getAllAlerts().map(a =>
      a.id === alertId ? { ...a, isActive: !a.isActive, triggeredCount: 0 } : a
    );
    ss(ALERTS_KEY, updated);
  }

  // ── Alert events ──────────────────────────────────────────────────────────

  getAlertEvents(limit = 50): AlertEvent[] {
    return ls<AlertEvent[]>(EVENTS_KEY, []).slice(-limit).reverse();
  }

  clearAlertEvents() { ss(EVENTS_KEY, []); }

  // ── Whale alert events ────────────────────────────────────────────────────

  getWhaleAlertEvents(limit = 50): WhaleAlertEvent[] {
    return ls<WhaleAlertEvent[]>(WHALE_KEY, []).slice(-limit).reverse();
  }

  // ── Wallet CRUD ───────────────────────────────────────────────────────────

  addTrackedWallet(params: { userId: string; address: string; name: string; chain: NFTChain }): TrackedWallet {
    const wallet: TrackedWallet = { id: generateId(), ...params, isActive: true };
    const all = this.getTrackedWallets();
    all.push(wallet);
    ss(WALLETS_KEY, all);
    return wallet;
  }

  getTrackedWallets(): TrackedWallet[] {
    return ls<TrackedWallet[]>(WALLETS_KEY, []);
  }

  removeTrackedWallet(walletId: string) {
    ss(WALLETS_KEY, this.getTrackedWallets().filter(w => w.id !== walletId));
  }

  // ── Loop control ──────────────────────────────────────────────────────────

  /** Start continuous alert checking every intervalMs. */
  startAlertLoop(intervalMs = 30_000) {
    if (this._loopTimer) return;
    this._loopTimer = setInterval(() => {
      this.checkPriceAlerts();
      this.checkWhaleActivity();
    }, intervalMs);
  }

  /** Stop the alert check loop. */
  stopAlertLoop() {
    if (this._loopTimer) { clearInterval(this._loopTimer); this._loopTimer = null; }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _chainSymbol(chain: NFTChain): string {
    return { ethereum: 'ETH', solana: 'SOL', polygon: 'MATIC' }[chain] ?? chain;
  }

  private _appendAlertEvent(event: AlertEvent) {
    const events = ls<AlertEvent[]>(EVENTS_KEY, []);
    events.push(event);
    ss(EVENTS_KEY, events.slice(-MAX_EVENTS));
  }

  private _appendWhaleEvent(event: WhaleAlertEvent) {
    const events = ls<WhaleAlertEvent[]>(WHALE_KEY, []);
    events.push(event);
    ss(WHALE_KEY, events.slice(-MAX_WHALE));
  }

  private _updateAlert(alert: NFTPriceAlert) {
    const all = this.getAllAlerts().map(a => a.id === alert.id ? alert : a);
    ss(ALERTS_KEY, all);
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _alertEngine: NFTAlertEngine | null = null;

export function getNFTAlertEngine(): NFTAlertEngine {
  if (!_alertEngine) _alertEngine = new NFTAlertEngine();
  return _alertEngine;
}
