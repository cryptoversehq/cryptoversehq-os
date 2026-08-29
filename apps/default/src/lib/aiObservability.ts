/**
 * aiObservability.ts — AI Observability
 * Real-time AI snapshot monitoring. Complements DigitalTwin + HealthMonitor.
 * Captures engine state, memory usage, queue depth, response times, error rates.
 * No duplicate logic. Priority 16.
 */

import type { OrchestratorContext, EngineContract } from './lynxOrchestrator';
import { lynxOrchestrator } from './lynxOrchestrator';
import { digitalTwin } from './digitalTwin';
import { healthMonitor } from './healthMonitor';

export interface AISnapshot {
  timestamp: number;
  activeEngines: string[];
  totalEngines: number;
  memoryUsage: number;
  queueLength: number;
  avgResponseTime: number;
  errorRate: number;
  successRate: number;
  runningTasks: number;
  pendingTasks: number;
  uptime: string;
}

export interface PerformanceReport {
  timestamp: number;
  period: string;
  avgResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  errorRate: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  uptime: string;
  recommendations: string[];
}

class AIObservability {
  private snapshots: AISnapshot[] = [];
  private responseTimes: number[] = [];
  private registered = false;
  private readonly MAX_SNAPSHOTS = 1440; // 24 hours at 1/min
  private readonly MAX_TIMES = 10000;
  private interval: ReturnType<typeof setInterval> | null = null;
  private readonly KEY = 'cv_ai_observability';
  private totalRequests = 0;
  private successRequests = 0;
  private failedRequests = 0;

  constructor() {
    this.interval = setInterval(() => this.takeSnapshot(), 60000); // Every 60s
    this.takeSnapshot(); // Initial snapshot
    this.load();
  }

  /** Capture a snapshot of the AI system */
  takeSnapshot(): AISnapshot {
    const metrics = lynxOrchestrator.getMetrics();
    const engines = lynxOrchestrator.listEngines();
    const twin = digitalTwin.getSnapshot();
    const health = healthMonitor.getReport();

    const avgRt = this.responseTimes.length > 0
      ? Math.round(this.responseTimes.reduce((s, t) => s + t, 0) / this.responseTimes.length)
      : 0;

    const totalReq = this.totalRequests || 1;
    const errorRate = this.totalRequests > 0
      ? Math.round((this.failedRequests / totalReq) * 100)
      : 0;

    const snapshot: AISnapshot = {
      timestamp: Date.now(),
      activeEngines: engines.filter(e => lynxOrchestrator.getEngineStatus(e.name) === 'running').map(e => e.name),
      totalEngines: engines.length,
      memoryUsage: metrics.traces.length * 2, // ~2KB per trace
      queueLength: this.responseTimes.length,
      avgResponseTime: avgRt,
      errorRate,
      successRate: 100 - errorRate,
      runningTasks: twin.wsConnections || 0,
      pendingTasks: this.responseTimes.length,
      uptime: twin.systemUptime || 'unknown',
    };

    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.MAX_SNAPSHOTS) {
      this.snapshots = this.snapshots.slice(-this.MAX_SNAPSHOTS);
    }
    this.save();
    return snapshot;
  }

  /** Record a response time */
  recordResponse(engine: string, durationMs: number, success: boolean): void {
    this.responseTimes.push(durationMs);
    if (this.responseTimes.length > this.MAX_TIMES) {
      this.responseTimes = this.responseTimes.slice(-this.MAX_TIMES);
    }
    this.totalRequests++;
    if (success) this.successRequests++;
    else this.failedRequests++;
  }

  /** Get the latest snapshot */
  getLatestSnapshot(): AISnapshot | null {
    return this.snapshots.length > 0 ? this.snapshots[this.snapshots.length - 1] : null;
  }

  /** Get all snapshots (last N) */
  getSnapshots(limit = 60): AISnapshot[] {
    return this.snapshots.slice(-limit);
  }

  /** Generate a performance report */
  getPerformanceReport(period: 'hour' | 'day' | 'week' = 'day'): PerformanceReport {
    const periodMs = period === 'hour' ? 3600000 : period === 'day' ? 86400000 : 604800000;
    const recent = this.snapshots.filter(s => s.timestamp > Date.now() - periodMs);
    const times = this.responseTimes.slice(-1000);
    const sorted = [...times].sort((a, b) => a - b);
    const avg = times.length > 0 ? Math.round(times.reduce((s, t) => s + t, 0) / times.length) : 0;
    const p95 = sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.95)] : 0;
    const p99 = sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.99)] : 0;
    const totalReq = this.totalRequests || 1;
    const errorRate = Math.round((this.failedRequests / totalReq) * 100);

    const recommendations: string[] = [];
    if (avg > 500) recommendations.push('Average response time exceeds 500ms — consider optimizing pipeline');
    if (p99 > 2000) recommendations.push('P99 latency exceeds 2s — check for blocking operations');
    if (errorRate > 5) recommendations.push('Error rate above 5% — investigate failing engines');
    if (recommendations.length === 0) recommendations.push('AI system performance is within acceptable thresholds');

    return {
      timestamp: Date.now(),
      period,
      avgResponseTime: avg,
      p95ResponseTime: p95,
      p99ResponseTime: p99,
      errorRate,
      totalRequests: this.totalRequests,
      successfulRequests: this.successRequests,
      failedRequests: this.failedRequests,
      uptime: this.snapshots.length > 0 ? this.snapshots[this.snapshots.length - 1].uptime : 'unknown',
      recommendations,
    };
  }

  // Orchestrator
  async execute(context: OrchestratorContext): Promise<void> {
    this.takeSnapshot();
  }

  getOrchestratorContract(): EngineContract {
    return {
      name: 'aiObservability',
      priority: 16,
      dependencies: ['contextEngine', 'digitalTwin', 'healthMonitor'],
      initialize: async () => { this.registered = true; },
      execute: (ctx) => this.execute(ctx),
      shutdown: async () => { this.registered = false; if (this.interval) clearInterval(this.interval); },
      health: () => ({ status: this.registered ? 'healthy' : 'degraded', lastRun: null, lastDuration: 0, errorCount: 0, totalRuns: 0, avgDuration: 0 }),
    };
  }

  private save(): void {
    try {
      localStorage.setItem(this.KEY, JSON.stringify({
        snapshots: this.snapshots.slice(-this.MAX_SNAPSHOTS),
        totalRequests: this.totalRequests,
        successRequests: this.successRequests,
        failedRequests: this.failedRequests,
      }));
    } catch {}
  }

  private load(): void {
    try {
      const d = localStorage.getItem(this.KEY);
      if (d) {
        const obj = JSON.parse(d);
        this.snapshots = obj.snapshots || [];
        this.totalRequests = obj.totalRequests || 0;
        this.successRequests = obj.successRequests || 0;
        this.failedRequests = obj.failedRequests || 0;
      }
    } catch {}
  }
}

export const aiObservability = new AIObservability();
