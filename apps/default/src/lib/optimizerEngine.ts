/**
 * optimizerEngine.ts — Part 7
 *
 * Grid-search optimizer for strategy parameters.
 *
 * Strategy:
 *   - Uses backtestEngine.ts directly (synchronous, no API) for speed.
 *   - Iterates each value in the sweep range, injects it into strategyConfig,
 *     runs the simulation, extracts metrics, and records an OptimizationPoint.
 *   - Uses generateHistoricalCandles() so results are deterministic and instant.
 *   - Yields control via setTimeout(0) every N steps to keep the UI responsive.
 *   - Calls onProgress(doneSteps, totalSteps, latestPoints) so the UI can
 *     update the table in real-time as results stream in.
 *
 * Limitations (by design — no live data in the optimizer):
 *   - Always uses synthetic candle data (same seed as backtestEngine.ts).
 *   - The optimizer is for relative comparison — "which value is best vs the
 *     rest" — not for absolute backtest accuracy (use the main runner for that).
 */

import {
  generateHistoricalCandles,
  computeMetrics,
  runBacktest as runBacktestSync,
} from './backtestEngine';
import type { BacktestParams } from './backtestTypes';
import type { StrategyType } from './strategyTypes';
import {
  generateSweepValues,
  getParamSpec,
  getObjective,
  validateOptimizationConfig,
  type OptimizationConfig,
  type OptimizationPoint,
  type OptimizationRun,
} from './optimizerTypes';

// ─────────────────────────────────────────────────────────────────────────────
// ID
// ─────────────────────────────────────────────────────────────────────────────

function genId(): string {
  return `opt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// YIELD HELPER (prevents UI freeze)
// ─────────────────────────────────────────────────────────────────────────────

function yieldToUI(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

// ─────────────────────────────────────────────────────────────────────────────
// PERIOD DAYS
// ─────────────────────────────────────────────────────────────────────────────

function periodDaysFromParams(params: BacktestParams): number {
  const startMs = new Date(params.startDate).getTime();
  const endMs   = new Date(params.endDate).getTime();
  return Math.max(1, Math.round((endMs - startMs) / 86_400_000));
}

// ─────────────────────────────────────────────────────────────────────────────
// SINGLE POINT RUN
// ─────────────────────────────────────────────────────────────────────────────

function runPoint(
  params:        BacktestParams,
  strategyType:  StrategyType | 'custom',
  paramKey:      string,
  paramValue:    number,
  objectiveKey:  string,
): OptimizationPoint {
  // Inject the sweep parameter into strategyConfig
  const config: Record<string, unknown> = {
    ...(params.strategyConfig ?? {}),
    [paramKey]: paramValue,
  };

  const patchedParams: BacktestParams = { ...params, strategyConfig: config };

  // Run synchronous simulation (uses seeded synthetic candles)
  const result    = runBacktestSync({ params: patchedParams, strategyType });
  const metrics   = result.metrics;
  const periodDays = periodDaysFromParams(params);

  // Extract objective value
  const objective = getObjective(objectiveKey as any);
  const raw       = (metrics as any)[objective.metricKey] ?? 0;
  const objectiveValue = typeof raw === 'number' && isFinite(raw) ? raw : 0;

  return {
    paramValue,
    sharpeRatio:    metrics.sharpeRatio,
    totalReturn:    metrics.totalReturn,
    winRate:        metrics.winRate,
    profitFactor:   isFinite(metrics.profitFactor) ? metrics.profitFactor : 9.99,
    calmarRatio:    metrics.calmarRatio,
    expectancy:     metrics.expectancy,
    maxDrawdown:    metrics.maxDrawdown,
    totalTrades:    metrics.totalTrades,
    objectiveValue,
    isBest:         false, // resolved after all points
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN OPTIMIZER
// ─────────────────────────────────────────────────────────────────────────────

export interface OptimizerRunOptions {
  params:       BacktestParams;
  strategyType: StrategyType | 'custom';
  config:       OptimizationConfig;
  onProgress:   (run: OptimizationRun) => void;
  signal?:      AbortSignal;
}

/**
 * Runs the full grid-search optimization.
 * Returns the completed OptimizationRun.
 * Calls onProgress after every step so the UI can render live results.
 */
export async function runOptimization(opts: OptimizerRunOptions): Promise<OptimizationRun> {
  const { params, strategyType, config, onProgress, signal } = opts;

  // Validate
  const validErr = validateOptimizationConfig(config);
  if (validErr) {
    const failed: OptimizationRun = {
      id: genId(), status: 'failed',
      config, points: [], bestPoint: null,
      totalSteps: 0, doneSteps: 0,
      startedAt: Date.now(), endedAt: Date.now(),
      error: validErr,
    };
    onProgress(failed);
    return failed;
  }

  const spec   = getParamSpec(config.paramKey)!;
  const values = generateSweepValues(config.paramMin, config.paramMax, config.paramStep, spec.dataType);
  const obj    = getObjective(config.objectiveKey);

  const run: OptimizationRun = {
    id:         genId(),
    status:     'running',
    config,
    points:     [],
    bestPoint:  null,
    totalSteps: values.length,
    doneSteps:  0,
    startedAt:  Date.now(),
    endedAt:    null,
    error:      null,
  };

  onProgress({ ...run });

  // ── Grid search loop ──
  const YIELD_EVERY = 3; // yield to UI every N points

  for (let i = 0; i < values.length; i++) {
    if (signal?.aborted) {
      const aborted: OptimizationRun = { ...run, status: 'failed', endedAt: Date.now(), error: 'Cancelled.' };
      onProgress(aborted);
      return aborted;
    }

    const v = values[i];

    try {
      const point = runPoint(params, strategyType, config.paramKey, v, config.objectiveKey);
      run.points.push(point);
    } catch {
      // If a single point fails (e.g. 0 trades), push a zeroed placeholder
      run.points.push({
        paramValue: v, sharpeRatio: 0, totalReturn: 0, winRate: 0,
        profitFactor: 0, calmarRatio: 0, expectancy: 0,
        maxDrawdown: 0, totalTrades: 0, objectiveValue: 0, isBest: false,
      });
    }

    run.doneSteps = i + 1;

    // Yield every YIELD_EVERY steps
    if ((i + 1) % YIELD_EVERY === 0 || i === values.length - 1) {
      onProgress({ ...run, points: [...run.points] });
      await yieldToUI();
    }
  }

  // ── Find best point ──
  const obj2 = getObjective(config.objectiveKey);
  let bestIdx = 0;
  let bestVal = run.points[0]?.objectiveValue ?? -Infinity;

  for (let i = 1; i < run.points.length; i++) {
    const v = run.points[i].objectiveValue;
    const better = obj2.higher ? v > bestVal : v < bestVal;
    if (better) { bestVal = v; bestIdx = i; }
  }

  run.points = run.points.map((p, i) => ({ ...p, isBest: i === bestIdx }));
  run.bestPoint  = run.points[bestIdx] ?? null;
  run.status     = 'completed';
  run.endedAt    = Date.now();

  onProgress({ ...run });
  return run;
}
