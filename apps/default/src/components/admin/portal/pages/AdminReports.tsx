import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Flag, Search, CheckCircle2, XCircle, Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminPortalStore } from '@/lib/adminPortalStore';

const STATUS_STYLE = {
  pending:   'bg-amber-500/10 border-amber-500/25 text-amber-400',
  resolved:  'bg-green-500/10 border-green-500/25 text-green-400',
  dismissed: 'bg-white/5 border-white/10 text-white/30',
};
const CAT_COLOR: Record<string, string> = {
  chat: 'text-purple-400', forum: 'text-blue-400',
  competition: 'text-amber-400', profile: 'text-teal-400',
};

export function AdminReports() {
  const { reports, resolveReport, dismissReport } = useAdminPortalStore();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'resolved' | 'dismissed'>('all');

  const filtered = reports.filter(r => {
    const matchF = filter === 'all' || r.status === filter;
    const q = search.toLowerCase();
    return matchF && (!q || r.reporterName.toLowerCase().includes(q) || r.targetName.toLowerCase().includes(q) || r.reason.toLowerCase().includes(q));
  });

  const pending  = reports.filter(r => r.status === 'pending').length;
  const resolved = reports.filter(r => r.status === 'resolved').length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <h1 className="text-lg font-bold text-white flex items-center gap-2">
        <Flag className="h-5 w-5 text-purple-400" /> User Reports
      </h1>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Pending',  value: pending,  color: '#f59e0b', icon: Clock },
          { label: 'Resolved', value: resolved, color: '#34d399', icon: CheckCircle2 },
          { label: 'Total',    value: reports.length, color: '#a78bfa', icon: Flag },
        ].map(k => (
          <div key={k.label} className="bg-white/[0.03] border border-white/8 rounded-2xl p-4">
            <k.icon className="h-4 w-4 mb-2" style={{ color: k.color }} />
            <p className="text-2xl font-bold text-white font-mono">{k.value}</p>
            <p className="text-xs text-white/40 mt-0.5">{k.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search reports…"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/3 border border-white/8 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-primary/40 transition-all" />
        </div>
        {(['all', 'pending', 'resolved', 'dismissed'] as const).map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={cn('px-4 py-2.5 rounded-xl text-sm font-medium border transition-all capitalize',
              filter === s ? 'bg-primary/15 border-primary/30 text-primary' : 'bg-white/3 border-white/8 text-white/40 hover:text-white/70')}>
            {s}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.map(r => (
          <motion.div key={r.id} layout
            className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className={cn('h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 border',
                r.status === 'pending' ? 'bg-amber-500/10 border-amber-500/20' : 'bg-white/3 border-white/8')}>
                <Flag className={cn('h-4 w-4', r.status === 'pending' ? 'text-amber-400' : 'text-white/30')} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{r.reason}</p>
                <p className="text-xs text-white/40">
                  <span className="text-white/60">{r.reporterName}</span> reported <span className="text-white/60">{r.targetName}</span>
                  {' · '}<span className={CAT_COLOR[r.category] ?? 'text-white/30'}>{r.category}</span>
                </p>
              </div>
            </div>

            <p className="hidden lg:block text-[11px] text-white/25 flex-shrink-0">
              {new Date(r.createdAt).toLocaleDateString()}
            </p>

            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={cn('text-[11px] px-2.5 py-1 rounded-full border capitalize', STATUS_STYLE[r.status])}>
                {r.status}
              </span>
              {r.status === 'pending' && (
                <>
                  <button onClick={() => resolveReport(r.id)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-xs hover:bg-green-500/20 transition-all">
                    <CheckCircle2 className="h-3 w-3" /> Resolve
                  </button>
                  <button onClick={() => dismissReport(r.id)}
                    className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-white/40 hover:text-white/60 transition-all">
                    <XCircle className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
