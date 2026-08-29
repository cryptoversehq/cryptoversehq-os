/**
 * onChainTypes.ts
 *
 * Complete type definitions for the CryptoVerse HQ On-Chain Analysis system.
 *
 * Covers:
 *   - OnChainAlert    (user-configured blockchain monitors)
 *   - OnChainEvent    (detected transactions that matched an alert)
 *   - ChainMeta       (chain-level display + simulation config)
 *   - TokenStandard   (ERC-20, BEP-20, SPL, etc.)
 *   - WhaleTier       (value-based whale classification)
 *   - AddressLabel    (known entity labels for display)
 *   - Filters / sort  (for UI list views)
 *   - Admin stats
 *   - Constants
 *
 * Complements blockchainClient.ts (which handles real USDT payment verification)
 * without duplicating any types.  On-chain monitoring is simulated — no live
 * node connection required.
 */

// ─────────────────────────────────────────────────────────────────────────────
// CHAIN TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Supported chains for on-chain monitoring. */
export type MonitoredChain = 'ethereum' | 'bitcoin' | 'bnb' | 'solana' | 'polygon';

/** Display metadata and simulation config for each chain. */
export interface ChainMeta {
  id:              MonitoredChain;
  name:            string;
  symbol:          string;      // native token symbol, e.g. "ETH"
  decimals:        number;      // native token decimals
  explorerUrl:     string;      // base block explorer URL (for tx links)
  txHashPrefix:    string;      // "0x" for EVM, "" for Bitcoin/Solana
  txHashLength:    number;      // expected full hash character count
  avgBlockTimeSec: number;      // avg seconds per block (simulation pacing)
  color:           string;      // brand hex color
  icon:            string;      // emoji icon
  /** Typical USD price per native token (for simulation) */
  nativeUsdPrice:  number;
  /** Label used for value display e.g. "2.5 ETH" */
  valueUnit:       string;
}

export const CHAIN_META: Record<MonitoredChain, ChainMeta> = {
  ethereum: {
    id: 'ethereum', name: 'Ethereum', symbol: 'ETH', decimals: 18,
    explorerUrl: 'https://etherscan.io/tx', txHashPrefix: '0x', txHashLength: 66,
    avgBlockTimeSec: 12, color: '#627eea', icon: 'Ξ',
    nativeUsdPrice: 3_400, valueUnit: 'ETH',
  },
  bitcoin: {
    id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC', decimals: 8,
    explorerUrl: 'https://mempool.space/tx', txHashPrefix: '', txHashLength: 64,
    avgBlockTimeSec: 600, color: '#f7931a', icon: '₿',
    nativeUsdPrice: 65_000, valueUnit: 'BTC',
  },
  bnb: {
    id: 'bnb', name: 'BNB Chain', symbol: 'BNB', decimals: 18,
    explorerUrl: 'https://bscscan.com/tx', txHashPrefix: '0x', txHashLength: 66,
    avgBlockTimeSec: 3, color: '#f0b90b', icon: '⬡',
    nativeUsdPrice: 590, valueUnit: 'BNB',
  },
  solana: {
    id: 'solana', name: 'Solana', symbol: 'SOL', decimals: 9,
    explorerUrl: 'https://solscan.io/tx', txHashPrefix: '', txHashLength: 88,
    avgBlockTimeSec: 0.4, color: '#9945ff', icon: '◎',
    nativeUsdPrice: 170, valueUnit: 'SOL',
  },
  polygon: {
    id: 'polygon', name: 'Polygon', symbol: 'MATIC', decimals: 18,
    explorerUrl: 'https://polygonscan.com/tx', txHashPrefix: '0x', txHashLength: 66,
    avgBlockTimeSec: 2, color: '#8247e5', icon: '⬟',
    nativeUsdPrice: 0.85, valueUnit: 'MATIC',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// TOKEN STANDARDS
// ─────────────────────────────────────────────────────────────────────────────

export type TokenStandard =
  | 'native'    // ETH, BTC, BNB, SOL
  | 'ERC-20'    // Ethereum tokens
  | 'BEP-20'    // BNB Chain tokens
  | 'SPL'       // Solana Program Library tokens
  | 'BRC-20'    // Bitcoin Ordinals tokens
  | 'NFT';      // Non-fungible tokens (ERC-721/1155)

// ─────────────────────────────────────────────────────────────────────────────
// WHALE TIERS
// ─────────────────────────────────────────────────────────────────────────────

export type WhaleTier =
  | 'shrimp'    // < $10K
  | 'fish'      // $10K – $100K
  | 'dolphin'   // $100K – $1M
  | 'whale'     // $1M – $10M
  | 'mega'      // > $10M

export function getWhaleTier(usdValue: number): WhaleTier {
  if (usdValue >= 10_000_000) return 'mega';
  if (usdValue >= 1_000_000)  return 'whale';
  if (usdValue >= 100_000)    return 'dolphin';
  if (usdValue >= 10_000)     return 'fish';
  return 'shrimp';
}

export const WHALE_TIER_META: Record<WhaleTier, { label: string; icon: string; color: string; bg: string }> = {
  shrimp:  { label: 'Shrimp',  icon: '🦐', color: 'text-slate-400',   bg: 'bg-slate-400/10 border-slate-400/20' },
  fish:    { label: 'Fish',    icon: '🐟', color: 'text-blue-400',    bg: 'bg-blue-400/10 border-blue-400/20'   },
  dolphin: { label: 'Dolphin', icon: '🐬', color: 'text-cyan-400',    bg: 'bg-cyan-400/10 border-cyan-400/20'   },
  whale:   { label: 'Whale',   icon: '🐋', color: 'text-violet-400',  bg: 'bg-violet-400/10 border-violet-400/20' },
  mega:    { label: 'Mega',    icon: '🔱', color: 'text-amber-400',   bg: 'bg-amber-400/10 border-amber-400/20'  },
};

// ─────────────────────────────────────────────────────────────────────────────
// ADDRESS LABELS  (known entity tags)
// ─────────────────────────────────────────────────────────────────────────────

export type AddressLabelType =
  | 'exchange'      // Binance, Coinbase, Kraken…
  | 'defi'          // Uniswap, Aave, Compound…
  | 'bridge'        // Wormhole, Stargate…
  | 'miner'         // Mining pools
  | 'government'    // Seized funds, regulatory
  | 'unknown'
  | 'custom';       // User-tagged

export interface AddressLabel {
  address: string;
  label:   string;
  type:    AddressLabelType;
  chain:   MonitoredChain;
  logoSeed?: string;
}

/** Well-known addresses displayed in the event feed for context. */
export const KNOWN_ADDRESSES: AddressLabel[] = [
  { address: '0xbe0eb53f46cd790cd13851d5eff43d12404d33e8', label: 'Binance Cold Wallet',  type: 'exchange', chain: 'ethereum', logoSeed: 'binance' },
  { address: '0x28c6c06298d514db089934071355e5743bf21d60', label: 'Binance Hot Wallet',   type: 'exchange', chain: 'ethereum', logoSeed: 'binance' },
  { address: '0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43', label: 'Coinbase Custody',    type: 'exchange', chain: 'ethereum', logoSeed: 'coinbase' },
  { address: '0x7a250d5630b4cf539739df2c5dacb4c659f2488d', label: 'Uniswap V2 Router',   type: 'defi',     chain: 'ethereum' },
  { address: '0x98c3d3183c4b8a650614ad179a1a98be0a8d6b8e', label: 'Kraken Exchange',     type: 'exchange', chain: 'ethereum', logoSeed: 'kraken' },
  { address: '1P5ZEDWTKTFGxQjZphgWPQUpe554WKDfHQ',        label: 'Mt. Gox Trustee',    type: 'government', chain: 'bitcoin' },
  { address: '34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo',        label: 'Binance BTC Hot',    type: 'exchange', chain: 'bitcoin',  logoSeed: 'binance' },
  // Polygon
  { address: '0xf3938337f7294fef84e9b2c6d548a93f956cc281', label: 'Polygon Bridge',     type: 'bridge',   chain: 'polygon' },
  { address: '0x5757371414417b8c6caad45baef941abc7d3ab32', label: 'QuickSwap Router',   type: 'defi',     chain: 'polygon' },
  { address: '0xab45bf58c6482b87da85d6688c4d9640e093be98', label: 'Polygon Staking',    type: 'miner',    chain: 'polygon' },
];

// ─────────────────────────────────────────────────────────────────────────────
// ALERT TYPE  (§4.4 — three trigger categories)
// ─────────────────────────────────────────────────────────────────────────────

export type AlertType =
  | 'whale_transaction'   // large value movement on a chain
  | 'wallet_activity'     // specific wallet makes any move
  | 'exchange_flow';      // inflow/outflow crosses threshold on an exchange

// ─────────────────────────────────────────────────────────────────────────────
// SIGNIFICANCE SCORE  (§4.1 — 0-1 float)
// ─────────────────────────────────────────────────────────────────────────────

export interface SignificanceBreakdown {
  /** Raw score 0-1 */
  total:              number;
  /** Component scores */
  sizePart:          number;   // up to 0.4
  destinationPart:   number;   // up to 0.3 (exchange deposit)
  sourcePart:        number;   // up to 0.3 (known whale)
  patternPart:       number;   // up to 0.2 (unusual pattern)
  /** Human-readable reason */
  reason:            string;
}

// ─────────────────────────────────────────────────────────────────────────────
// WALLET METRICS  (§4.2 — per-wallet performance model)
// ─────────────────────────────────────────────────────────────────────────────

export interface WalletMetrics {
  winRate:             number;   // 0-100 %
  totalProfitPercent:  number;   // net PnL / initial balance * 100
  sharpeRatio:         number;   // risk-adjusted return
  tradeConsistency:    number;   // 0-1 (1 = fully consistent pattern)
  maxDrawdown:         number;   // % peak-to-trough
  totalTrades:         number;
  averageTradeSize:    number;   // USD
  /** Composite smart score 0-100 (≥70 = smart wallet) */
  smartScore:          number;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXCHANGE FLOW REPORT  (§4.3)
// ─────────────────────────────────────────────────────────────────────────────

export type FlowSignal = 'bullish' | 'bearish' | 'neutral';

export interface ExchangeFlowEntry {
  exchange:     string;
  inflow:       number;   // USD
  outflow:      number;   // USD
  netFlow:      number;   // positive = net inflow
  signal:       FlowSignal;
}

export interface ExchangeFlowReport {
  period:        number;   // days
  symbol:        string;
  entries:       ExchangeFlowEntry[];
  overallSignal: FlowSignal;
  bullishCount:  number;
  bearishCount:  number;
  timestamp:     string;   // ISO-8601
}

// ─────────────────────────────────────────────────────────────────────────────
// SCORED SMART WALLET  (§4.2 output)
// ─────────────────────────────────────────────────────────────────────────────

export interface ScoredWallet {
  address:  string;
  chain:    MonitoredChain;
  score:    number;
  rank:     number;
  metrics:  WalletMetrics;
  label?:   string;
}

// ─────────────────────────────────────────────────────────────────────────────
// ALERT CONDITION
// ─────────────────────────────────────────────────────────────────────────────

export type AlertCondition = 'above' | 'below';

/** Complete alert condition for future extensibility. */
export interface AlertConditionSpec {
  type:     AlertCondition;
  minValue: number;           // USD threshold
}

// ─────────────────────────────────────────────────────────────────────────────
// ON-CHAIN ALERT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A user-configured monitor that fires whenever a transaction
 * matching the address + value condition is detected.
 */
export interface OnChainAlert {
  // ── Identity ──────────────────────────────────────────────────────────────
  id:     string;   // UUIDv4 primary key
  userId: string;   // owner
  name:   string;   // display label e.g. "Whale Alert"

  // ── Alert type ─────────────────────────────────────────────────────────────
  alertType: AlertType;

  // ── Condition ─────────────────────────────────────────────────────────────
  chain:     MonitoredChain;
  address:   string;    // wallet/contract address to monitor (empty = any address)
  minValue:  number;    // minimum USD value to trigger
  condition: AlertCondition;  // 'above' → trigger when tx value >= minValue; 'below' → trigger when <= minValue
  isActive:  boolean;
  /** Minimum significance score (0-1) for whale_transaction alerts. Default: 0.7 */
  minSignificance: number;

  // ── Token filter (optional) ───────────────────────────────────────────────
  /** If set, only match transactions involving this token contract. "" = any */
  tokenAddress: string;
  /** If set, only match this token standard. "" = any */
  tokenStandard: TokenStandard | '';

  // ── Notification ──────────────────────────────────────────────────────────
  notifyEmail: boolean;
  notifyInApp: boolean;

  // ── Metadata ──────────────────────────────────────────────────────────────
  triggerCount:    number;    // how many times this alert has fired
  createdAt:       string;    // ISO-8601
  lastTriggeredAt: string | null;  // ISO-8601
}

// ─────────────────────────────────────────────────────────────────────────────
// ON-CHAIN EVENT  (a detected transaction that satisfied an alert)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A blockchain event that was detected and matched an OnChainAlert.
 * Created by the monitoring engine; never modified after creation.
 */
export interface OnChainEvent {
  // ── Identity ──────────────────────────────────────────────────────────────
  id:      string;  // UUIDv4 primary key
  alertId: string;  // references OnChainAlert.id
  userId:  string;  // references users.id (denormalized for fast queries)

  // ── Transaction data ──────────────────────────────────────────────────────
  txHash:       string;
  fromAddress:  string;
  toAddress:    string;
  value:        number;   // USD value
  valueNative:  string;   // e.g. "2.5 ETH"
  blockNumber:  number;
  chain:        MonitoredChain;

  // ── Token info (if not native) ───────────────────────────────────────────
  tokenSymbol:   string;   // e.g. "USDT", or native symbol if no token
  tokenStandard: TokenStandard;

  // ── Classification ────────────────────────────────────────────────────────
  whaleTier:      WhaleTier;
  fromLabel:      string | null;  // known entity label for fromAddress
  toLabel:        string | null;  // known entity label for toAddress
  /** Significance score 0-1 calculated by WhaleDetectionEngine */
  significance:   number;
  /** Human-readable significance reason */
  significanceReason: string;

  // ── Status ────────────────────────────────────────────────────────────────
  isRead: boolean;

  timestamp: string;  // ISO-8601
}

// ─────────────────────────────────────────────────────────────────────────────
// FILTERS & SORTING
// ─────────────────────────────────────────────────────────────────────────────

export type AlertSortKey = 'newest' | 'oldest' | 'most_triggered' | 'highest_threshold';

export interface OnChainAlertFilters {
  chains:   MonitoredChain[];
  isActive: boolean | null;   // null = all
  search:   string;           // matches alert name or address
  sortBy:   AlertSortKey;
}

export const DEFAULT_ALERT_FILTERS: OnChainAlertFilters = {
  chains:   [],
  isActive: null,
  search:   '',
  sortBy:   'newest',
};

export type EventSortKey = 'newest' | 'oldest' | 'highest_value' | 'lowest_value';

export interface OnChainEventFilters {
  chains:     MonitoredChain[];
  whaleTiers: WhaleTier[];
  alertIds:   string[];
  unreadOnly: boolean;
  minValue:   number;
  maxValue:   number;
  search:     string;   // matches txHash, fromAddress, toAddress
  sortBy:     EventSortKey;
}

export const DEFAULT_EVENT_FILTERS: OnChainEventFilters = {
  chains:     [],
  whaleTiers: [],
  alertIds:   [],
  unreadOnly: false,
  minValue:   0,
  maxValue:   Infinity,
  search:     '',
  sortBy:     'newest',
};

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** Max active alerts per user. */
export const MAX_ALERTS_PER_USER = 50;

/** Max events stored per user before ring-buffering. */
export const MAX_EVENTS_PER_USER = 500;

/** Max global events stored. */
export const MAX_TOTAL_EVENTS = 5_000;

/** Max events stored per alert. */
export const MAX_EVENTS_PER_ALERT = 100;

/** Min USD value for a new alert. */
export const MIN_ALERT_VALUE = 100;

/** Max USD value for a new alert (open-ended ceiling in UI). */
export const MAX_ALERT_VALUE = 1_000_000_000;

/** How often the simulation engine fires new events (ms). */
export const SIMULATION_INTERVAL_MS = 12_000;  // every ~12 seconds

/** How long to keep read events before they can be auto-pruned (days). */
export const EVENT_RETENTION_DAYS = 30;

/** Popular pre-configured alert templates shown in the UI. */
export const ALERT_TEMPLATES: Array<{
  name:            string;
  chain:           MonitoredChain;
  minValue:        number;
  condition:       AlertCondition;
  alertType:       AlertType;
  minSignificance: number;
  icon:            string;
  description:     string;
}> = [
  {
    name: 'Mega Whale Move', chain: 'ethereum', minValue: 5_000_000, condition: 'above',
    alertType: 'whale_transaction', minSignificance: 0.7,
    icon: '🔱', description: 'Alerts when >$5M moves on Ethereum (significance ≥ 0.7)',
  },
  {
    name: 'BTC Whale Alert', chain: 'bitcoin', minValue: 1_000_000, condition: 'above',
    alertType: 'whale_transaction', minSignificance: 0.6,
    icon: '🐋', description: 'Alerts when >$1M in BTC moves with significance ≥ 0.6',
  },
  {
    name: 'SOL Dolphin', chain: 'solana', minValue: 100_000, condition: 'above',
    alertType: 'whale_transaction', minSignificance: 0.5,
    icon: '🐬', description: 'Monitors $100K+ SOL transfers',
  },
  {
    name: 'BNB Tracker', chain: 'bnb', minValue: 500_000, condition: 'above',
    alertType: 'whale_transaction', minSignificance: 0.5,
    icon: '⬡', description: 'Alerts on large BNB Chain moves',
  },
  {
    name: 'Exchange Inflow Alert', chain: 'bitcoin', minValue: 500_000, condition: 'above',
    alertType: 'exchange_flow', minSignificance: 0.4,
    icon: '🏦', description: 'Fires when large amounts flow into exchanges',
  },
  {
    name: 'Wallet Activity Monitor', chain: 'ethereum', minValue: 10_000, condition: 'above',
    alertType: 'wallet_activity', minSignificance: 0.3,
    icon: '👁️', description: 'Tracks any move by a specific wallet',
  },
  {
    name: 'Small Fish Detector', chain: 'ethereum', minValue: 10_000, condition: 'below',
    alertType: 'whale_transaction', minSignificance: 0.2,
    icon: '🐟', description: 'Flags transfers below $10K threshold',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// RESULT TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateAlertResult {
  ok:      boolean;
  alertId?: string;
  errors?: string[];
}

export interface UpdateAlertResult {
  ok:     boolean;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface OnChainGlobalStats {
  totalAlerts:       number;
  activeAlerts:      number;
  totalEvents:       number;
  unreadEvents:      number;
  totalVolumeUsd:    number;    // sum of all detected event values
  avgEventValue:     number;
  largestEventUsd:   number;
  largestEventTxHash: string | null;
  byChain:           Record<MonitoredChain, { alertCount: number; eventCount: number; volumeUsd: number }>;
  byWhaleTier:       Record<WhaleTier, number>;
  topUserByAlerts:   { userId: string; count: number } | null;
  topUserByEvents:   { userId: string; count: number } | null;
}
