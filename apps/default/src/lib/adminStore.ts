import { create } from 'zustand';
import { UserProfile } from './authStore';
import { PaymentRecord, PLAN_DURATION_DAYS } from './subscriptionStore';

// ── Keys ──────────────────────────────────────────────────────────────────────
const USERS_KEY    = 'cryptoverse_users';
const SUBS_KEY     = 'cryptoverse_subscriptions_v2';
const AUDIT_KEY    = 'cryptoverse_admin_audit';
const BANS_KEY     = 'cryptoverse_banned_users';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface AdminAuditEntry {
  id:         string;
  adminId:    string;
  adminName:  string;
  action:     'approve_payment' | 'reject_payment' | 'ban_user' | 'unban_user' | 'grant_admin' | 'revoke_admin' | 'adjust_plan';
  targetId:   string;   // userId or paymentId
  targetLabel: string;
  detail:     string;
  timestamp:  string;
}

export interface AdminUserRow extends UserProfile {
  isBanned: boolean;
  totalPaid: number;
  paymentCount: number;
  lastPayment?: string;
}

// ── Persistence helpers ───────────────────────────────────────────────────────
function loadRawUsers(): Record<string, { password: string; profile: UserProfile }> {
  try { return JSON.parse(localStorage.getItem(USERS_KEY) || '{}'); } catch { return {}; }
}
function saveRawUsers(u: Record<string, { password: string; profile: UserProfile }>) {
  localStorage.setItem(USERS_KEY, JSON.stringify(u));
}
function loadAllPayments(): Record<string, PaymentRecord[]> {
  try { return JSON.parse(localStorage.getItem(SUBS_KEY) || '{}'); } catch { return {}; }
}
function saveAllPayments(p: Record<string, PaymentRecord[]>) {
  localStorage.setItem(SUBS_KEY, JSON.stringify(p));
}
function loadAudit(): AdminAuditEntry[] {
  try { return JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]'); } catch { return []; }
}
function saveAudit(a: AdminAuditEntry[]) {
  localStorage.setItem(AUDIT_KEY, JSON.stringify(a.slice(0, 500)));
}
function loadBans(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(BANS_KEY) || '[]')); } catch { return new Set(); }
}
function saveBans(b: Set<string>) {
  localStorage.setItem(BANS_KEY, JSON.stringify([...b]));
}

function makeAuditId() {
  return `aud_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ── Store ─────────────────────────────────────────────────────────────────────
interface AdminState {
  // Data
  auditLog: AdminAuditEntry[];
  bannedIds: Set<string>;

  // Reads
  getAllUsers:       () => AdminUserRow[];
  getAllPayments:    () => PaymentRecord[];
  getPendingPayments: () => PaymentRecord[];

  // Payment actions
  approvePayment: (paymentId: string, userId: string, admin: UserProfile) => void;
  rejectPayment:  (paymentId: string, userId: string, admin: UserProfile, reason: string) => void;

  // User actions
  banUser:       (userId: string, admin: UserProfile) => void;
  unbanUser:     (userId: string, admin: UserProfile) => void;
  grantAdmin:    (userId: string, admin: UserProfile) => void;
  revokeAdmin:   (userId: string, admin: UserProfile) => void;
  adjustPlan:    (userId: string, plan: 'bronze' | 'silver' | 'gold', admin: UserProfile) => void;

  // Refresh (re-read localStorage)
  refresh: () => void;
}

export const useAdminStore = create<AdminState>((set, get) => ({
  auditLog:  loadAudit(),
  bannedIds: loadBans(),

  // ── Reads ────────────────────────────────────────────────────────────────
  getAllUsers: () => {
    const raw      = loadRawUsers();
    const payments = loadAllPayments();
    const banned   = get().bannedIds;

    return Object.values(raw).map(({ profile }) => {
      const userPays  = payments[profile.id] ?? [];
      const totalPaid = userPays
        .filter(p => p.status === 'verified')
        .reduce((s, p) => s + p.amount, 0);
      const lastPay   = userPays[0]?.submittedAt;

      return {
        ...profile,
        isBanned:     banned.has(profile.id),
        totalPaid,
        paymentCount: userPays.length,
        lastPayment:  lastPay,
      } as AdminUserRow;
    });
  },

  getAllPayments: () => {
    const payments = loadAllPayments();
    const all: PaymentRecord[] = [];
    for (const records of Object.values(payments)) all.push(...records);
    return all.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  },

  getPendingPayments: () => {
    return get().getAllPayments().filter(p => p.status === 'pending');
  },

  // ── Approve payment ──────────────────────────────────────────────────────
  approvePayment: (paymentId, userId, admin) => {
    const payments     = loadAllPayments();
    const userPays     = [...(payments[userId] ?? [])];
    const idx          = userPays.findIndex(p => p.id === paymentId);
    if (idx === -1) return;

    const rec     = { ...userPays[idx] };
    const now     = new Date();
    const durDays = rec.kind === 'subscription' && rec.planId
      ? (PLAN_DURATION_DAYS[rec.planId] ?? 30)
      : 0;

    rec.status      = 'verified';
    rec.verifiedAt  = now.toISOString();
    rec.activatedAt = now.toISOString();
    rec.expiresAt   = durDays > 0
      ? new Date(now.getTime() + durDays * 86_400_000).toISOString()
      : undefined;
    rec.manualReview = false;

    userPays[idx]   = rec;
    payments[userId] = userPays;
    saveAllPayments(payments);

    // Also update the user's plan if subscription
    if (rec.kind === 'subscription' && rec.planId) {
      const raw   = loadRawUsers();
      const entry = Object.values(raw).find(e => e.profile.id === userId);
      if (entry) {
        entry.profile.plan = rec.planId as 'bronze' | 'silver' | 'gold';
        entry.profile.planExpiry = rec.expiresAt;
        saveRawUsers(raw);
      }
    }

    // Audit
    const audit = loadAudit();
    const entry: AdminAuditEntry = {
      id:          makeAuditId(),
      adminId:     admin.id,
      adminName:   admin.displayName,
      action:      'approve_payment',
      targetId:    paymentId,
      targetLabel: `${rec.kind} · ${(rec.planId ?? rec.pkgLabel) ?? ''} · $${rec.amount.toFixed(2)}`,
      detail:      `Approved payment ${paymentId} for user ${userId}`,
      timestamp:   now.toISOString(),
    };
    audit.unshift(entry);
    saveAudit(audit);
    set({ auditLog: audit });
  },

  // ── Reject payment ───────────────────────────────────────────────────────
  rejectPayment: (paymentId, userId, admin, reason) => {
    const payments = loadAllPayments();
    const userPays = [...(payments[userId] ?? [])];
    const idx      = userPays.findIndex(p => p.id === paymentId);
    if (idx === -1) return;

    const rec = { ...userPays[idx] };
    rec.status          = 'rejected';
    rec.rejectionReason = reason;

    userPays[idx]    = rec;
    payments[userId] = userPays;
    saveAllPayments(payments);

    const audit = loadAudit();
    const entry: AdminAuditEntry = {
      id:          makeAuditId(),
      adminId:     admin.id,
      adminName:   admin.displayName,
      action:      'reject_payment',
      targetId:    paymentId,
      targetLabel: `${rec.kind} · $${rec.amount.toFixed(2)}`,
      detail:      `Rejected: ${reason}`,
      timestamp:   new Date().toISOString(),
    };
    audit.unshift(entry);
    saveAudit(audit);
    set({ auditLog: audit });
  },

  // ── Ban user ─────────────────────────────────────────────────────────────
  banUser: (userId, admin) => {
    const banned = get().bannedIds;
    banned.add(userId);
    saveBans(banned);

    const audit = loadAudit();
    const raw   = loadRawUsers();
    const profile = Object.values(raw).find(e => e.profile.id === userId)?.profile;
    audit.unshift({
      id:          makeAuditId(),
      adminId:     admin.id,
      adminName:   admin.displayName,
      action:      'ban_user',
      targetId:    userId,
      targetLabel: profile?.displayName ?? userId,
      detail:      `User ${profile?.email ?? userId} banned`,
      timestamp:   new Date().toISOString(),
    });
    saveAudit(audit);
    set({ bannedIds: new Set(banned), auditLog: audit });
  },

  // ── Unban user ───────────────────────────────────────────────────────────
  unbanUser: (userId, admin) => {
    const banned = get().bannedIds;
    banned.delete(userId);
    saveBans(banned);

    const audit = loadAudit();
    const raw   = loadRawUsers();
    const profile = Object.values(raw).find(e => e.profile.id === userId)?.profile;
    audit.unshift({
      id:          makeAuditId(),
      adminId:     admin.id,
      adminName:   admin.displayName,
      action:      'unban_user',
      targetId:    userId,
      targetLabel: profile?.displayName ?? userId,
      detail:      `User ${profile?.email ?? userId} unbanned`,
      timestamp:   new Date().toISOString(),
    });
    saveAudit(audit);
    set({ bannedIds: new Set(banned), auditLog: audit });
  },

  // ── Grant admin ──────────────────────────────────────────────────────────
  grantAdmin: (userId, admin) => {
    const raw   = loadRawUsers();
    const entry = Object.values(raw).find(e => e.profile.id === userId);
    if (!entry) return;
    entry.profile.isAdmin = true;
    saveRawUsers(raw);

    const audit = loadAudit();
    audit.unshift({
      id:          makeAuditId(),
      adminId:     admin.id,
      adminName:   admin.displayName,
      action:      'grant_admin',
      targetId:    userId,
      targetLabel: entry.profile.displayName,
      detail:      `Admin role granted to ${entry.profile.email}`,
      timestamp:   new Date().toISOString(),
    });
    saveAudit(audit);
    set({ auditLog: audit });
  },

  // ── Revoke admin ─────────────────────────────────────────────────────────
  revokeAdmin: (userId, admin) => {
    const raw   = loadRawUsers();
    const entry = Object.values(raw).find(e => e.profile.id === userId);
    if (!entry) return;
    entry.profile.isAdmin = false;
    saveRawUsers(raw);

    const audit = loadAudit();
    audit.unshift({
      id:          makeAuditId(),
      adminId:     admin.id,
      adminName:   admin.displayName,
      action:      'revoke_admin',
      targetId:    userId,
      targetLabel: entry.profile.displayName,
      detail:      `Admin role revoked from ${entry.profile.email}`,
      timestamp:   new Date().toISOString(),
    });
    saveAudit(audit);
    set({ auditLog: audit });
  },

  // ── Adjust plan ──────────────────────────────────────────────────────────
  adjustPlan: (userId, plan, admin) => {
    const raw   = loadRawUsers();
    const entry = Object.values(raw).find(e => e.profile.id === userId);
    if (!entry) return;
    const prev = entry.profile.plan;
    entry.profile.plan = plan;
    if (plan !== 'bronze') {
      entry.profile.planExpiry = new Date(
        Date.now() + (PLAN_DURATION_DAYS[plan] ?? 30) * 86_400_000,
      ).toISOString();
    } else {
      entry.profile.planExpiry = undefined;
    }
    saveRawUsers(raw);

    const audit = loadAudit();
    audit.unshift({
      id:          makeAuditId(),
      adminId:     admin.id,
      adminName:   admin.displayName,
      action:      'adjust_plan',
      targetId:    userId,
      targetLabel: entry.profile.displayName,
      detail:      `Plan changed from ${prev} → ${plan}`,
      timestamp:   new Date().toISOString(),
    });
    saveAudit(audit);
    set({ auditLog: audit });
  },

  // ── Refresh ──────────────────────────────────────────────────────────────
  refresh: () => {
    set({ auditLog: loadAudit(), bannedIds: loadBans() });
  },
}));
