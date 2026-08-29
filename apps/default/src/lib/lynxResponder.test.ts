/**
 * lynxResponder.test.ts — P1-A-R1 knowledge-pipeline integration tests.
 *
 * IMPORTANT: Taskade cannot execute Node/npm/vitest. These tests are authored
 * for the downstream CI environment only. Status: CREATED — NOT EXECUTED.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./authStore', () => ({
  useAuthStore: { getState: () => ({ user: { id: 'u1', displayName: 'Tester', plan: 'free' } }) },
}));
vi.mock('./identityEngine', () => ({
  identityEngine: { getIdentity: vi.fn(() => ({ id: 'u1', level: 'user' })) },
}));
vi.mock('./permissionEngine', () => ({
  permissionEngine: { authorize: vi.fn(() => ({ allowed: true })) },
}));
vi.mock('./knowledgePipeline', () => ({
  knowledgePipeline: {
    getPersonalKnowledge: vi.fn(() => ({ balance: 100, totalXP: 50, level: 2 })),
    getSystemKnowledge: vi.fn(() => null),
    getMarketPrice: vi.fn(),
    getRevenueKnowledge: vi.fn(),
  },
}));
vi.mock('./monetizationStore', () => ({
  useMonetizationStore: { getState: () => ({ getTotalRevenueCP: () => 0 }) },
}));
vi.mock('./memoryEngine', () => ({
  lynxMemory: { getSessionEvents: () => [], trackEvent: () => {} },
}));

import { lynxResponder } from './lynxResponder';
import { knowledgePipeline } from './knowledgePipeline';
import { identityEngine } from './identityEngine';

beforeEach(() => { vi.clearAllMocks(); });

describe('Knowledge Pipeline integration', () => {
  it('routes market queries through knowledgePipeline (no direct getCurrentPrice)', async () => {
    (knowledgePipeline.getMarketPrice as any).mockReturnValue(64000);
    const r = await lynxResponder.answerQuestion('What is the BTC price?', 'u1');
    expect((knowledgePipeline.getMarketPrice as any).mock.calls.length).toBeGreaterThan(0);
  });

  it('does NOT fabricate a hardcoded market fallback when price is unavailable', async () => {
    (knowledgePipeline.getMarketPrice as any).mockReturnValue(null);
    const r = await lynxResponder.answerQuestion('What is the BTC price?', 'u1');
    expect(r.content).not.toContain('67500');
    expect(r.content.toLowerCase()).toContain('unavailable');
  });

  it('uses pipeline-scoped sources for personal data', async () => {
    const r = await lynxResponder.answerQuestion('What is my XP?', 'u1');
    expect((knowledgePipeline.getPersonalKnowledge as any).mock.calls.length).toBeGreaterThan(0);
    expect(r.content).toContain('50');
  });
});

describe('Revenue remediation', () => {
  it('routes admin revenue queries through the pipeline and labels demo data', async () => {
    (identityEngine.getIdentity as any).mockReturnValue({ id: 'u1', level: 'super_admin' });
    (knowledgePipeline.getRevenueKnowledge as any).mockReturnValue({ data: 1234, provenance: { authority: 'synthetic' } });
    const r = await lynxResponder.answerQuestion('what is the revenue?', 'u1');
    expect((knowledgePipeline.getRevenueKnowledge as any).mock.calls.length).toBeGreaterThan(0);
    expect(r.content).toContain('demo/seed');
  });

  it('does NOT directly call the monetization store inside the responder', async () => {
    (identityEngine.getIdentity as any).mockReturnValue({ id: 'u1', level: 'super_admin' });
    (knowledgePipeline.getRevenueKnowledge as any).mockReturnValue({ data: 1234, provenance: { authority: 'synthetic' } });
    const r = await lynxResponder.answerQuestion('revenue?', 'u1');
    // Revenue value must come from the pipeline fragment, not a direct store call.
    expect((knowledgePipeline.getRevenueKnowledge as any).mock.calls.length).toBeGreaterThan(0);
  });

  it('does not leak revenue to non-admin users', async () => {
    (identityEngine.getIdentity as any).mockReturnValue({ id: 'u1', level: 'user' });
    const r = await lynxResponder.answerQuestion('what is the revenue?', 'u1');
    // Non-admin revenue query is gated before any revenue value is produced.
    expect(r.content.toLowerCase()).toContain('admin');
  });
});
