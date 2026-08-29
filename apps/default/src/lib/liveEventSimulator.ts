/**
 * liveEventSimulator.ts
 *
 * Realistic live events simulator for the CryptoVerse HQ platform.
 *
 * Provides:
 *   SEEDED_EVENTS            pre-built event catalog (past + active + upcoming)
 *   buildSeedEvents()        generates dated LiveEvent objects from the catalog
 *   tickScores()             evolves participant scores during an active event
 *   buildLeaderboard()       ranks participants for live leaderboard view
 *   resolveEvent()           finalises scores, assigns ranks and prizes
 *   advanceParticipants()    simulates NPC participants joining over time
 *
 * All functions are pure (no side effects). The store owns mutable state.
 */

import {
  LiveEvent,
  EventType,
  EventRules,
  PrizeDistribution,
  EventParticipant,
  LeaderboardEntry,
  STANDARD_DISTRIBUTIONS,
  makeTopNDistribution,
  SEED_PAST_EVENTS,
  SEED_FUTURE_EVENTS,
  SEED_ACTIVE_EVENTS,
} from './liveEventTypes';
import { generateId } from './strategyUtils';

// ─── PRNG ─────────────────────────────────────────────────────────────────────

function seededRng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function strHash(s: string): number {
  let h = 2166136261;
  for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function r2(v: number) { return Math.round(v * 100) / 100; }

// ─── EVENT SEED DEFINITIONS ───────────────────────────────────────────────────

interface EventSeed {
  title:           string;
  description:     string;
  type:            EventType;
  durationHours:   number;
  entryFee:        number;
  prizePool:       number;
  maxParticipants: number | null;
  minLevel:        number;
  bannerColor:     string;
  tags:            string[];
  featured:        boolean;
}

const EVENT_SEEDS: EventSeed[] = [
  // ── Weekend Challenges ─────────────────────────────────────────────────────
  {
    title: 'Bitcoin Blitz Weekend',
    description: 'A 48-hour trading challenge focused exclusively on BTC/USDT. Achieve the highest percentage P&L from a $10,000 simulated account to claim the top prize.',
    type: 'weekend_challenge', durationHours: 48,
    entryFee: 100, prizePool: 25_000,
    maxParticipants: 500, minLevel: 2,
    bannerColor: '#F7931A', tags: ['bitcoin','trading','weekend'], featured: true,
  },
  {
    title: 'Altcoin Arena',
    description: 'Trade any top-20 altcoin in this fast-paced 48-hour challenge. Maximum leverage 5×. Best Sharpe ratio wins.',
    type: 'weekend_challenge', durationHours: 48,
    entryFee: 50, prizePool: 10_000,
    maxParticipants: 300, minLevel: 1,
    bannerColor: '#9945FF', tags: ['altcoins','sharpe','weekend'], featured: false,
  },
  {
    title: 'Zero-Fee Flash Challenge',
    description: 'Free entry, 24-hour sprint. Trade BTC or ETH. Top 5 traders by P&L share the prize pool. Open to all levels.',
    type: 'weekend_challenge', durationHours: 24,
    entryFee: 0, prizePool: 5_000,
    maxParticipants: 1000, minLevel: 0,
    bannerColor: '#22c55e', tags: ['free','btc','eth','beginner'], featured: true,
  },
  {
    title: 'DeFi Summer Showdown',
    description: 'Trade the top DeFi tokens across a 48h window. Scoring based on cumulative absolute profit.',
    type: 'weekend_challenge', durationHours: 48,
    entryFee: 200, prizePool: 50_000,
    maxParticipants: 250, minLevel: 5,
    bannerColor: '#6366f1', tags: ['defi','advanced','high-stakes'], featured: true,
  },
  // ── Monthly Tournaments ────────────────────────────────────────────────────
  {
    title: 'CryptoVerse Grand Prix',
    description: 'The flagship month-long tournament. Accumulate points through profitable trades. Consistent performers rise to the top. 10 prize tiers.',
    type: 'monthly_tournament', durationHours: 30 * 24,
    entryFee: 500, prizePool: 200_000,
    maxParticipants: 2000, minLevel: 3,
    bannerColor: '#f59e0b', tags: ['flagship','monthly','high-stakes'], featured: true,
  },
  {
    title: 'Rising Stars League',
    description: 'Monthly tournament exclusively for Level 1–5 traders. Smaller prize pool, better odds. Build your reputation here.',
    type: 'monthly_tournament', durationHours: 30 * 24,
    entryFee: 100, prizePool: 30_000,
    maxParticipants: 500, minLevel: 1,
    bannerColor: '#22c55e', tags: ['beginners','monthly','academy'], featured: false,
  },
  // ── Team Battles ───────────────────────────────────────────────────────────
  {
    title: 'Nation Wars: Q2 Edition',
    description: 'Traders join forces with their nation. Team average P&L determines the winner. Honour and CP coins await.',
    type: 'team_battle', durationHours: 72,
    entryFee: 150, prizePool: 75_000,
    maxParticipants: 1000, minLevel: 2,
    bannerColor: '#ef4444', tags: ['nations','team','battle'], featured: true,
  },
  {
    title: 'Bulls vs Bears',
    description: 'Pick your side — long-only Bulls vs short-only Bears. Whichever side\'s average return wins takes the pool.',
    type: 'team_battle', durationHours: 48,
    entryFee: 0, prizePool: 15_000,
    maxParticipants: 600, minLevel: 1,
    bannerColor: '#f97316', tags: ['free','bulls','bears','team'], featured: false,
  },
  // ── Live Webinars ──────────────────────────────────────────────────────────
  {
    title: 'Technical Analysis Masterclass',
    description: 'Deep-dive into advanced TA patterns: Wyckoff accumulation, order blocks, and liquidity sweeps. Hosted by a professional trader.',
    type: 'live_webinar', durationHours: 2,
    entryFee: 0, prizePool: 0,
    maxParticipants: null, minLevel: 0,
    bannerColor: '#06b6d4', tags: ['education','TA','free'], featured: false,
  },
  {
    title: 'DeFi Yield Strategies 2025',
    description: 'Expert panel discusses the best yield strategies in the current market. Q&A session included.',
    type: 'live_webinar', durationHours: 1.5,
    entryFee: 0, prizePool: 0,
    maxParticipants: null, minLevel: 0,
    bannerColor: '#8247e5', tags: ['defi','yield','free','panel'], featured: false,
  },
  // ── Market Analysis ────────────────────────────────────────────────────────
  {
    title: 'BTC Price Prediction Contest',
    description: 'Submit your Bitcoin price prediction for end-of-month. The trader closest to the actual closing price wins. No trading required.',
    type: 'market_analysis', durationHours: 7 * 24,
    entryFee: 25, prizePool: 5_000,
    maxParticipants: 2000, minLevel: 0,
    bannerColor: '#F7931A', tags: ['prediction','bitcoin','analysis'], featured: false,
  },
  {
    title: 'ETH Merge Anniversary Prediction',
    description: 'Predict ETH\'s closing price one week from now. The crowd has spoken before — will you be closer?',
    type: 'market_analysis', durationHours: 7 * 24,
    entryFee: 0, prizePool: 8_000,
    maxParticipants: 5000, minLevel: 0,
    bannerColor: '#627eea', tags: ['prediction','ethereum','free'], featured: true,
  },
  // ── Extra weekend challenges to ensure variety ─────────────────────────────
  {
    title: 'SOL Speed Run',
    description: 'Solana-only 24h sprint. Highest absolute profit from a $5,000 paper account. Fast, furious, rewarding.',
    type: 'weekend_challenge', durationHours: 24,
    entryFee: 75, prizePool: 12_000,
    maxParticipants: 400, minLevel: 1,
    bannerColor: '#9945FF', tags: ['solana','sprint','weekend'], featured: false,
  },
  {
    title: 'Leverage King',
    description: 'Use up to 20× leverage. Highest P&L wins. Not for the faint-hearted. Entry for Level 8+ traders only.',
    type: 'weekend_challenge', durationHours: 48,
    entryFee: 300, prizePool: 100_000,
    maxParticipants: 100, minLevel: 8,
    bannerColor: '#dc2626', tags: ['leverage','high-risk','advanced'], featured: true,
  },
];

// ─── RULES FACTORY ────────────────────────────────────────────────────────────

function makeRules(seed: EventSeed, rng: () => number): EventRules {
  switch (seed.type) {
    case 'weekend_challenge':
      return {
        type: 'weekend_challenge',
        scoringMetric: rng() < 0.5 ? 'pnl_percent' : 'total_profit',
        allowedAssets: [],
        startingBalance: 10_000,
        maxLeverage: seed.minLevel >= 8 ? 20 : 5,
        shortingAllowed: seed.minLevel >= 3,
      };
    case 'monthly_tournament':
      return {
        type: 'monthly_tournament',
        scoringMetric: 'cumulative_pnl',
        pointsPerWin: 10,
        allowedAssets: [],
        maxPositions: 10,
      };
    case 'team_battle':
      return {
        type: 'team_battle',
        teamSize: 5,
        scoringMetric: 'avg_pnl',
        allowedAssets: [],
      };
    case 'live_webinar':
      return {
        type: 'live_webinar',
        presenter: 'CryptoVerse HQ Expert',
        topic: seed.title,
        platform: 'in_app',
        recordingAvailable: true,
      };
    case 'market_analysis':
      return {
        type: 'market_analysis',
        asset: seed.tags.includes('ethereum') ? 'ETH' : 'BTC',
        predictionType: 'price_target',
        targetDate: new Date(Date.now() + seed.durationHours * 3_600_000).toISOString().split('T')[0],
        scoringMethod: 'closest_wins',
      };
  }
}

// ─── buildSeedEvents ──────────────────────────────────────────────────────────

/**
 * Generate the initial event catalog:
 *   SEED_PAST_EVENTS   completed events stretching back ~2 months
 *   SEED_ACTIVE_EVENTS events currently live
 *   SEED_FUTURE_EVENTS events scheduled in the next 2 weeks
 */
export function buildSeedEvents(): LiveEvent[] {
  const now      = Date.now();
  const ONE_HOUR = 3_600_000;
  const ONE_DAY  = 86_400_000;
  const events: LiveEvent[] = [];

  const seeds = [...EVENT_SEEDS];
  let seedIdx = 0;

  // ── Past events ────────────────────────────────────────────────────────────
  for (let i = 0; i < SEED_PAST_EVENTS; i++) {
    const seed = seeds[seedIdx % seeds.length]; seedIdx++;
    const rng  = seededRng(strHash(seed.title + 'past' + i));

    // Spread past events over the last 8 weeks
    const endOffset   = (i + 1) * 7 * ONE_DAY;
    const endTime     = new Date(now - endOffset).toISOString();
    const startTime   = new Date(now - endOffset - seed.durationHours * ONE_HOUR).toISOString();
    const participants = Math.round((seed.maxParticipants ?? 200) * (0.4 + rng() * 0.55));

    events.push({
      id:          generateId(),
      title:       seed.title,
      description: seed.description,
      type:        seed.type,
      startTime, endTime,
      rules:       makeRules(seed, rng),
      minLevel:    seed.minLevel,
      entryFee:    seed.entryFee,
      prizePool:   seed.prizePool,
      prizeDistribution: STANDARD_DISTRIBUTIONS[seed.type](seed.prizePool),
      participants,
      maxParticipants: seed.maxParticipants,
      registrationOpen: false,
      status:      'completed',
      createdAt:   new Date(now - endOffset - seed.durationHours * ONE_HOUR - 3 * ONE_DAY).toISOString(),
      createdBy:   'admin',
      bannerColor: seed.bannerColor,
      tags:        seed.tags,
      featured:    seed.featured,
    });
  }

  // ── Active events ──────────────────────────────────────────────────────────
  for (let i = 0; i < SEED_ACTIVE_EVENTS; i++) {
    const seed = seeds[seedIdx % seeds.length]; seedIdx++;
    const rng  = seededRng(strHash(seed.title + 'active' + i));

    const startTime = new Date(now - Math.floor(seed.durationHours * ONE_HOUR * rng() * 0.6)).toISOString();
    const endTime   = new Date(new Date(startTime).getTime() + seed.durationHours * ONE_HOUR).toISOString();
    const participants = Math.round((seed.maxParticipants ?? 200) * (0.3 + rng() * 0.5));

    events.push({
      id:          generateId(),
      title:       seed.title + (i > 0 ? ` — Edition ${i + 1}` : ''),
      description: seed.description,
      type:        seed.type,
      startTime, endTime,
      rules:       makeRules(seed, rng),
      minLevel:    seed.minLevel,
      entryFee:    seed.entryFee,
      prizePool:   seed.prizePool,
      prizeDistribution: STANDARD_DISTRIBUTIONS[seed.type](seed.prizePool),
      participants,
      maxParticipants: seed.maxParticipants,
      registrationOpen: true,
      status:      'active',
      createdAt:   new Date(now - 4 * ONE_DAY).toISOString(),
      createdBy:   'admin',
      bannerColor: seed.bannerColor,
      tags:        seed.tags,
      featured:    seed.featured,
    });
  }

  // ── Future events ──────────────────────────────────────────────────────────
  for (let i = 0; i < SEED_FUTURE_EVENTS; i++) {
    const seed = seeds[seedIdx % seeds.length]; seedIdx++;
    const rng  = seededRng(strHash(seed.title + 'future' + i));

    // Spread future events over the next 14 days
    const startOffset = (i + 1) * 2 * ONE_DAY + Math.floor(rng() * ONE_DAY);
    const startTime   = new Date(now + startOffset).toISOString();
    const endTime     = new Date(now + startOffset + seed.durationHours * ONE_HOUR).toISOString();

    events.push({
      id:          generateId(),
      title:       seed.title,
      description: seed.description,
      type:        seed.type,
      startTime, endTime,
      rules:       makeRules(seed, rng),
      minLevel:    seed.minLevel,
      entryFee:    seed.entryFee,
      prizePool:   seed.prizePool,
      prizeDistribution: STANDARD_DISTRIBUTIONS[seed.type](seed.prizePool),
      participants: 0,
      maxParticipants: seed.maxParticipants,
      registrationOpen: true,
      status:      'scheduled',
      createdAt:   new Date(now - ONE_DAY).toISOString(),
      createdBy:   'admin',
      bannerColor: seed.bannerColor,
      tags:        seed.tags,
      featured:    seed.featured,
    });
  }

  return events;
}

// ─── tickScores ───────────────────────────────────────────────────────────────

/**
 * Evolve the scores for all participants in an active event by one tick.
 * Uses a random walk with a small positive drift to simulate trading activity.
 * Returns updated participant array.
 */
export function tickScores(
  participants: EventParticipant[],
  event:        LiveEvent,
): EventParticipant[] {
  if (event.type === 'live_webinar') return participants;

  return participants.map(p => {
    const rng   = seededRng((strHash(p.userId + p.eventId) ^ (Date.now() / 1000 | 0)) >>> 0);
    const drift = 0.002;
    const vol   = 0.04;
    const dW    = (rng() + rng() + rng() - 1.5) / 1.5;
    const prev  = p.score ?? 0;
    const next  = r2(prev + drift + vol * dW);
    return { ...p, score: next };
  });
}

// ─── buildLeaderboard ─────────────────────────────────────────────────────────

/**
 * Build a ranked leaderboard from the current participant list.
 * Scores are sorted descending. Display names are anonymised during live events.
 */
export function buildLeaderboard(
  participants: EventParticipant[],
  currentUserId: string,
  isLive: boolean,
): LeaderboardEntry[] {
  const withScore = participants
    .filter(p => p.score !== null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  return withScore.map((p, i) => ({
    rank:          i + 1,
    userId:        p.userId,
    displayName:   isLive && p.userId !== currentUserId
      ? `Trader #${strHash(p.userId) % 9000 + 1000}`
      : p.userId === currentUserId ? 'You' : `Trader #${strHash(p.userId) % 9000 + 1000}`,
    score:         p.score ?? 0,
    prize:         p.prize,
    teamName:      p.teamName,
    isCurrentUser: p.userId === currentUserId,
  }));
}

// ─── resolveEvent ─────────────────────────────────────────────────────────────

/**
 * Finalise an event: assign ranks, compute prizes from the prize distribution.
 * Returns updated participants with rank, score (if not already set), and prize.
 */
export function resolveEvent(
  participants:      EventParticipant[],
  event:             LiveEvent,
): EventParticipant[] {
  if (event.type === 'live_webinar') {
    const now = new Date().toISOString();
    return participants.map(p => ({ ...p, completedAt: now, prize: 0 }));
  }

  // Sort by score descending; participants with no score go to the bottom
  const sorted = [...participants].sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
  const now    = new Date().toISOString();
  const dist   = event.prizeDistribution;

  return sorted.map((p, i) => {
    const rank = i + 1;
    const prizeRank = dist.ranks.find(r => r.rank === rank);
    const prize = prizeRank?.amount ?? 0;
    return { ...p, rank, prize, completedAt: now };
  });
}

// ─── generateNpcParticipants ──────────────────────────────────────────────────

/**
 * Generate N synthetic NPC EventParticipant records for an event.
 * Called on cold-start to populate completed events with realistic participant data.
 */
export function generateNpcParticipants(
  event:       LiveEvent,
  count:       number,
): EventParticipant[] {
  const rng = seededRng(strHash(event.id));
  const now = new Date().toISOString();

  return Array.from({ length: count }, (_, i) => {
    const userId    = `npc_${event.id.slice(0, 8)}_${i}`;
    const score     = event.type !== 'live_webinar'
      ? r2((rng() - 0.4) * 0.5)  // -0.2 to +0.3 range
      : null;
    const regOffset = Math.floor(rng() * event.participants * 3_600_000);
    const regTime   = new Date(new Date(event.startTime).getTime() - regOffset).toISOString();

    return {
      id:               generateId(),
      eventId:          event.id,
      userId,
      rank:             null,     // resolved after resolveEvent()
      score,
      prize:            null,
      teamId:           event.type === 'team_battle' ? `team_${i % 5}` : null,
      teamName:         event.type === 'team_battle' ? ['Alpha','Beta','Gamma','Delta','Epsilon'][i % 5] : null,
      prediction:       event.type === 'market_analysis' ? r2(30_000 + rng() * 10_000) : null,
      registrationTime: regTime,
      completedAt:      event.status === 'completed' ? now : null,
      entryFeePaid:     event.entryFee,
      prizeClaimed:     false,
    };
  });
}

// ─── advanceEventStatus ───────────────────────────────────────────────────────

/**
 * Determine the correct status for an event based on the current time.
 * Returns the new status (may be unchanged).
 */
export function advanceEventStatus(event: LiveEvent): LiveEvent['status'] {
  if (event.status === 'cancelled') return 'cancelled';
  const now   = Date.now();
  const start = new Date(event.startTime).getTime();
  const end   = new Date(event.endTime).getTime();
  if (now < start) return 'scheduled';
  if (now >= start && now < end) return 'active';
  return 'completed';
}
