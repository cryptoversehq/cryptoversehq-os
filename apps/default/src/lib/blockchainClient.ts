/**
 * blockchainClient.ts
 *
 * Real multi-chain USDT payment verification using the Blockscout REST API v2.
 *
 * Why Blockscout?
 *   • Completely free — no API key required
 *   • CORS headers: Access-Control-Allow-Origin: *  (safe from browsers)
 *   • Unified response shape across all EVM chains
 *   • Supports Ethereum, Polygon, BSC, and 70+ other chains
 *   • Rate limit: 600 req / 10 min per IP (plenty for verification polling)
 *
 * This module is STRICTLY READ-ONLY.
 * It never signs, broadcasts, or modifies any blockchain state.
 * It only reads transaction receipts to verify that a specific USDT transfer
 * was made to the designated wallet address.
 */

// ── Chain configuration ────────────────────────────────────────────────────────

export interface ChainConfig {
  id:           string;
  name:         string;
  /** Blockscout REST API v2 base URL (no trailing slash) */
  blockscoutUrl: string;
  /** Official USDT contract address on this chain (lowercase) */
  usdtContract:  string;
  /** USDT decimal places (6 for ETH/Polygon USDT, 18 for BSC BSC-USD) */
  usdtDecimals:  number;
  /** Minimum confirmations required before we trust a transaction */
  minConfirmations: number;
  /** Block explorer base URL for tx links shown to the user */
  explorerUrl:   string;
}

/**
 * Supported EVM chains for USDT verification.
 * The EVM wallet (0x7E83Ab…) is the same address on all these chains.
 */
export const EVM_CHAINS: ChainConfig[] = [
  {
    id:             'ethereum',
    name:           'Ethereum (ERC-20)',
    blockscoutUrl:  'https://eth.blockscout.com',
    usdtContract:   '0xdac17f958d2ee523a2206206994597c13d831ec7',
    usdtDecimals:   6,
    minConfirmations: 12,
    explorerUrl:    'https://etherscan.io/tx',
  },
  {
    id:             'polygon',
    name:           'Polygon (PoS)',
    blockscoutUrl:  'https://polygon.blockscout.com',
    // Bridged USDT on Polygon (USDT0 / Tether USD)
    usdtContract:   '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
    usdtDecimals:   6,
    minConfirmations: 128,
    explorerUrl:    'https://polygonscan.com/tx',
  },
  {
    id:             'bsc',
    name:           'BNB Smart Chain (BEP-20)',
    // BSC Blockscout public instance
    blockscoutUrl:  'https://bsc.blockscout.com',
    // Binance-Peg BSC-USD (USDT equivalent on BSC) — 18 decimals
    usdtContract:   '0x55d398326f99059ff775485246999027b3197955',
    usdtDecimals:   18,
    minConfirmations: 15,
    explorerUrl:    'https://bscscan.com/tx',
  },
];

// ── Blockscout response types ──────────────────────────────────────────────────

interface BlockscoutAddress {
  hash: string;
}

interface BlockscoutToken {
  address_hash: string;
  symbol:       string | null;
  decimals:     string | null;
}

interface BlockscoutTokenTransfer {
  to:           BlockscoutAddress;
  token:        BlockscoutToken;
  total: {
    value:    string;
    decimals: string | null;
  };
}

interface BlockscoutTxResponse {
  hash:                string;
  status:              string;        // 'ok' | 'error' | 'pending'
  confirmations:       number;
  timestamp:           string;        // ISO-8601
  result:              string;        // 'success' | 'error'
  token_transfers:     BlockscoutTokenTransfer[];
  token_transfers_overflow: boolean;
}

// ── Verification result ────────────────────────────────────────────────────────

export interface ChainVerifyResult {
  /** Was the payment confirmed on this chain? */
  found:          boolean;
  chain?:         ChainConfig;
  confirmations?: number;
  /** Actual USDT amount in human-readable form (e.g. 9.99) */
  actualAmount?:  number;
  reason?:        string;
}

// ── Internal helpers ───────────────────────────────────────────────────────────

/** Normalise an address for comparison (lowercase, trimmed) */
function addr(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Parse a raw token value string using the token's decimal places.
 * e.g. "9990000" with decimals=6 → 9.99
 */
function parseTokenAmount(rawValue: string, decimals: number): number {
  if (!rawValue || decimals < 0) return 0;
  const bigVal = BigInt(rawValue);
  const divisor = BigInt(10 ** decimals);
  const whole = bigVal / divisor;
  const frac  = bigVal % divisor;
  return Number(whole) + Number(frac) / (10 ** decimals);
}

/**
 * Check whether the given amount is within ±2 % of the expected amount.
 * A 2 % tolerance handles minor gas-related rounding or USDT bridge fees.
 */
function amountMatches(actual: number, expected: number): boolean {
  if (expected <= 0) return true; // no amount check requested
  const ratio = actual / expected;
  return ratio >= 0.98 && ratio <= 1.02;
}

/**
 * Fetch a single transaction from one Blockscout instance.
 * Returns null if the tx doesn't exist on that chain or on any network error.
 */
async function fetchTxFromChain(
  txHash:  string,
  chain:   ChainConfig,
  timeout: number = 10_000,
): Promise<BlockscoutTxResponse | null> {
  const url = `${chain.blockscoutUrl}/api/v2/transactions/${txHash}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (res.status === 404) return null;        // tx not on this chain
    if (res.status === 429) return null;        // rate-limited → treat as not_yet
    if (!res.ok) return null;

    const data = await res.json() as BlockscoutTxResponse;
    return data;
  } catch {
    clearTimeout(timer);
    return null;                               // network error → treat as not_yet
  }
}

/**
 * Verify a USDT transfer on one specific chain.
 *
 * Checks (all must pass):
 *   1. tx.status === 'ok'  (not reverted)
 *   2. tx.confirmations >= chain.minConfirmations
 *   3. There exists a token_transfer where:
 *        a. transfer.to.hash === EVM_WALLET  (correct recipient)
 *        b. transfer.token.address_hash === chain.usdtContract  (USDT)
 *        c. parsed amount is within ±2% of expectedUSDT
 *   4. tx.timestamp is within the last 24 hours (anti-replay)
 */
async function verifyOnChain(
  txHash:       string,
  evmWallet:    string,
  chain:        ChainConfig,
  expectedUSDT: number,
): Promise<ChainVerifyResult> {
  const tx = await fetchTxFromChain(txHash, chain);

  if (!tx) {
    return { found: false, reason: `Transaction not found on ${chain.name}.` };
  }

  // 1. Transaction execution status
  if (tx.status !== 'ok') {
    return {
      found:  false,
      chain,
      reason: `Transaction failed or is pending on ${chain.name} (status: ${tx.status}).`,
    };
  }

  // 2. Confirmation depth
  if (tx.confirmations < chain.minConfirmations) {
    return {
      found:         false,
      chain,
      confirmations: tx.confirmations,
      reason:        `Insufficient confirmations on ${chain.name}: ${tx.confirmations}/${chain.minConfirmations} required.`,
    };
  }

  // 3. Anti-replay: tx must be within last 24 h
  const txAge = Date.now() - new Date(tx.timestamp).getTime();
  const MAX_AGE_MS = 24 * 60 * 60 * 1000;
  if (txAge > MAX_AGE_MS) {
    return {
      found:  false,
      chain,
      reason: 'Transaction timestamp is older than 24 hours — cannot use an old transaction for a new subscription.',
    };
  }

  // 4. Scan token_transfers for a matching USDT transfer to our wallet
  if (tx.token_transfers_overflow) {
    // Too many transfers to list — treat conservatively as unverifiable
    return {
      found:  false,
      chain,
      reason: `Too many token transfers in this transaction to verify automatically on ${chain.name}. Please contact support.`,
    };
  }

  for (const transfer of tx.token_transfers) {
    const toAddr       = addr(transfer.to?.hash ?? '');
    const tokenAddr    = addr(transfer.token?.address_hash ?? '');
    const expectedAddr = addr(evmWallet);
    const chainUsdt    = addr(chain.usdtContract);

    // Recipient check
    if (toAddr !== expectedAddr) continue;

    // Token contract check (accept USDT or USDC on any chain as backup)
    const isUsdt = tokenAddr === chainUsdt;
    // Also accept USDT by symbol in case a bridge/wrapper has a different contract
    const bySymbol = (transfer.token.symbol ?? '').toUpperCase().includes('USD');
    if (!isUsdt && !bySymbol) continue;

    // Amount check
    const decimals = transfer.total.decimals
      ? parseInt(transfer.total.decimals, 10)
      : chain.usdtDecimals;
    const actualAmount = parseTokenAmount(transfer.total.value, decimals);

    if (!amountMatches(actualAmount, expectedUSDT)) {
      return {
        found:        false,
        chain,
        actualAmount,
        reason:       `Amount mismatch on ${chain.name}: received ${actualAmount.toFixed(2)} USDT but expected ${expectedUSDT.toFixed(2)} USDT (±2%). Please check your transfer.`,
      };
    }

    // All checks passed ✓
    return {
      found:         true,
      chain,
      confirmations: tx.confirmations,
      actualAmount,
    };
  }

  // No matching transfer found in this tx
  return {
    found:  false,
    chain,
    reason: `No USDT transfer to the designated wallet found in this transaction on ${chain.name}. Please double-check your TX hash.`,
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────

export interface MultiChainVerifyResult {
  /**
   * 'confirmed'  — verified on at least one chain
   * 'not_found'  — tx not present on any chain yet (retry)
   * 'invalid'    — tx found but checks failed (wrong recipient / amount / status)
   * 'error'      — all chains returned network errors (retry)
   */
  outcome:      'confirmed' | 'not_found' | 'invalid' | 'error';
  chain?:       ChainConfig;
  confirmations?: number;
  actualAmount?: number;
  reason?:      string;
}

/**
 * Verify a USDT payment across all supported EVM chains simultaneously.
 *
 * Queries Ethereum, Polygon, and BSC Blockscout instances in parallel.
 * Returns as soon as any chain confirms the payment.
 *
 * @param txHash       Transaction hash (0x-prefixed EVM hash)
 * @param evmWallet    Recipient wallet address to verify
 * @param expectedUSDT Expected payment amount in USDT
 */
export async function verifyUsdtPaymentMultiChain(
  txHash:       string,
  evmWallet:    string,
  expectedUSDT: number,
): Promise<MultiChainVerifyResult> {
  // Run all chain checks in parallel — first confirmed result wins
  const results = await Promise.all(
    EVM_CHAINS.map(chain =>
      verifyOnChain(txHash, evmWallet, chain, expectedUSDT),
    ),
  );

  // Check if any chain confirmed the payment
  const confirmed = results.find(r => r.found);
  if (confirmed) {
    return {
      outcome:       'confirmed',
      chain:         confirmed.chain,
      confirmations: confirmed.confirmations,
      actualAmount:  confirmed.actualAmount,
    };
  }

  // Check for definitive failures (amount mismatch, wrong recipient, reverted tx)
  // These should stop retrying — the hash itself is bad or the funds went elsewhere
  const definitive = results.find(r =>
    !r.found && r.chain && r.reason && (
      r.reason.includes('Amount mismatch') ||
      r.reason.includes('No USDT transfer') ||
      r.reason.includes('failed or is pending') ||
      r.reason.includes('older than 24 hours') ||
      r.reason.includes('Too many token transfers')
    ),
  );
  if (definitive) {
    return {
      outcome: 'invalid',
      chain:   definitive.chain,
      reason:  definitive.reason,
    };
  }

  // All chains returned null (network errors or 404s) — transaction not yet visible
  const anyNetworkError = results.every(r => !r.chain);
  if (anyNetworkError) {
    return {
      outcome: 'error',
      reason:  'Could not reach blockchain explorers. Please check your internet connection.',
    };
  }

  // Transaction not found on any chain yet — normal during block propagation
  return {
    outcome: 'not_found',
    reason:  'Transaction not yet visible on Ethereum, Polygon, or BSC. Blocks take time to propagate — please wait.',
  };
}

// ── Hash format utilities ──────────────────────────────────────────────────────

/** EVM hash: 0x followed by exactly 64 hex chars */
export const EVM_HASH_RE  = /^0x[0-9a-fA-F]{64}$/;
/** TRC20 hash: exactly 64 raw hex chars (no 0x prefix) */
export const TRC20_HASH_RE = /^[0-9a-fA-F]{64}$/;

export type HashType = 'evm' | 'trc20' | 'invalid';

export function classifyTxHash(hash: string): HashType {
  const h = hash.trim();
  if (EVM_HASH_RE.test(h))  return 'evm';
  if (TRC20_HASH_RE.test(h)) return 'trc20';
  return 'invalid';
}

/** Block explorer URL for the given tx hash */
export function explorerUrl(txHash: string, chain?: ChainConfig): string {
  if (!chain) {
    // Default: Etherscan for EVM hashes
    return `https://etherscan.io/tx/${txHash.trim()}`;
  }
  return `${chain.explorerUrl}/${txHash.trim()}`;
}
