/**
 * nftTypes.ts
 *
 * Complete type definitions for the CryptoVerse HQ NFT Analysis system.
 *
 * Covers:
 *   - NFTCollection       (live collection stats, floor, volume, supply)
 *   - NFTWalletTracking   (user-tracked wallets)
 *   - NFTTrait            (collection trait categories & values)
 *   - NFTSale             (individual NFT sale events in the feed)
 *   - NFTActivity         (on-chain activity: list, delist, transfer, mint)
 *   - NFTWalletSnapshot   (portfolio snapshot for a tracked wallet)
 *   - RarityTier          (rarity classification bands)
 *   - NFTChain            (supported chains)
 *   - Filters / sort      (for collection list, sales feed, wallet views)
 *   - Constants
 */

// ─────────────────────────────────────────────────────────────────────────────
// CHAIN
// ─────────────────────────────────────────────────────────────────────────────

export type NFTChain = 'ethereum' | 'solana' | 'polygon';

export interface NFTChainMeta {
  id:          NFTChain;
  name:        string;
  symbol:      string;   // native currency symbol used for floor prices
  decimals:    number;
  explorerUrl: string;   // base URL for contract/tx links
  color:       string;   // hex brand color
  icon:        string;   // emoji icon
  /** Typical USD price per native unit (for USD conversion display). */
  nativeUsdPrice: number;
}

export const NFT_CHAIN_META: Record<NFTChain, NFTChainMeta> = {
  ethereum: {
    id: 'ethereum', name: 'Ethereum', symbol: 'ETH', decimals: 18,
    explorerUrl: 'https://etherscan.io/address',
    color: '#627eea', icon: 'Ξ', nativeUsdPrice: 3_400,
  },
  solana: {
    id: 'solana', name: 'Solana', symbol: 'SOL', decimals: 9,
    explorerUrl: 'https://solscan.io/account',
    color: '#9945ff', icon: '◎', nativeUsdPrice: 170,
  },
  polygon: {
    id: 'polygon', name: 'Polygon', symbol: 'MATIC', decimals: 18,
    explorerUrl: 'https://polygonscan.com/address',
    color: '#8247e5', icon: '⬡', nativeUsdPrice: 0.90,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// RARITY TIERS
// ─────────────────────────────────────────────────────────────────────────────

export type RarityTier =
  | 'common'      // score 0 – 200
  | 'uncommon'    // 201 – 400
  | 'rare'        // 401 – 600
  | 'epic'        // 601 – 800
  | 'legendary';  // > 800

export function getRarityTier(score: number): RarityTier {
  if (score > 800) return 'legendary';
  if (score > 600) return 'epic';
  if (score > 400) return 'rare';
  if (score > 200) return 'uncommon';
  return 'common';
}

export const RARITY_TIER_META: Record<RarityTier, {
  label:  string;
  color:  string;
  bg:     string;
  text:   string;
  border: string;
  icon:   string;
}> = {
  common:    { label: 'Common',    color: '#94a3b8', bg: 'bg-slate-500/10',   text: 'text-slate-400',   border: 'border-slate-500/20',   icon: '⚪' },
  uncommon:  { label: 'Uncommon',  color: '#22c55e', bg: 'bg-green-500/10',   text: 'text-green-400',   border: 'border-green-500/20',   icon: '🟢' },
  rare:      { label: 'Rare',      color: '#3b82f6', bg: 'bg-blue-500/10',    text: 'text-blue-400',    border: 'border-blue-500/20',    icon: '🔵' },
  epic:      { label: 'Epic',      color: '#a855f7', bg: 'bg-purple-500/10',  text: 'text-purple-400',  border: 'border-purple-500/20',  icon: '🟣' },
  legendary: { label: 'Legendary', color: '#f59e0b', bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/20',   icon: '🟡' },
};

// ─────────────────────────────────────────────────────────────────────────────
// NFT TRAIT
// ─────────────────────────────────────────────────────────────────────────────

export interface NFTTraitValue {
  value:       string;  // e.g. "Zombie"
  count:       number;  // how many NFTs in collection have this value
  percentage:  number;  // % of total supply
  rarityScore: number;  // inverse-frequency score contribution
}

export interface NFTTrait {
  category:   string;   // e.g. "Background", "Fur", "Eyes"
  values:     NFTTraitValue[];
  totalCount: number;   // items with this trait defined
}

// ─────────────────────────────────────────────────────────────────────────────
// NFT COLLECTION
// ─────────────────────────────────────────────────────────────────────────────

export type CollectionCategory =
  | 'pfp'          // Profile Picture Projects
  | 'art'          // Generative / 1/1 Art
  | 'gaming'       // In-game assets
  | 'utility'      // Access passes, memberships
  | 'metaverse'    // Virtual land / items
  | 'collectible'; // Sports cards, trading cards

export interface NFTCollection {
  // ── Identity ──────────────────────────────────────────────────────────────
  id:              string;    // UUIDv4 primary key
  name:            string;    // e.g. "Bored Ape Yacht Club"
  slug:            string;    // e.g. "bored-ape-yacht-club"
  chain:           NFTChain;
  contractAddress: string;
  category:        CollectionCategory;
  description:     string;

  // ── Market stats ──────────────────────────────────────────────────────────
  floorPrice:     number;    // in native currency (ETH / SOL / MATIC)
  floorPriceUsd:  number;    // USD equivalent
  floorChange24h: number;    // % change in floor price over 24h
  volume24h:      number;    // native currency
  volume24hUsd:   number;
  volume7d:       number;    // native currency
  volume7dUsd:    number;
  marketCap:      number;    // floorPrice × totalSupply, native currency
  marketCapUsd:   number;

  // ── Supply & ownership ────────────────────────────────────────────────────
  totalSupply: number;
  owners:      number;
  ownerRatio:  number;   // owners / totalSupply (decentralisation metric)
  listed:      number;   // how many NFTs currently listed for sale
  listingRate: number;   // listed / totalSupply as %

  // ── Rarity ────────────────────────────────────────────────────────────────
  rarityScore:  number | null;   // average rarity score (null if no traits)
  traitCount:   number;          // number of distinct trait categories
  traits:       NFTTrait[];

  // ── Social ────────────────────────────────────────────────────────────────
  twitterFollowers: number;
  discordMembers:   number;
  websiteUrl:       string;

  // ── Metadata ──────────────────────────────────────────────────────────────
  verified:     boolean;
  isBlueChip:   boolean;   // floor > 10 ETH / 1000 SOL historically
  lastUpdated:  string;    // ISO-8601
}

// ─────────────────────────────────────────────────────────────────────────────
// NFT SALE EVENT
// ─────────────────────────────────────────────────────────────────────────────

export type NFTMarketplace = 'OpenSea' | 'Blur' | 'Magic Eden' | 'LooksRare' | 'X2Y2' | 'Tensor';

export interface NFTSale {
  id:              string;   // UUIDv4
  collectionId:    string;   // references NFTCollection.id
  collectionSlug:  string;
  tokenId:         string;   // e.g. "#3749"
  name:            string;   // e.g. "Bored Ape #3749"

  price:           number;   // native currency
  priceUsd:        number;
  priceVsFloor:    number;   // ratio: sale price / floor price
  rarityScore:     number | null;
  rarityTier:      RarityTier | null;

  fromAddress:     string;
  toAddress:       string;
  marketplace:     NFTMarketplace;
  txHash:          string;
  chain:           NFTChain;

  timestamp:       string;   // ISO-8601
}

// ─────────────────────────────────────────────────────────────────────────────
// NFT ACTIVITY (non-sale events)
// ─────────────────────────────────────────────────────────────────────────────

export type NFTActivityType = 'list' | 'delist' | 'transfer' | 'mint' | 'offer' | 'sale';

export interface NFTActivity {
  id:             string;
  collectionId:   string;
  collectionSlug: string;
  tokenId:        string;
  activityType:   NFTActivityType;
  price:          number | null;   // null for transfers/mints
  priceUsd:       number | null;
  fromAddress:    string;
  toAddress:      string | null;   // null for listings
  marketplace:    NFTMarketplace | null;
  txHash:         string;
  chain:          NFTChain;
  timestamp:      string;
}

// ─────────────────────────────────────────────────────────────────────────────
// NFT WALLET TRACKING
// ─────────────────────────────────────────────────────────────────────────────

export interface NFTWalletTracking {
  // ── Identity ──────────────────────────────────────────────────────────────
  id:            string;   // UUIDv4 primary key
  userId:        string;   // references users.id
  walletAddress: string;
  chain:         NFTChain;
  name:          string;   // user-defined label for this wallet
  isActive:      boolean;
  createdAt:     string;   // ISO-8601
}

// ─────────────────────────────────────────────────────────────────────────────
// NFT WALLET SNAPSHOT  (portfolio value at one point in time)
// ─────────────────────────────────────────────────────────────────────────────

export interface NFTHolding {
  collectionId:   string;
  collectionName: string;
  collectionSlug: string;
  tokenId:        string;
  estimatedValue: number;    // floor × 1 (simplified)
  estimatedValueUsd: number;
  rarityScore:    number | null;
  rarityTier:     RarityTier | null;
  acquiredAt:     string;    // ISO-8601
  acquiredPrice:  number;    // price paid (simulated)
}

export interface NFTWalletSnapshot {
  id:            string;
  walletId:      string;  // references NFTWalletTracking.id
  walletAddress: string;
  chain:         NFTChain;

  holdings:         NFTHolding[];
  totalItems:       number;
  collectionsCount: number;

  portfolioValue:    number;   // native currency sum
  portfolioValueUsd: number;
  unrealizedPnl:     number;   // portfolio value − cost basis (native)
  unrealizedPnlUsd:  number;
  unrealizedPnlPct:  number;   // %

  timestamp: string;  // ISO-8601
}

// ─────────────────────────────────────────────────────────────────────────────
// FILTERS & SORTING — COLLECTIONS
// ─────────────────────────────────────────────────────────────────────────────

export type CollectionSortKey =
  | 'volume_24h_desc' | 'volume_7d_desc'
  | 'floor_desc'      | 'floor_asc'
  | 'market_cap_desc' | 'owners_desc'
  | 'floor_change_desc' | 'floor_change_asc'
  | 'name_asc';

export interface CollectionFilters {
  chains:         NFTChain[];
  categories:     CollectionCategory[];
  verified:       boolean | null;
  isBlueChip:     boolean | null;
  minFloor:       number;
  maxFloor:       number;
  minVolume24h:   number;
  search:         string;
  sortBy:         CollectionSortKey;
}

export const DEFAULT_COLLECTION_FILTERS: CollectionFilters = {
  chains:       [],
  categories:   [],
  verified:     null,
  isBlueChip:   null,
  minFloor:     0,
  maxFloor:     Infinity,
  minVolume24h: 0,
  search:       '',
  sortBy:       'volume_24h_desc',
};

// ─────────────────────────────────────────────────────────────────────────────
// FILTERS & SORTING — SALES FEED
// ─────────────────────────────────────────────────────────────────────────────

export type SaleSortKey = 'newest' | 'highest_price' | 'highest_vs_floor';

export interface SaleFeedFilters {
  collectionIds:  string[];
  chains:         NFTChain[];
  rarityTiers:    RarityTier[];
  minPrice:       number;
  minPriceUsd:    number;
  minVsFloor:     number;   // only sales >= X× floor
  marketplaces:   NFTMarketplace[];
  sortBy:         SaleSortKey;
}

export const DEFAULT_SALE_FILTERS: SaleFeedFilters = {
  collectionIds:  [],
  chains:         [],
  rarityTiers:    [],
  minPrice:       0,
  minPriceUsd:    0,
  minVsFloor:     0,
  marketplaces:   [],
  sortBy:         'newest',
};

// ─────────────────────────────────────────────────────────────────────────────
// FILTERS & SORTING — WALLET TRACKING
// ─────────────────────────────────────────────────────────────────────────────

export type WalletTrackSortKey = 'newest' | 'name_asc' | 'highest_value';

export interface WalletTrackFilters {
  chains:   NFTChain[];
  isActive: boolean | null;
  search:   string;
  sortBy:   WalletTrackSortKey;
}

export const DEFAULT_WALLET_FILTERS: WalletTrackFilters = {
  chains:   [],
  isActive: null,
  search:   '',
  sortBy:   'newest',
};

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** How often floor prices and volumes update (ms). */
export const NFT_TICK_INTERVAL_MS = 20_000;  // every 20 seconds

/** Max NFT collections tracked in the registry. */
export const MAX_COLLECTIONS = 80;

/** Max sales stored in the global feed before ring-buffering. */
export const MAX_SALES_FEED = 500;

/** Max activity events per collection. */
export const MAX_ACTIVITY_PER_COLLECTION = 100;

/** Max wallet snapshots stored per wallet. */
export const MAX_SNAPSHOTS_PER_WALLET = 48;

/** Max tracked wallets per user. */
export const MAX_WALLETS_PER_USER = 20;

/** Number of cold-start sales to seed on first load. */
export const COLD_START_SALES = 60;

/** Blue-chip floor threshold in ETH. */
export const BLUE_CHIP_FLOOR_ETH = 5;

// ─────────────────────────────────────────────────────────────────────────────
// RESULT TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface AddWalletResult {
  ok:       boolean;
  walletId?: string;
  errors?:  string[];
}

export interface UpdateWalletResult {
  ok:     boolean;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN STATS
// ─────────────────────────────────────────────────────────────────────────────

export interface NFTGlobalStats {
  totalCollections:   number;
  verifiedCollections: number;
  blueChipCount:      number;
  totalSalesTracked:  number;
  totalVolumeUsd:     number;
  avgFloorEth:        number;
  highestFloorCollection: { name: string; floorPrice: number; chain: NFTChain } | null;
  highestVolumeCollection: { name: string; volume24hUsd: number } | null;
  trackedWallets:     number;
  byChain:            Record<NFTChain, { collections: number; volume24hUsd: number }>;
  byCategory:         Record<CollectionCategory, number>;
}
