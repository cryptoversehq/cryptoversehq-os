/**
 * knowledgeProvenance.ts — Canonical knowledge provenance for the Lynx Knowledge Pipeline.
 *
 * The SINGLE provenance representation used by knowledgePipeline. Do not create a
 * second provenance system.
 *
 * Every knowledge fragment must truthfully preserve:
 *   source, source type, source module, capability/domain, subject (user) scope,
 *   timestamp, freshness, authority, confidence, and synthetic/unavailable status.
 *
 * Synthetic sources are explicitly marked SYNTHETIC and can NEVER become authoritative.
 * Unavailable data is explicitly marked UNAVAILABLE — never promoted to authoritative.
 */

export type KnowledgeAuthority = 'authoritative' | 'synthetic' | 'unavailable';
export type KnowledgeSourceType = 'real_store' | 'live_api' | 'simulated' | 'derived' | 'unavailable';

export interface KnowledgeProvenance {
  source: string;
  sourceType: KnowledgeSourceType;
  sourceModule: string;
  capability: string;
  subjectScope: string | null;
  timestamp: number;
  freshnessMs: number;
  authority: KnowledgeAuthority;
  confidence: number | null;
  status: KnowledgeAuthority;
}

export interface ProvenanceInput {
  source: string;
  sourceType: KnowledgeSourceType;
  sourceModule: string;
  capability: string;
  subjectScope?: string | null;
  timestamp: number;
  authority: KnowledgeAuthority;
  confidence?: number | null;
}

export function buildProvenance(input: ProvenanceInput): KnowledgeProvenance {
  return {
    source: input.source,
    sourceType: input.sourceType,
    sourceModule: input.sourceModule,
    capability: input.capability,
    subjectScope: input.subjectScope ?? null,
    timestamp: input.timestamp,
    freshnessMs: Date.now() - input.timestamp,
    authority: input.authority,
    confidence: input.confidence ?? null,
    status: input.authority,
  };
}

/** True only for fully-formed, authoritative, error-free knowledge. */
export function isAuthoritativeKnowledge(p: KnowledgeProvenance): boolean {
  return p.authority === 'authoritative' && p.status === 'authoritative';
}

/** Synthetic must never be treated as authoritative. */
export function isSyntheticKnowledge(p: KnowledgeProvenance): boolean {
  return p.authority === 'synthetic';
}
