/**
 * agentRouter.ts — CryptoVerse HQ Router Gen2 (Delegated)
 * Delegates all routing decisions to lynxResponder.detectRoute().
 * Backward-compatible wrapper for existing consumers (useDeepSeekChat, etc.).
 * Agent definitions and access control preserved for external consumers.
 */

import type { EngineContract } from './lynxOrchestrator';
import type { OrchestratorContext, AgentKey, RouteDetection, RoutingContext, RoutingDecision } from './lynxTypes';
import { brainFusion } from './brainFusion';
import { useAuthStore } from './authStore';
import { lynxResponder, AGENTS } from './lynxResponder';
export { AGENTS };
export type { RoutingContext, RoutingDecision } from './lynxTypes';

// ── Agent Definitions ──────────────────────────────────────────────────────
// Single source of truth lives in lynxResponder.ts (re-exported above as
// `AGENTS`). Kept here only so historical consumers importing from
// agentRouter keep working unchanged.

export interface AgentInfo { key: AgentKey; id: string; name: string; emoji: string; }

// ═══════════════════════════════════════════════════════════════════════════════
// Access Control (preserved)
// ═══════════════════════════════════════════════════════════════════════════════

const AGENT_ACCESS: Record<string, AgentKey[]> = {
  user:        ['router', 'trading', 'academy', 'onchain', 'nft', 'bot', 'events', 'nationsOracle', 'support', 'marketplace', 'tournament', 'wallet', 'mentor'],
  admin:       ['router', 'trading', 'academy', 'onchain', 'nft', 'bot', 'events', 'admin', 'nationsOracle', 'compliance', 'support', 'marketplace', 'tournament', 'wallet', 'business', 'mentor'],
  super_admin: Object.keys(AGENTS) as AgentKey[],
};

export function checkUserAccess(userRole: string, agentKey: AgentKey): boolean {
  return AGENT_ACCESS[userRole || 'user']?.includes(agentKey) ?? false;
}

// RoutingContext and RoutingDecision are defined in ./lynxTypes and imported above.

export interface RoutingHistory {
  id: string;
  context: RoutingContext;
  decision: RoutingDecision;
  outcome?: string;
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AgentRouter Gen2 — Delegated to lynxResponder
// ═══════════════════════════════════════════════════════════════════════════════

class AgentRouterGen2 {
  private registered = false;
  private routingHistory: RoutingHistory[] = [];
  private readonly MAX_HISTORY = 1000;
  private lastRoutedAt: number = 0;

  // ── Public APIs ──────────────────────────────────────────────────────────

  /** Route a user query to the best agent(s). Delegates to lynxResponder. */
  route(context: RoutingContext): RoutingDecision {
    const start = Date.now();

    // Delegate to unified lynxResponder routing
    const detection = lynxResponder.detectRoute(
      context.query,
      context.page,
      context.role
    );

    // Map RouteDetection to RoutingDecision
    const decision: RoutingDecision = {
      primaryAgent: detection.primaryAgent,
      confidence: detection.confidence,
      fallbackAgent: detection.fallbackAgent,
      needsMultipleAgents: detection.collaborativeAgents.length > 1,
      collaborativeAgents: detection.collaborativeAgents,
      needsBrainFusion: detection.needsBrainFusion,
      needsMemory: detection.needsMemory,
      needsExecutiveIntel: context.role === 'super_admin',
      needsPrediction: detection.needsPrediction,
      needsMentor: detection.primaryAgent === 'mentor',
      needsEmotionalAdaptation: context.emotionalState === 'stress' || context.emotionalState === 'frustration',
      needsAdaptiveLearning: detection.primaryAgent === 'academy',
      needsAnalytics: (detection as any).needsAnalytics || false,
      needsSecurity: (detection as any).needsSecurity || false,
      needsAdmin: detection.primaryAgent === 'admin' || detection.primaryAgent === 'superAdmin',
      reason: detection.reason,
      processingTimeMs: Date.now() - start,
      timestamp: Date.now(),
    };

    // Store in history
    this.routingHistory.push({ id: 'route_' + Date.now(), context, decision, timestamp: Date.now() });
    if (this.routingHistory.length > this.MAX_HISTORY) {
      this.routingHistory = this.routingHistory.slice(-this.MAX_HISTORY);
    }
    this.lastRoutedAt = Date.now();

    return decision;
  }

  /** Re-route if initial routing was suboptimal */
  reroute(context: RoutingContext, previousDecision: RoutingDecision): RoutingDecision {
    if (previousDecision.confidence < 50) {
      return {
        ...previousDecision,
        primaryAgent: 'brainFusion',
        needsBrainFusion: true,
        confidence: 75,
        reason: 'Re-routed: low confidence — escalating to Brain Fusion',
        processingTimeMs: 0,
        timestamp: Date.now(),
      };
    }
    return previousDecision;
  }

  /** Resolve which agent(s) should handle a query (with conflict resolution) */
  resolve(context: RoutingContext): { agents: AgentKey[]; useBrainFusion: boolean; reason: string } {
    const decision = this.route(context);

    if (decision.needsMultipleAgents && decision.collaborativeAgents.length > 1) {
      return {
        agents: decision.collaborativeAgents,
        useBrainFusion: true,
        reason: `Multiple agents: ${decision.collaborativeAgents.join(', ')}. Brain Fusion coordinating.`,
      };
    }

    return {
      agents: [decision.primaryAgent],
      useBrainFusion: decision.needsBrainFusion,
      reason: `Agent: ${decision.primaryAgent} (${decision.confidence}%). ${decision.reason}`,
    };
  }

  explain(decision: RoutingDecision): string {
    const lines: string[] = [
      `Routing Decision: ${decision.primaryAgent} (${decision.confidence}% confidence)`,
      `Fallback: ${decision.fallbackAgent}`,
      `Reason: ${decision.reason}`,
    ];
    if (decision.needsMultipleAgents) lines.push(`Collaborative: ${decision.collaborativeAgents.join(', ')}`);
    if (decision.needsBrainFusion) lines.push('Brain Fusion: required');
    if (decision.needsMemory) lines.push('Memory: required');
    return lines.join('\n');
  }

  predictBestAgent(query: string, role?: string, page?: string): AgentKey {
    return lynxResponder.detectRoute(query, page, role).primaryAgent;
  }

  getRoutingHistory(limit = 50): RoutingHistory[] {
    return this.routingHistory.slice(-limit);
  }

  generateRoutingReport() {
    const total = this.routingHistory.length;
    if (total === 0) {
      return { totalRoutes: 0, agentDistribution: {}, avgConfidence: 0, mostUsedAgent: 'none', brainFusionRate: '0%', avgProcessingMs: 0 };
    }
    const dist: Record<string, number> = {};
    let totalConf = 0, totalBF = 0, totalMs = 0;
    for (const entry of this.routingHistory) {
      dist[entry.decision.primaryAgent] = (dist[entry.decision.primaryAgent] || 0) + 1;
      totalConf += entry.decision.confidence;
      if (entry.decision.needsBrainFusion) totalBF++;
      totalMs += entry.decision.processingTimeMs;
    }
    return {
      totalRoutes: total,
      agentDistribution: dist,
      avgConfidence: Math.round(totalConf / total),
      mostUsedAgent: Object.entries(dist).sort((a, b) => b[1] - a[1])[0]?.[0] || 'none',
      brainFusionRate: Math.round((totalBF / total) * 100) + '%',
      avgProcessingMs: Math.round(totalMs / total),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Orchestrator Integration (fixed dependency list)
  // ═══════════════════════════════════════════════════════════════════════════

  async execute(context: OrchestratorContext): Promise<void> {
    // Router operates on-demand per user query
  }

  getOrchestratorContract(): EngineContract {
    return {
      name: 'agentRouter',
      priority: 21,
      dependencies: [
        // Core engines that actually exist and are registered
        'contextEngine',
        'memoryEngine',
        'brainFusion',
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
  // DeepSeek Chat Integration (preserved from Gen1)
  // ═══════════════════════════════════════════════════════════════════════════

  async routedChat(messages: any[]): Promise<any> {
    const lastUserMsg = messages.filter((m: any) => m.role === 'user').pop();
    const query = lastUserMsg?.content || 'help';

    const auth = useAuthStore.getState();
    const context: RoutingContext = {
      userId: auth.user?.id || 'guest',
      query,
      page: '/chat',
      role: auth.user?.role || 'user',
      timestamp: Date.now(),
    };

    const decision = this.route(context);
    const agent = AGENTS[decision.primaryAgent] || AGENTS.router;

    // Every answer now goes through Brain Fusion (the exclusive response path).
    // No direct deepSeekChat() call here — deepSeekClient is consulted by the
    // pipeline after Brain Fusion has produced its evidence-backed answer.
    let content = 'The selected agent could not produce an answer.';
    let ok = false;
    try {
      const fusion = await brainFusion.think({
        userId: context.userId,
        query: context.query,
        page: context.page,
        personality: 'friendly',
        emotion: 'neutral',
        timestamp: Date.now(),
      });
      if (fusion.answer) {
        content = fusion.answer;
        ok = true;
      }
    } catch { /* leave the fallback message */ }

    return {
      content,
      source: ok ? 'Brain Fusion' : 'Brain Fusion unavailable',
      confidence: ok ? decision.confidence : 0,
      reasoningPath: ['Intent matched: ' + decision.primaryAgent, decision.reason, 'Brain Fusion answer (exclusive response path)'],
      agentName: agent.name,
      agentEmoji: agent.emoji,
      ok,
      routing: { agent: decision.primaryAgent, confidence: decision.confidence, needsBrainFusion: true },
    };
  }
}

export const agentRouterGen2 = new AgentRouterGen2();

export const routedChat = agentRouterGen2.routedChat.bind(agentRouterGen2);
