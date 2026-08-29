/**
 * EquityCurveChart.tsx
 *
 * Shared equity-curve sparkline. Both trading audits called out the same
 * gap: "No trade performance analytics page (equity curve, win rate,
 * drawdown)." The Performance tab already existed with win-rate/profit-
 * factor stat cards, but had no visual curve — and the backtest engine's
 * results were never rendered anywhere at all.
 *
 * One component now serves both:
 *   - live trading performance (BottomPanel / ProBottomPanel "Performance" tab)
 *   - backtest results (BacktestResultsModal)
 */
import React, { useMemo } from 'react';
import { AreaChart, Area, ResponsiveContainer, YAxis, Tooltip } from 'recharts';

interface Props {
  /** Sequential balance/equity values, oldest first. */
  points: number[];
  height?: number;
  /** Formats a value for the tooltip, e.g. "$1,234.56". */
  formatValue?: (v: number) => string;
}

export function EquityCurveChart({ points, height = 90, formatValue }: Props) {
  const data = useMemo(() => points.map((v, i) => ({ i, v })), [points]);
  const fmt = formatValue ?? ((v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 2 }));

  if (points.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-[11px] text-white/30 rounded-xl border border-white/[0.05]"
        style={{ height, background: 'rgba(255,255,255,0.02)' }}
      >
        Not enough closed trades yet to plot an equity curve
      </div>
    );
  }

  const first = points[0];
  const last  = points[points.length - 1];
  const isUp  = last >= first;
  const color = isUp ? '#0ecb81' : '#f6465d';

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="equityCurveGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.28} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis domain={['auto', 'auto']} hide />
          <Tooltip
            contentStyle={{ background: '#1e2026', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
            labelFormatter={() => ''}
            formatter={(v: number) => [fmt(v), 'Equity']}
          />
          <Area
            type="monotone" dataKey="v"
            stroke={color} strokeWidth={1.5}
            fill="url(#equityCurveGrad)"
            dot={false} isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
