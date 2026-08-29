/**
 * liveKnowledge.ts — Live Agent Knowledge System
 * Agents use live, up-to-date platform knowledge instead of static prompts.
 * Auto-updates every 60s. Injects into Brain Fusion and Agent SDK.
 */

import type { OrchestratorContext, EngineContract } from './lynxOrchestrator';
import { realDataConnector } from './realDataConnector';
import { businessAnalyst } from './businessAnalyst';
import { healthMonitor } from './healthMonitor';
import { digitalTwin } from './digitalTwin';
import { securityCenter } from './securityCenter';
import { economyManager } from './economyManager';
import { contentManager } from './contentManager';

export interface KnowledgeSection {
  data: any;
  timestamp: number;
  version: number;
  source: string;
}

class LiveKnowledge {
  private knowledge: Map<string, KnowledgeSection> = new Map();
  private lastUpdate = 0;
  private registered = false;
  private readonly UPDATE_INTERVAL_MS = 60000;
  private subscribers: ((section: string, data: KnowledgeSection) => void)[] = [];

  constructor() {
    this.updateAll();
    setInterval(() => this.updateAll(), this.UPDATE_INTERVAL_MS);
  }

  /** Update ALL knowledge sections from live platform data */
  updateAll(): void {
    const now = Date.now();

    // Trading
    const appData = realDataConnector.getAppData();
    this.setKnowledge('trading', {
      trades: appData.trading?.totalTrades ?? null,
      positions: appData.trading?.openPositions ?? null,
      winRate: appData.trading?.avgWinRate ?? null,
    }, now, 'realDataConnector');

    // Academy
    this.setKnowledge('academy', {
      lessons: appData.academy?.completedLessons ?? null,
      total: appData.academy?.totalLessons ?? null,
      level: appData.academy?.avgLevel ?? null,
    }, now, 'realDataConnector');

    // Revenue
    const biz = businessAnalyst.getReport();
    this.setKnowledge('revenue', {
      daily: biz.salesMetrics.dailyRevenue,
      monthly: biz.salesMetrics.monthlyRevenue,
      arpu: biz.salesMetrics.averageRevenuePerUser,
    }, now, 'businessAnalyst');

    // Users
    this.setKnowledge('users', {
      total: appData.users?.total ?? null,
      active: appData.users?.active7d ?? null,
      churn: biz.churnMetrics?.churnRate ?? null,
    }, now, 'realDataConnector');

    // System Health
    const health = healthMonitor.getReport();
    this.setKnowledge('system_health', {
      status: health.overallStatus,
      services: Object.keys(health.services).length,
    }, now, 'healthMonitor');

    // Economy
    const eco = economyManager.getReport();
    this.setKnowledge('economy', {
      inflation: eco.inflation.currentRate,
      cpSupply: eco.cpMetrics.circulatingSupply,
    }, now, 'economyManager');

    // Security
    const sec = securityCenter.getReport();
    this.setKnowledge('security', {
      threats: sec.activeThreats?.length ?? null,
      riskScore: sec.riskScore ?? null,
    }, now, 'securityCenter');

    // Content
    const content = contentManager.getReport();
    this.setKnowledge('content', {
      completionRate: content.overallStats?.overallCompletionRate ?? null,
      courses: content.courses?.length ?? null,
    }, now, 'contentManager');

    // Digital Twin
    const twin = digitalTwin.getSnapshot();
    this.setKnowledge('platform', {
      onlineUsers: twin.onlineUsers,
      aiRequests: twin.aiRequestsToday,
      payments: twin.paymentsToday,
    }, now, 'digitalTwin');

    this.lastUpdate = now;
  }

  /** Store knowledge for a section */
  updateKnowledge(section: string, data: any): void {
    this.setKnowledge(section, data, Date.now(), 'manual');
  }

  /** Get knowledge for a section */
  getKnowledge(section: string): any {
    return this.knowledge.get(section)?.data || null;
  }

  /** Get all knowledge as a map */
  getAllKnowledge(): Map<string, KnowledgeSection> {
    return new Map(this.knowledge);
  }

  /** Generate a knowledge summary string for AI agents */
  getKnowledgeSummary(): string {
    const lines: string[] = ['Live Platform Knowledge:'];
    for (const [section, value] of this.knowledge) {
      const data = typeof value.data === 'object' ? JSON.stringify(value.data) : String(value.data);
      const age = Math.round((Date.now() - value.timestamp) / 1000);
      lines.push(`- ${section}: ${data.substring(0, 150)} (${age}s ago)`);
    }
    return lines.join('\n');
  }

  /** Generate a concise prompt inject for Brain Fusion */
  getPromptInject(): string {
    const parts: string[] = [];
    const trading = this.getKnowledge('trading');
    if (trading) parts.push(`Trading: ${trading.trades == null ? 'unavailable' : trading.trades} trades, ${trading.positions == null ? 'unavailable' : trading.positions} open, ${trading.winRate == null ? 'unavailable' : trading.winRate + '%'} WR`);
    const users = this.getKnowledge('users');
    if (users) parts.push(`Users: ${users.active == null ? 'unavailable' : users.active.toLocaleString()} active, ${users.churn == null ? 'unavailable' : users.churn + '%'} churn`);
    const revenue = this.getKnowledge('revenue');
    if (revenue) parts.push(`Revenue: ${revenue.daily == null ? 'unavailable' : '$' + revenue.daily.toLocaleString() + '/day'}, ${revenue.monthly == null ? 'unavailable' : '$' + (revenue.monthly / 1000).toFixed(1) + 'K/mo'}`);
    const health = this.getKnowledge('system_health');
    if (health) parts.push(`System: ${health.status}, ${health.services} services`);
    const security = this.getKnowledge('security');
    if (security) parts.push(`Security: ${security.threats == null ? 'unavailable' : security.threats + ' threats'}, risk ${security.riskScore == null ? 'unavailable' : security.riskScore + '/100'}`);
    return parts.join(' | ');
  }

  /** Subscribe to knowledge updates */
  subscribe(cb: (section: string, data: KnowledgeSection) => void): () => void {
    this.subscribers.push(cb);
    return () => { this.subscribers = this.subscribers.filter(s => s !== cb); };
  }

  /** Update all knowledge sections automatically */
  private setKnowledge(section: string, data: any, timestamp: number, source: string): void {
    const prev = this.knowledge.get(section);
    const version = prev ? prev.version + 1 : 1;
    const kd: KnowledgeSection = { data, timestamp, version, source };
    this.knowledge.set(section, kd);
    for (const cb of this.subscribers) {
      try { cb(section, kd); } catch {}
    }
  }

  // ── Orchestrator ───────────────────────────────────────────────────────

  async execute(context: OrchestratorContext): Promise<void> {
    if (Date.now() - this.lastUpdate > this.UPDATE_INTERVAL_MS) {
      this.updateAll();
    }
  }

  getOrchestratorContract(): EngineContract {
    return {
      name: 'liveKnowledge', priority: 17,
      dependencies: ['contextEngine', 'realDataConnector', 'businessAnalyst', 'healthMonitor', 'digitalTwin', 'securityCenter', 'economyManager', 'contentManager'],
      initialize: async () => { this.registered = true; this.updateAll(); },
      execute: (ctx) => this.execute(ctx),
      shutdown: async () => { this.registered = false; },
      health: () => ({ status: this.registered ? 'healthy' : 'degraded', lastRun: null, lastDuration: 0, errorCount: 0, totalRuns: 0, avgDuration: 0 }),
    };
  }
}

export const liveKnowledge = new LiveKnowledge();
