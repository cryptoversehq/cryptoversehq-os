import React, { useMemo } from 'react';
import { Shield, TrendingDown, Target, BarChart4 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { portfolioHistory, type PortfolioSnapshot } from '@/lib/portfolioHistoryService';
import type { TradeRecord } from '@/lib/tradingStore';

const RISK_FREE_RATE = 2.0; // 2% annual

// ─── Mini stat pill used inside the card ────────────────────────────────────

function RiskStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-secondary/20 rounded-xl p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{label}</p>
      <p className="text-lg font-bold font-mono">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Stats helpers ─────────────────────────────────────────────────────────

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[], avg: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

// ─── Component ──────────────────────────────────────────────────────────────

interface Props {
  history: TradeRecord[];
  className?: string;
}

export function RiskMetrics({ history, className }: Props) {
  const metrics = useMemo(() => {
    const snapshots = portfolioHistory.getHistory();
    const closedTrades = history.filter(r => r.action === 'close');

    // ── Sharpe Ratio ────────────────────────────────────────────────────
    // Sharpe = (portfolio return - risk-free rate) / std dev of returns
    let sharpe = 0;
    if (snapshots.length >= 3) {
      const returns: number[] = [];
      for (let i = 1; i < snapshots.length; i++) {
        const prev = snapshots[i - 1].grandTotal;
        const curr = snapshots[i].grandTotal;
        if (prev > 0) returns.push((curr - prev) / prev);
      }
      const avgReturn = mean(returns);
      const sd = stdDev(returns, avgReturn);
      // Annualize: assume ~ daily snapshots
      const annualReturn = avgReturn * 365;
      const annualSd = sd * Math.sqrt(365);
      const annualRiskFree = RISK_FREE_RATE / 100;
      sharpe = annualSd > 0 ? (annualReturn - annualRiskFree) / annualSd : 0;
    }

    // ── Sortino Ratio ───────────────────────────────────────────────────
    // Same as Sharpe but only considers downside deviation
    let sortino = 0;
    if (snapshots.length >= 3) {
      const returns: number[] = [];
      const downside: number[] = [];
      for (let i = 1; i < snapshots.length; i++) {
        const prev = snapshots[i - 1].grandTotal;
        const curr = snapshots[i].grandTotal;
        if (prev > 0) {
          const r = (curr - prev) / prev;
          returns.push(r);
          if (r < 0) downside.push(r);
        }
      }
      const avgReturn = mean(returns);
      const downSD = downside.length >= 2 ? stdDev(downside, mean(downside)) : 0;
      const annualReturn = avgReturn * 365;
      const annualDownSD = downSD * Math.sqrt(365);
      const annualRiskFree = RISK_FREE_RATE / 100;
      sortino = annualDownSD > 0 ? (annualReturn - annualRiskFree) / annualDownSD : 0;
    }

    // ── Max Drawdown ────────────────────────────────────────────────────
    let maxDD = 0;
    if (snapshots.length >= 2) {
      let peak = snapshots[0].grandTotal;
      for (const s of snapshots) {
        if (s.grandTotal > peak) peak = s.grandTotal;
        const dd = peak > 0 ? ((peak - s.grandTotal) / peak) * 100 : 0;
        if (dd > maxDD) maxDD = dd;
      }
    }

    // ── VaR 95% ─────────────────────────────────────────────────────────
    // Historical VaR: 5th percentile of daily returns
    let var95 = 0;
    if (snapshots.length >= 5) {
      const returns: number[] = [];
      for (let i = 1; i < snapshots.length; i++) {
        const prev = snapshots[i - 1].grandTotal;
        const curr = snapshots[i].grandTotal;
        if (prev > 0) returns.push((curr - prev) / prev * 100);
      }
      returns.sort((a, b) => a - b);
      const idx = Math.floor(returns.length * 0.05);
      var95 = Math.abs(returns[idx] ?? 0);
    }

    // ── Current portfolio value for display ─────────────────────────────
    const currentValue = snapshots.length > 0 ? snapshots[snapshots.length - 1].grandTotal : 0;

    return { sharpe, sortino, maxDD, var95, currentValue };
  }, [history]);

  return (
    <div className={cn('bg-card border border-white/5 rounded-2xl p-5 shadow-lg', className)}>
      <h3 className="font-semibold flex items-center gap-2 mb-4">
        <Shield className="h-4 w-4 text-primary" />
        Risk Metrics
        <span className="text-xs text-muted-foreground font-normal">· Based on portfolio history</span>
      </h3>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <RiskStat
          label="Sharpe Ratio"
          value={metrics.sharpe.toFixed(2)}
          sub="Annualized"
        />
        <RiskStat
          label="Sortino Ratio"
          value={metrics.sortino.toFixed(2)}
          sub="Downside only"
        />
        <RiskStat
          label="Max Drawdown"
          value={`${metrics.maxDD.toFixed(2)}%`}
          sub="Peak to trough"
        />
        <RiskStat
          label="VaR 95%"
          value={`${metrics.var95.toFixed(2)}%`}
          sub={`$${((metrics.var95 / 100) * metrics.currentValue).toFixed(0)} at risk`}
        />
      </div>

      <p className="text-[10px] text-muted-foreground mt-3">
        Calculated from {useMemo(() => portfolioHistory.getHistory().length, [])} portfolio snapshots · Risk-free rate: {RISK_FREE_RATE}%
      </p>
    </div>
  );
}

export default RiskMetrics;
