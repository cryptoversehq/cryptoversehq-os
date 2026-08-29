/**
 * portfolioHistoryService.ts — CryptoVerse HQ Portfolio History Snapshots
 *
 * Stores periodic snapshots of the portfolio grand total value so the
 * portfolio value trend can be charted independently of trade history.
 * Snapshots are persisted in localStorage and capped at 365 (1 year).
 */

export interface PortfolioSnapshot {
  timestamp: number;          // unix ms
  grandTotal: number;         // Grand total (simulated + real)
  simulatedBalance: number;
  realExchangeTotal: number;
  openPositionsCount: number;
}

class PortfolioHistoryService {
  private snapshots: PortfolioSnapshot[] = [];
  private storageKey = 'cv_portfolio_history_v1';
  private maxSnapshots = 365;
  private lastGrandTotal = 0;

  constructor() {
    this.loadFromStorage();
  }

  /** Save a new snapshot. Deduplicates — only saves if grandTotal changed. */
  addSnapshot(data: Omit<PortfolioSnapshot, 'timestamp'>): void {
    // Skip if grandTotal unchanged (avoid duplicates on re-renders)
    if (data.grandTotal === this.lastGrandTotal) return;
    this.lastGrandTotal = data.grandTotal;

    const snapshot: PortfolioSnapshot = { ...data, timestamp: Date.now() };
    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots = this.snapshots.slice(-this.maxSnapshots);
    }
    this.saveToStorage();
  }

  /** Get history filtered to the last `days` days. If days is omitted, returns all. */
  getHistory(days?: number): PortfolioSnapshot[] {
    if (!days) return this.snapshots;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return this.snapshots.filter(s => s.timestamp >= cutoff);
  }

  /** Get the latest snapshot or null if none exist. */
  getLatest(): PortfolioSnapshot | null {
    return this.snapshots[this.snapshots.length - 1] ?? null;
  }

  /** Clear all snapshots (for reset). */
  clear(): void {
    this.snapshots = [];
    this.lastGrandTotal = 0;
    this.saveToStorage();
  }

  private loadFromStorage(): void {
    try {
      const data = localStorage.getItem(this.storageKey);
      if (data) {
        this.snapshots = JSON.parse(data);
        // Restore last grand total cache
        const last = this.snapshots[this.snapshots.length - 1];
        if (last) this.lastGrandTotal = last.grandTotal;
      }
    } catch { /* ignore corrupt data */ }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.snapshots));
    } catch { /* ignore quota */ }
  }
}

export const portfolioHistory = new PortfolioHistoryService();
