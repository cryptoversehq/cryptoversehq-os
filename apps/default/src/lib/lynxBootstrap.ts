/**
 * lynxBootstrap.ts — Lynx AI Bootstrapper (Sprint 4.4-A)
 * Single initialization entry point for the entire Lynx AI Operating System.
 * Registers ALL engines with the Orchestrator. Singleton protection.
 * Run once after authentication is ready. Never before auth.
 */

import { lynxOrchestrator, wrapEngine, type OrchestratorContext, type EngineContract } from './lynxOrchestrator';

// ── Engine imports (contract-bearing engines) ─────────────────────────────
import { goalEngine } from './goalEngine';
import { missionEngine } from './missionEngine';
import { journeyManager } from './journeyManager';
import { learningEngine } from './learningEngine';
import { predictionEngine } from './predictionEngine';
import { autonomousEngine } from './autonomousEngine';
import { executiveEngine } from './executiveEngine';
import { notificationBrain } from './notificationBrain';
import { aiCommandCenter } from './aiCommandCenter';
import { analyticsCenter } from './analyticsCenter';
import { identityEngine } from './identityEngine';
import { permissionEngine } from './permissionEngine';
import { universalMemory } from './universalMemory';
import { liveKnowledge } from './liveKnowledge';
import { dynamicKnowledgeInject } from './dynamicKnowledgeInject';
import { brainFusion } from './brainFusion';
import { personalityEngine } from './personalityEngine';
import { emotionalEngine } from './emotionalEngine';
import { relationshipEngine } from './relationshipEngine';
import { selfEvolutionEngine } from './selfEvolutionEngine';
import { mentorEngine } from './mentorEngine';
import { agentRouterGen2 } from './agentRouter';
import { agentSDK } from './agentSDK';
import { adaptiveLearning } from './adaptiveLearning';
import { insightGraph } from './insightGraph';
import { aiGovernance } from './aiGovernance';
import { aiObservability } from './aiObservability';

// ── Core engine imports (wrapEngine targets) ──────────────────────────────
import { lynxContext } from './contextEngine';
import { lynxMemory } from './memoryEngine';
import { lynxBrain } from './brainEngine';
import { lynxCoach } from './coachEngine';
import { securityCenter } from './securityCenter';
import { businessAnalyst } from './businessAnalyst';
import { economyManager } from './economyManager';
import { contentManager } from './contentManager';
import { healthMonitor } from './healthMonitor';
import { digitalTwin } from './digitalTwin';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface BootstrapResult {
  success: boolean;
  registered: string[];
  failed: { name: string; error: string }[];
  totalEngines: number;
  durationMs: number;
  priorityOrder: { name: string; priority: number }[];
  dependencyGraph: Record<string, string[]>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════════════════════════════════

import {
  type LynxLifecycleState,
  setLynxLifecycleState,
  getLynxLifecycleState,
  subscribeLynxLifecycle,
} from './lynxLifecycle';

// Re-export the lifecycle primitives so existing importers that referenced them
// from this module (e.g. useLynxRuntime) keep working unchanged.
export {
  type LynxLifecycleState,
  getLynxLifecycleState,
  subscribeLynxLifecycle,
};

// Local bootstrap-only state. The lifecycle state itself now lives in the
// engine-free lynxLifecycle module so this file's heavy engine imports are not
// pulled into the initial bundle just to read readiness.
let lastResult: BootstrapResult | null = null;
let bootstrapPromise: Promise<BootstrapResult> | null = null;
// Invocation counter — proves bootstrapLynx() is actually entered and lets us
// distinguish "called N times" (e.g. Strict Mode) from "ran the bootstrap once".
let bootstrapCallCount = 0;

// Local alias so the rest of this file can keep calling setLifecycleState().
const setLifecycleState = setLynxLifecycleState;
// Local read helper (engine graph is not in scope at module eval of UI).
const getLifecycleState = getLynxLifecycleState;

/** How many times bootstrapLynx() has been entered (for diagnostics). */
export function getLynxBootstrapCallCount(): number {
  return bootstrapCallCount;
}

export const LYNX_BUILD_REVISION = '2026-08-13-bootstrap-refresh';

// ═══════════════════════════════════════════════════════════════════════════════
// Bootstrap
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Register ALL Lynx engines and initialize the Orchestrator.
 * Called once from App.tsx after authentication.
 * Idempotent across Strict Mode, re-renders, and provider remounts.
 */
export async function bootstrapLynx(): Promise<BootstrapResult> {
  bootstrapCallCount += 1;
  console.info('[Lynx] bootstrapLynx() entered — invocation #' + bootstrapCallCount + ', state:', getLifecycleState());
  if (getLifecycleState() === 'ready' && lastResult) return lastResult;
  if (getLifecycleState() === 'initializing' && bootstrapPromise) return bootstrapPromise;
  if (getLifecycleState() === 'failed' && lastResult) return lastResult;

  setLifecycleState('initializing');
  bootstrapPromise = runBootstrap();
  return bootstrapPromise;
}

async function runBootstrap(): Promise<BootstrapResult> {
  const start = Date.now();
  const registered: string[] = [];
  const failed: { name: string; error: string }[] = [];

  // ── Step 1: Register core engines using wrapEngine ────────────────────
  const coreEngines: { name: string; priority: number; dependencies: string[]; instance: any; executeFn: (ctx: OrchestratorContext, inst: any) => Promise<void> }[] = [
    { name: 'contextEngine', priority: 1, dependencies: [], instance: lynxContext, executeFn: async (ctx, inst) => { inst.refreshFromStores(); } },
    { name: 'memoryEngine', priority: 2, dependencies: ['contextEngine'], instance: lynxMemory, executeFn: async (ctx, inst) => { inst.analyzeAndUpdate?.(); } },
    { name: 'brainEngine', priority: 3, dependencies: ['contextEngine', 'memoryEngine'], instance: lynxBrain, executeFn: async (ctx, inst) => { inst.analyzeSentiment?.(); inst.detectPatterns?.(); inst.generateSuggestions?.(); } },
    { name: 'coachEngine', priority: 4, dependencies: ['brainEngine'], instance: lynxCoach, executeFn: async (ctx, inst) => { inst.generateMessages?.(); inst.generateUIAdaptations?.(); } },
    { name: 'securityCenter', priority: 5, dependencies: ['contextEngine'], instance: securityCenter, executeFn: async (ctx, inst) => { inst.getReport?.(); } },
    { name: 'businessAnalyst', priority: 5, dependencies: ['contextEngine'], instance: businessAnalyst, executeFn: async (ctx, inst) => { inst.getReport?.(); } },
    { name: 'economyManager', priority: 7, dependencies: ['contextEngine'], instance: economyManager, executeFn: async (ctx, inst) => { inst.getReport?.(); } },
    { name: 'contentManager', priority: 7, dependencies: ['contextEngine'], instance: contentManager, executeFn: async (ctx, inst) => { inst.getReport?.(); } },
    { name: 'healthMonitor', priority: 5, dependencies: ['contextEngine'], instance: healthMonitor, executeFn: async (ctx, inst) => { inst.getReport?.(); } },
    { name: 'digitalTwin', priority: 6, dependencies: ['contextEngine', 'healthMonitor'], instance: digitalTwin, executeFn: async (ctx, inst) => { inst.getSnapshot?.(); } },
  ];

  for (const ce of coreEngines) {
    try {
      const contract = wrapEngine({
        name: ce.name,
        priority: ce.priority,
        dependencies: ce.dependencies,
        instance: ce.instance,
        executeFn: ce.executeFn,
      });
      lynxOrchestrator.register(contract);
      registered.push(ce.name);
    } catch (err: any) {
      failed.push({ name: ce.name, error: err?.message || 'Unknown error' });
    }
  }

  // ── Step 2: Register contract-bearing engines ──────────────────────────
  const executiveIntelligenceContract = typeof (executiveEngine as any).getExecutiveIntelligenceContract === 'function'
    ? (executiveEngine as any).getExecutiveIntelligenceContract()
    : null;
  const contractEngines: { name: string; contract: EngineContract }[] = [
    { name: 'goalEngine', contract: goalEngine.getOrchestratorContract() },
    { name: 'missionEngine', contract: missionEngine.getOrchestratorContract() },
    { name: 'journeyManager', contract: journeyManager.getOrchestratorContract() },
    { name: 'learningEngine', contract: learningEngine.getOrchestratorContract() },
    { name: 'predictionEngine', contract: predictionEngine.getOrchestratorContract() },
    { name: 'autonomousEngine', contract: autonomousEngine.getOrchestratorContract() },
    { name: 'executiveEngine', contract: executiveEngine.getOrchestratorContract() },
    ...(executiveIntelligenceContract ? [{ name: 'executiveIntelligence', contract: executiveIntelligenceContract }] : []),
    { name: 'notificationBrain', contract: notificationBrain.getOrchestratorContract() },
    { name: 'aiCommandCenter', contract: aiCommandCenter.getOrchestratorContract() },
    { name: 'analyticsCenter', contract: analyticsCenter.getOrchestratorContract() },
    { name: 'identityEngine', contract: identityEngine.getOrchestratorContract() },
    { name: 'permissionEngine', contract: permissionEngine.getOrchestratorContract() },
    { name: 'universalMemory', contract: universalMemory.getOrchestratorContract() },
    { name: 'liveKnowledge', contract: liveKnowledge.getOrchestratorContract() },
    { name: 'dynamicKnowledgeInject', contract: dynamicKnowledgeInject.getOrchestratorContract() },
    { name: 'brainFusion', contract: brainFusion.getOrchestratorContract() },
    { name: 'personalityEngine', contract: personalityEngine.getOrchestratorContract() },
    { name: 'emotionalEngine', contract: emotionalEngine.getOrchestratorContract() },
    { name: 'relationshipEngine', contract: relationshipEngine.getOrchestratorContract() },
    { name: 'selfEvolutionEngine', contract: selfEvolutionEngine.getOrchestratorContract() },
    { name: 'mentorEngine', contract: mentorEngine.getOrchestratorContract() },
    { name: 'agentRouter', contract: agentRouterGen2.getOrchestratorContract() },
    { name: 'agentSDK', contract: agentSDK.getOrchestratorContract() },
    { name: 'adaptiveLearning', contract: adaptiveLearning.getOrchestratorContract() },
    { name: 'insightGraph', contract: insightGraph.getOrchestratorContract() },
    { name: 'aiGovernance', contract: aiGovernance.getOrchestratorContract() },
    { name: 'aiObservability', contract: aiObservability.getOrchestratorContract() },
  ];

  for (const ce of contractEngines) {
    try {
      lynxOrchestrator.register(ce.contract);
      registered.push(ce.name);
    } catch (err: any) {
      failed.push({ name: ce.name, error: err?.message || 'Unknown error' });
    }
  }

  // ── Step 3: Initialize orchestrator ───────────────────────────────────
  try {
    const initializationResults = await lynxOrchestrator.initializeAll();
    failed.push(...initializationResults
      .filter(result => !result.ok)
      .map(result => ({ name: result.name, error: result.error || 'Engine initialization failed' })));
  } catch (err: any) {
    failed.push({ name: 'orchestrator', error: err?.message || 'Orchestrator initialization failed' });
  }

  // ── Build result ──────────────────────────────────────────────────────
  const allEngines = lynxOrchestrator.listEngines();
  const priorityOrder = allEngines.map(e => ({ name: e.name, priority: e.priority }));
  const dependencyGraph: Record<string, string[]> = {};
  for (const e of allEngines) {
    dependencyGraph[e.name] = e.dependencies;
  }

  const result: BootstrapResult = {
    success: failed.length === 0,
    registered,
    failed,
    totalEngines: allEngines.length,
    durationMs: Date.now() - start,
    priorityOrder,
    dependencyGraph,
  };

  lastResult = result;

  if (result.success) {
    setLifecycleState('ready');
    // The orchestrator owns startup, heartbeat, and recurring scheduling.
    // Periodic business analysis refresh is a scheduled task (not a leaked
    // self-owned setInterval) so it is torn down by registerScheduler/shutdown.
    lynxOrchestrator.registerScheduledTask('businessAnalyst-refresh', 300000, () => businessAnalyst.refresh());
    lynxOrchestrator.registerScheduler();
  } else {
    setLifecycleState('failed');
  }

  console.info('[LynxBootstrap] lifecycle', {
    state: getLifecycleState(),
    registeredEngines: allEngines.length,
    failedEngines: failed.length,
    durationMs: result.durationMs,
  });
  if (failed.length > 0) {
    console.error('[LynxBootstrap] initialization failures', failed);
  }

  return result;
}

/**
 * Shutdown the entire Lynx AI system gracefully.
 */
export async function shutdownLynx(): Promise<void> {
  if (getLifecycleState() === 'not_started' || getLifecycleState() === 'shutting_down') return;
  setLifecycleState('shutting_down');
  bootstrapPromise = null;
  await lynxOrchestrator.shutdown();
  lastResult = null;
  setLifecycleState('not_started');
}

/**
 * Get current Lynx AI system status.
 */
export function getLynxStatus() {
  return {
    lifecycleState: getLifecycleState(),
    registeredEngines: lynxOrchestrator.listEngines().length,
    health: lynxOrchestrator.getAllHealth(),
    metrics: lynxOrchestrator.getMetrics(),
    lastBootstrap: lastResult,
  };
}
