/**
 * api/backtest.ts
 *
 * Backtest Endpoints — Part 12 §11.3
 *
 * POST   /api/backtest/run             - Run new backtest
 * GET    /api/backtest/sessions        - List user's backtest sessions
 * GET    /api/backtest/sessions/:id    - Get backtest result
 * POST   /api/backtest/compare         - Compare multiple strategies
 */

import { registerRoute, requireAuth, ApiErrors } from './client';
import type {
  RunBacktestRequest,
  RunBacktestResponse,
  ListBacktestSessionsResponse,
  BacktestSessionItem,
  GetBacktestSessionResponse,
  CompareStrategiesRequest,
  CompareStrategiesResponse,
  BacktestMetrics,
  BacktestTradeItem,
} from './types';
import { useBacktestStore } from '../lib/backtestStore';
import type { BacktestSession } from '../lib/backtestTypes';

function toSessionItem(s: BacktestSession): BacktestSessionItem {
  return {
    id:          s.id,
    sessionName: s.sessionName,
    symbol:      s.params.symbol,
    timeframe:   s.params.timeframe,
    status:      s.status,
    totalReturn: s.metrics?.totalReturn,
    winRate:     s.metrics?.winRate,
    maxDrawdown: s.metrics?.maxDrawdown,
    sharpeRatio: s.metrics?.sharpeRatio,
    createdAt:   s.createdAt,
    completedAt: s.completedAt ?? undefined,
  };
}

// ─── POST /api/backtest/run ────────────────────────────────────────────────────

registerRoute<RunBacktestRequest, RunBacktestResponse>(
  'POST', '/api/backtest/run',
  (body, auth) => {
    const a    = requireAuth(auth);
    const store = useBacktestStore.getState();

    const result = store.submitBacktest({
      userId:       a.userId,
      params: {
        coinId:         body.coinId,
        symbol:         body.symbol,
        timeframe:      body.timeframe,
        startDate:      body.startDate,
        endDate:        body.endDate,
        initialBalance: body.initialBalance,
        feeRate:        body.feeRate,
        strategyConfig: body.strategyConfig ?? {},
      },
      strategyId:   body.strategyId ?? null,
      strategyType: body.strategyType as any,
      sessionName:  body.sessionName,
    });

    if (!result.ok) {
      throw ApiErrors.validation(result.errors?.join(' ') ?? 'Backtest submission failed.');
    }
    return { sessionId: result.sessionId!, status: 'pending' };
  },
);

// ─── GET /api/backtest/sessions ────────────────────────────────────────────────

registerRoute<Record<string, never>, ListBacktestSessionsResponse>(
  'GET', '/api/backtest/sessions',
  (_body, auth) => {
    const a    = requireAuth(auth);
    const store = useBacktestStore.getState();
    const sessions = store.getUserSessions(a.userId);
    return { sessions: sessions.map(toSessionItem), total: sessions.length };
  },
);

// ─── GET /api/backtest/sessions/:id ───────────────────────────────────────────

registerRoute<Record<string, never>, GetBacktestSessionResponse>(
  'GET', '/api/backtest/sessions/:id',
  (_body, auth, pathParams) => {
    requireAuth(auth);
    const store = useBacktestStore.getState();
    const id    = pathParams?.['id'] ?? '';
    const s     = store.getSession(id);
    if (!s) throw ApiErrors.notFound(`Backtest session '${id}' not found.`);

    const metrics: BacktestMetrics | null = s.metrics ? {
      totalReturn:   s.metrics.totalReturn,
      winRate:       s.metrics.winRate,
      maxDrawdown:   s.metrics.maxDrawdown,
      sharpeRatio:   s.metrics.sharpeRatio,
      totalTrades:   s.metrics.totalTrades,
      winningTrades: s.metrics.winningTrades,
      losingTrades:  s.metrics.losingTrades,
      profitFactor:  s.metrics.profitFactor,
      avgWin:        s.metrics.avgWin,
      avgLoss:       s.metrics.avgLoss,
      finalBalance:  s.metrics.finalBalance,
    } : null;

    const trades: BacktestTradeItem[] = (s.trades ?? []).map(t => ({
      id:        t.id,
      action:    t.action as 'buy' | 'sell',
      price:     t.price,
      amount:    t.amount,
      total:     t.total,
      pnl:       t.pnl ?? undefined,
      pnlPct:    t.pnlPct ?? undefined,
      timestamp: t.timestamp,
    }));

    return {
      session: {
        ...toSessionItem(s),
        metrics,
        trades,
        params: {
          coinId:       s.params.coinId,
          symbol:       s.params.symbol,
          timeframe:    s.params.timeframe,
          startDate:    s.params.startDate,
          endDate:      s.params.endDate,
          strategyType: s.strategyType,
          initialBalance: s.params.initialBalance,
          feeRate:      s.params.feeRate,
          strategyConfig: s.params.strategyConfig,
        },
      },
    };
  },
);

// ─── POST /api/backtest/compare ────────────────────────────────────────────────

registerRoute<CompareStrategiesRequest, CompareStrategiesResponse>(
  'POST', '/api/backtest/compare',
  (body, auth) => {
    requireAuth(auth);
    const store   = useBacktestStore.getState();
    const results: Record<string, BacktestMetrics | null> = {};

    for (const sid of (body.strategyIds ?? [])) {
      const s = Object.values(store.sessions).find(
        sess => sess.strategyId === sid && sess.status === 'completed',
      );
      results[sid] = s?.metrics ? {
        totalReturn:   s.metrics.totalReturn,
        winRate:       s.metrics.winRate,
        maxDrawdown:   s.metrics.maxDrawdown,
        sharpeRatio:   s.metrics.sharpeRatio,
        totalTrades:   s.metrics.totalTrades,
        winningTrades: s.metrics.winningTrades,
        losingTrades:  s.metrics.losingTrades,
        profitFactor:  s.metrics.profitFactor,
        avgWin:        s.metrics.avgWin,
        avgLoss:       s.metrics.avgLoss,
        finalBalance:  s.metrics.finalBalance,
      } : null;
    }

    return { strategyIds: body.strategyIds ?? [], results, generatedAt: new Date().toISOString() };
  },
);
