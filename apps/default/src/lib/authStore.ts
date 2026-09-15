
import { create } from 'zustand';
import { recordLogin } from './loginHistoryStore';
import { refreshAdminCacheFromDb } from './userMigrationService';
import { createSession, destroySession, loadAuthSession } from './security/sessionManager';
import { cloudRecordStore } from './cloudData';
import { findUserByEmail, invalidateUserRosterCache, type UserRecord } from './authApi';
import { fetchMe, isUnauthenticated, mapServerUserToProfile, signOut, toUserRole, updateProfile as updateProfileOnServer, type ServerUser } from './betterAuthClient';
import { trackProductEventInBackground, trackProductEventOnce } from './productAnalytics';

// ── Passwords are gone (Phase 0.5 · Batch C) ────────────────────────────────
// Identity is Better Auth on the Render API: email OTP in, HttpOnly session
// cookie out. There is no client-side hashing or password-verification path left
// in this store, so ./passwordHash is no longer imported here (the module itself
// is deleted in Batch D).

// ── Role System ───────────────────────────────────────────────────────────────
export type UserRole = 'user' | 'vip' | 'admin' | 'senior_admin' | 'super_admin' | 'founder' | 'developer' | 'subscription_admin' | 'support_admin';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  avatarSeed: string;
  avatarUrl?: string;       // uploaded photo base64
  country?: string;
  gender?: 'male' | 'female' | 'other' | 'prefer_not';
  age?: number;
  bio?: string;
  twitterHandle?: string;
  linkedinUrl?: string;
  plan: 'free' | 'pro' | 'pro_plus';
  planExpiry?: string;
  referralCode: string;
  referralCount: number;
  referralBonus: number;    // virtual USD earned from referrals
  language: string;
  isFirstLogin: boolean;
  joinedAt: string;
  // Role-based access control
  role: UserRole;
  // Legacy compat — derived from role
  isAdmin: boolean;
  isDeveloper?: boolean;   // Developer flag for super admins
  adminRequestStatus?: 'idle' | 'pending' | 'approved' | 'rejected';
  adminRejectReason?: string;
  adminRequestAttempts?: number; // max 3 attempts
  adminSection?: string;         // e.g. 'trade', 'academy' — section this admin manages
  virtualBalance: number;   // extra purchased virtual balance
}

// ─────────────────────────────────────────────────────────────────────────────
// USER VIEW MODE  ("View as User" — §New Feature 2)
//
// Lets a Super Admin or section-scoped Admin see the app exactly as a given
// user would, without the target user ever being notified (no email, no
// in-app notification, no visible session on their end — this only swaps
// what THIS browser tab renders). While active the app is read-only: no
// mutating action should be enabled — components can check
// `useAuthStore(s => s.viewState.isViewing)` before rendering an
// edit/delete/create control.
// ─────────────────────────────────────────────────────────────────────────────

export interface ViewState {
  isViewing:    boolean;
  targetUser:   string | null;   // email of the user being viewed
  originalUser: string | null;   // email of the admin who started the view
  /** Snapshot of the admin's own role/sections, kept for the exit-back flow
   *  and so the UI can scope what the ADMIN could see even in view mode. */
  originalRole: UserRole | null;
  startedAt:    string | null;
}

const VIEW_STATE_KEY = 'cryptoverse_user_view_state';
const ACCESS_LOG_KEY = 'cryptoverse_user_view_access_log';

function loadViewState(): ViewState {
  try {
    return JSON.parse(sessionStorage.getItem(VIEW_STATE_KEY) || 'null') ?? {
      isViewing: false, targetUser: null, originalUser: null, originalRole: null, startedAt: null,
    };
  } catch {
    return { isViewing: false, targetUser: null, originalUser: null, originalRole: null, startedAt: null };
  }
}
function saveViewState(v: ViewState) {
  sessionStorage.setItem(VIEW_STATE_KEY, JSON.stringify(v));
}

/** Additional idea §1 — Access Log: who looked at whose account, and when. Admin-only. */
export interface UserViewLogEntry {
  id:         string;
  adminEmail: string;
  targetEmail: string;
  startedAt:  string;
  endedAt:    string | null;
}
/**
 * Convenience hook for any component with mutating controls (edit / delete /
 * save / create buttons). While a User View session is active every such
 * control should be disabled or hidden:
 *
 *   const readOnly = useIsUserViewReadOnly();
 *   <button disabled={readOnly} onClick={...}>Delete</button>
 */
export function useIsUserViewReadOnly(): boolean {
  return useAuthStore(s => s.viewState.isViewing);
}

export function getUserViewAccessLog(): UserViewLogEntry[] {
  try { return JSON.parse(localStorage.getItem(ACCESS_LOG_KEY) || '[]'); } catch { return []; }
}
function pushViewAccessLog(entry: UserViewLogEntry) {
  const log = [entry, ...getUserViewAccessLog()].slice(0, 200);
  localStorage.setItem(ACCESS_LOG_KEY, JSON.stringify(log));
}
function closeLatestOpenLogEntry(adminEmail: string, targetEmail: string) {
  const log = getUserViewAccessLog();
  const idx = log.findIndex(e => e.adminEmail === adminEmail && e.targetEmail === targetEmail && !e.endedAt);
  if (idx >= 0) {
    log[idx] = { ...log[idx], endedAt: new Date().toISOString() };
    localStorage.setItem(ACCESS_LOG_KEY, JSON.stringify(log));
  }
}

interface AuthState {
  user: UserProfile | null;
  isAuthenticated: boolean;

  // Computed helpers
  isAdmin: boolean;
  isSuperAdmin: boolean;

  // "View as User" mode
  viewState: ViewState;
  startUserView: (targetEmail: string) => { success: boolean; error?: string };
  endUserView:   () => void;

  // Auth actions — Better Auth owns the session and every sign-in is an email OTP
  // handled by ./betterAuthClient. `login` / `register` were removed in Batch C:
  // with no password there is nothing to verify and no account to provision here.
  logout:             () => Promise<void>;

  // Profile updates
  updateProfile: (partial: Partial<UserProfile>) => void;

  // Referral
  applyReferral: (code: string) => void;

  // `requestAdmin` removed in Batch C — admin applications are handled server-side;
  // the mirrored `adminRequestStatus` fields on UserProfile are still carried.

  // Role management — server-enforced (requireAdminWrite on the API); the client
  // no longer decides who is allowed to change a role.
  setUserRole: (targetEmail: string, newRole: UserRole) => Promise<{ success: boolean; error?: string }>;

  // Get all users from the local mirror (the server roster lands here in Batch C2)
  getAllUsers: () => Array<{ email: string; profile: UserProfile }>;

  // Virtual currency purchase
  addVirtualBalance: (amount: number) => void;

  // Dismiss first-login guide
  dismissFirstLogin: () => void;

  // `resetPassword` removed in Batch C — a passwordless account has nothing to reset.

  // New: log in directly from an external auth session (used by new auth pages)
  loginFromSession: (params: { id: string; email: string; fullName: string; role: UserRole }) => Promise<void>;

  // Refresh the current user's role from the server (GET /api/me — reactive role sync)
  refreshRole: () => Promise<void>;

  // Subscription management
  updateSubscription: (planId: string) => void;

  // ── Server-verified session (Phase 0.5 · Batch B) ─────────────────────────
  /** Applies a GET /api/me payload as the active session (server-authoritative). */
  applyServerUser: (serverUser: ServerUser) => Promise<void>;
  /** Re-verifies against the server; a 401 clears the local session (no navigation). */
  refreshFromServer: () => Promise<boolean>;
}

function makeReferralCode(name: string) {
  return `${name.replace(/\s/g, '').toUpperCase().slice(0, 6)}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

// ── Cross-device data hydration ───────────────────────────────────────────────
// Pulls this user's Academy progress, trading/bots/copy-trading/marketplace/
// CP-coin data, and saved language preference from the shared DB, and wires
// up ongoing background sync of local changes back to it.
//
// BUG FIX: this was previously only called from login() and loginFromSession()
// — loginWithGoogle(), loginWithApple(), and loginWithBiometric() never called
// it at all. Any account that signs in on one device via email/password but
// on another via Google/Apple/biometric (a very common mobile pattern) would
// never pull or push data on that second device, which is the root cause of
// "purchases made on the computer don't show up on the phone" when the two
// devices use different login methods.
function hydrateUserData(email: string): void {
  if (!email) return;
  // Enterprise Cloud Sync — Taskade Cloud becomes Source of Truth (Sprint 6.6.2)
  import('./cloudData').then(({ cloudDataLayer, DEFAULT_CACHE_POLICIES }) => {
    cloudDataLayer.hydrate(email, DEFAULT_CACHE_POLICIES).then(result => {
      console.log(`[CloudSync] Login hydration: ${result.objects} objects`);
      return cloudDataLayer.sync();
    }).catch(() => {});
  });
  import('./academyStore').then(({ useAcademyStore }) => {
    useAcademyStore.getState().hydrate(email).catch(() => {});
  });
  import('./tradingMigrationService').then(({ onTradingLogin }) => {
    onTradingLogin(email).catch(() => {});
  });
  import('./i18nStore').then(({ hydrateLang }) => {
    hydrateLang(email).catch(() => {});
  });
  import('./universalMemory').then(({ universalMemory }) => {
    universalMemory.hydrateUser(email).catch(() => {});
  });
}

// ── Storage ───────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'cryptoverse_users';
const SESSION_KEY = 'cryptoverse_session';

function getUsers(): Record<string, { password: string; profile: UserProfile }> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}
function saveUsers(u: Record<string, { password: string; profile: UserProfile }>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
}
function getSession(): UserProfile | null {
  try {
    const authSession = loadAuthSession();
    const raw = localStorage.getItem(SESSION_KEY);
    const cached = raw ? JSON.parse(raw) as Partial<UserProfile> : null;
    const email = authSession?.email ?? cached?.email;
    if (!email) return null;
    return {
      id: authSession?.email ?? cached?.id ?? '',
      email,
      displayName: cached?.displayName ?? email.split('@')[0],
      avatarSeed: cached?.avatarSeed ?? email.split('@')[0],
      plan: cached?.plan ?? 'free',
      planExpiry: cached?.planExpiry,
      referralCode: cached?.referralCode ?? '',
      referralCount: cached?.referralCount ?? 0,
      referralBonus: cached?.referralBonus ?? 0,
      language: cached?.language ?? 'en',
      isFirstLogin: cached?.isFirstLogin ?? false,
      joinedAt: cached?.joinedAt ?? new Date().toISOString(),
      role: cached?.role ?? 'user',
      isAdmin: cached?.isAdmin ?? roleToIsAdmin(cached?.role ?? 'user'),
      virtualBalance: cached?.virtualBalance ?? 0,
    };
  } catch { return null; }
}
function saveSession(p: UserProfile | null) {
  if (p) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      ...p,
      role: p.role,
      isAdmin: roleToIsAdmin(p.role),
    }));
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
}

function profileFromServer(record: UserRecord, previous?: UserProfile | null): UserProfile {
  const base = previous ?? {
    id: record.nodeId,
    email: record.email,
    displayName: record.fullName || record.email.split('@')[0],
    avatarSeed: (record.fullName || record.email).split(' ')[0],
    plan: 'free' as const,
    referralCode: makeReferralCode(record.fullName || record.email),
    referralCount: 0,
    referralBonus: 0,
    language: 'en',
    isFirstLogin: false,
    joinedAt: record.createdAt || new Date().toISOString(),
    role: 'user' as UserRole,
    isAdmin: false,
    virtualBalance: 0,
  };
  return migrateProfile({
    ...base,
    id: record.nodeId,
    email: record.email,
    displayName: record.fullName || base.displayName,
    role: record.role as UserRole,
    isAdmin: roleToIsAdmin(record.role as UserRole),
    isDeveloper: record.role === 'developer',
    joinedAt: record.createdAt || base.joinedAt,
  });
}

// ── Admin account management ──────────────────────────────────────────────────
// Super Admin accounts are created and managed exclusively through the Admin
// Portal (Admin Dashboard → Admins page) or via the standalone Admin Login
// flow (adminAuthStore.ts). No account credentials are hardcoded in source.
// Extension point: a one-time setup script or environment-variable-driven
// initial Super Admin seed can be added here if needed for new deployments.

// Warm the admin cache only when an authenticated session exists. Public auth
// pages must not fetch the full users roster before registration or login.
if (loadAuthSession()?.email) {
  refreshAdminCacheFromDb().catch(() => {});
}

// ── Role helpers ──────────────────────────────────────────────────────────────
function roleToIsAdmin(role: UserRole): boolean {
  return role === 'admin' || role === 'senior_admin' || role === 'super_admin' || role === 'founder' || role === 'developer'
    || role === 'subscription_admin' || role === 'support_admin';
}

function migrateProfile(profile: UserProfile): UserProfile {
  // Migrate legacy isAdmin boolean to role field
  if (!profile.role) {
    profile.role    = profile.isAdmin ? 'admin' : 'user';
    profile.isAdmin = roleToIsAdmin(profile.role);
  }
  // Defensive: if isAdmin is true but role is still 'user', upgrade to 'admin'
  if (profile.isAdmin && profile.role === 'user') {
    profile.role = 'admin';
  }
  // Defensive: restore isDeveloper for known super admins
  if (profile.role === 'super_admin' && profile.isDeveloper === undefined) {
    profile.isDeveloper = true;
  }
  return profile;
}

// ── Store ─────────────────────────────────────────────────────────────────────
const session = getSession();
const migratedSession = session ? migrateProfile(session) : null;

// If a "View as User" session is still active in this tab (sessionStorage),
// render the target user's profile instead of the admin's on initial load.
const initialViewState = loadViewState();
let initialUser = migratedSession;
if (initialViewState.isViewing && initialViewState.targetUser) {
  const targetEntry = getUsers()[initialViewState.targetUser];
  if (targetEntry) initialUser = migrateProfile({ ...targetEntry.profile });
}

// Task 49: on a fresh page load with an already-active session, pull this
// user's Academy XP/lesson progress from the DB too (login()/loginFromSession()
// only cover the moment of signing in — a plain refresh needs this as well).
if (initialUser?.email) {
  import('./academyStore').then(({ useAcademyStore }) => {
    useAcademyStore.getState().hydrate(initialUser!.email).catch(() => {});
  });
  // Priority 5: same treatment for trading/bots/copy-trading/marketplace/CP-coins.
  import('./tradingMigrationService').then(({ onTradingLogin }) => {
    onTradingLogin(initialUser!.email).catch(() => {});
  });
  // Pull this user's saved language preference from the DB too, so a plain
  // refresh (not just a fresh login) picks up a language chosen elsewhere.
  import('./i18nStore').then(({ hydrateLang }) => {
    hydrateLang(initialUser!.email).catch(() => {});
  });
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user:            initialUser,
  isAuthenticated: !!migratedSession,
  isAdmin:         !!initialUser && roleToIsAdmin(initialUser.role),
  isSuperAdmin:    initialUser?.role === 'super_admin',
  viewState:       initialViewState,

  // ── "View as User" (§New Feature 2) ───────────────────────────────────────
  startUserView: (targetEmail) => {
    const admin = get().user;
    if (!admin) return { success: false, error: 'Not logged in.' };
    if (!roleToIsAdmin(admin.role)) return { success: false, error: 'Only Admins and Super Admins can use User View.' };

    const users  = getUsers();
    const key    = targetEmail.toLowerCase().trim();
    const target = users[key];
    if (!target) return { success: false, error: 'User not found.' };

    const viewState: ViewState = {
      isViewing:    true,
      targetUser:   key,
      originalUser: admin.email,
      originalRole: admin.role,
      startedAt:    new Date().toISOString(),
    };
    saveViewState(viewState);
    // Access log (idea §1) — visible only to admins, never surfaced to the user.
    pushViewAccessLog({
      id:          `uv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      adminEmail:  admin.email,
      targetEmail: key,
      startedAt:   viewState.startedAt!,
      endedAt:     null,
    });

    // Swap the rendered `user` to the target's profile WITHOUT touching the
    // persisted session (`cryptoverse_session` / users store), so nothing is
    // written on the target user's account and no notification is possible.
    set({ user: migrateProfile({ ...target.profile }), viewState });
    return { success: true };
  },

  endUserView: () => {
    const { viewState } = get();
    if (!viewState.isViewing || !viewState.originalUser) return;

    closeLatestOpenLogEntry(viewState.originalUser, viewState.targetUser ?? '');

    const users     = getUsers();
    const adminKey  = viewState.originalUser.toLowerCase();
    const restored  = users[adminKey]?.profile ?? getSession();

    const cleared: ViewState = { isViewing: false, targetUser: null, originalUser: null, originalRole: null, startedAt: null };
    saveViewState(cleared);

    set({
      user:         restored ? migrateProfile({ ...restored }) : null,
      viewState:    cleared,
      isAdmin:      restored ? roleToIsAdmin(restored.role) : false,
      isSuperAdmin: restored?.role === 'super_admin',
    });
  },

  // `login(email, password)` was removed in Batch C. Password authentication no
  // longer exists anywhere: sign-in is sendSignInOtp() → signInWithOtp() against
  // Better Auth, then applyServerUser() with the GET /api/me payload.

  // `register(email, password, displayName)` was removed in Batch C. Better Auth
  // creates the account on the first successful OTP verification (sendSignInOtp
  // with type: 'sign-in'), so there is no client-side provisioning path left.

  // loginWithGoogle / loginWithApple / loginWithBiometric were removed.
  // They minted sessions from any caller-supplied email with no real OIDC / WebAuthn
  // verification — a client-side authentication bypass. Sign-in is an email OTP
  // verified by Better Auth, and nothing else.

  logout: async () => {
    // Better Auth owns the session, so revoke it server-side first (the response
    // clears the HttpOnly cookie) instead of only forgetting it locally. Bounded by
    // a 3s race: a slow or unreachable API must never be able to trap the user in
    // the app, and signOut() already swallows non-fatal failures itself.
    try {
      await Promise.race([
        signOut(),
        new Promise<void>(resolve => setTimeout(resolve, 3000)),
      ]);
    } catch { /* local sign-out still proceeds */ }
    destroySession();
    saveSession(null);
    // Also clear sessionStorage for any legacy entries
    try { sessionStorage.removeItem('cryptoverse_session'); } catch { /* ignore */ }
    try { sessionStorage.removeItem(VIEW_STATE_KEY); } catch { /* ignore */ }
    // Clear all session-scoped state fully
    set({ user: null, isAuthenticated: false, isAdmin: false, isSuperAdmin: false,
      viewState: { isViewing: false, targetUser: null, originalUser: null, originalRole: null, startedAt: null } });
    // Hard navigate to /dashboard — ensures the BrowserRouter isn't stuck on a deep
    // route and the auth guard re-evaluates against the now-empty session.
    window.location.replace('/dashboard');
  },

  updateProfile: (partial) => {
    const user = get().user;
    if (!user) return;
    const updated = migrateProfile({ ...user, ...partial });
    cloudRecordStore.set('auth_profile', user.email.toLowerCase(), updated);
    // Server-owned fields go to PATCH /api/me over the Better Auth session cookie.
    // The Taskade roster (authApi.updateUserProfile) is no longer the profile
    // source, and the local write below stays optimistic — the server's answer is
    // re-read on the next refreshFromServer()/applyServerUser().
    const patch: { display_name?: string; language?: string } = {};
    if (partial.displayName !== undefined) patch.display_name = partial.displayName;
    if (partial.language    !== undefined) patch.language    = partial.language;
    if (Object.keys(patch).length > 0) {
      void updateProfileOnServer(patch).catch(error => {
        console.warn('[authStore] Profile update was not accepted by the server:', error);
      });
    }
    saveSession(updated);
    set({
      user:         updated,
      isAdmin:      roleToIsAdmin(updated.role),
      isSuperAdmin: updated.role === 'super_admin',
    });
  },

  // ── Server-verified session (Phase 0.5 · Batch B) ──────────────────────────
  /**
   * Applies a GET /api/me payload as the active session.
   *
   * Better Auth owns the session (HttpOnly cookie); this action only mirrors the
   * authoritative profile into the store so the existing consumers keep working
   * unchanged. Server-owned fields (id, email, plan, role, level, xp, balance)
   * win; fields the server has no opinion on yet (avatar, bio, referral counters,
   * admin-request state) are preserved from the previous profile.
   */
  applyServerUser: async (serverUser) => {
    const email = serverUser.email.toLowerCase().trim();
    const previous = (get().user?.email?.toLowerCase() === email ? get().user : null)
      ?? getUsers()[email]?.profile
      ?? null;
    const mapped = mapServerUserToProfile(serverUser);
    const role   = toUserRole(serverUser.role);

    const profile = migrateProfile({
      ...(previous ?? mapped),
      id:             serverUser.id,
      email,
      displayName:    serverUser.display_name || previous?.displayName || mapped.displayName,
      avatarSeed:     previous?.avatarSeed ?? mapped.avatarSeed,
      plan:           serverUser.plan,
      planExpiry:     serverUser.plan_expires_at ?? undefined,
      role,
      isAdmin:        roleToIsAdmin(role),
      isDeveloper:    serverUser.role === 'developer',
      language:       serverUser.language || previous?.language || 'en',
      isFirstLogin:   serverUser.onboarding?.first_login_completed !== true,
      joinedAt:       serverUser.created_at ?? previous?.joinedAt ?? mapped.joinedAt,
      virtualBalance: Number(serverUser.balance || 0),
    });

    // Legacy local session mirror — removed in Batch C/D, when boot moves to the
    // Better Auth cookie. Kept here so a refresh between batches still restores.
    createSession(profile.email);
    saveSession(profile);

    set({
      user:            profile,
      isAuthenticated: true,
      isAdmin:         roleToIsAdmin(profile.role),
      isSuperAdmin:    profile.role === 'super_admin',
    });

    recordLogin({ userId: profile.id, method: 'email' });
    hydrateUserData(profile.email);
  },

  /**
   * Re-verifies the session against the server. A 401 means it was revoked or
   * expired (single-session policy, admin revoke, ban) — the local session is
   * cleared WITHOUT navigating, so the router guard can react on its own terms.
   * Returns true when the server still recognises the session.
   */
  refreshFromServer: async () => {
    try {
      const me = await fetchMe();
      await get().applyServerUser(me.user);
      return true;
    } catch (error) {
      if (isUnauthenticated(error)) {
        try { destroySession(); } catch { /* ignore */ }
        saveSession(null);
        try { sessionStorage.removeItem('cryptoverse_session'); } catch { /* ignore */ }
        set({ user: null, isAuthenticated: false, isAdmin: false, isSuperAdmin: false });
      }
      return false;
    }
  },

  applyReferral: (code) => {
    const user = get().user;
    if (!user) return;
    const users = getUsers();
    for (const [, entry] of Object.entries(users)) {
      if (entry.profile.referralCode === code && entry.profile.id !== user.id) {
        entry.profile.referralCount += 1;
        entry.profile.referralBonus += 10000;
        saveUsers(users);
        break;
      }
    }
  },

  // `requestAdmin` was removed in Batch C. It granted the `admin` role from local
  // numbers (a simulated trading balance and the join date) — a client-side
  // privilege escalation. Admin status is only ever set by the server through
  // POST /api/admin/users/:userId/role.

  /**
   * Change a user's role on the SERVER (Phase 0.5 · Batch C).
   *
   * The Taskade roster (authApi.updateUserRole) is no longer a write path: the
   * only way a role changes is POST /api/admin/users/:userId/role, which validates
   * the role against the server allowlist, refuses to demote the last developer,
   * bumps users.updated_at and writes an audit-log row. The client keeps no
   * authority over roles at all — the old `super_admin`-only guard here was a UI
   * check that the server now enforces properly via requireAdminWrite.
   *
   * The signature stays (email, newRole) because AdminAdmins.tsx and
   * AdminRoleManagement.tsx already call it that way, and the former calls it
   * fire-and-forget — so this must never reject.
   */
  setUserRole: async (targetEmail, newRole) => {
    const key = targetEmail.toLowerCase().trim();
    if (!get().user) return { success: false, error: 'Not logged in.' };
    try {
      const { apiGet, apiPost } = await import('./adminApi');

      // The write endpoint is keyed by user id, but callers pass an email, so walk
      // the admin roster (the server pages it 100 at a time) to resolve the id.
      let targetId: string | null = null;
      let offset = 0;
      for (let page = 0; page < 10 && targetId === null; page++) {
        const roster = await apiGet<{
          users?: Array<{ id: string; email: string }>;
          total?: number;
        }>(`/api/admin/users?limit=100&offset=${offset}`);
        const rows = roster?.users ?? [];
        const match = rows.find(u => (u.email || '').toLowerCase() === key);
        if (match) { targetId = match.id; break; }
        if (rows.length === 0 || offset + rows.length >= (roster?.total ?? 0)) break;
        offset += rows.length;
      }
      if (!targetId) return { success: false, error: 'No account with that email exists on the server.' };

      await apiPost(`/api/admin/users/${encodeURIComponent(targetId)}/role`, { role: newRole });

      // Mirror the server's answer locally so the local roster doesn't drift.
      const users = getUsers();
      if (users[key]) {
        users[key].profile = migrateProfile({ ...users[key].profile, role: newRole, isAdmin: roleToIsAdmin(newRole) });
        saveUsers(users);
      }
      if (key === get().user?.email?.toLowerCase()) await get().refreshFromServer();
      return { success: true };
    } catch (error) {
      if ((error as { name?: string })?.name === 'ApiForbiddenError') {
        return { success: false, error: 'Your admin role does not allow changing roles.' };
      }
      return { success: false, error: error instanceof Error ? error.message : 'Unable to change the role.' };
    }
  },

  getAllUsers: () => {
    const users = getUsers();
    return Object.entries(users).map(([email, { profile }]) => ({ email, profile }));
  },

  addVirtualBalance: (amount) => {
    const user = get().user;
    if (!user) return;
    get().updateProfile({ virtualBalance: (user.virtualBalance || 0) + amount });
  },

  dismissFirstLogin: () => {
    get().updateProfile({ isFirstLogin: false });
  },

  // ── Subscription management ───────────────────────────────────────────
  updateSubscription: (planId) => {
    const user = get().user;
    if (!user) return;
    const planExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    get().updateProfile({
      plan: planId as 'free' | 'pro' | 'pro_plus',
      planExpiry,
    });
  },

  loginFromSession: async ({ email }) => {
    try {
      const record = await findUserByEmail(email.toLowerCase().trim());
      if (!record || record.status !== 'active') return;
      const profile = profileFromServer(record, get().user?.email === record.email ? get().user : null);
      createSession(record.email);
      saveSession(profile);
      set({ user: profile, isAuthenticated: true, isAdmin: roleToIsAdmin(profile.role), isSuperAdmin: profile.role === 'super_admin' });
      recordLogin({ userId: profile.id, method: 'email' });
      hydrateUserData(profile.email);
    } catch {
      console.warn('[authStore] Server session hydration failed.');
    }
  },

  refreshRole: async () => {
    // Phase 0.5 · Batch C: the server is the only role authority. GET /api/me
    // carries the role, and refreshFromServer() additionally drops a session the
    // server has revoked (401) instead of trusting the cached profile.
    if (!get().user) return;
    await get().refreshFromServer();
  },

  // `resetPassword` was removed in Batch C: a passwordless account has nothing to
  // reset, and `updatePassword`/`hashPassword` no longer exist in this store.
}));


async function hydrateCurrentUserFromServer(): Promise<void> {
  const cachedUser = useAuthStore.getState().user;
  if (!cachedUser?.email) return;
  try {
    let record = await findUserByEmail(cachedUser.email);
    if (!record) {
      // "Not found" is about to sign this user out, so confirm it against a
      // fresh read first: a stale or partial roster cache must never be able to
      // end a valid session (this runs on every full page load, so an ambiguous
      // miss here would log everyone out on refresh).
      invalidateUserRosterCache();
      record = await findUserByEmail(cachedUser.email);
    }
    if (!record || record.status !== 'active') {
      destroySession();
      saveSession(null);
      useAuthStore.setState({ user: null, isAuthenticated: false, isAdmin: false, isSuperAdmin: false });
      return;
    }
    const profile = profileFromServer(record, cachedUser);
    saveSession(profile);
    useAuthStore.setState({ user: profile, isAuthenticated: true, isAdmin: roleToIsAdmin(profile.role), isSuperAdmin: profile.role === 'super_admin' });
    hydrateUserData(profile.email);
  } catch {
    console.warn('[authStore] Server hydration unavailable; retaining the cached session until retry.');
  }
}

void hydrateCurrentUserFromServer();

