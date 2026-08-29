/**
 * api/recommendations.ts
 *
 * AI Recommender Endpoints — Part 12 §11.9
 *
 * GET    /api/recommendations                    - Get personalized recommendations
 * POST   /api/recommendations/:id/click          - Track recommendation click
 * POST   /api/recommendations/:id/dismiss        - Dismiss recommendation
 */

import { registerRoute, requireAuth } from './client';
import type {
  GetRecommendationsRequest,
  GetRecommendationsResponse,
  RecommendationItem,
} from './types';
import { useAIRecommenderStore } from '../lib/aiRecommenderStore';
import type { AIRecommendation } from '../lib/aiRecommenderTypes';

function toItem(r: AIRecommendation): RecommendationItem {
  return {
    id:        r.id,
    type:      r.type,
    targetId:  r.targetId,
    score:     r.score,
    headline:  r.headline,
    reason:    r.reason,
    thumbnail: r.thumbnail,
    tags:      r.tags,
    isViewed:  r.isViewed,
    isClicked: r.isClicked,
    expiresAt: r.expiresAt,
  };
}

// ─── GET /api/recommendations ─────────────────────────────────────────────────

registerRoute<GetRecommendationsRequest, GetRecommendationsResponse>(
  'GET', '/api/recommendations',
  (query, auth) => {
    const a     = requireAuth(auth);
    const store = useAIRecommenderStore.getState();

    // Seed if cold start
    store.seedUser(a.userId);

    const recs = store.getRecommendations(a.userId, {
      types:         (query.types ?? []) as any,
      minScore:      query.minScore ?? 0,
      hideViewed:    false,
      hideDismissed: true,
      sortBy:        'score_desc',
    }, query.limit ?? 30);

    return {
      recommendations: recs.map(toItem),
      total:           recs.length,
      generatedAt:     new Date().toISOString(),
    };
  },
);

// ─── POST /api/recommendations/:id/click ──────────────────────────────────────

registerRoute<Record<string, never>, { ok: boolean }>(
  'POST', '/api/recommendations/:id/click',
  (_body, auth, pathParams) => {
    const a     = requireAuth(auth);
    const store = useAIRecommenderStore.getState();
    store.markClicked(a.userId, pathParams?.['id'] ?? '');
    return { ok: true };
  },
);

// ─── POST /api/recommendations/:id/dismiss ────────────────────────────────────

registerRoute<Record<string, never>, { ok: boolean }>(
  'POST', '/api/recommendations/:id/dismiss',
  (_body, auth, pathParams) => {
    const a     = requireAuth(auth);
    const store = useAIRecommenderStore.getState();
    store.markDismissed(a.userId, pathParams?.['id'] ?? '');
    return { ok: true };
  },
);
