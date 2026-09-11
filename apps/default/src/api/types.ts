/**
 * api/types.ts
 *
 * Shared request / response type contracts for the CryptoVerse HQ REST API layer.
 *
 * All endpoints return ApiResponse<T> — a discriminated union of success and
 * error shapes, ensuring callers always handle both outcomes.
 *
 * Conventions:
 *   - All timestamps are ISO-8601 strings
 *   - All monetary values are numbers (CP coins or USD, stated in field docs)
 *   - Pagination uses cursor-based offsets: { page, pageSize, total, hasMore }
 *   - Auth is carried via the Authorization header: "Bearer <jwt>"
 */

// ─────────────────────────────────────────────────────────────────────────────
// HTTP METHOD TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

// ─────────────────────────────────────────────────────────────────────────────
// RESPONSE ENVELOPE
// ─────────────────────────────────────────────────────────────────────────────

export interface ApiSuccess<T = unknown> {
  ok:   true;
  data: T;
  meta?: ApiMeta;
}

export interface ApiError {
  ok:      false;
  error:   ApiErrorCode;
  message: string;
  details?: Record<string, string[]>;  // field-level validation errors
  requestId?: string;
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError;

// A browser may cache these records, but it is never the authority for a live
// mutation or a sensitive exchange value.
export type ServerDataSource = 'render-api' | 'supabase';

export interface ServerAuthority {
  authority: 'server';
  source: ServerDataSource;
  requestId: string;
  issuedAt: string;
}

export interface ServerAuthoritative<T> {
  data: T;
  authority: ServerAuthority;
}

export interface ServerMutationReceipt {
  mutationId: string;
  committedAt: string;
  authority: ServerAuthority;
}

export interface MaskedSecret {
  present: boolean;
  last4?: string;
}

export type ExchangeConnectionMode = 'live' | 'demo';

// ─────────────────────────────────────────────────────────────────────────────
// META (pagination, timing, versioning)
// ─────────────────────────────────────────────────────────────────────────────

export interface ApiMeta {
  page?:      number;
  pageSize?:  number;
  total?:     number;
  hasMore?:   boolean;
  requestId?: string;
  durationMs?: number;
  version?:   string;
}

// ─────────────────────────────────────────────────────────────────────────────
// ERROR CODES
// ─────────────────────────────────────────────────────────────────────────────

export type ApiErrorCode =
  | 'UNAUTHORIZED'           // 401 — no or invalid auth token
  | 'FORBIDDEN'              // 403 — authenticated but insufficient permission
  | 'NOT_FOUND'              // 404 — resource does not exist
  | 'CONFLICT'               // 409 — resource already exists / duplicate
  | 'VALIDATION_ERROR'       // 422 — invalid input
  | 'INSUFFICIENT_BALANCE'   // 402 — not enough CP coins
  | 'PLAN_REQUIRED'          // 403 — requires a higher subscription plan
  | 'KYC_REQUIRED'           // 403 — requires KYC verification
  | 'LEVEL_REQUIRED'         // 403 — requires a higher user level
  | 'RATE_LIMITED'           // 429 — too many requests
  | 'SERVER_ERROR'           // 500 — internal error
  | 'STORE_ERROR'            // 500 — Zustand store operation failed
  | 'NOT_IMPLEMENTED';       // 501 — endpoint not yet implemented

// ─────────────────────────────────────────────────────────────────────────────
// PAGINATION QUERY PARAMS
// ─────────────────────────────────────────────────────────────────────────────

export interface PaginationParams {
  page?:     number;   // 1-based, default 1
  pageSize?: number;   // default 20, max 100
}

export interface SortParams {
  sortBy?:  string;
  sortDir?: 'asc' | 'desc';
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTH CONTEXT (passed into every handler)
// ─────────────────────────────────────────────────────────────────────────────

export interface ApiAuthContext {
  userId:      string;
  displayName: string;
  plan:        'bronze' | 'silver' | 'gold';
  level:       number;
  kycVerified: boolean;
  isAdmin:     boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// ── 11.1  STRATEGY MARKETPLACE ───────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/strategies
export interface CreateStrategyRequest {
  name:             string;
  shortDescription: string;
  description:      string;
  type:             'grid' | 'dca' | 'martingale' | 'arbitrage' | 'custom';
  price:            number;
  tags:             string[];
  requiredLevel?:   number;
  requiredPlan?:    'any' | 'bronze' | 'silver' | 'gold';
  requiresKyc?:     boolean;
  code?:            string;
  paramDocs?:       string;
}
export interface CreateStrategyResponse { strategyId: string; }

// GET /api/strategies
export interface ListStrategiesRequest extends PaginationParams {
  type?:      string;
  minRating?: number;
  maxPrice?:  number;
  search?:    string;
  sortBy?:    'rating' | 'price' | 'sales' | 'newest';
  isFree?:    boolean;
}
export interface ListStrategiesResponse {
  strategies: StrategyListItem[];
  total:      number;
  page:       number;
  pageSize:   number;
  hasMore:    boolean;
}
export interface StrategyListItem {
  id:               string;
  name:             string;
  shortDescription: string;
  type:             string;
  price:            number;
  isFree:           boolean;
  rating:           number;
  ratingCount:      number;
  winRate:          number;
  maxDrawdown:      number;
  sharpeRatio:      number;
  totalSales:       number;
  creatorName:      string;
  tags:             string[];
  requiredPlan:     string;
  requiredLevel:    number;
  riskLevel:        string;
  createdAt:        string;
}

// GET /api/strategies/:id
export interface GetStrategyResponse {
  strategy:   StrategyDetail;
  userOwns:   boolean;
  userRating: StrategyRatingItem | null;
}
export interface StrategyDetail extends StrategyListItem {
  description:        string;
  backtestPeriodDays: number;
  totalProfitPct:     number;
  totalTrades:        number;
  avgTradeDuration:   number;
  ratingCount:        number;
  ratings:            StrategyRatingItem[];
  code?:              string;
  paramDocs?:         string;
  updatedAt:          string;
}
export interface StrategyRatingItem {
  id:        string;
  userId:    string;
  userName:  string;
  rating:    number;
  review:    string;
  createdAt: string;
}

// PUT /api/strategies/:id
export type UpdateStrategyRequest = Partial<CreateStrategyRequest>;
export interface UpdateStrategyResponse { strategyId: string; }

// POST /api/strategies/:id/purchase
export interface PurchaseStrategyResponse {
  purchaseId: string;
  strategyId: string;
  price:      number;
  purchasedAt: string;
}

// POST /api/strategies/:id/rate
export interface RateStrategyRequest { rating: number; review: string; }
export interface RateStrategyResponse { ratingId: string; newAverage: number; }

// ─────────────────────────────────────────────────────────────────────────────
// ── 11.2  TRADING BOTS ───────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/bots/templates
export interface BotTemplateItem {
  id:           string;
  name:         string;
  type:         string;
  description:  string;
  minBalance:   number;
  requiredPlan: string;
  requiredLevel: number;
  rating:       number;
  totalUsers:   number;
  isActive:     boolean;
}
export interface ListBotTemplatesResponse { templates: BotTemplateItem[]; }

// GET /api/bots/user
export interface UserBotItem {
  id:          string;
  name:        string;
  templateId:  string;
  type:        string;
  status:      'active' | 'paused' | 'stopped' | 'error';
  totalProfit: number;
  totalTrades: number;
  winRate:     number;
  createdAt:   string;
  lastRunAt:   string | null;
}
export interface ListUserBotsResponse { bots: UserBotItem[]; }

// POST /api/bots
export interface CreateBotRequest {
  templateId:    string;
  name:          string;
  config:        Record<string, unknown>;
  scheduleType?: 'continuous' | 'interval' | 'cron';
  scheduleValue?: string;
}
export interface CreateBotResponse { botId: string; }

// PUT /api/bots/:id
export interface UpdateBotRequest {
  name?:         string;
  config?:       Record<string, unknown>;
  scheduleType?: 'continuous' | 'interval' | 'cron';
  scheduleValue?: string;
}
export interface UpdateBotResponse { botId: string; }

// POST /api/bots/:id/start | /stop
export interface BotActionResponse { botId: string; status: string; }

// ─────────────────────────────────────────────────────────────────────────────
// ── 11.3  BACKTEST ───────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/backtest/run
export interface RunBacktestRequest {
  coinId:       string;
  symbol:       string;
  timeframe:    string;
  startDate:    string;
  endDate:      string;
  strategyType: string;
  strategyId?:  string;
  initialBalance?: number;
  feeRate?:     number;
  strategyConfig?: Record<string, unknown>;
  sessionName?: string;
}
export interface RunBacktestResponse { sessionId: string; status: 'pending' | 'running'; }

// GET /api/backtest/sessions
export interface ListBacktestSessionsResponse {
  sessions: BacktestSessionItem[];
  total:    number;
}
export interface BacktestSessionItem {
  id:          string;
  sessionName: string;
  symbol:      string;
  timeframe:   string;
  status:      string;
  totalReturn?: number;
  winRate?:    number;
  maxDrawdown?: number;
  sharpeRatio?: number;
  createdAt:   string;
  completedAt?: string;
}

// GET /api/backtest/sessions/:id
export interface GetBacktestSessionResponse {
  session: BacktestSessionItem & {
    metrics:    BacktestMetrics | null;
    trades:     BacktestTradeItem[];
    params:     RunBacktestRequest;
  };
}
export interface BacktestMetrics {
  totalReturn:   number;
  winRate:       number;
  maxDrawdown:   number;
  sharpeRatio:   number;
  totalTrades:   number;
  winningTrades: number;
  losingTrades:  number;
  profitFactor:  number;
  avgWin:        number;
  avgLoss:       number;
  finalBalance:  number;
}
export interface BacktestTradeItem {
  id:        string;
  action:    'buy' | 'sell';
  price:     number;
  amount:    number;
  total:     number;
  pnl?:      number;
  pnlPct?:   number;
  timestamp: string;
}

// POST /api/backtest/compare
export interface CompareStrategiesRequest { strategyIds: string[]; }
export interface CompareStrategiesResponse {
  strategyIds: string[];
  results:     Record<string, BacktestMetrics | null>;
  generatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// ── 11.4  COPY TRADING ───────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/copy/following
export interface ListFollowingResponse { following: CopyRelationshipItem[]; }

// GET /api/copy/followers
export interface ListFollowersResponse { followers: CopyRelationshipItem[]; }

export interface CopyRelationshipItem {
  id:              string;
  traderId:        string;
  traderName:      string;
  followerId:      string;
  copyPercentage:  number;
  maxAmountPerTrade: number;
  status:          string;
  totalProfit:     number;
  totalCopiedTrades: number;
  winRate:         number;
  createdAt:       string;
}

// POST /api/copy/follow/:traderId
export interface FollowTraderRequest {
  copyPercentage?:  number;
  maxAmountPerTrade?: number;
  stopLoss?:        number | null;
  takeProfit?:      number | null;
}
export interface FollowTraderResponse { relationshipId: string; }

// DELETE /api/copy/unfollow/:id  → 200 { ok: true }

// PUT /api/copy/settings/:id
export interface UpdateCopySettingsRequest extends FollowTraderRequest {}
export interface UpdateCopySettingsResponse { relationshipId: string; }

// ─────────────────────────────────────────────────────────────────────────────
// ── 11.5  ON-CHAIN ANALYSIS ──────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/onchain/whales
export interface GetWhaleTransactionsRequest {
  chain:     string;
  minValue?: number;
  limit?:    number;
}
export interface WhaleTransactionItem {
  id:         string;
  chain:      string;
  txHash:     string;
  fromAddress: string;
  toAddress:  string;
  valueUsd:   number;
  asset:      string;
  timestamp:  string;
  whaleTier:  string;
}
export interface GetWhaleTransactionsResponse { events: WhaleTransactionItem[]; }

// POST /api/onchain/alerts
export interface CreateOnChainAlertRequest {
  chain:        string;
  alertType:    string;
  minValueUsd?: number;
  maxValueUsd?: number;
  address?:     string;
  label?:       string;
}
export interface CreateOnChainAlertResponse { alertId: string; }

// GET /api/onchain/alerts
export interface ListOnChainAlertsResponse { alerts: OnChainAlertItem[]; }
export interface OnChainAlertItem {
  id:          string;
  chain:       string;
  alertType:   string;
  minValueUsd: number;
  isEnabled:   boolean;
  triggerCount: number;
  createdAt:   string;
}

// GET /api/onchain/events
export interface ListOnChainEventsResponse { events: WhaleTransactionItem[]; total: number; }

// ─────────────────────────────────────────────────────────────────────────────
// ── 11.6  SENTIMENT ANALYSIS ─────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/sentiment/current/:symbol
export interface SentimentSnapshotItem {
  id:             string;
  symbol:         string;
  fearGreedIndex: number;
  fearGreedZone:  string;
  bullishPct:     number;
  bearishPct:     number;
  neutralPct:     number;
  socialVolume:   number;
  twitterMentions: number;
  redditMentions: number;
  newsSentiment:  number;
  timestamp:      string;
}
export interface GetCurrentSentimentResponse { snapshot: SentimentSnapshotItem; }

// GET /api/sentiment/historical/:symbol
export interface GetHistoricalSentimentRequest { days?: number; }
export interface GetHistoricalSentimentResponse { snapshots: SentimentSnapshotItem[]; symbol: string; }

// POST /api/sentiment/alerts
export interface CreateSentimentAlertRequest {
  symbol:    string;
  condition: 'above' | 'below' | 'crosses_up' | 'crosses_down';
  threshold: number;
  metric:    'fear_greed' | 'bullish_pct' | 'social_volume';
}
export interface CreateSentimentAlertResponse { alertId: string; }

// ─────────────────────────────────────────────────────────────────────────────
// ── 11.7  NFT ANALYSIS ───────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/nft/collections
export interface ListNftCollectionsRequest {
  chain?:       string;
  category?:    string;
  sortBy?:      'volume_24h' | 'floor_price' | 'market_cap' | 'sales_24h';
  limit?:       number;
}
export interface NftCollectionItem {
  slug:        string;
  name:        string;
  chain:       string;
  floorPriceEth: number;
  volume24hEth: number;
  marketCapEth: number;
  sales24h:    number;
  owners:      number;
  totalSupply: number;
  verified:    boolean;
}
export interface ListNftCollectionsResponse { collections: NftCollectionItem[]; }

// GET /api/nft/collection/:slug
export interface GetNftCollectionResponse { collection: NftCollectionItem & { description: string; website?: string; } }

// POST /api/nft/wallet/track
export interface TrackNftWalletRequest { address: string; chain: string; label?: string; }
export interface TrackNftWalletResponse { walletId: string; }

// GET /api/nft/wallet/:address
export interface GetNftWalletResponse {
  address:       string;
  chain:         string;
  totalValueEth: number;
  nftCount:      number;
  collections:   { slug: string; name: string; count: number; valueEth: number }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// ── 11.8  LIVE EVENTS ────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

export interface LiveEventItem {
  id:           string;
  title:        string;
  type:         string;
  status:       string;
  startTime:    string;
  endTime:      string;
  prizePool:    number;
  entryFee:     number;
  maxParticipants: number;
  currentParticipants: number;
  isRegistered: boolean;
}

// GET /api/events/upcoming | /active
export interface ListEventsResponse { events: LiveEventItem[]; }

// POST /api/events/:id/register → 200 { ok: true, participantId: string }
export interface RegisterForEventResponse { participantId: string; entryFee: number; }

// GET /api/events/:id/leaderboard
export interface EventLeaderboardEntry {
  rank:        number;
  userId:      string;
  displayName: string;
  score:       number;
  profit:      number;
  trades:      number;
}
export interface GetEventLeaderboardResponse { eventId: string; entries: EventLeaderboardEntry[]; updatedAt: string; }

// ─────────────────────────────────────────────────────────────────────────────
// ── 11.9  AI RECOMMENDER ─────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

export interface RecommendationItem {
  id:        string;
  type:      'strategy' | 'bot' | 'lesson' | 'competition' | 'trader';
  targetId:  string;
  score:     number;
  headline:  string;
  reason:    string;
  thumbnail: string;
  tags:      string[];
  isViewed:  boolean;
  isClicked: boolean;
  expiresAt: string;
}

// GET /api/recommendations
export interface GetRecommendationsRequest {
  types?:    string[];   // filter by type
  limit?:    number;
  minScore?: number;
}
export interface GetRecommendationsResponse {
  recommendations: RecommendationItem[];
  total:           number;
  generatedAt:     string;
}

// POST /api/recommendations/:id/click → 200 { ok: true }
// POST /api/recommendations/:id/dismiss → 200 { ok: true }

// ─────────────────────────────────────────────────────────────────────────────
// ── 11.10  EXCHANGE CONNECTION ────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/exchange/connect
export interface ConnectExchangeRequest {
  exchange:  string;
  apiKey:    string;
  apiSecret: string;
  label?:    string;
  isDemoMode?: boolean;
}
export interface ConnectExchangeResponse { connectionId: string; exchange: string; isDemoMode: boolean; }

// GET /api/exchange/connections
export interface ExchangeConnectionItem {
  id:          string;
  exchange:    string;
  label:       string;
  isActive:    boolean;
  isDemoMode:  boolean;
  lastSyncAt:  string | null;
  totalTrades: number;
  totalPnl:    number;
  connectedAt: string;
}
export interface ListConnectionsResponse { connections: ExchangeConnectionItem[]; }

// DELETE /api/exchange/connections/:id → 200 { ok: true }

// GET /api/exchange/balance/:id
export interface GetExchangeBalanceResponse {
  connectionId: string;
  balances:     { asset: string; free: number; locked: number; total: number; usdValue: number }[];
  totalUsdValue: number;
  updatedAt:    string;
}

export interface SyncExchangeResponse {
  connectionId: string;
  syncedAt: string;
  balance?: GetExchangeBalanceResponse;
  trades?: ExchangeTradeItem[];
}

export interface ExchangeTradeItem {
  id: string;
  connectionId: string;
  exchange?: string;
  symbol: string;
  side: 'buy' | 'sell';
  orderType?: 'market' | 'limit' | 'stop_limit';
  quantity: number;
  filledQuantity?: number;
  price: number;
  filledPrice?: number;
  fee?: number;
  feeCurrency?: string;
  pnl?: number;
  pnlPct?: number;
  status: string;
  createdAt: string;
  filledAt?: string | null;
}

export interface DeployExchangeStrategyRequest {
  connectionId: string;
  strategyId: string;
  strategyName: string;
  strategyInfo: {
    isBacktested: boolean;
    winRate: number;
    backtestMonths: number;
    maxDrawdown: number;
    riskLevel: 'low' | 'medium' | 'high';
  };
  symbol: string;
  mode: 'spot' | 'margin' | 'futures';
  allocatedUSD: number;
  userLevel: number;
  pairs: string[];
  maxDailyLoss: number;
}

export interface DeployExchangeStrategyResponse {
  deployId: string;
  status: 'pending' | 'running' | 'stopped' | 'failed';
  strategyId?: string;
  connectionId?: string;
  message?: string;
}

export interface ExecuteExchangeOrderRequest {
  connectionId: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  orderType: 'market' | 'limit' | 'stop_limit';
  price?: number;
}

export interface ExecuteExchangeOrderResponse {
  orderId: string;
  connectionId: string;
  status: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  filledQuantity?: number;
  price?: number;
  filledPrice?: number;
  createdAt: string;
  trade?: ExchangeTradeItem;
}
