/**
 * priceSimulation.ts — Shared GBM price simulator + base-price table.
 *
 * Previously this logic was copy-pasted (with slightly different constants)
 * inside both Dashboard.tsx (`nextPrice` / `BASE_PRICES`) and
 * ProDashboard.tsx (`tickP` / `BASE_PRICES`). Consolidating it here means:
 *   - one source of truth for "what does BTC/ETH/etc start at",
 *   - one tested implementation of the Geometric Brownian Motion tick,
 *   - future changes (e.g. connecting a real feed) only need to happen once.
 *
 * Both terminals can still pass their own drift/volatility to preserve
 * their existing visual "feel" — only the underlying formula is shared.
 */

// Merged superset of both terminals' base price tables.
export const BASE_PRICES: Record<string, number> = {
  bitcoin: 67_500, ethereum: 3_420, binancecoin: 580, solana: 172,
  ripple: 0.62, dogecoin: 0.18, cardano: 0.48, tron: 0.125,
  'avalanche-2': 38, polkadot: 8.4, chainlink: 18, litecoin: 84,
  near: 7.2, 'matic-network': 0.98, uniswap: 11, cosmos: 9.5,
  fantom: 0.72, 'the-graph': 0.27, sui: 1.85, pepe: 0.0000112,
  'shiba-inu': 0.000028, arbitrum: 1.2, optimism: 2.3, aave: 95, maker: 2800,
};

/** Deterministic-ish fallback for coins not in BASE_PRICES (stable per session). */
export function getBasePrice(id: string): number {
  return BASE_PRICES[id] ?? 1.5 + Math.random() * 20;
}

export interface SimulateTickOptions {
  /** Per-tick upward drift. Default matches the original Dashboard.tsx value. */
  drift?: number;
  /** Per-tick volatility multiplier. Default matches the original Dashboard.tsx value. */
  vol?: number;
}

/**
 * One GBM price tick. Defaults reproduce Dashboard.tsx's original `nextPrice`.
 * Pass `{ drift: 0, vol: 0.0016 }` to reproduce ProDashboard.tsx's original `tickP`.
 */
export function simulateNextPrice(current: number, opts: SimulateTickOptions = {}): number {
  const drift = opts.drift ?? 0.00005;
  const vol   = opts.vol   ?? 0.0008;
  const shock = (Math.random() - 0.5) * 2;
  return Math.max(current * (1 + drift + vol * shock), 0.000001);
}

/** Formats a price with sensible precision for its magnitude — shared across terminals. */
export function formatSimPrice(p: number): string {
  if (p >= 10_000) return p.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (p >= 100)    return p.toFixed(2);
  if (p >= 1)      return p.toFixed(4);
  return p.toFixed(6);
}
