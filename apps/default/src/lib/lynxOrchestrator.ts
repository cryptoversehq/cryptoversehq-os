/**
 * lynxOrchestrator.ts — Lynx AI Orchestrator (LAOS v4.1)
 * The ONE coordinator between ALL Lynx engines.
 * No engine may call another engine directly. Everything goes through here.
 * Does NOT modify any business logic (trading, academy, portfolio, wallet).
 */

import type { OrchestratorContext } from './lynxTypes';

// Types
export type EngineStatus = 'idle' | 'initializing' | 'running' | 'completed' | 'failed' | 'timed_out' | 'cancelled' | 'skipped';
// Explicit per-engine lifecycle states (distinct from transient execution status).
export type EngineLifecycleState =
  | 'registered'
  | 'initializing'
  | 'ready'
  | 'degraded'
  | 'failed'
  | 'shutting_down'
  | 'stopped';
export interface EngineHealth {
  status: 'healthy' | 'degraded' | 'down';
  lifecycle: EngineLifecycleState;
  lastRun: number | null;
  lastDuration: number;
  errorCount: number;
  totalRuns: number;
  avgDuration: number;
  initialized?: boolean;
  recoverable?: boolean;
  shutdownCapable?: boolean;
  version?: string;
  recoveryCount?: number;
  blockedReason?: string;
}
// Result of the dependency analysis: a deterministic execution plan plus any
// issues detected (missing deps, cycles, duplicates). Surfaced for observability.
export interface DependencyPlan {
  order: string[];          // runnable engines in dependency order (deps before dependents; ties by priority)
  blocked: Record<string, string>; // engine name -> blocking reason
  missingDeps: string[];    // dependency names referenced but never registered
  cycles: string[][];       // detected circular dependency groups
  duplicates: string[];     // engines registered more than once
}
export interface ExecutionTrace { engineName: string; startedAt: number; completedAt: number | null; duration: number; status: EngineStatus; error?: string; retries: number; }
export interface EngineContract { name: string; priority: number; dependencies: string[]; initialize(): Promise<void>; execute(context: OrchestratorContext): Promise<void>; shutdown(): Promise<void>; health(): EngineHealth; }
// OrchestratorContext is defined in ./lynxTypes and imported above.
export interface PipelineEvent { id: string; type: string; data: Record<string, any>; timestamp: number; cancellationToken?: CancellationToken; }
export interface CancellationToken { cancelled: boolean; reason?: string; cancel(reason: string): void; }
export interface RetryPolicy { maxRetries: number; backoffMs: number; backoffMultiplier: number; }
export interface PerformanceMetrics { totalExecutions: number; totalFailures: number; avgPipelineMs: number; lastPipelineMs: number; traces: ExecutionTrace[]; engineHealth: Record<string, EngineHealth>; uptime: number; }

function createCancellationToken(): CancellationToken { return { cancelled: false, cancel(reason: string) { this.cancelled = true; this.reason = reason; } }; }
function now(): number { return Date.now(); }

class LynxOrchestrator {
  private engines: Map<string, EngineContract> = new Map();
  private eventQueue: PipelineEvent[] = [];
  private runningQueue: Set<string> = new Set();
  private pendingQueue: string[] = [];
  private metrics: PerformanceMetrics = { totalExecutions: 0, totalFailures: 0, avgPipelineMs: 0, lastPipelineMs: 0, traces: [], engineHealth: {}, uptime: 0 };
  private startTime = now();
  private isRunning = false;
  private paused = false;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private schedulerHandles: { interval: ReturnType<typeof setInterval> | null; startup: ReturnType<typeof setTimeout> | null } = { interval: null, startup: null };
  private scheduledTasks = new Map<string, { intervalMs: number; nextRun: number; callback: () => void | Promise<void> }>();
  private defaultRetryPolicy: RetryPolicy = { maxRetries: 2, backoffMs: 500, backoffMultiplier: 2 };
  private defaultTimeoutMs = 15000;
  // Dependency analysis cache (recomputed on register / after init / on shutdown).
  private plan: DependencyPlan | null = null;
  private duplicates: string[] = [];
  // Timer safety: recurring timers may only start once the orchestrator is
  // properly initialized (see initializeAll). The constructor must NOT start any.
  private isInitialized = false;

  constructor() {
    // Intentionally empty: no heartbeat/scheduler is started until initializeAll().
  }

  registerScheduledTask(name: string, intervalMs: number, callback: () => void | Promise<void>): void {
    this.scheduledTasks.set(name, { intervalMs, nextRun: now() + intervalMs, callback });
  }

  releaseScheduledTask(name: string): void { this.scheduledTasks.delete(name); }

  registerScheduler(startupDelayMs = 5000, intervalMs = 60000): void {
    this.releaseScheduler();
    this.schedulerHandles.startup = setTimeout(() => {
      void this.execute({ id: 'pipeline_boot_' + now(), type: 'STARTUP', data: { page: '/bootstrap', userId: 'system' }, timestamp: now() });
    }, startupDelayMs);
    this.schedulerHandles.interval = setInterval(() => {
      const timestamp = now();
      this.enqueue({ id: 'pipeline_sched_' + timestamp, type: 'SCHEDULED', data: { page: '/scheduler', userId: 'system' }, timestamp });
      for (const task of this.scheduledTasks.values()) {
        if (timestamp >= task.nextRun) {
          task.nextRun = timestamp + task.intervalMs;
          void task.callback();
        }
      }
      void this.processQueue();
    }, intervalMs);
  }

  releaseScheduler(): void {
    if (this.schedulerHandles.startup) { clearTimeout(this.schedulerHandles.startup); this.schedulerHandles.startup = null; }
    if (this.schedulerHandles.interval) { clearInterval(this.schedulerHandles.interval); this.schedulerHandles.interval = null; }
    this.scheduledTasks.clear();
  }

  getSchedulerState(): { heartbeat: boolean; startupTimer: boolean; interval: boolean } {
    return { heartbeat: this.heartbeatInterval !== null, startupTimer: this.schedulerHandles.startup !== null, interval: this.schedulerHandles.interval !== null };
  }

  register(engine: EngineContract): void {
    if (this.engines.has(engine.name)) {
      // No duplicate engine registrations: keep the first instance, record the
      // duplicate, and refuse to overwrite so identity/state stay single-source.
      this.duplicates.push(engine.name);
      console.error('[Orchestrator] Duplicate registration rejected:', engine.name);
      this.plan = null;
      return;
    }
    this.engines.set(engine.name, engine);
    this.metrics.engineHealth[engine.name] = {
      status: 'healthy', lifecycle: 'registered', lastRun: null, lastDuration: 0,
      errorCount: 0, totalRuns: 0, avgDuration: 0, initialized: false,
      recoverable: true, shutdownCapable: true, version: '1.0.0', recoveryCount: 0,
    };
    this.plan = null; // force re-analysis
  }

  /** Current lifecycle state of an engine (defaults to 'registered'). */
  getEngineLifecycle(name: string): EngineLifecycleState {
    return this.metrics.engineHealth[name]?.lifecycle ?? 'registered';
  }

  private setEngineLifecycle(name: string, state: EngineLifecycleState, blockedReason?: string): void {
    const h = this.metrics.engineHealth[name];
    if (!h) return;
    h.lifecycle = state;
    if (blockedReason) h.blockedReason = blockedReason;
  }

  getEngine(name: string): EngineContract | undefined { return this.engines.get(name); }
  listEngines(): EngineContract[] { return [...this.engines.values()].sort((a, b) => a.priority - b.priority); }

  /**
   * Build a deterministic dependency execution plan.
   * - Rejects engines whose dependencies are missing or part of a cycle.
   * - Orders the remaining engines so every dependency runs before its dependents
   *   (Kahn's algorithm; ties broken by the existing `priority` value, which is
   *   kept as a SECONDARY scheduling signal, never a replacement for constraints).
   * Returns the plan plus detected issues for observability.
   */
  analyzeDependencies(): DependencyPlan {
    if (this.plan) return this.plan;
    const names = new Set(this.engines.keys());
    const missingDeps = new Set<string>();
    const edges = new Map<string, string[]>();   // dep -> [dependents]
    const depsOf = new Map<string, string[]>();   // engine -> [deps]
    for (const engine of this.engines.values()) {
      const deps = engine.dependencies ?? [];
      depsOf.set(engine.name, deps);
      for (const d of deps) {
        if (!names.has(d)) { missingDeps.add(d); continue; }
        if (!edges.has(d)) edges.set(d, []);
        edges.get(d)!.push(engine.name);
      }
    }

    // Cycle detection (DFS, white/gray/black coloring).
    const color = new Map<string, 0 | 1 | 2>();
    const cycles: string[][] = [];
    const visit = (n: string, stack: string[]): void => {
      color.set(n, 1);
      stack.push(n);
      for (const m of edges.get(n) ?? []) {
        if (color.get(m) === 1) {
          const idx = stack.indexOf(m);
          cycles.push(stack.slice(idx));
        } else if (!color.get(m)) {
          visit(m, stack);
        }
      }
      stack.pop();
      color.set(n, 2);
    };
    for (const n of names) if (!color.get(n)) visit(n, []);

    const inCycle = new Set<string>();
    for (const c of cycles) for (const n of c) inCycle.add(n);

    // blocked = engines that reference a missing dep or a cycle participant.
    const blocked: Record<string, string> = {};
    for (const engine of this.engines.values()) {
      const missing = (depsOf.get(engine.name) ?? []).filter(d => !names.has(d));
      if (missing.length) { blocked[engine.name] = `missing dependency: ${missing.join(', ')}`; continue; }
      if ((depsOf.get(engine.name) ?? []).some(d => inCycle.has(d))) {
        blocked[engine.name] = 'circular dependency';
      }
    }

    // Kahn's algorithm over engines with no unresolved (registered, non-cycle) deps.
    const indegree = new Map<string, number>();
    for (const name of names) {
      indegree.set(name, (depsOf.get(name) ?? []).filter(d => names.has(d) && !inCycle.has(d)).length);
    }
    // Ready queue sorted by priority (secondary scheduling signal).
    const ready = [...names]
      .filter(n => (indegree.get(n) ?? 0) === 0 && !blocked[n])
      .sort((a, b) => this.engines.get(a)!.priority - this.engines.get(b)!.priority);
    const order: string[] = [];
    while (ready.length) {
      const n = ready.shift()!;
      order.push(n);
      for (const m of edges.get(n) ?? []) {
        if (blocked[m]) continue;
        const d = (indegree.get(m) ?? 0) - 1;
        indegree.set(m, d);
        if (d === 0) {
          const p = this.engines.get(m)!.priority;
          let i = 0;
          while (i < ready.length && this.engines.get(ready[i])!.priority <= p) i++;
          ready.splice(i, 0, m);
        }
      }
    }
    // Any engine not ordered is blocked (transitively depends on a blocked one).
    for (const name of names) {
      if (!order.includes(name) && !blocked[name]) blocked[name] = 'dependency not satisfiable';
    }

    this.plan = { order, blocked, missingDeps: [...missingDeps], cycles, duplicates: [...this.duplicates] };
    return this.plan;
  }

  async initializeAll(): Promise<{ name: string; ok: boolean; error?: string }[]> {
    const plan = this.analyzeDependencies();
    const results: { name: string; ok: boolean; error?: string }[] = [];

    // 1) Engines with unsatisfiable dependencies are marked failed up front.
    for (const [name, reason] of Object.entries(plan.blocked)) {
      this.setEngineLifecycle(name, 'failed', reason);
      const h = this.metrics.engineHealth[name];
      if (h) h.status = 'down';
      results.push({ name, ok: false, error: reason });
      console.error('[Orchestrator] engine blocked during init:', name, '→', reason);
    }
    if (plan.cycles.length) console.error('[Orchestrator] circular dependencies detected:', plan.cycles);
    if (plan.missingDeps.length) console.error('[Orchestrator] missing dependencies:', plan.missingDeps);

    // 2) Initialize in dependency order; a dependent is skipped if any required
    //    dependency is not 'ready' (so a failed dependency blocks it).
    for (const name of plan.order) {
      const engine = this.engines.get(name)!;
      const failedDep = (engine.dependencies ?? []).find(d => this.getEngineLifecycle(d) !== 'ready');
      if (failedDep) {
        const reason = `dependency not ready: ${failedDep} (${this.getEngineLifecycle(failedDep)})`;
        this.setEngineLifecycle(name, 'failed', reason);
        const h = this.metrics.engineHealth[name];
        if (h) h.status = 'down';
        results.push({ name, ok: false, error: reason });
        console.error('[Orchestrator] engine blocked by dependency:', name, '→', reason);
        continue;
      }
      this.setEngineLifecycle(name, 'initializing');
      try {
        await this.executeWithTimeout(engine.initialize(), 30000);
        this.setEngineLifecycle(name, 'ready');
        const health = this.metrics.engineHealth[name];
        if (health) health.initialized = true;
        results.push({ name, ok: true });
      } catch (err: any) {
        this.setEngineLifecycle(name, 'failed', err?.message || 'init failed');
        const health = this.metrics.engineHealth[name];
        if (health) health.status = 'degraded';
        results.push({ name, ok: false, error: err?.message || 'Unknown error' });
        console.error('[Orchestrator] engine init failed:', name, '→', err?.message);
      }
    }

    // 3) Timer safety: only start recurring timers AFTER the orchestrator is
    //    properly initialized (heartbeat). The scheduler is started by the
    //    bootstrap once init completes.
    this.isInitialized = true;
    if (!this.heartbeatInterval) this.startHeartbeat();

    return results;
  }

  async executeRequest(question: string, userId: string): Promise<unknown> {
    const { runLynxPipelineInternal } = await import('./lynxPipeline');
    return runLynxPipelineInternal(question, userId);
  }

  async execute(event: PipelineEvent): Promise<ExecutionTrace[]> {
    if (this.paused) return [];
    const pipelineStart = now();
    const traces: ExecutionTrace[] = [];
    const token = event.cancellationToken || createCancellationToken();
    this.isRunning = true;

    const context: OrchestratorContext = { timestamp: event.timestamp, event: { type: event.type, ...event.data }, page: event.data?.page, userId: event.data?.userId, role: event.data?.role, snapshot: {} };

    // Dependency-aware ordering: dependencies execute before dependents so an
    // engine never runs before its required dependencies are ready.
    const plan = this.plan ?? this.analyzeDependencies();
    const pipelineNames = plan.order.length ? plan.order : this.listEngines().map(e => e.name);

    for (const engineName of pipelineNames) {
      const registeredEngine = this.engines.get(engineName);
      if (!registeredEngine) continue;
      if (token.cancelled) { traces.push({ engineName, startedAt: now(), completedAt: now(), duration: 0, status: 'cancelled', retries: 0 }); continue; }

      // Block execution until every required dependency is 'ready'. A failed or
      // missing dependency must NOT silently appear healthy — the engine is
      // skipped and visibly degraded instead.
      const failedDep = (registeredEngine.dependencies ?? []).find(d => this.getEngineLifecycle(d) !== 'ready');
      if (failedDep) {
        const reason = `blocked: dependency ${failedDep} lifecycle=${this.getEngineLifecycle(failedDep)}`;
        console.warn('[Orchestrator] skip', engineName, '—', reason);
        this.updateHealth(registeredEngine.name, 'degraded');
        if (this.getEngineLifecycle(engineName) === 'ready') this.setEngineLifecycle(engineName, 'degraded', reason);
        traces.push({ engineName, startedAt: now(), completedAt: now(), duration: 0, status: 'skipped', retries: 0, error: reason });
        context.snapshot[engineName] = { status: 'skipped', duration: 0, error: reason };
        continue;
      }

      const trace = await this.executeEngine(registeredEngine, context, this.defaultRetryPolicy, this.defaultTimeoutMs, token);
      traces.push(trace);
      context.snapshot[engineName] = { status: trace.status, duration: trace.duration, error: trace.error };
      if (trace.status === 'failed') this.setEngineLifecycle(engineName, 'degraded', trace.error);
    }

    const dur = now() - pipelineStart;
    this.metrics.totalExecutions++; this.metrics.lastPipelineMs = dur;
    this.metrics.avgPipelineMs = (this.metrics.avgPipelineMs * (this.metrics.totalExecutions - 1) + dur) / this.metrics.totalExecutions;
    this.metrics.traces.push(...traces);
    if (this.metrics.traces.length > 200) this.metrics.traces = this.metrics.traces.slice(-200);
    this.isRunning = false;
    return traces;
  }

  private async executeEngine(engine: EngineContract, context: OrchestratorContext, retryPolicy: RetryPolicy, timeoutMs: number, token: CancellationToken): Promise<ExecutionTrace> {
    const start = now();
    let retries = 0;
    let lastError: string | undefined;
    this.runningQueue.add(engine.name);
    while (retries <= retryPolicy.maxRetries) {
      if (token.cancelled) { this.runningQueue.delete(engine.name); return { engineName: engine.name, startedAt: start, completedAt: now(), duration: now() - start, status: 'cancelled', retries, error: token.reason }; }
      try {
        await this.executeWithTimeout(engine.execute(context), timeoutMs);
        const duration = now() - start;
        this.runningQueue.delete(engine.name);
        this.updateHealth(engine.name, 'healthy');
        if (retries > 0) { const health = this.metrics.engineHealth[engine.name]; if (health) health.recoveryCount = (health.recoveryCount || 0) + 1; }
        return { engineName: engine.name, startedAt: start, completedAt: now(), duration, status: 'completed', retries };
      } catch (err: any) {
        lastError = err?.message || 'Unknown error';
        retries++;
        if (retries <= retryPolicy.maxRetries) {
          const delay = retryPolicy.backoffMs * Math.pow(retryPolicy.backoffMultiplier, retries - 1);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
    const duration = now() - start;
    this.runningQueue.delete(engine.name);
    this.updateHealth(engine.name, 'degraded');
    this.metrics.totalFailures++;
    return { engineName: engine.name, startedAt: start, completedAt: now(), duration, status: 'failed', retries, error: lastError };
  }

  private async executeWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)),
    ]);
  }

  enqueue(event: PipelineEvent): void { this.eventQueue.push(event); this.pendingQueue.push(event.type); }

  async processQueue(): Promise<ExecutionTrace[][]> {
    const results: ExecutionTrace[][] = [];
    while (this.eventQueue.length > 0) {
      const event = this.eventQueue.shift();
      if (event) { this.pendingQueue.shift(); results.push(await this.execute(event)); }
    }
    return results;
  }

  cancelAll(reason: string): void { this.eventQueue = []; this.pendingQueue = []; }

  pause(): void { this.paused = true; }
  resume(): void { this.paused = false; }
  isPaused(): boolean { return this.paused; }
  async restart(): Promise<void> {
    await this.shutdown();
    this.startTime = now();
    this.paused = false;
    // initializeAll() owns timer startup (timer safety), so do NOT start the
    // heartbeat here.
    await this.initializeAll();
    this.registerScheduler();
  }

  private updateHealth(name: string, status: 'healthy' | 'degraded' | 'down'): void {
    const h = this.metrics.engineHealth[name];
    if (!h) return;
    h.status = status; h.lastRun = now(); h.totalRuns++;
    if (status !== 'healthy') h.errorCount++;
  }

  getAllHealth(): Record<string, EngineHealth> { return { ...this.metrics.engineHealth }; }

  getEngineReadiness(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const engine of this.listEngines()) {
      const health = this.metrics.engineHealth[engine.name];
      result[engine.name] = {
        registered: true,
        lifecycle: this.getEngineLifecycle(engine.name),
        initialized: Boolean(health?.initialized),
        reachable: Boolean(this.getEngine(engine.name)),
        callable: typeof engine.execute === 'function',
        healthChecked: typeof engine.health === 'function',
        recoverable: Boolean(health?.recoverable),
        shutdownCapable: typeof engine.shutdown === 'function',
        restartCapable: typeof engine.initialize === 'function' && typeof engine.shutdown === 'function',
        blockedReason: health?.blockedReason,
        dependencies: engine.dependencies ?? [],
        dependenciesReady: (engine.dependencies ?? []).every(d => this.getEngineLifecycle(d) === 'ready'),
      };
    }
    return result;
  }

  getEngineStatus(name: string): EngineStatus {
    if (this.runningQueue.has(name)) return 'running';
    const h = this.metrics.engineHealth[name];
    if (!h) return 'idle';
    if (h.status === 'degraded' || h.status === 'down') return 'failed';
    return h.lastRun ? 'completed' : 'idle';
  }

  getMetrics(): PerformanceMetrics { this.metrics.uptime = now() - this.startTime; return { ...this.metrics }; }
  getDiagnostics() {
    const plan = this.plan ?? this.analyzeDependencies();
    return {
      engines: this.getEngineReadiness(),
      health: this.getAllHealth(),
      scheduler: this.getSchedulerState(),
      metrics: this.getMetrics(),
      paused: this.paused,
      running: this.isRunning,
      initialized: this.isInitialized,
      dependencyPlan: plan,
    };
  }
  getTraces(limit = 50): ExecutionTrace[] { return this.metrics.traces.slice(-limit); }

  getLastRun(): Record<string, ExecutionTrace | null> {
    const result: Record<string, ExecutionTrace | null> = {};
    for (const name of this.engines.keys()) {
      const traces = this.metrics.traces.filter(t => t.engineName === name);
      result[name] = traces.length > 0 ? traces[traces.length - 1] : null;
    }
    return result;
  }

  private startHeartbeat(): void { this.heartbeatInterval = setInterval(() => { this.metrics.uptime = now() - this.startTime; }, 5000); }

  async shutdown(): Promise<void> {
    this.paused = true;
    this.releaseScheduler();
    if (this.heartbeatInterval) { clearInterval(this.heartbeatInterval); this.heartbeatInterval = null; }
    this.cancelAll('Shutdown');
    this.isRunning = false;
    this.isInitialized = false;
    // Shut down in REVERSE dependency order (dependents before their deps) so a
    // dependency is never torn down while a dependent still relies on it.
    const plan = this.plan ?? this.analyzeDependencies();
    const order = plan.order.length ? plan.order : this.listEngines().map(e => e.name);
    for (const name of [...order].reverse()) {
      const engine = this.engines.get(name);
      if (!engine) continue;
      this.setEngineLifecycle(name, 'shutting_down');
      try { await engine.shutdown(); } catch (err: any) { console.error('[Orchestrator] shutdown error', name, err?.message); }
      this.setEngineLifecycle(name, 'stopped');
    }
    // Clear registry so a subsequent bootstrap re-registers cleanly (no dupes).
    this.engines.clear();
    this.metrics.engineHealth = {};
    this.plan = null;
    this.duplicates = [];
  }
}

export const lynxOrchestrator = new LynxOrchestrator();

// Engine Wrapper — adapts existing engine objects to EngineContract without modifying them
export function wrapEngine(opts: { name: string; priority: number; dependencies?: string[]; instance: any; executeFn: (context: OrchestratorContext, instance: any) => Promise<void>; }): EngineContract {
  const health = { status: 'healthy' as const, lifecycle: 'registered' as const, lastRun: null as number | null, lastDuration: 0, errorCount: 0, totalRuns: 0, avgDuration: 0 };
  return {
    name: opts.name, priority: opts.priority, dependencies: opts.dependencies || [],
    async initialize() {},
    async execute(context: OrchestratorContext) {
      const start = now();
      try { await opts.executeFn(context, opts.instance); }
      catch (err: any) { health.errorCount++; health.status = 'degraded'; throw err; }
      const duration = now() - start;
      health.lastRun = now(); health.lastDuration = duration; health.totalRuns++;
      health.avgDuration = (health.avgDuration * (health.totalRuns - 1) + duration) / health.totalRuns;
      health.status = 'healthy';
    },
    async shutdown() {},
    health() { return { ...health }; },
  };
}
