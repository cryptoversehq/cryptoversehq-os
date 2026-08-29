/**
 * aiRecommenderStore.ts
 *
 * Central store for the CryptoVerse HQ Personalised Recommender system.
 *
 * Manages:
 *   - behaviorLogs   : UserBehaviorLog ring buffer (per user, max 500)
 *   - interestVectors: Derived UserInterestVector per user
 *   - recommendations: AIRecommendation catalog (per user)
 *   - sessions       : SessionContext for current browser session
 *
 * Responsibilities:
 *   - logBehavior()       : append a behavioral event and update interest vector
 *   - getRecommendations(): filtered/sorted recommendation list
 *   - markViewed/Clicked/Dismissed: interaction state updates
 *   - Refresh engine      : re-scores and replenishes recommendations every 2 min
 *   - Cold-start seeding  : seeds 25 synthetic events for new users
 *   - Session management  : tracks session ID, page views, activity
 *
 * Persistence:
 *   cryptoverse_behavior_v1      (behavior logs per user)
 *   cryptoverse_vectors_v1       (interest vectors per user)
 *   cryptoverse_recs_v1          (recommendations per user)
 *   cryptoverse_sessions_v1      (session registry)
 */

import { create } from 'zustand';
import { cloudRecordStore } from './cloudData';
import { v4 as uuidv4 } from 'uuid';
import {
  AIRecommendation,
  UserBehaviorLog,
  UserInterestVector,
  SessionContext,
  RecommendationType,
  BehaviorEventType,
  BehaviorEventData,
  RecommendationFilters,
  RecommendationSortKey,
  RecommenderGlobalStats,
  RecommenderEngineConfig,
  LogBehaviorResult,
  RefreshResult,
  DEFAULT_RECOMMENDATION_FILTERS,
  DEFAULT_ENGINE_CONFIG,
  MAX_BEHAVIOR_LOGS_PER_USER,
  MAX_SESSIONS_PER_USER,
  SESSION_TIMEOUT_MS,
  SEED_BEHAVIOR_EVENTS,
} from './aiRecommenderTypes';
import {
  extractInterestVector,
  buildRecommendation,
  generateCandidates,
  applyDiversityFilter,
  pruneExpired,
  generateSeedBehaviorEvents,
} from './aiRecommenderEngine';
import { generateId } from './strategyUtils';

// ─── NOTIFICATION BRIDGE ──────────────────────────────────────────────────────

type RecommenderNotifyPayload = {
  type:    'trade' | 'achievement' | 'system' | 'liquidation';
  title:   string;
  message: string;
};

let _recommenderNotifyHandler: ((n: RecommenderNotifyPayload) => void) | null = null;

export function registerRecommenderNotifyHandler(fn: (n: RecommenderNotifyPayload) => void) {
  _recommenderNotifyHandler = fn;
}

function recommenderNotify(n: RecommenderNotifyPayload) {
  _recommenderNotifyHandler?.(n);
}

// ─── PERSISTENCE ──────────────────────────────────────────────────────────────

const BEHAVIOR_KEY  = 'cryptoverse_behavior_v1';
const VECTORS_KEY   = 'cryptoverse_vectors_v1';
const RECS_KEY      = 'cryptoverse_recs_v1';
const SESSIONS_KEY  = 'cryptoverse_sessions_v1';
const SEEDED_KEY    = 'cryptoverse_recs_seeded_v1';

function load<T>(key: string, fallback: T): T {
  return cloudRecordStore.get<T>('ai_recommender', key, fallback);
}
function persist(key: string, v: unknown) {
  cloudRecordStore.set('ai_recommender', key, v);
}

// ─── SESSION HELPERS ──────────────────────────────────────────────────────────

function getOrCreateSessionId(userId: string): string {
  const key = `cvai_session_${userId}`;
  const stored = sessionStorage.getItem(key);
  if (stored) return stored;
  const id = `sess_${generateId()}`;
  sessionStorage.setItem(key, id);
  return id;
}

function isSessionExpired(session: SessionContext): boolean {
  const lastActivity = new Date(session.lastActivityAt).getTime();
  return Date.now() - lastActivity > SESSION_TIMEOUT_MS;
}

// ─── FILTERING & SORTING ──────────────────────────────────────────────────────

function applyRecommendationFilters(
  recs: AIRecommendation[],
  f:   RecommendationFilters,
): AIRecommendation[] {
  const now = new Date().toISOString();
  return recs.filter(r => {
    if (r.expiresAt < now)                                      return false;
    if (f.hideDismissed && r.isDismissed)                       return false;
    if (f.hideViewed   && r.isViewed)                          return false;
    if (f.types.length > 0 && !f.types.includes(r.type))      return false;
    if (r.score < f.minScore)                                   return false;
    return true;
  });
}

function sortRecommendations(
  recs: AIRecommendation[],
  by:  RecommendationSortKey,
): AIRecommendation[] {
  const a = [...recs];
  switch (by) {
    case 'score_desc': return a.sort((x,y) => y.score - x.score);
    case 'newest':     return a.sort((x,y) => y.createdAt.localeCompare(x.createdAt));
    case 'type_asc':   return a.sort((x,y) => x.type.localeCompare(y.type));
    default:           return a;
  }
}

// ─── REFRESH ENGINE ───────────────────────────────────────────────────────────

let _refreshInterval: ReturnType<typeof setInterval> | null = null;

function stopRecommenderPolling() {
  if (_refreshInterval) { clearInterval(_refreshInterval); _refreshInterval = null; }
}

function startRecommenderPolling(tick: () => void, intervalMs: number) {
  stopRecommenderPolling();
  _refreshInterval = setInterval(tick, intervalMs);
}

// ─── RING BUFFER PRUNE ────────────────────────────────────────────────────────

function pruneLogs(logs: UserBehaviorLog[]): UserBehaviorLog[] {
  if (logs.length <= MAX_BEHAVIOR_LOGS_PER_USER) return logs;
  return [...logs]
    .sort((a,b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, MAX_BEHAVIOR_LOGS_PER_USER);
}

// ─── GENERATE FRESH RECOMMENDATIONS ──────────────────────────────────────────

function generateRecsForUser(
  userId:       string,
  vector:       UserInterestVector,
  existingRecs: AIRecommendation[],
  config:       RecommenderEngineConfig,
  perType:      number = config.recommendationsPerType,
): AIRecommendation[] {
  const hourOfDay   = new Date().getHours();
  const types: RecommendationType[] = ['strategy','bot','lesson','competition','trader'];
  const existingIds = new Set(existingRecs.map(r => r.targetId));
  const newRecs: AIRecommendation[] = [];

  for (const type of types) {
    const candidates = generateCandidates(type, vector, existingIds, perType * 2);
    for (const targetId of candidates.slice(0, perType)) {
      const rec = buildRecommendation({ userId, type, targetId, vector, config, existingRecs: [...existingRecs, ...newRecs], hourOfDay });
      if (rec.score >= config.minScoreThreshold) {
        newRecs.push(rec);
        existingIds.add(targetId);
      }
    }
  }

  return applyDiversityFilter(newRecs.sort((a,b) => b.score - a.score), config.recommendationsPerType + 2);
}

// ─── STATE INTERFACE ──────────────────────────────────────────────────────────

export interface AIRecommenderState {
  behaviorLogs:    Record<string, UserBehaviorLog[]>;   // userId → logs
  interestVectors: Record<string, UserInterestVector>;  // userId → vector
  recommendations: Record<string, AIRecommendation[]>; // userId → recs
  sessions:        Record<string, SessionContext>;       // userId → current session

  config:          RecommenderEngineConfig;

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  seedUser:        (userId: string) => void;

  // ── Polling ────────────────────────────────────────────────────────────────
  startPolling:    (userId: string) => void;
  stopPolling:     () => void;
  refreshRecs:     (userId: string) => RefreshResult;

  // ── Behavior logging ──────────────────────────────────────────────────────
  logBehavior:     (params: {
    userId:    string;
    eventType: BehaviorEventType;
    eventData: BehaviorEventData;
  }) => LogBehaviorResult;

  // ── Session management ────────────────────────────────────────────────────
  touchSession:    (userId: string, path: string) => SessionContext;
  getSession:      (userId: string) => SessionContext | null;

  // ── Interaction tracking ──────────────────────────────────────────────────
  markViewed:    (userId: string, recId: string) => void;
  markClicked:   (userId: string, recId: string) => void;
  markDismissed: (userId: string, recId: string) => void;

  // ── Queries ────────────────────────────────────────────────────────────────
  getRecommendations: (userId: string, filters?: RecommendationFilters, limit?: number) => AIRecommendation[];
  getRecommendationsByType: (userId: string, type: RecommendationType, limit?: number) => AIRecommendation[];
  getInterestVector:  (userId: string) => UserInterestVector | null;
  getBehaviorLogs:    (userId: string, limit?: number) => UserBehaviorLog[];

  // ── Admin ──────────────────────────────────────────────────────────────────
  getGlobalStats:     () => RecommenderGlobalStats;
  updateConfig:       (patch: Partial<RecommenderEngineConfig>) => void;
}

// ─── STORE ────────────────────────────────────────────────────────────────────

export const useAIRecommenderStore = create<AIRecommenderState>((set, get) => {
  const behaviorLogs    = load<Record<string, UserBehaviorLog[]>>(BEHAVIOR_KEY,  {});
  const interestVectors = load<Record<string, UserInterestVector>>(VECTORS_KEY,  {});
  const recommendations = load<Record<string, AIRecommendation[]>>(RECS_KEY,     {});
  const sessions        = load<Record<string, SessionContext>>(SESSIONS_KEY,      {});

  return {
    behaviorLogs,
    interestVectors,
    recommendations,
    sessions,
    config: DEFAULT_ENGINE_CONFIG,

    // ── Bootstrap ─────────────────────────────────────────────────────────────

    seedUser: (userId) => {
      const seededKey = `${SEEDED_KEY}_${userId}`;
      if (cloudRecordStore.get<string>('ai_recommender', seededKey, '') === '1' && (get().behaviorLogs[userId]?.length ?? 0) > 0) return;

      const sessionId = getOrCreateSessionId(userId);
      const seedLogs  = generateSeedBehaviorEvents(userId, sessionId, SEED_BEHAVIOR_EVENTS);
      const allLogs   = pruneLogs([...(get().behaviorLogs[userId] ?? []), ...seedLogs]);
      const vector    = extractInterestVector(userId, allLogs, get().config);
      const recs      = generateRecsForUser(userId, vector, [], get().config);

      const newLogs    = { ...get().behaviorLogs,    [userId]: allLogs };
      const newVectors = { ...get().interestVectors, [userId]: vector  };
      const newRecs    = { ...get().recommendations,  [userId]: recs   };

      persist(BEHAVIOR_KEY, newLogs);
      persist(VECTORS_KEY,  newVectors);
      persist(RECS_KEY,     newRecs);
      cloudRecordStore.set('ai_recommender', seededKey, '1');
      set({ behaviorLogs: newLogs, interestVectors: newVectors, recommendations: newRecs });
    },

    // ── Polling ───────────────────────────────────────────────────────────────

    startPolling: (userId) => {
      const { config } = get();
      startRecommenderPolling(() => get().refreshRecs(userId), config.refreshIntervalMs);
    },

    stopPolling: () => { stopRecommenderPolling(); },

    refreshRecs: (userId) => {
      const t0          = Date.now();
      const { config }  = get();
      const allLogs     = get().behaviorLogs[userId] ?? [];
      const vector      = extractInterestVector(userId, allLogs, config);
      const existing    = get().recommendations[userId] ?? [];
      const { kept, pruned } = pruneExpired(existing);

      const newRecs = generateRecsForUser(userId, vector, kept, config);
      const merged  = applyDiversityFilter(
        [...kept, ...newRecs].sort((a,b) => b.score - a.score),
        config.recommendationsPerType + 2,
      ).slice(0, config.maxRecommendationsPerUser);

      const newVectors = { ...get().interestVectors, [userId]: vector };
      const newAllRecs = { ...get().recommendations,  [userId]: merged };

      persist(VECTORS_KEY, newVectors);
      persist(RECS_KEY,    newAllRecs);
      set({ interestVectors: newVectors, recommendations: newAllRecs });

      if (newRecs.length > 0) {
        recommenderNotify({
          type:    'system',
          title:   '✨ New Recommendations',
          message: `${newRecs.length} personalised picks are ready for you.`,
        });
      }

      return {
        userId,
        generated:  newRecs.length,
        pruned,
        durationMs: Date.now() - t0,
      };
    },

    // ── Behavior logging ───────────────────────────────────────────────────────

    logBehavior: (params) => {
      const { userId, eventType, eventData } = params;
      const sessionId = getOrCreateSessionId(userId);

      const log: UserBehaviorLog = {
        id:        generateId(),
        userId,
        eventType,
        eventData,
        sessionId,
        timestamp: new Date().toISOString(),
      };

      const prev   = get().behaviorLogs[userId] ?? [];
      const allLogs = pruneLogs([log, ...prev]);

      // Update interest vector incrementally
      const vector = extractInterestVector(userId, allLogs, get().config);

      const newLogs    = { ...get().behaviorLogs,    [userId]: allLogs };
      const newVectors = { ...get().interestVectors, [userId]: vector  };

      persist(BEHAVIOR_KEY, newLogs);
      persist(VECTORS_KEY,  newVectors);
      set({ behaviorLogs: newLogs, interestVectors: newVectors });

      // Update session
      get().touchSession(userId, (eventData as Record<string,unknown>)['path'] as string ?? '/');

      return { ok: true, logId: log.id };
    },

    // ── Session management ────────────────────────────────────────────────────

    touchSession: (userId, path) => {
      const now       = new Date().toISOString();
      const sessionId = getOrCreateSessionId(userId);
      const existing  = get().sessions[userId];

      let session: SessionContext;
      if (!existing || isSessionExpired(existing)) {
        session = {
          sessionId,
          userId,
          startedAt:         now,
          lastActivityAt:    now,
          pageViews:         1,
          eventsThisSession: 1,
          currentPath:       path ?? '/',
          referrer:          existing?.currentPath ?? '',
        };
      } else {
        session = {
          ...existing,
          lastActivityAt:    now,
          pageViews:         existing.pageViews + (path !== existing.currentPath ? 1 : 0),
          eventsThisSession: existing.eventsThisSession + 1,
          currentPath:       path ?? existing.currentPath,
        };
      }

      const newSessions = { ...get().sessions, [userId]: session };
      persist(SESSIONS_KEY, newSessions);
      set({ sessions: newSessions });
      return session;
    },

    getSession: (userId) => get().sessions[userId] ?? null,

    // ── Interaction tracking ───────────────────────────────────────────────────

    markViewed: (userId, recId) => {
      const recs = get().recommendations[userId] ?? [];
      const updated = recs.map(r => r.id === recId ? { ...r, isViewed: true } : r);
      const newRecs = { ...get().recommendations, [userId]: updated };
      persist(RECS_KEY, newRecs);
      set({ recommendations: newRecs });
    },

    markClicked: (userId, recId) => {
      const recs = get().recommendations[userId] ?? [];
      const rec  = recs.find(r => r.id === recId);
      const updated = recs.map(r => r.id === recId ? { ...r, isViewed: true, isClicked: true } : r);
      const newRecs = { ...get().recommendations, [userId]: updated };
      persist(RECS_KEY, newRecs);
      set({ recommendations: newRecs });

      // Log the interaction as a behavior event
      if (rec) {
        get().logBehavior({
          userId,
          eventType: 'recommendation_click',
          eventData: { recommendationId: recId, type: rec.type, action: 'click' },
        });
      }
    },

    markDismissed: (userId, recId) => {
      const recs = get().recommendations[userId] ?? [];
      const rec  = recs.find(r => r.id === recId);
      const updated = recs.map(r => r.id === recId ? { ...r, isDismissed: true } : r);
      const newRecs = { ...get().recommendations, [userId]: updated };
      persist(RECS_KEY, newRecs);
      set({ recommendations: newRecs });

      if (rec) {
        get().logBehavior({
          userId,
          eventType: 'recommendation_dismiss',
          eventData: { recommendationId: recId, type: rec.type, action: 'dismiss' },
        });
      }
    },

    // ── Queries ───────────────────────────────────────────────────────────────

    getRecommendations: (userId, filters = DEFAULT_RECOMMENDATION_FILTERS, limit = 30) => {
      const recs = get().recommendations[userId] ?? [];
      return sortRecommendations(applyRecommendationFilters(recs, filters), filters.sortBy).slice(0, limit);
    },

    getRecommendationsByType: (userId, type, limit = 10) => {
      const recs = get().recommendations[userId] ?? [];
      const now  = new Date().toISOString();
      return recs
        .filter(r => r.type === type && !r.isDismissed && r.expiresAt > now)
        .sort((a,b) => b.score - a.score)
        .slice(0, limit);
    },

    getInterestVector: (userId) => get().interestVectors[userId] ?? null,

    getBehaviorLogs: (userId, limit = 100) => {
      return (get().behaviorLogs[userId] ?? [])
        .sort((a,b) => b.timestamp.localeCompare(a.timestamp))
        .slice(0, limit);
    },

    // ── Admin ─────────────────────────────────────────────────────────────────

    getGlobalStats: () => {
      const { recommendations, behaviorLogs, sessions } = get();
      const allRecs = Object.values(recommendations).flat();
      const allLogs = Object.values(behaviorLogs).flat();
      const now     = new Date().toISOString();

      const active    = allRecs.filter(r => r.expiresAt > now && !r.isDismissed);
      const dismissed = allRecs.filter(r => r.isDismissed);
      const expired   = allRecs.filter(r => r.expiresAt <= now);
      const viewed    = allRecs.filter(r => r.isViewed);
      const clicked   = allRecs.filter(r => r.isClicked);

      const types: RecommendationType[] = ['strategy','bot','lesson','competition','trader'];
      const avgScorePerType: RecommenderGlobalStats['avgScorePerType'] = {} as RecommenderGlobalStats['avgScorePerType'];
      let topType: RecommendationType | null = null;
      let topTypeCount = 0;
      for (const t of types) {
        const typeRecs = active.filter(r => r.type === t);
        avgScorePerType[t] = typeRecs.length > 0
          ? Math.round(typeRecs.reduce((s,r) => s + r.score, 0) / typeRecs.length)
          : 0;
        if (typeRecs.length > topTypeCount) { topTypeCount = typeRecs.length; topType = t; }
      }

      return {
        totalRecommendations:     allRecs.length,
        activeRecommendations:    active.length,
        expiredRecommendations:   expired.length,
        dismissedRecommendations: dismissed.length,
        totalBehaviorEvents:      allLogs.length,
        totalSessions:            Object.keys(sessions).length,
        avgScorePerType,
        clickThroughRate: viewed.length > 0 ? r2((clicked.length / viewed.length) * 100) : 0,
        dismissalRate:    viewed.length > 0 ? r2((dismissed.filter(r => r.isViewed).length / viewed.length) * 100) : 0,
        topRecommendationType: topType,
      };
    },

    updateConfig: (patch) => {
      set(state => ({ config: { ...state.config, ...patch } }));
    },
  };
});

function r2(v: number) { return Math.round(v * 100) / 100; }
