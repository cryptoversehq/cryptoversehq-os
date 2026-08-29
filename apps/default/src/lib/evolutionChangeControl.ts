/**
 * evolutionChangeControl.ts — Explicit change-control boundary for Self Evolution.
 *
 * Every Self-Evolution mutation MUST pass through this lifecycle:
 *   Proposal → Evaluation → Approval → Version → Deployment → Monitoring → Rollback
 *
 * A proposal is NEVER treated as an approved mutation. Approval is gated by the
 * canonical identity boundary (identityEngine). Client-only / localStorage state is
 * NEVER accepted as trusted production approval.
 */

import { identityEngine } from './identityEngine';
import { cloudRecordStore } from './cloudData';

export type ChangeLifecycleStatus =
  | 'proposed'
  | 'evaluating'
  | 'approved'
  | 'rejected'
  | 'deployed'
  | 'monitoring'
  | 'rolled_back';

export type RiskLevel = 'low' | 'medium' | 'high';

export interface EvolutionChangeProposal {
  proposalId: string;
  evidenceRef: string;
  affectedComponent: string;
  currentState: unknown;
  proposedState: unknown;
  riskAssessment: RiskLevel;
  expectedBenefit: string;
  evaluationResult: 'pending' | 'pass' | 'fail';
  approvalStatus: 'pending' | 'approved' | 'rejected';
  approvalIdentity: string | null;
  deploymentStatus: 'not_deployed' | 'deploying' | 'deployed' | 'failed';
  monitoringStatus: 'pending' | 'healthy' | 'degraded' | 'rolled_back';
  lifecycle: ChangeLifecycleStatus;
  createdAt: number;
  evaluatedAt: number | null;
  approvedAt: number | null;
  deployedAt: number | null;
  rollbackMetadataId: string | null;
}

// Protected production components. Mutations to these MUST be routed through the
// trusted canonical governance boundary (admin/founder). Client-only approval is insufficient.
export const PROTECTED_COMPONENTS: string[] = [
  'permissions',
  'business_logic',
  'agent_tools',
  'production_prompts',
  'model_configuration',
  'routing_policies',
  'schemas',
  'external_integrations',
];

export function isProtectedComponent(component: string): boolean {
  const c = (component || '').toLowerCase();
  return PROTECTED_COMPONENTS.some(p => c === p || c.startsWith(p) || c.includes(p.replace(/_/g, ' ')) || c.includes(p));
}

export class EvolutionChangeControl {
  private proposals: Map<string, EvolutionChangeProposal> = new Map();

  constructor() {
    this.hydrate();
  }

  createProposal(input: {
    evidenceRef: string;
    affectedComponent: string;
    currentState: unknown;
    proposedState: unknown;
    riskAssessment: RiskLevel;
    expectedBenefit: string;
  }): EvolutionChangeProposal {
    const proposal: EvolutionChangeProposal = {
      // SECURITY NOTE: this ID and all timestamps below are CLIENT-GENERATED and
      // therefore untrusted sequencing/tamper-resistance metadata. For production,
      // replace with server-generated IDs + timestamps (or server verification).
      proposalId: this.newId('evo_prop'),
      evidenceRef: input.evidenceRef,
      affectedComponent: input.affectedComponent,
      currentState: input.currentState,
      proposedState: input.proposedState,
      riskAssessment: input.riskAssessment,
      expectedBenefit: input.expectedBenefit,
      evaluationResult: 'pending',
      approvalStatus: 'pending',
      approvalIdentity: null,
      deploymentStatus: 'not_deployed',
      monitoringStatus: 'pending',
      lifecycle: 'proposed',
      createdAt: Date.now(),
      evaluatedAt: null,
      approvedAt: null,
      deployedAt: null,
      rollbackMetadataId: null,
    };
    this.proposals.set(proposal.proposalId, proposal);
    this.persist();
    return proposal;
  }

  evaluate(proposalId: string, result: 'pass' | 'fail'): EvolutionChangeProposal {
    const p = this.require(proposalId);
    p.evaluationResult = result;
    p.evaluatedAt = Date.now();
    p.lifecycle = result === 'pass' ? 'evaluating' : 'rejected';
    this.persist();
    return p;
  }

  /**
   * Approve a proposal. Approval is gated by the canonical identity boundary.
   * localStorage / client-only state is NEVER accepted as trusted approval — the
   * approver identity is validated live against identityEngine.
   */
  approve(proposalId: string, actorId: string): EvolutionChangeProposal {
    const p = this.require(proposalId);
    const actor = identityEngine.getIdentity(actorId);
    if (!actor || actor.status !== 'active') {
      throw new Error(`[evolutionChangeControl] Approval denied: invalid/inactive approver identity ${actorId}`);
    }
    // Protected components require the trusted governance boundary (admin/founder).
    const requiresAdmin = isProtectedComponent(p.affectedComponent);
    if (requiresAdmin && !identityEngine.isAdmin(actorId)) {
      throw new Error(`[evolutionChangeControl] Approval denied: ${p.affectedComponent} is protected and requires admin/founder approval`);
    }
    if (p.evaluationResult !== 'pass') {
      throw new Error(`[evolutionChangeControl] Cannot approve ${proposalId}: evaluation not passed`);
    }
    p.approvalStatus = 'approved';
    p.approvalIdentity = actor.id;
    p.approvedAt = Date.now();
    p.lifecycle = 'approved';
    this.persist();
    return p;
  }

  reject(proposalId: string, actorId: string): EvolutionChangeProposal {
    const p = this.require(proposalId);
    p.approvalStatus = 'rejected';
    p.approvalIdentity = actorId;
    p.lifecycle = 'rejected';
    this.persist();
    return p;
  }

  /** Mark deployed + monitoring. MUST only follow an explicit approval. */
  markDeployed(proposalId: string, rollbackMetadataId: string): EvolutionChangeProposal {
    const p = this.require(proposalId);
    if (p.approvalStatus !== 'approved') {
      throw new Error(`[evolutionChangeControl] Cannot deploy unapproved proposal ${proposalId}`);
    }
    p.deploymentStatus = 'deployed';
    p.deployedAt = Date.now();
    p.monitoringStatus = 'healthy';
    p.rollbackMetadataId = rollbackMetadataId;
    p.lifecycle = 'monitoring';
    this.persist();
    return p;
  }

  attachRollback(proposalId: string, rollbackMetadataId: string): void {
    const p = this.require(proposalId);
    p.rollbackMetadataId = rollbackMetadataId;
    this.persist();
  }

  getProposal(proposalId: string): EvolutionChangeProposal | undefined {
    return this.proposals.get(proposalId);
  }

  listProposals(): EvolutionChangeProposal[] {
    return Array.from(this.proposals.values());
  }

  /** Proposals evaluated as pass and awaiting approval. */
  pendingApproval(): EvolutionChangeProposal[] {
    return this.listProposals().filter(p => p.evaluationResult === 'pass' && p.approvalStatus === 'pending');
  }

  /** Proposals approved and not yet deployed — the only deployable set. */
  approved(): EvolutionChangeProposal[] {
    return this.listProposals().filter(p => p.approvalStatus === 'approved' && p.deploymentStatus === 'not_deployed');
  }

  /** Client-generated ID (untrusted sequencing) — server-side IDs are required
   *  in production. Uses crypto.randomUUID() when available for lower
   *  guessability, falling back to a time+random token. */
  private newId(prefix: string): string {
    let rnd: string;
    try {
      rnd = (crypto as any).randomUUID ? (crypto as any).randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
    } catch {
      rnd = Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
    }
    return `${prefix}_${rnd}`;
  }

  private require(id: string): EvolutionChangeProposal {
    const p = this.proposals.get(id);
    if (!p) throw new Error(`[evolutionChangeControl] Unknown proposal ${id}`);
    return p;
  }

  private persist(): void {
    try {
      const arr = this.listProposals();
      Promise.resolve(cloudRecordStore.set('evolution', 'change_control', arr)).catch(() => {});
    } catch {}
  }

  private hydrate(): void {
    try {
      const arr = cloudRecordStore.get<EvolutionChangeProposal[]>('evolution', 'change_control', []);
      if (Array.isArray(arr)) for (const p of arr) this.proposals.set(p.proposalId, p);
    } catch {}
  }
}

export const evolutionChangeControl = new EvolutionChangeControl();
