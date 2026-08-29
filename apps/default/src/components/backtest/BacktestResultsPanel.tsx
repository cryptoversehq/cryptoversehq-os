/**
 * BacktestResultsPanel.tsx — Part 3 complete
 *
 * Displays all Part 3 spec fields from EnrichedBacktestOutput:
 *   - Equity curve (area chart)
 *   - Drawdown curve (area chart, always negative)
 *   - 12-metric grid:  totalReturn, annualizedReturn, sharpeRatio,
 *       maxDrawdown, maxDrawdownDuration, winRate, profitFactor,
 *       totalTrades, averageWin, averageLoss, largestWin, largestLoss,
 *       averageHoldTimeHours, longestWinStreak, longestLossStreak
 *   - Monthly returns bar chart + heatmap tiles
 *   - Session summary row
 *   - Empty / loading states
 */

import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell, ReferenceLine,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Activity, Shield, Target, Zap,
  DollarSign, BarChart2, Loader2, FlaskConical, ChevronRight,
  Trophy, AlertTriangle, Clock, Calendar, Database, Cpu,
  TrendingDown as DrawdownIcon,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { EnrichedBacktestOutput } from '../../lib/backtestRunner';
import type { ExtendedBacktestMetrics } from '../../lib/backtestRunner';
import type { BacktestConfig } from './BacktestConfigPanel';

// ─────────────────────────────────────────────────────────────────────────────
// PROPS
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  enrichedResult: EnrichedBacktestOutput | null;
  config:         BacktestConfig;
  isRunning:      boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// DESIGN TOKENS (Part 13 spec)
// ─────────────────────────────────────────────────────────────────────────────

/** Exact hex values from the CryptoVerse HQ design spec */
export const CV = {
  gold:    '#FFD700',
  green:   '#00C853',
  red:     '#FF3B30',
  orange:  '#FF9500',
  navy:    '#0A1929',
  navyMid: '#0F2030',
  navyHi:  '#1A3145',
  white:   '#FFFFFF',
  gray:    '#9CA3AF',
  /** Recharts tooltip background */
  tooltipBg: 'rgba(10,25,41,0.97)',
  /** 30% alpha drawdown fill */
  ddFill: 'rgba(255,59,48,0.30)',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// METRIC CARD
// ─────────────────────────────────────────────────────────────────────────────

interface MetricCardProps {
  label:     string;
  value:     string;
  sub?:      string;
  icon:      React.ElementType;
  color:     'green' | 'red' | 'blue' | 'amber' | 'purple' | 'neutral';
  positive?: boolean | null;
}

const COLOR_MAP = {
  /* success = CV green */
  green:   { bg: 'bg-[#00C853]/10',  text: 'text-[#00C853]',  icon: 'text-[#00C853]/70',  border: 'border-[#00C853]/20' },
  /* danger = CV red */
  red:     { bg: 'bg-[#FF3B30]/10',  text: 'text-[#FF3B30]',  icon: 'text-[#FF3B30]/70',  border: 'border-[#FF3B30]/20' },
  /* info = steel blue (not in spec, keep tasteful) */
  blue:    { bg: 'bg-blue-500/10',   text: 'text-blue-400',   icon: 'text-blue-400/70',   border: 'border-blue-500/15' },
  /* warning = CV gold */
  amber:   { bg: 'bg-[#FFD700]/10',  text: 'text-[#FFD700]',  icon: 'text-[#FFD700]/70',  border: 'border-[#FFD700]/20' },
  purple:  { bg: 'bg-purple-500/10', text: 'text-purple-400', icon: 'text-purple-400/70', border: 'border-purple-500/15' },
  neutral: { bg: 'bg-secondary/20',  text: 'text-foreground', icon: 'text-muted-foreground', border: 'border-white/5' },
};

// ─── Metric card with tooltip ──────────────────────────────────────────────

interface MetricCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  color: MetricColor;
  positive?: boolean | null;
  tooltip?: string;
}

function MetricTooltip({ text }: { text: string }) {
  const [show, setShow] = React.useState(false);
  return (
    <span className="relative inline-flex ml-1">
      <span
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow(v => !v)}
        className="text-[10px] cursor-help text-muted-foreground/50 hover:text-muted-foreground transition-colors select-none"
      >ⓘ</span>
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-52">
          <div className="bg-card border border-border rounded-lg p-2.5 shadow-xl text-xs text-muted-foreground leading-relaxed">
            {text}
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-card border-r border-b border-border rotate-45 -mt-1" />
        </div>
      )}
    </span>
  );
}

function MetricCard({ label, value, sub, icon: Icon, color, positive, tooltip }: MetricCardProps) {
  const c = COLOR_MAP[color];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('p-3 rounded-xl border flex flex-col gap-1.5', c.bg, c.border)}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide leading-none flex items-center">
          {label}
          {tooltip && <MetricTooltip text={tooltip} />}
        </span>
        <Icon className={cn('h-3.5 w-3.5', c.icon)} />
      </div>
      <div className="flex items-end justify-between gap-1">
        <span className={cn('text-lg font-bold tabular-nums leading-none', c.text)}>{value}</span>
        {positive !== null && positive !== undefined && (
          <span className={cn('text-[10px] font-medium mb-0.5', positive ? 'text-green-400' : 'text-red-400')}>
            {positive ? '▲' : '▼'}
          </span>
        )}
      </div>
      {sub && <span className="text-[10px] text-muted-foreground leading-tight">{sub}</span>}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FORMAT HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function fmt$(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `$${(abs / 1_000).toFixed(1)}k`;
  return `$${abs.toFixed(2)}`;
}

function fmtPct(n: number, sign = true): string {
  return `${sign && n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

// ─────────────────────────────────────────────────────────────────────────────
// EQUITY CURVE CHART
// ─────────────────────────────────────────────────────────────────────────────

function EquityCurveChart({ metrics, initialBalance }: { metrics: ExtendedBacktestMetrics; initialBalance: number }) {
  const data = useMemo(() =>
    metrics.equityCurve.map((v, i) => ({ i, equity: v })),
  [metrics.equityCurve]);

  const isPositive = metrics.totalReturn >= 0;

  /*
   * Part 13 spec:
   *   Equity curve stroke  → Gold  #FFD700
   *   Positive total return → accent glow gold
   *   Negative total return → secondary stroke is still gold (equity line)
   *                           but the return badge switches to CV red
   */
  const EQUITY_STROKE = CV.gold;          // always gold per spec
  const GRAD_ID       = 'eq-grad-cv';

  const fmtY = (v: number) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M`
                            : v >= 1_000      ? `${(v / 1_000).toFixed(0)}k`
                            : `${v.toFixed(0)}`;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <Activity className="h-4 w-4" style={{ color: CV.gold }} />
          Equity Curve
        </h3>
        <div className="flex items-center gap-2">
          {/* Return badge: green if positive, red if negative — spec colors */}
          <span
            className="text-sm font-bold tabular-nums"
            style={{ color: isPositive ? CV.green : CV.red }}
          >
            {fmtPct(metrics.totalReturn)}
          </span>
          <span className="text-xs" style={{ color: CV.gray }}>
            → {fmtPct(metrics.annualizedReturn)} ann.
          </span>
        </div>
      </div>

      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <defs>
              {/* Gold gradient fill under equity line */}
              <linearGradient id={GRAD_ID} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={EQUITY_STROKE} stopOpacity={0.28} />
                <stop offset="95%" stopColor={EQUITY_STROKE} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="i" hide />
            <YAxis
              tickFormatter={fmtY}
              tick={{ fontSize: 10, fill: CV.gray }}
              width={52}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: CV.tooltipBg,
                border: `1px solid rgba(255,215,0,0.20)`,
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(v: number) => [fmtY(v), 'Portfolio']}
              labelFormatter={() => ''}
            />
            {/* Baseline — initial balance reference */}
            <ReferenceLine y={initialBalance} stroke="rgba(255,215,0,0.18)" strokeDasharray="5 4" />
            {/* Gold equity line */}
            <Area
              type="monotone"
              dataKey="equity"
              stroke={EQUITY_STROKE}
              strokeWidth={2}
              fill={`url(#${GRAD_ID})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: EQUITY_STROKE }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex justify-between text-[11px] mt-1" style={{ color: CV.gray }}>
        <span>Start: {fmt$(initialBalance)}</span>
        <span style={{ color: isPositive ? CV.green : CV.red }}>
          End: {fmt$(metrics.finalBalance)}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DRAWDOWN CURVE CHART (Part 3 spec field)
// ─────────────────────────────────────────────────────────────────────────────

function DrawdownCurveChart({ metrics }: { metrics: ExtendedBacktestMetrics }) {
  const data = useMemo(() =>
    metrics.drawdownCurve.map((p, i) => ({ i, drawdown: -p.drawdown })),
  [metrics.drawdownCurve]);

  if (data.length === 0) return null;

  /*
   * Part 13 spec:
   *   Drawdown fill  → #FF3B30 at 30% opacity
   *   Drawdown stroke → #FF3B30 (CV red)
   */
  const DD_STROKE = CV.red;
  const DD_FILL   = CV.ddFill;   // rgba(255,59,48,0.30)

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <DrawdownIcon className="h-4 w-4" style={{ color: CV.red }} />
          Drawdown Curve
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold tabular-nums" style={{ color: CV.red }}>
            -{metrics.maxDrawdown.toFixed(2)}%
          </span>
          <span className="text-xs" style={{ color: CV.gray }}>
            {metrics.maxDrawdownDuration}d duration
          </span>
        </div>
      </div>

      <div className="h-32 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <defs>
              {/* CV red at 30% → 0% opacity gradient */}
              <linearGradient id="dd-grad-cv" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={DD_STROKE} stopOpacity={0.30} />
                <stop offset="95%" stopColor={DD_STROKE} stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="i" hide />
            <YAxis
              tickFormatter={v => `${Math.abs(v).toFixed(0)}%`}
              tick={{ fontSize: 10, fill: CV.gray }}
              width={40}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: CV.tooltipBg,
                border: `1px solid rgba(255,59,48,0.25)`,
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(v: number) => [`-${Math.abs(v).toFixed(2)}%`, 'Drawdown']}
              labelFormatter={() => ''}
            />
            <ReferenceLine y={0} stroke={`rgba(255,255,255,0.10)`} />
            <Area
              type="monotone"
              dataKey="drawdown"
              stroke={DD_STROKE}
              strokeWidth={1.5}
              fill="url(#dd-grad-cv)"
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0, fill: DD_STROKE }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// METRICS GRID — all Part 3 spec fields
// ─────────────────────────────────────────────────────────────────────────────

function MetricsGrid({ metrics, initialBalance }: { metrics: ExtendedBacktestMetrics; initialBalance: number }) {
  const cards: MetricCardProps[] = [
    {
      label:    'Total Return',
      value:    fmtPct(metrics.totalReturn),
      sub:      `${fmt$(metrics.finalBalance)} final`,
      icon:     metrics.totalReturn >= 0 ? TrendingUp : TrendingDown,
      color:    metrics.totalReturn >= 0 ? 'green' : 'red',
      positive: metrics.totalReturn >= 0,
    },
    {
      label:    'Annualized Return',   // Part 3 spec
      value:    fmtPct(metrics.annualizedReturn),
      sub:      metrics.annualizedReturn >= 0 ? 'Above benchmark' : 'Below benchmark',
      icon:     Calendar,
      color:    metrics.annualizedReturn >= 0 ? 'green' : 'red',
      positive: metrics.annualizedReturn >= 0,
    },
    {
      label:    'Sharpe Ratio',        // rfr = 2%
      value:    metrics.sharpeRatio.toFixed(2),
      sub:      metrics.sharpeRatio >= 2 ? 'Excellent' : metrics.sharpeRatio >= 1 ? 'Good' : 'Weak',
      icon:     Zap,
      color:    metrics.sharpeRatio >= 1.5 ? 'green' : metrics.sharpeRatio >= 1 ? 'blue' : 'amber',
      positive: metrics.sharpeRatio >= 1,
    },
    {
      label:    'Max Drawdown',
      value:    `-${metrics.maxDrawdown.toFixed(2)}%`,
      sub:      `${metrics.maxDrawdownDuration}d duration`,  // Part 3 spec
      icon:     Shield,
      color:    metrics.maxDrawdown < 10 ? 'green' : metrics.maxDrawdown < 20 ? 'amber' : 'red',
      positive: metrics.maxDrawdown < 15,
    },
    {
      label:    'Win Rate',
      value:    `${metrics.winRate.toFixed(1)}%`,
      sub:      `${metrics.winningTrades}W / ${metrics.losingTrades}L`,
      icon:     Target,
      color:    metrics.winRate >= 55 ? 'green' : metrics.winRate >= 45 ? 'blue' : 'red',
      positive: metrics.winRate >= 50,
    },
    {
      label:    'Profit Factor',
      value:    isFinite(metrics.profitFactor) ? metrics.profitFactor.toFixed(2) : '∞',
      sub:      metrics.profitFactor >= 1.5 ? 'Strong edge' : metrics.profitFactor >= 1 ? 'Profitable' : 'Net loss',
      icon:     BarChart2,
      color:    metrics.profitFactor >= 1.5 ? 'green' : metrics.profitFactor >= 1 ? 'blue' : 'red',
      positive: metrics.profitFactor >= 1,
    },
    {
      label:    'Total Trades',
      value:    `${metrics.totalTrades}`,
      sub:      `Avg ${metrics.averageDuration}min hold`,
      icon:     Activity,
      color:    'neutral',
      positive: null,
    },
    {
      label:    'Avg Hold Time',       // Part 3 spec (hours)
      value:    `${metrics.averageHoldTimeHours.toFixed(1)}h`,
      sub:      metrics.averageHoldTimeHours < 1 ? 'Scalping' : metrics.averageHoldTimeHours < 24 ? 'Intraday' : 'Swing',
      icon:     Clock,
      color:    'neutral',
      positive: null,
    },
    {
      label:    'Avg Win',
      value:    `+${fmt$(metrics.averageWin)}`,
      sub:      `Best streak: ${metrics.longestWinStreak}`,
      icon:     Trophy,
      color:    'green',
      positive: true,
    },
    {
      label:    'Avg Loss',
      value:    `-${fmt$(Math.abs(metrics.averageLoss))}`,
      sub:      `Worst streak: ${metrics.longestLossStreak}`,
      icon:     AlertTriangle,
      color:    'red',
      positive: false,
    },
    {
      label:    'Largest Win',         // Part 3 spec
      value:    `+${fmt$(metrics.largestWin)}`,
      sub:      `Expectancy: ${fmt$(metrics.expectancy)}`,
      icon:     TrendingUp,
      color:    'green',
      positive: true,
    },
    {
      label:    'Largest Loss',        // Part 3 spec
      value:    `-${fmt$(Math.abs(metrics.largestLoss))}`,
      sub:      `Fees paid: ${fmt$(metrics.totalFeePaid)}`,
      icon:     TrendingDown,
      color:    'red',
      positive: false,
    },
  ];

  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5 mb-3">
        <DollarSign className="h-4 w-4" style={{ color: CV.gold }} />
        Performance Metrics
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {cards.map((card, i) => (
          <MetricCard key={i} {...card} />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MONTHLY RETURNS — bar + heatmap (Part 3: monthlyReturns array)
// ─────────────────────────────────────────────────────────────────────────────

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function MonthlyReturnsChart({ metrics }: { metrics: ExtendedBacktestMetrics }) {
  const list = metrics.monthlyReturnsList;

  // Build a bar per entry (show last 12)
  const barData = useMemo(() => {
    const last12 = list.slice(-12);
    return last12.map(({ month, return: ret }) => ({
      label: MONTH_LABELS[parseInt(month.split('-')[1], 10) - 1] ?? month,
      value: ret,
    }));
  }, [list]);

  if (barData.length === 0) return null;

  const maxAbs = Math.max(...barData.map(d => Math.abs(d.value)), 1);

  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5 mb-3">
        <BarChart2 className="h-4 w-4" style={{ color: CV.gold }} />
        Monthly Returns
      </h3>

      {/*
       * Part 13 spec:
       *   Positive monthly returns → #00C853 (CV green)
       *   Negative monthly returns → #FF3B30 (CV red)
       */}
      <div className="h-36 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={barData} margin={{ top: 4, right: 0, bottom: 0, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: CV.gray }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: CV.gray }}
              axisLine={false}
              tickLine={false}
              tickFormatter={v => `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`}
            />
            <Tooltip
              contentStyle={{
                background: CV.tooltipBg,
                border: '1px solid rgba(255,215,0,0.15)',
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(v: number) => [
                `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`,
                'Monthly Return',
              ]}
            />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" />
            <Bar dataKey="value" radius={[3, 3, 0, 0]}>
              {barData.map((d, i) => {
                const intensity = Math.min(Math.abs(d.value) / maxAbs, 1);
                /* CV green / CV red with intensity-scaled opacity */
                const fill = d.value >= 0
                  ? `rgba(0,200,83,${0.28 + intensity * 0.72})`      // #00C853
                  : `rgba(255,59,48,${0.28 + intensity * 0.72})`;    // #FF3B30
                return <Cell key={i} fill={fill} />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Heatmap tiles — same CV green / CV red */}
      <div className="grid grid-cols-12 gap-1 mt-2">
        {barData.map((d, i) => {
          const pct = maxAbs > 0 ? d.value / maxAbs : 0;
          const bg  = d.value > 0
            ? `rgba(0,200,83,${0.14 + Math.abs(pct) * 0.58})`       // CV green
            : d.value < 0
            ? `rgba(255,59,48,${0.14 + Math.abs(pct) * 0.58})`      // CV red
            : 'rgba(255,255,255,0.04)';
          return (
            <div
              key={i}
              title={`${d.label}: ${d.value >= 0 ? '+' : ''}${d.value.toFixed(2)}%`}
              className="rounded aspect-square flex items-center justify-center text-[8px] font-bold cursor-default select-none"
              style={{
                background: bg,
                /* text: lighter tint of the same hue */
                color: d.value >= 0 ? '#6ee09a' : '#ff8a82',
              }}
            >
              {d.label.slice(0, 1)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EMPTY / RUNNING STATE
// ─────────────────────────────────────────────────────────────────────────────

function EmptyState({ isRunning }: { isRunning: boolean }) {
  if (isRunning) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
        {/* Gold spinner ring — Part 13 */}
        <div className="relative">
          <div
            className="absolute inset-0 rounded-full blur-2xl animate-pulse"
            style={{ background: 'rgba(255,215,0,0.18)' }}
          />
          <div
            className="relative w-16 h-16 rounded-full flex items-center justify-center"
            style={{
              background: 'rgba(255,215,0,0.08)',
              border: '1px solid rgba(255,215,0,0.28)',
            }}
          >
            <Loader2 className="h-7 w-7 animate-spin" style={{ color: CV.gold }} />
          </div>
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-semibold text-foreground">
            Fetching real data &amp; running simulation…
          </p>
          <p className="text-xs" style={{ color: CV.gray }}>
            Loading CoinGecko OHLCV · Computing indicators · Simulating trades
          </p>
        </div>
        {/* Gold dot bouncer */}
        <div className="flex gap-1.5">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="w-2 h-2 rounded-full animate-bounce"
              style={{ background: CV.gold, opacity: 0.6, animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
      {/* Navy flask icon */}
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: 'rgba(255,215,0,0.06)', border: '1px solid rgba(255,215,0,0.14)' }}
      >
        <FlaskConical className="h-7 w-7" style={{ color: 'rgba(255,215,0,0.40)' }} />
      </div>
      <div className="text-center space-y-1">
        <p className="text-sm font-semibold text-foreground">No results yet</p>
        <p className="text-xs max-w-xs" style={{ color: CV.gray }}>
          Configure your strategy and date range, then click{' '}
          <span style={{ color: CV.gold }}>Run Backtest</span>.
          Real price data is fetched from CoinGecko.
        </p>
      </div>
      <div className="flex items-center gap-2 text-xs" style={{ color: 'rgba(156,163,175,0.55)' }}>
        <span>Configure</span>
        <ChevronRight className="h-3 w-3" />
        <span>Fetch Data</span>
        <ChevronRight className="h-3 w-3" />
        <span>Analyze</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export function BacktestResultsPanel({ enrichedResult, config, isRunning }: Props) {
  const metrics    = enrichedResult?.metrics ?? null;
  const hasResults = metrics !== null && !isRunning;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header — Part 13: navy bar with gold accents */}
      <div
        className="flex items-center justify-between px-5 py-3.5 border-b shrink-0"
        style={{ borderColor: 'rgba(255,215,0,0.08)' }}
      >
        <div className="flex items-center gap-2">
          <BarChart2 className="h-5 w-5" style={{ color: CV.gold }} />
          <h2 className="text-sm font-semibold text-foreground">Results</h2>

          <AnimatePresence>
            {hasResults && (
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-xs font-medium px-2 py-0.5 rounded-full"
                style={{
                  color: CV.green,
                  background: 'rgba(0,200,83,0.10)',
                  border: '1px solid rgba(0,200,83,0.22)',
                }}
              >
                Complete
              </motion.span>
            )}
            {isRunning && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-xs font-medium px-2 py-0.5 rounded-full animate-pulse"
                style={{
                  color: CV.gold,
                  background: 'rgba(255,215,0,0.10)',
                  border: '1px solid rgba(255,215,0,0.22)',
                }}
              >
                Running…
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {/* Data source + symbol info */}
        {hasResults && enrichedResult && (
          <div className="flex items-center gap-2">
            <span
              className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
              style={enrichedResult.data.source === 'coingecko' ? {
                color: CV.green,
                background: 'rgba(0,200,83,0.10)',
                border: '1px solid rgba(0,200,83,0.20)',
              } : {
                color: CV.orange,
                background: 'rgba(255,149,0,0.10)',
                border: '1px solid rgba(255,149,0,0.20)',
              }}
            >
              {enrichedResult.data.source === 'coingecko'
                ? <><Database className="h-3 w-3" /> CoinGecko</>
                : <><Cpu className="h-3 w-3" /> Simulated</>}
            </span>
            <span className="text-xs hidden md:block" style={{ color: CV.gray }}>
              {config.params.symbol} · {config.params.timeframe} · {config.params.startDate} → {config.params.endDate}
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {!hasResults ? (
          <EmptyState isRunning={isRunning} />
        ) : (
          <div className="p-5 space-y-6">

            {/* Equity Curve */}
            <EquityCurveChart metrics={metrics!} initialBalance={config.params.initialBalance} />

            <div className="h-px bg-white/5" />

            {/* Drawdown Curve — Part 3 spec */}
            <DrawdownCurveChart metrics={metrics!} />

            <div className="h-px bg-white/5" />

            {/* Full 12-metric grid */}
            <MetricsGrid metrics={metrics!} initialBalance={config.params.initialBalance} />

            <div className="h-px bg-white/5" />

            {/* Monthly Returns — Part 3 spec array */}
            <MonthlyReturnsChart metrics={metrics!} />

            {/* Session summary */}
            <div className="rounded-xl bg-secondary/20 border border-white/5 p-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-muted-foreground">Strategy</span>
                <p className="text-foreground font-medium mt-0.5 truncate">
                  {config.strategyName || config.strategyType}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Initial Balance</span>
                <p className="text-foreground font-medium mt-0.5">
                  ${config.params.initialBalance.toLocaleString()}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Fee Rate</span>
                <p className="text-foreground font-medium mt-0.5">
                  {(config.params.feeRate * 100).toFixed(2)}%
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Calmar Ratio</span>
                <p className="text-foreground font-medium mt-0.5">
                  {isFinite(metrics!.calmarRatio) ? metrics!.calmarRatio.toFixed(2) : '—'}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Expectancy</span>
                <p className="text-foreground font-medium mt-0.5">
                  {fmt$(metrics!.expectancy)}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Data Source</span>
                <p className={cn('font-medium mt-0.5', enrichedResult!.data.source === 'coingecko' ? 'text-green-400' : 'text-amber-400')}>
                  {enrichedResult!.data.source === 'coingecko' ? 'CoinGecko API' : 'Simulated'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
