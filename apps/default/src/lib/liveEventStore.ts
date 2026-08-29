/**
 * liveEventStore.ts
 *
 * Central store for the CryptoVerse HQ Live Events system.
 *
 * Manages:
 *   - events       : Registry of LiveEvent objects
 *   - participants : Record of EventParticipant per event
 *
 * Responsibilities:
 *   - Cold-start: seeds the event catalog + NPC participants on first load
 *   - Status engine: transitions scheduled → active → completed automatically
 *   - Score engine: ticks participant scores every SCORE_TICK_INTERVAL_MS
 *   - Registration CRUD: join / withdraw with entry fee (CP coins) deduction
 *   - Prize payout: distributes CP coins to ranked winners on event completion
 *   - Leaderboard: live ranked view with anonymised names
 *   - Filters / sort: for event list and participant views
 *   - Admin: create event, cancel, force-complete, grant prizes
 *
 * Persistence:
 *   cryptoverse_events_v1        (event registry)
 *   cryptoverse_participants_v1  (participants, keyed by eventId)
 */

import { create } from 'zustand';
import { cloudRecordStore } from './cloudData';
import {
  LiveEvent,
  EventParticipant,
  LeaderboardEntry,
  EventType,
  EventStatus,
  EventFilters,
  EventSortKey,
  LiveEventGlobalStats,
  RegisterForEventResult,
  WithdrawFromEventResult,
  AdminCreateEventResult,
  DEFAULT_EVENT_FILTERS,
  MAX_EVENTS,
  EVENT_STATUS_CHECK_INTERVAL_MS,
  SCORE_TICK_INTERVAL_MS,
  EVENT_ENTRY_FEE_TX_TYPE,
  EVENT_PRIZE_TX_TYPE,
  STANDARD_DISTRIBUTIONS,
} from './liveEventTypes';
import {
  buildSeedEvents,
  tickScores,
  buildLeaderboard,
  resolveEvent,
  generateNpcParticipants,
  advanceEventStatus,
} from './liveEventSimulator';
import { useCpCoinsStore } from './cpCoinsStore';
import { generateId } from './strategyUtils';

// ─── NOTIFICATION BRIDGE ──────────────────────────────────────────────────────

type EventNotifyPayload = {
  type:    'trade' | 'achievement' | 'system' | 'liquidation';
  title:   string;
  message: string;
};

let _eventNotifyHandler: ((n: EventNotifyPayload) => void) | null = null;

export function registerEventNotifyHandler(fn: (n: EventNotifyPayload) => void) {
  _eventNotifyHandler = fn;
}

function eventNotify(n: EventNotifyPayload) {
  _eventNotifyHandler?.(n);
}

// ─── PERSISTENCE ──────────────────────────────────────────────────────────────

const EVENTS_KEY       = 'cryptoverse_events_v1';
const PARTS_KEY        = 'cryptoverse_participants_v1';
const SEEDED_KEY       = 'cryptoverse_events_seeded_v1';

function load<T>(key: string, fallback: T): T {
  return cloudRecordStore.get<T>('events', key, fallback);
}
function persist(key: string, v: unknown) { cloudRecordStore.set('events', key, v); }

// ─── FILTERING & SORTING ──────────────────────────────────────────────────────

function applyEventFilters(events: LiveEvent[], f: EventFilters): LiveEvent[] {
  return events.filter(e => {
    if (f.types.length    > 0 && !f.types.includes(e.type))       return false;
    if (f.statuses.length > 0 && !f.statuses.includes(e.status))  return false;
    if (f.featured !== null && e.featured !== f.featured)          return false;
    if (f.freeOnly && e.entryFee > 0)                              return false;
    if (e.prizePool < f.minPrizePool)                              return false;
    if (f.search.trim()) {
      const q = f.search.toLowerCase();
      if (!e.title.toLowerCase().includes(q) && !e.description.toLowerCase().includes(q) && !e.tags.some(t => t.includes(q))) return false;
    }
    return true;
  });
}

function sortEvents(events: LiveEvent[], by: EventSortKey): LiveEvent[] {
  const a = [...events];
  switch (by) {
    case 'start_asc':          return a.sort((x,y) => x.startTime.localeCompare(y.startTime));
    case 'start_desc':         return a.sort((x,y) => y.startTime.localeCompare(x.startTime));
    case 'prize_desc':         return a.sort((x,y) => y.prizePool - x.prizePool);
    case 'participants_desc':  return a.sort((x,y) => y.participants - x.participants);
    case 'newest':             return a.sort((x,y) => y.createdAt.localeCompare(x.createdAt));
    default:                   return a;
  }
}

// ─── POLLING ENGINES ──────────────────────────────────────────────────────────

let _statusInterval: ReturnType<typeof setInterval> | null = null;
let _scoreInterval:  ReturnType<typeof setInterval> | null = null;

function stopEventPolling() {
  if (_statusInterval) { clearInterval(_statusInterval); _statusInterval = null; }
  if (_scoreInterval)  { clearInterval(_scoreInterval);  _scoreInterval  = null; }
}

function startEventPolling(statusTick: () => void, scoreTick: () => void) {
  stopEventPolling();
  _statusInterval = setInterval(statusTick, EVENT_STATUS_CHECK_INTERVAL_MS);
  _scoreInterval  = setInterval(scoreTick,  SCORE_TICK_INTERVAL_MS);
}

// ─── ELIGIBILITY CHECK ────────────────────────────────────────────────────────

function checkEligibility(
  event:       LiveEvent,
  userId:      string,
  userLevel:   number,
  participants: Record<string, EventParticipant[]>,
): string[] {
  const errors: string[] = [];
  if (event.status !== 'scheduled' && event.status !== 'active') errors.push('Registration is closed for this event.');
  if (!event.registrationOpen) errors.push('Registration has closed.');
  if (userLevel < event.minLevel) errors.push(`You need to be Level ${event.minLevel} or above to join.`);
  if (event.maxParticipants !== null && event.participants >= event.maxParticipants) errors.push('This event is full.');
  const existing = (participants[event.id] ?? []).find(p => p.userId === userId);
  if (existing) errors.push('You are already registered for this event.');
  return errors;
}

// ─── STATE INTERFACE ──────────────────────────────────────────────────────────

export interface LiveEventState {
  events:       Record<string, LiveEvent>;
  participants: Record<string, EventParticipant[]>;  // eventId → participants

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  seedEvents: () => void;

  // ── Polling ────────────────────────────────────────────────────────────────
  startPolling: () => void;
  stopPolling:  () => void;

  // Internal ticks (exposed for testing)
  runStatusTick: () => { transitioned: number; resolved: number };
  runScoreTick:  () => { updated: number };

  // ── Registration ──────────────────────────────────────────────────────────
  registerForEvent: (params: {
    eventId:   string;
    userId:    string;
    userLevel: number;
    teamId?:   string;
    teamName?: string;
    prediction?: number;  // for market_analysis events
  }) => RegisterForEventResult;

  withdrawFromEvent: (params: {
    eventId: string;
    userId:  string;
  }) => WithdrawFromEventResult;

  // ── Queries ────────────────────────────────────────────────────────────────
  getEvents:          (filters?: EventFilters) => LiveEvent[];
  getEvent:           (eventId: string) => LiveEvent | null;
  getParticipants:    (eventId: string) => EventParticipant[];
  getUserParticipation: (userId: string) => { event: LiveEvent; participant: EventParticipant }[];
  getLeaderboard:     (eventId: string, currentUserId: string) => LeaderboardEntry[];
  getUserRank:        (eventId: string, userId: string) => { rank: number | null; total: number };
  isUserRegistered:   (eventId: string, userId: string) => boolean;

  // ── Admin ──────────────────────────────────────────────────────────────────
  adminCreateEvent:   (event: Omit<LiveEvent, 'id' | 'participants' | 'createdAt'>) => AdminCreateEventResult;
  adminCancelEvent:   (eventId: string, adminId: string) => { ok: boolean; error?: string };
  adminForceComplete: (eventId: string, adminId: string) => { ok: boolean; prizesAwarded: number };
  getGlobalStats:     () => LiveEventGlobalStats;
}

// ─── STORE ────────────────────────────────────────────────────────────────────

export const useLiveEventStore = create<LiveEventState>((set, get) => {
  const events       = load<Record<string, LiveEvent>>(EVENTS_KEY, {});
  const participants = load<Record<string, EventParticipant[]>>(PARTS_KEY, {});

  // ── Prize distribution helper ─────────────────────────────────────────────

  function distributeAndPay(event: LiveEvent, parts: EventParticipant[]): EventParticipant[] {
    const resolved = resolveEvent(parts, event);
    const cp = useCpCoinsStore.getState();

    for (const p of resolved) {
      if ((p.prize ?? 0) > 0) {
        cp.credit({
          userId:      p.userId,
          amount:      p.prize!,
          type:        EVENT_PRIZE_TX_TYPE as any,
          description: `Prize for ${event.title} (Rank #${p.rank})`,
          referenceId: event.id,
        });
      }
    }

    return resolved;
  }

  // ── Status transition helper ──────────────────────────────────────────────

  function transitionEvent(
    event:       LiveEvent,
    parts:       EventParticipant[],
  ): { event: LiveEvent; parts: EventParticipant[] } {
    const newStatus = advanceEventStatus(event);
    if (newStatus === event.status) return { event, parts };

    let updatedEvent = { ...event, status: newStatus };
    let updatedParts = parts;

    if (newStatus === 'active' && event.status === 'scheduled') {
      eventNotify({
        type:    'system',
        title:   `🟢 Event Started — ${event.title}`,
        message: `The ${event.title} has just gone live! ${event.participants} participants registered.`,
      });
    }

    if (newStatus === 'completed' && event.status === 'active') {
      updatedParts = distributeAndPay(updatedEvent, parts);
      updatedEvent = { ...updatedEvent, registrationOpen: false };
      const topPrize = updatedEvent.prizeDistribution.ranks[0]?.amount ?? 0;
      eventNotify({
        type:    'achievement',
        title:   `🏆 Event Completed — ${updatedEvent.title}`,
        message: `Results are in! Top prize: ${topPrize.toLocaleString()} CP coins.`,
      });
    }

    return { event: updatedEvent, parts: updatedParts };
  }

  return {
    events,
    participants,

    // ── Bootstrap ────────────────────────────────────────────────────────────

    seedEvents: () => {
      const alreadySeeded = cloudRecordStore.get<string>('events', SEEDED_KEY, '') === '1';
      if (alreadySeeded && Object.keys(get().events).length > 0) return;

      const seeded = buildSeedEvents();
      const newEvents: Record<string, LiveEvent> = {};
      const newParticipants: Record<string, EventParticipant[]> = {};

      for (const event of seeded) {
        newEvents[event.id] = event;

        // For completed events, generate NPC participants and resolve them
        if (event.status === 'completed' && event.participants > 0) {
          const npc  = generateNpcParticipants(event, Math.min(event.participants, 30));
          newParticipants[event.id] = resolveEvent(npc, event);
        } else if (event.status === 'active' && event.participants > 0) {
          const npc  = generateNpcParticipants(event, Math.min(event.participants, 20));
          newParticipants[event.id] = npc;
        } else {
          newParticipants[event.id] = [];
        }
      }

      persist(EVENTS_KEY, newEvents);
      persist(PARTS_KEY,  newParticipants);
      cloudRecordStore.set('events', SEEDED_KEY, '1');
      set({ events: newEvents, participants: newParticipants });
    },

    // ── Polling ──────────────────────────────────────────────────────────────

    startPolling: () => {
      startEventPolling(
        () => get().runStatusTick(),
        () => get().runScoreTick(),
      );
    },

    stopPolling: () => { stopEventPolling(); },

    runStatusTick: () => {
      const { events, participants } = get();
      const newEvents:       Record<string, LiveEvent>             = {};
      const newParticipants: Record<string, EventParticipant[]>   = {};
      let transitioned = 0;
      let resolved     = 0;

      for (const [id, event] of Object.entries(events)) {
        const parts = participants[id] ?? [];
        const result = transitionEvent(event, parts);
        newEvents[id]       = result.event;
        newParticipants[id] = result.parts;
        if (result.event.status !== event.status) transitioned++;
        if (result.event.status === 'completed' && event.status === 'active') resolved++;
      }

      persist(EVENTS_KEY, newEvents);
      persist(PARTS_KEY,  newParticipants);
      set({ events: newEvents, participants: newParticipants });
      return { transitioned, resolved };
    },

    runScoreTick: () => {
      const { events, participants } = get();
      const newParticipants: Record<string, EventParticipant[]> = { ...participants };
      let updated = 0;

      for (const [id, event] of Object.entries(events)) {
        if (event.status !== 'active') continue;
        const parts = participants[id] ?? [];
        if (parts.length === 0) continue;
        newParticipants[id] = tickScores(parts, event);
        updated += parts.length;
      }

      persist(PARTS_KEY, newParticipants);
      set({ participants: newParticipants });
      return { updated };
    },

    // ── Registration ──────────────────────────────────────────────────────────

    registerForEvent: (params) => {
      const { eventId, userId, userLevel, teamId, teamName, prediction } = params;
      const { events, participants } = get();

      const event = events[eventId];
      if (!event) return { ok: false, errors: ['Event not found.'] };

      const parts  = participants[eventId] ?? [];
      const errors = checkEligibility(event, userId, userLevel, participants);
      if (errors.length > 0) return { ok: false, errors };

      // Deduct entry fee
      if (event.entryFee > 0) {
        const cp = useCpCoinsStore.getState();
        const result = cp.debit({
          userId,
          amount:      event.entryFee,
          type:        EVENT_ENTRY_FEE_TX_TYPE as any,
          description: `Entry fee for ${event.title}`,
          referenceId: eventId,
        });
        if (!result.ok) return { ok: false, errors: [result.error ?? 'Insufficient CP coins.'] };
      }

      const participantId = generateId();
      const now = new Date().toISOString();

      const participant: EventParticipant = {
        id:               participantId,
        eventId,
        userId,
        rank:             null,
        score:            event.type !== 'live_webinar' ? 0 : null,
        prize:            null,
        teamId:           teamId ?? null,
        teamName:         teamName ?? null,
        prediction:       prediction ?? null,
        registrationTime: now,
        completedAt:      null,
        entryFeePaid:     event.entryFee,
        prizeClaimed:     false,
      };

      const newParts = [...parts, participant];
      const newEvent = { ...event, participants: event.participants + 1 };

      const newEvents       = { ...events,       [eventId]: newEvent };
      const newParticipants = { ...participants,  [eventId]: newParts };

      persist(EVENTS_KEY, newEvents);
      persist(PARTS_KEY,  newParticipants);
      set({ events: newEvents, participants: newParticipants });

      return { ok: true, participantId };
    },

    withdrawFromEvent: (params) => {
      const { eventId, userId } = params;
      const { events, participants } = get();

      const event = events[eventId];
      if (!event) return { ok: false, refund: 0, error: 'Event not found.' };
      if (event.status === 'completed') return { ok: false, refund: 0, error: 'Event already completed.' };
      if (event.status === 'cancelled') return { ok: false, refund: 0, error: 'Event was cancelled.' };

      const parts      = participants[eventId] ?? [];
      const partIdx    = parts.findIndex(p => p.userId === userId);
      if (partIdx === -1) return { ok: false, refund: 0, error: 'You are not registered for this event.' };

      const part       = parts[partIdx];
      const newParts   = parts.filter((_, i) => i !== partIdx);
      const newEvent   = { ...event, participants: Math.max(0, event.participants - 1) };

      // Refund only if event hasn't started yet
      let refund = 0;
      if (event.status === 'scheduled' && part.entryFeePaid > 0) {
        refund = part.entryFeePaid;
        useCpCoinsStore.getState().credit({
          userId,
          amount:      refund,
          type:        'refund' as any,
          description: `Refund — withdrawal from ${event.title}`,
          referenceId: eventId,
        });
      }

      const newEvents       = { ...events,       [eventId]: newEvent };
      const newParticipants = { ...participants,  [eventId]: newParts };

      persist(EVENTS_KEY, newEvents);
      persist(PARTS_KEY,  newParticipants);
      set({ events: newEvents, participants: newParticipants });

      return { ok: true, refund };
    },

    // ── Queries ───────────────────────────────────────────────────────────────

    getEvents: (filters = DEFAULT_EVENT_FILTERS) => {
      const evs = Object.values(get().events);
      return sortEvents(applyEventFilters(evs, filters), filters.sortBy);
    },

    getEvent: (eventId) => get().events[eventId] ?? null,

    getParticipants: (eventId) => get().participants[eventId] ?? [],

    getUserParticipation: (userId) => {
      const { events, participants } = get();
      const result: { event: LiveEvent; participant: EventParticipant }[] = [];
      for (const [eid, parts] of Object.entries(participants)) {
        const part = parts.find(p => p.userId === userId);
        if (part && events[eid]) result.push({ event: events[eid], participant: part });
      }
      return result.sort((a, b) => b.event.startTime.localeCompare(a.event.startTime));
    },

    getLeaderboard: (eventId, currentUserId) => {
      const { events, participants } = get();
      const event = events[eventId];
      if (!event) return [];
      const parts = participants[eventId] ?? [];
      return buildLeaderboard(parts, currentUserId, event.status === 'active');
    },

    getUserRank: (eventId, userId) => {
      const parts = get().participants[eventId] ?? [];
      const sorted = [...parts]
        .filter(p => p.score !== null)
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      const idx = sorted.findIndex(p => p.userId === userId);
      return { rank: idx === -1 ? null : idx + 1, total: sorted.length };
    },

    isUserRegistered: (eventId, userId) => {
      return (get().participants[eventId] ?? []).some(p => p.userId === userId);
    },

    // ── Admin ─────────────────────────────────────────────────────────────────

    adminCreateEvent: (eventData) => {
      const { events } = get();
      if (Object.keys(events).length >= MAX_EVENTS) {
        return { ok: false, errors: ['Maximum event limit reached.'] };
      }
      if (!eventData.title.trim()) return { ok: false, errors: ['Title is required.'] };
      if (!eventData.startTime || !eventData.endTime) return { ok: false, errors: ['Start and end times are required.'] };
      if (new Date(eventData.endTime) <= new Date(eventData.startTime)) {
        return { ok: false, errors: ['End time must be after start time.'] };
      }

      const eventId = generateId();
      const now     = new Date().toISOString();
      const event: LiveEvent = {
        ...eventData,
        id:           eventId,
        participants: 0,
        createdAt:    now,
        prizeDistribution: eventData.prizePool > 0
          ? STANDARD_DISTRIBUTIONS[eventData.type](eventData.prizePool)
          : { type: 'all_participants', ranks: [] },
      };

      const newEvents = { ...events, [eventId]: event };
      const newParts  = { ...get().participants, [eventId]: [] };
      persist(EVENTS_KEY, newEvents);
      persist(PARTS_KEY,  newParts);
      set({ events: newEvents, participants: newParts });

      return { ok: true, eventId };
    },

    adminCancelEvent: (eventId, adminId) => {
      const { events } = get();
      const event = events[eventId];
      if (!event) return { ok: false, error: 'Event not found.' };
      if (event.status === 'completed') return { ok: false, error: 'Cannot cancel a completed event.' };

      // Refund all entry fees
      const parts = get().participants[eventId] ?? [];
      const cp    = useCpCoinsStore.getState();
      for (const p of parts) {
        if (p.entryFeePaid > 0) {
          cp.credit({
            userId:      p.userId,
            amount:      p.entryFeePaid,
            type:        'refund' as any,
            description: `Refund — event cancelled: ${event.title}`,
            referenceId: eventId,
          });
        }
      }

      const updatedEvent = { ...event, status: 'cancelled' as EventStatus, registrationOpen: false };
      const newEvents = { ...events, [eventId]: updatedEvent };
      persist(EVENTS_KEY, newEvents);
      set({ events: newEvents });

      eventNotify({
        type:    'system',
        title:   `❌ Event Cancelled — ${event.title}`,
        message: 'Entry fees have been refunded to all participants.',
      });

      return { ok: true };
    },

    adminForceComplete: (eventId, adminId) => {
      const { events, participants } = get();
      const event = events[eventId];
      if (!event) return { ok: false, prizesAwarded: 0 };

      const parts    = participants[eventId] ?? [];
      const resolved = distributeAndPay({ ...event, status: 'completed' as EventStatus }, parts);

      const prizesAwarded = resolved.filter(p => (p.prize ?? 0) > 0).length;
      const newEvent = { ...event, status: 'completed' as EventStatus, registrationOpen: false };
      const newEvents       = { ...events,       [eventId]: newEvent };
      const newParticipants = { ...participants,  [eventId]: resolved };

      persist(EVENTS_KEY, newEvents);
      persist(PARTS_KEY,  newParticipants);
      set({ events: newEvents, participants: newParticipants });

      return { ok: true, prizesAwarded };
    },

    getGlobalStats: () => {
      const { events, participants } = get();
      const evs   = Object.values(events);
      const allParts = Object.values(participants).flat();

      const totalPrizePool    = evs.reduce((s, e) => s + e.prizePool, 0);
      const totalPrizesAwarded = allParts.reduce((s, p) => s + (p.prize ?? 0), 0);
      const avgParticipants   = evs.length > 0
        ? Math.round(evs.reduce((s, e) => s + e.participants, 0) / evs.length)
        : 0;

      const types: EventType[] = ['weekend_challenge','monthly_tournament','team_battle','live_webinar','market_analysis'];
      const byType: LiveEventGlobalStats['byType'] = {} as LiveEventGlobalStats['byType'];
      for (const t of types) byType[t] = evs.filter(e => e.type === t).length;

      const mostPopular = evs.reduce<LiveEvent | null>((m,e) => !m || e.participants > m.participants ? e : m, null);
      const largestPrize = evs.reduce<LiveEvent | null>((m,e) => !m || e.prizePool > m.prizePool ? e : m, null);

      return {
        totalEvents:         evs.length,
        activeEvents:        evs.filter(e => e.status === 'active').length,
        scheduledEvents:     evs.filter(e => e.status === 'scheduled').length,
        completedEvents:     evs.filter(e => e.status === 'completed').length,
        cancelledEvents:     evs.filter(e => e.status === 'cancelled').length,
        totalParticipations: allParts.length,
        totalPrizePool,
        totalPrizesAwarded,
        avgParticipantsPerEvent: avgParticipants,
        byType,
        mostPopularEvent:   mostPopular ? { title: mostPopular.title, participants: mostPopular.participants } : null,
        largestPrizeEvent:  largestPrize ? { title: largestPrize.title, prizePool: largestPrize.prizePool } : null,
      };
    },
  };

  // ── Private helper (closure — not on state) ────────────────────────────────

  function distributeAndPay(event: LiveEvent, parts: EventParticipant[]): EventParticipant[] {
    const resolved = resolveEvent(parts, event);
    const cp = useCpCoinsStore.getState();
    for (const p of resolved) {
      if ((p.prize ?? 0) > 0) {
        cp.credit({
          userId:      p.userId,
          amount:      p.prize!,
          type:        EVENT_PRIZE_TX_TYPE as any,
          description: `Prize for ${event.title} (Rank #${p.rank})`,
          referenceId: event.id,
        });
      }
    }
    return resolved;
  }
});
