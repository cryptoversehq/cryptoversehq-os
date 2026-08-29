/**
 * paymentReminder.ts — CryptoVerse HQ
 *
 * Calls the Taskade automation webhooks for payment reminder and confirmation emails.
 * These are fire-and-forget calls: the automation flows handle the delay, templating, and sending.
 *
 * Webhook flows:
 *   Reminder:     01KWRC9HNAAY064SF0D4D6DEN6 — waits 15 min then sends reminder
 *   Confirmation: 01KWRC9JDHT8WCGV58410CE51Q — sends invoice immediately on confirmation
 */

import { cloudDataLayer } from './cloudData';

const REMINDER_FLOW_ID = '01KWRC9HNAAY064SF0D4D6DEN6';
const CONFIRMATION_FLOW_ID = '01KWRC9JDHT8WCGV58410CE51Q';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReminderPayload {
  userName:       string;
  userEmail:      string;
  planType:       string;
  amount:         string;
  walletAddress:  string;
  returnUrl:      string;
  orderId:        string;
}

export interface ConfirmationPayload {
  userName:       string;
  userEmail:      string;
  planType:       string;
  amount:         string;
  network:        string;
  invoiceNumber:  string;
  paymentDate:    string;
  startDate:      string;
  expireDate:     string;
  dashboardUrl:   string;
}

// ─── Backward-compatible reminder type (used by PaymentPage.tsx) ──────────────

export interface PaymentReminderParams {
  email:       string;
  displayName?: string;
  planName:    string;
  priceUSD:    number;
  payAddress:  string;
  network:     string;
  payAmount?:  string;
  checkoutUrl: string;
}

// ─── API ──────────────────────────────────────────────────────────────────────

/**
 * Schedule a payment reminder email via the Taskade automation.
 * The flow waits 15 minutes, then sends the reminder if still unpaid.
 * Call this immediately after generating a payment address.
 */
export async function scheduleReminder(payload: ReminderPayload): Promise<void> {
  try {
    await cloudDataLayer.invokeWebhook(REMINDER_FLOW_ID, payload as unknown as Record<string, unknown>);
  } catch (err) {
    console.warn('[CryptoVerse HQ] Reminder webhook call failed:', err);
  }
}

/**
 * Send a payment confirmation email with invoice details.
 * Call this when a payment is confirmed (via polling or IPN webhook).
 */
export async function sendConfirmationEmail(payload: ConfirmationPayload): Promise<void> {
  try {
    await cloudDataLayer.invokeWebhook(CONFIRMATION_FLOW_ID, payload as unknown as Record<string, unknown>);
  } catch (err) {
    console.warn('[CryptoVerse HQ] Confirmation webhook call failed:', err);
  }
}

/** Generate an invoice number: INV-YYYYMMDD-XXXX */
export function generateInvoiceNumber(): string {
  const d = new Date();
  const ds = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const r = Math.floor(1000 + Math.random() * 9000);
  return `INV-${ds}-${r}`;
}

/**
 * @deprecated Use scheduleReminder() with the new webhook instead.
 * Kept for backward compatibility with PaymentPage.tsx visibility-change handler.
 * Now delegates to the new scheduleReminder webhook.
 */
export async function sendPaymentReminderEmail(params: PaymentReminderParams): Promise<{ ok: boolean; error?: string }> {
  try {
    await scheduleReminder({
      userName:      params.displayName ?? params.email,
      userEmail:     params.email,
      planType:      params.planName,
      amount:        String(params.priceUSD),
      walletAddress: params.payAddress,
      returnUrl:     params.checkoutUrl,
      orderId:       `reminder_${Date.now()}`,
    });
    return { ok: true };
  } catch (err) {
    console.warn('[paymentReminder] send failed', err);
    return { ok: false, error: err instanceof Error ? err.message : 'network_error' };
  }
}
