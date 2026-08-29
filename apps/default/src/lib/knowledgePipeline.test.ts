/**
 * knowledgePipeline.test.ts
 *
 * IMPORTANT: Taskade cannot execute Node/npm/vitest. These tests are authored
 * for the downstream CI environment only. Status: CREATED — NOT EXECUTED.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./realDataConnector', () => ({
  realDataConnector: {
    getUserPersonalData: vi.fn(),
    getAppData: vi.fn(),
  },
}));
vi.mock('./globalPriceEngine', () => ({
  getCurrentPrice: vi.fn(),
}));
vi.mock('./identityEngine', () => ({
  identityEngine: { getIdentity: vi.fn() },
}));
vi.mock('./monetizationStore', () => ({
  useMonetizationStore: { getState: () => ({ getTotalRevenueCP: vi.fn(() => 1234) }) },
}));

import { knowledgePipeline } from './knowledgePipeline';
import { realDataConnector } from './realDataConnector';
import { getCurrentPrice } from './globalPriceEngine';
import { identityEngine } from './identityEngine';
import { useMonetizationStore } from './monetizationStore';

beforeEach(() => { vi.clearAllMocks(); });

describe('knowledgePipeline', () => {
  it('getPersonalKnowledge returns user-scoped data only for authenticated identity', () => {
    (identityEngine.getIdentity as any).mockReturnValue({ id: 'u1', level: 'user' });
    (realDataConnector.getUserPersonalData as any).mockReturnValue({ userId: 'u1', balance: 10 });
    const d = knowledgePipeline.getPersonalKnowledge('u1');
    expect(d).toEqual({ userId: 'u1', balance: 10 });
  });

  it('getPersonalKnowledge returns null when identity is missing (no fabrication)', () => {
    (identityEngine.getIdentity as any).mockReturnValue(null);
    const d = knowledgePipeline.getPersonalKnowledge('ghost');
    expect(d).toBeNull();
  });

  it('getMarketPrice returns the real price or null — NEVER a hardcoded fallback', () => {
    (getCurrentPrice as any).mockReturnValue({ price: 64000 });
    expect(knowledgePipeline.getMarketPrice('bitcoin')).toBe(64000);
    (getCurrentPrice as any).mockReturnValue(null);
    expect(knowledgePipeline.getMarketPrice('bitcoin')).toBeNull();
    (getCurrentPrice as any).mockImplementation(() => { throw new Error('down'); });
    expect(knowledgePipeline.getMarketPrice('bitcoin')).toBeNull();
  });

  it('getSystemKnowledge returns aggregate data or null', () => {
    (realDataConnector.getAppData as any).mockReturnValue({ users: { total: 5 } });
    expect(knowledgePipeline.getSystemKnowledge()).toEqual({ users: { total: 5 } });
    (realDataConnector.getAppData as any).mockImplementation(() => { throw new Error('x'); });
    expect(knowledgePipeline.getSystemKnowledge()).toBeNull();
  });

  it('getKnowledge(market) marks availability honestly', () => {
    (getCurrentPrice as any).mockReturnValue(null);
    const f = knowledgePipeline.getKnowledge('market', { coinId: 'bitcoin' });
    expect(f.available).toBe(false);
    expect(f.provenance.authority).toBe('unavailable');
  });

  it('getRevenueKnowledge returns SYNTHETIC for admin (demo/seed data) and never authoritative', () => {
    (identityEngine.getIdentity as any).mockReturnValue({ id: 'u1', level: 'super_admin' });
    (useMonetizationStore.getState as any).getTotalRevenueCP.mockReturnValue(1234);
    const f = knowledgePipeline.getRevenueKnowledge('u1');
    expect(f.data).toBe(1234);
    expect(f.provenance.authority).toBe('synthetic');
    expect(f.provenance.sourceType).toBe('simulated');
  });

  it('getRevenueKnowledge returns UNAVAILABLE for non-admin (no value leaked)', () => {
    (identityEngine.getIdentity as any).mockReturnValue({ id: 'u2', level: 'user' });
    const f = knowledgePipeline.getRevenueKnowledge('u2');
    expect(f.provenance.authority).toBe('unavailable');
    expect(f.data).toBeNull();
  });

  it('getRevenueKnowledge returns UNAVAILABLE on source failure', () => {
    (identityEngine.getIdentity as any).mockReturnValue({ id: 'u1', level: 'super_admin' });
    (useMonetizationStore.getState as any).getTotalRevenueCP.mockImplementation(() => { throw new Error('x'); });
    const f = knowledgePipeline.getRevenueKnowledge('u1');
    expect(f.provenance.authority).toBe('unavailable');
    expect(f.data).toBeNull();
  });
});
