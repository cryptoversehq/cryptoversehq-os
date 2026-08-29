/**
 * env.ts
 *
 * CryptoVerse HQ — Typed Environment Configuration
 *
 * Centralises all access to VITE_* environment variables.
 *
 * Rules:
 *   - All variables are optional (app works without any of them via simulators)
 *   - `isConfigured(key)` returns true only if the variable is non-empty
 *   - Stores/simulators import from this module — never from import.meta.env directly
 *   - In tests, env variables can be overridden via `setEnvOverride()`
 *
 * Usage:
 *   import { env, isConfigured } from '@/lib/env';
 *
 *   if (isConfigured('ETHERSCAN_API_KEY')) {
 *     // call real Etherscan API
 *   } else {
 *     // use onChainSimulator fallback
 *   }
 */

// ─── RAW ENV ACCESS ───────────────────────────────────────────────────────────

type EnvKey =
  // AI
  | 'DEEPSEEK_API_KEY'
  // On-Chain
  | 'ETHERSCAN_API_KEY'
  | 'BSCSCAN_API_KEY'
  | 'POLYGONSCAN_API_KEY'
  | 'ARBISCAN_API_KEY'
  | 'SOLANA_RPC_URL'
  | 'MEMPOOL_API_BASE_URL'   // optional self-hosted mempool instance
  // Sentiment
  | 'TWITTER_BEARER_TOKEN'
  | 'REDDIT_CLIENT_ID'
  | 'REDDIT_CLIENT_SECRET'
  | 'NEWS_API_KEY'
  // NFT
  | 'OPENSEA_API_KEY'
  | 'BLUR_API_KEY'
  // Exchange
  | 'BINANCE_API_KEY'
  | 'BINANCE_API_SECRET'
  | 'COINBASE_API_KEY'
  | 'COINBASE_API_SECRET';

// Test / Storybook overrides
const _overrides: Partial<Record<EnvKey, string>> = {};

/** Override an env value at runtime (useful for tests). */
export function setEnvOverride(key: EnvKey, value: string) {
  _overrides[key] = value;
}

/** Clear all runtime overrides. */
export function clearEnvOverrides() {
  Object.keys(_overrides).forEach(k => delete _overrides[k as EnvKey]);
}

function raw(key: EnvKey): string {
  if (key in _overrides) return _overrides[key] as string;
  // Vite replaces import.meta.env.VITE_* at build time
  return (import.meta.env as Record<string, string | undefined>)[`VITE_${key}`] ?? '';
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/** Returns the value of an env variable, or empty string if not set. */
export function getEnv(key: EnvKey): string {
  return raw(key);
}

/** Returns true if the env variable is set to a non-empty value. */
export function isConfigured(key: EnvKey): boolean {
  const v = raw(key);
  return v.trim().length > 0;
}

// ─── TYPED GROUPS ─────────────────────────────────────────────────────────────

/** On-Chain Analysis provider config. */
export const onChainEnv = {
  get etherscanApiKey()    { return getEnv('ETHERSCAN_API_KEY'); },
  get bscscanApiKey()      { return getEnv('BSCSCAN_API_KEY'); },
  get polygonscanApiKey()  { return getEnv('POLYGONSCAN_API_KEY'); },
  get arbiscanApiKey()     { return getEnv('ARBISCAN_API_KEY'); },
  get solanaRpcUrl()       { return getEnv('SOLANA_RPC_URL'); },
  /** Optional base URL for a self-hosted Mempool.space instance */
  get mempoolBaseUrl()     { return getEnv('MEMPOOL_API_BASE_URL'); },

  /** True if at least one on-chain key is configured. */
  get hasAnyKey() {
    return (
      isConfigured('ETHERSCAN_API_KEY') ||
      isConfigured('BSCSCAN_API_KEY')   ||
      isConfigured('POLYGONSCAN_API_KEY') ||
      isConfigured('SOLANA_RPC_URL')
    );
  },

  /** Mempool.space is always available (no key required) */
  get hasMempoolAccess() { return true; },

  /** Map of chain → configured status */
  get chainSupport(): Record<string, boolean> {
    return {
      ethereum: isConfigured('ETHERSCAN_API_KEY'),
      bnb:      isConfigured('BSCSCAN_API_KEY'),
      polygon:  isConfigured('POLYGONSCAN_API_KEY'),
      arbitrum: isConfigured('ARBISCAN_API_KEY'),
      bitcoin:  true,   // Mempool.space — always free
      solana:   isConfigured('SOLANA_RPC_URL'),
    };
  },
} as const;

/** Sentiment Analysis provider config. */
export const sentimentEnv = {
  get twitterBearerToken()  { return getEnv('TWITTER_BEARER_TOKEN'); },
  get redditClientId()      { return getEnv('REDDIT_CLIENT_ID'); },
  get redditClientSecret()  { return getEnv('REDDIT_CLIENT_SECRET'); },
  get newsApiKey()          { return getEnv('NEWS_API_KEY'); },

  get hasTwitter()  { return isConfigured('TWITTER_BEARER_TOKEN'); },
  get hasReddit()   { return isConfigured('REDDIT_CLIENT_ID') && isConfigured('REDDIT_CLIENT_SECRET'); },
  get hasNewsApi()  { return isConfigured('NEWS_API_KEY'); },
  get hasAnyKey()   { return this.hasTwitter || this.hasReddit || this.hasNewsApi; },
} as const;

/** NFT Analysis provider config.
 *
 * When VITE_OPENSEA_API_KEY is set to any value (e.g. "true"):
 *   → API calls route through GenesisClient.proxy() with secret alias "opensea"
 *   → The actual API key must be saved in Space Settings → Secrets as "opensea"
 *
 * Without this flag, all NFT data stays simulated (no API calls made).
 */
export const nftEnv = {
  get openseaApiKey() { return getEnv('OPENSEA_API_KEY'); },
  get blurApiKey()    { return getEnv('BLUR_API_KEY'); },

  /** True when the user has opted into OpenSea API (flag is set). */
  get hasOpensea()  { return isConfigured('OPENSEA_API_KEY'); },
  get hasBlur()     { return isConfigured('BLUR_API_KEY'); },
  get hasAnyKey()   { return this.hasOpensea || this.hasBlur; },
} as const;

/** AI / DeepSeek provider config. */
export const deepSeekEnv = {
  get apiKey()    { return getEnv('DEEPSEEK_API_KEY'); },
  get configured() { return isConfigured('DEEPSEEK_API_KEY'); },
} as const;

/** Exchange Connection provider config.
 *
 * SECURITY: These values are browser-accessible via VITE_ prefix.
 * In production, API secrets should be held server-side and accessed
 * via a proxy endpoint, not directly from the browser.
 */
export const exchangeEnv = {
  get binanceApiKey()      { return getEnv('BINANCE_API_KEY'); },
  get binanceApiSecret()   { return getEnv('BINANCE_API_SECRET'); },
  get coinbaseApiKey()     { return getEnv('COINBASE_API_KEY'); },
  get coinbaseApiSecret()  { return getEnv('COINBASE_API_SECRET'); },

  get hasBinance()  { return isConfigured('BINANCE_API_KEY') && isConfigured('BINANCE_API_SECRET'); },
  get hasCoinbase() { return isConfigured('COINBASE_API_KEY') && isConfigured('COINBASE_API_SECRET'); },
  get hasAnyKey()   { return this.hasBinance || this.hasCoinbase; },
} as const;

// ─── UNIFIED ENV OBJECT ───────────────────────────────────────────────────────

/** All environment config in one place. */
export const env = {
  onChain:   onChainEnv,
  deepSeek:  deepSeekEnv,
  sentiment: sentimentEnv,
  nft:       nftEnv,
  exchange:  exchangeEnv,

  /** Returns a human-readable integration status report. */
  get statusReport(): Record<string, { configured: boolean; keys: string[] }> {
    return {
      'On-Chain (Ethereum)': { configured: isConfigured('ETHERSCAN_API_KEY'),   keys: ['VITE_ETHERSCAN_API_KEY'] },
      'On-Chain (BSC)':      { configured: isConfigured('BSCSCAN_API_KEY'),     keys: ['VITE_BSCSCAN_API_KEY'] },
      'On-Chain (Polygon)':  { configured: isConfigured('POLYGONSCAN_API_KEY'), keys: ['VITE_POLYGONSCAN_API_KEY'] },
      'On-Chain (Arbitrum)': { configured: isConfigured('ARBISCAN_API_KEY'),    keys: ['VITE_ARBISCAN_API_KEY'] },
      'On-Chain (Bitcoin)':  { configured: true /* Mempool.space — no key */,  keys: [] },
      'On-Chain (Solana)':   { configured: isConfigured('SOLANA_RPC_URL'),      keys: ['VITE_SOLANA_RPC_URL'] },
      'On-Chain (Mempool)':  { configured: true,                                keys: ['VITE_MEMPOOL_API_BASE_URL (optional)'] },
      'Sentiment (Twitter)': { configured: isConfigured('TWITTER_BEARER_TOKEN'), keys: ['VITE_TWITTER_BEARER_TOKEN'] },
      'Sentiment (Reddit)':  { configured: isConfigured('REDDIT_CLIENT_ID'),   keys: ['VITE_REDDIT_CLIENT_ID', 'VITE_REDDIT_CLIENT_SECRET'] },
      'Sentiment (News)':    { configured: isConfigured('NEWS_API_KEY'),        keys: ['VITE_NEWS_API_KEY'] },
      'NFT (OpenSea)':       { configured: isConfigured('OPENSEA_API_KEY'),     keys: ['VITE_OPENSEA_API_KEY'] },
      'NFT (Blur)':          { configured: isConfigured('BLUR_API_KEY'),        keys: ['VITE_BLUR_API_KEY'] },
      'Exchange (Binance)':  { configured: isConfigured('BINANCE_API_KEY'),     keys: ['VITE_BINANCE_API_KEY', 'VITE_BINANCE_API_SECRET'] },
      'Exchange (Coinbase)': { configured: isConfigured('COINBASE_API_KEY'),    keys: ['VITE_COINBASE_API_KEY', 'VITE_COINBASE_API_SECRET'] },
    };
  },

  /** True if ALL variables are empty (pure simulation mode). */
  get isPureSimulation(): boolean {
    return !onChainEnv.hasAnyKey && !sentimentEnv.hasAnyKey && !nftEnv.hasAnyKey && !exchangeEnv.hasAnyKey;
  },
} as const;
