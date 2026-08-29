/**
 * adminPricingStore.ts — CryptoVerse HQ
 *
 * Admin-editable USD pricing for the three core paid plans (Silver / Gold /
 * Platinum). This layers on top of the baseline prices already defined in
 * monetizationStore.SUBSCRIPTION_PLANS — nothing there is removed, so every
 * existing feature/CP definition stays intact. Only the *displayed and
 * charged* USD price is made overridable.
 *
 * Any Super Admin can change a plan's price from /admin/settings. The new
 * price takes effect immediately on the Subscription page and the crypto
 * checkout page (PaymentPage.tsx), since both read the live price through
 * `useLiveSubscriptionPlans()` in monetizationStore.ts instead of the static
 * constant.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createCloudStorage } from './cloudData';
import { useAuthStore } from './authStore';

export type EditablePlanId = 'pro' | 'pro_plus';

export const DEFAULT_PLAN_PRICES: Record<EditablePlanId, number> = {
  pro:      20,
  pro_plus: 40,
};

export const EDITABLE_PLAN_IDS: EditablePlanId[] = ['pro', 'pro_plus'];

// ── CP package pricing (editable by Super Admin, mirrors plan pricing above) ──
export type EditableCpPackageId = 'starter' | 'trader' | 'whale' | 'institution';

/** Kept in sync with CP_PACKAGES in monetizationStore.ts */
export const DEFAULT_CP_PACKAGE_PRICES: Record<EditableCpPackageId, number> = {
  starter:     50,
  trader:      100,
  whale:       400,
  institution: 1500,
};

export const EDITABLE_CP_PACKAGE_IDS: EditableCpPackageId[] = ['starter', 'trader', 'whale', 'institution'];

export interface PriceChangeLog {
  id:        string;
  planId:    EditablePlanId;
  fromUSD:   number;
  toUSD:     number;
  changedBy: string;
  changedAt: string; // ISO
}

export interface CpPriceChangeLog {
  id:        string;
  pkgId:     EditableCpPackageId;
  fromUSD:   number;
  toUSD:     number;
  changedBy: string;
  changedAt: string; // ISO
}

interface AdminPricingState {
  /** Only present for plans that have been changed from the default */
  overrides: Partial<Record<EditablePlanId, number>>;
  log:       PriceChangeLog[];
  /** Only present for CP packages that have been changed from the default */
  cpOverrides: Partial<Record<EditableCpPackageId, number>>;
  cpLog:       CpPriceChangeLog[];

  getPrice:   (planId: EditablePlanId) => number;
  setPrice:   (planId: EditablePlanId, usd: number, actor: string) => { ok: boolean; error?: string };
  resetPrice: (planId: EditablePlanId, actor: string) => void;

  getCpPrice:   (pkgId: EditableCpPackageId) => number;
  setCpPrice:   (pkgId: EditableCpPackageId, usd: number, actor: string) => { ok: boolean; error?: string };
  resetCpPrice: (pkgId: EditableCpPackageId, actor: string) => void;
}

export const useAdminPricingStore = create<AdminPricingState>()(
  persist(
    (set, get) => ({
      overrides: {},
      log: [],
      cpOverrides: {},
      cpLog: [],

      // Defensive: if an override is ever missing, NaN, zero, or negative
      // (corrupted localStorage, a bad manual edit, etc.), self-heal back to
      // the default price instead of quietly producing an unpayable $0 plan —
      // that exact failure mode would make checkout silently break for
      // whichever plan happened to have the bad value.
      getPrice: (planId) => {
        const v = get().overrides[planId];
        return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : DEFAULT_PLAN_PRICES[planId];
      },

      setPrice: (planId, usd, actor) => {
        if (!Number.isFinite(usd) || usd <= 0) {
          return { ok: false, error: 'Price must be a positive number.' };
        }
        if (usd > 10_000) {
          return { ok: false, error: 'That price looks too high — double-check before saving.' };
        }
        const rounded  = Math.round(usd * 100) / 100;
        const fromUSD  = get().getPrice(planId);
        if (rounded === fromUSD) return { ok: true }; // no-op, nothing to log

        const entry: PriceChangeLog = {
          id: `price_${Date.now()}`,
          planId, fromUSD, toUSD: rounded,
          changedBy: actor,
          changedAt: new Date().toISOString(),
        };
        set({
          overrides: { ...get().overrides, [planId]: rounded },
          log: [entry, ...get().log].slice(0, 50),
        });
        return { ok: true };
      },

      resetPrice: (planId, actor) => {
        const fromUSD = get().getPrice(planId);
        if (fromUSD === DEFAULT_PLAN_PRICES[planId]) return;
        const entry: PriceChangeLog = {
          id: `price_${Date.now()}`,
          planId, fromUSD, toUSD: DEFAULT_PLAN_PRICES[planId],
          changedBy: actor,
          changedAt: new Date().toISOString(),
        };
        const { [planId]: _drop, ...rest } = get().overrides;
        set({ overrides: rest, log: [entry, ...get().log].slice(0, 50) });
      },

      getCpPrice: (pkgId) => {
        const v = get().cpOverrides[pkgId];
        return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : DEFAULT_CP_PACKAGE_PRICES[pkgId];
      },

      setCpPrice: (pkgId, usd, actor) => {
        if (!Number.isFinite(usd) || usd <= 0) {
          return { ok: false, error: 'Price must be a positive number.' };
        }
        if (usd > 100_000) {
          return { ok: false, error: 'That price looks too high — double-check before saving.' };
        }
        const rounded = Math.round(usd * 100) / 100;
        const fromUSD = get().getCpPrice(pkgId);
        if (rounded === fromUSD) return { ok: true };

        const entry: CpPriceChangeLog = {
          id: `cpprice_${Date.now()}`,
          pkgId, fromUSD, toUSD: rounded,
          changedBy: actor,
          changedAt: new Date().toISOString(),
        };
        set({
          cpOverrides: { ...get().cpOverrides, [pkgId]: rounded },
          cpLog: [entry, ...get().cpLog].slice(0, 50),
        });
        return { ok: true };
      },

      resetCpPrice: (pkgId, actor) => {
        const fromUSD = get().getCpPrice(pkgId);
        if (fromUSD === DEFAULT_CP_PACKAGE_PRICES[pkgId]) return;
        const entry: CpPriceChangeLog = {
          id: `cpprice_${Date.now()}`,
          pkgId, fromUSD, toUSD: DEFAULT_CP_PACKAGE_PRICES[pkgId],
          changedBy: actor,
          changedAt: new Date().toISOString(),
        };
        const { [pkgId]: _drop, ...rest } = get().cpOverrides;
        set({ cpOverrides: rest, cpLog: [entry, ...get().cpLog].slice(0, 50) });
      },
    }),
    {
      name: 'cryptoverse_admin_pricing_v1',
      storage: createCloudStorage<AdminPricingState>({
        objectType: 'admin_pricing',
        userId: () => useAuthStore.getState().user?.email ?? null,
        cachePolicy: 'persistent',
      }),
    },
  ),
);

/** Non-hook accessor — safe to call from plain functions / other zustand stores. */
export function getPlanPriceUSD(planId: EditablePlanId): number {
  return useAdminPricingStore.getState().getPrice(planId);
}

export function isEditablePlan(planId: string): planId is EditablePlanId {
  return planId === 'pro' || planId === 'pro_plus';
}

/** Non-hook accessor — safe to call from plain functions / other zustand stores. */
export function getCpPackagePriceUSD(pkgId: EditableCpPackageId): number {
  return useAdminPricingStore.getState().getCpPrice(pkgId);
}

export function isEditableCpPackage(pkgId: string): pkgId is EditableCpPackageId {
  return pkgId === 'starter' || pkgId === 'trader' || pkgId === 'whale' || pkgId === 'institution';
}
