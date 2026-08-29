/**
 * contextEngine.ts — Lynx AI Context Engine
 * Maintains a live snapshot of the user's entire state across all stores.
 * Updated reactively via event listeners + auto-refresh from zustand stores.
 * Provides context summaries for AI prompting and guidance decisions.
 */

import { lynxEvents } from './eventSystem';
import { realDataConnector } from './realDataConnector';
import { cloudRecordStore } from './cloudData';

// ═══════════════════════════════════════════════════════════════════════════════
// Context Type Definition
// ═══════════════════════════════════════════════════════════════════════════════

export interface LynxContext {
  // ── Page ─────────────────────────────────────────────────────────────────
  page: string;
  previousPage: string | null;

  // ── Trading ──────────────────────────────────────────────────────────────
  symbol: string | null;
  leverage: number;
  balance: number;
  openPositions: number;
  totalPositions: number;
  dailyPnl: number;
  weeklyPnl: number;
  monthlyPnl: number;
  winRate: number;
  totalTrades: number;

  // ── Academy ──────────────────────────────────────────────────────────────
  level: number;
  totalXP: number;
  completedLessons: number;
  totalLessons: number;
  currentLesson: string | null;

  // ── User ─────────────────────────────────────────────────────────────────
  userId: string | null;
  plan: 'free' | 'pro' | 'pro_plus';
  language: string;
  sessionTime: number;
  lastActivity: number;

  // ── Sentiment (calculated by Brain Engine) ───────────────────────────────
  sentiment: 'neutral' | 'positive' | 'negative' | 'stressed' | 'confident';
  confidenceScore: number; // 0-100
  stressLevel: number; // 0-100

  // ── Metadata ─────────────────────────────────────────────────────────────
  lastUpdate: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LynxContextEngine — Singleton
// ═══════════════════════════════════════════════════════════════════════════════

type ContextSubscriber = (context: LynxContext) => void;

class LynxContextEngine {
  private context: LynxContext;
  private subscribers: ContextSubscriber[] = [];
  private updateInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.context = this.getDefaultContext();
    this.loadFromStorage();
    this.startAutoUpdate();
    this.setupEventListeners();
  }

  // ── Defaults ─────────────────────────────────────────────────────────────

  private getDefaultContext(): LynxContext {
    return {
      page: '/',
      previousPage: null,
      symbol: null,
      leverage: 1,
      balance: 100000,
      openPositions: 0,
      totalPositions: 0,
      dailyPnl: 0,
      weeklyPnl: 0,
      monthlyPnl: 0,
      winRate: 0,
      totalTrades: 0,
      level: 1,
      totalXP: 0,
      completedLessons: 0,
      totalLessons: 0,
      currentLesson: null,
      userId: null,
      plan: 'free',
      language: 'en',
      sessionTime: 0,
      lastActivity: Date.now(),
      sentiment: 'neutral',
      confidenceScore: 50,
      stressLevel: 30,
      lastUpdate: Date.now(),
    };
  }

  // ── Public Methods ───────────────────────────────────────────────────────

  /** Update one or more context fields */
  updateContext(updates: Partial<LynxContext>): void {
    this.context = { ...this.context, ...updates, lastUpdate: Date.now() };
    this.notifySubscribers();
    this.saveToStorage();
  }

  /** Get a snapshot of the current context */
  getContext(): LynxContext {
    return { ...this.context };
  }

  /** Subscribe to context changes. Returns unsubscribe function. */
  subscribe(callback: ContextSubscriber): () => void {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter((cb) => cb !== callback);
    };
  }

  /** Pull fresh data from the single source of truth (realDataConnector) */
  refreshFromStores(): void {
    try {
      const appData = realDataConnector.getAppData();
      this.updateContext({
        balance: 100000,
        openPositions: appData.trading?.openPositions || 0,
        totalPositions: appData.trading?.totalTrades || 0,
        winRate: appData.trading?.avgWinRate || 0,
        totalTrades: appData.trading?.totalTrades || 0,
        level: appData.academy?.avgLevel || 1,
        totalXP: appData.academy?.totalXP || 0,
        completedLessons: appData.academy?.completedLessons || 0,
        totalLessons: appData.academy?.totalLessons || 0,
      });
    } catch (error) {
      console.warn('[LynxContext] Failed to refresh from stores:', error);
    }
  }

  /** Clear context back to defaults */
  clearContext(): void {
    this.context = this.getDefaultContext();
    this.saveToStorage();
  }

  /** Generate a human-readable summary for AI prompting */
  getContextSummary(): string {
    const ctx = this.context;
    return [
      `User: Level ${ctx.level}, Plan: ${ctx.plan}`,
      `Current Page: ${ctx.page}`,
      `Trading: ${ctx.openPositions} open positions, ${ctx.totalTrades} total trades, ${ctx.winRate}% win rate`,
      `Balance: $${ctx.balance.toLocaleString()}`,
      `Academy: ${ctx.completedLessons}/${ctx.totalLessons} lessons completed`,
      `Sentiment: ${ctx.sentiment}, Stress: ${ctx.stressLevel}%`,
    ].join('\n');
  }

  // ── Private Methods ──────────────────────────────────────────────────────

  /** Increment session time every 60 seconds */
  private startAutoUpdate(): void {
    this.updateInterval = setInterval(() => {
      this.context.sessionTime += 60;
      this.saveToStorage();
    }, 60000);
  }

  /** React to events from the event system */
  private setupEventListeners(): void {
    lynxEvents.subscribe((event) => {
      switch (event.type) {
        case 'PAGE_VIEW':
          this.updateContext({
            previousPage: this.context.page,
            page: event.page,
            lastActivity: Date.now(),
          });
          break;

        case 'TRADE_OPEN':
          this.updateContext({
            symbol: event.symbol,
            leverage: event.leverage,
            openPositions: this.context.openPositions + 1,
          });
          break;

        case 'TRADE_CLOSE':
          this.updateContext({
            openPositions: Math.max(0, this.context.openPositions - 1),
            lastActivity: Date.now(),
          });
          break;

        case 'LEVERAGE_CHANGE':
          this.updateContext({
            leverage: event.newValue,
          });
          break;

        case 'LANGUAGE_CHANGE':
          this.updateContext({
            language: event.newLanguage,
          });
          break;
      }
    });
  }

  private notifySubscribers(): void {
    const snapshot = { ...this.context };
    for (const cb of this.subscribers) {
      try {
        cb(snapshot);
      } catch (err) {
        console.warn('[LynxContext] Subscriber error:', err);
      }
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem('cv_lynx_context', JSON.stringify(this.context));
    } catch (error) {
      console.warn('[LynxContext] Failed to save:', error);
    }
  }

  private loadFromStorage(): void {
    try {
      const data = localStorage.getItem('cv_lynx_context');
      if (data) {
        const saved = JSON.parse(data);
        this.context = { ...this.context, ...saved };
      }
    } catch (error) {
      console.warn('[LynxContext] Failed to load:', error);
    }
  }
}

export const lynxContext = new LynxContextEngine();
