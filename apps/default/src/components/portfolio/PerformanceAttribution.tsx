import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TradeRecord } from '@/lib/tradingStore';

type TimeFrame = '1D' | '1W' | '1M' | '3M' | '1Y' | 'All';

const TIME_FRAMES: { key: TimeFrame; label: string; hours: number }[] = [
  { key: '1D', label: '1D', hours: 24 },
  { key: '1W', label: '1W', hours: 168 },
  { key: '1M', label: '1M', hours: 720 },
  { key: '3M', label: '3M', hours: 2160 },
  { key: '1Y', label: '1Y', hours: 8760 },
  { key: 'All', label: 'All', hours: Infinity },
];

interface AssetAttribution {
  symbol: string;
  color: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
}

function AttrTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as AssetAttribution;
  return (
    <div className="bg-card border border-white/10 rounded-xl p-3 shadow-xl text-sm">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
        <span className="font-bold">{d.symbol}</span>
      </div>
      <p className="text-xs text-muted-foreground">{d.trades} trades · {d.winRate.toFixed(0)}% win rate</p>
      <p className={cn('font-mono text-xs font-bold', d.totalPnl >= 0 ? 'text-green-400' : 'text-red-400')}>
        {d.totalPnl >= 0 ? '+' : ''}${d.totalPnl.toFixed(2)}
      </p>
    </div>
  );
}

interface Props {
  history: TradeRecord[];
  className?: string;
}

export function PerformanceAttribution({ history, className }: Props) {
  const [timeFrame, setTimeFrame] = useState<TimeFrame>('All');

  const assets = useMemo<AssetAttribution[]>(() => {
    const closedTrades = history.filter(r => r.action === 'close');
    const relevantTrades = timeFrame === 'All'
      ? closedTrades
      : closedTrades.slice(0, Math.min(closedTrades.length, TIME_FRAMES.find(t => t.key === timeFrame)?.hours ?? 50));

    const map = new Map<string, { color: string; trades: number; wins: number; losses: number; totalPnl: number }>();
    for (const t of relevantTrades) {
      const entry = map.get(t.symbol) ?? { color: t.color, trades: 0, wins: 0, losses: 0, totalPnl: 0 };
      entry.trades++;
      if (t.pnl > 0) entry.wins++;
      else entry.losses++;
      entry.totalPnl += t.pnl;
      map.set(t.symbol, entry);
    }

    return Array.from(map.entries())
      .map(([symbol, d]) => ({
        symbol,
        color: d.color,
        trades: d.trades,
        wins: d.wins,
        losses: d.losses,
        winRate: d.trades > 0 ? (d.wins / d.trades) * 100 : 0,
        totalPnl: Math.round(d.totalPnl * 100) / 100,
      }))
      .sort((a, b) => b.totalPnl - a.totalPnl);
  }, [history, timeFrame]);

  if (assets.length === 0) {
    return (
      <div className={cn('bg-card border border-white/5 rounded-2xl p-5 shadow-lg', className)}>
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Performance Attribution</h3>
        </div>
        <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
          <p>No closed trades to analyze.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('bg-card border border-white/5 rounded-2xl p-5 shadow-lg', className)}>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h3 className="font-semibold flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          Performance Attribution
        </h3>
        <div className="flex items-center gap-1.5">
          {TIME_FRAMES.map(tf => (
            <button key={tf.key} onClick={() => setTimeFrame(tf.key)}
              className={cn('px-3 py-1 rounded-lg text-xs font-semibold transition-all',
                timeFrame === tf.key ? 'bg-primary text-primary-foreground shadow-md' : 'bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary')}>
              {tf.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-48 mb-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={assets} layout="vertical" margin={{ left: 12, right: 12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
            <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} tickFormatter={v => `$${v.toFixed(0)}`} />
            <YAxis type="category" dataKey="symbol" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} width={36} />
            <Tooltip content={<AttrTooltip />} />
            <Bar dataKey="totalPnl" radius={[0, 6, 6, 0]} maxBarSize={24}>
              {assets.map((entry, idx) => (
                <Cell key={idx} fill={entry.totalPnl >= 0 ? 'hsl(var(--chart-positive))' : 'hsl(var(--chart-negative))'} fillOpacity={0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground uppercase tracking-wider border-b border-white/5">
              <th className="text-left py-2 pr-4">Asset</th>
              <th className="text-right py-2 px-2">Trades</th>
              <th className="text-right py-2 px-2">Win Rate</th>
              <th className="text-right py-2 pl-2">Total P&L</th>
            </tr>
          </thead>
          <tbody>
            {assets.map(a => (
              <tr key={a.symbol} className="border-b border-white/5 hover:bg-secondary/10 transition-colors">
                <td className="py-2.5 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: a.color }} />
                    <span className="font-semibold">{a.symbol}</span>
                  </div>
                </td>
                <td className="text-right py-2.5 px-2 font-mono text-muted-foreground">{a.trades}</td>
                <td className="text-right py-2.5 px-2 font-mono">{a.winRate.toFixed(0)}%</td>
                <td className={cn('text-right py-2.5 pl-2 font-mono font-bold', a.totalPnl >= 0 ? 'text-green-400' : 'text-red-400')}>
                  {a.totalPnl >= 0 ? '+' : ''}${a.totalPnl.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default PerformanceAttribution;
