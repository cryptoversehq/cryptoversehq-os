/**
 * Server-authoritative NOWPayments state store.
 */
import { create } from 'zustand';
import {
  createNowPayment,
  getPaymentHistory,
  verifyPayment,
  makeOrderId,
  type NowPaymentResponse,
  type PaymentHistoryRecord,
  type PaymentStatus as ApiPaymentStatus,
} from './nowPaymentsClient';

export type PaymentStatus = 'idle' | 'creating' | 'pending' | 'completed' | 'failed' | 'expired' | 'cancelled';
export type PurchaseType = 'subscription' | 'cp_purchase';

export interface LocalPaymentRecord {
  paymentId: string;
  userId: string;
  itemId: string;
  amountUSD: number;
  status: PaymentStatus;
  orderId: string;
  payAddress?: string;
  payCurrency?: string;
  payAmount?: number;
  checkoutUrl?: string;
  expiresAt?: string;
  createdAt: string;
  completedAt?: string;
  purchaseType: PurchaseType;
  cpAmount?: number;
  itemLabel?: string;
}

export const PAYMENT_WINDOW_MINUTES = 15;
export const HARD_TIMEOUT_MINUTES = 30;

function toStatus(status: ApiPaymentStatus | string): PaymentStatus {
  if (status === 'finished' || status === 'completed') return 'completed';
  if (status === 'failed' || status === 'refunded') return 'failed';
  if (status === 'expired') return 'expired';
  return 'pending';
}

function historyToRecord(record: PaymentHistoryRecord, userId: string): LocalPaymentRecord {
  return {
    paymentId: record.id,
    userId,
    itemId: record.plan_id,
    amountUSD: Number(record.amount) || 0,
    status: toStatus(record.status),
    orderId: record.id,
    payCurrency: record.currency,
    createdAt: record.created_at,
    purchaseType: record.plan_id.startsWith('cp_') ? 'cp_purchase' : 'subscription',
  };
}

interface NowPaymentsState {
  payments: LocalPaymentRecord[];
  checkoutStatus: PaymentStatus;
  lastError: string | null;
  initiateCheckout: (params: { userId: string; itemId: string; amountUSD?: number; itemLabel?: string; payCurrency?: string; successUrl?: string; cancelUrl?: string; userEmail?: string; userName?: string }) => Promise<{ ok: boolean; payAddress?: string; payAmount?: number; payCurrency?: string; paymentUrl?: string; error?: string }>;
  initiateCpCheckout: (params: { userId: string; packageId: string; cpAmount?: number; amountUSD?: number; packageLabel?: string; payCurrency?: string; userEmail?: string; userName?: string }) => Promise<{ ok: boolean; payAddress?: string; payAmount?: number; payCurrency?: string; paymentUrl?: string; error?: string }>;
  pollPayment: (paymentId: string) => Promise<PaymentStatus>;
  markCompleted: (paymentId: string, completedAt?: string) => void;
  markFailed: (paymentId: string, reason: 'failed' | 'expired') => void;
  cancelPayment: (paymentId: string) => void;
  reconcileStalePayments: () => void;
  refreshHistory: (userId: string) => Promise<void>;
  clearSession: () => void;
  getPaymentsByUser: (userId: string) => LocalPaymentRecord[];
  getPendingPayment: (userId: string, itemId: string) => LocalPaymentRecord | undefined;
}

function paymentResult(payment: NowPaymentResponse, userId: string, itemId: string, purchaseType: PurchaseType, itemLabel?: string, cpAmount?: number): LocalPaymentRecord {
  return {
    paymentId: payment.paymentId,
    userId,
    itemId,
    amountUSD: 0,
    status: toStatus(payment.status),
    orderId: payment.paymentId,
    payAddress: payment.payAddress ?? undefined,
    payCurrency: payment.payCurrency ?? undefined,
    payAmount: payment.payAmount ?? undefined,
    checkoutUrl: payment.checkoutUrl ?? undefined,
    expiresAt: new Date(Date.now() + PAYMENT_WINDOW_MINUTES * 60000).toISOString(),
    createdAt: new Date().toISOString(),
    purchaseType,
    cpAmount,
    itemLabel,
  };
}

export const useNowPaymentsStore = create<NowPaymentsState>((set, get) => ({
  payments: [],
  checkoutStatus: 'idle',
  lastError: null,

  initiateCheckout: async ({ userId, itemId, itemLabel, payCurrency }) => {
    set({ checkoutStatus: 'creating', lastError: null });
    try {
      const payment = await createNowPayment({ purchaseType: 'subscription', productId: itemId, payCurrency: payCurrency ?? 'usdttrc20', idempotencyKey: makeOrderId(userId, itemId) });
      const record = paymentResult(payment, userId, itemId, 'subscription', itemLabel);
      set({ payments: [record, ...get().payments], checkoutStatus: 'pending' });
      return { ok: true, payAddress: record.payAddress, payAmount: record.payAmount, payCurrency: record.payCurrency, paymentUrl: payment.checkoutUrl ?? undefined };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Checkout failed';
      set({ checkoutStatus: 'failed', lastError: message });
      return { ok: false, error: message };
    }
  },

  initiateCpCheckout: async ({ userId, packageId, packageLabel, payCurrency, cpAmount }) => {
    set({ checkoutStatus: 'creating', lastError: null });
    try {
      const payment = await createNowPayment({ purchaseType: 'cp_purchase', productId: packageId, payCurrency: payCurrency ?? 'usdttrc20', idempotencyKey: makeOrderId(userId, `cp_${packageId}`) });
      const record = paymentResult(payment, userId, `cp_${packageId}`, 'cp_purchase', packageLabel, cpAmount);
      set({ payments: [record, ...get().payments], checkoutStatus: 'pending' });
      return { ok: true, payAddress: record.payAddress, payAmount: record.payAmount, payCurrency: record.payCurrency, paymentUrl: payment.checkoutUrl ?? undefined };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Checkout failed';
      set({ checkoutStatus: 'failed', lastError: message });
      return { ok: false, error: message };
    }
  },

  pollPayment: async (paymentId) => {
    try {
      const result = await verifyPayment(paymentId);
      const status = toStatus(result.status);
      set((state) => ({ payments: state.payments.map((payment) => payment.paymentId === paymentId ? { ...payment, status, completedAt: status === 'completed' ? new Date().toISOString() : payment.completedAt } : payment), checkoutStatus: status }));
      return status;
    } catch {
      return 'pending';
    }
  },

  // Compatibility methods: status-only; they never grant CP or activate a plan.
  markCompleted: (paymentId, completedAt = new Date().toISOString()) => set((state) => ({ payments: state.payments.map((payment) => payment.paymentId === paymentId ? { ...payment, status: 'completed', completedAt } : payment), checkoutStatus: 'completed' })),
  markFailed: (paymentId, reason) => set((state) => ({ payments: state.payments.map((payment) => payment.paymentId === paymentId ? { ...payment, status: reason } : payment), checkoutStatus: reason })),
  cancelPayment: (paymentId) => set((state) => ({ payments: state.payments.map((payment) => payment.paymentId === paymentId && payment.status === 'pending' ? { ...payment, status: 'cancelled' } : payment), checkoutStatus: 'idle' })),
  reconcileStalePayments: () => undefined,

  refreshHistory: async (userId) => {
    try {
      const records = (await getPaymentHistory()).map((record) => historyToRecord(record, userId));
      set((state) => ({ payments: [...records, ...state.payments.filter((payment) => !records.some((record) => record.paymentId === payment.paymentId))] }));
    } catch {
      // History is supplementary; checkout remains usable when it is unavailable.
    }
  },

  clearSession: () => set({ payments: [], checkoutStatus: 'idle', lastError: null }),
  getPaymentsByUser: (userId) => get().payments.filter((payment) => payment.userId === userId),
  getPendingPayment: (userId, itemId) => get().payments.find((payment) => payment.userId === userId && payment.itemId === itemId && payment.status === 'pending'),
}));
