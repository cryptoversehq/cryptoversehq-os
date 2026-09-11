
import { create } from 'zustand';
import { hashPassword as hashPasswordPbkdf2, verifyPassword as verifyPasswordPbkdf2 } from './passwordHash';
import { recordLogin } from './loginHistoryStore';
import { refreshAdminCacheFromDb } from './userMigrationService';
import { rateLimiter } from './security/rateLimiter';
import { createSession, destroySession, loadAuthSession } from './security/sessionManager';
import { cloudRecordStore } from './cloudData';
import { createPendingUser, findUserByEmail, generateOtp, sendOtpEmail, updatePassword, updateUserProfile, type UserRecord } from './authApi';
import { trackProductEventInBackground, trackProductEventOnce } from './productAnalytics';

// ── Password hashing (PBKDF2-SHA256) ────────────────────────────────────────
// Delegated to ./passwordHash (WebCrypto PBKDF2 with a per-user 16-byte salt and
// 100,000 iterations). No unsalted SHA-256 password hashing remains in this store.
async function hashPassword(password: string): Promise<string> {
  return hashPasswordPbkdf2(password);
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  return verifyPasswordPbkdf2(password, storedHash);
}

// ── Role System ───────────────────────────────────────────────────────────────
export type UserRole = 'user' | 'vip' | 'admin' | 'senior_admin' | 'super_admin' | 'founder' | 'developer';

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

  // Auth actions (email + password only — no unverified client-side "OAuth")
  login:              (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register:           (email: string, password: string, displayName: string) => Promise<{ success: boolean; error?: string }>;
  logout:             () => void;

  // Profile updates
  updateProfile: (partial: Partial<UserProfile>) => void;

  // Referral
  applyReferral: (code: string) => void;

  // Admin request (legacy)
  requestAdmin: () => { approved: boolean; reason?: string };

  // Role management (super_admin only)
  setUserRole: (targetEmail: string, newRole: UserRole) => Promise<{ success: boolean; error?: string }>;

  // Get all users (super_admin only)
  getAllUsers: () => Array<{ email: string; profile: UserProfile }>;

  // Virtual currency purchase
  addVirtualBalance: (amount: number) => void;

  // Dismiss first-login guide
  dismissFirstLogin: () => void;

  // Password reset
  resetPassword: (email: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;

  // New: log in directly from an external auth session (used by new auth pages)
  loginFromSession: (params: { id: string; email: string; fullName: string; role: UserRole }) => Promise<void>;

  // Refresh the current user's role from the Taskade DB (reactive role sync)
  refreshRole: () => Promise<void>;

  // Subscription management
  updateSubscription: (planId: string) => void;
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
  return role === 'admin' || role === 'senior_admin' || role === 'super_admin' || role === 'founder' || role === 'developer';
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

  login: async (email, password) => {
    const normalizedEmail = email.toLowerCase().trim();
    const rateCheck = rateLimiter.checkRateLimit('login', normalizedEmail);
    if (!rateCheck.allowed) return { success: false, error: rateCheck.message || 'Too many attempts. Please wait.' };
    const lockCheck = rateLimiter.isLockedOut(normalizedEmail);
    if (lockCheck.locked) return { success: false, error: lockCheck.message || 'Account is temporarily locked.' };

    try {
      const record = await findUserByEmail(normalizedEmail);
      if (!record || !record.passwordHash || !(await verifyPassword(password, record.passwordHash))) {
        rateLimiter.recordFailedAttempt('login', normalizedEmail);
        return { success: false, error: 'Incorrect email or password.' };
      }
      if (record.status !== 'active') return { success: false, error: 'This account is not active.' };

      const profile = profileFromServer(record, get().user?.email === record.email ? get().user : null);
      createSession(record.email);
      saveSession(profile);
      set({ user: profile, isAuthenticated: true, isAdmin: roleToIsAdmin(profile.role), isSuperAdmin: profile.role === 'super_admin' });
      recordLogin({ userId: profile.id, method: 'email' });
      hydrateUserData(profile.email);
      return { success: true };
    } catch {
      return { success: false, error: 'We could not reach the account service. Please try again.' };
    }
  },

  register: async (email, password, displayName) => {
    const normalizedEmail = email.toLowerCase().trim();
    if (password.length < 6) return { success: false, error: 'Password must be at least 6 characters.' };
    try {
      const passwordHash = await hashPassword(password);
      const otpCode = generateOtp();
      const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      await createPendingUser({
        email: normalizedEmail,
        passwordHash,
        fullName: displayName.trim() || normalizedEmail.split('@')[0],
        otpCode,
        otpExpiresAt,
      });
      await sendOtpEmail({ email: normalizedEmail, name: displayName.trim() || normalizedEmail.split('@')[0], code: otpCode });
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unable to create the account.' };
    }
  },

  // loginWithGoogle / loginWithApple / loginWithBiometric were removed.
  // They minted sessions from any caller-supplied email with no real OIDC / WebAuthn
  // verification — a client-side authentication bypass. Sign-in is email+password
  // (OTP-verified) and the standalone AdminLogin flow only.

  logout: () => {
    destroySession();
    saveSession(null);
    // Also clear sessionStorage for any legacy entries
    try { sessionStorage.removeItem('cryptoverse_session'); } catch { /* ignore */ }
    try { sessionStorage.removeItem(VIEW_STATE_KEY); } catch { /* ignore */ }
    // Clear all session-scoped state fully
    set({ user: null, isAuthenticated: false, isAdmin: false, isSuperAdmin: false,
      viewState: { isViewing: false, targetUser: null, originalUser: null, originalRole: null, startedAt: null } });
    // Hard navigate to root — ensures the BrowserRouter isn't stuck on a deep route
    // and the auth guard shows AuthPage instead of Dashboard
    window.location.replace('/dashboard');
  },

  updateProfile: (partial) => {
    const user = get().user;
    if (!user) return;
    const updated = migrateProfile({ ...user, ...partial });
    cloudRecordStore.set('auth_profile', user.email.toLowerCase(), updated);
    if (partial.displayName !== undefined) {
      void updateUserProfile(user.email, { fullName: partial.displayName }).then(result => {
        if (!result.ok) console.warn('[authStore] Profile update was not accepted by the server.');
      });
    }
    saveSession(updated);
    set({
      user:         updated,
      isAdmin:      roleToIsAdmin(updated.role),
      isSuperAdmin: updated.role === 'super_admin',
    });
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

  requestAdmin: () => {
    const user = get().user;
    if (!user) return { approved: false, reason: 'Not logged in' };
    const { balance } = JSON.parse(localStorage.getItem('trading_store') || '{}') as { balance?: number };
    const growthPct    = balance ? ((balance - 100000) / 100000) * 100 : 0;
    const daysSinceJoin = Math.floor((Date.now() - new Date(user.joinedAt).getTime()) / 86400000);
    const approved = growthPct >= 20 && daysSinceJoin >= 7;
    const reason   = !approved
      ? [
          growthPct < 20    && `Portfolio growth below 20% (yours: ${growthPct.toFixed(1)}%)`,
          daysSinceJoin < 7 && `Account must be at least 7 days old (yours: ${daysSinceJoin}d)`,
        ].filter(Boolean).join(' · ')
      : undefined;
    get().updateProfile({
      adminRequestStatus: approved ? 'approved' : 'rejected',
      role:               approved ? 'admin' : user.role,
      isAdmin:            approved || user.isAdmin,
      adminRejectReason:  reason,
    });
    return { approved, reason };
  },

  setUserRole: async (targetEmail, newRole) => {
    const currentUser = get().user;
    if (!currentUser || currentUser.role !== 'super_admin') {
      return { success: false, error: 'Only Super Admins can change user roles.' };
    }
    const result = await import('./authApi').then(({ updateUserRole }) => updateUserRole(targetEmail, newRole));
    if (!result.ok) return { success: false, error: result.error };

    const key = targetEmail.toLowerCase().trim();
    const users = getUsers();
    const target = users[key];
    if (target) {
      target.profile = migrateProfile({ ...target.profile, role: newRole, isAdmin: roleToIsAdmin(newRole) });
      saveUsers(users);
    }
    if (key === currentUser.email.toLowerCase()) {
      get().updateProfile({ role: newRole, isAdmin: roleToIsAdmin(newRole) });
    }
    return { success: true };
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
    const currentUser = get().user;
    if (!currentUser) return;
    try {
      // DB is the source of truth for role — never trust the local profile.
      const { findUserByEmail } = await import('./authApi');
      const dbUser = await findUserByEmail(currentUser.email);
      if (!dbUser) return;
      const newRole = (dbUser.role as UserRole) ?? 'user';
      const isAdmin = roleToIsAdmin(newRole);
      if (newRole === currentUser.role && isAdmin === currentUser.isAdmin) return;

      const updatedProfile = migrateProfile({ ...currentUser, role: newRole, isAdmin });
      const users = getUsers();
      const key   = currentUser.email.toLowerCase();
      if (users[key]) {
        users[key].profile = updatedProfile;
        saveUsers(users);
      }
      saveSession(updatedProfile);
      set({
        user:         updatedProfile,
        isAdmin,
        isSuperAdmin: newRole === 'super_admin',
      });
    } catch (error) {
      console.warn('Failed to refresh role:', error);
    }
  },

  resetPassword: async (email, newPassword) => {
    if (newPassword.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters.' };
    }
    try {
      const record = await findUserByEmail(email.toLowerCase().trim());
      if (!record) return { success: false, error: 'No account found with this email.' };
      await updatePassword(record.nodeId, await hashPassword(newPassword));
      return { success: true };
    } catch {
      return { success: false, error: 'Unable to update the password right now.' };
    }
  },
}));


async function hydrateCurrentUserFromServer(): Promise<void> {
  const cachedUser = useAuthStore.getState().user;
  if (!cachedUser?.email) return;
  try {
    const record = await findUserByEmail(cachedUser.email);
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

