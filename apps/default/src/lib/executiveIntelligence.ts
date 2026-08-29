// executiveIntelligence.ts — consolidated into ./executiveEngine.ts. The scanning,
// snapshot, alert, and brief logic now lives on the executiveEngine singleton, which
// also exposes getExecutiveIntelligenceContract() (registered under the historical
// 'executiveIntelligence' engine name by lynxBootstrap). This module is a
// backward-compatible re-export shim.
export type {
  Subsystem,
  SubsystemScan,
  ExecutiveAlert,
  ExecutiveRecommendation,
  ExecutiveSnapshot,
  ExecutiveBrief,
} from './executiveEngine';
export { executiveEngine as executiveIntelligence } from './executiveEngine';
