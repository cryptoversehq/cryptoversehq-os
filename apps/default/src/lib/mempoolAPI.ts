/**
 * mempoolAPI.ts — §5.2 Mempool.space Bitcoin Integration
 *
 * Typed client for the Mempool.space REST API (https://mempool.space/docs/api).
 *
 * Key properties:
 *   - Completely free, no API key required.
 *   - Full CORS support — works directly from browsers.
 *   - Rate limit: generous (community-hosted, no official cap for public use).
 *   - Supports mainnet and testnet via the `network` constructor param.
 *   - Also works against self-hosted mempool instances.
 *
 * §5.2 coverage:
 *   - getAddressTransactions()  — confirmed + unconfirmed tx list for address
 *   - getMempoolTransactions()  — current unconfirmed mempool snapshot
 *   - getTransaction()          — single tx lookup by txid
 *   - getFeeRecommendations()   — live fee rate tiers (fastest/halfhour/hour/economy/minimum)
 *   - getBlock()                — block metadata
 *   - getAddressStats()         — balance + tx count summary for address
 *   - getPrice()                — BTC/USD spot price from mempool
 *   - ping()                    — health check with latency
 */

// ── Types (spec §5.2) ────────────────────────────────────────────────────────

/** A single UTXO input */
export interface BitcoinVin {
  txid:     string;
  vout:     number;
  address:  string | null;
  value:    number;     // satoshis
  sequence: number;
}

/** A single UTXO output */
export interface BitcoinVout {
  address:        string | null;
  value:          number;    // satoshis
  scriptpubkey:   string;
  scriptpubkeyType: string;  // 'p2pkh' | 'p2sh' | 'v0_p2wpkh' | 'v0_p2wsh' | 'v1_p2tr' etc.
}

/** Confirmed block status */
export interface TxStatus {
  confirmed:  boolean;
  blockHeight: number | null;
  blockHash:   string | null;
  blockTime:   number | null;   // unix timestamp
}

/** §5.2 BitcoinTransaction */
export interface BitcoinTransaction {
  txid:      string;
  version:   number;
  locktime:  number;
  vin:       BitcoinVin[];
  vout:      BitcoinVout[];
  size:      number;
  weight:    number;
  /** Total fee in satoshis */
  fee:       number;
  /** Fee rate in sat/vB */
  feeRate:   number;
  status:    TxStatus;
  /** Null for unconfirmed transactions */
  timestamp: Date | null;
  /** Total value sent across all outputs (satoshis) */
  totalOut:  number;
}

/** §5.2 MempoolTransaction — lightweight mempool entry */
export interface MempoolTransaction {
  txid:    string;
  fee:     number;    // satoshis
  feeRate: number;    // sat/vB
  size:    number;    // vbytes
  weight:  number;
}

/** Fee rate recommendations (sat/vB) */
export interface FeeRecommendations {
  fastestFee:  number;    // ~10 min
  halfHourFee: number;    // ~30 min
  hourFee:     number;    // ~60 min
  economyFee:  number;    // ~few hours
  minimumFee:  number;    // minimum relay
}

/** Address stats summary */
export interface AddressStats {
  address:          string;
  /** Balance in satoshis */
  balance:          number;
  /** Balance in BTC */
  balanceBTC:       number;
  confirmedTxCount: number;
  mempoolTxCount:   number;
  totalReceived:    number;   // satoshis
  totalSent:        number;   // satoshis
}

/** Block metadata */
export interface BitcoinBlock {
  hash:         string;
  height:       number;
  version:      number;
  timestamp:    Date;
  txCount:      number;
  size:         number;
  weight:       number;
  miner:        string;
  medianFee:    number;   // median fee rate sat/vB
  totalFees:    number;   // satoshis
  reward:       number;   // block subsidy + fees, satoshis
}

/** Mempool statistics */
export interface MempoolStats {
  count:         number;   // total unconfirmed txs
  vsize:         number;   // total virtual size in vB
  totalFees:     number;   // satoshis
  histogram:     Array<[number, number]>;  // [feeRate, vsize] buckets
}

// ── Simple fetch helper ───────────────────────────────────────────────────────

async function apiFetch<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal:  AbortSignal.timeout(10_000),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json() as T;
  } catch (err) {
    console.warn(`[MempoolAPI] ${(err as Error).message} — ${url}`);
    return null;
  }
}

// ── Raw API shapes ────────────────────────────────────────────────────────────

interface RawTx {
  txid:     string;
  version:  number;
  locktime: number;
  size:     number;
  weight:   number;
  fee:      number;
  status:   { confirmed: boolean; block_height?: number; block_hash?: string; block_time?: number };
  vin:  Array<{ txid: string; vout: number; prevout?: { scriptpubkey_address?: string; value?: number }; sequence: number }>;
  vout: Array<{ scriptpubkey_address?: string; value: number; scriptpubkey: string; scriptpubkey_type: string }>;
}

function parseTx(raw: RawTx): BitcoinTransaction {
  const vin: BitcoinVin[] = raw.vin.map(v => ({
    txid:     v.txid,
    vout:     v.vout,
    address:  v.prevout?.scriptpubkey_address ?? null,
    value:    v.prevout?.value ?? 0,
    sequence: v.sequence,
  }));

  const vout: BitcoinVout[] = raw.vout.map(v => ({
    address:          v.scriptpubkey_address ?? null,
    value:            v.value,
    scriptpubkey:     v.scriptpubkey,
    scriptpubkeyType: v.scriptpubkey_type,
  }));

  const totalOut = vout.reduce((s, v) => s + v.value, 0);
  const feeRate  = raw.weight > 0 ? raw.fee / (raw.weight / 4) : 0;

  return {
    txid:      raw.txid,
    version:   raw.version,
    locktime:  raw.locktime,
    vin,
    vout,
    size:      raw.size,
    weight:    raw.weight,
    fee:       raw.fee,
    feeRate:   parseFloat(feeRate.toFixed(2)),
    status: {
      confirmed:   raw.status.confirmed,
      blockHeight: raw.status.block_height ?? null,
      blockHash:   raw.status.block_hash   ?? null,
      blockTime:   raw.status.block_time   ?? null,
    },
    timestamp: raw.status.block_time ? new Date(raw.status.block_time * 1000) : null,
    totalOut,
  };
}

// ── MempoolAPI class (§5.2 spec interface) ────────────────────────────────────

export class MempoolAPI {
  readonly baseUrl: string;
  private network: 'mainnet' | 'testnet' | 'signet';

  constructor(options?: { network?: 'mainnet' | 'testnet' | 'signet'; baseUrl?: string }) {
    this.network = options?.network ?? 'mainnet';
    if (options?.baseUrl) {
      this.baseUrl = options.baseUrl.replace(/\/$/, '');
    } else {
      const sub = this.network === 'mainnet' ? '' : `/${this.network}`;
      this.baseUrl = `https://mempool.space${sub}/api`;
    }
  }

  // ── §5.2 getAddressTransactions ──────────────────────────────────────────

  /**
   * Get confirmed + recent unconfirmed transactions for a Bitcoin address.
   * Returns up to 50 transactions (mempool.space paginates after that via
   * the `after_txid` parameter — pass the last txid for next pages).
   */
  async getAddressTransactions(
    address:   string,
    afterTxid?: string,
  ): Promise<BitcoinTransaction[] | null> {
    const suffix = afterTxid ? `/txs?after_txid=${afterTxid}` : '/txs';
    const raw = await apiFetch<RawTx[]>(`${this.baseUrl}/address/${address}${suffix}`);
    if (!raw) return null;
    return raw.map(parseTx);
  }

  // ── §5.2 getMempoolTransactions ──────────────────────────────────────────

  /**
   * Get a lightweight snapshot of current unconfirmed mempool transactions.
   * Returns txids only; use getTransaction() for full details.
   */
  async getMempoolTransactionIds(): Promise<string[] | null> {
    return apiFetch<string[]>(`${this.baseUrl}/mempool/txids`);
  }

  /**
   * Get mempool statistics (count, vsize, fees, fee rate histogram).
   */
  async getMempoolStats(): Promise<MempoolStats | null> {
    const raw = await apiFetch<{
      count: number; vsize: number; total_fee: number;
      fee_histogram: Array<[number, number]>;
    }>(`${this.baseUrl}/mempool`);
    if (!raw) return null;
    return {
      count:     raw.count,
      vsize:     raw.vsize,
      totalFees: raw.total_fee,
      histogram: raw.fee_histogram,
    };
  }

  /**
   * Get recent unconfirmed transactions with full details.
   * Returns up to 25 recent mempool entries.
   */
  async getMempoolTransactions(): Promise<MempoolTransaction[] | null> {
    const raw = await apiFetch<RawTx[]>(`${this.baseUrl}/mempool/recent`);
    if (!raw) return null;
    return raw.map(tx => ({
      txid:    tx.txid,
      fee:     tx.fee,
      feeRate: tx.weight > 0 ? parseFloat((tx.fee / (tx.weight / 4)).toFixed(2)) : 0,
      size:    tx.size,
      weight:  tx.weight,
    }));
  }

  // ── Single transaction ────────────────────────────────────────────────────

  /**
   * Get full details for a single transaction by txid.
   */
  async getTransaction(txid: string): Promise<BitcoinTransaction | null> {
    const raw = await apiFetch<RawTx>(`${this.baseUrl}/tx/${txid}`);
    if (!raw) return null;
    return parseTx(raw);
  }

  // ── Fee recommendations ────────────────────────────────────────────────────

  /**
   * Get recommended fee rates in sat/vB for different confirmation targets.
   */
  async getFeeRecommendations(): Promise<FeeRecommendations | null> {
    const raw = await apiFetch<{
      fastestFee: number; halfHourFee: number; hourFee: number;
      economyFee: number; minimumFee: number;
    }>(`${this.baseUrl}/v1/fees/recommended`);
    if (!raw) return null;
    return {
      fastestFee:  raw.fastestFee,
      halfHourFee: raw.halfHourFee,
      hourFee:     raw.hourFee,
      economyFee:  raw.economyFee,
      minimumFee:  raw.minimumFee,
    };
  }

  // ── Address stats ──────────────────────────────────────────────────────────

  /**
   * Get summarised stats for an address (balance, tx count, totals).
   */
  async getAddressStats(address: string): Promise<AddressStats | null> {
    const raw = await apiFetch<{
      address: string;
      chain_stats: { funded_txo_sum: number; spent_txo_sum: number; tx_count: number };
      mempool_stats: { funded_txo_sum: number; spent_txo_sum: number; tx_count: number };
    }>(`${this.baseUrl}/address/${address}`);
    if (!raw) return null;

    const totalReceived  = raw.chain_stats.funded_txo_sum;
    const totalSent      = raw.chain_stats.spent_txo_sum;
    const balance        = totalReceived - totalSent;

    return {
      address:          raw.address,
      balance,
      balanceBTC:       balance / 1e8,
      confirmedTxCount: raw.chain_stats.tx_count,
      mempoolTxCount:   raw.mempool_stats.tx_count,
      totalReceived,
      totalSent,
    };
  }

  // ── Block data ─────────────────────────────────────────────────────────────

  /**
   * Get the latest confirmed block.
   */
  async getLatestBlock(): Promise<BitcoinBlock | null> {
    const hash = await apiFetch<string>(`${this.baseUrl}/blocks/tip/hash`);
    if (!hash) return null;
    return this.getBlock(hash);
  }

  /**
   * Get block metadata by hash or height.
   */
  async getBlock(hashOrHeight: string | number): Promise<BitcoinBlock | null> {
    const path = typeof hashOrHeight === 'number'
      ? `${this.baseUrl}/block-height/${hashOrHeight}`
      : `${this.baseUrl}/block/${hashOrHeight}`;

    // If it's a height, first resolve to hash
    let hash: string;
    if (typeof hashOrHeight === 'number') {
      const resolved = await apiFetch<string>(path);
      if (!resolved) return null;
      hash = resolved;
    } else {
      hash = hashOrHeight;
    }

    const raw = await apiFetch<{
      id: string; height: number; version: number; timestamp: number;
      tx_count: number; size: number; weight: number; miner?: string;
      extras?: { medianFee?: number; totalFees?: number; reward?: number };
    }>(`${this.baseUrl}/block/${hash}`);

    if (!raw) return null;

    return {
      hash:      raw.id,
      height:    raw.height,
      version:   raw.version,
      timestamp: new Date(raw.timestamp * 1000),
      txCount:   raw.tx_count,
      size:      raw.size,
      weight:    raw.weight,
      miner:     raw.extras ? (raw.miner ?? 'Unknown') : 'Unknown',
      medianFee: raw.extras?.medianFee ?? 0,
      totalFees: raw.extras?.totalFees ?? 0,
      reward:    raw.extras?.reward    ?? 0,
    };
  }

  // ── BTC price ──────────────────────────────────────────────────────────────

  /**
   * Get current BTC/USD price (and other currencies) from mempool.space.
   */
  async getPrice(): Promise<{ USD: number; EUR?: number; GBP?: number } | null> {
    return apiFetch<{ USD: number; EUR?: number; GBP?: number }>(
      `${this.baseUrl}/v1/prices`
    );
  }

  // ── Health check ───────────────────────────────────────────────────────────

  /**
   * Ping — returns latency ms on success, null on failure.
   */
  async ping(): Promise<number | null> {
    const start = Date.now();
    const res = await apiFetch<string>(`${this.baseUrl}/blocks/tip/hash`);
    return res !== null ? Date.now() - start : null;
  }
}

/** Shared mainnet singleton */
export const mempoolClient = new MempoolAPI();
