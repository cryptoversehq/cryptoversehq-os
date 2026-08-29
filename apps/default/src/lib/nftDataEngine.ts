/**
 * nftDataEngine.ts — §4.1 NFT Data Fetching Engine
 *
 * Implements the spec's NFTDataEngine class as a stateless service that:
 *   1. Fetches real collection stats from OpenSea / Blur / LooksRare / Magic Eden
 *   2. Fetches NFT metadata (traits, owner, last sale, image URL)
 *   3. Merges real API data with the simulator's base collection
 *   4. Falls back to simulated data gracefully on any error or missing API key
 *
 * Differences from raw nftApiGateway.ts:
 *   - Returns strongly-typed domain objects instead of raw API shapes
 *   - Enriches store NFTCollection with live floor/volume when available
 *   - fetchNFTMetadata returns structured NFTItemMetadata with traits
 *   - All methods catch and log; never throw to callers
 *
 * Usage (store / components):
 *   const engine = getNFTDataEngine();
 *   const stats  = await engine.fetchCollectionStats('bored-ape-yacht-club');
 *   // → CollectionStats | null
 */

import {
  fetchOpenSeaStats,
  fetchOpenSeaCollectionInfo,
  fetchBlurStats,
  fetchLooksRareStats,
  fetchMagicEdenStats,
  fetchAggregatedStats,
  type AggregatedCollectionData,
} from './nftApiGateway';
import { nftEnv } from './env';
import { proxySecretFetch } from './taskadeSecretsService';
import type { NFTCollection, NFTTrait, NFTTraitValue, NFTChain } from './nftTypes';
import { NFT_CHAIN_META } from './nftTypes';
import { generateId } from './strategyUtils';

// ── Result types ──────────────────────────────────────────────────────────────

/** §4.1 spec: CollectionStats returned by fetchCollectionStats() */
export interface CollectionStats {
  name:            string;
  floorPrice:      number;   // native currency
  floorPriceUsd:   number;
  volume24h:       number;
  volume7d:        number;
  totalSupply:     number;
  owners:          number;
  listedCount:     number;
  floorPriceBlur:  number | null;   // null when Blur key absent or unavailable
  source:          string;          // 'opensea' | 'magiceden' | ... | 'simulated'
  timestamp:       Date;
}

/** §4.1 spec: NFTMetadata returned by fetchNFTMetadata() */
export interface NFTItemMetadata {
  name:        string;
  description: string;
  imageUrl:    string;
  traits:      Array<{ trait_type: string; value: string; percentage: number }>;
  rarity:      { rank: number; score: number } | null;
  owner:       string;
  lastSale:    { price: number; priceUsd: number; date: string } | null;
  listings:    Array<{ price: number; marketplace: string }>;
  source:      'opensea' | 'simulated';
}

/** Enriched patch applied back to the store collection. */
export interface CollectionEnrichment {
  floorPrice:     number;
  floorPriceUsd:  number;
  volume24h:      number;
  volume24hUsd:   number;
  owners:         number | null;
  listedCount:    number | null;
  source:         string;
  fetchedAt:      string;
}

// ── Singleton cache ───────────────────────────────────────────────────────────

const STATS_CACHE    = new Map<string, { data: CollectionStats; expiry: number }>();
const METADATA_CACHE = new Map<string, { data: NFTItemMetadata; expiry: number }>();
const STATS_TTL_MS    = 60_000;   // 1 min — collection stats
const METADATA_TTL_MS = 300_000;  // 5 min — item metadata

// ── PRNG helpers (for simulated metadata) ────────────────────────────────────

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

// ── NFT Data Engine ───────────────────────────────────────────────────────────

export class NFTDataEngine {
  /** §4.1: Fetch collection stats, merging all available marketplaces. */
  async fetchCollectionStats(collectionSlug: string, col?: Partial<NFTCollection>): Promise<CollectionStats | null> {
    // Cache hit?
    const cached = STATS_CACHE.get(collectionSlug);
    if (cached && cached.expiry > Date.now()) return cached.data;

    try {
      const chain = (col?.chain ?? 'ethereum') as NFTChain;
      const meta  = NFT_CHAIN_META[chain];

      const agg = col
        ? await fetchAggregatedStats({
            slug:            collectionSlug,
            chain,
            contractAddress: col.contractAddress ?? '',
          })
        : await fetchAggregatedStats({ slug: collectionSlug, chain: 'ethereum', contractAddress: '' });

      if (!agg) return null;

      // §4.1: also fetch Blur for ETH collections
      let blurFloor: number | null = null;
      if (chain === 'ethereum' && col?.contractAddress) {
        const blurData = await fetchBlurStats(col.contractAddress);
        blurFloor = blurData?.floorPrice ?? null;
      }

      const stats: CollectionStats = {
        name:           collectionSlug,
        floorPrice:     agg.floorPrice,
        floorPriceUsd:  agg.floorPrice * meta.nativeUsdPrice,
        volume24h:      agg.volume24h,
        volume7d:       agg.volume24h * 7 * (0.7 + Math.random() * 0.5),  // approximate
        totalSupply:    agg.totalSupply ?? col?.totalSupply ?? 0,
        owners:         agg.owners ?? col?.owners ?? 0,
        listedCount:    agg.listedCount ?? col?.listed ?? 0,
        floorPriceBlur: blurFloor,
        source:         agg.source,
        timestamp:      new Date(),
      };

      STATS_CACHE.set(collectionSlug, { data: stats, expiry: Date.now() + STATS_TTL_MS });
      return stats;
    } catch (err) {
      console.warn('[NFTDataEngine] fetchCollectionStats failed for', collectionSlug, err);
      return null;
    }
  }

  /**
   * §4.1: Fetch NFT metadata for a specific token.
   *
   * Real path: OpenSea v2 NFT endpoint
   *   GET /api/v2/chain/ethereum/contract/{address}/nfts/{tokenId}
   *
   * Simulated fallback: derives metadata from collection trait distribution.
   */
  async fetchNFTMetadata(collectionSlug: string, tokenId: string, col?: NFTCollection): Promise<NFTItemMetadata> {
    const cacheKey = `${collectionSlug}:${tokenId}`;
    const cached   = METADATA_CACHE.get(cacheKey);
    if (cached && cached.expiry > Date.now()) return cached.data;

    // Attempt real OpenSea fetch when we have a key + contract address
    if (nftEnv.hasOpensea && col?.contractAddress && col.chain === 'ethereum') {
      try {
        const tid = tokenId.replace('#', '');
        const res = await proxySecretFetch('opensea', {
          url: `https://api.opensea.io/api/v2/chain/ethereum/contract/${col.contractAddress}/nfts/${tid}`,
          headers: { 'X-API-KEY': '{{secret}}' },
        });
        if (res.ok) {
          const d = await res.json();
          const nft = d.nft ?? d;
          const traits = (nft.traits ?? []).map((t: any) => ({
            trait_type: t.trait_type ?? t.type ?? '',
            value:      String(t.value ?? ''),
            percentage: t.rarity?.prevalence ?? 0,
          }));
          const meta: NFTItemMetadata = {
            name:        nft.name ?? `${collectionSlug} ${tokenId}`,
            description: nft.description ?? '',
            imageUrl:    nft.image_url ?? nft.image ?? '',
            traits,
            rarity:      nft.rarity ? { rank: nft.rarity.rank ?? 0, score: nft.rarity.score ?? 0 } : null,
            owner:       nft.owners?.[0]?.address ?? nft.owner ?? '',
            lastSale:    nft.last_sale
              ? {
                  price:    parseFloat(nft.last_sale.total_price ?? 0) / 1e18,
                  priceUsd: (parseFloat(nft.last_sale.total_price ?? 0) / 1e18) * NFT_CHAIN_META.ethereum.nativeUsdPrice,
                  date:     nft.last_sale.event_timestamp ?? new Date().toISOString(),
                }
              : null,
            listings: (nft.listings ?? []).slice(0, 5).map((l: any) => ({
              price:       parseFloat(l.price?.current?.value ?? 0) / 1e18,
              marketplace: l.order_source ?? 'OpenSea',
            })),
            source: 'opensea',
          };
          METADATA_CACHE.set(cacheKey, { data: meta, expiry: Date.now() + METADATA_TTL_MS });
          return meta;
        }
      } catch (err) {
        console.warn('[NFTDataEngine] OpenSea metadata fetch failed', err);
      }
    }

    // Simulated fallback
    const simulated = this._simulateMetadata(collectionSlug, tokenId, col);
    METADATA_CACHE.set(cacheKey, { data: simulated, expiry: Date.now() + METADATA_TTL_MS });
    return simulated;
  }

  /**
   * Enrich a batch of store collections with real floor/volume data.
   * Called by the store's tick loop when API keys are configured.
   * Returns a map of collectionId → enrichment patch.
   */
  async enrichCollections(
    cols: NFTCollection[],
    batchSize = 3,
  ): Promise<Map<string, CollectionEnrichment>> {
    const enrichments = new Map<string, CollectionEnrichment>();
    if (!nftEnv.hasAnyKey) return enrichments;

    // Process in small batches to respect rate limits
    for (let i = 0; i < Math.min(cols.length, batchSize); i++) {
      const col  = cols[i];
      const meta = NFT_CHAIN_META[col.chain];
      try {
        const stats = await this.fetchCollectionStats(col.slug, col);
        if (stats) {
          enrichments.set(col.id, {
            floorPrice:    stats.floorPrice,
            floorPriceUsd: stats.floorPriceUsd,
            volume24h:     stats.volume24h,
            volume24hUsd:  stats.volume24h * meta.nativeUsdPrice,
            owners:        stats.owners || null,
            listedCount:   stats.listedCount || null,
            source:        stats.source,
            fetchedAt:     new Date().toISOString(),
          });
        }
      } catch {
        // continue with next collection
      }
    }

    return enrichments;
  }

  /** Simulated NFT metadata derived from collection trait distribution. */
  private _simulateMetadata(slug: string, tokenId: string, col?: NFTCollection): NFTItemMetadata {
    const seed = strHash(`${slug}-${tokenId}`);
    const rng  = seededRng(seed);
    const chain = NFT_CHAIN_META[col?.chain ?? 'ethereum'];

    const traits = (col?.traits ?? []).map(t => {
      const pick = t.values[Math.floor(rng() * t.values.length)];
      return pick ? { trait_type: t.category, value: pick.value, percentage: pick.percentage } : null;
    }).filter(Boolean) as NFTItemMetadata['traits'];

    const rarityScore = 200 + (seed % 700);
    const rarityRank  = 100 + (seed % (col?.totalSupply ?? 10000));
    const floor       = col?.floorPrice ?? 1;
    const lastPrice   = parseFloat((floor * (0.8 + rng() * 0.4)).toFixed(4));
    const ownerSeed   = `0x${(seed >>> 0).toString(16).padStart(8, '0')}${((seed * 7) >>> 0).toString(16).padStart(12, '0')}`;

    return {
      name:        col ? `${col.name} ${tokenId}` : `${slug} ${tokenId}`,
      description: col?.description ?? '',
      imageUrl:    '',     // no real image in simulation
      traits,
      rarity:      { rank: rarityRank, score: rarityScore },
      owner:       ownerSeed,
      lastSale:    {
        price:    lastPrice,
        priceUsd: parseFloat((lastPrice * chain.nativeUsdPrice).toFixed(2)),
        date:     new Date(Date.now() - (seed % 7_200_000)).toISOString(),
      },
      listings: [],
      source:   'simulated',
    };
  }

  /** Clear all caches (useful after store reset). */
  clearCaches() {
    STATS_CACHE.clear();
    METADATA_CACHE.clear();
  }
}

// ── Singleton access ──────────────────────────────────────────────────────────

let _instance: NFTDataEngine | null = null;

export function getNFTDataEngine(): NFTDataEngine {
  if (!_instance) _instance = new NFTDataEngine();
  return _instance;
}

// ── Convenience re-exports for components ────────────────────────────────────

/** Fetch and return merged stats for one collection slug. */
export async function fetchCollectionStats(
  slug: string,
  col?: NFTCollection,
): Promise<CollectionStats | null> {
  return getNFTDataEngine().fetchCollectionStats(slug, col);
}

/** Fetch metadata for one NFT token. */
export async function fetchNFTMetadata(
  slug:    string,
  tokenId: string,
  col?:    NFTCollection,
): Promise<NFTItemMetadata> {
  return getNFTDataEngine().fetchNFTMetadata(slug, tokenId, col);
}
