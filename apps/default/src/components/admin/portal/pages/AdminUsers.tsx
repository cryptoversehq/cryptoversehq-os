/**
 * AdminUsers.tsx — /admin/users
 *
 * Unified user management (the former /admin/role-management page is merged in).
 *
 * ── DATA ──────────────────────────────────────────────────────────────────────
 *   GET /api/admin/users → [{ id, email, role, plan, balance,
 *                             last_seen_at, last_seen_ip, created_at }]
 *
 *   • last_seen_at  is the authoritative activity signal.
 *   • When it is null we fall back to the device's recorded login history
 *     (loginHistoryStore), matched by the user's Taskade record id.
 *
 * ── WRITES ────────────────────────────────────────────────────────────────────
 *   role         POST   /api/admin/users/:id/role        { role }
 *   subscription POST   /api/admin/subscriptions/grant | /revoke
 *   balance      POST   /api/admin/users/:id/balance     { delta, reason }
 *   delete       DELETE /api/admin/users/:id   +  Taskade login record
 *   ban/suspend  the adminPortalStore actions (email-keyed)
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search, UserX, UserCheck, Shield, X, Crown as CrownIcon, ShieldCheck,
  Calendar, RefreshCw, Loader2, AlertTriangle, Wallet, CreditCard, Check,
  Eye, Trash2, Wifi, WifiOff, CircleSlash, Monitor, Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAdminManagementStore } from '@/lib/adminManagementStore';
// Batch C2.5: the cryptoverse_admin_session store is gone — the admin identity and
// level come from GET /api/me (useAdminIdentity + roleLevel).
import { useAuthStore } from '@/lib/authStore';
import { deleteUser } from '@/lib/authApi';
import { getLoginHistory, type LoginEvent } from '@/lib/loginHistoryStore';
import { ApiForbiddenError, apiDelete, apiGet, apiPost, hasFullAdminAccess, useAdminIdentity, roleLevel } from '@/lib/adminApi';
import { fetchAllAdminUsers, findAdminUserByEmail, recordAdminViewAs, setAdminUserStatus, type AdminUserRecord } from '@/lib/adminUsersApi';

// ── Roles ─────────────────────────────────────────────────────────────────────
/** The app's full role vocabulary, including the two server-only roles. */
export type RoleId =
  | 'user' | 'vip' | 'admin' | 'senior_admin'
  | 'subscription_admin' | 'support_admin'
  | 'super_admin' | 'founder' | 'developer';

const ROLE_META: Record<RoleId, { label: string; color: string; bg: string; border: string; rank: number; legacy?: boolean }> = {
  user:               { label: 'User',               color: '#94a3b8', bg: '#94a3b812', border: '#94a3b830', rank: 0 },
  vip:                { label: 'VIP',                color: '#38bdf8', bg: '#38bdf812', border: '#38bdf830', rank: 1, legacy: true },
  admin:              { label: 'Admin',              color: '#f59e0b', bg: '#f59e0b12', border: '#f59e0b30', rank: 2, legacy: true },
  senior_admin:       { label: 'Senior Admin',       color: '#fb7185', bg: '#fb718512', border: '#fb718530', rank: 3, legacy: true },
  subscription_admin: { label: 'Subscription Admin', color: '#22d3ee', bg: '#22d3ee12', border: '#22d3ee30', rank: 4 },
  support_admin:      { label: 'Support Admin',      color: '#34d399', bg: '#34d39912', border: '#34d39930', rank: 4 },
  super_admin:        { label: 'Super Admin',        color: '#ef4444', bg: '#ef444412', border: '#ef444430', rank: 5 },
  founder:            { label: 'Founder',            color: '#a78bfa', bg: '#a78bfa12', border: '#a78bfa30', rank: 6 },
  developer:          { label: 'Developer',          color: '#34d399', bg: '#34d39912', border: '#34d39930', rank: 7 },
};

/** Selectable — exactly what POST /api/admin/users/:id/role accepts. */
const ASSIGNABLE_ROLES: RoleId[] = ['user', 'subscription_admin', 'support_admin', 'super_admin', 'founder', 'developer'];
/** Retired — displayed read-only when held, never selectable. */
const LEGACY_ROLES: RoleId[] = ['vip', 'admin', 'senior_admin'];
const ALL_ROLE_ROWS: RoleId[] = [...ASSIGNABLE_ROLES, ...LEGACY_ROLES];

const PLAN_META: Record<string, { label: string; color: string; emoji: string }> = {
  free:     { label: 'Free', color: 'text-white/40',  emoji: '🆓' },
  pro:      { label: 'Pro',  color: 'text-blue-400',  emoji: '⭐' },
  pro_plus: { label: 'Pro+', color: 'text-amber-400', emoji: '👑' },
};

/** One row of GET /api/admin/users */
export interface ServerUser {
  id: string;
  email: string;
  role: string;
  plan: string;
  balance?: number | null;
  last_seen_at?: string | null;
  last_seen_ip?: string | null;
  created_at: string;
}
export interface UserSubscription { id: string; plan_id: string; status: string; starts_at: string; ends_at: string; granted_by: string; created_at: string; }

const ACTIVE_WINDOW_MS = 5 * 60 * 1000;   // "online" = seen in the last 5 minutes
const DAY_MS = 86_400_000;

type BucketKey = 'active7d' | 'in1w1m' | 'in1m3m' | 'in3m6m' | 'in6m1y' | 'in1y2y' | 'in2y' | 'none';

const BUCKETS: { key: BucketKey; label: string; range: string; color: string }[] = [
  { key: 'active7d', label: 'Active',           range: '≤ 7 days',      color: '#34d399' },
  { key: 'in1w1m',   label: 'Inactive 1w–1m',   range: '7–30 days',     color: '#a3e635' },
  { key: 'in1m3m',   label: 'Inactive 1–3m',    range: '30–90 days',    color: '#fbbf24' },
  { key: 'in3m6m',   label: 'Inactive 3–6m',    range: '90–180 days',   color: '#fb923c' },
  { key: 'in6m1y',   label: 'Inactive 6–12m',   range: '180–365 days',  color: '#f97316' },
  { key: 'in1y2y',   label: 'Inactive 1–2y',    range: '1–2 years',     color: '#ef4444' },
  { key: 'in2y',     label: 'Inactive > 2y',    range: '> 2 years',     color: '#b91c1c' },
  { key: 'none',     label: 'No activity',      range: 'never recorded',color: '#64748b' },
];

function bucketOf(lastSeen: string | null): BucketKey {
  if (!lastSeen) return 'none';
  const t = new Date(lastSeen).getTime();
  if (!Number.isFinite(t)) return 'none';
  const d = (Date.now() - t) / DAY_MS;
  if (d <= 7)   return 'active7d';
  if (d <= 30)  return 'in1w1m';
  if (d <= 90)  return 'in1m3m';
  if (d <= 180) return 'in3m6m';
  if (d <= 365) return 'in6m1y';
  if (d <= 730) return 'in1y2y';
  return 'in2y';
}

function fmtWhen(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}
function fmtAgo(iso: string | null): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const d = Math.floor(ms / DAY_MS);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 30) return `${d} days ago`;
  if (d < 365) return `${Math.floor(d / 30)} months ago`;
  return `${Math.floor(d / 365)} year(s) ago`;
}

interface Row {
  id: string; email: string; name: string;
  role: RoleId; plan: string; balance: number | null;
  joinedAt: string;
  lastSeenAt: string | null;
  lastSeenIp: string | null;
  online: boolean;
  activityKnown: boolean;
  bucket: BucketKey;
  taskadeId: string | null;
  hasTaskade: boolean;
  status: 'active' | 'suspended' | 'banned';
}

function RolePill({ role }: { role: RoleId }) {
  const m = ROLE_META[role] ?? ROLE_META.user;
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap"
      style={{ backgroundColor: m.bg, color: m.color, border: `1px solid ${m.border}` }}>
      {m.label}
      {m.legacy && <span className="text-[8px] font-black opacity-70 tracking-wide">LEGACY</span>}
    </span>
  );
}

function StatusPill({ status }: { status: Row['status'] }) {
  if (status === 'active') return null;
  return (
    <span className={cn('inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border',
      status === 'banned' ? 'bg-red-500/15 border-red-500/30 text-red-400' : 'bg-amber-500/15 border-amber-500/30 text-amber-400')}>
      {status === 'banned' ? <CircleSlash className="h-2.5 w-2.5" /> : <AlertTriangle className="h-2.5 w-2.5" />}
      {status}
    </span>
  );
}

export function AdminUsers() {
  const { logAction } = useAdminManagementStore();
  const { startUserView, viewState, endUserView } = useAuthStore();
  const identity = useAdminIdentity();
  const canManage = hasFullAdminAccess(identity?.role);
  /** Deletion: owner tier, or any role the API's requireAdminWrite accepts. */
  const canDelete = canManage || roleLevel(identity?.role) >= 4;

  const [loading, setLoading]     = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [serverUsers, setServerUsers] = useState<AdminUserRecord[]>([]);

  const [search, setSearch]         = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | RoleId>('all');
  const [planFilter, setPlanFilter] = useState<'all' | 'free' | 'pro' | 'pro_plus'>('all');
  const [bucketFilter, setBucketFilter] = useState<'all' | BucketKey>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [confirmRole, setConfirmRole] = useState<{ id: string; email: string; from: RoleId; to: RoleId } | null>(null);
  const [roleBusy, setRoleBusy]       = useState(false);
  const [subBusy, setSubBusy]         = useState<string | null>(null);
  const [history, setHistory]         = useState<UserSubscription[]>([]);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [logins, setLogins]           = useState<LoginEvent[]>([]);
  /** Which user's login-history list is expanded (null = collapsed). */
  const [loginsFor, setLoginsFor]     = useState<string | null>(null);
  const [balanceAmount, setBalanceAmount] = useState('');
  const [balanceReason, setBalanceReason] = useState('');
  const [balanceBusy, setBalanceBusy]     = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting]           = useState(false);

  // ── Load: the SERVER roster (Batch C2 — no Taskade enrichment) ────────────
  // fetchAllAdminUsers() walks every page, so this is the COMPLETE roster — the
  // old call asked for limit=500 and silently got whatever the server cap
  // allowed (100 before C2, 500 now).
  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setServerUsers(await fetchAllAdminUsers());
    } catch (err) {
      if (err instanceof ApiForbiddenError) setLoadError('The server refused the request (401/403).');
      else setLoadError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  // ── Rows ──────────────────────────────────────────────────────────────────
  // Built purely from the SERVER roster (Batch C2): role and status come from
  // public.users, so the table can no longer show "active" for an account the
  // API is refusing. The Taskade/localStorage mirror lookup that used to enrich
  // these rows is gone — including its silent `?? 'active'` fallback.
  const rows: Row[] = useMemo(() => serverUsers.map(u => {
    // last_seen_at is the authoritative activity signal (server-side).
    const lastSeenAt = u.last_seen_at || null;
    const t = lastSeenAt ? new Date(lastSeenAt).getTime() : NaN;
    return {
      id:         u.id,
      email:      u.email,
      name:       u.display_name || u.email.split('@')[0],
      role:       ((u.role as RoleId) || 'user'),
      plan:       u.plan ?? '',
      balance:    typeof u.balance === 'number' ? u.balance : null,
      joinedAt:   u.created_at,
      lastSeenAt,
      lastSeenIp: u.last_seen_ip || null,
      online:     Number.isFinite(t) && (Date.now() - t) < ACTIVE_WINDOW_MS,
      activityKnown: !!lastSeenAt,
      bucket:     bucketOf(lastSeenAt),
      // No Taskade node id any more: the device-local login history is keyed by
      // it and can no longer be matched, so the server's last_seen_at stands alone.
      taskadeId:  null,
      hasTaskade: true,
      status:     ((u.status ?? 'active') as Row['status']),
    };
  }), [serverUsers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter(r => {
        const matchSearch = !q || r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q);
        const matchRole   = roleFilter === 'all' || r.role === roleFilter;
        const matchPlan   = planFilter === 'all' || r.plan === planFilter;
        const matchBucket = bucketFilter === 'all' || r.bucket === bucketFilter;
        return matchSearch && matchRole && matchPlan && matchBucket;
      })
      .sort((a, b) => (ROLE_META[b.role]?.rank ?? 0) - (ROLE_META[a.role]?.rank ?? 0)
        || a.email.localeCompare(b.email));
  }, [rows, search, roleFilter, planFilter, bucketFilter]);

  const stats = useMemo(() => ({
    total:   rows.length,
    online:  rows.filter(r => r.online).length,
    owners:  rows.filter(r => ['developer', 'founder', 'super_admin'].includes(r.role)).length,
    admins:  rows.filter(r => r.role === 'admin' || r.role === 'senior_admin' || r.role === 'subscription_admin' || r.role === 'support_admin').length,
    paid:    rows.filter(r => r.plan === 'pro' || r.plan === 'pro_plus').length,
    blocked: rows.filter(r => r.status === 'banned' || r.status === 'suspended').length,
  }), [rows]);

  const bucketCounts = useMemo(() => {
    const counts: Record<BucketKey, number> = { active7d: 0, in1w1m: 0, in1m3m: 0, in3m6m: 0, in6m1y: 0, in1y2y: 0, in2y: 0, none: 0 };
    for (const r of rows) counts[r.bucket] += 1;
    return counts;
  }, [rows]);

  const selected = rows.find(r => r.id === selectedId) ?? null;

  // Subscription history
  useEffect(() => {
    if (!selected) { setHistory([]); return; }
    let canceled = false;
    setHistoryBusy(true);
    (async () => {
      try {
        const res = await apiGet<{ subscriptions?: UserSubscription[] }>(
          `/api/admin/subscriptions/user/${encodeURIComponent(selected.id)}`);
        if (!canceled) setHistory(res?.subscriptions ?? []);
      } catch { if (!canceled) setHistory([]); }
      finally { if (!canceled) setHistoryBusy(false); }
    })();
    return () => { canceled = true; };
  }, [selected]);

  // Recorded login events (device-local fallback / detail)
  useEffect(() => {
    setLogins(selected?.taskadeId ? getLoginHistory(selected.taskadeId) : []);
  }, [selected]);

  // ── Audit ─────────────────────────────────────────────────────────────────
  type AuditAction = 'change_role' | 'adjust_plan' | 'ban_user' | 'unban_user' | 'delete_admin';
  const writeAudit = useCallback((action: AuditAction, target: string, reason: string) => {
    logAction?.({
      adminId:     identity?.email ?? 'unknown',
      adminLevel:  roleLevel(identity?.role),
      adminName:   identity?.email ?? 'Admin',
      action,
      targetId:    target,
      targetLabel: target,
      timestamp:   new Date().toISOString(),
      reason,
      status:      'completed',
      revertable:  false,
    });
  }, [logAction, identity?.email, identity?.role]);

  // ── Moderation status (Batch C2: SERVER-authoritative) ────────────────────
  // Calls POST /api/admin/users/:id/status — the same column authenticate()
  // enforces — so a ban finally blocks the API and ends the target's live
  // sessions. The id comes from the server row itself (no local roster lookup),
  // and the list is reloaded from the server afterwards, so the table always
  // shows what the server holds.
  const [moderationBusy, setModerationBusy] = useState<'active' | 'suspended' | 'banned' | null>(null);
  const setStatus = useCallback(async (next: 'active' | 'suspended' | 'banned') => {
    if (!selected) return;
    setModerationBusy(next);
    try {
      const result = await setAdminUserStatus(selected.id, next);

      if (next === 'banned') writeAudit('ban_user', selected.email, 'Banned');
      else if (next === 'active') writeAudit('unban_user', selected.email, 'Unbanned');

      const revoked = result.sessions_revoked > 0 ? ` ${result.sessions_revoked} session(s) ended.` : '';
      toast.success(`${selected.email} is now ${result.after_status}.${revoked}`);
      await reload();
    } catch (err) {
      toast.error((err as Error)?.message ?? `Could not set the status to ${next}.`);
    } finally {
      setModerationBusy(null);
    }
  }, [selected, writeAudit, reload]);

  // ── Role (server accepts only the 6 assignable roles) ─────────────────────
  const applyRoleChange = async () => {
    if (!confirmRole) return;
    const { id, email, to } = confirmRole;
    setConfirmRole(null);
    setRoleBusy(true);
    try {
      await apiPost(`/api/admin/users/${encodeURIComponent(id)}/role`,
        { role: to }, { 'Idempotency-Key': `role-${id}-${Date.now()}` });
      writeAudit('change_role', email, `Role → ${ROLE_META[to].label}`);
      toast.success(`${email} is now ${ROLE_META[to].label}.`);
      await reload();
    } catch (err) {
      const msg = (err as Error).message;
      if (/404|405/.test(msg)) toast.error('Role changes are not enabled on the server yet.');
      else if (err instanceof ApiForbiddenError) toast.error('The server refused the change (403).');
      else toast.error(msg);
    } finally {
      setRoleBusy(false);
    }
  };

  // ── Subscription ──────────────────────────────────────────────────────────
  const applySubscription = async (planId: 'pro' | 'pro_plus' | 'free') => {
    if (!selected) return;
    setSubBusy(planId);
    try {
      if (planId === 'free') {
        await apiPost('/api/admin/subscriptions/revoke',
          { target_user_id: selected.id, note: 'Revoked from Admin → Users' },
          { 'Idempotency-Key': `revoke-${selected.id}-${Date.now()}` });
      } else {
        await apiPost('/api/admin/subscriptions/grant',
          { target_user_id: selected.id, plan_id: planId, duration_days: 30, note: 'Granted from Admin → Users' },
          { 'Idempotency-Key': `grant-${selected.id}-${Date.now()}` });
      }
      writeAudit('adjust_plan', selected.email, `Subscription → ${planId}`);
      toast.success(`${PLAN_META[planId].label} applied to ${selected.email}`);
      await reload();
    } catch (err) {
      if (err instanceof ApiForbiddenError) toast.error('The server refused the change (403).');
      else toast.error((err as Error).message);
    } finally {
      setSubBusy(null);
    }
  };

  // ── Balance ───────────────────────────────────────────────────────────────
  const applyBalance = async (sign: 1 | -1) => {
    if (!selected) return;
    const amount = Number(balanceAmount);
    if (!Number.isFinite(amount) || amount <= 0) { toast.error('Enter a positive amount.'); return; }
    setBalanceBusy(true);
    try {
      await apiPost(`/api/admin/users/${encodeURIComponent(selected.id)}/balance`,
        { delta: sign * Math.abs(amount), reason: balanceReason.trim() || 'Admin adjustment' },
        { 'Idempotency-Key': `bal-${selected.id}-${Date.now()}` });
      toast.success(`${sign > 0 ? 'Credited' : 'Debited'} ${amount} for ${selected.email}`);
      setBalanceAmount(''); setBalanceReason('');
      await reload();
    } catch (err) {
      const msg = (err as Error).message;
      if (/404|405/.test(msg)) toast.error('Balance adjustment is not enabled on the server yet.');
      else if (err instanceof ApiForbiddenError) toast.error('The server refused the change (403).');
      else toast.error(msg);
    } finally {
      setBalanceBusy(false);
    }
  };

  // ── View as user (read-only) — Batch C2: server-backed ─────────────────────
  // The target is read from the SERVER (GET /api/admin/users/:userId through
  // findAdminUserByEmail), and the action is recorded server-side
  // (POST /api/admin/view-as). Nothing is impersonated: the browser keeps the
  // admin's own cookie, `viewState.isViewing` turns the app read-only, and no
  // data is written on the target's account.
  const [viewBusy, setViewBusy] = useState<string | null>(null);
  const handleViewAsUser = async (email: string) => {
    setViewBusy(email);
    try {
      const record = await findAdminUserByEmail(email);
      if (!record) { toast.error(`No server account record for ${email}.`); return; }

      // The portal's server-verified identity goes in: an admin who signed in only
      // at /admin/login has no app session, which used to fail as "Not logged in."
      const res = await startUserView(record, identity ? { email: identity.email, role: identity.role } : undefined);
      if (!res.success) { toast.error(res.error ?? 'Could not start user view.'); return; }

      // Server-side audit row. Best-effort by design: a refused audit write must
      // not stop an admin from viewing an account they are authorised to see —
      // the local audit below is already recorded, and the failure is logged.
      void Promise.resolve(recordAdminViewAs(record.id)).catch(err => {
        console.warn('[AdminUsers] view-as audit write failed', err);
      });

      writeAudit('change_role', email, 'Started read-only user view');
      window.location.assign('/dashboard');
    } catch (err) {
      toast.error((err as Error)?.message ?? 'Could not start user view.');
    } finally {
      setViewBusy(null);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDeleteUser = async () => {
    if (!selected) return;
    const { id, email } = selected;
    setDeleting(true);
    const notes: string[] = [];
    try {
      await apiDelete(`/api/admin/users/${encodeURIComponent(id)}`);
      notes.push('database record deleted');
    } catch (err) {
      const m = (err as Error).message;
      notes.push(/404|405/.test(m) ? 'database delete failed (endpoint missing)' : `database delete failed (${m})`);
    }
    if (selected.hasTaskade) {
      const r = await deleteUser(email);
      notes.push(r.ok ? 'login account deleted' : `login account not deleted (${r.error ?? 'unknown'})`);
    } else {
      notes.push('no login account to delete');
    }
    writeAudit('delete_admin', email, 'User deleted');
    setDeleting(false);
    setConfirmDelete(false);
    setSelectedId(null);
    toast.success(`Delete requested for ${email}`, { description: notes.join(' · ') });
    await reload();
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5 text-white">
      {/* Impersonation banner — only the ADMIN sees this */}
      {viewState.isViewing && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-sky-500/25 bg-sky-500/10 px-4 py-3">
          <Eye className="h-4 w-4 text-sky-400" />
          <p className="text-xs text-sky-200 flex-1 min-w-[200px]">
            You are viewing the app as <b>{viewState.targetUser}</b> — read-only. The user is not notified.
          </p>
          <button onClick={() => { endUserView(); toast.success('User view ended.'); }}
            className="px-3 py-1.5 rounded-xl bg-sky-500/20 border border-sky-500/30 text-sky-200 text-[11px] font-bold hover:bg-sky-500/30 transition-all">
            Exit user view
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-11 w-11 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
          <Shield className="h-5 w-5 text-blue-400" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-lg font-black text-white flex items-center gap-2">
            User Management
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 tracking-wide">
              SOURCE: DATABASE
            </span>
          </h1>
          <p className="text-[11px] text-white/35">
            Roles, subscriptions, balances, activity and moderation · {stats.total} user{stats.total === 1 ? '' : 's'}
          </p>
        </div>
        <button onClick={() => void reload()} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-[11px] text-white/50 hover:text-white hover:bg-white/10 transition-all disabled:opacity-40">
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} /> Refresh
        </button>
      </div>

      {loadError && (
        <div className="flex items-center gap-2 text-red-300 text-xs bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" /> {loadError}
        </div>
      )}

      {/* Overview stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {[
          { label: 'Total',   value: stats.total,   color: '#60a5fa', icon: '👥' },
          { label: 'Online',  value: stats.online,  color: '#34d399', icon: '🟢' },
          { label: 'Owners',  value: stats.owners,  color: '#a78bfa', icon: '👑' },
          { label: 'Admins',  value: stats.admins,  color: '#f59e0b', icon: '🛡️' },
          { label: 'Paid',    value: stats.paid,    color: '#38bdf8', icon: '💎' },
          { label: 'Blocked', value: stats.blocked, color: '#dc2626', icon: '🚫' },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3 border bg-white/[0.03] border-white/8">
            <p className="text-lg font-black font-mono" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[10px] mt-0.5 text-white/40">{s.icon} {s.label}</p>
          </div>
        ))}
      </div>

      {/* Activity duration stats */}
      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-widest font-semibold text-white/30 flex items-center gap-1.5">
          <Clock className="h-3 w-3" /> User activity — by last seen
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {BUCKETS.map(b => {
            const active = bucketFilter === b.key;
            return (
              <button key={b.key}
                onClick={() => setBucketFilter(active ? 'all' : b.key)}
                title={`${b.label} · ${b.range}`}
                className={cn('rounded-xl p-3 border text-left transition-all',
                  active ? 'border-white/25 bg-white/[0.07]' : 'bg-white/[0.03] border-white/8 hover:bg-white/[0.05]')}>
                <p className="text-lg font-black font-mono" style={{ color: b.color }}>{bucketCounts[b.key]}</p>
                <p className="text-[9px] mt-0.5 text-white/45 leading-tight">{b.label}</p>
                <p className="text-[8px] text-white/20">{b.range}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by email…"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm placeholder:opacity-50 focus:outline-none focus:border-primary/40 transition-all bg-white/5 border-white/8 text-white" />
        </div>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value as typeof roleFilter)}
          className="px-3 py-2.5 rounded-xl border text-sm bg-white/5 border-white/8 text-white">
          <option value="all">All roles</option>
          {ALL_ROLE_ROWS.map(r => (
            <option key={r} value={r}>{ROLE_META[r].label}{ROLE_META[r].legacy ? ' (legacy)' : ''}</option>
          ))}
        </select>
        <select value={planFilter} onChange={e => setPlanFilter(e.target.value as typeof planFilter)}
          className="px-3 py-2.5 rounded-xl border text-sm bg-white/5 border-white/8 text-white">
          <option value="all">All plans</option>
          <option value="free">Free</option>
          <option value="pro">Pro</option>
          <option value="pro_plus">Pro+</option>
        </select>
        {bucketFilter !== 'all' && (
          <button onClick={() => setBucketFilter('all')}
            className="px-3 py-2.5 rounded-xl border text-xs font-semibold bg-primary/15 border-primary/30 text-primary">
            Clear activity filter
          </button>
        )}
      </div>

      {/* List + detail */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-4">
        <div className="rounded-2xl border border-white/8 bg-[#0d0d14] overflow-hidden">
          {loading && <p className="px-4 py-8 text-center text-xs text-white/30">Loading users…</p>}
          {!loading && filtered.length === 0 && (
            <p className="px-4 py-8 text-center text-xs text-white/30">No users match these filters.</p>
          )}
          {filtered.map(r => (
            /* Row is a div (not a button) so the row actions can be real buttons. */
            <div key={r.id}
              onClick={() => setSelectedId(r.id === selectedId ? null : r.id)}
              className={cn('w-full text-left px-4 py-3 border-b border-white/4 last:border-0 flex items-center gap-3 cursor-pointer transition-all',
                r.status === 'banned'      ? 'bg-red-500/[0.07] hover:bg-red-500/[0.11]'
                : r.status === 'suspended' ? 'bg-amber-500/[0.05] hover:bg-amber-500/[0.09]'
                : selectedId === r.id      ? 'bg-primary/8'
                : 'hover:bg-white/[0.03]')}>
              <span className="relative shrink-0">
                <span className="h-9 w-9 rounded-xl bg-white/5 border border-white/8 flex items-center justify-center text-xs font-bold text-white/60">
                  {r.name.slice(0, 1).toUpperCase()}
                </span>
                <span className={cn('absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#0d0d14]',
                  r.online ? 'bg-emerald-400'
                  : r.activityKnown ? 'bg-red-400/80'
                  : 'bg-white/25')} />
              </span>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn('text-sm font-semibold truncate', r.status === 'banned' ? 'text-red-300' : 'text-white')}>{r.name}</span>
                  <RolePill role={r.role} />
                  <StatusPill status={r.status} />
                </div>
                <p className="text-[11px] text-white/35 truncate">{r.email}</p>
              </div>

              {/* Right side: plan · presence · eye */}
              <div className="flex items-center gap-2 shrink-0">
                <span className={cn('text-xs font-bold whitespace-nowrap', PLAN_META[r.plan]?.color ?? 'text-white/25')}>
                  {PLAN_META[r.plan]?.emoji} {PLAN_META[r.plan]?.label ?? '—'}
                </span>

                {/* Presence button — green "Online" / red "Offline" */}
                <button
                  onClick={e => { e.stopPropagation(); setSelectedId(r.id); setLoginsFor(r.id); }}
                  title={r.lastSeenAt ? `Last seen ${fmtWhen(r.lastSeenAt)}` : 'No activity recorded yet'}
                  className={cn('inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-bold transition-all whitespace-nowrap',
                    r.online ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/20'
                    : r.activityKnown ? 'bg-red-500/10 border-red-500/25 text-red-400 hover:bg-red-500/20'
                    : 'bg-white/5 border-white/10 text-white/35 hover:bg-white/10')}>
                  {r.online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                  {r.online ? 'Online' : r.activityKnown ? 'Offline' : 'No data'}
                </button>

                {/* Eye — icon only */}
                <button
                  onClick={e => { e.stopPropagation(); void handleViewAsUser(r.email); }}
                  disabled={!canManage || viewBusy !== null}
                  title={viewBusy === r.email ? 'Starting read-only view…' : 'View as this user (read-only)'}
                  className="p-1.5 rounded-lg border bg-sky-500/10 border-sky-500/25 text-sky-400 hover:bg-sky-500/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                  {viewBusy === r.email ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Detail */}
        <div className="space-y-3">
          {!selected ? (
            <div className="rounded-2xl border border-white/8 bg-[#0d0d14] p-8 text-center">
              <p className="text-xs text-white/30">Select a user to manage their role, plan, balance and history.</p>
            </div>
          ) : (
            <>
              {/* Account */}
              <div className="rounded-2xl border border-white/8 bg-[#0d0d14] p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate">{selected.name}</p>
                    <p className="text-[11px] text-white/40 truncate">{selected.email}</p>
                    <p className="text-[10px] text-white/25 mt-1 flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Joined {selected.joinedAt ? new Date(selected.joinedAt).toLocaleDateString() : '—'}
                    </p>
                  </div>
                  <RolePill role={selected.role} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded-xl bg-white/4 px-3 py-2">
                    <p className="text-white/35">Plan</p>
                    <p className={cn('font-bold', PLAN_META[selected.plan]?.color ?? 'text-white/30')}>
                      {PLAN_META[selected.plan]?.label ?? '—'}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white/4 px-3 py-2">
                    <p className="text-white/35">Balance</p>
                    <p className="font-bold">{selected.balance == null ? '—' : selected.balance.toLocaleString()}</p>
                  </div>
                  <div className="rounded-xl bg-white/4 px-3 py-2">
                    <p className="text-white/35">Last seen</p>
                    <p className="font-bold">{fmtAgo(selected.lastSeenAt)}</p>
                  </div>
                  <div className="rounded-xl bg-white/4 px-3 py-2">
                    <p className="text-white/35">Last IP</p>
                    <p className="font-mono font-bold truncate" title={selected.lastSeenIp ?? ''}>{selected.lastSeenIp ?? '—'}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn('inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-full border',
                    selected.online ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                    : selected.activityKnown ? 'bg-red-500/10 border-red-500/25 text-red-400'
                    : 'bg-white/5 border-white/10 text-white/35')}>
                    {selected.online ? 'Online' : selected.activityKnown ? 'Offline' : 'No activity recorded'}
                  </span>
                  <StatusPill status={selected.status} />
                  {!selected.hasTaskade && (
                    <span className="text-[10px] px-2 py-1 rounded-full bg-white/5 border border-white/10 text-white/35">no login account</span>
                  )}
                </div>
              </div>

              {/* Role */}
              <div className="rounded-2xl border border-white/8 bg-[#0d0d14] p-4 space-y-3">
                <p className="text-[10px] uppercase tracking-widest font-semibold text-white/30 flex items-center gap-1.5">
                  <ShieldCheck className="h-3 w-3" /> Role
                </p>
                <select
                  value={selected.role}
                  disabled={!canManage || roleBusy}
                  onChange={e => {
                    const to = e.target.value as RoleId;
                    if (to !== selected.role) setConfirmRole({ id: selected.id, email: selected.email, from: selected.role, to });
                  }}
                  className="w-full px-3 py-2.5 rounded-xl border text-sm bg-white/5 border-white/8 text-white disabled:opacity-50"
                >
                  {/* A legacy role the user already holds — visible, not selectable. */}
                  {ROLE_META[selected.role]?.legacy && (
                    <option value={selected.role} disabled>
                      {ROLE_META[selected.role].label} — legacy (read-only)
                    </option>
                  )}
                  {ASSIGNABLE_ROLES.map(r => (
                    <option key={r} value={r}>{ROLE_META[r].label}</option>
                  ))}
                </select>
                <p className="text-[10px] text-white/25 leading-relaxed">
                  Only the six active roles can be assigned. <b>vip / admin / senior_admin</b> are retired
                  (legacy) — they stay visible but can no longer be set.
                </p>
                {roleBusy && <p className="text-[10px] text-white/40 flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Saving role…</p>}
              </div>

              {/* Subscription + history */}
              <div className="rounded-2xl border border-white/8 bg-[#0d0d14] p-4 space-y-3">
                <p className="text-[10px] uppercase tracking-widest font-semibold text-white/30 flex items-center gap-1.5">
                  <CreditCard className="h-3 w-3" /> Subscription
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {(['free', 'pro', 'pro_plus'] as const).map(p => {
                    const active = selected.plan === p;
                    return (
                      <button key={p} onClick={() => void applySubscription(p)}
                        disabled={!canManage || subBusy !== null}
                        className={cn('flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl border text-xs font-bold transition-all disabled:opacity-40',
                          active ? 'bg-amber-500/15 border-amber-500/35 text-amber-300' : 'bg-white/4 border-white/10 text-white/50 hover:bg-white/8')}>
                        {subBusy === p ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : active ? <Check className="h-3.5 w-3.5" /> : <span>{PLAN_META[p].emoji}</span>}
                        {PLAN_META[p].label}
                      </button>
                    );
                  })}
                </div>
                <div className="rounded-xl border border-white/6 overflow-hidden">
                  <p className="px-3 py-2 text-[10px] uppercase tracking-widest font-semibold text-white/30 border-b border-white/5">
                    Subscription history
                  </p>
                  {historyBusy && <p className="px-3 py-4 text-center text-[10px] text-white/25">Loading…</p>}
                  {!historyBusy && history.length === 0 && (
                    <p className="px-3 py-4 text-center text-[10px] text-white/25">No entitlements recorded.</p>
                  )}
                  {!historyBusy && history.map(h => (
                    <div key={h.id} className="px-3 py-2 border-b border-white/4 last:border-0 flex items-center gap-2">
                      <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full border',
                        h.status === 'active' ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                          : 'bg-white/5 border-white/10 text-white/40')}>{h.status}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-white/70 font-semibold">{PLAN_META[h.plan_id]?.label ?? h.plan_id}</p>
                        <p className="text-[9px] text-white/30">
                          {h.starts_at ? new Date(h.starts_at).toLocaleDateString() : '—'} → {h.ends_at ? new Date(h.ends_at).toLocaleDateString() : '—'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Balance */}
              <div className="rounded-2xl border border-white/8 bg-[#0d0d14] p-4 space-y-3">
                <p className="text-[10px] uppercase tracking-widest font-semibold text-white/30 flex items-center gap-1.5">
                  <Wallet className="h-3 w-3" /> Balance
                  {selected.balance != null && (
                    <span className="ml-auto font-mono text-white/60">now {selected.balance.toLocaleString()}</span>
                  )}
                </p>
                <input value={balanceAmount} onChange={e => setBalanceAmount(e.target.value.replace(/[^\d.]/g, ''))}
                  inputMode="decimal" placeholder="Amount"
                  className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-amber-500/40" />
                <input value={balanceReason} onChange={e => setBalanceReason(e.target.value)}
                  placeholder="Reason (optional)"
                  className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-amber-500/40" />
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => void applyBalance(1)} disabled={!canManage || balanceBusy}
                    className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold hover:bg-emerald-500/25 transition-all disabled:opacity-40">
                    {balanceBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Credit
                  </button>
                  <button onClick={() => void applyBalance(-1)} disabled={!canManage || balanceBusy}
                    className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-red-500/12 border border-red-500/30 text-red-300 text-xs font-bold hover:bg-red-500/22 transition-all disabled:opacity-40">
                    {balanceBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} Debit
                  </button>
                </div>
              </div>

              {/* Login history */}
              <div className="rounded-2xl border border-white/8 bg-[#0d0d14] p-4 space-y-3">
                <button onClick={() => setLoginsFor(loginsFor === selected.id ? null : selected.id)}
                  className="w-full flex items-center gap-2 text-left">
                  <p className="text-[10px] uppercase tracking-widest font-semibold text-white/30 flex items-center gap-1.5 flex-1">
                    <Monitor className="h-3 w-3" /> Login history
                    <span className="text-white/20 normal-case tracking-normal">({logins.length} recorded)</span>
                  </p>
                  <span className="text-[10px] text-white/35">{loginsFor === selected.id ? 'Hide' : 'Show'}</span>
                </button>

                {/* Authoritative server record */}
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded-xl bg-white/4 px-3 py-2">
                    <p className="text-white/35">Last seen (server)</p>
                    <p className="font-bold">{fmtWhen(selected.lastSeenAt)}</p>
                  </div>
                  <div className="rounded-xl bg-white/4 px-3 py-2">
                    <p className="text-white/35">IP address</p>
                    <p className="font-mono font-bold truncate" title={selected.lastSeenIp ?? ''}>{selected.lastSeenIp ?? '—'}</p>
                  </div>
                </div>

                {loginsFor === selected.id && (
                  <div className="rounded-xl border border-white/6 overflow-hidden">
                    {logins.length === 0 ? (
                      <p className="px-3 py-4 text-center text-[10px] text-white/25">
                        No login events recorded on this device for this user.
                      </p>
                    ) : logins.slice(0, 20).map(ev => (
                      <div key={ev.id} className="px-3 py-2.5 border-b border-white/4 last:border-0 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10px] font-bold text-white/70">{fmtWhen(ev.timestamp)}</p>
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/40 capitalize">{ev.method}</span>
                        </div>
                        <p className="text-[10px] text-white/45">
                          {ev.browser}{ev.browserVersion ? ` ${ev.browserVersion}` : ''} · {ev.os} · {ev.deviceType}
                        </p>
                        <p className="text-[9px] text-white/25">
                          {ev.screenRes} · {ev.timezone} · {ev.language}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-white/20 leading-relaxed">
                  Country is not captured yet. IP comes from the server (<code className="font-mono">last_seen_ip</code>);
                  device rows are from logins recorded in this browser.
                </p>
              </div>

              {/* Moderation */}
              <div className="rounded-2xl border border-white/8 bg-[#0d0d14] p-4 space-y-2">
                <p className="text-[10px] uppercase tracking-widest font-semibold text-white/30">Moderation</p>
                {selected.status !== 'banned' ? (
                  <button onClick={() => void setStatus('banned')} disabled={moderationBusy !== null}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-semibold hover:bg-red-500/20 transition-all disabled:opacity-50">
                    {moderationBusy === 'banned' ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserX className="h-4 w-4" />} Ban user
                  </button>
                ) : (
                  <button onClick={() => void setStatus('active')} disabled={moderationBusy !== null}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm font-semibold hover:bg-green-500/20 transition-all disabled:opacity-50">
                    {moderationBusy === 'active' ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />} Unban user
                  </button>
                )}
                {selected.status === 'active' && (
                  <button onClick={() => void setStatus('suspended')} disabled={moderationBusy !== null}
                    className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm font-semibold hover:bg-amber-500/20 transition-all">
                    <Shield className="h-4 w-4" /> Suspend
                  </button>
                )}
              </div>

              {/* Danger zone */}
              <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.04] p-4 space-y-2">
                <p className="text-[10px] uppercase tracking-widest font-semibold text-red-400/70">Danger zone</p>
                <button onClick={() => setConfirmDelete(true)} disabled={!canDelete}
                  title={canDelete ? 'Delete this user' : 'Requires the owner tier or admin level 4+'}
                  className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-sm font-semibold hover:bg-red-500/20 transition-all disabled:opacity-40">
                  <Trash2 className="h-4 w-4" /> Delete user
                </button>
                <p className="text-[10px] text-white/25 leading-relaxed">
                  Allowed for <b>developers / owners</b> and <b>admin level 4+</b>. Removes the database record and the login account.
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Role-change confirmation */}
      {confirmRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#12121a] p-5 space-y-4">
            <div className="flex items-center gap-2">
              <CrownIcon className="h-4 w-4 text-amber-400" />
              <h3 className="text-sm font-bold text-white">Confirm role change</h3>
            </div>
            <p className="text-xs text-white/50 leading-relaxed">
              Change <span className="font-mono text-white/80">{confirmRole.email}</span> from{' '}
              <RolePill role={confirmRole.from} /> to <RolePill role={confirmRole.to} />?
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmRole(null)}
                className="flex-1 py-2.5 rounded-xl border bg-white/5 border-white/8 text-white/40 text-sm font-semibold">Cancel</button>
              <button onClick={() => void applyRoleChange()}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">Apply</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-red-500/25 bg-[#12121a] p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-red-400" />
              <h3 className="text-sm font-bold text-white">Delete {selected.email}?</h3>
            </div>
            <ul className="text-xs text-white/50 space-y-1 list-disc pl-4">
              <li>Removes the user&apos;s record from the database.</li>
              <li>Removes their login account — this email will no longer be able to sign in.</li>
              <li>Cannot be undone.</li>
            </ul>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(false)} disabled={deleting}
                className="flex-1 py-2.5 rounded-xl border bg-white/5 border-white/8 text-white/40 text-sm font-semibold disabled:opacity-50">Cancel</button>
              <button onClick={() => void handleDeleteUser()} disabled={deleting}
                className="flex-1 py-2.5 rounded-xl bg-red-500/20 border border-red-500/35 text-red-300 text-sm font-bold hover:bg-red-500/30 transition-all disabled:opacity-50">
                {deleting ? <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Deleting…</span> : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminUsers;
