/**
 * adminUsersApi.ts — server-backed admin roster client (Batch C2).
 *
 * WHY: the admin panel used to render the roster, bans, suspensions and
 * super-admins from localStorage mirrors (`cryptoverse_users`,
 * `cryptoverse_banned_users`, `cryptoverse_suspended_users`,
 * `cryptoverse_super_admins`) hydrated from the Taskade users project. Those
 * mirrors drift, any browser can edit them, and for status they were not even
 * the column the API enforces. Everything below reads the Render API instead:
 *
 *   GET  /api/admin/users?limit&offset&email&q  → { users, total, has_more }
 *   GET  /api/admin/users/:id                   → { user, active_subscription, live_sessions }
 *   POST /api/admin/users/:id/role              → { before_role, after_role }
 *   POST /api/admin/users/:id/status            → { before_status, after_status, sessions_revoked }
 *   POST /api/admin/view-as                     → { read_only: true }  (audit row only)
 *
 * Auth is the Better Auth cookie session (adminApi sends credentials).
 * 401/403 → ApiForbiddenError, exactly like adminApi. Not one localStorage read.
 */
import { useEffect, useState } from 'react';
import { apiGet, apiPost } from './adminApi';

export type AdminUserStatus = 'active' | 'suspended' | 'banned';

/** One row of GET /api/admin/users. `status` / `display_name` / `language` are
 *  C2 fields; a pre-C2 server omits them and normalizeAdminUser() fills the gap. */
export interface AdminUserRecord {
  id: string;
  email: string;
  role: string;
  plan: string;
  balance: number | null;
  status: AdminUserStatus;
  display_name: string | null;
  language: string | null;
  last_seen_at: string | null;
  last_seen_ip: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface AdminSubscription {
  id: string;
  plan_id: string;
  status: string;
  starts_at?: string | null;
  ends_at?: string | null;
  granted_by?: string | null;
  created_at?: string | null;
}

export interface AdminUserDetail {
  user: AdminUserRecord;
  active_subscription: AdminSubscription | null;
  live_sessions: number;
}

export interface AdminStatusChange {
  user_id: string;
  email?: string;
  before_status: AdminUserStatus;
  after_status: AdminUserStatus;
  sessions_revoked: number;
}

/** The server clamps `limit` to 100 — ask for exactly that. */
export const ADMIN_USERS_PAGE_SIZE = 100;
/** Safety valve so a runaway roster cannot loop forever. */
const MAX_PAGES = 25;

export function normalizeUserStatus(raw: unknown): AdminUserStatus {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return value === 'banned' || value === 'suspended' ? value : 'active';
}

/** Tolerant row → record (also works against a pre-C2 server). */
export function normalizeAdminUser(raw: Partial<AdminUserRecord>): AdminUserRecord {
  return {
    id: String(raw.id ?? ''),
    email: String(raw.email ?? ''),
    role: typeof raw.role === 'string' && raw.role ? raw.role : 'user',
    plan: typeof raw.plan === 'string' ? raw.plan : '',
    balance: typeof raw.balance === 'number' ? raw.balance : null,
    status: normalizeUserStatus(raw.status),
    display_name: raw.display_name ?? null,
    language: raw.language ?? null,
    last_seen_at: raw.last_seen_at ?? null,
    last_seen_ip: raw.last_seen_ip ?? null,
    created_at: raw.created_at ?? '',
    updated_at: raw.updated_at ?? null,
  };
}

export interface AdminUsersPage {
  users: AdminUserRecord[];
  total: number | null;
  hasMore: boolean;
}

/**
 * One page of the roster. `total` / `hasMore` come from the server when it sends
 * them; a pre-C2 server only sends `users`, so the client falls back to "a full
 * page means there is probably more".
 */
export async function fetchAdminUsersPage(opts: {
  limit?: number; offset?: number; email?: string; q?: string;
} = {}): Promise<AdminUsersPage> {
  const limit = Math.min(Math.max(opts.limit ?? ADMIN_USERS_PAGE_SIZE, 1), ADMIN_USERS_PAGE_SIZE);
  const offset = Math.max(opts.offset ?? 0, 0);

  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  const email = opts.email?.trim();
  const q = opts.q?.trim();
  if (email) params.set('email', email);
  if (q) params.set('q', q);

  const res = await apiGet<
    { users?: Partial<AdminUserRecord>[]; total?: number; has_more?: boolean } | Partial<AdminUserRecord>[]
  >(`/api/admin/users?${params.toString()}`);

  const rawRows = Array.isArray(res) ? res : (Array.isArray(res?.users) ? res.users : []);
  const users = rawRows.map(normalizeAdminUser).filter(u => u.id && u.email);
  const total = !Array.isArray(res) && typeof res?.total === 'number' ? res.total : null;
  const hasMore = !Array.isArray(res) && typeof res?.has_more === 'boolean'
    ? res.has_more
    : total !== null ? offset + users.length < total : users.length >= limit;

  return { users, total, hasMore };
}

/** Every page of the roster — the users page and the audit trail need the whole table. */
export async function fetchAllAdminUsers(): Promise<AdminUserRecord[]> {
  const all: AdminUserRecord[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { users, hasMore } = await fetchAdminUsersPage({ offset: page * ADMIN_USERS_PAGE_SIZE });
    all.push(...users);
    if (!hasMore || users.length === 0) break;
  }
  return all;
}

/**
 * Exact-email lookup for "view as user". Prefers the server filter, but verifies
 * the answer locally and pages through the roster otherwise — a server without
 * `?email=` support would silently answer with the newest page instead.
 */
export async function findAdminUserByEmail(email: string): Promise<AdminUserRecord | null> {
  const wanted = email.trim().toLowerCase();
  if (!wanted) return null;

  const direct = await fetchAdminUsersPage({ email: wanted, limit: 1 });
  const hit = direct.users.find(u => u.email.toLowerCase() === wanted);
  if (hit) return hit;

  for (let page = 0; page < MAX_PAGES; page++) {
    const { users, hasMore } = await fetchAdminUsersPage({ offset: page * ADMIN_USERS_PAGE_SIZE });
    const found = users.find(u => u.email.toLowerCase() === wanted);
    if (found) return found;
    if (!hasMore || users.length === 0) return null;
  }
  return null;
}

/** One account + its active subscription and live-session count. */
export async function fetchAdminUser(userId: string): Promise<AdminUserDetail> {
  const res = await apiGet<{
    user?: Partial<AdminUserRecord>;
    active_subscription?: AdminSubscription | null;
    live_sessions?: number;
  }>(`/api/admin/users/${encodeURIComponent(userId)}`);
  if (!res?.user) throw new Error('The server returned no user record.');
  return {
    user: normalizeAdminUser(res.user),
    active_subscription: res.active_subscription ?? null,
    live_sessions: typeof res.live_sessions === 'number' ? res.live_sessions : 0,
  };
}

/**
 * Change an account's role (Batch C2.5 · Task 2).
 *
 * `POST /api/admin/users/:id/role`, guarded server-side by requireAdminWrite.
 * Used by AdminUsers' role control and by AdminAdmins' "Promote by email" — one
 * code path, one server check, no local role list anywhere.
 */
export async function setAdminUserRole(
  userId: string,
  role: string,
): Promise<{ user_id: string; before_role?: string; after_role: string; duplicate: boolean }> {
  const res = await apiPost<{
    success?: boolean;
    user_id?: string;
    before_role?: string;
    after_role?: string;
    duplicate?: boolean;
  }>(`/api/admin/users/${encodeURIComponent(userId)}/role`, { role });

  return {
    user_id: res?.user_id ?? userId,
    before_role: res?.before_role,
    after_role: res?.after_role ?? role,
    duplicate: res?.duplicate === true,
  };
}

/**
 * Set an account's status. This is the ONLY status that stops a user signing in:
 * authenticate() reads public.users.status, so a ban has to be written here — a
 * localStorage / Taskade-only flag never blocked the API.
 */
export async function setAdminUserStatus(
  userId: string,
  status: AdminUserStatus,
  reason?: string,
): Promise<AdminStatusChange> {
  const res = await apiPost<Partial<AdminStatusChange> & { success?: boolean }>(
    `/api/admin/users/${encodeURIComponent(userId)}/status`,
    { status, ...(reason?.trim() ? { reason: reason.trim() } : {}) },
  );
  return {
    user_id: res?.user_id ?? userId,
    email: res?.email,
    before_status: normalizeUserStatus(res?.before_status),
    after_status: normalizeUserStatus(res?.after_status ?? status),
    sessions_revoked: typeof res?.sessions_revoked === 'number' ? res.sessions_revoked : 0,
  };
}

/**
 * Record that an admin opened "view as user". Purely an audit write: the browser
 * stays signed in as the admin, the target's data is never touched, and nothing
 * is returned that the roster / detail GETs did not already give us.
 */
export async function recordAdminViewAs(userId: string): Promise<void> {
  await apiPost<{ success?: boolean; read_only?: boolean }>('/api/admin/view-as', { target_user_id: userId });
}

/** Roster hook — server data only, with an explicit reload for post-mutation refreshes. */
export function useAdminRoster(): {
  users: AdminUserRecord[];
  loading: boolean;
  error: string | null;
  reload: () => void;
} {
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let canceled = false;
    setLoading(true);
    setError(null);
    fetchAllAdminUsers()
      .then(rows => { if (!canceled) setUsers(rows); })
      .catch((err: unknown) => { if (!canceled) setError((err as Error)?.message ?? 'Failed to load the roster.'); })
      .finally(() => { if (!canceled) setLoading(false); });
    return () => { canceled = true; };
  }, [nonce]);

  return { users, loading, error, reload: () => setNonce(n => n + 1) };
}

