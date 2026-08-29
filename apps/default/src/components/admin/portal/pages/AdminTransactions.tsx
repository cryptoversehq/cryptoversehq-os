import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { CreditCard, Search, Check, X, Clock, CheckCircle2, XCircle, Copy, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminPaymentStore } from '@/lib/adminPaymentStore';
import { useAdminAuthStore } from '@/lib/adminAuthStore';

const STATUS_STYLE = {
  verified: 'bg-green-500/10 border-green-500/25 text-green-400',
  pending:  'bg-amber-500/10 border-amber-500/25 text-amber-400',
  rejected: 'bg-red-500/10 border-red-500/25 text-red-400',
  expired:  'bg-white/5 border-white/15 text-white/40',
};
const STATUS_ICON = {
  verified: CheckCircle2,
  pending:  Clock,
  rejected: XCircle,
  expired:  Clock,
};

export function AdminTransactions() {
  const { rows, adminApprove, adminReject } = useAdminPaymentStore();
  const { session } = useAdminAuthStore();
  const [search, setSearch]   = useState('');
  const [filter, setFilter]   = useState<'all' | 'pending' | 'verified' | 'rejected'>('all');
  const [copied, setCopied]   = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const filtered = rows.filter(t => {
    const matchF = filter === 'all' || t.status === filter;
    const q = search.toLowerCase();
    const matchS = !q || t.userEmail.toLowerCase().includes(q) || t.userDisplayName.toLowerCase().includes(q) || t.txHash.toLowerCase().includes(q);
    return matchF && matchS;
  });

  const pending  = rows.filter(t => t.status === 'pending').length;
  const verified = rows.filter(t => t.status === 'verified').length;
  const rejected = rows.filter(t => t.status === 'rejected').length;
  const revenue  = rows.filter(t => t.status === 'verified').reduce((s, t) => s + t.amount, 0);

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash).then(() => { setCopied(hash); setTimeout(() => setCopied(null), 1500); });
  };

  const handleApprove = (id: string) => {
    const res = adminApprove(id, session?.adminId ?? 'unknown');
    if (!res.ok) alert(res.error ?? 'Could not approve payment.');
  };
  const confirmReject = () => {
    if (!rejectId) return;
    const res = adminReject(rejectId, session?.adminId ?? 'unknown', rejectReason);
    if (!res.ok) alert(res.error ?? 'Could not reject payment.');
    setRejectId(null);
    setRejectReason('');
  };

  const label = (t: (typeof rows)[number]) =>
    t.kind === 'subscription' ? `${t.planId ?? 'plan'} subscription` : `${t.pkgLabel ?? 'virtual balance'} package`;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <h1 className="text-lg font-bold text-white flex items-center gap-2">
        <CreditCard className="h-5 w-5 text-green-400" /> Transaction Monitoring
      </h1>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Pending Review', value: pending,               color: '#f59e0b', icon: Clock },
          { label: 'Verified',       value: verified,              color: '#34d399', icon: CheckCircle2 },
          { label: 'Rejected',       value: rejected,              color: '#ef4444', icon: XCircle },
          { label: 'Verified Revenue', value: `$${revenue.toFixed(2)}`, color: '#60a5fa', icon: CreditCard },
        ].map(k => (
          <div key={k.label} className="bg-white/[0.03] border border-white/8 rounded-2xl p-4">
            <k.icon className="h-4 w-4 mb-2" style={{ color: k.color }} />
            <p className="text-xl font-bold text-white font-mono">{k.value}</p>
            <p className="text-xs text-white/40 mt-0.5">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by user or tx hash…"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/3 border border-white/8 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-primary/40 transition-all" />
        </div>
        {(['all', 'pending', 'verified', 'rejected'] as const).map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={cn('px-4 py-2.5 rounded-xl text-sm font-medium border transition-all capitalize',
              filter === s ? 'bg-primary/15 border-primary/30 text-primary' : 'bg-white/3 border-white/8 text-white/40 hover:text-white/70')}>
            {s}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="text-center py-16 text-white/30">
            <CreditCard className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No transactions match this filter.</p>
          </div>
        )}
        {filtered.map(tx => {
          const StatusIcon = STATUS_ICON[tx.status];
          return (
            <motion.div key={tx.id} layout
              className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all">
              {/* Type + user */}
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="h-9 w-9 rounded-xl bg-white/5 border border-white/8 flex items-center justify-center flex-shrink-0">
                  <CreditCard className="h-4 w-4 text-white/40" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white capitalize">{label(tx)}</p>
                  <p className="text-xs text-white/40 truncate">{tx.userDisplayName} · {tx.userEmail}</p>
                </div>
              </div>

              {/* Amount */}
              <div className="text-right sm:w-24 flex-shrink-0">
                <p className="text-sm font-bold text-white font-mono">${tx.amount.toFixed(2)}</p>
                <p className="text-[10px] text-white/30">{tx.network}</p>
              </div>

              {/* Hash */}
              <button onClick={() => copyHash(tx.txHash)}
                className="hidden md:flex items-center gap-1.5 font-mono text-[10px] text-white/30 hover:text-white/60 transition-all w-36 truncate">
                <Copy className="h-3 w-3 flex-shrink-0" />
                {copied === tx.txHash ? 'Copied!' : tx.txHash.slice(0, 12) + '…'}
              </button>

              {/* Time */}
              <p className="hidden lg:block text-[11px] text-white/30 w-28 flex-shrink-0">
                {new Date(tx.submittedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>

              {/* Manual review flag */}
              {tx.manualReview && tx.status === 'pending' && (
                <span className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border bg-orange-500/10 border-orange-500/25 text-orange-400 flex-shrink-0">
                  <AlertTriangle className="h-3 w-3" /> Manual review
                </span>
              )}

              {/* Status + actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={cn('flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border capitalize', STATUS_STYLE[tx.status])}>
                  <StatusIcon className="h-3 w-3" /> {tx.status}
                </span>
                {tx.status === 'pending' && (
                  <>
                    <button onClick={() => handleApprove(tx.id)}
                      className="p-1.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 transition-all">
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => { setRejectId(tx.id); setRejectReason(''); }}
                      className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Reject reason modal */}
      {rejectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-[#12121a] border border-white/10 rounded-2xl p-6 w-full max-w-sm mx-4 space-y-4">
            <h3 className="text-sm font-bold text-white">Reject Transaction</h3>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              placeholder="Reason for rejection…" rows={3}
              className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-red-500/40" />
            <div className="flex gap-2">
              <button onClick={() => setRejectId(null)}
                className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/60 text-sm font-semibold">
                Cancel
              </button>
              <button onClick={confirmReject}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold hover:brightness-110">
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
