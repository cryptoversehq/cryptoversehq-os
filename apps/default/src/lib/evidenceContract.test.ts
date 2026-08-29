/**
 * evidenceContract.test.ts
 *
 * IMPORTANT: Taskade cannot execute Node/npm/vitest. These tests are authored
 * for the downstream CI environment only. Status: CREATED — NOT EXECUTED.
 */

import { describe, it, expect } from 'vitest';
import {
  validateEvidence, isAuthoritative, makeAuthoritative, makeSynthetic, makeUnavailable, type EvidenceItem,
} from './evidenceContract';

describe('EvidenceContract validation', () => {
  it('accepts a well-formed authoritative item', () => {
    const e = makeAuthoritative('memory.retrieval', 'memoryAccessGateway', { x: 1 }, 80, 'user_1');
    expect(validateEvidence(e)).toBe(true);
    expect(isAuthoritative(e)).toBe(true);
  });

  it('rejects malformed evidence (missing timestamp)', () => {
    const bad = { capability: 'x', sourceEngine: 'y', authority: 'authoritative', evidenceType: 'authoritative' } as unknown as EvidenceItem;
    expect(validateEvidence(bad)).toBe(false);
  });

  it('unavailable carries an error and is not authoritative', () => {
    const u = makeUnavailable('risk.assessment', 'riskManager', 'no source', 'user_1');
    expect(u.authority).toBe('unavailable');
    expect(u.error?.code).toBe('UNAVAILABLE');
    expect(validateEvidence(u)).toBe(true);
    expect(isAuthoritative(u)).toBe(false);
  });

  it('synthetic is explicitly typed and never authoritative', () => {
    const s = makeSynthetic('intent.understanding', 'brainFusion.intent', { intent: 'general' }, 'user_1', 'heuristic');
    expect(s.authority).toBe('synthetic');
    expect(validateEvidence(s)).toBe(true);
    expect(isAuthoritative(s)).toBe(false);
  });

  it('synthetic flagged authoritative is rejected', () => {
    const fake = makeSynthetic('intent.understanding', 'brainFusion.intent', { intent: 'general' }, 'user_1');
    fake.authority = 'authoritative';
    expect(validateEvidence(fake)).toBe(false);
  });

  it('authoritative without numeric confidence is rejected', () => {
    const e = makeAuthoritative('x', 'y', { a: 1 }, 80, 'u');
    e.confidence = null as any;
    expect(validateEvidence(e)).toBe(false);
  });
});
