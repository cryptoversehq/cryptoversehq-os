/**
 * OptimizePage.tsx — Part 7: AI-Powered Optimization Mode
 *
 * Implements the spec wireframe exactly:
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  Parameter to optimize: [RSI Period ▼]                     │
 *   │  Range: Min [10] to Max [30]  Step [2]                     │
 *   │  Objective: [Maximize Sharpe Ratio ▼]                      │
 *   │  [Run Optimization]                                        │
 *   │                                                             │
 *   │  Results table (streaming in real-time)                    │
 *   │  Bar chart showing objective value per parameter value     │
 *   │  Best parameter callout + [Apply Best] button              │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * Props:
 *   config — current BacktestConfig from BacktestPage (provides params)
 *   onApplyBest — called with updated strategyConfig when user clicks Apply Best
 */

import React, { useState, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Play, Square, ChevronDown, Trophy, Zap,
  TrendingUp, TrendingDown, Info, CheckCircle2, Loader2,
  AlertCircle, BarChart2, Target, ArrowRight, RefreshCw,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, CartesianGrid, ReferenceLine,
} from 'recharts';
import { cn } from '../../lib/utils';
import { runOptimization } from '../../lib/optimizerEngine';
import {
  PARAM_SPECS,
  OPTIMIZE_OBJECTIVES,
  getParamSpec,
  getObjective,
  validateOptimizationConfig,
  type OptimizationConfig,
  type OptimizationRun,
  type OptimizationPoint,
} from '../../lib/optimizerTypes';
import type { BacktestConfig } from './BacktestConfigPanel';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  config:       BacktestConfig;
  onApplyBest:  (strategyConfigPatch: Record<string, unknown>) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// SMALL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">
    {children}
  </label>
);

const NumInput = ({
  value, onChange, min, max, step, disabled,
}: {
  value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number; disabled?: boolean;
}) => (
  <input
    type="number"
    value={value}
    onChange={e => onChange(parseFloat(e.target.value) || 0)}
    min={min} max={max} step={step}
    disabled={disabled}
    className="w-full bg-secondary/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 disabled:opacity-50 tabular-nums transition-all text-center"
  />
);

const Select = ({
  value, onChange, children, disabled,
}: {
  value: string; onChange: (v: string) => void;
  children: React.ReactNode; disabled?: boolean;
}) => (
  <div className="relative">
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      className="w-full appearance-none bg-secondary/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 disabled:opacity-50 transition-all pr-9 cursor-pointer"
    >
      {children}
    </select>
    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// METRIC FORMAT HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function fmt(key: string, v: number): string {
  switch (key) {
    case 'totalReturn': return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
    case 'winRate':     return `${v.toFixed(1)}%`;
    case 'maxDrawdown': return `-${v.toFixed(2)}%`;
    case 'profitFactor':return isFinite(v) ? v.toFixed(2) : '∞';
    case 'expectancy':  return `$${v.toFixed(2)}`;
    case 'totalTrades': return v.toFixed(0);
    default:            return v.toFixed(3);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PROGRESS BAR
// ─────────────────────────────────────────────────────────────────────────────

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>Testing {done}/{total} combinations…</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 bg-secondary/40 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-primary to-primary/60 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', damping: 30, stiffness: 200 }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RESULTS TABLE
// ─────────────────────────────────────────────────────────────────────────────

function ResultsTable({
  points, paramLabel, paramUnit, objectiveKey,
}: {
  points:       OptimizationPoint[];
  paramLabel:   string;
  paramUnit:    string;
  objectiveKey: string;
}) {
  if (points.length === 0) return null;
  const obj = getObjective(objectiveKey as any);

  const COLS: Array<{ key: keyof OptimizationPoint; label: string }> = [
    { key: 'paramValue',   label: `${paramLabel} (${paramUnit})` },
    { key: 'sharpeRatio',  label: 'Sharpe' },
    { key: 'totalReturn',  label: 'Return' },
    { key: 'winRate',      label: 'Win Rate' },
    { key: 'maxDrawdown',  label: 'Max DD' },
    { key: 'totalTrades',  label: 'Trades' },
  ];

  return (
    <div className="overflow-x-auto rounded-xl border border-white/8">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/8 bg-secondary/20">
            {COLS.map(col => (
              <th
                key={col.key}
                className={cn(
                  'px-3 py-2.5 text-left font-semibold whitespace-nowrap',
                  col.key === 'paramValue' ? 'text-muted-foreground' : 'text-muted-foreground/70',
                  // Highlight the objective column
                  (obj.metricKey === col.key) && 'text-primary',
                )}
              >
                {col.label}
                {obj.metricKey === col.key && ' ★'}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <AnimatePresence initial={false}>
            {points.map((pt, i) => (
              <motion.tr
                key={pt.paramValue}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.02, 0.3) }}
                className={cn(
                  'border-b border-white/5 transition-colors',
                  pt.isBest
                    ? 'bg-amber-500/8 border-b-amber-500/20'
                    : i % 2 === 0 ? 'bg-background/10' : '',
                )}
              >
                {/* Param value */}
                <td className="px-3 py-2.5 font-bold tabular-nums">
                  <div className="flex items-center gap-1.5">
                    {pt.isBest && <Trophy className="h-3 w-3 text-amber-400 shrink-0" />}
                    <span className={pt.isBest ? 'text-amber-300' : 'text-foreground'}>
                      {pt.paramValue}
                    </span>
                  </div>
                </td>
                {/* Sharpe */}
                <td className={cn('px-3 py-2.5 tabular-nums font-medium', obj.metricKey === 'sharpeRatio' && 'text-primary')}>
                  {pt.sharpeRatio.toFixed(2)}
                </td>
                {/* Return */}
                <td className={cn(
                  'px-3 py-2.5 tabular-nums font-medium',
                  obj.metricKey === 'totalReturn' && 'text-primary',
                  pt.totalReturn >= 0 ? 'text-green-400' : 'text-red-400',
                )}>
                  {fmt('totalReturn', pt.totalReturn)}
                </td>
                {/* Win Rate */}
                <td className={cn('px-3 py-2.5 tabular-nums', obj.metricKey === 'winRate' && 'text-primary')}>
                  {fmt('winRate', pt.winRate)}
                </td>
                {/* Max DD */}
                <td className={cn('px-3 py-2.5 tabular-nums text-red-400/80', obj.metricKey === 'maxDrawdown' && 'text-red-400')}>
                  {fmt('maxDrawdown', pt.maxDrawdown)}
                </td>
                {/* Trades */}
                <td className="px-3 py-2.5 tabular-nums text-muted-foreground/80">
                  {pt.totalTrades}
                </td>
              </motion.tr>
            ))}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BAR CHART
// ─────────────────────────────────────────────────────────────────────────────

const CustomBarTooltip = ({ active, payload, label, objLabel }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card/95 border border-white/10 rounded-xl px-3 py-2 text-xs shadow-xl">
      <p className="text-muted-foreground mb-1">Value: <strong className="text-foreground">{label}</strong></p>
      <p className="text-primary">{objLabel}: <strong>{typeof payload[0].value === 'number' ? payload[0].value.toFixed(3) : payload[0].value}</strong></p>
    </div>
  );
};

function ObjectiveChart({
  points, objectiveKey, paramLabel,
}: {
  points:       OptimizationPoint[];
  objectiveKey: string;
  paramLabel:   string;
}) {
  if (points.length === 0) return null;
  const obj      = getObjective(objectiveKey as any);
  const chartData = points.map(p => ({
    value:    p.paramValue,
    score:    parseFloat(p.objectiveValue.toFixed(4)),
    isBest:   p.isBest,
  }));

  const scores    = chartData.map(d => d.score);
  const minScore  = Math.min(...scores);
  const maxScore  = Math.max(...scores);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <BarChart2 className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Objective Chart</h3>
        <span className="text-xs text-muted-foreground ml-1">
          — {obj.label} per {paramLabel} value
        </span>
      </div>
      <div className="h-48 w-full bg-background/20 rounded-xl border border-white/5 p-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis
              dataKey="value"
              tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[
                minScore - Math.abs(minScore) * 0.1,
                maxScore + Math.abs(maxScore) * 0.1,
              ]}
              tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }}
              axisLine={false}
              tickLine={false}
              width={40}
              tickFormatter={v => typeof v === 'number' ? v.toFixed(2) : v}
            />
            <Tooltip
              content={<CustomBarTooltip objLabel={obj.label} />}
              cursor={{ fill: 'rgba(255,255,255,0.03)' }}
            />
            <Bar dataKey="score" radius={[3, 3, 0, 0]}>
              {chartData.map((d, i) => (
                <Cell
                  key={i}
                  fill={d.isBest ? '#f59e0b' : 'url(#optGradient)'}
                  opacity={d.isBest ? 1 : 0.75}
                />
              ))}
            </Bar>
            <defs>
              <linearGradient id="optGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#818cf8" stopOpacity={0.9} />
                <stop offset="100%" stopColor="#818cf8" stopOpacity={0.4} />
              </linearGradient>
            </defs>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BEST PARAMETER CALLOUT
// ─────────────────────────────────────────────────────────────────────────────

function BestCallout({
  best, paramLabel, paramUnit, objectiveKey, onApply,
}: {
  best:         OptimizationPoint;
  paramLabel:   string;
  paramUnit:    string;
  objectiveKey: string;
  onApply:      () => void;
}) {
  const obj = getObjective(objectiveKey as any);
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center justify-between gap-4 p-4 rounded-2xl border border-amber-500/25 bg-gradient-to-r from-amber-500/8 to-transparent"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center shrink-0">
          <Trophy className="h-5 w-5 text-amber-400" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Best parameter found</p>
          <p className="text-base font-bold text-amber-300">
            {paramLabel} = {best.paramValue} {paramUnit}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {obj.label.replace('Maximize ', '').replace('Minimize ', '')}: {' '}
            <span className="font-semibold text-foreground">{obj.format(best.objectiveValue)}</span>
            {' '}·{' '}
            Return: {' '}
            <span className={cn('font-semibold', best.totalReturn >= 0 ? 'text-green-400' : 'text-red-400')}>
              {best.totalReturn >= 0 ? '+' : ''}{best.totalReturn.toFixed(2)}%
            </span>
            {' '}·{' '}
            Win Rate: <span className="font-semibold text-foreground">{best.winRate.toFixed(1)}%</span>
          </p>
        </div>
      </div>
      <button
        onClick={onApply}
        className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25 transition-all"
      >
        <Zap className="h-4 w-4" />
        Apply Best
      </button>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────

export function OptimizePage({ config, onApplyBest }: Props) {
  // Filter params by current strategy type
  const availableParams = useMemo(() =>
    PARAM_SPECS.filter(p => p.strategyTypes.includes(config.strategyType)),
  [config.strategyType]);

  // ── Form state ──
  const defaultParam = availableParams[0];

  const [paramKey,      setParamKey]      = useState(defaultParam?.key ?? 'rsiPeriod');
  const [objectiveKey,  setObjectiveKey]  = useState<string>('sharpeRatio');
  const [paramMin,      setParamMin]      = useState(defaultParam?.defaultMin ?? 8);
  const [paramMax,      setParamMax]      = useState(defaultParam?.defaultMax ?? 30);
  const [paramStep,     setParamStep]     = useState(defaultParam?.defaultStep ?? 2);

  const currentSpec = useMemo(() => getParamSpec(paramKey) ?? defaultParam, [paramKey, defaultParam]);

  // When param changes, update defaults
  const handleParamChange = useCallback((key: string) => {
    setParamKey(key);
    const spec = getParamSpec(key);
    if (spec) {
      setParamMin(spec.defaultMin);
      setParamMax(spec.defaultMax);
      setParamStep(spec.defaultStep);
    }
  }, []);

  // ── Run state ──
  const [run,          setRun]          = useState<OptimizationRun | null>(null);
  const [validError,   setValidError]   = useState<string | null>(null);
  const [isRunning,    setIsRunning]    = useState(false);
  const [appliedBest,  setAppliedBest]  = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const handleRun = useCallback(async () => {
    const optConfig: OptimizationConfig = {
      paramKey,
      paramMin,
      paramMax,
      paramStep,
      objectiveKey: objectiveKey as any,
    };

    const err = validateOptimizationConfig(optConfig);
    if (err) { setValidError(err); return; }
    setValidError(null);

    // Cancel previous
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setIsRunning(true);
    setAppliedBest(false);
    setRun(null);

    try {
      await runOptimization({
        params:       config.params,
        strategyType: config.strategyType,
        config:       optConfig,
        onProgress:   (r) => setRun({ ...r }),
        signal:       abortRef.current.signal,
      });
    } finally {
      setIsRunning(false);
    }
  }, [paramKey, paramMin, paramMax, paramStep, objectiveKey, config]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setIsRunning(false);
  }, []);

  const handleApplyBest = useCallback(() => {
    if (!run?.bestPoint) return;
    onApplyBest({ [paramKey]: run.bestPoint.paramValue });
    setAppliedBest(true);
  }, [run, paramKey, onApplyBest]);

  const stepCount = useMemo(() => {
    if (!currentSpec) return 0;
    const vals = [];
    let v = paramMin;
    while (v <= paramMax + 1e-9 && vals.length <= 200) { vals.push(v); v += paramStep; }
    return Math.min(vals.length, 200);
  }, [paramMin, paramMax, paramStep, currentSpec]);

  const durationSec = run?.startedAt && run?.endedAt
    ? ((run.endedAt - run.startedAt) / 1000).toFixed(1)
    : null;

  return (
    <div className="h-full flex overflow-hidden">

      {/* ── LEFT PANEL — config ── */}
      <div className="w-72 shrink-0 border-r border-white/5 bg-card/30 flex flex-col overflow-y-auto">
        {/* Header */}
        <div className="px-5 py-5 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Optimize Strategy</h2>
              <p className="text-[10px] text-muted-foreground">
                Grid-search · {config.strategyType}
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 p-5 space-y-5">
          {/* Active strategy context */}
          <div className="p-3 rounded-xl bg-primary/5 border border-primary/15 text-xs flex items-center gap-2">
            <Target className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="text-muted-foreground">
              Testing on <strong className="text-foreground">{config.params.symbol}</strong>
              {' '}·{' '}<strong className="text-foreground">{config.params.timeframe}</strong>
            </span>
          </div>

          {/* Parameter to optimize */}
          <div>
            <FieldLabel>Parameter to Optimize</FieldLabel>
            <Select
              value={paramKey}
              onChange={handleParamChange}
              disabled={isRunning}
            >
              {availableParams.map(p => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </Select>
            {currentSpec && (
              <p className="text-[10px] text-muted-foreground/70 mt-1.5 leading-relaxed">
                {currentSpec.description}
              </p>
            )}
          </div>

          {/* Range */}
          <div>
            <FieldLabel>Range</FieldLabel>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <p className="text-[10px] text-muted-foreground mb-1">Min</p>
                <NumInput
                  value={paramMin}
                  onChange={setParamMin}
                  min={currentSpec?.absoluteMin}
                  max={paramMax - (currentSpec?.defaultStep ?? 1)}
                  step={currentSpec?.defaultStep}
                  disabled={isRunning}
                />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground mb-1">Max</p>
                <NumInput
                  value={paramMax}
                  onChange={setParamMax}
                  min={paramMin + (currentSpec?.defaultStep ?? 1)}
                  max={currentSpec?.absoluteMax}
                  step={currentSpec?.defaultStep}
                  disabled={isRunning}
                />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground mb-1">Step</p>
                <NumInput
                  value={paramStep}
                  onChange={setParamStep}
                  min={currentSpec?.dataType === 'integer' ? 1 : 0.1}
                  step={currentSpec?.dataType === 'integer' ? 1 : 0.1}
                  disabled={isRunning}
                />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground/60 mt-1.5 flex items-center gap-1">
              <Info className="h-3 w-3" />
              {stepCount} combinations to test
              {stepCount > 40 && <span className="text-amber-400 ml-1">(may take a few seconds)</span>}
            </p>
          </div>

          {/* Objective */}
          <div>
            <FieldLabel>Objective</FieldLabel>
            <Select value={objectiveKey} onChange={setObjectiveKey} disabled={isRunning}>
              {OPTIMIZE_OBJECTIVES.map(o => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </Select>
            <p className="text-[10px] text-muted-foreground/70 mt-1.5 leading-relaxed">
              {getObjective(objectiveKey as any)?.description}
            </p>
          </div>

          {/* Validation error */}
          <AnimatePresence>
            {validError && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400"
              >
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                {validError}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Run / Stop button */}
          <div className="space-y-2">
            <button
              onClick={isRunning ? handleStop : handleRun}
              className={cn(
                'w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all',
                isRunning
                  ? 'bg-red-500/15 border border-red-500/25 text-red-400 hover:bg-red-500/25'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/25',
              )}
            >
              {isRunning ? (
                <><Square className="h-4 w-4" /> Stop</>
              ) : (
                <><Sparkles className="h-4 w-4" /> Run Optimization</>
              )}
            </button>

            {run?.status === 'completed' && !isRunning && (
              <button
                onClick={handleRun}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground bg-secondary/30 hover:bg-secondary/50 transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Re-run
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL — results ── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 min-w-0">

        {/* Empty / Idle state */}
        {!run && !isRunning && (
          <div className="flex flex-col items-center justify-center h-full min-h-64 gap-4 text-center opacity-50">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Sparkles className="h-7 w-7 text-primary" />
            </div>
            <div>
              <p className="text-base font-semibold text-foreground">Ready to Optimize</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                Configure a parameter range on the left and click Run Optimization to find the best value.
              </p>
            </div>
          </div>
        )}

        {/* Progress bar (running) */}
        {isRunning && run && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-4 rounded-xl border border-white/8 bg-secondary/10"
          >
            <div className="flex items-center gap-2 mb-3">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-sm font-medium text-foreground">Running optimization…</span>
            </div>
            <ProgressBar done={run.doneSteps} total={run.totalSteps} />
          </motion.div>
        )}

        {/* Results header */}
        {run && run.points.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-6"
          >
            {/* Summary strip */}
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-sm font-bold text-foreground">Results</h2>
              <span className="text-xs text-muted-foreground bg-secondary/40 px-2 py-1 rounded-full">
                {run.points.length} combinations
              </span>
              {durationSec && (
                <span className="text-xs text-muted-foreground bg-secondary/40 px-2 py-1 rounded-full">
                  {durationSec}s
                </span>
              )}
              {run.status === 'completed' && (
                <span className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-1 rounded-full flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Complete
                </span>
              )}
            </div>

            {/* Results table */}
            <ResultsTable
              points={run.points}
              paramLabel={currentSpec?.label ?? paramKey}
              paramUnit={currentSpec?.unit ?? ''}
              objectiveKey={objectiveKey}
            />

            {/* Objective bar chart */}
            {run.points.length > 1 && (
              <ObjectiveChart
                points={run.points}
                objectiveKey={objectiveKey}
                paramLabel={currentSpec?.label ?? paramKey}
              />
            )}

            {/* Best parameter callout (only when complete) */}
            {run.status === 'completed' && run.bestPoint && (
              <div className="space-y-2">
                <BestCallout
                  best={run.bestPoint}
                  paramLabel={currentSpec?.label ?? paramKey}
                  paramUnit={currentSpec?.unit ?? ''}
                  objectiveKey={objectiveKey}
                  onApply={handleApplyBest}
                />
                <AnimatePresence>
                  {appliedBest && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2 p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-xs text-green-400"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      Best parameter applied to your strategy config. Switch to the Backtest tab and run to verify.
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Error state */}
            {run.status === 'failed' && run.error && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                {run.error}
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
