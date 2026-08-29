/**
 * evolutionChangeControl.test.ts
 *
 * Deterministic tests for the Self-Evolution change-control + rollback lifecycle.
 *
 * IMPORTANT: Taskade cannot execute Node/npm/vitest. These tests are authored
 * for the downstream CI environment only.
 *
 * Status: CREATED — NOT EXECUTED.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./identityEngine', () => ({
  identityEngine: {
    getIdentity: vi.fn(),
    isAdmin: vi.fn(),
    isSuperAdmin: vi.fn(),
    isFounder: vi.fn(),
  },
}));

vi.mock('./cloudData', () => ({
  cloudRecordStore: {
    get: vi.fn(() => []),
    set: vi.fn(() => Promise.resolve()),
  },
}));

import { evolutionChangeControl } from './evolutionChangeControl';
import { rollbackRegistry } from './rollbackMetadata';
import { identityEngine } from './identityEngine';

const ADMIN = 'admin_1';
const USER = 'user_1';

function identityAs(id: string, role: string) {
  (identityEngine.getIdentity as any).mockReturnValue({
    id, level: role, role, status: 'active', subscription: 'free', language: 'en',
    country: 'unknown', isOnline: true, deviceIds: [], capabilities: [],
  });
  (identityEngine.isAdmin as any).mockReturnValue(
    role === 'super_admin' || role === 'senior_admin' || role === 'admin' || role === 'founder',
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  identityAs(USER, 'user');
});

describe('Proposal required before mutation', () => {
  it('createProposal yields a pending, unapproved, undeployed proposal', () => {
    const p = evolutionChangeControl.createProposal({
      evidenceRef: 'snap_1', affectedComponent: 'coachEngine.style',
      currentState: 'a', proposedState: 'b', riskAssessment: 'low', expectedBenefit: 'better',
    });
    expect(p.approvalStatus).toBe('pending');
    expect(p.deploymentStatus).toBe('not_deployed');
    expect(p.lifecycle).toBe('proposed');
  });
});

describe('Approval required', () => {
  it('unapproved proposal cannot be deployed', () => {
    const p = evolutionChangeControl.createProposal({
      evidenceRef: 'snap_1', affectedComponent: 'coachEngine.style',
      currentState: 'a', proposedState: 'b', riskAssessment: 'low', expectedBenefit: 'better',
    });
    evolutionChangeControl.evaluate(p.proposalId, 'pass');
    expect(evolutionChangeControl.approved().map(x => x.proposalId)).not.toContain(p.proposalId);
    expect(() => evolutionChangeControl.markDeployed(p.proposalId, 'rb_x')).toThrow();
  });

  it('approve requires a valid active identity (no client-only approval)', () => {
    const p = evolutionChangeControl.createProposal({
      evidenceRef: 'snap_1', affectedComponent: 'coachEngine.style',
      currentState: 'a', proposedState: 'b', riskAssessment: 'low', expectedBenefit: 'better',
    });
    evolutionChangeControl.evaluate(p.proposalId, 'pass');
    (identityEngine.getIdentity as any).mockReturnValue(null);
    expect(() => evolutionChangeControl.approve(p.proposalId, USER)).toThrow();
  });
});

describe('Protected component rejected', () => {
  it('protected component cannot be approved by a non-admin', () => {
    const p = evolutionChangeControl.createProposal({
      evidenceRef: 'snap_1', affectedComponent: 'permissions.role',
      currentState: 'a', proposedState: 'b', riskAssessment: 'high', expectedBenefit: 'x',
    });
    evolutionChangeControl.evaluate(p.proposalId, 'pass');
    identityAs(USER, 'user');
    expect(() => evolutionChangeControl.approve(p.proposalId, USER)).toThrow();
    identityAs(ADMIN, 'super_admin');
    expect(() => evolutionChangeControl.approve(p.proposalId, ADMIN)).not.toThrow();
    expect(evolutionChangeControl.getProposal(p.proposalId)!.approvalIdentity).toBe(ADMIN);
  });
});

describe('Rollback metadata required + previous version preserved', () => {
  it('deployed proposal carries rollback metadata with previous state', () => {
    identityAs(ADMIN, 'super_admin');
    const p = evolutionChangeControl.createProposal({
      evidenceRef: 'snap_1', affectedComponent: 'coachEngine.style',
      currentState: { mode: 'friendly' }, proposedState: { mode: 'strict' }, riskAssessment: 'low', expectedBenefit: 'x',
    });
    evolutionChangeControl.evaluate(p.proposalId, 'pass');
    evolutionChangeControl.approve(p.proposalId, ADMIN);
    const rb = rollbackRegistry.create({
      proposalId: p.proposalId, affectedComponent: p.affectedComponent,
      previousState: p.currentState, newState: p.proposedState,
      rollbackProcedure: 'revert', validationChecks: ['a'], rollbackTrigger: 'deg',
    });
    evolutionChangeControl.markDeployed(p.proposalId, rb.rollbackId);
    expect(p.rollbackMetadataId).toBe(rb.rollbackId);
    expect(rb.previousState).toEqual({ mode: 'friendly' });
  });
});

describe('Unapproved proposal cannot deploy (markDeployed guard)', () => {
  it('markDeployed throws for a proposal that was never approved', () => {
    const p = evolutionChangeControl.createProposal({
      evidenceRef: 'snap_1', affectedComponent: 'coachEngine.style',
      currentState: 'a', proposedState: 'b', riskAssessment: 'low', expectedBenefit: 'x',
    });
    evolutionChangeControl.evaluate(p.proposalId, 'pass');
    expect(() => evolutionChangeControl.markDeployed(p.proposalId, 'rb_x')).toThrow();
  });
});

describe('Rollback state represented correctly', () => {
  it('rollback metadata transitions to executed and preserves previous state', () => {
    identityAs(ADMIN, 'super_admin');
    const p = evolutionChangeControl.createProposal({
      evidenceRef: 'snap_1', affectedComponent: 'coachEngine.style',
      currentState: 'old', proposedState: 'new', riskAssessment: 'low', expectedBenefit: 'x',
    });
    evolutionChangeControl.evaluate(p.proposalId, 'pass');
    evolutionChangeControl.approve(p.proposalId, ADMIN);
    const rb = rollbackRegistry.create({
      proposalId: p.proposalId, affectedComponent: p.affectedComponent,
      previousState: 'old', newState: 'new', rollbackProcedure: 'revert', validationChecks: ['a'], rollbackTrigger: 'deg',
    });
    evolutionChangeControl.markDeployed(p.proposalId, rb.rollbackId);
    expect(rb.rollbackStatus).toBe('available');
    expect(rb.previousState).toBe('old');
    rollbackRegistry.markExecuted(rb.rollbackId);
    expect(rollbackRegistry.get(rb.rollbackId)!.rollbackStatus).toBe('executed');
  });
});
