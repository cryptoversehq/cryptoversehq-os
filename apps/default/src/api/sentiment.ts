/**
 * api/sentiment.ts
 *
 * Sentiment Analysis Endpoints — Part 12 §11.6
 *
 * GET    /api/sentiment/current/:symbol      - Current sentiment
 * GET    /api/sentiment/historical/:symbol   - Historical sentiment
 * POST   /api/sentiment/alerts               - Create sentiment alert
 */

import { registerRoute, requireAuth, ApiErrors } from './client';
import type {
  SentimentSnapshotItem,
  GetCurrentSentimentResponse,
  GetHistoricalSentimentRequest,
  GetHistoricalSentimentResponse,
  CreateSentimentAlertRequest,
  CreateSentimentAlertResponse,
} from './types';
import { useSentimentStore } from '../lib/sentimentStore';
import type { SentimentSnapshot } from '../lib/sentimentTypes';

function toSnapshotItem(s: SentimentSnapshot): SentimentSnapshotItem {
  return {
    id:              s.id,
    symbol:          s.symbol,
    fearGreedIndex:  s.fearGreedIndex,
    fearGreedZone:   s.fearGreedZone,
    bullishPct:      s.bullishPct,
    bearishPct:      s.bearishPct,
    neutralPct:      s.neutralPct,
    socialVolume:    s.socialVolume,
    twitterMentions: s.twitterMentions,
    redditMentions:  s.redditMentions,
    newsSentiment:   s.newsSentiment,
    timestamp:       s.timestamp,
  };
}

// ─── GET /api/sentiment/current/:symbol ──────────────────────────────────────

registerRoute<Record<string, never>, GetCurrentSentimentResponse>(
  'GET', '/api/sentiment/current/:symbol',
  (_body, _auth, pathParams) => {
    const store  = useSentimentStore.getState();
    const symbol = pathParams?.['symbol'] ?? 'BTC/USDT';
    const snap   = store.getLatestSnapshot(symbol);
    if (!snap) throw ApiErrors.notFound(`No sentiment data for '${symbol}'.`);
    return { snapshot: toSnapshotItem(snap) };
  },
);

// ─── GET /api/sentiment/historical/:symbol ────────────────────────────────────

registerRoute<GetHistoricalSentimentRequest, GetHistoricalSentimentResponse>(
  'GET', '/api/sentiment/historical/:symbol',
  (query, _auth, pathParams) => {
    const store    = useSentimentStore.getState();
    const symbol   = pathParams?.['symbol'] ?? 'BTC/USDT';
    const days     = Number(query.days ?? 30);
    const snaps    = store.getSnapshotHistory(symbol, days);
    return { snapshots: snaps.map(toSnapshotItem), symbol };
  },
);

// ─── POST /api/sentiment/alerts ───────────────────────────────────────────────

registerRoute<CreateSentimentAlertRequest, CreateSentimentAlertResponse>(
  'POST', '/api/sentiment/alerts',
  (body, auth) => {
    const a      = requireAuth(auth);
    const store  = useSentimentStore.getState();
    const result = store.createAlert({
      userId:    a.userId,
      symbol:    body.symbol,
      condition: body.condition as any,
      threshold: body.threshold,
      metric:    body.metric as any,
    } as any);
    if (!result.ok || !result.alert) {
      throw ApiErrors.validation(result.error ?? 'Alert creation failed.');
    }
    return { alertId: result.alert.id };
  },
);
