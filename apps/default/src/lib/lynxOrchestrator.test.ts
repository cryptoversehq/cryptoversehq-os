/**
 * lynxOrchestrator.test.ts — Deterministic tests for P0-B dependency-aware
 * orchestration. Uses lightweight fake engines (no real business logic, no
 * mock engines beyond the in-test stubs) so the assertions are hermetic.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { lynxOrchestrator, type EngineContract } from './lynxOrchestrator';

// Shared init/exec/shutdown recording order for assertions.
function makeEngine(name: string, priority: number, dependencies: string[], order: string[], opts: { failInit?: boolean } = {}) {
  const contract: EngineContract = {
    name,
    priority,
    dependencies,
    async initialize() {
      if (opts.failInit) throw new Error(`${name} init failed`);
      order.push(`init:${name}`);
    },
    async execute() {
      order.push(`exec:${name}`);
    },
    async shutdown() {
      order.push(`shutdown:${name}`);
    },
    health() {
      return { status: 'healthy', lifecycle: 'ready', lastRun: null, lastDuration: 0, errorCount: 0, totalRuns: 0, avgDuration: 0 };
    },
  };
  return contract;
}

beforeEach(async () => {
  // Reset singleton between tests (clears registry + timers + plan).
  await lynxOrchestrator.shutdown();
});

describe('dependency-aware execution', () => {
  it('1) executes dependency A before dependent B (priority is secondary)', async () => {
    const order: string[] = [];
    lynxOrchestrator.register(makeEngine('A', 50, [], order));     // high priority, no deps
    lynxOrchestrator.register(makeEngine('B', 1, ['A'], order));   // low priority, depends on A
    lynxOrchestrator.register(makeEngine('C', 1, ['B'], order));  // low priority, depends on B

    const results = await lynxOrchestrator.initializeAll();
    expect(results.every(r => r.ok)).toBe(true);

    // Initialization order must follow dependencies, not priority.
    expect(order).toEqual(['init:A', 'init:B', 'init:C']);

    const plan = lynxOrchestrator.analyzeDependencies();
    expect(plan.order.indexOf('A')).toBeLessThan(plan.order.indexOf('B'));
    expect(plan.order.indexOf('B')).toBeLessThan(plan.order.indexOf('C'));
  });

  it('2) a failed dependency blocks the dependent engine', async () => {
    const order: string[] = [];
    lynxOrchestrator.register(makeEngine('A', 1, [], order, { failInit: true }));
    lynxOrchestrator.register(makeEngine('B', 1, ['A'], order));

    const results = await lynxOrchestrator.initializeAll();
    expect(results.find(r => r.name === 'A')?.ok).toBe(false);
    expect(lynxOrchestrator.getEngineLifecycle('B')).toBe('failed');

    // Runtime execution: B must NOT run while its dependency is not ready.
    await lynxOrchestrator.execute({ id: 'e1', type: 'TEST', data: {}, timestamp: Date.now() });
    expect(order).not.toContain('init:B');
    expect(order).not.toContain('exec:B');
  });

  it('3) circular dependencies are rejected', () => {
    const order: string[] = [];
    lynxOrchestrator.register(makeEngine('A', 1, ['B'], order));
    lynxOrchestrator.register(makeEngine('B', 1, ['A'], order));

    const plan = lynxOrchestrator.analyzeDependencies();
    expect(plan.cycles.length).toBeGreaterThan(0);
    expect(Object.keys(plan.blocked).sort()).toEqual(['A', 'B']);
    expect(plan.blocked['A']).toMatch(/circular/);
    expect(plan.blocked['B']).toMatch(/circular/);
    // After init, the cycle participants must be visibly failed (not healthy).
    return lynxOrchestrator.initializeAll().then(() => {
      expect(lynxOrchestrator.getEngineLifecycle('A')).toBe('failed');
      expect(lynxOrchestrator.getEngineLifecycle('B')).toBe('failed');
    });
  });

  it('4) missing dependencies are detected', () => {
    const order: string[] = [];
    lynxOrchestrator.register(makeEngine('B', 1, ['GhostEngine'], order));

    const plan = lynxOrchestrator.analyzeDependencies();
    expect(plan.missingDeps).toContain('GhostEngine');
    expect(plan.blocked['B']).toMatch(/missing dependency/);
  });

  it('5) shutdown cleans up all recurring timers', async () => {
    const order: string[] = [];
    lynxOrchestrator.register(makeEngine('A', 1, [], order));
    await lynxOrchestrator.initializeAll();
    lynxOrchestrator.registerScheduler();

    const before = lynxOrchestrator.getSchedulerState();
    expect(before.heartbeat).toBe(true);
    expect(before.interval).toBe(true);

    await lynxOrchestrator.shutdown();

    const after = lynxOrchestrator.getSchedulerState();
    expect(after.heartbeat).toBe(false);
    expect(after.interval).toBe(false);
    expect(after.startupTimer).toBe(false);
  });

  it('6) no duplicate registrations and no duplicate timers on repeated init', async () => {
    const order: string[] = [];
    lynxOrchestrator.register(makeEngine('A', 1, [], order));
    lynxOrchestrator.register(makeEngine('A', 1, [], order)); // duplicate

    // First registration wins; duplicates are rejected, not overwritten.
    expect(lynxOrchestrator.listEngines().filter(e => e.name === 'A').length).toBe(1);

    await lynxOrchestrator.initializeAll();
    expect(lynxOrchestrator.getSchedulerState().heartbeat).toBe(true);

    await lynxOrchestrator.shutdown();
    // The constructor no longer starts a heartbeat, and initializeAll guards
    // against starting a second one, so re-initialization yields a single timer.
    await lynxOrchestrator.initializeAll();
    expect(lynxOrchestrator.getSchedulerState().heartbeat).toBe(true);

    await lynxOrchestrator.shutdown();
  });
});
