// realTimeTruthEngine.ts — consolidated into ./realDataConnector.ts (DataType, detectDataType)
// and ./lynxPipeline.ts (real-time data accessors / getRealData). This module is now a
// backward-compatible re-export shim so any external `import { realTimeTruthEngine }`
// keeps resolving to the canonical data connector.
export { realDataConnector as realTimeTruthEngine } from './realDataConnector';
export type { DataType } from './realDataConnector';
