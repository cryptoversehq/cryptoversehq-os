import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { HeadphonesIcon, Search, CheckCircle2, ArrowUpCircle, Star, Clock, AlertTriangle, Loader2, Send, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminPortalStore } from '@/lib/adminPortalStore';
import { useAdminAuthStore } from '@/lib/adminAuthStore';

const PRIO_STYLE: Record<string, string> = {
  low:      'bg-slate-500/10 border-slate-500/20 text-slate-400',
  medium:   'bg-blue-500/10 border-blue-500/20 text-blue-400',
  high:     'bg-amber-500/10 border-amber-500/20 text-amber-400',
  critical: 'bg-red-500/10 border-red-500/25 text-red-400',
};
const STATUS_STYLE: Record<string, string> = {
  open:           'bg-blue-500/10 border-blue-500/20 text-blue-400',
  ai_handling:    'bg-purple-500/10 border-purple-500/20 text-purple-400',
  admin_handling: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
  resolved:       'bg-green-500/10 border-green-500/20 text-green-400',
  closed:         'bg-slate-500/10 border-slate-500/20 text-slate-400',
};

export function AdminTickets() {
  const { session } = useAdminAuthStore();
  const { tickets, resolveTicket, escalateTicket, loadTickets, loadingTickets } = useAdminPortalStore();
  const [search,     setSearch]     = useState('');
  const [filter,     setFilter]     = useState('all');
  const [pFilter,    setPFilter]    = useState('all');
  const [replyId,    setReplyId]    = useState<string | null>(null);
  const [replyText,  setReplyText]  = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  const adminId = session?.adminId ?? 'admin';

  const filtered = tickets.filter(t => {
    const matchS = filter === 'all' || t.status === filter;
    const matchP = pFilter === 'all' || t.priority === pFilter;
    const q = search.toLowerCase();
    const matchQ = !q || t.userName.toLowerCase().includes(q) || t.title.toLowerCase().includes(q) || t.userEmail.toLowerCase().includes(q);
    return matchS && matchP && matchQ;
  });

  const open     = tickets.filter(t => ['open','ai_handling'].includes(t.status)).length;
  const pending  = tickets.filter(t => t.status === 'admin_handling').length;
  const critical = tickets.filter(t => t.priority === 'critical').length;
  const rated    = tickets.filter(t => t.rating !== undefined);
  const avgRating = rated.length > 0 ? rated.reduce((s, t) => s + (t.rating ?? 0), 0) / rated.length : 0;

  const handleReply = async (nodeId: string) => {
    if (!replyText.trim()) return;
    setSubmitting(true);
    await resolveTicket(nodeId, adminId, replyText.trim());
    setReplyId(null);
    setReplyText('');
    setSubmitting(false);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-white flex items-center gap-2">
          <HeadphonesIcon className="h-5 w-5 text-teal-400" /> Support Tickets
          <span className="text-sm font-normal text-white/30">({tickets.length} total)</span>
        </h1>
        <button onClick={() => loadTickets()} disabled={loadingTickets}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-sm text-white/40 hover:text-white border border-white/8 transition-all">
          <RefreshCw className={cn('h-4 w-4', loadingTickets && 'animate-spin')} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Open',        value: open,                       color: '#60a5fa', icon: Clock },
          { label: 'Need Reply',  value: pending,                    color: '#f59e0b', icon: AlertTriangle },
          { label: 'Critical',    value: critical,                   color: '#ef4444', icon: AlertTriangle },
          { label: 'Avg Rating',  value: avgRating.toFixed(1) + '★', color: '#f59e0b', icon: Star },
        ].map(k => (
          <div key={k.label} className="bg-white/[0.03] border border-white/8 rounded-2xl p-4">
            <k.icon className="h-4 w-4 mb-2" style={{ color: k.color }} />
            <p className="text-xl font-bold text-white font-mono">{k.value}</p>
            <p className="text-xs text-white/40 mt-0.5">{k.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tickets…"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/3 border border-white/8 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-primary/40 transition-all" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['all','open','ai_handling','admin_handling','resolved','closed']).map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={cn('px-3 py-2.5 rounded-xl text-xs font-medium border capitalize transition-all',
                filter===s ? 'bg-primary/15 border-primary/30 text-primary' : 'bg-white/3 border-white/8 text-white/40 hover:text-white/70')}>
              {s.replace(/_/g,' ')}
            </button>
          ))}
        </div>
      </div>

      {loadingTickets ? (
        <div className="flex items-center justify-center py-20 gap-3 text-white/30">
          <Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">Loading tickets…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-white/20 text-sm">No tickets found.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(ticket => (
            <motion.div key={ticket.nodeId} layout
              className={cn('rounded-2xl border transition-all',
                ticket.priority === 'critical' ? 'border-red-500/20 bg-red-500/3' : 'border-white/5 bg-white/[0.02]')}>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={cn('h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 border', PRIO_STYLE[ticket.priority])}>
                    <HeadphonesIcon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{ticket.title}</p>
                    <p className="text-xs text-white/40">
                      {ticket.userName} · {ticket.section}
                      {ticket.rating !== undefined && <span className="ml-2 text-amber-400">★ {ticket.rating.toFixed(1)}</span>}
                    </p>
                  </div>
                </div>
                <p className="hidden lg:block text-[11px] text-white/25 flex-shrink-0">
                  {new Date(ticket.createdAt).toLocaleDateString()}
                </p>
                <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                  <span className={cn('text-[10px] px-2 py-0.5 rounded-full border capitalize', PRIO_STYLE[ticket.priority])}>
                    {ticket.priority}
                  </span>
                  <span className={cn('text-[10px] px-2 py-0.5 rounded-full border capitalize', STATUS_STYLE[ticket.status] ?? 'bg-white/5 border-white/10 text-white/40')}>
                    {ticket.status.replace(/_/g,' ')}
                  </span>
                  {['open','ai_handling','admin_handling'].includes(ticket.status) && (
                    <>
                      <button onClick={() => setReplyId(replyId === ticket.nodeId ? null : ticket.nodeId)}
                        className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-all">
                        <Send className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => escalateTicket(ticket.nodeId)}
                        className="p-1.5 rounded-lg bg-red-500/8 border border-red-500/15 text-red-400 hover:bg-red-500/15 transition-all">
                        <ArrowUpCircle className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {ticket.description && (
                <div className="px-4 pb-3">
                  <p className="text-xs text-white/40 leading-relaxed line-clamp-2">{ticket.description}</p>
                </div>
              )}

              {replyId === ticket.nodeId && (
                <div className="px-4 pb-4 space-y-2">
                  <textarea value={replyText} onChange={e => setReplyText(e.target.value)} rows={3}
                    placeholder="Type your response to the user…"
                    className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-foreground placeholder:text-white/20 focus:outline-none focus:border-primary/30 resize-none" />
                  <div className="flex gap-2">
                    <button onClick={() => { setReplyId(null); setReplyText(''); }}
                      className="flex-1 py-2 rounded-xl bg-white/5 text-sm text-white/40 hover:text-white">Cancel</button>
                    <button onClick={() => handleReply(ticket.nodeId)} disabled={!replyText.trim() || submitting}
                      className="flex-1 py-2 rounded-xl bg-blue-500/15 border border-blue-500/25 text-blue-400 text-sm font-bold disabled:opacity-50 hover:bg-blue-500/25 flex items-center justify-center gap-2">
                      {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4" /> Send Reply</>}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
