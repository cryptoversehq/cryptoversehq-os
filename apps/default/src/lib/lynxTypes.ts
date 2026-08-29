/**
 * lynxTypes.ts — Shared Lynx AI type definitions.
 *
 * Centralized here to break circular dependencies between the engine modules
 * (agentRouter, lynxPipeline, lynxOrchestrator, lynxResponder).
 *
 * NOTE: `AgentKey` is derived from `AGENTS`, which lives in `lynxResponder.ts`.
 * We import `AGENTS` as a value so `keyof typeof AGENTS` resolves. This creates
 * only a one-way runtime edge (lynxTypes -> lynxResponder); lynxResponder only
 * imports TYPES from this file (erased at runtime), so there is no runtime cycle.
 */

import { AGENTS } from './lynxResponder';

export type AgentKey = keyof typeof AGENTS;

// ── From lynxResponder.ts ─────────────────────────────────────────────────────
export interface RouteDetection {
  matchedBlock: string | null;
  matchedBlockId: string | null;
  primaryAgent: AgentKey;
  fallbackAgent: AgentKey;
  confidence: number;
  needsBrainFusion: boolean;
  needsMemory: boolean;
  needsPrediction: boolean;
  collaborativeAgents: AgentKey[];
  reason: string;
}

// ── From lynxPipeline.ts ──────────────────────────────────────────────────────
export interface PipelineQuery {
  userId: string;
  query: string;
  context?: {
    currentSection?: string;
    language?: string;
    page?: string;
  };
}

export interface PipelineResponse {
  content: string;
  source: 'local' | 'deepseek' | 'fusion' | 'error';
  suggestions?: string[];
  confidence: number;
  metadata: {
    identityVerified: boolean;
    permissionsGranted: boolean;
    memoryUsed: boolean;
    enginesConsulted: string[];
    processingTimeMs: number;
    intent?: string;
    agent?: string;
  };
}

// ── From agentRouter.ts ───────────────────────────────────────────────────────
export interface RoutingContext {
  userId: string;
  query: string;
  page?: string;
  role?: string;
  permissions?: string[];
  conversationId?: string;
  emotionalState?: string;
  personalityProfile?: string;
  learningProfile?: string;
  mentorProfile?: string;
  predictionProfile?: string;
  businessContext?: string;
  timestamp: number;
}

export interface RoutingDecision {
  primaryAgent: AgentKey;
  confidence: number;
  fallbackAgent: AgentKey;
  needsMultipleAgents: boolean;
  collaborativeAgents: AgentKey[];
  needsBrainFusion: boolean;
  needsMemory: boolean;
  needsExecutiveIntel: boolean;
  needsPrediction: boolean;
  needsMentor: boolean;
  needsEmotionalAdaptation: boolean;
  needsAdaptiveLearning: boolean;
  needsAnalytics: boolean;
  needsSecurity: boolean;
  needsAdmin: boolean;
  reason: string;
  processingTimeMs: number;
  timestamp: number;
}

// ── From lynxOrchestrator.ts ──────────────────────────────────────────────────
export interface OrchestratorContext {
  timestamp: number;
  page?: string;
  userId?: string;
  role?: string;
  event?: { type: string; [key: string]: any };
  snapshot: Record<string, any>;
}
