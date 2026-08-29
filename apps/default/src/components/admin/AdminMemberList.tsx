import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, Shield, UserX, UserCheck, Trash2,
  ChevronDown, ChevronUp, Clock, Mail, Check, X,
  Loader2, ShieldOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/authStore';
import {
  useAdminManagementStore,
  ADMIN_LEVEL_META,
  AdminLevel,
  AdminMember,
} from '@/lib/adminManagementStore';

const LEVELS: AdminLevel[] = [1, 2, 3, 4, 5, 6];

export function AdminMemberList() {
  const { user } = useAuthStore();
  const { members, createAdmin, suspendAdmin, activateAdmin, deleteAdmin } =
    useAdminManagementStore();

  const [search, setSearch]         = useState('');
  const [filterLevel, setFilterLevel] = useState<AdminLevel | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Create form state
  const [newEmail, setNewEmail]     = useState('');
  const [newName, setNewName]       = useState('');
  const [newLevel, setNewLevel]     = useState<AdminLevel>(1);
  const [creating, setCreating]     = useState(false);

  const filtered = members.filter(m => {
    const levelMatch = filterLevel === 'all' || m.level === filterLevel;
    const q = search.toLowerCase();
    const textMatch = !q || m.displayName.toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
    return levelMatch && textMatch;
  });

  const handleCreate = async () => {
    if (!newEmail.trim() || !newName.trim() || !user) return;
    setCreating(true);
    await new Promise(res => setTimeout(res, 600));
    createAdmin({
      userId:      `inv_${Date.now()}`,
      email:       newEmail.trim().toLowerCase(),
      displayName: newName.trim(),
      avatarSeed:  newName.trim().split(' ')[0],
      level:       newLevel,
      department:  ADMIN_LEVEL_META[newLevel].role,
      status:      'active',
      permissions: [],
    });
    setCreating(false);
    setShowCreate(false);
    setNewEmail('');
    setNewName('');
    setNewLevel(1);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-secondary/30 border border-white/8 text-sm focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all"
          />
        </div>

        {/* Level filter */}
        <select
          value={String(filterLevel)}
          onChange={e => setFilterLevel(e.target.value === 'all' ? 'all' : Number(e.target.value) as AdminLevel)}
          className="px-3 py-2.5 rounded-xl bg-secondary/30 border border-white/8 text-sm focus:outline-none focus:border-primary/40 transition-all"
        >
          <option value="all">All Levels</option>
          {LEVELS.map(l => (
            <option key={l} value={l}>{ADMIN_LEVEL_META[l].icon} {ADMIN_LEVEL_META[l].role}</option>
          ))}
        </select>

        {/* Create button */}
        <button
          onClick={() => setShowCreate(v => !v)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all shadow-lg shadow-primary/20"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New Admin</span>
        </button>
      </div>

      {/* Create form */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-card border border-primary/20 rounded-2xl p-5 shadow-lg space-y-4">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Plus className="h-4 w-4 text-primary" /> Invite New Admin
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">Display Name</label>
                  <input
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="e.g. Sarah Chen"
                    className="w-full px-3 py-2.5 rounded-xl bg-secondary/30 border border-white/10 text-sm focus:outline-none focus:border-primary/40 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      value={newEmail}
                      onChange={e => setNewEmail(e.target.value)}
                      placeholder="admin@example.com"
                      type="email"
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-secondary/30 border border-white/10 text-sm focus:outline-none focus:border-primary/40 transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Level picker */}
              <div>
                <label className="block text-xs text-muted-foreground mb-2">Admin Level & Role</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {LEVELS.map(l => {
                    const meta = ADMIN_LEVEL_META[l];
                    const selected = newLevel === l;
                    return (
                      <button
                        key={l}
                        onClick={() => setNewLevel(l)}
                        className={cn(
                          'flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left text-xs transition-all',
                          selected
                            ? 'border-opacity-60'
                            : 'border-white/8 bg-secondary/20 hover:border-white/15',
                        )}
                        style={selected ? { borderColor: meta.color + '60', background: meta.bg } : {}}
                      >
                        <span>{meta.icon}</span>
                        <div className="min-w-0">
                          <p className="font-semibold truncate" style={selected ? { color: meta.color } : {}}>{meta.role}</p>
                          <p className="text-muted-foreground">Lv {l}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleCreate}
                  disabled={!newEmail.trim() || !newName.trim() || creating}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-50"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {creating ? 'Sending…' : 'Send Invitation'}
                </button>
                <button
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2.5 rounded-xl bg-secondary/40 text-muted-foreground text-sm hover:bg-secondary/60 transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Member list */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Shield className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">No admins found.</p>
          <p className="text-xs mt-1">Click "New Admin" to invite your first admin.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(member => (
            <AdminMemberRow
              key={member.id}
              member={member}
              expanded={expandedId === member.id}
              onToggle={() => setExpandedId(id => id === member.id ? null : member.id)}
              onSuspend={() => user && suspendAdmin(member.id, user)}
              onActivate={() => user && activateAdmin(member.id, user)}
              onDelete={() => setConfirmDelete(member.id)}
            />
          ))}
        </div>
      )}

      {/* Delete confirm modal */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card border border-red-500/20 rounded-2xl p-6 max-w-sm w-full shadow-2xl"
            >
              <h3 className="font-bold text-red-400 mb-2">Delete Admin Account?</h3>
              <p className="text-sm text-muted-foreground mb-5">
                This will permanently remove the admin and all their permissions. This cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    if (user && confirmDelete) {
                      deleteAdmin(confirmDelete, user);
                      setConfirmDelete(null);
                    }
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-bold text-sm hover:bg-red-600 transition-colors"
                >
                  Delete
                </button>
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="flex-1 py-2.5 rounded-xl bg-secondary/60 text-muted-foreground text-sm hover:bg-secondary transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AdminMemberRow({
  member, expanded, onToggle, onSuspend, onActivate, onDelete,
}: {
  member: AdminMember;
  expanded: boolean;
  onToggle: () => void;
  onSuspend: () => void;
  onActivate: () => void;
  onDelete: () => void;
}) {
  const meta = ADMIN_LEVEL_META[member.level];
  const avatarSrc = `https://api.dicebear.com/7.x/avataaars/svg?seed=${member.avatarSeed}`;
  const lastActive = member.lastActiveAt
    ? new Date(member.lastActiveAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

  return (
    <div className="bg-card border border-white/5 rounded-2xl overflow-hidden shadow-sm transition-all hover:border-white/10">
      {/* Row header */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer"
        onClick={onToggle}
      >
        {/* Avatar */}
        <div className="relative h-10 w-10 rounded-xl overflow-hidden border border-white/10 flex-shrink-0 bg-secondary/50">
          <img src={avatarSrc} alt={member.displayName} className="w-full h-full object-cover" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm truncate">{member.displayName}</span>
            {/* Level badge */}
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-bold border"
              style={{ color: meta.color, background: meta.bg, borderColor: meta.border }}
            >
              {meta.icon} {meta.role}
            </span>
            {/* Status badge */}
            <span className={cn(
              'px-2 py-0.5 rounded-full text-[10px] font-semibold border',
              member.status === 'active'
                ? 'bg-green-500/10 border-green-500/20 text-green-400'
                : 'bg-red-500/10 border-red-500/20 text-red-400',
            )}>
              {member.status === 'active' ? '● Active' : '○ Suspended'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">{member.email}</p>
        </div>

        {/* Last active */}
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground flex-shrink-0">
          <Clock className="h-3 w-3" />
          <span>{lastActive}</span>
        </div>

        {/* Chevron */}
        <div className="text-muted-foreground flex-shrink-0 ml-2">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </div>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4 border-t border-white/5 pt-3">

              {/* Department & metadata */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Department', value: member.department },
                  { label: 'Level', value: `Level ${member.level} — ${meta.role}` },
                  { label: 'Joined', value: new Date(member.createdAt).toLocaleDateString() },
                  { label: 'Status', value: member.status === 'active' ? 'Active' : 'Suspended' },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-secondary/20 rounded-xl p-2.5">
                    <p className="text-[10px] text-muted-foreground mb-1">{label}</p>
                    <p className="text-xs font-semibold truncate">{value}</p>
                  </div>
                ))}
              </div>

              {/* Recent actions */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Recent Actions (last 10)</p>
                {member.actionsLog.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No actions logged yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {member.actionsLog.slice(0, 10).map(a => (
                      <div key={a.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="w-1.5 h-1.5 bg-primary/50 rounded-full flex-shrink-0" />
                        <span className="flex-1 truncate">{a.action} → {a.targetLabel}</span>
                        <span className="text-[10px] flex-shrink-0 opacity-60">
                          {new Date(a.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                {member.status === 'active' ? (
                  <button
                    onClick={onSuspend}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold hover:bg-amber-500/20 transition-all"
                  >
                    <ShieldOff className="h-3.5 w-3.5" /> Suspend
                  </button>
                ) : (
                  <button
                    onClick={onActivate}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-semibold hover:bg-green-500/20 transition-all"
                  >
                    <UserCheck className="h-3.5 w-3.5" /> Activate
                  </button>
                )}
                <button
                  onClick={onDelete}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-all ml-auto"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove Admin
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
