// businessAnalyst.ts — Lynx AI Business Analyst
//
// Data-driven decisions for the Admin Executive Dashboard.
// NO fabricated figures: every number is pulled from realDataConnector (Zustand
// stores + live data). Domains without a real telemetry source report zero / an
// empty list — never invented numbers.

import { lynxEvents } from './eventSystem';
import { realDataConnector } from './realDataConnector';

// === Types ===================================================================

export interface CountryStat {
  country: string;
  users: number;
  percentage: number;
  revenue: number;
}

export interface SalesMetrics {
  totalRevenue: number;
  subscriptionsByPlan: { free: number; pro: number; pro_plus: number };
  conversionRate: number;
  dailyRevenue: number;
  weeklyRevenue: number;
  monthlyRevenue: number;
  averageRevenuePerUser: number;
  topPlan: string;
}

export interface UserBehaviorReport {
  mostVisitedPages: { page: string; visits: number }[];
  averageSessionTime: number;
  peakHours: { hour: number; count: number }[];
  activeTimeDistribution: Record<string, number>;
  deviceSplit: { mobile: number; desktop: number };
}

export interface ChurnMetrics {
  churnRate: number; // %
  totalUsers: number;
  activeUsers7d: number;
  activeUsers30d: number;
  dormantUsers: number;
  reactivationRate: number;
  riskUsers: string[];
}

export interface FeatureUsage {
  feature: string;
  usageCount: number;
  uniqueUsers: number;
  percentage: number;
}

export interface BusinessReport {
  timestamp: number;
  countryAnalysis: CountryStat[];
  salesMetrics: SalesMetrics;
  userBehavior: UserBehaviorReport;
  churnMetrics: ChurnMetrics;
  featureUsage: FeatureUsage[];
  recommendations: string[];
  /** Where the report data came from. */
  source: string;
  /** True only when every field is backed by a real authoritative source. */
  isAuthoritative: boolean;
}

// === BusinessAnalyst =========================================================

class BusinessAnalyst {
  private lastReport: BusinessReport | null = null;

  constructor() {
    // No leaked setInterval here. The periodic refresh is owned by the Lynx
    // Orchestrator scheduler (see refresh()); a scheduled task is registered by
    // the bootstrap and torn down on shutdown.
  }

  getReport(): BusinessReport {
    if (!this.lastReport) {
      this.lastReport = this.generateReport();
    }
    return { ...this.lastReport };
  }

  generateReport(): BusinessReport {
    const pageViews = lynxEvents.getEventsByType('PAGE_VIEW') as { page: string }[];
    const appData = realDataConnector.getAppData();

    // Country analysis: no geo-IP attribution source exists yet. Report empty
    // rather than a fabricated country/user/revenue breakdown.
    const countries: CountryStat[] = [];

    // Sales metrics: plan counts are real (realDataConnector). Revenue / ARPU /
    // conversion have no real source yet → zero/inconclusive, never invented.
    const salesMetrics: SalesMetrics = {
      totalRevenue: 0,
      subscriptionsByPlan: {
        free: appData.users.plans.free,
        pro: appData.users.plans.pro,
        pro_plus: appData.users.plans.pro_plus,
      },
      conversionRate: 0,
      dailyRevenue: 0,
      weeklyRevenue: 0,
      monthlyRevenue: 0,
      averageRevenuePerUser: 0,
      topPlan: 'unknown',
    };

    // User behavior: only page views are real (lynxEvents). Session time, peak
    // hours, time distribution, and device split have no real source yet.
    const pageCounts: Record<string, number> = {};
    for (const pv of pageViews) {
      pageCounts[pv.page] = (pageCounts[pv.page] || 0) + 1;
    }
    const mostVisited = Object.entries(pageCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([page, visits]) => ({ page: page || '/', visits }));

    const userBehavior: UserBehaviorReport = {
      mostVisitedPages: mostVisited,
      averageSessionTime: 0,
      peakHours: [],
      activeTimeDistribution: {},
      deviceSplit: { mobile: 0, desktop: 0 },
    };

    // Churn metrics: only total/active counts are real. Churn/dormancy are not
    // measurable from available data yet → zero, never fabricated.
    const churnMetrics: ChurnMetrics = {
      churnRate: 0,
      totalUsers: appData.users.total,
      activeUsers7d: appData.users.active7d,
      activeUsers30d: appData.users.active30d,
      dormantUsers: 0,
      reactivationRate: 0,
      riskUsers: [],
    };

    // Feature usage: no per-feature telemetry exists yet → empty, never invented.
    const featureUsage: FeatureUsage[] = [];

    // Recommendations are not evaluated against fabricated or zero data.
    const recommendations: string[] = [];

    const report: BusinessReport = {
      timestamp: Date.now(),
      countryAnalysis: countries,
      salesMetrics,
      userBehavior,
      churnMetrics,
      featureUsage,
      recommendations,
      source: 'realDataConnector',
      isAuthoritative: false,
    };

    this.lastReport = report;
    return report;
  }

  /**
   * Periodic refresh entry point. The Lynx Orchestrator owns the cadence by
   * registering this as a scheduled task (see lynxBootstrap), so there is no
   * self-owned setInterval to leak.
   */
  refresh(): BusinessReport {
    return this.generateReport();
  }
}

export const businessAnalyst = new BusinessAnalyst();
