/**
 * api/index.ts
 *
 * CryptoVerse HQ — Unified API Barrel
 *
 * Imports all route modules (which register their handlers at module-load time),
 * then exposes fully-typed endpoint functions organized by domain.
 *
 * Usage in components:
 *   import { api } from '@/api';
 *   const res = await api.strategies.list({ type: 'grid', page: 1 });
 *   if (res.ok) console.log(res.data.strategies);
 *
 * Or import individual utilities:
 *   import { apiGet, callTaskadeWebhook } from '@/api';
 */

// ── Route registrations (side-effect imports) ─────────────────────────────────
// MUST be imported before any dispatch() call so all handlers are registered.

import './strategies';
import './bots';
import './backtest';
import './copyTrading';
import './onchain';
import './sentiment';
import './nft';
import './events';
import './recommendations';
import './exchange';

// ── Core utilities ────────────────────────────────────────────────────────────

export {
  dispatch,
  apiGet,
  apiPost,
  apiPut,
  apiDel,
  resolveAuthContext,
  callTaskadeWebhook,
  ApiErrors,
  ApiClientError,
  requireAuth,
  requireAdmin,
} from './client';

export type { ApiAuthContext } from './client';

// ── All API types ─────────────────────────────────────────────────────────────

export type {
  ApiResponse,
  ApiSuccess,
  ApiError,
  ApiErrorCode,
  ApiMeta,
  PaginationParams,

  // Strategies
  CreateStrategyRequest,
  CreateStrategyResponse,
  ListStrategiesRequest,
  ListStrategiesResponse,
  StrategyListItem,
  GetStrategyResponse,
  UpdateStrategyRequest,
  PurchaseStrategyResponse,
  RateStrategyRequest,
  RateStrategyResponse,

  // Bots
  ListBotTemplatesResponse,
  BotTemplateItem,
  ListUserBotsResponse,
  UserBotItem,
  CreateBotRequest,
  CreateBotResponse,
  UpdateBotRequest,
  BotActionResponse,

  // Backtest
  RunBacktestRequest,
  RunBacktestResponse,
  ListBacktestSessionsResponse,
  GetBacktestSessionResponse,
  BacktestMetrics,
  CompareStrategiesRequest,
  CompareStrategiesResponse,

  // Copy Trading
  ListFollowingResponse,
  ListFollowersResponse,
  CopyRelationshipItem,
  FollowTraderRequest,
  FollowTraderResponse,
  UpdateCopySettingsRequest,

  // On-Chain
  GetWhaleTransactionsRequest,
  GetWhaleTransactionsResponse,
  CreateOnChainAlertRequest,
  CreateOnChainAlertResponse,
  ListOnChainAlertsResponse,
  ListOnChainEventsResponse,

  // Sentiment
  SentimentSnapshotItem,
  GetCurrentSentimentResponse,
  GetHistoricalSentimentResponse,
  CreateSentimentAlertRequest,
  CreateSentimentAlertResponse,

  // NFT
  ListNftCollectionsRequest,
  ListNftCollectionsResponse,
  NftCollectionItem,
  GetNftCollectionResponse,
  TrackNftWalletRequest,
  TrackNftWalletResponse,
  GetNftWalletResponse,

  // Events
  ListEventsResponse,
  LiveEventItem,
  RegisterForEventResponse,
  GetEventLeaderboardResponse,
  EventLeaderboardEntry,

  // Recommendations
  GetRecommendationsRequest,
  GetRecommendationsResponse,
  RecommendationItem,

  // Exchange
  ConnectExchangeRequest,
  ConnectExchangeResponse,
  ListConnectionsResponse,
  ExchangeConnectionItem,
  GetExchangeBalanceResponse,
} from './types';

// ── Typed endpoint namespace ──────────────────────────────────────────────────

import { apiGet, apiPost, apiPut, apiDel } from './client';
import type {
  CreateStrategyRequest,
  ListStrategiesRequest,
  RateStrategyRequest,
  CreateBotRequest,
  UpdateBotRequest,
  RunBacktestRequest,
  CompareStrategiesRequest,
  FollowTraderRequest,
  UpdateCopySettingsRequest,
  GetWhaleTransactionsRequest,
  CreateOnChainAlertRequest,
  GetHistoricalSentimentRequest,
  CreateSentimentAlertRequest,
  ListNftCollectionsRequest,
  TrackNftWalletRequest,
  GetRecommendationsRequest,
  ConnectExchangeRequest,
} from './types';

export const api = {

  // ── Strategy Marketplace ───────────────────────────────────────────────────
  strategies: {
    create:   (body: CreateStrategyRequest)       => apiPost('/api/strategies', body),
    list:     (q: ListStrategiesRequest = {})     => apiGet(`/api/strategies?${qs(q)}`),
    get:      (id: string)                        => apiGet(`/api/strategies/${id}`),
    update:   (id: string, body: Partial<CreateStrategyRequest>) => apiPut(`/api/strategies/${id}`, body),
    delete:   (id: string)                        => apiDel(`/api/strategies/${id}`),
    purchase: (id: string)                        => apiPost(`/api/strategies/${id}/purchase`, {}),
    rate:     (id: string, body: RateStrategyRequest) => apiPost(`/api/strategies/${id}/rate`, body),
  },

  // ── Trading Bots ───────────────────────────────────────────────────────────
  bots: {
    templates: ()                                    => apiGet('/api/bots/templates'),
    userBots:  ()                                    => apiGet('/api/bots/user'),
    create:    (body: CreateBotRequest)              => apiPost('/api/bots', body),
    update:    (id: string, body: UpdateBotRequest)  => apiPut(`/api/bots/${id}`, body),
    delete:    (id: string)                          => apiDel(`/api/bots/${id}`),
    start:     (id: string)                          => apiPost(`/api/bots/${id}/start`, {}),
    stop:      (id: string)                          => apiPost(`/api/bots/${id}/stop`, {}),
  },

  // ── Backtest ───────────────────────────────────────────────────────────────
  backtest: {
    run:      (body: RunBacktestRequest)             => apiPost('/api/backtest/run', body),
    sessions: ()                                     => apiGet('/api/backtest/sessions'),
    session:  (id: string)                           => apiGet(`/api/backtest/sessions/${id}`),
    compare:  (body: CompareStrategiesRequest)       => apiPost('/api/backtest/compare', body),
  },

  // ── Copy Trading ───────────────────────────────────────────────────────────
  copy: {
    following:      ()                                         => apiGet('/api/copy/following'),
    followers:      ()                                         => apiGet('/api/copy/followers'),
    follow:         (traderId: string, body: FollowTraderRequest) => apiPost(`/api/copy/follow/${traderId}`, body),
    unfollow:       (relId: string)                            => apiDel(`/api/copy/unfollow/${relId}`),
    updateSettings: (relId: string, body: UpdateCopySettingsRequest) => apiPut(`/api/copy/settings/${relId}`, body),
  },

  // ── On-Chain Analysis ──────────────────────────────────────────────────────
  onchain: {
    whales:       (q: GetWhaleTransactionsRequest)          => apiGet(`/api/onchain/whales?${qs(q)}`),
    createAlert:  (body: CreateOnChainAlertRequest)         => apiPost('/api/onchain/alerts', body),
    alerts:       ()                                        => apiGet('/api/onchain/alerts'),
    deleteAlert:  (id: string)                              => apiDel(`/api/onchain/alerts/${id}`),
    events:       ()                                        => apiGet('/api/onchain/events'),
  },

  // ── Sentiment Analysis ─────────────────────────────────────────────────────
  sentiment: {
    current:    (symbol: string)                                      => apiGet(`/api/sentiment/current/${encodeURIComponent(symbol)}`),
    historical: (symbol: string, q: GetHistoricalSentimentRequest = {}) => apiGet(`/api/sentiment/historical/${encodeURIComponent(symbol)}?${qs(q)}`),
    createAlert:(body: CreateSentimentAlertRequest)                   => apiPost('/api/sentiment/alerts', body),
  },

  // ── NFT Analysis ───────────────────────────────────────────────────────────
  nft: {
    collections:     (q: ListNftCollectionsRequest = {})     => apiGet(`/api/nft/collections?${qs(q)}`),
    collection:      (slug: string)                          => apiGet(`/api/nft/collection/${encodeURIComponent(slug)}`),
    trackWallet:     (body: TrackNftWalletRequest)           => apiPost('/api/nft/wallet/track', body),
    walletNfts:      (address: string)                       => apiGet(`/api/nft/wallet/${encodeURIComponent(address)}`),
  },

  // ── Live Events ────────────────────────────────────────────────────────────
  events: {
    upcoming:    ()                  => apiGet('/api/events/upcoming'),
    active:      ()                  => apiGet('/api/events/active'),
    register:    (eventId: string)   => apiPost(`/api/events/${eventId}/register`, {}),
    leaderboard: (eventId: string)   => apiGet(`/api/events/${eventId}/leaderboard`),
  },

  // ── AI Recommender ─────────────────────────────────────────────────────────
  recommendations: {
    get:     (q: GetRecommendationsRequest = {}) => apiGet(`/api/recommendations?${qs(q)}`),
    click:   (id: string)                        => apiPost(`/api/recommendations/${id}/click`, {}),
    dismiss: (id: string)                        => apiPost(`/api/recommendations/${id}/dismiss`, {}),
  },

  // ── Exchange Connections ───────────────────────────────────────────────────
  exchange: {
    connect:     (body: ConnectExchangeRequest) => apiPost('/api/exchange/connect', body),
    connections: ()                             => apiGet('/api/exchange/connections'),
    disconnect:  (id: string)                   => apiDel(`/api/exchange/connections/${id}`),
    balance:     (id: string)                   => apiGet(`/api/exchange/balance/${id}`),
  },
};

// ─── QUERY STRING HELPER ──────────────────────────────────────────────────────

function qs(params: Record<string, unknown>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => {
      if (Array.isArray(v)) return v.map(vi => `${encodeURIComponent(k)}=${encodeURIComponent(String(vi))}`).join('&');
      return `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`;
    })
    .join('&');
}
