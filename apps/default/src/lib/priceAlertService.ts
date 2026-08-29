/**
 * priceAlertService.ts — CryptoVerse HQ Price Alerts
 *
 * Users can set price alerts (above/below target) for monitored symbols.
 * Alerts are persisted in localStorage and checked on every live price update.
 */

export interface PriceAlert {
  id: string;
  symbol: string;
  targetPrice: number;
  direction: 'above' | 'below';
  createdAt: number;   // unix ms
  triggered: boolean;
}

class PriceAlertService {
  private alerts: PriceAlert[] = [];
  private storageKey = 'cv_price_alerts_v1';

  constructor() {
    this.loadFromStorage();
  }

  /** Add a new alert. Returns the created alert. */
  addAlert(symbol: string, targetPrice: number, direction: 'above' | 'below'): PriceAlert {
    const alert: PriceAlert = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      symbol,
      targetPrice,
      direction,
      createdAt: Date.now(),
      triggered: false,
    };
    this.alerts.push(alert);
    this.saveToStorage();
    return alert;
  }

  /** Remove an alert by ID. */
  removeAlert(id: string): void {
    this.alerts = this.alerts.filter(a => a.id !== id);
    this.saveToStorage();
  }

  /** Get all alerts (optionally filtered by triggered status). */
  getAlerts(triggered?: boolean): PriceAlert[] {
    if (triggered === undefined) return this.alerts;
    return this.alerts.filter(a => a.triggered === triggered);
  }

  /** Get alerts for a specific symbol. */
  getAlertsForSymbol(symbol: string): PriceAlert[] {
    return this.alerts.filter(a => a.symbol === symbol);
  }

  /** Check all alerts against current prices. Returns newly triggered alerts. */
  checkAlerts(currentPrices: Record<string, number>): PriceAlert[] {
    const triggered: PriceAlert[] = [];
    for (const alert of this.alerts) {
      if (alert.triggered) continue;
      const price = currentPrices[alert.symbol];
      if (price === undefined) continue;
      const isTriggered =
        (alert.direction === 'above' && price >= alert.targetPrice) ||
        (alert.direction === 'below' && price <= alert.targetPrice);
      if (isTriggered) {
        alert.triggered = true;
        triggered.push(alert);
      }
    }
    if (triggered.length > 0) this.saveToStorage();
    return triggered;
  }

  /** Clear all alerts. */
  clearAll(): void {
    this.alerts = [];
    this.saveToStorage();
  }

  private loadFromStorage(): void {
    try {
      const data = localStorage.getItem(this.storageKey);
      if (data) this.alerts = JSON.parse(data);
    } catch { /* ignore */ }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.alerts));
    } catch { /* ignore */ }
  }
}

export const priceAlertService = new PriceAlertService();
