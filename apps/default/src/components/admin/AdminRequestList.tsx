import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp,
  Bot, Check, X, MessageSquare, TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/authStore';
import {
  useAdminManagementStore,
  ADMIN_LEVEL_META,
  AdminRequest,
} from '@/lib/adminManagementStore';

const STATUS_META = {
  pending:        { label: 'Pending AI',      color: '#94a3b8', icon: Clock         },
  ai_approved:    { label: 'AI Pre-Approved', color: '#f59e0b', icon: Bot           },
  ai_rejected:    { label: 'AI Rejected',     color: '#ef4444', icon: XCircle       },
  super_approved: { label: 'Approved',         color: '#34d399', icon: CheckCircle2  },
  super_rejected: { label: 'Rejected',         color: '#ef4444', icon: XCircle       },
};

export function AdminRequestList() {
  const { user } = useAuthStore();
  const { requests, approveRequest, rejectRequest } = useAdminManagementStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState<Record<string, string>>({});
  const [rejectMode, setRejectMode] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const filtered = requests.filter(r => filterStatus === 'all' || r.status === filterStatus);
  const sorted   = [...filtered].sort(
    (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
  );

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex gap-2 flex-wrap">
        {['all', 'ai_approved', 'pending', 'super_approved', 'ai_rejected', 'super_rejected'].map(s => {
          const meta = s !== 'all' ? STATUS_META[s as keyof typeof STATUS_META] : null;
          const count = s === 'all' ? requests.length : requests.filter(r => r.status === s).length;
          return (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                filterStatus === s
                  ? 'bg-primary/15 border-primary/30 text-primary'
                  : 'bg-secondary/20 border-white/8 text-muted-foreground hover:border-white/15',
              )}
            >
              {s === 'all' ? 'All' : meta?.label} ({count})
            </button>
          );
        })}
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Bot className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">No admin requests found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map(req => (
            <AdminRequestRow
              key={req.id}
              request={req}
              expanded={expandedId === req.id}
              onToggle={() => setExpandedId(id => id === req.id ? null : req.id)}
              rejectNote={rejectNote[req.id] ?? ''}
              onRejectNoteChange={note => setRejectNote(n => ({ ...n, [req.id]: note }))}
              rejectMode={rejectMode === req.id}
              onRejectModeToggle={() => setRejectMode(m => m === req.id ? null : req.id)}
              onApprove={() => {
                if (user) {
                  approveRequest(req.id, user);
                  setExpandedId(null);
                }
              }}
              onReject={() => {
                if (user) {
                  rejectRequest(req.id, user, rejectNote[req.id] || 'Rejected by Super Admin.');
                  setRejectMode(null);
                  setExpandedId(null);
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AdminRequestRow({
  request, expanded, onToggle,
  rejectNote, onRejectNoteChange,
  rejectMode, onRejectModeToggle,
  onApprove, onReject,
}: {
  request: AdminRequest;
  expanded: boolean;
  onToggle: () => void;
  rejectNote: string;
  onRejectNoteChange: (note: string) => void;
  rejectMode: boolean;
  onRejectModeToggle: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const meta      = ADMIN_LEVEL_META[request.requestedLevel];
  const status    = STATUS_META[request.status];
  const StatusIcon = status.icon;
  const avatarSrc = `https://api.dicebear.com/7.x/avataaars/svg?seed=${request.userAvatarSeed}`;
  const canAct    = request.status === 'ai_approved';
  const report    = request.aiReport;

  return (
    <div className={cn(
      'bg-card border rounded-2xl overflow-hidden shadow-sm transition-all',
      request.status === 'ai_approved' ? 'border-amber-500/25' : 'border-white/5',
    )}>
      {/* Header row */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer"
        onClick={onToggle}
      >
        {/* Avatar */}
        <div className="h-10 w-10 rounded-xl overflow-hidden border border-white/10 flex-shrink-0 bg-secondary/50">
          <img src={avatarSrc} alt={request.userDisplayName} className="w-full h-full object-cover" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{request.userDisplayName}</span>
            {/* Level badge */}
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-bold border"
              style={{ color: meta.color, background: meta.bg, borderColor: meta.border }}
            >
              {meta.icon} Level {request.requestedLevel}
            </span>
            {/* Status badge */}
            <span
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border"
              style={{ color: status.color, background: status.color + '18', borderColor: status.color + '30' }}
            >
              <StatusIcon className="h-2.5 w-2.5" />
              {status.label}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{request.userEmail}</p>
        </div>

        {/* AI Score pill */}
        {report && (
          <div className="hidden sm:flex flex-col items-end flex-shrink-0">
            <span className="text-xs font-mono font-bold" style={{ color: report.passed ? '#34d399' : '#f59e0b' }}>
              {report.score}/100
            </span>
            <span className="text-[10px] text-muted-foreground">AI Score</span>
          </div>
        )}

        {/* Submitted */}
        <div className="hidden md:flex flex-col items-end text-xs text-muted-foreground flex-shrink-0 ml-2">
          <span>{new Date(request.submittedAt).toLocaleDateString()}</span>
        </div>

        <ChevronDown className={cn('h-4 w-4 text-muted-foreground flex-shrink-0 transition-transform', expanded && 'rotate-180')} />
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
            <div className="px-4 pb-4 pt-3 border-t border-white/5 space-y-4">
              {/* AI Report */}
              {report ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">AI Evaluation Report</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {new Date(report.evaluatedAt).toLocaleString()}
                    </span>
                  </div>

                  {/* Summary */}
                  <p className="text-xs text-muted-foreground bg-secondary/20 rounded-xl p-3 leading-relaxed border border-white/5">
                    {report.summary}
                  </p>

                  {/* Check results */}
                  <div className="space-y-2">
                    {report.checks.map(check => (
                      <div key={check.key} className="flex items-center gap-3">
                        <div className={cn(
                          'h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0',
                          check.passed ? 'bg-green-500/15' : 'bg-red-500/15',
                        )}>
                          {check.passed
                            ? <Check className="h-3 w-3 text-green-400" />
                            : <X className="h-3 w-3 text-red-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between text-xs">
                            <span className="font-medium">{check.label}</span>
                            <span className={cn(
                              'font-mono font-semibold',
                              check.passed ? 'text-green-400' : 'text-red-400',
                            )}>
                              {check.userValue.toFixed(check.unit === '%' || check.unit === '★' || check.unit === 'x' ? 1 : 0)}{check.unit}
                            </span>
                          </div>
                          {/* Progress bar */}
                          <div className="h-1 bg-white/5 rounded-full overflow-hidden mt-1">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${Math.min(100, (check.userValue / check.threshold) * 100)}%`,
                                backgroundColor: check.passed ? '#34d399' : '#ef4444',
                              }}
                            />
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Need: {check.threshold}{check.unit}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Overall score bar */}
                  <div className="bg-secondary/20 rounded-xl p-3 border border-white/5">
                    <div className="flex justify-between text-xs mb-2">
                      <span className="font-semibold flex items-center gap-1.5">
                        <TrendingUp className="h-3.5 w-3.5 text-primary" /> Overall Score
                      </span>
                      <span className="font-mono font-bold" style={{ color: report.passed ? '#34d399' : '#f59e0b' }}>
                        {report.score}/100
                      </span>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${report.score}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                        className="h-full rounded-full"
                        style={{ backgroundColor: report.passed ? '#34d399' : '#f59e0b' }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 text-muted-foreground py-4">
                  <Clock className="h-5 w-5 animate-pulse" />
                  <span className="text-sm">AI evaluation in progress…</span>
                </div>
              )}

              {/* Super Admin note (if already decided) */}
              {request.superAdminNote && (
                <div className="flex items-start gap-2 text-xs bg-secondary/20 rounded-xl p-3 border border-white/5">
                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-muted-foreground font-semibold mb-0.5">Super Admin Note</p>
                    <p className="text-foreground/80">{request.superAdminNote}</p>
                  </div>
                </div>
              )}

              {/* Action buttons for AI-approved requests */}
              {canAct && (
                <div className="space-y-3">
                  {rejectMode ? (
                    <div className="space-y-2">
                      <label className="block text-xs text-muted-foreground">Rejection reason (required)</label>
                      <textarea
                        value={rejectNote}
                        onChange={e => onRejectNoteChange(e.target.value)}
                        rows={2}
                        placeholder="Explain why this request is being rejected…"
                        className="w-full px-3 py-2.5 rounded-xl bg-secondary/30 border border-red-500/25 text-sm focus:outline-none focus:border-red-500/50 transition-all resize-none text-xs"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={onReject}
                          disabled={!rejectNote.trim()}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500 text-white text-xs font-bold hover:bg-red-600 transition-colors disabled:opacity-50"
                        >
                          <XCircle className="h-3.5 w-3.5" /> Confirm Reject
                        </button>
                        <button
                          onClick={onRejectModeToggle}
                          className="px-4 py-2 rounded-xl bg-secondary/40 text-muted-foreground text-xs hover:bg-secondary/60 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={onApprove}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-green-500/15 border border-green-500/25 text-green-400 text-sm font-bold hover:bg-green-500/25 transition-all"
                      >
                        <CheckCircle2 className="h-4 w-4" /> Approve & Grant Access
                      </button>
                      <button
                        onClick={onRejectModeToggle}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-semibold hover:bg-red-500/20 transition-all"
                      >
                        <XCircle className="h-4 w-4" /> Reject
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
