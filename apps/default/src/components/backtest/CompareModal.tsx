/**
 * CompareModal.tsx — Part 5
 *
 * Spec wireframe implementation:
 *   - Multi-select session list with ☑/☐ checkboxes showing WR + return
 *   - "Compare Selected" button (disabled until ≥ 2 selected)
 *   - Overlay equity curves chart (up to 5 sessions, distinct colours)
 *   - Comparison table: Metric | Strategy 1 | Strategy 2 | … (highlights winner)
 *
 * Data source: BacktestSession list from backtestStore (user's history)
 *   + EnrichedBacktestOutput from the current live run (always first entry)
 */

import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, GitCompare, Check, TrendingUp, TrendingDown, Trophy,
  Activity, BarChart2, ChevronDown, ChevronUp, Loader2,
  AlertCircle,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from 'recharts';
import { cn } from '../../lib/utils';
import { useBacktestStore } from '../../lib/backtestStore';
import { useAuthStore } from '../../lib/authStore';
import type { BacktestSession } from '../../lib/backtestTypes';
import type { EnrichedBacktestOutput } from '../../lib/backtestRunner';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  open:           boolean;
  onClose:        () => void;
  currentResult?: EnrichedBacktestOutput | null;
  currentName?:   string;
}

// Up to 5 distinct palette colours for overlay curves
const CURVE_PALETTE = [
  '#818cf8', // indigo
  '#34d399', // emerald
  '#f59e0b', // amber
  '#f472b6', // pink
  '#38bdf8', // sky
];

// ─────────────────────────────────────────────────────────────────────────────
// COMPARISON METRICS CONFIG
// ─────────────────────────────────────────────────────────────────────────────

interface CompareMetric {
  key:     string;
  label:   string;
  format:  (v: number) => string;
  higher:  boolean; // true = higher is better
}

const COMPARE_METRICS: CompareMetric[] = [
  { key: 'totalReturn',    label: 'Total Return',   format: v => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`, higher: true  },
  { key: 'sharpeRatio',    label: 'Sharpe Ratio',   format: v => v.toFixed(2),                            higher: true  },
  { key: 'maxDrawdown',    label: 'Max Drawdown',   format: v => `-${v.toFixed(2)}%`,                     higher: false },
  { key: 'winRate',        label: 'Win Rate',        format: v => `${v.toFixed(1)}%`,                      higher: true  },
  { key: 'profitFactor',   label: 'Profit Factor',  format: v => isFinite(v) ? v.toFixed(2) : '∞',        higher: true  },
  { key: 'totalTrades',    label: 'Total Trades',   format: v => v.toFixed(0),                             higher: false },
  { key: 'averageWin',     label: 'Avg Win',        format: v => `$${v.toFixed(2)}`,                      higher: true  },
  { key: 'averageLoss',    label: 'Avg Loss',       format: v => `-$${Math.abs(v).toFixed(2)}`,            higher: false },
];

// ─────────────────────────────────────────────────────────────────────────────
// NORMALISE SESSIONS TO COMPARABLE SHAPE
// ─────────────────────────────────────────────────────────────────────────────

interface ComparableSession {
  id:          string;
  name:        string;
  metrics:     Record<string, number>;
  equityCurve: number[];
  symbol:      string;
  timeframe:   string;
  winRate:     number;
  totalReturn: number;
}

function fromSession(s: BacktestSession): ComparableSession | null {
  if (!s.metrics) return null;
  const m = s.metrics;
  return {
    id:          s.id,
    name:        s.sessionName,
    symbol:      s.params.symbol,
    timeframe:   s.params.timeframe,
    winRate:     m.winRate,
    totalReturn: m.totalReturn,
    equityCurve: m.equityCurve,
    metrics: {
      totalReturn:  m.totalReturn,
      sharpeRatio:  m.sharpeRatio,
      maxDrawdown:  m.maxDrawdown,
      winRate:      m.winRate,
      profitFactor: m.profitFactor,
      totalTrades:  m.totalTrades,
      averageWin:   m.averageWin,
      averageLoss:  m.averageLoss,
    },
  };
}

function fromEnriched(result: EnrichedBacktestOutput, name: string): ComparableSession {
  const m = result.metrics;
  return {
    id:          'current',
    name:        name || 'Current Run',
    symbol:      result.data.symbol,
    timeframe:   result.data.timeframe,
    winRate:     m.winRate,
    totalReturn: m.totalReturn,
    equityCurve: m.equityCurve,
    metrics: {
      totalReturn:  m.totalReturn,
      sharpeRatio:  m.sharpeRatio,
      maxDrawdown:  m.maxDrawdown,
      winRate:      m.winRate,
      profitFactor: m.profitFactor,
      totalTrades:  m.totalTrades,
      averageWin:   m.averageWin,
      averageLoss:  m.averageLoss,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// OVERLAY CHART DATA
// ─────────────────────────────────────────────────────────────────────────────

function buildChartData(sessions: ComparableSession[]) {
  const maxLen = Math.max(...sessions.map(s => s.equityCurve.length), 0);
  if (maxLen === 0) return [];

  const N_POINTS = 60;
  const step     = Math.max(1, Math.floor(maxLen / N_POINTS));

  const data: Record<string, unknown>[] = [];
  for (let i = 0; i < maxLen; i += step) {
    const point: Record<string, unknown> = { i };
    for (const s of sessions) {
      const idx = Math.min(i, s.equityCurve.length - 1);
      const start = s.equityCurve[0] || 1;
      const val   = s.equityCurve[idx];
      // Normalise to % return from start (all curves start at 0)
      point[s.id] = parseFloat(((val / start - 1) * 100).toFixed(2));
    }
    data.push(point);
  }
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// SESSION CHECK ROW
// ─────────────────────────────────────────────────────────────────────────────

function SessionCheckRow({
  session, selected, onToggle, color,
}: {
  session:  ComparableSession;
  selected: boolean;
  onToggle: () => void;
  color:    string;
}) {
  const isPos = session.totalReturn >= 0;
  return (
    <button
      onClick={onToggle}
      className={cn(
        'w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border text-left transition-all',
        selected
          ? 'bg-primary/5 border-primary/20'
          : 'bg-secondary/10 border-white/8 hover:border-white/15 hover:bg-secondary/20',
      )}
    >
      {/* Checkbox */}
      <div className={cn(
        'w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all',
        selected ? 'bg-primary border-primary' : 'border-white/20',
      )}>
        {selected && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
      </div>

      {/* Colour dot */}
      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{session.name}</p>
        <p className="text-[10px] text-muted-foreground">
          {session.symbol} · {session.timeframe}
        </p>
      </div>

      {/* Quick stats */}
      <div className="text-right shrink-0">
        <p className={cn('text-sm font-bold tabular-nums', isPos ? 'text-green-400' : 'text-red-400')}>
          {isPos ? '+' : ''}{session.totalReturn.toFixed(1)}%
        </p>
        <p className="text-[10px] text-muted-foreground">{session.winRate.toFixed(0)}% WR</p>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPARISON TABLE
// ─────────────────────────────────────────────────────────────────────────────

function ComparisonTable({
  sessions, colors,
}: {
  sessions: ComparableSession[];
  colors:   string[];
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/8">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/8 bg-secondary/20">
            <th className="text-left px-3 py-2.5 text-muted-foreground font-medium">Metric</th>
            {sessions.map((s, i) => (
              <th key={s.id} className="px-3 py-2.5 text-left font-semibold" style={{ color: colors[i] }}>
                <span className="truncate block max-w-[110px]" title={s.name}>{s.name}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {COMPARE_METRICS.map((metric, ri) => {
            const values = sessions.map(s => s.metrics[metric.key] ?? 0);
            const bestVal = metric.higher
              ? Math.max(...values)
              : Math.min(...values);

            return (
              <tr key={metric.key} className={cn('border-b border-white/5', ri % 2 === 0 ? 'bg-background/20' : '')}>
                <td className="px-3 py-2.5 text-muted-foreground font-medium whitespace-nowrap">
                  {metric.label}
                </td>
                {sessions.map((s, i) => {
                  const val     = s.metrics[metric.key] ?? 0;
                  const isBest  = sessions.length > 1 && val === bestVal;
                  return (
                    <td key={s.id} className="px-3 py-2.5 font-semibold tabular-nums">
                      <span className={cn(
                        'inline-flex items-center gap-1',
                        isBest ? 'text-foreground' : 'text-muted-foreground/80',
                      )}>
                        {isBest && <Trophy className="h-3 w-3 text-amber-400" />}
                        {metric.format(val)}
                      </span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export function CompareModal({ open, onClose, currentResult, currentName }: Props) {
  const { user }         = useAuthStore();
  const { getUserSessions } = useBacktestStore();

  const [selectedIds,    setSelectedIds]    = useState<Set<string>>(new Set(['current']));
  const [compared,       setCompared]       = useState<ComparableSession[]>([]);
  const [hasCompared,    setHasCompared]    = useState(false);

  // Build the full session list
  const allSessions = useMemo<ComparableSession[]>(() => {
    const list: ComparableSession[] = [];

    // Current live run first
    if (currentResult) {
      list.push(fromEnriched(currentResult, currentName || 'Current Run'));
    }

    // Historical sessions
    if (user?.id) {
      const sessions = getUserSessions(user.id, {
        search: '', statuses: ['completed'], strategyTypes: [],
        symbols: [], timeframes: [], sortBy: 'newest',
      });
      for (const s of sessions) {
        const comp = fromSession(s);
        if (comp) list.push(comp);
      }
    }

    return list;
  }, [currentResult, currentName, user?.id, getUserSessions]);

  const toggleSession = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 5) next.add(id);
      return next;
    });
    setHasCompared(false);
  }, []);

  const handleCompare = useCallback(() => {
    const selected = allSessions.filter(s => selectedIds.has(s.id));
    setCompared(selected);
    setHasCompared(true);
  }, [allSessions, selectedIds]);

  const selectedCount = selectedIds.size;
  const canCompare    = selectedCount >= 2;

  // Assign consistent colors by index in allSessions
  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    allSessions.forEach((s, i) => map.set(s.id, CURVE_PALETTE[i % CURVE_PALETTE.length]));
    return map;
  }, [allSessions]);

  const chartData     = useMemo(() => buildChartData(compared), [compared]);
  const comparedColors = compared.map(s => colorMap.get(s.id) ?? CURVE_PALETTE[0]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ type: 'spring', damping: 24, stiffness: 300 }}
        className="relative z-10 w-full max-w-4xl bg-card border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 shrink-0 bg-gradient-to-r from-primary/5 to-transparent">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <GitCompare className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Compare Strategies</h2>
              <p className="text-xs text-muted-foreground">
                Select {selectedCount}/5 · Min 2 required
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 grid grid-cols-1 lg:grid-cols-5 gap-6">

            {/* LEFT — selection list */}
            <div className="lg:col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Select strategies to compare</h3>
                {selectedCount > 0 && (
                  <span className="text-xs text-muted-foreground">{selectedCount} selected</span>
                )}
              </div>

              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {allSessions.length === 0 ? (
                  <div className="text-center py-8 text-xs text-muted-foreground/60">
                    <Activity className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    No completed sessions yet.
                    <br />Run a backtest first.
                  </div>
                ) : (
                  allSessions.map(session => (
                    <SessionCheckRow
                      key={session.id}
                      session={session}
                      selected={selectedIds.has(session.id)}
                      onToggle={() => toggleSession(session.id)}
                      color={colorMap.get(session.id) ?? '#818cf8'}
                    />
                  ))
                )}
              </div>

              <button
                onClick={handleCompare}
                disabled={!canCompare}
                className={cn(
                  'w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all',
                  canCompare
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20'
                    : 'bg-secondary/30 text-muted-foreground/50 cursor-not-allowed',
                )}
              >
                <GitCompare className="h-4 w-4" />
                Compare Selected
                {!canCompare && <span className="text-[10px] opacity-70">(select ≥ 2)</span>}
              </button>
            </div>

            {/* RIGHT — results */}
            <div className="lg:col-span-3 space-y-5">
              {!hasCompared ? (
                <div className="flex flex-col items-center justify-center h-full min-h-64 gap-3 text-center opacity-50">
                  <GitCompare className="h-10 w-10 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Select strategies on the left and click Compare Selected
                  </p>
                </div>
              ) : compared.length < 2 ? (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  Please select at least 2 strategies to compare.
                </div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-5"
                >
                  {/* Overlay equity chart */}
                  <div>
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5 mb-3">
                      <Activity className="h-4 w-4 text-primary" />
                      Comparison Chart
                      <span className="text-xs text-muted-foreground font-normal ml-1">
                        (% return from start, normalised)
                      </span>
                    </h3>
                    <div className="h-52 w-full bg-background/30 rounded-xl border border-white/5 p-3">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                          <XAxis dataKey="i" hide />
                          <YAxis
                            tickFormatter={v => `${v >= 0 ? '+' : ''}${v}%`}
                            tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }}
                            width={48}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip
                            contentStyle={{ background: 'rgba(12,12,22,0.96)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                            formatter={(val: number, name: string) => {
                              const s = compared.find(s => s.id === name);
                              return [`${val >= 0 ? '+' : ''}${val.toFixed(2)}%`, s?.name ?? name];
                            }}
                            labelFormatter={() => ''}
                          />
                          <Legend
                            formatter={(value) => {
                              const s = compared.find(s => s.id === value);
                              return <span style={{ color: colorMap.get(value), fontSize: 11 }}>{s?.name ?? value}</span>;
                            }}
                          />
                          {compared.map((s, i) => (
                            <Line
                              key={s.id}
                              type="monotone"
                              dataKey={s.id}
                              stroke={comparedColors[i]}
                              strokeWidth={2}
                              dot={false}
                              activeDot={{ r: 4, strokeWidth: 0 }}
                            />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Comparison table */}
                  <div>
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5 mb-3">
                      <BarChart2 className="h-4 w-4 text-primary" />
                      Comparison Table
                      <span className="text-xs text-muted-foreground font-normal ml-1 flex items-center gap-1">
                        <Trophy className="h-3 w-3 text-amber-400" /> = winner
                      </span>
                    </h3>
                    <ComparisonTable sessions={compared} colors={comparedColors} />
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
