
import { create } from 'zustand';
import { recordLogin } from './loginHistoryStore';
import { cloudRecordStore } from './cloudData';
import { findAdminUserByEmail, type AdminUserRecord } from './adminUsersApi';
import { fetchMe, mapServerUserToProfile, signOut, toUserRole, updateProfile as updateProfileOnServer, type ServerUser } from './betterAuthClient';
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
  /**
   * The last profile the SERVER confirmed (Batch D2). IN-MEMORY ONLY — never
   * written to localStorage, and lost on reload, where the boot check re-fetches
   * it. It exists so an ambiguous read (network failure, 429, 5xx) can keep the
   * last known-good profile instead of signing the user out.
   */
  lastServerProfile: UserProfile | null;
  isAuthenticated: boolean;

  // Computed helpers
  isAdmin: boolean;
  isSuperAdmin: boolean;

  // "View as User" mode — the target is a SERVER record (Batch C2); the email
  // form still type-checks but is refused at runtime with a clear message.
  // `adminIdentity` is the portal's server-verified identity (useAdminIdentity),
  // used when this browser has no app session: without it, an admin who signed in
  // only at /admin/login could not start a view at all.
  viewState: ViewState;
  startUserView: (
    target: AdminUserRecord | string,
    adminIdentity?: { email?: string; role?: string },
  ) => Promise<{ success: boolean; error?: string }>;
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

  // `getAllUsers` removed in Batch D2b2 with the cryptoverse_users mirror it read.
  // The authoritative roster is GET /api/admin/users via adminUsersApi.

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
// ── P0 loop guards ────────────────────────────────────────────────────────────
// applyServerUser() calls hydrateUserData() on every refresh, and a refresh can be
// triggered from several places at once (App boot check, the 60s role interval, a
// visibility change, a cloud stream event). hydrateUserData() in turn pulls every
// store and then runs cloudDataLayer.sync(), so an unthrottled repeat turned ONE
// failing cloud write into the request storm: hydrate → save → 413 → refresh → …
//
// One hydration per account per minute keeps the app current without the
// amplification, and the apply-dedupe collapses bursts of the same account.
let lastHydratedEmail: string | null = null;
let lastHydratedAt = 0;
let lastAppliedEmail: string | null = null;
let lastAppliedAt = 0;
const HYDRATE_MIN_INTERVAL_MS = 60_000;
const APPLY_DEDUPE_WINDOW_MS = 5_000;

function hydrateUserData(email: string): void {
  if (!email) return;
  const hydrateKey = email.toLowerCase();
  if (hydrateKey === lastHydratedEmail && Date.now() - lastHydratedAt < HYDRATE_MIN_INTERVAL_MS) return;
  lastHydratedEmail = hydrateKey;
  lastHydratedAt = Date.now();
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
// Batch D2b3: STORAGE_KEY ('cryptoverse_users') and SESSION_KEY ('cryptoverse_session'),
// together with getUsers/saveUsers/getSession/saveSession, are deleted. The app no longer
// reads OR writes a session or a user roster in the browser: identity comes from the Better
// Auth cookie via GET /api/me, and the roster comes from GET /api/admin/users. App.tsx
// holds a splash until the boot check (refreshFromServer) answers.

// Batch D2c: `profileFromServer(record: UserRecord, …)` is deleted. It mapped the TASKADE
// roster shape (record.nodeId / record.fullName / record.createdAt) onto UserProfile, and
// its last caller was loginFromSession — which now goes through refreshFromServer() →
// GET /api/me → applyServerUser(). Server records are mapped by
// betterAuthClient.mapServerUserToProfile, and admin "view as" records by
// profileFromAdminUserRecord below. This leaves authStore with no Taskade dependency at
// all, which is what makes deleting authApi.ts (D3) safe.

/**
 * Render a SERVER roster record (GET /api/admin/users/:userId — the Batch C2
 * shape) as the app's UserProfile, for "View as User" mode.
 *
 * The record carries only roster fields: no password, no entitlements, no admin
 * powers. Those are never invented here — the viewed account gets the server's
 * own role/plan and neutral values for everything else, so this path can neither
 * grant the admin extra access nor hide their own.
 */
function profileFromAdminUserRecord(record: AdminUserRecord): UserProfile {
  const email       = String(record.email || '').toLowerCase().trim();
  const displayName = record.display_name || email.split('@')[0];
  const role        = (record.role as UserRole) ?? 'user';
  const plan: UserProfile['plan'] =
    record.plan === 'pro_plus' ? 'pro_plus' : record.plan === 'pro' ? 'pro' : 'free';

  return migrateProfile({
    id:             record.id || email,
    email,
    displayName,
    avatarSeed:     displayName.split(' ')[0] || email,
    plan,
    referralCode:   makeReferralCode(displayName),
    referralCount:  0,
    referralBonus:  0,
    language:       record.language ?? 'en',
    isFirstLogin:   false,
    joinedAt:       record.created_at ?? new Date().toISOString(),
    role,
    isAdmin:        roleToIsAdmin(role),
    isDeveloper:    record.role === 'developer',
    virtualBalance: 0,
  });
}

/**
 * Who is the admin right now, for "View as User"?
 *
 * The portal authenticates against the API (Better Auth cookie), and an admin who
 * entered through /admin/login may never have signed into the APP in this browser
 * — so `useAuthStore.user` can be null even though the API answers GET /api/me
 * for them. That is exactly what produced "Not logged in." and blocked view-as.
 *
 * Resolution order (Batch D2b2 — no browser storage anywhere):
 *   1. the caller's SERVER-verified identity (useAdminIdentity → GET /api/me);
 *   2. the last profile the SERVER confirmed this session (`lastServerProfile`, in-memory
 *      only, so absent on a fresh page load);
 *   3. GET /api/me directly — the portal's own authentication.
 */
async function resolveAdminIdentity(hint?: { email?: string; role?: string }): Promise<{ email: string; role: UserRole } | null> {
  const hintedEmail = String(hint?.email || '').trim();
  if (hintedEmail) return { email: hintedEmail, role: ((hint?.role as UserRole) || 'user') };

  // Batch D2b2: the browser-session fallback (cryptoverse_session) is gone. The only
  // local source allowed now is the profile the SERVER last confirmed — in-memory, so
  // null on a fresh page load — and when there is none we ask the API directly below
  // instead of inventing an identity out of browser storage.
  const confirmed = useAuthStore.getState().lastServerProfile;
  if (confirmed?.email) {
    return { email: confirmed.email, role: (confirmed.role as UserRole) ?? 'user' };
  }

  try {
    const me = await fetchMe();
    const email = String(me?.user?.email || '').trim();
    if (!email) return null;
    return { email, role: toUserRole(me.user.role) };
  } catch {
    return null;
  }
}

// ── Admin account management ──────────────────────────────────────────────────
// Super Admin accounts are created and managed exclusively through the Admin
// Portal (Admin Dashboard → Admins page) or via the standalone Admin Login
// flow (adminAuthStore.ts). No account credentials are hardcoded in source.
// Extension point: a one-time setup script or environment-variable-driven
// initial Super Admin seed can be added here if needed for new deployments.

// Batch D2b1: the module-load admin-cache warm is gone. It ran `refreshAdminCacheFromDb()`
// (a Taskade-roster read) whenever a browser session existed — exactly the kind of
// pre-server fetch the boot check replaces. Admin identity now comes from GET /api/me via
// adminApi, and the whole userMigrationService module is deleted in D3.

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
// Batch D2b1: there is NO session read from the browser any more. The server is the
// only authority — App.tsx holds a splash while the boot check (refreshFromServer →
// GET /api/me) answers, and that answer is what populates this store. `getSession()`,
// `migratedSession` and `initialUser` are gone with the cryptoverse_session mirror.
//
// If a "View as User" session is still active in this tab (sessionStorage), render the
// target user's profile instead of the admin's on initial load.
const initialViewState = loadViewState();

// Boot restore for an in-flight "View as User" session (this tab only).
//
// This used to read the target's profile out of the cryptoverse_users
// localStorage mirror. That mirror is gone (Batch C2), so the target is
// re-fetched from the SERVER instead. The fetch is asynchronous, so the admin's
// own session renders first and the viewed profile is applied a moment later —
// and if the account no longer exists, the view is ENDED rather than left in a
// half-on state that renders the wrong account.
if (initialViewState.isViewing && initialViewState.targetUser) {
  void findAdminUserByEmail(initialViewState.targetUser)
    .then(target => {
      if (!target) { useAuthStore.getState().endUserView(); return; }
      const profile = profileFromAdminUserRecord(target);
      useAuthStore.setState({
        user:         profile,
        isAdmin:      roleToIsAdmin(profile.role),
        isSuperAdmin: profile.role === 'super_admin',
      });
    })
    .catch(() => { /* keep the admin session; the view banner still offers Exit */ });
}

// Batch D2b1: the "Task 49" hydration block that used to run here is gone. It keyed
// off a browser-held session (`initialUser?.email`) and duplicated — only partially —
// what applyServerUser() already does for every SERVER-confirmed session:
// hydrateUserData() pulls cloud data, Academy XP, trading/bots/copy-trading, language
// and universal memory.

export const useAuthStore = create<AuthState>((set, get) => ({
  // Empty until the server answers (Batch D2b1). App.tsx gates the app shell on the
  // boot check, so nothing renders a "signed in" UI out of browser storage.
  user:              null,
  lastServerProfile: null,
  isAuthenticated:   false,
  isAdmin:           false,
  isSuperAdmin:      false,
  viewState:         initialViewState,

  // ── "View as User" (§New Feature 2) ───────────────────────────────────────
  // The target now comes from the SERVER (findAdminUserByEmail → GET
  // /api/admin/users/:userId) instead of the cryptoverse_users localStorage
  // mirror. Everything else is deliberately unchanged: this is a RENDER swap
  // only — no session is written, no token is minted, the target is never
  // notified, and `viewState.isViewing` stays the single read-only switch.
  startUserView: async (target, adminIdentity) => {
    if (typeof target === 'string' || !target?.email) {
      return { success: false, error: 'A server user record is required to start a user view.' };
    }

    // SERVER-FIRST identity — see resolveAdminIdentity(). Requiring an app session
    // here was the bug: an admin authenticated only by the portal's cookie was told
    // "Not logged in." and the view never started, even though GET /api/me knew
    // exactly who they were.
    const admin = await resolveAdminIdentity(adminIdentity);
    if (!admin?.email) {
      return { success: false, error: 'Could not verify your admin session. Reload the page and try again.' };
    }
    if (!roleToIsAdmin(admin.role)) {
      return { success: false, error: 'Only Admins and Super Admins can use User View.' };
    }

    const key        = target.email.toLowerCase().trim();
    const adminEmail = admin.email.toLowerCase().trim();
    if (key === adminEmail) {
      return { success: false, error: 'That is your own account — you are already signed in as it.' };
    }
    // Deliberately NO presence gate: view-as must work for an offline user, and
    // `last_seen_at` being null (never seen) is not a reason to refuse.
    // The banned/suspended gate was removed too — an admin is already authorised to
    // read that account's data, so refusing only blocked inspection, while the
    // read-only switch still prevents every mutation.

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

    // Swap the rendered `user` to the SERVER's record for that account WITHOUT
    // touching the persisted session (`cryptoverse_session`) or the Better Auth
    // cookie — so nothing is written on the target's account, no notification is
    // possible, and the API still sees the admin.
    // `isAuthenticated: true` is required for an admin who has no app session:
    // the app's route guard reads it, and without it /dashboard would bounce
    // straight back to /login the moment the view started. Nothing is impersonated
    // — every request is still authorised by the admin's own Better Auth cookie.
    set({ user: profileFromAdminUserRecord(target), viewState, isAuthenticated: true });
    return { success: true };
  },

  endUserView: () => {
    const { viewState } = get();
    if (!viewState.isViewing || !viewState.originalUser) return;

    closeLatestOpenLogEntry(viewState.originalUser, viewState.targetUser ?? '');

    const cleared: ViewState = { isViewing: false, targetUser: null, originalUser: null, originalRole: null, startedAt: null };
    saveViewState(cleared);

    // Restore the ADMIN's own profile. The viewed account was only ever a render swap,
    // so the cookie still belongs to the admin.
    //
    // Batch D2b2: `restored` comes from the last profile the SERVER confirmed, not from
    // the cryptoverse_session mirror. On a fresh page there is no in-memory profile yet,
    // so `user` goes back to null for that instant and the refreshFromServer() below
    // fills it in from GET /api/me — never from browser storage.
    const restored = get().lastServerProfile;
    set({
      user:         restored ? migrateProfile(restored) : null,
      viewState:    cleared,
      isAdmin:      restored ? roleToIsAdmin(restored.role) : false,
      isSuperAdmin: restored?.role === 'super_admin',
    });

    Promise.resolve(get().refreshFromServer()).catch(() => { /* the server answer lands via applyServerUser */ });
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
    // Batch D2b1: nothing to destroy locally — signOut() above already revoked the
    // cookie server-side, and this store no longer writes a session to localStorage.
    // Only the per-tab "View as User" state needs clearing.
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

    // P0 guard — see the comment block above hydrateUserData(). This action is
    // idempotent for a given account but it triggers a full hydration + cloud sync,
    // so repeats inside a short window are collapsed rather than re-run.
    if (email === lastAppliedEmail && Date.now() - lastAppliedAt < APPLY_DEDUPE_WINDOW_MS) return;
    lastAppliedEmail = email;
    lastAppliedAt = Date.now();
    // Batch D2: the `cryptoverse_users` localStorage fallback is gone. The only
    // profile we may reuse is the last one the SERVER confirmed, so no code path
    // can resurrect a browser-held identity.
    const previous = (get().user?.email?.toLowerCase() === email ? get().user : null)
      ?? (get().lastServerProfile?.email?.toLowerCase() === email ? get().lastServerProfile : null);
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

    set({
      user:              profile,
      lastServerProfile: profile,
      isAuthenticated:   true,
      isAdmin:           roleToIsAdmin(profile.role),
      isSuperAdmin:      profile.role === 'super_admin',
    });

    recordLogin({ userId: profile.id, method: 'email' });
    hydrateUserData(profile.email);
  },

  /**
   * Re-verifies the session against the server (GET /api/me).
   *
   * Batch D2 — the failure branches are split, because the previous single check
   * treated ANY "unauthenticated" error as proof of a revoked session, and
   * isUnauthenticated() counts status 0 (an unreachable API / dropped connection /
   * flaky bridge) as unauthenticated. A sleeping Render instance therefore signed
   * the user out and wiped the profile.
   *
   * Only the server can revoke a session, so only a DEFINITIVE answer may:
   *   401 — revoked/expired (single-session policy, admin revoke, sign-out)
   *   403 — the account is banned or suspended (fallbackMessage(403) is
   *         "This account is not allowed to sign in.")
   *
   * Everything else (status 0 network_error, 429, 5xx, timeout) is an AMBIGUOUS
   * read: the decision cannot be made, so the last server-confirmed profile is
   * kept. Returns true when the server still recognises the session.
   */
  refreshFromServer: async () => {
    try {
      const me = await fetchMe();
      await get().applyServerUser(me.user);
      return true;
    } catch (error) {
      const status = (error as { status?: number })?.status;

      if (status === 401 || status === 403) {
        // Definitive refusal — drop the in-memory session. No mirror keys to clear
        // and no navigation here: the router guard reacts on its own terms.
        set({
          user:              null,
          lastServerProfile: null,
          isAuthenticated:   false,
          isAdmin:           false,
          isSuperAdmin:      false,
        });
      } else {
        // Ambiguous — keep the last profile the SERVER confirmed. `user` is only
        // filled when it is empty, so a "view as user" swap or a valid in-memory
        // profile is never overwritten by an older one.
        const last = get().lastServerProfile;
        if (last && !get().user) {
          set({
            user:            last,
            isAuthenticated: true,
            isAdmin:         roleToIsAdmin(last.role),
            isSuperAdmin:    last.role === 'super_admin',
          });
        }
      }
      return false;
    }
  },

  // Batch D2b2: this used to walk the cryptoverse_users localStorage mirror to credit a
  // referrer. That mirror is no longer written anywhere (C2.2), so the scan already
  // matched nothing — the action is now an explicit no-op rather than dead code that
  // looks like it works. Crediting a referral needs a SERVER endpoint (the local roster
  // cannot be trusted with balance changes); see the referral endpoint task.
  applyReferral: (_code) => {
    console.warn('[authStore] applyReferral is local-only and inert: referral credit needs a server endpoint.');
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
   * The signature stays (email, newRole) because AdminAdmins.tsx calls it that way
   * (AdminRoleManagement.tsx no longer exists) and calls it fire-and-forget — so this
   * must never reject.
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

      // Batch D2b2: the local roster mirror is gone, so there is nothing to keep in
      // sync — the server's own answer is authoritative and is re-read on the next
      // refreshFromServer(). Nothing is written to cryptoverse_users any more.
      if (key === get().user?.email?.toLowerCase()) await get().refreshFromServer();
      return { success: true };
    } catch (error) {
      if ((error as { name?: string })?.name === 'ApiForbiddenError') {
        return { success: false, error: 'Your admin role does not allow changing roles.' };
      }
      return { success: false, error: error instanceof Error ? error.message : 'Unable to change the role.' };
    }
  },

  // Batch D2b2: `getAllUsers` (a reader over the cryptoverse_users localStorage mirror)
  // is deleted — the mirror is no longer written, so it only ever returned an empty list,
  // and the real roster is GET /api/admin/users (adminUsersApi.fetchAllAdminUsers).

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

  /**
   * Confirm/restore the app session after an external auth step (VerifyOtpPage) or an
   * admin "view as user" exit.
   *
   * Batch D2c: this delegates to the SERVER — refreshFromServer() → GET /api/me →
   * applyServerUser() — instead of reading the Taskade roster. The supplied email is now
   * only advisory: the HttpOnly cookie set by the OTP exchange is what proves identity, so
   * this also works for an admin who has no app session at all. Deleting authApi.ts (D3)
   * depends on this re-point.
   *
   * `recordLogin` and `hydrateUserData` still run — inside applyServerUser.
   */
  loginFromSession: async () => {
    await get().refreshFromServer();
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


// Batch D2b1: `hydrateCurrentUserFromServer()` is deleted, along with its module-load
// call. It re-checked the session against the TASKADE roster on every full page load and,
// on a miss, called destroySession() + cleared the store — so one ambiguous or slow roster
// read could sign out a user whose Better Auth cookie was perfectly valid. That is the
// session-destroyer this batch removes.
//
// The server check is now `refreshFromServer()` (GET /api/me), driven by the App.tsx boot
// guard, and it is the only thing allowed to clear the session.

