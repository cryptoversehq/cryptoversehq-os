/**
 * api/nft.ts
 *
 * NFT Analysis Endpoints — Part 12 §11.7
 *
 * GET    /api/nft/collections           - List top collections
 * GET    /api/nft/collection/:slug      - Collection details
 * POST   /api/nft/wallet/track          - Track wallet
 * GET    /api/nft/wallet/:address       - Get wallet NFTs
 */

import { registerRoute, requireAuth, ApiErrors } from './client';
import type {
  ListNftCollectionsRequest,
  ListNftCollectionsResponse,
  NftCollectionItem,
  GetNftCollectionResponse,
  TrackNftWalletRequest,
  TrackNftWalletResponse,
  GetNftWalletResponse,
} from './types';
import { useNftStore } from '../lib/nftStore';
import type { NFTCollection } from '../lib/nftTypes';

function toCollectionItem(c: NFTCollection): NftCollectionItem {
  return {
    slug:          c.slug,
    name:          c.name,
    chain:         c.chain,
    floorPriceEth: c.floorPriceEth,
    volume24hEth:  c.volume24hEth,
    marketCapEth:  c.marketCapEth,
    sales24h:      c.sales24h,
    owners:        c.owners,
    totalSupply:   c.totalSupply,
    verified:      c.verified,
  };
}

// ─── GET /api/nft/collections ─────────────────────────────────────────────────

registerRoute<ListNftCollectionsRequest, ListNftCollectionsResponse>(
  'GET', '/api/nft/collections',
  (query, _auth) => {
    const store = useNftStore.getState();
    const cols  = store.getCollections({
      chains:       query.chain ? [query.chain as any] : [],
      categories:   [],
      search:       '',
      minFloorEth:  0,
      minVolumeEth: 0,
      sortBy:       (query.sortBy ?? 'volume_24h_desc') as any,
    }).slice(0, query.limit ?? 50);
    return { collections: cols.map(toCollectionItem) };
  },
);

// ─── GET /api/nft/collection/:slug ────────────────────────────────────────────

registerRoute<Record<string, never>, GetNftCollectionResponse>(
  'GET', '/api/nft/collection/:slug',
  (_body, _auth, pathParams) => {
    const store = useNftStore.getState();
    const slug  = pathParams?.['slug'] ?? '';
    const col   = store.getCollection(slug);
    if (!col) throw ApiErrors.notFound(`Collection '${slug}' not found.`);
    return {
      collection: {
        ...toCollectionItem(col),
        description: (col as any).description ?? '',
        website:     (col as any).website,
      },
    };
  },
);

// ─── POST /api/nft/wallet/track ───────────────────────────────────────────────

registerRoute<TrackNftWalletRequest, TrackNftWalletResponse>(
  'POST', '/api/nft/wallet/track',
  (body, auth) => {
    const a     = requireAuth(auth);
    const store = useNftStore.getState();
    const result = store.addWallet({
      userId:  a.userId,
      address: body.address,
      chain:   body.chain as any,
      label:   body.label ?? body.address.slice(0, 8),
    });
    if (!result.ok || !result.wallet) {
      throw ApiErrors.validation(result.error ?? 'Wallet tracking failed.');
    }
    return { walletId: result.wallet.id };
  },
);

// ─── GET /api/nft/wallet/:address ─────────────────────────────────────────────

registerRoute<Record<string, never>, GetNftWalletResponse>(
  'GET', '/api/nft/wallet/:address',
  (_body, auth, pathParams) => {
    const a       = requireAuth(auth);
    const store   = useNftStore.getState();
    const address = pathParams?.['address'] ?? '';

    // Find tracked wallet
    const wallet = store.getUserWallets(a.userId).find(w => w.address.toLowerCase() === address.toLowerCase());
    if (!wallet) throw ApiErrors.notFound(`Wallet '${address}' not found.`);

    const snap = store.getWalletSnapshot(wallet.id);
    if (!snap) {
      return { address, chain: wallet.chain, totalValueEth: 0, nftCount: 0, collections: [] };
    }

    return {
      address,
      chain:         wallet.chain,
      totalValueEth: snap.totalValueEth,
      nftCount:      snap.nftCount,
      collections:   snap.byCollection.map(c => ({
        slug:     c.collectionSlug,
        name:     c.collectionName,
        count:    c.count,
        valueEth: c.estimatedValueEth,
      })),
    };
  },
);
