import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { FileText, Search, RotateCcw, Download, AlertTriangle, X, Clock, Filter, Bot, MessageSquare, ChevronDown, ChevronUp, Ticket } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminManagementStore, RichAuditEntry, AuditActionType } from '@/lib/adminManagementStore';
import { useAdminAuthStore } from '@/lib/adminAuthStore';
import { getAllConversations, MentorConversation } from '@/lib/mentorChatStore';
import { useAuthStore, getUserViewAccessLog } from '@/lib/authStore';
import { Eye as EyeIcon } from 'lucide-react';

const ACTION_COLOR: Partial<Record<AuditActionType, string>> = {
  ban_user:        'text-red-400',
  delete_admin:    'text-red-400',
  suspend_admin:   'text-amber-400',
  reject_payment:  'text-red-400',
  approve_payment: 'text-green-400',
  approve_request: 'text-green-400',
  close_ticket:    'text-teal-400',
  resolve_report:  'text-purple-400',
  publish_lesson:  'text-sky-400',
  revert_action:   'text-orange-400',
};
const STATUS_STYLE = {
  completed: 'bg-green-500/10 border-green-500/20 text-green-400',
  failed:    'bg-red-500/10 border-red-500/20 text-red-400',
  reverted:  'bg-amber-500/10 border-amber-500/20 text-amber-400',
  pending:   'bg-white/5 border-white/10 text-white/40',
};

// ─── Lynx AI Conversation Log (SUPER_ADMIN only) ───────────────────────────

function MentorConvCard({ conv }: { conv: MentorConversation }) {
  const [expanded, setExpanded] = useState(false);
  const hasEscalation = !!conv.escalatedSection;
  return (
    <div className="border border-white/5 rounded-2xl bg-white/[0.02] overflow-hidden">
      <div className="flex items-center gap-3 p-4 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <div className="w-8 h-8 rounded-xl bg-yellow-500/10 flex items-center justify-center flex-shrink-0">
          <Bot className="h-4 w-4 text-yellow-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{conv.userName || conv.userEmail}</p>
          <p className="text-[11px] text-white/40">
            {conv.messages.length} messages · {new Date(conv.startedAt).toLocaleString()}
            {hasEscalation && <span className="ml-2 text-amber-400">· Escalated → {conv.escalatedSection}</span>}
          </p>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-white/30" /> : <ChevronDown className="h-4 w-4 text-white/30" />}
      </div>
      {expanded && (
        <div className="border-t border-white/5 p-4 space-y-2 max-h-80 overflow-y-auto">
          {conv.messages.map(m => (
            <div key={m.id} className={cn('text-xs p-2 rounded-xl', m.role === 'user' ? 'bg-white/5 text-white/70' : 'bg-yellow-500/5 text-white/60')}>
              <span className="font-bold text-[10px] uppercase tracking-wider mr-2" style={{ color: m.role === 'user' ? '#60a5fa' : '#FFD700' }}>
                {m.role === 'user' ? conv.userName || 'User' : 'Lynx AI'}
              </span>
              {m.content}
            </div>
          ))}
          {conv.escalatedTicketId && (
            <div className="flex items-center gap-2 mt-2 p-2 rounded-xl bg-amber-500/5 border border-amber-500/15">
              <Ticket className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-[11px] text-amber-400">Ticket created: {conv.escalatedTicketId.slice(0, 20)}…</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MentorLogsTab() {
  const [search, setSearch] = useState('');
  const allConvs = useMemo(() => getAllConversations(), []);
  const filtered = allConvs.filter(c => {
    const q = search.toLowerCase();
    return !q || c.userName.toLowerCase().includes(q) || c.userEmail.toLowerCase().includes(q);
  });
  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by user…"
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/3 border border-white/8 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-primary/40 transition-all" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Conversations', value: allConvs.length, color: '#60a5fa' },
          { label: 'Escalated',           value: allConvs.filter(c => c.escalatedSection).length, color: '#f59e0b' },
          { label: 'Unique Users',        value: new Set(allConvs.map(c => c.userId)).size, color: '#34d399' },
        ].map(k => (
          <div key={k.label} className="bg-white/[0.03] border border-white/8 rounded-2xl p-4">
            <p className="text-xl font-bold font-mono" style={{ color: k.color }}>{k.value}</p>
            <p className="text-xs text-white/40 mt-0.5">{k.label}</p>
          </div>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-white/20">
          <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm">No Lynx AI conversations yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => <MentorConvCard key={c.id} conv={c} />)}
        </div>
      )}
    </div>
  );
}

// ─── User View Access Log (idea §1 — "who viewed whose account, and when") ──
// Admin-only visibility: this tab lives inside the Super-Admin-gated Audit
// Logs page, and the impersonated user is never shown or notified.

function UserViewLogTab() {
  const entries = useMemo(() => getUserViewAccessLog(), []);
  if (entries.length === 0) {
    return (
      <div className="text-center py-16 text-white/20">
        <EyeIcon className="h-12 w-12 mx-auto mb-3 opacity-20" />
        <p className="text-sm">No data available</p>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {entries.map(e => (
        <div key={e.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/5">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <EyeIcon className="h-3.5 w-3.5 text-sky-400 flex-shrink-0" />
            <div className="min-w-0 text-xs">
              <span className="font-semibold text-white">{e.adminEmail}</span>
              <span className="text-white/30"> viewed as </span>
              <span className="font-semibold text-sky-400">{e.targetEmail}</span>
            </div>
          </div>
          <span className={cn('text-[10px] px-2 py-0.5 rounded-full border', e.endedAt ? 'bg-white/5 border-white/10 text-white/40' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400')}>
            {e.endedAt ? 'Ended' : 'Active'}
          </span>
          <div className="text-[11px] text-white/25 flex-shrink-0">
            {new Date(e.startedAt).toLocaleString()}
            {e.endedAt && <> → {new Date(e.endedAt).toLocaleTimeString()}</>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main AdminLogs ───────────────────────────────────────────────────────────

export function AdminLogs() {
  const { richAudit, revertAction, alerts, dismissAlert } = useAdminManagementStore();
  const { session } = useAdminAuthStore();
  const { user }    = useAuthStore();
  const isSuperAdmin = user?.role === 'super_admin' || (session && session.level >= 6);
  const [activeTab, setActiveTab] = useState<'audit' | 'mentor' | 'user-view'>('audit');
  const [search, setSearch]     = useState('');
  const [actionFilter, setActionFilter] = useState<'all' | AuditActionType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | string>('all');
  const [page, setPage]         = useState(0);
  const PAGE_SIZE = 15;

  // Unique actions present
  const uniqueActions = useMemo(() => {
    const set = new Set(richAudit.map(e => e.action));
    return Array.from(set).sort();
  }, [richAudit]);

  const filtered = richAudit.filter(e => {
    const matchA = actionFilter === 'all' || e.action === actionFilter;
    const matchS = statusFilter === 'all' || e.status === statusFilter;
    const q      = search.toLowerCase();
    const matchQ = !q || e.adminName.toLowerCase().includes(q) || e.action.includes(q) || e.targetLabel.toLowerCase().includes(q) || e.ipAddress.includes(q);
    return matchA && matchS && matchQ;
  });

  const activeAlerts = (alerts ?? []).filter(a => !a.dismissed);

  const paged   = filtered.slice(0, (page + 1) * PAGE_SIZE);
  const hasMore       = filtered.length > paged.length;
  const hasAlerts     = activeAlerts.length > 0;

  const exportCSV = () => {
    const rows = ['id,admin,level,action,target,ip,status,timestamp,reason',
      ...filtered.map(e => [e.id, e.adminName, e.adminLevel, e.action, e.targetLabel, e.ipAddress, e.status, e.timestamp, e.reason].join(','))];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'audit_log.csv'; a.click();
  };

  const handleRevert = (entry: RichAuditEntry) => {
    if (!session) return;
    revertAction(entry.id, { displayName: session.displayName, id: session.adminId } as any);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-white flex items-center gap-2">
          <FileText className="h-5 w-5 text-slate-400" />
          {activeTab === 'audit' ? 'Audit Logs' : activeTab === 'mentor' ? 'Lynx AI Conversations' : 'User View Access Log'}
          {activeTab === 'audit' && <span className="text-sm font-normal text-white/30">({filtered.length} events)</span>}
        </h1>
        <div className="flex items-center gap-2">
          {/* Tab switcher — Lynx AI tab only for SUPER_ADMIN */}
          <div className="flex gap-1 p-1 rounded-xl bg-white/5 border border-white/8">
            <button onClick={() => setActiveTab('audit')}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5',
                activeTab === 'audit' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70')}>
              <FileText className="h-3 w-3" /> Audit
            </button>
            {isSuperAdmin && (
              <button onClick={() => setActiveTab('mentor')}
                className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5',
                  activeTab === 'mentor' ? 'bg-yellow-500/15 text-yellow-400' : 'text-white/40 hover:text-white/70')}>
                <Bot className="h-3 w-3" /> Lynx AI
              </button>
            )}
            <button onClick={() => setActiveTab('user-view')}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5',
                activeTab === 'user-view' ? 'bg-sky-500/15 text-sky-400' : 'text-white/40 hover:text-white/70')}>
              <EyeIcon className="h-3 w-3" /> User View Log
            </button>
          </div>
          {activeTab === 'audit' && (
            <button onClick={exportCSV}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/8 text-white/60 hover:text-white text-sm transition-all">
              <Download className="h-4 w-4" /> Export
            </button>
          )}
        </div>
      </div>

      {/* Lynx AI conversations tab */}
      {activeTab === 'mentor' && isSuperAdmin && <MentorLogsTab />}

      {/* User View access log tab (idea §1) */}
      {activeTab === 'user-view' && <UserViewLogTab />}

      {activeTab === 'audit' ? (<>

      {/* Suspicious Alerts */}
      {hasAlerts && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> Suspicious Patterns Detected
          </p>
          {activeAlerts.map(a => (
            <div key={a.id} className={cn('flex items-center gap-3 px-4 py-3 rounded-xl border text-sm',
              a.severity === 'high'   ? 'bg-red-500/8 border-red-500/20 text-red-300' :
              a.severity === 'medium' ? 'bg-amber-500/8 border-amber-500/20 text-amber-300' :
                                       'bg-blue-500/8 border-blue-500/20 text-blue-300')}>
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <p className="flex-1 text-xs">{a.description}</p>
              <button onClick={() => dismissAlert?.(a.id)} className="text-white/30 hover:text-white transition-all">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Search by admin, action, IP…"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/3 border border-white/8 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-primary/40 transition-all" />
          </div>
          {(['all', 'completed', 'reverted', 'failed'] as const).map(s => (
            <button key={s} onClick={() => { setStatusFilter(s); setPage(0); }}
              className={cn('hidden sm:block px-3 py-2.5 rounded-xl text-xs font-medium border capitalize transition-all',
                statusFilter === s ? 'bg-primary/15 border-primary/30 text-primary' : 'bg-white/3 border-white/8 text-white/40 hover:text-white/70')}>
              {s}
            </button>
          ))}
        </div>
        {/* Action filter */}
        <div className="flex gap-2 flex-wrap">
          <span className="text-xs text-white/30 flex items-center gap-1 self-center"><Filter className="h-3 w-3" /> Action:</span>
          <button onClick={() => setActionFilter('all')}
            className={cn('px-2.5 py-1 rounded-lg text-[11px] border transition-all',
              actionFilter === 'all' ? 'bg-primary/15 border-primary/30 text-primary' : 'bg-white/3 border-white/8 text-white/40 hover:text-white/60')}>
            All
          </button>
          {uniqueActions.slice(0, 10).map(a => (
            <button key={a} onClick={() => setActionFilter(a as AuditActionType)}
              className={cn('px-2.5 py-1 rounded-lg text-[11px] border transition-all capitalize',
                actionFilter === a ? 'bg-primary/15 border-primary/30 text-primary' : 'bg-white/3 border-white/8 text-white/40 hover:text-white/60')}>
              {a.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Log table */}
      <div className="space-y-1.5">
        {paged.map((entry, i) => (
          <motion.div key={entry.id} layout
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
            className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/8 transition-all group">
            {/* Action */}
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <div className="w-1.5 h-1.5 rounded-full bg-white/20 flex-shrink-0" />
              <div className="min-w-0">
                <span className={cn('text-xs font-semibold capitalize', ACTION_COLOR[entry.action] ?? 'text-white/60')}>
                  {entry.action.replace(/_/g, ' ')}
                </span>
                <span className="text-[11px] text-white/30 ml-2">→ {entry.targetLabel}</span>
              </div>
            </div>

            {/* Admin */}
            <div className="hidden md:block text-[11px] text-white/40 w-32 flex-shrink-0 truncate">
              {entry.adminName}
              <span className="ml-1 text-white/20">L{entry.adminLevel}</span>
            </div>

            {/* IP */}
            <div className="hidden lg:block text-[11px] font-mono text-white/25 w-28 flex-shrink-0">
              {entry.ipAddress}
            </div>

            {/* Reason */}
            <div className="hidden xl:block text-[11px] text-white/25 w-32 flex-shrink-0 truncate">
              {entry.reason}
            </div>

            {/* Time */}
            <div className="text-[11px] text-white/25 flex items-center gap-1 flex-shrink-0">
              <Clock className="h-3 w-3" />
              {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              <span className="text-white/15 mx-0.5">·</span>
              {new Date(entry.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
            </div>

            {/* Status + revert */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={cn('text-[10px] px-2 py-0.5 rounded-full border capitalize', STATUS_STYLE[entry.status])}>
                {entry.status}
              </span>
              {entry.revertable && entry.status === 'completed' && (
                <button onClick={() => handleRevert(entry)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg bg-orange-500/8 border border-orange-500/15 text-orange-400 hover:bg-orange-500/15 transition-all">
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </motion.div>
        ))}

        {paged.length === 0 && (
          <div className="text-center py-16 text-white/20">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm">No audit events found.</p>
          </div>
        )}
      </div>

      {hasMore && (
        <button onClick={() => setPage(p => p + 1)}
          className="w-full py-3 rounded-xl bg-white/3 border border-white/8 text-sm text-white/40 hover:text-white hover:bg-white/5 transition-all">
          Load more ({filtered.length - paged.length} remaining)
        </button>
      )}
      </>) : null}
    </div>
  );
}
