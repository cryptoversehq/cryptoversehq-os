/**
/**
 * NOWPayments client — server-authoritative Render API adapter.
 * No provider secret, bearer token, amount, or fulfillment authority enters the browser.
 */

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'https://cryptoversehq-os.onrender.com').replace(/\/$/, '');

export type PurchaseType = 'subscription' | 'cp_purchase';
export type PaymentStatus = 'waiting' | 'confirming' | 'confirmed' | 'sending' | 'partially_paid' | 'finished' | 'failed' | 'refunded' | 'expired' | 'pending' | 'completed';

export interface NowPaymentRequest {
  purchaseType: PurchaseType;
  productId: string;
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

let csrfToken: string | null = null;

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

async function ensureCsrf(): Promise<string> {
  if (csrfToken) return csrfToken;
  const response = await xhrFetch(`${API_BASE}/api/auth/csrf`, {
    method: 'GET',
    headers: { 'X-Request-ID': makeRequestId(), Accept: 'application/json' },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body.csrfToken !== 'string') {
    throw new Error('Unable to initialize secure payment session.');
  }
  csrfToken = body.csrfToken;
  return csrfToken;
}

type CloneSafeRequestInit = { method?: string; headers?: Record<string, string>; body?: string };

async function request<T>(path: string, init: CloneSafeRequestInit = {}, csrf = false): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.headers) {
    Object.entries(init.headers).forEach(([key, value]) => { headers[key] = String(value); });
  }
  headers.Accept = 'application/json';
  headers['X-Request-ID'] = makeRequestId();
  if (init.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  if (csrf) {
    headers['X-CSRF-Token'] = await ensureCsrf();
    headers['Idempotency-Key'] = headers['Idempotency-Key'] || makeIdempotencyKey();
  }
  const plainHeaders = { ...headers };
  const response = await xhrFetch(`${API_BASE}${path}`, {
    method: String(init.method || 'GET'),
    headers: plainHeaders,
    body: typeof init.body === 'string' ? init.body : undefined,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) csrfToken = null;
    const message = typeof body.message === 'string' ? body.message : 'Payment request failed.';
    throw new Error(message);
  }
  return body as T;
}

export async function createNowPayment(params: NowPaymentRequest): Promise<NowPaymentResponse> {
  if (!params.productId || !params.purchaseType || !params.payCurrency) throw new Error('Invalid payment selection.');
  return request<NowPaymentResponse>('/api/payments/create', {
    method: 'POST',
    headers: { 'Idempotency-Key': params.idempotencyKey || makeIdempotencyKey() },
    body: JSON.stringify({
      purchaseType: params.purchaseType,
      productId: params.productId,
      payCurrency: params.payCurrency,
    }),
  }, true);
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
