/**
 * riskManager.ts — Spec 4.3: RiskManager
 *
 * Implements the exact class structure from the spec:
 *
 *   class RiskManager {
 *     async checkPreTradeRisk(bot, tradeAmount) → { allowed, reason? }
 *       1. dailyLoss + tradeAmount > maxDailyLoss  → blocked
 *       2. tradeAmount > maxPositionSize            → blocked
 *       3. outside allowedHours                    → blocked
 *       4. (martingale) consecutiveLosses >= max   → blocked
 *
 *     async executeWithRiskCheck(bot, trade) → TradeResult
 *       → checkPreTradeRisk → stopBot(reason) if denied
 *       → executeTrade
 *       → updateDailyLoss + updateConsecutiveLosses
 *   }
 *
 * The store is the single source of truth for bot state.
 * RiskManager reads from/writes to botStore — no local state of its own
 * except the daily-loss accumulator and reset timestamps.
 *
 * Persistence: dailyLoss data is kept in localStorage so it survives
 * page refreshes and persists until midnight UTC resets it.
 */

import type { UserBot } from './botTypes';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface RiskCheckResult {
  allowed: boolean;
  reason?: string;
}

export interface Trade {
  coinId:     string;
  coinSymbol: string;
  action:     'buy' | 'sell';
  /** USD amount of this trade */
  amount:     number;
  price:      number;
}

export interface TradeResult {
  ok:       boolean;
  pnl:      number;
  isWin:    boolean;
  feesPaid: number;
  error?:   string;
}

// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENCE  — daily-loss ring buffer in localStorage
// ─────────────────────────────────────────────────────────────────────────────

const RISK_STATE_KEY = 'cryptoverse_risk_state_v1';

interface PerBotRiskRecord {
  /** Cumulative USD loss today (always ≥ 0). */
  dailyLossUsd:        number;
  /** ISO date string (YYYY-MM-DD) of the last reset. */
  lastDailyResetDate:  string;
  /** Consecutive losing trades (resets on a win). */
  consecutiveLosses:   number;
}

type RiskStateMap = Record<string, PerBotRiskRecord>;

function loadRiskState(): RiskStateMap {
  try { return JSON.parse(localStorage.getItem(RISK_STATE_KEY) || '{}'); } catch { return {}; }
}
function saveRiskState(state: RiskStateMap) {
  localStorage.setItem(RISK_STATE_KEY, JSON.stringify(state));
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function getOrInitRecord(map: RiskStateMap, botId: string): PerBotRiskRecord {
  const today = todayDateString();
  const rec   = map[botId];
  // Reset daily loss at midnight UTC
  if (!rec || rec.lastDailyResetDate !== today) {
    return { dailyLossUsd: 0, lastDailyResetDate: today, consecutiveLosses: rec?.consecutiveLosses ?? 0 };
  }
  return rec;
}

// ─────────────────────────────────────────────────────────────────────────────
// RISK MANAGER CLASS  (spec 4.3 exact structure)
// ─────────────────────────────────────────────────────────────────────────────

export class RiskManager {
  private _botId: string;   // kept to match spec "private botId: string"

  constructor(botId: string) {
    this._botId = botId;
  }

  // ── spec: getDailyLoss(botId) ──────────────────────────────────────────────

  getDailyLoss(botId: string = this._botId): number {
    const map = loadRiskState();
    const rec = getOrInitRecord(map, botId);
    return rec.dailyLossUsd;
  }

  // ── spec: getConsecutiveLosses(botId) ────────────────────────────────────

  getConsecutiveLosses(botId: string = this._botId): number {
    const map = loadRiskState();
    const rec = map[botId];
    return rec?.consecutiveLosses ?? 0;
  }

  // ── spec: checkPreTradeRisk(bot, tradeAmount) ─────────────────────────────

  checkPreTradeRisk(bot: UserBot, tradeAmount: number): RiskCheckResult {
    const map  = loadRiskState();
    const rec  = getOrInitRecord(map, bot.id);

    // 1. Daily loss limit
    // Spec: if (dailyLoss + tradeAmount > bot.config.maxDailyLoss)
    if (bot.maxDailyLossUsd > 0) {
      if (rec.dailyLossUsd + tradeAmount > bot.maxDailyLossUsd) {
        return {
          allowed: false,
          reason: `Daily loss limit would be exceeded ($${rec.dailyLossUsd.toFixed(2)} of $${bot.maxDailyLossUsd} used).`,
        };
      }
    }

    // 2. Max position size
    // Spec: if (tradeAmount > bot.config.maxPositionSize)
    if (bot.maxTotalLossUsd > 0 && tradeAmount > bot.maxTotalLossUsd) {
      return {
        allowed: false,
        reason: `Trade amount $${tradeAmount.toFixed(2)} exceeds max position size $${bot.maxTotalLossUsd.toFixed(2)}.`,
      };
    }

    // 3. Trading hours
    // Spec: bot.config.allowedHours (format "HH:MM-HH:MM" or "00:00-23:59")
    const allowedHours = (bot.config as any).allowedHours;
    if (allowedHours && allowedHours !== '00:00-23:59') {
      const [startStr, endStr] = allowedHours.split('-');
      const now      = new Date();
      const [sh, sm] = (startStr ?? '00:00').split(':').map(Number);
      const [eh, em] = (endStr   ?? '23:59').split(':').map(Number);
      const nowMins  = now.getHours() * 60 + now.getMinutes();
      const startMin = (sh ?? 0) * 60 + (sm ?? 0);
      const endMin   = (eh ?? 23) * 60 + (em ?? 59);

      // Handle overnight ranges (e.g. "22:00-06:00")
      const inRange  = startMin <= endMin
        ? (nowMins >= startMin && nowMins <= endMin)
        : (nowMins >= startMin || nowMins <= endMin);

      if (!inRange) {
        return {
          allowed: false,
          reason: `Outside allowed trading hours (${allowedHours}). Current time: ${now.toLocaleTimeString()}.`,
        };
      }
    }

    // 4. Max consecutive losses (spec: for martingale)
    if (bot.templateType === 'martingale') {
      const cfg             = bot.config as any;
      const maxLosses       = cfg.maxConsecutiveLosses ?? 5;
      const consecutiveLoss = rec.consecutiveLosses;
      if (consecutiveLoss >= maxLosses) {
        return {
          allowed: false,
          reason: `Max consecutive losses reached (${consecutiveLoss}/${maxLosses}).`,
        };
      }
    }

    return { allowed: true };
  }

  // ── spec: async executeWithRiskCheck(bot, trade) → TradeResult ────────────

  async executeWithRiskCheck(bot: UserBot, trade: Trade): Promise<TradeResult> {
    // Spec: const riskCheck = await this.checkPreTradeRisk(bot, trade.amount);
    const riskCheck = this.checkPreTradeRisk(bot, trade.amount);

    if (!riskCheck.allowed) {
      // Spec: await this.stopBot(bot.id, riskCheck.reason)
      // We fire through the store reference if available
      try {
        const { useBotStore } = await import('./botStore');
        useBotStore.getState().stopBot(bot.id, 'max_loss_reached');
      } catch { /* store not ready */ }
      return { ok: false, pnl: 0, isWin: false, feesPaid: 0, error: riskCheck.reason };
    }

    // Spec: const result = await this.executeTrade(trade)
    // (Simulated — actual execution happens inside botStore tick processors)
    const fee   = trade.amount * 0.001;
    const pnl   = trade.action === 'sell' ? Math.round((trade.amount * 0.015 - fee) * 100) / 100 : 0;
    const isWin = pnl > 0;

    // Spec: await this.updateDailyLoss(bot.id, result.pnl)
    this.updateDailyLoss(bot.id, pnl);

    // Spec: await this.updateConsecutiveLosses(bot.id, result.isWin)
    this.updateConsecutiveLosses(bot.id, isWin);

    return { ok: true, pnl, isWin, feesPaid: fee };
  }

  // ── spec: updateDailyLoss(botId, pnl) ────────────────────────────────────

  updateDailyLoss(botId: string, pnl: number): void {
    const map = loadRiskState();
    const rec = getOrInitRecord(map, botId);
    // Only accumulate losses (negative pnl)
    if (pnl < 0) {
      rec.dailyLossUsd = Math.round((rec.dailyLossUsd + Math.abs(pnl)) * 100) / 100;
    }
    map[botId] = rec;
    saveRiskState(map);
  }

  // ── spec: updateConsecutiveLosses(botId, isWin) ───────────────────────────

  updateConsecutiveLosses(botId: string, isWin: boolean): void {
    const map = loadRiskState();
    const rec = getOrInitRecord(map, botId);
    rec.consecutiveLosses = isWin ? 0 : rec.consecutiveLosses + 1;
    map[botId] = rec;
    saveRiskState(map);
  }

  // ── Utility: reset daily loss (called at midnight or manually) ────────────

  resetDailyLoss(botId: string): void {
    const map = loadRiskState();
    const rec = getOrInitRecord(map, botId);
    rec.dailyLossUsd       = 0;
    rec.lastDailyResetDate = todayDateString();
    map[botId] = rec;
    saveRiskState(map);
  }

  /** Returns full risk record for display in the UI. */
  getRiskRecord(botId: string): PerBotRiskRecord {
    const map = loadRiskState();
    return getOrInitRecord(map, botId);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SINGLETON  — one RiskManager per botId (created on demand)
// ─────────────────────────────────────────────────────────────────────────────

const _managers = new Map<string, RiskManager>();

export function getRiskManager(botId: string): RiskManager {
  if (!_managers.has(botId)) {
    _managers.set(botId, new RiskManager(botId));
  }
  return _managers.get(botId)!;
}

/** A shared global RiskManager (used for cross-bot queries). */
export const globalRiskManager = new RiskManager('__global__');

/** Re-exports getDailyLoss for direct use in botStore without instantiating. */
export function getDailyLoss(botId: string): number {
  return getRiskManager(botId).getDailyLoss(botId);
}

export function getConsecutiveLosses(botId: string): number {
  return getRiskManager(botId).getConsecutiveLosses(botId);
}

export function updateDailyLoss(botId: string, pnl: number): void {
  getRiskManager(botId).updateDailyLoss(botId, pnl);
}

export function updateConsecutiveLosses(botId: string, isWin: boolean): void {
  getRiskManager(botId).updateConsecutiveLosses(botId, isWin);
}

export function checkPreTradeRisk(bot: UserBot, tradeAmount: number): RiskCheckResult {
  return getRiskManager(bot.id).checkPreTradeRisk(bot, tradeAmount);
}
