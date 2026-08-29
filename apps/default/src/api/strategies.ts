/**
 * api/strategies.ts
 *
 * Strategy Marketplace Endpoints — Part 12 §11.1
 *
 * POST   /api/strategies               - Create new strategy
 * GET    /api/strategies               - List strategies (with filters)
 * GET    /api/strategies/:id           - Get strategy details
 * PUT    /api/strategies/:id           - Update strategy
 * DELETE /api/strategies/:id           - Delete strategy
 * POST   /api/strategies/:id/purchase  - Purchase strategy
 * POST   /api/strategies/:id/rate      - Rate strategy
 */

import {
  registerRoute,
  requireAuth,
  ApiErrors,
} from './client';
import type {
  CreateStrategyRequest,
  CreateStrategyResponse,
  ListStrategiesRequest,
  ListStrategiesResponse,
  StrategyListItem,
  GetStrategyResponse,
  UpdateStrategyRequest,
  UpdateStrategyResponse,
  PurchaseStrategyResponse,
  RateStrategyRequest,
  RateStrategyResponse,
} from './types';
import { useStrategyStore } from '../lib/strategyStore';
import { useCpCoinsStore } from '../lib/cpCoinsStore';
import { DEFAULT_STRATEGY_FILTERS } from '../lib/strategyTypes';
import type { Strategy } from '../lib/strategyTypes';

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function toListItem(s: Strategy): StrategyListItem {
  return {
    id:               s.id,
    name:             s.name,
    shortDescription: s.shortDescription,
    type:             s.type,
    price:            s.price,
    isFree:           s.isFree,
    rating:           s.rating,
    ratingCount:      s.ratingCount,
    winRate:          s.winRate,
    maxDrawdown:      s.maxDrawdown,
    sharpeRatio:      s.sharpeRatio,
    totalSales:       s.totalSales,
    creatorName:      s.creatorName,
    tags:             s.tags,
    requiredPlan:     s.requiredPlan,
    requiredLevel:    s.requiredLevel,
    riskLevel:        s.riskLevel,
    createdAt:        s.createdAt,
  };
}

// ─── POST /api/strategies ──────────────────────────────────────────────────────

registerRoute<CreateStrategyRequest, CreateStrategyResponse>(
  'POST', '/api/strategies',
  (body, auth) => {
    const a = requireAuth(auth);
    const store = useStrategyStore.getState();
    const result = store.createStrategy({
      creatorId:        a.userId,
      creatorName:      a.displayName,
      creatorAvatarSeed: a.displayName,
      name:             body.name ?? '',
      description:      body.description ?? '',
      shortDescription: body.shortDescription ?? '',
      type:             body.type ?? 'custom',
      price:            body.price ?? 0,
      tags:             body.tags ?? [],
      requiredLevel:    body.requiredLevel ?? 0,
      requiredPlan:     body.requiredPlan ?? 'any',
      requiresKyc:      body.requiresKyc ?? false,
      code:             body.code ?? '',
      paramDocs:        body.paramDocs ?? '',
    });
    if (!result.ok || !result.strategy) {
      throw ApiErrors.validation('Strategy validation failed.', { _: result.errors ?? [] });
    }
    return { strategyId: result.strategy.id };
  },
);

// ─── GET /api/strategies ───────────────────────────────────────────────────────

registerRoute<ListStrategiesRequest, ListStrategiesResponse>(
  'GET', '/api/strategies',
  (query, _auth) => {
    const store = useStrategyStore.getState();
    const page  = Number(query.page ?? 1);
    const pageSize = Math.min(Number(query.pageSize ?? 20), 100);

    const filters = {
      ...DEFAULT_STRATEGY_FILTERS,
      ...(query.type     ? { types:     [query.type] }          : {}),
      ...(query.minRating !== undefined ? { minRating: query.minRating } : {}),
      ...(query.maxPrice  !== undefined ? { maxPrice:  query.maxPrice }  : {}),
      ...(query.search   ? { search:    query.search }          : {}),
      ...(query.isFree   !== undefined ? { isFree:    query.isFree }    : {}),
      sortBy: (query.sortBy as string | undefined) ?? 'newest',
    };

    const result = store.getMarketplacePage(filters as any, page, pageSize);

    return {
      strategies: result.strategies.map(toListItem),
      total:      result.total,
      page:       result.page,
      pageSize:   result.pageSize,
      hasMore:    result.hasMore,
    };
  },
);

// ─── GET /api/strategies/:id ───────────────────────────────────────────────────

registerRoute<Record<string, never>, GetStrategyResponse>(
  'GET', '/api/strategies/:id',
  (_body, auth, pathParams) => {
    const store    = useStrategyStore.getState();
    const id       = pathParams?.['id'] ?? '';
    const userId   = auth?.userId ?? '';
    const detail   = store.getStrategyDetail(id, userId);
    if (!detail) throw ApiErrors.notFound(`Strategy '${id}' not found.`);

    return {
      strategy: {
        ...toListItem(detail),
        description:        detail.description,
        backtestPeriodDays: detail.backtestPeriodDays,
        totalProfitPct:     detail.totalProfitPct,
        totalTrades:        detail.totalTrades,
        avgTradeDuration:   detail.avgTradeDuration,
        ratingCount:        detail.ratingCount,
        ratings:            detail.ratings.map(r => ({
          id: r.id, userId: r.userId, userName: r.userName,
          rating: r.rating, review: r.review, createdAt: r.createdAt,
        })),
        code:       detail.code,
        paramDocs:  detail.paramDocs,
        updatedAt:  detail.updatedAt,
      },
      userOwns:   store.userOwnsStrategy(id, userId),
      userRating: detail.ratings.find(r => r.userId === userId) ? {
        id:        detail.ratings.find(r => r.userId === userId)!.id,
        userId,
        userName:  auth?.displayName ?? '',
        rating:    detail.ratings.find(r => r.userId === userId)!.rating,
        review:    detail.ratings.find(r => r.userId === userId)!.review,
        createdAt: detail.ratings.find(r => r.userId === userId)!.createdAt,
      } : null,
    };
  },
);

// ─── PUT /api/strategies/:id ───────────────────────────────────────────────────

registerRoute<UpdateStrategyRequest, UpdateStrategyResponse>(
  'PUT', '/api/strategies/:id',
  (body, auth, pathParams) => {
    const a     = requireAuth(auth);
    const store = useStrategyStore.getState();
    const id    = pathParams?.['id'] ?? '';
    const result = store.updateStrategy(id, a.userId, body as any, a.isAdmin);
    if (!result.ok) {
      throw ApiErrors.validation('Update failed.', { _: result.errors ?? [] });
    }
    return { strategyId: id };
  },
);

// ─── DELETE /api/strategies/:id ───────────────────────────────────────────────

registerRoute<Record<string, never>, { ok: boolean }>(
  'DELETE', '/api/strategies/:id',
  (_body, auth, pathParams) => {
    const a     = requireAuth(auth);
    const store = useStrategyStore.getState();
    const id    = pathParams?.['id'] ?? '';
    const result = store.deleteStrategy(id, a.userId, a.isAdmin);
    if (!result.ok) throw ApiErrors.storeError(result.error ?? 'Delete failed.');
    return { ok: true };
  },
);

// ─── POST /api/strategies/:id/purchase ────────────────────────────────────────

registerRoute<Record<string, never>, PurchaseStrategyResponse>(
  'POST', '/api/strategies/:id/purchase',
  (_body, auth, pathParams) => {
    const a     = requireAuth(auth);
    const store = useStrategyStore.getState();
    const cp    = useCpCoinsStore.getState();
    const id    = pathParams?.['id'] ?? '';

    const balance = cp.getBalance(a.userId);
    const result  = store.purchaseStrategy({
      strategyId:      id,
      buyerId:         a.userId,
      buyerName:       a.displayName,
      userCpCoins:     balance,
      userLevel:       a.level,
      userPlan:        a.plan,
      userKycVerified: a.kycVerified,
    });

    if (!result.ok || !result.purchase) {
      const msg = result.error ?? 'Purchase failed.';
      if (msg.includes('CP') || msg.includes('balance')) throw ApiErrors.balance(msg);
      if (msg.includes('plan'))  throw ApiErrors.planRequired(msg);
      if (msg.includes('KYC'))   throw ApiErrors.kycRequired(msg);
      if (msg.includes('level')) throw ApiErrors.levelRequired(msg);
      throw ApiErrors.storeError(msg);
    }

    return {
      purchaseId:  result.purchase.id,
      strategyId:  id,
      price:       result.purchase.price,
      purchasedAt: result.purchase.purchasedAt,
    };
  },
);

// ─── POST /api/strategies/:id/rate ────────────────────────────────────────────

registerRoute<RateStrategyRequest, RateStrategyResponse>(
  'POST', '/api/strategies/:id/rate',
  (body, auth, pathParams) => {
    const a     = requireAuth(auth);
    const store = useStrategyStore.getState();
    const id    = pathParams?.['id'] ?? '';

    const result = store.submitRating({
      strategyId:    id,
      userId:        a.userId,
      userName:      a.displayName,
      userAvatarSeed: a.displayName,
      rating:        body.rating,
      review:        body.review,
    });

    if (!result.ok || !result.rating) {
      throw ApiErrors.validation(result.error ?? 'Rating failed.');
    }

    const all = store.getStrategyRatings(id);
    const avg  = all.length > 0 ? all.reduce((s, r) => s + r.rating, 0) / all.length : 0;

    return { ratingId: result.rating.id, newAverage: Math.round(avg * 100) / 100 };
  },
);
