/**
 * nftUtils.ts — Shared helpers for the NFT Analytics feature
 */
import type { NFTChain, NFTMarketplace, CollectionCategory, RarityTier } from '../../lib/nftTypes';

// ── Formatters ────────────────────────────────────────────────────────────────

export function fmtNative(value: number, decimals = 4): string {
  if (value >= 1000) return value.toFixed(0);
  if (value >= 100)  return value.toFixed(1);
  if (value >= 1)    return value.toFixed(decimals > 2 ? 2 : decimals);
  return value.toFixed(decimals);
}

export function fmtUsd(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000)     return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000)         return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export function fmtPct(v: number, showSign = true): string {
  const sign = showSign && v > 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

export function fmtAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000)      return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000)   return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000)  return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

// ── Chain display ─────────────────────────────────────────────────────────────

export const CHAIN_DISPLAY: Record<NFTChain, { name: string; icon: string; color: string; symbol: string }> = {
  ethereum: { name: 'Ethereum', icon: 'Ξ',  color: '#627eea', symbol: 'ETH' },
  solana:   { name: 'Solana',   icon: '◎',  color: '#9945ff', symbol: 'SOL' },
  polygon:  { name: 'Polygon',  icon: '⬡', color: '#8247e5', symbol: 'MATIC' },
};

// ── Marketplace display ───────────────────────────────────────────────────────

export const MARKETPLACE_DISPLAY: Record<NFTMarketplace, { name: string; color: string; icon: string }> = {
  'OpenSea':    { name: 'OpenSea',    color: '#2081e2', icon: '🌊' },
  'Blur':       { name: 'Blur',       color: '#ff6600', icon: '🔥' },
  'LooksRare':  { name: 'LooksRare',  color: '#0ce466', icon: '👀' },
  'Magic Eden': { name: 'Magic Eden', color: '#e42575', icon: '🪄' },
  'X2Y2':       { name: 'X2Y2',       color: '#8bc5ff', icon: '✕' },
  'Tensor':     { name: 'Tensor',     color: '#a3e635', icon: '⚡' },
};

// ── Category display ──────────────────────────────────────────────────────────

export const CATEGORY_DISPLAY: Record<CollectionCategory, { name: string; icon: string; color: string }> = {
  pfp:         { name: 'PFP',         icon: '🖼️', color: '#60a5fa' },
  art:         { name: 'Art',          icon: '🎨', color: '#f472b6' },
  gaming:      { name: 'Gaming',       icon: '🎮', color: '#34d399' },
  utility:     { name: 'Utility',      icon: '🔑', color: '#fbbf24' },
  metaverse:   { name: 'Metaverse',    icon: '🌐', color: '#a78bfa' },
  collectible: { name: 'Collectible',  icon: '🃏', color: '#fb923c' },
};

// ── Rarity display ────────────────────────────────────────────────────────────

export const RARITY_DISPLAY: Record<RarityTier, { label: string; color: string; bg: string; icon: string }> = {
  common:    { label: 'Common',    color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', icon: '⚪' },
  uncommon:  { label: 'Uncommon',  color: '#22c55e', bg: 'rgba(34,197,94,0.1)',   icon: '🟢' },
  rare:      { label: 'Rare',      color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', icon: '🔵' },
  epic:      { label: 'Epic',      color: '#a855f7', bg: 'rgba(168,85,247,0.1)', icon: '🟣' },
  legendary: { label: 'Legendary', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', icon: '🟡' },
};

// ── NFT virtual trading (local only) ─────────────────────────────────────────

export interface VirtualNFTPosition {
  collectionId:   string;
  collectionName: string;
  collectionSlug: string;
  chain:          NFTChain;
  tokenId:        string;
  buyPrice:       number;    // native
  buyPriceUsd:    number;
  currentFloor:   number;
  currentFloorUsd: number;
  quantity:       number;
  purchasedAt:    string;   // ISO
}

export interface VirtualNFTPortfolio {
  balance:         number;  // USD (virtual cash)
  totalInvested:   number;  // USD
  positions:       VirtualNFTPosition[];
  closedTrades:    ClosedNFTTrade[];
  totalPnl:        number;  // USD (realized)
}

export interface ClosedNFTTrade {
  collectionName: string;
  tokenId:        string;
  buyPrice:       number;
  sellPrice:      number;
  pnl:            number;
  pnlPct:         number;
  closedAt:       string;
}

const PORTFOLIO_KEY = 'cryptoverse_nft_virtual_portfolio_v1';

export function loadPortfolio(): VirtualNFTPortfolio {
  try {
    return JSON.parse(localStorage.getItem(PORTFOLIO_KEY) || 'null') ?? {
      balance: 50_000,
      totalInvested: 0,
      positions: [],
      closedTrades: [],
      totalPnl: 0,
    };
  } catch {
    return { balance: 50_000, totalInvested: 0, positions: [], closedTrades: [], totalPnl: 0 };
  }
}

export function savePortfolio(p: VirtualNFTPortfolio) {
  localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(p));
}

// ── Image URL helpers ─────────────────────────────────────────────────────────

/** Known OpenSea CDN collection image slugs (real images from opensea.io). */
const KNOWN_COLLECTION_IMAGES: Record<string, string> = {
  'bored-ape-yacht-club':     'https://i.seadn.io/gae/Ju9CkWtV-1Okvf45wo8UctR-M9He2PjILP0oOvxE89AyiPPGtrR3gysu1Zgy0hjd2xKIgjJJtWIc0ybj4Vd7wv8t3pxDGHoJBzDB',
  'cryptopunks':              'https://i.seadn.io/gae/BdxvLseXcfl57BiuQcQYdJ64v-aI8din7WPk0Pgo3qQFhAUH-B6i-dCqqc_mCkRIzULmwzwecnohLhrcH8A9mpWIZqA7ygc52Sr81hE',
  'mutant-ape-yacht-club':    'https://i.seadn.io/gae/lHexKRMpw-aoSyB1WdFBff5yfANLReFxHzt1DOj_sg7mS14yARpuvYcUtsyyx-Nkpk6WTcUPFoG53VnLJezYi8hAs0OxNZwlw6Y-dmI',
  'azuki':                    'https://i.seadn.io/gae/H8jOCJuQokNqGBpkBN5wk1oZwO7LM8bNnrHCaekV2nKjnCqw6UB5oaH8XyNeBDj6bA_n1mjejzhFQUP3O1NfjFLHr3FOaeHcTOOT',
  'doodles-official':         'https://i.seadn.io/gae/7B0qai02OdHA8P_EOVK672qUliyjQdQDGNrACxs7WnTgZAkJa_wWURnIFKeOh5VTf8cfTqW3wQpozGedaC9mteKphEOtztls02RlWQ',
  'clonex':                   'https://i.seadn.io/gae/XN0XuD8Uh3jyRWNtPTFeXJg_ht8m5ofDx6aHklOiy4amhFuWUa0JaR6Jo49oa8o5fEJNPECiOm5_kdsCWvngcAAsWIBExW3cmgnqJw',
  'pudgy-penguins':           'https://i.seadn.io/gae/yNi-XdGxsgQCPpqSio4o31ygAV6wURdIdInWRcFIl46UjUQ1eV7BEndGe8L661OoG-clRi7EgInLX4LPu9Jfw4fq0bnVYHqg7RFi',
  'cool-cats-nft':            'https://i.seadn.io/gae/LIov33kogXOK4XZd2ESj29sqm_Hww5JSdO7AFn5wjt8xgnJJ0UpNV9y2qxQuyJhWMxihz2G6tWSOJmeCWyLBDv_XsEr2DlnZJBXPCQ',
  'world-of-women-nft':       'https://i.seadn.io/gae/EFAWWZaYeEGVMJrAJsCPjiNjQVvlIe8uPbKq9hBDnmGpS2n4fRUXafRvGPskjSZgRFR-PWkHDSDMOxQVmHXgLdI7BKgYgOtF',
  'veefriends':               'https://i.seadn.io/gae/cnkaUARUJDFEM4FjCb2G5GEFX2i4nqLFQYmBPRsoTIpF_A-yRjiSNGlBP_zuN_AeFJCErwqSJ5CUjQpYUvfMhNNLq3BtTqAzuy6F',
  'moonbirds':                'https://i.seadn.io/gae/H-eyNE1MwL5ohL-tCfn_Xa1Sl9M9B4612tLYeUlQubzt4ewhr4huJIR5OLuyO3Z5PpJFSwdm7rq-TikAh7f5eUw338A2cy6HRH75',
};

/** Gradient-based collection colors (fallback when no image available). */
const COLLECTION_GRADIENTS: Record<string, [string, string]> = {
  'bored-ape-yacht-club':    ['#1a1a2e', '#16213e'],
  'cryptopunks':             ['#2d1b69', '#0f3460'],
  'mutant-ape-yacht-club':   ['#533483', '#0f3460'],
  'azuki':                   ['#e94560', '#16213e'],
  'doodles-official':        ['#f9ed69', '#f08a5d'],
  'clonex':                  ['#00d2ff', '#3a7bd5'],
  'pudgy-penguins':          ['#43e97b', '#38f9d7'],
  'cool-cats-nft':           ['#fa709a', '#fee140'],
  'world-of-women-nft':      ['#a18cd1', '#fbc2eb'],
  'veefriends':              ['#ffecd2', '#fcb69f'],
  'moonbirds':               ['#0c3483', '#a2b6df'],
};

/** Cache of tried-and-failed image URLs so we skip known-broken ones per session. */
const failedImageUrls = new Set<string>();

/** Build a collection image URL, trying OpenSea CDN → IPFS gateway → null. */
export function getCollectionImageUrl(slug: string, metadataImageUrl?: string): string | null {
  const key = slug.toLowerCase().replace(/\s+/g, '-');

  // 1. Metadata image from API (highest priority) — but skip if known-broken
  if (metadataImageUrl && !failedImageUrls.has(metadataImageUrl)) {
    return metadataImageUrl;
  }

  // 2. Known OpenSea CDN URL
  if (KNOWN_COLLECTION_IMAGES[key] && !failedImageUrls.has(KNOWN_COLLECTION_IMAGES[key])) {
    return KNOWN_COLLECTION_IMAGES[key];
  }

  // 3. Try IPFS fallback (if slug looks like an IPFS hash)
  if (key.match(/Qm[1-9A-HJ-NP-Za-km-z]{44,}/)) {
    return `https://ipfs.io/ipfs/${key}`;
  }

  return null;
}

/** Handle image load error — mark URL as failed and fall back to gradient. */
export function onCollectionImageError(slug: string, url: string): string | null {
  failedImageUrls.add(url);
  return getCollectionImageUrl(slug);
}

/** Get a gradient background for a collection (fallback for missing images). */
export function getCollectionGradient(slug: string): [string, string] {
  const key = slug.toLowerCase().replace(/\s+/g, '-');
  return COLLECTION_GRADIENTS[key] ?? ['#1e1b4b', '#312e81'];
}

/** Get a deterministic color for a collection name (for initials-based avatars). */
export function getCollectionColor(slug: string): string {
  const colors = ['#627eea', '#9945ff', '#34d399', '#fbbf24', '#f472b6', '#fb923c', '#60a5fa'];
  let h = 0;
  for (const c of slug) h = ((h << 5) - h) + c.charCodeAt(0);
  return colors[Math.abs(h) % colors.length];
}
