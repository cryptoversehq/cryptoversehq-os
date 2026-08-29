/**
 * monetizationStore.ts — Central revenue engine for CryptoVerse HQ.
 * Revenue streams: strategy 20% fee, copy trading fee, event 10% fee,
 * analytics pro subscription, bot deployment 500 CP, API access.
 */
import { create } from 'zustand';
import { cloudRecordStore } from './cloudData';
import { useCpCoinsStore } from './cpCoinsStore';
import { generateId } from './strategyUtils';
import { useAdminPricingStore, isEditablePlan, isEditableCpPackage } from './adminPricingStore';

// ── Constants ─────────────────────────────────────────────────────────────────
export const STRATEGY_PLATFORM_FEE_PCT = 0.20;
export const STRATEGY_CREATOR_PCT      = 0.80;
export const EVENT_PLATFORM_FEE_PCT    = 0.10;
export const EVENT_PRIZE_POOL_PCT      = 0.90;
export const BOT_DEPLOYMENT_FEE_CP     = 500;

// ── Plan Definitions ──────────────────────────────────────────────────────────
export type PlanId = 'free' | 'pro' | 'pro_plus';

export interface PlanFeatures {
  tradingSimulator: { limit: number | 'unlimited' };
  academy: { modules: number | 'all' };
  marketplace: { view: boolean; buy: boolean; sell: boolean };
  bots: { limit: number };
  copyTrading: boolean;
  onChain: boolean;
  nft: boolean;
  sentiment: boolean;
  realExchange: boolean;
  apiAccess: boolean;
  whaleAlerts: boolean;
  smartMoney: boolean;
  nftRarity: boolean;
  prioritySupport: boolean;
}

export interface SubscriptionPlan {
  id: PlanId; name: string; priceUSD: number; priceCP: number; cpPerMonth: number;
  label: string; color: string; icon: string;
  features: PlanFeatures;
}

export const SUBSCRIPTION_PLANS: Record<PlanId, SubscriptionPlan> = {
  free: {
    id: 'free', name: 'Free', priceUSD: 0, priceCP: 0, cpPerMonth: 100,
    label: 'Free', color: 'slate', icon: '🆓',
    features: {
      tradingSimulator: { limit: 10 },
      academy: { modules: 5 },
      marketplace: { view: true, buy: false, sell: false },
      bots: { limit: 0 },
      copyTrading: false, onChain: false, nft: false, sentiment: false,
      realExchange: false, apiAccess: false, whaleAlerts: false,
      smartMoney: false, nftRarity: false, prioritySupport: false,
    },
  },
  pro: {
    id: 'pro', name: 'Pro', priceUSD: 20, priceCP: 2000, cpPerMonth: 1000,
    label: 'Pro', color: 'blue', icon: '⭐',
    features: {
      tradingSimulator: { limit: 'unlimited' },
      academy: { modules: 'all' },
      marketplace: { view: true, buy: true, sell: true },
      bots: { limit: 5 },
      copyTrading: true, onChain: true, nft: true, sentiment: true,
      realExchange: false, apiAccess: false, whaleAlerts: false,
      smartMoney: false, nftRarity: false, prioritySupport: true,
    },
  },
  pro_plus: {
    id: 'pro_plus', name: 'Pro+', priceUSD: 40, priceCP: 4000, cpPerMonth: 3000,
    label: 'Pro+', color: 'amber', icon: '👑',
    features: {
      tradingSimulator: { limit: 'unlimited' },
      academy: { modules: 'all' },
      marketplace: { view: true, buy: true, sell: true },
      bots: { limit: 20 },
      copyTrading: true, onChain: true, nft: true, sentiment: true,
      realExchange: true, apiAccess: true, whaleAlerts: true,
      smartMoney: true, nftRarity: true, prioritySupport: true,
    },
  },
};

// ── Subscription History ────────────────────────────────────────────────────

export interface SubscriptionHistoryEntry {
  id: string;
  userId: string;
  planId: PlanId;
  planName: string;
  paymentMethod: 'cp' | 'crypto' | 'free';
  priceUSD: number;
  priceCP: number;
  purchasedAt: string;
  validUntil: string;
}

const SUBSCRIPTION_HISTORY_KEY = 'cryptoverse_subscription_history_v1';

function loadSubHistory(): SubscriptionHistoryEntry[] {
  return cloudRecordStore.get<SubscriptionHistoryEntry[]>('monetization', SUBSCRIPTION_HISTORY_KEY, []);
}
function saveSubHistory(entries: SubscriptionHistoryEntry[]) {
  cloudRecordStore.set('monetization', SUBSCRIPTION_HISTORY_KEY, entries);
}

function addSubscriptionHistory(entry: Omit<SubscriptionHistoryEntry, 'id'>) {
  const entries = loadSubHistory();
  const newEntry: SubscriptionHistoryEntry = { ...entry, id: generateId() };
  entries.unshift(newEntry);
  saveSubHistory(entries);
}

export function getSubscriptionHistory(userId: string): SubscriptionHistoryEntry[] {
  return loadSubHistory().filter(e => e.userId === userId);
}

// ── Live pricing (admin-overridable) ───────────────────────────────────────────
/**
 * Effective USD price for a plan right now - reads the Super Admin override
 * from adminPricingStore for Pro/Pro+, falling back to the static
 * SUBSCRIPTION_PLANS value for Free.
 * Safe to call outside React (plain function, not a hook).
 */
export function getEffectivePriceUSD(planId: PlanId): number {
  if (isEditablePlan(planId)) return useAdminPricingStore.getState().getPrice(planId);
  return SUBSCRIPTION_PLANS[planId]?.priceUSD ?? 0;
}

/**
 * React hook version of SUBSCRIPTION_PLANS with admin price overrides applied.
 * Use this anywhere a plan's priceUSD is displayed or charged.
 */
export function useLiveSubscriptionPlans(): SubscriptionPlan[] {
  const overrides = useAdminPricingStore(s => s.overrides);
  return Object.values(SUBSCRIPTION_PLANS).map(p =>
    isEditablePlan(p.id) ? { ...p, priceUSD: overrides[p.id] ?? p.priceUSD } : p,
  );
}

// ── CP Packages ───────────────────────────────────────────────────────────────
/**
 * React hook version of CP_PACKAGES with admin price overrides applied — same
 * pattern as useLiveSubscriptionPlans(). Use this anywhere a CP package price
 * is displayed or charged (BuyCPPage) so changes made in /admin/settings
 * (Issue #10: CP Package Pricing section) actually show up.
 */
export function useLiveCpPackages(): CpPackage[] {
  const overrides = useAdminPricingStore(s => s.cpOverrides);
  return CP_PACKAGES.map(p =>
    isEditableCpPackage(p.id) ? { ...p, priceUSD: overrides[p.id] ?? p.priceUSD } : p,
  );
}

export interface CpPackage { id:string; name:string; cpAmount:number; priceUSD:number; savePct:number; emoji:string; popular?:boolean; }
export const CP_PACKAGES: CpPackage[] = [
  { id:'starter',    name:'Starter',     cpAmount:5_000,   priceUSD:50,   savePct:0,  emoji:'🌱' },
  { id:'trader',     name:'Trader',      cpAmount:12_000,  priceUSD:100,  savePct:10, emoji:'📈', popular:true },
  { id:'whale',      name:'Whale',       cpAmount:50_000,  priceUSD:400,  savePct:20, emoji:'🐋' },
  { id:'institution',name:'Institution', cpAmount:200_000, priceUSD:1500, savePct:25, emoji:'🏛️' },
];

// ── Revenue types ─────────────────────────────────────────────────────────────
export type RevenueSource = 'strategy_fee'|'event_fee'|'subscription'|'bot_fee'|'api_fee'|'cp_purchase';
export interface PlatformRevenueEntry { id:string; source:RevenueSource; amountCP:number; amountUSD:number; relatedUser:string; description:string; createdAt:string; }
export type EarningSource = 'strategy_sale'|'copy_fee'|'event_prize'|'referral';
export interface PendingEarning { id:string; userId:string; source:EarningSource; amountCP:number; description:string; lockedUntil?:string; createdAt:string; paidOut:boolean; }
export type PayoutStatus = 'pending'|'approved'|'paid'|'rejected';
export type PayoutMethod = 'cp_wallet'|'bank'|'crypto';
export interface PayoutRequest { id:string; userId:string; amountCP:number; status:PayoutStatus; method:PayoutMethod; address?:string; notes?:string; reviewedBy?:string; reviewedAt?:string; paidAt?:string; createdAt:string; }

interface MonetizationState {
  revenueLog: PlatformRevenueEntry[]; pendingEarnings: PendingEarning[]; payoutRequests: PayoutRequest[];
  userPlans: Record<string,{planId:PlanId;expiresAt?:string;addons:PlanId[]}>;
  recordStrategyFee:(p:{buyerId:string;creatorId:string;strategyName:string;priceCP:number})=>{ok:boolean;platformFee:number;creatorShare:number};
  recordEventEntryFee:(p:{userId:string;eventId:string;eventName:string;entryFeeCP:number})=>{ok:boolean;platformFee:number;prizeContrib:number};
  recordBotDeployFee:(p:{userId:string;botName:string})=>{ok:boolean;error?:string};
  recordCopyTradeFee:(p:{followerId:string;traderId:string;traderName:string;profitCP:number;feePct:number})=>void;
  recordEventPrize:(p:{userId:string;eventId:string;eventName:string;prizeCP:number})=>void;
  recordSubscription:(p:{userId:string;planId:PlanId;priceUSD:number})=>void;
  getUserPlan:(userId:string)=>PlanId;
  getUserAddons:(userId:string)=>PlanId[];
  hasAnalyticsPro:(userId:string)=>boolean;
  upgradePlan:(userId:string,planId:PlanId,adminOverride?:boolean,paymentMethod?:'cp'|'crypto'|'free')=>{ok:boolean;error?:string};
  addAddon:(userId:string,addon:PlanId)=>{ok:boolean;error?:string};
  checkFeatureAccess:(userId:string,feature:keyof PlanFeatures)=>boolean|string;
  getPendingEarnings:(userId:string)=>PendingEarning[];
  getTotalPending:(userId:string)=>number;
  getEarningsBySource:(userId:string)=>Record<EarningSource,number>;
  submitPayoutRequest:(p:{userId:string;amountCP:number;method:PayoutMethod;address?:string})=>{ok:boolean;requestId?:string;instant?:boolean;error?:string};
  approvePayoutRequest:(requestId:string,adminId:string)=>void;
  rejectPayoutRequest:(requestId:string,adminId:string,reason:string)=>void;
  getRevenueSummary:(days:number)=>Record<RevenueSource,number>;
  getTotalRevenueCP:(days:number)=>number;
}

const KEYS={revenue:'cryptoverse_platform_revenue_v1',earnings:'cryptoverse_pending_earnings_v1',payouts:'cryptoverse_payout_requests_v1',userPlans:'cryptoverse_user_plans_v1'} as const;
function load<T>(key:string,fallback:T):T{return cloudRecordStore.get<T>('monetization',key,fallback);}
function save(key:string,data:unknown){cloudRecordStore.set('monetization',key,data);}

// No seeded/mocked revenue entries. Revenue accrues only from real platform
// actions (strategy fees, subscriptions, bot deploys, etc.); before any such
// event occurs the log is legitimately empty, never populated with fake data.
function seedRevenue(): PlatformRevenueEntry[] {
  return [];
}

// No seeded/mocked earnings. Creator earnings accumulate only from real sales /
// copy fees / event prizes / referrals.
function seedEarnings(): PendingEarning[] {
  return [];
}

// No seeded/mocked payout requests. Payouts exist only when a creator actually
// submits a withdrawal request.
function seedPayouts(): PayoutRequest[] {
  return [];
}


export const useMonetizationStore = create<MonetizationState>((set, get) => {
  const revenueLog      = load<PlatformRevenueEntry[]>(KEYS.revenue, seedRevenue());
  const pendingEarnings = load<PendingEarning[]>(KEYS.earnings, seedEarnings());
  const payoutRequests  = load<PayoutRequest[]>(KEYS.payouts, seedPayouts());
  const userPlans       = load<Record<string,{planId:PlanId;expiresAt?:string;addons:PlanId[]}>>(KEYS.userPlans, {});

  function persist(patch: Partial<Pick<MonetizationState,'revenueLog'|'pendingEarnings'|'payoutRequests'|'userPlans'>>) {
    if (patch.revenueLog)      save(KEYS.revenue,   patch.revenueLog);
    if (patch.pendingEarnings) save(KEYS.earnings,  patch.pendingEarnings);
    if (patch.payoutRequests)  save(KEYS.payouts,   patch.payoutRequests);
    if (patch.userPlans)       save(KEYS.userPlans, patch.userPlans);
    set(patch as Partial<MonetizationState>);
  }

  return {
    revenueLog, pendingEarnings, payoutRequests, userPlans,

    recordStrategyFee: ({ buyerId, creatorId, strategyName, priceCP }) => {
      const platformFee  = Math.round(priceCP * STRATEGY_PLATFORM_FEE_PCT);
      const creatorShare = priceCP - platformFee;
      const cpStore = useCpCoinsStore.getState();
      const result  = cpStore.transfer({ fromUserId: buyerId, toUserId: creatorId, amount: priceCP, creatorAmount: creatorShare, platformAmount: platformFee, description: `Purchase: ${strategyName}`, referenceId: `strat_${Date.now()}` });
      if (!result.ok) return { ok: false, platformFee: 0, creatorShare: 0 };
      const revEntry: PlatformRevenueEntry = { id: generateId(), source: 'strategy_fee', amountCP: platformFee, amountUSD: 0, relatedUser: buyerId, description: `20% fee: ${strategyName} sold for ${priceCP} CP`, createdAt: new Date().toISOString() };
      const earning: PendingEarning = { id: generateId(), userId: creatorId, source: 'strategy_sale', amountCP: creatorShare, description: `${strategyName} sold — 80% share`, lockedUntil: new Date(Date.now() + 7 * 86400000).toISOString(), createdAt: new Date().toISOString(), paidOut: false };
      const { revenueLog, pendingEarnings } = get();
      persist({ revenueLog: [revEntry, ...revenueLog], pendingEarnings: [earning, ...pendingEarnings] });
      return { ok: true, platformFee, creatorShare };
    },

    recordEventEntryFee: ({ userId, eventId, eventName, entryFeeCP }) => {
      const platformFee  = Math.round(entryFeeCP * EVENT_PLATFORM_FEE_PCT);
      const prizeContrib = entryFeeCP - platformFee;
      const cpStore = useCpCoinsStore.getState();
      const result  = cpStore.debit({ userId, amount: entryFeeCP, type: 'achievement_reward', description: `Event entry: ${eventName}`, referenceId: eventId });
      if (!result.ok) return { ok: false, platformFee: 0, prizeContrib: 0 };
      const revEntry: PlatformRevenueEntry = { id: generateId(), source: 'event_fee', amountCP: platformFee, amountUSD: 0, relatedUser: userId, description: `10% fee: ${eventName} entry (${entryFeeCP} CP)`, createdAt: new Date().toISOString() };
      const { revenueLog } = get();
      persist({ revenueLog: [revEntry, ...revenueLog] });
      return { ok: true, platformFee, prizeContrib };
    },

    recordBotDeployFee: ({ userId, botName }) => {
      const cpStore = useCpCoinsStore.getState();
      const result  = cpStore.debit({ userId, amount: BOT_DEPLOYMENT_FEE_CP, type: 'platform_fee', description: `Bot deployment fee: ${botName}` });
      if (!result.ok) return { ok: false, error: result.error };
      const revEntry: PlatformRevenueEntry = { id: generateId(), source: 'bot_fee', amountCP: BOT_DEPLOYMENT_FEE_CP, amountUSD: 0, relatedUser: userId, description: `Bot deployment: ${botName} — 500 CP`, createdAt: new Date().toISOString() };
      const { revenueLog } = get();
      persist({ revenueLog: [revEntry, ...revenueLog] });
      return { ok: true };
    },

    recordCopyTradeFee: ({ followerId, traderId, traderName, profitCP, feePct }) => {
      const feeCP = Math.round(profitCP * (feePct / 100));
      if (feeCP <= 0) return;
      const cpStore = useCpCoinsStore.getState();
      cpStore.debit({ userId: followerId, amount: feeCP, type: 'platform_fee', description: `Copy fee (${feePct}%) to ${traderName}`, referenceId: traderId });
      cpStore.credit({ userId: traderId, amount: feeCP, type: 'sell_strategy', description: `Copy trading fee from follower — ${feeCP} CP`, referenceId: followerId });
      const earning: PendingEarning = { id: generateId(), userId: traderId, source: 'copy_fee', amountCP: feeCP, description: `Copy fee (${feePct}%) — trade closed with profit`, createdAt: new Date().toISOString(), paidOut: false };
      const { pendingEarnings } = get();
      persist({ pendingEarnings: [earning, ...pendingEarnings] });
    },

    recordEventPrize: ({ userId, eventId, eventName, prizeCP }) => {
      const cpStore = useCpCoinsStore.getState();
      cpStore.credit({ userId, amount: prizeCP, type: 'competition_prize', description: `Prize: ${eventName}`, referenceId: eventId });
      const earning: PendingEarning = { id: generateId(), userId, source: 'event_prize', amountCP: prizeCP, description: `${eventName} prize`, createdAt: new Date().toISOString(), paidOut: false };
      const { pendingEarnings } = get();
      persist({ pendingEarnings: [earning, ...pendingEarnings] });
    },

    recordSubscription: ({ userId, planId, priceUSD }) => {
      const revEntry: PlatformRevenueEntry = { id: generateId(), source: 'subscription', amountCP: 0, amountUSD: priceUSD, relatedUser: userId, description: `${planId} plan subscription`, createdAt: new Date().toISOString() };
      const { revenueLog } = get();
      persist({ revenueLog: [revEntry, ...revenueLog] });
    },

    getUserPlan: (userId) => get().userPlans[userId]?.planId ?? 'free',
    getUserAddons: (_userId) => [], // Addons removed — always empty for backward compat
    hasAnalyticsPro: (_userId) => false, // Analytics Pro add-on removed

    checkFeatureAccess: (userId, feature) => {
      const planId  = get().getUserPlan(userId);
      const planDef = SUBSCRIPTION_PLANS[planId];
      if (!planDef) return false;
      return planDef.features[feature as keyof PlanFeatures] ?? false;
    },

    upgradePlan: (userId, planId, adminOverride = false, paymentMethod: 'cp' | 'crypto' | 'free' = 'crypto') => {
      const plan = SUBSCRIPTION_PLANS[planId];
      if (!plan) return { ok: false, error: 'Invalid plan' };
      const { userPlans } = get();
      const existing = userPlans[userId] ?? { planId: 'free' as PlanId, addons: [] };
      const now = Date.now();
      const expiresAt = new Date(now + 30 * 86400000).toISOString();
      persist({ userPlans: { ...userPlans, [userId]: { ...existing, planId, expiresAt } } });
      const effectivePriceUSD = getEffectivePriceUSD(planId);

      // Record in subscription history
      addSubscriptionHistory({
        userId, planId, planName: plan.name, paymentMethod,
        priceUSD: effectivePriceUSD, priceCP: planId === 'free' ? 0 : (plan.priceCP ?? 0),
        purchasedAt: new Date(now).toISOString(), validUntil: expiresAt,
      });
      if (effectivePriceUSD > 0) get().recordSubscription({ userId, planId, priceUSD: effectivePriceUSD });

      // ── Subscription purchase CP reward ──────────────────────
      const CP_REWARDS: Record<string, number> = {
        pro: 250,
        pro_plus: 500,
      };
      if (planId && CP_REWARDS[planId]) {
        useCpCoinsStore.getState().credit({
          userId,
          amount: CP_REWARDS[planId],
          type: 'subscription_reward',
          description: `Subscription Purchase Reward — ${plan.name} 🎉`,
        });
      }

      return { ok: true };
    },

    addAddon: (_userId, _addon) => {
      return { ok: false, error: 'Add-ons are no longer available. Please upgrade to Pro or Pro+.' };
    },

    getPendingEarnings: (userId) => get().pendingEarnings.filter(e => e.userId === userId && !e.paidOut),
    getTotalPending: (userId) => get().getPendingEarnings(userId).reduce((s, e) => s + e.amountCP, 0),

    getEarningsBySource: (userId) => {
      const result: Record<EarningSource, number> = { strategy_sale: 0, copy_fee: 0, event_prize: 0, referral: 0 };
      get().getPendingEarnings(userId).forEach(e => { result[e.source] = (result[e.source] ?? 0) + e.amountCP; });
      return result;
    },

    submitPayoutRequest: ({ userId, amountCP, method, address }) => {
      const totalPending = get().getTotalPending(userId);
      if (amountCP > totalPending) return { ok: false, error: `Insufficient pending earnings. Available: ${totalPending} CP` };
      const requestId = generateId();
      const request: PayoutRequest = { id: requestId, userId, amountCP, status: 'pending', method, address, createdAt: new Date().toISOString() };
      if (method === 'cp_wallet') {
        useCpCoinsStore.getState().credit({ userId, amount: amountCP, type: 'subscription_reward', description: `Payout: ${amountCP} CP to wallet`, referenceId: requestId });
        let remaining = amountCP;
        const updatedEarnings = get().pendingEarnings.map(e => { if (e.userId !== userId || e.paidOut || remaining <= 0) return e; remaining -= e.amountCP; return { ...e, paidOut: true }; });
        request.status = 'paid'; request.paidAt = new Date().toISOString();
        persist({ payoutRequests: [request, ...get().payoutRequests], pendingEarnings: updatedEarnings });
        return { ok: true, requestId, instant: true };
      }
      persist({ payoutRequests: [request, ...get().payoutRequests] });
      return { ok: true, requestId, instant: false };
    },

    approvePayoutRequest: (requestId, adminId) => {
      const { payoutRequests, pendingEarnings } = get();
      const updated = payoutRequests.map(r => {
        if (r.id !== requestId) return r;
        useCpCoinsStore.getState().credit({ userId: r.userId, amount: r.amountCP, type: 'admin_grant', description: 'Payout approved by admin', referenceId: requestId });
        let rem = r.amountCP;
        const eu = pendingEarnings.map(e => { if (e.userId !== r.userId || e.paidOut || rem <= 0) return e; rem -= e.amountCP; return { ...e, paidOut: true }; });
        persist({ pendingEarnings: eu });
        return { ...r, status: 'paid' as PayoutStatus, reviewedBy: adminId, reviewedAt: new Date().toISOString(), paidAt: new Date().toISOString() };
      });
      persist({ payoutRequests: updated });
    },

    rejectPayoutRequest: (requestId, adminId, reason) => {
      const updated = get().payoutRequests.map(r => r.id === requestId ? { ...r, status: 'rejected' as PayoutStatus, reviewedBy: adminId, reviewedAt: new Date().toISOString(), notes: reason } : r);
      persist({ payoutRequests: updated });
    },

    getRevenueSummary: (days) => {
      const since = Date.now() - days * 86400000;
      const result: Record<RevenueSource, number> = { strategy_fee: 0, event_fee: 0, subscription: 0, bot_fee: 0, api_fee: 0, cp_purchase: 0 };
      get().revenueLog.forEach(r => { if (new Date(r.createdAt).getTime() >= since) { result[r.source] = (result[r.source] ?? 0) + r.amountCP + r.amountUSD * 100; } });
      return result;
    },

    getTotalRevenueCP: (days) => Object.values(get().getRevenueSummary(days)).reduce((a, b) => a + b, 0),
  };
});
