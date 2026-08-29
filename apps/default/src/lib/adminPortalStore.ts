import { create } from 'zustand';
import { fetchAllUsers, UserRecord } from './authApi';
import { fetchTickets, Ticket, updateTicketStatus, updateTicketPriority } from './ticketStore';
import { MODULES } from '../components/Academy';
import {
  refreshAdminCacheFromDb,
  setSuperAdminInDb,
  setUserStatusInDb,
  setAdminSectionsInDb,
} from './userMigrationService';

// ── Keys ─────────────────────────────────────────────────────────────────────
const TWO_MAN_KEY   = 'cryptoverse_twoman_requests';
const NOTIF_CTR_KEY = 'cryptoverse_portal_notifs';
const BANS_KEY      = 'cryptoverse_banned_users';

// ── Ban helpers ───────────────────────────────────────────────────────────────
function loadBans(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(BANS_KEY) || '[]')); } catch { return new Set(); }
}
function saveBans(b: Set<string>) {
  localStorage.setItem(BANS_KEY, JSON.stringify([...b]));
}

// ── Suspension helpers ────────────────────────────────────────────────────────
const SUSP_KEY = 'cryptoverse_suspended_users';
function loadSuspended(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SUSP_KEY) || '[]')); } catch { return new Set(); }
}
function saveSuspended(s: Set<string>) {
  localStorage.setItem(SUSP_KEY, JSON.stringify([...s]));
}

// ── Super-admin helpers ───────────────────────────────────────────────────────
// Single source of truth for cryptoverse_super_admins. Every read/write in
// this file (and, via the store's `superAdmins` state + `getSuperAdmins()`,
// every consumer outside this file too) goes through these two functions —
// no other module should touch this localStorage key directly.
// ── Super-admin resolution (DB as source of truth, no hardcoded emails) ─────
// The Taskade Users project @cv_role field is the single source of truth for
// super-admin status. refreshAdminCacheFromDb() mirrors DB role === 'super_admin'
// into this localStorage key. No email is hardcoded in source; the list is only
// populated from the DB or from explicit Super-Admin promotion/demotion actions.
const SUPER_ADMINS_KEY = 'cryptoverse_super_admins';
function loadSuperAdmins(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SUPER_ADMINS_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter((email: unknown) => typeof email === 'string' && email.trim().length > 0);
  } catch { return []; }
}
function saveSuperAdmins(emails: string[]) {
  const uniq = [...new Set(emails.filter(e => typeof e === 'string' && e.trim().length > 0))];
  localStorage.setItem(SUPER_ADMINS_KEY, JSON.stringify(uniq));
}
function ensureSuperAdminsPersisted() {
  // No hardcoded seeding. Super admins are resolved from the DB
  // (refreshAdminCacheFromDb) or via Super-Admin promotion actions.
  if (!localStorage.getItem(SUPER_ADMINS_KEY)) {
    localStorage.setItem(SUPER_ADMINS_KEY, '[]');
  }
}

// ── Two-Man Rule ──────────────────────────────────────────────────────────────
export type TwoManActionType =
  | 'delete_user'
  | 'modify_leverage'
  | 'large_balance_adjustment'
  | 'delete_competition'
  | 'suspend_super_admin';

export const TWO_MAN_ACTIONS: Record<TwoManActionType, { label: string; requiredLevels: number[]; description: string; icon: string }> = {
  delete_user:               { label: 'Delete User Account',           requiredLevels: [6, 3], description: 'Permanently deletes a user and all their data.', icon: '🗑️' },
  modify_leverage:           { label: 'Modify System Leverage',        requiredLevels: [6, 3], description: 'Changes global leverage limits affecting all trades.', icon: '⚖️' },
  large_balance_adjustment:  { label: 'Large Balance Adjustment >100k',requiredLevels: [6, 3], description: 'Adjusts virtual balance above $100,000.', icon: '💰' },
  delete_competition:        { label: 'Delete Active Competition',     requiredLevels: [6, 4], description: 'Removes a competition while users are active.', icon: '🏆' },
  suspend_super_admin:       { label: 'Suspend Super Admin',           requiredLevels: [6, 6], description: 'Requires two Super Admins to agree.', icon: '🛡️' },
};

export interface TwoManRequest {
  id:          string;
  action:      TwoManActionType;
  requesterId: string;
  requesterName: string;
  targetId:    string;
  targetLabel: string;
  reason:      string;
  status:      'pending' | 'approved' | 'rejected' | 'executed';
  approvals:   Array<{ adminId: string; adminName: string; approvedAt: string }>;
  createdAt:   string;
  executedAt?: string;
  metadata?:   Record<string, unknown>;
}

// ── Demo data ─────────────────────────────────────────────────────────────────
function makeId(p: string) {
  return `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

// ── Live data types (replace Demo* types) ─────────────────────────────────────

export interface DemoUser {
  id: string; name: string; email: string; plan: string;
  status: 'active' | 'suspended' | 'banned'; joinedAt: string;
  balance: number; trades: number; winRate: number; country: string; flag: string;
  role: string;
  roleChangedAt?: string;
  permissions?: string[];
}

// Keep DemoTransaction, DemoLesson, DemoCompetition as lightweight local state
// (no external source for these yet)
export interface DemoTransaction {
  id: string; userId: string; userName: string; type: string;
  amount: number; status: 'verified' | 'pending' | 'rejected';
  txHash: string; timestamp: string; network: string;
}
export interface DemoLesson {
  id: string; title: string; level: number; status: 'published' | 'draft' | 'flagged';
  category: string;
  // Per-lesson analytics (views/completions/rating) aren't tracked anywhere in
  // the app yet — no fabricated numbers are shown for them until a real
  // tracking store exists. Admin UI should render '—' when undefined.
  views?: number; completions?: number; rating?: number; updatedAt?: string;
}

/** Build the real Content Management list from the actual Academy lesson catalog. */
function buildLessonsFromAcademy(): DemoLesson[] {
  const lessons: DemoLesson[] = [];
  MODULES.forEach((mod, modIdx) => {
    mod.lessons.forEach(lesson => {
      lessons.push({
        id:       lesson.id,
        title:    lesson.title,
        level:    modIdx + 1,
        status:   'published', // all Academy lessons are live in the app today
        category: mod.title,
      });
    });
  });
  return lessons;
}
export interface DemoReport {
  id: string; reporterId: string; reporterName: string;
  targetId: string; targetName: string; reason: string;
  status: 'pending' | 'resolved' | 'dismissed';
  createdAt: string; category: string;
}

/** Convert a UserRecord (from Taskade) to DemoUser */
function userRecordToDemo(r: UserRecord): DemoUser {
  const bans      = loadBans();
  const suspended = loadSuspended();
  const status: DemoUser['status'] = bans.has(r.email)
    ? 'banned'
    : suspended.has(r.email)
    ? 'suspended'
    : 'active';
  return {
    id:       r.nodeId,
    name:     r.fullName || r.email.split('@')[0],
    email:    r.email,
    plan:     'free', // subscriptions not yet synced here
    status,
    joinedAt: r.createdAt || new Date().toISOString(),
    balance:  0,
    trades:   0,
    winRate:  0,
    country:  '',
    flag:     '',
    role:     r.role,
  };
}

/**
 * Offline fallback for loadUsers() — builds the same DemoUser[] shape
 * directly from legacy cryptoverse_users localStorage, used only when the
 * Taskade Users project is unreachable. Once the DB comes back, the next
 * loadUsers() call overwrites this with the real DB-backed roster.
 */
function legacyUsersToDemo(): DemoUser[] {
  try {
    const raw = JSON.parse(localStorage.getItem('cryptoverse_users') || '{}') as Record<string, {
      profile: { id: string; email: string; displayName: string; role?: string; joinedAt?: string };
    }>;
    const bans      = loadBans();
    const suspended = loadSuspended();
    const supers    = new Set(loadSuperAdmins());
    return Object.values(raw).map(({ profile }) => {
      const status: DemoUser['status'] = bans.has(profile.email)
        ? 'banned'
        : suspended.has(profile.email)
        ? 'suspended'
        : 'active';
      return {
        id:       profile.id,
        name:     profile.displayName || profile.email.split('@')[0],
        email:    profile.email,
        plan:     'free',
        status,
        joinedAt: profile.joinedAt || new Date().toISOString(),
        balance:  0,
        trades:   0,
        winRate:  0,
        country:  '',
        flag:     '',
        role:     supers.has(profile.email) ? 'super_admin' : (profile.role || 'user'),
      };
    });
  } catch { return []; }
}

// ── Two-man persistence ───────────────────────────────────────────────────────
function loadTwoMan(): TwoManRequest[] {
  try { return JSON.parse(localStorage.getItem(TWO_MAN_KEY) || '[]'); } catch { return []; }
}
function saveTwoMan(r: TwoManRequest[]) {
  localStorage.setItem(TWO_MAN_KEY, JSON.stringify(r));
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION-BASED ADMIN ACCESS  (superadmin scopes a promoted admin to
// specific sections of the portal — see AdminUsers.tsx promotion modal,
// AdminPortalLayout.tsx menu filtering, and the App.tsx route guards)
// ─────────────────────────────────────────────────────────────────────────────

/** Every section a Super Admin can hand out to a section-scoped Admin. */
export const ADMIN_SECTIONS = [
  { id: 'users',        label: 'User Management',         icon: '👥' },
  { id: 'content',      label: 'Content Management',       icon: '📚' },
  { id: 'transactions', label: 'Transaction Management',   icon: '💳' },
  { id: 'competitions', label: 'Competition Management',   icon: '🏆' },
  { id: 'events',       label: 'Events Management',        icon: '📅' },
  { id: 'reports',      label: 'Reports Management',       icon: '📋' },
  { id: 'copyTrading',  label: 'Copy Trading Management',  icon: '🔄' },
  { id: 'onChain',      label: 'On-Chain Management',      icon: '⛓️' },
  { id: 'nft',          label: 'NFT Management',           icon: '🖼️' },
  { id: 'sentiment',    label: 'Sentiment Management',     icon: '🧠' },
] as const;

export type AdminSectionId = typeof ADMIN_SECTIONS[number]['id'];

export interface AdminPermissions {
  email:    string;
  sections: AdminSectionId[];
}

const ADMIN_PERMISSIONS_KEY = 'cryptoverse_admin_section_permissions';

function loadAdminPermissions(): AdminPermissions[] {
  try { return JSON.parse(localStorage.getItem(ADMIN_PERMISSIONS_KEY) || '[]'); } catch { return []; }
}
function saveAdminPermissions(list: AdminPermissions[]) {
  localStorage.setItem(ADMIN_PERMISSIONS_KEY, JSON.stringify(list));
}

function isPersistedSuperAdmin(email: string): boolean {
  return loadSuperAdmins().includes(email);
}

/**
 * Access check used by the side menu (AdminPortalLayout) and the route
 * guards (App.tsx). Super Admins always have access to every section.
 */
export function hasAccess(email: string, section: string): boolean {
  if (!email) return false;
  if (isPersistedSuperAdmin(email)) return true;
  const admin = loadAdminPermissions().find(a => a.email === email);
  return admin?.sections.includes(section as AdminSectionId) || false;
}

/** Sections explicitly assigned to a section-scoped admin (empty for none / superadmins). */
export function getAdminSections(email: string): AdminSectionId[] {
  return loadAdminPermissions().find(a => a.email === email)?.sections ?? [];
}

// ── Store ─────────────────────────────────────────────────────────────────────
interface AdminPortalState {
  users:          DemoUser[];
  transactions:   DemoTransaction[];
  tickets:        Ticket[];          // ← now uses live Ticket type
  reports:        DemoReport[];
  lessons:        DemoLesson[];
  twoManRequests: TwoManRequest[];
  adminPermissions: AdminPermissions[];
  /** Reactive mirror of cryptoverse_super_admins — the only place any
   *  component should read super-admin status from. */
  superAdmins:    string[];
  loadingUsers:   boolean;
  loadingTickets: boolean;

  // Section-based admin access
  getAdminSections:       (email: string) => AdminSectionId[];
  setAdminSections:       (email: string, sections: AdminSectionId[]) => void;
  /** Promote a regular user to a section-scoped Admin in one step. */
  promoteToSectionAdmin:  (email: string, sections: AdminSectionId[]) => void;

  /** All super-admin emails. This is the ONLY sanctioned way to read
   *  cryptoverse_super_admins — components must not touch localStorage
   *  directly for this key. */
  getSuperAdmins: () => string[];

  // Load live data
  loadUsers:   () => Promise<void>;
  loadTickets: () => Promise<void>;

  // Two-man rule
  requestTwoMan: (req: Omit<TwoManRequest, 'id' | 'createdAt' | 'approvals' | 'status'>) => TwoManRequest;
  approveTwoMan: (reqId: string, adminId: string, adminName: string) => TwoManRequest | null;
  rejectTwoMan:  (reqId: string, adminId: string) => void;

  // User actions (local status only; role changes go via authApi)
  banUser:     (email: string) => void;
  unbanUser:   (email: string) => void;
  suspendUser: (email: string) => void;

  // Role management
  changeUserRole: (email: string, newRole: string) => void;
  promoteToSuperAdmin: (email: string) => void;
  demoteSuperAdmin: (email: string) => void;

  // Ticket actions (persist to Taskade)
  resolveTicket:  (nodeId: string, adminId: string, response: string) => Promise<void>;
  escalateTicket: (nodeId: string) => Promise<void>;

  // Report actions
  submitReport: (data: Omit<DemoReport, 'id' | 'status' | 'createdAt'>) => void;
  resolveReport: (reportId: string) => void;
  dismissReport: (reportId: string) => void;

  // Lesson actions
  publishLesson: (lessonId: string) => void;
  flagLesson:    (lessonId: string) => void;

  // Transaction actions
  approveTransaction: (txId: string) => void;
  rejectTransaction:  (txId: string) => void;
}

// Seed the two default super admins into localStorage BEFORE the store reads
// its initial `superAdmins` snapshot below, so the very first render already
// reflects them (rather than waiting for the first loadUsers() call).
ensureSuperAdminsPersisted();

export const useAdminPortalStore = create<AdminPortalState>((set, get) => ({
  users:          [],
  transactions:   [],
  tickets:        [],
  reports:        [],
  lessons:        buildLessonsFromAcademy(),
  twoManRequests: loadTwoMan(),
  adminPermissions: loadAdminPermissions(),
  superAdmins:    loadSuperAdmins(),
  loadingUsers:   false,
  loadingTickets: false,

  // ── Section-based admin access ────────────────────────────────────────────
  getAdminSections: (email) => getAdminSections(email),

  getSuperAdmins: () => get().superAdmins,

  setAdminSections: (email, sections) => {
    const list = loadAdminPermissions();
    const idx  = list.findIndex(a => a.email === email);
    const entry: AdminPermissions = { email, sections };
    const updated = idx >= 0
      ? list.map((a, i) => i === idx ? entry : a)
      : [...list, entry];
    saveAdminPermissions(updated);
    set({ adminPermissions: updated });
    setAdminSectionsInDb(email, sections);
  },

  promoteToSectionAdmin: (email, sections) => {
    get().setAdminSections(email, sections);
    get().changeUserRole(email, 'admin');
  },

  // ── Load live users from Taskade Users project ────────────────────────────
  loadUsers: async () => {
    set({ loadingUsers: true });
    try {
      const records = await fetchAllUsers();
      // Keep the localStorage admin cache (super-admins/bans/suspensions/
      // sections) in sync with the DB every time the roster is loaded, so
      // hasAccess() / getAdminSections() / AdminUsers.tsx's synchronous
      // reads stay current without needing to become async themselves.
      await refreshAdminCacheFromDb(records).catch(() => {});
      set({
        users:            records.map(userRecordToDemo),
        adminPermissions: loadAdminPermissions(),
        superAdmins:      loadSuperAdmins(),
      });
    } catch {
      // DB unreachable — fall back to whatever legacy accounts exist in
      // localStorage so Admin → Users still shows something instead of
      // an empty screen (per the explicit fallback requirement).
      set({ users: legacyUsersToDemo() });
    } finally {
      set({ loadingUsers: false });
    }
  },

  // ── Load live tickets from Taskade Tickets project ────────────────────────
  loadTickets: async () => {
    set({ loadingTickets: true });
    try {
      const tickets = await fetchTickets();
      set({ tickets });
    } catch {
      // silently keep empty
    } finally {
      set({ loadingTickets: false });
    }
  },

  // ── Two-man rule ──────────────────────────────────────────────────────────
  requestTwoMan: (data) => {
    const req: TwoManRequest = {
      ...data,
      id:        makeId('tm'),
      createdAt: new Date().toISOString(),
      approvals: [],
      status:    'pending',
    };
    const reqs = [req, ...get().twoManRequests];
    saveTwoMan(reqs);
    set({ twoManRequests: reqs });
    return req;
  },

  approveTwoMan: (reqId, adminId, adminName) => {
    let found: TwoManRequest | null = null;
    const reqs = get().twoManRequests.map(r => {
      if (r.id !== reqId) return r;
      if (r.approvals.find(a => a.adminId === adminId)) return r;
      const approvals = [...r.approvals, { adminId, adminName, approvedAt: new Date().toISOString() }];
      const status: TwoManRequest['status'] = approvals.length >= 2 ? 'approved' : 'pending';
      const updated = { ...r, approvals, status };
      found = updated;
      return updated;
    });
    saveTwoMan(reqs);
    set({ twoManRequests: reqs });
    return found;
  },

  rejectTwoMan: (reqId, _adminId) => {
    const reqs = get().twoManRequests.map(r =>
      r.id === reqId ? { ...r, status: 'rejected' as const } : r,
    );
    saveTwoMan(reqs);
    set({ twoManRequests: reqs });
  },

  // ── User actions ─────────────────────────────────────────────────────────
  // Each action writes to localStorage immediately (unchanged behavior — this
  // is also the offline fallback) and fires a best-effort DB write alongside
  // it, so the shared Taskade Users project stays the source of truth.
  banUser: (email) => {
    const bans = loadBans();
    bans.add(email);
    saveBans(bans);
    set(s => ({ users: s.users.map(u => u.email === email ? { ...u, status: 'banned' as const } : u) }));
    setUserStatusInDb(email, 'banned');
  },
  unbanUser: (email) => {
    const bans = loadBans();
    bans.delete(email);
    saveBans(bans);
    const susp = loadSuspended();
    susp.delete(email);
    saveSuspended(susp);
    set(s => ({ users: s.users.map(u => u.email === email ? { ...u, status: 'active' as const } : u) }));
    setUserStatusInDb(email, 'active');
  },
  suspendUser: (email) => {
    const susp = loadSuspended();
    susp.add(email);
    saveSuspended(susp);
    set(s => ({ users: s.users.map(u => u.email === email ? { ...u, status: 'suspended' as const } : u) }));
    setUserStatusInDb(email, 'suspended');
  },

  // ── Role management ────────────────────────────────────────────────────────
  changeUserRole: (email, newRole) => {
    set(s => ({
      users: s.users.map(u =>
        u.email === email ? { ...u, role: newRole, roleChangedAt: new Date().toISOString() } as DemoUser : u
      ),
    }));
    // Persist role change to localStorage for the user record
    try {
      const key = `cryptoverse_user_role_override`;
      const overrides = JSON.parse(localStorage.getItem(key) || '{}');
      overrides[email] = { role: newRole, changedAt: new Date().toISOString() };
      localStorage.setItem(key, JSON.stringify(overrides));
    } catch {}
  },
  promoteToSuperAdmin: (email) => {
    const supers = new Set(get().superAdmins);
    supers.add(email);
    const updated = [...supers];
    saveSuperAdmins(updated);
    set(s => ({
      superAdmins: updated,
      users: s.users.map(u =>
        u.email === email ? { ...u, role: 'super_admin', roleChangedAt: new Date().toISOString() } as DemoUser : u
      ),
    }));
    setSuperAdminInDb(email, true);
  },
  demoteSuperAdmin: (email) => {
    const supers = new Set(get().superAdmins);
    supers.delete(email);
    const updated = [...supers];
    saveSuperAdmins(updated);
    set(s => ({
      superAdmins: updated,
      users: s.users.map(u =>
        u.email === email ? { ...u, role: 'admin', roleChangedAt: new Date().toISOString() } as DemoUser : u
      ),
    }));
    setSuperAdminInDb(email, false);
  },

  // ── Ticket actions (live) ──────────────────────────────────────────────────
  resolveTicket: async (nodeId, adminId, response) => {
    const { adminRespond } = await import('./ticketStore').catch(() => ({ adminRespond: async () => {} }));
    await adminRespond(nodeId, adminId, response);
    set(s => ({
      tickets: s.tickets.map(t =>
        t.nodeId === nodeId ? { ...t, status: 'resolved' as const, adminResponse: response, adminId } : t,
      ),
    }));
  },

  escalateTicket: async (nodeId) => {
    await updateTicketPriority(nodeId, 'critical');
    await updateTicketStatus(nodeId, 'admin_handling');
    set(s => ({
      tickets: s.tickets.map(t =>
        t.nodeId === nodeId ? { ...t, priority: 'critical' as const, status: 'admin_handling' as const } : t,
      ),
    }));
  },

  // ── Report / lesson / transaction — local only ────────────────────────────
  submitReport: (data) => {
    const report: DemoReport = {
      ...data,
      id:        makeId('report'),
      status:    'pending',
      createdAt: new Date().toISOString(),
    };
    set(s => ({ reports: [report, ...s.reports] }));
  },
  resolveReport: (id) => set(s => ({ reports: s.reports.map(r => r.id === id ? { ...r, status: 'resolved'  as const } : r) })),
  dismissReport: (id) => set(s => ({ reports: s.reports.map(r => r.id === id ? { ...r, status: 'dismissed' as const } : r) })),
  publishLesson: (id) => set(s => ({ lessons: s.lessons.map(l => l.id === id ? { ...l, status: 'published' as const } : l) })),
  flagLesson:    (id) => set(s => ({ lessons: s.lessons.map(l => l.id === id ? { ...l, status: 'flagged'   as const } : l) })),
  approveTransaction: (id) => set(s => ({ transactions: s.transactions.map(t => t.id === id ? { ...t, status: 'verified'  as const } : t) })),
  rejectTransaction:  (id) => set(s => ({ transactions: s.transactions.map(t => t.id === id ? { ...t, status: 'rejected'  as const } : t) })),
}));


