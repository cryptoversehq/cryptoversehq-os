// platformIntelligenceLayer.ts — consolidated into ./lynxPipeline.ts.
// This file formerly housed a real-time coordination layer (PIL) whose
// dependencies (enterpriseScheduler, memoryGovernance, auditTrail,
// reasoningChain) were removed from the codebase, leaving it non-compilable.
// Its real-time coordination responsibilities are handled by
// lynxPipeline.processQuery. No modules import this file.
// Type declarations below are retained as forward-compatible shims only.

export interface PILRequest {
  userId: string;
  agentId?: string;
  resource: string;
  action: string;
  query?: string;
  context?: Record<string, any>;
  priority?: number;
}

export interface PILResponse {
  allowed: boolean;
  decision: any;
  reasoningChainId: string | null;
  memoryVersion: number | null;
  auditId: string | null;
  error: string | null;
  processingTimeMs: number;
  timestamp: number;
}

export interface PILStatus {
  engines: Record<string, boolean>;
  totalRequests: number;
  totalAllowed: number;
  totalDenied: number;
  uptime: string;
}
