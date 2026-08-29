/**
 * copyTradeEngine.ts
 *
 * Implements the CopyTradeEngine class — the core execution pipeline
 * for mirroring a trader's position into a follower's account.
 *
 * Steps (mirrors spec §3.1 exactly):
 *   1. Check relationship status is active
 *   2. Apply trade filters (direction, same-symbol, size bounds)
 *   3. Calculate copy amount (copyPct of trader amount)
 *   4. Check follower CP balance (virtual wallet)
 *   5. Check daily loss accumulator against maxDailyLossUsd
 *   6. Execute copy trade — write CopyExecution record
 *   7. Record execution + update relationship counters
 *   8. Calculate & distribute copy fee on SELL (profit > 0)
 *   9. Emit toast notification to follower
 */

import { toast } from 'sonner';
import { useCopyTradingStore } from './copyTradingStore';
import { useCpCoinsStore } from './cpCoinsStore';
import {
  notifyTradeCopied,
  notifyDailyLossWarning,
  notifyStopLossTriggered,
  notifyCopyFeeEarned,
} from '../hooks/useCopyTradingNotifications';
import {
  CopyRelationship,
  CopySettings,
  CopyExecution,
  TopTrader,
} from './copyTradingTypes';

// ─────────────────────────────────────────────────────────────────────────────
// Incoming trade shape (what the trader "did")
// ─────────────────────────────────────────────────────────────────────────────

export interface IncomingTrade {
  id: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  price: number;                 // price in USD
  amount: number;                // position size in USD
  pnl?: number | null;           // realised PnL on SELL (null if BUY)
  pnlPct?: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Engine result
// ─────────────────────────────────────────────────────────────────────────────

export type EngineResult =
  | { ok: true;  execution: CopyExecution }
  | { ok: false; reason: string };

// ─────────────────────────────────────────────────────────────────────────────
// CopyTradeEngine
// ─────────────────────────────────────────────────────────────────────────────

export class CopyTradeEngine {
  private relationshipId: string;

  constructor(relationshipId: string) {
    this.relationshipId = relationshipId;
  }

  // ── Public entry point ────────────────────────────────────────────────────

  async onTraderTrade(trade: IncomingTrade): Promise<EngineResult> {
    const store = useCopyTradingStore.getState();

    // ── Step 1: Relationship must be active ──────────────────────────────────
    const relationship = store.relationships[this.relationshipId];
    if (!relationship) return { ok: false, reason: 'Relationship not found.' };
    if (relationship.status !== 'active') {
      return { ok: false, reason: `Copy is ${relationship.status}. Skipping trade.` };
    }

    const trader = store.traders[relationship.traderId];
    if (!trader) return { ok: false, reason: 'Trader not found.' };

    const settings = relationship.settings;

    // ── Step 2: Trade filters ────────────────────────────────────────────────
    const filterResult = this.shouldCopyTrade(trade, settings, relationship.followerId);
    if (!filterResult.pass) {
      return { ok: false, reason: filterResult.reason };
    }

    // ── Step 3: Calculate copy amount ────────────────────────────────────────
    let copyAmount = this.calculateCopyAmount(trade, settings);

    if (settings.minTradeSizeUsd > 0 && copyAmount < settings.minTradeSizeUsd) {
      return { ok: false, reason: `Copy amount $${copyAmount.toFixed(2)} below minimum $${settings.minTradeSizeUsd}.` };
    }

    if (settings.maxPerTradeUsd > 0 && copyAmount > settings.maxPerTradeUsd) {
      copyAmount = settings.maxPerTradeUsd;   // cap at max (don't reject)
    }

    // ── Step 4: Check follower CP balance ────────────────────────────────────
    const cpStore = useCpCoinsStore.getState();
    const balance = cpStore.getBalance(relationship.followerId);
    const requiredCp = Math.ceil(copyAmount);  // 1 USD ≈ 1 CP for virtual wallet

    if (balance < requiredCp) {
      if (settings.notifyOnCopy) {
        toast.warning(`⚠️ Insufficient balance to copy ${trader.displayName}'s trade. Need ${requiredCp} CP, have ${balance} CP.`);
      }
      return { ok: false, reason: `Insufficient balance. Need ${requiredCp} CP, have ${balance} CP.` };
    }

    // ── Step 5: Daily loss limit ─────────────────────────────────────────────
    if (settings.maxDailyLossUsd > 0) {
      const newDailyLoss = relationship.dailyLossAccumUsd + copyAmount;
      if (newDailyLoss > settings.maxDailyLossUsd) {
        store.pauseCopying(this.relationshipId, 'daily_loss_limit');
        // CT-3 via pause notification (already fires from pauseCopying)
        return { ok: false, reason: 'Daily loss limit reached. Copying paused.' };
      }

      // CT-5 Warn at 80% approach
      const approach = (relationship.dailyLossAccumUsd / settings.maxDailyLossUsd) * 100;
      if (approach >= 80 && settings.notifyOnDailyLossApproach) {
        notifyDailyLossWarning({
          traderName:  trader.displayName,
          lostAmount:  relationship.dailyLossAccumUsd,
          dailyLimit:  settings.maxDailyLossUsd,
          pctConsumed: approach,
        });
      }
    }

    // ── Step 6: Execute copy trade ───────────────────────────────────────────
    const exec = this.buildExecution(relationship, trader, trade, copyAmount);

    // ── Step 7: Record execution + update relationship counters ──────────────
    const isSell = trade.type === 'SELL';
    const pnl    = exec.pnlUsd ?? 0;
    const win    = isSell && pnl > 0;
    const loss   = isSell && pnl < 0;

    const updatedRel: CopyRelationship = {
      ...relationship,
      totalCopiedTrades: relationship.totalCopiedTrades + 1,
      winCopied:         win  ? relationship.winCopied + 1  : relationship.winCopied,
      lossCopied:        loss ? relationship.lossCopied + 1 : relationship.lossCopied,
      totalInvestedUsd:  relationship.totalInvestedUsd + copyAmount,
      totalProfitUsd:    isSell ? relationship.totalProfitUsd + pnl : relationship.totalProfitUsd,
      totalFeesPaidCP:   relationship.totalFeesPaidCP + exec.feePaidCP,
      dailyLossAccumUsd: loss ? relationship.dailyLossAccumUsd + Math.abs(pnl) : relationship.dailyLossAccumUsd,
      lastTradeAt:       exec.executedAt,
    };

    // Persist via the dedicated bridge (handles save() to localStorage too)
    useCopyTradingStore.getState()._persistEngineResult(exec, updatedRel);

    // ── Step 8: Copy fee on profitable SELL ──────────────────────────────────
    if (isSell && pnl > 0 && exec.feePaidCP > 0) {
      ProfitSharingEngine.distributeTradeProfit({
        followerId:  relationship.followerId,
        traderId:    relationship.traderId,
        traderName:  trader.displayName,
        pnl,
        feePct:      trader.copyFeePct,
        feeCP:       exec.feePaidCP,
        executionId: exec.id,
      });

      // CT-6 Fee earned notification for TRADER
      notifyCopyFeeEarned({ amountCP: exec.feePaidCP, period: 'trade' });
    }

    // ── Step 9: Notify follower — CT-1 Trade copied ──────────────────────────
    if (settings.notifyOnCopy) {
      // Count how many followers are copying this trader for the message
      const allCopiers = Object.values(useCopyTradingStore.getState().relationships)
        .filter(r => r.traderId === relationship.traderId && r.status === 'active').length;

      notifyTradeCopied({
        symbol:        trade.symbol,
        followerCount: allCopiers,
        feeCP:         exec.feePaidCP,
        traderName:    trader.displayName,
      });
    }

    return { ok: true, execution: exec };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private shouldCopyTrade(
    trade: IncomingTrade,
    settings: CopySettings,
    followerId: string,
  ): { pass: boolean; reason: string } {
    // Direction filter
    if (trade.type === 'BUY'  && !settings.copyLong)  return { pass: false, reason: 'Long positions disabled in settings.' };
    if (trade.type === 'SELL' && !settings.copyShort) return { pass: false, reason: 'Short positions disabled in settings.' };

    // Skip same-symbol check (we check if the follower has an open execution in same symbol)
    if (settings.skipSameSymbol) {
      const state = useCopyTradingStore.getState();
      const hasOpen = Object.values(state.executions).some(
        e => e.followerId === followerId && e.symbol === trade.symbol && e.status === 'open',
      );
      if (hasOpen) return { pass: false, reason: `Skipping: already have open position in ${trade.symbol}.` };
    }

    return { pass: true, reason: '' };
  }

  private calculateCopyAmount(trade: IncomingTrade, settings: CopySettings): number {
    return +(trade.amount * (settings.copyPct / 100)).toFixed(2);
  }

  private buildExecution(
    rel: CopyRelationship,
    trader: TopTrader,
    trade: IncomingTrade,
    copyAmount: number,
  ): CopyExecution {
    const isSell  = trade.type === 'SELL';
    const pnl     = isSell && trade.pnl != null ? +(trade.pnl * (rel.settings.copyPct / 100)).toFixed(2) : null;
    const pnlPct  = pnl != null ? +((pnl / copyAmount) * 100).toFixed(2) : null;
    const feeCP   = pnl !== null && pnl > 0 ? +(pnl * (trader.copyFeePct / 100)).toFixed(2) : 0;

    return {
      id:                `exec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      relationshipId:    rel.id,
      followerId:        rel.followerId,
      traderId:          rel.traderId,
      traderName:        trader.displayName,
      originalTradeId:   trade.id,
      symbol:            trade.symbol,
      type:              trade.type,
      originalPriceUsd:  trade.price,
      copiedAmountUsd:   copyAmount,
      pnlUsd:            pnl,
      pnlPct,
      feePaidCP:         feeCP,
      executedAt:        new Date().toISOString(),
      closedAt:          isSell ? new Date().toISOString() : null,
      status:            isSell ? 'closed' : 'open',
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience: run engine for ALL active relationships of a given trader
// ─────────────────────────────────────────────────────────────────────────────

export async function broadcastTraderTrade(
  traderId: string,
  trade: IncomingTrade,
): Promise<{ relId: string; result: EngineResult }[]> {
  const state = useCopyTradingStore.getState();
  const activeRels = Object.values(state.relationships).filter(
    r => r.traderId === traderId && r.status === 'active',
  );

  const results: { relId: string; result: EngineResult }[] = [];
  for (const rel of activeRels) {
    const engine = new CopyTradeEngine(rel.id);
    const result = await engine.onTraderTrade(trade);
    results.push({ relId: rel.id, result });
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// ProfitSharingEngine  (§3.2)
// ─────────────────────────────────────────────────────────────────────────────

export interface ProfitDistributionParams {
  followerId:   string;
  traderId:     string;
  traderName:   string;
  pnl:          number;   // gross profit of follower on this trade (USD)
  feePct:       number;   // trader's copy fee %
  feeCP:        number;   // pre-calculated fee in CP
  executionId:  string;
}

export class ProfitSharingEngine {
  /**
   * Distributes one trade's copy fee:
   *   - Debit CP from follower
   *   - Credit CP to trader
   *   - Emit toast to both parties
   */
  static distributeTradeProfit(params: ProfitDistributionParams): void {
    const { followerId, traderId, traderName, pnl, feePct, feeCP, executionId } = params;
    if (feeCP <= 0) return;

    const cpStore = useCpCoinsStore.getState();

    // Debit follower
    cpStore.debit({
      userId:      followerId,
      amount:      feeCP,
      type:        'platform_fee',
      description: `Copy fee (${feePct}%) to ${traderName} — trade ${executionId.slice(0, 8)}`,
      referenceId: executionId,
    });

    // Credit trader
    cpStore.credit({
      userId:      traderId,
      amount:      feeCP,
      type:        'achievement_reward',           // closest available type
      description: `Copy trading fee from follower — trade ${executionId.slice(0, 8)}`,
      referenceId: executionId,
    });

    // Update trader's totalEarningsCP in store (persisted)
    const ctState = useCopyTradingStore.getState();
    const trader  = ctState.traders[traderId];
    if (trader) {
      const updatedTrader  = { ...trader, totalEarningsCP: trader.totalEarningsCP + feeCP };
      const newTradersMap  = { ...ctState.traders, [traderId]: updatedTrader };
      // Use store's own save pattern via setState + localStorage
      try { localStorage.setItem('cryptoverse_copy_traders_v1', JSON.stringify(newTradersMap)); } catch {}
      useCopyTradingStore.setState({ traders: newTradersMap });
    }

    toast.success(`💰 Profit share: ${feeCP.toFixed(2)} CP sent to ${traderName} (${feePct}% of +$${pnl.toFixed(2)})`);
  }

  /**
   * Calculate trader's total earnings across a period.
   * Returns the sum of all copy fees credited to the trader in the window.
   */
  static calculatePeriodEarnings(
    traderId: string,
    period: 'daily' | 'weekly' | 'monthly',
  ): number {
    const cutoffMs: Record<string, number> = {
      daily:   24 * 3_600_000,
      weekly:  7  * 86_400_000,
      monthly: 30 * 86_400_000,
    };
    const cutoff = Date.now() - cutoffMs[period];
    const state  = useCopyTradingStore.getState();

    return Object.values(state.executions)
      .filter(e =>
        e.traderId === traderId &&
        e.status === 'closed' &&
        e.feePaidCP > 0 &&
        new Date(e.executedAt).getTime() >= cutoff,
      )
      .reduce((sum, e) => sum + e.feePaidCP, 0);
  }

  /**
   * Run the full distribution cycle for a trader (daily batch).
   * Credits accumulated fees and fires a summary notification.
   */
  static distributeEarnings(traderId: string): void {
    const earnings = ProfitSharingEngine.calculatePeriodEarnings(traderId, 'daily');
    if (earnings <= 0) return;

    const state    = useCopyTradingStore.getState();
    const trader   = state.traders[traderId];
    if (!trader) return;

    // Earnings already credited per-trade; this is the summary notification
    toast.success(
      `📈 Daily earnings summary: you earned ${earnings.toFixed(2)} CP in copy fees today!`,
      { duration: 7_000 },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CopyRiskManager  (§3.3)
// ─────────────────────────────────────────────────────────────────────────────

export class CopyRiskManager {
  /**
   * Evaluates ALL active relationships for a follower against their risk limits.
   * Pauses any that have breached portfolio stop-loss, take-profit, or daily loss.
   * Called after each trade execution (and can be called periodically).
   */
  static checkAndPauseRiskyCopies(followerId: string): void {
    const state = useCopyTradingStore.getState();
    const activeRels = Object.values(state.relationships).filter(
      r => r.followerId === followerId && r.status === 'active',
    );

    for (const rel of activeRels) {
      const { settings } = rel;

      // ── Portfolio stop-loss — CT-7 ───────────────────────────────────────
      if (settings.stopLossPct > 0) {
        const totalInvested = rel.totalInvestedUsd;
        if (totalInvested > 0) {
          const lossRatio = (Math.min(0, rel.totalProfitUsd) / totalInvested) * 100;
          const lossAbs   = Math.abs(lossRatio);
          if (lossAbs >= settings.stopLossPct) {
            state.pauseCopying(rel.id, 'daily_loss_limit');
            notifyStopLossTriggered({ traderName: rel.traderName, lossPercent: lossAbs });
            continue;
          }
        }
      }

      // ── Portfolio take-profit ────────────────────────────────────────────
      if (settings.takeProfitPct > 0) {
        const totalInvested = rel.totalInvestedUsd;
        if (totalInvested > 0) {
          const profitRatio = (Math.max(0, rel.totalProfitUsd) / totalInvested) * 100;
          if (profitRatio >= settings.takeProfitPct) {
            state.pauseCopying(rel.id, 'manual');
            toast.success(
              `🎯 Take-profit target reached for ${rel.traderName}! ` +
              `+${profitRatio.toFixed(1)}% profit. Copying paused.`,
              { duration: 8_000 },
            );
            continue;
          }
        }
      }

      // ── Daily loss limit — CT-5 ──────────────────────────────────────────
      if (settings.maxDailyLossUsd > 0) {
        if (rel.dailyLossAccumUsd >= settings.maxDailyLossUsd) {
          state.pauseCopying(rel.id, 'daily_loss_limit');
          notifyDailyLossWarning({
            traderName:  rel.traderName,
            lostAmount:  rel.dailyLossAccumUsd,
            dailyLimit:  settings.maxDailyLossUsd,
            pctConsumed: 100,
          });
        }
      }
    }
  }

  /**
   * Resets daily loss accumulators for all relationships of a follower.
   * Should be called once per day (midnight UTC).
   */
  static resetDailyAccumulators(followerId: string): void {
    const state = useCopyTradingStore.getState();
    const toReset = Object.values(state.relationships).filter(r => r.followerId === followerId);

    const updatedRels = { ...state.relationships };
    for (const rel of toReset) {
      updatedRels[rel.id] = { ...rel, dailyLossAccumUsd: 0 };
    }
    useCopyTradingStore.setState({ relationships: updatedRels });
  }
}
