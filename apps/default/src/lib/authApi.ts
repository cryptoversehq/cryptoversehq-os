/**
 * authApi.ts — CryptoVerse HQ Authentication API
 *
 * All auth operations backed by the Taskade Users project.
 * Project ID: 3dMq65zUi1A7ayiC
 *
 * Field mapping:
 *   /text                → email (node title)
 *   /attributes/@cv_email   → email
 *   /attributes/@cv_phash   → passwordHash (SHA-256 hex)
 *   /attributes/@cv_fname   → fullName
 *   /attributes/@cv_role    → role (select: role_user / role_admin / role_super_admin)
 *   /attributes/@cv_verified → emailVerified (select: ev_false / ev_true)
 *   /attributes/@cv_cat     → createdAt (ISO datetime)
 *   /attributes/@cv_otp     → otpCode
 *   /attributes/@cv_otpexp  → otpExpiresAt (ISO string)
 *   /attributes/@cv_status  → status ('active' | 'suspended' | 'banned' — plain text, default 'active')
 *   /attributes/@cv_sections → sections (JSON-stringified string[] of AdminSectionId, default '[]')
 *
 * @cv_status / @cv_sections are plain text attributes (not Select fields), so
 * no pre-registered option IDs are required to write them — same pattern as
 * @cv_otp. This lets Priority-1 admin data (super-admin/ban/suspend/section
 * permissions) live on the same user node as everything else.
 */

import { cloudDataLayer } from './cloudData';
import { hashPassword as hashPasswordPbkdf2, verifyPassword as verifyPasswordPbkdf2 } from './passwordHash';

const USERS_PROJECT = '3dMq65zUi1A7ayiC';
const USERS_API     = `/api/taskade/projects/${USERS_PROJECT}/nodes`;
// Taskade Flow that actually sends the OTP email (Gmail). Invoked server-side
// via cloudDataLayer.invokeWebhook → /api/taskade/webhooks/{id}/run.
const SEND_OTP_FLOW_ID = '01KJE0M3TJC8FJSZM6DJ2JPFRY';

// ─── Types ────────────────────────────────────────────────────────────────────

export type UserStatus = 'active' | 'suspended' | 'banned';

export type AuthRole = 'user' | 'vip' | 'admin' | 'senior_admin' | 'super_admin' | 'founder' | 'developer';

export interface UserRecord {
  nodeId: string;
  email: string;
  passwordHash: string;
  fullName: string;
  role: AuthRole;
  emailVerified: boolean;
  createdAt: string;
  otpCode: string;
  otpExpiresAt: string;
  /** Priority-1 admin data — account status (default 'active' when unset) */
  status: UserStatus;
  /** Priority-1 admin data — section-scoped admin permissions (AdminSectionId[]) */
  sections: string[];
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: AuthRole;
}

// ─── Password hashing (PBKDF2-SHA256) ────────────────────────────────────────

export async function hashPassword(text: string): Promise<string> {
  return hashPasswordPbkdf2(text);
}

export async function verifyPassword(text: string, storedHash: string): Promise<boolean> {
  return verifyPasswordPbkdf2(text, storedHash);
}

// Backward-compatible alias — legacy callers that still import `sha256` get the
// new PBKDF2 scheme (salt + 100k iterations), not a single SHA-256 digest.
export const sha256 = hashPassword;

// ─── OTP generator ───────────────────────────────────────────────────────────

export function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ─── Raw API helpers ──────────────────────────────────────────────────────────

async function apiGet(_url: string) {
  return { payload: { nodes: await cloudDataLayer.projectNodes(USERS_PROJECT) } };
}

async function apiPost(_url: string, body: object): Promise<any> {
  return cloudDataLayer.createProjectNode(USERS_PROJECT, body as Record<string, unknown>);
}

async function apiPatch(url: string, body: object) {
  const nodeId = url.split('/').filter(Boolean).pop();
  if (!nodeId || nodeId === 'nodes') throw new Error('Missing user node id');
  return cloudDataLayer.updateProjectNode(USERS_PROJECT, nodeId, body as Record<string, unknown>);
}

async function apiDelete(url: string) {
  const nodeId = url.split('/').filter(Boolean).pop();
  if (!nodeId || nodeId === 'nodes') throw new Error('Missing user node id');
  await cloudDataLayer.deleteProjectNode(USERS_PROJECT, nodeId);
}

// ─── Parse node → UserRecord ──────────────────────────────────────────────────

function parseNode(node: any): UserRecord {
  const f = node.fieldValues ?? {};
  const roleRaw: string = f['/attributes/@cv_role'] ?? 'role_user';
  // IMPORTANT: the Taskade nodes API round-trips Select-type fields
  // inconsistently — writes use the optionId form ('role_super_admin',
  // 'ev_true') but GET has been observed returning the resolved/display
  // form instead ('super_admin', 'true'). A live node for a real
  // super_admin user was found with @cv_role: "super_admin" (not
  // "role_super_admin"), which silently fell through to the 'user'
  // default below and broke super-admin detection on login. Both forms
  // are accepted here so parsing is correct regardless of which one the
  // API happens to return.
  const roleMap: Record<string, AuthRole> = {
    role_user: 'user', role_vip: 'vip', role_admin: 'admin',
    role_senior_admin: 'senior_admin', role_super_admin: 'super_admin', role_founder: 'founder', role_developer: 'developer',
    user: 'user', vip: 'vip', admin: 'admin', senior_admin: 'senior_admin',
    super_admin: 'super_admin', founder: 'founder', developer: 'developer',
  };
  const statusRaw = (f['/attributes/@cv_status'] ?? 'active').trim();
  const status: UserStatus = statusRaw === 'banned' || statusRaw === 'suspended' ? statusRaw : 'active';

  let sections: string[] = [];
  try { sections = JSON.parse(f['/attributes/@cv_sections'] || '[]'); } catch { sections = []; }

  return {
    nodeId:        node.id,
    email:         f['/attributes/@cv_email'] ?? f['/text'] ?? '',
    passwordHash:  f['/attributes/@cv_phash'] ?? '',
    fullName:      f['/attributes/@cv_fname'] ?? '',
    role:          roleMap[roleRaw] ?? 'user',
    // Same read/write asymmetry as @cv_role — accept both 'ev_true' (write
    // form) and 'true' (observed resolved form on read).
    emailVerified: f['/attributes/@cv_verified'] === 'ev_true' || f['/attributes/@cv_verified'] === 'true',
    createdAt:     f['/attributes/@cv_cat'] ?? '',
    otpCode:       f['/attributes/@cv_otp'] ?? '',
    otpExpiresAt:  f['/attributes/@cv_otpexp'] ?? '',
    status,
    sections,
  };
}

// ─── Fetch all users ──────────────────────────────────────────────────────────

async function getAllUsers(): Promise<UserRecord[]> {
  const data = await apiGet(USERS_API);
  const nodes: any[] = data?.payload?.nodes ?? [];
  return nodes.map(parseNode).filter(u => u.email);
}

// ─── Find user by email ───────────────────────────────────────────────────────

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const users = await getAllUsers();
  return users.find(u => u.email.toLowerCase() === email.toLowerCase()) ?? null;
}

// ─── Check if email exists ────────────────────────────────────────────────────

export async function emailExists(email: string): Promise<boolean> {
  const user = await findUserByEmail(email);
  return user !== null;
}

// ─── Create user (pending OTP verification) ───────────────────────────────────

export async function createPendingUser(params: {
  email: string;
  passwordHash: string;
  fullName: string;
  otpCode: string;
  otpExpiresAt: string;
}): Promise<string> {
  const normalizedEmail = params.email.trim().toLowerCase();
  const existingUser = await findUserByEmail(normalizedEmail);
  if (existingUser) {
    console.warn(`[Security] Duplicate signup attempt for email: ${normalizedEmail}`);
    throw new Error('An account with this email already exists. Please login instead.');
  }

  const res = await apiPost(USERS_API, {
    '/text':                    normalizedEmail,
    '/attributes/@cv_email':   normalizedEmail,
    '/attributes/@cv_phash':   params.passwordHash,
    '/attributes/@cv_fname':   params.fullName,
    '/attributes/@cv_role':    'role_user',
    '/attributes/@cv_verified': 'ev_false',
    '/attributes/@cv_cat':     new Date().toISOString(),
    '/attributes/@cv_otp':     params.otpCode,
    '/attributes/@cv_otpexp':  params.otpExpiresAt,
  });
  // Return the new node id
  return res?.payload?.node?.id ?? res?.payload?.id ?? '';
}

// ─── Update OTP on existing user ─────────────────────────────────────────────

export async function updateUserOtp(nodeId: string, otpCode: string, otpExpiresAt: string): Promise<void> {
  await apiPatch(`${USERS_API}/${nodeId}`, {
    '/attributes/@cv_otp':    otpCode,
    '/attributes/@cv_otpexp': otpExpiresAt,
  });
}

// ─── Verify OTP and mark email as verified ────────────────────────────────────

export async function verifyOtp(email: string, code: string): Promise<{ ok: boolean; error?: string; user?: UserRecord }> {
  const user = await findUserByEmail(email);
  if (!user) return { ok: false, error: 'No account found for this email.' };

  const now        = Date.now();
  const expiry     = user.otpExpiresAt ? new Date(user.otpExpiresAt).getTime() : 0;
  const codeMatch  = user.otpCode === code;
  const notExpired = expiry > now;

  if (!codeMatch || !notExpired) {
    return { ok: false, error: 'Code is invalid or expired.' };
  }

  // Mark verified and clear OTP
  await apiPatch(`${USERS_API}/${user.nodeId}`, {
    '/attributes/@cv_verified': 'ev_true',
    '/attributes/@cv_otp':      '',
    '/attributes/@cv_otpexp':   '',
  });

  return { ok: true, user: { ...user, emailVerified: true, otpCode: '', otpExpiresAt: '' } };
}

// ─── Update password hash ─────────────────────────────────────────────────────

export async function updatePassword(nodeId: string, passwordHash: string): Promise<void> {
  await apiPatch(`${USERS_API}/${nodeId}`, {
    '/attributes/@cv_phash':   passwordHash,
    '/attributes/@cv_otp':     '',
    '/attributes/@cv_otpexp':  '',
  });
}

// ─── Send OTP email via automation ───────────────────────────────────────────

export async function sendOtpEmail(params: {
  email: string;
  name: string;
  code: string;
}): Promise<void> {
  // Trigger the "CryptoVerse — Send OTP Email" flow, which sends the code via
  // Gmail. The webhook input schema is { code, name, email }.
  //
  // NOTE: never write a project node here — that was the prior bug, where the
  // webhook URL was passed to apiPost (which ignores the URL and creates a
  // users-project node instead), so no email was ever sent.

  // Dev fallback: surface the OTP locally so signup/login can still be
  // completed when the Gmail flow is not configured or its credential is
  // invalid. Never logged in production.
  const isDev = typeof window !== 'undefined'
    && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  if (isDev) {
    console.log(`🔐 [DEV] OTP for ${params.email}: ${params.code}`);
  }
  console.log(`📧 [authApi] sendOtpEmail → flow ${SEND_OTP_FLOW_ID} for ${isDev ? params.email : '[redacted]'}`);
  console.log(`📤 [DEBUG] Full URL: /api/taskade/webhooks/${SEND_OTP_FLOW_ID}/run`);
  console.log('📤 [DEBUG] Request body:', isDev
    ? { email: params.email, name: params.name, code: params.code }
    : { email: '[redacted]', name: params.name, code: '[redacted]' });

  let response: Record<string, unknown>;
  try {
    response = await cloudDataLayer.invokeWebhook(SEND_OTP_FLOW_ID, {
      email: params.email,
      name: params.name,
      code: params.code,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (isDev) {
      console.error(`❌ [authApi] Send OTP Email flow failed (OTP for recovery: ${params.code}):`, detail);
    } else {
      console.error('[authApi] Send OTP Email flow failed:', detail);
    }

    // Surface a rate-limit-aware message so the user knows to wait, rather than
    // a generic failure. Matches either the HTTP status or the phrase the
    // transport attaches to a 429 response.
    if (/429|Too Many Requests|Rate limit/i.test(detail)) {
      throw new Error('Too many requests have been sent. Please wait a few moments and try again.');
    }

    throw new Error('We could not send your verification code. Please try again.');
  }

  // Capture and validate the flow's response so delivery failures are diagnosable.
  if (isDev) {
    console.log('📤 [authApi] Send OTP Email flow response:', response);
  } else {
    console.info('[authApi] Send OTP Email flow invoked OK');
  }

  // The flow's JsonOutput returns { status: "success" } on success. An explicit
  // non-success status is treated as a delivery failure.
  const flowStatus = (response as any)?.status
    ?? (response as any)?.body?.status
    ?? (response as any)?.payload?.status
    ?? (response as any)?.payload?.body?.status;
  if (flowStatus != null && String(flowStatus).toLowerCase() !== 'success') {
    throw new Error(`Send OTP Email flow reported status "${String(flowStatus)}"`);
  }

  const statusCode = (response as any)?.statusCode;
  if (typeof statusCode === 'number' && (statusCode < 200 || statusCode >= 300)) {
    throw new Error(`Send OTP Email flow returned HTTP ${statusCode}`);
  }
}

// ─── Session storage ──────────────────────────────────────────────────────────

const SESSION_KEY = 'cryptoverse_auth_session';

export interface AuthSession {
  id: string;
  email: string;
  fullName: string;
  role: AuthRole;
  loginAt: string;
}

/**
 * Save session to localStorage with quota error handling
 * Only stores essential data to keep session small
 */
export function saveSession(user: UserRecord): void {
  // Create minimal session object (only essential fields)
  const session: AuthSession = {
    id: user.nodeId,
    email: user.email,
    fullName: user.fullName || user.email.split('@')[0] || 'User',
    role: user.role || 'user',
    loginAt: new Date().toISOString(),
  };

  try {
    const sessionData = JSON.stringify(session);

    // Warn if session is getting too large
    if (sessionData.length > 1024 * 50) { // 50KB warning
      console.warn(`[authApi] Session size (${sessionData.length} bytes) is large. Consider reducing stored data.`);
    }

    localStorage.setItem(SESSION_KEY, sessionData);
  } catch (error) {
    // If quota exceeded, try to recover. DOMException is detected by its `name`
    // property rather than `instanceof` to avoid any cross-realm/global reference.
    const isQuotaError =
      typeof error === 'object' &&
      error !== null &&
      (error as { name?: string }).name === 'QuotaExceededError';
    if (isQuotaError) {
      console.warn('[authApi] Session storage quota exceeded. Clearing old session and retrying...');

      try {
        localStorage.removeItem(SESSION_KEY);
        // Also clear any other large items that might be causing issues
        const keysToCheck = ['cryptoverse_pending_signup', 'cv_lynx_memory', 'cv_short_term_memory_v3'];
        for (const key of keysToCheck) {
          try {
            const item = localStorage.getItem(key);
            if (item && item.length > 1024 * 100) { // >100KB
              console.warn(`[authApi] Found large item "${key}" (${item.length} bytes). Consider clearing.`);
            }
          } catch {}
        }

        // Try saving again
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      } catch (retryError) {
        console.error('[authApi] Session storage still failing after retry:', retryError);
        // Fallback: Store minimal session only
        try {
          const minimalSession = {
            id: user.nodeId,
            email: user.email,
            role: user.role || 'user',
          };
          localStorage.setItem(SESSION_KEY, JSON.stringify(minimalSession));
        } catch (finalError) {
          console.error('[authApi] Critical: Unable to store session. User may need to clear browser storage manually.', { cause: finalError });
        }
      }
    } else {
      console.error('[authApi] Failed to save session:', error);
      throw error;
    }
  }
}

/**
 * Load session from localStorage with error handling
 */
export function loadSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    const session = JSON.parse(raw) as AuthSession;

    // Validate session has required fields
    if (!session.id || !session.email) {
      console.warn('[authApi] Invalid session data found. Clearing...');
      localStorage.removeItem(SESSION_KEY);
      return null;
    }

    return session;
  } catch (error) {
    console.warn('[authApi] Failed to load session:', error);
    return null;
  }
}

/**
 * Clear session from localStorage
 */
export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch (error) {
    console.warn('[authApi] Failed to clear session:', error);
  }
}

/**
 * Check if session storage is available and has space
 */
export function isSessionStorageAvailable(): boolean {
  try {
    const testKey = '__test__';
    const testValue = 'test';
    localStorage.setItem(testKey, testValue);
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

// ─── Update user role (super_admin only) ─────────────────────────────────────

const ROLE_TO_OPTION: Record<AuthRole, string> = {
  user: 'role_user', vip: 'role_vip', admin: 'role_admin',
  senior_admin: 'role_senior_admin', super_admin: 'role_super_admin', founder: 'role_founder', developer: 'role_developer',
};

export async function updateUserRole(
  email: string,
  newRole: AuthRole,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await findUserByEmail(email);
    if (!user) return { ok: false, error: 'User not found.' };
    await apiPatch(`${USERS_API}/${user.nodeId}`, {
      '/attributes/@cv_role': ROLE_TO_OPTION[newRole],
    });
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Failed to update role.' };
  }
}

// ─── Fetch all users from project (admin view) ────────────────────────────────

export async function fetchAllUsers(): Promise<UserRecord[]> {
  const data  = await apiGet(USERS_API);
  const nodes = data?.payload?.nodes ?? [];
  return (nodes as any[]).map(parseNode).filter((u: UserRecord) => u.email);
}

// ─── Update account status (ban / suspend / restore) ──────────────────────────

export async function updateUserStatus(
  email: string,
  status: UserStatus,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await findUserByEmail(email);
    if (!user) return { ok: false, error: 'User not found.' };
    await apiPatch(`${USERS_API}/${user.nodeId}`, {
      '/attributes/@cv_status': status,
    });
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Failed to update status.' };
  }
}

// ─── Update section-scoped admin permissions ──────────────────────────────────

export async function updateUserSections(
  email: string,
  sections: string[],
): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await findUserByEmail(email);
    if (!user) return { ok: false, error: 'User not found.' };
    await apiPatch(`${USERS_API}/${user.nodeId}`, {
      '/attributes/@cv_sections': JSON.stringify(sections),
    });
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Failed to update sections.' };
  }
}

// ─── Direct user creation — used for legacy → DB migration ───────────────────
// Unlike createPendingUser(), this creates an ALREADY-VERIFIED record (the
// account already existed and was working under the old system, so there's
// no need to re-run OTP verification for it).

export async function migrateLegacyUser(params: {
  email: string;
  passwordHash: string;
  fullName: string;
  role: AuthRole;
  status: UserStatus;
  sections: string[];
  createdAt: string;
}): Promise<string> {
  const res = await apiPost(USERS_API, {
    '/text':                    params.email,
    '/attributes/@cv_email':    params.email,
    '/attributes/@cv_phash':    params.passwordHash,
    '/attributes/@cv_fname':    params.fullName,
    '/attributes/@cv_role':     ROLE_TO_OPTION[params.role],
    '/attributes/@cv_verified': 'ev_true',
    '/attributes/@cv_cat':      params.createdAt || new Date().toISOString(),
    '/attributes/@cv_status':   params.status,
    '/attributes/@cv_sections': JSON.stringify(params.sections ?? []),
  });
  return res?.payload?.node?.id ?? res?.payload?.id ?? '';
}

// ─── Delete a user record (admin data-hygiene only — not used in normal flows) ─

export async function deleteUser(email: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await findUserByEmail(email);
    if (!user) return { ok: false, error: 'User not found.' };
    await apiDelete(`${USERS_API}/${user.nodeId}`);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Failed to delete user.' };
  }
}

// ─── Pending signup storage (between /signup → /verify-otp) ──────────────────
// We store the unsaved user data locally until OTP is verified,
// then we create the final user record with emailVerified=true.

const PENDING_KEY = 'cryptoverse_pending_signup';

export interface PendingSignup {
  email: string;
  fullName: string;
  passwordHash: string;
  nodeId: string; // pre-created node in project with ev_false
}

export function savePendingSignup(data: PendingSignup): void {
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(data));
}

export function loadPendingSignup(): PendingSignup | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearPendingSignup(): void {
  sessionStorage.removeItem(PENDING_KEY);
}
