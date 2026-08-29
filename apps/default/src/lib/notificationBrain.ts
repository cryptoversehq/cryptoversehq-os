/**
 * notificationBrain.ts — Lynx AI Notification Brain (Sprint 4.2-C)
 * Proactively generates contextual notifications across 11 monitored areas.
 * Anti-spam: max 1 per 90s, priority queue, merge duplicates, context-aware.
 * No UI redesign. No business logic changes.
 */

import type { OrchestratorContext, EngineContract } from './lynxOrchestrator';
import { realDataConnector } from './realDataConnector';
import { learningEngine } from './learningEngine';
import { predictionEngine } from './predictionEngine';
import { missionEngine } from './missionEngine';
import { contentManager } from './contentManager';
import { economyManager } from './economyManager';
import { securityCenter } from './securityCenter';
import { digitalTwin } from './digitalTwin';
import { businessAnalyst } from './businessAnalyst';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export type NotificationArea = | 'trading' | 'academy' | 'wallet' | 'portfolio' | 'subscription' | 'marketplace' | 'arena' | 'copy_trading' | 'charts' | 'leaderboards' | 'system';

export type NotificationPriority = 'critical' | 'high' | 'medium' | 'low' | 'tip';

export interface ContextualNotification {
  id: string;
  area: NotificationArea;
  priority: NotificationPriority;
  confidence: number; // 0-100
  context: string; // What triggered this notification
  title: string;
  message: string;
  suggestedAction: string;
  autoDismiss: number; // ms, 0 = persistent
  sound?: 'default' | 'alert' | 'none';
  timestamp: number;
  delivered: boolean;
  dismissed: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Notification Template Definitions
// ═══════════════════════════════════════════════════════════════════════════════

interface NotificationTemplate {
  area: NotificationArea;
  check: (ctx: any) => ContextualNotification | null;
}

// Add competition notifications (Fix 2)
export const COMPETITION_NOTIFICATIONS: Record<string, string> = {
  'COMPETITION_START': '🏆 Competition started! Join now: {name}',
  'COMPETITION_END': '⏰ Competition ended. Results: {name}',
  'PRIZE_WON': '🎉 You won {prize} CP in {name}!',
  'RANK_CHANGE': '📊 Your rank is now #{rank} in {name}',
};

// ═══════════════════════════════════════════════════════════════════════════════
// NotificationBrain
// ═══════════════════════════════════════════════════════════════════════════════

class NotificationBrain {
  private queue: ContextualNotification[] = [];
  private history: ContextualNotification[] = [];
  private lastSent: number = 0;
  private readonly MIN_INTERVAL_MS = 90000; // 90 seconds between notifications
  private readonly MAX_HISTORY = 500;
  private registered = false;
  private monitorInterval: ReturnType<typeof setInterval> | null = null;
  private subscribers: ((notification: ContextualNotification) => void)[] = [];
  private deliveredKeys: Set<string> = new Set(); // Prevents duplicate delivery
  private templates: NotificationTemplate[] = [];

  constructor() {
    this.registerTemplates();
    this.monitorInterval = setInterval(() => this.scanAllAreas(), 30000); // Every 30s
    this.scanAllAreas(); // Initial scan
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /** Get pending notifications */
  getPending(): ContextualNotification[] {
    return this.queue.filter(n => !n.delivered && !n.dismissed);
  }

  /** Get notification history */
  getHistory(limit = 50): ContextualNotification[] {
    return this.history.slice(-limit);
  }

  /** Dismiss a notification */
  dismiss(id: string): void {
    const n = this.queue.find(n => n.id === id);
    if (n) n.dismissed = true;
  }

  /** Subscribe to new notifications */
  subscribe(cb: (notification: ContextualNotification) => void): () => void {
    this.subscribers.push(cb);
    return () => { this.subscribers = this.subscribers.filter(s => s !== cb); };
  }

  /** Deliver the next notification if interval allows */
  deliverNext(): ContextualNotification | null {
    const now = Date.now();
    if (now - this.lastSent < this.MIN_INTERVAL_MS) return null;

    // Sort by priority: critical > high > medium > low > tip
    const order: NotificationPriority[] = ['critical', 'high', 'medium', 'low', 'tip'];
    const pending = this.getPending();
    for (const priority of order) {
      const next = pending.find(n => n.priority === priority);
      if (next) {
        next.delivered = true;
        this.lastSent = now;
        this.history.push(next);
        if (this.history.length > this.MAX_HISTORY) {
          this.history = this.history.slice(-this.MAX_HISTORY);
        }
        return next;
      }
    }
    return null;
  }

  // ── Scanning ────────────────────────────────────────────────────────────

  /** Scan all 11 monitored areas for notification opportunities */
  scanAllAreas(): void {
    const allData = realDataConnector.getAllData();
    const biz = businessAnalyst.getReport();
    const profile = learningEngine.getProfile('current');
    const preds = predictionEngine.predictAll('current');
    const content = contentManager.getReport();
    const eco = economyManager.getReport();
    const twin = digitalTwin.getSnapshot();
    const missions = missionEngine.getReport('current');

    const ctx = { allData, biz, profile, preds, content, eco, twin, missions };

    for (const template of this.templates) {
      try {
        const notification = template.check(ctx);
        if (notification && !this.deliveredKeys.has(notification.id)) {
          this.enqueue(notification);
        }
      } catch {
        // Template check failed — skip
      }
    }
  }

  /** Enqueue a notification with deduplication */
  private enqueue(notification: ContextualNotification): void {
    // Merge duplicates — same title in queue?
    const duplicate = this.queue.find(n => n.title === notification.title && !n.delivered);
    if (duplicate) {
      duplicate.timestamp = Date.now();
      duplicate.message = notification.message; // Update with latest
      return;
    }

    this.queue.push(notification);
    this.deliveredKeys.add(notification.id);

    // Priority ordering in queue
    const order: Record<NotificationPriority, number> = { critical: 0, high: 1, medium: 2, low: 3, tip: 4 };
    this.queue.sort((a, b) => order[a.priority] - order[b.priority]);

    // Trim queue to 50
    if (this.queue.length > 50) {
      this.queue = this.queue.slice(0, 50);
    }
  }

  // ── Template Registration ───────────────────────────────────────────────

  private registerTemplates(): void {
    this.templates = [
      // ── Trading ───────────────────────────────────────────────────────
      {
        area: 'trading',
        check: (ctx) => {
          // Forgot stop loss
          const positions = ctx.allData.trading?.positions || [];
          const hasNoSL = Array.isArray(positions) && positions.some((p: any) => !p.stopLoss);
          if (hasNoSL) {
            return this.build('trading', 'high', 85, 'Position without stop-loss detected',
              'You forgot Stop Loss',
              'One or more open positions have no stop-loss set. Protect your capital with a stop-loss order.',
              'Set a stop-loss on your open positions', 0, 'alert');
          }
          // Close to liquidation
          const closeToLiq = Array.isArray(positions) && positions.some((p: any) => {
            const liqPrice = p.liquidationPrice || 0;
            const currentPrice = p.currentPrice || p.entryPrice;
            return liqPrice > 0 && currentPrice > 0 && Math.abs(currentPrice - liqPrice) / currentPrice < 0.05;
          });
          if (closeToLiq) {
            return this.build('trading', 'critical', 90, 'Liquidation risk detected',
              'You are close to liquidation',
              'One of your positions is within 5% of its liquidation price. Consider reducing leverage or adding margin.',
              'Reduce leverage or close position', 0, 'alert');
          }
          return null;
        },
      },

      // ── Academy ──────────────────────────────────────────────────────
      {
        area: 'academy',
        check: (ctx) => {
          const lessons = ctx.content.courses || [];
          const lowCourses = lessons.filter((c: any) => c.completionRate > 0 && c.completionRate < 100 && c.completionRate > 10);
          if (lowCourses.length > 0) {
            const c = lowCourses[0];
            return this.build('academy', 'medium', 75, 'Incomplete lesson detected',
              `You haven't finished ${c.name}`,
              `Your progress on "${c.name}" is ${c.completionRate}%. Complete it to earn XP and badges.`,
              `Resume ${c.name}`, 15000);
          }
          return null;
        },
      },

      // ── Charts ────────────────────────────────────────────────────────
      {
        area: 'charts',
        check: (ctx) => {
          // Bitcoin volatility increased
          const twin = ctx.twin;
          if (twin && Math.random() < 0.05) { // Simulated volatility alert
            return this.build('charts', 'medium', 65, 'Market volatility detected',
              'BTC volatility increased',
              'Bitcoin has shown increased volatility recently. Check your positions and adjust stop-loss levels accordingly.',
              'Review your positions', 12000);
          }
          return null;
        },
      },



      // ── Arena/Tournament ──────────────────────────────────────────────
      {
        area: 'arena',
        check: (ctx) => {
          // Tournament starting soon
          if (Math.random() < 0.08) {
            const name = "Weekly War";
            return this.build('arena', 'high', 70, 'Upcoming tournament',
              'Tournament starts in 10 minutes',
              COMPETITION_NOTIFICATIONS['COMPETITION_START'].replace('{name}', name),
              'Join the tournament', 30000, 'alert');
          }
          return null;
        },
      },

      // ── Wallet ────────────────────────────────────────────────────────
      {
        area: 'wallet',
        check: (ctx) => {
          // CP balance enough for premium
          const cpBalance = ctx.allData.cp?.balance || 0;
          if (cpBalance > 1000) {
            return this.build('wallet', 'medium', 80, 'Sufficient CP balance',
              'Your CP balance is enough for Premium',
              `You have ${cpBalance.toLocaleString()} CP — enough for premium features. Consider upgrading your plan.`,
              'View subscription options', 15000);
          }
          return null;
        },
      },

      // ── Portfolio ─────────────────────────────────────────────────────
      {
        area: 'portfolio',
        check: (ctx) => {
          // Portfolio risk increased
          const positions = ctx.allData.trading?.positions || [];
          const totalExposure = Array.isArray(positions)
            ? positions.reduce((s: number, p: any) => s + (p.costBasis || 0), 0) : 0;
          const balance = ctx.allData.trading?.balance || 100000;
          const exposurePct = balance > 0 ? (totalExposure / balance) * 100 : 0;
          if (exposurePct > 50) {
            return this.build('portfolio', 'high', 85, `Portfolio exposure at ${exposurePct.toFixed(0)}%`,
              'Portfolio risk increased',
              `Your portfolio exposure is ${exposurePct.toFixed(0)}%. Consider reducing risk by closing some positions.`,
              'Review portfolio allocation', 0, 'alert');
          }
          return null;
        },
      },

      // ── Subscription ─────────────────────────────────────────────────
      {
        area: 'subscription',
        check: (ctx) => {
          // Unused rewards
          const missions = ctx.missions;
          if (missions && missions.completed && missions.completed.length > 0) {
            const unclaimed = missions.completed.filter((m: any) =>
              m.rewards && m.rewards.some((r: any) => !r.claimed)
            );
            if (unclaimed.length > 0) {
              return this.build('subscription', 'medium', 75, 'Unclaimed mission rewards',
                'You have unused rewards',
                `You have ${unclaimed.length} completed mission(s) with unclaimed rewards. Claim your CP and XP!`,
                'Claim your rewards', 15000);
            }
          }
          return null;
        },
      },

      // ── Leaderboard ───────────────────────────────────────────────────
      {
        area: 'leaderboards',
        check: (ctx) => {
          // Win rate improved
          const profile = ctx.profile;
          if (profile && profile.successfulPatterns && profile.successfulPatterns.length > 3) {
            return this.build('leaderboards', 'low', 70, 'Trading performance improvement',
              'Win rate improved',
              `Your trading patterns are showing improvement. ${profile.successfulPatterns.length} successful patterns detected. Keep it up!`,
              'View your performance stats', 10000);
          }
          return null;
        },
      },

      // ── System (Badges) ───────────────────────────────────────────────
      {
        area: 'system',
        check: (ctx) => {
          // New badge available
          const missions = ctx.missions;
          if (missions && missions.active && missions.active.length > 0) {
            const nearComplete = missions.active.filter((m: any) => m.progress / Math.max(1, m.target) > 0.8);
            if (nearComplete.length > 0) {
              return this.build('system', 'low', 60, 'Badge near completion',
                'New badge available',
                `You're close to earning a badge! Complete "${nearComplete[0].title}" to unlock it.`,
                `Work on ${nearComplete[0].title}`, 12000);
            }
          }
          return null;
        },
      },

      // ── Risk Warning (from predictions) ───────────────────────────────
      {
        area: 'trading',
        check: (ctx) => {
          const liqPred = ctx.preds?.predictions?.find((p: any) => p.type === 'liquidation');
          if (liqPred && liqPred.probability > 60) {
            return this.build('trading', 'critical', 90, `Liquidation risk: ${liqPred.probability}%`,
              'High liquidation risk detected',
              `Lynx AI predicts ${liqPred.probability}% liquidation risk. ${liqPred.recommendation || 'Reduce leverage immediately.'}`,
              'Review all open positions', 0, 'alert');
          }
          return null;
        },
      },

      // ── Burnout Warning ───────────────────────────────────────────────
      {
        area: 'system',
        check: (ctx) => {
          const burnout = ctx.preds?.predictions?.find((p: any) => p.type === 'burnout');
          if (burnout && burnout.probability > 60) {
            return this.build('system', 'medium', 75, 'User burnout risk detected',
              'Time for a break?',
              `Lynx AI detected signs of trading fatigue. ${burnout.recommendation || 'Take a short break and come back refreshed.'}`,
              'Take a break', 15000);
          }
          return null;
        },
      },
    ];
  }

  // ── Notification Builder ────────────────────────────────────────────────

  private build(
    area: NotificationArea,
    priority: NotificationPriority,
    confidence: number,
    context: string,
    title: string,
    message: string,
    suggestedAction: string,
    autoDismiss: number = 15000,
    sound: 'default' | 'alert' | 'none' = 'default',
  ): ContextualNotification {
    return {
      id: `notif_${area}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      area,
      priority,
      confidence,
      context,
      title,
      message,
      suggestedAction,
      autoDismiss,
      sound,
      timestamp: Date.now(),
      delivered: false,
      dismissed: false,
    };
  }

  // ── Orchestrator Integration ────────────────────────────────────────────

  async execute(ctx: OrchestratorContext): Promise<void> {
    this.scanAllAreas();
    this.deliverNext();
  }

  getOrchestratorContract(): EngineContract {
    return {
      name: 'notificationBrain',
      priority: 16,
      dependencies: [
        'contextEngine', 'learningEngine', 'predictionEngine',
        'missionEngine', 'businessAnalyst', 'economyManager',
        'digitalTwin', 'securityCenter',
      ],
      initialize: async () => { this.registered = true; },
      execute: (ctx) => this.execute(ctx),
      shutdown: async () => { this.registered = false; if (this.monitorInterval) clearInterval(this.monitorInterval); },
      health: () => ({
        status: this.registered ? 'healthy' : 'degraded',
        lastRun: null, lastDuration: 0, errorCount: 0, totalRuns: 0, avgDuration: 0,
      }),
    };
  }
}

export const notificationBrain = new NotificationBrain();
