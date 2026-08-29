/**
 * eventSystem.ts — Lynx AI Event System
 * Core event infrastructure for tracking all user activity across CryptoVerse HQ.
 * Used by Lynx AI for context awareness, behavior analysis, and proactive guidance.
 * 
 * Architecture:
 * - Singleton LynxEventSystem with localStorage persistence
 * - Typed events for pages, trading, academy, wallet, subscription, settings, chat
 * - Subscribe/unsubscribe pattern for reactive listeners
 * - Auto-prunes to max 10,000 events
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Event Type Definitions
// ═══════════════════════════════════════════════════════════════════════════════

export type LynxEvent =
  // ── Page Events ──────────────────────────────────────────────────────────
  | { type: 'PAGE_VIEW'; page: string; timestamp: number }
  | { type: 'PAGE_LEAVE'; page: string; duration: number; timestamp: number }

  // ── Trading Events ───────────────────────────────────────────────────────
  | { type: 'TRADE_OPEN'; symbol: string; side: string; leverage: number; amount: number; price: number; timestamp: number }
  | { type: 'TRADE_CLOSE'; symbol: string; pnl: number; pnlPercent: number; timestamp: number }
  | { type: 'TRADE_CANCEL'; symbol: string; reason: string; timestamp: number }
  | { type: 'LEVERAGE_CHANGE'; symbol: string; oldValue: number; newValue: number; timestamp: number }

  // ── Academy Events ───────────────────────────────────────────────────────
  | { type: 'ACADEMY_LESSON_START'; lessonId: string; moduleId: string; timestamp: number }
  | { type: 'ACADEMY_LESSON_COMPLETE'; lessonId: string; moduleId: string; duration: number; timestamp: number }
  | { type: 'ACADEMY_QUIZ_START'; moduleId: string; questionCount: number; timestamp: number }
  | { type: 'ACADEMY_QUIZ_COMPLETE'; moduleId: string; score: number; passed: boolean; timestamp: number }

  // ── Wallet Events ────────────────────────────────────────────────────────
  | { type: 'WALLET_VIEW'; timestamp: number }
  | { type: 'WALLET_TRANSACTION'; txType: 'deposit' | 'withdraw' | 'purchase'; amount: number; currency: string; timestamp: number }

  // ── Subscription Events ──────────────────────────────────────────────────
  | { type: 'SUBSCRIPTION_VIEW'; plan: string; timestamp: number }
  | { type: 'SUBSCRIPTION_PURCHASE'; plan: string; price: number; method: 'crypto' | 'cp'; timestamp: number }

  // ── Settings Events ──────────────────────────────────────────────────────
  | { type: 'SETTINGS_CHANGE'; setting: string; oldValue: unknown; newValue: unknown; timestamp: number }
  | { type: 'LANGUAGE_CHANGE'; oldLanguage: string; newLanguage: string; timestamp: number }

  // ── User Behavior Events ─────────────────────────────────────────────────
  | { type: 'USER_INACTIVE'; duration: number; timestamp: number }
  | { type: 'USER_ACTIVE'; timestamp: number }
  | { type: 'USER_LOGIN'; timestamp: number }
  | { type: 'USER_LOGOUT'; timestamp: number }

  // ── Chat Events ──────────────────────────────────────────────────────────
  | { type: 'CHAT_OPEN'; timestamp: number }
  | { type: 'CHAT_CLOSE'; timestamp: number }
  | { type: 'CHAT_MESSAGE'; role: 'user' | 'assistant'; content: string; timestamp: number };

// ═══════════════════════════════════════════════════════════════════════════════
// LynxEventSystem — Singleton
// ═══════════════════════════════════════════════════════════════════════════════

type EventListener = (event: LynxEvent) => void;

class LynxEventSystem {
  private events: LynxEvent[] = [];
  private listeners: EventListener[] = [];
  private readonly storageKey = 'cv_lynx_events';
  private readonly maxEvents = 10000;

  constructor() {
    this.loadFromStorage();
  }

  // ── Emit ──────────────────────────────────────────────────────────────────
  emit(event: Omit<LynxEvent, 'timestamp'>): void {
    const fullEvent = { ...event, timestamp: Date.now() } as LynxEvent;
    this.events.push(fullEvent);

    // Notify all listeners
    for (const listener of this.listeners) {
      try {
        listener(fullEvent);
      } catch (err) {
        console.warn('[LynxEventSystem] Listener error:', err);
      }
    }

    this.saveToStorage();

    // Debug logging in development
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
      console.log(`🦊 [Lynx Event] ${fullEvent.type}`, fullEvent);
    }
  }

  // ── Subscribe ─────────────────────────────────────────────────────────────
  /** Subscribe to all events. Returns an unsubscribe function. */
  subscribe(listener: EventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  // ── Query Methods ─────────────────────────────────────────────────────────

  /** Get all events */
  getEvents(): LynxEvent[] {
    return this.events;
  }

  /** Get events filtered by type */
  getEventsByType(type: string): LynxEvent[] {
    return this.events.filter((e) => e.type === type);
  }

  /** Get the most recent N events */
  getRecentEvents(limit = 100): LynxEvent[] {
    return this.events.slice(-limit);
  }

  /** Get PAGE_VIEW events for a specific page */
  getEventsForPage(page: string): LynxEvent[] {
    return this.events.filter(
      (e) => e.type === 'PAGE_VIEW' && (e as { page: string }).page === page,
    );
  }

  /** Get count of each event type */
  getEventStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const e of this.events) {
      stats[e.type] = (stats[e.type] || 0) + 1;
    }
    return stats;
  }

  // ── Maintenance ───────────────────────────────────────────────────────────

  /** Clear all events */
  clearEvents(): void {
    this.events = [];
    this.saveToStorage();
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  private saveToStorage(): void {
    try {
      // Prune to max allowed events
      if (this.events.length > this.maxEvents) {
        this.events = this.events.slice(-this.maxEvents);
      }
      localStorage.setItem(this.storageKey, JSON.stringify(this.events));
    } catch (error) {
      console.warn('[LynxEventSystem] Failed to save events:', error);
    }
  }

  private loadFromStorage(): void {
    try {
      const data = localStorage.getItem(this.storageKey);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          this.events = parsed;
        }
      }
    } catch (error) {
      console.warn('[LynxEventSystem] Failed to load events:', error);
    }
  }
}

// Singleton instance — the one and only event bus

export const lynxEvents = new LynxEventSystem();
