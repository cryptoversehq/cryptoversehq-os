/**
 * evidenceContract.ts — Canonical Evidence Contract for Brain Fusion.
 *
 * The SINGLE source of truth for what counts as acceptable evidence. There is
 * exactly ONE evidence contract; do not create a second.
 *
 * Every authoritative evidence item MUST carry:
 *   sourceEngine, evidence payload, timestamp, confidence, authority,
 *   provenance, evidenceType, and error/unavailable info when applicable.
 *
 * Malformed evidence is rejected. Synthetic evidence is explicitly typed and
 * can NEVER become authoritative. Unavailable data is never promoted to
 * authoritative evidence.
 */

export type EvidenceAuthority = 'authoritative' | 'synthetic' | 'unavailable';
export type EvidenceType = EvidenceAuthority;

export interface Provenance {
  source: string;
  sourceEngine: string;
  capability: string;
  subjectIdentity: string | null;
  timestamp: number;
  freshnessMs: number;
  authority: EvidenceAuthority;
  evidenceType: EvidenceType;
}

export interface EvidenceItem {
  capability: string;
  sourceEngine: string;
  evidence: unknown;
  timestamp: number;
  confidence: number | null;
  authority: EvidenceAuthority;
  evidenceType: EvidenceType;
  provenance: Provenance;
  error?: { code: string; reason: string };
}

const AUTHORITY_RANK: Record<EvidenceAuthority, number> = {
  authoritative: 3,
  synthetic: 1,
  unavailable: 0,
};

/** True only for fully-formed, authoritative, error-free evidence. */
export function isAuthoritative(e: EvidenceItem): boolean {
  return (
    e.authority === 'authoritative' &&
    e.evidenceType === 'authoritative' &&
    e.error === undefined &&
    typeof e.confidence === 'number'
  );
}

/** Reject any malformed evidence item. */
export function validateEvidence(e: unknown): e is EvidenceItem {
  if (!e || typeof e !== 'object') return false;
  const item = e as EvidenceItem;
  if (typeof item.capability !== 'string') return false;
  if (typeof item.sourceEngine !== 'string') return false;
  if (typeof item.timestamp !== 'number') return false;
  if (item.authority !== 'authoritative' && item.authority !== 'synthetic' && item.authority !== 'unavailable') return false;
  if (item.evidenceType !== 'authoritative' && item.evidenceType !== 'synthetic' && item.evidenceType !== 'unavailable') return false;
  if (!item.provenance || typeof item.provenance !== 'object') return false;
  if (typeof item.provenance.sourceEngine !== 'string') return false;
  if (typeof item.provenance.timestamp !== 'number') return false;
  if (item.provenance.subjectIdentity !== null && typeof item.provenance.subjectIdentity !== 'string') return false;
  // Authoritative requires numeric confidence AND evidenceType authoritative.
  if (item.authority === 'authoritative') {
    if (item.evidenceType !== 'authoritative') return false;
    if (typeof item.confidence !== 'number') return false;
  }
  // Synthetic must never be flagged authoritative.
  if (item.evidenceType === 'synthetic' && item.authority === 'authoritative') return false;
  // Unavailable must explain why.
  if (item.authority === 'unavailable' && !item.error) return false;
  return true;
}

export function authorityRank(a: EvidenceAuthority): number {
  return AUTHORITY_RANK[a];
}

export function makeAuthoritative(
  capability: string,
  sourceEngine: string,
  evidence: unknown,
  confidence: number,
  subjectIdentity: string | null,
): EvidenceItem {
  const ts = Date.now();
  return {
    capability,
    sourceEngine,
    evidence,
    timestamp: ts,
    confidence,
    authority: 'authoritative',
    evidenceType: 'authoritative',
    provenance: {
      source: sourceEngine,
      sourceEngine,
      capability,
      subjectIdentity,
      timestamp: ts,
      freshnessMs: 0,
      authority: 'authoritative',
      evidenceType: 'authoritative',
    },
  };
}

export function makeSynthetic(
  capability: string,
  sourceEngine: string,
  evidence: unknown,
  subjectIdentity: string | null,
  reason?: string,
): EvidenceItem {
  const ts = Date.now();
  return {
    capability,
    sourceEngine,
    evidence,
    timestamp: ts,
    confidence: null,
    authority: 'synthetic',
    evidenceType: 'synthetic',
    provenance: {
      source: sourceEngine,
      sourceEngine,
      capability,
      subjectIdentity,
      timestamp: ts,
      freshnessMs: 0,
      authority: 'synthetic',
      evidenceType: 'synthetic',
    },
    error: reason ? { code: 'SYNTHETIC', reason } : undefined,
  };
}

/** Explicit, honest "no authoritative source" result. Never promoted to authoritative. */
export function makeUnavailable(
  capability: string,
  sourceEngine: string,
  reason: string,
  subjectIdentity?: string | null,
): EvidenceItem {
  const ts = Date.now();
  return {
    capability,
    sourceEngine,
    evidence: null,
    timestamp: ts,
    confidence: null,
    authority: 'unavailable',
    evidenceType: 'unavailable',
    provenance: {
      source: sourceEngine,
      sourceEngine,
      capability,
      subjectIdentity: subjectIdentity ?? null,
      timestamp: ts,
      freshnessMs: 0,
      authority: 'unavailable',
      evidenceType: 'unavailable',
    },
    error: { code: 'UNAVAILABLE', reason },
  };
}

export interface ConflictResolution {
  winner: EvidenceItem | null;
  resolvedBy: string;
  conflictsVisible: boolean;
  note: string;
}

/**
 * Deterministic conflict resolution:
 *  - authoritative evidence outranks synthetic evidence
 *  - higher authority outranks lower authority
 *  - newer valid evidence may outrank stale evidence
 *  - conflicts remain visible in the metadata (never silently overridden)
 */
export function resolveConflicts(items: EvidenceItem[]): ConflictResolution {
  const auth = items.filter(isAuthoritative);
  const sorted = [...auth].sort((a, b) => {
    const rankDiff = authorityRank(b.authority) - authorityRank(a.authority);
    if (rankDiff !== 0) return rankDiff;
    return b.timestamp - a.timestamp; // newer wins within same authority
  });
  const winner = sorted[0] || null;
  const conflictsVisible = auth.length > 1;
  const note = conflictsVisible
    ? `Conflict: ${auth.length} authoritative sources; selected ${winner?.sourceEngine} (${winner?.capability}) over lower/older authority.`
    : 'No authoritative conflict.';
  return {
    winner,
    resolvedBy: winner
      ? `authority=${winner.authority}, source=${winner.sourceEngine}`
      : 'none',
    conflictsVisible,
    note,
  };
}
