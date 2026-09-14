/**
 * adminApi.ts — admin API client (Better Auth + Resend).
 *
 * Endpoints:
 *   POST /api/auth/email-otp/send-verification-otp  { email, type: 'sign-in' }
 *   POST /api/auth/sign-in/email-otp                { email, otp }
 *   GET  /api/me                                    → { user: { role, email } }
 *   POST /api/auth/sign-out
 *
 * The session lives in a Better Auth HttpOnly cookie: no token is stored in the
 * browser and no CSRF header is generated. Every call sends credentials.
 */
import { useEffect, useState } from 'react';

export const RENDER_API_BASE = (
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ||
  (import.meta.env.VITE_API_URL as string | undefined) ||
  'https://cryptoversehq-os.onrender.com'
).replace(/\/$/, '');

export class ApiForbiddenError extends Error {
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ApiForbiddenError';
  }
}

// ── Low-level transport ───────────────────────────────────────────────────────

/** Abort a request that never answers (e.g. a sleeping Render instance). */
const REQUEST_TIMEOUT_MS = 30_000;

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${RENDER_API_BASE}${path}`, {
      credentials: 'include',
      ...init,
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') {
      throw new Error(
        `The API did not respond within ${Math.round(REQUEST_TIMEOUT_MS / 1000)}s. ` +
        `It is probably starting up — please try again in a moment.`,
      );
    }
    throw new Error(
      `Could not reach the API at ${RENDER_API_BASE}. ` +
      `The connection was refused or failed — the backend is most likely down, still deploying, ` +
      `or the URL has changed. Check the Render service (Status + Logs), then try again.`,
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Read `{ message }` / `{ error }` from a non-OK response. */
async function readError(res: Response, fallback: string): Promise<Error> {
  const body = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
  return new Error(body?.message || body?.error || fallback);
}

/**
 * Parse a JSON body, failing loudly on an empty or non-JSON body. A waking Render
 * instance can answer 2xx with an HTML page — silently treating that as success
 * previously advanced the OTP screen although no email had been requested.
 */
async function readJson<T>(res: Response, path: string): Promise<T> {
  const raw = await res.text().catch(() => '');
  if (!raw.trim()) {
    throw new Error(
      `Empty response from ${path} (HTTP ${res.status}). ` +
      `The API may still be starting up — please retry in a moment.`,
    );
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(
      `Unexpected non-JSON response from ${path} (HTTP ${res.status}). ` +
      `The API may still be starting up — please retry in a moment.`,
    );
  }
}

// ── Auth (Better Auth email OTP) ──────────────────────────────────────────────

/** Send a one-time code to the email. */
export async function sendOtp(email: string): Promise<{ success?: boolean }> {
  const res = await request('/api/auth/email-otp/send-verification-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, type: 'sign-in' }),
  });
  if (!res.ok) throw await readError(res, 'Failed to send code.');
  return readJson<{ success?: boolean }>(res, '/api/auth/email-otp/send-verification-otp');
}

/**
 * Verify the code and sign in. On success Better Auth sets the session cookie.
 *
 * NOTE: the response may include a session `token`. It is deliberately stripped
 * before returning — the HttpOnly cookie is the session and nothing token-like
 * should be able to reach browser storage.
 */
export async function verifyOtp(email: string, otp: string): Promise<{ user?: unknown }> {
  const res = await request('/api/auth/sign-in/email-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, otp }),
  });
  if (!res.ok) throw await readError(res, 'Invalid or expired code.');
  const data = await readJson<{ user?: unknown; token?: unknown }>(res, '/api/auth/sign-in/email-otp');
  return { user: data?.user };
}

/** Sign out (clears the Better Auth cookie). Best-effort. */
export async function logoutAdminSession(): Promise<void> {
  try {
    await request('/api/auth/sign-out', { method: 'POST' });
  } catch { /* silent fail is fine on logout */ }
}

// ── Role / identity ───────────────────────────────────────────────────────────

export interface AdminIdentity {
  role: string;
  email: string;
}

/**
 * Roles permitted anywhere in the admin portal. `founder` / `super_admin` are
 * accepted so the project owner is never locked out at the door if the backend
 * returns one of those owner-tier names instead of `developer`.
 */
export const ALLOWED_ADMIN_ROLES = ['developer', 'founder', 'super_admin', 'subscription_admin', 'support_admin'] as const;

/** Owner-tier roles with UNRESTRICTED access to the whole admin panel. */
export const FULL_ACCESS_ROLES = ['developer', 'founder', 'super_admin'] as const;

/** True for an owner-tier role (every section + role/API/pricing tools). */
export function hasFullAdminAccess(role: string | null | undefined): boolean {
  return !!role && (FULL_ACCESS_ROLES as readonly string[]).includes(normalizeRole(role));
}

/** Normalize a role string: trim, lowercase, and "Support-Admin" → "support_admin". */
export function normalizeRole(role: unknown): string {
  return typeof role === 'string' ? role.trim().toLowerCase().replace(/[\s-]+/g, '_') : '';
}

/** True when the role may use the admin portal at all. */
export function isAdminRole(role: string | null | undefined): boolean {
  return !!role && (ALLOWED_ADMIN_ROLES as readonly string[]).includes(normalizeRole(role));
}

/**
 * True for the project Developer — the only server role with UNRESTRICTED admin
 * panel access (every section, Role Management, API Management, Pricing).
 */
export function isDeveloperRole(role: string | null | undefined): boolean {
  return normalizeRole(role) === 'developer';
}

/** Current user's role + email from GET /api/me. */
export async function fetchAdminRole(): Promise<AdminIdentity> {
  const res = await request('/api/me', { headers: { Accept: 'application/json' } });
  if (res.status === 401 || res.status === 403) throw new ApiForbiddenError();
  if (!res.ok) throw await readError(res, `Failed: ${res.status}`);
  const data = await readJson<{
    role?: string;
    email?: string;
    user?: { role?: string; email?: string } | null;
    session?: { user?: { role?: string; email?: string } | null } | null;
  }>(res, '/api/me');
  // Accept the role wherever the backend puts it: `user.role` (Better Auth
  // shape), `session.user.role`, or a top-level `role`. Normalized so
  // "Support-Admin" / "support admin" still match the allowlist.
  const role  = data?.user?.role ?? data?.session?.user?.role ?? data?.role ?? '';
  const email = data?.user?.email ?? data?.session?.user?.email ?? data?.email ?? '';
  const identity: AdminIdentity = { role: normalizeRole(role), email: String(email) };
  // Prime the shared cache so anything that reads it on the next render (the
  // portal nav, ServerAdminGuard's children, SectionGuard, the pages) sees the
  // real role on its FIRST paint instead of a transient "no role" that would
  // flash a 403. ServerAdminGuard always calls this before rendering children.
  _identity = identity;
  _identityLoaded = true;
  return identity;
}

let _identityLoaded = false;
let _identity: AdminIdentity | null = null;
let _identityRequest: Promise<AdminIdentity | null> | null = null;

function loadIdentity(): Promise<AdminIdentity | null> {
  if (_identityLoaded) return Promise.resolve(_identity);
  if (_identityRequest) return _identityRequest;
  _identityRequest = fetchAdminRole()
    .then(identity => { _identity = identity; return _identity; })
    .catch(() => null)
    .then(value => { _identityLoaded = true; _identityRequest = null; return value; });
  return _identityRequest;
}

/** Clear the cached identity (call on sign-out). */
export function clearAdminSessionCache(): void {
  _identityLoaded = false;
  _identity = null;
  _identityRequest = null;
}

/**
 * React hook over fetchAdminRole(), memoized so the layout and the page share a
 * single GET /api/me per session. Returns null while unknown / not signed in.
 */
export function useAdminIdentity(): AdminIdentity | null {
  const [identity, setIdentity] = useState<AdminIdentity | null>(_identityLoaded ? _identity : null);
  useEffect(() => {
    if (_identityLoaded) { setIdentity(_identity); return; }
    let canceled = false;
    void loadIdentity().then(value => { if (!canceled) setIdentity(value); });
    return () => { canceled = true; };
  }, []);
  return identity;
}

// ── Admin APIs ────────────────────────────────────────────────────────────────

/** Authenticated GET (cookie session). 401/403 → ApiForbiddenError. */
export async function apiGet<T>(path: string): Promise<T> {
  const res = await request(path, { headers: { Accept: 'application/json' } });
  if (res.status === 401 || res.status === 403) throw new ApiForbiddenError();
  if (!res.ok) throw await readError(res, `Failed: ${res.status}`);
  return readJson<T>(res, path);
}

/** Authenticated DELETE (cookie session). 401/403 → ApiForbiddenError. */
export async function apiDelete<T = unknown>(path: string): Promise<T> {
  const res = await request(path, { method: 'DELETE', headers: { Accept: 'application/json' } });
  if (res.status === 401 || res.status === 403) throw new ApiForbiddenError();
  if (!res.ok) throw await readError(res, `Failed: ${res.status}`);
  const raw = await res.text().catch(() => '');
  if (!raw.trim()) return undefined as unknown as T;   // 204 / empty body is fine
  try { return JSON.parse(raw) as T; } catch { return undefined as unknown as T; }
}

/** Authenticated POST (cookie session). 401/403 → ApiForbiddenError. */
export async function apiPost<T>(
  path: string,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  const res = await request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...extraHeaders },
    body: JSON.stringify(body),
  });
  if (res.status === 401 || res.status === 403) throw new ApiForbiddenError();
  if (!res.ok) throw await readError(res, `Failed: ${res.status}`);
  return readJson<T>(res, path);
}
