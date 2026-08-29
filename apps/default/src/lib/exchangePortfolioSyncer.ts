/**
 * exchangePortfolioSyncer.ts
 * §4.4 — Portfolio Syncer
 *
 * Handles:
 *   – Fetching balances from each exchange adapter (simulated)
 *   – Computing total portfolio value
 *   – Storing snapshots
 *   – Triggering portfolio display updates
 *   – Auto-sync interval management
 *
 * In production: all balance fetches are done on a backend server
 * using the stored encrypted API secrets. Here we simulate the data.
 */

import { ExchangeId, ExchangeConnection, PortfolioAsset, RealPortfolioSnapshot } from './exchangeTypes';

// ── Price oracle (simulated live prices) ──────────────────────────────────────

const BASE_PRICES: Record<string, number> = {
  BTC:  67432,
  ETH:   3411,
  SOL:    182,
  BNB:    591,
  XRP:   0.621,
  AVAX:  38.9,
  USDT:    1.0,
  USDC:    1.0,
  MATIC:  0.89,
  LINK:   18.4,
  ADA:   0.452,
  DOT:   8.12,
};

function getLivePrice(asset: string): number {
  const base = BASE_PRICES[asset] ?? 1;
  // Add small simulated jitter ±0.3%
  return base * (1 + (Math.random() - 0.5) * 0.006);
}

// ── Exchange-specific balance response shapes (simulated) ──────────────────────

interface RawBalance {
  asset: string;
  free:  number;
  locked: number;
}

async function getBinanceBalances(_connection: ExchangeConnection): Promise<RawBalance[]> {
  // §4.4 — getBinanceBalances simulation
  // Real: GET https://api.binance.com/api/v3/account?timestamp=X&signature=Y
  await delay(600 + Math.random() * 400);
  return [
    { asset: 'BTC',  free: 0.42,  locked: 0.05  },
    { asset: 'ETH',  free: 3.1,   locked: 0.5   },
    { asset: 'BNB',  free: 12.0,  locked: 0      },
    { asset: 'USDT', free: 4200,  locked: 800    },
    { asset: 'SOL',  free: 8.5,   locked: 0      },
  ].map(b => ({
    asset:  b.asset,
    free:   b.free  * (1 + (Math.random() - 0.5) * 0.02),
    locked: b.locked,
  }));
}

async function getCoinbaseBalances(_connection: ExchangeConnection): Promise<RawBalance[]> {
  // Real: GET https://api.coinbase.com/v2/accounts (paginated)
  await delay(800 + Math.random() * 500);
  return [
    { asset: 'BTC',  free: 0.18, locked: 0  },
    { asset: 'ETH',  free: 2.3,  locked: 0  },
    { asset: 'USDC', free: 3100, locked: 0  },
  ].map(b => ({
    asset:  b.asset,
    free:   b.free * (1 + (Math.random() - 0.5) * 0.015),
    locked: b.locked,
  }));
}

async function getKrakenBalances(_connection: ExchangeConnection): Promise<RawBalance[]> {
  // Real: POST https://api.kraken.com/0/private/Balance
  await delay(700 + Math.random() * 600);
  return [
    { asset: 'BTC',  free: 0.55, locked: 0    },
    { asset: 'ETH',  free: 5.2,  locked: 1.0  },
    { asset: 'USDT', free: 8000, locked: 2000  },
    { asset: 'ADA',  free: 5000, locked: 0     },
  ].map(b => ({
    asset:  b.asset,
    free:   b.free * (1 + (Math.random() - 0.5) * 0.02),
    locked: b.locked,
  }));
}

async function getOKXBalances(_connection: ExchangeConnection): Promise<RawBalance[]> {
  // Real: GET https://www.okx.com/api/v5/account/balance
  await delay(500 + Math.random() * 400);
  return [
    { asset: 'BTC',  free: 1.2,  locked: 0.1  },
    { asset: 'ETH',  free: 8.0,  locked: 2.0  },
    { asset: 'USDT', free: 15000,locked: 5000  },
    { asset: 'SOL',  free: 25,   locked: 0     },
    { asset: 'DOT',  free: 100,  locked: 0     },
  ].map(b => ({
    asset:  b.asset,
    free:   b.free * (1 + (Math.random() - 0.5) * 0.018),
    locked: b.locked,
  }));
}

// ── Asset emoji map ────────────────────────────────────────────────────────────

const ASSET_EMOJI: Record<string, string> = {
  BTC: '₿', ETH: 'Ξ', SOL: '◎', BNB: '🔶', USDT: '💵',
  USDC: '🔵', XRP: '💧', AVAX: '🔺', MATIC: '🟣', LINK: '🔗',
  ADA: '🔵', DOT: '🔴',
};

const ASSET_NAME: Record<string, string> = {
  BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', BNB: 'BNB',
  USDT: 'Tether', USDC: 'USD Coin', XRP: 'Ripple', AVAX: 'Avalanche',
  MATIC: 'Polygon', LINK: 'Chainlink', ADA: 'Cardano', DOT: 'Polkadot',
};

// ── PortfolioSyncer class ──────────────────────────────────────────────────────

export interface SyncResult {
  success:   boolean;
  snapshot?: RealPortfolioSnapshot;
  error?:    string;
  duration:  number;         // ms
}

export class ExchangePortfolioSyncer {

  /**
   * §4.4: `syncUserPortfolio` — fetch balances, compute value, build snapshot.
   */
  async syncPortfolio(connection: ExchangeConnection): Promise<SyncResult> {
    const start = Date.now();

    try {
      // Fetch raw balances from the appropriate exchange adapter
      let rawBalances: RawBalance[];

      switch (connection.exchangeId) {
        case 'binance':  rawBalances = await getBinanceBalances(connection);  break;
        case 'coinbase': rawBalances = await getCoinbaseBalances(connection); break;
        case 'kraken':   rawBalances = await getKrakenBalances(connection);   break;
        case 'okx':      rawBalances = await getOKXBalances(connection);      break;
        default:
          return { success: false, error: `Unsupported exchange: ${connection.exchangeId}`, duration: Date.now() - start };
      }

      // Filter out dust (< $1 value)
      const nonDust = rawBalances.filter(b => {
        const total = b.free + b.locked;
        const price = getLivePrice(b.asset);
        return total * price >= 1;
      });

      // Build portfolio assets
      const costBasisMap = this.loadCostBasis(connection.id);
      const assets: PortfolioAsset[] = nonDust.map(b => {
        const total      = b.free + b.locked;
        const currentUSD = getLivePrice(b.asset);
        const valueUSD   = total * currentUSD;
        const avgCost    = costBasisMap[b.asset] ?? currentUSD * 0.9; // assume 10% gain if unknown
        const costBasis  = total * avgCost;
        const pnl        = valueUSD - costBasis;

        return {
          symbol:     b.asset,
          name:       ASSET_NAME[b.asset] ?? b.asset,
          logoEmoji:  ASSET_EMOJI[b.asset] ?? '🪙',
          quantity:   total,
          avgCostUSD: avgCost,
          currentUSD,
          valueUSD,
          pnl,
          pnlPct:     costBasis > 0 ? (pnl / costBasis) * 100 : 0,
          allocation: 0, // computed below
        };
      });

      // Compute total & allocations
      const totalUSD = assets.reduce((s, a) => s + a.valueUSD, 0);
      assets.forEach(a => { a.allocation = totalUSD > 0 ? (a.valueUSD / totalUSD) * 100 : 0; });

      // Sort by value descending
      assets.sort((a, b) => b.valueUSD - a.valueUSD);

      // Build pnl snapshots
      const prevSnapshot = this.loadPreviousSnapshot(connection.id);
      const dailyPnL     = prevSnapshot ? totalUSD - prevSnapshot.totalUSD : 0;
      const dailyPnLPct  = prevSnapshot && prevSnapshot.totalUSD > 0
        ? (dailyPnL / prevSnapshot.totalUSD) * 100
        : 0;

      const snapshot: RealPortfolioSnapshot = {
        connectionId: connection.id,
        takenAt:      new Date().toISOString(),
        totalUSD,
        assets,
        dailyPnL:    dailyPnL + (Math.random() - 0.4) * 200,   // add sim variance
        dailyPnLPct: dailyPnLPct + (Math.random() - 0.4) * 0.5,
        weeklyPnL:   totalUSD * (Math.random() - 0.3) * 0.04,
        monthlyPnL:  totalUSD * (Math.random() - 0.25) * 0.12,
      };

      // Persist snapshot for delta computation
      this.saveSnapshot(connection.id, snapshot);

      return { success: true, snapshot, duration: Date.now() - start };

    } catch (err) {
      return {
        success:  false,
        error:    err instanceof Error ? err.message : 'Sync failed',
        duration: Date.now() - start,
      };
    }
  }

  /**
   * §4.4: `syncAllPortfolios` — batch sync all connections.
   */
  async syncAll(connections: ExchangeConnection[]): Promise<Map<string, SyncResult>> {
    const results = new Map<string, SyncResult>();
    await Promise.all(
      connections.map(async c => {
        const result = await this.syncPortfolio(c);
        results.set(c.id, result);
      }),
    );
    return results;
  }

  /**
   * Compute overall portfolio value across all connections.
   */
  computeTotalValue(snapshots: Record<string, RealPortfolioSnapshot>): number {
    return Object.values(snapshots).reduce((s, p) => s + p.totalUSD, 0);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private loadCostBasis(connectionId: string): Record<string, number> {
    try {
      const raw = localStorage.getItem(`cv_cost_basis_${connectionId}`);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }

  private loadPreviousSnapshot(connectionId: string): RealPortfolioSnapshot | null {
    try {
      const raw = localStorage.getItem(`cv_prev_snapshot_${connectionId}`);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  private saveSnapshot(connectionId: string, snapshot: RealPortfolioSnapshot): void {
    try {
      localStorage.setItem(`cv_prev_snapshot_${connectionId}`, JSON.stringify(snapshot));
    } catch {}
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────────

export const portfolioSyncer = new ExchangePortfolioSyncer();

// ── Auto-sync timer ────────────────────────────────────────────────────────────

let _syncTimer: ReturnType<typeof setInterval> | null = null;

export function startPortfolioAutoSync(
  getConnections: () => ExchangeConnection[],
  onSync: (id: string, snapshot: RealPortfolioSnapshot) => void,
  intervalMinutes = 5,
): void {
  if (_syncTimer) clearInterval(_syncTimer);
  _syncTimer = setInterval(async () => {
    const connections = getConnections().filter(c => c.status === 'connected');
    for (const conn of connections) {
      const result = await portfolioSyncer.syncPortfolio(conn);
      if (result.success && result.snapshot) {
        onSync(conn.id, result.snapshot);
      }
    }
  }, intervalMinutes * 60 * 1000);
}

export function stopPortfolioAutoSync(): void {
  if (_syncTimer) { clearInterval(_syncTimer); _syncTimer = null; }
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
