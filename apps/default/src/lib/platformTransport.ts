export interface PlatformRequestOptions extends RequestInit {
  retries?: number;
  timeoutMs?: number;
}

export interface PlatformTransport {
  request<T>(path: string, options?: PlatformRequestOptions): Promise<T>;
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  stream(path: string): EventSource;
  upload<T>(path: string, body: FormData, options?: PlatformRequestOptions): Promise<T>;
  download(path: string, options?: PlatformRequestOptions): Promise<Response>;
  telemetry(path: string, payload: Record<string, unknown>): void;
}

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRIES = 2;
const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 4_000;

/**
 * Bridge-safe HTTP transport. The Taskade preview bridge serializes fetch
 * arguments through postMessage, where native Headers/Request objects are not
 * structured-cloneable. XHR receives only primitive values and plain header
 * records, then the response is reconstructed as a standard Response so the
 * existing parsing and retry contracts remain unchanged.
 */
function bridgeSafeFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const method = String(init.method || 'GET');
  const headers: Record<string, string> = {};
  if (init.headers instanceof Headers) {
    init.headers.forEach((value, key) => { headers[key] = value; });
  } else if (Array.isArray(init.headers)) {
    init.headers.forEach(([key, value]) => { headers[String(key)] = String(value); });
  } else if (init.headers) {
    Object.entries(init.headers).forEach(([key, value]) => { headers[key] = String(value); });
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    const fail = (error: Error) => { if (!settled) { settled = true; reject(error); } };
    xhr.open(method, url, true);
    xhr.withCredentials = true;
    Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));
    const signal = init.signal;
    const abort = () => { xhr.abort(); fail(new DOMException('The operation was aborted.', 'AbortError')); };
    if (signal?.aborted) return abort();
    signal?.addEventListener('abort', abort, { once: true });
    xhr.onload = () => {
      if (settled) return;
      settled = true;
      const responseHeaders = new Headers();
      xhr.getAllResponseHeaders().trim().split(/\r?\n/).forEach(line => {
        const separator = line.indexOf(':');
        if (separator > 0) responseHeaders.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
      });
      resolve(new Response(xhr.responseText, { status: xhr.status, statusText: xhr.statusText, headers: responseHeaders }));
    };
    xhr.onerror = () => fail(new Error('Network request failed.'));
    xhr.ontimeout = () => fail(new Error('Network request timed out.'));
    xhr.send(init.body ?? null);
  });
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Parses a `Retry-After` header; null if absent/unparseable. Handles both the
 * delay-seconds (`120`) and HTTP-date forms, the latter resolved to a delay
 * relative to now.
 */
function retryAfterMs(headers: Headers): number | null {
  const header = headers.get('retry-after')?.trim();
  if (header == null || header.length === 0) return null;
  if (/^\d+$/.test(header)) return Number.parseInt(header, 10) * 1000;
  const dateMs = Date.parse(header);
  return Number.isNaN(dateMs) ? null : Math.max(0, dateMs - Date.now());
}

// ── Request tracking (diagnoses 429 rate-limit loops) ──────────────────────
let requestCounter = 0;
let lastRequestTime = Date.now();
const BURST_WINDOW_MS = 5_000;
const BURST_THRESHOLD = 8;
const recentRequests = new Map<string, { count: number; windowStart: number }>();

function trackOutgoingRequest(method: string, path: string): void {
  requestCounter += 1;
  const now = Date.now();
  console.log(`[Request #${requestCounter}] ${method} ${path} - ${now - lastRequestTime}ms since last request`);
  lastRequestTime = now;

  // Burst detection: repeated requests to the same endpoint within a short
  // window usually indicate a render/render-effect loop re-firing the API.
  const key = `${method} ${path}`;
  const entry = recentRequests.get(key) ?? { count: 0, windowStart: now };
  if (now - entry.windowStart > BURST_WINDOW_MS) {
    entry.count = 0;
    entry.windowStart = now;
  }
  entry.count += 1;
  recentRequests.set(key, entry);
  if (entry.count >= BURST_THRESHOLD) {
    console.warn(`[Request] Possible request loop: ${key} hit ${entry.count} times in the last ${BURST_WINDOW_MS}ms`);
  }
}

function normalizeError(status: number, body: string, path: string): Error {
  return new Error(`Platform transport failed: ${status} ${path}${body ? ` ${body.slice(0, 160)}` : ''}`);
}

async function parseResponse<T>(response: Response, path: string): Promise<T> {
  const body = await response.text().catch(() => '');
  if (!response.ok) throw normalizeError(response.status, body, path);
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error(`Platform transport expected JSON for ${path}`);
  }
  try {
    return JSON.parse(body) as T;
  } catch (error) {
    throw new Error(`Platform transport returned invalid JSON for ${path}`, { cause: error });
  }
}

async function request<T>(path: string, options: PlatformRequestOptions = {}): Promise<T> {
  const { retries = DEFAULT_RETRIES, timeoutMs = DEFAULT_TIMEOUT_MS, ...init } = options;
  const method = (init.method ?? 'GET').toUpperCase();
  trackOutgoingRequest(method, path);
  // GETs retry on transient statuses (429/502/503/504) + network blips (idempotent).
  // Writes (POST/PATCH/DELETE) are NEVER retried in-transport. A transient on a
  // write may already be applied server-side, and retrying a 429 write in place
  // turns ONE rate-limited request into a burst of identical requests against the
  // SAME node — the exact repeated-node 429 observed in the field. Failed writes
  // are instead handed to OfflineQueue, which retries with exponential backoff.
  const attempts = method === 'GET' ? retries + 1 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await bridgeSafeFetch(path, {
        ...init,
        credentials: init.credentials ?? 'include',
        headers: {
          ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
          ...(init.headers ?? {}),
        },
        signal: init.signal ?? controller.signal,
      });

      if (response.ok) {
        return parseResponse<T>(response, path);
      }

      const rateLimited = response.status === 429;
      // Only idempotent GETs retry on ANY transient status (incl. 429). Writes
      // have `attempts === 1`, so this branch is unreachable for them — they
      // fail once and are handled by OfflineQueue's exponential-backoff retry.
      const canRetry =
        method === 'GET' &&
        attempt < attempts - 1 &&
        RETRYABLE_STATUSES.has(response.status);

      if (!canRetry) {
        return parseResponse<T>(response, path);
      }

      // Prefer the server's Retry-After hint; otherwise use exponential backoff.
      // A hint beyond the ceiling means the server wants room no page load can
      // give — fail fast rather than hammering it.
      const hinted = rateLimited ? retryAfterMs(response.headers) : null;
      if (hinted != null && hinted > MAX_BACKOFF_MS) {
        return parseResponse<T>(response, path);
      }
      const delayMs = hinted ?? Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
      console.log(`[RateLimit] ${method} ${path} → HTTP ${response.status}; retrying in ${delayMs}ms (${attempt + 1}/${attempts})`);
      await wait(delayMs);
    } catch (error) {
      if (attempt === attempts - 1 || method !== 'GET') throw error;
      await wait(Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`Platform transport exhausted retries for ${path}`);
}

export const platformTransport: PlatformTransport = {
  request,
  fetch(input, init) {
    return bridgeSafeFetch(input, { ...init, credentials: init?.credentials ?? 'include' });
  },
  stream(path) {
    return new EventSource(path);
  },
  upload(path, body, options = {}) {
    return request(path, { ...options, method: options.method ?? 'POST', body });
  },
  download(path, options = {}) {
    return bridgeSafeFetch(path, { ...options, credentials: options.credentials ?? 'include' });
  },
  telemetry(path, payload) {
    try {
      void bridgeSafeFetch(path, {
        method: 'POST',
        credentials: 'include',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => undefined);
    } catch {
      // Telemetry must never affect the application.
    }
  },
};
