/**
 * AdminStrategyManagement.tsx — §5.1
 * Full strategy moderation panel inside the Admin Portal.
 * - Pending approvals with Approve / Reject / Request Changes
 * - Reported / flagged strategies with Remove / Warn / Ignore
 * - Platform-wide statistics
 */
import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart2, CheckCircle, XCircle, Clock, AlertTriangle, Eye,
  RefreshCw, TrendingUp, Star, ShoppingBag, DollarSign, Loader2,
  MessageSquare, Shield, Ban, CornerUpRight, Sparkles,
} from 'lucide-react';
import { useStrategyStore } from '@/lib/strategyStore';
import { useAdminStrategyStore } from '@/lib/adminStrategyStore';
import { useAuthStore } from '@/lib/authStore';
import { RISK_META, TYPE_META, CV } from '../marketplace/MarketplaceUtils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RejectModal {
  strategyId: string;
  mode: 'reject' | 'changes' | 'suspend';
}

// ─────────────────────────────────────────────────────────────────────────────

export function AdminStrategyManagement() {
  const { user } = useAuthStore();
  const strategies      = useStrategyStore(s => s.strategies);
  const flaggedList     = useStrategyStore(s => s.flaggedStrategies);
  const resolveFlag     = useStrategyStore(s => s.resolveFlag);
  const approveStrategy = useAdminStrategyStore(s => s.approveStrategy);
  const rejectStrategy  = useAdminStrategyStore(s => s.rejectStrategy);
  const suspendStrategy = useAdminStrategyStore(s => s.suspendStrategy);
  const deleteStrategy  = useStrategyStore(s => s.deleteStrategy);

  const [rejectModal, setRejectModal] = useState<RejectModal | null>(null);
  const [reason,      setReason]      = useState('');
  const [busy,        setBusy]        = useState<string | null>(null);
  const [refreshKey,  setRefreshKey]  = useState(0);

  const adminId   = user?.id ?? 'admin';
  const adminName = user?.displayName ?? 'Admin';

  // ── Derived ─────────────────────────────────────────────────────────────────

  const pending   = useMemo(() => Object.values(strategies).filter(s => s.status === 'pending')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [strategies, refreshKey]);

  const flagged   = useMemo(() => flaggedList.filter(f => !f.resolved), [flaggedList, refreshKey]);

  const allPub    = useMemo(() => Object.values(strategies).filter(s => s.isPublished), [strategies]);
  const totalSales    = useMemo(() => allPub.reduce((s, x) => s + x.totalSales, 0), [allPub]);
  const totalRevenue  = useMemo(() => allPub.reduce((s, x) => s + x.totalRevenue, 0), [allPub]);
  const platformFee   = Math.round(totalRevenue * 0.25);  // estimated gross
  const avgRating     = allPub.length
    ? +(allPub.reduce((s, x) => s + x.rating, 0) / allPub.length).toFixed(1)
    : 0;

  // ── Actions ──────────────────────────────────────────────────────────────────

  const doApprove = async (strategyId: string) => {
    setBusy(strategyId);
    await new Promise(r => setTimeout(r, 300));
    approveStrategy({ strategyId, adminId, adminName });
    setBusy(null);
    setRefreshKey(k => k + 1);
  };

  const doReject = async () => {
    if (!rejectModal || !reason.trim()) return;
    setBusy(rejectModal.strategyId);
    await new Promise(r => setTimeout(r, 300));
    if (rejectModal.mode === 'reject') {
      rejectStrategy({ strategyId: rejectModal.strategyId, adminId, adminName, reason });
    } else if (rejectModal.mode === 'suspend') {
      suspendStrategy({ strategyId: rejectModal.strategyId, adminId, adminName, reason });
    } else {
      // 'changes' — reject with a "please revise" reason
      rejectStrategy({ strategyId: rejectModal.strategyId, adminId, adminName, reason: `Revision requested: ${reason}` });
    }
    setBusy(null);
    setRejectModal(null);
    setReason('');
    setRefreshKey(k => k + 1);
  };

  const doRemoveFlagged = async (strategyId: string) => {
    setBusy(strategyId);
    await new Promise(r => setTimeout(r, 300));
    deleteStrategy(strategyId, adminId, true);
    resolveFlag(strategyId, adminId);
    setBusy(null);
    setRefreshKey(k => k + 1);
  };

  const doIgnoreFlag = (strategyId: string) => {
    resolveFlag(strategyId, adminId);
    setRefreshKey(k => k + 1);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <ShoppingBag className="h-5 w-5 text-primary" /> Strategy Management
        </h2>
        <button onClick={() => setRefreshKey(k => k + 1)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/10 text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {/* ── Platform Statistics ── */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Platform Statistics
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { icon: BarChart2,   label: 'Total',          value: Object.keys(strategies).length.toLocaleString(), color: 'text-foreground' },
            { icon: CheckCircle, label: 'Published',       value: allPub.length.toLocaleString(),                  color: 'text-emerald-400' },
            { icon: ShoppingBag, label: 'Total Sales',     value: totalSales.toLocaleString(),                     color: 'text-yellow-400' },
            { icon: DollarSign,  label: 'Platform Rev.',   value: `${platformFee.toLocaleString()} CP`,            color: 'text-blue-400' },
            { icon: Star,        label: 'Avg. Rating',     value: `${avgRating} ⭐`,                               color: 'text-yellow-400' },
          ].map(m => (
            <div key={m.label} className="bg-card border border-white/5 rounded-2xl p-4 shadow">
              <m.icon className="h-4 w-4 text-muted-foreground mb-2" />
              <p className="text-xs text-muted-foreground">{m.label}</p>
              <p className={`font-bold text-lg mt-0.5 ${m.color}`}>{m.value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pending Approvals ── */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
          <Clock className="h-3.5 w-3.5" /> Pending Approvals
          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-yellow-500/15 text-yellow-400 border border-yellow-500/20">
            {pending.length}
          </span>
        </h3>

        {pending.length === 0 ? (
          <div className="bg-card border border-white/5 rounded-2xl p-8 text-center text-sm text-muted-foreground">
            <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-20" />
            All caught up — no strategies pending review
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map(s => {
              const type = TYPE_META[s.type];
              const risk = RISK_META[s.riskLevel];
              const age  = timeSince(s.updatedAt);
              const passesGate = s.winRate >= 50 && s.maxDrawdown <= 30;
              return (
                <motion.div key={s.id} layout
                  className="bg-card border border-white/5 rounded-2xl p-5 shadow"
                  style={busy === s.id ? { opacity: 0.5 } : {}}>
                  <div className="flex items-start gap-4">
                    <span className="text-2xl shrink-0">{type.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-foreground">{s.name}</p>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                          style={{ background: risk.bg, color: risk.color }}>
                          {risk.label}
                        </span>
                        {passesGate
                          ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/12 text-emerald-400 border border-emerald-500/20">✅ Backtest Passed</span>
                          : <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/12 text-red-400 border border-red-500/20">⚠️ Fails Gate</span>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        by <strong>{s.creatorName}</strong> · submitted {age} · v{s.version}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs">
                        <span style={{ color: s.winRate >= 50 ? '#34d399' : '#ef4444' }}>
                          WR: {s.winRate.toFixed(1)}%
                        </span>
                        <span style={{ color: s.maxDrawdown <= 30 ? '#34d399' : '#ef4444' }}>
                          Max DD: {s.maxDrawdown.toFixed(1)}%
                        </span>
                        <span className="text-muted-foreground">
                          Sharpe: {s.sharpeRatio.toFixed(2)}
                        </span>
                        <span className="font-semibold" style={{ color: s.isFree ? '#34d399' : '#FFD700' }}>
                          {s.isFree ? 'Free' : `${s.price.toLocaleString()} CP`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-4 flex-wrap">
                    <button
                      onClick={() => window.open(`/marketplace/${s.id}`, '_blank')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/10 text-muted-foreground hover:text-foreground transition-colors">
                      <Eye className="h-3.5 w-3.5" /> View
                    </button>
                    <button
                      onClick={() => doApprove(s.id)}
                      disabled={busy === s.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/12 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors disabled:opacity-50">
                      {busy === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                      Approve
                    </button>
                    <button
                      onClick={() => { setRejectModal({ strategyId: s.id, mode: 'reject' }); setReason(''); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors">
                      <XCircle className="h-3.5 w-3.5" /> Reject
                    </button>
                    <button
                      onClick={() => { setRejectModal({ strategyId: s.id, mode: 'changes' }); setReason(''); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 hover:bg-yellow-500/20 transition-colors">
                      <CornerUpRight className="h-3.5 w-3.5" /> Request Changes
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Reported Strategies ── */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5" /> Reported Strategies
          {flagged.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500/15 text-red-400 border border-red-500/20">
              {flagged.length}
            </span>
          )}
        </h3>

        {flagged.length === 0 ? (
          <div className="bg-card border border-white/5 rounded-2xl p-8 text-center text-sm text-muted-foreground">
            <Shield className="h-8 w-8 mx-auto mb-2 opacity-20" />
            No reported strategies
          </div>
        ) : (
          <div className="space-y-3">
            {flagged.map(f => {
              const s = strategies[f.strategyId];
              return (
                <motion.div key={`${f.strategyId}-${f.flaggedAt}`} layout
                  className="bg-card border border-red-500/15 rounded-2xl p-5 shadow">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/20 shrink-0">
                      <AlertTriangle className="h-5 w-5 text-red-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-foreground">
                        🚨 {s?.name ?? f.strategyId}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        by <strong>{s?.creatorName ?? 'Unknown'}</strong> · flagged {timeSince(f.flaggedAt)}
                      </p>
                      <p className="text-xs mt-2 px-3 py-2 rounded-lg bg-red-500/8 border border-red-500/15 text-red-300">
                        Reason: {f.reason}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-4 flex-wrap">
                    {s && (
                      <button
                        onClick={() => window.open(`/marketplace/${s.id}`, '_blank')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/10 text-muted-foreground hover:text-foreground transition-colors">
                        <Eye className="h-3.5 w-3.5" /> View
                      </button>
                    )}
                    <button
                      onClick={() => doRemoveFlagged(f.strategyId)}
                      disabled={busy === f.strategyId}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors">
                      {busy === f.strategyId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                      Remove
                    </button>
                    <button
                      onClick={() => { setRejectModal({ strategyId: f.strategyId, mode: 'suspend' }); setReason(''); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 hover:bg-yellow-500/20 transition-colors">
                      <MessageSquare className="h-3.5 w-3.5" /> Warn & Suspend
                    </button>
                    <button
                      onClick={() => doIgnoreFlag(f.strategyId)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/10 text-muted-foreground hover:text-foreground transition-colors">
                      <Shield className="h-3.5 w-3.5" /> Ignore
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Reject / Reason modal ── */}
      <AnimatePresence>
        {rejectModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60" onClick={() => setRejectModal(null)} />
            <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
              className="relative bg-card border border-white/10 rounded-2xl p-6 w-full max-w-sm z-10 shadow-2xl space-y-4">
              <h3 className="font-bold text-foreground">
                {rejectModal.mode === 'reject'   && '❌ Reject Strategy'}
                {rejectModal.mode === 'changes'  && '🔄 Request Changes'}
                {rejectModal.mode === 'suspend'  && '⚠️ Warn & Suspend'}
              </h3>
              <p className="text-xs text-muted-foreground">
                {rejectModal.mode === 'reject'   && 'Provide a rejection reason for the creator.'}
                {rejectModal.mode === 'changes'  && 'Tell the creator what needs to be fixed.'}
                {rejectModal.mode === 'suspend'  && 'Provide a suspension reason.'}
              </p>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Reason (required)…"
                rows={4}
                className="w-full px-3 py-2.5 rounded-xl text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary/40"
                style={{ background: 'var(--secondary)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)' }}
              />
              <div className="flex gap-3">
                <button onClick={() => setRejectModal(null)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-white/10 text-muted-foreground hover:text-foreground transition-colors">
                  Cancel
                </button>
                <button onClick={doReject} disabled={!reason.trim() || busy === rejectModal.strategyId}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-primary/15 text-primary border border-primary/20 hover:bg-primary/20 transition-colors disabled:opacity-50">
                  {busy === rejectModal.strategyId ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Confirm'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Helper ───────────────────────────────────────────────────────────────────

function timeSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
