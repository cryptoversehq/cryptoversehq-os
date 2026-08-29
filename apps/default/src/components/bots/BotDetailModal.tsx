/**
 * BotDetailModal.tsx — Full-detail slide-in for a single bot.
 *
 * Shows:
 *  - Header with name, type, status and quick action buttons
 *  - Equity curve (gold Recharts AreaChart)
 *  - 8 key metric cards (same CV colors as backtest)
 *  - Live trade execution log (newest first)
 *  - Configuration summary accordion
 *  - Delete confirmation flow
 */

import React, { useState, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Play, Pause, Square, Trash2,
  TrendingUp, TrendingDown, Activity, Shield,
  Target, Zap, Clock, DollarSign,
  BarChart2, ArrowUpRight, ArrowDownRight,
  ChevronDown, ChevronUp, AlertTriangle,
  Settings, History, FileText, List,
  Download, ExternalLink,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
  ComposedChart, Bar,
} from 'recharts';
import { toast } from 'sonner';
import type { UserBot, BotExecution, MartingaleState, DcaState, ArbitrageState, ArbitrageCycle } from '../../lib/botTypes';
import { useBotStore } from '../../lib/botStore';
import { getRiskManager } from '../../lib/riskManager';
import { useAuthStore } from '../../lib/authStore';
import { BotErrorBanner } from './BotErrorBanner';
import { BotStatusBadge } from './BotStatusBadge';
import {
  CV, BOT_TYPE_META, fmtUsd, fmtPct, fmtDate, fmtRelative,
} from './BotConstants';

// ─────────────────────────────────────────────────────────────────────────────
// METRIC CARD
// ─────────────────────────────────────────────────────────────────────────────

interface MetricProps {
  label:    string;
  value:    string;
  sub?:     string;
  icon:     React.ElementType;
  color:    string;
}

function MetricCard({ label, value, sub, icon: Icon, color }: MetricProps) {
  return (
    <div
      className="flex flex-col gap-1.5 p-3 rounded-xl border"
      style={{ background: `${color}10`, borderColor: `${color}28` }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: CV.gray }}>
          {label}
        </span>
        <Icon className="h-3 w-3" style={{ color: `${color}90` }} />
      </div>
      <span className="text-base font-bold tabular-nums" style={{ color }}>
        {value}
      </span>
      {sub && <span className="text-[10px]" style={{ color: CV.gray }}>{sub}</span>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EXECUTION ROW
// ─────────────────────────────────────────────────────────────────────────────

function ExecRow({ exec }: { exec: BotExecution }) {
  const isBuy  = exec.action === 'buy';
  const color  = isBuy ? CV.green : (exec.pnl != null && exec.pnl < 0 ? CV.red : CV.green);
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
      style={{ background: 'rgba(255,255,255,0.025)' }}
    >
      <div
        className="h-5 w-5 rounded-full flex items-center justify-center shrink-0"
        style={{ background: `${color}15`, border: `1px solid ${color}30` }}
      >
        {isBuy
          ? <ArrowDownRight className="h-3 w-3" style={{ color }} />
          : <ArrowUpRight   className="h-3 w-3" style={{ color }} />}
      </div>
      <span className="font-semibold uppercase" style={{ color, width: 28 }}>
        {exec.action}
      </span>
      <span className="text-foreground font-mono">
        {exec.amount.toFixed(4)} {exec.coinSymbol}
      </span>
      <span style={{ color: CV.gray }}>@</span>
      <span className="text-foreground font-mono">${exec.price.toLocaleString()}</span>
      {exec.pnl != null && (
        <span
          className="ml-auto font-bold tabular-nums"
          style={{ color: exec.pnl >= 0 ? CV.green : CV.red }}
        >
          {exec.pnl >= 0 ? '+' : ''}{fmtUsd(exec.pnl, false)}
        </span>
      )}
      <span className="ml-1" style={{ color: 'rgba(156,163,175,0.50)' }}>
        {fmtRelative(exec.executedAt)}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MARTINGALE CYCLE STATUS WIDGET
// ─────────────────────────────────────────────────────────────────────────────

function MartingaleCycleStatus({
  botId,
  config,
}: {
  botId:  string;
  config: {
    baseAmount:           number;
    multiplier:           number;
    maxConsecutiveLosses: number;
    takeProfitPct:        number;
    direction:            'long' | 'short' | 'both';
  };
}) {
  const getMartingaleState = useBotStore(s => s.getMartingaleState);
  // Re-read on every bot store change
  const martStates = useBotStore(s => s.martStates);
  const state: MartingaleState | null = getMartingaleState(botId);

  if (!state) return null;

  const totalLosses    = state.consecutiveLosses;
  const currentMult    = state.currentMultiplier;
  const currentSize    = Math.round(config.baseAmount * currentMult * 100) / 100;
  const maxLosses      = config.maxConsecutiveLosses;
  const nextSide       = state.nextSide;
  const hasOpen        = state.hasOpenTrade;

  return (
    <div className="px-5 pt-4">
      <div
        className="p-3.5 rounded-xl border"
        style={{
          background:  'rgba(129,140,248,0.06)',
          borderColor: 'rgba(129,140,248,0.20)',
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold" style={{ color: '#818cf8' }}>
            🎯 Martingale Cycle
          </span>
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={hasOpen ? {
              background: 'rgba(255,215,0,0.10)', color: CV.gold,
              border: '1px solid rgba(255,215,0,0.22)',
            } : {
              background: 'rgba(156,163,175,0.08)', color: CV.gray,
              border: '1px solid rgba(156,163,175,0.15)',
            }}
          >
            {hasOpen ? '⚡ Trade Open' : '⏳ Waiting'}
          </span>
        </div>

        {/* Consecutive losses progress bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px]" style={{ color: CV.gray }}>Consecutive Losses</span>
            <span
              className="text-[10px] font-bold"
              style={{ color: totalLosses === 0 ? CV.green : totalLosses < maxLosses - 1 ? CV.orange : CV.red }}
            >
              {totalLosses} / {maxLosses}
            </span>
          </div>
          <div className="flex gap-1">
            {Array.from({ length: maxLosses }, (_, i) => (
              <div
                key={i}
                className="flex-1 h-2 rounded-full transition-all duration-300"
                style={{
                  background: i < totalLosses
                    ? (i < 2 ? CV.orange : CV.red)
                    : 'rgba(255,255,255,0.08)',
                }}
              />
            ))}
          </div>
        </div>

        {/* Current trade size + multiplier */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <p className="text-[9px]" style={{ color: CV.gray }}>Current Size</p>
            <p className="text-xs font-bold" style={{ color: CV.gold }}>${currentSize}</p>
          </div>
          <div className="py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <p className="text-[9px]" style={{ color: CV.gray }}>Multiplier</p>
            <p className="text-xs font-bold" style={{ color: currentMult > 1 ? CV.red : CV.green }}>
              {currentMult.toFixed(2)}×
            </p>
          </div>
          <div className="py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <p className="text-[9px]" style={{ color: CV.gray }}>Next Side</p>
            <p className="text-xs font-bold" style={{ color: nextSide === 'long' ? CV.green : CV.red }}>
              {nextSide === 'long' ? '📈 Long' : '📉 Short'}
            </p>
          </div>
        </div>

        {hasOpen && (
          <div className="mt-2 pt-2 border-t flex items-center justify-between text-[10px]"
            style={{ borderColor: 'rgba(255,255,255,0.06)' }}
          >
            <span style={{ color: CV.gray }}>Entry price:</span>
            <span className="font-mono font-semibold" style={{ color: CV.gold }}>
              ${state.openEntryPrice.toLocaleString()}
            </span>
            <span style={{ color: CV.gray }}>TP at:</span>
            <span className="font-mono font-semibold" style={{ color: CV.green }}>
              ${state.takeProfitPrice.toLocaleString()}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DCA POSITION STATUS WIDGET
// ─────────────────────────────────────────────────────────────────────────────

function DcaPositionStatus({
  botId,
  config,
}: {
  botId:  string;
  config: {
    initialInvestment:  number;
    numberOfOrders:     number;
    priceDropPct:       number;
    takeProfitPct:      number;
    partialExit:        boolean;
  };
}) {
  const getDcaState    = useBotStore(s => s.getDcaState);
  const dcaStates      = useBotStore(s => s.dcaStates); // reactive dep
  const state: DcaState | null = getDcaState(botId);

  if (!state || state.ordersPlaced === 0) {
    return (
      <div className="px-5 pt-4">
        <div
          className="flex items-center gap-2 p-3 rounded-xl text-xs"
          style={{ background: 'rgba(0,200,83,0.05)', borderColor: 'rgba(0,200,83,0.15)', border: '1px solid', color: CV.gray }}
        >
          <span>📈</span>
          DCA position not started — waiting for first price tick.
        </div>
      </div>
    );
  }

  const ordersRemaining   = config.numberOfOrders - state.ordersPlaced;
  const tpPrice           = state.averagePrice * (1 + config.takeProfitPct / 100);
  const holdingShares     = state.partialExitDone ? state.remainingShares : state.totalShares;
  const holdingValue      = holdingShares * state.averagePrice; // approx

  return (
    <div className="px-5 pt-4">
      <div
        className="p-3.5 rounded-xl border"
        style={{ background: 'rgba(0,200,83,0.05)', borderColor: 'rgba(0,200,83,0.18)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold" style={{ color: CV.green }}>📈 DCA Position</span>
          {state.partialExitDone && (
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(255,215,0,0.10)', color: CV.gold, border: '1px solid rgba(255,215,0,0.22)' }}
            >
              🔀 Half Exited
            </span>
          )}
        </div>

        {/* Order fill progress */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px]" style={{ color: CV.gray }}>Orders Placed</span>
            <span className="text-[10px] font-bold" style={{ color: CV.green }}>
              {state.ordersPlaced} / {config.numberOfOrders}
            </span>
          </div>
          <div className="flex gap-1">
            {Array.from({ length: config.numberOfOrders }, (_, i) => (
              <div
                key={i}
                className="flex-1 h-2 rounded-full transition-all duration-300"
                style={{ background: i < state.ordersPlaced ? CV.green : 'rgba(255,255,255,0.08)' }}
              />
            ))}
          </div>
          <p className="text-[9px] mt-1" style={{ color: CV.gray }}>
            {ordersRemaining > 0
              ? `Next buy triggers at ${config.priceDropPct}% below ${state.lastBuyPrice.toLocaleString()}`
              : 'All orders placed — waiting for take profit'}
          </p>
        </div>

        {/* Key position stats */}
        <div className="grid grid-cols-3 gap-2 text-center mb-3">
          <div className="py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <p className="text-[9px]" style={{ color: CV.gray }}>Avg Entry</p>
            <p className="text-xs font-bold tabular-nums" style={{ color: CV.gold }}>
              ${state.averagePrice > 0 ? state.averagePrice.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}
            </p>
          </div>
          <div className="py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <p className="text-[9px]" style={{ color: CV.gray }}>Total Invested</p>
            <p className="text-xs font-bold tabular-nums" style={{ color: CV.green }}>${state.totalInvestment.toFixed(0)}</p>
          </div>
          <div className="py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <p className="text-[9px]" style={{ color: CV.gray }}>Holding</p>
            <p className="text-xs font-bold tabular-nums" style={{ color: CV.gold }}>
              {holdingShares.toFixed(4)}
            </p>
          </div>
        </div>

        {/* TP target */}
        {state.averagePrice > 0 && (
          <div
            className="flex items-center justify-between px-2.5 py-2 rounded-lg text-[10px]"
            style={{ background: 'rgba(0,200,83,0.06)', border: '1px solid rgba(0,200,83,0.12)' }}
          >
            <span style={{ color: CV.gray }}>Take profit target:</span>
            <span className="font-mono font-bold" style={{ color: CV.green }}>
              ${tpPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
            <span style={{ color: CV.gray }}>({config.takeProfitPct}% above avg)</span>
          </div>
        )}

        {/* Partial exit status */}
        {config.partialExit && (
          <p className="text-[9px] mt-2" style={{ color: CV.gray }}>
            {state.partialExitDone
              ? `Partial exit done — ${holdingShares.toFixed(4)} coins remaining, still tracking TP.`
              : `Partial exit enabled — will sell 50% at TP, then track full exit.`}
          </p>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ARBITRAGE LOG WIDGET
// ─────────────────────────────────────────────────────────────────────────────

function ArbitrageLogWidget({ botId, config }: {
  botId:  string;
  config: { monitoredPairs?: Array<{ symbol: string }>; minProfitPct?: number; maxPositionSize?: number; scanIntervalSec?: number };
}) {
  const getArbState = useBotStore(s => s.getArbState);
  const arbStates   = useBotStore(s => s.arbStates); // reactive dep
  const state: ArbitrageState | null = getArbState(botId);

  const pairs       = config.monitoredPairs ?? [];
  const minProfit   = config.minProfitPct   ?? 0.5;
  const maxPos      = config.maxPositionSize ?? 5_000;
  const scanSec     = config.scanIntervalSec ?? 10;

  return (
    <div className="px-5 pt-4">
      <div
        className="p-3.5 rounded-xl border"
        style={{ background: 'rgba(255,215,0,0.04)', borderColor: 'rgba(255,215,0,0.18)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold" style={{ color: CV.gold }}>⚡ Arbitrage Scanner</span>
          <div className="flex items-center gap-2 text-[10px]" style={{ color: CV.gray }}>
            <span>Scan: {scanSec}s</span>
            <span>·</span>
            <span>Min: {minProfit}%</span>
          </div>
        </div>

        {/* Monitored pairs chips */}
        <div className="flex gap-1.5 mb-3 flex-wrap">
          {pairs.map(p => (
            <span
              key={p.symbol}
              className="px-2 py-0.5 rounded-full text-[10px] font-bold"
              style={{ background: 'rgba(255,215,0,0.10)', color: CV.gold, border: '1px solid rgba(255,215,0,0.22)' }}
            >
              {p.symbol}/USDT
            </span>
          ))}
        </div>

        {/* Aggregate stats */}
        <div className="grid grid-cols-3 gap-2 text-center mb-3">
          <div className="py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <p className="text-[9px]" style={{ color: CV.gray }}>Total Cycles</p>
            <p className="text-xs font-bold" style={{ color: CV.gold }}>{state?.totalCycles ?? 0}</p>
          </div>
          <div className="py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <p className="text-[9px]" style={{ color: CV.gray }}>Net Profit</p>
            <p className="text-xs font-bold" style={{ color: (state?.totalNetProfit ?? 0) >= 0 ? CV.green : CV.red }}>
              {(state?.totalNetProfit ?? 0) >= 0 ? '+' : ''}${(state?.totalNetProfit ?? 0).toFixed(2)}
            </p>
          </div>
          <div className="py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <p className="text-[9px]" style={{ color: CV.gray }}>Last Scan Opps</p>
            <p className="text-xs font-bold" style={{ color: CV.gold }}>{state?.lastScanOpps?.length ?? 0}</p>
          </div>
        </div>

        {/* Last scan opportunities (if any) */}
        {(state?.lastScanOpps?.length ?? 0) > 0 && (
          <div className="mb-3">
            <p className="text-[9px] mb-1 font-semibold" style={{ color: CV.gray }}>Last scan — opportunities found:</p>
            <div className="flex flex-col gap-1">
              {state!.lastScanOpps.slice(0, 3).map((opp, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[10px]"
                  style={{
                    background: i === 0 ? 'rgba(0,200,83,0.08)' : 'rgba(255,255,255,0.02)',
                    border:     `1px solid ${i === 0 ? 'rgba(0,200,83,0.15)' : 'rgba(255,255,255,0.05)'}`,
                  }}
                >
                  <span className="font-bold" style={{ color: i === 0 ? CV.green : CV.gray }}>{opp.pair}</span>
                  <span className="font-mono">${opp.buyPrice.toLocaleString()} → ${opp.sellPrice.toLocaleString()}</span>
                  <span className="font-bold" style={{ color: i === 0 ? CV.green : CV.gray }}>
                    +{opp.profitPercent.toFixed(3)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent cycles log */}
        <div>
          <p className="text-[9px] mb-1.5 font-semibold" style={{ color: CV.gray }}>
            Recent arb cycles ({state?.recentCycles?.length ?? 0}):
          </p>
          {(state?.recentCycles?.length ?? 0) === 0 ? (
            <p className="text-[10px] text-center py-3" style={{ color: CV.gray }}>
              No cycles yet — bot is scanning…
            </p>
          ) : (
            <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
              {(state?.recentCycles ?? []).slice(0, 15).map(cycle => {
                const isProfitable = cycle.netProfitUsd >= 0;
                return (
                  <div
                    key={cycle.id}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[10px]"
                    style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
                  >
                    <span
                      className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] shrink-0"
                      style={{
                        background: isProfitable ? 'rgba(0,200,83,0.15)' : 'rgba(255,59,48,0.12)',
                        color:       isProfitable ? CV.green : CV.red,
                      }}
                    >
                      {isProfitable ? '↑' : '↓'}
                    </span>
                    <span className="font-bold" style={{ color: CV.gold }}>{cycle.pair}</span>
                    <span className="font-mono text-foreground">${cycle.buyPrice.toLocaleString()}</span>
                    <span style={{ color: CV.gray }}>→</span>
                    <span className="font-mono text-foreground">${cycle.sellPrice.toLocaleString()}</span>
                    <span
                      className="ml-auto font-bold tabular-nums"
                      style={{ color: isProfitable ? CV.green : CV.red }}
                    >
                      {isProfitable ? '+' : ''}${cycle.netProfitUsd.toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REBALANCING PORTFOLIO WIDGET
// ─────────────────────────────────────────────────────────────────────────────

function RebalancingPortfolioWidget({ botId, config }: {
  botId:  string;
  config: {
    assets?:                 Array<{ coinSymbol: string; coinColor: string; coinId: string; targetPct: number }>;
    allocations?:            Array<{ coinSymbol: string; coinColor: string; coinId: string; targetPct: number }>;
    rebalanceThresholdPct?:  number;
    driftThresholdPct?:      number;
    rebalanceIntervalHours?: number;
    minTradeSizeUsd?:        number;
    totalPortfolioUsd?:      number;
  };
}) {
  const getRebalState = useBotStore(s => s.getRebalancingState);
  const rebalStates   = useBotStore(s => s.rebalStates);
  const state         = getRebalState(botId);

  const assets     = config.assets ?? config.allocations ?? [];
  const threshold  = config.rebalanceThresholdPct ?? config.driftThresholdPct ?? 5;
  const intervalH  = config.rebalanceIntervalHours ?? 24;
  const minTrade   = config.minTradeSizeUsd ?? 50;
  const totalPfUsd = config.totalPortfolioUsd ?? 0;

  // Countdown to next rebalance
  const nextMs = state?.nextRebalanceAt ? Math.max(0, new Date(state.nextRebalanceAt).getTime() - Date.now()) : null;
  const nextHr = nextMs !== null ? (nextMs / 3_600_000).toFixed(1) : null;

  const totalValue = state?.holdings.reduce((s, h) => s + h.currentValue, 0) ?? totalPfUsd;
  const hasHoldings = (state?.holdings?.length ?? 0) > 0;

  return (
    <div className="px-5 pt-4">
      <div
        className="p-3.5 rounded-xl border"
        style={{ background: 'rgba(99,102,241,0.05)', borderColor: 'rgba(99,102,241,0.20)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold" style={{ color: '#818cf8' }}>⚖️ Portfolio Rebalancer</span>
          <div className="flex items-center gap-1.5 text-[10px]">
            {nextHr !== null && (
              <span
                className="px-2 py-0.5 rounded-full font-semibold"
                style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.25)' }}
              >
                Next: {nextHr}h
              </span>
            )}
            <span style={{ color: CV.gray }}>Cycles: {state?.totalRebalances ?? 0}</span>
          </div>
        </div>

        {/* Stacked allocation bar */}
        <div className="mb-3">
          <p className="text-[9px] mb-1.5 font-semibold" style={{ color: CV.gray }}>Current vs Target Allocation</p>
          {/* Target bar */}
          <div className="flex h-2 rounded-full overflow-hidden mb-1">
            {assets.map(a => (
              <div key={a.coinId} className="h-full" style={{ width: `${a.targetPct}%`, background: `${a.coinColor}80` }} />
            ))}
          </div>
          {/* Actual bar */}
          <div className="flex h-2 rounded-full overflow-hidden">
            {(hasHoldings ? state!.holdings : assets.map(a => ({ ...a, currentPct: a.targetPct, driftPct: 0 }))).map(h => (
              <div
                key={h.coinId}
                className="h-full transition-all duration-500"
                style={{ width: `${h.currentPct}%`, background: h.coinColor }}
              />
            ))}
          </div>
          <div className="flex justify-between mt-1 text-[8px]" style={{ color: CV.gray }}>
            <span>Target (faded) vs Current (solid)</span>
          </div>
        </div>

        {/* Asset breakdown */}
        <div className="flex flex-col gap-1.5 mb-3">
          {(hasHoldings ? state!.holdings : assets.map(a => ({ ...a, currentPct: a.targetPct, currentValue: (totalPfUsd * a.targetPct) / 100, driftPct: 0, coinAmount: 0 }))).map(h => {
            const isOver  = h.driftPct > threshold;
            const isUnder = h.driftPct < -threshold;
            const driftAbs = Math.abs(h.driftPct);
            return (
              <div
                key={h.coinId}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.025)', border: `1px solid ${isOver || isUnder ? (isOver ? 'rgba(255,59,48,0.20)' : 'rgba(99,102,241,0.20)') : 'rgba(255,255,255,0.05)'}` }}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: h.coinColor }} />
                <span className="text-[10px] font-bold w-10" style={{ color: h.coinColor }}>{h.coinSymbol}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-1 text-[9px]">
                    <span style={{ color: CV.gray }}>Target: {h.targetPct}%</span>
                    <span style={{ color: CV.gray }}>→</span>
                    <span style={{ color: isOver ? CV.red : isUnder ? '#818cf8' : CV.green }}>
                      Actual: {h.currentPct.toFixed(1)}%
                    </span>
                  </div>
                  {/* Drift bar */}
                  <div className="flex h-1 rounded-full overflow-hidden mt-0.5 bg-white/5">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width:      `${Math.min(100, (driftAbs / 20) * 100)}%`,
                        background: isOver ? CV.red : isUnder ? '#818cf8' : CV.green,
                      }}
                    />
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-mono tabular-nums text-foreground">${h.currentValue.toFixed(0)}</p>
                  {driftAbs > 0 && (
                    <p className="text-[8px]" style={{ color: isOver ? CV.red : isUnder ? '#818cf8' : CV.gray }}>
                      {isOver ? '↑' : '↓'}{driftAbs.toFixed(1)}%{driftAbs > threshold ? ' ⚡' : ''}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Portfolio total */}
        <div
          className="flex items-center justify-between px-2.5 py-2 rounded-lg mb-3 text-[10px]"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <span style={{ color: CV.gray }}>Portfolio value</span>
          <span className="font-bold font-mono" style={{ color: CV.gold }}>${totalValue.toFixed(2)}</span>
          <span style={{ color: CV.gray }}>Threshold: {threshold}%</span>
          <span style={{ color: CV.gray }}>Min: ${minTrade}</span>
        </div>

        {/* Last trades */}
        {(state?.lastTrades?.length ?? 0) > 0 && (
          <div>
            <p className="text-[9px] mb-1.5 font-semibold" style={{ color: CV.gray }}>
              Last rebalance trades ({state!.lastRebalanceAt ? new Date(state!.lastRebalanceAt).toLocaleString() : ''}):
            </p>
            <div className="flex flex-col gap-1">
              {state!.lastTrades.map((t, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[10px]"
                  style={{ background: t.action === 'sell' ? 'rgba(255,59,48,0.05)' : 'rgba(0,200,83,0.05)' }}
                >
                  <span
                    className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                    style={{
                      background: t.action === 'sell' ? 'rgba(255,59,48,0.12)' : 'rgba(0,200,83,0.12)',
                      color:       t.action === 'sell' ? CV.red : CV.green,
                    }}
                  >
                    {t.action.toUpperCase()}
                  </span>
                  <span className="font-bold" style={{ color: CV.gold }}>{t.coinSymbol}</span>
                  <span className="font-mono">${t.amountUsd.toFixed(2)}</span>
                  {t.pnl !== null && (
                    <span className="ml-auto" style={{ color: t.pnl >= 0 ? CV.green : CV.red }}>
                      {t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No trades yet */}
        {(state?.lastTrades?.length ?? 0) === 0 && (
          <p className="text-[10px] text-center py-2" style={{ color: CV.gray }}>
            Waiting for first rebalance interval ({intervalH}h)…
          </p>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SPEC 4.3: RISK DASHBOARD WIDGET
// ─────────────────────────────────────────────────────────────────────────────

function RiskDashboard({ bot }: { bot: UserBot }) {
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 3_000);
    return () => clearInterval(id);
  }, []);

  const rm     = getRiskManager(bot.id);
  const record = rm.getRiskRecord(bot.id);
  const cfg    = bot.config as any;

  const dailyLossUsd   = record.dailyLossUsd;
  const maxDailyUsd    = bot.maxDailyLossUsd;
  const maxTotalUsd    = bot.maxTotalLossUsd;
  const consecLosses   = record.consecutiveLosses;
  const maxConsec      = cfg.maxConsecutiveLosses ?? 5;
  const allowedHours   = cfg.allowedHours ?? '00:00-23:59';
  const is24h          = allowedHours === '00:00-23:59';

  const dailyPct  = maxDailyUsd > 0 ? Math.min(100, (dailyLossUsd / maxDailyUsd) * 100) : 0;
  const totalLoss = Math.max(0, -bot.totalProfit);
  const totalPct  = maxTotalUsd > 0 ? Math.min(100, (totalLoss / maxTotalUsd) * 100) : 0;
  const consecPct = bot.templateType === 'martingale' ? Math.min(100, (consecLosses / maxConsec) * 100) : 0;

  const dailyColor  = dailyPct < 50 ? CV.green : dailyPct < 80 ? CV.orange : CV.red;
  const totalColor  = totalPct < 50 ? CV.green : totalPct < 80 ? CV.orange : CV.red;
  const consecColor = consecPct < 50 ? CV.green : consecPct < 80 ? CV.orange : CV.red;

  // Trading hours check
  const nowH = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  let inTradingHours = true;
  if (!is24h) {
    const [startStr, endStr] = allowedHours.split('-');
    const toMins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const nowMins   = new Date().getHours() * 60 + new Date().getMinutes();
    const startMins = toMins(startStr ?? '00:00');
    const endMins   = toMins(endStr   ?? '23:59');
    inTradingHours  = startMins <= endMins
      ? (nowMins >= startMins && nowMins <= endMins)
      : (nowMins >= startMins || nowMins <= endMins);
  }

  const rows: Array<{ label: string; current: string; limit: string; pct: number; color: string; show: boolean }> = [
    {
      label:   'Daily Loss',
      current: `${dailyLossUsd.toFixed(2)}`,
      limit:   maxDailyUsd > 0 ? `${maxDailyUsd.toLocaleString()}` : 'Disabled',
      pct:     dailyPct,
      color:   dailyColor,
      show:    true,
    },
    {
      label:   'Total Loss',
      current: `${totalLoss.toFixed(2)}`,
      limit:   maxTotalUsd > 0 ? `${maxTotalUsd.toLocaleString()}` : 'Disabled',
      pct:     totalPct,
      color:   totalColor,
      show:    true,
    },
    {
      label:   'Consecutive Losses',
      current: `${consecLosses}`,
      limit:   `${maxConsec}`,
      pct:     consecPct,
      color:   consecColor,
      show:    bot.templateType === 'martingale',
    },
  ];

  return (
    <div className="px-5 py-4">
      <h3 className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: CV.gray }}>
        🛡️ Risk Management
      </h3>
      <div
        className="p-3.5 rounded-xl border"
        style={{ background: 'rgba(255,59,48,0.04)', borderColor: 'rgba(255,59,48,0.15)' }}
      >
        {/* Risk meters */}
        <div className="flex flex-col gap-3 mb-3">
          {rows.filter(r => r.show).map(r => (
            <div key={r.label}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold" style={{ color: CV.gray }}>{r.label}</span>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="font-bold tabular-nums" style={{ color: r.color }}>{r.current}</span>
                  <span style={{ color: 'rgba(156,163,175,0.4)' }}>/</span>
                  <span style={{ color: CV.gray }}>{r.limit}</span>
                </div>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${r.pct}%`, background: r.color }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Trading hours */}
        <div
          className="flex items-center justify-between px-3 py-2 rounded-lg text-[10px]"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <span style={{ color: CV.gray }}>Trading Hours</span>
          <div className="flex items-center gap-2">
            <span className="font-mono" style={{ color: CV.gray }}>{allowedHours}</span>
            <span
              className="px-1.5 py-0.5 rounded font-bold text-[9px]"
              style={{
                background: inTradingHours ? 'rgba(0,200,83,0.12)' : 'rgba(255,149,0,0.12)',
                color:      inTradingHours ? CV.green : CV.orange,
              }}
            >
              {inTradingHours ? '● ACTIVE' : '● OFF-HOURS'}
            </span>
          </div>
        </div>

        {/* 4.3 spec: consecutive losses for martingale */}
        {bot.templateType === 'martingale' && (
          <div className="mt-3 flex gap-1">
            {Array.from({ length: maxConsec }, (_, i) => (
              <div
                key={i}
                className="flex-1 h-2 rounded-full transition-all duration-300"
                style={{
                  background: i < consecLosses
                    ? (i < 2 ? CV.orange : CV.red)
                    : 'rgba(255,255,255,0.08)',
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SPEC 5.2: ANALYTICS TAB
// Daily PnL table, best/worst day, hourly heatmap
// ─────────────────────────────────────────────────────────────────────────────

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => `${i}h`);

function AnalyticsTab({ bot, executions }: { bot: UserBot; executions: BotExecution[] }) {
  // Build daily stats: last 7 days
  const dailyStats = useMemo(() => {
    const map: Record<string, { pnl: number; trades: number; date: Date }> = {};
    for (const exec of executions) {
      const d   = new Date(exec.executedAt);
      const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
      if (!map[key]) map[key] = { pnl: 0, trades: 0, date: d };
      map[key].pnl    += exec.pnl ?? 0;
      map[key].trades += 1;
    }
    // Last 7 days including today
    const days: Array<{ label: string; pnl: number; trades: number; dateStr: string }> = [];
    for (let i = 6; i >= 0; i--) {
      const d   = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({
        label:   DAY_LABELS[d.getDay()],
        pnl:     Math.round((map[key]?.pnl ?? 0) * 100) / 100,
        trades:  map[key]?.trades ?? 0,
        dateStr: key,
      });
    }
    return days;
  }, [executions]);

  const bestDay  = dailyStats.reduce((a, b) => b.pnl > a.pnl ? b : a, dailyStats[0]);
  const worstDay = dailyStats.reduce((a, b) => b.pnl < a.pnl ? b : a, dailyStats[0]);
  const maxAbsPnl = Math.max(...dailyStats.map(d => Math.abs(d.pnl)), 1);

  // Hourly heatmap: day-of-week × hour → avg PnL
  const hourlyHeat = useMemo(() => {
    const grid: Record<number, Record<number, { pnl: number; count: number }>> = {};
    for (let dow = 0; dow < 7; dow++) {
      grid[dow] = {};
      for (let h = 0; h < 24; h++) grid[dow][h] = { pnl: 0, count: 0 };
    }
    for (const exec of executions) {
      const d   = new Date(exec.executedAt);
      const dow = d.getDay();
      const h   = d.getHours();
      grid[dow][h].pnl   += exec.pnl ?? 0;
      grid[dow][h].count += 1;
    }
    return grid;
  }, [executions]);

  // Color scale for heatmap cell
  function heatColor(pnl: number, count: number): string {
    if (count === 0) return 'rgba(255,255,255,0.04)';
    if (pnl > 0)  return `rgba(0,200,83,${Math.min(0.9, 0.15 + (pnl / 50) * 0.75)})`;
    if (pnl < 0)  return `rgba(255,59,48,${Math.min(0.9, 0.15 + (Math.abs(pnl) / 50) * 0.75)})`;
    return 'rgba(255,149,0,0.20)'; // neutral
  }

  function heatEmoji(pnl: number, count: number): string {
    if (count === 0) return '·';
    if (pnl > 5)   return '🟢';
    if (pnl > 0)   return '🟡';
    if (pnl < -5)  return '🔴';
    return '🟡';
  }

  const hasTrades = executions.length > 0;

  return (
    <div className="px-5 py-4 space-y-6">
      <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: CV.gray }}>
        Analytics
      </h3>

      {/* ── Spec 5.2: Daily Performance table ── */}
      <section>
        <h4 className="text-[10px] font-bold uppercase tracking-wide mb-2" style={{ color: CV.gray }}>
          Daily Performance (Last 7 Days)
        </h4>
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
          {/* Header */}
          <div
            className="grid text-[9px] font-bold uppercase tracking-wide px-2 py-1.5"
            style={{
              gridTemplateColumns: '44px repeat(7, 1fr)',
              background: 'rgba(255,255,255,0.04)',
              color: CV.gray,
            }}
          >
            <span></span>
            {dailyStats.map(d => (
              <span key={d.dateStr} className="text-center">{d.label}</span>
            ))}
          </div>
          {/* PnL row */}
          <div
            className="grid items-center px-2 py-2 text-[10px] font-semibold border-b"
            style={{
              gridTemplateColumns: '44px repeat(7, 1fr)',
              borderColor: 'rgba(255,255,255,0.04)',
            }}
          >
            <span style={{ color: CV.gray }}>PnL</span>
            {dailyStats.map(d => (
              <div key={d.dateStr} className="flex flex-col items-center gap-0.5">
                {/* Micro bar */}
                <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.abs(d.pnl) / maxAbsPnl * 100}%`,
                      background: d.pnl >= 0 ? CV.green : CV.red,
                    }}
                  />
                </div>
                <span
                  className="tabular-nums"
                  style={{ color: d.pnl > 0 ? CV.green : d.pnl < 0 ? CV.red : CV.gray, fontSize: 9 }}
                >
                  {d.pnl === 0 ? '—' : `${d.pnl >= 0 ? '+' : ''}${Math.abs(d.pnl).toFixed(0)}`}
                </span>
              </div>
            ))}
          </div>
          {/* Trades row */}
          <div
            className="grid items-center px-2 py-2 text-[10px]"
            style={{ gridTemplateColumns: '44px repeat(7, 1fr)' }}
          >
            <span style={{ color: CV.gray }}>Trades</span>
            {dailyStats.map(d => (
              <span
                key={d.dateStr}
                className="text-center font-bold tabular-nums"
                style={{ color: d.trades > 0 ? CV.gold : CV.gray }}
              >
                {d.trades || '—'}
              </span>
            ))}
          </div>
        </div>

        {/* Best / Worst day */}
        {hasTrades && (
          <div className="flex gap-3 mt-3">
            <div
              className="flex-1 px-3 py-2 rounded-xl text-[10px]"
              style={{ background: 'rgba(0,200,83,0.08)', border: '1px solid rgba(0,200,83,0.18)' }}
            >
              <p style={{ color: CV.gray }}>Best Day</p>
              <p className="font-bold" style={{ color: CV.green }}>
                {bestDay?.label} ({bestDay?.pnl >= 0 ? '+' : ''}${bestDay?.pnl.toFixed(2)})
              </p>
            </div>
            <div
              className="flex-1 px-3 py-2 rounded-xl text-[10px]"
              style={{ background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.18)' }}
            >
              <p style={{ color: CV.gray }}>Worst Day</p>
              <p className="font-bold" style={{ color: CV.red }}>
                {worstDay?.label} ({worstDay?.pnl >= 0 ? '+' : ''}${worstDay?.pnl.toFixed(2)})
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ── Spec 5.2: Hourly Performance Heatmap ── */}
      <section>
        <h4 className="text-[10px] font-bold uppercase tracking-wide mb-2" style={{ color: CV.gray }}>
          Hourly Performance Heatmap
        </h4>

        {!hasTrades ? (
          <div
            className="h-24 flex items-center justify-center rounded-xl text-xs"
            style={{ background: 'rgba(255,255,255,0.02)', color: CV.gray, border: '1px solid rgba(255,255,255,0.05)' }}
          >
            No trade data yet — start the bot to build the heatmap
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div style={{ minWidth: 520 }}>
              {/* Hour labels */}
              <div className="flex mb-1" style={{ paddingLeft: 28 }}>
                {HOUR_LABELS.filter((_, i) => i % 3 === 0).map((h, i) => (
                  <div
                    key={h}
                    className="text-[8px] text-center"
                    style={{ width: `${(100 / 8).toFixed(1)}%`, color: CV.gray }}
                  >
                    {h}
                  </div>
                ))}
              </div>
              {/* Grid rows — Mon–Sun */}
              {[1, 2, 3, 4, 5, 6, 0].map(dow => (
                <div key={dow} className="flex items-center mb-0.5">
                  <span className="text-[8px] shrink-0 w-7" style={{ color: CV.gray }}>
                    {DAY_LABELS[dow].slice(0, 3)}
                  </span>
                  <div className="flex gap-px flex-1">
                    {Array.from({ length: 24 }, (_, h) => {
                      const cell = hourlyHeat[dow]?.[h] ?? { pnl: 0, count: 0 };
                      return (
                        <div
                          key={h}
                          title={`${DAY_LABELS[dow]} ${h}:00 — ${cell.count > 0 ? `${cell.pnl >= 0 ? '+' : ''}${cell.pnl.toFixed(2)} (${cell.count} trades)` : 'No trades'}`}
                          className="flex-1 h-4 rounded-sm flex items-center justify-center text-[7px] cursor-help transition-opacity hover:opacity-80"
                          style={{ background: heatColor(cell.pnl, cell.count) }}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
              {/* Legend */}
              <div className="flex items-center gap-3 mt-2 text-[8px]" style={{ color: CV.gray, paddingLeft: 28 }}>
                <span>Legend:</span>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-sm" style={{ background: 'rgba(0,200,83,0.6)' }} />
                  <span>Profitable hour</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-sm" style={{ background: 'rgba(255,59,48,0.6)' }} />
                  <span>Loss hour</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-sm" style={{ background: 'rgba(255,255,255,0.04)' }} />
                  <span>No trades</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SPEC 3.4: PERFORMANCE CHART WITH TIMEFRAME SELECTOR
// ─────────────────────────────────────────────────────────────────────────────

type Timeframe = '1D' | '1W' | '1M' | '3M' | 'All';

function PerformanceChart({ bot, curveData, initialValue, profitPos }: {
  bot:          UserBot;
  curveData:    Array<{ i: number; value: number }>;
  initialValue: number;
  profitPos:    boolean;
}) {
  const [timeframe, setTimeframe] = useState<Timeframe>('All');

  // Slice equity curve by timeframe
  const filteredData = useMemo(() => {
    if (timeframe === 'All' || curveData.length === 0) return curveData;
    const now = Date.now();
    const cutoff: Record<Timeframe, number> = {
      '1D': now - 86_400_000,
      '1W': now - 7 * 86_400_000,
      '1M': now - 30 * 86_400_000,
      '3M': now - 90 * 86_400_000,
      'All': 0,
    };
    // Equity curve doesn't store timestamps directly — proxy by index proportion
    const totalPoints = bot.equityCurve.length;
    const msPerPoint  = bot.startedAt
      ? (now - new Date(bot.startedAt).getTime()) / Math.max(1, totalPoints)
      : 60_000;
    const cutoffIdx   = Math.max(0, totalPoints - Math.ceil((now - cutoff[timeframe]) / msPerPoint));
    return curveData.slice(cutoffIdx);
  }, [curveData, timeframe, bot]);

  const TIMEFRAMES: Timeframe[] = ['1D', '1W', '1M', '3M', 'All'];

  // Compute P&L for this timeframe window
  const windowPnl = filteredData.length >= 2
    ? filteredData[filteredData.length - 1].value - filteredData[0].value
    : 0;
  const windowPnlPos = windowPnl >= 0;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* Chart header */}
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
        <div>
          <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <BarChart2 className="h-3.5 w-3.5" style={{ color: CV.gold }} />
            Performance Over Time
          </h3>
          {filteredData.length >= 2 && (
            <p className="text-[10px] mt-0.5" style={{ color: windowPnlPos ? CV.green : CV.red }}>
              {windowPnlPos ? '+' : ''}${windowPnl.toFixed(2)} in this window
            </p>
          )}
        </div>
        {/* Timeframe pills */}
        <div className="flex items-center gap-1">
          {TIMEFRAMES.map(tf => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className="px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all"
              style={timeframe === tf ? {
                background: 'rgba(255,215,0,0.15)',
                color:      CV.gold,
                border:     '1px solid rgba(255,215,0,0.30)',
              } : {
                color:      CV.gray,
                background: 'transparent',
                border:     '1px solid transparent',
              }}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Chart area */}
      {filteredData.length >= 2 ? (
        <div className="h-40 px-1 pt-2 pb-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={filteredData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="perf-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={profitPos ? CV.green : CV.red} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={profitPos ? CV.green : CV.red} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="i" hide />
              <YAxis
                tick={{ fontSize: 9, fill: CV.gray }}
                width={48}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => `${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(0)}`}
              />
              <Tooltip
                contentStyle={{ background: CV.tooltip, border: '1px solid rgba(255,215,0,0.20)', borderRadius: 8, fontSize: 11 }}
                formatter={(v: number) => [`${v.toFixed(2)}`, 'Portfolio']}
                labelFormatter={() => ''}
              />
              <ReferenceLine y={initialValue} stroke="rgba(255,215,0,0.15)" strokeDasharray="5 4" />
              <Area
                type="monotone"
                dataKey="value"
                stroke={profitPos ? CV.green : CV.red}
                strokeWidth={2}
                fill="url(#perf-grad)"
                dot={false}
                activeDot={{ r: 3.5, strokeWidth: 0, fill: profitPos ? CV.green : CV.red }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div
          className="h-40 flex flex-col items-center justify-center gap-2 text-xs"
          style={{ color: CV.gray }}
        >
          <BarChart2 className="h-6 w-6 opacity-30" />
          No equity data yet — start the bot to begin tracking
        </div>
      )}

      {/* Timeframe label */}
      <div className="flex justify-between px-4 py-2 text-[9px]" style={{ color: CV.gray }}>
        <span>
          {timeframe === '1D' ? 'Last 24 hours' : timeframe === '1W' ? 'Last 7 days' : timeframe === '1M' ? 'Last 30 days' : timeframe === '3M' ? 'Last 90 days' : 'All time'}
        </span>
        <span>{filteredData.length} data points</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  bot:      UserBot | null;  // initial snapshot — live updates come from store
  onClose:  () => void;
  /** When true, renders as inline full-height page (no overlay/backdrop). */
  pageMode?: boolean;
}

export function BotDetailModal({ bot: initialBot, onClose, pageMode = false }: Props) {
  const startBot        = useBotStore(s => s.startBot);
  const pauseBot        = useBotStore(s => s.pauseBot);
  const stopBot         = useBotStore(s => s.stopBot);
  const deleteBot       = useBotStore(s => s.deleteBot);
  const getBotExecutions = useBotStore(s => s.getBotExecutions);
  const getBot          = useBotStore(s => s.getBot);
  // Subscribe to bots map so we re-render on status changes
  const liveBot         = useBotStore(s => initialBot ? s.bots[initialBot.id] : null);
  const { user }        = useAuthStore();
  const [activeTab,     setActiveTab]    = useState<'overview' | 'history' | 'analytics' | 'config' | 'logs'>('overview');
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Alias so existing refs to showConfig/setShowConfig still compile
  const showConfig = activeTab as any;
  const setShowConfig = setActiveTab as any;

  // Use live bot from store, fall back to prop
  const bot = liveBot ?? initialBot;

  const executions = useMemo(() =>
    bot ? getBotExecutions(bot.id) : [],
  [bot, getBotExecutions, liveBot]);

  const curveData = (bot?.equityCurve ?? []).map((p, i) => ({ i, value: p.value }));

  const handleStart  = useCallback(() => {
    if (!bot) return;
    const r = startBot(bot.id);
    if (!r.ok) toast.error(r.error ?? 'Error');
    else toast.success(`${bot.name} started`);
  }, [bot, startBot]);

  const handlePause  = useCallback(() => {
    if (!bot) return;
    const r = pauseBot(bot.id);
    if (!r.ok) toast.error(r.error ?? 'Error');
    else toast.success(`${bot.name} paused`);
  }, [bot, pauseBot]);

  const handleStop   = useCallback(() => {
    if (!bot) return;
    const r = stopBot(bot.id, 'user_stopped');
    if (!r.ok) toast.error(r.error ?? 'Error');
    else toast.success(`${bot.name} stopped`);
  }, [bot, stopBot]);

  const handleDelete = useCallback(() => {
    if (!bot || !user) return;
    const r = deleteBot(bot.id, user.id);
    if (!r.ok) { toast.error(r.error ?? 'Error'); return; }
    toast.success(`${bot.name} deleted`);
    onClose();
  }, [bot, user, deleteBot, onClose]);

  if (!bot) return null;

  const meta         = BOT_TYPE_META[bot.templateType];
  const isActive     = bot.status === 'active';
  const isPaused     = bot.status === 'paused';
  const isStopped    = bot.status === 'stopped' || bot.status === 'error';
  const profitPos    = bot.totalProfit >= 0;
  const initialValue = bot.equityCurve[0]?.value ?? 0;

  // Build config summary rows
  const configRows: Array<{ label: string; value: string }> = [];
  const cfg = bot.config as any;
  if (cfg.coinId)               configRows.push({ label: 'Coin',            value: cfg.coinSymbol ?? cfg.coinId });
  // Grid fields
  if (cfg.gridCount)            configRows.push({ label: 'Grid Levels',     value: cfg.gridCount.toString() });
  if (cfg.lowerPrice)           configRows.push({ label: 'Lower Price',     value: `${cfg.lowerPrice.toLocaleString()}` });
  if (cfg.upperPrice)           configRows.push({ label: 'Upper Price',     value: `${cfg.upperPrice.toLocaleString()}` });
  if (cfg.totalInvestment)      configRows.push({ label: 'Investment',      value: fmtUsd(cfg.totalInvestment, false) });
  // Martingale spec fields (shown only when spec fields exist, not legacy)
  if (cfg.baseAmount != null)   configRows.push({ label: 'Base Amount',     value: fmtUsd(cfg.baseAmount, false) });
  if (cfg.multiplier != null)   configRows.push({ label: 'Multiplier',      value: `${cfg.multiplier}×` });
  if (cfg.maxConsecutiveLosses) configRows.push({ label: 'Max Losses',      value: `${cfg.maxConsecutiveLosses} consecutive` });
  if (cfg.direction != null)    configRows.push({ label: 'Direction',       value: cfg.direction === 'both' ? '🔄 Alternating' : cfg.direction === 'long' ? '📈 Long' : '📉 Short' });
  // DCA spec fields
  if (cfg.initialInvestment != null) configRows.push({ label: 'Initial Investment', value: fmtUsd(cfg.initialInvestment, false) });
  if (cfg.numberOfOrders != null)    configRows.push({ label: 'Number of Orders',   value: cfg.numberOfOrders.toString() });
  if (cfg.priceDropPct != null)      configRows.push({ label: 'Price Drop Trigger', value: `${cfg.priceDropPct}% per order` });
  if (cfg.partialExit != null)       configRows.push({ label: 'Exit Strategy',       value: cfg.partialExit ? '🔀 50% partial' : '✅ Full exit' });
  // Shared
  if (cfg.takeProfitPct)        configRows.push({ label: 'Take Profit',     value: `${cfg.takeProfitPct}%` });
  // Arbitrage spec fields
  if (cfg.monitoredPairs?.length > 0) configRows.push({ label: 'Pairs',         value: cfg.monitoredPairs.map((p: any) => p.symbol).join(', ') });
  if (cfg.minProfitPct != null)       configRows.push({ label: 'Min Profit',     value: `${cfg.minProfitPct}%` });
  if (cfg.maxPositionSize != null)    configRows.push({ label: 'Max Position',   value: fmtUsd(cfg.maxPositionSize, false) });
  if (cfg.scanIntervalSec != null)    configRows.push({ label: 'Scan Interval',  value: `${cfg.scanIntervalSec}s` });
  // Rebalancing spec fields
  if (cfg.totalPortfolioUsd)    configRows.push({ label: 'Portfolio',       value: fmtUsd(cfg.totalPortfolioUsd, false) });
  {
    const rbAssets = cfg.assets ?? cfg.allocations;
    if (rbAssets?.length > 0) {
      configRows.push({ label: 'Assets',      value: rbAssets.map((a: any) => a.coinSymbol).join(', ') });
      configRows.push({ label: 'Allocations', value: rbAssets.map((a: any) => `${a.coinSymbol} ${a.targetPct}%`).join(' / ') });
    }
  }
  if (cfg.rebalanceThresholdPct != null) configRows.push({ label: 'Drift Threshold', value: `${cfg.rebalanceThresholdPct}%` });
  else if (cfg.driftThresholdPct != null) configRows.push({ label: 'Drift Threshold', value: `${cfg.driftThresholdPct}%` });
  if (cfg.rebalanceIntervalHours != null) configRows.push({ label: 'Interval',        value: `${cfg.rebalanceIntervalHours}h` });
  if (cfg.minTradeSizeUsd != null)        configRows.push({ label: 'Min Trade',       value: `${cfg.minTradeSizeUsd}` });

  // ── Determine container class based on pageMode ───────────────────────
  const outerClass = pageMode
    ? 'absolute inset-0 flex flex-col overflow-hidden'
    : 'fixed inset-0 z-50 flex sm:items-center sm:justify-end items-end justify-center';

  const panelClass = pageMode
    ? 'relative flex flex-col overflow-hidden w-full h-full'
    : `relative z-10 w-full max-w-md flex flex-col overflow-hidden
       max-h-[92dvh] sm:max-h-none sm:h-full rounded-t-3xl sm:rounded-none`;

  const panelStyle = pageMode
    ? { background: 'var(--bg-card)' }
    : { background: 'var(--bg-card)', borderTop: '1px solid rgba(255,215,0,0.12)' };

  return (
    <div className={outerClass}>
      {/* Backdrop (only in modal mode) */}
      {!pageMode && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <motion.div
        initial={pageMode ? { opacity: 1 } : { y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={pageMode ? { opacity: 0 } : { y: '100%', opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        className={panelClass}
        style={panelStyle}
      >
        {/* Mobile drag handle (modal mode only) */}
        {!pageMode && (
          <div className="sm:hidden flex justify-center pt-2 pb-0.5 shrink-0">
            <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.12)' }} />
          </div>
        )}
        {/* ── Header ── */}
        <div
          className="flex items-start justify-between px-5 py-4 border-b shrink-0"
          style={{ borderColor: 'rgba(255,215,0,0.10)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
              style={{ background: meta.bgAlpha, border: `1px solid ${meta.borderAlpha}` }}
            >
              {meta.emoji}
            </div>
            <div>
              <p className="font-bold text-foreground">{bot.name}</p>
              <p className="text-xs mt-0.5" style={{ color: meta.color }}>{meta.label}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <BotStatusBadge status={bot.status} size="md" />
            {/* Open full page link (only in modal mode) */}
            {!pageMode && (
              <a
                href={`/bots/${bot.id}`}
                onClick={e => { e.preventDefault(); onClose(); window.history.pushState({}, '', `/bots/${bot.id}`); window.dispatchEvent(new PopStateEvent('popstate')); }}
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: CV.gray }}
                title="Open full page"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg"
              style={{ color: CV.gray }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Action bar ── */}
        <div
          className="flex items-center gap-2 px-5 py-3 border-b shrink-0"
          style={{ borderColor: 'rgba(255,215,0,0.06)' }}
        >
          {isStopped && (
            <button
              onClick={handleStart}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-[0.97]"
              style={{ background: 'rgba(0,200,83,0.12)', color: CV.green, border: '1px solid rgba(0,200,83,0.25)' }}
            >
              <Play className="h-3.5 w-3.5 fill-current" /> Start
            </button>
          )}
          {isActive && (
            <>
              <button
                onClick={handlePause}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-[0.97]"
                style={{ background: 'rgba(255,149,0,0.12)', color: CV.orange, border: '1px solid rgba(255,149,0,0.25)' }}
              >
                <Pause className="h-3.5 w-3.5 fill-current" /> Pause
              </button>
              <button
                onClick={handleStop}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-[0.97]"
                style={{ background: 'rgba(255,59,48,0.10)', color: CV.red, border: '1px solid rgba(255,59,48,0.22)' }}
              >
                <Square className="h-3.5 w-3.5 fill-current" /> Stop
              </button>
            </>
          )}
          {isPaused && (
            <>
              <button
                onClick={handleStart}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-[0.97]"
                style={{ background: 'rgba(0,200,83,0.12)', color: CV.green, border: '1px solid rgba(0,200,83,0.25)' }}
              >
                <Play className="h-3.5 w-3.5 fill-current" /> Resume
              </button>
              <button
                onClick={handleStop}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-[0.97]"
                style={{ background: 'rgba(255,59,48,0.10)', color: CV.red, border: '1px solid rgba(255,59,48,0.22)' }}
              >
                <Square className="h-3.5 w-3.5 fill-current" /> Stop
              </button>
            </>
          )}
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={isActive}
            className="flex items-center gap-1 ml-auto px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-[0.97]"
            style={isActive
              ? { color: 'rgba(156,163,175,0.30)', cursor: 'not-allowed' }
              : { color: CV.red, background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.18)' }}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </div>

        {/* ── TAB BAR (spec 3.3) ── */}
        {(() => {
          const TABS = [
            { id: 'overview',  label: 'Overview',  icon: BarChart2  },
            { id: 'history',   label: 'History',   icon: History    },
            { id: 'config',    label: 'Config',    icon: Settings   },
            { id: 'logs',      label: 'Logs',      icon: FileText   },
          ] as const;
          type TabId = typeof TABS[number]['id'];
          return null; // tabs declared in outer scope via useState
        })()}

        {/* ── Scrollable body with tabs ── */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Tab strip */}
          {(() => {
            const TABS = [
              { id: 'overview'   as const, label: 'Overview',  icon: BarChart2 },
              { id: 'history'    as const, label: 'History',   icon: History   },
              { id: 'analytics'  as const, label: 'Analytics', icon: Activity  },
              { id: 'config'     as const, label: 'Config',    icon: Settings  },
              { id: 'logs'       as const, label: 'Logs',      icon: FileText  },
            ];
            return (
              <div
                className="flex border-b shrink-0"
                style={{ borderColor: 'rgba(255,215,0,0.08)' }}
              >
                {TABS.map(tab => {
                  const isActive = showConfig === (tab.id as any);
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setShowConfig(tab.id as any)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-semibold transition-all border-b-2"
                      style={isActive ? {
                        color:           CV.gold,
                        borderColor:     CV.gold,
                        background:      'rgba(255,215,0,0.05)',
                      } : {
                        color:        CV.gray,
                        borderColor:  'transparent',
                        background:   'transparent',
                      }}
                    >
                      <tab.icon className="h-3 w-3" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            );
          })()}

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">

            {/* ══ OVERVIEW TAB ══ */}
            {(showConfig === 'overview' as any || !showConfig) && (
              <div>
                {/* ── Spec 8: Error banner ── */}
                {(bot.status === 'error' || bot.lastError) && (
                  <div className="px-5 pt-4">
                    <BotErrorBanner
                      bot={bot}
                      onStart={handleStart}
                      onFixConfig={() => setActiveTab('config')}
                      compact={false}
                    />
                  </div>
                )}

                {/* Bot-type specific widget */}
                {bot.templateType === 'martingale' && <MartingaleCycleStatus botId={bot.id} config={bot.config as any} />}
                {bot.templateType === 'dca'        && <DcaPositionStatus     botId={bot.id} config={bot.config as any} />}
                {bot.templateType === 'arbitrage'  && <ArbitrageLogWidget    botId={bot.id} config={bot.config as any} />}
                {bot.templateType === 'rebalancing'&& <RebalancingPortfolioWidget botId={bot.id} config={bot.config as any} />}

                {/* Spec 3.3: Performance Overview — 5 metric cards */}
                <div className="px-5 py-4">
                  <h3 className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: CV.gray }}>
                    Performance Overview
                  </h3>
                  <div className="grid grid-cols-5 gap-1.5 mb-4">
                    {[
                      { label: 'Profit',    value: fmtUsd(bot.totalProfit, false), sub: fmtPct(bot.totalProfitPct), color: profitPos ? CV.green : CV.red },
                      { label: 'Win Rate',  value: `${bot.winRate.toFixed(1)}%`,  sub: `${bot.winningTrades}W / ${bot.losingTrades}L`, color: bot.winRate >= 50 ? CV.green : CV.red },
                      { label: 'Trades',   value: bot.totalTrades.toString(),      sub: `${bot.totalBuyTrades}B / ${bot.totalSellTrades}S`, color: CV.gold },
                      { label: 'Avg Win',  value: bot.winningTrades > 0 ? fmtUsd(bot.bestTrade / Math.max(1, bot.winningTrades), false) : '—', sub: 'per win', color: CV.green },
                      { label: 'Max DD',   value: `${bot.maxDrawdown.toFixed(1)}%`, sub: 'drawdown', color: bot.maxDrawdown < 10 ? CV.green : bot.maxDrawdown < 20 ? CV.orange : CV.red },
                    ].map(m => (
                      <div
                        key={m.label}
                        className="flex flex-col items-center gap-0.5 py-2.5 rounded-xl"
                        style={{ background: `${m.color}10`, border: `1px solid ${m.color}20` }}
                      >
                        <span className="text-[8px] uppercase tracking-wide" style={{ color: CV.gray }}>{m.label}</span>
                        <span className="text-xs font-bold tabular-nums leading-snug text-center" style={{ color: m.color }}>{m.value}</span>
                        {m.sub && <span className="text-[8px]" style={{ color: CV.gray }}>{m.sub}</span>}
                      </div>
                    ))}
                  </div>

                  {/* Spec 3.4: Performance Chart with timeframe selector */}
                  <PerformanceChart bot={bot} curveData={curveData} initialValue={initialValue} profitPos={profitPos} />
                </div>

                {/* Spec 4.3: Risk Dashboard */}
                <RiskDashboard bot={bot} />

                {/* Quick metrics grid */}
                <div className="px-5 pb-4">
                  <div className="grid grid-cols-2 gap-2">
                    <MetricCard label="Fees Paid"  value={fmtUsd(bot.totalFeesPaid, false)} sub="0.1% per trade"              icon={DollarSign}                            color={CV.gray}   />
                    <MetricCard label="Best Trade" value={fmtUsd(bot.bestTrade, false)}      sub="Single trade high"           icon={TrendingUp}                            color={CV.green}  />
                    <MetricCard label="Worst Trade"value={fmtUsd(Math.abs(bot.worstTrade), false)} sub="Single trade low"     icon={TrendingDown}                          color={CV.red}    />
                    <MetricCard label="Last Run"   value={fmtRelative(bot.lastRunAt)}        sub={bot.nextRunAt ? `Next: ${fmtRelative(bot.nextRunAt)}` : undefined} icon={Clock} color={CV.orange} />
                  </div>
                </div>
              </div>
            )}

            {/* ══ HISTORY TAB ══ */}
            {showConfig === 'history' as any && (
              <div className="px-5 py-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground">
                    Trade History
                    <span className="ml-2 text-xs font-normal" style={{ color: CV.gray }}>
                      (last {Math.min(executions.length, 20)} of {executions.length})
                    </span>
                  </h3>
                  <button
                    className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg"
                    style={{ color: CV.gold, background: 'rgba(255,215,0,0.08)', border: '1px solid rgba(255,215,0,0.18)' }}
                    onClick={() => {
                      const csv = ['Time,Type,Price,Amount,Total,PnL,PnL%',
                        ...executions.map(e =>
                          `${new Date(e.executedAt).toLocaleString()},${e.action.toUpperCase()},${e.price},${e.amount},${e.total},${e.pnl ?? ''},${e.pnlPct ?? ''}`
                        )].join('\n');
                      const a = document.createElement('a');
                      a.href = 'data:text/csv,' + encodeURIComponent(csv);
                      a.download = `${bot.name.replace(/\s+/g, '_')}_trades.csv`;
                      a.click();
                    }}
                  >
                    <Download className="h-3 w-3" /> Export
                  </button>
                </div>

                {executions.length === 0 ? (
                  <div
                    className="flex items-center justify-center h-24 rounded-xl text-xs"
                    style={{ background: 'rgba(255,255,255,0.02)', color: CV.gray, border: '1px solid rgba(255,255,255,0.05)' }}
                  >
                    No trades yet — start the bot to begin trading
                  </div>
                ) : (
                  <>
                    {/* Spec 3.3 trade history table */}
                    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                      {/* Table header */}
                      <div
                        className="grid text-[9px] font-bold uppercase tracking-wide px-3 py-2"
                        style={{
                          gridTemplateColumns: '52px 52px 80px 68px 76px 64px 52px',
                          background: 'rgba(255,255,255,0.04)',
                          color: CV.gray,
                        }}
                      >
                        <span>Time</span>
                        <span>Type</span>
                        <span>Price</span>
                        <span>Amount</span>
                        <span>Total</span>
                        <span>PnL</span>
                        <span>PnL%</span>
                      </div>
                      {/* Rows */}
                      <div className="flex flex-col divide-y" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                        {executions.slice(0, 20).map(exec => {
                          const isBuy   = exec.action === 'buy';
                          const pnlPos  = (exec.pnl ?? 0) >= 0;
                          const pnlColor = exec.pnl === null ? CV.gray : pnlPos ? CV.green : CV.red;
                          return (
                            <div
                              key={exec.id}
                              className="grid items-center px-3 py-2 text-[10px] font-mono hover:bg-white/[0.02] transition-colors"
                              style={{ gridTemplateColumns: '52px 52px 80px 68px 76px 64px 52px' }}
                            >
                              <span style={{ color: CV.gray }}>
                                {new Date(exec.executedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <span
                                className="font-bold uppercase"
                                style={{ color: isBuy ? CV.green : CV.red }}
                              >
                                {exec.action}
                              </span>
                              <span className="text-foreground">${exec.price.toLocaleString()}</span>
                              <span className="text-foreground">{exec.amount.toFixed(4)}</span>
                              <span className="text-foreground">${exec.total.toFixed(2)}</span>
                              <span style={{ color: pnlColor }}>
                                {exec.pnl !== null ? `${exec.pnl >= 0 ? '+' : ''}${Math.abs(exec.pnl).toFixed(2)}` : '—'}
                              </span>
                              <span style={{ color: pnlColor }}>
                                {exec.pnlPct !== null ? `${exec.pnlPct >= 0 ? '+' : ''}${exec.pnlPct?.toFixed(1)}%` : '—'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {executions.length > 20 && (
                      <p className="text-center text-xs py-3" style={{ color: CV.gray }}>
                        Showing last 20 of {executions.length} trades. Export CSV for full history.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ══ ANALYTICS TAB  (spec 5.2) ══ */}
            {showConfig === 'analytics' as any && (
              <AnalyticsTab bot={bot} executions={executions} />
            )}

            {/* ══ CONFIG TAB ══ */}
            {showConfig === 'config' as any && (
              <div className="px-5 py-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground">Configuration</h3>
                  <div className="flex items-center gap-2 text-[10px]" style={{ color: CV.gray }}>
                    <span>Created: {fmtDate(bot.createdAt)}</span>
                  </div>
                </div>

                {/* Two-column config grid (spec 3.3) */}
                <div
                  className="rounded-xl overflow-hidden"
                  style={{ border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  {configRows.map(({ label, value }, i) => (
                    <div
                      key={label}
                      className="flex items-center justify-between px-4 py-2.5"
                      style={{
                        background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                        borderBottom: i < configRows.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                      }}
                    >
                      <span className="text-xs" style={{ color: CV.gray }}>{label}</span>
                      <span className="text-xs font-semibold text-foreground">{value}</span>
                    </div>
                  ))}
                  {/* Status + Created rows */}
                  {[
                    { label: 'Status',   value: bot.status.charAt(0).toUpperCase() + bot.status.slice(1) },
                    { label: 'Started',  value: bot.startedAt ? fmtDate(bot.startedAt) : '—' },
                    { label: 'Stopped',  value: bot.stoppedAt ? fmtDate(bot.stoppedAt) : '—' },
                  ].map(({ label, value }, i) => (
                    <div
                      key={label}
                      className="flex items-center justify-between px-4 py-2.5"
                      style={{
                        background: (configRows.length + i) % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                        borderTop: '1px solid rgba(255,255,255,0.04)',
                      }}
                    >
                      <span className="text-xs" style={{ color: CV.gray }}>{label}</span>
                      <span className="text-xs font-semibold text-foreground">{value}</span>
                    </div>
                  ))}
                </div>

                {/* Risk settings */}
                <div className="mt-4">
                  <h4 className="text-xs font-bold uppercase tracking-wide mb-2.5" style={{ color: CV.gray }}>Risk Settings</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="px-3 py-2.5 rounded-xl" style={{ background: 'rgba(255,59,48,0.06)', border: '1px solid rgba(255,59,48,0.15)' }}>
                      <p className="text-[9px]" style={{ color: CV.gray }}>Max Daily Loss</p>
                      <p className="text-sm font-bold" style={{ color: CV.red }}>
                        {bot.maxDailyLossUsd > 0 ? `${bot.maxDailyLossUsd.toLocaleString()}` : 'Disabled'}
                      </p>
                    </div>
                    <div className="px-3 py-2.5 rounded-xl" style={{ background: 'rgba(255,59,48,0.06)', border: '1px solid rgba(255,59,48,0.15)' }}>
                      <p className="text-[9px]" style={{ color: CV.gray }}>Max Total Loss</p>
                      <p className="text-sm font-bold" style={{ color: CV.red }}>
                        {bot.maxTotalLossUsd > 0 ? `${bot.maxTotalLossUsd.toLocaleString()}` : 'Disabled'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ══ LOGS TAB ══ */}
            {showConfig === 'logs' as any && (
              <div className="px-5 py-4">
                <h3 className="text-sm font-semibold text-foreground mb-3">
                  Execution Logs
                  <span className="ml-2 text-xs font-normal" style={{ color: CV.gray }}>
                    {executions.length} events
                  </span>
                </h3>
                {executions.length === 0 ? (
                  <div
                    className="flex items-center justify-center h-24 rounded-xl text-xs"
                    style={{ background: 'rgba(255,255,255,0.02)', color: CV.gray, border: '1px solid rgba(255,255,255,0.05)' }}
                  >
                    No logs yet
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {executions.slice(0, 50).map(exec => (
                      <ExecRow key={exec.id} exec={exec} />
                    ))}
                    {executions.length > 50 && (
                      <p className="text-center text-xs py-2" style={{ color: CV.gray }}>
                        + {executions.length - 50} more events
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

          </div>{/* end tab content */}
        </div>{/* end scrollable */}

        {/* ── Delete confirm ── */}
        <AnimatePresence>
          {confirmDelete && (
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 36 }}
              className="absolute bottom-0 left-0 right-0 p-5 rounded-t-2xl"
              style={{ background: '#0F2030', border: '1px solid rgba(255,59,48,0.25)' }}
            >
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: CV.red }} />
                <p className="text-sm font-bold text-foreground">Delete "{bot.name}"?</p>
              </div>
              <p className="text-xs mb-4" style={{ color: CV.gray }}>
                This will permanently delete the bot and all its trade history. This action cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 py-2 rounded-xl text-sm font-semibold"
                  style={{ background: 'rgba(255,255,255,0.06)', color: CV.gray, border: '1px solid rgba(255,255,255,0.10)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  className="flex-1 py-2 rounded-xl text-sm font-bold"
                  style={{ background: 'rgba(255,59,48,0.15)', color: CV.red, border: '1px solid rgba(255,59,48,0.30)' }}
                >
                  Delete Bot
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
