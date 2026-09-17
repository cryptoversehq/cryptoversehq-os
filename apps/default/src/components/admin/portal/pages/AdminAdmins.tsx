import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Shield, UserX, UserCheck, Trash2, Search, Star, HeadphonesIcon, Activity, UserPlus, RefreshCw, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAdminManagementStore, ADMIN_LEVEL_META } from '@/lib/adminManagementStore';
// Batch C2.5 · Task 2: the roster is SERVER data (GET /api/admin/users). The acting
// admin is the SERVER-verified identity, and owner tier comes from roleLevel().
import { ApiForbiddenError, hasFullAdminAccess, roleLevel, useAdminIdentity } from '@/lib/adminApi';
import { findAdminUserByEmail, setAdminUserRole } from '@/lib/adminUsersApi';
import { useAdminPortalStore } from '@/lib/adminPortalStore';

/** Exactly what POST /api/admin/users/:id/role accepts. */
const PROMOTABLE_ROLES: { id: string; label: string }[] = [
  { id: 'support_admin',      label: 'Support Admin' },
  { id: 'subscription_admin', label: 'Subscription Admin' },
  { id: 'super_admin',        label: 'Super Admin' },
  { id: 'founder',            label: 'Founder' },
  { id: 'developer',          label: 'Developer' },
  { id: 'user',               label: 'User (removes admin access)' },
];
const ROLE_LABEL: Record<string, string> = Object.fromEntries(
  PROMOTABLE_ROLES.map(r => [r.id, r.label]),
);

/** One place where an API failure becomes a message a human can act on. */
function errorText(err: unknown, fallback: string): string {
  if (err instanceof ApiForbiddenError) return 'The server refused the change (403).';
  const msg = (err as Error)?.message;
  return typeof msg === 'string' && msg && msg !== 'undefined' ? msg : fallback;
}


export function AdminAdmins() {
  // members is a CACHE of GET /api/admin/users, admin roles only — see the store.
  const { members, refreshMembers, suspendAdmin, activateAdmin, deleteAdmin } = useAdminManagementStore();
  const identity = useAdminIdentity();
  const { tickets, loadTickets } = useAdminPortalStore();
  const [search,  setSearch]  = useState('');
  const [confirm, setConfirm] = useState<{ id: string; action: 'delete' | 'suspend' | 'demote' } | null>(null);
  const [busy,    setBusy]    = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  /** The acting admin, in the shape the store's audit entries expect. */
  const actor = identity
    ? ({ id: identity.email, email: identity.email, displayName: identity.email } as any)
    : null;
  const isOwner = hasFullAdminAccess(identity?.role) || roleLevel(identity?.role) >= 6;

  // Promote-by-email modal
  const [promoteOpen, setPromoteOpen]   = useState(false);
  const [promoteEmail, setPromoteEmail] = useState('');
  const [promoteRole, setPromoteRole]   = useState('support_admin');
  const [promoting, setPromoting]       = useState(false);

  const load = async () => {
    setLoadError(null);
    try {
      await refreshMembers();
    } catch (err) {
      setLoadError(errorText(err, 'Could not load the admin roster.'));
    }
  };

  useEffect(() => {
    loadTickets();
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadTickets]);

  const filtered = members.filter(m => {
    const q = search.toLowerCase();
    return !q || m.displayName.toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
  });

  // Compute ticket stats per admin (by adminId field in tickets)
  const ticketStats = (adminEmail: string) => {
    const mine   = tickets.filter(t => t.adminId === adminEmail);
    const closed = mine.filter(t => t.status === 'closed');
    const rated  = closed.filter(t => t.rating !== undefined);
    const avg    = rated.length > 0
      ? rated.reduce((s, t) => s + (t.rating ?? 0), 0) / rated.length
      : 0;
    return { total: mine.length, closed: closed.length, avg: Math.round(avg * 10) / 10 };
  };

  // Every branch below is a SERVER write followed by a re-read of the roster, so
  // the table can only ever show what public.users actually holds. 'delete' and
  // 'demote' are the same server operation now: role → user (the account, its
  // data and its history all stay).
  const doAction = async (id: string, action: 'delete' | 'suspend' | 'activate' | 'demote') => {
    if (!actor) return;
    setConfirm(null);
    setBusy(id);
    try {
      if (action === 'delete' || action === 'demote') await deleteAdmin(id, actor);
      else if (action === 'suspend')  await suspendAdmin(id, actor);
      else                            await activateAdmin(id, actor);

      toast.success(
        action === 'activate' ? 'Admin re-activated.'
        : action === 'suspend' ? 'Admin suspended — their sessions were ended.'
        : 'Admin access removed (role is now User).',
      );
    } catch (err) {
      toast.error(errorText(err, 'The change was refused.'));
    } finally {
      setBusy(null);
    }
  };

  // Promote by email: resolve the address to a real account, then set the role on
  // the server. No account, no promotion — nothing is invented client-side.
  const handlePromote = async () => {
    const email = promoteEmail.trim().toLowerCase();
    if (!email) { toast.error('Enter the email of an existing account.'); return; }
    setPromoting(true);
    try {
      const target = await findAdminUserByEmail(email);
      if (!target) { toast.error(`No account found for ${email}.`); return; }
      await setAdminUserRole(target.id, promoteRole);
      await refreshMembers();
      toast.success(`${email} is now ${ROLE_LABEL[promoteRole] ?? promoteRole}.`);
      setPromoteOpen(false);
      setPromoteEmail('');
    } catch (err) {
      toast.error(errorText(err, 'The server refused the promotion.'));
    } finally {
      setPromoting(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-white flex items-center gap-2">
          <Shield className="h-5 w-5 text-red-400" /> Admin Members
          <span className="text-sm font-normal text-white/30">({members.length} total)</span>
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 tracking-wide">
            SOURCE: DATABASE
          </span>
        </h1>
        <div className="flex items-center gap-2">
          <button onClick={() => void load()} disabled={busy !== null}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-[11px] text-white/50 hover:text-white hover:bg-white/10 transition-all disabled:opacity-40">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          <button onClick={() => setPromoteOpen(true)} disabled={!isOwner}
            title={isOwner ? 'Give an existing account admin access' : 'Requires the owner tier'}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary/15 border border-primary/30 text-[11px] font-bold text-white hover:bg-primary/25 transition-all disabled:opacity-40">
            <UserPlus className="h-3.5 w-3.5" /> Promote by email
          </button>
        </div>
      </div>

      {loadError && (
        <div className="flex items-center gap-2 text-red-300 text-xs bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" /> {loadError}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search admins…"
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/3 border border-white/8 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-primary/40 transition-all" />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-white/20">
          <Shield className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm">No admin accounts found.</p>
          <p className="text-xs mt-1">
            This list is read from the database — promote an existing account by email to add one.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(member => {
            const meta = ADMIN_LEVEL_META[member.level];
            return (
              <motion.div key={member.id} layout
                className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all">
                {/* Avatar */}
                <div className="h-10 w-10 rounded-xl overflow-hidden border border-white/8 flex-shrink-0">
                  <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${member.avatarSeed}`} alt="" className="w-full h-full" />
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-white">{member.displayName}</p>
                    <span className="text-[10px] px-2 py-0.5 rounded-full border font-semibold"
                      style={{ borderColor: meta.border, background: meta.bg, color: meta.color }}>
                      {meta.icon} {meta.role}
                    </span>
                    <span className={cn('text-[10px] px-2 py-0.5 rounded-full border capitalize',
                      member.status === 'active' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400')}>
                      {member.status}
                    </span>
                  </div>
                  <p className="text-xs text-white/30 mt-0.5">{member.email}</p>
                </div>
                {/* Performance stats */}
                {(() => {
                  const stats = ticketStats(member.email);
                  return (
                    <div className="hidden lg:flex items-center gap-4 text-[11px] text-white/30 flex-shrink-0">
                      <div className="text-center">
                        <p className="text-white/60 font-semibold">{stats.total}</p>
                        <p className="flex items-center gap-1"><HeadphonesIcon className="h-3 w-3" /> Tickets</p>
                      </div>
                      <div className="text-center">
                        <p className="text-white/60 font-semibold">{stats.closed}</p>
                        <p className="flex items-center gap-1"><Activity className="h-3 w-3" /> Closed</p>
                      </div>
                      <div className="text-center">
                        <p className={cn('font-semibold', stats.avg >= 4 ? 'text-amber-400' : stats.avg >= 3 ? 'text-white/60' : 'text-red-400')}>
                          {stats.avg > 0 ? stats.avg.toFixed(1) : '—'}
                        </p>
                        <p className="flex items-center gap-1"><Star className="h-3 w-3" /> Rating</p>
                      </div>
                    </div>
                  );
                })()}
                {/* Dates */}
                <div className="hidden md:block text-[11px] text-white/25 text-right flex-shrink-0">
                  <p>Joined {new Date(member.createdAt).toLocaleDateString()}</p>
                  <p>Active {new Date(member.lastActiveAt).toLocaleDateString()}</p>
                </div>
                {/* Actions */}
                <div className="flex gap-2 flex-shrink-0">
                  {busy === member.id && <Loader2 className="h-4 w-4 animate-spin text-white/40 self-center" />}
                  {member.status === 'active' ? (
                    <button onClick={() => setConfirm({ id: member.id, action: 'suspend' })} disabled={busy === member.id}
                      className="p-2 rounded-xl bg-amber-500/8 border border-amber-500/15 text-amber-400 hover:bg-amber-500/15 transition-all disabled:opacity-40" title="Suspend">
                      <UserX className="h-4 w-4" />
                    </button>
                  ) : (
                    <button onClick={() => void doAction(member.id, 'activate')} disabled={busy === member.id}
                      className="p-2 rounded-xl bg-green-500/8 border border-green-500/15 text-green-400 hover:bg-green-500/15 transition-all disabled:opacity-40" title="Activate">
                      <UserCheck className="h-4 w-4" />
                    </button>
                  )}
                  {isOwner && (
                    <button onClick={() => setConfirm({ id: member.id, action: 'demote' })} disabled={busy === member.id}
                      className="p-2 rounded-xl bg-red-500/8 border border-red-500/15 text-red-400 hover:bg-red-500/15 transition-all disabled:opacity-40" title="Remove admin access (role → User)">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Confirm modal */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="bg-[#12121a] border border-white/10 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <p className="font-semibold text-white mb-2 capitalize">{confirm.action} Admin?</p>
            <p className="text-sm text-white/40 mb-5">
              This is written to the database and logged in the audit trail.
            </p>
            <div className="flex gap-3">
              <button onClick={() => void doAction(confirm.id, confirm.action)} disabled={busy === confirm.id}
                className={cn('flex-1 py-2.5 rounded-xl font-semibold text-sm border transition-all disabled:opacity-50',
                  confirm.action === 'delete' ? 'bg-red-500/15 border-red-500/25 text-red-400 hover:bg-red-500/25' : 'bg-amber-500/15 border-amber-500/25 text-amber-400 hover:bg-amber-500/25')}>
                {busy === confirm.id ? <Loader2 className="h-4 w-4 animate-spin inline" /> : 'Confirm'}
              </button>
              <button onClick={() => setConfirm(null)}
                className="flex-1 py-2.5 rounded-xl font-semibold text-sm bg-white/5 border border-white/10 text-white/60 hover:text-white transition-all">
                Cancel
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Promote by email — a SERVER role change (POST /api/admin/users/:id/role) */}
      {promoteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="bg-[#12121a] border border-white/10 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold text-white">Promote an account</h3>
            </div>
            <p className="text-xs text-white/40 leading-relaxed">
              The email must already belong to an account in the database. The role is written
              server-side, and the row appears here only once the API confirms it.
            </p>
            <input value={promoteEmail} onChange={e => setPromoteEmail(e.target.value)}
              placeholder="user@example.com" autoFocus
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary/40" />
            <select value={promoteRole} onChange={e => setPromoteRole(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-primary/40">
              {PROMOTABLE_ROLES.map(r => (
                <option key={r.id} value={r.id} className="bg-[#12121a]">{r.label}</option>
              ))}
            </select>
            <div className="flex gap-3">
              <button onClick={() => setPromoteOpen(false)} disabled={promoting}
                className="flex-1 py-2.5 rounded-xl font-semibold text-sm bg-white/5 border border-white/10 text-white/60 hover:text-white transition-all disabled:opacity-50">
                Cancel
              </button>
              <button onClick={() => void handlePromote()} disabled={promoting || !promoteEmail.trim()}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm transition-all disabled:opacity-50">
                {promoting
                  ? <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Applying…</span>
                  : 'Apply role'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
