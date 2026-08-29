/**
 * onChainApiGateway.ts — Unified On-Chain API Gateway
 *
 * Central facade that:
 *  1. Checks which API integrations are configured (via env.ts)
 *  2. Routes calls to the appropriate real API client (EtherscanAPI / MempoolAPI)
 *  3. Automatically falls back to the on-chain simulator when no key is present
 *  4. Normalises data from different sources into a single ChainTransaction shape
 *  5. Provides a live connection status registry (latency, last pinged, error)
 *
 * Usage:
 *   import { gateway } from '@/lib/onChainApiGateway';
 *
 *   const txs  = await gateway.getTransactions('ethereum', '0xAbCd…');
 *   const fees = await gateway.getFees('bitcoin');
 *   const status = gateway.getStatus();
 *
 * The gateway is the ONLY place in the UI layer that touches real APIs.
 * Everything else in the app calls the gateway — not the individual clients.
 */

import { etherscanClients, EtherscanAPI, EtherscanTransaction, ERC20Transfer } from './etherscanAPI';
import { mempoolClient, MempoolAPI, BitcoinTransaction, FeeRecommendations } from './mempoolAPI';
import { isConfigured } from './env';
import { simulateTick, SimulatedTx } from './onChainSimulator';
import type { MonitoredChain } from './onChainTypes';

// ── Normalised shapes ─────────────────────────────────────────────────────────

export interface ChainTransaction {
  hash:        string;
  chain:       MonitoredChain;
  from:        string;
  to:          string;
  /** Native amount (ETH / BTC / etc.) */
  value:       number;
  /** Estimated USD value at time of tx (or current price proxy) */
  valueUsd:    number;
  symbol:      string;
  fee:         number;    // native token
  feeUsd:      number;
  timestamp:   Date | null;
  blockHeight: number | null;
  confirmed:   boolean;
  type:        'native' | 'erc20' | 'btc';
  /** Additional chain-specific metadata */
  meta?: Record<string, unknown>;
}

export interface ChainFeeEstimate {
  chain:      MonitoredChain;
  fast:       number;   // gwei for EVM, sat/vB for BTC
  medium:     number;
  slow:       number;
  unit:       'gwei' | 'sat/vB';
  source:     'real' | 'simulated';
  lastUpdated: Date;
}

export interface ChainBalance {
  chain:      MonitoredChain;
  address:    string;
  native:     number;
  symbol:     string;
  source:     'real' | 'simulated';
}

// ── Connection status ─────────────────────────────────────────────────────────

export type ApiConnectionStatus = 'connected' | 'degraded' | 'offline' | 'unconfigured';

export interface ApiProviderStatus {
  id:          string;
  name:        string;
  chain:       MonitoredChain;
  status:      ApiConnectionStatus;
  latencyMs:   number | null;
  lastPinged:  Date | null;
  errorMsg:    string | null;
  source:      'real' | 'simulated';
  configured:  boolean;
}

// ── Simulated price proxy ─────────────────────────────────────────────────────

const NATIVE_PRICES_USD: Record<MonitoredChain, number> = {
  ethereum: 3_420,
  bitcoin:  65_800,
  bnb:        592,
  solana:     172,
  polygon:   0.87,
};

function toUsd(chain: MonitoredChain, amount: number): number {
  return parseFloat((amount * (NATIVE_PRICES_USD[chain] ?? 1)).toFixed(2));
}

// ── Converters ────────────────────────────────────────────────────────────────

function ethTxToChain(tx: EtherscanTransaction, chain: MonitoredChain): ChainTransaction {
  const chainMeta = { ethereum: 'ETH', bnb: 'BNB', polygon: 'MATIC' };
  const symbol = chainMeta[chain as keyof typeof chainMeta] ?? 'ETH';
  const feeNative = (tx.gasPrice * 1e9 * tx.gasUsed) / 1e18;  // gas in native
  return {
    hash:        tx.hash,
    chain,
    from:        tx.from,
    to:          tx.to,
    value:       tx.value,
    valueUsd:    toUsd(chain, tx.value),
    symbol,
    fee:         feeNative,
    feeUsd:      toUsd(chain, feeNative),
    timestamp:   tx.timestamp,
    blockHeight: tx.blockNumber,
    confirmed:   true,
    type:        'native',
    meta:        { functionName: tx.functionName, isError: tx.isError },
  };
}

function erc20ToChain(tx: ERC20Transfer, chain: MonitoredChain): ChainTransaction {
  return {
    hash:        tx.hash,
    chain,
    from:        tx.from,
    to:          tx.to,
    value:       tx.value,
    valueUsd:    0,  // ERC-20 price lookup would require CoinGecko — omitted
    symbol:      tx.tokenSymbol,
    fee:         0,
    feeUsd:      0,
    timestamp:   tx.timestamp,
    blockHeight: tx.blockNumber,
    confirmed:   true,
    type:        'erc20',
    meta:        { tokenName: tx.tokenName, contractAddress: tx.contractAddress },
  };
}

function btcTxToChain(tx: BitcoinTransaction): ChainTransaction {
  const valueSat = tx.vout.reduce((s, v) => s + v.value, 0);
  const valueBTC = valueSat / 1e8;
  const feeBTC   = tx.fee / 1e8;
  const from     = tx.vin[0]?.address ?? 'Unknown';
  const to       = tx.vout[0]?.address ?? 'Unknown';
  return {
    hash:        tx.txid,
    chain:       'bitcoin',
    from,
    to,
    value:       valueBTC,
    valueUsd:    toUsd('bitcoin', valueBTC),
    symbol:      'BTC',
    fee:         feeBTC,
    feeUsd:      toUsd('bitcoin', feeBTC),
    timestamp:   tx.timestamp,
    blockHeight: tx.status.blockHeight,
    confirmed:   tx.status.confirmed,
    type:        'btc',
    meta:        { feeRate: tx.feeRate, weight: tx.weight, size: tx.size },
  };
}

function simTxToChain(tx: SimulatedTx): ChainTransaction {
  const nativeVal = parseFloat(tx.valueNative.split(' ')[0] ?? '0');
  return {
    hash:        tx.txHash,
    chain:       tx.chain,
    from:        tx.fromAddress,
    to:          tx.toAddress,
    value:       nativeVal,
    valueUsd:    tx.valueUsd,
    symbol:      tx.tokenSymbol,
    fee:         0.001,
    feeUsd:      toUsd(tx.chain, 0.001),
    timestamp:   new Date(tx.timestamp),
    blockHeight: tx.blockNumber,
    confirmed:   true,
    type:        'native',
    meta:        { simulated: true, whaleTier: tx.whaleTier },
  };
}

// ── OnChainApiGateway class ───────────────────────────────────────────────────

class OnChainApiGateway {
  private statusRegistry: Map<string, ApiProviderStatus> = new Map();

  constructor() {
    this.initStatus();
  }

  private initStatus() {
    const providers: Array<Omit<ApiProviderStatus, 'status' | 'latencyMs' | 'lastPinged' | 'errorMsg'>> = [
      { id: 'etherscan',   name: 'Etherscan',      chain: 'ethereum', source: 'real', configured: isConfigured('ETHERSCAN_API_KEY') },
      { id: 'bscscan',     name: 'BscScan',         chain: 'bnb',      source: 'real', configured: isConfigured('BSCSCAN_API_KEY')   },
      { id: 'mempool',     name: 'Mempool.space',   chain: 'bitcoin',  source: 'real', configured: true /* no key needed */         },
      { id: 'sim-eth',     name: 'ETH Simulator',   chain: 'ethereum', source: 'simulated', configured: true },
      { id: 'sim-btc',     name: 'BTC Simulator',   chain: 'bitcoin',  source: 'simulated', configured: true },
      { id: 'sim-bnb',     name: 'BNB Simulator',   chain: 'bnb',      source: 'simulated', configured: true },
      { id: 'sim-sol',     name: 'SOL Simulator',   chain: 'solana',   source: 'simulated', configured: true },
      { id: 'sim-poly',    name: 'POLY Simulator',  chain: 'polygon',  source: 'simulated', configured: true },
    ];

    for (const p of providers) {
      this.statusRegistry.set(p.id, {
        ...p,
        status:     p.source === 'simulated' ? 'connected' : (p.configured ? 'offline' : 'unconfigured'),
        latencyMs:  null,
        lastPinged: null,
        errorMsg:   null,
      });
    }
  }

  private setStatus(id: string, patch: Partial<ApiProviderStatus>) {
    const current = this.statusRegistry.get(id);
    if (current) this.statusRegistry.set(id, { ...current, ...patch });
  }

  // ── Public: get all API statuses ─────────────────────────────────────────

  getStatus(): ApiProviderStatus[] {
    return Array.from(this.statusRegistry.values());
  }

  getRealStatuses(): ApiProviderStatus[] {
    return this.getStatus().filter(s => s.source === 'real');
  }

  // ── Public: ping all real APIs ────────────────────────────────────────────

  async pingAll(): Promise<void> {
    await Promise.all([
      this.pingEtherscan(),
      this.pingBscscan(),
      this.pingMempool(),
    ]);
  }

  async pingEtherscan(): Promise<number | null> {
    this.setStatus('etherscan', { status: 'degraded', lastPinged: new Date() });
    const latency = await etherscanClients.ethereum.ping();
    if (latency !== null) {
      this.setStatus('etherscan', { status: 'connected', latencyMs: latency, errorMsg: null, lastPinged: new Date() });
    } else {
      this.setStatus('etherscan', { status: etherscanClients.ethereum.configured ? 'offline' : 'unconfigured', errorMsg: 'Ping failed' });
    }
    return latency;
  }

  async pingBscscan(): Promise<number | null> {
    const latency = await etherscanClients.bnb.ping();
    this.setStatus('bscscan', {
      status:    latency !== null ? 'connected' : (etherscanClients.bnb.configured ? 'offline' : 'unconfigured'),
      latencyMs: latency,
      lastPinged: new Date(),
      errorMsg:  latency !== null ? null : 'Ping failed',
    });
    return latency;
  }

  async pingMempool(): Promise<number | null> {
    this.setStatus('mempool', { status: 'degraded', lastPinged: new Date() });
    const latency = await mempoolClient.ping();
    this.setStatus('mempool', {
      status:    latency !== null ? 'connected' : 'offline',
      latencyMs: latency,
      lastPinged: new Date(),
      errorMsg:  latency !== null ? null : 'Mempool.space unreachable',
    });
    return latency;
  }

  // ── Public: get transactions ──────────────────────────────────────────────

  /**
   * Get transaction history for an address on any supported chain.
   * Auto-selects real API if configured, falls back to simulator.
   */
  async getTransactions(
    chain:   MonitoredChain,
    address: string,
    options?: { page?: number; offset?: number; erc20Only?: boolean },
  ): Promise<{ txs: ChainTransaction[]; source: 'real' | 'simulated' }> {
    const page   = options?.page   ?? 1;
    const offset = options?.offset ?? 25;

    // ── Bitcoin ──────────────────────────────────────────────────────────────
    if (chain === 'bitcoin') {
      const btcTxs = await mempoolClient.getAddressTransactions(address);
      if (btcTxs) {
        return {
          txs:    btcTxs.slice(0, offset).map(btcTxToChain),
          source: 'real',
        };
      }
    }

    // ── EVM chains (Ethereum / BNB / Polygon) ─────────────────────────────
    if (chain === 'ethereum' || chain === 'bnb' || chain === 'polygon') {
      const client = etherscanClients[chain] ?? etherscanClients.ethereum;

      if (options?.erc20Only) {
        const transfers = await client.getERC20Transfers(address, undefined, page, offset);
        if (transfers) {
          return { txs: transfers.map(tx => erc20ToChain(tx, chain)), source: 'real' };
        }
      } else {
        const [nativeTxs, erc20Txs] = await Promise.all([
          client.getNormalTransactions(address, 0, page, offset),
          client.getERC20Transfers(address, undefined, page, Math.min(offset, 10)),
        ]);

        if (nativeTxs || erc20Txs) {
          const txs: ChainTransaction[] = [
            ...(nativeTxs ?? []).map(tx => ethTxToChain(tx, chain)),
            ...(erc20Txs  ?? []).map(tx => erc20ToChain(tx, chain)),
          ];
          txs.sort((a, b) => (b.timestamp?.getTime() ?? 0) - (a.timestamp?.getTime() ?? 0));
          return { txs: txs.slice(0, offset), source: 'real' };
        }
      }
    }

    // ── Fallback: simulator ───────────────────────────────────────────────
    const simTxs = simulateTick([chain])
      .slice(0, offset)
      .filter(tx => tx.fromAddress.toLowerCase() === address.toLowerCase() ||
                    tx.toAddress.toLowerCase()   === address.toLowerCase() ||
                    true /* show all for demo */);

    return { txs: simTxs.slice(0, offset).map(simTxToChain), source: 'simulated' };
  }

  // ── Public: get balance ───────────────────────────────────────────────────

  async getBalance(chain: MonitoredChain, address: string): Promise<ChainBalance> {
    const symbolMap: Record<MonitoredChain, string> = {
      ethereum: 'ETH', bitcoin: 'BTC', bnb: 'BNB', solana: 'SOL', polygon: 'MATIC',
    };
    const symbol = symbolMap[chain];

    if (chain === 'bitcoin') {
      const stats = await mempoolClient.getAddressStats(address);
      if (stats) return { chain, address, native: stats.balanceBTC, symbol, source: 'real' };
    }

    if (chain === 'ethereum' || chain === 'bnb' || chain === 'polygon') {
      const client  = etherscanClients[chain] ?? etherscanClients.ethereum;
      const balance = await client.getBalance(address);
      if (balance !== null) return { chain, address, native: balance, symbol, source: 'real' };
    }

    // Simulated balance
    const seed = address.charCodeAt(2) ?? 5;
    return { chain, address, native: seed * 80 + 500, symbol, source: 'simulated' };
  }

  // ── Public: get fee estimates ─────────────────────────────────────────────

  async getFees(chain: MonitoredChain): Promise<ChainFeeEstimate> {
    if (chain === 'bitcoin') {
      const fees = await mempoolClient.getFeeRecommendations();
      if (fees) {
        return { chain, fast: fees.fastestFee, medium: fees.halfHourFee, slow: fees.hourFee, unit: 'sat/vB', source: 'real', lastUpdated: new Date() };
      }
    }

    if (chain === 'ethereum') {
      const gas = await etherscanClients.ethereum.getGasPrices();
      if (gas) {
        return { chain, fast: gas.fastGwei, medium: gas.proposeGwei, slow: gas.safeGwei, unit: 'gwei', source: 'real', lastUpdated: new Date() };
      }
    }

    // Simulated fallback
    const simFees: Record<MonitoredChain, ChainFeeEstimate> = {
      ethereum: { chain, fast: 45, medium: 30, slow: 18, unit: 'gwei', source: 'simulated', lastUpdated: new Date() },
      bitcoin:  { chain, fast: 35, medium: 20, slow: 8,  unit: 'sat/vB', source: 'simulated', lastUpdated: new Date() },
      bnb:      { chain, fast: 5,  medium: 3,  slow: 1,  unit: 'gwei', source: 'simulated', lastUpdated: new Date() },
      solana:   { chain, fast: 0.000025, medium: 0.000012, slow: 0.000005, unit: 'gwei', source: 'simulated', lastUpdated: new Date() },
      polygon:  { chain, fast: 200, medium: 120, slow: 60, unit: 'gwei', source: 'simulated', lastUpdated: new Date() },
    };
    return simFees[chain];
  }

  // ── Public: get mempool stats (BTC) ───────────────────────────────────────

  async getMempoolStats() {
    return mempoolClient.getMempoolStats();
  }

  async getMempoolTransactions() {
    return mempoolClient.getMempoolTransactions();
  }
}

/** Shared singleton — import across the app */
export const gateway = new OnChainApiGateway();
