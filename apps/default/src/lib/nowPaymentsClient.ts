/**
 * nowPaymentsClient.ts — CryptoVerse HQ
 *
 * NOWPayments integration via Taskade Automation Webhook proxy.
 * The NOWPAYMENTS_API_KEY never enters the browser bundle — it stays
 * encrypted inside the automation flow.
 *
 * Architecture:
 *   [Browser] → fetch(webhook) → [Taskade Flow] → NOWPayments API
 *
 * Read-only status & min-amount queries still use GenesisClient.proxy()
 * for efficient lookups. Payment creation routes through the webhook.
 *
 * IPN callbacks are handled by Automation Workflow 01KVFCBKC478XG5D4XKNSSS024
 */

import { GenesisClient } from '@taskade/genesis-client';
import { isApiEnabled, markApiUsed } from './apiStatusService';

const SPACE_ID = 'rdem1z86swzzv7vq';
const APP_BASE_URL = 'https://cryptoversehq.com';

/** IPN callback — the Taskade webhook that NOWPayments calls on payment updates */
const IPN_CALLBACK_URL = `${APP_BASE_URL}/api/taskade/webhooks/01KVFCBKC478XG5D4XKNSSS024/run`;

let _client: GenesisClient | null = null;
function client(): GenesisClient {
  if (!_client) _client = new GenesisClient({ spaceId: SPACE_ID });
  return _client;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NowPaymentRequest {
  price_amount:   number;
  price_currency: string;
  pay_currency:   string;
  order_id:       string;
  order_description?: string;
  success_url?:     string;
  cancel_url?:      string;
}

export interface NowPaymentResponse {
  payment_id:        string;
  payment_status:    'waiting' | 'confirming' | 'confirmed' | 'sending' | 'partially_paid' | 'finished' | 'failed' | 'refunded' | 'expired';
  pay_address:       string;
  price_amount:      number;
  price_currency:    string;
  pay_amount:        number;
  pay_currency:      string;
  order_id:          string;
  order_description: string;
  created_at:        string;
  updated_at:        string;
  purchase_id:       string;
  payin_extra_id?:   string;
  network?:          string;
}

export interface NowPaymentStatusResponse {
  payment_id:     string;
  payment_status: string;
  price_amount:   number;
  price_currency: string;
  pay_amount:     number;
  pay_currency:   string;
  order_id:       string;
  created_at:     string;
  updated_at:     string;
}

// ─── Create Payment ───────────────────────────────────────────────────────────

export async function createNowPayment(params: NowPaymentRequest): Promise<NowPaymentResponse> {
  // Admin kill switch — payment flows fail loudly, never silently.
  if (!isApiEnabled('nowpayments')) {
    throw new Error('Crypto payments are temporarily disabled by the administrator. Please try again later.');
  }
  markApiUsed('nowpayments');

  const orderId     = params.order_id;
  const successUrl  = params.success_url ?? `${APP_BASE_URL}/payment/success?order=${orderId}`;
  const cancelUrl   = params.cancel_url  ?? `${APP_BASE_URL}/payment/cancel?order=${orderId}`;

  const res = await client().proxy({
    secretAlias: 'nowpayments',
    url: 'https://api.nowpayments.io/v1/payment',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': '{{secret}}' },
    body: {
      price_amount:      params.price_amount,
      price_currency:    params.price_currency,
      pay_currency:      params.pay_currency,
      order_id:          orderId,
      order_description: params.order_description ?? 'CryptoVerse HQ Purchase',
      ipn_callback_url:  IPN_CALLBACK_URL,
      success_url:       successUrl,
      cancel_url:        cancelUrl,
    },
  });

  if (!res.ok) {
    let errText = '';
    try { errText = await res.text(); } catch { errText = res.statusText; }
    if (/minimal|min(imum)?[\\s_-]?amount/i.test(errText)) {
      throw new Error('This amount is below the minimum NOWPayments accepts for the selected currency right now. Please try a different payment currency (e.g. switch from BTC to USDT).');
    }
    throw new Error(`NOWPayments error ${res.status}: ${errText}`);
  }

  const data = await res.json() as Record<string, unknown>;

  return {
    payment_id:        String(data.payment_id ?? ''),
    payment_status:    (data.payment_status as NowPaymentResponse['payment_status']) ?? 'waiting',
    pay_address:       String(data.pay_address ?? ''),
    price_amount:      Number(data.price_amount ?? 0),
    price_currency:    String(data.price_currency ?? 'usd'),
    pay_amount:        Number(data.pay_amount ?? 0),
    pay_currency:      String(data.pay_currency ?? ''),
    order_id:          String(data.order_id ?? ''),
    order_description: String(data.order_description ?? ''),
    created_at:        String(data.created_at ?? ''),
    updated_at:        String(data.created_at ?? ''),
    purchase_id:       String(data.purchase_id ?? ''),
  };
}

// ─── Get Minimum Payment Amount ────────────────────────────────────────────────
/**
 * NOWPayments enforces a minimum order size per pay_currency (it must cover
 * the network fee + their service fee). That minimum moves with market price
 * and gas fees, so a fixed low-dollar plan (e.g. Silver at $10) can silently
 * fall under it for some currencies while a higher-dollar plan (Gold $20,
 * Platinum $40) comfortably clears it — which reproduces exactly the "Silver
 * gives an error, Gold/Platinum work" symptom without any Silver-specific
 * bug in our own pricing code. We call this before creating a payment so we
 * can surface a clear, actionable error instead of a raw NOWPayments 400.
 *
 * fiat_equivalent=usd + is_fiat_equivalent=true asks NOWPayments to return
 * the minimum expressed in USD, so it can be compared directly against our
 * USD plan/package price.
 */
export async function getMinPaymentAmountUSD(payCurrency: string): Promise<number | null> {
  if (!isApiEnabled('nowpayments')) return null;
  try {
    const res = await client().proxy({
      secretAlias: 'nowpayments',
      url: `https://api.nowpayments.io/v1/min-amount?currency_from=usd&currency_to=${payCurrency}&fiat_equivalent=usd`,
      method: 'GET',
      headers: { 'x-api-key': '{{secret}}' },
    });
    if (!res.ok) return null;
    const data = await res.json() as { min_amount?: number; fiat_equivalent?: number };
    const min = data.fiat_equivalent ?? data.min_amount;
    return typeof min === 'number' && Number.isFinite(min) && min > 0 ? min : null;
  } catch {
    // Never let this check block a legitimate payment — if it fails, fall
    // through and let the real payment-creation call succeed or fail on its own.
    return null;
  }
}

// ─── Get Payment Status ───────────────────────────────────────────────────────

export async function getPaymentStatus(paymentId: string): Promise<NowPaymentStatusResponse> {
  if (!isApiEnabled('nowpayments')) {
    throw new Error('Crypto payments are temporarily disabled by the administrator.');
  }
  markApiUsed('nowpayments');
  const res = await client().proxy({
    secretAlias: 'nowpayments',
    url: `https://api.nowpayments.io/v1/payment/${paymentId}`,
    method: 'GET',
    headers: { 'x-api-key': '{{secret}}' },
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`NOWPayments status error ${res.status}: ${errText}`);
  }

  return res.json() as Promise<NowPaymentStatusResponse>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function makeOrderId(userId: string, itemId: string): string {
  return `cv_${userId}_${itemId}_${Date.now()}`;
}

export interface PayCurrencyMeta {
  value:    string;  // NOWPayments pay_currency code
  label:    string;  // Human-readable label
  symbol:   string;  // Ticker shown next to the amount
  network:  string;  // Network name shown prominently on the payment page
  decimals: number;  // Display decimals for the exact amount
  emoji:    string;
}

export const NOWPAYMENTS_PAY_CURRENCIES: PayCurrencyMeta[] = [
  { value: 'usdttrc20', label: 'USDT (TRC20)', symbol: 'USDT', network: 'TRC20 · Tron',       decimals: 2, emoji: '💵' },
  { value: 'usdterc20', label: 'USDT (ERC20)', symbol: 'USDT', network: 'ERC20 · Ethereum',   decimals: 2, emoji: '💵' },
  { value: 'usdtbep20', label: 'USDT (BEP20)', symbol: 'USDT', network: 'BEP20 · BNB Chain',  decimals: 2, emoji: '💵' },
  { value: 'btc',       label: 'Bitcoin',      symbol: 'BTC',  network: 'Bitcoin',            decimals: 8, emoji: '₿'  },
  { value: 'eth',       label: 'Ethereum',     symbol: 'ETH',  network: 'ERC20 · Ethereum',   decimals: 6, emoji: '⟠'  },
  { value: 'bnbbsc',    label: 'BNB',          symbol: 'BNB',  network: 'BEP20 · BNB Chain',  decimals: 6, emoji: '🔶' },
];

export function getPayCurrencyMeta(code: string): PayCurrencyMeta {
  return (
    NOWPAYMENTS_PAY_CURRENCIES.find(c => c.value === code) ??
    { value: code, label: code.toUpperCase(), symbol: code.toUpperCase(), network: '—', decimals: 6, emoji: '🪙' }
  );
}

/** Format a crypto amount with the currency's display decimals (e.g. "20.00 USDT") */
export function fmtPayAmount(amount: number, code: string): string {
  const meta = getPayCurrencyMeta(code);
  return `${amount.toFixed(meta.decimals)} ${meta.symbol}`;
}
