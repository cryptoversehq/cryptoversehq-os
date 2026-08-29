/**
 * metaverseTypes.ts — §5.1 Virtual Land Analytics Type System
 *
 * Covers all four metaverses from the spec:
 *   The Sandbox   — Ethereum + Polygon, LAND parcels, 166,464 total
 *   Decentraland  — Ethereum, parcels + estates, 90,601 total
 *   Otherside     — Ethereum, Otherdeed lots + auctions
 *   NFT Worlds    — Ethereum, World ERC-721 tokens
 */

// ── Metaverse identity ────────────────────────────────────────────────────────

export type MetaverseId =
  | 'the-sandbox'
  | 'decentraland'
  | 'otherside'
  | 'nft-worlds';

export interface MetaverseMeta {
  id:          MetaverseId;
  name:        string;
  icon:        string;         // emoji
  color:       string;         // hex
  chain:       string;         // primary chain
  chains:      string[];       // all supported chains
  website:     string;
  totalLand:   number;         // total parcels/lots in existence
  landUnit:    string;         // "LAND" | "parcel" | "Otherdeed" | "World"
  features:    string[];       // e.g. ["Game builder", "Play-to-earn"]
  description: string;
}

export const METAVERSE_META: Record<MetaverseId, MetaverseMeta> = {
  'the-sandbox': {
    id: 'the-sandbox', name: 'The Sandbox', icon: '🟨', color: '#00ADEF',
    chain: 'Ethereum', chains: ['Ethereum', 'Polygon'],
    website: 'https://sandbox.game',
    totalLand: 166_464, landUnit: 'LAND',
    features: ['Game builder', 'VoxEdit creator', 'Play-to-earn', 'Brand partnerships'],
    description: 'User-generated virtual world on Ethereum. Build, own and monetize gaming experiences.',
  },
  decentraland: {
    id: 'decentraland', name: 'Decentraland', icon: '🌐', color: '#FF2D55',
    chain: 'Ethereum', chains: ['Ethereum'],
    website: 'https://decentraland.org',
    totalLand: 90_601, landUnit: 'Parcel',
    features: ['Estate NFTs', 'DAO governance', 'Events & venues', 'Wearables market'],
    description: 'Decentralized virtual world governed by a DAO. Own parcels, build estates, host events.',
  },
  otherside: {
    id: 'otherside', name: 'Otherside', icon: '🟣', color: '#7B3FE4',
    chain: 'Ethereum', chains: ['Ethereum'],
    website: 'https://otherside.xyz',
    totalLand: 200_000, landUnit: 'Otherdeed',
    features: ['BAYC/MAYC utility', 'Koda companions', 'Live events', 'Auction mechanics'],
    description: 'Yuga Labs\' interoperable metaverse powering the Ape ecosystem on Ethereum.',
  },
  'nft-worlds': {
    id: 'nft-worlds', name: 'NFT Worlds', icon: '🌍', color: '#39D353',
    chain: 'Ethereum', chains: ['Ethereum'],
    website: 'https://nftworlds.com',
    totalLand: 10_000, landUnit: 'World',
    features: ['Minecraft-compatible', 'WRLD token economy', 'Custom game modes', 'Multi-player'],
    description: 'Play-to-earn metaverse with Minecraft-compatible worlds, powered by the WRLD token.',
  },
};

// ── Land parcel ───────────────────────────────────────────────────────────────

export type LandRarity = 'common' | 'uncommon' | 'rare' | 'legendary';

export interface LandParcel {
  id:          string;           // UUIDv4
  metaverse:   MetaverseId;
  tokenId:     string;           // on-chain token ID / "#XXXX"
  x:           number;           // grid coordinate
  y:           number;
  district:    string;           // named district / estate name
  rarity:      LandRarity;
  floorPrice:  number;           // ETH
  floorPriceUsd: number;
  lastSalePrice: number;         // ETH, 0 if never sold
  owner:       string;           // short wallet address
  attributes:  Record<string, string>;   // e.g. { road: 'yes', plaza: 'adjacent' }
  proximity:   'center' | 'mid' | 'edge';  // distance from origin/hub
  isEstate:    boolean;          // Decentraland estate flag
  estateParcels?: number;        // number of parcels bundled in estate
}

// ── Metaverse stats ───────────────────────────────────────────────────────────

export interface MetaverseStats {
  metaverse:        MetaverseId;
  floorPrice:       number;      // ETH
  floorPriceUsd:    number;
  floorChange24h:   number;      // % change
  floorChange7d:    number;
  volume24h:        number;      // ETH
  volume24hUsd:     number;
  volume7d:         number;
  volume7dUsd:      number;
  totalSales24h:    number;
  avgSalePrice24h:  number;      // ETH
  marketCap:        number;      // ETH
  marketCapUsd:     number;
  activeListings:   number;
  uniqueOwners:     number;
  totalParcels:     number;
  listedRate:       number;      // % listed
  lastUpdated:      string;      // ISO-8601
}

// ── Land sale event ───────────────────────────────────────────────────────────

export interface LandSaleEvent {
  id:          string;
  metaverse:   MetaverseId;
  tokenId:     string;
  district:    string;
  x:           number;
  y:           number;
  price:       number;           // ETH
  priceUsd:    number;
  priceVsFloor: number;          // multiple of floor
  fromAddress: string;
  toAddress:   string;
  marketplace: string;
  txHash:      string;
  timestamp:   string;           // ISO-8601
  isEstate:    boolean;
  estateParcels?: number;
}

// ── District ──────────────────────────────────────────────────────────────────

export interface MetaverseDistrict {
  id:           string;
  metaverse:    MetaverseId;
  name:         string;
  description:  string;
  parcelCount:  number;
  floorPrice:   number;           // ETH above or below metaverse floor
  premiumPct:   number;           // % premium vs base floor
  color:        string;           // for map rendering
  category:     'commercial' | 'residential' | 'cultural' | 'gaming' | 'hub';
}

// ── Auction ───────────────────────────────────────────────────────────────────

export interface LandAuction {
  id:           string;
  metaverse:    MetaverseId;
  tokenId:      string;
  district:     string;
  startPrice:   number;           // ETH
  currentBid:   number;
  reserve:      number;
  bidCount:     number;
  endsAt:       string;           // ISO-8601
  isActive:     boolean;
}

// ── Global metaverse overview ─────────────────────────────────────────────────

export interface MetaverseGlobalSummary {
  totalVolumeUsd:       number;
  totalVolume24hUsd:    number;
  highestFloor:         { metaverse: MetaverseId; price: number } | null;
  highestVolume24h:     { metaverse: MetaverseId; volumeUsd: number } | null;
  mostListings:         { metaverse: MetaverseId; count: number } | null;
  totalActiveListings:  number;
  uniqueOwnersTotal:    number;
}

// ── Price history point ───────────────────────────────────────────────────────

export interface LandPricePoint {
  date:      string;   // YYYY-MM-DD
  floor:     number;
  volume:    number;
  avgPrice:  number;
}

// ── Rarity display ────────────────────────────────────────────────────────────

export const LAND_RARITY_META: Record<LandRarity, {
  label: string; color: string; icon: string; premium: number;
}> = {
  common:    { label: 'Common',    color: '#94a3b8', icon: '⚪', premium: 1.0 },
  uncommon:  { label: 'Uncommon',  color: '#22c55e', icon: '🟢', premium: 1.4 },
  rare:      { label: 'Rare',      color: '#3b82f6', icon: '🔵', premium: 2.1 },
  legendary: { label: 'Legendary', color: '#f59e0b', icon: '🟡', premium: 4.5 },
};

// ── Virtual land portfolio ────────────────────────────────────────────────────

export interface VirtualLandPosition {
  id:            string;
  metaverse:     MetaverseId;
  tokenId:       string;
  district:      string;
  x:             number;
  y:             number;
  buyPrice:      number;       // ETH
  buyPriceUsd:   number;
  currentFloor:  number;
  rarity:        LandRarity;
  purchasedAt:   string;
}

export interface VirtualLandPortfolio {
  balance:       number;       // USD virtual cash
  positions:     VirtualLandPosition[];
  closedTrades:  Array<{
    metaverse:   MetaverseId;
    tokenId:     string;
    buyPrice:    number;
    sellPrice:   number;
    pnl:         number;
    pnlPct:      number;
    closedAt:    string;
  }>;
  totalPnl:      number;
}

// ── Alert ─────────────────────────────────────────────────────────────────────

export interface LandAlert {
  id:          string;
  metaverse:   MetaverseId;
  type:        'floor_drop' | 'floor_pump' | 'auction_ending' | 'whale_buy';
  targetPrice: number;
  isActive:    boolean;
  createdAt:   string;
}
