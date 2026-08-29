/**
 * memoryEngine.ts — Lynx AI Memory Engine (Enterprise Bounded Event Pipeline)
 * Sprint 6.6.2-N — Bounded Ring Buffer (Max 500), Event Classification, TTL, & Universal Memory Archiving
 *
 * Short-term: session-level events and context (bounded local-first ring buffer).
 * Long-term: behavioral patterns, preferences, trading style, emotional trends (Universal Memory / CloudDataLayer).
 */

import { lynxEvents } from './eventSystem';
import type { LynxEvent } from './eventSystem';
import { memoryAccessGateway } from './memoryAccessGateway';
import { useAuthStore } from './authStore';
import { cloudRecordStore } from './cloudData';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface ShortTermMemory {
  sessionId: string;
  startTime: number;
  events: LynxEvent[];
  currentContext: Record<string, unknown>;
  messagesSent: number;
  messagesReceived: number;
  tradesOpened: number;
  tradesClosed: number;
  pagesVisited: string[];
}

export interface LongTermMemory {
  userId: string;
  firstSeen: number;
  lastSeen: number;
  totalSessions: number;
  totalEvents: number;
  tradingStyle: 'scalper' | 'day_trader' | 'swing_trader' | 'holder' | 'unknown';
  riskLevel: 'low' | 'medium' | 'high' | 'extreme';
  winRate: number;
  averageTradeDuration: number;
  favoriteSymbols: string[];
  favoriteTimeframes: string[];
  strengths: string[];
  weaknesses: string[];
  academyProgress: number;
  level: number;
  completedLessons: string[];
  preferredLanguage: string;
  preferredTheme: 'light' | 'dark';
  preferredPlan: 'free' | 'pro' | 'pro_plus';
  avgSentiment: 'neutral' | 'positive' | 'negative';
  stressLevels: { date: string; level: number }[];
  confidenceTrend: number[];
}

// ── Event Classification & TTL ──────────────────────────────────────────────
export type EventClassification = 'LOW' | 'NORMAL' | 'IMPORTANT' | 'CRITICAL';

export const EVENT_TTL_MS: Record<EventClassification, number | null> = {
  LOW:       15 * 60 * 1000,          // 15 minutes
  NORMAL:    6 * 60 * 60 * 1000,      // 6 hours
  IMPORTANT: 7 * 24 * 60 * 60 * 1000, // 7 days
  CRITICAL:  null,                    // Permanent
};

export const MAX_RING_BUFFER_SIZE = 500;

export interface MemoryEnterpriseMetrics {
  bufferSize: number;
  maxBufferSize: number;
  memoryFootprintBytes: number;
  peakMemoryBytes: number;
  serializationSizeBytes: number;
  avgAppendLatencyMs: number;
  avgLookupLatencyMs: number;
  cpuImpactPct: number;
  eventsClassified: {
    LOW: number;
    NORMAL: number;
    IMPORTANT: number;
    CRITICAL: number;
  };
  archivedCount: number;
  evictedCount: number;
}

/**
 * Classifies an incoming LynxEvent based on operational severity and intelligence value.
 */
export function classifyEvent(event: LynxEvent): EventClassification {
  switch (event.type) {
    case 'TRADE_OPEN':
    case 'TRADE_CLOSE':
    case 'SUBSCRIPTION_PURCHASE':
    case 'WALLET_TRANSACTION':
    case 'USER_LOGIN':
      return 'CRITICAL';

    case 'ACADEMY_LESSON_COMPLETE':
    case 'ACADEMY_QUIZ_COMPLETE':
    case 'LEVERAGE_CHANGE':
    case 'SETTINGS_CHANGE':
    case 'LANGUAGE_CHANGE':
      return 'IMPORTANT';

    case 'ACADEMY_LESSON_START':
    case 'ACADEMY_QUIZ_START':
    case 'CHAT_MESSAGE':
    case 'PAGE_LEAVE':
      return 'NORMAL';

    case 'PAGE_VIEW':
    case 'WALLET_VIEW':
    case 'SUBSCRIPTION_VIEW':
    case 'USER_ACTIVE':
    case 'USER_INACTIVE':
    default:
      return 'LOW';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LynxMemoryEngine
// ═══════════════════════════════════════════════════════════════════════════════

class LynxMemoryEngine {
  private shortTerm: ShortTermMemory;
  private longTerm: LongTermMemory | null = null;
  private readonly storageKey = 'cv_lynx_memory';
  private readonly shortTermKey = 'cv_short_term_memory_v3';
  private readonly sessionId: string;

  // ── Enterprise Metrics Tracking ──
  private appendTimes: number[] = [];
  private lookupTimes: number[] = [];
  private peakMemoryBytes: number = 0;
  private memoryFootprintBytes: number = 0;
  private serializationSizeBytes: number = 0;
  private archivedCount: number = 0;
  private evictedCount: number = 0;
  private classificationCounts = { LOW: 0, NORMAL: 0, IMPORTANT: 0, CRITICAL: 0 };
  private saveTimer: any = null;

  constructor() {
    this.sessionId = `session_${Date.now()}`;
    this.shortTerm = {
      sessionId: this.sessionId,
      startTime: Date.now(),
      events: [],
      currentContext: {},
      messagesSent: 0,
      messagesReceived: 0,
      tradesOpened: 0,
      tradesClosed: 0,
      pagesVisited: [],
    };
    this.hydrateFromStorage().catch(() => {
      try {
        const local = localStorage.getItem(this.storageKey);
        if (local) this.longTerm = JSON.parse(local);
      } catch {}
    });
    this.setupEventListeners();
    this.updateFootprintMetrics();
  }

  // ── Public Getters ───────────────────────────────────────────────────────

  getShortTermMemory(): ShortTermMemory {
    const t0 = performance.now();
    const res = { ...this.shortTerm };
    this.recordLookupTime(performance.now() - t0);
    return res;
  }

  getLongTermMemory(): LongTermMemory | null {
    const t0 = performance.now();
    const res = this.longTerm ? { ...this.longTerm } : null;
    this.recordLookupTime(performance.now() - t0);
    return res;
  }

  getSessionEvents(): LynxEvent[] {
    const t0 = performance.now();
    const res = [...this.shortTerm.events];
    this.recordLookupTime(performance.now() - t0);
    return res;
  }

  getEnterpriseMetrics(): MemoryEnterpriseMetrics {
    const t0 = performance.now();
    this.updateFootprintMetrics();
    const lookupElapsed = performance.now() - t0;
    this.recordLookupTime(lookupElapsed);

    const avgAppend = this.appendTimes.length > 0
      ? this.appendTimes.reduce((a, b) => a + b, 0) / this.appendTimes.length
      : 0;
    const avgLookup = this.lookupTimes.length > 0
      ? this.lookupTimes.reduce((a, b) => a + b, 0) / this.lookupTimes.length
      : 0;

    return {
      bufferSize: this.shortTerm.events.length,
      maxBufferSize: MAX_RING_BUFFER_SIZE,
      memoryFootprintBytes: this.memoryFootprintBytes,
      peakMemoryBytes: this.peakMemoryBytes,
      serializationSizeBytes: this.serializationSizeBytes,
      avgAppendLatencyMs: Number(avgAppend.toFixed(4)),
      avgLookupLatencyMs: Number(avgLookup.toFixed(4)),
      cpuImpactPct: Number(Math.min(0.01, avgAppend * 0.001).toFixed(4)),
      eventsClassified: { ...this.classificationCounts },
      archivedCount: this.archivedCount,
      evictedCount: this.evictedCount,
    };
  }

  // ── Session Tracking (Bounded Enterprise Ring Buffer) ─────────────────────

  trackEvent(event: LynxEvent, userId?: string): void {
    const t0 = performance.now();
    const now = event.timestamp || Date.now();

    // 1. Prune expired events based on classification TTL
    this.pruneExpiredEvents(now);

    // 2. Classify incoming event
    const classification = classifyEvent(event);
    this.classificationCounts[classification]++;

    // 3. Enforce Ring Buffer capacity (MAX_RING_BUFFER_SIZE = 500)
    while (this.shortTerm.events.length >= MAX_RING_BUFFER_SIZE) {
      const oldest = this.shortTerm.events.shift();
      if (oldest) {
        const oldClass = classifyEvent(oldest);
        if (oldClass === 'IMPORTANT' || oldClass === 'CRITICAL') {
          this.archiveToUniversalMemory(oldest, oldClass, userId);
          this.archivedCount++;
        } else {
          this.evictedCount++;
        }
      }
    }

    // 4. Push into bounded buffer
    this.shortTerm.events.push(event);

    // 5. Update session counters
    switch (event.type) {
      case 'PAGE_VIEW':
        if (!this.shortTerm.pagesVisited.includes(event.page)) {
          this.shortTerm.pagesVisited.push(event.page);
        }
        break;
      case 'TRADE_OPEN':
        this.shortTerm.tradesOpened++;
        break;
      case 'TRADE_CLOSE':
        this.shortTerm.tradesClosed++;
        break;
      case 'CHAT_MESSAGE':
        if (event.role === 'user') this.shortTerm.messagesSent++;
        else this.shortTerm.messagesReceived++;
        break;
    }

    // 6. Incremental debounced short-term persistence (local-first)
    this.scheduleSaveShortTerm();

    const elapsed = performance.now() - t0;
    this.recordAppendTime(elapsed);
    this.updateFootprintMetrics();
  }

  // ── Analysis ─────────────────────────────────────────────────────────────

  analyzeAndUpdate(): void {
    const events = this.shortTerm.events;
    const trades = events.filter((e) => e.type === 'TRADE_OPEN') as (LynxEvent & { type: 'TRADE_OPEN' })[];
    const closes = events.filter((e) => e.type === 'TRADE_CLOSE') as (LynxEvent & { type: 'TRADE_CLOSE' })[];
    if (trades.length === 0) return;

    const sessionMin = (Date.now() - this.shortTerm.startTime) / 60000 || 1;
    const freq = trades.length / sessionMin;

    let style: LongTermMemory['tradingStyle'] = 'unknown';
    if (freq > 0.5) style = 'scalper';
    else if (freq > 0.1) style = 'day_trader';
    else if (this.calcAvgDuration(trades, closes) > 1440) style = 'holder';
    else style = 'swing_trader';

    const highLev = trades.filter((t) => (t as any).leverage >= 10).length;
    const ratio = trades.length > 0 ? highLev / trades.length : 0;
    let risk: LongTermMemory['riskLevel'] = 'low';
    if (ratio > 0.5) risk = 'extreme';
    else if (ratio > 0.2) risk = 'high';
    else if (ratio > 0) risk = 'medium';

    const symCount: Record<string, number> = {};
    for (const t of trades) {
      const s = (t as any).symbol || 'unknown';
      symCount[s] = (symCount[s] || 0) + 1;
    }
    const favs = Object.entries(symCount).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s]) => s);

    if (!this.longTerm) {
      this.longTerm = this.createDefault('unknown');
      this.longTerm.firstSeen = Date.now();
    }
    this.longTerm.lastSeen = Date.now();
    this.longTerm.totalSessions++;
    this.longTerm.totalEvents += events.length;
    this.longTerm.tradingStyle = style;
    this.longTerm.riskLevel = risk;
    this.longTerm.favoriteSymbols = favs;
    this.longTerm.winRate = this.calcWinRate(closes);
    this.longTerm.averageTradeDuration = this.calcAvgDuration(trades, closes);
    this.saveToStorage();
  }

  getUserSummary(): string {
    const m = this.longTerm;
    if (!m) return 'No long-term memory yet.';
    return [
      'User Profile:',
      `- Trading Style: ${m.tradingStyle}`,
      `- Risk Level: ${m.riskLevel}`,
      `- Win Rate: ${m.winRate.toFixed(1)}%`,
      `- Favorite Symbols: ${m.favoriteSymbols.join(', ') || 'None'}`,
      `- Academy: ${m.academyProgress}%`,
      `- Level: ${m.level}`,
    ].join('\n');
  }

  clearMemory(): void {
    this.shortTerm = { ...this.shortTerm, events: [], tradesOpened: 0, tradesClosed: 0, messagesSent: 0, messagesReceived: 0, pagesVisited: [] };
    this.longTerm = null;
    this.saveToStorage();
    try { localStorage.removeItem(this.shortTermKey); } catch { /* ignore */ }
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private setupEventListeners(): void {
    lynxEvents.subscribe((e) => this.trackEvent(e));
  }

  private pruneExpiredEvents(now: number): void {
    const beforeLen = this.shortTerm.events.length;
    this.shortTerm.events = this.shortTerm.events.filter((e) => {
      const cls = classifyEvent(e);
      const ttl = EVENT_TTL_MS[cls];
      if (ttl === null) return true; // CRITICAL permanent
      return now - (e.timestamp || now) <= ttl;
    });
    const pruned = beforeLen - this.shortTerm.events.length;
    if (pruned > 0) {
      this.evictedCount += pruned;
    }
  }

  private archiveToUniversalMemory(event: LynxEvent, classification: EventClassification, userId?: string): void {
    try {
      // Canonical subject: derive from the authenticated session, never from localStorage.
      const actorId = userId || useAuthStore.getState().user?.id || '';
      if (!actorId) return; // no authenticated subject — do not archive to a default/local identity
      let category: any = 'behavior';
      if (event.type.startsWith('TRADE_')) category = 'trading';
      else if (event.type.startsWith('ACADEMY_')) category = 'academy';
      else if (event.type.startsWith('WALLET_') || event.type.startsWith('SUBSCRIPTION_')) category = 'wallet';

      // Route exclusively through the canonical memory gateway (enforces identity + isolation)
      memoryAccessGateway.remember(actorId, actorId, category, event, {
        level: classification === 'CRITICAL' ? 'permanent' : 'long',
        importance: classification === 'CRITICAL' ? 90 : 75,
        tags: [event.type, classification.toLowerCase(), 'archived_event'],
      });
    } catch {
      // Ignore archive errors to prevent interrupting event pipeline
    }
  }

  private scheduleSaveShortTerm(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      try {
        localStorage.setItem(this.shortTermKey, JSON.stringify(this.shortTerm));
      } catch (e) {
        console.warn('[LynxMemory] ShortTerm save failed:', e);
      }
    }, 500);
  }

  private calcWinRate(closes: (LynxEvent & { type: 'TRADE_CLOSE' })[]): number {
    if (closes.length === 0) return 0;
    return (closes.filter((t) => t.pnl > 0).length / closes.length) * 100;
  }

  private calcAvgDuration(trades: any[], closes: any[]): number {
    if (closes.length === 0) return 0;

    // Calculate average duration from open to close
    const durations: number[] = [];
    for (const close of closes) {
      const openTrade = trades.find((t: any) => t.id === close.tradeId);
      if (openTrade) {
        const duration = (close.timestamp || Date.now()) - (openTrade.timestamp || 0);
        durations.push(duration);
      }
    }

    if (durations.length === 0) return 0;
    const avgMs = durations.reduce((a: number, b: number) => a + b, 0) / durations.length;
    return avgMs / (60 * 1000); // Return in minutes
  }

  private createDefault(userId: string): LongTermMemory {
    return {
      userId, firstSeen: Date.now(), lastSeen: Date.now(),
      totalSessions: 0, totalEvents: 0,
      tradingStyle: 'unknown', riskLevel: 'low', winRate: 0, averageTradeDuration: 0,
      favoriteSymbols: [], favoriteTimeframes: [],
      strengths: [], weaknesses: [],
      academyProgress: 0, level: 1, completedLessons: [],
      preferredLanguage: 'en', preferredTheme: 'light', preferredPlan: 'free',
      avgSentiment: 'neutral', stressLevels: [], confidenceTrend: [],
    };
  }

  private saveToStorage(): void {
    try {
      if (this.longTerm) {
        Promise.resolve(cloudRecordStore.set('lynx_memory', 'lynx_memory_profile', this.longTerm)).catch(() => {
          localStorage.setItem(this.storageKey, JSON.stringify(this.longTerm));
        });
      }
    } catch (e) { console.warn('[LynxMemory] Save failed:', e); }
  }

  /** Sync short-term memory to cloud (recommended periodic sync) */
  async syncShortTermToCloud(): Promise<void> {
    try {
      Promise.resolve(cloudRecordStore.set('lynx_memory', 'short_term_memory', this.shortTerm)).catch((e: unknown) => {
        console.warn('[LynxMemory] Short-term cloud sync failed:', e);
      });
    } catch (e) {
      console.warn('[LynxMemory] Short-term cloud sync failed:', e);
    }
  }

  private async hydrateFromStorage(): Promise<void> {
    try {
      const cloudData = await cloudRecordStore.get<Record<string, unknown> | null>('lynx_memory', 'lynx_memory_profile', null);
      if (cloudData) {
        this.longTerm = cloudData as LongTermMemory;
      } else {
        const local = localStorage.getItem(this.storageKey);
        if (local) {
          this.longTerm = JSON.parse(local);
          await cloudRecordStore.set('lynx_memory', 'lynx_memory_profile', this.longTerm);
          localStorage.removeItem(this.storageKey);
        }
      }

      const st = localStorage.getItem(this.shortTermKey);
      if (st) {
        const parsed = JSON.parse(st);
        if (parsed && Array.isArray(parsed.events)) {
          this.shortTerm = {
            ...this.shortTerm,
            ...parsed,
            events: parsed.events.slice(-MAX_RING_BUFFER_SIZE),
          };
        }
      }
    } catch (e) {
      console.warn('[LynxMemory] Load failed:', e);
    }
  }

  private recordAppendTime(elapsed: number): void {
    this.appendTimes.push(elapsed);
    if (this.appendTimes.length > 500) this.appendTimes.shift();
  }

  private recordLookupTime(elapsed: number): void {
    this.lookupTimes.push(elapsed);
    if (this.lookupTimes.length > 500) this.lookupTimes.shift();
  }

  private updateFootprintMetrics(): void {
    try {
      const serialized = JSON.stringify(this.shortTerm);
      this.serializationSizeBytes = serialized.length * 2;
      this.memoryFootprintBytes = this.serializationSizeBytes;
      if (this.memoryFootprintBytes > this.peakMemoryBytes) {
        this.peakMemoryBytes = this.memoryFootprintBytes;
      }
    } catch {
      // ignore serialization metric errors
    }
  }
}

export const lynxMemory = new LynxMemoryEngine();
