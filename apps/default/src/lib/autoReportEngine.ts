/**
 * autoReportEngine.ts - Lynx AI Auto-Report Generator
 * Sends daily/weekly reports using real data from stores and APIs.
 */

import { healthMonitor } from './healthMonitor';
import { businessAnalyst } from './businessAnalyst';
import { securityCenter } from './securityCenter';
import { economyManager } from './economyManager';
import { contentManager } from './contentManager';
import { digitalTwin } from './digitalTwin';
import { lynxBrain } from './brainEngine';
import { realDataConnector } from './realDataConnector';

export interface AdminReport {
  subject: string;
  body: string;
  timestamp: number;
  sent: boolean;
}

class AutoReportEngine {
  private lastSent: number = 0;
  private interval: ReturnType<typeof setInterval> | null = null;
  private reportLog: AdminReport[] = [];

  constructor() {
    this.start();
  }

  private start(): void {
    this.interval = setInterval(() => {
      const settings = this.getSettings();
      if (!settings.autoEmailReports || !settings.adminEmail) return;

      const now = Date.now();
      const freq = settings.reportFrequency;
      const intervalMs = freq === 'daily' ? 24 * 60 * 60 * 1000 : freq === 'weekly' ? 7 * 24 * 60 * 60 * 1000 : 60 * 60 * 1000;

      if (now - this.lastSent < intervalMs) return;
      if (settings.reportFrequency === 'daily') {
        const [h, m] = settings.reportTime.split(':').map(Number);
        const nowDate = new Date();
        if (nowDate.getHours() !== h || nowDate.getMinutes() !== m) return;
      }

      this.sendReport(settings.adminEmail);
      this.lastSent = now;
    }, 60000);
  }

  async sendReport(email: string): Promise<AdminReport> {
    const health = healthMonitor.getReport();
    const biz = businessAnalyst.getReport();
    const sec = securityCenter.getReport();
    const eco = economyManager.getReport();
    const content = contentManager.getReport();
    const twin = digitalTwin.getSnapshot();
    const brain = lynxBrain.getBrainSummary();
    const appData = realDataConnector.getAppData();

    const subject = `Lynx AI Daily Report - ${new Date().toLocaleDateString()}`;
    const body = [
      'Lynx AI Daily Report',
      '====================',
      '',
      `System Health: ${health.overallStatus.toUpperCase()}`,
      ...Object.values(health.services).map(s => `  ${s.name}: ${s.status} (${Math.round(s.latency)}ms)`),
      '',
      `Users: ${twin.onlineUsers} online | ${appData.users.active7d.toLocaleString()} active (7d)`,
      `  New today: ${twin.newUsersToday} | Plans: Free ${appData.users.plans.free} / Pro ${appData.users.plans.pro} / Pro+ ${appData.users.plans.pro_plus}`,
      '',
      `Trading: ${appData.trading.openPositions} open positions | ${appData.trading.totalTrades} total trades`,
      `  Win Rate: ${appData.trading.avgWinRate.toFixed(1)}% | Volume: $${appData.trading.volume24h.toLocaleString()}`,
      '',
      `Revenue: $${(biz.salesMetrics.monthlyRevenue / 1000).toFixed(1)}K/month`,
      `  Conversion: ${biz.salesMetrics.conversionRate}% | ARPU: $${biz.salesMetrics.averageRevenuePerUser}`,
      '',
      `Security: ${sec.activeThreats.length} active threats | Risk: ${sec.riskScore}/100`,
      ...(sec.activeThreats.length > 0 ? sec.activeThreats.map(t => `  - ${t.type.split('_').join(' ')}: ${t.description}`) : ['  No active threats']),
      '',
      `Economy: CP Supply ${(eco.cpMetrics.circulatingSupply / 1_000_000).toFixed(1)}M`,
      `  Inflation: ${eco.inflation.currentRate}% (${eco.inflation.health})`,
      '',
      `Content: ${content.overallStats.overallCompletionRate}% completion | ${content.suggestions.length} improvements pending`,
      '',
      `AI Stats: ${twin.aiRequestsToday.toLocaleString()} requests | ${twin.aiAvgResponseMs}ms avg`,
      '',
      `Brain: ${brain}`,
      '',
      'Powered by Lynx AI Operating System',
    ].join('\n');

    const report: AdminReport = { subject, body, timestamp: Date.now(), sent: true };
    this.reportLog.push(report);

    try {
      const logs = JSON.parse(localStorage.getItem('cv_admin_report_logs') || '[]');
      logs.push(report);
      if (logs.length > 50) logs.shift();
      localStorage.setItem('cv_admin_report_logs', JSON.stringify(logs));
    } catch {}

    return report;
  }

  getReportLog(): AdminReport[] {
    try { return JSON.parse(localStorage.getItem('cv_admin_report_logs') || '[]'); } catch { return []; }
  }

  private getSettings() {
    try {
      const s = localStorage.getItem('cv_admin_lynx_settings');
      return s ? JSON.parse(s) : { autoEmailReports: false, adminEmail: '', reportFrequency: 'daily', reportTime: '08:00' };
    } catch { return { autoEmailReports: false, adminEmail: '', reportFrequency: 'daily', reportTime: '08:00' }; }
  }
}

export const autoReportEngine = new AutoReportEngine();
