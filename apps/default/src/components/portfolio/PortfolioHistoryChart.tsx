import React, { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { portfolioHistory, type PortfolioSnapshot } from '@/lib/portfolioHistoryService';

type Range = '7D' | '30D' | '90D' | 'ALL';

const RANGES: { key: Range; label: string; days: number | undefined }[] = [
  { key: '7D',  label: '7D',  days: 7 },
  { key: '30D', label: '30D', days: 30 },
  { key: '90D', label: '90D', days: 90 },
  { key: 'ALL', label: 'All', days: undefined },
];

interface ChartPoint {
  date: string;
  value: number;
  ts: number;
}

function TooltipContent({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as ChartPoint;
  return (
    <div className="bg-card border border-white/10 rounded-xl p-3 shadow-xl text-sm">
      <p className="text-muted-foreground text-xs mb-1">{d.date}</p>
      <p className="font-bold font-mono">${d.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
    </div>
  );
}

interface PortfolioHistoryChartProps {
  className?: string;
}

export function PortfolioHistoryChart({ className }: PortfolioHistoryChartProps) {
  const [range, setRange] = useState<Range>('30D');
  const [refreshKey, setRefreshKey] = useState(0);

  const data = useMemo<ChartPoint[]>(() => {
    const rangeCfg = RANGES.find(r => r.key === range);
    const snapshots = portfolioHistory.getHistory(rangeCfg?.days);
    return snapshots.map(s => ({
      date: new Date(s.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      value: Math.round(s.grandTotal * 100) / 100,
      ts: s.timestamp,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, refreshKey]);

  const pnl = useMemo(() => {
    if (data.length < 2) return 0;
    const first = data[0].value;
    const last = data[data.length - 1].value;
    return first > 0 ? ((last - first) / first) * 100 : 0;
  }, [data]);

  const lineColor = pnl >= 0 ? 'hsl(var(--chart-positive))' : 'hsl(var(--chart-negative))';
  const PnlIcon = pnl >= 0 ? TrendingUp : TrendingDown;

  return (
    <div className={cn('bg-card border border-white/5 rounded-2xl p-5 shadow-lg', className)}>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Portfolio Value History</h3>
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            Refresh
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          {RANGES.map(r => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={cn(
                'px-3 py-1 rounded-lg text-xs font-semibold transition-all',
                range === r.key
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary',
              )}
            >
              {r.label}
            </button>
          ))}
          <span className={cn('ml-2 font-mono text-xs font-bold flex items-center gap-1', pnl >= 0 ? 'text-[hsl(var(--chart-positive))]' : 'text-[hsl(var(--chart-negative))]')}>
            <PnlIcon className="h-3 w-3" />
            {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}%
          </span>
        </div>
      </div>

      {data.length < 2 ? (
        <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">
          <div className="text-center space-y-1">
            <Clock className="h-6 w-6 mx-auto opacity-30" />
            <p>Not enough data yet — snapshots are saved automatically.</p>
            <p className="text-xs opacity-60">Check back after your portfolio value changes.</p>
          </div>
        </div>
      ) : (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <defs>
                <linearGradient id="histGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={lineColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={lineColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis
                domain={['auto', 'auto']}
                stroke="hsl(var(--muted-foreground))"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
                width={52}
              />
              <Tooltip content={<TooltipContent />} />
              <Line
                type="monotone"
                dataKey="value"
                stroke={lineColor}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: lineColor }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export default PortfolioHistoryChart;
