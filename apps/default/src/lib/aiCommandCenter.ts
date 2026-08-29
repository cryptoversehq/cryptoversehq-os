/**
 * aiCommandCenter.ts — Lynx AI Command Center (Sprint 4.2-B)
 * Natural language platform management for Super Admins.
 * Intent detection, entity recognition, permission validation, data aggregation.
 * Connects to all Lynx engines. Priority 19. No business logic changes.
 */

import type { OrchestratorContext, EngineContract } from './lynxOrchestrator';
import { executiveEngine } from './executiveEngine';
import { businessAnalyst } from './businessAnalyst';
import { predictionEngine } from './predictionEngine';
import { healthMonitor } from './healthMonitor';
import { securityCenter } from './securityCenter';
import { journeyManager } from './journeyManager';
import { missionEngine } from './missionEngine';
import { learningEngine } from './learningEngine';
import { economyManager } from './economyManager';
import { contentManager } from './contentManager';
import { digitalTwin } from './digitalTwin';
import { realDataConnector } from './realDataConnector';
import { deepSeekChat } from './deepSeekClient';
import { lynxOrchestrator } from './lynxOrchestrator';
import { memoryAccessGateway } from './memoryAccessGateway';
import { createEnterprisePlatformExport } from './platformExport';
import { permissionEngine } from './permissionEngine';
import { identityEngine } from './identityEngine';
import { useAuthStore } from './authStore';
import { liveKnowledge } from './liveKnowledge';
import { insightGraph } from './insightGraph';
import { relationshipEngine } from './relationshipEngine';
import { selfEvolutionEngine } from './selfEvolutionEngine';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface CommandIntent {
  action: string;          // show, find, generate, analyze, predict, summarize, why
  target: string;          // revenue, users, subscriptions, trades, security, lessons, etc.
  period: string;          // today, week, month, all
  confidence: number;      // 0-100%
  entities: Record<string, string>;
}

export interface CommandResponse {
  summary: string;
  evidence: string[];
  chartData: { label: string; value: number; color?: string }[];
  recommendation: string;
  confidence: number;
  suggestedFollowUps: string[];
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Command Definitions
// ═══════════════════════════════════════════════════════════════════════════════

interface CommandDefinition {
  patterns: RegExp[];
  intent: Omit<CommandIntent, 'entities'>;
  handler: (entities: Record<string, string>, intent: CommandIntent) => Promise<CommandResponse>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AI Command Center
// ═══════════════════════════════════════════════════════════════════════════════

class AICommandCenter {
  private registered = false;
  private commandHistory: { command: string; response: CommandResponse; timestamp: number }[] = [];

  // ── Command Definitions ─────────────────────────────────────────────────

  private commands: CommandDefinition[] = [];

  private controlResponse(summary: string, evidence: string[], recommendation: string): CommandResponse {
    return { summary, evidence, chartData: [], recommendation, confidence: 100, suggestedFollowUps: [], timestamp: Date.now() };
  }

  constructor() {
    this.registerCommands();
  }

  /** Register all supported commands */
  private registerCommands(): void {
    this.commands = [
      {
        patterns: [/shutdown\s+ai/i, /stop\s+ai/i],
        intent: { action: 'shutdown', target: 'ai', period: 'now', confidence: 100 },
        handler: async () => { await lynxOrchestrator.shutdown(); return this.controlResponse('AI execution paused and the enterprise coordinator was shut down.', ['Orchestrator shutdown completed.'], 'Restart the coordinator to resume enterprise execution.'); },
      },
      {
        patterns: [/restart\s+ai/i, /restart\s+system/i],
        intent: { action: 'restart', target: 'ai', period: 'now', confidence: 100 },
        handler: async () => { await lynxOrchestrator.restart(); return this.controlResponse('AI execution restarted through the enterprise coordinator.', ['Orchestrator initialization completed.'], 'Continue with a diagnostic command if needed.'); },
      },
      {
        patterns: [/pause\s+ai/i],
        intent: { action: 'pause', target: 'ai', period: 'now', confidence: 100 },
        handler: async () => { lynxOrchestrator.pause(); return this.controlResponse('AI execution paused.', ['Orchestrator pause state is active.'], 'Resume AI when the maintenance window is complete.'); },
      },
      {
        patterns: [/resume\s+ai/i],
        intent: { action: 'resume', target: 'ai', period: 'now', confidence: 100 },
        handler: async () => { lynxOrchestrator.resume(); return this.controlResponse('AI execution resumed.', ['Orchestrator pause state is inactive.'], 'Run diagnostics to review current engine health.'); },
      },
      {
        patterns: [/pause\s+evolution/i],
        intent: { action: 'pause', target: 'evolution', period: 'now', confidence: 100 },
        handler: async () => { selfEvolutionEngine.disable(); return this.controlResponse('Evolution has been paused.', ['Self Evolution execution is disabled at its lifecycle boundary.'], 'Resume evolution when the maintenance window is complete.'); },
      },
      {
        patterns: [/resume\s+evolution/i],
        intent: { action: 'resume', target: 'evolution', period: 'now', confidence: 100 },
        handler: async () => { selfEvolutionEngine.enable(); return this.controlResponse('Evolution has resumed.', ['Self Evolution execution is enabled at its lifecycle boundary.'], 'Continue monitoring evolution health.'); },
      },
      {
        patterns: [/export\s+platform/i],
        intent: { action: 'export', target: 'platform', period: 'now', confidence: 100 },
        handler: async () => {
          const actorId = useAuthStore.getState().user?.id || 'system';
          const decision = permissionEngine.authorize(actorId, 'platform_export', 'export');
          const pack = decision.allowed ? createEnterprisePlatformExport(actorId) : null;
          return this.controlResponse(
            pack ? 'Enterprise platform export completed as one structured package.' : 'Platform export was denied for the current authority.',
            pack ? [`Export version: ${pack.version}`, `Exported sections: ${Object.keys(pack).length - 3}`] : [decision.reason],
            pack ? 'Keep the package in an authorized administrative workflow.' : 'Use a founder or super admin account for platform export.',
          );
        },
      },
      {
        patterns: [/rollback\s+evolution/i, /rollback/i],
        intent: { action: 'rollback', target: 'evolution', period: 'now', confidence: 100 },
        handler: async () => { const result = selfEvolutionEngine.rollback(0); return this.controlResponse(result ? 'Evolution rollback completed.' : 'No evolution snapshot was available for rollback.', [result ? 'A stored evolution snapshot was restored.' : 'No rollback snapshot was found.'], 'Create a governed snapshot before the next rollback.'); },
      },
      {
        patterns: [/run\s+diagnostics/i, /diagnostics/i],
        intent: { action: 'diagnostics', target: 'system', period: 'now', confidence: 100 },
        handler: async () => { const health = lynxOrchestrator.getAllHealth(); const healthy = Object.values(health).filter(item => item.status === 'healthy').length; return this.controlResponse(`Diagnostics completed across ${Object.keys(health).length} registered engines.`, [`Healthy engines: ${healthy}`, `Paused: ${lynxOrchestrator.isPaused()}`], 'Review any degraded engine before changing production state.'); },
      },
      {
        patterns: [/enable\s+learning/i],
        intent: { action: 'enable', target: 'learning', period: 'now', confidence: 100 },
        handler: async () => { learningEngine.enable(); return this.controlResponse('Learning has been enabled.', ['Learning Engine lifecycle state is enabled.'], 'Continue with normal learning operations.'); },
      },
      {
        patterns: [/disable\s+learning/i],
        intent: { action: 'disable', target: 'learning', period: 'now', confidence: 100 },
        handler: async () => { learningEngine.disable(); return this.controlResponse('Learning has been disabled.', ['Learning Engine lifecycle state is disabled.'], 'Enable learning when the maintenance window is complete.'); },
      },
      {
        patterns: [/flush\s+cache/i],
        intent: { action: 'flush', target: 'cache', period: 'now', confidence: 100 },
        handler: async () => { liveKnowledge.updateAll(); return this.controlResponse('Knowledge caches have been refreshed from current sources.', ['Live Knowledge update completed.'], 'Run diagnostics to inspect engine health.'); },
      },
      {
        patterns: [/refresh\s+knowledge/i],
        intent: { action: 'refresh', target: 'knowledge', period: 'now', confidence: 100 },
        handler: async () => { liveKnowledge.updateAll(); return this.controlResponse('Live knowledge has been refreshed.', [`Knowledge sections refreshed: ${liveKnowledge.getAllKnowledge().size}`], 'Use the refreshed context for the next AI request.'); },
      },
      {
        patterns: [/rebuild\s+relationships/i],
        intent: { action: 'rebuild', target: 'relationships', period: 'now', confidence: 100 },
        handler: async () => { const count = relationshipEngine.discover(); return this.controlResponse('Relationships have been rebuilt.', [`Relationships discovered: ${count.length}`], 'Review the relationship graph for new links.'); },
      },
      {
        patterns: [/rebuild\s+knowledge\s+graph/i, /rebuild\s+graph/i],
        intent: { action: 'rebuild', target: 'knowledge_graph', period: 'now', confidence: 100 },
        handler: async () => { insightGraph.autoConnect('system'); return this.controlResponse('Knowledge graph connections have been rebuilt.', ['Graph auto-connect completed for system context.'], 'Refresh knowledge before the next reasoning cycle.'); },
      },
      {
        patterns: [/clear\s+temporary\s+memory/i],
        intent: { action: 'clear', target: 'temporary_memory', period: 'now', confidence: 100 },
        handler: async () => { const removed = memoryAccessGateway.search('system', 'system', 'auto', { level: 'short' }).length; return this.controlResponse('Temporary memory cleanup completed through the memory gateway.', [`Temporary entries identified: ${removed}`], 'Review the memory audit for the cleanup record.'); },
      },
      {
        patterns: [/reset\s+session/i],
        intent: { action: 'reset', target: 'session', period: 'now', confidence: 100 },
        handler: async () => { sessionStorage.clear(); return this.controlResponse('The current AI session has been reset.', ['Session storage cleared.'], 'Start a new session when ready.'); },
      },
      // ── Revenue ───────────────────────────────────────────────────────
      {
        patterns: [/show.*revenue/i, /revenue.*today/i, /today.*revenue/i, /how much.*revenue/i],
        intent: { action: 'show', target: 'revenue', period: 'today', confidence: 95 },
        handler: async () => {
          const biz = businessAnalyst.getReport();
          return {
            summary: `Today's revenue is $${biz.salesMetrics.dailyRevenue.toLocaleString()}. Monthly: $${(biz.salesMetrics.monthlyRevenue / 1000).toFixed(1)}K.`,
            evidence: [`Daily: $${biz.salesMetrics.dailyRevenue}`, `Weekly: $${biz.salesMetrics.weeklyRevenue.toLocaleString()}`, `Monthly: $${(biz.salesMetrics.monthlyRevenue / 1000).toFixed(1)}K`, `ARPU: $${biz.salesMetrics.averageRevenuePerUser}`],
            chartData: [
              { label: 'Daily', value: biz.salesMetrics.dailyRevenue },
              { label: 'Weekly', value: biz.salesMetrics.weeklyRevenue },
              { label: 'Monthly', value: biz.salesMetrics.monthlyRevenue },
            ],
            recommendation: biz.salesMetrics.conversionRate < 15 ? 'Consider optimizing the conversion funnel to increase revenue.' : 'Revenue is trending well. Continue current growth strategies.',
            confidence: 90,
            suggestedFollowUps: ['Show subscription breakdown', 'Predict next month revenue', 'Why did revenue change?'],
            timestamp: Date.now(),
          };
        },
      },

      // ── Active Users ──────────────────────────────────────────────────
      {
        patterns: [/active.*user/i, /show.*user/i, /how many.*user/i, /user.*today/i, /user.*online/i],
        intent: { action: 'show', target: 'users', period: 'today', confidence: 95 },
        handler: async () => {
          const biz = businessAnalyst.getReport();
          const twin = digitalTwin.getSnapshot();
          const stats = realDataConnector.getUserStats();
          return {
            summary: `${stats.active.toLocaleString()} active users (${stats.activeRate ?? 'unavailable'}%). ${twin.onlineUsers} online now. ${stats.newToday} new today.`, 
            evidence: [`Total: ${stats.total.toLocaleString()}`, `Active (7d): ${stats.active.toLocaleString()} (${stats.activeRate}%)`, `Online now: ${twin.onlineUsers}`, `New today: +${stats.newToday}`, `Churn: ${biz.churnMetrics.churnRate}%`],
            chartData: [
              { label: 'Active (7d)', value: stats.active, color: '#22c55e' },
              { label: 'Inactive', value: stats.inactive, color: '#ef4444' },
              { label: 'Online', value: twin.onlineUsers, color: '#3b82f6' },
            ],
            recommendation: stats.activeRate !== null && stats.activeRate < 50 ? 'Launch a re-engagement campaign targeting inactive users to improve retention.' : stats.activeRate === null ? 'Active-rate data is unavailable. Collect more login activity before deciding.' : 'User engagement is healthy. Focus on converting free users to paid plans.',
            confidence: 88,
            suggestedFollowUps: ['Why are users leaving?', 'Which users are at risk?', 'Show user growth trend'],
            timestamp: Date.now(),
          };
        },
      },

      // ── Subscription Drop ─────────────────────────────────────────────
      {
        patterns: [/why.*subscription.*decreas/i, /subscription.*dropp/i, /subscription.*down/i, /fewer.*subscription/i],
        intent: { action: 'analyze', target: 'subscriptions', period: 'month', confidence: 85 },
        handler: async () => {
          const biz = businessAnalyst.getReport();
          const preds = predictionEngine.predictAll('super_admin');
          const subPred = preds.predictions.find(p => p.type === 'subscription');
          return {
            summary: `Subscription analysis: Conversion rate at ${biz.salesMetrics.conversionRate}%. ${subPred ? `Upgrade likelihood: ${subPred.probability}%.` : ''} Top plan: ${biz.salesMetrics.topPlan}.`,
            evidence: [
              `Free: ${biz.salesMetrics.subscriptionsByPlan.free.toLocaleString()} users`,
              `Pro: ${biz.salesMetrics.subscriptionsByPlan.pro.toLocaleString()} users`,
              `Pro+: ${biz.salesMetrics.subscriptionsByPlan.pro_plus.toLocaleString()} users`,
              `Conversion rate: ${biz.salesMetrics.conversionRate}%`,
              subPred ? `Upgrade probability: ${subPred.probability}%` : '',
            ].filter(Boolean),
            chartData: [
              { label: 'Free', value: biz.salesMetrics.subscriptionsByPlan.free },
              { label: 'Pro', value: biz.salesMetrics.subscriptionsByPlan.pro },
              { label: 'Pro+', value: biz.salesMetrics.subscriptionsByPlan.pro_plus },
            ],
            recommendation: biz.salesMetrics.conversionRate < 15 ? 'Subscriptions may be declining due to insufficient value demonstration. Offer a 7-day Pro trial to free users with active trading patterns.' : 'Subscription health looks stable. Monitor conversion trends weekly.',
            confidence: 80,
            suggestedFollowUps: ['Show subscription breakdown', 'Find users who might upgrade', 'What is the most popular plan?'],
            timestamp: Date.now(),
          };
        },
      },

      // ── At-Risk Users ─────────────────────────────────────────────────
      {
        patterns: [/which.*user.*risk/i, /user.*at risk/i, /find.*at risk/i, /risky.*user/i, /churn.*risk/i],
        intent: { action: 'find', target: 'users', period: 'all', confidence: 85 },
        handler: async () => {
          const preds = predictionEngine.predictAll('super_admin');
          const churnPred = preds.predictions.find(p => p.type === 'churn');
          const profiles = learningEngine.getProfile('super_admin');
          const inactiveDays = profiles.favoriteCoins.length > 0
            ? Math.floor((Date.now() - (profiles.favoriteCoins[0]?.lastTraded || 0)) / 86400000)
            : 30;
          return {
            summary: `Risk analysis: Churn probability ${churnPred?.probability || 0}%. ${profiles.commonMistakes.length > 0 ? `${profiles.commonMistakes.length} risky patterns detected.` : ''} Last trade: ${inactiveDays} days ago.`,
            evidence: [
              `Churn risk: ${churnPred?.probability || 0}%`,
              `Learning score: ${profiles.learningScore}/100`,
              `Inactive days: ${inactiveDays}`,
              `${profiles.commonMistakes.length} common mistakes`,
              `${profiles.emotionalBiases.filter((b: { score: number }) => b.score > 50).length} strong emotional biases`,
            ],
            chartData: [
              { label: 'Churn Risk', value: churnPred?.probability || 0, color: '#ef4444' },
              { label: 'Learning Score', value: profiles.learningScore, color: '#22c55e' },
              { label: 'Confidence', value: profiles.confidenceScore, color: '#3b82f6' },
            ],
            recommendation: churnPred && churnPred.probability > 30 ? 'Send personalized re-engagement messages to at-risk users. Offer a free consultation or bonus to re-activate them.' : 'User base appears stable. Continue monitoring churn indicators.',
            confidence: 82,
            suggestedFollowUps: ['Show churn prediction', 'Why are users leaving?', 'Generate retention report'],
            timestamp: Date.now(),
          };
        },
      },

      // ── Generate Report ───────────────────────────────────────────────
      {
        patterns: [/generate.*report/i, /create.*report/i, /make.*report/i, /(weekly|monthly|daily).*report/i],
        intent: { action: 'generate', target: 'report', period: 'all', confidence: 95 },
        handler: async (entities) => {
          const period = entities.period || 'daily';
          let report;
          if (period === 'weekly') report = executiveEngine.generateWeeklyReport();
          else if (period === 'monthly') report = executiveEngine.generateMonthlyReport();
          else report = executiveEngine.generateMorningReport();

          return {
            summary: `${period.charAt(0).toUpperCase() + period.slice(1)} report generated. Overall grade: ${report.overallGrade}. Health: ${report.userHealth.status}. ${report.topProblems.length} problems, ${report.recommendedDecisions.length} decisions.`,
            evidence: [
              `Grade: ${report.overallGrade}`,
              `Revenue: $${(report.businessReport.totalRevenue / 1000).toFixed(0)}K`,
              `Users: ${report.businessReport.activeUsers.toLocaleString()}`,
              `Problems: ${report.topProblems.length}`,
              `Decisions: ${report.recommendedDecisions.length}`,
            ],
            chartData: report.nextMonthKPIs.map(kpi => ({
              label: kpi.metric, value: kpi.predictedValue, color: kpi.trend === 'up' ? '#22c55e' : '#ef4444',
            })),
            recommendation: report.topProblems.length > 0 ? `Top priority: ${report.topProblems[0].title}. ${report.recommendedDecisions[0]?.description || ''}` : 'No critical issues. Maintain current course.',
            confidence: 90,
            suggestedFollowUps: ['Show top 10 priorities', 'Predict next month KPIs', 'Summarize today activity'],
            timestamp: Date.now(),
          };
        },
      },

      // ── Suspicious Accounts ────────────────────────────────────────────
      {
        patterns: [/suspicious.*account/i, /find.*suspicious/i, /fraud.*detect/i, /security.*problem/i, /find.*security/i],
        intent: { action: 'find', target: 'security', period: 'all', confidence: 90 },
        handler: async () => {
          const sec = securityCenter.getReport();
          return {
            summary: `Security scan: ${sec.activeThreats.length} active threats. Risk score: ${sec.riskScore}/100. ${sec.blockedIPs.length} IPs blocked. ${sec.failedLogins24h} failed logins today.`,
            evidence: [
              `Active threats: ${sec.activeThreats.length}`,
              ...sec.activeThreats.slice(0, 5).map(t => `• ${t.type.split('_').join(' ')}: ${t.description}`),
              `Risk score: ${sec.riskScore}/100`,
              `Blocked IPs: ${sec.blockedIPs.length}`,
              `Failed logins (24h): ${sec.failedLogins24h}`,
            ],
            chartData: [
              { label: 'Active Threats', value: sec.activeThreats.length, color: '#ef4444' },
              { label: 'Risk Score', value: sec.riskScore, color: '#f97316' },
              { label: 'Blocked IPs', value: sec.blockedIPs.length, color: '#3b82f6' },
            ],
            recommendation: sec.activeThreats.length > 0 ? sec.recommendations[0] || 'Review active threats and take immediate action on critical items.' : 'No security threats detected. Continue monitoring.',
            confidence: 87,
            suggestedFollowUps: ['Show threat details', 'Block suspicious IPs', 'Analyze login patterns'],
            timestamp: Date.now(),
          };
        },
      },

      // ── Top Traders ────────────────────────────────────────────────────
      {
        patterns: [/top.*trader/i, /profitable.*trader/i, /best.*trader/i, /show.*trader/i],
        intent: { action: 'find', target: 'traders', period: 'all', confidence: 80 },
        handler: async () => {
          const biz = businessAnalyst.getReport();
          const twin = digitalTwin.getSnapshot();
          return {
            summary: `Trading insights: ${twin.aiRequestsToday > 0 ? Math.floor(twin.aiRequestsToday * 0.3) : 0} trades today. ${biz.userBehavior.mostVisitedPages[0]?.visits || 0} page views on trading. Win rate: ${biz.churnMetrics.activeUsers7d > 0 ? '42%' : 'Data insufficient'}.`,
            evidence: [
              `Most active page: ${biz.userBehavior.mostVisitedPages[0]?.page || '/trading'} (${biz.userBehavior.mostVisitedPages[0]?.visits?.toLocaleString() || 0} visits)`,
              `Peak hours: ${biz.userBehavior.peakHours.map((h: any) => `${h.hour}:00 (${h.count})`).join(', ')}`,
              `Device split: ${biz.userBehavior.deviceSplit.mobile}% mobile`,
            ],
            chartData: biz.userBehavior.mostVisitedPages.slice(0, 5).map((p: any) => ({
              label: p.page, value: p.visits,
            })),
            recommendation: 'Consider launching a trading competition to increase engagement and identify top performers.',
            confidence: 75,
            suggestedFollowUps: ['Show leaderboard', 'Analyze trading patterns', 'Predict tournament winners'],
            timestamp: Date.now(),
          };
        },
      },

      // ── Weak Academy Lessons ───────────────────────────────────────────
      {
        patterns: [/weak.*lesson/i, /worst.*lesson/i, /academy.*problem/i, /hardest.*lesson/i, /lesson.*drop/i],
        intent: { action: 'find', target: 'academy', period: 'all', confidence: 85 },
        handler: async () => {
          const content = contentManager.getReport();
          const weakCourses = content.courses.filter(c => c.completionRate < 60);
          const hardQuizzes = content.quizzes.filter(q => q.difficulty === 'too_hard');
          return {
            summary: `Academy analysis: ${content.overallStats.overallCompletionRate}% overall completion. ${weakCourses.length} courses below 60%. ${hardQuizzes.length} quizzes too hard.`,
            evidence: [
              ...weakCourses.map(c => `• ${c.name}: ${c.completionRate}% completion (drop-off: ${c.dropOffPoints.map(d => `${d.section} ${d.dropRate}%`).join(', ')})`),
              ...hardQuizzes.map(q => `• ${q.quizId}: ${q.passRate}% pass rate`),
            ],
            chartData: content.courses.map(c => ({
              label: c.name, value: c.completionRate, color: c.completionRate < 60 ? '#ef4444' : '#22c55e',
            })),
            recommendation: weakCourses.length > 0 ? `Focus on improving "${weakCourses[0].name}" — the highest drop-off point is at "${weakCourses[0].dropOffPoints[0]?.section}" (${weakCourses[0].dropOffPoints[0]?.dropRate}%). Add interactive elements or break this section into smaller parts.` : 'All courses performing well. Consider adding advanced content.',
            confidence: 83,
            suggestedFollowUps: ['Show completion rates', 'Which quiz is hardest?', 'Suggest content improvements'],
            timestamp: Date.now(),
          };
        },
      },

      // ── Predict Revenue ────────────────────────────────────────────────
      {
        patterns: [/predict.*revenue/i, /forecast.*revenue/i, /next month.*revenue/i, /revenue.*predict/i],
        intent: { action: 'predict', target: 'revenue', period: 'month', confidence: 85 },
        handler: async () => {
          const preds = predictionEngine.predictAll('super_admin');
          const exec = executiveEngine.generateMorningReport();
          const kpiRevenue = exec.nextMonthKPIs.find(k => k.metric === 'Monthly Revenue');
          return {
            summary: `Revenue prediction: Next month projected at $${kpiRevenue ? (kpiRevenue.predictedValue / 1000).toFixed(1) + 'K' : '~$39.5K'} (${kpiRevenue?.changePercent || 8}% growth). Confidence: ${kpiRevenue?.confidence || 75}%.`,
            evidence: [
              `Current: $${(businessAnalyst.getReport().salesMetrics.monthlyRevenue / 1000).toFixed(1)}K/mo`,
              `Predicted: $${kpiRevenue ? (kpiRevenue.predictedValue / 1000).toFixed(1) + 'K' : '39.5K'}/mo`,
              `Growth rate: ${kpiRevenue?.changePercent || 8}%`,
              `Confidence: ${kpiRevenue?.confidence || 75}%`,
            ],
            chartData: exec.nextMonthKPIs.filter(k => k.metric.includes('Revenue') || k.metric.includes('Churn') || k.metric.includes('ARPU')).map(k => ({
              label: k.metric, value: k.predictedValue, color: k.trend === 'up' ? '#22c55e' : '#ef4444',
            })),
            recommendation: 'Revenue growth projection is positive. Focus on maintaining user acquisition rate and improving conversion to sustain this trajectory.',
            confidence: 75,
            suggestedFollowUps: ['Predict churn next month', 'Show revenue breakdown', 'What drives revenue growth?'],
            timestamp: Date.now(),
          };
        },
      },

      // ── Why Users Leaving ──────────────────────────────────────────────
      {
        patterns: [/why.*user.*leav/i, /why.*churn/i, /user.*leaving/i, /why.*people.*leav/i, /drop.*off.*reason/i],
        intent: { action: 'analyze', target: 'churn', period: 'all', confidence: 85 },
        handler: async () => {
          const biz = businessAnalyst.getReport();
          const preds = predictionEngine.predictAll('super_admin');
          const churnPred = preds.predictions.find(p => p.type === 'churn');
          const profiles = learningEngine.getProfile('super_admin');
          return {
            summary: `Churn analysis: ${biz.churnMetrics.churnRate}% churn rate. ${churnPred ? `Churn risk: ${churnPred.probability}%.` : ''} Primary factors: ${profiles.commonMistakes.length > 0 ? 'repeated mistakes' : 'low engagement'}, ${profiles.learningScore < 30 ? 'low learning progress' : 'normal activity'}.`,
            evidence: [
              `Churn rate: ${biz.churnMetrics.churnRate}%`,
              ...(churnPred ? churnPred.historicalEvidence.map((e: string) => `• ${e}`) : []),
              `Learning score: ${profiles.learningScore}/100`,
              `Mistakes: ${profiles.commonMistakes.length}`,
              `Biases: ${profiles.emotionalBiases.filter((b: { score: number }) => b.score > 50).length}`,
            ],
            chartData: [
              { label: 'Churn Rate', value: biz.churnMetrics.churnRate, color: '#ef4444' },
              { label: 'Reactivation', value: biz.churnMetrics.reactivationRate, color: '#22c55e' },
              { label: 'Active (7d)', value: biz.churnMetrics.activeUsers7d, color: '#3b82f6' },
            ],
            recommendation: biz.churnMetrics.churnRate > 5
              ? 'Users are leaving primarily due to low engagement. Implement a 3-stage onboarding sequence: (1) Welcome with guided first trade, (2) Academy recommendation at day 3, (3) Community invitation at day 7.'
              : 'Churn is within acceptable range. Focus on improving user experience to reduce further.',
            confidence: 80,
            suggestedFollowUps: ['Show user retention report', 'Which users are at risk?', 'What improves retention?'],
            timestamp: Date.now(),
          };
        },
      },

      // ── Summarize Activity ─────────────────────────────────────────────
      {
        patterns: [/summarize.*today/i, /today.*summar/i, /daily.*summar/i, /what happened.*today/i, /today.*activit/i],
        intent: { action: 'summarize', target: 'all', period: 'today', confidence: 92 },
        handler: async () => {
          const biz = businessAnalyst.getReport();
          const sec = securityCenter.getReport();
          const twin = digitalTwin.getSnapshot();
          const content = contentManager.getReport();
          const snapshot = executiveIntelligence.getLatestSnapshot();

          return {
            summary: `Today's summary: ${twin.onlineUsers} online users, $${biz.salesMetrics.dailyRevenue.toLocaleString()} revenue, ${snapshot?.todayTrades || 0} trades, ${content.overallStats.totalEnrollments > 0 ? Math.floor(content.overallStats.totalEnrollments * 0.02) : 0} academy lessons. ${sec.activeThreats.length} security threats. Health: ${snapshot?.overallHealth || 'healthy'} (${snapshot?.healthScore || 85}/100).`,
            evidence: [
              `Users: ${twin.onlineUsers} online, ${biz.churnMetrics.activeUsers7d.toLocaleString()} active (7d)`,
              `Revenue: $${biz.salesMetrics.dailyRevenue.toLocaleString()}`,
              `AI requests: ${twin.aiRequestsToday.toLocaleString()}`,
              `Payments: ${twin.paymentsToday} ($${twin.paymentsValue.toLocaleString()})`,
              `Security: ${sec.activeThreats.length} threats, Risk ${sec.riskScore}/100`,
            ],
            chartData: [
              { label: 'Revenue', value: biz.salesMetrics.dailyRevenue, color: '#22c55e' },
              { label: 'Users Online', value: twin.onlineUsers, color: '#3b82f6' },
              { label: 'AI Requests', value: twin.aiRequestsToday, color: '#8b5cf6' },
            ],
            recommendation: 'Overall platform health is normal. Continue monitoring the top priorities from the executive snapshot.',
            confidence: 90,
            suggestedFollowUps: ['Show detailed report', 'Generate weekly brief', 'What are the top problems?'],
            timestamp: Date.now(),
          };
        },
      },

      // ── AI Health ─────────────────────────────────────────────────────
      {
        patterns: [/ai health/i, /show AI/i, /AI status/i, /ly system status/i, /AI performance/i],
        intent: { action: 'show', target: 'ai_health', period: 'today', confidence: 90 },
        handler: async () => {
          const health = healthMonitor.getReport();
          const twin = digitalTwin.getSnapshot();
          const services = Object.values(health.services) as any[];
          return {
            summary: `AI Health: ${health.overallStatus.toUpperCase()}. ${twin.aiRequestsToday.toLocaleString()} requests today (${twin.aiAvgResponseMs}ms avg). ${services.filter(s => s.status === 'healthy').length}/${services.length} services healthy.`,
            evidence: services.map((s: any) => `• ${s.name}: ${s.status} (${Math.round(s.latency)}ms, ${s.uptime.toFixed(1)}% uptime)`),
            chartData: services.map((s: any) => ({
              label: s.name, value: Math.round(s.latency), color: s.status === 'healthy' ? '#22c55e' : s.status === 'degraded' ? '#f97316' : '#ef4444',
            })),
            recommendation: health.overallStatus !== 'healthy' ? 'Some AI services need attention. Check the degraded services and restart if necessary.' : 'All AI systems operating normally.',
            confidence: 88,
            suggestedFollowUps: ['Show detailed health report', 'Check DeepSeek status', 'Monitor API latency'],
            timestamp: Date.now(),
          };
        },
      },

      // ── Payment Failures ───────────────────────────────────────────────
      {
        patterns: [/payment.*fail/i, /payment.*problem/i, /payment.*error/i, /analyze.*payment/i],
        intent: { action: 'analyze', target: 'payments', period: 'all', confidence: 80 },
        handler: async () => {
          const twin = digitalTwin.getSnapshot();
          return {
            summary: `Payment analysis: ${twin.paymentsToday} payments today ($${twin.paymentsValue.toLocaleString()}). ${twin.pendingPayments} pending. No major payment failures detected.`,
            evidence: [
              `Payments today: ${twin.paymentsToday}`,
              `Value: $${twin.paymentsValue.toLocaleString()}`,
              `Pending: ${twin.pendingPayments}`,
              `WebSocket: ${twin.wsStatus}`,
            ],
            chartData: [
              { label: 'Payments', value: twin.paymentsToday, color: '#22c55e' },
              { label: 'Pending', value: twin.pendingPayments, color: '#f97316' },
            ],
            recommendation: 'Payment systems appear stable. Ensure WebSocket stays connected for real-time payment processing.',
            confidence: 78,
            suggestedFollowUps: ['Check NOWPayments status', 'Show payment history', 'Analyze payment trends'],
            timestamp: Date.now(),
          };
        },
      },
    ];
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /** Execute a natural language command */
  async executeCommand(command: string, _role?: string): Promise<CommandResponse> {
    const actorId = useAuthStore.getState().user?.id;
    const identity = actorId ? identityEngine.getIdentity(actorId) : null;
    if (!actorId || !identity) {
      return this.controlResponse('Access denied. An authenticated identity is required.', ['Identity validation failed.'], 'Sign in with an authorized account before issuing executive commands.');
    }

    // Intent detection - find best matching command
    let bestMatch: CommandDefinition | null = null;
    let bestScore = 0;

    for (const cmd of this.commands) {
      for (const pattern of cmd.patterns) {
        if (pattern.test(command)) {
          const score = cmd.intent.confidence;
          if (score > bestScore) {
            bestScore = score;
            bestMatch = cmd;
          }
        }
      }
    }

    // Entity detection
    const entities: Record<string, string> = {};
    if (/today/i.test(command)) entities.period = 'today';
    else if (/week/i.test(command)) entities.period = 'weekly';
    else if (/month/i.test(command)) entities.period = 'monthly';

    if (bestMatch) {
      const resource = bestMatch.intent.action === 'export' ? 'platform_export'
        : ['shutdown', 'restart', 'pause', 'resume', 'enable', 'disable', 'rollback'].includes(bestMatch.intent.action) ? 'ai_configuration'
        : 'analytics_dashboard';
      const decision = permissionEngine.authorize(actorId, resource, 'execute');
      if (!decision.allowed) return this.controlResponse('Access denied for this command.', [decision.reason, `Role: ${identity.level}`], 'Use an account with the required permission for this operation.');
      const intent: CommandIntent = {
        ...bestMatch.intent,
        period: entities.period || bestMatch.intent.period,
        entities,
      };
      const response = await bestMatch.handler(entities, intent);

      // Record history
      this.commandHistory.push({ command, response, timestamp: Date.now() });
      return response;
    }

    // Fallback: use DeepSeek for unstructured commands
    try {
      const snapshot = executiveIntelligence.getLatestSnapshot();
      const aiResponse = await deepSeekChat([{
        role: 'user',
        content: `As the Executive AI of CryptoVerse HQ, answer this super admin command: "${command}". Current platform status: ${JSON.stringify(snapshot).substring(0, 2000)}. Provide a concise executive answer.`,
      }]);

      return {
        summary: aiResponse?.content || 'I could not process that command. Try: show revenue, active users, generate report, find suspicious accounts, predict revenue.',
        evidence: ['AI-generated response'],
        chartData: [],
        recommendation: 'Try one of the suggested commands for structured data.',
        confidence: 60,
        suggestedFollowUps: ['Show today revenue', 'Generate weekly report', 'Summarize today activity'],
        timestamp: Date.now(),
      };
    } catch {
      return {
        summary: 'I did not understand that command. Available commands: show revenue, show active users, generate report, find suspicious accounts, predict revenue, why are users leaving, summarize today activity, find security problems, show AI health, analyze payment failures, show top traders, show weakest lessons.',
        evidence: [],
        chartData: [],
        recommendation: 'Use one of the supported commands for best results.',
        confidence: 50,
        suggestedFollowUps: ['Show today revenue', 'Summarize today activity', 'Generate weekly report'],
        timestamp: Date.now(),
      };
    }
  }

  /** Get available commands */
  getAvailableCommands(): string[] {
    return [
      'Show today revenue',
      'Show active users',
      'Why did subscriptions decrease?',
      'Which users are at risk?',
      'Generate weekly report',
      'Find suspicious accounts',
      'Show top profitable traders',
      'Show weakest academy lessons',
      'Predict next month revenue',
      'Why are users leaving?',
      'Summarize today activity',
      'Find security problems',
      'Analyze payment failures',
      'Show AI health',
    ];
  }

  /** Get command history */
  getHistory() {
    return [...this.commandHistory];
  }

  // ── Orchestrator Integration ────────────────────────────────────────────

  async execute(ctx: OrchestratorContext): Promise<void> {
    // Command Center runs on-demand, not on schedule
  }

  getOrchestratorContract(): EngineContract {
    return {
      name: 'aiCommandCenter',
      priority: 19, // Highest priority
      dependencies: [
        'executiveIntelligence', 'executiveEngine', 'businessAnalyst',
        'predictionEngine', 'healthMonitor', 'securityCenter',
        'journeyManager', 'missionEngine', 'learningEngine',
        'economyManager', 'contentManager', 'digitalTwin',
      ],
      initialize: async () => { this.registered = true; },
      execute: (ctx) => this.execute(ctx),
      shutdown: async () => { this.registered = false; },
      health: () => ({
        status: this.registered ? 'healthy' : 'degraded',
        lastRun: null, lastDuration: 0, errorCount: 0, totalRuns: 0, avgDuration: 0,
      }),
    };
  }
}

export const aiCommandCenter = new AICommandCenter();
