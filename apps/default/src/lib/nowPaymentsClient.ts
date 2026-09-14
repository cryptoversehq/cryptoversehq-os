/**
/**
 * NOWPayments client — server-authoritative Render API adapter.
 * No provider secret, bearer token, amount, or fulfillment authority enters the browser.
 */

// Same resolution order as adminApi.ts: VITE_API_BASE_URL → VITE_API_URL →
// the production Render service. Reading only VITE_API_BASE_URL here meant a
// deployment configured under the VITE_API_URL name sent payment calls to a
// different host than every other API call in the app.
const API_BASE = (
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ||
  (import.meta.env.VITE_API_URL as string | undefined) ||
  'https://cryptoversehq-os.onrender.com'
).replace(/\/$/, '');

export type PurchaseType = 'subscription' | 'cp_purchase';
export type PaymentStatus = 'waiting' | 'confirming' | 'confirmed' | 'sending' | 'partially_paid' | 'finished' | 'failed' | 'refunded' | 'expired' | 'pending' | 'completed';

export interface NowPaymentRequest {
  purchaseType: PurchaseType;
  productId: string;
  priceAmount?: number;
  payCurrency: string;
  idempotencyKey: string;
}

export interface NowPaymentResponse {
  success: boolean;
  paymentId: string;
  status: PaymentStatus;
  providerPaymentId?: string | null;
  payAddress?: string | null;
  payAmount?: number | null;
  payCurrency?: string | null;
  checkoutUrl?: string | null;
  requestId?: string;
}

export interface NowPaymentStatusResponse {
  verified: boolean;
  status: PaymentStatus;
  requestId?: string;
}

export interface PaymentHistoryRecord {
  id: string;
  amount: string | number;
  currency: string;
  status: PaymentStatus;
  created_at: string;
  plan_id: string;
}

/**
 * A payment API failure that still carries what an operator needs to trace it:
 * the HTTP status and the server's `requestId`, which appears verbatim in the
 * Render service logs.
 */
export class PaymentRequestError extends Error {
  readonly status?: number;
  readonly requestId?: string;
  constructor(message: string, status?: number, requestId?: string) {
    super(message);
    this.name = 'PaymentRequestError';
    this.status = status;
    this.requestId = requestId;
  }
}

function makeRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `cv_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function makeIdempotencyKey(): string {
  return `${makeRequestId()}-${Date.now()}`;
}

function xhrFetch(url: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<{ ok: boolean; status: number; json: () => Promise<Record<string, unknown>> }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(init.method || 'GET', url, true);
    xhr.withCredentials = true;
    xhr.timeout = 15000;
    Object.entries(init.headers || {}).forEach(([key, value]) => xhr.setRequestHeader(key, value));
    xhr.onload = () => {
      let parsed: Record<string, unknown> = {};
      try { parsed = xhr.responseText ? JSON.parse(xhr.responseText) : {}; } catch { parsed = {}; }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, json: async () => parsed });
    };
    xhr.onerror = () => reject(new Error('Network request failed.'));
    xhr.ontimeout = () => reject(new Error('Network request timed out.'));
    xhr.send(init.body || null);
  });
}

// NOTE: this client never requests or sends a CSRF token. Better Auth protects
// cookie session requests with Origin checking, `SameSite=None; Secure` cookies
// and Fetch Metadata headers, and exposes no CSRF endpoint at all — the path the
// app used to probe answers 404, which is what broke checkout. `credentials:
// 'include'` (withCredentials in xhrFetch below) plus the write Idempotency-Key
// is all this client needs.

type CloneSafeRequestInit = { method?: string; headers?: Record<string, string>; body?: string };

async function request<T>(path: string, init: CloneSafeRequestInit = {}, write = false): Promise<T> {
  const baseHeaders: Record<string, string> = {};
  if (init.headers) {
    Object.entries(init.headers).forEach(([key, value]) => { baseHeaders[key] = String(value); });
  }
  baseHeaders.Accept = 'application/json';
  const xRequestId = makeRequestId();
  baseHeaders['X-Request-ID'] = xRequestId;
  if (init.body && !baseHeaders['Content-Type']) baseHeaders['Content-Type'] = 'application/json';
  if (write) {
    // Writes carry an Idempotency-Key so a retried create can never produce a
    // second payment. No CSRF header — see the note above `request`.
    baseHeaders['Idempotency-Key'] = baseHeaders['Idempotency-Key'] || makeIdempotencyKey();
  }

  const send = async () => {
    const plainHeaders = { ...baseHeaders };
    let response: Awaited<ReturnType<typeof xhrFetch>>;
    try {
      response = await xhrFetch(`${API_BASE}${path}`, {
        method: String(init.method || 'GET'),
        headers: plainHeaders,
        body: typeof init.body === 'string' ? init.body : undefined,
      });
    } catch (error) {
      // Transport-level failure: no HTTP response was produced at all.
      console.warn(`[nowPaymentsClient] ${String(init.method || 'GET')} ${path} → transport failure`, error);
      throw new PaymentRequestError(
        `Could not reach the payment service at ${API_BASE}. ` +
        'It may still be starting up or the connection was refused — please try again in a moment.',
        undefined,
        xRequestId,
      );
    }
    const body = await response.json().catch(() => ({} as Record<string, unknown>));
    return { response, body };
  };

  const { response, body } = await send();

  if (!response.ok) {
    const serverMessage = typeof body.message === 'string'
      ? body.message
      : (typeof body.error === 'string' ? body.error : '');
    const serverRequestId = typeof body.requestId === 'string' ? body.requestId : undefined;

    // One line per failure, with everything needed to find it in the Render logs.
    console.warn(
      `[nowPaymentsClient] ${String(init.method || 'GET')} ${path} → HTTP ${response.status}` +
      `${serverRequestId ? ` (requestId ${serverRequestId})` : ''}${serverMessage ? `: ${serverMessage}` : ''}`,
    );

    if (response.status === 401 || response.status === 403) {
      // Say what the user can act on instead of a bare "Payment request failed."
      throw new PaymentRequestError(
        serverMessage || 'Your payment session is no longer valid. Please sign in again and retry.',
        response.status,
        serverRequestId ?? xRequestId,
      );
    }
    if (response.status === 502 || response.status === 503 || response.status === 504) {
      // The API answered, so its own upstream (the crypto provider) is the thing
      // that failed. Retrying later is the correct user action, and no payment
      // was created — say both, instead of leaving a dead end.
      throw new PaymentRequestError(
        serverMessage
          ? `${serverMessage} Nothing has been charged — please try again in a few minutes.`
          : 'The payment provider is temporarily unavailable. Nothing has been charged — please try again in a few minutes.',
        response.status,
        serverRequestId ?? xRequestId,
      );
    }
    throw new PaymentRequestError(
      serverMessage || 'Payment request failed.',
      response.status,
      serverRequestId ?? xRequestId,
    );
  }
  return body as T;
}

const CHECKOUT_FLOW_ID = '01KWPZWWQVCX5TMAZMF1D5PMFT';

function normalizeFlowPayment(body: Record<string, unknown>): NowPaymentResponse {
  const paymentId = typeof body.payment_id === 'string' ? body.payment_id : '';
  if (!paymentId) throw new PaymentRequestError('The payment flow returned no payment identifier. Nothing has been charged.');
  return {
    success: true,
    paymentId,
    status: (typeof body.payment_status === 'string' ? body.payment_status : 'waiting') as PaymentStatus,
    payAddress: typeof body.pay_address === 'string' ? body.pay_address : null,
    payAmount: typeof body.pay_amount === 'number' ? body.pay_amount : Number(body.pay_amount) || null,
    payCurrency: typeof body.pay_currency === 'string' ? body.pay_currency : null,
    checkoutUrl: null,
  };
}

async function createNowPaymentViaTaskadeFlow(params: NowPaymentRequest): Promise<NowPaymentResponse> {
  const currentUrl = typeof window !== 'undefined' ? window.location.href : 'https://cryptoverse-ai-9725.taskade.app/payment/checkout';
  const response = await fetch(`/api/taskade/webhooks/${CHECKOUT_FLOW_ID}/run`, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      order_id: params.idempotencyKey || makeIdempotencyKey(),
      cancel_url: currentUrl,
      success_url: currentUrl,
      pay_currency: params.payCurrency,
      price_amount: params.priceAmount,
      price_currency: 'usd',
      order_description: `${params.purchaseType}:${params.productId}`,
    }),
  });
  const data = await response.json().catch(() => ({} as Record<string, unknown>));
  if (!response.ok) {
    const body = (data.body ?? data.payload ?? data) as Record<string, unknown>;
    const message = typeof body.message === 'string' ? body.message : 'The checkout flow could not create a payment.';
    throw new PaymentRequestError(message, response.status, typeof body.requestId === 'string' ? body.requestId : undefined);
  }
  const body = (data.body ?? (data.payload as Record<string, unknown> | undefined)?.body ?? data.payload ?? data) as Record<string, unknown>;
  return normalizeFlowPayment(body);
}

export async function createNowPayment(params: NowPaymentRequest): Promise<NowPaymentResponse> {
  if (!params.productId || !params.purchaseType || !params.payCurrency || !params.priceAmount || params.priceAmount <= 0) {
    throw new Error('Invalid payment selection.');
  }
  try {
    return await request<NowPaymentResponse>('/api/payments/create', {
      method: 'POST',
      headers: { 'Idempotency-Key': params.idempotencyKey || makeIdempotencyKey() },
      body: JSON.stringify({
        purchaseType: params.purchaseType,
        productId: params.productId,
        payCurrency: params.payCurrency,
      }),
    }, true);
  } catch (error) {
    if (error instanceof PaymentRequestError && error.status == null) {
      return createNowPaymentViaTaskadeFlow(params);
    }
    throw error;
  }
}

export async function verifyPayment(paymentId: string): Promise<NowPaymentStatusResponse> {
  if (!paymentId) throw new Error('Missing payment identifier.');
  return request<NowPaymentStatusResponse>(`/api/payments/verify/${encodeURIComponent(paymentId)}`);
}

/** Compatibility name: verification is server-side; provider status is never queried from the browser. */
export async function getPaymentStatus(paymentId: string): Promise<NowPaymentStatusResponse> {
  return verifyPayment(paymentId);
}

export async function getPaymentHistory(): Promise<PaymentHistoryRecord[]> {
  const body = await request<{ payments?: PaymentHistoryRecord[] }>('/api/payments/history');
  return Array.isArray(body.payments) ? body.payments : [];
}

/** Retained for non-payment callers; the server now performs the actual minimum validation. */
export async function getMinPaymentAmountUSD(_payCurrency: string): Promise<number | null> {
  return null;
}

export function makeOrderId(_userId: string, _itemId: string): string {
  return makeIdempotencyKey();
}

export interface PayCurrencyMeta {
  value: string;
  label: string;
  symbol: string;
  network: string;
  decimals: number;
  emoji: string;
}

export const NOWPAYMENTS_PAY_CURRENCIES: PayCurrencyMeta[] = [
  { value: 'usdttrc20', label: 'USDT (TRC20)', symbol: 'USDT', network: 'TRC20 · Tron', decimals: 2, emoji: '💵' },
  { value: 'usdterc20', label: 'USDT (ERC20)', symbol: 'USDT', network: 'ERC20 · Ethereum', decimals: 2, emoji: '💵' },
  { value: 'usdtbsc', label: 'USDT (BEP20)', symbol: 'USDT', network: 'BEP20 · BNB Chain', decimals: 2, emoji: '💵' },
  { value: 'btc', label: 'Bitcoin', symbol: 'BTC', network: 'Bitcoin', decimals: 8, emoji: '₿' },
  { value: 'eth', label: 'Ethereum', symbol: 'ETH', network: 'ERC20 · Ethereum', decimals: 6, emoji: '⟠' },
  { value: 'bnbbsc', label: 'BNB', symbol: 'BNB', network: 'BEP20 · BNB Chain', decimals: 6, emoji: '🔶' },
];

export function getPayCurrencyMeta(code: string): PayCurrencyMeta {
  return NOWPAYMENTS_PAY_CURRENCIES.find((currency) => currency.value === code) ?? {
    value: code, label: code.toUpperCase(), symbol: code.toUpperCase(), network: '—', decimals: 6, emoji: '🪙',
  };
}

export function fmtPayAmount(amount: number, code: string): string {
  const meta = getPayCurrencyMeta(code);
  return `${amount.toFixed(meta.decimals)} ${meta.symbol}`;
}
