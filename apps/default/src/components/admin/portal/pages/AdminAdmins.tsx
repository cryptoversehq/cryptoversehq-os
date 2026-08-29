import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Shield, UserX, UserCheck, Trash2, Search, Star, HeadphonesIcon, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminManagementStore, ADMIN_LEVEL_META } from '@/lib/adminManagementStore';
import { useAdminAuthStore } from '@/lib/adminAuthStore';
import { useAuthStore } from '@/lib/authStore';
import { useAdminPortalStore } from '@/lib/adminPortalStore';

export function AdminAdmins() {
  const { members, suspendAdmin, activateAdmin, deleteAdmin } = useAdminManagementStore();
  const { session } = useAdminAuthStore();
  const { user, setUserRole }    = useAuthStore();
  const { tickets, loadTickets } = useAdminPortalStore();
  const [search,  setSearch]  = useState('');
  const [confirm, setConfirm] = useState<{ id: string; action: 'delete' | 'suspend' | 'demote' } | null>(null);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  const filtered = members.filter(m => {
    const q = search.toLowerCase();
    return !q || m.displayName.toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
  });

  const fakeAdmin = user ? { ...user, isAdmin: true, id: session?.adminId ?? user.id } : null;
  const isSuperAdmin = user?.role === 'super_admin' || (session && session.level >= 6);

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

  const doAction = (id: string, action: 'delete' | 'suspend' | 'activate' | 'demote') => {
    if (!fakeAdmin) return;
    if (action === 'delete')   deleteAdmin(id, fakeAdmin as any);
    if (action === 'suspend')  suspendAdmin(id, fakeAdmin as any);
    if (action === 'activate') activateAdmin(id, fakeAdmin as any);
    if (action === 'demote') {
      const m = members.find(mm => mm.id === id);
      if (m) setUserRole(m.email, 'user');
      deleteAdmin(id, fakeAdmin as any);
    }
    setConfirm(null);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-white flex items-center gap-2">
          <Shield className="h-5 w-5 text-red-400" /> Admin Members
          <span className="text-sm font-normal text-white/30">({members.length} total)</span>
        </h1>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search admins…"
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/3 border border-white/8 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-primary/40 transition-all" />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-white/20">
          <Shield className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm">No admin members yet.</p>
          <p className="text-xs mt-1">Approve requests to add new admins.</p>
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
                  {member.status === 'active' ? (
                    <button onClick={() => setConfirm({ id: member.id, action: 'suspend' })}
                      className="p-2 rounded-xl bg-amber-500/8 border border-amber-500/15 text-amber-400 hover:bg-amber-500/15 transition-all" title="Suspend">
                      <UserX className="h-4 w-4" />
                    </button>
                  ) : (
                    <button onClick={() => doAction(member.id, 'activate')}
                      className="p-2 rounded-xl bg-green-500/8 border border-green-500/15 text-green-400 hover:bg-green-500/15 transition-all" title="Activate">
                      <UserCheck className="h-4 w-4" />
                    </button>
                  )}
                  {isSuperAdmin && (
                    <button onClick={() => setConfirm({ id: member.id, action: 'demote' })}
                      className="p-2 rounded-xl bg-red-500/8 border border-red-500/15 text-red-400 hover:bg-red-500/15 transition-all" title="Demote to User">
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
            <p className="text-sm text-white/40 mb-5">This action will be logged in the audit trail.</p>
            <div className="flex gap-3">
              <button onClick={() => doAction(confirm.id, confirm.action)}
                className={cn('flex-1 py-2.5 rounded-xl font-semibold text-sm border transition-all',
                  confirm.action === 'delete' ? 'bg-red-500/15 border-red-500/25 text-red-400 hover:bg-red-500/25' : 'bg-amber-500/15 border-amber-500/25 text-amber-400 hover:bg-amber-500/25')}>
                Confirm
              </button>
              <button onClick={() => setConfirm(null)}
                className="flex-1 py-2.5 rounded-xl font-semibold text-sm bg-white/5 border border-white/10 text-white/60 hover:text-white transition-all">
                Cancel
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
