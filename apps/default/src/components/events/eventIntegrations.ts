/**
 * eventIntegrations.ts — §5 Integration with Existing Features
 *
 * Bridges the Events system with:
 *   §5.1  Trading Engine   — event-scoped trade tracking, leverage enforcement
 *   §5.2  Leaderboard      — event champion badge, event filter on main board
 *   §5.3  Wallet (CP)      — entry fees, prize deposits, transaction history
 *   §5.4  Notifications    — push, reminders, result alerts, team chat
 *   §5.5  Academy          — XP awards, Event Master achievement
 *
 * All methods are pure functions / thin adapters — they call external
 * store actions without holding state themselves.
 */

import { toast } from 'sonner';
import { LiveEvent, EventType, UserEventEntry, EventParticipant } from './eventTypes';
import { PrizeTransaction } from './eventBusinessLogic';
import { useCpCoinsStore } from '@/lib/cpCoinsStore';
import { useAcademyStore } from '@/lib/academyStore';
import { useAuthStore } from '@/lib/authStore';

// ─────────────────────────────────────────────────────────────────────────────
// Store accessors — use Zustand's .getState() outside React components
// ─────────────────────────────────────────────────────────────────────────────

function getCpStore() {
  return useCpCoinsStore.getState();
}

function getAcademyStore() {
  return useAcademyStore.getState();
}

function getAuthStore() {
  return useAuthStore.getState();
}

// ─────────────────────────────────────────────────────────────────────────────
// §5.1 Trading Engine Integration
// ─────────────────────────────────────────────────────────────────────────────

export interface EventTradeConstraints {
  maxLeverage:  number;   // e.g. 10 for 10x max
  minTrades:    number;   // minimum trades required to qualify
  allowedPairs: string[]; // empty = all pairs allowed
  allowShorts:  boolean;
}

const DEFAULT_CONSTRAINTS: EventTradeConstraints = {
  maxLeverage:  10,
  minTrades:    5,
  allowedPairs: [],
  allowShorts:  true,
};

const TYPE_CONSTRAINTS: Record<EventType, Partial<EventTradeConstraints>> = {
  weekend_warrior:      { maxLeverage: 10,  minTrades: 5  },
  monthly_championship: { maxLeverage: 20,  minTrades: 20 },
  team_battle:          { maxLeverage: 10,  minTrades: 3  },
  flash_challenge:      { maxLeverage: 5,   minTrades: 1, allowedPairs: ['BTC/USDT', 'ETH/USDT'] },
  live_webinar:         { maxLeverage: 1,   minTrades: 0  },
  market_analysis_live: { maxLeverage: 1,   minTrades: 0  },
};

export const tradingIntegration = {

  /** Get constraints for an event type */
  getConstraints(eventType: EventType): EventTradeConstraints {
    return { ...DEFAULT_CONSTRAINTS, ...TYPE_CONSTRAINTS[eventType] };
  },

  /**
   * Validate a proposed trade against event rules.
   * Returns { valid, reason } — show reason to user on rejection.
   */
  validateTrade(params: {
    eventType: EventType;
    leverage:  number;
    pair:      string;
    side:      'buy' | 'sell';
  }): { valid: boolean; reason?: string } {
    const c = this.getConstraints(params.eventType);

    if (params.leverage > c.maxLeverage) {
      return { valid: false, reason: `Max leverage for this event is ${c.maxLeverage}x (you set ${params.leverage}x)` };
    }
    if (!params.side && !c.allowShorts) {
      return { valid: false, reason: 'Short positions are not allowed in this event' };
    }
    if (c.allowedPairs.length > 0 && !c.allowedPairs.includes(params.pair)) {
      return { valid: false, reason: `Only ${c.allowedPairs.join(', ')} allowed in this event` };
    }

    return { valid: true };
  },

  /** Check if participant qualifies (min trades met) */
  checkQualification(eventType: EventType, tradesCompleted: number): { qualifies: boolean; remaining: number } {
    const { minTrades } = this.getConstraints(eventType);
    const remaining = Math.max(0, minTrades - tradesCompleted);
    return { qualifies: remaining === 0, remaining };
  },

  /** Log a trade against an event (stored separately from main portfolio) */
  recordEventTrade(params: {
    eventId:    string;
    userId:     string;
    pair:       string;
    side:       'buy' | 'sell';
    amount:     number;
    leverage:   number;
    pnlUsd:     number;
    pnlPct:     number;
  }): void {
    // In a full backend this would persist to event_trades table.
    // Here we emit a console event so the store can subscribe.
    const key = `event_trades_${params.eventId}_${params.userId}`;
    const existing = JSON.parse(localStorage.getItem(key) ?? '[]');
    existing.push({ ...params, ts: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(existing));
  },

  /** Retrieve event-scoped trades (separated from main portfolio) */
  getEventTrades(eventId: string, userId: string): any[] {
    const key = `event_trades_${eventId}_${userId}`;
    return JSON.parse(localStorage.getItem(key) ?? '[]');
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// §5.2 Leaderboard Integration
// ─────────────────────────────────────────────────────────────────────────────

export interface EventChampionBadge {
  eventId:    string;
  eventTitle: string;
  rank:       number;
  awardedAt:  string;
  icon:       string;
}

const CHAMPION_KEY = 'cryptoverse_event_badges_v1';

export const leaderboardIntegration = {

  /** Award "Event Champion" badge to top finisher */
  awardEventChampionBadge(params: {
    userId:     string;
    eventId:    string;
    eventTitle: string;
    rank:       number;
    icon:       string;
  }): EventChampionBadge | null {
    // Only top 3 get champion badge
    if (params.rank > 3) return null;

    const badge: EventChampionBadge = {
      eventId:    params.eventId,
      eventTitle: params.eventTitle,
      rank:       params.rank,
      awardedAt:  new Date().toISOString(),
      icon:       params.rank === 1 ? '🥇' : params.rank === 2 ? '🥈' : '🥉',
    };

    const all = this.getUserBadges(params.userId);
    // Idempotent — don't duplicate
    if (!all.some(b => b.eventId === params.eventId)) {
      all.unshift(badge);
      localStorage.setItem(`${CHAMPION_KEY}_${params.userId}`, JSON.stringify(all));
    }

    return badge;
  },

  /** Get all event champion badges for a user */
  getUserBadges(userId: string): EventChampionBadge[] {
    try {
      return JSON.parse(localStorage.getItem(`${CHAMPION_KEY}_${userId}`) ?? '[]');
    } catch {
      return [];
    }
  },

  /**
   * Returns leaderboard filter data for "Event Performance" tab:
   * participants ranked by total event prizes earned.
   */
  getEventLeaderboardData(prizeHistory: PrizeTransaction[]): {
    userId:      string;
    totalCP:     number;
    totalXP:     number;
    eventsWon:   number;
    bestRank:    number;
    topBadge:    string;
  }[] {
    const map = new Map<string, { totalCP: number; totalXP: number; bestRank: number; eventsWon: number }>();

    for (const tx of prizeHistory) {
      const cur = map.get(tx.userId) ?? { totalCP: 0, totalXP: 0, bestRank: 9999, eventsWon: 0 };
      cur.totalCP   += tx.amount;
      cur.totalXP   += tx.xpAwarded;
      cur.bestRank   = Math.min(cur.bestRank, tx.rank);
      if (tx.rank === 1) cur.eventsWon += 1;
      map.set(tx.userId, cur);
    }

    return [...map.entries()].map(([userId, d]) => ({
      userId,
      totalCP:   d.totalCP,
      totalXP:   d.totalXP,
      eventsWon: d.eventsWon,
      bestRank:  d.bestRank,
      topBadge:  d.bestRank === 1 ? '🥇' : d.bestRank === 2 ? '🥈' : d.bestRank === 3 ? '🥉' : '🏅',
    })).sort((a, b) => b.totalCP - a.totalCP);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// §5.3 Wallet Integration
// ─────────────────────────────────────────────────────────────────────────────

export const walletIntegration = {

  /**
   * §5.3 — Deduct entry fee from CP balance.
   * Returns false if balance is insufficient.
   */
  deductEntryFee(params: {
    userId:    string;
    eventId:   string;
    eventName: string;
    fee:       number;
  }): boolean {
    if (params.fee <= 0) return true; // free event

    try {
      const cp = getCpStore();
      const balance = cp.getBalance(params.userId);

      if (balance < params.fee) {
        toast.error(`Insufficient CP balance. Need ${params.fee} CP (have ${balance} CP)`);
        return false;
      }

      cp.debit({
        userId:      params.userId,
        amount:      params.fee,
        type:        'purchase_strategy',   // closest existing type
        description: `Event entry fee: ${params.eventName}`,
        referenceId: params.eventId,
      });

      return true;
    } catch {
      // CP store unavailable (e.g. not yet initialized)
      return true;
    }
  },

  /**
   * §5.3 — Deposit prize into CP balance.
   */
  depositPrize(params: {
    userId:     string;
    eventId:    string;
    eventName:  string;
    amount:     number;
    rank:       number;
  }): void {
    if (params.amount <= 0) return;

    try {
      const cp = getCpStore();
      cp.credit({
        userId:      params.userId,
        amount:      params.amount,
        type:        'competition_prize',
        description: `Event prize: ${params.eventName} (Rank #${params.rank})`,
        referenceId: params.eventId,
      });

      toast.success(`💰 +${params.amount.toLocaleString()} CP credited to your wallet!`);
    } catch {
      // CP store unavailable
    }
  },

  /**
   * §5.3 — Get all event-related CP transactions for a user.
   */
  getEventTransactions(userId: string): import('@/lib/strategyTypes').CpTransaction[] {
    try {
      const cp = getCpStore();
      const all = cp.getHistory(userId);
      return all.filter(tx =>
        tx.type === 'competition_prize' ||
        (tx.type === 'purchase_strategy' && tx.description?.startsWith('Event entry fee')),
      );
    } catch {
      return [];
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// §5.4 Notification Integration
// ─────────────────────────────────────────────────────────────────────────────

export interface ScheduledReminder {
  eventId:   string;
  userId:    string;
  type:      'one_hour_before' | 'event_start' | 'event_end';
  fireAt:    number;  // unix ms
  timerId:   ReturnType<typeof setTimeout>;
}

const _reminders = new Map<string, ScheduledReminder>();

export const notificationIntegration = {

  /**
   * §5.4 — Schedule push notification 1 hour before event starts.
   */
  scheduleReminder(params: {
    eventId:    string;
    userId:     string;
    eventTitle: string;
    startAt:    string;
    onFire:     (msg: { title: string; body: string }) => void;
  }): void {
    const startMs     = new Date(params.startAt).getTime();
    const oneHourBefore = startMs - 3600_000;
    const now         = Date.now();

    // One-hour reminder
    if (oneHourBefore > now) {
      const key = `${params.eventId}_${params.userId}_1h`;
      if (_reminders.has(key)) return;

      const timerId = setTimeout(() => {
        params.onFire({
          title: `⏰ 1 hour to go!`,
          body:  `"${params.eventTitle}" starts in 1 hour. Get ready!`,
        });
        _reminders.delete(key);
      }, oneHourBefore - now);

      _reminders.set(key, {
        eventId: params.eventId, userId: params.userId,
        type: 'one_hour_before', fireAt: oneHourBefore, timerId,
      });
    }

    // At-start reminder
    if (startMs > now) {
      const key = `${params.eventId}_${params.userId}_start`;
      if (!_reminders.has(key)) {
        const timerId = setTimeout(() => {
          params.onFire({
            title: `🚀 ${params.eventTitle} is NOW LIVE!`,
            body:  'The event has started. Join now and compete!',
          });
          _reminders.delete(key);
        }, startMs - now);

        _reminders.set(key, {
          eventId: params.eventId, userId: params.userId,
          type: 'event_start', fireAt: startMs, timerId,
        });
      }
    }
  },

  /** Cancel all reminders for an event/user pair */
  cancelReminders(eventId: string, userId: string): void {
    for (const [key, r] of _reminders) {
      if (r.eventId === eventId && r.userId === userId) {
        clearTimeout(r.timerId);
        _reminders.delete(key);
      }
    }
  },

  /**
   * §5.4 — Send result notification when event ends.
   */
  sendResultNotification(params: {
    userId:     string;
    eventTitle: string;
    rank:       number;
    cpEarned:   number;
    xpEarned:   number;
  }): void {
    const rankEmoji = params.rank === 1 ? '🥇' : params.rank === 2 ? '🥈' : params.rank === 3 ? '🥉' : `#${params.rank}`;
    toast.success(
      `🏁 ${params.eventTitle} results: ${rankEmoji} — +${params.cpEarned} CP, +${params.xpEarned} XP`,
      { duration: 8000 },
    );
  },

  /**
   * §5.4 — Team chat message notification (badge on tab).
   */
  notifyTeamChatMessage(params: {
    teamName:  string;
    sender:    string;
    message:   string;
  }): void {
    // Update document title badge (browser-native notification)
    if (document.hidden) {
      const prev = document.title;
      document.title = `💬 ${params.sender}: ${params.message.slice(0, 30)} — ${prev}`;
      const restore = () => { document.title = prev; document.removeEventListener('visibilitychange', restore); };
      document.addEventListener('visibilitychange', restore);
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// §5.5 Academy Integration
// ─────────────────────────────────────────────────────────────────────────────

const EVENT_XP_LESSONS: Record<EventType, { id: string; label: string; xp: number }> = {
  flash_challenge:      { id: 'event-flash',   label: 'Flash Challenge Participant',       xp: 150 },
  weekend_warrior:      { id: 'event-warrior', label: 'Weekend Warrior Participant',       xp: 500 },
  monthly_championship: { id: 'event-monthly', label: 'Monthly Championship Participant',  xp: 1000 },
  team_battle:          { id: 'event-team',    label: 'Team Battle Participant',           xp: 750 },
  live_webinar:         { id: 'event-webinar', label: 'Webinar Attendee',                 xp: 300 },
  market_analysis_live: { id: 'event-market',  label: 'Market Analysis Attendee',         xp: 200 },
};

const EVENT_MASTER_THRESHOLD = 5; // events to achieve "Event Master"

export const academyIntegration = {

  /**
   * §5.5 — Award participation XP for an event.
   * Idempotent — duplicate calls for the same event are silently dropped.
   */
  awardParticipationXP(eventType: EventType, eventId: string): number {
    const lesson = EVENT_XP_LESSONS[eventType];
    if (!lesson) return 0;

    try {
      const academy = getAcademyStore();
      // Use eventId-scoped lesson id to allow multiple events of the same type
      const scopedId = `${lesson.id}_${eventId}`;
      academy.awardXP(scopedId, lesson.xp);
      return lesson.xp;
    } catch {
      return 0;
    }
  },

  /**
   * §5.5 — Check and award "Event Master" achievement.
   * Triggered after each event completion.
   */
  checkEventMasterAchievement(totalEventsParticipated: number): boolean {
    if (totalEventsParticipated < EVENT_MASTER_THRESHOLD) return false;

    const key = 'cryptoverse_event_master_v1';
    if (localStorage.getItem(key)) return false; // already awarded

    localStorage.setItem(key, new Date().toISOString());

    try {
      const academy = getAcademyStore();
      academy.awardXP('event-master-achievement', 2000);
    } catch {}

    toast.success('🏆 Achievement Unlocked: Event Master! +2,000 XP', { duration: 8000 });
    return true;
  },

  /** Get participation XP for a given event type (informational) */
  getParticipationXP(eventType: EventType): number {
    return EVENT_XP_LESSONS[eventType]?.xp ?? 0;
  },

  /** Returns special event-strategy lessons the academy should surface */
  getEventStrategyLessons(): Array<{ id: string; title: string; description: string; xp: number }> {
    return [
      {
        id:          'lesson-flash-strategy',
        title:       'Winning Flash Challenges',
        description: 'High-velocity trading techniques for short time windows.',
        xp:          200,
      },
      {
        id:          'lesson-team-communication',
        title:       'Team Battle Communication',
        description: 'How to coordinate strategy with your team for maximum returns.',
        xp:          300,
      },
      {
        id:          'lesson-risk-events',
        title:       'Risk Management in Competitions',
        description: 'Balancing aggression and protection during ranked events.',
        xp:          250,
      },
    ];
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Unified Integration Facade
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called when a user joins an event.
 * Handles: §5.3 entry fee, §5.4 reminder scheduling, §5.5 XP tracking setup.
 */
export function onUserJoinEvent(params: {
  event:      LiveEvent;
  userId:     string;
  onNotify:   (n: { title: string; body: string }) => void;
}): { success: boolean; reason?: string } {
  const { event, userId, onNotify } = params;

  // §5.3 Deduct entry fee (if any)
  // Events have no entry fee in current schema (all free), skip if 0
  const feeOk = walletIntegration.deductEntryFee({
    userId,
    eventId:   event.id,
    eventName: event.title,
    fee:       0,
  });
  if (!feeOk) return { success: false, reason: 'Insufficient CP balance' };

  // §5.4 Schedule reminders
  notificationIntegration.scheduleReminder({
    eventId:    event.id,
    userId,
    eventTitle: event.title,
    startAt:    event.startAt,
    onFire:     onNotify,
  });

  return { success: true };
}

/**
 * Called when an event ends and prizes are distributed.
 * Handles: §5.2 champion badge, §5.3 CP deposit, §5.4 result notification, §5.5 XP.
 */
export function onEventCompleted(params: {
  event:      LiveEvent;
  userId:     string;
  rank:       number;
  cpEarned:   number;
  xpEarned:   number;
  totalEventsParticipated: number;
}): void {
  const { event, userId, rank, cpEarned, xpEarned, totalEventsParticipated } = params;

  // §5.2 Award leaderboard badge (top 3 only)
  leaderboardIntegration.awardEventChampionBadge({
    userId,
    eventId:    event.id,
    eventTitle: event.title,
    rank,
    icon:       event.icon,
  });

  // §5.3 Deposit CP prize
  if (cpEarned > 0) {
    walletIntegration.depositPrize({
      userId,
      eventId:   event.id,
      eventName: event.title,
      amount:    cpEarned,
      rank,
    });
  }

  // §5.4 Result notification
  notificationIntegration.sendResultNotification({
    userId,
    eventTitle: event.title,
    rank,
    cpEarned,
    xpEarned,
  });

  // §5.5 Participation XP
  academyIntegration.awardParticipationXP(event.type, event.id);

  // §5.5 Event Master achievement check
  academyIntegration.checkEventMasterAchievement(totalEventsParticipated);
}
