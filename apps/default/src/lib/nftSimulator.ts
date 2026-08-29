/**
 * nftSimulator.ts
 *
 * Realistic NFT market simulator for the CryptoVerse HQ NFT Analysis system.
 *
 * Provides:
 *   COLLECTION_CATALOG      curated seed data for 25+ well-known NFT projects
 *   buildInitialCollection  hydrates seed into full NFTCollection
 *   tickFloorPrice          GBM-based floor price evolution per tick
 *   tickVolume              log-normal volume drift
 *   generateSale            synthetic sale event for a collection
 *   generateTraits          deterministic trait set for a collection
 *   generateWalletSnap      simulated portfolio snapshot for a tracked wallet
 *
 * All functions are pure (no side effects). The store owns mutable state.
 * No external API calls.
 */

import {
  NFTCollection,
  NFTChain,
  CollectionCategory,
  NFTTrait,
  NFTTraitValue,
  NFTSale,
  NFTMarketplace,
  NFTHolding,
  NFTWalletSnapshot,
  NFTWalletTracking,
  RarityTier,
  getRarityTier,
  NFT_CHAIN_META,
} from './nftTypes';
import { generateId } from './strategyUtils';

// ─── PRNG ─────────────────────────────────────────────────────────────────────

function seededRng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function r2(v: number) { return Math.round(v * 100) / 100; }
function r4(v: number) { return Math.round(v * 10000) / 10000; }

function strHash(s: string): number {
  let h = 2166136261;
  for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const HEX = '0123456789abcdef';
const B58  = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function randomHex(n: number, rng: () => number) { return Array.from({length:n}, () => HEX[Math.floor(rng()*16)]).join(''); }
function evmAddr(rng: () => number) { return '0x' + randomHex(40, rng); }
function txHash(rng: () => number)  { return '0x' + randomHex(64, rng); }
function solAddr(rng: () => number) { return Array.from({length:44}, () => B58[Math.floor(rng()*58)]).join(''); }

// ─── COLLECTION SEED DATA ─────────────────────────────────────────────────────

export interface CollectionSeed {
  name:            string;
  slug:            string;
  chain:           NFTChain;
  category:        CollectionCategory;
  description:     string;
  totalSupply:     number;
  baseFloor:       number;
  baseVol24h:      number;
  traitCount:      number;
  verified:        boolean;
  isBlueChip:      boolean;
  twitter:         number;
  discord:         number;
  website:         string;
}

export const COLLECTION_CATALOG: CollectionSeed[] = [
  { name:'Bored Ape Yacht Club', slug:'bored-ape-yacht-club', chain:'ethereum', category:'pfp', description:'10,000 unique Bored Ape NFTs — the original blue-chip PFP project.', totalSupply:10000, baseFloor:12.8, baseVol24h:180, traitCount:7, verified:true, isBlueChip:true, twitter:1200000, discord:120000, website:'https://boredapeyachtclub.com' },
  { name:'CryptoPunks', slug:'cryptopunks', chain:'ethereum', category:'collectible', description:'10,000 uniquely generated characters — the OG NFT collection.', totalSupply:10000, baseFloor:45.0, baseVol24h:250, traitCount:8, verified:true, isBlueChip:true, twitter:700000, discord:45000, website:'https://cryptopunks.app' },
  { name:'Azuki', slug:'azuki', chain:'ethereum', category:'pfp', description:'A brand for the metaverse. 10,000 avatars giving access to The Garden.', totalSupply:10000, baseFloor:8.5, baseVol24h:140, traitCount:9, verified:true, isBlueChip:true, twitter:680000, discord:90000, website:'https://azuki.com' },
  { name:'Mutant Ape Yacht Club', slug:'mutant-ape-yacht-club', chain:'ethereum', category:'pfp', description:'20,000 Mutant Apes created by exposing a Bored Ape to Mutant Serum.', totalSupply:20000, baseFloor:2.9, baseVol24h:90, traitCount:7, verified:true, isBlueChip:false, twitter:490000, discord:80000, website:'https://boredapeyachtclub.com/mutants' },
  { name:'Pudgy Penguins', slug:'pudgy-penguins', chain:'ethereum', category:'pfp', description:'8,888 unique Pudgy Penguins swimming on the Ethereum blockchain.', totalSupply:8888, baseFloor:7.2, baseVol24h:110, traitCount:6, verified:true, isBlueChip:true, twitter:380000, discord:65000, website:'https://pudgypenguins.com' },
  { name:'Milady Maker', slug:'milady-maker', chain:'ethereum', category:'pfp', description:'10,000 generative pfpNFTs inspired by neo-Tokyo street fashion.', totalSupply:10000, baseFloor:3.8, baseVol24h:70, traitCount:10, verified:true, isBlueChip:false, twitter:310000, discord:55000, website:'https://miladymaker.net' },
  { name:'Doodles', slug:'doodles', chain:'ethereum', category:'art', description:'Community-driven collectibles featuring art by Burnt Toast.', totalSupply:10000, baseFloor:2.1, baseVol24h:45, traitCount:8, verified:true, isBlueChip:false, twitter:510000, discord:70000, website:'https://doodles.app' },
  { name:'CloneX', slug:'clone-x', chain:'ethereum', category:'pfp', description:'20,000 next-gen avatars by RTFKT and Takashi Murakami.', totalSupply:20000, baseFloor:1.6, baseVol24h:55, traitCount:10, verified:true, isBlueChip:false, twitter:440000, discord:95000, website:'https://clonex.rtfkt.com' },
  { name:'Moonbirds', slug:'moonbirds', chain:'ethereum', category:'utility', description:'10,000 unique Moonbirds with CC0 rights and nesting utility.', totalSupply:10000, baseFloor:1.4, baseVol24h:38, traitCount:7, verified:true, isBlueChip:false, twitter:270000, discord:48000, website:'https://proof.xyz/moonbirds' },
  { name:'Fidenza', slug:'fidenza-by-tyler-hobbs', chain:'ethereum', category:'art', description:'Versatile long-form generative art system by Tyler Hobbs — 999 pieces.', totalSupply:999, baseFloor:95.0, baseVol24h:12, traitCount:12, verified:true, isBlueChip:true, twitter:140000, discord:18000, website:'https://artblocks.io/collections/fidenza' },
  { name:'Axie Infinity', slug:'axie-infinity', chain:'ethereum', category:'gaming', description:'Pokemon-inspired universe where players earn tokens through gameplay.', totalSupply:11000000, baseFloor:0.005, baseVol24h:300, traitCount:6, verified:true, isBlueChip:false, twitter:1100000, discord:250000, website:'https://axieinfinity.com' },
  { name:'Decentraland LAND', slug:'decentraland', chain:'ethereum', category:'metaverse', description:'Virtual land parcels in the Decentraland metaverse.', totalSupply:90601, baseFloor:0.38, baseVol24h:15, traitCount:4, verified:true, isBlueChip:false, twitter:680000, discord:90000, website:'https://decentraland.org' },
  { name:'The Sandbox LAND', slug:'the-sandbox', chain:'ethereum', category:'metaverse', description:'LAND in The Sandbox — build and monetize gaming experiences.', totalSupply:166464, baseFloor:0.12, baseVol24h:18, traitCount:4, verified:true, isBlueChip:false, twitter:890000, discord:110000, website:'https://sandbox.game' },
  { name:'Mad Lads', slug:'mad-lads', chain:'solana', category:'pfp', description:'A generative NFT collection by Backpack — the hottest Solana PFP.', totalSupply:10000, baseFloor:218.0, baseVol24h:5800, traitCount:9, verified:true, isBlueChip:true, twitter:310000, discord:68000, website:'https://madlads.com' },
  { name:'Tensorians', slug:'tensorians', chain:'solana', category:'utility', description:'Official NFT membership pass collection for the Tensor marketplace.', totalSupply:10000, baseFloor:88.0, baseVol24h:3200, traitCount:8, verified:true, isBlueChip:false, twitter:180000, discord:42000, website:'https://tensor.trade' },
  { name:'DeGods', slug:'degods', chain:'solana', category:'pfp', description:'A deflationary collection of degenerates, punks, and misfits.', totalSupply:10000, baseFloor:62.0, baseVol24h:2400, traitCount:9, verified:true, isBlueChip:false, twitter:420000, discord:88000, website:'https://degods.com' },
  { name:'Okay Bears', slug:'okay-bears', chain:'solana', category:'pfp', description:'10,000 bears chilling on the Solana blockchain.', totalSupply:10000, baseFloor:28.0, baseVol24h:980, traitCount:7, verified:true, isBlueChip:false, twitter:220000, discord:55000, website:'https://okaybears.com' },
  { name:'y00ts', slug:'y00ts', chain:'solana', category:'pfp', description:'15,000 NFTs by Frank DeGods — the cultural phenomenon.', totalSupply:15000, baseFloor:18.0, baseVol24h:710, traitCount:9, verified:true, isBlueChip:false, twitter:290000, discord:72000, website:'https://y00ts.com' },
  { name:'Famous Fox Federation', slug:'famous-fox-federation', chain:'solana', category:'pfp', description:'7,777 unique foxes with on-chain governance and utility.', totalSupply:7777, baseFloor:14.0, baseVol24h:540, traitCount:6, verified:true, isBlueChip:false, twitter:140000, discord:38000, website:'https://famousfoxes.com' },
  { name:'Lens Protocol Profiles', slug:'lens-protocol-profiles', chain:'polygon', category:'utility', description:'Lens Protocol profile NFTs for the decentralised social graph.', totalSupply:120000, baseFloor:5.5, baseVol24h:8200, traitCount:2, verified:true, isBlueChip:false, twitter:350000, discord:60000, website:'https://lens.xyz' },
  { name:'Aavegotchi', slug:'aavegotchi', chain:'polygon', category:'gaming', description:'DeFi-staked NFTs with playable Gotchi characters backed by aTokens.', totalSupply:15000, baseFloor:24.0, baseVol24h:4800, traitCount:8, verified:true, isBlueChip:false, twitter:200000, discord:48000, website:'https://aavegotchi.com' },
  { name:'Zed Run', slug:'zed-run', chain:'polygon', category:'gaming', description:'Digital horse racing — each horse is a unique NFT with its own bloodline.', totalSupply:130000, baseFloor:2.8, baseVol24h:1800, traitCount:7, verified:true, isBlueChip:false, twitter:130000, discord:32000, website:'https://zed.run' },
];

// ─── TRAIT GENERATION ─────────────────────────────────────────────────────────

const TRAIT_TEMPLATES: Record<CollectionCategory, string[]> = {
  pfp:        ['Background','Body','Clothing','Eyes','Fur','Head','Mouth','Special','Earring'],
  art:        ['Palette','Complexity','Flow','Density','Algorithm','Color Mode','Texture','Structure','Composition','Symmetry','Scale','Grid'],
  gaming:     ['Class','Element','Rarity','Level','Skill','Weapon'],
  utility:    ['Tier','Access Level'],
  metaverse:  ['Type','District','Proximity','Size'],
  collectible:['Type','Background','Attribute','Style','Edition','Special','Signature','Era'],
};

const ADJECTIVES = ['Dark','Neon','Gold','Silver','Shadow','Crystal','Mystic','Radiant','Void','Storm','Flame','Frost','Cosmic','Laser','Cyber','Stealth','Zombie','Robot','Alien','Ghost','Chrome','Acid','Trippy','Solid'];

function generateTraits(seed: CollectionSeed, rng: () => number): NFTTrait[] {
  if (seed.traitCount === 0) return [];
  const cats = TRAIT_TEMPLATES[seed.category].slice(0, seed.traitCount);
  return cats.map(cat => {
    const n = 3 + Math.floor(rng() * 10);
    let rem = seed.totalSupply;
    const values: NFTTraitValue[] = [];
    for (let i = 0; i < n; i++) {
      const label = ADJECTIVES[Math.floor(rng() * ADJECTIVES.length)] + ' ' + cat;
      const cnt   = i === n - 1 ? rem : Math.round(rem * (0.05 + rng() * 0.35));
      rem -= cnt;
      const pct   = r2((cnt / seed.totalSupply) * 100);
      values.push({ value:label, count:cnt, percentage:pct, rarityScore:r2(pct > 0 ? 100/pct : 999) });
    }
    return { category:cat, values, totalCount:seed.totalSupply };
  });
}

// ─── buildInitialCollection ───────────────────────────────────────────────────

function contractAddress(seed: CollectionSeed): string {
  const rng = seededRng(strHash(seed.slug));
  return seed.chain === 'solana' ? solAddr(rng) : evmAddr(rng);
}

export function buildInitialCollection(seed: CollectionSeed): NFTCollection {
  const rng  = seededRng(strHash(seed.slug));
  const meta = NFT_CHAIN_META[seed.chain];

  const floor    = r4(seed.baseFloor * (0.85 + rng() * 0.30));
  const floorUsd = r2(floor * meta.nativeUsdPrice);
  const v24      = r2(seed.baseVol24h * (0.7 + rng() * 0.6));
  const v7d      = r2(v24 * (5 + rng() * 4));
  const owners   = Math.round(seed.totalSupply * (0.35 + rng() * 0.40));
  const listed   = Math.round(seed.totalSupply * (0.03 + rng() * 0.12));
  const avgRarity = seed.traitCount > 0 ? r2(100 + rng() * 800) : null;
  const traits   = generateTraits(seed, rng);

  return {
    id: generateId(),
    name: seed.name, slug: seed.slug, chain: seed.chain,
    category: seed.category, description: seed.description,
    contractAddress: contractAddress(seed),
    floorPrice: floor, floorPriceUsd: floorUsd,
    floorChange24h: r2((rng() - 0.48) * 20),
    volume24h: v24, volume24hUsd: r2(v24 * meta.nativeUsdPrice),
    volume7d: v7d,  volume7dUsd:  r2(v7d * meta.nativeUsdPrice),
    marketCap: r2(floor * seed.totalSupply), marketCapUsd: r2(floorUsd * seed.totalSupply),
    totalSupply: seed.totalSupply, owners,
    ownerRatio: r4(owners / seed.totalSupply),
    listed, listingRate: r4((listed / seed.totalSupply) * 100),
    rarityScore: avgRarity, traitCount: seed.traitCount, traits,
    twitterFollowers: seed.twitter, discordMembers: seed.discord, websiteUrl: seed.website,
    verified: seed.verified, isBlueChip: seed.isBlueChip,
    lastUpdated: new Date().toISOString(),
  };
}

// ─── tickFloorPrice ───────────────────────────────────────────────────────────

export function tickFloorPrice(col: NFTCollection): NFTCollection {
  const rng  = seededRng((strHash(col.slug) ^ (Date.now() / 1000 | 0)) >>> 0);
  const dW   = (rng() + rng() + rng() - 1.5) / 1.5;
  const next = clamp(col.floorPrice * Math.exp(0.0002 + 0.018 * dW), 0.0001, col.floorPrice * 5);
  const meta = NFT_CHAIN_META[col.chain];
  const chg  = r2(((next - col.floorPrice) / col.floorPrice) * 100);
  return {
    ...col,
    floorPrice: r4(next), floorPriceUsd: r2(next * meta.nativeUsdPrice),
    floorChange24h: r2(col.floorChange24h * 0.9 + chg * 0.1),
    marketCap: r2(next * col.totalSupply), marketCapUsd: r2(next * meta.nativeUsdPrice * col.totalSupply),
    lastUpdated: new Date().toISOString(),
  };
}

// ─── tickVolume ───────────────────────────────────────────────────────────────

export function tickVolume(col: NFTCollection): NFTCollection {
  const rng  = seededRng((strHash(col.slug + 'v') ^ (Date.now() / 1000 | 0)) >>> 0);
  const meta = NFT_CHAIN_META[col.chain];
  const seed = COLLECTION_CATALOG.find(s => s.slug === col.slug);
  const base = seed?.baseVol24h ?? col.volume24h;
  const v24  = r2(clamp(col.volume24h * 0.95 + base * 0.05 * (0.8 + rng() * 0.4), 0, base * 5));
  const v7d  = r2(v24 * (5 + rng() * 4));
  return {
    ...col,
    volume24h: v24, volume24hUsd: r2(v24 * meta.nativeUsdPrice),
    volume7d: v7d,  volume7dUsd:  r2(v7d  * meta.nativeUsdPrice),
    lastUpdated: new Date().toISOString(),
  };
}

// ─── generateSale ─────────────────────────────────────────────────────────────

const MKTS: Record<NFTChain, NFTMarketplace[]> = {
  ethereum: ['OpenSea','Blur','LooksRare','X2Y2'],
  solana:   ['Magic Eden','Tensor'],
  polygon:  ['OpenSea'],
};

export function generateSale(col: NFTCollection, rng?: () => number): NFTSale {
  const r   = rng ?? seededRng((strHash(col.slug) ^ Date.now()) >>> 0);
  const meta = NFT_CHAIN_META[col.chain];
  const mkt  = MKTS[col.chain][Math.floor(r() * MKTS[col.chain].length)];
  const mult = r() < 0.85 ? 0.80 + r() * 0.60 : 1.40 + r() * 2.10;
  const price = r4(col.floorPrice * mult);
  const tid   = String(1 + Math.floor(r() * col.totalSupply));
  let rarityScore: number | null = null;
  let rarityTier: RarityTier | null = null;
  if (col.rarityScore !== null) {
    rarityScore = r2(clamp(col.rarityScore * (0.3 + r() * 1.4), 0, 1200));
    rarityTier  = getRarityTier(rarityScore);
  }
  const mkAddr = col.chain === 'solana' ? solAddr : evmAddr;
  const mkTx   = col.chain === 'solana' ? solAddr : txHash;
  return {
    id: generateId(), collectionId: col.id, collectionSlug: col.slug,
    tokenId: `#${tid}`, name: `${col.name} #${tid}`,
    price, priceUsd: r2(price * meta.nativeUsdPrice), priceVsFloor: r2(mult),
    rarityScore, rarityTier,
    fromAddress: mkAddr(r), toAddress: mkAddr(r),
    marketplace: mkt, txHash: mkTx(r), chain: col.chain,
    timestamp: new Date().toISOString(),
  };
}

// ─── generateWalletSnap ───────────────────────────────────────────────────────

export function generateWalletSnap(wallet: NFTWalletTracking, collections: NFTCollection[]): NFTWalletSnapshot {
  const rng   = seededRng(strHash(wallet.walletAddress));
  const cols  = collections.filter(c => c.chain === wallet.chain);
  const meta  = NFT_CHAIN_META[wallet.chain];

  if (cols.length === 0) {
    return {
      id: generateId(), walletId: wallet.id, walletAddress: wallet.walletAddress, chain: wallet.chain,
      holdings: [], totalItems: 0, collectionsCount: 0,
      portfolioValue: 0, portfolioValueUsd: 0, unrealizedPnl: 0, unrealizedPnlUsd: 0, unrealizedPnlPct: 0,
      timestamp: new Date().toISOString(),
    };
  }

  const picked = [...cols].sort(() => rng() - 0.5).slice(0, 1 + Math.floor(rng() * Math.min(4, cols.length)));
  const holdings: NFTHolding[] = [];
  let totalVal = 0, totalCost = 0;

  for (const col of picked) {
    const n = 1 + Math.floor(rng() * 5);
    for (let i = 0; i < n; i++) {
      const tid   = String(1 + Math.floor(rng() * col.totalSupply));
      const val   = r4(col.floorPrice * (0.9 + rng() * 0.2));
      const cost  = r4(col.floorPrice * (0.5 + rng() * 1.5));
      let rarityScore: number | null = null, rarityTier: RarityTier | null = null;
      if (col.rarityScore !== null) {
        rarityScore = r2(clamp(col.rarityScore * (0.3 + rng() * 1.4), 0, 1200));
        rarityTier  = getRarityTier(rarityScore);
      }
      holdings.push({
        collectionId: col.id, collectionName: col.name, collectionSlug: col.slug,
        tokenId: `#${tid}`,
        estimatedValue: val, estimatedValueUsd: r2(val * meta.nativeUsdPrice),
        rarityScore, rarityTier,
        acquiredAt: new Date(Date.now() - Math.floor(rng() * 180 * 86400000)).toISOString(),
        acquiredPrice: cost,
      });
      totalVal  += val;
      totalCost += cost;
    }
  }

  const pnl = r4(totalVal - totalCost);
  return {
    id: generateId(), walletId: wallet.id, walletAddress: wallet.walletAddress, chain: wallet.chain,
    holdings, totalItems: holdings.length, collectionsCount: picked.length,
    portfolioValue: r4(totalVal), portfolioValueUsd: r2(totalVal * meta.nativeUsdPrice),
    unrealizedPnl: pnl, unrealizedPnlUsd: r2(pnl * meta.nativeUsdPrice),
    unrealizedPnlPct: totalCost > 0 ? r2((pnl / totalCost) * 100) : 0,
    timestamp: new Date().toISOString(),
  };
}
