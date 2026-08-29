/**
 * MobileRiskPanel.tsx
 * Risk overview as compact cards - Free Margin, Margin Used, Risk Score,
 * Liquidation Buffer, Exposure. No tables.
 */

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useTradingStore, calcPositionPnl } from '@/lib/tradingStore';

interface Props {
  coin: { id: string; symbol: string; name: string; color: string };
  price: number;
}

export function MobileRiskPanel({ coin, price }: Props) {
  const { balance, positions } = useTradingStore();

  const totalMargin = useMemo(() => positions.reduce((a, p) => a + p.costBasis, 0), [positions]);
  const unrealizedPnl = useMemo(() => {
    return positions.reduce((acc, pos) => {
      const mp = pos.coinId === coin.id ? price : pos.entryPrice;
      return acc + calcPositionPnl(pos, mp).rawPnl;
    }, 0);
  }, [positions, price, coin.id]);

  const freeMargin = balance;
  const exposure = freeMargin > 0 ? (totalMargin / (freeMargin + totalMargin)) * 100 : 0;
  const equity = balance + unrealizedPnl;

  // Risk score calculation
  const riskScore = useMemo(() => {
    let score = 0;
    if (positions.length > 0) score += 20;
    if (positions.length > 3) score += 20;
    if (exposure > 30) score += 20;
    if (exposure > 60) score += 20;
    if (unrealizedPnl < -1000) score += 20;
    return Math.min(100, score);
  }, [positions.length, exposure, unrealizedPnl]);

  // Liquidation buffer
  const avgLeverage = positions.length > 0
    ? positions.reduce((a, p) => a + p.leverage, 0) / positions.length
    : 1;
  const liqBuffer = avgLeverage > 1 ? ((1 - 1 / avgLeverage) * 100).toFixed(1) : '—';

  const riskLevel = riskScore >= 60 ? 'High' : riskScore >= 30 ? 'Med' : 'Low';
  const riskColorClass = riskLevel === 'High' ? 'text-red-400' : riskLevel === 'Med' ? 'text-amber-400' : 'text-emerald-400';

  return (
    <div className="flex flex-col space-y-4 px-4 py-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)' }}>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4">
          <span className="block text-xs text-white/35 mb-1">Free Margin</span>
          <span className="text-xl font-bold font-mono tabular-nums text-emerald-400">
            {freeMargin.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
          <span className="text-[10px] text-white/25 block">USDT</span>
        </div>
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4">
          <span className="block text-xs text-white/35 mb-1">Margin Used</span>
          <span className="text-xl font-bold font-mono tabular-nums text-amber-400">
            {totalMargin.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
          <span className="text-[10px] text-white/25 block">USDT</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4">
          <span className="block text-xs text-white/35 mb-1">Risk Score</span>
          <span className={cn('text-xl font-bold font-mono tabular-nums', riskColorClass)}>
            {riskScore}%
          </span>
          <span className={cn('text-[10px] block', riskColorClass)}>{riskLevel}</span>
        </div>
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4">
          <span className="block text-xs text-white/35 mb-1">Liq. Buffer</span>
          <span className={cn('text-xl font-bold font-mono tabular-nums',
            positions.length === 0 ? 'text-emerald-400' : 'text-yellow-400')}>
            {liqBuffer}{positions.length > 0 ? '%' : ''}
          </span>
          <span className="text-[10px] text-white/25 block">Avg lev: {avgLeverage.toFixed(1)}x</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4">
          <span className="block text-xs text-white/35 mb-1">Exposure</span>
          <span className={cn('text-xl font-bold font-mono tabular-nums', exposure > 50 ? 'text-red-400' : 'text-amber-400')}>
            {exposure.toFixed(1)}%
          </span>
          <span className="text-[10px] text-white/25 block">of portfolio</span>
        </div>
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4">
          <span className="block text-xs text-white/35 mb-1">Equity</span>
          <span className="text-xl font-bold font-mono tabular-nums text-white/90">
            {equity.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
          <span className="text-[10px] text-white/25 block">USDT</span>
        </div>
      </div>

      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4">
        <span className="block text-xs text-white/35 mb-1">Positions</span>
        <span className="text-xl font-bold font-mono tabular-nums text-white/90">{positions.length}</span>
        <span className="text-[10px] text-white/25 block">
          {positions.length === 0 ? 'No risk — no positions' : positions.length <= 2 ? 'Low risk — manageable' : positions.length <= 5 ? 'Moderate risk' : 'High risk — consider reducing'}
        </span>
      </div>
    </div>
  );
}
