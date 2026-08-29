/**
 * eventStore.ts — Zustand store wired to §4 Business Logic classes
 *
 * Delegates to:
 *   eventScheduler       (§4.1)
 *   rankingCalculator    (§4.2)
 *   prizeDistributor     (§4.3)
 *   teamBattleManager    (§4.4)
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { toast } from 'sonner';
import { createCloudStorage } from '@/lib/cloudData';
import { useAuthStore } from '@/lib/authStore';

import {
  LiveEvent,
  EventParticipant,
  EventTeam,
  EventChatMessage,
  EventNotification,
  UserEventEntry,
  EventsState,
  buildEventCatalog,
  generateLeaderboard,
  generateTeams,
  generateChatMessages,
  EventStatus,
} from './eventTypes';

import {
  eventScheduler,
  rankingCalculator,
  prizeDistributor,
  teamBattleManager,
  PrizeTransaction,
  Ranking,
  SchedulerCallbacks,
} from './eventBusinessLogic';

import {
  onUserJoinEvent,
  onEventCompleted,
  notificationIntegration,
  academyIntegration,
  leaderboardIntegration,
} from './eventIntegrations';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function isoNow(): string {
  return new Date().toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Extended store interface
// ─────────────────────────────────────────────────────────────────────────────

interface EventsStore extends EventsState {
  // Prize / reward ledger
  prizeHistory:   PrizeTransaction[];
  earnedBadges:   string[];

  // Actions — Registration
  joinEvent:          (eventId: string, userId: string, displayName: string, teamId?: string) => boolean;
  leaveEvent:         (eventId: string, userId: string) => void;

  // Actions — Team (§4.4)
  createTeam:         (eventId: string, teamName: string, emoji: string, captainId: string) => EventTeam | null;
  joinTeam:           (eventId: string, teamId: string, userId: string) => boolean;

  // Actions — Chat
  sendChatMessage:    (eventId: string, userId: string, displayName: string, text: string) => void;

  // Actions — Notifications
  markNotificationRead:  (notifId: string) => void;
  markAllRead:           () => void;

  // Actions — Business Logic (§4.1 / §4.2 / §4.3)
  triggerEventStart:  (eventId: string) => void;
  triggerEventEnd:    (eventId: string) => void;
  recalcLeaderboard: (eventId: string) => Ranking[];
  claimCompletedEventRewards: (eventId: string, userId: string) => PrizeTransaction | null;

  // Navigation helpers
  setActiveTab:       (tab: string) => void;
  setSelectedEvent:   (id: string | null) => void;

  // Real-time tick (simulates live market updates)
  refreshTick:        () => void;

  // Selectors
  getEvent:           (id: string) => LiveEvent | undefined;
  getLeaderboard:     (eventId: string) => EventParticipant[];
  getTeams:           (eventId: string) => EventTeam[];
  getChatMessages:    (eventId: string) => EventChatMessage[];
  getMyEntry:         (eventId: string) => UserEventEntry | undefined;
  isJoined:           (eventId: string) => boolean;
  getLiveEvents:      () => LiveEvent[];
  getUpcomingEvents:  () => LiveEvent[];
  getCompletedEvents: () => LiveEvent[];
  getUnreadCount:     () => number;
  getUserPrizeTotal:  () => number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Initial data builders
// ─────────────────────────────────────────────────────────────────────────────

const catalog = buildEventCatalog();

function buildInitialLeaderboards(): Record<string, EventParticipant[]> {
  const out: Record<string, EventParticipant[]> = {};
  for (const e of catalog) out[e.id] = generateLeaderboard(e.id);
  return out;
}

function buildInitialTeams(): Record<string, EventTeam[]> {
  const out: Record<string, EventTeam[]> = {};
  for (const e of catalog.filter(x => x.isTeamEvent)) out[e.id] = generateTeams(e.id);
  return out;
}

function buildInitialChats(): Record<string, EventChatMessage[]> {
  const out: Record<string, EventChatMessage[]> = {};
  for (const e of catalog.filter(x => x.type === 'live_webinar' || x.type === 'market_analysis_live')) {
    out[e.id] = generateChatMessages(e.id);
  }
  return out;
}

function buildInitialNotifications(): EventNotification[] {
  return [
    {
      id:        'notif-1',
      eventId:   'flash-001',
      title:     '⚡ Flash Challenge is LIVE!',
      body:      'BTC Flash Sprint has started. Join before it ends in 3 hours!',
      icon:      '⚡',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      read:      false,
      type:      'start',
    },
    {
      id:        'notif-2',
      eventId:   'monthly-001',
      title:     '🏆 April Championship update',
      body:      "You've moved up 12 positions on the leaderboard!",
      icon:      '🏆',
      timestamp: new Date(Date.now() - 7200000).toISOString(),
      read:      false,
      type:      'rank_change',
    },
    {
      id:        'notif-3',
      eventId:   'webinar-001',
      title:     '🎙️ Webinar starting now!',
      body:      'Mastering DeFi Yield Strategies has begun.',
      icon:      '🎙️',
      timestamp: new Date(Date.now() - 1800000).toISOString(),
      read:      true,
      type:      'start',
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

export const useEventsStore = create<EventsStore>()(
  persist(
    (set, get) => {

      // ── §4.1 Scheduler callback wiring ──────────────────────────────────────

      const schedulerCallbacks: SchedulerCallbacks = {
        updateEventStatus(eventId, status) {
          set(state => ({
            events: state.events.map(e =>
              e.id === eventId ? { ...e, status: status as EventStatus } : e,
            ),
          }));
        },

        getEventRegistrants(eventId) {
          const { myEntries } = get();
          return myEntries[eventId] ? ['current-user'] : [];
        },

        sendNotification(n) {
          const notif: EventNotification = {
            id:        uid(),
            eventId:   '',
            title:     n.title,
            body:      n.message,
            icon:      n.type === 'event_start' ? '🚀' : '🏁',
            timestamp: isoNow(),
            read:      false,
            type:      n.type === 'event_start' ? 'start' : 'end_soon',
          };
          set(state => ({ notifications: [notif, ...state.notifications] }));
        },

        initializeEventTracking(eventId) {
          // Rebuild leaderboard snapshot when event goes live
          const lb = generateLeaderboard(eventId);
          set(state => ({ leaderboards: { ...state.leaderboards, [eventId]: lb } }));
        },

        calculateAndDistribute(eventId) {
          const { events, leaderboards, myEntries } = get();
          const ev = events.find(e => e.id === eventId);
          if (!ev) return;

          const lb       = leaderboards[eventId] ?? [];
          const rankings = rankingCalculator.calculateRankings(lb, ev.type);
          const result   = prizeDistributor.distribute(ev, rankings);

          // Award prizes to current user if they participated
          const myEntry = myEntries[eventId];
          if (myEntry) {
            const myTx = result.transactions.find(t => t.rank === myEntry.currentRank);
            if (myTx) {
              set(state => ({
                prizeHistory:  [myTx, ...state.prizeHistory],
                earnedBadges:  [...new Set([...state.earnedBadges, ...myTx.badgesAwarded])],
                myEntries: {
                  ...state.myEntries,
                  [eventId]: {
                    ...state.myEntries[eventId],
                    status:        'completed',
                    rewardsEarned: ev.rewards.filter(r => r.rank === myEntry.currentRank || r.rank === 'all'),
                  },
                },
              }));

              // §5 Integrations: CP deposit, champion badge, notifications, academy XP
              onEventCompleted({
                event:    ev,
                userId:   'current-user',
                rank:     myEntry.currentRank,
                cpEarned: myTx.amount,
                xpEarned: myTx.xpAwarded,
                totalEventsParticipated: Object.keys(myEntries).length,
              });
            }
          }
        },
      };

      // Bootstrap scheduler on store creation
      // (deferred so state is available via get())
      setTimeout(() => eventScheduler.init(schedulerCallbacks), 0);
      setTimeout(() => eventScheduler.scheduleAll(catalog), 50);

      return {
        // ── Initial state ────────────────────────────────────────────────────
        events:          catalog,
        leaderboards:    buildInitialLeaderboards(),
        teams:           buildInitialTeams(),
        chatMessages:    buildInitialChats(),
        notifications:   buildInitialNotifications(),
        myEntries:       {},
        earnedBadges:    [],
        prizeHistory:    [],
        activeTab:       'browse',
        selectedEventId: null,

        // ── §4.1 Explicit lifecycle triggers (for admin / testing) ────────────

        triggerEventStart(eventId) {
          const ev = get().events.find(e => e.id === eventId);
          if (!ev) return;
          schedulerCallbacks.updateEventStatus(eventId, 'live');
          schedulerCallbacks.initializeEventTracking(eventId);
          toast.success(`🔴 ${ev.title} forced to LIVE`);
        },

        triggerEventEnd(eventId) {
          const ev = get().events.find(e => e.id === eventId);
          if (!ev) return;
          schedulerCallbacks.calculateAndDistribute(eventId);
          schedulerCallbacks.updateEventStatus(eventId, 'completed');
          toast.info(`🏁 ${ev.title} forced to COMPLETED`);
        },

        // ── §4.2 Recalculate leaderboard rankings ────────────────────────────

        recalcLeaderboard(eventId) {
          const { events, leaderboards } = get();
          const ev = events.find(e => e.id === eventId);
          if (!ev) return [];

          const lb       = leaderboards[eventId] ?? [];
          const prevMap  = new Map(lb.map(p => [p.userId, p.rank]));
          const rankings = rankingCalculator.calculateRankings(lb, ev.type, prevMap);

          // Update leaderboard participants with re-ranked data
          const updated: EventParticipant[] = rankings.map(r => ({
            userId:      r.userId,
            displayName: r.displayName,
            avatarSeed:  r.avatarSeed,
            rank:        r.rank,
            score:       r.score,
            pnl:         r.pnl,
            pnlPct:      r.roi,
            trades:      r.trades,
            winRate:     r.winRate,
            status:      'active',
            joinedAt:    isoNow(),
            delta:       r.delta,
          }));

          set(state => ({ leaderboards: { ...state.leaderboards, [eventId]: updated } }));
          return rankings;
        },

        // ── §4.3 Claim rewards for a completed event ─────────────────────────

        claimCompletedEventRewards(eventId, userId) {
          const { events, myEntries, prizeHistory } = get();
          const ev    = events.find(e => e.id === eventId);
          const entry = myEntries[eventId];
          if (!ev || !entry || ev.status !== 'completed') return null;
          if (prizeHistory.some(t => t.eventId === eventId && t.userId === userId)) return null;

          const { cpAmount, badgeNames } = prizeDistributor.determinePrize(ev, entry.currentRank);
          const xp = prizeDistributor.calculateXP(entry.currentRank, ev.type);

          const tx: PrizeTransaction = {
            id:            uid(),
            userId,
            eventId:       ev.id,
            eventTitle:    ev.title,
            amount:        cpAmount,
            xpAwarded:     xp,
            badgesAwarded: badgeNames,
            rank:          entry.currentRank,
            timestamp:     isoNow(),
          };

          set(state => ({
            prizeHistory:  [tx, ...state.prizeHistory],
            earnedBadges:  [...new Set([...state.earnedBadges, ...badgeNames])],
          }));

          toast.success(`🏆 Rewards claimed! +${cpAmount} CP, +${xp} XP`);
          return tx;
        },

        // ── Registration ─────────────────────────────────────────────────────

        joinEvent(eventId, userId, displayName, teamId) {
          const { events, myEntries, leaderboards } = get();
          const ev = events.find(e => e.id === eventId);
          if (!ev) return false;
          if (ev.status === 'completed' || ev.status === 'cancelled') {
            toast.error('This event is no longer accepting participants.');
            return false;
          }
          if (myEntries[eventId]) {
            toast.info('You are already registered for this event.');
            return false;
          }

          const entry: UserEventEntry = {
            eventId,
            joinedAt:     isoNow(),
            teamId,
            currentRank:  Math.ceil(ev.currentParticipants * 0.3),
            score:        parseFloat((Math.random() * 8 + 1).toFixed(2)),
            pnl:          Math.round(Math.random() * 3000 + 500),
            pnlPct:       parseFloat((Math.random() * 8 + 1).toFixed(2)),
            trades:       Math.floor(Math.random() * 10 + 1),
            winRate:      parseFloat((0.5 + Math.random() * 0.25).toFixed(2)),
            status:       ev.status === 'live' ? 'active' : 'registered',
            rewardsEarned:[],
          };

          // Insert user into leaderboard snapshot
          const lb    = [...(leaderboards[eventId] || [])];
          const me: EventParticipant = {
            userId,
            displayName,
            avatarSeed:  userId,
            rank:        entry.currentRank,
            score:       entry.score,
            pnl:         entry.pnl,
            pnlPct:      entry.pnlPct,
            trades:      entry.trades,
            winRate:     entry.winRate,
            status:      entry.status,
            joinedAt:    entry.joinedAt,
            delta:       0,
          };
          lb.splice(entry.currentRank - 1, 0, me);
          lb.forEach((p, i) => { p.rank = i + 1; });

          const updatedEvents = events.map(e =>
            e.id === eventId ? { ...e, currentParticipants: e.currentParticipants + 1 } : e,
          );

          const notif: EventNotification = {
            id:        uid(),
            eventId,
            title:     `Registered: ${ev.title}`,
            body:      `You've joined ${ev.title}. Good luck! 🚀`,
            icon:      ev.icon,
            timestamp: isoNow(),
            read:      false,
            type:      'start',
          };

          set({
            myEntries:    { ...get().myEntries, [eventId]: entry },
            leaderboards: { ...leaderboards, [eventId]: lb },
            events:       updatedEvents,
            notifications:[notif, ...get().notifications],
          });

          // §5 Integrations: entry fee + reminder + academy XP setup
          onUserJoinEvent({
            event: ev,
            userId,
            onNotify: n => set(s => ({
              notifications: [{
                id: uid(), eventId, title: n.title, body: n.body,
                icon: '⏰', timestamp: isoNow(), read: false, type: 'start',
              }, ...s.notifications],
            })),
          });

          // §5.5 Academy: award participation XP on join (for webinar-style events)
          if (ev.type === 'live_webinar' || ev.type === 'market_analysis_live') {
            academyIntegration.awardParticipationXP(ev.type, ev.id);
          }

          toast.success(`Joined ${ev.title}!`);
          return true;
        },

        leaveEvent(eventId, userId) {
          const { myEntries, events, leaderboards } = get();
          if (!myEntries[eventId]) return;
          const ev = events.find(e => e.id === eventId);
          const { [eventId]: _, ...rest } = myEntries;
          const lb = (leaderboards[eventId] || []).filter(p => p.userId !== userId);
          lb.forEach((p, i) => { p.rank = i + 1; });
          const updatedEvents = events.map(e =>
            e.id === eventId ? { ...e, currentParticipants: Math.max(0, e.currentParticipants - 1) } : e,
          );
          set({ myEntries: rest, leaderboards: { ...leaderboards, [eventId]: lb }, events: updatedEvents });
          toast.info(`Left ${ev?.title ?? 'event'}.`);
        },

        // ── §4.4 Team management ─────────────────────────────────────────────

        createTeam(eventId, teamName, emoji, captainId) {
          const { teams, events } = get();
          const ev = events.find(e => e.id === eventId);
          if (!ev?.isTeamEvent) return null;

          try {
            const record = teamBattleManager.createTeam(teamName, captainId, emoji);
            const newTeam: EventTeam = {
              id:         record.id,
              eventId,
              name:       record.name,
              emoji:      record.emoji,
              color:      '#6366f1',
              captain:    { userId: captainId, displayName: 'You', avatarSeed: captainId, rank: 1, score: 0, pnl: 0, pnlPct: 0, trades: 0, winRate: 0, status: 'registered', joinedAt: isoNow(), delta: 0 },
              members:    [],
              totalScore: 0,
              rank:       (teams[eventId]?.length ?? 0) + 1,
              isOpen:     true,
            };
            const teamLeaderboard = teamBattleManager.getTeamLeaderboard(
              [...(teams[eventId] ?? []).map(t => ({ id: t.id, name: t.name, emoji: t.emoji, captainId: '', memberIds: [t.captain.userId, ...t.members.map(m => m.userId)], score: t.totalScore, rank: t.rank, isOpen: t.isOpen, createdAt: '' })), { id: newTeam.id, name: newTeam.name, emoji: newTeam.emoji, captainId, memberIds: [captainId], score: 0, rank: 0, isOpen: true, createdAt: isoNow() }]
            );
            set({ teams: { ...teams, [eventId]: [...(teams[eventId] ?? []), newTeam] } });
            toast.success(`Team "${teamName}" ${emoji} created!`);
            return newTeam;
          } catch (err: any) {
            toast.error(err.message);
            return null;
          }
        },

        joinTeam(eventId, teamId, userId) {
          const { teams } = get();
          const eventTeams = teams[eventId] ?? [];
          const team = eventTeams.find(t => t.id === teamId);
          if (!team) { toast.error('Team not found.'); return false; }

          try {
            // Validate via TeamBattleManager
            const record = { id: team.id, name: team.name, emoji: team.emoji, captainId: team.captain.userId, memberIds: [team.captain.userId, ...team.members.map(m => m.userId)], score: team.totalScore, rank: team.rank, isOpen: team.isOpen, createdAt: '' };
            teamBattleManager.joinTeam(record, userId); // throws on error

            const newMember: EventParticipant = { userId, displayName: 'You', avatarSeed: userId, rank: team.members.length + 2, score: 0, pnl: 0, pnlPct: 0, trades: 0, winRate: 0, status: 'registered', joinedAt: isoNow(), delta: 0, teamRole: 'member', teamId };
            const updated = eventTeams.map(t =>
              t.id === teamId ? { ...t, members: [...t.members, newMember] } : t,
            );
            set({ teams: { ...teams, [eventId]: updated } });
            toast.success(`Joined team ${team.name}!`);
            return true;
          } catch (err: any) {
            toast.error(err.message);
            return false;
          }
        },

        // ── Chat ─────────────────────────────────────────────────────────────

        sendChatMessage(eventId, userId, displayName, text) {
          if (!text.trim()) return;
          const msg: EventChatMessage = {
            id: uid(), userId, displayName, avatarSeed: userId,
            text: text.trim(), timestamp: isoNow(),
            isHost: false, isPinned: false, reactions: {},
          };
          const existing = get().chatMessages[eventId] ?? [];
          set({ chatMessages: { ...get().chatMessages, [eventId]: [...existing, msg] } });
        },

        // ── Notifications ────────────────────────────────────────────────────

        markNotificationRead(notifId) {
          set({ notifications: get().notifications.map(n => n.id === notifId ? { ...n, read: true } : n) });
        },
        markAllRead() {
          set({ notifications: get().notifications.map(n => ({ ...n, read: true })) });
        },

        // ── Navigation ───────────────────────────────────────────────────────

        setActiveTab(tab)       { set({ activeTab: tab }); },
        setSelectedEvent(id)    { set({ selectedEventId: id }); },

        // ── Real-time tick ───────────────────────────────────────────────────

        refreshTick() {
          const { myEntries, leaderboards, events } = get();
          const updatedEntries: typeof myEntries = {};

          for (const [eid, entry] of Object.entries(myEntries)) {
            const ev = events.find(e => e.id === eid);
            if (!ev || ev.status !== 'live') { updatedEntries[eid] = entry; continue; }
            const delta     = (Math.random() - 0.48) * 0.15;
            const newPnlPct = parseFloat(Math.max(-20, Math.min(50, entry.pnlPct + delta)).toFixed(2));
            updatedEntries[eid] = {
              ...entry,
              pnlPct:  newPnlPct,
              score:   newPnlPct,
              pnl:     Math.round(newPnlPct * 1000),
              trades:  entry.trades + (Math.random() < 0.3 ? 1 : 0),
              winRate: parseFloat(Math.max(0.3, Math.min(0.9, entry.winRate + (Math.random() - 0.5) * 0.02)).toFixed(2)),
            };
          }

          // Shuffle live leaderboards slightly, then re-rank via §4.2
          const newLb: typeof leaderboards = {};
          for (const [eid, lb] of Object.entries(leaderboards)) {
            const ev = events.find(e => e.id === eid);
            if (!ev || ev.status !== 'live') { newLb[eid] = lb; continue; }
            const prevMap = new Map(lb.map(p => [p.userId, p.rank]));
            const bumped  = lb.map(p => ({
              ...p,
              score:  parseFloat((p.score  + (Math.random() - 0.48) * 0.08).toFixed(2)),
              pnlPct: parseFloat((p.pnlPct + (Math.random() - 0.48) * 0.08).toFixed(2)),
            }));
            // §4.2 ranking
            const ranked = rankingCalculator.calculateRankings(bumped, ev.type, prevMap);
            newLb[eid] = ranked.map(r => {
              const original = bumped.find(p => p.userId === r.userId)!;
              return { ...original, rank: r.rank, delta: r.delta, score: r.score };
            });
          }

          set({ myEntries: updatedEntries, leaderboards: newLb });
        },

        // ── Selectors ────────────────────────────────────────────────────────

        getEvent:       id  => get().events.find(e => e.id === id),
        getLeaderboard: eid => get().leaderboards[eid] ?? generateLeaderboard(eid),
        getTeams:       eid => get().teams[eid] ?? generateTeams(eid),
        getChatMessages:eid => get().chatMessages[eid] ?? generateChatMessages(eid),
        getMyEntry:     eid => get().myEntries[eid],
        isJoined:       eid => !!get().myEntries[eid],
        getLiveEvents:      () => get().events.filter(e => e.status === 'live'),
        getUpcomingEvents:  () => get().events.filter(e => e.status === 'upcoming'),
        getCompletedEvents: () => get().events.filter(e => e.status === 'completed'),
        getUnreadCount:     () => get().notifications.filter(n => !n.read).length,
        getUserPrizeTotal:  () => get().prizeHistory.reduce((s, t) => s + t.amount, 0),
      };
    },
    {
      name: 'cryptoverse-events-v2',
      storage: createCloudStorage<{
        myEntries: EventsStore['myEntries'];
        earnedBadges: EventsStore['earnedBadges'];
        notifications: EventsStore['notifications'];
        prizeHistory: EventsStore['prizeHistory'];
      }>({
        objectType: 'events',
        userId: () => useAuthStore.getState().user?.email ?? null,
        cachePolicy: 'persistent',
      }),
      partialize: s => ({
        myEntries:    s.myEntries,
        earnedBadges: s.earnedBadges,
        notifications:s.notifications,
        prizeHistory: s.prizeHistory,
      }),
    },
  ),
);

// ─────────────────────────────────────────────────────────────────────────────
// Real-time ticker (global interval)
// ─────────────────────────────────────────────────────────────────────────────

let tickerInterval: ReturnType<typeof setInterval> | null = null;

export function startEventsTicker() {
  if (tickerInterval) return;
  tickerInterval = setInterval(() => {
    useEventsStore.getState().refreshTick();
  }, 8000);
}

export function stopEventsTicker() {
  if (tickerInterval) { clearInterval(tickerInterval); tickerInterval = null; }
}
