import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ClipboardList, Check, X, ChevronDown, ChevronUp, Bot, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminManagementStore, ADMIN_LEVEL_META } from '@/lib/adminManagementStore';
import { useAdminAuthStore } from '@/lib/adminAuthStore';
import { useAuthStore } from '@/lib/authStore';

const STATUS_STYLE: Record<string, string> = {
  pending:         'bg-white/5 border-white/10 text-white/40',
  ai_approved:     'bg-green-500/10 border-green-500/20 text-green-400',
  ai_rejected:     'bg-red-500/10 border-red-500/20 text-red-400',
  super_approved:  'bg-blue-500/10 border-blue-500/20 text-blue-400',
  super_rejected:  'bg-red-500/10 border-red-500/20 text-red-400',
};

export function AdminRequests() {
  const { requests, approveRequest, rejectRequest } = useAdminManagementStore();
  const { session } = useAdminAuthStore();
  const { user }    = useAuthStore();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const fakeAdmin = user ? { ...user, isAdmin: true, id: session?.adminId ?? user.id } : null;

  const sorted = [...requests].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

  const pending  = requests.filter(r => r.status === 'ai_approved').length;
  const approved = requests.filter(r => r.status === 'super_approved').length;
  const rejected = requests.filter(r => ['super_rejected', 'ai_rejected'].includes(r.status)).length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <h1 className="text-lg font-bold text-white flex items-center gap-2">
        <ClipboardList className="h-5 w-5 text-orange-400" /> Admin Requests
      </h1>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Awaiting Review', value: pending,  color: '#f59e0b' },
          { label: 'Approved',        value: approved, color: '#34d399' },
          { label: 'Rejected',        value: rejected, color: '#ef4444' },
        ].map(k => (
          <div key={k.label} className="bg-white/[0.03] border border-white/8 rounded-2xl p-4">
            <p className="text-2xl font-bold font-mono" style={{ color: k.color }}>{k.value}</p>
            <p className="text-xs text-white/40 mt-0.5">{k.label}</p>
          </div>
        ))}
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-16 text-white/20">
          <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm">No requests submitted yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map(req => {
            const meta    = ADMIN_LEVEL_META[req.requestedLevel];
            const isOpen  = expanded === req.id;
            const report  = req.aiReport;

            return (
              <motion.div key={req.id} layout className="bg-white/[0.02] border border-white/6 rounded-2xl overflow-hidden">
                {/* Header row */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4">
                  <div className="h-10 w-10 rounded-xl overflow-hidden border border-white/8 flex-shrink-0">
                    <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${req.userAvatarSeed}`} alt="" className="w-full h-full" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">{req.userDisplayName}</p>
                    <p className="text-xs text-white/40">{req.userEmail} · Applied for <span style={{ color: meta.color }}>{meta.icon} {meta.role}</span></p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={cn('text-[10px] px-2.5 py-1 rounded-full border capitalize', STATUS_STYLE[req.status])}>
                      {req.status.replace('_', ' ')}
                    </span>
                    {report && (
                      <span className={cn('text-[10px] px-2 py-0.5 rounded-full border font-mono font-bold',
                        report.passed ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400')}>
                        AI {report.score}/100
                      </span>
                    )}
                    <button onClick={() => setExpanded(isOpen ? null : req.id)}
                      className="p-1.5 rounded-lg bg-white/5 border border-white/8 text-white/40 hover:text-white transition-all">
                      {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Expanded AI report */}
                <AnimatePresence>
                  {isOpen && (
                    <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                      className="overflow-hidden border-t border-white/5">
                      <div className="p-5 space-y-4">
                        {report ? (
                          <>
                            {/* AI summary */}
                            <div className="bg-white/3 border border-white/6 rounded-xl p-4">
                              <p className="text-[11px] text-white/40 flex items-center gap-1.5 mb-2">
                                <Bot className="h-3.5 w-3.5 text-primary" /> AI Evaluation
                              </p>
                              <p className="text-sm text-white/70 leading-relaxed">{report.summary}</p>
                            </div>

                            {/* Checks */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {report.checks.map(check => (
                                <div key={check.key} className={cn('flex items-center gap-3 p-3 rounded-xl border',
                                  check.passed ? 'bg-green-500/5 border-green-500/15' : 'bg-red-500/5 border-red-500/15')}>
                                  {check.passed
                                    ? <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0" />
                                    : <XCircle className="h-4 w-4 text-red-400 flex-shrink-0" />}
                                  <div className="min-w-0">
                                    <p className="text-xs font-medium text-white">{check.label}</p>
                                    <p className="text-[10px] text-white/40">
                                      {check.userValue.toFixed(1)}{check.unit} / {check.threshold}{check.unit} needed
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        ) : (
                          <p className="text-sm text-white/30 text-center py-4">AI evaluation pending…</p>
                        )}

                        {/* Super admin actions */}
                        {req.status === 'ai_approved' && (
                          <div className="flex flex-col gap-3">
                            <div className="flex gap-3">
                              <button onClick={() => { if (fakeAdmin) approveRequest(req.id, fakeAdmin as any); }}
                                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-500/15 border border-green-500/25 text-green-400 text-sm font-semibold hover:bg-green-500/25 transition-all">
                                <Check className="h-4 w-4" /> Approve
                              </button>
                              <button onClick={() => setRejectingId(rejectingId === req.id ? null : req.id)}
                                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-semibold hover:bg-red-500/20 transition-all">
                                <X className="h-4 w-4" /> Reject
                              </button>
                            </div>
                            <AnimatePresence>
                              {rejectingId === req.id && (
                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                                  <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)}
                                    placeholder="Reason for rejection…"
                                    rows={2}
                                    className="w-full px-3 py-2.5 rounded-xl bg-white/3 border border-white/8 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-red-500/40 resize-none transition-all" />
                                  <button onClick={() => { if (fakeAdmin) { rejectRequest(req.id, fakeAdmin as any, rejectNote); setRejectingId(null); setRejectNote(''); } }}
                                    className="mt-2 w-full py-2.5 rounded-xl bg-red-500/15 border border-red-500/25 text-red-400 text-sm font-semibold hover:bg-red-500/25 transition-all">
                                    Confirm Rejection
                                  </button>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )}

                        {req.superAdminNote && (
                          <div className="bg-white/3 border border-white/6 rounded-xl p-3">
                            <p className="text-[10px] text-white/30 mb-1">Super Admin Note</p>
                            <p className="text-xs text-white/60">{req.superAdminNote}</p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
