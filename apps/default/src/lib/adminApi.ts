/**
 * adminApi.ts — shared admin API client + admin-role hook.
 *
 * Talks to the Render backend (backed by Neon) using the HttpOnly Supabase
 * session cookie. There is NO Personal Access Token and NO OIDC token in the
 * browser: the admin session is established by the admin OTP flow
 * (POST /api/auth/send-otp → POST /api/auth/verify-otp) and travels only as a
 * cookie. Every authorization decision is made server-side.
 *
 * Shared by the admin login page, the admin route guard, the portal layout and
 * the subscription page so they all use one transport.
 */
import { useEffect, useState } from 'react';

/**
 * Render API base. Mirrors the convention already used by nowPaymentsClient.ts
 * (`VITE_API_BASE_URL`); `VITE_API_URL` is accepted as a second override.
 */
export const RENDER_API_BASE = (
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ||
  (import.meta.env.VITE_API_URL as string | undefined) ||
  'https://cryptoversehq-os.onrender.com'
).replace(/\/$/, '');

/** Thrown when the server answers 401/403 — i.e. "not an authorized admin". */
export class ApiForbiddenError extends Error {
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ApiForbiddenError';
  }
}

/** How long to wait for a response before giving up (a cold Render instance). */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * fetch() with an abort timeout, mapping network/abort failures to a clear,
 * actionable message (instead of a raw "Failed to fetch").
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') {
      throw new Error(
        `The API did not respond within ${Math.round(timeoutMs / 1000)}s. ` +
        `It is probably starting up — please try again in a moment.`,
      );
    }
    throw new Error(
      `Could not reach the API at ${RENDER_API_BASE}. ` +
      `This is usually a network/CORS problem or the service is asleep — please try again.`,
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parse a JSON body, but FAIL LOUDLY when the body is NOT JSON.
 *
 * A waking Render instance (or any proxy) can answer 2xx with an HTML page.
 * Silently treating that as `{}` previously made the OTP screen advance even
 * though the request had never reached the application and no email was sent.
 */
async function readJson(res: Response, path: string): Promise<Record<string, unknown>> {
  const raw = await res.text().catch(() => '');
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : { data: parsed };
  } catch {
    throw new Error(
      `Unexpected non-JSON response from ${path} (HTTP ${res.status}). ` +
      `The API may still be starting up — please retry in a moment.`,
    );
  }
}

/** Read `{ message }` / `{ error }` from an error response, else the fallback. */
async function readErrorText(res: Response, fallback: string): Promise<string> {
  const raw = await res.text().catch(() => '');
  if (!raw.trim()) return fallback;
  try {
    const parsed = JSON.parse(raw) as { message?: string; error?: string };
    return parsed?.message || parsed?.error || fallback;
  } catch {
    return fallback;
  }
}

/** Fetch a CSRF token bound to the current cookie session. */
export async function getCsrfToken(): Promise<string> {
  const res = await fetchWithTimeout(`${RENDER_API_BASE}/api/auth/csrf`, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`CSRF fetch failed (${res.status}).`);
  const body = await readJson(res, '/api/auth/csrf') as { csrfToken?: unknown };
  if (typeof body.csrfToken !== 'string' || body.csrfToken.length < 16) {
    throw new Error('CSRF token missing or malformed.');
  }
  return body.csrfToken;
}

/** Authenticated GET (cookie session). 401/403 → ApiForbiddenError. */
export async function apiGet(path: string): Promise<unknown> {
  const res = await fetchWithTimeout(`${RENDER_API_BASE}${path}`, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (res.status === 401 || res.status === 403) throw new ApiForbiddenError();
  if (!res.ok) throw new Error(await readErrorText(res, `Request failed (${res.status}).`));
  return readJson(res, path);
}

/** Authenticated state-changing POST: cookie session + CSRF + Idempotency-Key. */
export async function apiPost(
  path: string,
  payload: Record<string, unknown>,
  idempotencyKey: string,
): Promise<unknown> {
  const csrfToken = await getCsrfToken();
  const res = await fetchWithTimeout(`${RENDER_API_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(payload),
  });
  if (res.status === 401 || res.status === 403) throw new ApiForbiddenError();
  if (!res.ok) throw new Error(await readErrorText(res, `Request failed (${res.status}).`));
  return readJson(res, path);
}

/**
 * Pre-authentication POST used by the OTP flow (send-otp / verify-otp).
 * The Backend runs csrfProtection on ALL POSTs (these are not exempt), so a CSRF
 * token is sent. If /api/auth/csrf is momentarily unavailable we still attempt
 * the call rather than failing the login outright.
 */
export async function apiPostPublic(path: string, payload: Record<string, unknown>): Promise<unknown> {
  let csrfToken: string | null = null;
  try { csrfToken = await getCsrfToken(); } catch { csrfToken = null; }

  const res = await fetchWithTimeout(`${RENDER_API_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (res.status === 401 || res.status === 403) {
    // Distinguish a genuine "not allowed" from a missing CSRF token, which the
    // Backend's csrfProtection middleware would also reject with 403.
    if (!csrfToken) {
      throw new Error('The request was rejected because no CSRF token was available. Please reload the page and try again.');
    }
    throw new ApiForbiddenError();
  }
  if (!res.ok) throw new Error(await readErrorText(res, `Request failed (${res.status}).`));
  return readJson(res, path);
}

/**
 * Clear the server (Supabase) session cookie. Best-effort — a network failure
 * must never block the local sign-out.
 */
export async function logoutAdminSession(): Promise<void> {
  try {
    const csrfToken = await getCsrfToken();
    await fetchWithTimeout(`${RENDER_API_BASE}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-CSRF-Token': csrfToken },
    });
  } catch { /* silent fail is fine on logout */ }
}

// ── Admin role (from GET /api/auth/me) ────────────────────────────────────────
export type AdminRole = 'developer' | 'subscription_admin' | 'support_admin' | 'user' | string;

let _roleCache: AdminRole | null = null;
let _roleRequest: Promise<AdminRole | null> | null = null;

function extractRole(data: unknown): AdminRole | null {
  if (!data || typeof data !== 'object') return null;
  const o = data as { user?: { role?: string }; role?: string };
  return o.user?.role ?? o.role ?? null;
}

/** Fetch the current admin role from /api/auth/me (cached for the session). */
export async function fetchAdminRole(): Promise<AdminRole | null> {
  if (_roleCache) return _roleCache;
  if (_roleRequest) return _roleRequest;
  _roleRequest = apiGet('/api/auth/me')
    .then(data => { _roleCache = extractRole(data); return _roleCache; })
    .catch(() => null)
    .finally(() => { _roleRequest = null; });
  return _roleRequest;
}

/** Clear the cached role (call on sign-out). */
export function clearAdminRoleCache(): void {
  _roleCache = null;
  _roleRequest = null;
}

/** React hook: the admin role from /api/auth/me ('developer' | … | null). */
export function useAdminRole(): AdminRole | null {
  const [role, setRole] = useState<AdminRole | null>(_roleCache);
  useEffect(() => {
    if (_roleCache) { setRole(_roleCache); return; }
    let canceled = false;
    void fetchAdminRole().then(r => { if (!canceled) setRole(r); });
    return () => { canceled = true; };
  }, []);
  return role;
}
