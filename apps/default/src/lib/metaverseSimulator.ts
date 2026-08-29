/**
 * metaverseSimulator.ts — §5.1 Virtual Land Analytics Simulator
 *
 * Provides deterministic, seeded simulation for all four metaverses:
 *   The Sandbox, Decentraland, Otherside, NFT Worlds
 *
 * Functions:
 *   buildMetaverseStats()     — current stats for all 4 metaverses
 *   tickMetaverseStats()      — evolve stats on each polling tick (GBM drift)
 *   buildLandParcels()        — generate N land parcels for a metaverse
 *   generateLandSale()        — synthetic land sale event
 *   buildDistricts()          — named district list for each metaverse
 *   buildPriceHistory()       — 30-day floor + volume history
 *   buildActiveAuctions()     — live auction entries
 */

import type {
  MetaverseId, MetaverseStats, LandParcel, LandSaleEvent,
  MetaverseDistrict, LandAuction, LandPricePoint, LandRarity,
} from './metaverseTypes';
import { METAVERSE_META } from './metaverseTypes';
import { generateId } from './strategyUtils';

// ── PRNG ──────────────────────────────────────────────────────────────────────

function seededRng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return (s >>> 0) / 4_294_967_296;
  };
}

function strHash(s: string): number {
  let h = 2_166_136_261;
  for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16_777_619); }
  return h >>> 0;
}

function r2(v: number) { return Math.round(v * 100) / 100; }
function r4(v: number) { return Math.round(v * 10_000) / 10_000; }

const HEX = '0123456789abcdef';
function randomHex(n: number, rng: () => number) {
  return Array.from({ length: n }, () => HEX[Math.floor(rng() * 16)]).join('');
}
function evmAddr(rng: () => number) { return '0x' + randomHex(8, rng) + '…' + randomHex(4, rng); }
function txHash(rng: () => number)  { return '0x' + randomHex(64, rng); }

const ETH_USD = 3_400;

// ── Base stats seed ───────────────────────────────────────────────────────────

interface MetaverseBaseSeed {
  baseFloor:   number;   // ETH
  baseVol24h:  number;   // ETH
  baseOwners:  number;
  baseListings: number;
}

const METAVERSE_BASE_SEEDS: Record<MetaverseId, MetaverseBaseSeed> = {
  'the-sandbox': { baseFloor: 0.12,  baseVol24h: 18,   baseOwners: 22_800,  baseListings: 12_400 },
  'decentraland':{ baseFloor: 0.38,  baseVol24h: 15,   baseOwners: 8_600,   baseListings: 6_200  },
  'otherside':   { baseFloor: 0.80,  baseVol24h: 110,  baseOwners: 34_000,  baseListings: 28_000 },
  'nft-worlds':  { baseFloor: 0.28,  baseVol24h: 4,    baseOwners: 3_800,   baseListings: 420    },
};

// ── buildMetaverseStats ───────────────────────────────────────────────────────

export function buildInitialMetaverseStats(): Record<MetaverseId, MetaverseStats> {
  const result = {} as Record<MetaverseId, MetaverseStats>;
  const ids: MetaverseId[] = ['the-sandbox', 'decentraland', 'otherside', 'nft-worlds'];

  for (const id of ids) {
    const seed  = METAVERSE_BASE_SEEDS[id];
    const meta  = METAVERSE_META[id];
    const rng   = seededRng(strHash(id));

    const floor    = r4(seed.baseFloor  * (0.85 + rng() * 0.30));
    const vol24h   = r2(seed.baseVol24h * (0.70 + rng() * 0.60));
    const vol7d    = r2(vol24h * (5 + rng() * 3));
    const sales24h = Math.round(vol24h / floor * (0.6 + rng() * 0.4));
    const avgSale  = r4(vol24h / Math.max(1, sales24h));
    const listings = Math.round(seed.baseListings * (0.8 + rng() * 0.4));
    const owners   = Math.round(seed.baseOwners   * (0.9 + rng() * 0.2));
    const total    = meta.totalLand;
    const cap      = r2(floor * total);

    result[id] = {
      metaverse:        id,
      floorPrice:       floor,
      floorPriceUsd:    r2(floor * ETH_USD),
      floorChange24h:   r2((rng() - 0.48) * 24),
      floorChange7d:    r2((rng() - 0.45) * 40),
      volume24h:        vol24h,
      volume24hUsd:     r2(vol24h * ETH_USD),
      volume7d:         vol7d,
      volume7dUsd:      r2(vol7d * ETH_USD),
      totalSales24h:    sales24h,
      avgSalePrice24h:  avgSale,
      marketCap:        cap,
      marketCapUsd:     r2(cap * ETH_USD),
      activeListings:   listings,
      uniqueOwners:     owners,
      totalParcels:     total,
      listedRate:       r2((listings / total) * 100),
      lastUpdated:      new Date().toISOString(),
    };
  }
  return result;
}

// ── tickMetaverseStats ────────────────────────────────────────────────────────

export function tickMetaverseStats(
  stats: Record<MetaverseId, MetaverseStats>,
): Record<MetaverseId, MetaverseStats> {
  const next = { ...stats };
  for (const [id, s] of Object.entries(stats) as [MetaverseId, MetaverseStats][]) {
    const drift = (Math.random() - 0.495) * 0.03;
    const newFloor = Math.max(0.001, s.floorPrice * (1 + drift));
    const volDrift = (Math.random() - 0.48) * 0.05;
    const newVol = Math.max(0.1, s.volume24h * (1 + volDrift));
    const change = ((newFloor - s.floorPrice) / s.floorPrice) * 100;
    next[id] = {
      ...s,
      floorPrice:    r4(newFloor),
      floorPriceUsd: r2(newFloor * ETH_USD),
      floorChange24h: r2(s.floorChange24h * 0.85 + change * 0.15),
      volume24h:     r2(newVol),
      volume24hUsd:  r2(newVol * ETH_USD),
      lastUpdated:   new Date().toISOString(),
    };
  }
  return next;
}

// ── District definitions ──────────────────────────────────────────────────────

const SANDBOX_DISTRICTS: Array<Pick<MetaverseDistrict, 'name' | 'description' | 'category' | 'parcelCount' | 'premiumPct' | 'color'>> = [
  { name: 'The Hub',        description: 'Central gaming hub adjacent to premium venues',  category: 'hub',         parcelCount: 380,  premiumPct: 280, color: '#fbbf24' },
  { name: 'Atari',          description: 'Atari-branded gaming district',                   category: 'gaming',      parcelCount: 220,  premiumPct: 200, color: '#f472b6' },
  { name: 'Fashion Street', description: 'Digital fashion & brand flagship stores',         category: 'commercial',  parcelCount: 210,  premiumPct: 185, color: '#a78bfa' },
  { name: 'Crypto Valley',  description: 'DeFi and Web3 project HQ zone',                  category: 'commercial',  parcelCount: 460,  premiumPct: 140, color: '#60a5fa' },
  { name: 'Arts District',  description: 'NFT art galleries and creator studios',           category: 'cultural',    parcelCount: 180,  premiumPct: 120, color: '#34d399' },
  { name: 'Residential',    description: 'Suburban parcels, great for indie builders',      category: 'residential', parcelCount: 1200, premiumPct: 0,   color: '#94a3b8' },
];

const DECENTRALAND_DISTRICTS: Array<Pick<MetaverseDistrict, 'name' | 'description' | 'category' | 'parcelCount' | 'premiumPct' | 'color'>> = [
  { name: 'Genesis Plaza',  description: 'The original spawn point and community hub',      category: 'hub',         parcelCount: 52,   premiumPct: 420, color: '#fbbf24' },
  { name: 'Vegas City',     description: 'Entertainment district with casinos and clubs',   category: 'commercial',  parcelCount: 300,  premiumPct: 260, color: '#f87171' },
  { name: 'Fashion Street', description: 'Wearables and virtual fashion brands',            category: 'commercial',  parcelCount: 350,  premiumPct: 190, color: '#f472b6' },
  { name: 'Dragon City',    description: 'Asian-inspired cultural district',                category: 'cultural',    parcelCount: 260,  premiumPct: 130, color: '#fb923c' },
  { name: 'Museum District',description: 'NFT art museums and galleries',                   category: 'cultural',    parcelCount: 440,  premiumPct: 100, color: '#a78bfa' },
  { name: 'Road',           description: 'Public roads connecting districts',               category: 'residential', parcelCount: 8_000, premiumPct: -50, color: '#374151' },
];

const OTHERSIDE_DISTRICTS: Array<Pick<MetaverseDistrict, 'name' | 'description' | 'category' | 'parcelCount' | 'premiumPct' | 'color'>> = [
  { name: 'Koda Territory', description: 'Adjacent to Koda companion spawn zones',          category: 'hub',         parcelCount: 800,  premiumPct: 380, color: '#7B3FE4' },
  { name: 'Ape Village',    description: 'BAYC holder exclusive premium zone',              category: 'gaming',      parcelCount: 1_200, premiumPct: 290, color: '#fbbf24' },
  { name: 'Biome Alpha',    description: 'Rare Sewer biome lots',                           category: 'residential', parcelCount: 4_000, premiumPct: 140, color: '#34d399' },
  { name: 'Biome Beta',     description: 'Common biome lots, great for building',           category: 'residential', parcelCount: 12_000, premiumPct: 0, color: '#94a3b8' },
  { name: 'Citadel',        description: 'High-density event and auction zone',             category: 'commercial',  parcelCount: 600,  premiumPct: 220, color: '#60a5fa' },
];

const NFT_WORLDS_DISTRICTS: Array<Pick<MetaverseDistrict, 'name' | 'description' | 'category' | 'parcelCount' | 'premiumPct' | 'color'>> = [
  { name: 'Elite Worlds',   description: 'Top-10 ranked worlds with highest player counts', category: 'hub',         parcelCount: 10,   premiumPct: 900, color: '#fbbf24' },
  { name: 'Hub Worlds',     description: 'Popular worlds near the WRLD economy centre',     category: 'commercial',  parcelCount: 50,   premiumPct: 350, color: '#34d399' },
  { name: 'Game Worlds',    description: 'Customised Minecraft game mode worlds',            category: 'gaming',      parcelCount: 200,  premiumPct: 120, color: '#60a5fa' },
  { name: 'Indie Worlds',   description: 'Independent builder worlds',                      category: 'residential', parcelCount: 9_740, premiumPct: 0, color: '#94a3b8' },
];

export function buildDistricts(metaverse: MetaverseId): MetaverseDistrict[] {
  const sources: Record<MetaverseId, typeof SANDBOX_DISTRICTS> = {
    'the-sandbox':  SANDBOX_DISTRICTS,
    'decentraland': DECENTRALAND_DISTRICTS,
    'otherside':    OTHERSIDE_DISTRICTS,
    'nft-worlds':   NFT_WORLDS_DISTRICTS,
  };
  return sources[metaverse].map((d, i) => ({
    id:       `${metaverse}-dist-${i}`,
    metaverse,
    ...d,
    floorPrice: METAVERSE_BASE_SEEDS[metaverse].baseFloor * (1 + d.premiumPct / 100),
  }));
}

// ── buildLandParcels ──────────────────────────────────────────────────────────

const RARITY_WEIGHTS: LandRarity[] = [
  ...Array(60).fill('common' as LandRarity),
  ...Array(28).fill('uncommon' as LandRarity),
  ...Array(10).fill('rare' as LandRarity),
  ...Array(2).fill('legendary' as LandRarity),
];

function pickRarity(rng: () => number): LandRarity {
  return RARITY_WEIGHTS[Math.floor(rng() * RARITY_WEIGHTS.length)];
}

export function buildLandParcels(metaverse: MetaverseId, count = 24): LandParcel[] {
  const stats   = buildInitialMetaverseStats()[metaverse];
  const districts = buildDistricts(metaverse);
  const parcels: LandParcel[] = [];
  const meta    = METAVERSE_META[metaverse];

  for (let i = 0; i < count; i++) {
    const rng      = seededRng(strHash(`${metaverse}-parcel-${i}`));
    const district = districts[Math.floor(rng() * districts.length)];
    const rarity   = pickRarity(rng);
    const proximity: LandParcel['proximity'] = rng() < 0.15 ? 'center' : rng() < 0.4 ? 'mid' : 'edge';

    const rarityMult = { common: 1, uncommon: 1.4, rare: 2.2, legendary: 5.0 }[rarity];
    const proxMult   = { center: 2.2, mid: 1.3, edge: 1.0 }[proximity];
    const floor      = r4(stats.floorPrice * rarityMult * proxMult * (0.85 + rng() * 0.3));
    const lastSale   = rng() > 0.3 ? r4(floor * (0.7 + rng() * 0.6)) : 0;
    const isEstate   = metaverse === 'decentraland' && rarity !== 'common' && rng() > 0.7;

    const x = Math.floor(rng() * 400) - 200;
    const y = Math.floor(rng() * 400) - 200;

    parcels.push({
      id:              generateId(),
      metaverse,
      tokenId:         `#${1000 + i * 17}`,
      x,
      y,
      district:        district.name,
      rarity,
      floorPrice:      floor,
      floorPriceUsd:   r2(floor * ETH_USD),
      lastSalePrice:   lastSale,
      owner:           evmAddr(rng),
      attributes:      {
        road:     rng() > 0.6 ? 'adjacent' : 'no',
        plaza:    rng() > 0.8 ? 'adjacent' : 'no',
        biome:    ['Forest', 'Desert', 'Ocean', 'Snow', 'Swamp'][Math.floor(rng() * 5)],
      },
      proximity,
      isEstate,
      estateParcels:   isEstate ? 2 + Math.floor(rng() * 12) : undefined,
    });
  }

  return parcels;
}

// ── generateLandSale ──────────────────────────────────────────────────────────

export function generateLandSale(
  metaverse: MetaverseId,
  stats: MetaverseStats,
  seed: number,
): LandSaleEvent {
  const rng     = seededRng(seed);
  const districts = buildDistricts(metaverse);
  const district  = districts[Math.floor(rng() * districts.length)];
  const rarity    = pickRarity(rng);
  const rarityMult = { common: 1, uncommon: 1.5, rare: 2.5, legendary: 6.0 }[rarity];
  const price     = r4(stats.floorPrice * rarityMult * (0.8 + rng() * 0.5));
  const isEstate  = metaverse === 'decentraland' && rng() > 0.75;
  const marketplaces = ['OpenSea', 'Blur', 'LooksRare', 'Official Market', 'Tensor'];

  return {
    id:           generateId(),
    metaverse,
    tokenId:      `#${Math.floor(rng() * 100_000)}`,
    district:     district.name,
    x:            Math.floor(rng() * 400) - 200,
    y:            Math.floor(rng() * 400) - 200,
    price,
    priceUsd:     r2(price * ETH_USD),
    priceVsFloor: r2(price / stats.floorPrice),
    fromAddress:  evmAddr(rng),
    toAddress:    evmAddr(rng),
    marketplace:  marketplaces[Math.floor(rng() * marketplaces.length)],
    txHash:       txHash(rng),
    timestamp:    new Date(Date.now() - Math.floor(rng() * 3_600_000)).toISOString(),
    isEstate,
    estateParcels: isEstate ? 2 + Math.floor(rng() * 8) : undefined,
  };
}

// ── buildPriceHistory ─────────────────────────────────────────────────────────

export function buildPriceHistory(metaverse: MetaverseId, days = 30): LandPricePoint[] {
  const seed   = METAVERSE_BASE_SEEDS[metaverse];
  let floor    = seed.baseFloor * 0.85;
  let vol      = seed.baseVol24h * 0.7;
  const points: LandPricePoint[] = [];

  for (let i = 0; i < days; i++) {
    const rng   = seededRng(strHash(`${metaverse}-hist-${i}`));
    const drift = Math.sin(i * 0.3) * 0.04 + (rng() - 0.48) * 0.06;
    floor       = Math.max(0.001, floor * (1 + drift));
    vol         = Math.max(0.1,  vol   * (0.85 + rng() * 0.30));

    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    points.push({
      date:     d.toISOString().split('T')[0],
      floor:    r4(floor),
      volume:   r2(vol),
      avgPrice: r4(floor * (1.05 + rng() * 0.3)),
    });
  }
  return points;
}

// ── buildActiveAuctions ───────────────────────────────────────────────────────

export function buildActiveAuctions(metaverse: MetaverseId, count = 4): LandAuction[] {
  const stats     = buildInitialMetaverseStats()[metaverse];
  const districts = buildDistricts(metaverse);

  return Array.from({ length: count }, (_, i) => {
    const rng      = seededRng(strHash(`${metaverse}-auction-${i}`));
    const district = districts[Math.floor(rng() * districts.length)];
    const start    = r4(stats.floorPrice * (1.1 + rng() * 0.5));
    const bid      = r4(start * (1.05 + rng() * 0.8));
    const hoursLeft = 1 + Math.floor(rng() * 47);
    const endsAt   = new Date(Date.now() + hoursLeft * 3_600_000).toISOString();

    return {
      id:          `${metaverse}-auction-${i}`,
      metaverse,
      tokenId:     `#${10_000 + i * 333}`,
      district:    district.name,
      startPrice:  start,
      currentBid:  bid,
      reserve:     r4(bid * 1.2),
      bidCount:    2 + Math.floor(rng() * 20),
      endsAt,
      isActive:    true,
    };
  });
}

// ── Cold-start seeds for 20 sales ─────────────────────────────────────────────

export function buildColdStartSales(): LandSaleEvent[] {
  const ids: MetaverseId[] = ['the-sandbox', 'decentraland', 'otherside', 'nft-worlds'];
  const stats = buildInitialMetaverseStats();
  const sales: LandSaleEvent[] = [];
  for (let i = 0; i < 20; i++) {
    const mv = ids[i % ids.length];
    sales.push(generateLandSale(mv, stats[mv], strHash(`cold-${i}`)));
  }
  return sales;
}
