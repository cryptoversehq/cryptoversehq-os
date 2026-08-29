/**
 * nowPaymentsStore.ts — CryptoVerse HQ
 *
 * Client-side payment state for NOWPayments.
 * Stores pending/completed payments in localStorage and activates plans/CP on confirmation.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createCloudStorage } from './cloudData';
import { useAuthStore } from './authStore';
import { useCpCoinsStore } from './cpCoinsStore';
import type { CpTransactionType } from './strategyTypes';
import { createNowPayment, getPaymentStatus, makeOrderId, getMinPaymentAmountUSD, type NowPaymentResponse } from './nowPaymentsClient';
import { sendConfirmationEmail, generateInvoiceNumber, scheduleReminder } from './paymentReminder';

export type PaymentStatus = 'idle' | 'creating' | 'pending' | 'completed' | 'failed' | 'expired' | 'cancelled';
export type PurchaseType = 'subscription' | 'cp_purchase';

export interface LocalPaymentRecord {
  paymentId:         string;
  userId:            string;
  itemId:            string;
  amountUSD:         number;
  status:            PaymentStatus;
  orderId:           string;
  payAddress?:       string;
  payCurrency?:      string;
  /** Exact crypto amount to send (from NOWPayments) */
  payAmount?:        number;
  /** ISO timestamp when the 15-minute payment window closes */
  expiresAt?:        string;
  createdAt:         string;
  completedAt?:      string;
  purchaseType:      PurchaseType;
  cpAmount?:         number;
  /** Stored for confirmation/invoice emails */
  userEmail?:        string;
  userName?:         string;
  itemLabel?:        string;
}

/** Payment window shown to the user before an address is considered stale */
export const PAYMENT_WINDOW_MINUTES = 15;

/**
 * Hard backstop timeout — independent of the 15-minute UI countdown.
 * If a payment is still 'pending' this long after creation (e.g. the user
 * closed the tab before the on-screen countdown ever fired), it's force-
 * expired so it never sits stuck as "awaiting confirmation" forever.
 */
export const HARD_TIMEOUT_MINUTES = 30;

/**
 * Conservative per-currency USD minimums for when the live NOWPayments
 * min-amount API is unreachable (bad secret, network, etc.). These prevent
 * obviously-too-small orders from hitting the webhook and getting a raw 400.
 */
function fallbackMinForCurrency(currency: string): number {
  const c = currency.toLowerCase();
  if (c.startsWith('btc')) return 15;
  if (c.startsWith('eth')) return 10;
  if (c.startsWith('usdt') && (c.includes('erc20') || c.includes('eth'))) return 10;
  if (c.startsWith('usdt')) return 2;
  if (c.startsWith('usdc')) return 2;
  if (c.startsWith('doge') || c.startsWith('ltc') || c.startsWith('xrp')) return 5;
  if (c.startsWith('bnb')) return 3;
  if (c.startsWith('trx')) return 3;
  if (c.startsWith('sol')) return 5;
  if (c.startsWith('matic') || c.startsWith('pol')) return 3;
  return 5;
}

interface NowPaymentsState {
  payments:       LocalPaymentRecord[];
  checkoutStatus: PaymentStatus;
  lastError:      string | null;

  initiateCheckout: (params: {
    userId:       string;
    itemId:       string;
    amountUSD:    number;
    itemLabel?:   string;
    payCurrency?: string;
    successUrl?:  string;
    cancelUrl?:   string;
    userEmail?:   string;
    userName?:    string;
  }) => Promise<{ ok: boolean; payAddress?: string; payAmount?: number; payCurrency?: string; paymentUrl?: string; error?: string }>;

  initiateCpCheckout: (params: {
    userId:       string;
    packageId:    string;
    cpAmount:     number;
    amountUSD:    number;
    packageLabel?: string;
    payCurrency?: string;
    userEmail?:   string;
    userName?:    string;
  }) => Promise<{ ok: boolean; payAddress?: string; paymentUrl?: string; error?: string }>;

  pollPayment: (orderId: string) => Promise<PaymentStatus>;

  markCompleted: (orderId: string, completedAt: string) => void;
  markFailed:    (orderId: string, reason: 'failed' | 'expired') => void;
  /** User-initiated cancellation of a still-pending payment request. */
  cancelPayment: (orderId: string) => void;
  /**
   * Force-expire any 'pending' payment older than HARD_TIMEOUT_MINUTES.
   * Safe to call anytime (on mount, before reads) — no-op if nothing is stale.
   */
  reconcileStalePayments: () => void;
  clearSession:  () => void;
  getPaymentsByUser: (userId: string) => LocalPaymentRecord[];
  getPendingPayment: (userId: string, itemId: string) => LocalPaymentRecord | undefined;
}

export const useNowPaymentsStore = create<NowPaymentsState>()(
  persist(
    (set, get) => ({
      payments:       [],
      checkoutStatus: 'idle',
      lastError:      null,

      initiateCheckout: async ({ userId, itemId, amountUSD, itemLabel, payCurrency, successUrl, cancelUrl, userEmail, userName }) => {
        set({ checkoutStatus: 'creating', lastError: null });
        const orderId = makeOrderId(userId, itemId);

        // Pre-flight: catches the "Silver works fine on Gold/Platinum but
        // errors on its own" class of bug before it ever reaches NOWPayments.
        // getMinPaymentAmountUSD() uses the NOWPayments API via the proxy —
        // when it fails (bad secret, network), it returns null. A null result
        // means we cannot verify the real minimum, so we fall back to a
        // conservative per-currency floor to keep obviously-too-small orders
        // from reaching the webhook and getting a raw 400.
        const currency = payCurrency ?? 'usdttrc20';
        const minUSD = await getMinPaymentAmountUSD(currency);
        const effectiveMin = minUSD ?? fallbackMinForCurrency(currency);
        if (effectiveMin > 0 && amountUSD < effectiveMin) {
          const minStr = effectiveMin.toFixed(2);
          const msg = 'Minimum payment for this currency is $' + minStr + '. Please choose a different payment currency below.';
          set({ checkoutStatus: 'failed', lastError: msg });
          return { ok: false, error: msg };
        }

        try {
          const payment = await createNowPayment({
            price_amount:      amountUSD,
            price_currency:    'usd',
            pay_currency:      payCurrency ?? 'usdttrc20',
            order_id:          orderId,
            order_description: itemLabel ?? itemId,
            success_url:       successUrl,
            cancel_url:        cancelUrl,
          });

          const record: LocalPaymentRecord = {
            paymentId:    payment.payment_id,
            userId,
            itemId,
            amountUSD,
            status:       'pending',
            orderId,
            payAddress:   payment.pay_address,
            payCurrency:  payment.pay_currency,
            payAmount:    payment.pay_amount,
            expiresAt:    new Date(Date.now() + PAYMENT_WINDOW_MINUTES * 60000).toISOString(),
            createdAt:    new Date().toISOString(),
            purchaseType: 'subscription',
            userEmail,
            userName,
            itemLabel:    itemLabel,
          };

          const payments = [record, ...get().payments];
          set({ payments, checkoutStatus: 'pending' });

          // Schedule reminder email via automation webhook
          if (userEmail && payment.pay_address) {
            scheduleReminder({
              userName:      userName ?? userEmail,
              userEmail,
              planType:      itemLabel ?? itemId,
              amount:        String(amountUSD),
              walletAddress: payment.pay_address,
              returnUrl:     `${window.location.origin}/subscription`,
              orderId,
            });
          }

          return {
            ok: true,
            payAddress:   payment.pay_address,
            payAmount:    payment.pay_amount,
            payCurrency:  payment.pay_currency,
            paymentUrl:   `https://nowpayments.io/payment/?iid=${payment.payment_id}`,
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Checkout failed';
          set({ checkoutStatus: 'failed', lastError: msg });
          return { ok: false, error: msg };
        }
      },

      initiateCpCheckout: async ({ userId, packageId, cpAmount, amountUSD, packageLabel, payCurrency, userEmail, userName }) => {
        set({ checkoutStatus: 'creating', lastError: null });
        const orderId = makeOrderId(userId, `cp_${packageId}`);

        // Pre-flight minimum-amount check — see initiateCheckout() above.
        const currencyCp = payCurrency ?? 'usdttrc20';
        const minUsdCp = await getMinPaymentAmountUSD(currencyCp);
        const effectiveMinCp = minUsdCp ?? fallbackMinForCurrency(currencyCp);
        if (effectiveMinCp > 0 && amountUSD < effectiveMinCp) {
          const minStrCp = effectiveMinCp.toFixed(2);
          const msgCp = 'Minimum payment for this currency is $' + minStrCp + '. Please choose a different payment currency below.';
          set({ checkoutStatus: 'failed', lastError: msgCp });
          return { ok: false, error: msgCp };
        }

        try {
          const payment = await createNowPayment({
            price_amount:      amountUSD,
            price_currency:    'usd',
            pay_currency:      payCurrency ?? 'usdttrc20',
            order_id:          orderId,
            order_description: packageLabel ?? `${cpAmount.toLocaleString()} CP`,
          });

          const record: LocalPaymentRecord = {
            paymentId:    payment.payment_id,
            userId,
            itemId:       `cp_${packageId}`,
            amountUSD,
            status:       'pending',
            orderId,
            payAddress:   payment.pay_address,
            payCurrency:  payment.pay_currency,
            payAmount:    payment.pay_amount,
            expiresAt:    new Date(Date.now() + PAYMENT_WINDOW_MINUTES * 60000).toISOString(),
            createdAt:    new Date().toISOString(),
            purchaseType: 'cp_purchase',
            cpAmount,
            userEmail,
            userName,
            itemLabel:    packageLabel,
          };

          const payments = [record, ...get().payments];
          set({ payments, checkoutStatus: 'pending' });

          // Schedule reminder email via automation webhook
          if (userEmail && payment.pay_address) {
            scheduleReminder({
              userName:      userName ?? userEmail,
              userEmail,
              planType:      packageLabel ?? `${cpAmount.toLocaleString()} CP`,
              amount:        String(amountUSD),
              walletAddress: payment.pay_address,
              returnUrl:     `${window.location.origin}/buy-cp`,
              orderId,
            });
          }

          return {
            ok: true,
            payAddress: payment.pay_address,
            paymentUrl: `https://nowpayments.io/payment/?iid=${payment.payment_id}`,
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Checkout failed';
          set({ checkoutStatus: 'failed', lastError: msg });
          return { ok: false, error: msg };
        }
      },

      pollPayment: async (orderId) => {
        const record = get().payments.find(p => p.orderId === orderId);
        if (!record || record.status === 'completed' || record.status === 'failed' || record.status === 'expired') {
          return record?.status ?? 'pending';
        }

        try {
          const status = await getPaymentStatus(record.paymentId);
          if (status.payment_status === 'finished' || status.payment_status === 'confirmed') {
            get().markCompleted(orderId, new Date().toISOString());
            return 'completed';
          }
          if (status.payment_status === 'failed' || status.payment_status === 'expired' || status.payment_status === 'refunded') {
            get().markFailed(orderId, status.payment_status === 'expired' ? 'expired' : 'failed');
            return status.payment_status === 'expired' ? 'expired' : 'failed';
          }
          return 'pending';
        } catch {
          return 'pending';
        }
      },

      markCompleted: (orderId, completedAt) => {
        // Dedup guard — if this order is already completed, ignore duplicate
        // IPN webhook callbacks. NOWPayments may retry IPN delivery.
        const existing = get().payments.find(p => p.orderId === orderId);
        if (existing && existing.status === 'completed') {
          console.log('[Payments] Duplicate completion webhook ignored for', orderId);
          return;
        }

        const payments = get().payments.map(p => {
          if (p.orderId !== orderId) return p;

          // ── Credit CP coins for completed cp_purchase ────────────────
          if (p.purchaseType === 'cp_purchase' && p.cpAmount && p.cpAmount > 0) {
            try {
              const cpStore = useCpCoinsStore.getState();
              cpStore.credit({
                userId: p.userId,
                amount: p.cpAmount,
                type: 'cp_purchase' as CpTransactionType,
                description: `Purchase: ${p.cpAmount.toLocaleString()} CP — ${p.itemLabel ?? p.itemId}`,
                referenceId: p.paymentId,
              });
              console.log(`[Payments] Credited ${p.cpAmount} CP to ${p.userId}`);
            } catch (e) {
              console.error('[Payments] Failed to credit CP after payment:', e);
            }
          }

          const updated = { ...p, status: 'completed' as PaymentStatus, completedAt };

          // Send confirmation email with invoice
          if (p.userEmail) {
            const today = new Date().toISOString().split('T')[0];
            const thirtyDaysOut = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
            sendConfirmationEmail({
              userName:      p.userName ?? p.userEmail,
              userEmail:     p.userEmail,
              planType:      p.itemLabel ?? p.itemId,
              amount:        String(p.amountUSD),
              network:       p.payCurrency ?? 'USDT (TRC20)',
              invoiceNumber: generateInvoiceNumber(),
              paymentDate:   completedAt.split('T')[0] ?? today,
              startDate:     today,
              expireDate:    thirtyDaysOut,
              dashboardUrl:  `${window.location.origin}/dashboard`,
            });
          }

          return updated;
        });
        set({ payments, checkoutStatus: 'completed' });
      },

      markFailed: (orderId, reason) => {
        const payments = get().payments.map(p =>
          p.orderId === orderId ? { ...p, status: reason as PaymentStatus } : p,
        );
        set({ payments, checkoutStatus: reason === 'failed' ? 'failed' : 'expired' });
      },

      cancelPayment: (orderId) => {
        const payments = get().payments.map(p =>
          p.orderId === orderId && p.status === 'pending' ? { ...p, status: 'cancelled' as PaymentStatus } : p,
        );
        set({ payments, checkoutStatus: 'idle' });
      },

      reconcileStalePayments: () => {
        const cutoffMs = HARD_TIMEOUT_MINUTES * 60000;
        const now = Date.now();
        let changed = false;
        const payments = get().payments.map(p => {
          if (p.status !== 'pending') return p;
          const age = now - new Date(p.createdAt).getTime();
          if (age < cutoffMs) return p;
          changed = true;
          return { ...p, status: 'expired' as PaymentStatus };
        });
        if (changed) set({ payments });
      },

      clearSession: () => {
        set({ checkoutStatus: 'idle', lastError: null });
      },

      getPaymentsByUser: (userId) => {
        get().reconcileStalePayments();
        return get().payments.filter(p => p.userId === userId);
      },

      getPendingPayment: (userId, itemId) => {
        get().reconcileStalePayments();
        return get().payments.find(p => p.userId === userId && p.itemId === itemId && p.status === 'pending');
      },
    }),
    {
      name: 'cryptoverse_nowpayments_v1',
      storage: createCloudStorage<NowPaymentsState>({
        objectType: 'now_payments',
        userId: () => useAuthStore.getState().user?.email ?? null,
        cachePolicy: 'persistent',
      }),
    },
  ),
);
