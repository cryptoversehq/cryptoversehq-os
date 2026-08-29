/**
 * api/events.ts
 *
 * Live Events Endpoints — Part 12 §11.8
 *
 * GET    /api/events/upcoming           - List upcoming events
 * GET    /api/events/active             - List active events
 * POST   /api/events/:id/register       - Register for event
 * GET    /api/events/:id/leaderboard    - Get event leaderboard
 */

import { registerRoute, requireAuth, ApiErrors } from './client';
import type {
  ListEventsResponse,
  LiveEventItem,
  RegisterForEventResponse,
  GetEventLeaderboardResponse,
  EventLeaderboardEntry,
} from './types';
import { useLiveEventStore } from '../lib/liveEventStore';
import type { LiveEvent, LeaderboardEntry } from '../lib/liveEventTypes';

function toEventItem(e: LiveEvent, userId: string, isRegistered: boolean): LiveEventItem {
  return {
    id:                   e.id,
    title:                e.title,
    type:                 e.type,
    status:               e.status,
    startTime:            e.startTime,
    endTime:              e.endTime,
    prizePool:            e.prizePool,
    entryFee:             e.entryFee,
    maxParticipants:      e.maxParticipants,
    currentParticipants:  e.currentParticipants,
    isRegistered,
  };
}

function toLeaderboardEntry(e: LeaderboardEntry): EventLeaderboardEntry {
  return {
    rank:        e.rank,
    userId:      e.userId,
    displayName: e.displayName,
    score:       e.score,
    profit:      e.profit,
    trades:      e.trades,
  };
}

// ─── GET /api/events/upcoming ─────────────────────────────────────────────────

registerRoute<Record<string, never>, ListEventsResponse>(
  'GET', '/api/events/upcoming',
  (_body, auth) => {
    const store  = useLiveEventStore.getState();
    const userId = auth?.userId ?? '';
    const events = store.getUpcomingEvents();
    const parts  = store.getUserParticipations(userId);
    const partSet = new Set(parts.map(p => p.eventId));
    return { events: events.map(e => toEventItem(e, userId, partSet.has(e.id))) };
  },
);

// ─── GET /api/events/active ───────────────────────────────────────────────────

registerRoute<Record<string, never>, ListEventsResponse>(
  'GET', '/api/events/active',
  (_body, auth) => {
    const store  = useLiveEventStore.getState();
    const userId = auth?.userId ?? '';
    const events = store.getActiveEvents();
    const parts  = store.getUserParticipations(userId);
    const partSet = new Set(parts.map(p => p.eventId));
    return { events: events.map(e => toEventItem(e, userId, partSet.has(e.id))) };
  },
);

// ─── POST /api/events/:id/register ────────────────────────────────────────────

registerRoute<Record<string, never>, RegisterForEventResponse>(
  'POST', '/api/events/:id/register',
  (_body, auth, pathParams) => {
    const a     = requireAuth(auth);
    const store = useLiveEventStore.getState();
    const id    = pathParams?.['id'] ?? '';

    const event = store.getEvent(id);
    if (!event) throw ApiErrors.notFound(`Event '${id}' not found.`);

    const result = store.registerForEvent({
      eventId:     id,
      userId:      a.userId,
      displayName: a.displayName,
      avatarSeed:  a.userId,
    });

    if (!result.ok || !result.participantId) {
      throw ApiErrors.storeError(result.error ?? 'Registration failed.');
    }

    return { participantId: result.participantId, entryFee: event.entryFee };
  },
);

// ─── GET /api/events/:id/leaderboard ─────────────────────────────────────────

registerRoute<Record<string, never>, GetEventLeaderboardResponse>(
  'GET', '/api/events/:id/leaderboard',
  (_body, _auth, pathParams) => {
    const store = useLiveEventStore.getState();
    const id    = pathParams?.['id'] ?? '';
    const board = store.getLeaderboard(id);
    return {
      eventId:   id,
      entries:   board.map(toLeaderboardEntry),
      updatedAt: new Date().toISOString(),
    };
  },
);
