/**
 * useNFTEngine.ts — Unified React hook exposing all NFT business logic engines
 *
 * Composes:
 *   §4.1 NFTDataEngine         — fetchCollectionStats, fetchNFTMetadata
 *   §4.2 RarityCalculator      — calculateRarityScore, rankSimulatedCollection, getTokenRarity
 *   §4.3 NFTTradingEngine      — buyNFT, sellNFT, addVirtualFunds, getPortfolioStats
 *   §4.4 NFTAlertEngine        — createAlert, checkPriceAlerts, getAlertEvents, etc.
 *
 * Usage:
 *   const engine = useNFTEngine();
 *   const result = engine.trading.buyNFT({ ... });
 *   const rarity = engine.rarity.getTokenRarity(col, tokenId);
 *
 * Note: engine instances are singletons — this hook just provides typed access.
 */

import { useCallback } from 'react';
import { toast } from 'sonner';

// Engine singletons
import { getNFTDataEngine, fetchCollectionStats, fetchNFTMetadata } from './nftDataEngine';
import {
  calculateRarityScore,
  rankSimulatedCollection,
  getTokenRarityInCollection,
  getMostRareTraits,
  getTraitRarityBreakdown,
  computeCollectionRarityDistribution,
} from './nftRarityCalculator';
import {
  getNFTTradingEngine,
  registerFloorFetcher,
  type PurchaseResult,
  type SellResult,
  type PortfolioStats,
  type NFTTransaction,
} from './nftTradingEngine';
import {
  getNFTAlertEngine,
  registerAlertFloorFetcher,
  type NFTPriceAlert,
  type AlertEvent,
  type WhaleAlertEvent,
  type TrackedWallet,
} from './nftAlertEngine';
import { loadPortfolio, savePortfolio } from '../components/nft/nftUtils';
import { useNftStore } from './nftStore';
import type { NFTCollection } from './nftTypes';

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useNFTEngine() {
  const { getCollection, getCollections } = useNftStore();

  // Live floor fetcher (used inside trading/alert engines)
  const getFloor = useCallback((slug: string) => {
    const col = getCollection(slug);
    return col?.floorPrice ?? null;
  }, []);

  const tradingEngine = getNFTTradingEngine();
  const alertEngine   = getNFTAlertEngine();
  const dataEngine    = getNFTDataEngine();

  // ── §4.3 Trading API ────────────────────────────────────────────────────────

  const trading = {
    /** Buy an NFT at floor price with full validation (§4.3 steps 1-6). */
    buyNFT: (params: {
      userId:       string;
      col:          NFTCollection;
      tokenId?:     string;
      requestedPriceNative?: number;
    }): PurchaseResult => {
      const result = tradingEngine.buyNFT({
        userId:          params.userId,
        collectionSlug:  params.col.slug,
        col:             params.col,
        tokenId:         params.tokenId,
        requestedPriceNative: params.requestedPriceNative,
      });
      if (result.success) {
        toast.success(`Bought ${result.nft.tokenId} from ${result.nft.collectionName}!`);
      } else {
        toast.error(result.error ?? 'Purchase failed');
      }
      return result;
    },

    /** Sell an open position (§4.3 steps 1-7). */
    sellNFT: (positionIndex: number): SellResult => {
      const result = tradingEngine.sellNFT(positionIndex);
      if (result.success) {
        const pnlStr = `${result.profitLoss >= 0 ? '+' : ''}$${Math.abs(result.profitLoss).toFixed(0)}`;
        toast.success(`Sold! P&L: ${pnlStr} (${result.profitLossPct.toFixed(1)}%)`);
      } else {
        toast.error(result.error ?? 'Sell failed');
      }
      return result;
    },

    /** Top up virtual balance. */
    addVirtualFunds: (amount = 10_000) => {
      const result = tradingEngine.addVirtualFunds(amount);
      toast.success(`Added $${amount.toLocaleString()} CP. Balance: $${result.balance.toLocaleString()}`);
      return result;
    },

    /** Hard reset portfolio. */
    resetPortfolio: () => {
      const fresh = tradingEngine.resetPortfolio();
      toast.info('Portfolio reset to $50,000');
      return fresh;
    },

    /** Get live portfolio analytics. */
    getStats: (): PortfolioStats => tradingEngine.getPortfolioStats(getFloor),

    /** Full transaction log. */
    getTransactionLog: (): NFTTransaction[] => tradingEngine.getTransactionLog(),

    /** Raw portfolio from localStorage. */
    getPortfolio: () => loadPortfolio(),
  };

  // ── §4.4 Alert API ──────────────────────────────────────────────────────────

  const alerts = {
    /** Create a new price alert (§4.4). */
    createAlert: (params: {
      userId:         string;
      collectionSlug: string;
      collectionName: string;
      chain:          NFTCollection['chain'];
      type:           'above' | 'below';
      targetPrice:    number;
    }): NFTPriceAlert => {
      const alert = alertEngine.createAlert(params);
      toast.success(`Alert set for ${params.collectionName}`);
      return alert;
    },

    /** Manually run a price alert check (§4.4). */
    checkPriceAlerts: (): AlertEvent[] => alertEngine.checkPriceAlerts(),

    /** Manually run whale activity check (§4.4). */
    checkWhaleActivity: (): WhaleAlertEvent[] => alertEngine.checkWhaleActivity(),

    /** Get all user alerts. */
    getAllAlerts:     (): NFTPriceAlert[]   => alertEngine.getAllAlerts(),
    getActiveAlerts: (): NFTPriceAlert[]   => alertEngine.getActiveAlerts(),
    deleteAlert:     (id: string) => { alertEngine.deleteAlert(id); },
    toggleAlert:     (id: string) => { alertEngine.toggleAlert(id); },

    /** Alert history. */
    getAlertEvents:      (limit?: number): AlertEvent[]      => alertEngine.getAlertEvents(limit),
    getWhaleAlertEvents: (limit?: number): WhaleAlertEvent[] => alertEngine.getWhaleAlertEvents(limit),
    clearAlertEvents:    () => alertEngine.clearAlertEvents(),

    /** Wallet tracking for whale alerts. */
    addTrackedWallet:    (p: { userId: string; address: string; name: string; chain: NFTCollection['chain'] }): TrackedWallet =>
      alertEngine.addTrackedWallet(p),
    getTrackedWallets:   (): TrackedWallet[] => alertEngine.getTrackedWallets(),
    removeTrackedWallet: (id: string)        => alertEngine.removeTrackedWallet(id),
  };

  // ── §4.2 Rarity API ─────────────────────────────────────────────────────────

  const rarity = {
    /** Calculate rarity score for a set of trait inputs (§4.2). */
    calculateScore: calculateRarityScore,

    /** Get token-specific rarity within a collection (deterministic). */
    getTokenRarity: getTokenRarityInCollection,

    /** Rank an entire simulated collection (§4.2 rankCollection). */
    rankCollection: rankSimulatedCollection,

    /** Most rare traits in a collection. */
    getMostRareTraits,

    /** Per-trait-category rarity breakdown. */
    getTraitBreakdown: getTraitRarityBreakdown,

    /** Rarity tier distribution. */
    getRarityDistribution: computeCollectionRarityDistribution,
  };

  // ── §4.1 Data API ───────────────────────────────────────────────────────────

  const data = {
    /** Fetch live collection stats (§4.1) with simulator fallback. */
    fetchCollectionStats,

    /** Fetch NFT item metadata (§4.1) with simulator fallback. */
    fetchNFTMetadata,

    /** Enrich a batch of collections with real API data. */
    enrichCollections: (cols: NFTCollection[], batchSize?: number) =>
      dataEngine.enrichCollections(cols, batchSize),

    /** Clear data caches (call after store reset). */
    clearCaches: () => dataEngine.clearCaches(),
  };

  return { trading, alerts, rarity, data };
}
