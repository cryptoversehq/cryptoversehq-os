/**
 * capabilityRegistry.test.ts
 *
 * IMPORTANT: Taskade cannot execute Node/npm/vitest. These tests are authored
 * for the downstream CI environment only. Status: CREATED — NOT EXECUTED.
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
vi.mock('./permissionEngine', () => ({
  permissionEngine: { canAccess: vi.fn(), canView: vi.fn(), canEdit: vi.fn() },
}));

import { identityEngine } from './identityEngine';
import { permissionEngine } from './permissionEngine';
import { provideCapability, type CapabilityContext } from './capabilityRegistry';

function identityAs(id: string, role: string) {
  (identityEngine.getIdentity as any).mockReturnValue({
    id, level: role, role, status: 'active', subscription: 'free', language: 'en',
    country: 'unknown', isOnline: true, deviceIds: [], capabilities: ['user'],
  });
  (permissionEngine.canAccess as any).mockReturnValue(false);
}

const ctx: CapabilityContext = { userId: 'user_1', query: 'should I trade BTC?', subjectIdentity: null };

beforeEach(() => { vi.clearAllMocks(); });

describe('Capability evidence sources', () => {
  it('business.overview is synthetic (simulated), never authoritative', () => {
    const ev = provideCapability('business.overview', ctx);
    expect(ev.authority).not.toBe('authoritative');
    expect(['synthetic', 'unavailable']).toContain(ev.authority);
  });

  it('intent.understanding is synthetic (heuristic), never authoritative', () => {
    const ev = provideCapability('intent.understanding', ctx);
    expect(ev.authority).toBe('synthetic');
    expect((ev.evidence as any).intent).toBeDefined();
  });

  it('risk.assessment without a bot context is unavailable (no fabrication)', () => {
    const ev = provideCapability('risk.assessment', ctx);
    expect(ev.authority).toBe('unavailable');
    expect(ev.error?.code).toBe('UNAVAILABLE');
  });

  it('context.identity from a real identity is authoritative', () => {
    identityAs('user_1', 'user');
    const ev = provideCapability('context.identity', ctx);
    expect(ev.authority).toBe('authoritative');
    expect((ev.evidence as any).level).toBe('user');
  });

  it('permissions.authorization from a real identity is authoritative', () => {
    identityAs('user_1', 'user');
    const ev = provideCapability('permissions.authorization', ctx);
    expect(ev.authority).toBe('authoritative');
  });
});
