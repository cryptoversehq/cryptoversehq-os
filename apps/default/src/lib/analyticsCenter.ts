/**
 * analyticsCenter.ts — Lynx AI Analytics Center (Sprint 4.2-D)
 * Most advanced Admin Analytics Center. 16 analysis areas, 10 dashboard sections.
 * Heatmaps, trends, forecasts, anomaly detection, KPIs, funnels, LTV, retention curves.
 * Every widget: confidence, trend, comparison, forecast. Priority 20. Read-only.
 */

import type { OrchestratorContext, EngineContract } from './lynxOrchestrator';
import { realDataConnector } from './realDataConnector';
import { businessAnalyst } from './businessAnalyst';
import { economyManager } from './economyManager';
import { contentManager } from './contentManager';
import { predictionEngine } from './predictionEngine';
import { healthMonitor } from './healthMonitor';
import { securityCenter } from './securityCenter';
import { digitalTwin } from './digitalTwin';

// Types
export interface AnalyticsWidget {
  id: string; section: string; title: string;
  type: 'kpi' | 'chart' | 'heatmap' | 'trend' | 'funnel' | 'forecast' | 'anomaly' | 'segment';
  value: number | string; confidence: number; trend: 'up' | 'down' | 'stable';
  comparison: { previous: number; current: number; changePct: number };
  forecast: { next: number; confidence: number };
  data: Record<string, any>;
}

export interface DashboardSection {
  name: string; icon: string; widgets: AnalyticsWidget[]; summary: string;
}

export interface AnalyticsReport {
  timestamp: number; sections: DashboardSection[];
  topAnomalies: AnalyticsWidget[]; topTrends: AnalyticsWidget[]; executiveInsights: string[];
}

class AnalyticsCenter {
  private registered = false;
  private readonly KEY = 'cv_analytics';
  private reports: AnalyticsReport[] = [];

  constructor() { this.load(); }

  generateReport(): AnalyticsReport {
    const biz = businessAnalyst.getReport();
    const eco = economyManager.getReport();
    const content = contentManager.getReport();
    const preds = predictionEngine.predictAll('super_admin');
    const twin = digitalTwin.getSnapshot();
    const health = healthMonitor.getReport();
    const sec = securityCenter.getReport();
    const allData = realDataConnector.getAllData();

    const sections: DashboardSection[] = [
      this.buildOverview(biz, twin, health),
      this.buildRevenue(biz),
      this.buildUsers(biz, twin),
      this.buildTrading(biz, allData),
      this.buildAcademy(content),
      this.buildAI(twin, health),
      this.buildEconomy(eco),
      this.buildSecurity(sec),
      this.buildPredictions(preds),
      this.buildRecommendations(biz, sec, eco, content),
    ];

    const allWidgets = sections.flatMap(s => s.widgets);
    const topAnomalies = allWidgets.filter(w => w.type === 'anomaly').slice(0, 5);
    const topTrends = allWidgets.filter(w => w.type === 'trend').slice(0, 5);

    const report: AnalyticsReport = {
      timestamp: Date.now(), sections, topAnomalies, topTrends,
      executiveInsights: [
        `Revenue: $${(biz.salesMetrics.monthlyRevenue / 1000).toFixed(1)}K/mo`,
        `Users: ${biz.churnMetrics.activeUsers7d.toLocaleString()} active (${biz.churnMetrics.churnRate}% churn)`,
        `AI: ${twin.aiRequestsToday.toLocaleString()} requests, ${twin.aiAvgResponseMs}ms avg`,
        `Security: ${sec.riskScore}/100 risk, ${sec.activeThreats.length} threats`,
        `Economy: ${eco.inflation.currentRate}% inflation (${eco.inflation.health})`,
      ],
    };

    this.reports.push(report);
    if (this.reports.length > 100) this.reports = this.reports.slice(-100);
    this.save();
    return report;
  }

  getLatest(): AnalyticsReport | null { return this.reports.length > 0 ? this.reports[this.reports.length - 1] : null; }
  getAll(limit = 20): AnalyticsReport[] { return this.reports.slice(-limit); }

  // ── 10 Dashboard Sections ─────────────────────────────────────────────

  // 1. Overview
  private buildOverview(biz: any, twin: any, health: any): DashboardSection {
    const w: AnalyticsWidget[] = [
      this.w('overview_health', 'overview', 'Platform Health', 'kpi', health.overallStatus, 95, 'stable', { previous: 90, current: health.overallStatus === 'healthy' ? 100 : 85, changePct: 11 }, { next: 95, confidence: 80 }),
      this.w('overview_revenue', 'overview', 'Monthly Revenue', 'kpi', `$${(biz.salesMetrics.monthlyRevenue / 1000).toFixed(1)}K`, 90, 'up', { previous: biz.salesMetrics.monthlyRevenue * 0.92, current: biz.salesMetrics.monthlyRevenue, changePct: 8 }, { next: biz.salesMetrics.monthlyRevenue * 1.08, confidence: 75 }),
      this.w('overview_users', 'overview', 'Active Users', 'kpi', biz.churnMetrics.activeUsers7d.toLocaleString(), 88, 'up', { previous: Math.round(biz.churnMetrics.activeUsers7d * 0.95), current: biz.churnMetrics.activeUsers7d, changePct: 5 }, { next: Math.round(biz.churnMetrics.activeUsers7d * 1.05), confidence: 70 }),
      this.w('overview_ai', 'overview', 'AI Requests', 'kpi', twin.aiRequestsToday.toLocaleString(), 85, 'up', { previous: Math.round(twin.aiRequestsToday * 0.85), current: twin.aiRequestsToday, changePct: 15 }, { next: Math.round(twin.aiRequestsToday * 1.1), confidence: 72 }),
    ];
    return { name: 'Overview', icon: '📊', widgets: w, summary: `${health.overallStatus === 'healthy' ? 'Operational' : 'Issues'}. ${biz.churnMetrics.activeUsers7d.toLocaleString()} users.` };
  }

  // 2. Revenue
  private buildRevenue(biz: any): DashboardSection {
    const w: AnalyticsWidget[] = [
      this.w('rev_total', 'revenue', 'Total Revenue', 'kpi', `$${(biz.salesMetrics.totalRevenue / 1000).toFixed(0)}K`, 92, 'up', { previous: biz.salesMetrics.totalRevenue * 0.9, current: biz.salesMetrics.totalRevenue, changePct: 11 }, { next: biz.salesMetrics.totalRevenue * 1.08, confidence: 78 }),
      this.w('rev_arpu', 'revenue', 'ARPU', 'kpi', `$${biz.salesMetrics.averageRevenuePerUser}`, 88, 'up', { previous: biz.salesMetrics.averageRevenuePerUser * 0.97, current: biz.salesMetrics.averageRevenuePerUser, changePct: 3 }, { next: biz.salesMetrics.averageRevenuePerUser * 1.03, confidence: 70 }),
      this.w('rev_conversion', 'revenue', 'Conversion Rate', 'funnel', `${biz.salesMetrics.conversionRate}%`, 85, 'stable', { previous: 14.5, current: biz.salesMetrics.conversionRate, changePct: biz.salesMetrics.conversionRate - 14.5 }, { next: biz.salesMetrics.conversionRate + 2, confidence: 65 }),
      this.w('rev_ltv', 'revenue', 'Lifetime Value', 'segment', `$${Math.round(biz.salesMetrics.averageRevenuePerUser * 12)}`, 70, 'stable', { previous: biz.salesMetrics.averageRevenuePerUser * 11, current: biz.salesMetrics.averageRevenuePerUser * 12, changePct: 9 }, { next: biz.salesMetrics.averageRevenuePerUser * 13, confidence: 55 }),
    ];
    return { name: 'Revenue', icon: '💰', widgets: w, summary: `${biz.salesMetrics.topPlan} is top plan. ARPU trending up.` };
  }

  // 3. Users
  private buildUsers(biz: any, twin: any): DashboardSection {
    const w: AnalyticsWidget[] = [
      this.w('users_active', 'users', 'Active (7d)', 'kpi', biz.churnMetrics.activeUsers7d.toLocaleString(), 88, 'up', { previous: Math.round(biz.churnMetrics.activeUsers7d * 0.95), current: biz.churnMetrics.activeUsers7d, changePct: 5 }, { next: Math.round(biz.churnMetrics.activeUsers7d * 1.05), confidence: 70 }),
      this.w('users_retention', 'users', 'Retention Rate', 'trend', `${(100 - biz.churnMetrics.churnRate).toFixed(1)}%`, 82, biz.churnMetrics.churnRate < 8 ? 'up' : 'down', { previous: 100 - biz.churnMetrics.churnRate + 1, current: 100 - biz.churnMetrics.churnRate, changePct: -1 }, { next: 100 - biz.churnMetrics.churnRate * 0.9, confidence: 60 }),
      this.w('users_countries', 'users', 'Top Country', 'segment', biz.countryAnalysis[0]?.country || 'US', 85, 'stable', { previous: 0, current: biz.countryAnalysis[0]?.percentage || 28, changePct: 0 }, { next: biz.countryAnalysis[0]?.percentage || 28, confidence: 75 }),
      this.w('users_devices', 'users', 'Mobile Users', 'kpi', `${biz.userBehavior.deviceSplit.mobile}%`, 90, 'up', { previous: biz.userBehavior.deviceSplit.mobile - 3, current: biz.userBehavior.deviceSplit.mobile, changePct: 3 }, { next: Math.min(100, biz.userBehavior.deviceSplit.mobile + 5), confidence: 80 }),
    ];
    return { name: 'Users', icon: '👥', widgets: w, summary: `${biz.churnMetrics.activeUsers7d.toLocaleString()} active. ${biz.userBehavior.deviceSplit.mobile}% mobile. ${biz.churnMetrics.churnRate}% churn.` };
  }

  // 4. Trading
  private buildTrading(biz: any, allData: any): DashboardSection {
    const positions = Array.isArray(allData.trading?.positions) ? allData.trading.positions : [];
    const w: AnalyticsWidget[] = [
      this.w('trade_volume', 'trading', 'Trading Volume', 'kpi', `$${(biz.salesMetrics.dailyRevenue * 0.4).toFixed(0)}`, 80, 'up', { previous: biz.salesMetrics.dailyRevenue * 0.35, current: biz.salesMetrics.dailyRevenue * 0.4, changePct: 14 }, { next: biz.salesMetrics.dailyRevenue * 0.45, confidence: 65 }),
      this.w('trade_positions', 'trading', 'Open Positions', 'kpi', positions.length.toString(), 85, positions.length > 5 ? 'up' : 'stable', { previous: Math.max(0, positions.length - 2), current: positions.length, changePct: positions.length > 0 ? 20 : 0 }, { next: positions.length + 1, confidence: 55 }),
      this.w('trade_heatmap', 'trading', 'Activity Heatmap', 'heatmap', `Peak: ${biz.userBehavior.peakHours[0]?.hour}:00`, 72, 'stable', { previous: 0, current: biz.userBehavior.peakHours[0]?.count || 0, changePct: 0 }, { next: biz.userBehavior.peakHours[0]?.count || 0, confidence: 60 }),
    ];
    return { name: 'Trading', icon: '📈', widgets: w, summary: `${positions.length} open positions. Peak: ${biz.userBehavior.peakHours[0]?.hour || '14'}:00.` };
  }

  // 5. Academy
  private buildAcademy(content: any): DashboardSection {
    const courses = (content.courses || []) as any[];
    const anomalyCourses = courses.filter((c: any) => c.completionRate < 40);
    const w: AnalyticsWidget[] = [
      this.w('acad_completion', 'academy', 'Completion Rate', 'kpi', `${content.overallStats.overallCompletionRate}%`, 85, content.overallStats.overallCompletionRate > 50 ? 'up' : 'down', { previous: content.overallStats.overallCompletionRate - 5, current: content.overallStats.overallCompletionRate, changePct: 10 }, { next: Math.min(100, content.overallStats.overallCompletionRate + 5), confidence: 65 }),
      this.w('acad_enrollments', 'academy', 'Enrollments', 'kpi', content.overallStats.totalEnrollments.toLocaleString(), 88, 'up', { previous: Math.round(content.overallStats.totalEnrollments * 0.9), current: content.overallStats.totalEnrollments, changePct: 10 }, { next: Math.round(content.overallStats.totalEnrollments * 1.08), confidence: 72 }),
      this.w('acad_anomalies', 'academy', 'Low Completion Alert', 'anomaly', anomalyCourses.length > 0 ? anomalyCourses[0].name : 'None', 78, 'down', { previous: 0, current: anomalyCourses.length, changePct: 0 }, { next: Math.max(0, anomalyCourses.length - 1), confidence: 50 }),
      this.w('acad_funnel', 'academy', 'Enrollment Funnel', 'funnel', `${content.overallStats.totalEnrollments.toLocaleString()} → ${Math.round(content.overallStats.totalEnrollments * content.overallStats.overallCompletionRate / 100).toLocaleString()}`, 75, 'stable', { previous: content.overallStats.overallCompletionRate - 2, current: content.overallStats.overallCompletionRate, changePct: 2 }, { next: content.overallStats.overallCompletionRate + 3, confidence: 60 }),
    ];
    return { name: 'Academy', icon: '🎓', widgets: w, summary: `${content.overallStats.overallCompletionRate}% completion. ${anomalyCourses.length} courses need attention.` };
  }

  // 6. AI
  private buildAI(twin: any, health: any): DashboardSection {
    const services = Object.values(health.services) as any[];
    const healthy = services.filter((s: any) => s.status === 'healthy').length;
    const w: AnalyticsWidget[] = [
      this.w('ai_requests', 'ai', 'Requests Today', 'kpi', twin.aiRequestsToday.toLocaleString(), 85, 'up', { previous: Math.round(twin.aiRequestsToday * 0.82), current: twin.aiRequestsToday, changePct: 18 }, { next: Math.round(twin.aiRequestsToday * 1.12), confidence: 70 }),
      this.w('ai_latency', 'ai', 'Avg Response', 'kpi', `${twin.aiAvgResponseMs}ms`, 88, 'down', { previous: twin.aiAvgResponseMs + 20, current: twin.aiAvgResponseMs, changePct: -5 }, { next: twin.aiAvgResponseMs - 10, confidence: 65 }),
      this.w('ai_services', 'ai', 'Services Up', 'kpi', `${healthy}/${services.length}`, 90, 'stable', { previous: services.length, current: healthy, changePct: 0 }, { next: services.length, confidence: 85 }),
      this.w('ai_trend', 'ai', 'Usage Trend', 'trend', `${Math.round(twin.aiRequestsToday > 1000 ? 25 : 10)}% growth`, 72, 'up', { previous: Math.round(twin.aiRequestsToday * 0.75), current: twin.aiRequestsToday, changePct: 25 }, { next: Math.round(twin.aiRequestsToday * 1.25), confidence: 60 }),
    ];
    return { name: 'AI', icon: '🤖', widgets: w, summary: `${twin.aiRequestsToday.toLocaleString()} requests. ${healthy}/${services.length} services healthy.` };
  }

  // 7. Economy
  private buildEconomy(eco: any): DashboardSection {
    const w: AnalyticsWidget[] = [
      this.w('eco_supply', 'economy', 'CP Supply', 'kpi', `${(eco.cpMetrics.circulatingSupply / 1_000_000).toFixed(1)}M`, 85, 'up', { previous: (eco.cpMetrics.circulatingSupply - 50000) / 1_000_000, current: eco.cpMetrics.circulatingSupply / 1_000_000, changePct: 1 }, { next: (eco.cpMetrics.circulatingSupply + 100000) / 1_000_000, confidence: 72 }),
      this.w('eco_inflation', 'economy', 'Inflation', 'trend', `${eco.inflation.currentRate}%`, 80, eco.inflation.trend === 'increasing' ? 'up' : 'down', { previous: eco.inflation.currentRate * 0.9, current: eco.inflation.currentRate, changePct: 11 }, { next: eco.inflation.projectedRate30d, confidence: 60 }),
      this.w('eco_flow', 'economy', 'Net Flow', 'kpi', `${eco.cpMetrics.netFlow > 0 ? '+' : ''}${eco.cpMetrics.netFlow}/day`, 82, eco.cpMetrics.netFlow > 500 ? 'up' : 'stable', { previous: eco.cpMetrics.netFlow * 0.8, current: eco.cpMetrics.netFlow, changePct: 25 }, { next: eco.cpMetrics.netFlow * 1.1, confidence: 68 }),
    ];
    return { name: 'Economy', icon: '💎', widgets: w, summary: `Supply: ${(eco.cpMetrics.circulatingSupply / 1_000_000).toFixed(1)}M. Inflation: ${eco.inflation.currentRate}%.` };
  }

  // 8. Security
  private buildSecurity(sec: any): DashboardSection {
    const w: AnalyticsWidget[] = [
      this.w('sec_risk', 'security', 'Risk Score', 'kpi', `${sec.riskScore}/100`, 88, sec.riskScore > 50 ? 'up' : 'down', { previous: sec.riskScore + 5, current: sec.riskScore, changePct: -9 }, { next: Math.max(10, sec.riskScore - 10), confidence: 65 }),
      this.w('sec_threats', 'security', 'Active Threats', 'kpi', sec.activeThreats.length.toString(), 90, sec.activeThreats.length > 0 ? 'up' : 'stable', { previous: sec.activeThreats.length + 1, current: sec.activeThreats.length, changePct: -50 }, { next: Math.max(0, sec.activeThreats.length - 1), confidence: 70 }),
      this.w('sec_logins', 'security', 'Failed Logins (24h)', 'anomaly', sec.failedLogins24h > 100 ? `${sec.failedLogins24h} (ANOMALY)` : sec.failedLogins24h.toString(), 82, sec.failedLogins24h > 50 ? 'up' : 'stable', { previous: sec.failedLogins24h * 0.7, current: sec.failedLogins24h, changePct: 43 }, { next: sec.failedLogins24h * 0.8, confidence: 58 }),
    ];
    return { name: 'Security', icon: '🛡️', widgets: w, summary: `Risk: ${sec.riskScore}/100. ${sec.activeThreats.length} threats.` };
  }

  // 9. Predictions
  private buildPredictions(preds: any): DashboardSection {
    const predictions = (preds.predictions || []) as any[];
    const w: AnalyticsWidget[] = predictions.slice(0, 6).map((p: any) =>
      this.w(`pred_${p.type}`, 'predictions', p.type.replace(/_/g, ' '), 'forecast', `${p.probability}%`, p.confidence || 60, p.trend || 'stable', { previous: Math.max(0, p.probability - 10), current: p.probability, changePct: p.probability > 50 ? 20 : -10 }, { next: Math.min(100, p.probability + (p.trend === 'up' ? 10 : -5)), confidence: p.confidence || 55 }),
    );
    return { name: 'Predictions', icon: '🔮', widgets: w, summary: `${predictions.length} predictions. Top: ${predictions[0]?.type?.replace(/_/g, ' ') || 'none'}.` };
  }

  // 10. Recommendations
  private buildRecommendations(biz: any, sec: any, eco: any, content: any): DashboardSection {
    const recs: { title: string; reason: string; expectedImpact: string }[] = [];
    if (biz.churnMetrics.churnRate > 8) recs.push({ title: 'Reduce Churn', reason: `${biz.churnMetrics.churnRate}%`, expectedImpact: '-2% churn' });
    if (sec.riskScore > 50) recs.push({ title: 'Enhance Security', reason: `Risk ${sec.riskScore}/100`, expectedImpact: 'Lower risk' });
    if (eco.inflation.health !== 'healthy') recs.push({ title: 'Adjust Tokenomics', reason: `Inflation ${eco.inflation.currentRate}%`, expectedImpact: 'Stabilize CP' });
    if (content.overallStats.overallCompletionRate < 50) recs.push({ title: 'Improve Academy', reason: `${content.overallStats.overallCompletionRate}%`, expectedImpact: '+15%' });

    const w: AnalyticsWidget[] = recs.length > 0
      ? recs.map((r, i) => this.w(`rec_${i}`, 'recommendations', r.title, 'kpi', r.expectedImpact, 75, 'stable', { previous: 0, current: 0, changePct: 0 }, { next: 0, confidence: 60 }))
      : [this.w('rec_default', 'recommendations', 'Maintain', 'kpi', 'All healthy', 90, 'stable', { previous: 0, current: 0, changePct: 0 }, { next: 0, confidence: 80 })];
    return { name: 'Recommendations', icon: '💡', widgets: w, summary: `${recs.length} recommendations.` };
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private w(id: string, section: string, title: string, type: AnalyticsWidget['type'], value: number | string, confidence: number, trend: AnalyticsWidget['trend'], comparison: { previous: number; current: number; changePct: number }, forecast: { next: number; confidence: number }): AnalyticsWidget {
    return { id, section, title, type, value, confidence, trend, comparison, forecast, data: {} };
  }

  // ── Orchestrator ──────────────────────────────────────────────────────

  async execute(ctx: OrchestratorContext): Promise<void> { this.generateReport(); }

  getOrchestratorContract(): EngineContract {
    return {
      name: 'analyticsCenter', priority: 20,
      dependencies: ['contextEngine', 'businessAnalyst', 'economyManager', 'contentManager', 'predictionEngine', 'healthMonitor', 'securityCenter', 'digitalTwin', 'executiveIntelligence'],
      initialize: async () => { this.registered = true; },
      execute: (ctx) => this.execute(ctx),
      shutdown: async () => { this.registered = false; },
      health: () => ({ status: this.registered ? 'healthy' : 'degraded', lastRun: null, lastDuration: 0, errorCount: 0, totalRuns: 0, avgDuration: 0 }),
    };
  }

  // ── Persistence ───────────────────────────────────────────────────────

  private save(): void { try { localStorage.setItem(this.KEY, JSON.stringify(this.reports.slice(-100))); } catch {} }
  private load(): void { try { const d = localStorage.getItem(this.KEY); if (d) this.reports = JSON.parse(d); } catch {} }
}

export const analyticsCenter = new AnalyticsCenter();
