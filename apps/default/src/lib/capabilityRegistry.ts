/**
 * capabilityRegistry.ts — Maps Brain Fusion capabilities to REAL production sources.
 *
 * Each provider returns an EvidenceItem built from a real engine's existing
 * public interface. No business logic is duplicated and no data is invented.
 * If a real authoritative source does not exist, the provider returns an
 * explicit UNAVAILABLE result — never a fabricated value. Sources that are
 * themselves simulated (e.g. businessAnalyst) are surfaced as SYNTHETIC and
 * can never satisfy an authoritative requirement.
 */

import { identityEngine } from './identityEngine';
import { permissionEngine } from './permissionEngine';
import { memoryAccessGateway } from './memoryAccessGateway';
import { emotionalEngine } from './emotionalEngine';
import { learningEngine } from './learningEngine';
import { mentorEngine } from './mentorEngine';
import { personalityEngine } from './personalityEngine';
import { predictionEngine } from './predictionEngine';
import { businessAnalyst } from './businessAnalyst';
import { liveKnowledge } from './liveKnowledge';
import { getRiskManager } from './riskManager';
import { makeAuthoritative, makeSynthetic, makeUnavailable, type EvidenceItem } from './evidenceContract';

export type CapabilityId =
  | 'context.identity'
  | 'memory.retrieval'
  | 'prediction.market_analysis'
  | 'risk.assessment'
  | 'academy.learning'
  | 'business.overview'
  | 'permissions.authorization'
  | 'knowledge.live'
  | 'mentor.coaching'
  | 'personality.style'
  | 'emotion.sentiment'
  | 'intent.understanding';

export interface CapabilityContext {
  userId: string;
  query: string;
  botId?: string;
  subjectIdentity?: string | null;
}

export const CAPABILITY_PROVIDERS: Record<CapabilityId, (ctx: CapabilityContext) => EvidenceItem> = {
  'context.identity': (ctx) => {
    const id = identityEngine.getIdentity(ctx.userId);
    if (!id) return makeUnavailable('context.identity', 'identityEngine', 'No authenticated identity available', ctx.subjectIdentity ?? null);
    return makeAuthoritative('context.identity', 'identityEngine', { level: id.level, role: id.role, status: id.status }, 95, ctx.subjectIdentity ?? null);
  },

  'memory.retrieval': (ctx) => {
    try {
      const results = memoryAccessGateway.search(ctx.userId, ctx.userId, ctx.query);
      if (!results || results.length === 0) {
        return makeUnavailable('memory.retrieval', 'memoryAccessGateway', 'No private memory found for query', ctx.subjectIdentity ?? null);
      }
      return makeAuthoritative('memory.retrieval', 'memoryAccessGateway', results.slice(0, 5), 80, ctx.subjectIdentity ?? null);
    } catch {
      return makeUnavailable('memory.retrieval', 'memoryAccessGateway', 'Memory retrieval denied or unavailable', ctx.subjectIdentity ?? null);
    }
  },

  'prediction.market_analysis': (ctx) => {
    try {
      const report = predictionEngine.predictAll(ctx.userId);
      return makeAuthoritative('prediction.market_analysis', 'predictionEngine', report, 75, ctx.subjectIdentity ?? null);
    } catch {
      return makeUnavailable('prediction.market_analysis', 'predictionEngine', 'Prediction engine unavailable', ctx.subjectIdentity ?? null);
    }
  },

  'risk.assessment': (ctx) => {
    if (!ctx.botId) {
      return makeUnavailable('risk.assessment', 'riskManager', 'No authoritative user-risk source; bot risk requires a bot context', ctx.subjectIdentity ?? null);
    }
    try {
      const rec = getRiskManager(ctx.botId).getRiskRecord(ctx.botId);
      return makeAuthoritative('risk.assessment', 'riskManager', rec, 85, ctx.subjectIdentity ?? null);
    } catch {
      return makeUnavailable('risk.assessment', 'riskManager', 'Risk record unavailable', ctx.subjectIdentity ?? null);
    }
  },

  'academy.learning': (ctx) => {
    try {
      const profile = learningEngine.getProfile(ctx.userId);
      const insights = learningEngine.getInsights(ctx.userId);
      return makeAuthoritative('academy.learning', 'learningEngine', { profile, insights }, 75, ctx.subjectIdentity ?? null);
    } catch {
      return makeUnavailable('academy.learning', 'learningEngine', 'Learning profile unavailable', ctx.subjectIdentity ?? null);
    }
  },

  // businessAnalyst.getReport() returns HARDCODED/SIMULATED figures — explicitly synthetic.
  'business.overview': (ctx) => {
    try {
      const report = businessAnalyst.getReport();
      return makeSynthetic('business.overview', 'businessAnalyst', report, ctx.subjectIdentity ?? null, 'businessAnalyst report is simulated, not authoritative');
    } catch {
      return makeUnavailable('business.overview', 'businessAnalyst', 'Business report unavailable', ctx.subjectIdentity ?? null);
    }
  },

  'permissions.authorization': (ctx) => {
    const id = identityEngine.getIdentity(ctx.userId);
    if (!id) return makeUnavailable('permissions.authorization', 'identityEngine', 'No authenticated identity', ctx.subjectIdentity ?? null);
    let canAdmin = false;
    try { canAdmin = permissionEngine.canAccess(ctx.userId, 'admin', 'view'); } catch { canAdmin = false; }
    return makeAuthoritative('permissions.authorization', 'identityEngine', { level: id.level, capabilities: id.capabilities, canAccessAdmin: canAdmin }, 95, ctx.subjectIdentity ?? null);
  },

  'knowledge.live': (ctx) => {
    try {
      const data = liveKnowledge.getKnowledge('trading') || liveKnowledge.getKnowledge('users');
      if (!data) return makeUnavailable('knowledge.live', 'liveKnowledge', 'No live knowledge available', ctx.subjectIdentity ?? null);
      return makeAuthoritative('knowledge.live', 'liveKnowledge', data, 70, ctx.subjectIdentity ?? null);
    } catch {
      return makeUnavailable('knowledge.live', 'liveKnowledge', 'Live knowledge unavailable', ctx.subjectIdentity ?? null);
    }
  },

  'mentor.coaching': (ctx) => {
    try {
      const suggestions = mentorEngine.mentorSuggestions(ctx.userId);
      return makeAuthoritative('mentor.coaching', 'mentorEngine', suggestions, 70, ctx.subjectIdentity ?? null);
    } catch {
      return makeUnavailable('mentor.coaching', 'mentorEngine', 'Mentor suggestions unavailable', ctx.subjectIdentity ?? null);
    }
  },

  'personality.style': (ctx) => {
    try {
      const profile = personalityEngine.getPersonality(ctx.userId);
      return makeAuthoritative('personality.style', 'personalityEngine', { mode: profile.mode, confidence: profile.confidence }, 70, ctx.subjectIdentity ?? null);
    } catch {
      return makeUnavailable('personality.style', 'personalityEngine', 'Personality profile unavailable', ctx.subjectIdentity ?? null);
    }
  },

  'emotion.sentiment': (ctx) => {
    try {
      const summary = emotionalEngine.emotionSummary(ctx.userId);
      return makeAuthoritative('emotion.sentiment', 'emotionalEngine', summary, 70, ctx.subjectIdentity ?? null);
    } catch {
      return makeUnavailable('emotion.sentiment', 'emotionalEngine', 'Emotion summary unavailable', ctx.subjectIdentity ?? null);
    }
  },

  // No authoritative intent-understanding production source exists; provide an
  // explicit, clearly-typed SYNTHETIC heuristic (never authoritative).
  'intent.understanding': (ctx) => {
    const q = ctx.query.toLowerCase();
    const intent = /buy|sell|trade|position/.test(q)
      ? 'trading'
      : /learn|lesson|academy|quiz/.test(q)
        ? 'academy'
        : /risk|leverage/.test(q)
          ? 'risk'
          : 'general';
    return makeSynthetic('intent.understanding', 'brainFusion.intent', { intent }, ctx.subjectIdentity ?? null, 'Intent classification is heuristic, not authoritative');
  },
};

export function provideCapability(id: CapabilityId, ctx: CapabilityContext): EvidenceItem {
  const provider = CAPABILITY_PROVIDERS[id];
  if (!provider) return makeUnavailable(id, 'capabilityRegistry', 'Unknown capability', ctx.subjectIdentity ?? null);
  try {
    return provider(ctx);
  } catch (e: any) {
    return makeUnavailable(id, 'capabilityRegistry', e?.message || 'Provider error', ctx.subjectIdentity ?? null);
  }
}
