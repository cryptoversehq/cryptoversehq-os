/**
 * nftTradingEngine.ts — §4.3 NFT Simulated Trading Engine
 *
 * Implements the spec's NFTSimulatedTrading class as a pure business-logic
 * service. All state lives in localStorage via nftUtils.ts helpers so it
 * persists across page reloads without requiring React state.
 *
 * Spec steps implemented:
 *   buyNFT:
 *     1. Validate user balance ≥ cost in CP (1 CP = $1 USD virtual)
 *     2. Fetch current floor price and validate price ≥ 90% of floor
 *     3. Deduct CP from balance
 *     4. Add NFT position to virtual collection
 *     5. Record transaction log entry
 *     6. Return PurchaseResult
 *
 *   sellNFT:
 *     1. Verify ownership of NFT in virtual collection
 *     2. Get current floor price
 *     3. Calculate realized P&L (absolute + %)
 *     4. Credit CP to balance
 *     5. Remove position from collection
 *     6. Record transaction
 *     7. Return SellResult
 *
 * Extensions beyond spec:
 *   - addVirtualFunds()  — top up with virtual CP
 *   - resetPortfolio()   — fresh start
 *   - getPortfolioStats() — derived analytics
 *   - Transaction log with full history
 */

import {
  loadPortfolio,
  savePortfolio,
  type VirtualNFTPortfolio,
  type VirtualNFTPosition,
  type ClosedNFTTrade,
} from '../components/nft/nftUtils';

// Re-export so consumers can import loadPortfolio directly from nftTradingEngine
export { loadPortfolio, savePortfolio } from '../components/nft/nftUtils';
import { NFT_CHAIN_META, type NFTCollection, type NFTChain } from './nftTypes';
import { generateId } from './strategyUtils';

// ── §4.3 Result types ─────────────────────────────────────────────────────────

export interface PurchaseResult {
  success:       boolean;
  transactionId: string;
  balance:       number;    // updated USD virtual balance
  nft: {
    collectionName: string;
    tokenId:        string;
    priceEth:       number;
    priceUsd:       number;
  };
  error?: string;
}

export interface SellResult {
  success:          boolean;
  transactionId:    string;
  balance:          number;
  profitLoss:       number;    // USD
  profitLossPct:    number;    // %
  salePrice:        number;    // native
  salePriceUsd:     number;
  error?:           string;
}

export interface PortfolioStats {
  balance:           number;
  totalValue:        number;    // balance + positions market value
  positionsValue:    number;    // positions only
  unrealizedPnl:     number;    // USD
  unrealizedPnlPct:  number;
  realizedPnl:       number;    // from closedTrades
  winRate:           number;    // %
  openPositions:     number;
  closedTrades:      number;
  totalTrades:       number;
  startingBalance:   number;    // 50_000
}

/** Full transaction record stored in the log. */
export interface NFTTransaction {
  id:             string;
  type:           'buy' | 'sell' | 'fund';
  collectionSlug: string;
  collectionName: string;
  tokenId:        string;
  priceNative:    number;
  priceUsd:       number;
  chain:          NFTChain;
  profitLoss?:    number;
  profitLossPct?: number;
  balanceBefore:  number;
  balanceAfter:   number;
  timestamp:      string;   // ISO-8601
}

// ── Transaction log (localStorage ring buffer) ────────────────────────────────

const TX_LOG_KEY    = 'cryptoverse_nft_tx_log_v1';
const TX_LOG_LIMIT  = 200;

function loadTxLog(): NFTTransaction[] {
  try { return JSON.parse(localStorage.getItem(TX_LOG_KEY) || '[]'); } catch { return []; }
}

function saveTxLog(log: NFTTransaction[]) {
  localStorage.setItem(TX_LOG_KEY, JSON.stringify(log.slice(-TX_LOG_LIMIT)));
}

function appendTx(entry: NFTTransaction) {
  const log = loadTxLog();
  log.push(entry);
  saveTxLog(log);
}

// ── Floor price accessor ──────────────────────────────────────────────────────

type FloorPriceFetcher = (collectionSlug: string) => number | null;
let _floorFetcher: FloorPriceFetcher | null = null;

/**
 * Register the floor price accessor so the engine can get live prices
 * from the Zustand store without importing it directly (avoids circular dep).
 */
export function registerFloorFetcher(fn: FloorPriceFetcher) {
  _floorFetcher = fn;
}

function getCurrentFloor(slug: string, fallback: number): number {
  return _floorFetcher?.(slug) ?? fallback;
}

// ── NFT Trading Engine ────────────────────────────────────────────────────────

export class NFTTradingEngine {
  /**
   * §4.3 buyNFT — Purchase an NFT at floor price (or specific price).
   *
   * @param userId          - user identifier (used for logging)
   * @param collectionSlug  - slug of the NFT collection
   * @param col             - collection object from the store
   * @param tokenId         - specific token ID (or 'random' for floor pick)
   * @param requestedPriceNative - price the user wants to pay (native). If null → use floor.
   */
  buyNFT(params: {
    userId:                 string;
    collectionSlug:         string;
    col:                    Pick<NFTCollection, 'id' | 'name' | 'slug' | 'chain' | 'floorPrice' | 'floorPriceUsd' | 'totalSupply'>;
    tokenId?:               string;
    requestedPriceNative?:  number;
  }): PurchaseResult {
    const { userId, collectionSlug, col } = params;
    const chainMeta   = NFT_CHAIN_META[col.chain];
    const currentFloor = getCurrentFloor(collectionSlug, col.floorPrice);

    // Assign token ID
    const rawSeed = strHash(`${collectionSlug}-${Date.now()}`);
    const tokenId = params.tokenId && params.tokenId !== 'random'
      ? params.tokenId
      : `#${1 + (rawSeed % col.totalSupply)}`;

    // Price to pay
    const priceNative = params.requestedPriceNative ?? currentFloor;
    const priceUsd    = priceNative * chainMeta.nativeUsdPrice;

    // ── Step 1: Balance check ───────────────────────────────────────────────
    const portfolio = loadPortfolio();
    if (portfolio.balance < priceUsd) {
      return {
        success: false,
        transactionId: '',
        balance: portfolio.balance,
        nft: { collectionName: col.name, tokenId, priceEth: priceNative, priceUsd },
        error: `Insufficient balance. Need ${fmtUsd(priceUsd)} CP but have ${fmtUsd(portfolio.balance)} CP.`,
      };
    }

    // ── Step 2: Price floor guard (cannot buy below 90% of floor) ──────────
    const floorGuard = currentFloor * 0.9;
    if (priceNative < floorGuard) {
      return {
        success: false,
        transactionId: '',
        balance: portfolio.balance,
        nft: { collectionName: col.name, tokenId, priceEth: priceNative, priceUsd },
        error: `Cannot buy below 90% of floor price. Current floor: ${currentFloor.toFixed(4)} ${chainMeta.symbol}. Minimum: ${floorGuard.toFixed(4)} ${chainMeta.symbol}.`,
      };
    }

    const txId = generateId();
    const balanceBefore = portfolio.balance;

    // ── Step 3: Deduct CP ───────────────────────────────────────────────────
    // ── Step 4: Add position ────────────────────────────────────────────────
    const newPos: VirtualNFTPosition = {
      collectionId:    col.id,
      collectionName:  col.name,
      collectionSlug,
      chain:           col.chain,
      tokenId,
      buyPrice:        priceNative,
      buyPriceUsd:     priceUsd,
      currentFloor,
      currentFloorUsd: currentFloor * chainMeta.nativeUsdPrice,
      quantity:        1,
      purchasedAt:     new Date().toISOString(),
    };

    const updated: VirtualNFTPortfolio = {
      ...portfolio,
      balance:       portfolio.balance - priceUsd,
      totalInvested: portfolio.totalInvested + priceUsd,
      positions:     [...portfolio.positions, newPos],
    };
    savePortfolio(updated);

    // ── Step 5: Record transaction ──────────────────────────────────────────
    appendTx({
      id: txId, type: 'buy', collectionSlug, collectionName: col.name,
      tokenId, priceNative, priceUsd, chain: col.chain,
      balanceBefore, balanceAfter: updated.balance,
      timestamp: new Date().toISOString(),
    });

    // ── Step 6: Return result ───────────────────────────────────────────────
    return {
      success: true,
      transactionId: txId,
      balance: updated.balance,
      nft: { collectionName: col.name, tokenId, priceEth: priceNative, priceUsd },
    };
  }

  /**
   * §4.3 sellNFT — Sell a virtual NFT at current floor price.
   *
   * @param positionIndex - index into portfolio.positions array
   */
  sellNFT(positionIndex: number): SellResult {
    const portfolio = loadPortfolio();
    const pos = portfolio.positions[positionIndex];

    // ── Step 1: Ownership check ─────────────────────────────────────────────
    if (!pos) {
      return { success: false, transactionId: '', balance: portfolio.balance, profitLoss: 0, profitLossPct: 0, salePrice: 0, salePriceUsd: 0, error: 'Position not found.' };
    }

    const chainMeta    = NFT_CHAIN_META[pos.chain];
    // ── Step 2: Current floor ───────────────────────────────────────────────
    const salePrice    = getCurrentFloor(pos.collectionSlug, pos.buyPrice);
    const salePriceUsd = salePrice * chainMeta.nativeUsdPrice;

    // ── Step 3: P&L calculation ─────────────────────────────────────────────
    const profitLoss    = salePriceUsd - pos.buyPriceUsd;
    const profitLossPct = ((salePrice - pos.buyPrice) / pos.buyPrice) * 100;

    const closed: ClosedNFTTrade = {
      collectionName: pos.collectionName,
      tokenId:        pos.tokenId,
      buyPrice:       pos.buyPriceUsd,
      sellPrice:      salePriceUsd,
      pnl:            profitLoss,
      pnlPct:         profitLossPct,
      closedAt:       new Date().toISOString(),
    };

    const txId = generateId();
    const balanceBefore = portfolio.balance;

    // ── Step 4-5: Credit CP + remove position ───────────────────────────────
    const updated: VirtualNFTPortfolio = {
      ...portfolio,
      balance:      portfolio.balance + salePriceUsd,
      positions:    portfolio.positions.filter((_, i) => i !== positionIndex),
      closedTrades: [...portfolio.closedTrades, closed],
      totalPnl:     portfolio.totalPnl + profitLoss,
    };
    savePortfolio(updated);

    // ── Step 6: Transaction log ─────────────────────────────────────────────
    appendTx({
      id: txId, type: 'sell', collectionSlug: pos.collectionSlug, collectionName: pos.collectionName,
      tokenId: pos.tokenId, priceNative: salePrice, priceUsd: salePriceUsd, chain: pos.chain,
      profitLoss, profitLossPct, balanceBefore, balanceAfter: updated.balance,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      transactionId: txId,
      balance: updated.balance,
      profitLoss, profitLossPct,
      salePrice, salePriceUsd,
    };
  }

  /** Add virtual funds (top-up). Capped at 500,000 CP total. */
  addVirtualFunds(amount: number = 10_000): { balance: number; added: number } {
    const portfolio = loadPortfolio();
    const MAX_BALANCE = 500_000;
    const actual  = Math.min(amount, MAX_BALANCE - portfolio.balance);
    const updated = { ...portfolio, balance: portfolio.balance + actual };
    savePortfolio(updated);
    appendTx({
      id: generateId(), type: 'fund', collectionSlug: '', collectionName: 'Virtual Fund',
      tokenId: '', priceNative: 0, priceUsd: actual, chain: 'ethereum',
      balanceBefore: portfolio.balance, balanceAfter: updated.balance,
      timestamp: new Date().toISOString(),
    });
    return { balance: updated.balance, added: actual };
  }

  /** Hard reset — restart with 50,000 CP. */
  resetPortfolio(): VirtualNFTPortfolio {
    const fresh: VirtualNFTPortfolio = { balance: 50_000, totalInvested: 0, positions: [], closedTrades: [], totalPnl: 0 };
    savePortfolio(fresh);
    saveTxLog([]);
    return fresh;
  }

  /**
   * Compute live portfolio analytics.
   *
   * @param getFloor - optional floor price accessor to compute live PnL
   */
  getPortfolioStats(getFloor?: (slug: string) => number | null): PortfolioStats {
    const portfolio = loadPortfolio();

    let positionsValue = 0;
    let unrealizedPnl  = 0;

    for (const pos of portfolio.positions) {
      const chainMeta    = NFT_CHAIN_META[pos.chain];
      const liveFloor    = getFloor?.(pos.collectionSlug) ?? pos.currentFloor;
      const marketValue  = liveFloor * chainMeta.nativeUsdPrice;
      positionsValue    += marketValue;
      unrealizedPnl     += marketValue - pos.buyPriceUsd;
    }

    const totalValue    = portfolio.balance + positionsValue;
    const unrealizedPct = portfolio.totalInvested > 0
      ? (unrealizedPnl / portfolio.totalInvested) * 100
      : 0;

    const winningTrades = portfolio.closedTrades.filter(t => t.pnl > 0).length;
    const winRate       = portfolio.closedTrades.length > 0
      ? (winningTrades / portfolio.closedTrades.length) * 100
      : 0;

    return {
      balance:          portfolio.balance,
      totalValue,
      positionsValue,
      unrealizedPnl,
      unrealizedPnlPct: unrealizedPct,
      realizedPnl:      portfolio.totalPnl,
      winRate,
      openPositions:    portfolio.positions.length,
      closedTrades:     portfolio.closedTrades.length,
      totalTrades:      portfolio.positions.length + portfolio.closedTrades.length,
      startingBalance:  50_000,
    };
  }

  /** Return full transaction log. */
  getTransactionLog(): NFTTransaction[] {
    return loadTxLog();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function strHash(s: string): number {
  let h = 2_166_136_261;
  for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16_777_619); }
  return h >>> 0;
}

function fmtUsd(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _engine: NFTTradingEngine | null = null;

export function getNFTTradingEngine(): NFTTradingEngine {
  if (!_engine) _engine = new NFTTradingEngine();
  return _engine;
}
