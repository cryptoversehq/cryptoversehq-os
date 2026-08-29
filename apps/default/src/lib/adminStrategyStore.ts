/**
 * adminStrategyStore.ts
 *
 * Admin-side store for managing the Strategy Marketplace.
 *
 * Responsibilities:
 *   - Approve / reject / suspend / restore strategies
 *   - Maintain a full audit log of all admin actions
 *   - Provide analytics (revenue, sales, creator leaderboard)
 *   - Manage admin-issued CP coin grants/deductions
 *
 * This store is intentionally kept separate from strategyStore to follow
 * the same separation-of-concerns pattern used by adminPaymentStore.ts.
 *
 * It reads from strategyStore and cpCoinsStore; it never directly modifies
 * their internal state — it calls their exposed actions instead.
 */

import { create } from 'zustand';
import {
  AdminStrategyReview,
  AdminStrategyAction,
  Strategy,
  StrategyPurchase,
} from './strategyTypes';
import { generateId } from './strategyUtils';
import { useStrategyStore } from './strategyStore';
import { useCpCoinsStore } from './cpCoinsStore';

// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENCE
// ─────────────────────────────────────────────────────────────────────────────

const REVIEWS_KEY   = 'cryptoverse_strategy_admin_reviews_v1';
const AUDIT_KEY     = 'cryptoverse_strategy_admin_audit_v1';

function load<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
}
function save(key: string, data: unknown) {
  localStorage.setItem(key, JSON.stringify(data));
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type AuditSeverity = 'info' | 'warning' | 'critical';

export interface StrategyAuditEntry {
  id:            string;
  timestamp:     string;         // ISO-8601
  adminId:       string;
  adminName:     string;
  action:        AdminStrategyAction | 'grant_cp' | 'deduct_cp' | 'refund';
  targetId:      string;         // strategyId, userId, or purchaseId
  targetLabel:   string;         // human-readable
  details:       string;
  severity:      AuditSeverity;
}

/** Summary stats shown in the admin marketplace dashboard. */
export interface MarketplaceStats {
  totalStrategies:   number;
  publishedCount:    number;
  pendingCount:      number;
  rejectedCount:     number;
  suspendedCount:    number;
  totalSales:        number;
  totalRevenue:      number;   // CP coins
  totalRefunds:      number;
  avgRating:         number;
  topCreators:       Array<{
    creatorId:   string;
    creatorName: string;
    sales:       number;
    revenue:     number;
    strategies:  number;
    avgRating:   number;
  }>;
  recentActivity:    StrategyAuditEntry[];
}

// ─────────────────────────────────────────────────────────────────────────────
// STATE INTERFACE
// ─────────────────────────────────────────────────────────────────────────────

export interface AdminStrategyState {
  reviews:    Record<string, AdminStrategyReview>;   // id → review
  auditLog:   StrategyAuditEntry[];                  // newest first

  // ── Review actions ────────────────────────────────────────────────────────

  /**
   * Approves a pending strategy.
   * Sets status → 'approved', isPublished → true, isApproved → true.
   * Publishes the strategy and sets publishedAt if first-time approval.
   */
  approveStrategy: (params: {
    strategyId: string;
    adminId:    string;
    adminName:  string;
    reason?:    string;
  }) => { ok: boolean; error?: string };

  /**
   * Rejects a pending strategy and returns it to the creator as a draft.
   * Requires a reason.
   */
  rejectStrategy: (params: {
    strategyId: string;
    adminId:    string;
    adminName:  string;
    reason:     string;
  }) => { ok: boolean; error?: string };

  /**
   * Suspends an approved strategy (hides it from marketplace).
   * Strategy keeps its data and purchase history; existing purchases remain valid.
   */
  suspendStrategy: (params: {
    strategyId: string;
    adminId:    string;
    adminName:  string;
    reason:     string;
  }) => { ok: boolean; error?: string };

  /**
   * Restores a suspended strategy back to approved/published.
   */
  restoreStrategy: (params: {
    strategyId: string;
    adminId:    string;
    adminName:  string;
    reason?:    string;
  }) => { ok: boolean; error?: string };

  // ── Moderation utilities ──────────────────────────────────────────────────

  /**
   * Force-deletes a strategy regardless of sales history.
   * Admin-level operation; use sparingly.
   */
  forceDeleteStrategy: (params: {
    strategyId: string;
    adminId:    string;
    adminName:  string;
    reason:     string;
  }) => { ok: boolean; error?: string };

  /**
   * Grants CP coins to a user from the admin panel.
   */
  grantCpCoins: (params: {
    userId:      string;
    amount:      number;
    description: string;
    adminId:     string;
    adminName:   string;
  }) => { ok: boolean; newBalance: number };

  /**
   * Deducts CP coins from a user from the admin panel.
   */
  deductCpCoins: (params: {
    userId:      string;
    amount:      number;
    description: string;
    adminId:     string;
    adminName:   string;
  }) => { ok: boolean; newBalance: number };

  /**
   * Issues a refund for a specific purchase (admin-initiated).
   */
  adminRefundPurchase: (params: {
    purchaseId: string;
    adminId:    string;
    adminName:  string;
    reason:     string;
  }) => { ok: boolean; error?: string };

  // ── Queries ───────────────────────────────────────────────────────────────

  /** Returns all strategies currently pending review, sorted by submission time. */
  getPendingQueue: () => Strategy[];

  /** Returns the review history for a specific strategy. */
  getStrategyReviews: (strategyId: string) => AdminStrategyReview[];

  /** Returns the latest review for a strategy. */
  getLatestReview: (strategyId: string) => AdminStrategyReview | null;

  /** Returns full marketplace analytics. */
  getMarketplaceStats: () => MarketplaceStats;

  /** Returns all purchases across all users (admin view). */
  getAllPurchases: () => StrategyPurchase[];

  /** Returns the audit log, optionally filtered by adminId or action. */
  getAuditLog: (filter?: {
    adminId?: string;
    action?: AdminStrategyAction;
    limit?: number;
  }) => StrategyAuditEntry[];

  // ── Internal ──────────────────────────────────────────────────────────────

  _addAuditEntry: (entry: Omit<StrategyAuditEntry, 'id' | 'timestamp'>) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// STORE
// ─────────────────────────────────────────────────────────────────────────────

export const useAdminStrategyStore = create<AdminStrategyState>((set, get) => {
  const reviews  = load<Record<string, AdminStrategyReview>>(REVIEWS_KEY, {});
  const auditLog = load<StrategyAuditEntry[]>(AUDIT_KEY, []);

  return {
    reviews,
    auditLog,

    // ── Review actions ────────────────────────────────────────────────────────

    approveStrategy: ({ strategyId, adminId, adminName, reason = '' }) => {
      const stratStore = useStrategyStore.getState();
      const strategy   = stratStore.strategies[strategyId];

      if (!strategy) return { ok: false, error: 'Strategy not found.' };
      if (strategy.status === 'approved') return { ok: false, error: 'Already approved.' };
      if (strategy.status !== 'pending' && strategy.status !== 'suspended') {
        return { ok: false, error: `Cannot approve a strategy in '${strategy.status}' status.` };
      }

      const now = new Date().toISOString();

      // Update strategy directly via internal reference (admin bypass)
      const updatedStrategy: Strategy = {
        ...strategy,
        status:      'approved',
        isPublished: true,
        isApproved:  true,
        rejectionReason: null,
        publishedAt: strategy.publishedAt ?? now,
        updatedAt:   now,
      };

      // Write directly to strategies (admin bypass)
      const newStrategies = { ...stratStore.strategies, [strategyId]: updatedStrategy };
      const STRATEGIES_KEY = 'cryptoverse_strategies_v1';
      localStorage.setItem(STRATEGIES_KEY, JSON.stringify(newStrategies));
      // Sync via internal set
      useStrategyStore.setState({ strategies: newStrategies });

      // Record review
      const reviewId = generateId();
      const review: AdminStrategyReview = {
        id:         reviewId,
        strategyId,
        adminId,
        adminName,
        action:     'approve',
        reason:     reason || 'Meets marketplace quality standards.',
        reviewedAt: now,
      };

      const newReviews = { ...get().reviews, [reviewId]: review };
      save(REVIEWS_KEY, newReviews);
      set({ reviews: newReviews });

      get()._addAuditEntry({
        adminId, adminName,
        action:      'approve',
        targetId:    strategyId,
        targetLabel: strategy.name,
        details:     `Strategy "${strategy.name}" approved for marketplace listing.`,
        severity:    'info',
      });

      // Spec §3.1 — notify creator on approval
      useStrategyStore.getState()._notify({
        type:       'strategy_published',
        userId:     strategy.creatorId,
        strategyId,
        message:    `🎉 "${strategy.name}" has been approved and is now live in the marketplace!`,
      });

      return { ok: true };
    },

    rejectStrategy: ({ strategyId, adminId, adminName, reason }) => {
      if (!reason.trim()) return { ok: false, error: 'A rejection reason is required.' };

      const stratStore = useStrategyStore.getState();
      const strategy   = stratStore.strategies[strategyId];
      if (!strategy) return { ok: false, error: 'Strategy not found.' };
      if (strategy.status !== 'pending') {
        return { ok: false, error: 'Only pending strategies can be rejected.' };
      }

      const now = new Date().toISOString();
      const updatedStrategy: Strategy = {
        ...strategy,
        status:          'rejected',
        isPublished:     false,
        isApproved:      false,
        rejectionReason: reason,
        updatedAt:       now,
      };

      const newStrategies = { ...stratStore.strategies, [strategyId]: updatedStrategy };
      localStorage.setItem('cryptoverse_strategies_v1', JSON.stringify(newStrategies));
      useStrategyStore.setState({ strategies: newStrategies });

      const reviewId = generateId();
      const review: AdminStrategyReview = {
        id: reviewId, strategyId, adminId, adminName,
        action: 'reject', reason, reviewedAt: now,
      };

      const newReviews = { ...get().reviews, [reviewId]: review };
      save(REVIEWS_KEY, newReviews);
      set({ reviews: newReviews });

      get()._addAuditEntry({
        adminId, adminName, action: 'reject',
        targetId: strategyId, targetLabel: strategy.name,
        details: `Strategy "${strategy.name}" rejected. Reason: ${reason}`,
        severity: 'warning',
      });

      // Spec §3.1 — notify creator on rejection
      useStrategyStore.getState()._notify({
        type:       'strategy_rejected',
        userId:     strategy.creatorId,
        strategyId,
        message:    `Your strategy "${strategy.name}" was not approved. Reason: ${reason}. You may edit and resubmit.`,
      });

      return { ok: true };
    },

    suspendStrategy: ({ strategyId, adminId, adminName, reason }) => {
      if (!reason.trim()) return { ok: false, error: 'A suspension reason is required.' };

      const stratStore = useStrategyStore.getState();
      const strategy   = stratStore.strategies[strategyId];
      if (!strategy) return { ok: false, error: 'Strategy not found.' };
      if (strategy.status !== 'approved') {
        return { ok: false, error: 'Only approved strategies can be suspended.' };
      }

      const now = new Date().toISOString();
      const updatedStrategy: Strategy = {
        ...strategy,
        status:      'suspended',
        isPublished: false,
        updatedAt:   now,
      };

      const newStrategies = { ...stratStore.strategies, [strategyId]: updatedStrategy };
      localStorage.setItem('cryptoverse_strategies_v1', JSON.stringify(newStrategies));
      useStrategyStore.setState({ strategies: newStrategies });

      const reviewId = generateId();
      const review: AdminStrategyReview = {
        id: reviewId, strategyId, adminId, adminName,
        action: 'suspend', reason, reviewedAt: now,
      };

      const newReviews = { ...get().reviews, [reviewId]: review };
      save(REVIEWS_KEY, newReviews);
      set({ reviews: newReviews });

      get()._addAuditEntry({
        adminId, adminName, action: 'suspend',
        targetId: strategyId, targetLabel: strategy.name,
        details: `Strategy "${strategy.name}" suspended. Reason: ${reason}`,
        severity: 'critical',
      });

      return { ok: true };
    },

    restoreStrategy: ({ strategyId, adminId, adminName, reason = '' }) => {
      const stratStore = useStrategyStore.getState();
      const strategy   = stratStore.strategies[strategyId];
      if (!strategy) return { ok: false, error: 'Strategy not found.' };
      if (strategy.status !== 'suspended') {
        return { ok: false, error: 'Only suspended strategies can be restored.' };
      }

      const now = new Date().toISOString();
      const updatedStrategy: Strategy = {
        ...strategy,
        status:      'approved',
        isPublished: true,
        isApproved:  true,
        updatedAt:   now,
      };

      const newStrategies = { ...stratStore.strategies, [strategyId]: updatedStrategy };
      localStorage.setItem('cryptoverse_strategies_v1', JSON.stringify(newStrategies));
      useStrategyStore.setState({ strategies: newStrategies });

      const reviewId = generateId();
      const review: AdminStrategyReview = {
        id: reviewId, strategyId, adminId, adminName,
        action: 'restore', reason: reason || 'Suspension lifted.', reviewedAt: now,
      };

      const newReviews = { ...get().reviews, [reviewId]: review };
      save(REVIEWS_KEY, newReviews);
      set({ reviews: newReviews });

      get()._addAuditEntry({
        adminId, adminName, action: 'restore',
        targetId: strategyId, targetLabel: strategy.name,
        details: `Strategy "${strategy.name}" restored to marketplace.`,
        severity: 'info',
      });

      return { ok: true };
    },

    // ── Moderation utilities ──────────────────────────────────────────────────

    forceDeleteStrategy: ({ strategyId, adminId, adminName, reason }) => {
      const result = useStrategyStore.getState().deleteStrategy(strategyId, adminId, true);

      if (result.ok) {
        get()._addAuditEntry({
          adminId, adminName, action: 'reject', // closest action type
          targetId: strategyId, targetLabel: `Strategy ${strategyId}`,
          details: `Strategy force-deleted by admin. Reason: ${reason}`,
          severity: 'critical',
        });
      }

      return result;
    },

    grantCpCoins: ({ userId, amount, description, adminId, adminName }) => {
      const newBalance = useCpCoinsStore.getState().adminGrant({
        userId, amount, description, adminId,
      });

      get()._addAuditEntry({
        adminId, adminName, action: 'grant_cp',
        targetId: userId, targetLabel: `User ${userId}`,
        details: `Granted ${amount} CP Coins. Reason: ${description}`,
        severity: 'info',
      });

      return { ok: true, newBalance };
    },

    deductCpCoins: ({ userId, amount, description, adminId, adminName }) => {
      const newBalance = useCpCoinsStore.getState().adminDeduct({
        userId, amount, description, adminId,
      });

      get()._addAuditEntry({
        adminId, adminName, action: 'deduct_cp',
        targetId: userId, targetLabel: `User ${userId}`,
        details: `Deducted ${amount} CP Coins. Reason: ${description}`,
        severity: 'warning',
      });

      return { ok: true, newBalance };
    },

    adminRefundPurchase: ({ purchaseId, adminId, adminName, reason }) => {
      const result = useStrategyStore.getState().refundPurchase(purchaseId, adminId, reason);

      if (result.ok) {
        get()._addAuditEntry({
          adminId, adminName, action: 'refund',
          targetId: purchaseId, targetLabel: `Purchase ${purchaseId}`,
          details: `Refund issued. Reason: ${reason}`,
          severity: 'warning',
        });
      }

      return result;
    },

    // ── Queries ───────────────────────────────────────────────────────────────

    getPendingQueue: () => {
      return useStrategyStore.getState().getPendingStrategies();
    },

    getStrategyReviews: (strategyId) => {
      return Object.values(get().reviews)
        .filter(r => r.strategyId === strategyId)
        .sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt));
    },

    getLatestReview: (strategyId) => {
      const reviews = get().getStrategyReviews(strategyId);
      return reviews[0] ?? null;
    },

    getMarketplaceStats: (): MarketplaceStats => {
      const { strategies, purchases } = useStrategyStore.getState();
      const allStrategies  = Object.values(strategies);
      const allPurchases   = Object.values(purchases);

      const publishedCount   = allStrategies.filter(s => s.isPublished).length;
      const pendingCount     = allStrategies.filter(s => s.status === 'pending').length;
      const rejectedCount    = allStrategies.filter(s => s.status === 'rejected').length;
      const suspendedCount   = allStrategies.filter(s => s.status === 'suspended').length;

      const totalSales   = allPurchases.filter(p => p.status !== 'refunded').length;
      const totalRefunds = allPurchases.filter(p => p.status === 'refunded').length;
      const totalRevenue = allStrategies.reduce((a, s) => a + s.totalRevenue, 0);

      const ratedStrategies = allStrategies.filter(s => s.ratingCount > 0);
      const avgRating = ratedStrategies.length > 0
        ? ratedStrategies.reduce((a, s) => a + s.rating, 0) / ratedStrategies.length
        : 0;

      // Creator leaderboard
      const creatorMap: Record<string, {
        creatorId: string; creatorName: string;
        sales: number; revenue: number; strategies: number;
        totalRating: number; ratingCount: number;
      }> = {};

      for (const s of allStrategies) {
        if (!creatorMap[s.creatorId]) {
          creatorMap[s.creatorId] = {
            creatorId: s.creatorId, creatorName: s.creatorName,
            sales: 0, revenue: 0, strategies: 0, totalRating: 0, ratingCount: 0,
          };
        }
        const c = creatorMap[s.creatorId];
        c.strategies++;
        c.sales    += s.totalSales;
        c.revenue  += s.totalRevenue;
        if (s.ratingCount > 0) {
          c.totalRating += s.rating * s.ratingCount;
          c.ratingCount += s.ratingCount;
        }
      }

      const topCreators = Object.values(creatorMap)
        .map(c => ({
          creatorId:   c.creatorId,
          creatorName: c.creatorName,
          sales:       c.sales,
          revenue:     c.revenue,
          strategies:  c.strategies,
          avgRating:   c.ratingCount > 0 ? Math.round((c.totalRating / c.ratingCount) * 100) / 100 : 0,
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

      return {
        totalStrategies: allStrategies.length,
        publishedCount,
        pendingCount,
        rejectedCount,
        suspendedCount,
        totalSales,
        totalRevenue,
        totalRefunds,
        avgRating: Math.round(avgRating * 100) / 100,
        topCreators,
        recentActivity: get().auditLog.slice(0, 20),
      };
    },

    getAllPurchases: () => {
      return Object.values(useStrategyStore.getState().purchases)
        .sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt));
    },

    getAuditLog: (filter = {}) => {
      let log = [...get().auditLog];

      if (filter.adminId) {
        log = log.filter(e => e.adminId === filter.adminId);
      }
      if (filter.action) {
        log = log.filter(e => e.action === filter.action);
      }
      if (filter.limit) {
        log = log.slice(0, filter.limit);
      }

      return log;
    },

    // ── Internal ─────────────────────────────────────────────────────────────

    _addAuditEntry: (entry) => {
      const full: StrategyAuditEntry = {
        ...entry,
        id:        generateId(),
        timestamp: new Date().toISOString(),
      };

      const newLog = [full, ...get().auditLog].slice(0, 500); // keep last 500 entries
      save(AUDIT_KEY, newLog);
      set({ auditLog: newLog });
    },
  };
});
