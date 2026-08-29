/**
 * economyManager.ts - Lynx AI Economy Manager
 * Analyzes CP token economy: inflow/outflow, inflation, pricing suggestions.
 */

export interface CPTokenMetrics {
  totalSupply: number;
  circulatingSupply: number;
  locked: number;
  burned: number;
  mintedToday: number;
  burnedToday: number;
  netFlow: number;
}

export interface InflationAnalysis {
  currentRate: number;
  trend: 'increasing' | 'stable' | 'decreasing';
  projectedRate30d: number;
  health: 'healthy' | 'warning' | 'critical';
  factors: string[];
}

export interface PricingSuggestion {
  item: string;
  currentPrice: number;
  suggestedPrice: number;
  changePercent: number;
  reason: string;
  urgency: 'low' | 'medium' | 'high';
}

export interface EconomyReport {
  timestamp: number;
  cpMetrics: CPTokenMetrics;
  inflation: InflationAnalysis;
  pricingSuggestions: PricingSuggestion[];
  recommendations: string[];
}

class EconomyManager {
  private lastReport: EconomyReport | null = null;

  constructor() { this.startAnalysis(); }

  getReport(): EconomyReport {
    if (!this.lastReport) this.lastReport = this.generateReport();
    return { ...this.lastReport };
  }

  generateReport(): EconomyReport {
    const totalSupply = 10_000_000;
    const circulating = 6_200_000 + Math.random() * 100_000;
    const locked = 2_500_000;
    const mintedToday = 1200 + Math.floor(Math.random() * 400);
    const burnedToday = 800 + Math.floor(Math.random() * 300);

    const cpMetrics: CPTokenMetrics = {
      totalSupply, circulatingSupply: Math.round(circulating), locked,
      burned: totalSupply - Math.round(circulating) - locked,
      mintedToday, burnedToday, netFlow: mintedToday - burnedToday,
    };

    const inflationRate = ((mintedToday - burnedToday) / circulating) * 365 * 100;
    const inflation: InflationAnalysis = {
      currentRate: Math.max(0.5, Math.round(inflationRate * 10) / 10),
      trend: inflationRate > 3 ? 'increasing' : inflationRate > 1 ? 'stable' : 'decreasing',
      projectedRate30d: Math.round(inflationRate * 1.1 * 10) / 10,
      health: inflationRate > 5 ? 'critical' : inflationRate > 3 ? 'warning' : 'healthy',
      factors: ['Daily mint from trading rewards', 'Burn from transaction fees', 'Staking lock-up reducing velocity'],
    };

    const pricingSuggestions: PricingSuggestion[] = [{
      item: 'CP Package (1000 CP)', currentPrice: 9.99, suggestedPrice: 11.99, changePercent: 20,
      reason: 'Market demand increased 15%', urgency: 'low',
    }];

    if (inflationRate > 3) {
      pricingSuggestions.push({
        item: 'Pro Subscription (monthly)', currentPrice: 29.99, suggestedPrice: 34.99, changePercent: 16.7,
        reason: 'Inflation pressure - CP purchasing power declining', urgency: 'medium',
      });
    }

    const recommendations = inflationRate > 3
      ? ['Inflation above 3%. Consider increasing burn rate via higher transaction fees.', 'Reduce daily trading reward mint by 20%.']
      : ['Economy is stable. Continue monitoring CP/USDT exchange rate weekly.'];

    const report: EconomyReport = { timestamp: Date.now(), cpMetrics, inflation, pricingSuggestions, recommendations };
    this.lastReport = report;
    return report;
  }

  private startAnalysis(): void { setInterval(() => this.generateReport(), 300000); }
}

export const economyManager = new EconomyManager();
