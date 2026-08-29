/**
 * useCopyTradingNotifications.ts  — §6 Notification System
 *
 * All 7 event types specified in Part 6, delivered via:
 *   1. Sonner toast (immediate, transient)
 *   2. AppStore NotificationPanel (persistent, bell icon)
 *
 * Uses the same notification bridge pattern as tradingStore.
 *
 * Event Types:
 *   CT-1  Trade copied           "Your trade on {symbol} was copied by {n} followers!"
 *   CT-2  New follower           "{user} started copying your trades at {pct}%!"
 *   CT-3  Copy paused            "Copying {trader} paused. Reason: {reason}"
 *   CT-4  Copy resumed           "Copying {trader} resumed."
 *   CT-5  Daily loss warning     "Warning: You have lost {amount} today..."
 *   CT-6  Copy fee earned        "You earned {amount} CP from copy fees in the last {period}!"
 *   CT-7  Stop loss triggered    "Portfolio stop loss triggered. Copying paused."
 *
 * Also provides:
 *   - digestNotification()  — daily/weekly summary roll-up
 *   - useDailyDigest()      — React hook that auto-fires digest every N ms
 */

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useAppStore } from '@/lib/appStore';
import { useCopyTradingStore } from '@/lib/copyTradingStore';
import { CopyRelationship } from '@/lib/copyTradingTypes';

// ─────────────────────────────────────────────────────────────────────────────
// Notification emitter — dual channel (toast + appStore)
// ─────────────────────────────────────────────────────────────────────────────

type AppNotifType = 'trade' | 'liquidation' | 'achievement' | 'system';

function emit(
  toastFn: typeof toast.success | typeof toast.error | typeof toast.warning | typeof toast.info,
  appType: AppNotifType,
  title: string,
  message: string,
  duration = 6_000,
) {
  // 1. Sonner toast
  toastFn(`${title}\n${message}`, { duration });

  // 2. Persistent notification panel
  useAppStore.getState().addNotification({ type: appType, title, message });
}

// ─────────────────────────────────────────────────────────────────────────────
// CT-1  Trade copied
// ─────────────────────────────────────────────────────────────────────────────

export function notifyTradeCopied(params: {
  symbol:        string;
  followerCount: number;
  feeCP:         number;
  traderName:    string;
}) {
  const { symbol, followerCount, feeCP, traderName } = params;
  emit(
    toast.success,
    'trade',
    `📋 Trade Copied — ${symbol}`,
    `Your ${symbol} trade was copied by ${followerCount} follower${followerCount !== 1 ? 's' : ''}! ` +
    (feeCP > 0 ? `+${feeCP.toFixed(2)} CP earned.` : ''),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CT-2  New follower
// ─────────────────────────────────────────────────────────────────────────────

export function notifyNewFollower(params: {
  followerName:    string;
  copyPercentage:  number;
  traderName:      string;
}) {
  const { followerName, copyPercentage } = params;
  emit(
    toast.success,
    'achievement',
    '👥 New Follower!',
    `${followerName} started copying your trades at ${copyPercentage}%!`,
    7_000,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CT-3  Copy paused
// ─────────────────────────────────────────────────────────────────────────────

export function notifyCopyPaused(params: {
  traderName: string;
  reason:     string;
}) {
  const { traderName, reason } = params;
  emit(
    toast.warning,
    'system',
    '⏸ Copy Trading Paused',
    `Copying ${traderName} paused. Reason: ${reason}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CT-4  Copy resumed
// ─────────────────────────────────────────────────────────────────────────────

export function notifyCopyResumed(params: {
  traderName: string;
}) {
  emit(
    toast.success,
    'system',
    '▶️ Copy Trading Resumed',
    `Copying ${params.traderName} resumed. Trades will be mirrored again.`,
    5_000,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CT-5  Daily loss warning
// ─────────────────────────────────────────────────────────────────────────────

export function notifyDailyLossWarning(params: {
  traderName:  string;
  lostAmount:  number;
  dailyLimit:  number;
  pctConsumed: number;
}) {
  const { traderName, lostAmount, dailyLimit, pctConsumed } = params;
  emit(
    toast.error,
    'liquidation',
    '⚠️ Daily Loss Warning',
    `Warning: You have lost $${lostAmount.toFixed(2)} today copying ${traderName}. ` +
    `Daily limit is $${dailyLimit.toFixed(0)} (${pctConsumed.toFixed(0)}% consumed).`,
    9_000,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CT-6  Copy fee earned (digest or per-trade)
// ─────────────────────────────────────────────────────────────────────────────

export function notifyCopyFeeEarned(params: {
  amountCP: number;
  period:   'trade' | 'daily' | 'weekly';
}) {
  const { amountCP, period } = params;
  const label = period === 'trade' ? 'this trade' : `the last ${period === 'daily' ? '24 hours' : 'week'}`;
  emit(
    toast.success,
    'achievement',
    '💰 Copy Fee Earned',
    `You earned ${amountCP.toFixed(2)} CP from copy fees in ${label}!`,
    6_000,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CT-7  Stop loss triggered
// ─────────────────────────────────────────────────────────────────────────────

export function notifyStopLossTriggered(params: {
  traderName:  string;
  lossPercent: number;
}) {
  const { traderName, lossPercent } = params;
  emit(
    toast.error,
    'liquidation',
    '🛑 Stop Loss Triggered',
    `Portfolio stop loss triggered for ${traderName} (${lossPercent.toFixed(1)}% loss). Copying paused automatically.`,
    10_000,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily / weekly digest
// ─────────────────────────────────────────────────────────────────────────────

export interface DigestSummary {
  period:           'daily' | 'weekly';
  totalTradesCopied: number;
  totalProfitUsd:   number;
  totalFeesPaidCP:  number;
  bestTrader:       string | null;
  worstTrader:      string | null;
  activeRelCount:   number;
}

export function buildDigest(userId: string, period: 'daily' | 'weekly'): DigestSummary {
  const state = useCopyTradingStore.getState();
  const rels  = Object.values(state.relationships).filter(r => r.followerId === userId);

  const activeRels = rels.filter(r => r.status === 'active');
  const totalTrades = rels.reduce((s, r) => s + r.totalCopiedTrades, 0);
  const totalProfit = rels.reduce((s, r) => s + r.totalProfitUsd, 0);
  const totalFees   = rels.reduce((s, r) => s + r.totalFeesPaidCP, 0);

  const sortedByProfit = [...rels].sort((a, b) => b.totalProfitUsd - a.totalProfitUsd);
  const best  = sortedByProfit[0]?.traderName ?? null;
  const worst = sortedByProfit[sortedByProfit.length - 1]?.traderName ?? null;

  return {
    period,
    totalTradesCopied: totalTrades,
    totalProfitUsd:    totalProfit,
    totalFeesPaidCP:   totalFees,
    bestTrader:        best !== worst ? best : null,
    worstTrader:       best !== worst ? worst : null,
    activeRelCount:    activeRels.length,
  };
}

export function digestNotification(userId: string, period: 'daily' | 'weekly') {
  const digest = buildDigest(userId, period);
  const periodLabel = period === 'daily' ? 'Today' : 'This week';
  const profitSign  = digest.totalProfitUsd >= 0 ? '+' : '';
  const profitColor = digest.totalProfitUsd >= 0 ? '📈' : '📉';

  const parts = [
    `${profitColor} P&L: ${profitSign}$${digest.totalProfitUsd.toFixed(2)}`,
    `${digest.totalTradesCopied} trades copied`,
    `${digest.activeRelCount} active streams`,
    digest.totalFeesPaidCP > 0 ? `${digest.totalFeesPaidCP.toFixed(1)} CP fees` : '',
  ].filter(Boolean).join(' · ');

  emit(
    digest.totalProfitUsd >= 0 ? toast.success : toast.warning,
    'achievement',
    `📊 ${periodLabel}'s Copy Trading Summary`,
    parts,
    12_000,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// React hook — auto-fires digest + proactive risk alerts
// ─────────────────────────────────────────────────────────────────────────────

interface DigestOptions {
  userId:         string;
  digestInterval?: number;   // ms between digests (default 30 min in dev)
  enabled?:       boolean;
}

export function useCopyTradingNotifications({
  userId,
  digestInterval = 30 * 60 * 1_000,   // 30 min
  enabled = true,
}: DigestOptions) {
  const relationships = useCopyTradingStore(s => s.relationships);
  const prevRels = useRef<Record<string, CopyRelationship>>({});
  const lastDigest = useRef<number>(0);

  // ── Relationship diff-watcher: detect pause, resume, new follower ─────────
  useEffect(() => {
    if (!enabled || !userId) return;

    const current = Object.values(relationships).filter(r => r.followerId === userId);
    const prev    = prevRels.current;

    current.forEach(rel => {
      const was = prev[rel.id];
      if (!was) return;   // newly created — handled by startCopying

      // CT-3 Copy paused
      if (was.status === 'active' && rel.status === 'paused') {
        const reason = rel.pauseReason === 'daily_loss_limit'
          ? 'Daily loss limit reached'
          : 'Manually paused';
        notifyCopyPaused({ traderName: rel.traderName, reason });
      }

      // CT-4 Copy resumed
      if (was.status === 'paused' && rel.status === 'active') {
        notifyCopyResumed({ traderName: rel.traderName });
      }

      // CT-5 Daily loss warning (80% threshold)
      if (rel.settings.maxDailyLossUsd > 0 && rel.status === 'active') {
        const pct = (rel.dailyLossAccumUsd / rel.settings.maxDailyLossUsd) * 100;
        const wasPct = was.dailyLossAccumUsd / rel.settings.maxDailyLossUsd * 100;
        if (pct >= 80 && wasPct < 80) {
          notifyDailyLossWarning({
            traderName:  rel.traderName,
            lostAmount:  rel.dailyLossAccumUsd,
            dailyLimit:  rel.settings.maxDailyLossUsd,
            pctConsumed: pct,
          });
        }
      }

      // CT-7 Stop loss triggered — profit dropped below stopLoss threshold
      if (rel.settings.stopLossPct > 0 && rel.totalInvestedUsd > 0) {
        const lossRatio = (Math.min(0, rel.totalProfitUsd) / rel.totalInvestedUsd) * -100;
        const wasLossRatio = was.totalInvestedUsd > 0
          ? (Math.min(0, was.totalProfitUsd) / was.totalInvestedUsd) * -100 : 0;
        if (lossRatio >= rel.settings.stopLossPct && wasLossRatio < rel.settings.stopLossPct) {
          notifyStopLossTriggered({ traderName: rel.traderName, lossPercent: lossRatio });
        }
      }
    });

    // Store snapshot for next diff
    const nextPrev: Record<string, CopyRelationship> = {};
    current.forEach(r => { nextPrev[r.id] = r; });
    prevRels.current = nextPrev;
  }, [relationships, userId, enabled]);

  // ── Periodic digest ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !userId) return;

    const interval = setInterval(() => {
      const now = Date.now();
      if (now - lastDigest.current >= digestInterval) {
        digestNotification(userId, 'daily');
        lastDigest.current = now;
      }
    }, 60_000);   // check every minute

    return () => clearInterval(interval);
  }, [userId, digestInterval, enabled]);
}
