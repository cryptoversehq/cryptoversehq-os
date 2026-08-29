/**
 * exchangeRiskManager.ts
 * §4.3 — Real Trade Risk Manager
 *
 * All checks happen synchronously against localStorage-persisted state
 * (since this is a frontend-only simulation). In a real system these
 * would be server-side checks backed by a database.
 *
 * Implements:
 *   – Position size check (§4.3)
 *   – Daily loss limit check (§4.3)
 *   – Monthly loss limit check (§4.3)
 *   – Balance sufficiency check (§4.3)
 *   – Risk metric update + auto kill-switch (§4.3)
 *   – Trading hours gate
 *   – Max leverage guard
 *   – Kill switch evaluation
 */

import { RiskControls } from './exchangeTypes';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface TradeRequest {
  symbol:     string;       // e.g. "BTC/USDT"
  side:       'buy' | 'sell';
  amount:     number;       // base quantity
  price:      number;       // execution price
  orderType:  'market' | 'limit' | 'stop_limit' | 'stop_market';
  leverage?:  number;       // 1 = spot
}

export interface RiskCheckResult {
  allowed:  boolean;
  reason?:  string;
  warnings: string[];       // non-blocking warnings
}

export interface RiskMetrics {
  connectionId:    string;
  dailyLossUSD:    number;
  monthlyLossUSD:  number;
  dailyTradeCount: number;
  openPositionCount: number;
  lastResetDate:   string;  // ISO date "YYYY-MM-DD"
  lastResetMonth:  string;  // ISO "YYYY-MM"
  killSwitchTriggered: boolean;
  killSwitchReason?:   string;
  killSwitchAt?:       string;
}

export interface RiskLimitReachedEvent {
  type:        'daily_loss' | 'monthly_loss' | 'kill_switch' | 'trade_count';
  connectionId: string;
  amount:      number;
  limit:       number;
  message:     string;
}

// ── Storage ────────────────────────────────────────────────────────────────────

const METRICS_KEY = 'cryptoverse_risk_metrics';

function loadAllMetrics(): Record<string, RiskMetrics> {
  try {
    const raw = localStorage.getItem(METRICS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveAllMetrics(all: Record<string, RiskMetrics>): void {
  try { localStorage.setItem(METRICS_KEY, JSON.stringify(all)); } catch {}
}

// ── RiskManager class ──────────────────────────────────────────────────────────

export class ExchangeRiskManager {

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * §4.3: Main risk check called before every trade.
   * Returns { allowed, reason, warnings }.
   */
  checkTradeRisk(
    connectionId: string,
    trade:        TradeRequest,
    controls:     RiskControls,
    availableUSD: number,
    availableBase: number,
  ): RiskCheckResult {
    const warnings: string[] = [];
    const metrics  = this.getMetrics(connectionId);
    const tradeUSD = trade.amount * trade.price;

    // ── Kill switch ───────────────────────────────────────────────────────
    if (metrics.killSwitchTriggered) {
      return {
        allowed: false,
        reason:  `Kill switch active: ${metrics.killSwitchReason ?? 'drawdown limit exceeded'}. Reset via Settings.`,
        warnings: [],
      };
    }

    // ── Position size ─────────────────────────────────────────────────────
    if (tradeUSD > controls.maxPositionSizeUSD) {
      return {
        allowed: false,
        reason:  `Position size $${tradeUSD.toFixed(2)} exceeds limit of $${controls.maxPositionSizeUSD.toLocaleString()}. Reduce quantity or increase limit in Settings.`,
        warnings,
      };
    }

    // ── Daily loss limit ──────────────────────────────────────────────────
    if (metrics.dailyLossUSD + tradeUSD > controls.maxDailyLossUSD) {
      return {
        allowed: false,
        reason:  `Daily loss limit of $${controls.maxDailyLossUSD.toLocaleString()} would be exceeded. Today's losses so far: $${metrics.dailyLossUSD.toFixed(2)}.`,
        warnings,
      };
    }

    // ── Monthly loss limit ────────────────────────────────────────────────
    const monthlyLimit = controls.maxDailyLossUSD * 20; // ~20 trading days
    if (metrics.monthlyLossUSD + tradeUSD > monthlyLimit) {
      return {
        allowed: false,
        reason:  `Monthly loss limit of $${monthlyLimit.toLocaleString()} would be exceeded.`,
        warnings,
      };
    }

    // ── Daily trade count ─────────────────────────────────────────────────
    if (metrics.dailyTradeCount >= controls.maxDailyTradesCount) {
      return {
        allowed: false,
        reason:  `Daily trade limit of ${controls.maxDailyTradesCount} reached. Resets at midnight UTC.`,
        warnings,
      };
    }

    // ── Leverage ──────────────────────────────────────────────────────────
    const leverage = trade.leverage ?? 1;
    if (leverage > controls.maxLeverage) {
      return {
        allowed: false,
        reason:  `Leverage ${leverage}x exceeds your max allowed leverage of ${controls.maxLeverage}x.`,
        warnings,
      };
    }

    // ── Balance sufficiency ───────────────────────────────────────────────
    if (trade.side === 'buy' && availableUSD < tradeUSD) {
      return {
        allowed: false,
        reason:  `Insufficient balance. Need $${tradeUSD.toFixed(2)} ${trade.symbol.split('/')[1] ?? 'USDT'} but only $${availableUSD.toFixed(2)} available.`,
        warnings,
      };
    }

    if (trade.side === 'sell' && availableBase < trade.amount) {
      return {
        allowed: false,
        reason:  `Insufficient ${trade.symbol.split('/')[0] ?? 'asset'} balance. Need ${trade.amount} but only ${availableBase.toFixed(6)} available.`,
        warnings,
      };
    }

    // ── Trading hours ─────────────────────────────────────────────────────
    if (controls.tradingHoursEnabled) {
      const hoursCheck = this.checkTradingHours(controls.tradingHoursStart, controls.tradingHoursEnd);
      if (!hoursCheck.allowed) {
        return {
          allowed: false,
          reason:  `Outside trading hours. Allowed: ${controls.tradingHoursStart}–${controls.tradingHoursEnd} UTC. Current UTC: ${hoursCheck.currentUTC}.`,
          warnings,
        };
      }
    }

    // ── Soft warnings (non-blocking) ──────────────────────────────────────
    const dailyPct = controls.maxDailyLossUSD > 0
      ? (metrics.dailyLossUSD / controls.maxDailyLossUSD) * 100 : 0;
    if (dailyPct >= 80) {
      warnings.push(`⚠️ Daily loss at ${dailyPct.toFixed(0)}% of limit ($${metrics.dailyLossUSD.toFixed(2)} / $${controls.maxDailyLossUSD})`);
    }

    if (tradeUSD > controls.maxPositionSizeUSD * 0.8) {
      warnings.push(`⚠️ Trade size is ${((tradeUSD / controls.maxPositionSizeUSD) * 100).toFixed(0)}% of your position limit`);
    }

    return { allowed: true, warnings };
  }

  /**
   * §4.3: `updateRiskMetrics` — called after every completed trade.
   * Increments daily/monthly loss counters and evaluates kill switch.
   */
  updateMetrics(
    connectionId: string,
    pnl:          number,      // realized PnL (negative = loss)
    controls:     RiskControls,
    callbacks: {
      onKillSwitchTriggered?: (event: RiskLimitReachedEvent) => void;
      onDailyLimitReached?:   (event: RiskLimitReachedEvent) => void;
      onLimitWarning?:        (pct: number) => void;
    } = {},
  ): void {
    const metrics = this.getMetrics(connectionId);
    this.maybeResetDailyMetrics(metrics);
    this.maybeResetMonthlyMetrics(metrics);

    // Increment counters
    metrics.dailyTradeCount += 1;

    if (pnl < 0) {
      const loss = Math.abs(pnl);
      metrics.dailyLossUSD   += loss;
      metrics.monthlyLossUSD += loss;
    }

    // ── Drawdown kill switch (§4.3) ───────────────────────────────────────
    if (controls.killSwitchEnabled && !metrics.killSwitchTriggered) {
      const drawdownPct = controls.maxPositionSizeUSD > 0
        ? (metrics.dailyLossUSD / controls.maxPositionSizeUSD) * 100
        : 0;

      if (drawdownPct >= controls.killSwitchThreshold) {
        metrics.killSwitchTriggered = true;
        metrics.killSwitchReason    = `Drawdown ${drawdownPct.toFixed(1)}% exceeded threshold ${controls.killSwitchThreshold}%`;
        metrics.killSwitchAt        = new Date().toISOString();

        callbacks.onKillSwitchTriggered?.({
          type:         'kill_switch',
          connectionId,
          amount:       metrics.dailyLossUSD,
          limit:        controls.killSwitchThreshold,
          message:      metrics.killSwitchReason,
        });
      }
    }

    // ── Daily loss limit (§4.3) ───────────────────────────────────────────
    if (metrics.dailyLossUSD >= controls.maxDailyLossUSD) {
      callbacks.onDailyLimitReached?.({
        type:         'daily_loss',
        connectionId,
        amount:       metrics.dailyLossUSD,
        limit:        controls.maxDailyLossUSD,
        message:      `Daily loss limit of $${controls.maxDailyLossUSD} reached. Real trading disabled.`,
      });
    }

    // ── 80% warning ───────────────────────────────────────────────────────
    if (controls.maxDailyLossUSD > 0) {
      const pct = (metrics.dailyLossUSD / controls.maxDailyLossUSD) * 100;
      if (pct >= 80) {
        callbacks.onLimitWarning?.(pct);
      }
    }

    this.saveMetrics(connectionId, metrics);
  }

  /**
   * Reset the kill switch (user action in Settings).
   */
  resetKillSwitch(connectionId: string): void {
    const metrics = this.getMetrics(connectionId);
    metrics.killSwitchTriggered = false;
    metrics.killSwitchReason    = undefined;
    metrics.killSwitchAt        = undefined;
    this.saveMetrics(connectionId, metrics);
  }

  /**
   * Get current risk metrics for a connection.
   */
  getMetrics(connectionId: string): RiskMetrics {
    const all    = loadAllMetrics();
    const today  = this.todayDate();
    const month  = this.thisMonth();

    if (!all[connectionId]) {
      all[connectionId] = {
        connectionId,
        dailyLossUSD:        0,
        monthlyLossUSD:      0,
        dailyTradeCount:     0,
        openPositionCount:   0,
        lastResetDate:       today,
        lastResetMonth:      month,
        killSwitchTriggered: false,
      };
      saveAllMetrics(all);
    }

    return all[connectionId];
  }

  /**
   * Get today's daily loss for a connection.
   */
  getDailyLoss(connectionId: string): number {
    return this.getMetrics(connectionId).dailyLossUSD;
  }

  /**
   * Get this month's loss.
   */
  getMonthlyLoss(connectionId: string): number {
    return this.getMetrics(connectionId).monthlyLossUSD;
  }

  /**
   * Returns true if kill switch is active.
   */
  isKillSwitchActive(connectionId: string): boolean {
    return this.getMetrics(connectionId).killSwitchTriggered;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private saveMetrics(connectionId: string, metrics: RiskMetrics): void {
    const all = loadAllMetrics();
    all[connectionId] = metrics;
    saveAllMetrics(all);
  }

  private maybeResetDailyMetrics(metrics: RiskMetrics): void {
    const today = this.todayDate();
    if (metrics.lastResetDate !== today) {
      metrics.dailyLossUSD    = 0;
      metrics.dailyTradeCount = 0;
      metrics.lastResetDate   = today;
    }
  }

  private maybeResetMonthlyMetrics(metrics: RiskMetrics): void {
    const month = this.thisMonth();
    if (metrics.lastResetMonth !== month) {
      metrics.monthlyLossUSD = 0;
      metrics.lastResetMonth = month;
    }
  }

  private checkTradingHours(start: string, end: string): { allowed: boolean; currentUTC: string } {
    const now  = new Date();
    const hhmm = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;
    const ok   = hhmm >= start && hhmm <= end;
    return { allowed: ok, currentUTC: hhmm };
  }

  private todayDate(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private thisMonth(): string {
    return new Date().toISOString().slice(0, 7);
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────────

export const riskManager = new ExchangeRiskManager();
