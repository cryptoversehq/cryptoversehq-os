/**
 * rollbackMetadata.ts — Rollback metadata for Self-Evolution production changes.
 *
 * Every deployed change retains enough metadata to revert safely:
 *   previous state/version, new state/version, rollback procedure,
 *   validation checks, rollback trigger, rollback status, and timestamps.
 *
 * Rollback metadata is associated with the originating change-control proposal.
 */

import { cloudRecordStore } from './cloudData';

export type RollbackStatus = 'pending' | 'available' | 'executed' | 'failed' | 'unavailable';

export interface RollbackMetadata {
  rollbackId: string;
  proposalId: string;
  affectedComponent: string;
  previousState: unknown;
  newState: unknown;
  rollbackProcedure: string;
  validationChecks: string[];
  rollbackTrigger: string;
  rollbackStatus: RollbackStatus;
  createdAt: number;
  executedAt: number | null;
}

export class RollbackRegistry {
  private metadata: Map<string, RollbackMetadata> = new Map();

  constructor() {
    this.hydrate();
  }

  create(input: {
    proposalId: string;
    affectedComponent: string;
    previousState: unknown;
    newState: unknown;
    rollbackProcedure: string;
    validationChecks: string[];
    rollbackTrigger: string;
  }): RollbackMetadata {
    // SECURITY NOTE: client-generated ID and timestamps — untrusted sequencing.
    // Server-generated IDs/timestamps (or server verification) are required in
    // production.
    const meta: RollbackMetadata = {
      rollbackId: this.newId('evo_rb'),
      proposalId: input.proposalId,
      affectedComponent: input.affectedComponent,
      previousState: input.previousState,
      newState: input.newState,
      rollbackProcedure: input.rollbackProcedure,
      validationChecks: input.validationChecks,
      rollbackTrigger: input.rollbackTrigger,
      rollbackStatus: 'available',
      createdAt: Date.now(),
      executedAt: null,
    };
    this.metadata.set(meta.rollbackId, meta);
    this.persist();
    return meta;
  }

  markExecuted(rollbackId: string): RollbackMetadata {
    const m = this.require(rollbackId);
    m.rollbackStatus = 'executed';
    m.executedAt = Date.now();
    this.persist();
    return m;
  }

  get(rollbackId: string): RollbackMetadata | undefined {
    return this.metadata.get(rollbackId);
  }

  getForProposal(proposalId: string): RollbackMetadata | undefined {
    return Array.from(this.metadata.values()).find(m => m.proposalId === proposalId);
  }

  /** Client-generated ID (untrusted sequencing). Prefer crypto.randomUUID() for
   *  lower guessability; server-side IDs are required in production. */
  private newId(prefix: string): string {
    let rnd: string;
    try {
      rnd = (crypto as any).randomUUID ? (crypto as any).randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
    } catch {
      rnd = Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
    }
    return `${prefix}_${rnd}`;
  }

  private require(id: string): RollbackMetadata {
    const m = this.metadata.get(id);
    if (!m) throw new Error(`[rollbackMetadata] Unknown rollback ${id}`);
    return m;
  }

  private persist(): void {
    try {
      Promise.resolve(cloudRecordStore.set('evolution', 'rollback', Array.from(this.metadata.values()))).catch(() => {});
    } catch {}
  }

  private hydrate(): void {
    try {
      const arr = cloudRecordStore.get<RollbackMetadata[]>('evolution', 'rollback', []);
      if (Array.isArray(arr)) for (const m of arr) this.metadata.set(m.rollbackId, m);
    } catch {}
  }
}

export const rollbackRegistry = new RollbackRegistry();
