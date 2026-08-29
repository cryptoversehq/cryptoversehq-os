import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, UserX, UserCheck, Shield, Filter, Eye, TrendingUp, ChevronDown, ChevronUp, X,
  Settings, Clock, Crown, SlidersHorizontal, Calendar, Wifi, WifiOff, Wallet, BarChart2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAdminPortalStore, ADMIN_SECTIONS, type AdminSectionId } from '@/lib/adminPortalStore';
import { useAdminAuthStore } from '@/lib/adminAuthStore';
import { useAdminManagementStore, ADMIN_LEVEL_META } from '@/lib/adminManagementStore';
import { useAuthStore } from '@/lib/authStore';
import { getLoginStats } from '@/lib/loginHistoryStore';

/** Idea §3 — simple online/offline heuristic, derived from real login history
 *  (no fabricated presence data): active within the last 5 minutes. */
function isRecentlyActive(iso?: string | null): boolean {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() < 5 * 60 * 1000;
}
function isUserOnline(userId: string): boolean {
  return isRecentlyActive(getLoginStats(userId).lastLogin?.timestamp ?? null);
}

/** Small reusable online/offline pill shown next to a user's name. */
function OnlineBadge({ userId }: { userId: string }) {
  const online = isUserOnline(userId);
  return (
    <span className={cn(
      'inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-bold shrink-0',
      online ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-white/5 border-white/10 text-white/40',
    )}>
      {online ? <Wifi className="h-2.5 w-2.5" /> : <WifiOff className="h-2.5 w-2.5" />}
      {online ? 'Online' : 'Offline'}
    </span>
  );
}

const STATUS_STYLE = {
  active:    'bg-green-500/10 border-green-500/20 text-green-400',
  suspended: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
  banned:    'bg-red-500/10 border-red-500/20 text-red-400',
};
const PLAN_STYLE = {
  bronze: 'text-amber-600', silver: 'text-slate-400', gold: 'text-yellow-400',
};

export function AdminUsers() {
  const {
    users, superAdmins, banUser, unbanUser, suspendUser, loadUsers, changeUserRole,
    promoteToSuperAdmin, demoteSuperAdmin, getAdminSections, promoteToSectionAdmin, setAdminSections,
  } = useAdminPortalStore();

  useEffect(() => { loadUsers(); }, [loadUsers]);
  const { session }  = useAdminAuthStore();
  const { logAction } = useAdminManagementStore();
  const { startUserView } = useAuthStore();
  const navigate = useNavigate();
  const [search, setSearch]   = useState('');
  const [filter, setFilter]   = useState<'all' | 'active' | 'suspended' | 'banned'>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | 'user' | 'admin' | 'super_admin'>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [permModalOpen, setPermModalOpen] = useState<string | null>(null);
  const [permSelections, setPermSelections] = useState<AdminSectionId[]>([]);
  // true when the modal was opened by "Change Role to Admin" (promotion flow) —
  // saving then promotes the user AND assigns sections in one step.
  const [isPromotionFlow, setIsPromotionFlow] = useState(false);

  // ── Advanced filters ────────────────────────────────────────────────────────
  const [advancedOpen, setAdvancedOpen]     = useState(false);
  const [planFilter, setPlanFilter]         = useState<'all' | 'bronze' | 'silver' | 'gold'>('all');
  const [sectionFilter, setSectionFilter]   = useState<'all' | AdminSectionId>('all');
  const [activityFilter, setActivityFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [joinedFrom, setJoinedFrom]         = useState('');
  const [joinedTo, setJoinedTo]             = useState('');

  const activeAdvancedCount =
    (planFilter !== 'all' ? 1 : 0) + (sectionFilter !== 'all' ? 1 : 0) +
    (activityFilter !== 'all' ? 1 : 0) + (joinedFrom ? 1 : 0) + (joinedTo ? 1 : 0);

  const clearAdvancedFilters = () => {
    setPlanFilter('all'); setSectionFilter('all'); setActivityFilter('all');
    setJoinedFrom(''); setJoinedTo('');
  };

  // Quick View drawer (idea §2) — fast summary without leaving this page.
  const [quickViewId, setQuickViewId] = useState<string | null>(null);

  const level = session?.level ?? 1;
  const isSuperAdmin = level >= 6;

  // Resolve user roles — also check persisted super admins (sourced from
  // adminPortalStore's reactive `superAdmins` state, never localStorage directly)
  const resolvedUsers = useMemo(() => {
    const supers = new Set(superAdmins);
    return users.map(u => ({
      ...u,
      role: supers.has(u.email) ? 'super_admin' : (u.role || 'user'),
    }));
  }, [users, superAdmins]);

  // Stats
  const stats = useMemo(() => ({
    total:      resolvedUsers.length,
    superAdmin: resolvedUsers.filter(u => u.role === 'super_admin').length,
    admin:      resolvedUsers.filter(u => u.role === 'admin').length,
    user:       resolvedUsers.filter(u => u.role === 'user' || !u.role).length,
    active:     resolvedUsers.filter(u => u.status === 'active').length,
    suspended:  resolvedUsers.filter(u => u.status === 'suspended').length,
    banned:     resolvedUsers.filter(u => u.status === 'banned').length,
  }), [resolvedUsers]);

  const filtered = resolvedUsers.filter(u => {
    const matchFilter  = filter === 'all' || u.status === filter;
    const matchRole    = roleFilter === 'all' || u.role === roleFilter;
    const matchPlan     = planFilter === 'all' || u.plan === planFilter;
    const matchSection  = sectionFilter === 'all' || getAdminSections(u.email).includes(sectionFilter as AdminSectionId);
    const matchActivity = activityFilter === 'all' || (activityFilter === 'online' ? isUserOnline(u.id) : !isUserOnline(u.id));
    const matchFrom      = !joinedFrom || (u.joinedAt && new Date(u.joinedAt) >= new Date(joinedFrom));
    const matchTo         = !joinedTo || (u.joinedAt && new Date(u.joinedAt) <= new Date(`${joinedTo}T23:59:59`));
    const q = search.toLowerCase();
    const matchSearch = !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.role.toLowerCase().includes(q);
    return matchFilter && matchRole && matchPlan && matchSection && matchActivity && matchFrom && matchTo && matchSearch;
  });

  const selectedUser = resolvedUsers.find(u => u.id === selected);
  const selIsSuper = selectedUser && (selectedUser.role === 'super_admin' || superAdmins.includes(selectedUser.email));
  const quickViewUser = resolvedUsers.find(u => u.id === quickViewId);

  const openPermModal = (email: string, promotion = false) => {
    setPermModalOpen(email);
    setIsPromotionFlow(promotion);
    setPermSelections(promotion ? [] : getAdminSections(email));
  };
  const togglePerm = (sectionId: AdminSectionId) => {
    setPermSelections(prev =>
      prev.includes(sectionId) ? prev.filter(s => s !== sectionId) : [...prev, sectionId]
    );
  };
  const savePerms = () => {
    if (!permModalOpen) return;
    if (isPromotionFlow) {
      promoteToSectionAdmin(permModalOpen, permSelections);
      writeAudit('change_role', permModalOpen, `Promoted to Admin with sections: ${permSelections.join(', ') || 'none'}`);
    } else {
      setAdminSections(permModalOpen, permSelections);
      writeAudit('change_role', permModalOpen, `Updated section access: ${permSelections.join(', ') || 'none'}`);
    }
    setPermModalOpen(null);
    setIsPromotionFlow(false);
  };

  const writeAudit = (action: 'promote_super_admin' | 'demote_super_admin' | 'change_role', email: string, reason: string) => {
    logAction?.({
      adminId:     session?.adminId ?? 'unknown',
      adminLevel:  level,
      adminName:   session?.displayName ?? 'Admin',
      action,
      targetId:    email,
      targetLabel: email,
      timestamp:   new Date().toISOString(),
      reason,
      status:      'completed',
      revertable:  false,
    });
  };
  const handlePromoteToSuperAdmin = (email: string) => {
    promoteToSuperAdmin(email);
    writeAudit('promote_super_admin', email, 'Super admin promotion');
  };
  const handleDemoteSuperAdmin = (email: string) => {
    demoteSuperAdmin(email);
    writeAudit('demote_super_admin', email, 'Super admin demotion');
  };
  const handleChangeToAdmin = (email: string) => {
    // Promoting to Admin always opens the section-picker modal first —
    // the role change + section assignment are saved together in savePerms().
    openPermModal(email, true);
  };
  const handleChangeToUser = (email: string) => {
    changeUserRole(email, 'user');
    writeAudit('change_role', email, 'Changed role to user');
  };

  // ── "View as User" (§New Feature 2) ────────────────────────────────────────
  const handleViewAsUser = (email: string) => {
    const result = startUserView(email);
    if (!result.success) {
      toast.error(result.error ?? 'Could not start User View.');
      return;
    }
    logAction?.({
      adminId:     session?.adminId ?? 'unknown',
      adminLevel:  level,
      adminName:   session?.displayName ?? 'Admin',
      action:      'change_role',
      targetId:    email,
      targetLabel: email,
      timestamp:   new Date().toISOString(),
      reason:      'Started User View (read-only)',
      status:      'completed',
      revertable:  false,
    });
    toast.success(`Viewing as ${email} — read only`);
    navigate('/dashboard');
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5 text-white">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold flex items-center gap-2 text-white">
          <Shield className="h-5 w-5 text-blue-400" /> User Management
          <span className="text-sm font-normal text-white/40">({users.length} total)</span>
        </h1>
      </div>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {[
          { label: 'Total Users',     value: stats.total,       color: '#60a5fa', icon: '👥' },
          { label: 'Super Admin',     value: stats.superAdmin,  color: '#ef4444', icon: '👑' },
          { label: 'Admin',           value: stats.admin,       color: '#f59e0b', icon: '🛡️' },
          { label: 'Regular Users',   value: stats.user,        color: '#34d399', icon: '👤' },
          { label: 'Active',          value: stats.active,      color: '#22c55e', icon: '✅' },
          { label: 'Suspended',       value: stats.suspended,   color: '#f97316', icon: '⏸️' },
          { label: 'Banned',          value: stats.banned,      color: '#dc2626', icon: '🚫' },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3 border bg-white/[0.03] border-white/8">
            <p className="text-lg font-black font-mono" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[10px] mt-0.5 text-white/40">{s.icon} {s.label}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search users by name, email or role…"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm placeholder:opacity-50 focus:outline-none focus:border-primary/40 transition-all bg-white/5 border-white/8 text-white" />
        </div>
        {['all', 'active', 'suspended', 'banned'].map(s => (
          <button key={s} onClick={() => setFilter(s as typeof filter)}
            className={cn('px-4 py-2.5 rounded-xl text-sm font-medium border transition-all capitalize',
              filter === s ? 'bg-primary/15 border-primary/30 text-primary' : 'bg-white/5 border-white/8 text-white/40 hover:text-white/70',
            )}>
            {s}
          </button>
        ))}
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value as any)}
          className="px-4 py-2.5 rounded-xl border text-sm bg-white/5 border-white/8 text-white">
          <option value="all">All Roles</option>
          <option value="super_admin">Super Admin</option>
          <option value="admin">Admin</option>
          <option value="user">Regular Users</option>
        </select>
        <button onClick={() => setAdvancedOpen(o => !o)}
          className={cn('flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all shrink-0',
            advancedOpen || activeAdvancedCount > 0 ? 'bg-primary/15 border-primary/30 text-primary' : 'bg-white/5 border-white/8 text-white/40 hover:text-white/70')}>
          <SlidersHorizontal className="h-4 w-4" /> Advanced
          {activeAdvancedCount > 0 && (
            <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">{activeAdvancedCount}</span>
          )}
          {advancedOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* ── Advanced Filters panel ── */}
      {advancedOpen && (
        <div className="rounded-2xl border p-4 bg-white/[0.03] border-white/8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-white/40 block mb-1.5">Plan</label>
            <select value={planFilter} onChange={e => setPlanFilter(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl border text-sm bg-white/5 border-white/8 text-white">
              <option value="all">All Plans</option>
              <option value="bronze">Bronze</option>
              <option value="silver">Silver</option>
              <option value="gold">Gold</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-white/40 block mb-1.5">
              Admin Section <span className="normal-case text-white/25">(no "department" field exists — using assigned admin sections)</span>
            </label>
            <select value={sectionFilter} onChange={e => setSectionFilter(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl border text-sm bg-white/5 border-white/8 text-white">
              <option value="all">All Sections</option>
              {ADMIN_SECTIONS.map(s => <option key={s.id} value={s.id}>{s.icon} {s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-white/40 block mb-1.5">Activity</label>
            <select value={activityFilter} onChange={e => setActivityFilter(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl border text-sm bg-white/5 border-white/8 text-white">
              <option value="all">Online + Offline</option>
              <option value="online">🟢 Online now</option>
              <option value="offline">⚪ Offline</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-white/40 block mb-1.5 flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Joined Date
            </label>
            <div className="flex items-center gap-1.5">
              <input type="date" value={joinedFrom} onChange={e => setJoinedFrom(e.target.value)}
                className="w-full px-2 py-2 rounded-xl border text-xs bg-white/5 border-white/8 text-white" />
              <span className="text-white/30 text-xs">–</span>
              <input type="date" value={joinedTo} onChange={e => setJoinedTo(e.target.value)}
                className="w-full px-2 py-2 rounded-xl border text-xs bg-white/5 border-white/8 text-white" />
            </div>
          </div>
          {activeAdvancedCount > 0 && (
            <button onClick={clearAdvancedFilters}
              className="lg:col-span-4 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-white/40 hover:text-white/70 border border-white/8 bg-white/[0.02]">
              <X className="h-3.5 w-3.5" /> Clear advanced filters
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* User list */}
        <div className="xl:col-span-2 space-y-2">
          {filtered.map(user => {
            const isSuper = user.role === 'super_admin';
            return (
              <div key={user.id}
                onClick={() => setSelected(user.id === selected ? null : user.id)}
                className={cn('flex items-center gap-3 p-4 rounded-2xl border cursor-pointer transition-all',
                  selected === user.id ? 'border-primary/30 bg-primary/5' : 'bg-white/[0.03] border-white/8 hover:border-white/12',
                )}>
                {/* Avatar */}
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-purple-500/20 overflow-hidden flex-shrink-0 border border-white/8">
                  <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user.name}`} alt="" className="w-full h-full" />
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold truncate text-white">{user.flag} {user.name}</span>
                    <span className={cn('text-[10px] px-2 py-0.5 rounded-full border capitalize', STATUS_STYLE[user.status])}>
                      {user.status}
                    </span>
                    {isSuper && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full border bg-purple-500/10 border-purple-500/20 text-purple-400 font-bold">
                        👑 Super Admin
                      </span>
                    )}
                    {!isSuper && user.role === 'admin' && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full border bg-amber-500/10 border-amber-500/20 text-amber-400 font-bold">
                        🛡️ Admin
                      </span>
                    )}
                    <span className={cn('text-[10px] font-semibold capitalize', PLAN_STYLE[user.plan as keyof typeof PLAN_STYLE])}>
                      {user.plan}
                    </span>
                    <OnlineBadge userId={user.id} />
                  </div>
                  <p className="text-xs truncate text-white/40">{user.email}</p>
                </div>
                {/* Stats */}
                <div className="hidden sm:flex flex-col items-end text-right flex-shrink-0">
                  <span className="text-xs font-mono text-green-400">${user.balance.toLocaleString()}</span>
                  <span className="text-[10px] text-white/40">{user.trades} trades · {user.winRate.toFixed(0)}% WR</span>
                </div>
                {/* Quick View (idea §2) */}
                <button
                  onClick={(e) => { e.stopPropagation(); setQuickViewId(user.id); }}
                  title="Quick View"
                  className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-all shrink-0"
                >
                  <Eye className="h-4 w-4" />
                </button>
                {/* View as User */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleViewAsUser(user.email); }}
                  title="View as User (read-only)"
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all shrink-0 bg-sky-500/10 border-sky-500/20 text-sky-400 hover:bg-sky-500/20"
                >
                  👁️ View as User
                </button>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-center py-12 text-white/40">
              <Search className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No users found</p>
            </div>
          )}
        </div>

        {/* User detail panel */}
        <div className="space-y-4">
          {selectedUser ? (
            <div className="rounded-2xl border p-5 space-y-5 sticky top-6 bg-white/[0.03] border-white/8">
              <div className="flex items-center gap-3">
                <div className="h-14 w-14 rounded-2xl overflow-hidden border border-white/8">
                  <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedUser.name}`} alt="" className="w-full h-full" />
                </div>
                <div>
                  <p className="font-bold text-white">{selectedUser.flag} {selectedUser.name}</p>
                  <p className="text-xs text-white/40">{selectedUser.email}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className={cn('text-[10px] px-2 py-0.5 rounded-full border capitalize inline-flex', STATUS_STYLE[selectedUser.status])}>
                      {selectedUser.status}
                    </span>
                    <OnlineBadge userId={selectedUser.id} />
                  </div>
                  {(selectedUser.roleChangedAt || selIsSuper) && (
                    <p className="text-[10px] mt-1 flex items-center gap-1 text-white/40">
                      <Clock className="h-3 w-3" />
                      Last role change: {selectedUser.roleChangedAt ? new Date(selectedUser.roleChangedAt).toLocaleString() : 'N/A'}
                    </p>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Balance', value: `$${selectedUser.balance.toLocaleString()}`, color: 'text-green-400' },
                  { label: 'Trades',  value: selectedUser.trades,                          color: 'text-blue-400'  },
                  { label: 'Win Rate',value: `${selectedUser.winRate.toFixed(1)}%`,        color: 'text-amber-400' },
                  { label: 'Plan',    value: selectedUser.plan,                            color: PLAN_STYLE[selectedUser.plan as keyof typeof PLAN_STYLE] },
                  { label: 'Role',    value: selectedUser.role || 'user',                 color: selIsSuper ? 'text-purple-400' : selectedUser.role === 'admin' ? 'text-amber-400' : 'text-blue-400' },
                  { label: 'Joined',  value: selectedUser.joinedAt ? new Date(selectedUser.joinedAt).toLocaleDateString() : '—', color: 'text-slate-400' },
                ].map(s => (
                  <div key={s.label} className="rounded-xl p-3 bg-white/5">
                    <p className="text-[10px] mb-0.5 text-white/40">{s.label}</p>
                    <p className={cn('text-sm font-bold capitalize', s.color)}>{s.value}</p>
                  </div>
                ))}
              </div>

              {/* View as User */}
              <button onClick={() => handleViewAsUser(selectedUser.email)}
                className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 text-sm font-bold hover:bg-sky-500/20 transition-all">
                <Eye className="h-4 w-4" /> 👁️ View as User (Read-Only)
              </button>

              {/* Role Management — Super Admin only */}
              {isSuperAdmin && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Role Management</p>

                  {!selIsSuper ? (
                    <button onClick={() => handlePromoteToSuperAdmin(selectedUser.email)}
                      className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 text-sm font-bold hover:bg-purple-500/20 transition-all">
                      <Crown className="h-4 w-4" /> Promote to Super Admin
                    </button>
                  ) : (
                    <button onClick={() => handleDemoteSuperAdmin(selectedUser.email)}
                      className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 text-sm font-bold hover:bg-purple-500/20 transition-all">
                      <ChevronDown className="h-4 w-4" /> Demote from Super Admin
                    </button>
                  )}

                  {selectedUser.role !== 'admin' && !selIsSuper && (
                    <button onClick={() => handleChangeToAdmin(selectedUser.email)}
                      className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm font-semibold hover:bg-amber-500/20 transition-all">
                      <Settings className="h-4 w-4" /> Change Role to Admin
                    </button>
                  )}

                  {selectedUser.role === 'admin' && !selIsSuper && (
                    <>
                      <button onClick={() => handleChangeToUser(selectedUser.email)}
                        className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-semibold hover:bg-blue-500/20 transition-all">
                          <UserCheck className="h-4 w-4" /> Change Role to Regular User
                        </button>

                      {/* Section permissions */}
                      <button onClick={() => openPermModal(selectedUser.email)}
                        className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 text-sm font-semibold hover:bg-sky-500/20 transition-all">
                        <Filter className="h-4 w-4" /> Manage Section Permissions
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Status Actions */}
              {level >= 2 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Status Actions</p>
                  {selectedUser.status !== 'banned' ? (
                    <button onClick={() => banUser(selectedUser.email)}
                      className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-semibold hover:bg-red-500/20 transition-all">
                      <UserX className="h-4 w-4" /> Ban User
                    </button>
                  ) : (
                    <button onClick={() => unbanUser(selectedUser.email)}
                      className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm font-semibold hover:bg-green-500/20 transition-all">
                      <UserCheck className="h-4 w-4" /> Unban User
                    </button>
                  )}
                  {selectedUser.status === 'active' && (
                    <button onClick={() => suspendUser(selectedUser.email)}
                      className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm font-semibold hover:bg-amber-500/20 transition-all">
                      <Shield className="h-4 w-4" /> Suspend
                    </button>
                  )}
                </div>
              )}

              {/* Data masking notice */}
              {level < 3 && (
                <div className="rounded-xl border p-3 text-[11px] flex items-center gap-2 bg-white/5 border-white/8 text-white/40">
                  <Eye className="h-3.5 w-3.5 flex-shrink-0" />
                  Financial details masked for Level {level} access
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border p-8 text-center bg-white/[0.03] border-white/8 text-white/40">
              <Eye className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Select a user to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Section Permissions Modal ── */}
      {permModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="rounded-2xl border p-6 w-full max-w-md mx-4 space-y-4 shadow-2xl bg-[#12121a] border-white/8">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold flex items-center gap-2 text-white">
                <Settings className="h-5 w-5 text-sky-400" />
                {isPromotionFlow ? 'Promote to Admin — Select Sections' : 'Section Permissions'}
              </h3>
              <button onClick={() => { setPermModalOpen(null); setIsPromotionFlow(false); }} className="text-white/40 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-xs text-white/40">
              {isPromotionFlow
                ? 'Choose which sections this new Admin will have access to. They will only see these sections in the admin menu.'
                : 'Select which admin sections this user can access. Super Admin always has full access.'}
            </p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {ADMIN_SECTIONS.map(section => {
                const checked = permSelections.includes(section.id);
                return (
                  <label key={section.id}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all',
                      checked ? 'border-primary/40 bg-primary/8' : 'border-white/8',
                    )}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePerm(section.id)}
                      className="w-4 h-4 accent-primary"
                    />
                    <span className="text-base">{section.icon}</span>
                    <span className="text-sm font-medium text-white">{section.label}</span>
                  </label>
                );
              })}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setPermModalOpen(null); setIsPromotionFlow(false); }}
                className="flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-all bg-white/5 border-white/8 text-white/40">
                Cancel
              </button>
              <button onClick={savePerms}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold transition-all">
                {isPromotionFlow ? 'Promote & Save' : 'Save Permissions'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Quick View side drawer (idea §2) ──────────────────────────────────
          A fast, read-only summary that slides in over the current page —
          the admin never has to leave User Management to glance at a user. */}
      {quickViewUser && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setQuickViewId(null)} />
          <div className="relative w-full max-w-sm h-full bg-[#12121a] border-l border-white/8 shadow-2xl p-6 space-y-5 overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold flex items-center gap-2 text-white">
                <Eye className="h-5 w-5 text-sky-400" /> Quick View
              </h3>
              <button onClick={() => setQuickViewId(null)} className="text-white/40 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="h-16 w-16 rounded-2xl overflow-hidden border border-white/8 flex-shrink-0">
                <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${quickViewUser.name}`} alt="" className="w-full h-full" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-white truncate">{quickViewUser.flag} {quickViewUser.name}</p>
                <p className="text-xs text-white/40 truncate">{quickViewUser.email}</p>
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <span className={cn('text-[10px] px-2 py-0.5 rounded-full border capitalize', STATUS_STYLE[quickViewUser.status])}>
                    {quickViewUser.status}
                  </span>
                  <OnlineBadge userId={quickViewUser.id} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Balance',  value: `${quickViewUser.balance.toLocaleString()}`,      icon: Wallet,     color: 'text-green-400' },
                { label: 'Trades',   value: quickViewUser.trades,                              icon: BarChart2,  color: 'text-blue-400'  },
                { label: 'Win Rate', value: `${quickViewUser.winRate.toFixed(1)}%`,             icon: TrendingUp, color: 'text-amber-400' },
                { label: 'Plan',     value: quickViewUser.plan,                                 icon: Crown,      color: PLAN_STYLE[quickViewUser.plan as keyof typeof PLAN_STYLE] },
              ].map(s => (
                <div key={s.label} className="rounded-xl p-3 bg-white/5">
                  <p className="text-[10px] mb-1 text-white/40 flex items-center gap-1"><s.icon className="h-3 w-3" /> {s.label}</p>
                  <p className={cn('text-sm font-bold capitalize', s.color)}>{s.value}</p>
                </div>
              ))}
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between py-2 border-b border-white/5">
                <span className="text-white/40">Role</span>
                <span className="font-semibold text-white capitalize">{quickViewUser.role || 'user'}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-white/5">
                <span className="text-white/40">Joined</span>
                <span className="font-semibold text-white">{quickViewUser.joinedAt ? new Date(quickViewUser.joinedAt).toLocaleDateString() : '—'}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-white/5">
                <span className="text-white/40">Last Login</span>
                <span className="font-semibold text-white">
                  {getLoginStats(quickViewUser.id).lastLogin
                    ? new Date(getLoginStats(quickViewUser.id).lastLogin!.timestamp).toLocaleString()
                    : 'No recorded logins'}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-white/5">
                <span className="text-white/40">Country</span>
                <span className="font-semibold text-white">{quickViewUser.flag} {quickViewUser.country || '—'}</span>
              </div>
            </div>

            <p className="text-[10px] text-white/25 text-center pt-2">
              Read-only summary — open the full detail panel to take action.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
