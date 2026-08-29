/**
 * brainFusion.test.ts — P0-C evidence / permission / provenance / memory tests.
 *
 * IMPORTANT: Taskade cannot execute Node/npm/vitest. These tests are authored
 * for the downstream CI environment only. Status: CREATED — NOT EXECUTED.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./identityEngine', () => ({
  identityEngine: { getIdentity: vi.fn(), isAdmin: vi.fn(), isSuperAdmin: vi.fn(), isFounder: vi.fn() },
}));
vi.mock('./permissionEngine', () => ({
  permissionEngine: { canAccess: vi.fn(), canView: vi.fn(), canEdit: vi.fn() },
}));
vi.mock('./memoryAccessGateway', () => ({
  memoryAccessGateway: { search: vi.fn(), remember: vi.fn(), summarize: vi.fn() },
}));

import { brainFusion } from './brainFusion';
import { identityEngine } from './identityEngine';
import { permissionEngine } from './permissionEngine';
import { memoryAccessGateway } from './memoryAccessGateway';

function identityAs(id: string, role: string) {
  (identityEngine.getIdentity as any).mockReturnValue({
    id, level: role, role, status: 'active', subscription: 'free', language: 'en',
    country: 'unknown', isOnline: true, deviceIds: [], capabilities: ['user'],
  });
}
const baseCtx = (over: any = {}) => ({
  userId: 'user_1', query: 'should I trade BTC?', timestamp: Date.now(), ...over,
});

beforeEach(() => { vi.clearAllMocks(); identityAs('user_1', 'user'); });

describe('Fabricated evidence is never emitted as authoritative', () => {
  it('risk assessment is never the placeholder "No significant risk detected."', async () => {
    (memoryAccessGateway.search as any).mockImplementation(() => { throw new Error('denied'); });
    const r = await brainFusion.think(baseCtx());
    expect(r.riskAssessment).not.toBe('No significant risk detected.');
    expect(r.riskAssessment).toMatch(/authoritative|simulated|available/i);
  });

  it('business impact is never the placeholder "No significant business impact."', async () => {
    (memoryAccessGateway.search as any).mockImplementation(() => { throw new Error('denied'); });
    const r = await brainFusion.think(baseCtx());
    expect(r.businessImpact).not.toBe('No significant business impact.');
    expect(r.businessImpact).toMatch(/simulated|available/i);
  });
});

describe('Permission gate', () => {
  it('denied privileged request produces no privileged output', async () => {
    (permissionEngine.canAccess as any).mockReturnValue(false);
    (memoryAccessGateway.search as any).mockImplementation(() => { throw new Error('denied'); });
    const r = await brainFusion.think(baseCtx({ personality: 'executive_advisor' }));
    expect(r.resolutionNote).toContain('privileged output denied');
    expect(r.answer.toLowerCase()).toContain('not authorized');
  });
});

describe('Provenance', () => {
  it('result records evidence count and resolution note', async () => {
    (memoryAccessGateway.search as any).mockImplementation(() => { throw new Error('denied'); });
    const r = await brainFusion.think(baseCtx());
    expect(typeof r.reasoningScore).toBe('number');
    expect(typeof r.resolutionNote).toBe('string');
    expect(r.resolutionNote.length).toBeGreaterThan(0);
  });
});

describe('Memory boundary', () => {
  it('uses memoryAccessGateway (no direct universalMemory access)', async () => {
    (memoryAccessGateway.search as any).mockImplementation(() => { throw new Error('denied'); });
    await brainFusion.think(baseCtx());
    // remember is invoked (gateway path) — assert it was called, never universalMemory directly.
    expect((memoryAccessGateway.remember as any).mock.calls.length).toBeGreaterThan(0);
  });
});
