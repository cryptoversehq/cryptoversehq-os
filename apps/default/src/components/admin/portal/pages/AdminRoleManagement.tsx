/**
 * AdminRoleManagement.tsx — /admin/role-management
 * Super Admin–only. Loads users live from the Taskade project,
 * lets super_admin change any user's role, persists via API.
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheck, Shield, User, Crown, Search, RefreshCw,
  CheckCircle2, XCircle, AlertTriangle, ChevronDown,
  Filter, Loader2, Info, ArrowUpDown, Clock,
} from 'lucide-react';
import { useAuthStore, UserRole } from '@/lib/authStore';
import { useAdminAuthStore } from '@/lib/adminAuthStore';
import { fetchAllUsers, updateUserRole, UserRecord } from '@/lib/authApi';
import { cn } from '@/lib/utils';

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_META: Record<UserRole, {
  label: string; color: string; bg: string; border: string;
  icon: React.ElementType; description: string; rank: number;
}> = {
  user:        { label: 'User',        color: '#94a3b8', bg: '#94a3b812', border: '#94a3b830', icon: User,   description: 'Standard access - no admin panel',       rank: 0 },
  vip:         { label: 'VIP',         color: '#38bdf8', bg: '#38bdf812', border: '#38bdf830', icon: Crown,  description: 'Enhanced member access',                  rank: 1 },
  admin:       { label: 'Admin',       color: '#f59e0b', bg: '#f59e0b12', border: '#f59e0b30', icon: Shield, description: 'Admin panel - cannot change roles',        rank: 2 },
  senior_admin:{ label: 'Senior Admin',color: '#fb7185', bg: '#fb718512', border: '#fb718530', icon: ShieldCheck, description: 'Advanced administration and AI controls', rank: 3 },
  super_admin: { label: 'Super Admin', color: '#ef4444', bg: '#ef444412', border: '#ef444430', icon: Crown,  description: 'Full control - including role management',  rank: 4 },
  founder:     { label: 'Founder',     color: '#a78bfa', bg: '#a78bfa12', border: '#a78bfa30', icon: Crown,  description: 'Founder-level platform authority',           rank: 5 },
  developer:   { label: 'Developer',   color: '#34d399', bg: '#34d39912', border: '#34d39930', icon: Shield, description: 'Developer access - admin panel and platform tooling', rank: 6 },
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserRow extends UserRecord {
  isSelf: boolean;
  pendingRole: UserRole | null;
  saveState: 'idle' | 'saving' | 'ok' | 'err';
  saveError?: string;
}

type SortKey = 'email' | 'fullName' | 'role' | 'createdAt';

// ─── Atom components ──────────────────────────────────────────────────────────

function RolePill({ role }: { role: UserRole }) {
  const m = ROLE_META[role];
  const Icon = m.icon;
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap"
      style={{ backgroundColor: m.bg, color: m.color, border: `1px solid ${m.border}` }}>
      <Icon className="h-3 w-3 flex-shrink-0" />
      {m.label}
    </span>
  );
}

function SaveIndicator({ state, error }: { state: UserRow['saveState']; error?: string }) {
  if (state === 'idle')    return null;
  if (state === 'saving')  return <Loader2 className="h-3.5 w-3.5 animate-spin text-white/40" />;
  if (state === 'ok')      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-red-400">
      <XCircle className="h-3 w-3" /> {error ?? 'Failed'}
    </span>
  );
}

function StatCard({ label, value, color, icon: Icon }: {
  label: string; value: number; color: string; icon: React.ElementType;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-white/5 rounded-2xl p-4 flex items-center gap-3">
      <div className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: color + '18', border: `1px solid ${color}25` }}>
        <Icon className="h-5 w-5" style={{ color }} />
      </div>
      <div>
        <p className="text-2xl font-black" style={{ color }}>{value}</p>
        <p className="text-[11px] text-white/40 mt-0.5">{label}</p>
      </div>
    </motion.div>
  );
}


// ─── RoleDropdown ─────────────────────────────────────────────────────────────

function RoleDropdown({
  row, onRoleChange,
}: {
  row: UserRow;
  onRoleChange: (email: string, newRole: UserRole) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const currentRole = (row.pendingRole ?? row.role) as UserRole;
  const m = ROLE_META[currentRole];
  const Icon = m.icon;
  const isSaving = row.saveState === 'saving';

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (row.isSelf) {
    return (
      <div className="flex items-center gap-2">
        <RolePill role={currentRole} />
        <span className="text-[10px] text-white/30 bg-white/5 px-1.5 py-0.5 rounded-full">You</span>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={isSaving}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold transition-all hover:brightness-125 active:scale-95 disabled:opacity-60 disabled:cursor-wait"
        style={{ backgroundColor: m.bg, color: m.color, border: `1px solid ${m.border}` }}
      >
        {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Icon className="h-3 w-3" />}
        {m.label}
        <ChevronDown className={cn('h-3 w-3 transition-transform duration-200', open && 'rotate-180')} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-9 z-50 w-60 bg-[#13161f] border border-white/10 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden"
          >
            <div className="px-3 py-2 border-b border-white/6">
              <p className="text-[10px] text-white/30 font-medium uppercase tracking-wider">Change role for</p>
              <p className="text-xs text-white/60 font-mono truncate mt-0.5">{row.email}</p>
            </div>
            {(Object.entries(ROLE_META) as [UserRole, typeof ROLE_META[UserRole]][]).map(([role, meta]) => {
              const RIcon = meta.icon;
              const isCurrent = role === currentRole;
              return (
                <button key={role}
                  onClick={() => { onRoleChange(row.email, role); setOpen(false); }}
                  disabled={isCurrent}
                  className={cn('w-full flex items-start gap-3 px-4 py-3 text-left transition-colors',
                    isCurrent ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/5 cursor-pointer')}>
                  <div className="h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ backgroundColor: meta.bg, border: `1px solid ${meta.border}` }}>
                    <RIcon className="h-3.5 w-3.5" style={{ color: meta.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold" style={{ color: meta.color }}>{meta.label}</p>
                    <p className="text-[10px] text-white/35 mt-0.5 leading-relaxed">{meta.description}</p>
                  </div>
                  {isCurrent && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0 mt-1.5" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


// ─── Main page ────────────────────────────────────────────────────────────────

export function AdminRoleManagement() {
  const { user: currentUser, setUserRole } = useAuthStore();
  const adminSession = useAdminAuthStore(s => s.session);
  const isSuperAdmin = currentUser?.role === 'super_admin'
    || (adminSession !== null && adminSession.level >= 6);

  const [rows,      setRows]      = useState<UserRow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const [search,     setSearch]     = useState('');
  const [filterRole, setFilterRole] = useState<UserRole | 'all'>('all');
  const [sortKey,    setSortKey]    = useState<SortKey>('createdAt');
  const [sortAsc,    setSortAsc]    = useState(false);

  const [confirm, setConfirm] = useState<{
    email: string; fromRole: UserRole; toRole: UserRole;
  } | null>(null);

  // ── Load live users from API ───────────────────────────────────────────────
  const loadUsers = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const records = await fetchAllUsers();
      setRows(records.map(r => ({
        ...r,
        isSelf:      r.email.toLowerCase() === currentUser?.email?.toLowerCase(),
        pendingRole: null,
        saveState:   'idle' as const,
      })));
      setLastFetch(new Date());
    } catch (err: any) {
      setLoadError(err?.message ?? 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, [currentUser?.email]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  // ── Request change → opens confirm modal ──────────────────────────────────
  const requestRoleChange = useCallback((email: string, newRole: UserRole) => {
    const row = rows.find(r => r.email === email);
    if (!row) return;
    const fromRole = (row.pendingRole ?? row.role) as UserRole;
    if (fromRole === newRole) return;
    setConfirm({ email, fromRole, toRole: newRole });
  }, [rows]);

  // ── Apply after confirmation ───────────────────────────────────────────────
  const applyRoleChange = useCallback(async () => {
    if (!confirm) return;
    const { email, toRole } = confirm;
    setConfirm(null);
    setRows(prev => prev.map(r =>
      r.email === email ? { ...r, pendingRole: toRole, saveState: 'saving' as const } : r,
    ));
    const apiResult = await updateUserRole(email, toRole);
    if (apiResult.ok) setUserRole(email, toRole);
    setRows(prev => prev.map(r => {
      if (r.email !== email) return r;
      return {
        ...r,
        role:        apiResult.ok ? toRole : r.role,
        pendingRole: null,
        saveState:   (apiResult.ok ? 'ok' : 'err') as const,
        saveError:   apiResult.ok ? undefined : apiResult.error,
      };
    }));
    setTimeout(() => {
      setRows(prev => prev.map(r =>
        r.email === email ? { ...r, saveState: 'idle' as const } : r,
      ));
    }, 3000);
  }, [confirm, setUserRole]);

  // ── Sort toggle ───────────────────────────────────────────────────────────
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(true); }
  };

  // ── Filtered + sorted rows ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter(r => {
        const matchSearch = !q || r.email.toLowerCase().includes(q) || r.fullName.toLowerCase().includes(q);
        const eff = (r.pendingRole ?? r.role) as UserRole;
        const matchRole = filterRole === 'all' || eff === filterRole;
        return matchSearch && matchRole;
      })
      .sort((a, b) => {
        let cmp = 0;
        const aRole = (a.pendingRole ?? a.role) as UserRole;
        const bRole = (b.pendingRole ?? b.role) as UserRole;
        if (sortKey === 'email')     cmp = a.email.localeCompare(b.email);
        if (sortKey === 'fullName')  cmp = a.fullName.localeCompare(b.fullName);
        if (sortKey === 'role')      cmp = ROLE_META[aRole].rank - ROLE_META[bRole].rank;
        if (sortKey === 'createdAt') cmp = (a.createdAt || '').localeCompare(b.createdAt || '');
        return sortAsc ? cmp : -cmp;
      });
  }, [rows, search, filterRole, sortKey, sortAsc]);

  const stats = useMemo(() => ({
    total:       rows.length,
    users:       rows.filter(r => (r.pendingRole ?? r.role) === 'user').length,
    admins:      rows.filter(r => ['admin', 'senior_admin'].includes(r.pendingRole ?? r.role)).length,
    superAdmins: rows.filter(r => ['super_admin', 'founder'].includes(r.pendingRole ?? r.role)).length,
  }), [rows]);

  // ── Access gate ───────────────────────────────────────────────────────────
  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="text-center space-y-4 max-w-sm">
          <div className="h-16 w-16 mx-auto rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-red-400" />
          </div>
          <h2 className="text-xl font-black text-red-400">Super Admin Required</h2>
          <p className="text-sm text-white/40 leading-relaxed">Role management is restricted to Super Admins only.</p>
        </div>
      </div>
    );
  }

  const SortBtn = ({ label, k }: { label: string; k: SortKey }) => (
    <button onClick={() => toggleSort(k)}
      className="flex items-center gap-1 text-[11px] font-semibold text-white/40 uppercase tracking-wider hover:text-white/70 transition-colors">
      {label}
      <ArrowUpDown className={cn('h-3 w-3', sortKey === k ? 'text-primary' : 'text-white/20')} />
    </button>
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-foreground flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-400/15 border border-amber-400/20 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-amber-400" />
            </div>
            Role Management
          </h1>
          <p className="text-sm text-white/40 mt-1.5">Manage user roles across the platform. Changes persist immediately to the database.</p>
        </div>
        <div className="flex items-center gap-3">
          {lastFetch && (
            <span className="flex items-center gap-1.5 text-[11px] text-white/30">
              <Clock className="h-3 w-3" />
              {lastFetch.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button onClick={loadUsers} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-sm text-white/60 hover:text-white transition-all border border-white/8 disabled:opacity-50">
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </motion.div>

      {/* Stats */}
      {!loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Total Users"   value={stats.total}       color="#6366f1" icon={ShieldCheck} />
          <StatCard label="Regular Users" value={stats.users}       color="#94a3b8" icon={User}        />
          <StatCard label="Admins"        value={stats.admins}      color="#f59e0b" icon={Shield}      />
          <StatCard label="Super Admins"  value={stats.superAdmins} color="#ef4444" icon={Crown}       />
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[220px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-secondary/30 border border-white/8 text-sm placeholder:text-white/30 focus:outline-none focus:border-white/20 transition-all text-foreground" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-white/30 flex-shrink-0" />
          {(['all', 'user', 'vip', 'admin', 'senior_admin', 'super_admin', 'founder', 'developer'] as const).map(r => (
            <button key={r} onClick={() => setFilterRole(r)}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                filterRole === r ? 'bg-primary text-primary-foreground' : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white')}>
              {r === 'all' ? 'All' : ROLE_META[r].label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="bg-card border border-white/5 rounded-2xl overflow-hidden shadow-xl shadow-black/20">
        {loading ? (
          <div className="flex items-center justify-center py-24 gap-3 text-white/40">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading users from project…</span>
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <XCircle className="h-8 w-8 text-red-400" />
            <p className="text-sm text-red-400">{loadError}</p>
            <button onClick={loadUsers} className="mt-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-sm text-white/60 hover:text-white transition-all border border-white/10">Retry</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/6 bg-white/[0.02]">
                  <th className="text-left px-5 py-3.5"><SortBtn label="User"    k="fullName"  /></th>
                  <th className="text-left px-5 py-3.5"><SortBtn label="Email"   k="email"     /></th>
                  <th className="text-left px-5 py-3.5 hidden md:table-cell"><SortBtn label="Joined" k="createdAt" /></th>
                  <th className="text-left px-5 py-3.5">
                    <span className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">Verified</span>
                  </th>
                  <th className="text-left px-5 py-3.5"><SortBtn label="Role"    k="role"      /></th>
                  <th className="text-left px-5 py-3.5 w-10">
                    <span className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">Status</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-16 text-center text-sm text-white/30">No users match your filters.</td></tr>
                ) : filtered.map(row => {
                  const seed   = row.fullName || row.email.split('@')[0] || 'User';
                  const avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;
                  const joined = row.createdAt
                    ? new Date(row.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: '2-digit' })
                    : '—';
                  return (
                    <motion.tr key={row.email} layout className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <img src={avatar} alt="" className="h-8 w-8 rounded-xl bg-secondary/50 flex-shrink-0 object-cover" />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate max-w-[120px]">{row.fullName || '—'}</p>
                            {row.isSelf && <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">You</span>}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-xs font-mono text-white/50 truncate block max-w-[200px]">{row.email}</span>
                      </td>
                      <td className="px-5 py-3.5 hidden md:table-cell">
                        <span className="text-xs text-white/35">{joined}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        {row.emailVerified ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="h-3 w-3" /> Verified
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-white/30 bg-white/5 px-2 py-0.5 rounded-full">
                            <XCircle className="h-3 w-3" /> Unverified
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <RoleDropdown row={row} onRoleChange={requestRoleChange} />
                      </td>
                      <td className="px-5 py-3.5">
                        <SaveIndicator state={row.saveState} error={row.saveError} />
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && !loadError && (
          <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between">
            <p className="text-xs text-white/30">
              Showing <span className="text-white/50 font-semibold">{filtered.length}</span> of <span className="text-white/50 font-semibold">{rows.length}</span> users
            </p>
            <p className="text-[10px] text-white/20">Changes persist to the Taskade Users project</p>
          </div>
        )}
      </motion.div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-400/5 border border-amber-400/15">
        <Info className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-white/50 leading-relaxed">
          <span className="text-amber-400 font-semibold">Note:</span>{' '}
          Changes take effect immediately and are saved to the database.
          Granting <em>Admin</em> unlocks the admin panel.
          Granting <em>Super Admin</em> gives full control.
          You cannot change your own role.
        </p>
      </div>

      {/* Confirm modal */}
      <AnimatePresence>
        {confirm && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={() => setConfirm(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
            >
              <div className="bg-[#13161f] border border-white/10 rounded-3xl shadow-2xl shadow-black/60 p-6 w-full max-w-sm pointer-events-auto">
                <div className="flex items-center gap-3 mb-5">
                  <div className="h-10 w-10 rounded-xl bg-amber-400/15 border border-amber-400/20 flex items-center justify-center flex-shrink-0">
                    <ShieldCheck className="h-5 w-5 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-foreground">Confirm Role Change</h3>
                    <p className="text-xs text-white/40 mt-0.5">This will update the database</p>
                  </div>
                </div>
                <div className="bg-white/[0.04] rounded-2xl p-4 space-y-3 mb-5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-white/30 w-14 flex-shrink-0">User</span>
                    <span className="text-xs font-mono text-white/60 truncate">{confirm.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-white/30 w-14 flex-shrink-0">From</span>
                    <RolePill role={confirm.fromRole} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-white/30 w-14 flex-shrink-0">To</span>
                    <RolePill role={confirm.toRole} />
                  </div>
                </div>
                {confirm.toRole === 'super_admin' && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/8 border border-red-500/20 mb-4">
                    <AlertTriangle className="h-3.5 w-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-[11px] text-red-300/80 leading-relaxed">
                      Granting Super Admin gives full platform control including the ability to change other users' roles.
                    </p>
                  </div>
                )}
                <div className="flex gap-3">
                  <button onClick={() => setConfirm(null)}
                    className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-sm text-white/60 hover:text-white transition-all border border-white/8">
                    Cancel
                  </button>
                  <button onClick={applyRoleChange}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95"
                    style={{ backgroundColor: ROLE_META[confirm.toRole].bg, color: ROLE_META[confirm.toRole].color, border: `1px solid ${ROLE_META[confirm.toRole].border}` }}>
                    Confirm Change
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

