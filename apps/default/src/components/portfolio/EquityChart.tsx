import React, { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { TrendingUp, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TradeRecord } from '@/lib/tradingStore';

const INITIAL_BALANCE = 100_000;

type TimeFrame = '1D' | '1W' | '1M' | '3M' | '1Y' | 'All';

const TIME_FRAMES: { key: TimeFrame; label: string; points: number }[] = [
  { key: '1D', label: '1D', points: 3 },
  { key: '1W', label: '1W', points: 7 },
  { key: '1M', label: '1M', points: 15 },
  { key: '3M', label: '3M', points: 25 },
  { key: '1Y', label: '1Y', points: 50 },
  { key: 'All', label: 'All', points: Infinity },
];

interface EquityPoint {
  label: string;
  equity: number;
  pnl: number;
  idx: number;
}

function buildEquityCurve(history: TradeRecord[]): EquityPoint[] {
  let equity = INITIAL_BALANCE;
  const points: EquityPoint[] = [{ label: 'Start', equity: INITIAL_BALANCE, pnl: 0, idx: 0 }];
  const chronological = [...history].reverse();
  for (let i = 0; i < chronological.length; i++) {
    const trade = chronological[i];
    if (trade.action === 'open') {
      equity -= trade.costBasis + trade.fee;
    } else {
      equity += trade.costBasis + trade.pnl;
    }
    points.push({ label: trade.timestamp, equity: Math.round(equity * 100) / 100, pnl: Math.round(trade.pnl * 100) / 100, idx: i + 1 });
  }
  return points;
}

function EquityTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as EquityPoint;
  const gain = d.equity - INITIAL_BALANCE;
  const positive = gain >= 0;
  return (
    <div className="bg-card border border-white/10 rounded-xl p-3 shadow-xl text-sm">
      <p className="text-muted-foreground text-xs mb-1">{d.label}</p>
      <p className="font-bold font-mono">${d.equity.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
      <p className={cn('font-mono text-xs font-semibold', positive ? 'text-green-400' : 'text-red-400')}>
        {positive ? '+' : ''}{gain.toFixed(0)} ({(gain / INITIAL_BALANCE * 100) >= 0 ? '+' : ''}{(gain / INITIAL_BALANCE * 100).toFixed(2)}%)
      </p>
    </div>
  );
}

interface EquityChartProps {
  history: TradeRecord[];
  balance: number;
}

export function EquityChart({ history, balance }: EquityChartProps) {
  const [timeFrame, setTimeFrame] = React.useState<TimeFrame>('All');

  const equityCurve = useMemo(() => buildEquityCurve(history), [history]);

  const filteredEquityCurve = useMemo(() => {
    if (timeFrame === 'All' || equityCurve.length <= 1) return equityCurve;
    const tf = TIME_FRAMES.find(t => t.key === timeFrame);
    const count = tf?.points ?? Infinity;
    if (equityCurve.length <= count + 1) return equityCurve;
    return [equityCurve[0], ...equityCurve.slice(-count)];
  }, [equityCurve, timeFrame]);

  const timeFramePnl = useMemo(() => {
    if (filteredEquityCurve.length < 2) return 0;
    const first = filteredEquityCurve[0].equity;
    const last = filteredEquityCurve[filteredEquityCurve.length - 1].equity;
    return first > 0 ? ((last - first) / first) * 100 : 0;
  }, [filteredEquityCurve]);

  // P3-2: use CSS variables for chart colors instead of hardcoded hex
  const equityColor = balance >= INITIAL_BALANCE ? 'hsl(var(--chart-positive))' : 'hsl(var(--chart-negative))';

  return (
    <div className="bg-card border border-white/5 rounded-2xl p-5 shadow-lg">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h3 className="font-semibold flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          Equity Curve
        </h3>
        <div className="flex items-center gap-2 text-sm">
          <span className={cn('font-mono font-bold', timeFramePnl >= 0 ? 'text-[hsl(var(--chart-positive))]' : 'text-[hsl(var(--chart-negative))]')}>
            {timeFramePnl >= 0 ? '+' : ''}{timeFramePnl.toFixed(2)}%
          </span>
          <span className="text-muted-foreground text-xs">{timeFrame}</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 mb-4">
        {TIME_FRAMES.map(tf => (
          <button
            key={tf.key}
            onClick={() => setTimeFrame(tf.key)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
              timeFrame === tf.key
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary',
            )}
          >
            {tf.label}
          </button>
        ))}
      </div>

      {equityCurve.length <= 1 ? (
        <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
          <div className="text-center space-y-2">
            <Layers className="h-8 w-8 mx-auto opacity-30" />
            <p>No trades yet — your equity curve will appear here.</p>
          </div>
        </div>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={filteredEquityCurve}>
              <defs>
                <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={equityColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={equityColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis domain={['auto', 'auto']} stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} width={56} />
              <Tooltip content={<EquityTooltip />} />
              <ReferenceLine y={INITIAL_BALANCE} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" strokeOpacity={0.5} />
              <Area type="monotone" dataKey="equity" stroke={equityColor} strokeWidth={2.5} fill="url(#eqGrad)" dot={false} activeDot={{ r: 5, fill: equityColor }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export default EquityChart;
