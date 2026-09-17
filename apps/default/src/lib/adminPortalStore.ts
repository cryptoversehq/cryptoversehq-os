import { create } from 'zustand';
import { fetchAllAdminUsers, type AdminUserRecord } from './adminUsersApi';
import { fetchTickets, Ticket, updateTicketStatus, updateTicketPriority } from './ticketStore';
import { MODULES } from '../components/Academy';

// ── Keys ─────────────────────────────────────────────────────────────────────
// Batch C2 deletions: the cryptoverse_banned_users / cryptoverse_suspended_users
// / cryptoverse_super_admins key groups and every helper that touched them
// (loadBans, saveBans, loadSuspended, saveSuspended, loadSuperAdmins,
// saveSuperAdmins, ensureSuperAdminsPersisted) are gone. Status and role live in
// public.users: read via GET /api/admin/users, written via
// POST /api/admin/users/:id/status | /role.
const TWO_MAN_KEY   = 'cryptoverse_twoman_requests';
const NOTIF_CTR_KEY = 'cryptoverse_portal_notifs';

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

/**
 * Map one SERVER roster record (GET /api/admin/users — Batch C2) to the portal's
 * DemoUser shape.
 *
 * This replaces `userRecordToDemo` (Taskade) and the localStorage mirrors
 * (`cryptoverse_users`, `cryptoverse_banned_users`, `cryptoverse_suspended_users`,
 * `cryptoverse_super_admins`): role and status now come from public.users, which
 * is exactly what `authenticate()` enforces on every request. A browser can no
 * longer influence what the panel believes about an account.
 */
function adminUserToDemo(r: AdminUserRecord): DemoUser {
  return {
    id:       r.id,
    name:     r.display_name || r.email.split('@')[0],
    email:    r.email,
    plan:     r.plan || 'free',
    status:   (r.status ?? 'active') as DemoUser['status'],
    joinedAt: r.created_at || new Date().toISOString(),
    balance:  typeof r.balance === 'number' ? r.balance : 0,
    trades:   0,
    winRate:  0,
    country:  '',
    flag:     '',
    role:     r.role || 'user',
  };
}

// Batch C2: `userRecordToDemo`, `syncLegacyUsersCache` and `legacyUsersToDemo`
// were deleted here. They built the panel's roster from the Taskade users project
// and mirrored it into the cryptoverse_users / banned / suspended localStorage
// keys. The roster now comes from GET /api/admin/users via adminUserToDemo()
// above, and `syncLegacyUsersCache` was the last thing writing that mirror.

// ── Two-man persistence ───────────────────────────────────────────────────────
function loadTwoMan(): TwoManRequest[] {
  try { return JSON.parse(localStorage.getItem(TWO_MAN_KEY) || '[]'); } catch { return []; }
}
function saveTwoMan(r: TwoManRequest[]) {
  localStorage.setItem(TWO_MAN_KEY, JSON.stringify(r));
}

// ─────────────────────────────────────────────────────────────────────────────
// PORTAL SECTIONS — identifiers only (Batch C2)
//
// What remains is the list of section ids the portal nav (NAV_ITEMS in
// AdminPortalLayout.tsx) and the route guards (SectionGuard in AdminRoutes.tsx)
// refer to. Access is decided from the SERVER-provided role, not from any
// per-section grant list: developer / founder / super_admin see everything, and
// the other two admin roles are scoped to Subscriptions.
// ─────────────────────────────────────────────────────────────────────────────

/** Every section a Super Admin can hand out to a section-scoped Admin. */
export const ADMIN_SECTIONS = [
  { id: 'users',        label: 'User Management',         icon: '👥' },
  { id: 'content',      label: 'Content Management',       icon: '📚' },
  { id: 'transactions', label: 'Transaction Management',   icon: '💳' },
  // "Super Admin – Subscriptions" role: grants the manual Pro/Pro+ entitlement
  // tool at /admin/subscriptions. Assignable via Admin → Users permissions.
  { id: 'subscriptions', label: 'Subscription Management', icon: '👑' },
  { id: 'competitions', label: 'Competition Management',   icon: '🏆' },
  { id: 'events',       label: 'Events Management',        icon: '📅' },
  { id: 'reports',      label: 'Reports Management',       icon: '📋' },
  { id: 'copyTrading',  label: 'Copy Trading Management',  icon: '🔄' },
  { id: 'onChain',      label: 'On-Chain Management',      icon: '⛓️' },
  { id: 'nft',          label: 'NFT Management',           icon: '🖼️' },
  { id: 'sentiment',    label: 'Sentiment Management',     icon: '🧠' },
] as const;

export type AdminSectionId = typeof ADMIN_SECTIONS[number]['id'];

// Batch C2: `AdminPermissions`, the cryptoverse_admin_section_permissions
// helpers, `isPersistedSuperAdmin`, `hasAccess` and `getAdminSections` were
// deleted here. `hasAccess()` was the H-007 bypass window (a browser-editable
// grant list consulted by the route guards); SectionGuard now decides purely from
// the server-provided role. ADMIN_SECTIONS / AdminSectionId stay: the portal nav
// and routes still use them as section identifiers.

// ── Store ─────────────────────────────────────────────────────────────────────
interface AdminPortalState {
  users:          DemoUser[];
  transactions:   DemoTransaction[];
  tickets:        Ticket[];          // ← now uses live Ticket type
  reports:        DemoReport[];
  lessons:        DemoLesson[];
  twoManRequests: TwoManRequest[];
  loadingUsers:   boolean;
  loadingTickets: boolean;

  // Section-scoped grants are gone (Batch C2). They lived in
  // cryptoverse_admin_section_permissions + the Taskade @cv_sections field, which
  // had NO server counterpart — so the panel could not have read them from
  // public.users anyway. Portal section access is role-derived: developer /
  // founder / super_admin see everything, the other admin roles are scoped to
  // Subscriptions by SectionGuard. Real per-section grants would need a
  // users.sections column + an endpoint — a feature, not a mirror.

  // Load live data
  loadUsers:   () => Promise<void>;
  loadTickets: () => Promise<void>;

  // Two-man rule
  requestTwoMan: (req: Omit<TwoManRequest, 'id' | 'createdAt' | 'approvals' | 'status'>) => TwoManRequest;
  approveTwoMan: (reqId: string, adminId: string, adminName: string) => TwoManRequest | null;
  rejectTwoMan:  (reqId: string, adminId: string) => void;

  // Account status is a direct server call now — see AdminUsers.tsx.

  // Role management is a direct server call now (POST /api/admin/users/:id/role).

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

// Batch C2: the localStorage super-admin seed that used to run here is gone.
// Super-admin status is public.users.role, read from GET /api/admin/users — there
// is no client-side privilege list left to seed (and seeding one was the H-007
// class of problem: a browser-editable store the API never consulted).

export const useAdminPortalStore = create<AdminPortalState>((set, get) => ({
  users:          [],
  transactions:   [],
  tickets:        [],
  reports:        [],
  lessons:        buildLessonsFromAcademy(),
  twoManRequests: loadTwoMan(),
  loadingUsers:   false,
  loadingTickets: false,

  // ── Load the roster from the SERVER (Batch C2) ────────────────────────────
  // GET /api/admin/users is the single source of truth for role + status. There
  // is deliberately no localStorage fallback: an editable mirror that the API
  // does not enforce is worse than an honest empty list, and AdminUsers surfaces
  // its own fetch failure.
  loadUsers: async () => {
    set({ loadingUsers: true });
    try {
      const records = await fetchAllAdminUsers();
      set({ users: records.map(adminUserToDemo) });
    } catch (err) {
      console.error('[adminPortalStore] roster load failed', err);
      set({ users: [] });
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

  // Account status changes left this store in Batch C2: they are a direct server
  // call (POST /api/admin/users/:id/status) made by AdminUsers.tsx through
  // adminUsersApi.setAdminUserStatus(), which writes the column the API enforces.

  // Role management left this store in Batch C2: it is a direct server call
  // (POST /api/admin/users/:id/role) made by AdminUsers.tsx. public.users.role is
  // the single source of truth — the local cryptoverse_user_role_override mirror
  // and the super-admin list that used to live here are gone.

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


