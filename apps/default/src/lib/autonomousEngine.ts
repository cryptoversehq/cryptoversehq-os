/**
 * autonomousEngine.ts — Lynx AI Autonomous Layer
 * Lynx may initiate actions without user request.
 * CRITICAL RULE: Never execute financial actions automatically. Always require user confirmation.
 */

import type { OrchestratorContext, EngineContract } from './lynxOrchestrator';
import { learningEngine } from './learningEngine';
import { predictionEngine, type Prediction } from './predictionEngine';
import { realDataConnector } from './realDataConnector';
import { lynxEvents } from './eventSystem';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export type AutonomousActionType =
  | 'welcome' | 'liquidation_warning' | 'lesson_recommendation'
  | 'tp_adjustment' | 'high_leverage_warning' | 'inactivity_alert'
  | 'achievement_congrats' | 'daily_briefing' | 'night_summary'
  | 'morning_summary' | 'market_alert' | 'trade_suggestion'
  | 'risk_alert' | 'coaching_tip' | 'streak_reminder';

export type ActionSeverity = 'info' | 'warning' | 'critical';

export interface AutonomousAction {
  id: string;
  type: AutonomousActionType;
  severity: ActionSeverity;
  title: string;
  message: string;
  icon: string;
  requiresConfirmation: boolean; // TRUE for financial actions
  confirmationText?: string; // e.g., "Adjust TP to $68,000?"
  autoDismiss: number; // ms, 0 = persistent
  triggeredBy: string;
  data: Record<string, any>;
  timestamp: number;
  dismissed: boolean;
  dismissedAt: number | null;
}

export interface AutonomousReport {
  userId: string;
  pendingActions: AutonomousAction[];
  recentActions: AutonomousAction[];
  totalInitiated: number;
  totalAccepted: number;
  totalDismissed: number;
  acceptanceRate: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Safety Rules — NEVER Violate These
// ═══════════════════════════════════════════════════════════════════════════════

/** Financial actions that ALWAYS require user confirmation */
const CONFIRMATION_REQUIRED: AutonomousActionType[] = [
  'tp_adjustment',      // Take-profit adjustment
  'trade_suggestion',    // Suggest opening a trade
];

/** Actions that are advisory only — no confirmation needed */
const ADVISORY_ONLY: AutonomousActionType[] = [
  'welcome', 'liquidation_warning', 'lesson_recommendation',
  'high_leverage_warning', 'inactivity_alert', 'achievement_congrats',
  'daily_briefing', 'night_summary', 'morning_summary',
  'market_alert', 'risk_alert', 'coaching_tip', 'streak_reminder',
];

// ═══════════════════════════════════════════════════════════════════════════════
// AutonomousEngine
// ═══════════════════════════════════════════════════════════════════════════════

class AutonomousEngine {
  private actions: Map<string, AutonomousAction[]> = new Map();
  private stats: Map<string, { initiated: number; accepted: number; dismissed: number }> = new Map();
  private registered = false;
  private readonly KEY = 'cv_lynx_autonomous_';
  private monitorInterval: ReturnType<typeof setInterval> | null = null;
  private lastCheck: Map<string, number> = new Map();

  constructor() {
    this.monitorInterval = setInterval(() => this.monitorAll(), 60000); // Check every 60s
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /** Get all pending actions for a user */
  getPendingActions(userId: string): AutonomousAction[] {
    const actions = this.actions.get(userId) || [];
    return actions.filter(a => !a.dismissed);
  }

  /** Get action history */
  getRecentActions(userId: string, limit = 20): AutonomousAction[] {
    const actions = this.actions.get(userId) || [];
    return actions.slice(-limit);
  }

  /** Accept an action (user confirms) */
  acceptAction(userId: string, actionId: string): AutonomousAction | null {
    const actions = this.actions.get(userId);
    if (!actions) return null;
    const action = actions.find(a => a.id === actionId);
    if (action) {
      action.dismissed = true;
      action.dismissedAt = Date.now();
      this.recordStat(userId, 'accepted');
      this.persist(userId);
    }
    return action || null;
  }

  /** Dismiss an action */
  dismissAction(userId: string, actionId: string): void {
    const actions = this.actions.get(userId);
    if (!actions) return;
    const action = actions.find(a => a.id === actionId);
    if (action) {
      action.dismissed = true;
      action.dismissedAt = Date.now();
      this.recordStat(userId, 'dismissed');
      this.persist(userId);
    }
  }

  /** Generate a report */
  getReport(userId: string): AutonomousReport {
    const actions = this.actions.get(userId) || [];
    const pending = actions.filter(a => !a.dismissed);
    const stats = this.stats.get(userId) || { initiated: 0, accepted: 0, dismissed: 0 };
    return {
      userId,
      pendingActions: pending,
      recentActions: actions.slice(-50),
      totalInitiated: stats.initiated,
      totalAccepted: stats.accepted,
      totalDismissed: stats.dismissed,
      acceptanceRate: stats.initiated > 0 ? (stats.accepted / stats.initiated) * 100 : 0,
    };
  }

  // ── Action Initiators (called automatically, no user request needed) ────

  /** Welcome user on return */
  initiateWelcome(userId: string, userName?: string, timeAway?: string): AutonomousAction {
    return this.createAction(userId, 'welcome', 'info',
      `Welcome Back, ${userName || 'Trader'}!`,
      timeAway ? `You were away for ${timeAway}. Ready to continue?` : 'Ready to continue your crypto journey?',
      '👋', false, 'return_detection', { timeAway }, 12000);
  }

  /** Warn before potential liquidation */
  initiateLiquidationWarning(userId: string, symbol: string, liqPrice: number, currentPrice: number): AutonomousAction {
    const distance = ((currentPrice - liqPrice) / currentPrice * 100).toFixed(1);
    const severity: ActionSeverity = Math.abs(currentPrice - liqPrice) / currentPrice < 0.03 ? 'critical' : 'warning';
    return this.createAction(userId, 'liquidation_warning', severity,
      `⚠️ Liquidation Risk: ${symbol}`,
      `Your ${symbol} position is ${distance}% from liquidation at $${liqPrice.toLocaleString()}. Current: $${currentPrice.toLocaleString()}.`,
      '⚠️', false, 'price_monitor', { symbol, liqPrice, currentPrice, distance }, 0);
  }

  /** Recommend an academy lesson */
  initiateLessonRecommendation(userId: string, lessonName: string, reason: string): AutonomousAction {
    return this.createAction(userId, 'lesson_recommendation', 'info',
      `📚 Recommended: ${lessonName}`,
      reason,
      '📚', false, 'learning_engine', { lessonName }, 15000);
  }

  /** Suggest TP adjustment (REQUIRES CONFIRMATION — financial action) */
  initiateTPAdjustment(userId: string, symbol: string, currentTP: number, suggestedTP: number, reason: string): AutonomousAction {
    return this.createAction(userId, 'tp_adjustment', 'warning',
      `🎯 TP Adjustment: ${symbol}`,
      `Current TP: $${currentTP.toLocaleString()} → Suggested: $${suggestedTP.toLocaleString()}. ${reason}`,
      '🎯', true, 'profit_optimizer', { symbol, currentTP, suggestedTP }, 0,
      `Adjust ${symbol} TP to $${suggestedTP.toLocaleString()}?`);
  }

  /** Warn about high leverage */
  initiateHighLeverageWarning(userId: string, symbol: string, leverage: number): AutonomousAction {
    const severity: ActionSeverity = leverage > 20 ? 'critical' : 'warning';
    return this.createAction(userId, 'high_leverage_warning', severity,
      `⚡ High Leverage: ${leverage}x on ${symbol}`,
      leverage > 20
        ? `CRITICAL: ${leverage}x leverage is extremely risky. Consider reducing to 5x or below.`
        : `Using ${leverage}x leverage on ${symbol}. Consider lower leverage for safer trading.`,
      '⚡', false, 'leverage_monitor', { symbol, leverage }, 0);
  }

  /** Alert on extended inactivity */
  initiateInactivityAlert(userId: string, daysInactive: number): AutonomousAction {
    return this.createAction(userId, 'inactivity_alert', 'info',
      `💤 Inactive for ${daysInactive} Days`,
      `You haven't traded in ${daysInactive} days. Markets are moving — want to check them out?`,
      '💤', false, 'activity_monitor', { daysInactive }, 15000);
  }

  /** Congratulate on achievement */
  initiateAchievement(userId: string, achievement: string, detail: string): AutonomousAction {
    return this.createAction(userId, 'achievement_congrats', 'info',
      `🎉 ${achievement}!`,
      detail,
      '🎉', false, 'achievement_tracker', { achievement }, 10000);
  }

  /** Daily briefing summary */
  initiateDailyBriefing(userId: string): AutonomousAction {
    const appData = realDataConnector.getAppData();
    const preds = predictionEngine.predictAll(userId);
    const wr = appData.trading.avgWinRate.toFixed(0);
    const pos = appData.trading.openPositions;
    const topConcern = preds.topConcern.replace(/_/g, ' ');

    return this.createAction(userId, 'daily_briefing', 'info',
      '📊 Daily Briefing',
      `WR: ${wr}% | Positions: ${pos} | Academy: ${appData.academy.completedLessons}/${appData.academy.totalLessons} lessons | Top concern: ${topConcern}`,
      '📊', false, 'daily_scheduler', { wr, positions: pos, topConcern }, 20000);
  }

  /** Night summary (evening recap) */
  initiateNightSummary(userId: string): AutonomousAction {
    return this.createAction(userId, 'night_summary', 'info',
      '🌙 End of Day Summary',
      'Take a moment to review your trades. Tomorrow is a new opportunity to improve. Rest well!',
      '🌙', false, 'daily_scheduler', {}, 15000);
  }

  /** Morning summary */
  initiateMorningSummary(userId: string): AutonomousAction {
    const preds = predictionEngine.predictAll(userId);
    const highRisk = preds.predictions.filter(p => p.probability > 50 && ['liquidation','burnout','high_stress'].includes(p.type));

    return this.createAction(userId, 'morning_summary', 'info',
      '☀️ Good Morning!',
      highRisk.length > 0
        ? `Today's focus: ${highRisk.map(p => p.type.replace(/_/g, ' ')).join(', ')}. Let's start the day with a plan.`
        : 'Ready for a great trading day! Check your strategy before you start.',
      '☀️', false, 'daily_scheduler', { highRiskCount: highRisk.length }, 15000);
  }

  /** Market alert based on significant movement */
  initiateMarketAlert(userId: string, symbol: string, change: number, direction: 'up' | 'down'): AutonomousAction {
    const emoji = direction === 'up' ? '📈' : '📉';
    const word = direction === 'up' ? 'surged' : 'dropped';
    return this.createAction(userId, 'market_alert', 'info',
      `${emoji} ${symbol} ${word} ${Math.abs(change).toFixed(1)}%`,
      `${symbol} has ${word} ${Math.abs(change).toFixed(1)}% recently. Check your positions or consider an entry.`,
      emoji, false, 'market_monitor', { symbol, change, direction }, 12000);
  }

  // ── Orchestrator Integration ────────────────────────────────────────────

  async execute(context: OrchestratorContext): Promise<void> {
    const userId = context.userId || 'anonymous';
    const now = Date.now();
    const lastCheck = this.lastCheck.get(userId) || 0;

    // Avoid checking too frequently (max every 30s)
    if (now - lastCheck < 30000) return;
    this.lastCheck.set(userId, now);

    this.monitorUser(userId);
  }

  getOrchestratorContract(): EngineContract {
    return {
      name: 'autonomousEngine',
      priority: 12,
      dependencies: ['contextEngine', 'brainEngine', 'learningEngine', 'predictionEngine'],
      initialize: async () => { this.registered = true; },
      execute: (ctx) => this.execute(ctx),
      shutdown: async () => { this.registered = false; },
      health: () => ({
        status: this.registered ? 'healthy' : 'degraded',
        lastRun: null, lastDuration: 0, errorCount: 0, totalRuns: 0, avgDuration: 0,
      }),
    };
  }

  // ── Private ──────────────────────────────────────────────────────────────

  /** Create and store an action */
  private createAction(
    userId: string, type: AutonomousActionType, severity: ActionSeverity,
    title: string, message: string, icon: string,
    requiresConfirmation: boolean, triggeredBy: string,
    data: Record<string, any>, autoDismiss: number,
    confirmationText?: string,
  ): AutonomousAction {
    const action: AutonomousAction = {
      id: `auto_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      type, severity, title, message, icon,
      requiresConfirmation: requiresConfirmation || CONFIRMATION_REQUIRED.includes(type),
      confirmationText: confirmationText || (requiresConfirmation ? `Confirm ${type.replace(/_/g, ' ')}?` : undefined),
      autoDismiss,
      triggeredBy,
      data,
      timestamp: Date.now(),
      dismissed: false,
      dismissedAt: null,
    };

    if (!this.actions.has(userId)) this.actions.set(userId, []);
    this.actions.get(userId)!.push(action);
    this.recordStat(userId, 'initiated');

    // Cap at 200 actions
    const actions = this.actions.get(userId)!;
    if (actions.length > 200) actions.splice(0, actions.length - 200);

    this.persist(userId);

    // Auto-dismiss after timeout
    if (autoDismiss > 0) {
      setTimeout(() => {
        if (!action.dismissed) {
          action.dismissed = true;
          action.dismissedAt = Date.now();
          this.persist(userId);
        }
      }, autoDismiss);
    }

    return action;
  }

  /** Monitor a user and trigger actions */
  private monitorUser(userId: string): void {
    const appData = realDataConnector.getAppData();
    const preds = predictionEngine.predictAll(userId);
    const profile = learningEngine.getProfile(userId);

    // Check liquidation risk
    const liqPred = preds.predictions.find(p => p.type === 'liquidation');
    if (liqPred && liqPred.probability > 50 && appData.trading.openPositions > 0) {
      this.initiateLiquidationWarning(userId, 'BTC', 62000, 67000); // Would use actual position data
    }

    // Check high leverage
    const avgLev = profile.riskHabits.find(h => h.label === 'Avg Leverage');
    if (avgLev && avgLev.value > 5) {
      this.initiateHighLeverageWarning(userId, 'Active', avgLev.value);
    }

    // Check burnout
    const burnoutPred = preds.predictions.find(p => p.type === 'burnout');
    if (burnoutPred && burnoutPred.probability > 60) {
      // Suggest a break — no automatic lesson for stressed users
    }

    // Check inactivity
    const favCoins = profile.favoriteCoins;
    if (favCoins.length > 0) {
      const daysOff = Math.floor((Date.now() - (favCoins[0]?.lastTraded || 0)) / 86400000);
      if (daysOff > 7) {
        this.initiateInactivityAlert(userId, daysOff);
      }
    }

    // Check academy
    if (appData.academy.completedLessons === 0) {
      this.initiateLessonRecommendation(userId, 'Blockchain Basics', 'Start your crypto learning journey with the fundamentals.');
    }
  }

  /** Continuous monitoring for all loaded users */
  private monitorAll(): void {
    const now = new Date();
    const hour = now.getHours();

    for (const userId of this.actions.keys()) {
      // Morning summary at 8 AM
      if (hour === 8 && now.getMinutes() < 5) {
        const today = new Date().toDateString();
        const lastMorning = localStorage.getItem(`cv_lynx_morning_${userId}`);
        if (lastMorning !== today) {
          this.initiateMorningSummary(userId);
          localStorage.setItem(`cv_lynx_morning_${userId}`, today);
        }
      }

      // Night summary at 10 PM
      if (hour === 22 && now.getMinutes() < 5) {
        const today = new Date().toDateString();
        const lastNight = localStorage.getItem(`cv_lynx_night_${userId}`);
        if (lastNight !== today) {
          this.initiateNightSummary(userId);
          localStorage.setItem(`cv_lynx_night_${userId}`, today);
        }
      }
    }
  }

  private recordStat(userId: string, type: 'initiated' | 'accepted' | 'dismissed'): void {
    if (!this.stats.has(userId)) this.stats.set(userId, { initiated: 0, accepted: 0, dismissed: 0 });
    const stats = this.stats.get(userId)!;
    stats[type]++;
  }

  private persist(userId: string): void {
    try {
      const actions = this.actions.get(userId);
      if (actions) localStorage.setItem(this.KEY + userId, JSON.stringify(actions));
    } catch {}
  }
}

export const autonomousEngine = new AutonomousEngine();
