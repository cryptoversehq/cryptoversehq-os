import { create } from 'zustand';
import { AdminLevel, ADMIN_LEVEL_META } from './adminManagementStore';
import { verifyPassword as verifyPasswordPbkdf2 } from './passwordHash';

const SESSION_KEY  = 'cryptoverse_admin_session';
const SESSIONS_KEY = 'cryptoverse_admin_sessions';

export interface AdminSession {
  adminId:    string;
  email:      string;
  displayName: string;
  level:      AdminLevel;
  avatarSeed: string;
  sessionId:  string;
  loginAt:    string;
  lastActive: string;
  ipAddress:  string;
  twoFaDone:  boolean;
}

// ── Enterprise Secure Bootstrap Configuration (Sprint 6.6.3-A) ─────────────
// Zero hardcoded passwords or 2FA codes in source code.
// Configured via environment variables (import.meta.env) or secure cloud bootstrap node.
const BOOTSTRAP_ADMIN_SECRET = import.meta.env.VITE_ADMIN_BOOTSTRAP_SECRET || '';
const BOOTSTRAP_2FA_SECRET   = import.meta.env.VITE_ADMIN_2FA_SECRET || '';

// Super Admin access is granted exclusively through the build-time
// VITE_ADMIN_BOOTSTRAP_SECRET (never from any email list or editable
// localStorage). There is no client-side privilege path.
const SUPER_ADMIN_ID        = 'superadmin_001';
const SUPER_ADMIN_NAME      = 'Super Admin';
const SUPER_ADMIN_AVATAR    = 'SuperAdmin';

// Real client IP, fetched once and cached; falls back to 'unknown' offline.
let _cachedIp: string | null = null;
(function primeIpCache() {
  fetch('https://api.ipify.org?format=json')
    .then(r => r.json())
    .then(d => { if (d?.ip) _cachedIp = d.ip; })
    .catch(() => { /* leave as unknown */ });
})();
function mockIp() {
  return _cachedIp ?? 'unknown';
}
function makeSessionId() {
  return 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
}
function loadSession(): AdminSession | null {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}
function saveSession(s: AdminSession | null) {
  if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else   sessionStorage.removeItem(SESSION_KEY);
}
function loadSessions(): AdminSession[] {
  try { return JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]'); } catch { return []; }
}
function saveSessions(ss: AdminSession[]) {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(ss));
}

// Get all admin members from localStorage
function getAdminMembers(): Array<{ id: string; email: string; password?: string; displayName: string; level: AdminLevel; avatarSeed: string; status: string }> {
  try {
    const raw = JSON.parse(localStorage.getItem('cryptoverse_admin_members') || localStorage.getItem('cryptoplay_admin_members') || '[]');
    return raw;
  } catch { return []; }
}

interface AdminAuthState {
  session:   AdminSession | null;
  isAdminAuth: boolean;
  pendingEmail: string;
  pendingLevel: AdminLevel | null;
  twoFaPending: boolean;

  login:         (email: string, password: string) => Promise<{ success: boolean; error?: string; needs2fa?: boolean }>;
  verify2fa:     (code: string) => { success: boolean; error?: string };
  logout:        () => void;
  touchSession:  () => void;
  isSessionValid: () => boolean;
}

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export const useAdminAuthStore = create<AdminAuthState>((set, get) => ({
  session:      loadSession(),
  isAdminAuth:  !!loadSession()?.twoFaDone,
  pendingEmail: '',
  pendingLevel: null,
  twoFaPending: false,

  login: async (email, password) => {
    const e = email.toLowerCase().trim();

    let matched: { id: string; email: string; displayName: string; level: AdminLevel; avatarSeed: string } | null = null;

    // Super Admin: authenticated ONLY by the build-time bootstrap secret. No
    // hardcoded email list and no email-specific bypass — possession of the
    // secret itself is the credential. The entered email is only an identifier.
    if (BOOTSTRAP_ADMIN_SECRET && password === BOOTSTRAP_ADMIN_SECRET) {
      const name = e.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || SUPER_ADMIN_NAME;
      matched = { id: SUPER_ADMIN_ID, email: e, displayName: name, level: 6 as AdminLevel, avatarSeed: SUPER_ADMIN_AVATAR };
    }

    if (!matched) {
      // Admin members: password must match a PBKDF2 hash. Plaintext or missing
      // hashes are rejected — never compared in plaintext.
      const members = getAdminMembers();
      const member  = members.find(m => m.email.toLowerCase() === e && m.status === 'active');
      if (member?.password && !/^[0-9a-f]{64}$/.test(member.password) && !member.password.startsWith('pbkdf2$')) {
        // Explicitly reject legacy plaintext — does not compare.
        matched = null;
      } else if (member?.password) {
        const ok = await verifyPasswordPbkdf2(password, member.password);
        if (ok) {
          matched = { id: member.id, email: member.email, displayName: member.displayName, level: member.level, avatarSeed: member.avatarSeed };
        }
      }
    }

    if (!matched) {
      return { success: false, error: 'Invalid credentials or account not found.' };
    }

    // Check for concurrent sessions (block if another session exists)
    const sessions = loadSessions().filter(s => {
      const age = Date.now() - new Date(s.lastActive).getTime();
      return s.adminId === matched!.id && age < SESSION_TIMEOUT_MS;
    });
    if (sessions.length > 0) {
      // Force-expire old sessions for same user
      const cleaned = loadSessions().filter(s => s.adminId !== matched!.id);
      saveSessions(cleaned);
    }

    // Create session awaiting 2FA
    const sess: AdminSession = {
      adminId:     matched.id,
      email:       matched.email,
      displayName: matched.displayName,
      level:       matched.level,
      avatarSeed:  matched.avatarSeed,
      sessionId:   makeSessionId(),
      loginAt:     new Date().toISOString(),
      lastActive:  new Date().toISOString(),
      ipAddress:   mockIp(),
      twoFaDone:   false,
    };

    set({ session: sess, pendingEmail: e, pendingLevel: matched.level, twoFaPending: true, isAdminAuth: false });
    return { success: true, needs2fa: true };
  },

  verify2fa: (code) => {
    const { session } = get();
    if (!session) return { success: false, error: 'No session found.' };

    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      return { success: false, error: 'Invalid code. Enter your 6-digit authenticator code.' };
    }
    const expected2fa = BOOTSTRAP_2FA_SECRET || (session as unknown as { twoFaChallenge?: string }).twoFaChallenge || '';
    if (!expected2fa || code !== expected2fa) {
      return { success: false, error: 'Incorrect 2FA code.' };
    }

    const verified = { ...session, twoFaDone: true, lastActive: new Date().toISOString() };
    saveSession(verified);

    // Register in sessions list
    const sessions = loadSessions().filter(s => s.sessionId !== verified.sessionId);
    sessions.push(verified);
    saveSessions(sessions);

    set({ session: verified, isAdminAuth: true, twoFaPending: false });
    return { success: true };
  },

  logout: () => {
    const { session } = get();
    if (session) {
      const sessions = loadSessions().filter(s => s.sessionId !== session.sessionId);
      saveSessions(sessions);
    }
    saveSession(null);
    set({ session: null, isAdminAuth: false, twoFaPending: false, pendingEmail: '', pendingLevel: null });
  },

  touchSession: () => {
    const { session } = get();
    if (!session) return;
    const updated = { ...session, lastActive: new Date().toISOString() };
    saveSession(updated);
    set({ session: updated });
  },

  isSessionValid: () => {
    const { session } = get();
    if (!session?.twoFaDone) return false;
    const age = Date.now() - new Date(session.lastActive).getTime();
    if (age > SESSION_TIMEOUT_MS) {
      get().logout();
      return false;
    }
    return true;
  },

}));
