/**
 * optimizerTypes.ts — Part 7
 *
 * Types for the AI-Powered Optimization Mode.
 *
 * Covers:
 *   - OptimizableParam  — a single parameter that can be swept (numeric range)
 *   - PARAM_SPECS       — master catalogue of all parameters per strategy type
 *   - OptimizeObjective — what metric to maximise / minimise
 *   - OptimizationPoint — result of a single parameter combo backtest
 *   - OptimizationRun   — a complete optimization job record
 *   - OptimizationConfig — what the user submits to run
 */

import type { StrategyType } from './strategyTypes';
import type { Timeframe } from './backtestTypes';

// ─────────────────────────────────────────────────────────────────────────────
// PARAMETER SPEC
// ─────────────────────────────────────────────────────────────────────────────

export type ParamDataType = 'integer' | 'float';

/**
 * One sweep-able parameter.
 * Values are stepped from `defaultMin` to `defaultMax` in `defaultStep` increments.
 */
export interface OptimizableParam {
  /** Internal key — maps to strategyConfig[key] in the engine */
  key:          string;
  /** Human-readable label shown in the UI dropdown */
  label:        string;
  /** Longer description shown as a tooltip */
  description:  string;
  /** Numeric type: integer means we round each step */
  dataType:     ParamDataType;
  /** Defaults for the range inputs */
  defaultMin:   number;
  defaultMax:   number;
  defaultStep:  number;
  /** Absolute limits (clamp user input to these) */
  absoluteMin:  number;
  absoluteMax:  number;
  /** Unit label shown in the table column header e.g. "period", "%" */
  unit:         string;
  /** Which strategy types this param applies to */
  strategyTypes: Array<StrategyType | 'custom'>;
}

// ─────────────────────────────────────────────────────────────────────────────
// MASTER PARAMETER CATALOGUE
// ─────────────────────────────────────────────────────────────────────────────

export const PARAM_SPECS: OptimizableParam[] = [
  // ── RSI (custom / all) ───────────────────────────────────────────────────
  {
    key:          'rsiPeriod',
    label:        'RSI Period',
    description:  'Look-back window for the Relative Strength Index. Lower = more sensitive signals.',
    dataType:     'integer',
    defaultMin:   8,
    defaultMax:   30,
    defaultStep:  2,
    absoluteMin:  2,
    absoluteMax:  100,
    unit:         'period',
    strategyTypes: ['custom', 'grid', 'dca', 'martingale', 'arbitrage'],
  },
  {
    key:          'rsiOversold',
    label:        'RSI Oversold Level',
    description:  'RSI threshold to trigger a buy signal. Lower = fewer but higher-conviction buys.',
    dataType:     'integer',
    defaultMin:   20,
    defaultMax:   35,
    defaultStep:  5,
    absoluteMin:  5,
    absoluteMax:  49,
    unit:         'level',
    strategyTypes: ['custom', 'grid', 'dca', 'martingale', 'arbitrage'],
  },
  {
    key:          'rsiOverbought',
    label:        'RSI Overbought Level',
    description:  'RSI threshold to trigger a sell signal. Higher = fewer but higher-conviction sells.',
    dataType:     'integer',
    defaultMin:   60,
    defaultMax:   80,
    defaultStep:  5,
    absoluteMin:  51,
    absoluteMax:  95,
    unit:         'level',
    strategyTypes: ['custom', 'grid', 'dca', 'martingale', 'arbitrage'],
  },
  // ── Grid ─────────────────────────────────────────────────────────────────
  {
    key:          'gridCount',
    label:        'Grid Levels',
    description:  'Number of price levels in the grid. More levels = more trades, smaller profit per trade.',
    dataType:     'integer',
    defaultMin:   5,
    defaultMax:   30,
    defaultStep:  5,
    absoluteMin:  2,
    absoluteMax:  100,
    unit:         'levels',
    strategyTypes: ['grid'],
  },
  {
    key:          'totalInvestment',
    label:        'Total Investment',
    description:  'USD amount allocated across all grid levels.',
    dataType:     'integer',
    defaultMin:   1000,
    defaultMax:   10000,
    defaultStep:  1000,
    absoluteMin:  100,
    absoluteMax:  100000,
    unit:         'USD',
    strategyTypes: ['grid'],
  },
  // ── DCA ──────────────────────────────────────────────────────────────────
  {
    key:          'orderSize',
    label:        'DCA Order Size',
    description:  'USD invested per recurring DCA purchase.',
    dataType:     'integer',
    defaultMin:   50,
    defaultMax:   500,
    defaultStep:  50,
    absoluteMin:  10,
    absoluteMax:  10000,
    unit:         'USD',
    strategyTypes: ['dca'],
  },
  {
    key:          'takeProfitPct',
    label:        'Take Profit %',
    description:  'Percentage gain above average entry at which the strategy sells. 0 = hold.',
    dataType:     'float',
    defaultMin:   1,
    defaultMax:   10,
    defaultStep:  1,
    absoluteMin:  0,
    absoluteMax:  50,
    unit:         '%',
    strategyTypes: ['dca', 'martingale'],
  },
  {
    key:          'dipThresholdPct',
    label:        'Dip Buy Threshold %',
    description:  'Price drop % from last buy that triggers an extra DCA purchase.',
    dataType:     'float',
    defaultMin:   2,
    defaultMax:   15,
    defaultStep:  1,
    absoluteMin:  0.5,
    absoluteMax:  50,
    unit:         '%',
    strategyTypes: ['dca'],
  },
  // ── Martingale ────────────────────────────────────────────────────────────
  {
    key:          'baseOrderSize',
    label:        'Base Order Size',
    description:  'Starting USD amount for the first order in each Martingale cycle.',
    dataType:     'integer',
    defaultMin:   100,
    defaultMax:   1000,
    defaultStep:  100,
    absoluteMin:  10,
    absoluteMax:  10000,
    unit:         'USD',
    strategyTypes: ['martingale'],
  },
  {
    key:          'maxSafetyOrders',
    label:        'Max Safety Orders',
    description:  'Maximum number of additional orders placed if price moves against the position.',
    dataType:     'integer',
    defaultMin:   1,
    defaultMax:   8,
    defaultStep:  1,
    absoluteMin:  0,
    absoluteMax:  20,
    unit:         'orders',
    strategyTypes: ['martingale'],
  },
  {
    key:          'priceDeviation',
    label:        'Safety Order Deviation %',
    description:  'Price deviation % that triggers each safety order.',
    dataType:     'float',
    defaultMin:   1,
    defaultMax:   10,
    defaultStep:  1,
    absoluteMin:  0.1,
    absoluteMax:  30,
    unit:         '%',
    strategyTypes: ['martingale'],
  },
  {
    key:          'volumeMultiplier',
    label:        'Volume Multiplier',
    description:  'How much the order size multiplies with each safety order (e.g. 2 = doubles).',
    dataType:     'float',
    defaultMin:   1.2,
    defaultMax:   3.0,
    defaultStep:  0.2,
    absoluteMin:  1.0,
    absoluteMax:  10.0,
    unit:         '×',
    strategyTypes: ['martingale'],
  },
  // ── Arbitrage ─────────────────────────────────────────────────────────────
  {
    key:          'minSpreadPct',
    label:        'Min Spread %',
    description:  'Minimum spread percentage required to open an arbitrage position.',
    dataType:     'float',
    defaultMin:   0.1,
    defaultMax:   1.0,
    defaultStep:  0.1,
    absoluteMin:  0.01,
    absoluteMax:  10,
    unit:         '%',
    strategyTypes: ['arbitrage'],
  },
  {
    key:          'maxHoldMinutes',
    label:        'Max Hold Time',
    description:  'Maximum minutes to hold an arbitrage position before forced exit.',
    dataType:     'integer',
    defaultMin:   15,
    defaultMax:   240,
    defaultStep:  15,
    absoluteMin:  1,
    absoluteMax:  1440,
    unit:         'min',
    strategyTypes: ['arbitrage'],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// OBJECTIVES
// ─────────────────────────────────────────────────────────────────────────────

export type OptimizeObjectiveKey =
  | 'sharpeRatio'
  | 'totalReturn'
  | 'winRate'
  | 'profitFactor'
  | 'calmarRatio'
  | 'expectancy'
  | 'minDrawdown'   // special: we minimise maxDrawdown
  | 'maxTrades';    // special: we maximise totalTrades

export interface OptimizeObjective {
  key:         OptimizeObjectiveKey;
  label:       string;
  description: string;
  /** true = higher is better, false = lower is better */
  higher:      boolean;
  /** What field to pull from BacktestMetrics */
  metricKey:   string;
  format:      (v: number) => string;
}

export const OPTIMIZE_OBJECTIVES: OptimizeObjective[] = [
  {
    key:       'sharpeRatio',
    label:     'Maximize Sharpe Ratio',
    description: 'Risk-adjusted return. Best overall performance metric.',
    higher:    true,
    metricKey: 'sharpeRatio',
    format:    v => v.toFixed(3),
  },
  {
    key:       'totalReturn',
    label:     'Maximize Total Return',
    description: 'Raw percentage return on the initial balance.',
    higher:    true,
    metricKey: 'totalReturn',
    format:    v => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`,
  },
  {
    key:       'winRate',
    label:     'Maximize Win Rate',
    description: 'Percentage of trades that closed at a profit.',
    higher:    true,
    metricKey: 'winRate',
    format:    v => `${v.toFixed(1)}%`,
  },
  {
    key:       'profitFactor',
    label:     'Maximize Profit Factor',
    description: 'Gross profit divided by gross loss. > 1.5 is solid.',
    higher:    true,
    metricKey: 'profitFactor',
    format:    v => (isFinite(v) ? v.toFixed(2) : '∞'),
  },
  {
    key:       'calmarRatio',
    label:     'Maximize Calmar Ratio',
    description: 'Annualised return divided by max drawdown.',
    higher:    true,
    metricKey: 'calmarRatio',
    format:    v => v.toFixed(2),
  },
  {
    key:       'expectancy',
    label:     'Maximize Expectancy',
    description: 'Average expected $ profit per trade.',
    higher:    true,
    metricKey: 'expectancy',
    format:    v => `$${v.toFixed(2)}`,
  },
  {
    key:       'minDrawdown',
    label:     'Minimize Max Drawdown',
    description: 'Lowest peak-to-trough portfolio loss. Lower is safer.',
    higher:    false,
    metricKey: 'maxDrawdown',
    format:    v => `-${v.toFixed(2)}%`,
  },
  {
    key:       'maxTrades',
    label:     'Maximize Trade Count',
    description: 'Maximizes the number of executed trades (frequency).',
    higher:    true,
    metricKey: 'totalTrades',
    format:    v => v.toFixed(0),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// OPTIMIZATION RESULT
// ─────────────────────────────────────────────────────────────────────────────

/** Result for one point in the parameter sweep */
export interface OptimizationPoint {
  /** The parameter value tested at this point */
  paramValue:  number;
  sharpeRatio: number;
  totalReturn: number;
  winRate:     number;
  profitFactor: number;
  calmarRatio:  number;
  expectancy:   number;
  maxDrawdown:  number;
  totalTrades:  number;
  /** The objective metric value for quick sorting */
  objectiveValue: number;
  /** Whether this point is the best */
  isBest:      boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// OPTIMIZATION CONFIG (user inputs)
// ─────────────────────────────────────────────────────────────────────────────

export interface OptimizationConfig {
  /** Key from PARAM_SPECS */
  paramKey:      string;
  paramMin:      number;
  paramMax:      number;
  paramStep:     number;
  objectiveKey:  OptimizeObjectiveKey;
}

// ─────────────────────────────────────────────────────────────────────────────
// OPTIMIZATION RUN
// ─────────────────────────────────────────────────────────────────────────────

export type OptimizeRunStatus = 'idle' | 'running' | 'completed' | 'failed';

export interface OptimizationRun {
  id:         string;
  status:     OptimizeRunStatus;
  config:     OptimizationConfig;
  points:     OptimizationPoint[];
  bestPoint:  OptimizationPoint | null;
  totalSteps: number;
  doneSteps:  number;
  startedAt:  number | null;
  endedAt:    number | null;
  error:      string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Gets the param spec for a given key, or null */
export function getParamSpec(key: string): OptimizableParam | null {
  return PARAM_SPECS.find(p => p.key === key) ?? null;
}

/** Gets the objective config for a given key */
export function getObjective(key: OptimizeObjectiveKey): OptimizeObjective {
  return OPTIMIZE_OBJECTIVES.find(o => o.key === key) ?? OPTIMIZE_OBJECTIVES[0];
}

/** Generates the array of values to sweep based on min/max/step */
export function generateSweepValues(min: number, max: number, step: number, dataType: ParamDataType): number[] {
  if (step <= 0 || min > max) return [min];
  const values: number[] = [];
  let v = min;
  while (v <= max + 1e-9) {
    values.push(dataType === 'integer' ? Math.round(v) : parseFloat(v.toFixed(6)));
    v += step;
    if (values.length > 200) break; // safety cap
  }
  return [...new Set(values)]; // dedupe (integer rounding)
}

/** Validates an OptimizationConfig. Returns error string or null. */
export function validateOptimizationConfig(cfg: OptimizationConfig): string | null {
  const spec = getParamSpec(cfg.paramKey);
  if (!spec)                       return 'Unknown parameter selected.';
  if (cfg.paramMin >= cfg.paramMax) return 'Min must be less than Max.';
  if (cfg.paramStep <= 0)           return 'Step must be greater than 0.';
  if (cfg.paramMin < spec.absoluteMin) return `Min cannot be below ${spec.absoluteMin}.`;
  if (cfg.paramMax > spec.absoluteMax) return `Max cannot exceed ${spec.absoluteMax}.`;

  const steps = generateSweepValues(cfg.paramMin, cfg.paramMax, cfg.paramStep, spec.dataType).length;
  if (steps < 2)  return 'Range and step produce fewer than 2 values to test.';
  if (steps > 60) return 'Too many steps (max 60). Increase the step size.';

  return null;
}
