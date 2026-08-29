/**
 * nftStore.ts
 *
 * Central store for the CryptoVerse HQ NFT Analysis system.
 *
 * Manages:
 *   - collections   : Registry of NFTCollection objects, live-ticked every 20s
 *   - wallets       : User-tracked NFTWalletTracking records
 *   - sales         : Global ring-buffered NFTSale feed
 *   - snapshots     : Per-wallet NFTWalletSnapshot history
 *
 * Responsibilities:
 *   - Cold-start: builds collection registry from COLLECTION_CATALOG on first load
 *   - Live tick: evolves floor prices, volumes, and emits synthetic sales
 *   - Wallet CRUD: add / rename / toggle / remove tracked wallets
 *   - Portfolio: generates wallet snapshots on demand
 *   - Queries: filtered/sorted collection list, sales feed, wallet list
 *   - Admin: global stats, force-refresh, clear
 *
 * Persistence:
 *   cryptoverse_nft_collections_v1  (collection registry)
 *   cryptoverse_nft_wallets_v1      (tracked wallets per user)
 *   cryptoverse_nft_sales_v1        (global sales feed)
 */

import { create } from 'zustand';
import { cloudRecordStore } from './cloudData';
import {
  NFTCollection,
  NFTWalletTracking,
  NFTWalletSnapshot,
  NFTSale,
  NFTChain,
  CollectionCategory,
  CollectionFilters,
  SaleFeedFilters,
  WalletTrackFilters,
  CollectionSortKey,
  SaleSortKey,
  WalletTrackSortKey,
  RarityTier,
  NFTGlobalStats,
  AddWalletResult,
  UpdateWalletResult,
  DEFAULT_COLLECTION_FILTERS,
  DEFAULT_SALE_FILTERS,
  DEFAULT_WALLET_FILTERS,
  MAX_WALLETS_PER_USER,
  MAX_SALES_FEED,
  NFT_TICK_INTERVAL_MS,
  COLD_START_SALES,
  NFT_CHAIN_META,
} from './nftTypes';
import {
  COLLECTION_CATALOG,
  buildInitialCollection,
  tickFloorPrice,
  tickVolume,
  generateSale,
  generateWalletSnap,
} from './nftSimulator';
import { generateId } from './strategyUtils';
import { registerFloorFetcher }         from './nftTradingEngine';
import { registerAlertFloorFetcher, registerAlertSalesFetcher, getNFTAlertEngine } from './nftAlertEngine';
import { fetchAggregatedStats }          from './nftApiGateway';

// ─── NOTIFICATION BRIDGE ──────────────────────────────────────────────────────

type NFTNotifyPayload = {
  type:    'trade' | 'achievement' | 'system' | 'liquidation';
  title:   string;
  message: string;
};

let _nftNotifyHandler: ((n: NFTNotifyPayload) => void) | null = null;

export function registerNftNotifyHandler(fn: (n: NFTNotifyPayload) => void) {
  _nftNotifyHandler = fn;
}

function nftNotify(n: NFTNotifyPayload) {
  _nftNotifyHandler?.(n);
}

// ─── PERSISTENCE ──────────────────────────────────────────────────────────────

const COLL_KEY    = 'cryptoverse_nft_collections_v1';
const WALLET_KEY  = 'cryptoverse_nft_wallets_v1';
const SALES_KEY   = 'cryptoverse_nft_sales_v1';
const SEEDED_KEY  = 'cryptoverse_nft_seeded_v1';

function load<T>(key: string, fallback: T): T {
  return cloudRecordStore.get<T>('nft', key, fallback);
}
function persist(key: string, v: unknown) { cloudRecordStore.set('nft', key, v); }

// ─── WALLET VALIDATION ────────────────────────────────────────────────────────

function validateWallet(params: { walletAddress: string; chain: NFTChain; name: string }): string[] {
  const errors: string[] = [];
  if (!params.walletAddress.trim()) errors.push('Wallet address is required.');
  else if (params.chain !== 'solana' && !/^0x[0-9a-fA-F]{40}$/.test(params.walletAddress.trim()))
    errors.push('Invalid EVM address format (must start with 0x and be 42 chars).');
  if (!params.name.trim()) errors.push('Wallet name is required.');
  else if (params.name.trim().length > 60) errors.push('Name must be 60 characters or fewer.');
  return errors;
}

// ─── FILTERING & SORTING — COLLECTIONS ───────────────────────────────────────

function applyCollectionFilters(cols: NFTCollection[], f: CollectionFilters): NFTCollection[] {
  return cols.filter(c => {
    if (f.chains.length     > 0 && !f.chains.includes(c.chain))          return false;
    if (f.categories.length > 0 && !f.categories.includes(c.category))   return false;
    if (f.verified     !== null && c.verified     !== f.verified)         return false;
    if (f.isBlueChip   !== null && c.isBlueChip   !== f.isBlueChip)       return false;
    if (c.floorPrice   < f.minFloor)                                      return false;
    if (f.maxFloor !== Infinity && c.floorPrice > f.maxFloor)             return false;
    if (c.volume24h    < f.minVolume24h)                                  return false;
    if (f.search.trim()) {
      const q = f.search.toLowerCase();
      if (!c.name.toLowerCase().includes(q) && !c.slug.includes(q) && !c.contractAddress.includes(q)) return false;
    }
    return true;
  });
}

function sortCollections(cols: NFTCollection[], by: CollectionSortKey): NFTCollection[] {
  const a = [...cols];
  switch (by) {
    case 'volume_24h_desc':   return a.sort((x,y) => y.volume24hUsd   - x.volume24hUsd);
    case 'volume_7d_desc':    return a.sort((x,y) => y.volume7dUsd    - x.volume7dUsd);
    case 'floor_desc':        return a.sort((x,y) => y.floorPrice     - x.floorPrice);
    case 'floor_asc':         return a.sort((x,y) => x.floorPrice     - y.floorPrice);
    case 'market_cap_desc':   return a.sort((x,y) => y.marketCapUsd   - x.marketCapUsd);
    case 'owners_desc':       return a.sort((x,y) => y.owners         - x.owners);
    case 'floor_change_desc': return a.sort((x,y) => y.floorChange24h - x.floorChange24h);
    case 'floor_change_asc':  return a.sort((x,y) => x.floorChange24h - y.floorChange24h);
    case 'name_asc':          return a.sort((x,y) => x.name.localeCompare(y.name));
    default:                  return a;
  }
}

// ─── FILTERING & SORTING — SALES ─────────────────────────────────────────────

function applySaleFilters(sales: NFTSale[], f: SaleFeedFilters): NFTSale[] {
  return sales.filter(s => {
    if (f.collectionIds.length > 0 && !f.collectionIds.includes(s.collectionId)) return false;
    if (f.chains.length        > 0 && !f.chains.includes(s.chain))               return false;
    if (f.rarityTiers.length   > 0 && s.rarityTier && !f.rarityTiers.includes(s.rarityTier)) return false;
    if (f.marketplaces.length  > 0 && !f.marketplaces.includes(s.marketplace))   return false;
    if (s.price    < f.minPrice)    return false;
    if (s.priceUsd < f.minPriceUsd) return false;
    if (s.priceVsFloor < f.minVsFloor) return false;
    return true;
  });
}

function sortSales(sales: NFTSale[], by: SaleSortKey): NFTSale[] {
  const a = [...sales];
  switch (by) {
    case 'newest':          return a.sort((x,y) => y.timestamp.localeCompare(x.timestamp));
    case 'highest_price':   return a.sort((x,y) => y.priceUsd - x.priceUsd);
    case 'highest_vs_floor':return a.sort((x,y) => y.priceVsFloor - x.priceVsFloor);
    default:                return a;
  }
}

// ─── FILTERING & SORTING — WALLETS ───────────────────────────────────────────

function applyWalletFilters(wallets: NFTWalletTracking[], f: WalletTrackFilters): NFTWalletTracking[] {
  return wallets.filter(w => {
    if (f.chains.length > 0 && !f.chains.includes(w.chain)) return false;
    if (f.isActive !== null && w.isActive !== f.isActive)    return false;
    if (f.search.trim()) {
      const q = f.search.toLowerCase();
      if (!w.name.toLowerCase().includes(q) && !w.walletAddress.toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

function sortWallets(wallets: NFTWalletTracking[], by: WalletTrackSortKey): NFTWalletTracking[] {
  const a = [...wallets];
  switch (by) {
    case 'newest':   return a.sort((x,y) => y.createdAt.localeCompare(x.createdAt));
    case 'name_asc': return a.sort((x,y) => x.name.localeCompare(y.name));
    default:         return a;
  }
}

// ─── RING BUFFER ──────────────────────────────────────────────────────────────

function pruneSales(sales: NFTSale[]): NFTSale[] {
  if (sales.length <= MAX_SALES_FEED) return sales;
  return sales.sort((a,b) => b.timestamp.localeCompare(a.timestamp)).slice(0, MAX_SALES_FEED);
}

// ─── POLLING ENGINE ───────────────────────────────────────────────────────────

let _nftInterval: ReturnType<typeof setInterval> | null = null;
let _tickCount = 0;

function stopNftPolling() {
  if (_nftInterval !== null) { clearInterval(_nftInterval); _nftInterval = null; }
}
function startNftPolling(tick: () => void) {
  stopNftPolling();
  _nftInterval = setInterval(tick, NFT_TICK_INTERVAL_MS);
}

// ─── STATE INTERFACE ──────────────────────────────────────────────────────────

export interface NFTState {
  collections:      Record<string, NFTCollection>;
  wallets:          Record<string, NFTWalletTracking>;
  sales:            NFTSale[];
  walletSnapshots:  Record<string, NFTWalletSnapshot[]>;  // walletId → snapshots

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  seedCollections: () => void;

  // ── Polling ────────────────────────────────────────────────────────────────
  startPolling: () => void;
  stopPolling:  () => void;
  runTick:      () => { floorUpdated: number; salesGenerated: number };

  // ── Collection queries ────────────────────────────────────────────────────
  getCollections: (filters?: CollectionFilters) => NFTCollection[];
  getCollection:  (idOrSlug: string) => NFTCollection | null;

  // ── Sales feed ────────────────────────────────────────────────────────────
  getSalesFeed: (filters?: SaleFeedFilters, limit?: number) => NFTSale[];

  // ── Wallet CRUD ───────────────────────────────────────────────────────────
  addWallet:    (params: { userId: string; walletAddress: string; chain: NFTChain; name: string }) => AddWalletResult;
  renameWallet: (walletId: string, userId: string, name: string) => UpdateWalletResult;
  toggleWallet: (walletId: string, userId: string) => UpdateWalletResult;
  removeWallet: (walletId: string, userId: string) => UpdateWalletResult;
  getUserWallets: (userId: string, filters?: WalletTrackFilters) => NFTWalletTracking[];

  // ── Wallet portfolio ──────────────────────────────────────────────────────
  getWalletSnapshot:  (walletId: string) => NFTWalletSnapshot | null;
  refreshWalletSnap:  (walletId: string, userId: string) => NFTWalletSnapshot | null;

  // ── API Sync ───────────────────────────────────────────────────────────────
  syncFromMarketplaces:  () => Promise<{ updated: number }>;

  // ── Admin ──────────────────────────────────────────────────────────────────
  getGlobalStats:        () => NFTGlobalStats;
  adminRefreshAll:       () => void;
  adminClearSalesFeed:   () => void;
}

// ─── ENGINE WIRING ────────────────────────────────────────────────────────────

/**
 * Wire the business-logic engines (§4.3, §4.4) to the store's live data.
 * Called once after seedCollections() so engines always have fresh floor prices.
 */
function _wireEngines(get: () => NFTState) {
  // §4.3 Trading engine — live floor prices
  registerFloorFetcher((slug: string) => {
    const cols = Object.values(get().collections);
    const col  = cols.find(c => c.slug === slug || c.id === slug);
    return col?.floorPrice ?? null;
  });

  // §4.4 Alert engine — live floor prices
  registerAlertFloorFetcher((slug: string) => {
    const cols = Object.values(get().collections);
    const col  = cols.find(c => c.slug === slug || c.id === slug);
    return col?.floorPrice ?? null;
  });

  // §4.4 Alert engine — recent sales feed for whale tracking
  registerAlertSalesFetcher(() =>
    get().sales.map(s => ({
      txHash:          s.txHash,
      collectionSlug:  s.collectionSlug,
      price:           s.price,
      fromAddress:     s.fromAddress,
      toAddress:       s.toAddress,
      timestamp:       s.timestamp,
    }))
  );

  // Start the alert check loop (every 30s)
  const alertEngine = getNFTAlertEngine();
  alertEngine.startAlertLoop(30_000);
}

// ─── STORE ────────────────────────────────────────────────────────────────────

export const useNftStore = create<NFTState>((set, get) => {
  const collections = load<Record<string, NFTCollection>>(COLL_KEY, {});
  const wallets     = load<Record<string, NFTWalletTracking>>(WALLET_KEY, {});
  const sales       = load<NFTSale[]>(SALES_KEY, []);

  return {
    collections,
    wallets,
    sales,
    walletSnapshots: {},

    // ── Bootstrap ────────────────────────────────────────────────────────────

    seedCollections: () => {
      const alreadySeeded = cloudRecordStore.get<string>('nft', SEEDED_KEY, '') === '1';
      if (alreadySeeded && Object.keys(get().collections).length > 0) {
        _wireEngines(get);
        return;
      }

      const newCollections: Record<string, NFTCollection> = {};
      for (const seed of COLLECTION_CATALOG) {
        const col = buildInitialCollection(seed);
        newCollections[col.id] = col;
      }

      // Seed cold-start sales
      const allCols  = Object.values(newCollections);
      const newSales: NFTSale[] = [];
      for (let i = 0; i < COLD_START_SALES; i++) {
        const col = allCols[i % allCols.length];
        newSales.push(generateSale(col));
      }

      persist(COLL_KEY,   newCollections);
      persist(SALES_KEY,  newSales);
      cloudRecordStore.set('nft', SEEDED_KEY, '1');
      set({ collections: newCollections, sales: newSales });

      // Wire engine accessors after seed
      _wireEngines(get);
    },

    // ── Polling ──────────────────────────────────────────────────────────────

    startPolling: () => {
      startNftPolling(() => get().runTick());
    },

    stopPolling: () => { stopNftPolling(); },

    runTick: () => {
      const { collections, sales } = get();
      const cols = Object.values(collections);
      let floorUpdated = 0;
      let salesGenerated = 0;

      const newCollections: Record<string, NFTCollection> = {};
      const newSales: NFTSale[] = [...sales];

      for (const col of cols) {
        // Tick floor + volume
        const ticked = tickVolume(tickFloorPrice(col));
        newCollections[col.id] = ticked;
        floorUpdated++;

        // Generate a sale ~30% of the time per collection per tick
        if (Math.random() < 0.30) {
          const sale = generateSale(ticked);
          newSales.push(sale);
          salesGenerated++;

          // Notify for high-value sales (>5× floor)
          if (sale.priceVsFloor >= 5) {
            nftNotify({
              type:    'trade',
              title:   `🔥 Sweep Above Floor — ${ticked.name}`,
              message: `${sale.name} sold for ${sale.price.toFixed(2)} ${NFT_CHAIN_META[col.chain].symbol} (${sale.priceVsFloor.toFixed(1)}× floor)`,
            });
          }
        }
      }

      const pruned = pruneSales(newSales);
      persist(COLL_KEY,  newCollections);
      persist(SALES_KEY, pruned);
      set({ collections: newCollections, sales: pruned });

      // Trigger async API sync every 5th tick (once every 100s) — fire-and-forget
      if (_tickCount++ % 5 === 0) {
        get().syncFromMarketplaces();
      }

      return { floorUpdated, salesGenerated };
    },

    syncFromMarketplaces: async () => {
      const cols = Object.values(get().collections);
      let updated = 0;
      // Rate-limit: sync only first 6 collections per API call batch
      for (const col of cols.slice(0, 6)) {
        const data = await fetchAggregatedStats(col);
        if (!data) continue;
        const existing = get().collections[col.id];
        if (!existing) continue;
        const updatedCol: NFTCollection = {
          ...existing,
          floorPrice:    data.floorPrice   || existing.floorPrice,
          floorPriceUsd: data.floorPrice   || existing.floorPriceUsd,
          volume24h:     data.volume24h    || existing.volume24h,
          volume24hUsd:  data.volume24h    || existing.volume24hUsd,
          owners:        data.owners       ?? existing.owners,
          listed:        data.listedCount  ?? existing.listed,
          lastUpdated:   data.fetchedAt    || existing.lastUpdated,
        };
        get().collections[col.id] = updatedCol;
        updated++;
      }
      if (updated > 0) {
        persist(COLL_KEY, get().collections);
        set({ collections: { ...get().collections } });
      }
      return { updated };
    },

    // ── Collection queries ────────────────────────────────────────────────────

    getCollections: (filters = DEFAULT_COLLECTION_FILTERS) => {
      const cols = Object.values(get().collections);
      return sortCollections(applyCollectionFilters(cols, filters), filters.sortBy);
    },

    getCollection: (idOrSlug) => {
      const { collections } = get();
      return (
        collections[idOrSlug] ??
        Object.values(collections).find(c => c.slug === idOrSlug || c.id === idOrSlug) ??
        null
      );
    },

    // ── Sales feed ────────────────────────────────────────────────────────────

    getSalesFeed: (filters = DEFAULT_SALE_FILTERS, limit = 100) => {
      return sortSales(applySaleFilters(get().sales, filters), filters.sortBy).slice(0, limit);
    },

    // ── Wallet CRUD ───────────────────────────────────────────────────────────

    addWallet: (params) => {
      const { userId } = params;
      const userWallets = Object.values(get().wallets).filter(w => w.userId === userId);
      if (userWallets.length >= MAX_WALLETS_PER_USER) {
        return { ok: false, errors: [`Maximum ${MAX_WALLETS_PER_USER} tracked wallets per user.`] };
      }

      const errors = validateWallet(params);
      if (errors.length > 0) return { ok: false, errors };

      // Duplicate check
      const dup = userWallets.find(
        w => w.walletAddress.toLowerCase() === params.walletAddress.toLowerCase() && w.chain === params.chain,
      );
      if (dup) return { ok: false, errors: ['This wallet is already being tracked on this chain.'] };

      const walletId = generateId();
      const wallet: NFTWalletTracking = {
        id:            walletId,
        userId,
        walletAddress: params.walletAddress.trim(),
        chain:         params.chain,
        name:          params.name.trim(),
        isActive:      true,
        createdAt:     new Date().toISOString(),
      };

      const newWallets = { ...get().wallets, [walletId]: wallet };
      persist(WALLET_KEY, newWallets);
      set({ wallets: newWallets });

      return { ok: true, walletId };
    },

    renameWallet: (walletId, userId, name) => {
      const { wallets } = get();
      const wallet = wallets[walletId];
      if (!wallet) return { ok: false, error: 'Wallet not found.' };
      if (wallet.userId !== userId) return { ok: false, error: 'Permission denied.' };
      if (!name.trim()) return { ok: false, error: 'Name is required.' };
      const updated = { ...wallet, name: name.trim() };
      const newWallets = { ...wallets, [walletId]: updated };
      persist(WALLET_KEY, newWallets);
      set({ wallets: newWallets });
      return { ok: true };
    },

    toggleWallet: (walletId, userId) => {
      const { wallets } = get();
      const wallet = wallets[walletId];
      if (!wallet) return { ok: false, error: 'Wallet not found.' };
      if (wallet.userId !== userId) return { ok: false, error: 'Permission denied.' };
      const updated = { ...wallet, isActive: !wallet.isActive };
      const newWallets = { ...wallets, [walletId]: updated };
      persist(WALLET_KEY, newWallets);
      set({ wallets: newWallets });
      return { ok: true };
    },

    removeWallet: (walletId, userId) => {
      const { wallets, walletSnapshots } = get();
      const wallet = wallets[walletId];
      if (!wallet) return { ok: false, error: 'Wallet not found.' };
      if (wallet.userId !== userId) return { ok: false, error: 'Permission denied.' };
      const newWallets = { ...wallets };
      delete newWallets[walletId];
      const newSnaps = { ...walletSnapshots };
      delete newSnaps[walletId];
      persist(WALLET_KEY, newWallets);
      set({ wallets: newWallets, walletSnapshots: newSnaps });
      return { ok: true };
    },

    getUserWallets: (userId, filters = DEFAULT_WALLET_FILTERS) => {
      const userWallets = Object.values(get().wallets).filter(w => w.userId === userId);
      return sortWallets(applyWalletFilters(userWallets, filters), filters.sortBy);
    },

    // ── Wallet portfolio ──────────────────────────────────────────────────────

    getWalletSnapshot: (walletId) => {
      const snaps = get().walletSnapshots[walletId] ?? [];
      return snaps.length > 0 ? snaps[snaps.length - 1] : null;
    },

    refreshWalletSnap: (walletId, userId) => {
      const { wallets, collections, walletSnapshots } = get();
      const wallet = wallets[walletId];
      if (!wallet || wallet.userId !== userId) return null;

      const snap = generateWalletSnap(wallet, Object.values(collections));
      const existing = walletSnapshots[walletId] ?? [];
      const updated  = [...existing, snap].slice(-48);  // keep last 48 snapshots
      set({ walletSnapshots: { ...walletSnapshots, [walletId]: updated } });
      return snap;
    },

    // ── Admin ─────────────────────────────────────────────────────────────────

    getGlobalStats: () => {
      const { collections, wallets, sales } = get();
      const cols = Object.values(collections);
      const totalVolumeUsd = cols.reduce((s, c) => s + c.volume24hUsd, 0);
      const avgFloor = cols.length > 0
        ? cols.filter(c => c.chain === 'ethereum').reduce((s,c) => s + c.floorPrice, 0) /
          Math.max(1, cols.filter(c => c.chain === 'ethereum').length)
        : 0;

      const highestFloor = cols.reduce<NFTCollection | null>((m,c) => !m || c.floorPriceUsd > m.floorPriceUsd ? c : m, null);
      const highestVol   = cols.reduce<NFTCollection | null>((m,c) => !m || c.volume24hUsd   > m.volume24hUsd   ? c : m, null);

      const chains: NFTChain[] = ['ethereum','solana','polygon'];
      const byChain: NFTGlobalStats['byChain'] = {} as NFTGlobalStats['byChain'];
      for (const ch of chains) {
        const cc = cols.filter(c => c.chain === ch);
        byChain[ch] = { collections: cc.length, volume24hUsd: cc.reduce((s,c) => s + c.volume24hUsd, 0) };
      }

      const cats: CollectionCategory[] = ['pfp','art','gaming','utility','metaverse','collectible'];
      const byCategory: NFTGlobalStats['byCategory'] = {} as NFTGlobalStats['byCategory'];
      for (const cat of cats) byCategory[cat] = cols.filter(c => c.category === cat).length;

      return {
        totalCollections:    cols.length,
        verifiedCollections: cols.filter(c => c.verified).length,
        blueChipCount:       cols.filter(c => c.isBlueChip).length,
        totalSalesTracked:   sales.length,
        totalVolumeUsd:      Math.round(totalVolumeUsd),
        avgFloorEth:         Math.round(avgFloor * 100) / 100,
        highestFloorCollection: highestFloor ? { name: highestFloor.name, floorPrice: highestFloor.floorPrice, chain: highestFloor.chain } : null,
        highestVolumeCollection: highestVol  ? { name: highestVol.name,   volume24hUsd: highestVol.volume24hUsd } : null,
        trackedWallets: Object.keys(wallets).length,
        byChain,
        byCategory,
      };
    },

    adminRefreshAll: () => {
      const { collections } = get();
      const newCollections: Record<string, NFTCollection> = {};
      for (const [id, col] of Object.entries(collections)) {
        newCollections[id] = tickVolume(tickFloorPrice(col));
      }
      persist(COLL_KEY, newCollections);
      set({ collections: newCollections });
    },

    adminClearSalesFeed: () => {
      persist(SALES_KEY, []);
      set({ sales: [] });
    },
  };
});
