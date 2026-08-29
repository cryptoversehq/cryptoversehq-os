/**
 * adminBotStore.ts
 *
 * Admin-side store for the CryptoVerse HQ Trading Bots system.
 *
 * Responsibilities:
 *   - Force-stop any user's bot (safety override)
 *   - Activate / deactivate bot templates
 *   - Update template metadata and default configs
 *   - View all bots across all users (global oversight)
 *   - Compute platform-wide bot analytics (BotGlobalStats)
 *   - Maintain an immutable audit log of all admin actions
 *
 * Follows the same separation pattern as adminStrategyStore / adminPaymentStore:
 * reads and calls actions from primary stores; never writes directly.
 */

import { create } from 'zustand';
import {
  BotTemplate,
  BotGlobalStats,
  BotAdminAuditEntry,
  BotType,
  UserBot,
  BotExecution,
} from './botTypes';
import { generateId } from './strategyUtils';
import { useBotStore } from './botStore';
import { useBotTemplateStore } from './botTemplateStore';

// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENCE
// ─────────────────────────────────────────────────────────────────────────────

const AUDIT_KEY = 'cryptoverse_bot_admin_audit_v1';

function loadAudit(): BotAdminAuditEntry[] {
  try { return JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]'); } catch { return []; }
}
function saveAudit(data: BotAdminAuditEntry[]) {
  localStorage.setItem(AUDIT_KEY, JSON.stringify(data));
}

// ─────────────────────────────────────────────────────────────────────────────
// STATE INTERFACE
// ─────────────────────────────────────────────────────────────────────────────

export interface AdminBotState {
  auditLog: BotAdminAuditEntry[];

  // ── Template management ───────────────────────────────────────────────────

  /** Activates a bot template (makes it available to users). */
  activateTemplate: (params: {
    templateId: string;
    adminId:    string;
    adminName:  string;
  }) => { ok: boolean; error?: string };

  /** Deactivates a bot template (hides it; existing bots keep running). */
  deactivateTemplate: (params: {
    templateId: string;
    adminId:    string;
    adminName:  string;
    reason:     string;
  }) => { ok: boolean; error?: string };

  /** Updates template metadata (name, description, risk level, plan requirement, etc.). */
  updateTemplate: (params: {
    templateId: string;
    adminId:    string;
    adminName:  string;
    patch:      Partial<Pick<BotTemplate,
      | 'name' | 'description' | 'shortDescription'
      | 'riskLevel' | 'minBalance' | 'requiredPlan'
      | 'requiredLevel' | 'estimatedMonthlyReturnPct' | 'tags'
    >>;
  }) => { ok: boolean; error?: string };

  // ── Bot oversight ─────────────────────────────────────────────────────────

  /**
   * Force-stops any user's bot regardless of its current state.
   * Used for safety interventions (e.g. runaway bot, user complaint).
   */
  forceStopBot: (params: {
    botId:     string;
    adminId:   string;
    adminName: string;
    reason:    string;
  }) => { ok: boolean; error?: string };

  /**
   * Force-pauses any user's bot.
   */
  forcePauseBot: (params: {
    botId:     string;
    adminId:   string;
    adminName: string;
    reason:    string;
  }) => { ok: boolean; error?: string };

  // ── Analytics ─────────────────────────────────────────────────────────────

  /** Returns platform-wide bot statistics (computed on demand). */
  getGlobalStats: () => BotGlobalStats;

  /** Returns all bots across all users (admin view). */
  getAllBots: (filter?: { userId?: string; templateType?: BotType; status?: UserBot['status'] }) => UserBot[];

  /** Returns all executions across all users, newest first. */
  getAllExecutions: (limit?: number) => BotExecution[];

  /** Returns bots currently in error state (need attention). */
  getErrorBots: () => UserBot[];

  /** Returns the top N bots by profit. */
  getTopBots: (limit?: number) => UserBot[];

  /** Returns aggregate stats per user (number of bots, total profit). */
  getUserBotSummaries: () => Array<{
    userId:      string;
    botCount:    number;
    activeBots:  number;
    totalProfit: number;
    totalTrades: number;
  }>;

  // ── Audit log ─────────────────────────────────────────────────────────────

  /** Returns the audit log, optionally filtered. */
  getAuditLog: (filter?: { adminId?: string; limit?: number }) => BotAdminAuditEntry[];

  // ── Internal ──────────────────────────────────────────────────────────────
  _addAudit: (entry: Omit<BotAdminAuditEntry, 'id' | 'timestamp'>) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// STORE
// ─────────────────────────────────────────────────────────────────────────────

export const useAdminBotStore = create<AdminBotState>((set, get) => ({
  auditLog: loadAudit(),

  // ── Template management ───────────────────────────────────────────────────

  activateTemplate: ({ templateId, adminId, adminName }) => {
    const result = useBotTemplateStore.getState().activateTemplate(templateId);
    if (!result.ok) return result;

    const template = useBotTemplateStore.getState().getTemplate(templateId);
    get()._addAudit({
      adminId, adminName,
      action:      'activate_template',
      targetId:    templateId,
      targetLabel: template?.name ?? templateId,
      details:     `Template "${template?.name}" activated — now visible to users.`,
    });

    return { ok: true };
  },

  deactivateTemplate: ({ templateId, adminId, adminName, reason }) => {
    if (!reason.trim()) return { ok: false, error: 'A reason is required to deactivate a template.' };

    const result = useBotTemplateStore.getState().deactivateTemplate(templateId);
    if (!result.ok) return result;

    const template = useBotTemplateStore.getState().getTemplate(templateId);
    get()._addAudit({
      adminId, adminName,
      action:      'deactivate_template',
      targetId:    templateId,
      targetLabel: template?.name ?? templateId,
      details:     `Template deactivated. Reason: ${reason}`,
    });

    return { ok: true };
  },

  updateTemplate: ({ templateId, adminId, adminName, patch }) => {
    const result = useBotTemplateStore.getState().updateTemplate(templateId, patch);
    if (!result.ok) return result;

    const template = useBotTemplateStore.getState().getTemplate(templateId);
    get()._addAudit({
      adminId, adminName,
      action:      'update_template',
      targetId:    templateId,
      targetLabel: template?.name ?? templateId,
      details:     `Template metadata updated: ${Object.keys(patch).join(', ')}.`,
    });

    return { ok: true };
  },

  // ── Bot oversight ─────────────────────────────────────────────────────────

  forceStopBot: ({ botId, adminId, adminName, reason }) => {
    if (!reason.trim()) return { ok: false, error: 'A reason is required to force-stop a bot.' };

    const bot = useBotStore.getState().getBot(botId);
    if (!bot) return { ok: false, error: 'Bot not found.' };

    // Force-stop regardless of current status by directly mutating through botStore
    const result = useBotStore.getState().stopBot(botId, 'admin_disabled');

    if (result.ok) {
      get()._addAudit({
        adminId, adminName,
        action:      'force_stop_bot',
        targetId:    botId,
        targetLabel: `${bot.name} (user: ${bot.userId})`,
        details:     `Force-stopped by admin. Reason: ${reason}`,
      });
    }

    return result;
  },

  forcePauseBot: ({ botId, adminId, adminName, reason }) => {
    if (!reason.trim()) return { ok: false, error: 'A reason is required to force-pause a bot.' };

    const bot = useBotStore.getState().getBot(botId);
    if (!bot) return { ok: false, error: 'Bot not found.' };
    if (bot.status !== 'active') return { ok: false, error: 'Bot is not currently active.' };

    const result = useBotStore.getState().pauseBot(botId);

    if (result.ok) {
      get()._addAudit({
        adminId, adminName,
        action:      'force_stop_bot', // closest available action
        targetId:    botId,
        targetLabel: `${bot.name} (user: ${bot.userId})`,
        details:     `Force-paused by admin. Reason: ${reason}`,
      });
    }

    return result;
  },

  // ── Analytics ─────────────────────────────────────────────────────────────

  getGlobalStats: (): BotGlobalStats => {
    const { bots, executions } = useBotStore.getState();
    const allBots  = Object.values(bots);
    const allExecs = executions;

    const byType = {} as BotGlobalStats['byType'];
    const allTypes: BotType[] = ['grid', 'martingale', 'dca', 'arbitrage', 'rebalancing'];
    for (const t of allTypes) {
      const typeBots  = allBots.filter(b => b.templateType === t);
      const typeExecs = allExecs.filter(e => e.templateType === t);
      byType[t] = {
        count:      typeBots.length,
        active:     typeBots.filter(b => b.status === 'active').length,
        executions: typeExecs.length,
        profit:     Math.round(typeBots.reduce((s, b) => s + b.totalProfit, 0) * 100) / 100,
      };
    }

    const totalVolume = allExecs.reduce((s, e) => s + e.total, 0);
    const totalFees   = allExecs.reduce((s, e) => s + e.fee,   0);
    const totalProfit = allBots.reduce((s, b) => s + b.totalProfit, 0);

    const topBots = [...allBots]
      .sort((a, b) => b.totalProfit - a.totalProfit)
      .slice(0, 10)
      .map(b => ({
        botId:  b.id,
        name:   b.name,
        userId: b.userId,
        profit: b.totalProfit,
        trades: b.totalTrades,
      }));

    return {
      totalBots:       allBots.length,
      activeBots:      allBots.filter(b => b.status === 'active').length,
      pausedBots:      allBots.filter(b => b.status === 'paused').length,
      stoppedBots:     allBots.filter(b => b.status === 'stopped').length,
      errorBots:       allBots.filter(b => b.status === 'error').length,
      totalExecutions: allExecs.length,
      totalVolume:     Math.round(totalVolume * 100) / 100,
      totalFees:       Math.round(totalFees * 100) / 100,
      totalProfit:     Math.round(totalProfit * 100) / 100,
      byType,
      topPerformingBots: topBots,
    };
  },

  getAllBots: (filter = {}) => {
    let bots = Object.values(useBotStore.getState().bots);
    if (filter.userId)       bots = bots.filter(b => b.userId === filter.userId);
    if (filter.templateType) bots = bots.filter(b => b.templateType === filter.templateType);
    if (filter.status)       bots = bots.filter(b => b.status === filter.status);
    return bots.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  getAllExecutions: (limit = 200) => {
    return useBotStore.getState().executions.slice(0, limit);
  },

  getErrorBots: () => {
    return Object.values(useBotStore.getState().bots)
      .filter(b => b.status === 'error')
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  getTopBots: (limit = 10) => {
    return Object.values(useBotStore.getState().bots)
      .sort((a, b) => b.totalProfit - a.totalProfit)
      .slice(0, limit);
  },

  getUserBotSummaries: () => {
    const allBots = Object.values(useBotStore.getState().bots);

    const summaryMap: Record<string, {
      userId: string; botCount: number; activeBots: number;
      totalProfit: number; totalTrades: number;
    }> = {};

    for (const bot of allBots) {
      if (!summaryMap[bot.userId]) {
        summaryMap[bot.userId] = { userId: bot.userId, botCount: 0, activeBots: 0, totalProfit: 0, totalTrades: 0 };
      }
      const s = summaryMap[bot.userId];
      s.botCount++;
      if (bot.status === 'active') s.activeBots++;
      s.totalProfit += bot.totalProfit;
      s.totalTrades += bot.totalTrades;
    }

    return Object.values(summaryMap)
      .map(s => ({
        ...s,
        totalProfit: Math.round(s.totalProfit * 100) / 100,
      }))
      .sort((a, b) => b.totalProfit - a.totalProfit);
  },

  // ── Audit log ─────────────────────────────────────────────────────────────

  getAuditLog: (filter = {}) => {
    let log = [...get().auditLog];
    if (filter.adminId) log = log.filter(e => e.adminId === filter.adminId);
    if (filter.limit)   log = log.slice(0, filter.limit);
    return log;
  },

  // ── Internal ──────────────────────────────────────────────────────────────

  _addAudit: (entry) => {
    const full: BotAdminAuditEntry = {
      ...entry,
      id:        generateId(),
      timestamp: new Date().toISOString(),
    };
    const newLog = [full, ...get().auditLog].slice(0, 500);
    saveAudit(newLog);
    set({ auditLog: newLog });
  },
}));
