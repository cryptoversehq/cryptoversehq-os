import { create } from 'zustand';
import { cloudRecordStore } from './cloudData';
import {
  verifyUsdtPaymentMultiChain,
  classifyTxHash,
} from './blockchainClient';

// ── Constants ─────────────────────────────────────────────────────────────────
/** TRC20 admin wallet (legacy — kept for backwards compatibility) */
export const ADMIN_WALLET  = 'TRkAYkX7bKAPL9QqGgDSvABpGnUyZEbzrd';
export const TRON_NETWORK  = 'TRC20';
export const TRON_CURRENCY = 'USDT';

/** EVM-compatible wallet (ETH / BSC / Polygon etc.) */
export const EVM_WALLET   = '0x7E83Ab94668518f83Ec05aB65Cfa5425574Fb451';
export const EVM_NETWORK  = 'ERC-20 / BEP-20 / Polygon';
export const EVM_CURRENCY = 'USDT';

/** Transaction amount limits enforced on all payment sections */
export const TX_MIN_USDT =  0.99;   // smallest virtual-balance package
export const TX_MAX_USDT = 40;      // most-expensive plan / package (Pro+ $40)

export const PLAN_DURATION_DAYS: Record<string, number> = {
  pro:       30,
  pro_plus:  30,
  free:      0,
};

export const PLAN_PRICE_USDT: Record<string, number> = {
  pro:       20,
  pro_plus:  40,
  free:       0,
};

export const VIRTUAL_PKG_PRICE_USDT: Record<string, number> = {
  '$10K':  0.99,
  '$50K':  3.99,
  '$200K': 9.99,
  '$1M':  24.99,
};

// ── Types ─────────────────────────────────────────────────────────────────────
export type PaymentStatus = 'pending' | 'verified' | 'rejected' | 'expired';
export type PaymentKind   = 'subscription' | 'virtual_balance';

export interface PaymentRecord {
  id:               string;
  userId:           string;
  kind:             PaymentKind;
  planId?:          string;    // subscription payments
  pkgLabel?:        string;    // virtual balance purchases
  amount:           number;    // USDT amount
  txHash:           string;
  network:          typeof TRON_NETWORK;
  currency:         typeof TRON_CURRENCY;
  status:           PaymentStatus;
  submittedAt:      string;    // ISO
  verifiedAt?:      string;    // ISO — set on approval
  activatedAt?:     string;    // ISO — plan start
  expiresAt?:       string;    // ISO — plan end
  rejectionReason?: string;
  /** Set to true when AI timed out and record is queued for manual review */
  manualReview?:    boolean;
  /** ISO — when the record was flagged for manual review */
  manualReviewAt?:  string;
  /** How many AI polling attempts were made before the outcome */
  verifyAttempts?:  number;
}

/** Keys for each warning milestone — add more thresholds here freely */
export type WarningMilestone = '5d' | '3d';

export interface SubscriptionInfo {
  planId:      string;
  activatedAt: string;
  expiresAt:   string;
  daysLeft:    number;
  isExpired:   boolean;
  /** Milestones already fired for this user, e.g. ['5d', '3d'] */
  sentMilestones: WarningMilestone[];
}

interface SubscriptionState {
  payments:    Record<string, PaymentRecord[]>;
  /** userId → array of milestone keys that have already fired */
  warningSent: Record<string, WarningMilestone[]>;

  submitPayment:              (record: Omit<PaymentRecord, 'id' | 'submittedAt' | 'status'>) => PaymentRecord;
  verifyPayment:              (paymentId: string, userId: string) => Promise<{ ok: boolean; record: PaymentRecord }>;
  /**
   * Called when AI monitoring times out (5 min).
   * Marks the record as pending manual review — does NOT activate any features.
   * An admin must approve it separately via the admin dashboard.
   */
  submitForManualReview:      (paymentId: string, userId: string, attempts: number) => void;
  getPayments:                (userId: string) => PaymentRecord[];
  getPendingPayments:         (userId: string) => PaymentRecord[];
  getActiveSubscription:      (userId: string) => SubscriptionInfo | null;
  checkAndExpireSubscription: (userId: string) => boolean;
  /** Record that a specific milestone warning has been sent for this user */
  markWarningSent:            (userId: string, milestone: WarningMilestone) => void;
  /** Returns true only if that specific milestone has already fired */
  hasWarningSent:             (userId: string, milestone: WarningMilestone) => boolean;
}

// ── Persistence ───────────────────────────────────────────────────────────────
const STORE_KEY = 'cryptoverse_subscriptions_v2';
const WARN_KEY  = 'cryptoverse_sub_warnings';

function loadPayments(): Record<string, PaymentRecord[]> {
  return cloudRecordStore.get<Record<string, PaymentRecord[]>>('subscription', STORE_KEY, {});
}
function savePayments(data: Record<string, PaymentRecord[]>) {
  cloudRecordStore.set('subscription', STORE_KEY, data);
}
function loadWarnings(): Record<string, WarningMilestone[]> {
  const raw = cloudRecordStore.get<Record<string, WarningMilestone[] | boolean>>('subscription', WARN_KEY, {});
  const migrated: Record<string, WarningMilestone[]> = {};
  for (const [uid, val] of Object.entries(raw)) {
    migrated[uid] = Array.isArray(val) ? val : (val ? ['5d'] : []);
  }
  return migrated;
}
function saveWarnings(data: Record<string, WarningMilestone[]>) {
  cloudRecordStore.set('subscription', WARN_KEY, data);
}

// ── Real multi-chain blockchain verification ───────────────────────────────────
// Uses Blockscout REST API v2 — free, no API key, CORS-open.
// Queries Ethereum, Polygon, and BSC simultaneously.
// Verification criteria (all must pass):
//   1. tx.status === 'ok'  (not reverted)
//   2. tx.confirmations >= chain minimum  (finality)
//   3. token_transfer.to === EVM_WALLET  (correct recipient)
//   4. token contract === USDT on that chain
//   5. transferred amount within ±2% of expectedUSDT
//   6. tx.timestamp within last 24h (anti-replay)

/** Result of one AI polling attempt */
export interface AiPollResult {
  /** 'found' = confirmed on-chain; 'not_yet' = not indexed yet; 'invalid' = bad hash or failed checks */
  status:   'found' | 'not_yet' | 'invalid';
  reason?:  string;
  /** Attempt number, 1-based */
  attempt:  number;
  /** Which chain confirmed the tx (undefined if not found) */
  chainName?: string;
  /** Actual confirmed amount in USDT (undefined if not found) */
  confirmedAmount?: number;
}

/**
 * Poll the blockchain once for a USDT payment.
 * Queries Ethereum + Polygon + BSC Blockscout APIs in parallel.
 *
 * @param txHash       The user-submitted transaction hash
 * @param attempt      1-based attempt counter (for logging / UI)
 * @param expectedUSDT Expected payment amount in USDT (used for amount check)
 */
export async function aiPollTransaction(
  txHash:        string,
  attempt:       number,
  expectedUSDT?: number,
): Promise<AiPollResult> {
  const hash = txHash.trim();

  // ── Format check ─────────────────────────────────────────────────────────
  const hashType = classifyTxHash(hash);

  if (hashType === 'invalid') {
    return {
      status:  'invalid',
      reason:  'Transaction hash format is invalid. EVM hashes start with 0x followed by 64 hex characters. Please copy the exact hash from your wallet.',
      attempt,
    };
  }

  if (hashType === 'trc20') {
    // TRC20 hash submitted — this wallet only accepts EVM (ERC-20/BEP-20/Polygon).
    // Treat as invalid so the user gets a clear correction message.
    return {
      status:  'invalid',
      reason:  'This looks like a TRC20 (Tron) transaction hash. This wallet only accepts EVM-compatible USDT (Ethereum, Polygon, or BNB Smart Chain). Please send on an EVM network and submit the correct TX hash.',
      attempt,
    };
  }

  // ── Real blockchain query ─────────────────────────────────────────────────
  const result = await verifyUsdtPaymentMultiChain(
    hash,
    EVM_WALLET,
    expectedUSDT ?? 0,
  );

  switch (result.outcome) {
    case 'confirmed':
      return {
        status:           'found',
        attempt,
        chainName:        result.chain?.name,
        confirmedAmount:  result.actualAmount,
      };

    case 'invalid':
      // Definitive failure: wrong amount, wrong recipient, reverted tx, etc.
      return {
        status:  'invalid',
        reason:  result.reason ?? 'Transaction verification failed. Please check your TX hash.',
        attempt,
      };

    case 'not_found':
    case 'error':
    default:
      // Transaction not yet indexed or network temporarily unavailable — retry
      return {
        status:  'not_yet',
        reason:  result.reason ?? 'Transaction not yet visible. Blocks are still propagating.',
        attempt,
      };
  }
}

// ── Tronscan link ─────────────────────────────────────────────────────────────
export function tronscanUrl(txHash: string): string {
  return `https://tronscan.org/#/transaction/${txHash.trim()}`;
}

// ── Store ─────────────────────────────────────────────────────────────────────
export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  payments:    loadPayments(),
  warningSent: loadWarnings(),

  // ── Submit a new payment record (status = pending) ────────────────────────
  submitPayment: (record) => {
    const id = `pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const newRecord: PaymentRecord = {
      ...record,
      id,
      status:      'pending',
      submittedAt: new Date().toISOString(),
    };
    const payments = { ...get().payments };
    payments[record.userId] = [newRecord, ...(payments[record.userId] ?? [])];
    savePayments(payments);
    set({ payments });
    return newRecord;
  },

  // ── Verify a payment via single AI poll then update its status ───────────
  // Note: the full multi-attempt polling loop lives in useAiPaymentVerification.
  // This action handles ONE poll result and writes the outcome to the record.
  verifyPayment: async (paymentId, userId) => {
    const payments     = { ...get().payments };
    const userPayments = [...(payments[userId] ?? [])];
    const idx          = userPayments.findIndex(p => p.id === paymentId);
    if (idx === -1) return { ok: false, record: {} as PaymentRecord };

    const rec    = { ...userPayments[idx] };
    const result = await aiPollTransaction(rec.txHash, 1, rec.amount);

    if (result.status === 'found') {
      const now     = new Date();
      const durDays = rec.kind === 'subscription' && rec.planId
        ? (PLAN_DURATION_DAYS[rec.planId] ?? 30)
        : 0;
      const expiresAt = durDays > 0
        ? new Date(now.getTime() + durDays * 86_400_000).toISOString()
        : undefined;

      rec.status         = 'verified';
      rec.verifiedAt     = now.toISOString();
      rec.activatedAt    = now.toISOString();
      rec.expiresAt      = expiresAt;
      rec.verifyAttempts = result.attempt;
    } else {
      rec.status          = 'rejected';
      rec.rejectionReason = result.reason ?? 'Transaction could not be verified.';
      rec.verifyAttempts  = result.attempt;
    }

    userPayments[idx] = rec;
    payments[userId]  = userPayments;
    savePayments(payments);
    set({ payments });
    return { ok: result.status === 'found', record: rec };
  },

  // ── Flag a timed-out payment for manual review ────────────────────────────
  // IMPORTANT: This does NOT activate any subscription or credit any balance.
  // It only marks the record so an admin can review and approve it manually.
  submitForManualReview: (paymentId, userId, attempts) => {
    const payments     = { ...get().payments };
    const userPayments = [...(payments[userId] ?? [])];
    const idx          = userPayments.findIndex(p => p.id === paymentId);
    if (idx === -1) return;

    const rec = { ...userPayments[idx] };
    // Leave status as 'pending' so it appears in admin pending queue
    rec.manualReview   = true;
    rec.manualReviewAt = new Date().toISOString();
    rec.verifyAttempts = attempts;

    userPayments[idx] = rec;
    payments[userId]  = userPayments;
    savePayments(payments);
    set({ payments });
  },

  // ── Queries ───────────────────────────────────────────────────────────────
  getPayments: (userId) =>
    (get().payments[userId] ?? []).slice().sort(
      (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
    ),

  getPendingPayments: (userId) =>
    (get().payments[userId] ?? []).filter(p => p.status === 'pending'),

  getActiveSubscription: (userId) => {
    const records = get().getPayments(userId);
    const sub = records.find(
      r => r.kind === 'subscription' && r.status === 'verified' && !!r.expiresAt,
    );
    if (!sub?.expiresAt || !sub.activatedAt) return null;

    const msLeft   = new Date(sub.expiresAt).getTime() - Date.now();
    const daysLeft = Math.max(0, Math.ceil(msLeft / 86_400_000));

    return {
      planId:         sub.planId ?? 'free',
      activatedAt:    sub.activatedAt,
      expiresAt:      sub.expiresAt,
      daysLeft,
      isExpired:      msLeft <= 0,
      sentMilestones: get().warningSent[userId] ?? [],
    };
  },

  checkAndExpireSubscription: (userId) => {
    const sub = get().getActiveSubscription(userId);
    return sub?.isExpired ?? false;
  },

  markWarningSent: (userId, milestone) => {
    const existing = get().warningSent[userId] ?? [];
    if (existing.includes(milestone)) return; // idempotent
    const warnings = { ...get().warningSent, [userId]: [...existing, milestone] };
    saveWarnings(warnings);
    set({ warningSent: warnings });
  },

  hasWarningSent: (userId, milestone) =>
    (get().warningSent[userId] ?? []).includes(milestone),
}));
