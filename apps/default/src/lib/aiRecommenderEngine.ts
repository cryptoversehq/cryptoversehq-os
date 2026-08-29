/**
 * aiRecommenderEngine.ts
 *
 * Multi-signal recommendation engine for the CryptoVerse HQ platform.
 *
 * Architecture:
 *   ┌─ Signal Extraction Layer ──────────────────────────────────────────────┐
 *   │  extractInterestVector()   builds user interest profile from logs       │
 *   │  computeSignals()          evaluates each ScoringSignal for a candidate │
 *   └────────────────────────────────────────────────────────────────────────┘
 *   ┌─ Candidate Generation ─────────────────────────────────────────────────┐
 *   │  generateCandidates()      picks candidate targetIds per type           │
 *   │  buildRecommendation()     assembles AIRecommendation from signals      │
 *   └────────────────────────────────────────────────────────────────────────┘
 *   ┌─ Post-processing ──────────────────────────────────────────────────────┐
 *   │  applyDiversityFilter()    prevents filter bubbles                      │
 *   │  pruneExpired()            removes stale entries                        │
 *   └────────────────────────────────────────────────────────────────────────┘
 *
 * All functions are pure — the store calls them and owns mutable state.
 */

import {
  AIRecommendation,
  UserBehaviorLog,
  UserInterestVector,
  ScoringSignal,
  SignalSource,
  RecommendationType,
  BehaviorEventType,
  BEHAVIOR_EVENT_WEIGHT,
  RecommenderEngineConfig,
  DEFAULT_ENGINE_CONFIG,
  makeEmptyInterestVector,
} from './aiRecommenderTypes';
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

function clamp01(v: number) { return Math.max(0, Math.min(1, v)); }
function normalize(v: number, lo: number, hi: number) { return hi === lo ? 0.5 : clamp01((v - lo) / (hi - lo)); }
function r2(v: number) { return Math.round(v * 100) / 100; }

// ─── INTEREST VECTOR EXTRACTION ───────────────────────────────────────────────

/**
 * Build (or update) a UserInterestVector from the user's behavioral log.
 * Uses a decaying weight model — recent events have more influence.
 */
export function extractInterestVector(
  userId: string,
  logs:   UserBehaviorLog[],
  config: RecommenderEngineConfig = DEFAULT_ENGINE_CONFIG,
): UserInterestVector {
  const vector = makeEmptyInterestVector(userId);
  if (logs.length === 0) return vector;

  const now      = Date.now();
  const ONE_DAY  = 86_400_000;
  const HALF_LIFE_DAYS = 14;  // events lose half their weight every 14 days

  const assetCounts:    Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};
  let riskSum       = 0;
  let riskCount     = 0;
  let automationHits = 0;
  let learningHits   = 0;
  let competitionHits = 0;
  let socialHits     = 0;
  let totalWeight    = 0;

  for (const log of logs) {
    const ageDays   = (now - new Date(log.timestamp).getTime()) / ONE_DAY;
    const timeDecay = Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
    const baseWeight = BEHAVIOR_EVENT_WEIGHT[log.eventType] ?? 0.1;
    const w = baseWeight * timeDecay;
    totalWeight += Math.abs(w);

    const d = log.eventData as Record<string, unknown>;

    // ── Asset signal ──────────────────────────────────────────────────────
    if (d['symbol'] && typeof d['symbol'] === 'string') {
      const base = d['symbol'].replace(/USDT|USD|BTC|USDC|EUR$/, '');
      assetCounts[base] = (assetCounts[base] ?? 0) + w;
    }
    if (d['asset'] && typeof d['asset'] === 'string') {
      assetCounts[d['asset'] as string] = (assetCounts[d['asset'] as string] ?? 0) + w;
    }

    // ── Category signal ───────────────────────────────────────────────────
    if (d['category'] && typeof d['category'] === 'string') {
      categoryCounts[d['category'] as string] = (categoryCounts[d['category'] as string] ?? 0) + w;
    }
    if (d['strategyTag'] && typeof d['strategyTag'] === 'string') {
      categoryCounts[d['strategyTag'] as string] = (categoryCounts[d['strategyTag'] as string] ?? 0) + w;
    }
    if (d['riskLevel'] && typeof d['riskLevel'] === 'string') {
      const rMap: Record<string, number> = { low: 20, medium: 50, high: 75, 'very-high': 95 };
      const rv = rMap[d['riskLevel'] as string];
      if (rv !== undefined) { riskSum += rv * w; riskCount += Math.abs(w); }
    }

    // ── Automation signal ─────────────────────────────────────────────────
    if (log.eventType === 'bot_activate' || log.eventType === 'copy_trade_start') automationHits += w;

    // ── Learning signal ───────────────────────────────────────────────────
    if (log.eventType === 'lesson_complete' || log.eventType === 'lesson_start') learningHits += w;

    // ── Competition signal ────────────────────────────────────────────────
    if (log.eventType === 'competition_join' || log.eventType === 'competition_view') competitionHits += w;

    // ── Social signal ─────────────────────────────────────────────────────
    if (log.eventType === 'trader_follow' || log.eventType === 'copy_trade_start') socialHits += w;
  }

  // ── Normalise asset weights to 0-100 ─────────────────────────────────────
  const maxAsset = Math.max(...Object.values(assetCounts), 0.001);
  for (const [k,v] of Object.entries(assetCounts)) {
    vector.assetWeights[k] = r2((v / maxAsset) * 100);
  }

  // ── Normalise category weights ────────────────────────────────────────────
  const maxCat = Math.max(...Object.values(categoryCounts), 0.001);
  for (const [k,v] of Object.entries(categoryCounts)) {
    vector.categoryWeights[k] = r2((v / maxCat) * 100);
  }

  // ── Risk appetite ─────────────────────────────────────────────────────────
  const riskScore = riskCount > 0 ? r2(riskSum / riskCount) : 50;
  vector.riskScore    = riskScore;
  vector.riskAppetite = riskScore < 35 ? 'conservative' : riskScore < 65 ? 'moderate' : 'aggressive';

  // ── Preferences ───────────────────────────────────────────────────────────
  const norm = (v: number) => r2(clamp01(v / (totalWeight * 0.3 || 1)) * 100);
  vector.prefersAutomation  = norm(automationHits)  > 30;
  vector.prefersLearning    = norm(learningHits)    > 25;
  vector.prefersCompeting   = norm(competitionHits) > 20;
  vector.socialScore        = Math.min(100, r2(norm(socialHits)));

  // ── Session frequency ─────────────────────────────────────────────────────
  const uniqueDays = new Set(logs.map(l => l.timestamp.slice(0, 10))).size;
  vector.sessionFrequency = uniqueDays <= 3 ? 'low' : uniqueDays <= 12 ? 'medium' : 'high';

  vector.totalSignalWeight = r2(totalWeight);
  vector.lastUpdatedAt     = new Date().toISOString();
  return vector;
}

// ─── CANDIDATE POOLS ──────────────────────────────────────────────────────────

/**
 * Static seed pools of candidate IDs per recommendation type.
 * In a production system these would come from real DB entity tables.
 * Here we seed deterministic IDs that map to simulated entities.
 */
const CANDIDATE_POOLS: Record<RecommendationType, string[]> = {
  strategy: Array.from({ length: 40 }, (_, i) => `strat_seed_${String(i + 1).padStart(3,'0')}`),
  bot:      Array.from({ length: 20 }, (_, i) => `bot_seed_${String(i + 1).padStart(3,'0')}`),
  lesson:   Array.from({ length: 30 }, (_, i) => `lesson_seed_${String(i + 1).padStart(3,'0')}`),
  competition: Array.from({ length: 16 }, (_, i) => `comp_seed_${String(i + 1).padStart(3,'0')}`),
  trader:   Array.from({ length: 50 }, (_, i) => `trader_seed_${String(i + 1).padStart(3,'0')}`),
};

/** Popularity scores per candidate (seeded, deterministic). */
function popularityScore(targetId: string): number {
  return (strHash(targetId) % 1000) / 10;  // 0–99.9
}

/** Recency score (simulated "days since last update"). */
function recencyScore(targetId: string): number {
  const daysSinceUpdate = (strHash(targetId + 'recency') % 30);
  return Math.max(0, 1 - daysSinceUpdate / 30);
}

// ─── SIGNAL COMPUTATION ───────────────────────────────────────────────────────

/**
 * Compute all ScoringSignals for a (user, candidate) pair.
 */
function computeSignals(params: {
  targetId:   string;
  type:       RecommendationType;
  vector:     UserInterestVector;
  config:     RecommenderEngineConfig;
  allCandidates: { id: string; type: RecommendationType }[];
  existingRecs:  AIRecommendation[];
  hourOfDay:  number;
}): ScoringSignal[] {
  const { targetId, type, vector, config, existingRecs, hourOfDay } = params;
  const rng = seededRng(strHash(vector.userId + targetId));
  const signals: ScoringSignal[] = [];

  const addSignal = (
    source: SignalSource,
    rawScore: number,
    reason: string,
  ) => {
    const weight       = config.signalWeights[source] ?? 0;
    const contribution = r2(weight * rawScore);
    signals.push({ source, weight, rawScore: r2(rawScore), contribution, reason });
  };

  // ── Interest Vector Signal ────────────────────────────────────────────────
  {
    let ivScore = 0.4;  // default mid
    const topCategory = Object.entries(vector.categoryWeights)
      .sort((a,b) => b[1] - a[1])[0];
    if (topCategory) {
      // Seed mapping: category → strategy pool indices
      const catHash = strHash(topCategory[0] + targetId) % 100;
      ivScore = clamp01((catHash + topCategory[1] * 0.3) / 130);
    }
    // Boost for preferred types
    if (type === 'bot'         && vector.prefersAutomation)  ivScore = clamp01(ivScore + 0.2);
    if (type === 'lesson'      && vector.prefersLearning)    ivScore = clamp01(ivScore + 0.2);
    if (type === 'competition' && vector.prefersCompeting)   ivScore = clamp01(ivScore + 0.25);
    if (type === 'trader'      && vector.socialScore > 50)   ivScore = clamp01(ivScore + 0.15);
    addSignal('interest_vector', ivScore, topCategory ? `Matches your interest in ${topCategory[0]}` : 'Matches your browsing profile');
  }

  // ── Collaborative Filtering ───────────────────────────────────────────────
  {
    const collabBase = (strHash(targetId + 'collab') % 70 + 30) / 100;
    const adjusted = vector.totalSignalWeight > 5
      ? clamp01(collabBase + rng() * 0.1)
      : collabBase * 0.5;  // cold start: reduce collab influence
    addSignal('collaborative', adjusted, 'Highly rated by traders with a similar profile');
  }

  // ── Popularity ────────────────────────────────────────────────────────────
  {
    const pop = popularityScore(targetId) / 100;
    addSignal('popularity', pop, `In the top ${Math.round((1 - pop) * 100 + 1)}% by engagement this week`);
  }

  // ── Recency ───────────────────────────────────────────────────────────────
  {
    const rec = recencyScore(targetId);
    addSignal('recency', rec, rec > 0.8 ? 'Recently updated' : 'Established track record');
  }

  // ── Skill Gap (lessons only) ──────────────────────────────────────────────
  if (type === 'lesson') {
    const gap = vector.prefersLearning
      ? clamp01(0.5 + rng() * 0.4)
      : clamp01(0.2 + rng() * 0.3);
    const topAsset = Object.keys(vector.assetWeights)[0] ?? 'crypto';
    addSignal('skill_gap', gap, `Covers ${topAsset} analysis — a pattern in your recent activity`);
  } else {
    addSignal('skill_gap', 0, '');
  }

  // ── Risk Alignment ────────────────────────────────────────────────────────
  {
    const targetRisk = (strHash(targetId + 'risk') % 100);
    const userRisk   = vector.riskScore;
    const diff       = Math.abs(targetRisk - userRisk) / 100;
    const alignment  = clamp01(1 - diff * 1.5);
    addSignal('risk_alignment', alignment, `Risk profile aligns with your ${vector.riskAppetite} appetite`);
  }

  // ── Diversity Boost ───────────────────────────────────────────────────────
  {
    const alreadyShown = existingRecs.filter(r => r.type === type).length;
    const diversityRaw = clamp01(1 - (alreadyShown / 10));
    addSignal('diversity_boost', diversityRaw, 'Added to diversify your recommendations');
  }

  // ── Completion Chain ──────────────────────────────────────────────────────
  {
    const chain = type === 'lesson' ? clamp01(rng() * 0.6) : 0;
    addSignal('completion_chain', chain, chain > 0.3 ? 'Logical next step in your learning path' : '');
  }

  // ── Time-Aware ────────────────────────────────────────────────────────────
  {
    // Morning (6-10) → lessons; Evening (17-22) → strategies/competitions
    let timeScore = 0.5;
    if (type === 'lesson'      && hourOfDay >= 6  && hourOfDay <= 10)  timeScore = 0.8;
    if (type === 'competition' && hourOfDay >= 17 && hourOfDay <= 22)  timeScore = 0.75;
    if (type === 'strategy'    && hourOfDay >= 9  && hourOfDay <= 17)  timeScore = 0.65;
    addSignal('time_aware', timeScore, '');
  }

  return signals;
}

// ─── COMPOSITE SCORE ──────────────────────────────────────────────────────────

function computeCompositeScore(signals: ScoringSignal[]): number {
  const total = signals.reduce((s, sig) => s + sig.contribution, 0);
  return Math.min(100, Math.round(total * 100));
}

// ─── REASON GENERATION ────────────────────────────────────────────────────────

const REASON_TEMPLATES: Record<RecommendationType, string[]> = {
  strategy: [
    'Aligns with your {category} trading style and {risk} risk appetite',
    'Top-rated strategy among traders who browse similar assets ({assets})',
    'High Sharpe ratio — suits your preference for consistent returns',
    'Frequently backtested by traders at your level',
    'Rising in the marketplace — 3× more purchases this week',
  ],
  bot: [
    'Automated strategy that complements your manual trading patterns',
    'Frequently activated by traders who follow a {category} approach',
    'Low-maintenance bot matching your {sessionFrequency} session schedule',
    'High win-rate in current {assets} market conditions',
    'Pairs well with your copy trading activity',
  ],
  lesson: [
    'Closes a knowledge gap detected from your recent trading activity',
    'Next step in your {category} learning path',
    'Highly rated by traders who completed your previous modules',
    'Covers {assets} analysis — your most traded asset class',
    'Short format lesson — perfect for your learning pace',
  ],
  competition: [
    'Matches your skill level and {risk} risk profile',
    'Free entry event — no CP coins required',
    'Your favourite assets ({assets}) are in the allowed list',
    'Prize pool: high upside potential for your experience level',
    'Starting in 48 hours — join before registration closes',
  ],
  trader: [
    'Similar trading style — also focuses on {category} strategies',
    '{winRate}% win rate over the last 30 days in {assets}',
    'High social score — shares insights and market analysis daily',
    'Top 5% performer this month — worth following',
    'Copy-trade compatible with your account balance',
  ],
};

function generateReason(
  type:   RecommendationType,
  vector: UserInterestVector,
  signals: ScoringSignal[],
): string {
  const templates = REASON_TEMPLATES[type];
  const rng       = seededRng(strHash(vector.userId + type + Date.now().toString().slice(0,-4)));
  const tmpl      = templates[Math.floor(rng() * templates.length)];
  const topAsset  = Object.keys(vector.assetWeights)[0]    ?? 'crypto';
  const topCat    = Object.keys(vector.categoryWeights)[0] ?? 'trading';
  const winRate   = Math.floor(55 + rng() * 30);

  return tmpl
    .replace('{category}',      topCat)
    .replace('{risk}',          vector.riskAppetite)
    .replace('{assets}',        topAsset)
    .replace('{sessionFrequency}', vector.sessionFrequency)
    .replace('{winRate}',       String(winRate));
}

// ─── HEADLINE GENERATION ──────────────────────────────────────────────────────

const HEADLINES: Record<RecommendationType, string[]> = {
  strategy:    ['Trending strategy for {cat} traders', 'Top performer this week', 'Matches your {risk} risk profile'],
  bot:         ['Hands-free {cat} automation', 'Runs 24/7 — you set the rules', 'Smart bot with {risk} risk settings'],
  lesson:      ['Skill up: {cat} deep dive', 'Close the gap — 15 min lesson', 'Most bookmarked this week'],
  competition: ['Compete & earn CP coins', 'Live event — {cat} challenge', 'Win up to 50,000 CP coins'],
  trader:      ['Follow a top {cat} trader', 'High win rate performer', 'Copy their moves automatically'],
};

function generateHeadline(type: RecommendationType, vector: UserInterestVector): string {
  const rng  = seededRng(strHash(vector.userId + type + 'headline'));
  const pool = HEADLINES[type];
  const tmpl = pool[Math.floor(rng() * pool.length)];
  const topCat = Object.keys(vector.categoryWeights)[0] ?? 'crypto';
  return tmpl
    .replace('{cat}',  topCat)
    .replace('{risk}', vector.riskAppetite);
}

const TYPE_THUMBNAIL: Record<RecommendationType, string[]> = {
  strategy:    ['📈','⚡','🔥','📊','💎'],
  bot:         ['🤖','⚙️','🔄','🧠','🚀'],
  lesson:      ['📚','🎓','💡','🧩','📖'],
  competition: ['🏆','⚔️','🎯','🥊','🏅'],
  trader:      ['👤','🦅','🌊','🎲','⭐'],
};

function pickThumbnail(type: RecommendationType, targetId: string): string {
  const pool = TYPE_THUMBNAIL[type];
  return pool[strHash(targetId) % pool.length];
}

// ─── buildRecommendation ──────────────────────────────────────────────────────

export function buildRecommendation(params: {
  userId:       string;
  type:         RecommendationType;
  targetId:     string;
  vector:       UserInterestVector;
  config:       RecommenderEngineConfig;
  existingRecs: AIRecommendation[];
  hourOfDay:    number;
}): AIRecommendation {
  const { userId, type, targetId, vector, config, existingRecs, hourOfDay } = params;
  const allCandidates: { id: string; type: RecommendationType }[] = [];  // unused in signal but required for type

  const signals = computeSignals({ targetId, type, vector, config, allCandidates, existingRecs, hourOfDay });
  const score   = computeCompositeScore(signals);
  const reason  = generateReason(type, vector, signals);
  const headline = generateHeadline(type, vector);
  const thumbnail = pickThumbnail(type, targetId);
  const now     = new Date().toISOString();
  const expires = new Date(Date.now() + config.ttlDays * 86_400_000).toISOString();

  // Tags from top interests
  const tags = [
    ...Object.keys(vector.assetWeights).slice(0, 2),
    ...Object.keys(vector.categoryWeights).slice(0, 2),
    vector.riskAppetite,
  ].filter(Boolean);

  return {
    id:          generateId(),
    userId,
    type,
    targetId,
    score,
    signals,
    reason,
    headline,
    thumbnail,
    tags,
    isViewed:    false,
    isClicked:   false,
    isDismissed: false,
    createdAt:   now,
    expiresAt:   expires,
    refreshedAt: now,
  };
}

// ─── generateCandidates ───────────────────────────────────────────────────────

/**
 * Pick the best candidate IDs for a given type by running a quick pre-filter.
 * Returns the top `n` candidates (by popularity × interest alignment).
 */
export function generateCandidates(
  type:    RecommendationType,
  vector:  UserInterestVector,
  exclude: Set<string>,
  n:       number = 10,
): string[] {
  const pool = CANDIDATE_POOLS[type];
  const rng  = seededRng(strHash(vector.userId + type + Date.now().toString().slice(0, -5)));

  const scored = pool
    .filter(id => !exclude.has(id))
    .map(id => {
      const pop    = popularityScore(id) / 100;
      const noise  = rng() * 0.1;
      const jitter = (strHash(vector.userId + id) % 30) / 100;
      return { id, prescore: r2(pop * 0.6 + jitter * 0.3 + noise * 0.1) };
    })
    .sort((a, b) => b.prescore - a.prescore)
    .slice(0, n);

  return scored.map(s => s.id);
}

// ─── DIVERSITY FILTER ─────────────────────────────────────────────────────────

/**
 * Apply diversity filter: remove consecutive duplicate types from the final set.
 * Keeps the list varied so users don't see 5 strategies in a row.
 */
export function applyDiversityFilter(
  recs: AIRecommendation[],
  maxPerType: number = 6,
): AIRecommendation[] {
  const typeCounts: Partial<Record<RecommendationType, number>> = {};
  const result: AIRecommendation[] = [];
  for (const rec of recs) {
    const count = typeCounts[rec.type] ?? 0;
    if (count >= maxPerType) continue;
    typeCounts[rec.type] = count + 1;
    result.push(rec);
  }
  return result;
}

// ─── PRUNE EXPIRED ────────────────────────────────────────────────────────────

/** Remove recommendations that are past their expiresAt or have been dismissed. */
export function pruneExpired(recs: AIRecommendation[]): { kept: AIRecommendation[]; pruned: number } {
  const now   = new Date().toISOString();
  const kept  = recs.filter(r => r.expiresAt > now && !r.isDismissed);
  return { kept, pruned: recs.length - kept.length };
}

// ─── SEED BEHAVIOR EVENTS ─────────────────────────────────────────────────────

/**
 * Generate realistic seed behavioral events to bootstrap a cold-start user.
 * Spread over the last 30 days with variety across event types and assets.
 */
export function generateSeedBehaviorEvents(
  userId:    string,
  sessionId: string,
  count:     number = 25,
): UserBehaviorLog[] {
  const rng     = seededRng(strHash(userId + 'seed'));
  const now     = Date.now();
  const ONE_DAY = 86_400_000;
  const ASSETS  = ['BTC','ETH','SOL','BNB','XRP','AVAX'];
  const CATS    = ['grid','dca','momentum','arbitrage','scalping'];
  const PATHS   = ['/strategies','/academy','/bots','/events','/portfolio'];
  const EVENTS: BehaviorEventType[] = [
    'page_view','page_view','page_view',
    'strategy_view','strategy_view',
    'lesson_start','lesson_complete',
    'bot_activate',
    'trade','trade',
    'competition_view',
    'trader_view',
    'backtest_run',
  ];

  return Array.from({ length: count }, (_, i) => {
    const evType = EVENTS[Math.floor(rng() * EVENTS.length)];
    const ageMs  = Math.floor(rng() * 30 * ONE_DAY);
    const ts     = new Date(now - ageMs).toISOString();
    const asset  = ASSETS[Math.floor(rng() * ASSETS.length)];
    const cat    = CATS[Math.floor(rng() * CATS.length)];

    let eventData: Record<string, unknown> = {};
    switch (evType) {
      case 'page_view':       eventData = { path: PATHS[Math.floor(rng() * PATHS.length)], referrer: '' };   break;
      case 'strategy_view':   eventData = { strategyId: `strat_seed_${Math.floor(rng()*40)+1}`, category: cat, riskLevel: ['low','medium','high'][Math.floor(rng()*3)] }; break;
      case 'lesson_start':    eventData = { lessonId: `lesson_seed_${Math.floor(rng()*30)+1}`, moduleId: `mod_${Math.floor(rng()*10)+1}`, category: cat }; break;
      case 'lesson_complete': eventData = { lessonId: `lesson_seed_${Math.floor(rng()*30)+1}`, moduleId: `mod_${Math.floor(rng()*10)+1}`, category: cat, score: 60 + Math.floor(rng() * 40) }; break;
      case 'trade':           eventData = { symbol: `${asset}USDT`, side: rng() < 0.55 ? 'buy' : 'sell', amount: r2(0.01 + rng() * 0.5), strategyTag: cat }; break;
      case 'bot_activate':    eventData = { botId: `bot_seed_${Math.floor(rng()*20)+1}`, category: cat, frequency: ['high','medium','low'][Math.floor(rng()*3)] }; break;
      case 'competition_view':eventData = { eventId: `comp_seed_${Math.floor(rng()*16)+1}`, eventType: 'weekend_challenge' }; break;
      case 'trader_view':     eventData = { traderId: `trader_seed_${Math.floor(rng()*50)+1}`, winRate: 55 + Math.floor(rng()*30) }; break;
      case 'backtest_run':    eventData = { strategyId: `strat_seed_${Math.floor(rng()*40)+1}`, category: cat }; break;
      default:                eventData = {};
    }

    return {
      id:        generateId(),
      userId,
      eventType: evType,
      eventData,
      sessionId,
      timestamp: ts,
    };
  }).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

// ─── Re-export helper ─────────────────────────────────────────────────────────
export { extractInterestVector as buildInterestVector };
