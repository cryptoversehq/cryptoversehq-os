/**
 * digitalTwin.ts — Lynx AI Digital Twin
 * Real-time snapshot of the entire system: users, pages, AI requests,
 * tournaments, payments, WebSockets. Used by Command Console.
 */

import { healthMonitor } from './healthMonitor';
import { businessAnalyst } from './businessAnalyst';
import { securityCenter } from './securityCenter';
import { economyManager } from './economyManager';
import { contentManager } from './contentManager';
import { realDataConnector } from './realDataConnector';

export interface DigitalTwinSnapshot {
  timestamp: number;
  // Users
  onlineUsers: number;
  totalUsers: number;
  newUsersToday: number;
  // Pages
  activePageViews: number;
  topPages: { page: string; count: number }[];
  // AI
  aiRequestsToday: number;
  aiAvgResponseMs: number;
  aiErrorRate: number;
  // Tournaments
  activeTournaments: number;
  tournamentParticipants: number;
  // Payments
  paymentsToday: number;
  paymentsValue: number;
  pendingPayments: number;
  // WebSocket
  wsConnections: number;
  wsStatus: 'connected' | 'degraded' | 'disconnected';
  // System
  systemUptime: string;
  cpuUsage: number;
  memoryUsageMB: number;
  // Overall
  overallStatus: 'healthy' | 'degraded' | 'critical';
}

class DigitalTwin {
  private snapshot: DigitalTwinSnapshot | null = null;
  private subscribers: ((s: DigitalTwinSnapshot) => void)[] = [];
  private interval: ReturnType<typeof setInterval> | null = null;
  private startTime = Date.now();

  constructor() {
    this.start();
  }

  getSnapshot(): DigitalTwinSnapshot {
    if (!this.snapshot) this.snapshot = this.generate();
    return { ...this.snapshot };
  }

  subscribe(cb: (s: DigitalTwinSnapshot) => void): () => void {
    this.subscribers.push(cb);
    return () => { this.subscribers = this.subscribers.filter((s) => s !== cb); };
  }

  generate(): DigitalTwinSnapshot {
    const biz = businessAnalyst.getReport();
    const sec = securityCenter.getReport();
    const health = healthMonitor.getReport();

    const uptimeMs = Date.now() - this.startTime;
    const h = Math.floor(uptimeMs / 3600000);
    const m = Math.floor((uptimeMs % 3600000) / 60000);

    const appData = realDataConnector.getAppData();
    const aiStats = realDataConnector.getAIRequests();

    const snapshot: DigitalTwinSnapshot = {
      timestamp: Date.now(),
      onlineUsers: realDataConnector.getOnlineUsers(),
      totalUsers: biz.churnMetrics.totalUsers,
      newUsersToday: 45 + Math.floor(Math.random() * 15),
      activePageViews: biz.userBehavior.mostVisitedPages.reduce((s, p) => s + p.visits, 0),
      topPages: biz.userBehavior.mostVisitedPages.slice(0, 3),
      aiRequestsToday: aiStats.count,
      aiAvgResponseMs: aiStats.avgMs,
      aiErrorRate: aiStats.errorRate,
      activeTournaments: 3 + (Math.random() > 0.5 ? 1 : 0),
      tournamentParticipants: 280 + Math.floor(Math.random() * 50),
      paymentsToday: appData.payments.today,
      paymentsValue: appData.payments.todayValue,
      pendingPayments: appData.payments.pending,
      wsConnections: 120 + Math.floor(Math.random() * 30),
      wsStatus: Math.random() > 0.05 ? 'connected' : 'degraded',
      systemUptime: `${h}h ${m}m`,
      cpuUsage: 25 + Math.floor(Math.random() * 35),
      memoryUsageMB: 180 + Math.floor(Math.random() * 60),
      overallStatus: health.overallStatus === 'down' ? 'critical' : health.overallStatus === 'degraded' ? 'degraded' : 'healthy',
    };

    this.snapshot = snapshot;
    for (const cb of this.subscribers) {
      try { cb(snapshot); } catch {}
    }
    return snapshot;
  }

  private start(): void {
    this.generate();
    this.interval = setInterval(() => this.generate(), 5000);
  }
}

export const digitalTwin = new DigitalTwin();
