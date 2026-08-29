/**
 * etherscanAPI.ts — §5.1 Etherscan / EVM Block Explorer Integration
 *
 * Provides typed wrappers around the Etherscan v1 API (and its equivalents:
 * BscScan, Polygonscan, PolygonMumbai, etc.) for real blockchain data.
 *
 * Design principles:
 *  - Graceful degradation: all methods return null on error — callers fall back
 *    to the simulator automatically via the ApiGateway.
 *  - Rate limiting: tracks last call time per API key, enforces 5 req/s ceiling.
 *  - CORS: Etherscan allows direct browser calls with an API key.
 *  - No API key required for public read endpoints (rate-limited to 1 req/5 s).
 *  - Browser-safe: no Node-only modules.
 *
 * Supported chains via the same API shape:
 *   Ethereum  → https://api.etherscan.io/api
 *   BSC       → https://api.bscscan.com/api
 *   Polygon   → https://api.polygonscan.com/api
 *   Arbitrum  → https://api.arbiscan.io/api
 *   Optimism  → https://api-optimistic.etherscan.io/api
 */

import { onChainEnv } from './env';
import { isApiEnabled, markApiUsed } from './apiStatusService';
import { proxySecretFetch } from './taskadeSecretsService';

// ── Public exports for store integration ────────────────────────────────────

/**
 * Fetch the latest normal transactions for a given Ethereum address.
 * Uses the Etherscan secret from Space Settings → Secrets (alias: etherscan).
 * Returns null on any error — callers fall back to the simulator.
 */
export async function fetchLatestTransactions(
  address: string = '',
  chainId: string = '1',
): Promise<EtherscanTransaction[] | null> {
  if (!isApiEnabled('etherscan')) return null;
  try {
    markApiUsed('etherscan');
    const params = address
      ? `module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=10&sort=desc`
      : `module=account&action=txlist&address=0xbe0eb53f46cd790cd13851d5eff43d12404d33e8&startblock=0&endblock=99999999&page=1&offset=10&sort=desc`;
    const url = `https://api.etherscan.io/api?${params}`;
    const res = await proxySecretFetch('etherscan', { url });
    if (!res.ok) {
      console.warn('[Etherscan] Proxy request failed:', res.status);
      return null;
    }
    const json = await res.json() as { status: string; message: string; result: any[] };
    if (json.status !== '1') {
      console.warn('[Etherscan] API error:', json.message);
      return null;
    }
    return (json.result || []).map((tx: any) => ({
      hash:         tx.hash,
      from:         tx.from,
      to:           tx.to ?? '',
      value:        parseFloat(tx.value) / 1e18,
      gasPrice:     parseFloat(tx.gasPrice) / 1e9,
      gasUsed:      parseInt(tx.gasUsed, 10),
      isError:      tx.isError === '1',
      timestamp:    new Date(parseInt(tx.timeStamp, 10) * 1000),
      blockNumber:  parseInt(tx.blockNumber, 10),
      nonce:        parseInt(tx.nonce, 10),
      functionName: tx.functionName || undefined,
    }));
  } catch (err) {
    console.warn('[Etherscan] Fetch failed:', (err as Error).message);
    return null;
  }
}

/**
 * Test the Etherscan connection using a minimal proxied request.
 */
export async function testEtherscanConnection(): Promise<{ success: boolean; message: string; latencyMs?: number }> {
  const start = Date.now();
  try {
    const url = 'https://api.etherscan.io/api?module=account&action=balance&address=0x0000000000000000000000000000000000000000&tag=latest';
    const res = await proxySecretFetch('etherscan', { url });
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      return { success: false, message: `HTTP ${res.status} — check your API key in Space Settings → Secrets (alias: etherscan)`, latencyMs };
    }
    const json = await res.json() as { status: string; message: string };
    if (json.status === '1') {
      return { success: true, message: `Etherscan API connected successfully (${latencyMs}ms latency). Real blockchain data is now available.`, latencyMs };
    }
    return { success: false, message: json.message || 'Unknown API error', latencyMs };
  } catch (err) {
    return { success: false, message: `Connection failed: ${(err as Error).message}. Ensure the secret alias 'etherscan' is configured in Space Settings → Secrets.`, latencyMs: Date.now() - start };
  }
}

// ── Types (spec §5.1) ────────────────────────────────────────────────────────

export interface EtherscanTransaction {
  hash:          string;
  from:          string;
  to:            string;
  /** ETH / native token value (already converted from wei) */
  value:         number;
  gasPrice:      number;  // Gwei
  gasUsed:       number;
  isError:       boolean;
  timestamp:     Date;
  blockNumber:   number;
  nonce:         number;
  /** Human-readable function name if available */
  functionName?: string;
}

export interface ERC20Transfer {
  hash:          string;
  from:          string;
  to:            string;
  tokenName:     string;
  tokenSymbol:   string;
  tokenDecimals: number;
  contractAddress: string;
  /** Token amount (already divided by 10^decimals) */
  value:         number;
  timestamp:     Date;
  blockNumber:   number;
}

export interface EtherscanAccount {
  address:      string;
  /** Balance in ETH / native token */
  balance:      number;
  isContract:   boolean;
}

export interface EtherscanBlock {
  blockNumber:  number;
  timestamp:    Date;
  hash:         string;
  miner:        string;
  gasUsed:      number;
  gasLimit:     number;
  txCount:      number;
}

export interface EtherscanGasPrices {
  safeGwei:     number;
  proposeGwei:  number;
  fastGwei:     number;
  baseFeeGwei:  number;
  lastUpdated:  Date;
}

// ── Chain configuration ───────────────────────────────────────────────────────

export interface EtherscanChainConfig {
  name:    string;
  baseUrl: string;
  symbol:  string;
  /** Optional: different API key for this chain */
  apiKey?: string;
}

export const ETHERSCAN_CHAINS: Record<string, EtherscanChainConfig> = {
  ethereum: { name: 'Ethereum', baseUrl: 'https://api.etherscan.io/api',           symbol: 'ETH' },
  bnb:      { name: 'BNB Chain', baseUrl: 'https://api.bscscan.com/api',            symbol: 'BNB' },
  polygon:  { name: 'Polygon',   baseUrl: 'https://api.polygonscan.com/api',        symbol: 'MATIC' },
  arbitrum: { name: 'Arbitrum',  baseUrl: 'https://api.arbiscan.io/api',            symbol: 'ETH' },
  optimism: { name: 'Optimism',  baseUrl: 'https://api-optimistic.etherscan.io/api',symbol: 'ETH' },
};

// ── Simple rate limiter ───────────────────────────────────────────────────────

class RateLimiter {
  private queue: Array<() => void> = [];
  private lastCall = 0;
  private minInterval: number;

  constructor(requestsPerSecond: number) {
    this.minInterval = 1000 / requestsPerSecond;
  }

  async throttle(): Promise<void> {
    const now = Date.now();
    const gap = now - this.lastCall;
    if (gap < this.minInterval) {
      await new Promise(r => setTimeout(r, this.minInterval - gap));
    }
    this.lastCall = Date.now();
  }
}

// ── API error types ───────────────────────────────────────────────────────────

export class EtherscanError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'EtherscanError';
  }
}

// ── EtherscanAPI class (§5.1 spec interface) ─────────────────────────────────

export class EtherscanAPI {
  private apiKey:    string;
  private baseUrl:   string;
  private symbol:    string;
  private limiter:   RateLimiter;
  private chainName: string;

  constructor(chain: string = 'ethereum', apiKey?: string) {
    const cfg = ETHERSCAN_CHAINS[chain] ?? ETHERSCAN_CHAINS['ethereum'];
    this.chainName = cfg.name;
    this.baseUrl   = cfg.baseUrl;
    this.symbol    = cfg.symbol;
    this.limiter   = new RateLimiter(apiKey ? 4 : 0.2);   // 5 req/s with key, 1/5s without

    // Auto-select API key based on chain
    if (apiKey) {
      this.apiKey = apiKey;
    } else if (chain === 'ethereum') {
      this.apiKey = onChainEnv.etherscanApiKey;
    } else if (chain === 'bnb') {
      this.apiKey = onChainEnv.bscscanApiKey;
    } else {
      this.apiKey = '';
    }
  }

  // ── Internal fetch helper ────────────────────────────────────────────────

  private async call<T>(params: Record<string, string>): Promise<T | null> {
    // Admin kill switch — null makes callers fall back to the simulator.
    if (!isApiEnabled('etherscan')) {
      console.warn(`[EtherscanAPI:${this.chainName}] Disabled by administrator — using simulator fallback`);
      return null;
    }
    try {
      await this.limiter.throttle();
      markApiUsed('etherscan');

      const qs = new URLSearchParams({
        ...params,
        ...(this.apiKey ? { apikey: this.apiKey } : {}),
      });

      const res = await fetch(`${this.baseUrl}?${qs.toString()}`, {
        headers: { 'Accept': 'application/json' },
        signal:  AbortSignal.timeout(10_000),
      });

      if (!res.ok) throw new EtherscanError('HTTP_ERROR', `HTTP ${res.status}`);

      const json = await res.json() as { status: string; message: string; result: T };

      if (json.status !== '1') {
        // Common: "No transactions found" is status=0 with result=[]
        if (json.message === 'No transactions found') return [] as unknown as T;
        throw new EtherscanError(json.message, json.result as unknown as string);
      }

      return json.result;
    } catch (err) {
      console.warn(`[EtherscanAPI:${this.chainName}] ${(err as Error).message}`);
      return null;
    }
  }

  // ── §5.1 getNormalTransactions ───────────────────────────────────────────

  /**
   * Get normal (native token) transactions for an address.
   * @param address Wallet address
   * @param startBlock Optional earliest block (default 0 = all history)
   * @param page      Page number for pagination (default 1)
   * @param offset    Results per page (default 25, max 10000)
   */
  async getNormalTransactions(
    address:    string,
    startBlock: number = 0,
    page:       number = 1,
    offset:     number = 25,
  ): Promise<EtherscanTransaction[] | null> {
    const raw = await this.call<any[]>({
      module:     'account',
      action:     'txlist',
      address,
      startblock: startBlock.toString(),
      endblock:   '99999999',
      page:       page.toString(),
      offset:     offset.toString(),
      sort:       'desc',
    });
    if (!raw) return null;

    return raw.map(tx => ({
      hash:         tx.hash,
      from:         tx.from,
      to:           tx.to ?? '',
      value:        parseFloat(tx.value) / 1e18,          // Wei → ETH
      gasPrice:     parseFloat(tx.gasPrice) / 1e9,        // Wei → Gwei
      gasUsed:      parseInt(tx.gasUsed, 10),
      isError:      tx.isError === '1',
      timestamp:    new Date(parseInt(tx.timeStamp, 10) * 1000),
      blockNumber:  parseInt(tx.blockNumber, 10),
      nonce:        parseInt(tx.nonce, 10),
      functionName: tx.functionName || undefined,
    }));
  }

  // ── §5.1 getERC20Transfers ───────────────────────────────────────────────

  /**
   * Get ERC-20 token transfer events for an address.
   * @param address         Wallet address
   * @param contractAddress Optional: filter to a specific token contract
   */
  async getERC20Transfers(
    address:          string,
    contractAddress?: string,
    page:             number = 1,
    offset:           number = 25,
  ): Promise<ERC20Transfer[] | null> {
    const params: Record<string, string> = {
      module:  'account',
      action:  'tokentx',
      address,
      sort:    'desc',
      page:    page.toString(),
      offset:  offset.toString(),
    };
    if (contractAddress) params.contractaddress = contractAddress;

    const raw = await this.call<any[]>(params);
    if (!raw) return null;

    return raw.map(tx => {
      const decimals = parseInt(tx.tokenDecimal, 10) || 18;
      return {
        hash:            tx.hash,
        from:            tx.from,
        to:              tx.to,
        tokenName:       tx.tokenName,
        tokenSymbol:     tx.tokenSymbol,
        tokenDecimals:   decimals,
        contractAddress: tx.contractAddress,
        value:           parseFloat(tx.value) / Math.pow(10, decimals),
        timestamp:       new Date(parseInt(tx.timeStamp, 10) * 1000),
        blockNumber:     parseInt(tx.blockNumber, 10),
      };
    });
  }

  // ── Account balance ───────────────────────────────────────────────────────

  /**
   * Get native token balance for an address (in ETH/BNB/MATIC etc.)
   */
  async getBalance(address: string): Promise<number | null> {
    const raw = await this.call<string>({
      module:  'account',
      action:  'balance',
      address,
      tag:     'latest',
    });
    if (raw === null) return null;
    return parseFloat(raw) / 1e18;
  }

  /**
   * Get native balances for multiple addresses in one call (max 20).
   */
  async getBalances(addresses: string[]): Promise<Record<string, number> | null> {
    if (addresses.length > 20) addresses = addresses.slice(0, 20);
    const raw = await this.call<Array<{ account: string; balance: string }>>({
      module:  'account',
      action:  'balancemulti',
      address: addresses.join(','),
      tag:     'latest',
    });
    if (!raw) return null;
    const result: Record<string, number> = {};
    for (const r of raw) {
      result[r.account.toLowerCase()] = parseFloat(r.balance) / 1e18;
    }
    return result;
  }

  // ── Gas oracle ────────────────────────────────────────────────────────────

  /**
   * Get current gas prices from Etherscan's Gas Oracle (Ethereum only).
   */
  async getGasPrices(): Promise<EtherscanGasPrices | null> {
    const raw = await this.call<any>({
      module: 'gastracker',
      action: 'gasoracle',
    });
    if (!raw) return null;
    return {
      safeGwei:    parseFloat(raw.SafeGasPrice),
      proposeGwei: parseFloat(raw.ProposeGasPrice),
      fastGwei:    parseFloat(raw.FastGasPrice),
      baseFeeGwei: parseFloat(raw.suggestBaseFee ?? '0'),
      lastUpdated: new Date(),
    };
  }

  // ── Internal transactions ─────────────────────────────────────────────────

  /**
   * Get internal transactions (contract calls) for an address.
   */
  async getInternalTransactions(address: string, page = 1, offset = 25): Promise<EtherscanTransaction[] | null> {
    const raw = await this.call<any[]>({
      module:  'account',
      action:  'txlistinternal',
      address,
      page:    page.toString(),
      offset:  offset.toString(),
      sort:    'desc',
    });
    if (!raw) return null;
    return raw.map(tx => ({
      hash:        tx.hash,
      from:        tx.from,
      to:          tx.to ?? '',
      value:       parseFloat(tx.value) / 1e18,
      gasPrice:    0,
      gasUsed:     parseInt(tx.gasUsed, 10),
      isError:     tx.isError === '1',
      timestamp:   new Date(parseInt(tx.timeStamp, 10) * 1000),
      blockNumber: parseInt(tx.blockNumber, 10),
      nonce:       0,
    }));
  }

  // ── Health check ─────────────────────────────────────────────────────────

  /**
   * Ping the API — returns latency ms on success, null on failure.
   */
  async ping(): Promise<number | null> {
    const start = Date.now();
    const raw = await this.call<string>({
      module: 'stats',
      action: 'ethsupply',
    });
    return raw !== null ? Date.now() - start : null;
  }

  get chain() { return this.chainName; }
  get configured() { return this.apiKey.length > 0; }
}

// ── Pre-built instances for common chains ─────────────────────────────────────

export const etherscanClients: Record<string, EtherscanAPI> = {
  ethereum: new EtherscanAPI('ethereum'),
  bnb:      new EtherscanAPI('bnb'),
  polygon:  new EtherscanAPI('polygon'),
};
