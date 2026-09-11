/**
 * AdminSubscriptions.tsx — /admin/subscriptions
 *
 * SERVER-AUTHORITATIVE subscription management.
 *
 * Users, grant/revoke, per-user subscriptions and the audit trail come from the
 * Render API (backed by Neon). Authorization is decided by the server: a 401/403
 * from any endpoint renders a Forbidden panel — no client-side role check acts as
 * a security boundary. The admin role (for read-only mode) comes from
 * /api/auth/get-session via `useAdminRole()`.
 *
 * `support_admin` is read-only here (no grant/revoke forms); the server enforces
 * that too. No token is stored in the browser — the session is the HttpOnly
 * Better Auth cookie.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  ShieldAlert, Crown, Gem, Search, Ban, History,
  CreditCard, Calendar, AlertTriangle, RefreshCw, Check, Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ApiForbiddenError, apiGet, apiPost, useAdminIdentity } from '@/lib/adminApi';

// ── Exact API response shapes (contract with the Render backend) ──────────────

export interface ApiAdminUser {
  id: string;
  email: string;
  role: string;
  plan: string;
  created_at: string;
}

export interface UserSubscription {
  id: string;
  plan_id: string;
  status: string;
  starts_at: string;
  ends_at: string;
  granted_by: string;
  created_at: string;
}

export interface AuditEntry {
  id: string;
  actor_id: string;
  actor_email: string;
  actor_role: string;
  target_user_id: string;
  plan_id: string;
  action: string;
  result: string;
  note: string | null;
  error: string | null;
  ip_address: string;
  created_at: string;
}

interface UsersResponse    { success: boolean; users: ApiAdminUser[]; total: number; limit: number; offset: number; requestId: string; }
interface AuditResponse    { success: boolean; entries: AuditEntry[]; limit: number; offset: number; requestId: string; }
interface UserSubsResponse { success: boolean; user: ApiAdminUser; subscriptions: UserSubscription[]; requestId: string; }
interface GrantResponse    { success: boolean; entitlement_id: string; target_user_id: string; plan_id: string; duration_days: number; requestId: string; }
interface RevokeResponse   { success: boolean; target_user_id: string; previous_plan: string; requestId: string; }

async function fetchUsers(limit = 100, offset = 0): Promise<UsersResponse> {
  return apiGet<UsersResponse>(`/api/admin/users?limit=${limit}&offset=${offset}`);
}

async function fetchAuditLog(limit = 50, offset = 0): Promise<AuditResponse> {
  return apiGet<AuditResponse>(`/api/admin/subscriptions/audit?limit=${limit}&offset=${offset}`);
}

async function fetchUserSubscriptions(userId: string): Promise<UserSubsResponse> {
  return apiGet<UserSubsResponse>(`/api/admin/subscriptions/user/${encodeURIComponent(userId)}`);
}

async function grantSubscription(targetUserId: string, planId: PlanId, durationDays: number, note?: string): Promise<GrantResponse> {
  return apiPost<GrantResponse>(
    '/api/admin/subscriptions/grant',
    { target_user_id: targetUserId, plan_id: planId, duration_days: durationDays, note },
    { 'Idempotency-Key': `grant-${targetUserId}-${Date.now()}-${Math.random().toString(36).slice(2)}` },
  );
}

async function revokeSubscription(targetUserId: string, note?: string): Promise<RevokeResponse> {
  return apiPost<RevokeResponse>(
    '/api/admin/subscriptions/revoke',
    { target_user_id: targetUserId, note },
    { 'Idempotency-Key': `revoke-${targetUserId}-${Date.now()}-${Math.random().toString(36).slice(2)}` },
  );
}

// ── UI constants ──────────────────────────────────────────────────────────────
type PlanId = 'pro' | 'pro_plus';
const PLAN_META: Record<PlanId, { name: string; price: number; color: string; Icon: React.ElementType }> = {
  pro:      { name: 'Pro',  price: 20, color: 'text-blue-400',  Icon: Crown },
  pro_plus: { name: 'Pro+', price: 40, color: 'text-amber-400', Icon: Gem  },
};
const PLAN_LABELS: Record<string, string> = { pro: 'Pro', pro_plus: 'Pro+' };

function fmtDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

function Forbidden403() {
  return (
    <div className="flex-1 flex items-center justify-center p-8 min-h-[60vh]">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="max-w-sm w-full text-center space-y-5 rounded-3xl border border-red-500/20 bg-red-500/4 p-8">
        <div className="mx-auto w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <ShieldAlert className="h-8 w-8 text-red-400" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-xl font-black text-red-400">403 — Forbidden</h1>
          <p className="text-xs text-white/40 leading-relaxed">
            The server refused this request. Subscription management requires the
            {' '}<span className="text-amber-300 font-semibold">Developer</span> or
            {' '}<span className="text-amber-300 font-semibold">subscription_admin</span> role.
          </p>
        </div>
        <a href="/admin/dashboard"
          className="block w-full py-2.5 rounded-2xl bg-white/5 border border-white/10 text-white/50 text-sm hover:bg-white/10 transition-all">
          Back to Dashboard
        </a>
      </motion.div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export function AdminSubscriptions() {
  const identity  = useAdminIdentity();
  const readOnly  = identity?.role === 'support_admin';

  const [users, setUsers]         = useState<ApiAdminUser[]>([]);
  const [audit, setAudit]         = useState<AuditEntry[]>([]);
  const [forbidden, setForbidden] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);

  const [search, setSearch]         = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [planId, setPlanId]         = useState<PlanId>('pro');
  const [duration, setDuration]     = useState('30');
  const [note, setNote]             = useState('');
  const [revokeReason, setRevokeReason] = useState('');
  const [subs, setSubs]             = useState<UserSubscription[]>([]);
  const [busy, setBusy]             = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [usersRes, auditRes] = await Promise.all([fetchUsers(), fetchAuditLog()]);
      setUsers(usersRes.users ?? []);
      setAudit(auditRes.entries ?? []);
      setForbidden(false);
    } catch (err) {
      if (err instanceof ApiForbiddenError) { setForbidden(true); return; }
      setLoadError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const selectedUser = users.find(u => u.id === selectedId) ?? null;

  const loadSubs = useCallback(async (id: string) => {
    try {
      const res = await fetchUserSubscriptions(id);
      setSubs(res.subscriptions ?? []);
    } catch {
      setSubs([]);
    }
  }, []);
  useEffect(() => {
    if (selectedUser) void loadSubs(selectedUser.id);
    else setSubs([]);
  }, [selectedUser, loadSubs]);

  if (forbidden) return <Forbidden403 />;

  const activeSub = subs.find(s => s.status === 'active') ?? null;
  const query = search.trim().toLowerCase();
  const matches = users.filter(u => !query || u.email.toLowerCase().includes(query));

  const handleGrant = async () => {
    if (!selectedUser || readOnly) return;
    const days = Number(duration);
    setBusy(true);
    try {
      await grantSubscription(
        selectedUser.id,
        planId,
        Number.isFinite(days) && days > 0 ? days : 30,
        note.trim() || undefined,
      );
      toast.success(`${PLAN_META[planId].name} activated for ${selectedUser.email}`);
      setNote('');
      await loadSubs(selectedUser.id);
      await reload();
    } catch (err) {
      if (err instanceof ApiForbiddenError) { setForbidden(true); return; }
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async () => {
    if (!selectedUser || readOnly) return;
    setBusy(true);
    try {
      await revokeSubscription(selectedUser.id, revokeReason.trim() || undefined);
      toast.success(`Subscription revoked for ${selectedUser.email}`);
      setRevokeReason('');
      await loadSubs(selectedUser.id);
      await reload();
    } catch (err) {
      if (err instanceof ApiForbiddenError) { setForbidden(true); return; }
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-11 w-11 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
          <CreditCard className="h-5 w-5 text-amber-400" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-lg font-black text-white flex items-center gap-2">
            Subscription Entitlements
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 tracking-wide">
              SERVER-SIDE
            </span>
            {readOnly && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-sky-500/15 border border-sky-500/25 text-sky-400 tracking-wide">
                READ-ONLY
              </span>
            )}
          </h1>
          <p className="text-[11px] text-white/35">
            Grant or revoke Pro / Pro+ · permissions enforced by the server (Render + Neon)
          </p>
        </div>
        <button onClick={reload} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-[11px] text-white/50 hover:text-white hover:bg-white/10 transition-all disabled:opacity-40">
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} /> Refresh
        </button>
      </div>

      {readOnly && (
        <div className="flex items-center gap-2 text-sky-300 text-xs bg-sky-500/10 border border-sky-500/20 rounded-xl px-3 py-2.5">
          <Eye className="h-3.5 w-3.5 flex-shrink-0" />
          Read-only access — your role can view subscriptions and the audit trail but cannot grant or revoke.
        </div>
      )}

      {loadError && (
        <div className="flex items-center gap-2 text-red-300 text-xs bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
          {loadError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        {/* ── User picker (GET /api/admin/users) ── */}
        <div className="rounded-2xl border border-white/6 bg-[#0d0d14] p-3 space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search user by email"
              className="w-full pl-8 pr-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder:text-white/25 focus:outline-none focus:border-amber-500/40"
            />
          </div>
          <div className="max-h-96 overflow-y-auto space-y-1">
            {loading && <p className="text-[11px] text-white/25 text-center py-6">Loading users…</p>}
            {!loading && matches.length === 0 && (
              <p className="text-[11px] text-white/25 text-center py-6">No users found.</p>
            )}
            {matches.map(u => (
              <button
                key={u.id}
                onClick={() => setSelectedId(u.id)}
                className={cn(
                  'w-full text-left px-3 py-2 rounded-xl border transition-all',
                  selectedId === u.id
                    ? 'bg-amber-500/10 border-amber-500/30'
                    : 'bg-white/3 border-white/8 hover:bg-white/6',
                )}
              >
                <p className="text-xs font-semibold text-white truncate">{u.email}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/40 capitalize">{u.plan}</span>
                  <span className="text-[9px] text-white/25 capitalize">{u.role || 'user'}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Action panel ── */}
        <div className="space-y-4">
          {!selectedUser ? (
            <div className="rounded-2xl border border-white/6 bg-[#0d0d14] p-8 text-center">
              <p className="text-xs text-white/30">Select a user to view their subscriptions.</p>
            </div>
          ) : (
            <>
              {/* Selected user + current state (GET /subscriptions/user/:id) */}
              <div className="rounded-2xl border border-white/6 bg-[#0d0d14] p-4 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate">{selectedUser.email}</p>
                    <p className="text-[11px] text-white/35 truncate">
                      {selectedUser.role || 'user'} · joined {fmtDate(selectedUser.created_at)}
                    </p>
                  </div>
                  {activeSub ? (
                    <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">
                      {PLAN_LABELS[activeSub.plan_id] ?? activeSub.plan_id} active
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-white/5 border border-white/10 text-white/40">
                      Free
                    </span>
                  )}
                </div>
                {activeSub && (
                  <div className="flex items-center gap-2 text-[10px] text-white/40">
                    <Calendar className="h-3 w-3" />
                    {fmtDate(activeSub.starts_at)} → {fmtDate(activeSub.ends_at)}
                  </div>
                )}
              </div>

              {/* Grant — POST /api/admin/subscriptions/grant */}
              {!readOnly && (
                <form
                  data-genesis-form="admin-subscription-grant"
                  onSubmit={(e) => { e.preventDefault(); void handleGrant(); }}
                  className="rounded-2xl border border-white/6 bg-[#0d0d14] p-4 space-y-3"
                >
                  <p className="text-[10px] uppercase tracking-widest font-semibold text-white/30">Grant subscription</p>
                  <div data-genesis-field="plan_id" className="grid grid-cols-2 gap-2">
                    {(['pro', 'pro_plus'] as PlanId[]).map(id => {
                      const meta = PLAN_META[id];
                      const Icon = meta.Icon;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setPlanId(id)}
                          className={cn(
                            'flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-all',
                            planId === id ? 'bg-amber-500/10 border-amber-500/30' : 'bg-white/3 border-white/8 hover:bg-white/6',
                          )}
                        >
                          <Icon className={cn('h-4 w-4', meta.color)} />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-white">{meta.name}</p>
                            <p className="text-[10px] text-white/35">${meta.price}/mo</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label data-genesis-field="duration_days" className="space-y-1">
                      <span className="text-[10px] text-white/35">Duration (days)</span>
                      <input
                        type="number" min={1} max={3650} value={duration}
                        onChange={e => setDuration(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white focus:outline-none focus:border-amber-500/40"
                      />
                    </label>
                    <label data-genesis-field="note" className="space-y-1">
                      <span className="text-[10px] text-white/35">Note (optional)</span>
                      <input
                        value={note} onChange={e => setNote(e.target.value)}
                        placeholder="e.g. support case #123"
                        className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder:text-white/25 focus:outline-none focus:border-amber-500/40"
                      />
                    </label>
                  </div>
                  <button
                    type="submit" data-genesis-submit disabled={busy}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold hover:bg-emerald-500/25 transition-all disabled:opacity-40"
                  >
                    <Check className="h-3.5 w-3.5" /> Activate {PLAN_META[planId].name}
                  </button>
                </form>
              )}

              {/* Revoke — POST /api/admin/subscriptions/revoke */}
              {!readOnly && (
                <form
                  data-genesis-form="admin-subscription-revoke"
                  onSubmit={(e) => { e.preventDefault(); void handleRevoke(); }}
                  className="rounded-2xl border border-white/6 bg-[#0d0d14] p-4 space-y-3"
                >
                  <p className="text-[10px] uppercase tracking-widest font-semibold text-white/30">Revoke subscription</p>
                  <input
                    data-genesis-field="reason"
                    value={revokeReason} onChange={e => setRevokeReason(e.target.value)}
                    placeholder="Reason (optional)"
                    className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder:text-white/25 focus:outline-none focus:border-amber-500/40"
                  />
                  <button
                    type="submit" data-genesis-submit disabled={busy}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500/12 border border-red-500/30 text-red-300 text-xs font-bold hover:bg-red-500/22 transition-all disabled:opacity-40"
                  >
                    <Ban className="h-3.5 w-3.5" /> Revoke & reset to Free
                  </button>
                </form>
              )}

              {/* Per-user history */}
              <div className="rounded-2xl border border-white/6 bg-[#0d0d14] overflow-hidden">
                <p className="px-4 py-3 text-[10px] uppercase tracking-widest font-semibold text-white/30 border-b border-white/5">
                  Entitlement history
                </p>
                {subs.length === 0 ? (
                  <p className="px-4 py-6 text-center text-[11px] text-white/25">No entitlements recorded.</p>
                ) : subs.map(s => (
                  <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-white/4 last:border-0">
                    <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border',
                      s.status === 'active'
                        ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                        : 'bg-white/5 border-white/10 text-white/40')}>
                      {s.status || '—'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-white/70 font-semibold">{PLAN_LABELS[s.plan_id] ?? s.plan_id} · {s.plan_id}</p>
                      <p className="text-[10px] text-white/30">{fmtDate(s.starts_at)} → {fmtDate(s.ends_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Audit trail (GET /api/admin/subscriptions/audit) ── */}
      <div className="rounded-2xl border border-white/6 bg-[#0d0d14] overflow-hidden">
        <p className="px-4 py-3 text-[10px] uppercase tracking-widest font-semibold text-white/30 border-b border-white/5 flex items-center gap-1.5">
          <History className="h-3 w-3" /> Subscription audit log
        </p>
        {audit.length === 0 ? (
          <p className="px-4 py-6 text-center text-[11px] text-white/25">
            {loading ? 'Loading…' : 'No entries yet.'}
          </p>
        ) : audit.slice(0, 30).map(entry => (
          <div key={entry.id} className="px-4 py-2.5 border-b border-white/4 last:border-0 flex items-start gap-3">
            <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded mt-0.5',
              entry.result === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400')}>
              {(entry.action || '—').toUpperCase()}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-white/60">
                <span className="font-semibold text-white/80">{entry.actor_email}</span>
                {' '}{entry.action === 'grant' ? 'granted' : 'revoked'}{' '}
                <span className="font-semibold text-white/80">{PLAN_LABELS[entry.plan_id] ?? entry.plan_id}</span>
                {' '}→ <span className="text-white/50">{entry.target_user_id}</span>
              </p>
              <p className="text-[9px] text-white/25">
                {fmtDate(entry.created_at)} · {entry.ip_address}
                {entry.note ? ` · ${entry.note}` : ''}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AdminSubscriptions;
