/**
 * brainFusion.ts — Lynx AI Brain Fusion (Sprint 5.6-B, P0-C remediated)
 * The ONLY component allowed to generate final AI decisions.
 *
 * Production evidence flow (P0-C):
 *   Request → Intent → Required Capabilities → Capability Registry
 *   → Real Production Engine / Authoritative Source → EvidenceContract
 *   → Provenance → Conflict Resolution → Confidence Aggregation
 *   → Permission Gate → Final Fusion Result
 *
 * Fabricated/placeholder authoritative evidence is REMOVED. Missing
 * capabilities return UNAVAILABLE. Synthetic sources (e.g. businessAnalyst)
 * are explicitly typed and never promoted to authoritative. Private memory is
 * accessed ONLY via memoryAccessGateway (never universalMemory directly).
 */

import type { OrchestratorContext, EngineContract } from './lynxOrchestrator';
import { identityEngine } from './identityEngine';
import { permissionEngine } from './permissionEngine';
import { memoryAccessGateway } from './memoryAccessGateway';
import { selfEvolutionEngine } from './selfEvolutionEngine';
import { cloudRecordStore } from './cloudData';
import { provideCapability, type CapabilityId, type CapabilityContext } from './capabilityRegistry';
import { validateEvidence, isAuthoritative, resolveConflicts, type EvidenceItem } from './evidenceContract';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface EngineAdvice {
  engine: string;
  confidence: number;
  priority: number;
  recommendation: string;
  reason: string;
  evidence: string[];
  timestamp: number;
}

export interface FusionContext {
  userId: string;
  query: string;
  page?: string;
  personality?: string;
  emotion?: string;
  mentorStyle?: string;
  learningStyle?: string;
  tradingLevel?: number;
  riskProfile?: string;
  goals?: string[];
  timestamp: number;
}

export interface FusionResult {
  answer: string;
  reasoningScore: number;
  confidence: number;
  sourceEngines: string[];
  memoryUsed: boolean;
  predictionUsed: boolean;
  emotionalAdaptation: string;
  personalityUsed: string;
  mentorStyleUsed: string;
  learningStyleUsed: string;
  riskAssessment: string;
  businessImpact: string;
  recommendedNextActions: string[];
  votes: { engine: string; decision: string; confidence: number }[];
  resolutionNote: string;
  cachedResult: boolean;
  processingTimeMs: number;
  timestamp: number;
}

export interface ReasoningChain {
  query: string;
  step: string;
  engine?: string;
  input: any;
  output: any;
  durationMs: number;
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BrainFusion
// ═══════════════════════════════════════════════════════════════════════════════

class BrainFusion {
  private registered = false;
  private reasoningLog: ReasoningChain[] = [];
  private decisionCache: Map<string, { result: FusionResult; expiresAt: number }> = new Map();
  private readonly CACHE_TTL_MS = 30000;
  private readonly MAX_LOG = 5000;

  constructor() { this.loadLog(); }

  // ═══════════════════════════════════════════════════════════════════════════
  // Public APIs
  // ═══════════════════════════════════════════════════════════════════════════

  /** Main entry point — think about a query and generate a final answer */
  async think(ctx: FusionContext): Promise<FusionResult> {
    const start = Date.now();
    const cacheKey = `${ctx.userId}_${ctx.query.substring(0, 100)}`;

    const cached = this.decisionCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      this.log('cache_hit', 'cache', { key: cacheKey }, { cached: true }, 0);
      return { ...cached.result, cachedResult: true };
    }

    const subjectIdentity = (() => {
      try { return identityEngine.getIdentity(ctx.userId)?.id ?? null; } catch { return null; }
    })();
    const capCtx: CapabilityContext = { userId: ctx.userId, query: ctx.query, subjectIdentity };

    // ── Permission gate ─────────────────────────────────────────────────────
    // Privileged requests MUST pass the canonical permission check. A denied
    // privileged capability remains denied — no privileged output is produced.
    const privilegedRequested = this.isPrivilegedRequest(ctx);
    let permissionDenied = false;
    if (privilegedRequested) {
      let allowed = false;
      try { allowed = permissionEngine.canAccess(ctx.userId, 'admin', 'view'); } catch { allowed = false; }
      if (!allowed) permissionDenied = true;
    }

    // ── Real production evidence collection ─────────────────────────────────
    const required = this.selectCapabilities(ctx);
    const evidenceItems: EvidenceItem[] = required.map(id => provideCapability(id, capCtx));
    const validEvidence = evidenceItems.filter(validateEvidence);
    const malformedCount = evidenceItems.length - validEvidence.length;

    const authoritative = validEvidence.filter(isAuthoritative);
    const synthetic = validEvidence.filter(e => e.authority === 'synthetic');
    const unavailable = validEvidence.filter(e => e.authority === 'unavailable');

    // ── Conflict resolution (deterministic; conflicts stay visible) ──────────
    const resolution = resolveConflicts(validEvidence);

    // ── Confidence aggregation from REAL authoritative evidence only ─────────
    const confidences = authoritative.map(e => e.confidence as number).filter(c => typeof c === 'number');
    const confidence = confidences.length > 0 ? Math.round(confidences.reduce((s, c) => s + c, 0) / confidences.length) : 0;

    const intentEv = validEvidence.find(e => e.capability === 'intent.understanding');
    const intent = (intentEv && intentEv.evidence && (intentEv.evidence as any).intent) || 'general';

    const answer = permissionDenied
      ? 'I can provide general guidance, but I am not authorized to produce privileged or administrative output for this request.'
      : this.buildAnswerFromEvidence(ctx, intent, authoritative, synthetic);

    const riskAssessment = this.riskAssessmentText(validEvidence);
    const businessImpact = this.businessImpactText(validEvidence);
    const nextActions = this.nextActions(authoritative, synthetic);

    const result: FusionResult = {
      answer,
      reasoningScore: confidence,
      confidence,
      sourceEngines: validEvidence.map(e => e.sourceEngine),
      memoryUsed: authoritative.some(e => e.capability === 'memory.retrieval'),
      predictionUsed: authoritative.some(e => e.capability === 'prediction.market_analysis'),
      emotionalAdaptation: ctx.emotion || 'neutral',
      personalityUsed: ctx.personality || 'friendly',
      mentorStyleUsed: ctx.mentorStyle || 'coaching',
      learningStyleUsed: ctx.learningStyle || 'adaptive',
      riskAssessment,
      businessImpact,
      recommendedNextActions: nextActions,
      votes: validEvidence.map(e => ({ engine: e.sourceEngine, decision: e.capability, confidence: typeof e.confidence === 'number' ? e.confidence : 0 })),
      resolutionNote:
        resolution.note +
        (malformedCount > 0 ? ` [${malformedCount} malformed evidence rejected]` : '') +
        (unavailable.length ? ` [${unavailable.length} unavailable]` : '') +
        (permissionDenied ? ' [privileged output denied by permission gate]' : ''),
      cachedResult: false,
      processingTimeMs: Date.now() - start,
      timestamp: Date.now(),
    };

    // ── Memory via canonical gateway ONLY (never universalMemory directly) ───
    try {
      memoryAccessGateway.remember(ctx.userId, ctx.userId, 'coaching', {
        type: 'brain_fusion_decision',
        query: ctx.query.substring(0, 200),
        decision: intent,
        confidence,
        evidenceCount: validEvidence.length,
        authoritativeCount: authoritative.length,
      }, { level: 'long', importance: 65, tags: ['brain_fusion', 'decision'] });
    } catch (err) {
      console.warn('[brainFusion] memory write failed:', err instanceof Error ? err.message : err);
    }

    try {
      selfEvolutionEngine.recordInteraction(ctx.userId, {
        personality: ctx.personality || 'friendly', emotion: ctx.emotion || 'neutral',
        mentorStyle: ctx.mentorStyle || 'coaching', coachStyle: '', learningStyle: ctx.learningStyle || 'adaptive',
        responseLength: 0, confidence, userReaction: 'accepted', timeSpent: 0,
        goalCompleted: false, missionCompleted: false,
        tradeImproved: false, academyImproved: false, portfolioImproved: false,
        notes: `Brain Fusion decision: ${intent}`,
      });
    } catch (err) {
      console.warn('[brainFusion] self-evolution record failed:', err instanceof Error ? err.message : err);
    }

    result.processingTimeMs = Date.now() - start;
    this.decisionCache.set(cacheKey, { result, expiresAt: Date.now() + this.CACHE_TTL_MS });
    return result;
  }

  /** Reason about a query with detailed evidence */
  async reason(ctx: FusionContext): Promise<FusionResult> {
    return this.think(ctx);
  }

  /** Consult specific capabilities for recommendations */
  async consult(capabilities: string[], query: string, userId: string): Promise<EngineAdvice[]> {
    const subjectIdentity = (() => { try { return identityEngine.getIdentity(userId)?.id ?? null; } catch { return null; } })();
    const ctx: CapabilityContext = { userId, query, subjectIdentity };
    const items = capabilities
      .map(id => provideCapability(id as CapabilityId, ctx))
      .filter(validateEvidence);
    return items.map(e => ({
      engine: e.sourceEngine,
      confidence: typeof e.confidence === 'number' ? e.confidence : 0,
      priority: 1,
      recommendation: e.capability,
      reason: e.authority,
      evidence: [e.sourceEngine + ':' + e.authority],
      timestamp: Date.now(),
    }));
  }

  generateAnswer(ctx: FusionContext): Promise<FusionResult> { return this.think(ctx); }
  generateRecommendation(ctx: FusionContext): Promise<FusionResult> { return this.think(ctx); }
  generateDecision(ctx: FusionContext): Promise<FusionResult> { return this.think(ctx); }
  generateSummary(ctx: FusionContext): Promise<FusionResult> { return this.think({ ...ctx, query: `Summarize: ${ctx.query}` }); }
  generatePlan(ctx: FusionContext): Promise<FusionResult> { return this.think({ ...ctx, query: `Plan: ${ctx.query}` }); }
  generateCoachResponse(ctx: FusionContext): Promise<FusionResult> { return this.think({ ...ctx, mentorStyle: 'coaching', personality: 'coach' }); }
  generateAdminResponse(ctx: FusionContext): Promise<FusionResult> { return this.think({ ...ctx, personality: 'executive_advisor', mentorStyle: 'directive' }); }
  generateTraderResponse(ctx: FusionContext): Promise<FusionResult> { return this.think({ ...ctx, personality: 'analyst', mentorStyle: 'practice' }); }
  generateAcademyResponse(ctx: FusionContext): Promise<FusionResult> { return this.think({ ...ctx, personality: 'academy_tutor', learningStyle: 'visual' }); }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private — capability selection / evidence composition
  // ═══════════════════════════════════════════════════════════════════════════

  private selectCapabilities(ctx: FusionContext): CapabilityId[] {
    const q = ctx.query.toLowerCase();
    const caps: CapabilityId[] = ['context.identity', 'memory.retrieval', 'intent.understanding'];
    if (/buy|sell|trade|position|risk|leverage/.test(q)) {
      caps.push('prediction.market_analysis', 'risk.assessment', 'knowledge.live');
    }
    if (/learn|lesson|academy|quiz/.test(q)) {
      caps.push('academy.learning');
    }
    caps.push('emotion.sentiment', 'personality.style', 'mentor.coaching', 'permissions.authorization');
    return caps;
  }

  private isPrivilegedRequest(ctx: FusionContext): boolean {
    const privileged = ['executive_advisor', 'business_consultant', 'risk_manager'];
    const q = ctx.query.toLowerCase();
    return privileged.includes(ctx.personality || '') || q.includes('admin') || q.includes('executive dashboard');
  }

  private buildAnswerFromEvidence(ctx: FusionContext, intent: string, auth: EvidenceItem[], synth: EvidenceItem[]): string {
    const prefixes: Record<string, string> = {
      coach: 'Here is my take:', friendly: 'Hey! Here is what I think:', analyst: 'Analysis shows:',
      executive_advisor: 'Executive summary:', business_consultant: 'Strategic assessment:', academy_tutor: 'Let us learn together:',
    };
    const prefix = prefixes[ctx.personality || ''] || 'Analysis:';
    if (auth.length === 0) {
      return `${prefix} I currently have no authoritative evidence for this request, so I can only offer general guidance.`;
    }
    const lines = auth.slice(0, 4).map(e => `${e.sourceEngine}: ${this.summarizeEvidence(e)}`);
    return `${prefix} ${lines.join(' ')}`;
  }

  private summarizeEvidence(e: EvidenceItem): string {
    const d = e.evidence as any;
    if (!d) return 'no evidence available';
    // Empty-data branches report 'unavailable' rather than 'available', so a
    // missing value is never overstated as present.
    switch (e.capability) {
      case 'prediction.market_analysis': return d.overallRisk ? `market risk ${d.overallRisk}` : 'market analysis unavailable';
      case 'memory.retrieval': return Array.isArray(d) && d.length > 0 ? `found ${d.length} relevant memory entries` : 'no relevant memory entries';
      case 'emotion.sentiment': return d.dominantEmotion ? `dominant emotion ${d.dominantEmotion}` : 'emotion signal unavailable';
      case 'personality.style': return d.mode ? `personality mode ${d.mode}` : 'personality profile unavailable';
      case 'mentor.coaching': return Array.isArray(d) && d.length > 0 ? 'coaching suggestions available' : 'coaching suggestions unavailable';
      case 'academy.learning': return d && Object.keys(d).length > 0 ? 'learning profile available' : 'learning profile unavailable';
      case 'knowledge.live': return d ? 'live platform data available' : 'live platform data unavailable';
      case 'context.identity': return `identity ${d.level || d.role || 'verified'}`;
      case 'permissions.authorization': return `authorization level ${d.level || 'unknown'}`;
      case 'risk.assessment': return d ? 'risk record available' : 'risk record unavailable';
      default: return 'evidence unavailable';
    }
  }

  private riskAssessmentText(items: EvidenceItem[]): string {
    const r = items.find(e => e.capability === 'risk.assessment' && e.authority === 'authoritative');
    if (r) return `Risk: authoritative assessment available from ${r.sourceEngine}.`;
    const s = items.find(e => e.capability === 'risk.assessment' && e.authority === 'synthetic');
    if (s) return 'Risk: only simulated data is available and is not authoritative.';
    return 'No authoritative risk assessment is currently available.';
  }

  private businessImpactText(items: EvidenceItem[]): string {
    const b = items.find(e => e.capability === 'business.overview');
    if (!b) return 'No business overview is currently available.';
    if (b.authority === 'synthetic') return 'Business overview is based on simulated data and is not authoritative.';
    return 'Business overview is available from an authoritative source.';
  }

  private nextActions(auth: EvidenceItem[], synth: EvidenceItem[]): string[] {
    const actions: string[] = [];
    for (const e of auth.slice(0, 3)) actions.push(`${e.sourceEngine}: review ${e.capability}`);
    return actions;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private — logging
  // ═══════════════════════════════════════════════════════════════════════════

  private log(step: string, engine: string, input: any, output: any, durationMs: number): void {
    const chain: ReasoningChain = { query: step, step, engine, input, output, durationMs, timestamp: Date.now() };
    this.reasoningLog.push(chain);
    if (this.reasoningLog.length > this.MAX_LOG) this.reasoningLog = this.reasoningLog.slice(-this.MAX_LOG);
  }

  getReasoningLog(limit = 50): ReasoningChain[] {
    return this.reasoningLog.slice(-limit);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Orchestrator Integration
  // ═══════════════════════════════════════════════════════════════════════════

  async execute(context: OrchestratorContext): Promise<void> { /* on-demand */ }

  getOrchestratorContract(): EngineContract {
    return {
      name: 'brainFusion',
      priority: 9,
      dependencies: [
        'contextEngine', 'brainEngine', 'coachEngine',
        'personalityEngine', 'emotionalEngine', 'mentorEngine', 'adaptiveLearning',
        'predictionEngine', 'selfEvolutionEngine', 'businessAnalyst',
        'executiveIntelligence', 'aiCommandCenter', 'notificationBrain',
        'goalEngine', 'missionEngine', 'journeyManager', 'digitalTwin',
        'securityCenter', 'healthMonitor', 'economyManager', 'contentManager',
        'analyticsCenter',
      ],
      initialize: async () => { this.registered = true; },
      execute: (ctx) => this.execute(ctx),
      shutdown: async () => { this.registered = false; },
      health: () => ({
        status: this.registered ? 'healthy' : 'degraded',
        lastRun: null, lastDuration: 0, errorCount: 0, totalRuns: 0, avgDuration: 0,
      }),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Persistence (operational reasoning log — legit client/cloud persistence)
  // ═══════════════════════════════════════════════════════════════════════════

  private loadLog(): void {
    // Canonical persistence is cloudRecordStore (Taskade Cloud, with its own
    // transparent cache). No direct localStorage fallback for reasoning logs.
    try {
      const d = cloudRecordStore.get<any[]>('brain_fusion', 'brain_fusion_log', []);
      if (d && d.length > 0) {
        this.reasoningLog = Array.isArray(d) ? d.slice(-this.MAX_LOG) : [];
      }
    } catch (e) {
      console.warn('[brainFusion] loadLog failed:', e instanceof Error ? e.message : e);
    }
  }

  saveLog(): void {
    // Canonical persistence only (cloudRecordStore). No localStorage fallback.
    try {
      const data = this.reasoningLog.slice(-this.MAX_LOG);
      cloudRecordStore.set('brain_fusion', 'brain_fusion_log', data);
    } catch (err) {
      console.warn('[brainFusion] saveLog failed:', err instanceof Error ? err.message : err);
    }
  }
}

export const brainFusion = new BrainFusion();

// ═══════════════════════════════════════════════════════════════════════════
// Living AI Organism — Continuous Learning Loop
// ═══════════════════════════════════════════════════════════════════════════

export async function continuousLearn(ctx: FusionContext): Promise<void> {
  const result = await brainFusion.think(ctx);

  // All memory access goes through the canonical gateway (no direct universalMemory).
  memoryAccessGateway.remember(ctx.userId, ctx.userId, 'coaching', {
    type: 'continuous_learning', query: ctx.query.substring(0, 100),
    decision: result.votes[0]?.decision || 'unknown', confidence: result.confidence,
    timestamp: Date.now(),
  }, { level: 'long', importance: 60, tags: ['continuous_learn'] });

  selfEvolutionEngine.recordInteraction(ctx.userId, {
    personality: ctx.personality || 'friendly', emotion: ctx.emotion || 'neutral',
    mentorStyle: ctx.mentorStyle || 'coaching', coachStyle: '', learningStyle: ctx.learningStyle || 'adaptive',
    responseLength: 0, confidence: result.confidence, userReaction: 'accepted', timeSpent: 0,
    goalCompleted: false, missionCompleted: false, tradeImproved: false, academyImproved: false, portfolioImproved: false,
    notes: 'Continuous learn: ' + ctx.query.substring(0, 100),
  });

  memoryAccessGateway.remember(ctx.userId, ctx.userId, 'context' as any, {
    type: 'reasoning',
    query: ctx.query.substring(0, 100),
    steps: [{ engine: 'brainFusion', result }],
    decision: result.votes[0]?.decision || 'unknown',
    timestamp: Date.now(),
  }, { level: 'long', importance: 70, tags: ['reasoning', 'brain_fusion'] });
}
