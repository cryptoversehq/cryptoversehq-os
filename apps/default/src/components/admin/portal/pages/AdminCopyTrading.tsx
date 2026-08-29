/**
 * AdminCopyTrading.tsx  — /admin/copy-trading
 *
 * §5.1 Copy Trading Management page for the admin portal.
 *
 * Sections:
 *  - Platform Statistics (totals)
 *  - Top Copied Traders table (with [View] action)
 *  - Reported Issues queue with [Investigate | Warn | Suspend | Ignore]
 *  - Global Settings (maxCopyFee, minTraderLevel, maxFollowers, platformFee)
 */
import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw, AlertTriangle, Shield, Settings2, Check,
  Users, TrendingUp, DollarSign, BarChart2, Flag,
  Eye, Bell, Ban, X, ChevronDown, Loader2,
} from 'lucide-react';
import { useCopyTradingStore } from '@/lib/copyTradingStore';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface GlobalSettings {
  maxCopyFeePct:       number;   // max allowed copy fee %
  minTraderLevel:      number;   // min academy level to accept followers
  maxFollowersPerTrader: number; // 0 = unlimited
  platformFeePct:      number;   // platform cut on copy fees
}

interface ReportedIssue {
  id:         string;
  traderId:   string;
  traderName: string;
  reports:    number;
  reason:     string;
  status:     'open' | 'warned' | 'suspended' | 'ignored';
  reportedAt: string;
}

const DEFAULT_SETTINGS: GlobalSettings = {
  maxCopyFeePct:        10,
  minTraderLevel:       5,
  maxFollowersPerTrader: 10_000,
  platformFeePct:       20,
};

const SETTINGS_KEY = 'cryptoverse_copy_admin_settings_v1';
const ISSUES_KEY   = 'cryptoverse_copy_issues_v1';

function loadSettings(): GlobalSettings {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') }; } catch { return DEFAULT_SETTINGS; }
}
function saveSettings(s: GlobalSettings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
}

// No fabricated issues — the queue starts empty until a real "report this
// trader" action exists on the user-facing Copy Trading page.
function loadIssues(): ReportedIssue[] {
  try {
    const v = localStorage.getItem(ISSUES_KEY);
    return v ? JSON.parse(v) : [];
  } catch { return []; }
}
function saveIssues(issues: ReportedIssue[]) {
  try { localStorage.setItem(ISSUES_KEY, JSON.stringify(issues)); } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color, icon }: { label: string; value: string; sub?: string; color?: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      </div>
      <p className="font-bold text-xl" style={{ color: color ?? 'var(--text-primary)' }}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function NumberInput({ value, onChange, suffix, prefix }: { value: number; onChange: (v: number) => void; suffix?: string; prefix?: string }) {
  return (
    <div className="flex items-center rounded-xl overflow-hidden"
      style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
      {prefix && <span className="px-2.5 text-xs text-muted-foreground">{prefix}</span>}
      <input type="number" value={value || ''} onChange={e => onChange(+e.target.value || 0)}
        style={{ color: 'var(--text-primary)' }}
        className="bg-transparent py-2 px-2 text-sm focus:outline-none w-24" />
      {suffix && <span className="px-2.5 text-xs text-muted-foreground">{suffix}</span>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function AdminCopyTrading() {
  const getTopTraders  = useCopyTradingStore(s => s.getTopTraders);
  const relationships  = useCopyTradingStore(s => s.relationships);
  const executions     = useCopyTradingStore(s => s.executions);
  const traders        = useCopyTradingStore(s => s.traders);

  const topTraders = useMemo(() => getTopTraders(), [traders]);

  // ── Platform stats ─────────────────────────────────────────────────────────
  const allRels       = useMemo(() => Object.values(relationships), [relationships]);
  const allExecs      = useMemo(() => Object.values(executions),    [executions]);
  const activeRels    = allRels.filter(r => r.status === 'active');
  const totalRelations = allRels.length;
  const totalCopied   = allExecs.length;
  const totalFeesCP   = allExecs.reduce((s, e) => s + e.feePaidCP, 0);
  const avgCopyFee    = topTraders.length > 0
    ? (topTraders.reduce((s, t) => s + t.copyFeePct, 0) / topTraders.length).toFixed(1)
    : '0.0';

  // ── Settings ───────────────────────────────────────────────────────────────
  const [settings,     setSettings]     = useState<GlobalSettings>(loadSettings);
  const [settingsSaved, setSettingsSaved] = useState(false);

  function handleSaveSettings() {
    saveSettings(settings);
    setSettingsSaved(true);
    toast.success('✅ Global settings saved.');
    setTimeout(() => setSettingsSaved(false), 2_000);
  }

  // ── Issues ─────────────────────────────────────────────────────────────────
  const [issues, setIssues] = useState<ReportedIssue[]>(loadIssues);

  function resolveIssue(id: string, action: 'warn' | 'suspend' | 'ignore') {
    const labels = { warn: 'warned', suspend: 'suspended', ignore: 'ignored' } as const;
    const updated = issues.map(i => i.id === id ? { ...i, status: labels[action] as ReportedIssue['status'] } : i);
    setIssues(updated);
    saveIssues(updated);
    toast.success(`Issue ${labels[action]} successfully.`);
  }

  // ── Refresh ────────────────────────────────────────────────────────────────
  const [refreshing, setRefreshing] = useState(false);
  async function handleRefresh() {
    setRefreshing(true);
    await new Promise(r => setTimeout(r, 600));
    setRefreshing(false);
    toast.success('Data refreshed.');
  }

  // ── Trader detail expand ───────────────────────────────────────────────────
  const [expandedTrader, setExpandedTrader] = useState<string | null>(null);

  const openIssues = issues.filter(i => i.status === 'open');

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2.5">
          <RefreshCw className="h-5 w-5 text-yellow-400" />
          <h1 className="font-bold text-lg text-foreground">Copy Trading Management</h1>
          {openIssues.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">
              {openIssues.length} issue{openIssues.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <button onClick={handleRefresh}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#9CA3AF' }}>
          {refreshing
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <RefreshCw className="h-4 w-4" />
          }
          Refresh
        </button>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-6 space-y-8">

          {/* ── Platform Statistics ── */}
          <section>
            <SectionHeader title="Platform Statistics" icon={<BarChart2 className="h-4 w-4 text-yellow-400" />} />
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <StatCard label="Total Relations"  value={totalRelations.toLocaleString()} sub="all time"          color="#FFD700"  icon={<Users className="h-3.5 w-3.5 text-yellow-400" />} />
              <StatCard label="Active Copies"    value={activeRels.length.toLocaleString()} sub="currently active" color="#34d399"  icon={<TrendingUp className="h-3.5 w-3.5 text-emerald-400" />} />
              <StatCard label="Total Copied"     value={totalCopied.toLocaleString()} sub="executions"         icon={<RefreshCw className="h-3.5 w-3.5 text-blue-400" />} />
              <StatCard label="Total Fees"       value={`${totalFeesCP.toFixed(0)} CP`} sub="collected"       color="#FFD700"  icon={<DollarSign className="h-3.5 w-3.5 text-yellow-400" />} />
              <StatCard label="Avg Copy Fee"     value={`${avgCopyFee}%`} sub="across traders"             icon={<BarChart2 className="h-3.5 w-3.5 text-purple-400" />} />
            </div>
          </section>

          {/* ── Top Copied Traders ── */}
          <section>
            <SectionHeader title="Top Copied Traders" icon={<TrendingUp className="h-4 w-4 text-emerald-400" />} />
            <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border-color)' }}>
              {/* Table header */}
              <div className="grid px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                style={{ gridTemplateColumns: '2rem 2fr 1fr 1fr 1fr 1fr 5rem', gap: '0.5rem', background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)' }}>
                <span>Rank</span><span>Trader</span><span>Followers</span><span>Profit</span><span>Win Rate</span><span>Fee</span><span className="text-right">Actions</span>
              </div>
              {topTraders.map((t, i) => {
                const isExpanded = expandedTrader === t.id;
                const traderRels = allRels.filter(r => r.traderId === t.id);
                return (
                  <div key={t.id} style={{ borderBottom: i < topTraders.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                    <div className="grid items-center px-4 py-3 hover:bg-white/2 transition-colors"
                      style={{ gridTemplateColumns: '2rem 2fr 1fr 1fr 1fr 1fr 5rem', gap: '0.5rem', background: 'var(--bg-card)' }}>
                      <span className="text-base">{t.rank === 1 ? '👑' : t.rank === 2 ? '🥈' : t.rank === 3 ? '🥉' : `#${t.rank}`}</span>
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold uppercase shrink-0"
                          style={{ background: 'rgba(255,215,0,0.12)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.2)' }}>
                          {t.displayName.slice(0, 2)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-foreground truncate">{t.displayName}</p>
                          <p className="text-[10px] text-muted-foreground">Fee: {t.copyFeePct}%</p>
                        </div>
                      </div>
                      <span className="text-sm text-foreground">{t.totalFollowers.toLocaleString()}</span>
                      <span className="text-sm font-bold" style={{ color: '#34d399' }}>+{t.totalProfitPct}%</span>
                      <span className="text-sm" style={{ color: t.winRate >= 70 ? '#34d399' : '#FFD700' }}>{t.winRate}%</span>
                      <span className="text-sm text-foreground">{t.copyFeePct}%</span>
                      <div className="flex justify-end">
                        <button onClick={() => setExpandedTrader(isExpanded ? null : t.id)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
                          style={{ background: 'rgba(255,255,255,0.05)', color: '#9CA3AF', border: '1px solid rgba(255,255,255,0.08)' }}>
                          <Eye className="h-3 w-3" /> View {isExpanded ? <ChevronDown className="h-3 w-3 rotate-180 transition-transform" /> : <ChevronDown className="h-3 w-3 transition-transform" />}
                        </button>
                      </div>
                    </div>

                    {/* Expanded detail */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                          style={{ background: 'rgba(255,215,0,0.03)', borderTop: '1px solid rgba(255,215,0,0.08)' }}>
                          <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {[
                              { label: 'Active Followers', value: t.activeFollowers.toLocaleString() },
                              { label: 'Max Drawdown',     value: `-${t.maxDrawdownPct}%`, color: '#ef4444' },
                              { label: 'Total Trades',     value: t.totalTrades.toLocaleString() },
                              { label: 'Total Earned',     value: `${t.totalEarningsCP.toLocaleString()} CP`, color: '#FFD700' },
                              { label: 'Avg Trade Size',   value: `$${t.avgTradeSizeUsd.toLocaleString()}` },
                              { label: 'Sharpe Ratio',     value: t.sharpeRatio.toFixed(1) },
                              { label: 'Rating',           value: `${t.rating} ⭐ (${t.ratingCount})` },
                              { label: 'Copy Rels',        value: `${traderRels.length} (${traderRels.filter(r => r.status === 'active').length} active)` },
                            ].map(m => (
                              <div key={m.label} className="rounded-xl p-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                                <p className="text-[10px] text-muted-foreground">{m.label}</p>
                                <p className="font-bold text-sm mt-0.5" style={{ color: m.color ?? 'var(--text-primary)' }}>{m.value}</p>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── Reported Issues ── */}
          <section>
            <SectionHeader
              title={`Reported Issues (${openIssues.length} open)`}
              icon={<Flag className="h-4 w-4 text-red-400" />}
            />
            {issues.length === 0 ? (
              <div className="text-center py-10 rounded-2xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                <p className="text-sm text-muted-foreground">No reported issues.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {issues.map(issue => (
                  <div key={issue.id} className="rounded-2xl p-4" style={{ background: 'var(--bg-card)', border: `1px solid ${issue.status === 'open' ? 'rgba(239,68,68,0.25)' : 'var(--border-color)'}` }}>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: issue.status === 'open' ? '#ef4444' : '#9CA3AF' }} />
                          <p className="font-bold text-sm text-foreground">Trader flagged: {issue.traderName}</p>
                          <StatusBadge status={issue.status} />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Reports: <strong className="text-foreground">{issue.reports}</strong> · Reason: "{issue.reason}"
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Reported {Math.round((Date.now() - new Date(issue.reportedAt).getTime()) / 86_400_000)}d ago
                        </p>
                      </div>
                      {issue.status === 'open' && (
                        <div className="flex flex-wrap gap-2 shrink-0">
                          <AdminAction label="Investigate" icon={<Eye className="h-3 w-3" />}
                            onClick={() => toast.info(`Opening investigation for ${issue.traderName}…`)}
                            color="text-blue-400" border="rgba(96,165,250,0.22)" bg="rgba(96,165,250,0.10)" />
                          <AdminAction label="Warn" icon={<Bell className="h-3 w-3" />}
                            onClick={() => resolveIssue(issue.id, 'warn')}
                            color="text-yellow-400" border="rgba(251,191,36,0.22)" bg="rgba(251,191,36,0.10)" />
                          <AdminAction label="Suspend" icon={<Ban className="h-3 w-3" />}
                            onClick={() => resolveIssue(issue.id, 'suspend')}
                            color="text-red-400" border="rgba(239,68,68,0.22)" bg="rgba(239,68,68,0.10)" />
                          <AdminAction label="Ignore" icon={<X className="h-3 w-3" />}
                            onClick={() => resolveIssue(issue.id, 'ignore')}
                            color="text-muted-foreground" border="rgba(255,255,255,0.08)" bg="rgba(255,255,255,0.04)" />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Global Settings ── */}
          <section>
            <SectionHeader title="Global Settings" icon={<Settings2 className="h-4 w-4 text-purple-400" />} />
            <div className="rounded-2xl p-5 space-y-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {[
                  { label: 'Max copy fee allowed',            key: 'maxCopyFeePct',         suffix: '%',   desc: 'Traders cannot set fee above this' },
                  { label: 'Min trader level to accept followers', key: 'minTraderLevel',    suffix: 'lvl', desc: 'Academy level required to be copied' },
                  { label: 'Max followers per trader',        key: 'maxFollowersPerTrader',  suffix: '',    desc: '0 = unlimited' },
                  { label: 'Platform fee on copy fees',       key: 'platformFeePct',         suffix: '%',   desc: 'Platform cut from trader earnings' },
                ].map(field => (
                  <div key={field.key}>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1.5">{field.label}</label>
                    <NumberInput
                      value={settings[field.key as keyof GlobalSettings]}
                      onChange={v => setSettings(s => ({ ...s, [field.key]: v }))}
                      suffix={field.suffix}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">{field.desc}</p>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3 pt-2 border-t border-white/5">
                <button onClick={handleSaveSettings}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all hover:opacity-90"
                  style={{
                    background: settingsSaved ? 'rgba(52,211,153,0.15)' : 'linear-gradient(135deg,#FFD700,#FFA800)',
                    color:      settingsSaved ? '#34d399' : '#0A1929',
                    border:     settingsSaved ? '1px solid rgba(52,211,153,0.3)' : 'none',
                  }}>
                  {settingsSaved ? <><Check className="h-4 w-4" /> Saved!</> : 'Save Settings'}
                </button>
                <p className="text-xs text-muted-foreground">Changes apply to new relationships and fees immediately.</p>
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function SectionHeader({ title, icon }: { title: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {icon}
      <h2 className="font-bold text-foreground">{title}</h2>
    </div>
  );
}

function AdminAction({ label, icon, onClick, color, border, bg }: { label: string; icon: React.ReactNode; onClick: () => void; color: string; border: string; bg: string }) {
  return (
    <button onClick={onClick}
      className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all hover:opacity-80', color)}
      style={{ background: bg, border: `1px solid ${border}` }}>
      {icon} {label}
    </button>
  );
}

function StatusBadge({ status }: { status: ReportedIssue['status'] }) {
  const config = {
    open:      { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.25)',   label: 'Open' },
    warned:    { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.25)',  label: 'Warned' },
    suspended: { color: '#9CA3AF', bg: 'rgba(156,163,175,0.12)', border: 'rgba(156,163,175,0.25)', label: 'Suspended' },
    ignored:   { color: '#6B7280', bg: 'rgba(107,114,128,0.10)', border: 'rgba(107,114,128,0.20)', label: 'Ignored' },
  }[status];

  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
      style={{ background: config.bg, color: config.color, border: `1px solid ${config.border}` }}>
      {config.label}
    </span>
  );
}
