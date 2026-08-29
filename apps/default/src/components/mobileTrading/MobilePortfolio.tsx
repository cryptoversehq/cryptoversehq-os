/**
 * MobilePortfolio.tsx
 * Portfolio as cards - Balance, Equity, PnL, Win Rate, Profit Factor, Exposure, Risk.
 * No tables. Uses tradingStore directly.
 */

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useTradingStore, calcPositionPnl } from '@/lib/tradingStore';

type CoinInfo = { id: string; symbol: string; name: string; color: string };

interface Props {
  coin: CoinInfo;
  price: number;
}

function StatCard({ label, value, sub, valueClass }: { label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
      <span className="block text-xs text-muted-foreground mb-1">{label}</span>
      <span className={cn('text-xl font-bold font-mono tabular-nums', valueClass || 'text-foreground')}>{value}</span>
      {sub && <span className="text-[10px] text-muted-foreground block">{sub}</span>}
    </div>
  );
}

export function MobilePortfolio({ coin, price }: Props) {
  const { balance, positions, history } = useTradingStore();

  const totalInPositions = useMemo(() => positions.reduce((a, p) => a + p.costBasis, 0), [positions]);
  const unrealizedPnl = useMemo(() => {
    return positions.reduce((acc, pos) => {
      const mp = pos.coinId === coin.id ? price : pos.entryPrice;
      return acc + calcPositionPnl(pos, mp).rawPnl;
    }, 0);
  }, [positions, price, coin.id]);

  const closedTrades = useMemo(() => history.filter(h => h.action === 'close'), [history]);
  const winners = useMemo(() => closedTrades.filter(r => r.pnl > 0), [closedTrades]);
  const losers = useMemo(() => closedTrades.filter(r => r.pnl < 0), [closedTrades]);
  const winRate = closedTrades.length > 0 ? (winners.length / closedTrades.length) * 100 : 0;
  const totalPnl = useMemo(() => closedTrades.reduce((s, r) => s + r.pnl, 0), [closedTrades]);
  const avgWin = winners.length > 0 ? winners.reduce((s, r) => s + r.pnl, 0) / winners.length : 0;
  const avgLoss = losers.length > 0 ? Math.abs(losers.reduce((s, r) => s + r.pnl, 0) / losers.length) : 0;
  const profitFactor = avgLoss > 0 ? (avgWin * winners.length) / (avgLoss * losers.length) : (winners.length > 0 ? 999 : 0);
  const exposure = balance > 0 ? (totalInPositions / (balance + totalInPositions)) * 100 : 0;
  const equity = balance + unrealizedPnl;
  const isPnlPos = unrealizedPnl >= 0;

  return (
    <div className="flex flex-col space-y-4 px-4 py-3" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {/* Balance & Equity cards */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Balance" value={balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} sub="USDT" />
        <StatCard label="Equity" value={equity.toLocaleString(undefined, { maximumFractionDigits: 2 })} sub="USDT" />
      </div>

      {/* PnL & Win Rate */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Unrealized PnL"
          value={`${isPnlPos ? '+' : ''}${unrealizedPnl.toFixed(2)}`}
          sub="USDT"
          valueClass={isPnlPos ? 'text-emerald-500' : 'text-destructive'}
        />
        <StatCard
          label="Win Rate"
          value={closedTrades.length > 0 ? `${winRate.toFixed(1)}%` : String.fromCodePoint(8212)}
          sub={`${closedTrades.length} closed trades`}
          valueClass={winRate >= 50 ? 'text-emerald-500' : 'text-destructive'}
        />
      </div>

      {/* Profit Factor & Total PnL */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Profit Factor"
          value={profitFactor === 999 ? '—' : profitFactor.toFixed(2)}
          sub={`Total PnL: ${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}`}
          valueClass={profitFactor >= 1.5 ? 'text-emerald-500' : profitFactor >= 1 ? 'text-amber-500' : 'text-destructive'}
        />
        <StatCard
          label="Total Trades"
          value={String(closedTrades.length)}
          sub={`${winners.length}W / ${losers.length}L`}
        />
      </div>

      {/* Exposure & Risk */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Exposure"
          value={`${exposure.toFixed(1)}%`}
          sub="of portfolio"
          valueClass={exposure > 50 ? 'text-destructive' : 'text-amber-500'}
        />
        <StatCard
          label="Risk Score"
          value={positions.length === 0 ? 'None' : positions.length <= 2 ? 'Low' : positions.length <= 5 ? 'Med' : 'High'}
          sub={`${positions.length} open positions`}
          valueClass={positions.length === 0 ? 'text-emerald-500' : positions.length <= 2 ? 'text-amber-500' : 'text-destructive'}
        />
      </div>

      {/* In positions */}
      <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
        <span className="block text-xs text-muted-foreground mb-1">In Positions</span>
        <span className="text-xl font-bold font-mono tabular-nums text-amber-500">
          {totalInPositions.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT
        </span>
        <span className="text-[10px] text-muted-foreground block">Practice account — virtual $100,000</span>
      </div>
    </div>
  );
}
