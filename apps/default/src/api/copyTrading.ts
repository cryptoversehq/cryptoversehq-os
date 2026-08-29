/**
 * api/copyTrading.ts
 *
 * Copy Trading Endpoints — Part 12 §11.4
 *
 * GET    /api/copy/following          - List traders user follows
 * GET    /api/copy/followers          - List user's followers
 * POST   /api/copy/follow/:traderId   - Follow a trader
 * DELETE /api/copy/unfollow/:id       - Unfollow trader
 * PUT    /api/copy/settings/:id       - Update copy settings
 */

import { registerRoute, requireAuth, ApiErrors } from './client';
import type {
  ListFollowingResponse,
  ListFollowersResponse,
  CopyRelationshipItem,
  FollowTraderRequest,
  FollowTraderResponse,
  UpdateCopySettingsRequest,
  UpdateCopySettingsResponse,
} from './types';
import { useCopyTradingStore } from '../lib/copyTradingStore';
import type { CopyTradeRelationship } from '../lib/copyTradingTypes';

function toRelItem(r: CopyTradeRelationship): CopyRelationshipItem {
  const winRate = r.totalCopiedTrades > 0
    ? Math.round((r.winningTrades / r.totalCopiedTrades) * 10_000) / 100
    : 0;
  return {
    id:                r.id,
    traderId:          r.traderId,
    traderName:        r.traderName,
    followerId:        r.followerId,
    copyPercentage:    r.copyPercentage,
    maxAmountPerTrade: r.maxAmountPerTrade,
    status:            r.status,
    totalProfit:       r.totalProfit,
    totalCopiedTrades: r.totalCopiedTrades,
    winRate,
    createdAt:         r.createdAt,
  };
}

// ─── GET /api/copy/following ───────────────────────────────────────────────────

registerRoute<Record<string, never>, ListFollowingResponse>(
  'GET', '/api/copy/following',
  (_body, auth) => {
    const a    = requireAuth(auth);
    const store = useCopyTradingStore.getState();
    return { following: store.getFollowerRelationships(a.userId).map(toRelItem) };
  },
);

// ─── GET /api/copy/followers ───────────────────────────────────────────────────

registerRoute<Record<string, never>, ListFollowersResponse>(
  'GET', '/api/copy/followers',
  (_body, auth) => {
    const a    = requireAuth(auth);
    const store = useCopyTradingStore.getState();
    return { followers: store.getTraderRelationships(a.userId).map(toRelItem) };
  },
);

// ─── POST /api/copy/follow/:traderId ──────────────────────────────────────────

registerRoute<FollowTraderRequest, FollowTraderResponse>(
  'POST', '/api/copy/follow/:traderId',
  (body, auth, pathParams) => {
    const a        = requireAuth(auth);
    const store    = useCopyTradingStore.getState();
    const traderId = pathParams?.['traderId'] ?? '';

    const result = store.followTrader({
      followerId:       a.userId,
      traderId,
      traderName:       traderId,
      traderAvatarSeed: traderId,
      settings:         body as any,
    });

    if (!result.ok) {
      throw ApiErrors.validation(result.errors?.join(' ') ?? 'Follow failed.');
    }
    return { relationshipId: result.relationshipId! };
  },
);

// ─── DELETE /api/copy/unfollow/:id ────────────────────────────────────────────

registerRoute<Record<string, never>, { ok: boolean }>(
  'DELETE', '/api/copy/unfollow/:id',
  (_body, auth, pathParams) => {
    const a    = requireAuth(auth);
    const store = useCopyTradingStore.getState();
    const id   = pathParams?.['id'] ?? '';
    const result = store.stopCopying(id, a.userId);
    if (!result.ok) throw ApiErrors.storeError(result.error ?? 'Unfollow failed.');
    return { ok: true };
  },
);

// ─── PUT /api/copy/settings/:id ────────────────────────────────────────────────

registerRoute<UpdateCopySettingsRequest, UpdateCopySettingsResponse>(
  'PUT', '/api/copy/settings/:id',
  (body, auth, pathParams) => {
    const a    = requireAuth(auth);
    const store = useCopyTradingStore.getState();
    const id   = pathParams?.['id'] ?? '';
    const result = store.updateCopySettings(id, a.userId, body as any);
    if (!result.ok) throw ApiErrors.storeError(result.error ?? 'Settings update failed.');
    return { relationshipId: id };
  },
);
