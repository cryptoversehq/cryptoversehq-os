/**
 * memoryAccessGateway.test.ts
 *
 * Deterministic security tests for the canonical memory access gateway.
 *
 * IMPORTANT: Taskade cannot execute Node/npm/vitest. These tests are authored
 * for the downstream CI environment only.
 *
 * Status: CREATED — NOT EXECUTED.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { memoryAccessGateway, MemoryAccessDeniedError } from './memoryAccessGateway';
import { identityEngine } from './identityEngine';
import { useAuthStore } from './authStore';
import { universalMemory } from './universalMemory';

const USER_A = 'user_a_123';
const USER_B = 'user_b_456';

function authAs(userId: string, role: string = 'user') {
  vi.spyOn(useAuthStore, 'getState').mockReturnValue({
    isAuthenticated: true,
    user: { id: userId, role, plan: 'free', language: 'en' },
  } as any);
}

function authAdmin(userId: string) {
  vi.spyOn(useAuthStore, 'getState').mockReturnValue({
    isAuthenticated: true,
    user: { id: userId, role: 'super_admin', plan: 'free', language: 'en' },
  } as any);
}

beforeEach(() => {
  vi.restoreAllMocks();
  try {
    universalMemory.forget(USER_A, 'coaching');
    universalMemory.forget(USER_B, 'coaching');
  } catch {}
  localStorage.clear();
});

describe('Cross-user isolation', () => {
  it('A cannot read B memory', () => {
    authAs(USER_A);
    expect(() => memoryAccessGateway.search(USER_A, USER_B, 'x')).toThrow(MemoryAccessDeniedError);
  });

  it('A cannot write B memory', () => {
    authAs(USER_A);
    expect(() => memoryAccessGateway.remember(USER_A, USER_B, 'coaching', { x: 1 })).toThrow(MemoryAccessDeniedError);
  });

  it('A cannot delete B memory', () => {
    authAs(USER_A);
    expect(() => memoryAccessGateway.delete(USER_A, USER_B, 'coaching')).toThrow(MemoryAccessDeniedError);
  });
});

describe('Identity validation', () => {
  it('invalid (missing) identity rejected', () => {
    authAs(USER_A);
    expect(() => memoryAccessGateway.remember('', USER_A, 'coaching', { x: 1 })).toThrow(MemoryAccessDeniedError);
  });

  it('email-based identity rejected', () => {
    authAs(USER_A);
    expect(() => memoryAccessGateway.remember('a@b.com', 'a@b.com', 'coaching', { x: 1 })).toThrow(MemoryAccessDeniedError);
  });

  it('anonymous identity rejected', () => {
    authAs(USER_A);
    expect(() => memoryAccessGateway.remember('anonymous', 'anonymous', 'coaching', { x: 1 })).toThrow(MemoryAccessDeniedError);
  });

  it('forged / mutated subject identity rejected (actor != subject)', () => {
    authAs(USER_A);
    expect(() => memoryAccessGateway.remember(USER_A, USER_B, 'coaching', { x: 1 })).toThrow(MemoryAccessDeniedError);
  });
});

describe('Expired / inactive identity', () => {
  it('inactive (banned/suspended/expired) identity rejected', () => {
    vi.spyOn(identityEngine, 'getIdentity').mockReturnValue({
      id: USER_A, level: 'user', role: 'user', status: 'banned',
      subscription: 'free', language: 'en', country: 'unknown',
      isOnline: false, deviceIds: [], capabilities: [],
    } as any);
    vi.spyOn(useAuthStore, 'getState').mockReturnValue({ isAuthenticated: true, user: { id: USER_A } } as any);
    expect(() => memoryAccessGateway.remember(USER_A, USER_A, 'coaching', { x: 1 })).toThrow(MemoryAccessDeniedError);
  });
});

describe('Authorized happy path (own memory)', () => {
  it('A can remember, search and delete own memory', () => {
    authAs(USER_A);
    const entry = memoryAccessGateway.remember(USER_A, USER_A, 'coaching', { x: 1 });
    expect(entry).toBeTruthy();
    const found = memoryAccessGateway.search(USER_A, USER_A, 'x');
    expect(found.length).toBeGreaterThan(0);
    expect(memoryAccessGateway.delete(USER_A, USER_A, entry!.id)).toBe(true);
  });

  it('system write requires admin identity', () => {
    authAs(USER_A); // normal user
    expect(() => memoryAccessGateway.rememberSystem(USER_A, 'daily_summary', { x: 1 })).toThrow(MemoryAccessDeniedError);
    authAdmin('admin_1');
    const sys = memoryAccessGateway.rememberSystem('admin_1', 'daily_summary', { x: 1 });
    expect(sys).toBeTruthy();
  });
});

describe('Gateway bypass detection', () => {
  it('direct universalMemory store write creates no gateway audit entry', () => {
    authAs(USER_A);
    const before = memoryAccessGateway.getAudit(1000).length;
    universalMemory.remember(USER_A, 'coaching', { leaked: true });
    const after = memoryAccessGateway.getAudit(1000).length;
    expect(after).toBe(before);
  });
});

describe('No localStorage fallback for private memory', () => {
  it('canonical store save does not persist private memory to localStorage', () => {
    authAs(USER_A);
    memoryAccessGateway.remember(USER_A, USER_A, 'coaching', { x: 1 });
    expect(localStorage.getItem(`universal_memory_${USER_A}`)).toBeNull();
  });
});
