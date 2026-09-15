/**
 * betterAuthClient.ts — CryptoVerse HQ ↔ Better Auth (Neon) client
 * Phase 0.5 "Identity Freeze" · frontend Batch A
 *
 * The identity authority is now Better Auth on the Render API, exposed under
 * /api/auth/*, with the app profile served by GET /api/me. Passwords are gone:
 * every sign-in is an email OTP.
 *
 * Why raw fetch instead of platformTransport.request():
 *   request() normalises every non-2xx into a single opaque
 *   "Platform transport failed: <status> <path> <body>" Error. Auth needs the
 *   real status (401 / 429 / 503) and Better Auth's JSON to show the user
 *   something actionable, so these calls use platformTransport.fetch() — which
 *   still goes through the bridge-safe XHR with credentials, and therefore still
 *   carries the session cookie.
 *
 * Endpoint contract (Better Auth emailOTP plugin, default basePath /api/auth):
 *   POST /api/auth/email-otp/send-verification-otp  { email, type }  → { success }
 *   POST /api/auth/sign-in/email-otp                { email, otp }   → { token, user } + Set-Cookie
 *   POST /api/auth/sign-out                                          → clears the session
 *
 * `type: 'sign-in'` is used for BOTH login and signup: the user row is created on
 * successful verification (emailAndPassword is disabled, signup is not), whereas
 * 'email-verification' requires the account to already exist and would reject a
 * brand-new address. Requesting a code creates no session, so a code request can
 * never sign the user out on another device.
 */
import { platformTransport, resolvePlatformUrl } from './platformTransport';
import type { UserProfile, UserRole } from './authStore';

export type OtpPurpose = 'sign-in' | 'email-verification' | 'forget-password';

const AUTH_BASE = '/api/auth';

/** Better Auth / generic API error body. */
interface ApiErrorBody {
  message?: string;
  code?: string;
  error?: string;
}

/** The `user` object of GET /api/me (Batch 3 backend contract). */
export interface ServerUser {
  id: string;
  email: string;
  role: string;
  display_name: string | null;
  language: string;
  plan: 'free' | 'pro' | 'pro_plus';
  plan_expires_at: string | null;
  entitlements: string[];
  skill_level: number;
  level_label: string | null;
  xp: number;
  rank: string;
  status: string;
  sections: unknown;
  balance: number;
  cp_balance: number | null;
  onboarding: Record<string, unknown>;
  created_at: string | null;
  last_seen_at: string | null;
}

export interface ServerSession {
  id: string;
  device_name: string | null;
  ip: string | null;
  created_at: string | null;
  last_seen_at: string | null;
  expires_at: string | null;
}

export interface ServerMe {
  user: ServerUser;
  session: ServerSession;
  requestId?: string;
}

/**
 * An auth failure that keeps the HTTP status and machine-readable `code`, so the
 * UI can distinguish "wrong code" (401) from "slow down" (429) from
 * "we could not send the email" (5xx) without string matching.
 */
export class AuthRequestError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'AuthRequestError';
    this.status = status;
    this.code = code;
  }
}

function fallbackMessage(status: number): string {
  if (status === 429) return 'Too many attempts. Please wait a minute and try again.';
  if (status === 401) return 'That code is invalid or has expired.';
  if (status === 403) return 'This account is not allowed to sign in.';
  if (status === 503) return 'Email delivery is temporarily unavailable. Please try again shortly.';
  if (status >= 500) return 'The server is having trouble right now. Please try again in a moment.';
  return 'Something went wrong. Please try again.';
}

async function authRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await platformTransport.fetch(resolvePlatformUrl(path), {
      ...init,
      method: init.method ?? 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...((init.headers as Record<string, string> | undefined) ?? {}),
      },
    });
  } catch (error) {
    // Network/bridge failure — never a credential problem.
    throw new AuthRequestError(
      'We could not reach the server. Please check your connection and try again.',
      0,
      'network_error',
    );
  }

  const text = await response.text().catch(() => '');
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }

  if (!response.ok) {
    const err = (body ?? {}) as ApiErrorBody;
    throw new AuthRequestError(
      err.message || err.error || fallbackMessage(response.status),
      response.status,
      err.code,
    );
  }

  return body as T;
}

/** Request a sign-in code. Never reveals whether the address has an account. */
export async function sendSignInOtp(email: string, purpose: OtpPurpose = 'sign-in'): Promise<void> {
  await authRequest<{ success?: boolean }>(`${AUTH_BASE}/email-otp/send-verification-otp`, {
    body: JSON.stringify({ email: email.toLowerCase().trim(), type: purpose }),
  });
}

/** Exchange the code for a session. Sets the Better Auth session cookie. */
export async function signInWithOtp(email: string, otp: string): Promise<void> {
  await authRequest<{ token?: string; user?: unknown }>(`${AUTH_BASE}/sign-in/email-otp`, {
    body: JSON.stringify({ email: email.toLowerCase().trim(), otp: otp.trim() }),
  });
}

/** Clear the Better Auth session server-side (the cookie is cleared in response). */
export async function signOut(): Promise<void> {
  try {
    await authRequest<unknown>(`${AUTH_BASE}/sign-out`, { method: 'POST' });
  } catch (error) {
    // A failed sign-out must never trap the user in the app: the local session is
    // dropped regardless, and the session guard rejects the cookie on next use.
    if (!(error instanceof AuthRequestError) || error.status >= 500) throw error;
  }
}

/** Server-verified identity. Throws AuthRequestError(401) when signed out. */
export async function fetchMe(): Promise<ServerMe> {
  return authRequest<ServerMe>('/api/me', { method: 'GET' });
}

/** True when the error means "no valid session" (used by the App guard). */
export function isUnauthenticated(error: unknown): boolean {
  return error instanceof AuthRequestError && (error.status === 401 || error.status === 0);
}

// ─── Server → client mapping ──────────────────────────────────────────────────

/** Server roles are a superset of the legacy client union. */
const KNOWN_ROLES: readonly UserRole[] = ['user', 'vip', 'admin', 'senior_admin', 'super_admin', 'founder', 'developer', 'subscription_admin', 'support_admin'];

export function toUserRole(role: string): UserRole {
  return (KNOWN_ROLES as readonly string[]).includes(role) ? (role as UserRole) : 'user';
}

/** Best-effort profile patch; only the fields the API allows are sent. */
export async function updateProfile(patch: { display_name?: string; language?: string }): Promise<void> {
  await authRequest<unknown>('/api/me', { method: 'PATCH', body: JSON.stringify(patch) });
}

export function roleToIsAdmin(role: string): boolean {
  return role !== 'user' && role !== 'vip';
}

/**
 * Maps the authoritative GET /api/me payload onto the store's UserProfile shape,
 * so the 339 `useAuthStore` consumers keep receiving the fields they expect.
 * Fields the server does not own yet (referrals, view state) get safe defaults.
 */
export function mapServerUserToProfile(user: ServerUser): UserProfile {
  const displayName = user.display_name || user.email.split('@')[0];
  const role = toUserRole(user.role);
  return {
    id: user.id,
    email: user.email,
    displayName,
    avatarSeed: displayName,
    plan: user.plan,
    planExpiry: user.plan_expires_at ?? undefined,
    // Referral data is not server-owned yet (Phase 1); a stable, non-secret
    // placeholder keeps referral UIs renderable instead of blank.
    referralCode: `CV${user.id.replace(/\D/g, '').slice(0, 6) || user.id.slice(0, 6).toUpperCase()}`,
    referralCount: 0,
    referralBonus: 0,
    language: user.language || 'en',
    isFirstLogin: user.onboarding?.first_login_completed !== true,
    joinedAt: user.created_at ?? new Date().toISOString(),
    role,
    isAdmin: roleToIsAdmin(user.role),
    isDeveloper: user.role === 'developer',
    virtualBalance: Number(user.balance || 0),
  };
}
