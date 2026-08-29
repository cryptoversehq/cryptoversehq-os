/**
 * selfEvolutionEngine.ts — Lynx AI Self Evolution Engine (Sprint 5.6-A)
 * Lynx continuously improves itself from every interaction.
 * Tracks which responses/coaching/personalities worked. Learns patterns. Auto-evolves.
 * All evolution is reversible and explainable. Never changes business logic.
 * Priority 8. Integrates with 10+ Lynx engines.
 */

import type { OrchestratorContext, EngineContract } from './lynxOrchestrator';
import { memoryAccessGateway } from './memoryAccessGateway';
import { learningEngine } from './learningEngine';
import { evolutionChangeControl, type EvolutionChangeProposal } from './evolutionChangeControl';
import { rollbackRegistry } from './rollbackMetadata';
import { identityEngine } from './identityEngine';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface AIInteraction {
  id: string;
  userId: string;
  timestamp: number;
  personality: string;
  emotion: string;
  mentorStyle: string;
  coachStyle: string;
  learningStyle: string;
  responseLength: number;
  confidence: number;
  userReaction: 'accepted' | 'ignored' | 'dismissed' | 'followed' | 'liked' | 'disliked' | 'clicked' | 'copied' | 'shared';
  timeSpent: number;
  goalCompleted: boolean;
  missionCompleted: boolean;
  tradeImproved: boolean;
  academyImproved: boolean;
  portfolioImproved: boolean;
  successScore: number;
  notes: string;
}

export interface EvolutionPattern {
  id: string;
  type: 'successful' | 'failed';
  category: string;
  description: string;
  occurrences: number;
  avgSuccessScore: number;
  confidence: number;
  evidence: { interactionId: string; score: number; timestamp: number }[];
  discoveredAt: number;
  lastSeen: number;
}

export interface EvolutionSnapshot {
  id: string;
  timestamp: number;
  version: number;
  patterns: EvolutionPattern[];
  adjustments: { engine: string; parameter: string; oldValue: any; newValue: any; reason: string; confidence: number }[];
  summary: string;
}

export interface EvolutionReport {
  id: string;
  timestamp: number;
  period: 'daily' | 'weekly' | 'monthly';
  topImprovements: { category: string; improvement: string; score: number }[];
  topFailures: { category: string; failure: string; score: number }[];
  newBehaviors: string[];
  deprecatedBehaviors: string[];
  recommendedAdjustments: { engine: string; parameter: string; currentValue: any; suggestedValue: any; reason: string }[];
  confidenceChanges: { engine: string; oldConfidence: number; newConfidence: number; reason: string }[];
  overallScore: number;
  executiveSummary: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SelfEvolutionEngine
// ═══════════════════════════════════════════════════════════════════════════════

class SelfEvolutionEngine {
  private interactions: AIInteraction[] = [];
  private patterns: EvolutionPattern[] = [];
  private snapshots: EvolutionSnapshot[] = [];
  private registered = false;
  private readonly MAX_INTERACTIONS = 10000;
  private readonly INT_KEY = 'cv_evolution_interactions';
  private readonly PAT_KEY = 'cv_evolution_patterns';
  private readonly SNAP_KEY = 'cv_evolution_snapshots';
  private lastEvolutionAt: number = 0;
  private evolutionEnabled = true;
  private activeProposals: string[] = [];

  constructor() {
    this.loadAll();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Public APIs
  // ═══════════════════════════════════════════════════════════════════════════

  enable(): void { this.evolutionEnabled = true; }
  disable(): void { this.evolutionEnabled = false; }
  isEnabled(): boolean { return this.evolutionEnabled; }

  /** Record an AI interaction for learning */
  recordInteraction(userId: string, data: Omit<AIInteraction, 'id' | 'timestamp' | 'successScore'>): AIInteraction {
    const score = this.calculateSuccess(data);
    const interaction: AIInteraction = {
      id: `ev_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
      userId,
      timestamp: Date.now(),
      ...data,
      successScore: score,
    };

    this.interactions.push(interaction);
    if (this.interactions.length > this.MAX_INTERACTIONS) {
      this.interactions = this.interactions.slice(-this.MAX_INTERACTIONS);
    }
    this.save(this.INT_KEY, this.interactions.slice(-this.MAX_INTERACTIONS));

    // Store in Universal Memory as coaching history
    if (score > 60) {
      memoryAccessGateway.remember(userId, userId, 'coaching', {
        type: 'successful_interaction',
        personality: data.personality,
        userReaction: data.userReaction,
        score,
      }, { level: 'long', importance: 60, tags: ['evolution', 'success', data.personality] });
    }

    return interaction;
  }

  /** Calculate success score from multiple factors (0-100) */
  calculateSuccess(data: Partial<AIInteraction>): number {
    let score = 0;
    const weights = {
      acceptance: 25,
      improvement: 30,
      followUp: 20,
      confidence: 10,
      engagement: 15,
    };

    // Acceptance weight
    if (data.userReaction === 'accepted' || data.userReaction === 'followed') score += weights.acceptance;
    else if (data.userReaction === 'clicked' || data.userReaction === 'copied') score += weights.acceptance * 0.7;
    else if (data.userReaction === 'liked') score += weights.acceptance * 0.5;
    else if (data.userReaction === 'shared') score += weights.acceptance * 0.8;
    else if (data.userReaction === 'dismissed' || data.userReaction === 'disliked') score += 0;
    else if (data.userReaction === 'ignored') score += 5;

    // Improvement weight (real outcomes)
    if (data.goalCompleted) score += weights.improvement * 0.35;
    if (data.missionCompleted) score += weights.improvement * 0.35;
    if (data.tradeImproved) score += weights.improvement * 0.15;
    if (data.academyImproved) score += weights.improvement * 0.1;
    if (data.portfolioImproved) score += weights.improvement * 0.05;

    // Follow-up weight
    if (data.timeSpent && data.timeSpent > 30) score += weights.followUp * 0.8;
    else if (data.timeSpent && data.timeSpent > 10) score += weights.followUp * 0.5;
    else if (data.timeSpent && data.timeSpent > 0) score += weights.followUp * 0.2;

    // Confidence weight
    if (data.confidence !== undefined) {
      score += (data.confidence / 100) * weights.confidence;
    }

    // Engagement weight (longer responses = more engagement potential)
    if (data.responseLength) {
      if (data.responseLength > 200) score += weights.engagement;
      else if (data.responseLength > 100) score += weights.engagement * 0.7;
      else if (data.responseLength > 50) score += weights.engagement * 0.4;
    }

    return Math.min(100, Math.round(score));
  }

  /** Learn patterns from accumulated interactions */
  learnPattern(): EvolutionPattern[] {
    const now = Date.now();
    const recent = this.interactions.filter(i => i.timestamp > now - 30 * 86400000);
    const newPatterns: EvolutionPattern[] = [];

    // Group by personality
    const byPersonality: Record<string, AIInteraction[]> = {};
    for (const i of recent) {
      const key = i.personality || 'unknown';
      if (!byPersonality[key]) byPersonality[key] = [];
      byPersonality[key].push(i);
    }

    for (const [personality, interactions] of Object.entries(byPersonality)) {
      if (interactions.length < 5) continue;
      const avgScore = interactions.reduce((s, i) => s + i.successScore, 0) / interactions.length;
      const isSuccess = avgScore > 50;

      const existing = this.patterns.find(p => p.category === `personality_${personality}` && p.type === (isSuccess ? 'successful' : 'failed'));
      if (existing) {
        existing.occurrences++;
        existing.avgSuccessScore = (existing.avgSuccessScore * (existing.occurrences - 1) + avgScore) / existing.occurrences;
        existing.confidence = Math.min(100, existing.confidence + 2);
        existing.lastSeen = now;
        existing.evidence.push(...interactions.slice(-3).map(i => ({ interactionId: i.id, score: i.successScore, timestamp: i.timestamp })));
        if (existing.evidence.length > 50) existing.evidence = existing.evidence.slice(-50);
      } else {
        newPatterns.push({
          id: `pat_${now}_${personality}`,
          type: isSuccess ? 'successful' : 'failed',
          category: `personality_${personality}`,
          description: `${personality} personality ${isSuccess ? 'works well' : 'needs improvement'} (avg score: ${avgScore.toFixed(0)})`,
          occurrences: 1,
          avgSuccessScore: avgScore,
          confidence: 30,
          evidence: interactions.slice(-5).map(i => ({ interactionId: i.id, score: i.successScore, timestamp: i.timestamp })),
          discoveredAt: now,
          lastSeen: now,
        });
      }
    }

    // Group by mentor style
    const byMentor: Record<string, AIInteraction[]> = {};
    for (const i of recent) {
      const key = i.mentorStyle || 'unknown';
      if (!byMentor[key]) byMentor[key] = [];
      byMentor[key].push(i);
    }

    for (const [style, interactions] of Object.entries(byMentor)) {
      if (interactions.length < 3) continue;
      const avgScore = interactions.reduce((s, i) => s + i.successScore, 0) / interactions.length;
      const isSuccess = avgScore > 50;
      const patType = isSuccess ? 'successful' : 'failed';

      const existing = this.patterns.find(p => p.category === `mentor_${style}` && p.type === patType);
      if (existing) {
        existing.occurrences++;
        existing.avgSuccessScore = (existing.avgSuccessScore * (existing.occurrences - 1) + avgScore) / existing.occurrences;
        existing.confidence = Math.min(100, existing.confidence + 2);
        existing.lastSeen = now;
      } else {
        newPatterns.push({
          id: `pat_${now}_mentor_${style}`,
          type: patType,
          category: `mentor_${style}`,
          description: `Mentor style "${style}" ${isSuccess ? 'produces good results' : 'needs adjustment'} (avg: ${avgScore.toFixed(0)})`,
          occurrences: 1,
          avgSuccessScore: avgScore,
          confidence: 25,
          evidence: interactions.slice(-3).map(i => ({ interactionId: i.id, score: i.successScore, timestamp: i.timestamp })),
          discoveredAt: now,
          lastSeen: now,
        });
      }
    }

    // Group by emotional state
    const byEmotion: Record<string, AIInteraction[]> = {};
    for (const i of recent) {
      const key = i.emotion || 'neutral';
      if (!byEmotion[key]) byEmotion[key] = [];
      byEmotion[key].push(i);
    }

    for (const [emotion, interactions] of Object.entries(byEmotion)) {
      if (interactions.length < 3) continue;
      const avgScore = interactions.reduce((s, i) => s + i.successScore, 0) / interactions.length;
      const isSuccess = avgScore > 50;
      const patType = isSuccess ? 'successful' : 'failed';

      const existing = this.patterns.find(p => p.category === `emotion_${emotion}` && p.type === patType);
      if (existing) {
        existing.occurrences++;
        existing.avgSuccessScore = (existing.avgSuccessScore * (existing.occurrences - 1) + avgScore) / existing.occurrences;
        existing.confidence = Math.min(100, existing.confidence + 1);
        existing.lastSeen = now;
      } else {
        newPatterns.push({
          id: `pat_${now}_emotion_${emotion}`,
          type: patType,
          category: `emotion_${emotion}`,
          description: `Emotional state "${emotion}" ${isSuccess ? 'responds well to coaching' : 'is harder to coach'} (avg: ${avgScore.toFixed(0)})`,
          occurrences: 1,
          avgSuccessScore: avgScore,
          confidence: 20,
          evidence: interactions.slice(-3).map(i => ({ interactionId: i.id, score: i.successScore, timestamp: i.timestamp })),
          discoveredAt: now,
          lastSeen: now,
        });
      }
    }

    this.patterns.push(...newPatterns);
    if (this.patterns.length > 500) this.patterns = this.patterns.slice(-500);
    this.save(this.PAT_KEY, this.patterns);

    return newPatterns;
  }

  /** Generate an evolution: create a snapshot of current learnings */
  generateEvolution(): EvolutionSnapshot {
    const now = Date.now();
    this.learnPattern();

    const successful = this.patterns.filter(p => p.type === 'successful' && p.confidence > 40);
    const failed = this.patterns.filter(p => p.type === 'failed' && p.confidence > 30);

    const adjustments = [];

    // If a personality consistently fails, suggest switching
    for (const fp of failed) {
      if (fp.category.startsWith('personality_')) {
        const altName = fp.category.replace('personality_', '');
        const alternative = successful.find(s => s.category !== fp.category && s.avgSuccessScore > 60);
        if (alternative) {
          adjustments.push({
            engine: 'personalityEngine',
            parameter: 'mode',
            oldValue: altName,
            newValue: alternative.category.replace('personality_', ''),
            reason: `${altName} personality underperforms (${fp.avgSuccessScore.toFixed(0)}). ${alternative.category.replace('personality_', '')} shows ${alternative.avgSuccessScore.toFixed(0)} score.`,
            confidence: Math.min(fp.confidence, alternative.confidence),
          });
        }
      }
    }

    // If a mentor style works well, reinforce it
    for (const sp of successful) {
      if (sp.category.startsWith('mentor_') && sp.confidence > 60) {
        adjustments.push({
          engine: 'mentorEngine',
          parameter: 'preferredStyle',
          oldValue: 'default',
          newValue: sp.category.replace('mentor_', ''),
          reason: `Mentor style "${sp.category.replace('mentor_', '')}" consistently performs well (${sp.avgSuccessScore.toFixed(0)} avg score, ${sp.confidence}% confidence).`,
          confidence: sp.confidence,
        });
      }
    }

    const snapshot: EvolutionSnapshot = {
      id: `snap_${now}`,
      timestamp: now,
      version: this.snapshots.length + 1,
      patterns: [...this.patterns],
      adjustments,
      summary: `Evolution v${this.snapshots.length + 1}: ${successful.length} successful patterns, ${failed.length} failed patterns, ${adjustments.length} adjustments recommended.`,
    };

    this.snapshots.push(snapshot);
    if (this.snapshots.length > 100) this.snapshots = this.snapshots.slice(-100);
    this.save(this.SNAP_KEY, this.snapshots);

    this.lastEvolutionAt = now;

    // Lifecycle: each recommended adjustment becomes an explicit, PENDING change-control
    // proposal. Proposals are NEVER applied here — deployment requires later approval
    // plus rollback metadata (see applyEvolution / approveProposal).
    const proposalIds: string[] = [];
    for (const adj of adjustments) {
      const component = `${adj.engine}.${adj.parameter}`;
      const proposal = evolutionChangeControl.createProposal({
        evidenceRef: snapshot.id,
        affectedComponent: component,
        currentState: adj.oldValue,
        proposedState: adj.newValue,
        riskAssessment: adj.confidence >= 70 ? 'low' : adj.confidence >= 50 ? 'medium' : 'high',
        expectedBenefit: adj.reason,
      });
      // Automatic evaluation only (recommendation generation). Approval is a separate, explicit step.
      evolutionChangeControl.evaluate(proposal.proposalId, adj.confidence > 50 ? 'pass' : 'fail');
      proposalIds.push(proposal.proposalId);
    }
    this.activeProposals = proposalIds;

    // Store in Universal Memory
    memoryAccessGateway.rememberSystem('system', 'daily_summary', {
      type: 'evolution',
      successfulCount: successful.length,
      failedCount: failed.length,
      adjustments: adjustments.length,
      proposals: proposalIds.length,
      version: snapshot.version,
    }, { level: 'long', importance: 75, tags: ['evolution', 'snapshot'] });

    return snapshot;
  }

  /** Deploy approved change-control proposals. No protected production mutation occurs
   *  without explicit approval and attached rollback metadata. */
  applyEvolution(actorId?: string): { applied: number; skipped: number; details: string[] } {
    const approved = evolutionChangeControl.approved();
    let applied = 0;
    let skipped = 0;
    const details: string[] = [];

    for (const proposal of approved) {
      try {
        // Protected components require the trusted governance boundary (admin/founder).
        if (evolutionChangeControl.isProtectedComponent(proposal.affectedComponent)) {
          const actor = actorId ? identityEngine.getIdentity(actorId) : null;
          if (!actor || actor.status !== 'active' || !identityEngine.isAdmin(actorId)) {
            skipped++;
            details.push(`Skipped (protected, requires admin/founder approval): ${proposal.affectedComponent}`);
            continue;
          }
        }
        // Capture PREVIOUS state in rollback metadata BEFORE any deployment.
        const rb = rollbackRegistry.create({
          proposalId: proposal.proposalId,
          affectedComponent: proposal.affectedComponent,
          previousState: proposal.currentState,
          newState: proposal.proposedState,
          rollbackProcedure: `Revert ${proposal.affectedComponent} to its previous state`,
          validationChecks: ['proposal approved', 'previous state captured', 'deployment verifiable'],
          rollbackTrigger: 'monitoring degraded or manual rollback request',
        });
        evolutionChangeControl.markDeployed(proposal.proposalId, rb.rollbackId);
        applied++;
        details.push(`Deployed (with rollback): ${proposal.affectedComponent} → ${JSON.stringify(proposal.proposedState)}`);
      } catch (e: any) {
        skipped++;
        details.push(`Skipped: ${proposal.affectedComponent} (${e?.message || 'deploy failed'})`);
      }
    }

    return { applied, skipped, details };
  }

  /** Explicit approval entry point — must be routed through the canonical identity boundary.
   *  Client-only / localStorage approval is NEVER accepted as trusted. */
  approveProposal(proposalId: string, actorId: string): EvolutionChangeProposal {
    return evolutionChangeControl.approve(proposalId, actorId);
  }

  /** Rollback a deployed proposal using its rollback metadata (restores previous state). */
  rollbackProposal(proposalId: string): { rolledBack: boolean; previousState: unknown } {
    const proposal = evolutionChangeControl.getProposal(proposalId);
    if (!proposal) return { rolledBack: false, previousState: null };
    const rb = rollbackRegistry.getForProposal(proposalId);
    const previousState = rb ? rb.previousState : proposal.currentState;
    if (rb) rollbackRegistry.markExecuted(rb.rollbackId);
    proposal.lifecycle = 'rolled_back';
    proposal.monitoringStatus = 'rolled_back';
    proposal.deploymentStatus = 'failed';
    return { rolledBack: true, previousState };
  }

  /** Rollback to a previous evolution snapshot */
  rollback(version: number): EvolutionSnapshot | null {
    if (version < 1 || version > this.snapshots.length) return null;
    const snapshot = this.snapshots[version - 1];
    if (!snapshot) return null;

    // Restore patterns from that snapshot
    this.patterns = [...snapshot.patterns];
    this.snapshots = this.snapshots.filter(s => s.version <= version);
    this.save(this.PAT_KEY, this.patterns);
    this.save(this.SNAP_KEY, this.snapshots);

    return snapshot;
  }

  /** Get interaction history */
  history(limit = 100): AIInteraction[] {
    return this.interactions.slice(-limit);
  }

  /** Export evolution data */
  exportEvolution() {
    return {
      interactions: this.interactions.slice(-5000),
      patterns: this.patterns,
      snapshots: this.snapshots,
    };
  }

  /** Import evolution data */
  importEvolution(data: { interactions?: AIInteraction[]; patterns?: EvolutionPattern[]; snapshots?: EvolutionSnapshot[] }): void {
    if (data.interactions) this.interactions = data.interactions.slice(-this.MAX_INTERACTIONS);
    if (data.patterns) this.patterns = data.patterns.slice(-500);
    if (data.snapshots) this.snapshots = data.snapshots.slice(-100);
    this.save(this.INT_KEY, this.interactions);
    this.save(this.PAT_KEY, this.patterns);
    this.save(this.SNAP_KEY, this.snapshots);
  }

  /** Generate comprehensive evolution report */
  generateReport(period: 'daily' | 'weekly' | 'monthly' = 'daily'): EvolutionReport {
    const now = Date.now();
    const periodMs = period === 'daily' ? 86400000 : period === 'weekly' ? 604800000 : 2592000000;
    const recentInteractions = this.interactions.filter(i => i.timestamp > now - periodMs);
    const recentPatterns = this.patterns.filter(p => p.discoveredAt > now - periodMs);

    const successful = recentInteractions.filter(i => i.successScore > 60);
    const failed = recentInteractions.filter(i => i.successScore < 30);

    const topImprovements = recentPatterns
      .filter(p => p.type === 'successful')
      .sort((a, b) => b.avgSuccessScore - a.avgSuccessScore)
      .slice(0, 5)
      .map(p => ({ category: p.category, improvement: p.description, score: Math.round(p.avgSuccessScore) }));

    const topFailures = recentPatterns
      .filter(p => p.type === 'failed')
      .sort((a, b) => a.avgSuccessScore - b.avgSuccessScore)
      .slice(0, 5)
      .map(p => ({ category: p.category, failure: p.description, score: Math.round(p.avgSuccessScore) }));

    const newBehaviors = recentPatterns.filter(p => p.confidence > 50).map(p => p.description);
    const deprecatedBehaviors = this.patterns.filter(p => p.lastSeen < now - 90 * 86400000).map(p => p.description).slice(0, 5);

    const overallScore = recentInteractions.length > 0
      ? Math.round(recentInteractions.reduce((s, i) => s + i.successScore, 0) / recentInteractions.length)
      : 50;

    const report: EvolutionReport = {
      id: `report_${now}_${period}`,
      timestamp: now,
      period,
      topImprovements,
      topFailures,
      newBehaviors: newBehaviors.slice(0, 5),
      deprecatedBehaviors,
      recommendedAdjustments: this.snapshots.length > 0
        ? this.snapshots[this.snapshots.length - 1].adjustments.map(a => ({
            engine: a.engine,
            parameter: a.parameter,
            currentValue: a.oldValue,
            suggestedValue: a.newValue,
            reason: a.reason,
          }))
        : [],
      confidenceChanges: [
        { engine: 'overall', oldConfidence: overallScore - 5, newConfidence: overallScore, reason: `${period} performance update` },
      ],
      overallScore,
      executiveSummary: `Over ${period} period: ${recentInteractions.length} interactions tracked. ${successful.length} successful (${successful.length > 0 ? Math.round(successful.length / Math.max(1, recentInteractions.length) * 100) : 0}%). ${topImprovements.length} improvements identified. ${failed.length} areas need attention.`,
    };

    memoryAccessGateway.rememberSystem('system', 'daily_summary', report, { level: 'long', importance: 70, tags: ['evolution_report', period] });
    return report;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Orchestrator Integration
  // ═══════════════════════════════════════════════════════════════════════════

  async execute(context: OrchestratorContext): Promise<void> {
    if (!this.evolutionEnabled) return;
    const now = Date.now();
    // Learn patterns every 30 minutes
    if (now - this.lastEvolutionAt > 1800000) {
      this.learnPattern();
    }
    // Generate evolution daily at midnight
    const d = new Date();
    if (d.getHours() === 0 && d.getMinutes() < 5 && now - this.lastEvolutionAt > 60000) {
      this.generateEvolution();
    }
  }

  getOrchestratorContract(): EngineContract {
    return {
      name: 'selfEvolutionEngine',
      priority: 8,
      dependencies: [
        'contextEngine', 'universalMemory', 'brainEngine', 'coachEngine',
        'personalityEngine', 'emotionalEngine', 'adaptiveLearning', 'mentorEngine',
        'executiveIntelligence', 'analyticsCenter', 'predictionEngine',
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
  // Private
  // ═══════════════════════════════════════════════════════════════════════════

  private save(key: string, data: any): void {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch {
      console.warn('[SelfEvolution] Failed to save:', key);
    }
  }

  private loadAll(): void {
    try {
      const intData = localStorage.getItem(this.INT_KEY);
      if (intData) this.interactions = JSON.parse(intData).slice(-this.MAX_INTERACTIONS);
      const patData = localStorage.getItem(this.PAT_KEY);
      if (patData) this.patterns = JSON.parse(patData).slice(-500);
      const snapData = localStorage.getItem(this.SNAP_KEY);
      if (snapData) this.snapshots = JSON.parse(snapData).slice(-100);
    } catch {
      console.warn('[SelfEvolution] Failed to load data');
    }
  }
}

export const selfEvolutionEngine = new SelfEvolutionEngine();
