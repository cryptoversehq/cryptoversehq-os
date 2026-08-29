/**
 * onChainSimulator.ts
 *
 * Deterministic on-chain transaction simulator for the CryptoVerse HQ
 * On-Chain Analysis system.
 *
 * Purpose:
 *   Generates realistic-looking blockchain transactions that can be
 *   matched against user-configured OnChainAlerts — without making
 *   any real network calls.
 *
 * Design principles:
 *   - Time-seeded PRNG: transactions differ each tick but are reproducible
 *     within the same second (good for testing).
 *   - Per-chain realism: block numbers advance at chain-accurate rates,
 *     value distributions match observed whale patterns, tx hashes
 *     use chain-correct formats.
 *   - Known entity injection: ~20% of transactions reference real whale
 *     addresses / exchange wallets for authenticity.
 *   - Pure function: simulateTick() returns an array of synthetic
 *     transactions — no side effects.
 */

import {
  MonitoredChain,
  ChainMeta,
  CHAIN_META,
  KNOWN_ADDRESSES,
  TokenStandard,
  WhaleTier,
  getWhaleTier,
} from './onChainTypes';

// ─────────────────────────────────────────────────────────────────────────────
// PRNG
// ─────────────────────────────────────────────────────────────────────────────

/** xorshift32 PRNG — lightweight and reproducible. */
function createRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return function () {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** Seeds the RNG from the current epoch second so each tick is unique. */
function tickSeed(chain: MonitoredChain): number {
  const t = Math.floor(Date.now() / 1_000);
  let h = 2166136261;
  for (const c of chain) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h ^ t) >>> 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// TX HASH GENERATION
// ─────────────────────────────────────────────────────────────────────────────

const HEX = '0123456789abcdef';

function randomHex(len: number, rng: () => number): string {
  return Array.from({ length: len }, () => HEX[Math.floor(rng() * 16)]).join('');
}

function makeTxHash(chain: MonitoredChain, rng: () => number): string {
  const meta = CHAIN_META[chain];
  const raw  = randomHex(64, rng);
  return meta.txHashPrefix + raw.slice(0, meta.txHashLength - meta.txHashPrefix.length);
}

function makeAddress(chain: MonitoredChain, rng: () => number): string {
  switch (chain) {
    case 'ethereum':
    case 'bnb':
      return '0x' + randomHex(40, rng);
    case 'bitcoin':
      // P2PKH-style address (simplified)
      return '1' + Array.from({ length: 33 }, () => '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'[Math.floor(rng() * 58)]).join('');
    case 'solana':
      return Array.from({ length: 44 }, () => '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'[Math.floor(rng() * 58)]).join('');
    case 'polygon':
      return '0x' + randomHex(40, rng);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// VALUE DISTRIBUTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a USD value using a log-normal distribution biased toward
 * whale-tier transactions (since those are the interesting ones for alerts).
 *
 * Distribution:
 *   ~50% : $10K – $200K  (dolphin)
 *   ~30% : $200K – $2M   (whale)
 *   ~15% : $2M – $20M    (whale / mega)
 *    ~5% : $20M+          (mega whale)
 */
function simulateUsdValue(rng: () => number): number {
  const band = rng();
  let value: number;

  if (band < 0.05) {
    // Mega whale: $20M – $200M
    value = 20_000_000 + rng() * 180_000_000;
  } else if (band < 0.20) {
    // Large whale: $2M – $20M
    value = 2_000_000 + rng() * 18_000_000;
  } else if (band < 0.50) {
    // Whale: $200K – $2M
    value = 200_000 + rng() * 1_800_000;
  } else {
    // Dolphin / fish: $10K – $200K
    value = 10_000 + rng() * 190_000;
  }

  return Math.round(value);
}

// ─────────────────────────────────────────────────────────────────────────────
// TOKEN STANDARDS PER CHAIN
// ─────────────────────────────────────────────────────────────────────────────

const CHAIN_TOKENS: Record<MonitoredChain, Array<{ symbol: string; standard: TokenStandard; probability: number }>> = {
  ethereum: [
    { symbol: 'ETH',  standard: 'native', probability: 0.40 },
    { symbol: 'USDT', standard: 'ERC-20', probability: 0.25 },
    { symbol: 'USDC', standard: 'ERC-20', probability: 0.15 },
    { symbol: 'WBTC', standard: 'ERC-20', probability: 0.10 },
    { symbol: 'LINK', standard: 'ERC-20', probability: 0.05 },
    { symbol: 'UNI',  standard: 'ERC-20', probability: 0.05 },
  ],
  bitcoin: [
    { symbol: 'BTC', standard: 'native',  probability: 0.90 },
    { symbol: 'ORDI', standard: 'BRC-20', probability: 0.10 },
  ],
  bnb: [
    { symbol: 'BNB',  standard: 'native',  probability: 0.40 },
    { symbol: 'USDT', standard: 'BEP-20',  probability: 0.30 },
    { symbol: 'CAKE', standard: 'BEP-20',  probability: 0.15 },
    { symbol: 'BUSD', standard: 'BEP-20',  probability: 0.15 },
  ],
  solana: [
    { symbol: 'SOL',   standard: 'native', probability: 0.45 },
    { symbol: 'USDC',  standard: 'SPL',    probability: 0.25 },
    { symbol: 'BONK',  standard: 'SPL',    probability: 0.15 },
    { symbol: 'JTO',   standard: 'SPL',    probability: 0.10 },
    { symbol: 'PYTH',  standard: 'SPL',    probability: 0.05 },
  ],
  polygon: [
    { symbol: 'MATIC', standard: 'native',  probability: 0.40 },
    { symbol: 'USDC',  standard: 'ERC-20',  probability: 0.25 },
    { symbol: 'USDT',  standard: 'ERC-20',  probability: 0.20 },
    { symbol: 'WETH',  standard: 'ERC-20',  probability: 0.10 },
    { symbol: 'QUICK', standard: 'ERC-20',  probability: 0.05 },
  ],
};

function pickToken(
  chain: MonitoredChain,
  rng:   () => number,
): { symbol: string; standard: TokenStandard } {
  const tokens = CHAIN_TOKENS[chain];
  let roll = rng();
  for (const t of tokens) {
    roll -= t.probability;
    if (roll <= 0) return t;
  }
  return tokens[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// KNOWN ENTITY INJECTION
// ─────────────────────────────────────────────────────────────────────────────

function injectKnownAddress(
  chain:     MonitoredChain,
  generated: string,
  rng:       () => number,
): { address: string; label: string | null } {
  // 20% chance to use a known entity address
  if (rng() > 0.20) return { address: generated, label: null };

  const chainKnown = KNOWN_ADDRESSES.filter(a => a.chain === chain);
  if (chainKnown.length === 0) return { address: generated, label: null };

  const known = chainKnown[Math.floor(rng() * chainKnown.length)];
  return { address: known.address, label: known.label };
}

// ─────────────────────────────────────────────────────────────────────────────
// SIMULATED TRANSACTION SHAPE
// ─────────────────────────────────────────────────────────────────────────────

export interface SimulatedTx {
  txHash:        string;
  chain:         MonitoredChain;
  fromAddress:   string;
  fromLabel:     string | null;
  toAddress:     string;
  toLabel:       string | null;
  valueUsd:      number;
  valueNative:   string;
  tokenSymbol:   string;
  tokenStandard: TokenStandard;
  blockNumber:   number;
  whaleTier:     WhaleTier;
  timestamp:     string;  // ISO-8601
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK NUMBER TRACKING (per chain, approximate)
// ─────────────────────────────────────────────────────────────────────────────

/** Approximate genesis block numbers for each chain as of early 2024. */
const GENESIS_BLOCKS: Record<MonitoredChain, number> = {
  ethereum: 19_000_000,
  bitcoin:  832_000,
  bnb:      36_000_000,
  solana:   270_000_000,
  polygon:  54_000_000,
};

function currentBlockNumber(chain: MonitoredChain): number {
  const meta      = CHAIN_META[chain];
  const genesis   = GENESIS_BLOCKS[chain];
  const secondsSinceEpoch = Math.floor(Date.now() / 1_000);
  // Rough estimate: genesis + (seconds elapsed / block time)
  return genesis + Math.floor(secondsSinceEpoch / meta.avgBlockTimeSec);
}

// ─────────────────────────────────────────────────────────────────────────────
// NATIVE VALUE FORMATTER
// ─────────────────────────────────────────────────────────────────────────────

function formatNativeValue(
  usdValue:   number,
  chain:      MonitoredChain,
  token:      { symbol: string; standard: TokenStandard },
): string {
  const meta = CHAIN_META[chain];

  if (token.standard === 'native') {
    const qty = usdValue / meta.nativeUsdPrice;
    if (qty >= 1_000) return `${(qty / 1_000).toFixed(2)}K ${meta.valueUnit}`;
    if (qty >= 1)     return `${qty.toFixed(4)} ${meta.valueUnit}`;
    return `${qty.toFixed(8)} ${meta.valueUnit}`;
  }

  // Stablecoins / ERC-20
  if (['USDT', 'USDC', 'BUSD'].includes(token.symbol)) {
    return `${(usdValue / 1_000).toFixed(1)}K ${token.symbol}`;
  }

  // Other tokens — approximate from USD
  const approxPrice: Record<string, number> = {
    WBTC: 65_000, LINK: 15, UNI: 8, CAKE: 3, BONK: 0.00003, JTO: 3, PYTH: 0.5, ORDI: 50,
  };
  const price = approxPrice[token.symbol] ?? 1;
  const qty   = usdValue / price;
  return `${qty.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${token.symbol}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN: simulateTick()
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a batch of synthetic transactions for a given tick.
 *
 * @param chains     Which chains to generate transactions for
 * @param countRange [min, max] transactions to generate per chain per tick
 * @returns          Array of SimulatedTx objects ready to be matched against alerts
 */
export function simulateTick(
  chains:     MonitoredChain[],
  countRange: [number, number] = [1, 4],
): SimulatedTx[] {
  const results: SimulatedTx[] = [];
  const now = new Date().toISOString();

  for (const chain of chains) {
    const rng   = createRng(tickSeed(chain));
    const count = Math.round(countRange[0] + rng() * (countRange[1] - countRange[0]));

    for (let i = 0; i < count; i++) {
      // Each tx gets a fresh sub-seed
      const txRng = createRng((tickSeed(chain) + i * 137) >>> 0);

      const valueUsd     = simulateUsdValue(txRng);
      const token        = pickToken(chain, txRng);
      const valueNative  = formatNativeValue(valueUsd, chain, token);
      const rawFrom      = makeAddress(chain, txRng);
      const rawTo        = makeAddress(chain, txRng);
      const { address: fromAddress, label: fromLabel } = injectKnownAddress(chain, rawFrom, txRng);
      const { address: toAddress,   label: toLabel   } = injectKnownAddress(chain, rawTo,   txRng);

      results.push({
        txHash:        makeTxHash(chain, txRng),
        chain,
        fromAddress,
        fromLabel,
        toAddress,
        toLabel,
        valueUsd,
        valueNative,
        tokenSymbol:   token.symbol,
        tokenStandard: token.standard,
        blockNumber:   currentBlockNumber(chain) - Math.floor(txRng() * 3),
        whaleTier:     getWhaleTier(valueUsd),
        timestamp:     now,
      });
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// ALERT CONDITION EVALUATOR
// ─────────────────────────────────────────────────────────────────────────────

import type { OnChainAlert } from './onChainTypes';

/**
 * Returns true if a simulated transaction satisfies an alert's conditions.
 * Checks:
 *   1. Chain matches
 *   2. Address matches (empty address = wildcard)
 *   3. Token filter (empty = any)
 *   4. Value condition (above / below)
 */
export function matchesAlert(tx: SimulatedTx, alert: OnChainAlert): boolean {
  if (!alert.isActive) return false;
  if (tx.chain !== alert.chain) return false;

  // Address filter (case-insensitive; empty = match any)
  if (alert.address.trim()) {
    const addr = alert.address.trim().toLowerCase();
    if (tx.fromAddress.toLowerCase() !== addr && tx.toAddress.toLowerCase() !== addr) {
      return false;
    }
  }

  // Token standard filter
  if (alert.tokenStandard && tx.tokenStandard !== alert.tokenStandard) return false;

  // Token address filter (match by symbol as proxy since we don't have real contracts)
  if (alert.tokenAddress.trim()) {
    // In simulation, tokenAddress is matched as a symbol prefix for UX demo
    const filter = alert.tokenAddress.trim().toLowerCase();
    if (!tx.tokenSymbol.toLowerCase().includes(filter)) return false;
  }

  // Value condition
  if (alert.condition === 'above') {
    return tx.valueUsd >= alert.minValue;
  } else {
    return tx.valueUsd <= alert.minValue;
  }
}
