/**
 * AdminExchangeManagement.tsx — /admin/exchange
 *
 * §6.1 Exchange Management admin page
 *
 * Sections:
 *  - Platform Statistics (5 KPI cards)
 *  - Connected Users table
 *  - Pending Approvals queue with Approve / Reject / Review
 *  - Audit Log of recent exchange actions
 */
import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw, Shield, Check, X, Eye, AlertTriangle,
  Users, TrendingUp, DollarSign, BarChart2, Zap,
  ChevronDown, ChevronRight, Clock, Activity,
  Link as LinkIcon, Ban, FileText, Filter,
} from 'lucide-react';
import { useExchangeStore } from '@/lib/exchangeStore';
import { EXCHANGE_META, ApprovalQueueItem } from '@/lib/exchangeTypes';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuditEntry {
  id:        string;
  timestamp: string;
  user:      string;
  action:    string;
  exchange?: string;
  detail:    string;
  severity:  'info' | 'warning' | 'critical';
}

// ── Audit log persistence (starts empty — no fabricated history) ──────────────

const AUDIT_KEY = 'cryptoverse_exchange_audit_log_v1';

function loadAudit(): AuditEntry[] {
  try {
    const v = localStorage.getItem(AUDIT_KEY);
    return v ? JSON.parse(v) : [];
  } catch { return []; }
}

function appendAudit(entry: Omit<AuditEntry, 'id' | 'timestamp'>) {
  const all = loadAudit();
  const next: AuditEntry = {
    ...entry,
    id:        `a_${Date.now()}`,
    timestamp: new Date().toISOString(),
  };
  const trimmed = [next, ...all].slice(0, 200);
  try { localStorage.setItem(AUDIT_KEY, JSON.stringify(trimmed)); } catch {}
  return trimmed;
}

// ── Connected-user roster ───────────────────────────────────────────────────────
// Built entirely from real exchangeStore connections in the current browser
// session. There is no backend directory of every user's exchange
// connections, so this intentionally reflects only what this device knows —
// it no longer shows a fabricated multi-user roster.

interface ConnectedUser {
  userId:      string; // connection id
  username:    string; // connection label
  exchange:    string;
  balanceUSD:  number;
  lastActive:  string; // ISO
  status:      'active' | 'paused' | 'risk_paused';
  tradesTotal: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000)              return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000)           return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)          return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function fmtUSD(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon, color,
}: { label: string; value: string; sub?: string; icon: React.ReactNode; color: string }) {
  return (
    <div className="rounded-2xl border border-white/6 p-4 flex gap-3 items-start"
      style={{ background: 'rgba(255,255,255,0.03)' }}>
      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', color)}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-white/40 uppercase tracking-wider truncate">{label}</p>
        <p className="text-lg font-black text-white leading-tight">{value}</p>
        {sub && <p className="text-[10px] text-white/30 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

const SEVERITY_STYLES = {
  info:     'text-sky-400/80',
  warning:  'text-amber-400/80',
  critical: 'text-red-400',
};

const SEVERITY_DOT = {
  info:     'bg-sky-400',
  warning:  'bg-amber-400',
  critical: 'bg-red-500',
};

const STATUS_STYLES: Record<ConnectedUser['status'], string> = {
  active:      'text-emerald-400 bg-emerald-400/10',
  paused:      'text-white/40 bg-white/5',
  risk_paused: 'text-amber-400 bg-amber-400/10',
};

const STATUS_LABEL: Record<ConnectedUser['status'], string> = {
  active:      'Active',
  paused:      'Paused',
  risk_paused: 'Risk Paused',
};

// ── Main component ─────────────────────────────────────────────────────────────

export function AdminExchangeManagement() {
  const { approvalQueue, refreshApprovalQueue, adminApproveDeployment, connections, trades, disconnectExchange } = useExchangeStore();

  const [audit, setAudit]       = useState<AuditEntry[]>(loadAudit);
  const [loading, setLoading]   = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [auditFilter, setAuditFilter] = useState<'all' | 'info' | 'warning' | 'critical'>('all');
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  // Connected users — derived from real exchangeStore connections in this
  // browser session (there is no backend directory of every platform user's
  // exchange connections, so this only reflects what this device knows).
  const users: ConnectedUser[] = useMemo(
    () => connections.map(c => ({
      userId:      c.id,
      username:    c.label,
      exchange:    c.exchangeId,
      balanceUSD:  c.balanceUSD,
      lastActive:  c.lastSyncAt,
      status:      c.status === 'connected' ? 'active' as const : 'paused' as const,
      tradesTotal: (trades[c.id] ?? []).length,
    })),
    [connections, trades],
  );

  // Live pending approvals from exchangeStore
  const pending = useMemo(
    () => approvalQueue.filter(a => a.status === 'pending'),
    [approvalQueue],
  );

  // Platform stats
  const totalBalanceUSD = useMemo(
    () => users.reduce((s, u) => s + u.balanceUSD, 0),
    [users],
  );
  const totalTrades = useMemo(
    () => users.reduce((s, u) => s + u.tradesTotal, 0),
    [users],
  );
  const avgTradeSize = totalTrades > 0
    ? Math.round(totalBalanceUSD / totalTrades)
    : 0;
  const activeCount = users.filter(u => u.status === 'active').length;
  const estimatedFees = Math.round(totalBalanceUSD * 0.001);

  // Refresh
  const handleRefresh = useCallback(async () => {
    setLoading(true);
    await new Promise(r => setTimeout(r, 800));
    refreshApprovalQueue();
    setAudit(loadAudit());
    setLoading(false);
    toast.success('Exchange data refreshed');
  }, [refreshApprovalQueue]);

  // Approve deployment
  const handleApprove = useCallback((item: ApprovalQueueItem) => {
    adminApproveDeployment(item.deployId, true, 'Approved by admin');
    const newAudit = appendAudit({
      user:     'ADMIN',
      action:   'DEPLOY_APPROVED',
      exchange: item.exchangeId,
      detail:   `"${item.strategyName}" approved — ${item.allocatedUSD} allocated`,
      severity: 'info',
    });
    setAudit(newAudit);
    toast.success(`"${item.strategyName}" approved`);
  }, [adminApproveDeployment]);

  // Reject deployment
  const handleReject = useCallback((item: ApprovalQueueItem) => {
    adminApproveDeployment(item.deployId, false, 'Rejected by admin');
    const newAudit = appendAudit({
      user:     'ADMIN',
      action:   'DEPLOY_REJECTED',
      exchange: item.exchangeId,
      detail:   `"${item.strategyName}" rejected`,
      severity: 'warning',
    });
    setAudit(newAudit);
    toast.error(`"${item.strategyName}" rejected`);
  }, [adminApproveDeployment]);

  // Suspend user — disconnects the real exchange connection
  const handleSuspendUser = useCallback((userId: string) => {
    const u = users.find(x => x.userId === userId);
    disconnectExchange(userId);
    if (u) {
      const newAudit = appendAudit({
        user:     'ADMIN',
        action:   'USER_SUSPENDED',
        exchange: u.exchange,
        detail:   `${u.username} exchange connection disconnected`,
        severity: 'critical',
      });
      setAudit(newAudit);
    }
    toast.warning('Exchange connection disconnected');
  }, [users, disconnectExchange]);

  const filteredAudit = useMemo(
    () => auditFilter === 'all' ? audit : audit.filter(a => a.severity === auditFilter),
    [audit, auditFilter],
  );

  return (
    <div className="min-h-screen p-4 md:p-6 space-y-6 text-white">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-black tracking-tight">Exchange Management</h1>
          <p className="text-[11px] text-white/40 mt-0.5">
            Monitor connected users, approve deployments, review audit trail
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 border border-white/8 transition-all disabled:opacity-50"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* ── Platform Statistics ── */}
      <section>
        <p className="text-[10px] text-white/30 uppercase tracking-widest mb-3 font-semibold">Platform Statistics</p>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          <StatCard
            label="Connected Users"
            value={users.length.toLocaleString()}
            sub={`${activeCount} active`}
            icon={<Users className="h-4 w-4 text-sky-400" />}
            color="bg-sky-400/10"
          />
          <StatCard
            label="Total Real Trades"
            value={totalTrades.toLocaleString()}
            sub="all time"
            icon={<BarChart2 className="h-4 w-4 text-violet-400" />}
            color="bg-violet-400/10"
          />
          <StatCard
            label="Total Volume"
            value={fmtUSD(totalBalanceUSD)}
            sub="portfolio value"
            icon={<TrendingUp className="h-4 w-4 text-emerald-400" />}
            color="bg-emerald-400/10"
          />
          <StatCard
            label="Est. Fees Collected"
            value={fmtUSD(estimatedFees)}
            sub="0.1% avg fee"
            icon={<DollarSign className="h-4 w-4 text-amber-400" />}
            color="bg-amber-400/10"
          />
          <StatCard
            label="Avg Trade Size"
            value={fmtUSD(avgTradeSize)}
            sub="per trade"
            icon={<Zap className="h-4 w-4 text-primary" />}
            color="bg-primary/10"
          />
        </div>
      </section>

      {/* ── Connected Users Table ── */}
      <section>
        <p className="text-[10px] text-white/30 uppercase tracking-widest mb-3 font-semibold flex items-center gap-2">
          <LinkIcon className="h-3 w-3" /> Connected Users
        </p>
        <p className="text-[11px] text-white/25 mb-2">
          Reflects real exchange connections made from this device. A backend user directory is required to see connections made from other devices.
        </p>
        {users.length === 0 ? (
          <div className="rounded-2xl border border-white/6 px-6 py-8 text-center"
            style={{ background: 'rgba(255,255,255,0.02)' }}>
            <LinkIcon className="h-8 w-8 text-white/15 mx-auto mb-2" />
            <p className="text-sm text-white/30">No exchange connections on this device yet</p>
          </div>
        ) : (
        <div className="rounded-2xl border border-white/6 overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.02)' }}>
          {/* Table head */}
          <div className="grid grid-cols-[1fr_100px_90px_90px_80px_80px] gap-2 px-4 py-2 border-b border-white/5">
            {['User', 'Exchange', 'Balance', 'Trades', 'Last Active', 'Status'].map(h => (
              <p key={h} className="text-[10px] text-white/30 uppercase tracking-wider font-semibold">{h}</p>
            ))}
          </div>
          {users.map((u, i) => {
            const meta = EXCHANGE_META[u.exchange as keyof typeof EXCHANGE_META];
            const isExpanded = expandedUser === u.userId;
            return (
              <React.Fragment key={u.userId}>
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className={cn(
                    'grid grid-cols-[1fr_100px_90px_90px_80px_80px] gap-2 px-4 py-3 items-center border-b border-white/4 last:border-0',
                    'hover:bg-white/[0.025] cursor-pointer transition-colors',
                  )}
                  onClick={() => setExpandedUser(isExpanded ? null : u.userId)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-[9px] font-black text-primary">{u.username[0]}</span>
                    </div>
                    <span className="text-xs font-semibold text-white truncate">{u.username}</span>
                    <ChevronRight className={cn('h-3 w-3 text-white/20 shrink-0 transition-transform', isExpanded && 'rotate-90')} />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-sm">{meta?.logo ?? '🔗'}</span>
                    <span className="text-xs text-white/60 capitalize">{u.exchange}</span>
                  </div>
                  <p className="text-xs font-semibold text-emerald-400">{fmtUSD(u.balanceUSD)}</p>
                  <p className="text-xs text-white/60">{u.tradesTotal}</p>
                  <p className="text-[10px] text-white/40">{timeAgo(u.lastActive)}</p>
                  <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full w-fit', STATUS_STYLES[u.status])}>
                    {STATUS_LABEL[u.status]}
                  </span>
                </motion.div>
                {/* Expanded row actions */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      key="expanded"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 py-3 border-b border-white/5 flex flex-wrap gap-2"
                        style={{ background: 'rgba(255,255,255,0.015)' }}>
                        <button
                          onClick={e => { e.stopPropagation(); handleSuspendUser(u.userId); }}
                          className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-amber-400/10 text-amber-400 border border-amber-400/20 hover:bg-amber-400/20 transition-colors"
                        >
                          <Ban className="h-3 w-3" /> Suspend Access
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); toast.info(`Viewing ${u.username}'s trades`); }}
                          className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-white/5 text-white/60 border border-white/8 hover:bg-white/10 transition-colors"
                        >
                          <Eye className="h-3 w-3" /> View Trades
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); toast.info(`Viewing ${u.username}'s risk settings`); }}
                          className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-white/5 text-white/60 border border-white/8 hover:bg-white/10 transition-colors"
                        >
                          <Shield className="h-3 w-3" /> Risk Settings
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </React.Fragment>
            );
          })}
        </div>
        )}
      </section>

      {/* ── Pending Approvals ── */}
      <section>
        <p className="text-[10px] text-white/30 uppercase tracking-widest mb-3 font-semibold flex items-center gap-2">
          <Activity className="h-3 w-3" />
          Pending Approvals
          {pending.length > 0 && (
            <span className="bg-amber-400/20 text-amber-400 text-[9px] font-black px-1.5 py-0.5 rounded-full">
              {pending.length}
            </span>
          )}
        </p>

        {pending.length === 0 ? (
          <div className="rounded-2xl border border-white/6 px-6 py-8 text-center"
            style={{ background: 'rgba(255,255,255,0.02)' }}>
            <Check className="h-8 w-8 text-emerald-400/40 mx-auto mb-2" />
            <p className="text-sm text-white/30">No pending approvals</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((item, i) => {
              const meta = EXCHANGE_META[item.exchangeId as keyof typeof EXCHANGE_META];
              const isReview = reviewId === item.deployId;
              return (
                <motion.div
                  key={item.deployId}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className="rounded-2xl border border-amber-400/15 overflow-hidden"
                  style={{ background: 'rgba(251,191,36,0.04)' }}
                >
                  <div className="p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-md">
                          Deploy Request
                        </span>
                        <span className="text-xs text-white/40">{timeAgo(item.requestedAt)}</span>
                      </div>
                      <p className="text-sm font-bold text-white">
                        "{item.strategyName}"
                        <span className="text-white/40 font-normal"> → </span>
                        <span className="text-xs">{meta?.logo ?? '🔗'} {meta?.name ?? item.exchangeId}</span>
                      </p>
                      <p className="text-[11px] text-white/40">
                        Allocated: <span className="text-white/70 font-semibold">{fmtUSD(item.allocatedUSD)}</span>
                        {' · '}Max daily loss: <span className="text-white/70 font-semibold">{fmtUSD(item.allocatedUSD * 0.1)}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setReviewId(isReview ? null : item.deployId)}
                        className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/8 transition-colors text-white/60"
                      >
                        <Eye className="h-3 w-3" />
                        {isReview ? 'Close' : 'Review'}
                      </button>
                      <button
                        onClick={() => handleReject(item)}
                        className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 transition-colors"
                      >
                        <X className="h-3 w-3" /> Reject
                      </button>
                      <button
                        onClick={() => handleApprove(item)}
                        className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/20 text-emerald-400 transition-colors"
                      >
                        <Check className="h-3 w-3" /> Approve
                      </button>
                    </div>
                  </div>
                  {/* Review panel */}
                  <AnimatePresence>
                    {isReview && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden border-t border-amber-400/10"
                      >
                        <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3"
                          style={{ background: 'rgba(255,255,255,0.02)' }}>
                          {[
                            { label: 'Deploy ID',       value: item.deployId.slice(0, 12) + '…' },
                            { label: 'Exchange',        value: meta?.name ?? item.exchangeId     },
                            { label: 'Allocation',      value: fmtUSD(item.allocatedUSD)        },
                            { label: 'Requested',       value: timeAgo(item.requestedAt)        },
                          ].map(({ label, value }) => (
                            <div key={label}>
                              <p className="text-[9px] text-white/30 uppercase tracking-wider">{label}</p>
                              <p className="text-xs font-semibold text-white/80 mt-0.5">{value}</p>
                            </div>
                          ))}
                        </div>
                        <div className="px-4 py-2 border-t border-amber-400/10">
                          <p className="text-[10px] text-amber-400/70 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Review the user's backtest results and risk profile before approving.
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Audit Log ── */}
      <section>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <p className="text-[10px] text-white/30 uppercase tracking-widest font-semibold flex items-center gap-2">
            <FileText className="h-3 w-3" /> Audit Log
          </p>
          {/* Severity filter */}
          <div className="flex items-center gap-1">
            {(['all', 'info', 'warning', 'critical'] as const).map(f => (
              <button
                key={f}
                onClick={() => setAuditFilter(f)}
                className={cn(
                  'text-[9px] font-bold px-2 py-0.5 rounded-full capitalize transition-all',
                  auditFilter === f
                    ? 'bg-white/10 text-white border border-white/15'
                    : 'text-white/30 hover:text-white/60',
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-white/6 overflow-hidden divide-y divide-white/4"
          style={{ background: 'rgba(255,255,255,0.02)' }}>
          {filteredAudit.slice(0, 20).map((entry, i) => {
            const exMeta = entry.exchange
              ? EXCHANGE_META[entry.exchange as keyof typeof EXCHANGE_META]
              : null;
            return (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.025 }}
                className="px-4 py-2.5 flex items-start gap-3 hover:bg-white/[0.02] transition-colors"
              >
                <div className="mt-1.5 shrink-0">
                  <div className={cn('w-1.5 h-1.5 rounded-full', SEVERITY_DOT[entry.severity])} />
                </div>
                <div className="flex-1 min-w-0 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">
                  <div className="min-w-0">
                    <span className={cn('text-[10px] font-bold mr-1.5', SEVERITY_STYLES[entry.severity])}>
                      [{entry.action}]
                    </span>
                    <span className="text-[10px] font-semibold text-white/70">{entry.user}</span>
                    {exMeta && (
                      <span className="text-[10px] text-white/30 ml-1">
                        {exMeta.logo} {exMeta.name}
                      </span>
                    )}
                    <p className="text-[10px] text-white/40 mt-0.5 truncate">{entry.detail}</p>
                  </div>
                  <p className="text-[9px] text-white/25 shrink-0 mt-0.5">
                    {timeAgo(entry.timestamp)}
                  </p>
                </div>
              </motion.div>
            );
          })}
          {filteredAudit.length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="text-xs text-white/20">No entries for this filter</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
