/**
 * exchangeTypes.ts — All types for the Real Exchange Connection feature
 */

// ── Supported exchanges ────────────────────────────────────────────────────────

export type ExchangeId = 'binance' | 'coinbase' | 'kraken' | 'okx';

export type AuthMethod = 'api_key' | 'oauth2';

export type TradingMode = 'spot' | 'margin' | 'futures' | 'options';

export interface ExchangeMeta {
  id:            ExchangeId;
  name:          string;
  logo:          string;           // emoji placeholder
  color:         string;           // brand hex
  accentGradient: string;          // Tailwind gradient
  authMethod:    AuthMethod;
  supportedModes: TradingMode[];
  minLevel:      number;
  description:   string;
  website:       string;
  docsUrl:       string;
  features:      string[];
  requiresPassphrase: boolean;
}

export const EXCHANGE_META: Record<ExchangeId, ExchangeMeta> = {
  binance: {
    id: 'binance',
    name: 'Binance',
    logo: '🟡',
    color: '#F0B90B',
    accentGradient: 'from-yellow-500/20 via-yellow-500/5 to-transparent',
    authMethod: 'api_key',
    supportedModes: ['spot', 'margin', 'futures'],
    minLevel: 10,
    description: 'World\'s largest crypto exchange by volume',
    website: 'https://binance.com',
    docsUrl: 'https://binance-docs.github.io/apidocs/',
    features: ['Spot Trading', 'Margin Trading', 'Futures', '300+ Pairs', 'Low Fees'],
    requiresPassphrase: false,
  },
  coinbase: {
    id: 'coinbase',
    name: 'Coinbase',
    logo: '🔵',
    color: '#0052FF',
    accentGradient: 'from-blue-500/20 via-blue-500/5 to-transparent',
    authMethod: 'oauth2',
    supportedModes: ['spot'],
    minLevel: 10,
    description: 'Most trusted US-regulated exchange',
    website: 'https://coinbase.com',
    docsUrl: 'https://docs.cloud.coinbase.com/',
    features: ['Spot Trading', 'OAuth2 Security', 'USD Rails', 'Insured Custody'],
    requiresPassphrase: false,
  },
  kraken: {
    id: 'kraken',
    name: 'Kraken',
    logo: '🐙',
    color: '#5741D9',
    accentGradient: 'from-purple-500/20 via-purple-500/5 to-transparent',
    authMethod: 'api_key',
    supportedModes: ['spot', 'futures'],
    minLevel: 12,
    description: 'Secure European exchange with deep liquidity',
    website: 'https://kraken.com',
    docsUrl: 'https://docs.kraken.com/rest/',
    features: ['Spot Trading', 'Futures', '200+ Pairs', 'Advanced Security'],
    requiresPassphrase: false,
  },
  okx: {
    id: 'okx',
    name: 'OKX',
    logo: '⚫',
    color: '#FFFFFF',
    accentGradient: 'from-white/10 via-white/5 to-transparent',
    authMethod: 'api_key',
    supportedModes: ['spot', 'futures', 'options'],
    minLevel: 12,
    description: 'Advanced exchange with options and structured products',
    website: 'https://okx.com',
    docsUrl: 'https://www.okx.com/docs-v5/',
    features: ['Spot', 'Futures', 'Options', '400+ Pairs', 'Copy Trading'],
    requiresPassphrase: true,
  },
};

// ── Connection status ──────────────────────────────────────────────────────────

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'validating'
  | 'connected'
  | 'error'
  | 'revoked';

export interface ExchangeConnection {
  id:         string;           // uuid
  exchangeId: ExchangeId;
  label:      string;           // user-given nickname
  status:     ConnectionStatus;
  connectedAt: string;          // ISO
  lastSyncAt?: string;          // ISO
  errorMsg?:  string;
  // Masked credentials (never store real keys — store only masked display)
  maskedKey?: string;           // "ABCD...WXYZ"
  // Permissions granted
  permissions: ExchangePermission[];
  // Mode
  modes: TradingMode[];
  // Balance snapshot (from last sync)
  balanceUSD: number;
  balanceBTC: number;
  // OAuth token (for OAuth2 exchanges — mock only, never real)
  oauthToken?: string;
  isReadOnly: boolean;
}

export type ExchangePermission =
  | 'read'
  | 'trade'
  | 'withdraw'
  | 'transfer';

// ── Risk controls ──────────────────────────────────────────────────────────────

export interface RiskControls {
  connectionId: string;
  // Position limits
  maxPositionSizeUSD:   number;
  maxPositionPercent:   number;   // % of portfolio
  maxOpenPositions:     number;
  // Daily limits
  maxDailyLossUSD:      number;
  maxDailyLossPercent:  number;
  maxDailyTradesCount:  number;
  // Per-trade limits
  defaultLeverage:      number;
  maxLeverage:          number;
  stopLossPercent:      number;   // default SL %
  takeProfitPercent:    number;   // default TP %
  // Kill switch
  killSwitchEnabled:    boolean;
  killSwitchThreshold:  number;   // % drawdown that triggers pause
  // Allowed pairs
  allowedPairs:         string[];
  blockedPairs:         string[];
  // Trading hours
  tradingHoursEnabled:  boolean;
  tradingHoursStart:    string;   // "08:00"
  tradingHoursEnd:      string;   // "22:00"
  // Notifications
  alertOnTrade:         boolean;
  alertOnLoss:          boolean;
  alertOnLimitReached:  boolean;
}

export const DEFAULT_RISK_CONTROLS: Omit<RiskControls, 'connectionId'> = {
  maxPositionSizeUSD:   1000,
  maxPositionPercent:   10,
  maxOpenPositions:     5,
  maxDailyLossUSD:      500,
  maxDailyLossPercent:  5,
  maxDailyTradesCount:  20,
  defaultLeverage:      1,
  maxLeverage:          3,
  stopLossPercent:      2,
  takeProfitPercent:    4,
  killSwitchEnabled:    true,
  killSwitchThreshold:  10,
  allowedPairs:         [],
  blockedPairs:         [],
  tradingHoursEnabled:  false,
  tradingHoursStart:    '08:00',
  tradingHoursEnd:      '22:00',
  alertOnTrade:         true,
  alertOnLoss:          true,
  alertOnLimitReached:  true,
};

// ── Real trades ────────────────────────────────────────────────────────────────

export type OrderSide = 'buy' | 'sell';
export type OrderStatus = 'open' | 'filled' | 'partial' | 'cancelled' | 'rejected';
export type OrderType = 'market' | 'limit' | 'stop_limit' | 'stop_market';

export interface RealTrade {
  id:           string;
  connectionId: string;
  exchangeId:   ExchangeId;
  symbol:       string;
  side:         OrderSide;
  type:         OrderType;
  status:       OrderStatus;
  quantity:     number;
  price:        number;
  filledQty:    number;
  filledAvgPx:  number;
  feePaid:      number;
  feeCurrency:  string;
  pnl?:         number;         // realized PnL
  pnlPct?:      number;
  createdAt:    string;
  filledAt?:    string;
  strategyId?:  string;         // if deployed from marketplace
  strategyName?: string;
  mode:         TradingMode;
  isFromBot:    boolean;
}

// ── Deployed strategies ────────────────────────────────────────────────────────

export type DeployStatus = 'running' | 'paused' | 'stopped' | 'error';

export interface DeployedStrategy {
  id:           string;
  connectionId: string;
  exchangeId:   ExchangeId;
  strategyId:   string;
  strategyName: string;
  symbol:       string;
  mode:         TradingMode;
  status:       DeployStatus;
  deployedAt:   string;
  lastRunAt?:   string;
  allocatedUSD: number;
  currentValueUSD: number;
  realizedPnl:  number;
  unrealizedPnl: number;
  totalTrades:  number;
  winRate:      number;
  maxDrawdown:  number;
  riskControls: RiskControls;
}

// ── Portfolio snapshot ─────────────────────────────────────────────────────────

export interface PortfolioAsset {
  symbol:     string;
  name:       string;
  quantity:   number;
  avgCostUSD: number;
  currentUSD: number;
  valueUSD:   number;
  pnl:        number;
  pnlPct:     number;
  allocation: number;   // % of total
  logoEmoji:  string;
}

export interface RealPortfolioSnapshot {
  connectionId: string;
  takenAt:      string;
  totalUSD:     number;
  assets:       PortfolioAsset[];
  dailyPnL:     number;
  dailyPnLPct:  number;
  weeklyPnL:    number;
  monthlyPnL:   number;
}
