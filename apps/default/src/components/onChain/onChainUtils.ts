/**
 * onChainUtils.ts — shared display helpers for the On-Chain Analysis UI
 */

import { MonitoredChain, WhaleTier, WHALE_TIER_META, CHAIN_META } from '../../lib/onChainTypes';

// ── Chain display ─────────────────────────────────────────────────────────────

export interface ChainDisplay {
  id:     MonitoredChain;
  name:   string;
  icon:   string;
  color:  string;
  abbr:   string;
  api:    string;
  limit:  string;
}

export const CHAIN_DISPLAY: Record<MonitoredChain, ChainDisplay> = {
  ethereum: { id: 'ethereum', name: 'Ethereum', icon: 'Ξ',  color: '#627eea', abbr: 'ETH', api: 'Etherscan API',   limit: '5 req/s' },
  bitcoin:  { id: 'bitcoin',  name: 'Bitcoin',  icon: '₿',  color: '#f7931a', abbr: 'BTC', api: 'Mempool.space',   limit: '10 req/s' },
  bnb:      { id: 'bnb',      name: 'BNB Chain',icon: '⬡',  color: '#f0b90b', abbr: 'BNB', api: 'BSCScan API',     limit: '5 req/s' },
  solana:   { id: 'solana',   name: 'Solana',   icon: '◎',  color: '#9945ff', abbr: 'SOL', api: 'Solana RPC',      limit: '10 req/s' },
  polygon:  { id: 'polygon',  name: 'Polygon',  icon: '⬟',  color: '#8247e5', abbr: 'MATIC', api: 'Polygonscan API', limit: '5 req/s' },
};

export const ALL_CHAINS: MonitoredChain[] = ['ethereum', 'bitcoin', 'bnb', 'solana', 'polygon'];

// ── Formatters ────────────────────────────────────────────────────────────────

export function fmtUsd(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000)     return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000)         return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

export function fmtAddr(addr: string): string {
  if (!addr) return '—';
  if (addr.startsWith('0x')) return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
  if (addr.length > 12)     return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
  return addr;
}

export function fmtHash(hash: string): string {
  if (!hash) return '—';
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

export function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1_000;
  if (diff < 60)   return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400)return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

// ── Whale display ─────────────────────────────────────────────────────────────

export { WHALE_TIER_META };
export type { WhaleTier };

export const WHALE_TIERS: WhaleTier[] = ['shrimp', 'fish', 'dolphin', 'whale', 'mega'];

// ── Smart money wallet seeds (simulated) ──────────────────────────────────────

export interface SmartWallet {
  address:   string;
  label:     string;
  chain:     MonitoredChain;
  pnl30d:    number;   // USD
  winRate:   number;   // 0-100
  trades30d: number;
  tags:      string[];
  lastActive: string;  // ISO
  totalVolume: number; // USD
  rank:      number;
}

const BASE = Date.now();
const D = (days: number) => new Date(BASE - days * 86400_000).toISOString();

export const SMART_MONEY_WALLETS: SmartWallet[] = [
  {
    address: '0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE',
    label: 'ETH Whale #1', chain: 'ethereum',
    pnl30d: 4_820_000, winRate: 78, trades30d: 47, totalVolume: 38_000_000,
    tags: ['DeFi', 'Swing'], lastActive: D(0), rank: 1,
  },
  {
    address: '0x28C6c06298d514Db089934071355E5743bf21d60',
    label: 'Binance Trader', chain: 'ethereum',
    pnl30d: 2_140_000, winRate: 71, trades30d: 112, totalVolume: 21_500_000,
    tags: ['Scalping', 'High Freq'], lastActive: D(1), rank: 2,
  },
  {
    address: '34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo',
    label: 'BTC Long-Haul', chain: 'bitcoin',
    pnl30d: 1_870_000, winRate: 84, trades30d: 8, totalVolume: 52_000_000,
    tags: ['HODLer', 'Macro'], lastActive: D(3), rank: 3,
  },
  {
    address: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
    label: 'SOL DeFi Pro', chain: 'solana',
    pnl30d: 980_000, winRate: 67, trades30d: 234, totalVolume: 9_800_000,
    tags: ['DeFi', 'LP'], lastActive: D(0), rank: 4,
  },
  {
    address: '0x8894E0a0c962CB723c1976a4421c95949bE2D4E3',
    label: 'BNB Arb Bot', chain: 'bnb',
    pnl30d: 760_000, winRate: 91, trades30d: 1_240, totalVolume: 7_200_000,
    tags: ['Arbitrage', 'Bot'], lastActive: D(0), rank: 5,
  },
  {
    address: '0xf3938337F7294fEF84E9b2C6D548A93F956cc281',
    label: 'Polygon Yield', chain: 'polygon',
    pnl30d: 540_000, winRate: 73, trades30d: 88, totalVolume: 4_100_000,
    tags: ['Yield', 'L2'], lastActive: D(2), rank: 6,
  },
  {
    address: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
    label: 'ETH NFT Flip', chain: 'ethereum',
    pnl30d: 420_000, winRate: 62, trades30d: 56, totalVolume: 3_200_000,
    tags: ['NFT', 'Swing'], lastActive: D(5), rank: 7,
  },
  {
    address: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
    label: 'Jupiter Aggregator', chain: 'solana',
    pnl30d: 310_000, winRate: 69, trades30d: 442, totalVolume: 2_800_000,
    tags: ['DEX', 'Aggregator'], lastActive: D(0), rank: 8,
  },
];

// ── Exchange flow simulation ───────────────────────────────────────────────────

export interface ExchangeFlow {
  exchange:  string;
  chain:     MonitoredChain;
  inflow24h: number;   // USD
  outflow24h: number;  // USD
  net24h:    number;   // inflow - outflow (positive = net inflow)
  reserve:   number;   // total USD on exchange
  logo:      string;   // emoji
  trend:     'accumulating' | 'distributing' | 'neutral';
}

function rnd(min: number, max: number): number {
  return Math.round(min + Math.random() * (max - min));
}

export function generateExchangeFlows(): ExchangeFlow[] {
  const seed = Math.floor(Date.now() / 300_000); // stable for 5 min
  const flows: ExchangeFlow[] = [
    { exchange: 'Binance',   chain: 'ethereum', inflow24h: rnd(800,1800)  * 1e6, outflow24h: rnd(600,1400) * 1e6, reserve: 22_000_000_000, logo: '🔶' },
    { exchange: 'Coinbase',  chain: 'ethereum', inflow24h: rnd(300,700)   * 1e6, outflow24h: rnd(250,650)  * 1e6, reserve: 8_400_000_000,  logo: '🔵' },
    { exchange: 'Kraken',    chain: 'bitcoin',  inflow24h: rnd(120,300)   * 1e6, outflow24h: rnd(100,280)  * 1e6, reserve: 3_200_000_000,  logo: '⚓' },
    { exchange: 'OKX',       chain: 'bitcoin',  inflow24h: rnd(400,900)   * 1e6, outflow24h: rnd(350,800)  * 1e6, reserve: 6_800_000_000,  logo: '⚫' },
    { exchange: 'Bybit',     chain: 'bnb',      inflow24h: rnd(200,500)   * 1e6, outflow24h: rnd(160,460)  * 1e6, reserve: 4_100_000_000,  logo: '🟡' },
    { exchange: 'Raydium',   chain: 'solana',   inflow24h: rnd(50,180)    * 1e6, outflow24h: rnd(40,170)   * 1e6, reserve: 820_000_000,    logo: '💜' },
    { exchange: 'QuickSwap', chain: 'polygon',  inflow24h: rnd(20,80)     * 1e6, outflow24h: rnd(15,75)    * 1e6, reserve: 320_000_000,    logo: '⬟' },
    { exchange: 'Bitfinex',  chain: 'ethereum', inflow24h: rnd(100,400)   * 1e6, outflow24h: rnd(90,380)   * 1e6, reserve: 2_900_000_000,  logo: '🟢' },
  ].map(f => {
    const net = f.inflow24h - f.outflow24h;
    const trend = net > f.inflow24h * 0.05 ? 'accumulating'
                : net < -f.inflow24h * 0.05 ? 'distributing'
                : 'neutral';
    return { ...f, net24h: net, trend };
  });
  return flows;
}

// ── Trending tokens ───────────────────────────────────────────────────────────

export interface TrendingToken {
  symbol:       string;
  name:         string;
  chain:        MonitoredChain;
  price:        number;
  change24h:    number;
  volume24h:    number;
  whaleActivity: 'very_high' | 'high' | 'medium' | 'low';
  netFlow:      number;   // net smart money flow USD (positive = buying)
  holders:      number;
  newHolders24h: number;
  icon:         string;
}

export const TRENDING_TOKENS: TrendingToken[] = [
  { symbol:'ETH',   name:'Ethereum',    chain:'ethereum', price:3420,    change24h:2.4,  volume24h:18_200_000_000, whaleActivity:'very_high', netFlow:+820_000_000, holders:1_200_000, newHolders24h:12_400, icon:'Ξ' },
  { symbol:'BTC',   name:'Bitcoin',     chain:'bitcoin',  price:65_800,  change24h:1.8,  volume24h:32_100_000_000, whaleActivity:'very_high', netFlow:+1_200_000_000, holders:900_000, newHolders24h:8_200, icon:'₿' },
  { symbol:'SOL',   name:'Solana',      chain:'solana',   price:172,     change24h:5.2,  volume24h:4_100_000_000,  whaleActivity:'high',     netFlow:+210_000_000, holders:450_000, newHolders24h:18_700, icon:'◎' },
  { symbol:'MATIC', name:'Polygon',     chain:'polygon',  price:0.87,    change24h:-1.2, volume24h:820_000_000,   whaleActivity:'medium',   netFlow:-45_000_000,  holders:380_000, newHolders24h:3_200,  icon:'⬟' },
  { symbol:'BNB',   name:'BNB',         chain:'bnb',      price:592,     change24h:0.8,  volume24h:2_900_000_000,  whaleActivity:'high',     netFlow:+98_000_000,  holders:620_000, newHolders24h:5_100,  icon:'⬡' },
  { symbol:'BONK',  name:'Bonk',        chain:'solana',   price:0.000028,change24h:14.8, volume24h:920_000_000,   whaleActivity:'very_high', netFlow:+180_000_000, holders:230_000, newHolders24h:42_000, icon:'🐕' },
  { symbol:'UNI',   name:'Uniswap',     chain:'ethereum', price:8.42,    change24h:3.1,  volume24h:310_000_000,   whaleActivity:'medium',   netFlow:+22_000_000,  holders:180_000, newHolders24h:2_100,  icon:'🦄' },
  { symbol:'LINK',  name:'Chainlink',   chain:'ethereum', price:14.7,    change24h:-0.9, volume24h:480_000_000,   whaleActivity:'medium',   netFlow:-12_000_000,  holders:220_000, newHolders24h:1_800,  icon:'🔗' },
  { symbol:'CAKE',  name:'PancakeSwap', chain:'bnb',      price:2.18,    change24h:7.3,  volume24h:190_000_000,   whaleActivity:'high',     netFlow:+38_000_000,  holders:140_000, newHolders24h:4_200,  icon:'🥞' },
  { symbol:'QUICK', name:'QuickSwap',   chain:'polygon',  price:0.048,   change24h:11.2, volume24h:42_000_000,    whaleActivity:'high',     netFlow:+8_400_000,   holders:62_000,  newHolders24h:3_800,  icon:'⚡' },
];
