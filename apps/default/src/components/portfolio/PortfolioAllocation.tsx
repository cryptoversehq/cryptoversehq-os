import React, { useState, useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Sector } from 'recharts';
import { PieChartIcon, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTradingStore } from '@/lib/tradingStore';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AllocationSlice {
  symbol: string;
  name: string;
  costBasis: number;
  value: number;
  percentage: number;
  color: string;
  side: 'long' | 'short';
}

// ─── Colors for pie slices not covered by position color ──────────────────────

const FALLBACK_COLORS = [
  '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
  '#f43f5e', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6',
];

// ─── Custom Active Shape ──────────────────────────────────────────────────────

function ActiveShape(props: any) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent } = props;
  const RADIAN = Math.PI / 180;
  const sin = Math.sin(-RADIAN * (endAngle + startAngle) / 2);
  const cos = Math.cos(-RADIAN * (endAngle + startAngle) / 2);
  const sx = cx + (outerRadius + 8) * cos;
  const sy = cy + (outerRadius + 8) * sin;
  const mx = cx + (outerRadius + 20) * cos;
  const my = cy + (outerRadius + 20) * sin;
  const ex = mx + (cos >= 0 ? 1 : -1) * 16;
  const textAnchor = cos >= 0 ? 'start' : 'end';

  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 6}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        style={{ filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.15))' }}
      />
      <path d={`M${sx},${sy}L${mx},${my}L${ex},${my}`} stroke={fill} fill="none" strokeWidth={1.5} />
      <circle cx={ex} cy={my} r={3} fill={fill} stroke="none" />
      <text x={ex + (cos >= 0 ? 5 : -5)} y={my - 7} textAnchor={textAnchor} fill="hsl(var(--foreground))" fontSize={12} fontWeight={700}>
        {payload.symbol}
      </text>
      <text x={ex + (cos >= 0 ? 5 : -5)} y={my + 8} textAnchor={textAnchor} fill="hsl(var(--muted-foreground))" fontSize={11}>
        {(percent * 100).toFixed(1)}%
      </text>
    </g>
  );
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function AllocationTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as AllocationSlice;
  return (
    <div className="bg-card border border-white/10 rounded-xl p-3 shadow-xl text-sm">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
        <span className="font-bold">{d.symbol}</span>
        <span className={cn(
          'text-[10px] px-1.5 py-0.5 rounded font-bold uppercase',
          d.side === 'long' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400',
        )}>
          {d.side}
        </span>
      </div>
      <div className="space-y-0.5 text-muted-foreground text-xs">
        <p>Cost Basis: <span className="font-mono text-foreground">${d.costBasis.toLocaleString()}</span></p>
        <p>Allocation: <span className="font-mono text-foreground">{d.percentage.toFixed(1)}%</span></p>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface PortfolioAllocationProps {
  onSelectAsset?: (symbol: string) => void;
}

export function PortfolioAllocation({ onSelectAsset }: PortfolioAllocationProps) {
  const positions = useTradingStore(s => s.positions);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const slices = useMemo<AllocationSlice[]>(() => {
    if (positions.length === 0) return [];
    const total = positions.reduce((sum, p) => sum + p.costBasis, 0);
    return positions.map((p, i) => ({
      symbol: p.symbol,
      name: p.name,
      costBasis: p.costBasis,
      value: p.costBasis, // value = costBasis for allocation calc
      percentage: total > 0 ? (p.costBasis / total) * 100 : 0,
      color: p.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length],
      side: p.side,
    }));
  }, [positions]);

  // ── Empty state ──────────────────────────────────────────────────────────
  if (slices.length === 0) {
    return (
      <div className="bg-card border border-white/5 rounded-2xl p-5 shadow-lg">
        <div className="flex items-center gap-2 mb-4">
          <PieChartIcon className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Asset Allocation</h3>
        </div>
        <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
          <div className="text-center space-y-2">
            <Layers className="h-8 w-8 mx-auto opacity-30" />
            <p>No open positions</p>
            <p className="text-xs opacity-60">Open a trade to see your allocation here.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-white/5 rounded-2xl p-5 shadow-lg">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold flex items-center gap-2">
          <PieChartIcon className="h-4 w-4 text-primary" />
          Asset Allocation
        </h3>
        <span className="text-xs text-muted-foreground">
          {slices.length} position{slices.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Pie */}
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="percentage"
              nameKey="symbol"
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={90}
              activeIndex={activeIndex !== null ? activeIndex : undefined}
              activeShape={ActiveShape}
              onMouseEnter={(_, index) => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
              onClick={(entry) => {
                if (onSelectAsset && entry?.symbol) onSelectAsset(entry.symbol);
              }}
              className="cursor-pointer"
            >
              {slices.map((entry, index) => (
                <Cell key={entry.symbol} fill={entry.color} stroke="hsl(var(--card))" strokeWidth={2} />
              ))}
            </Pie>
            <Tooltip content={<AllocationTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
        {slices.map(s => (
          <div
            key={s.symbol}
            className="flex items-center gap-2 text-sm cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => onSelectAsset?.(s.symbol)}
          >
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
            <span className="font-medium">{s.symbol}</span>
            <span className="text-muted-foreground text-xs ml-auto">{s.percentage.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default PortfolioAllocation;
