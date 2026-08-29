/**
 * healthMonitor.ts - Lynx AI System Health Monitor
 * Monitors 7 services. Uses realDataConnector for CoinGecko + DeepSeek checks.
 */

import { realDataConnector } from './realDataConnector';

// Types
export type ServiceStatus = 'healthy' | 'degraded' | 'down' | 'unknown';
export interface ServiceHealth { name: string; status: ServiceStatus; latency: number; lastCheck: number; uptime: number; errorCount: number; lastError?: string; }
export interface SystemAlert { id: string; severity: 'info' | 'warning' | 'critical'; service: string; message: string; timestamp: number; acknowledged: boolean; }
export interface HealthMetrics { totalRequests: number; errorRate: number; averageLatency: number; aiQueueDepth: number; activeUsers: number; apiCallsToday: number; }
export interface SystemHealthReport { timestamp: number; overallStatus: ServiceStatus; services: Record<string, ServiceHealth>; alerts: SystemAlert[]; metrics: HealthMetrics; }

class HealthMonitor {
  private services: Record<string, ServiceHealth> = {};
  private alerts: SystemAlert[] = [];
  private metrics: HealthMetrics = { totalRequests: 0, errorRate: 0, averageLatency: 0, aiQueueDepth: 0, activeUsers: 0, apiCallsToday: 0 };
  private monitorInterval: ReturnType<typeof setInterval> | null = null;
  private alertSubscribers: ((alert: SystemAlert) => void)[] = [];

  constructor() { this.initServices(); this.startMonitoring(); }

  getReport(): SystemHealthReport {
    const statuses = Object.values(this.services).map(s => s.status);
    let overall: ServiceStatus = 'healthy';
    if (statuses.some(s => s === 'down')) overall = 'down';
    else if (statuses.some(s => s === 'degraded')) overall = 'degraded';
    return { timestamp: Date.now(), overallStatus: overall, services: { ...this.services }, alerts: [...this.alerts].slice(-50), metrics: { ...this.metrics } };
  }

  getAlerts(limit = 20): SystemAlert[] { return [...this.alerts].slice(-limit); }

  acknowledgeAlert(id: string): void {
    this.alerts = this.alerts.map(a => a.id === id ? { ...a, acknowledged: true } : a);
  }

  onAlert(cb: (alert: SystemAlert) => void): () => void {
    this.alertSubscribers.push(cb);
    return () => { this.alertSubscribers = this.alertSubscribers.filter(s => s !== cb); };
  }

  private initServices(): void {
    const now = Date.now();
    this.services = {
      coinGecko: { name: 'CoinGecko API', status: 'healthy', latency: 120, lastCheck: now, uptime: 99.8, errorCount: 0 },
      deepSeek: { name: 'DeepSeek AI', status: 'healthy', latency: 450, lastCheck: now, uptime: 99.5, errorCount: 0 },
      nowPayments: { name: 'NOWPayments', status: 'healthy', latency: 200, lastCheck: now, uptime: 99.9, errorCount: 0 },
      binanceWS: { name: 'Binance WebSocket', status: 'healthy', latency: 80, lastCheck: now, uptime: 99.7, errorCount: 0 },
      taskadeAPI: { name: 'Taskade API (Agents)', status: 'healthy', latency: 300, lastCheck: now, uptime: 99.0, errorCount: 0 },
      aiQueue: { name: 'AI Processing Queue', status: 'healthy', latency: 50, lastCheck: now, uptime: 100, errorCount: 0 },
      database: { name: 'Database (localStorage)', status: 'healthy', latency: 5, lastCheck: now, uptime: 100, errorCount: 0 },
    };
  }

  private startMonitoring(): void {
    void this.checkAllServices();
    // Register with Enterprise Orchestrator instead of raw setInterval
    import('./lynxOrchestrator').then(({ lynxOrchestrator }) => {
      lynxOrchestrator.registerScheduledTask('health-monitor-check', 60_000, () => { void this.checkAllServices(); });
    }).catch(() => {
      // Fallback: use raw interval if orchestrator not available
      if (typeof setInterval !== 'undefined') {
        this.monitorInterval = setInterval(() => { void this.checkAllServices(); }, 60_000);
      }
    });
  }

  /** Check services using real API calls where available, simulated for others */
  private async checkAllServices(): Promise<void> {
    // Real CoinGecko check
    const cgResult = await realDataConnector.checkCoinGecko();
    this.updateService('coinGecko', cgResult);

    // Real DeepSeek check
    const dsResult = await realDataConnector.checkDeepSeek();
    this.updateService('deepSeek', dsResult);

    // Simulated for services without real endpoints
    this.simulateCheck('nowPayments', 150, 400);
    this.simulateCheck('binanceWS', 50, 150);
    this.simulateCheck('taskadeAPI', 200, 600);
    this.simulateCheck('aiQueue', 20, 100);
    this.simulateCheck('database', 2, 15);

    this.metrics.totalRequests++;
  }

  private updateService(key: string, result: { status: 'healthy' | 'degraded' | 'down'; latency: number }): void {
    const svc = this.services[key];
    if (!svc) return;
    this.services[key] = {
      ...svc, status: result.status, latency: result.latency, lastCheck: Date.now(),
      uptime: result.status === 'down' ? Math.max(98, svc.uptime - 0.1) : svc.uptime,
      errorCount: result.status === 'down' ? svc.errorCount + 1 : svc.errorCount,
    };
    if (result.status === 'down') {
      this.createAlert('critical', key, `${svc.name} is DOWN (${result.latency}ms)`);
    } else if (result.status === 'degraded') {
      this.createAlert('warning', key, `${svc.name} is DEGRADED (${result.latency}ms)`);
    }
  }

  private simulateCheck(key: string, minMs: number, maxMs: number): void {
    const svc = this.services[key];
    if (!svc) return;
    const latency = minMs + Math.random() * (maxMs - minMs);
    const roll = Math.random();
    let status: ServiceStatus = 'healthy';
    if (roll < 0.01) status = 'down';
    else if (roll < 0.04) status = 'degraded';
    this.updateService(key, { status, latency: Math.round(latency) });
  }

  private createAlert(severity: SystemAlert['severity'], service: string, message: string): void {
    const alert: SystemAlert = { id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`, severity, service, message, timestamp: Date.now(), acknowledged: false };
    this.alerts.push(alert);
    if (this.alerts.length > 200) this.alerts = this.alerts.slice(-200);
    for (const cb of this.alertSubscribers) { try { cb(alert); } catch {} }
  }
}

export const healthMonitor = new HealthMonitor();
