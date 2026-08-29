/**
 * TraderDetailsPage.tsx
 * Routed page: /copy-trading/trader/:id
 *
 * Full dedicated page for a single trader — shows the same detail as
 * TraderDetailModal but as a full-screen route, with deep-linked URL.
 */
import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Shield, Star, TrendingUp, TrendingDown, Users,
  BarChart2, RefreshCw, Award, Zap, AlertTriangle,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { useCopyTradingStore } from '../../lib/copyTradingStore';
import { useAuthStore } from '../../lib/authStore';
import { TopTrader } from '../../lib/copyTradingTypes';
import { CopySettingsModal } from './CopySettingsModal';
import { CTV, fmtUsd, fmtPct, badgeEmoji, starsArr, MIN_COPY_LEVEL } from './CopyTradingUtils';
import { cn } from '@/lib/utils';

const DEMO_LEVEL = 5;

// ─────────────────────────────────────────────────────────────────────────────
// Stat card
// ─────────────────────────────────────────────────────────────────────────────

function StatBox({
  label, value, sub, color, icon,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-1"
      style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
    >
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wide">
        {icon}
        {label}
      </div>
      <p className="font-bold text-xl leading-tight" style={{ color: color ?? 'var(--foreground)' }}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom tooltip
// ─────────────────────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const v = payload[0]?.value as number;
  const isPos = v >= 0;
  return (
    <div className="rounded-xl px-3 py-2 text-xs font-mono shadow-xl"
      style={{ background: 'var(--bg-card)', border: `1px solid ${CTV.goldBorder}` }}>
      <p className="text-muted-foreground mb-0.5">{label}</p>
      <p style={{ color: isPos ? CTV.green : CTV.red }}>
        {isPos ? '+' : ''}{v.toFixed(1)}%
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export function TraderDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const traders          = useCopyTradingStore(s => s.traders);
  const relationships    = useCopyTradingStore(s => s.relationships);
  const isFollowing      = useCopyTradingStore(s => s.isFollowing);
  const getRelationshipWith = useCopyTradingStore(s => s.getRelationshipWith);
  const pauseCopying     = useCopyTradingStore(s => s.pauseCopying);
  const resumeCopying    = useCopyTradingStore(s => s.resumeCopying);
  const stopCopying      = useCopyTradingStore(s => s.stopCopying);

  const userId   = user?.id ?? 'demo_follower';
  const userLevel = DEMO_LEVEL;

  // Find trader by id
  const trader: TopTrader | undefined = Object.values(traders).find(t => t.id === id);

  const [activeTab, setActiveTab]     = useState<'overview' | 'trades' | 'followers'>('overview');
  const [showCopyModal, setShowCopyModal] = useState(false);

  if (!trader) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
        <AlertTriangle className="h-12 w-12 text-amber-400 opacity-50" />
        <p className="text-muted-foreground">Trader not found.</p>
        <button onClick={() => navigate('/copy-trading')}
          className="px-4 py-2 rounded-xl text-sm font-semibold"
          style={{ background: CTV.goldAlpha, color: CTV.gold, border: `1px solid ${CTV.goldBorder}` }}>
          ← Back to Copy Trading
        </button>
      </div>
    );
  }

  const rel       = getRelationshipWith(userId, trader.id);
  const following = isFollowing(userId, trader.id);
  const canCopy   = userLevel >= MIN_COPY_LEVEL;

  const equityData    = trader.equityCurve.map((v, i) => ({ i, v }));
  const monthlyData   = trader.monthlyReturns.map(m => ({ name: m.month, ret: m.returnPct }));
  const tradeHistory  = trader.recentTrades;

  const TABS = ['overview', 'trades', 'followers'] as const;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 sm:px-6 py-4 border-b border-border shrink-0 bg-card">
        <button onClick={() => navigate('/copy-trading')}
          className="p-2 rounded-xl transition-colors hover:bg-secondary/50 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="font-bold text-lg text-foreground">Trader Profile</h1>
      </div>

      {/* ── Scrollable body ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">

          {/* ── Hero card ─────────────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl p-5 sm:p-6 relative overflow-hidden"
            style={{ background: 'var(--bg-card)', border: `1px solid ${CTV.goldBorder}` }}
          >
            {/* Background glow */}
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse at top right, rgba(255,215,0,0.04) 0%, transparent 60%)' }} />

            <div className="relative flex flex-col sm:flex-row gap-5 items-start sm:items-center">
              {/* Avatar */}
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center font-bold text-2xl uppercase shrink-0"
                style={{ background: CTV.goldAlpha, color: CTV.gold, border: `2px solid ${CTV.goldBorder}` }}>
                {trader.displayName.slice(0, 2)}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="text-xl">{badgeEmoji(trader)}</span>
                  <h2 className="font-bold text-xl text-foreground">{trader.displayName}</h2>
                  {trader.isVerified && (
                    <Shield className="h-5 w-5 text-blue-400 shrink-0" title="Verified" />
                  )}
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold ml-1"
                    style={{ background: CTV.goldAlpha, color: CTV.gold, border: `1px solid ${CTV.goldBorder}` }}>
                    #{trader.rank}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mb-2">{trader.bio}</p>
                <div className="flex flex-wrap items-center gap-2">
                  {/* Stars */}
                  <div className="flex gap-0.5">
                    {starsArr(trader.rating).map((s, i) => (
                      <Star key={i} className={cn('h-3.5 w-3.5', s === 'full' ? 'text-yellow-400 fill-yellow-400' : s === 'half' ? 'text-yellow-400' : 'text-muted-foreground/30')} />
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">{trader.rating}/5 ({trader.ratingCount} reviews)</span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="h-3 w-3" />
                    {trader.totalFollowers.toLocaleString()} followers
                  </div>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs font-semibold" style={{ color: CTV.gold }}>
                    {trader.copyFeePct}% copy fee
                  </span>
                </div>
              </div>

              {/* CTA */}
              <div className="flex flex-col gap-2 shrink-0">
                {following ? (
                  <>
                    <span className="px-4 py-2 rounded-xl text-sm font-bold text-center"
                      style={{ background: CTV.greenAlpha, color: CTV.green, border: `1px solid ${CTV.greenBorder}` }}>
                      ✓ Currently Copying
                    </span>
                    {rel && rel.status === 'active' && (
                      <button onClick={() => pauseCopying(rel.id, 'manual')}
                        className="px-4 py-2 rounded-xl text-xs font-semibold"
                        style={{ background: CTV.goldAlpha, color: CTV.gold, border: `1px solid ${CTV.goldBorder}` }}>
                        ⏸ Pause
                      </button>
                    )}
                    {rel && rel.status === 'paused' && (
                      <button onClick={() => resumeCopying(rel.id)}
                        className="px-4 py-2 rounded-xl text-xs font-semibold"
                        style={{ background: CTV.greenAlpha, color: CTV.green, border: `1px solid ${CTV.greenBorder}` }}>
                        ▶ Resume
                      </button>
                    )}
                    {rel && (
                      <button onClick={() => stopCopying(rel.id)}
                        className="px-4 py-2 rounded-xl text-xs font-semibold"
                        style={{ background: CTV.redAlpha, color: CTV.red, border: `1px solid ${CTV.redBorder}` }}>
                        ✕ Stop Copying
                      </button>
                    )}
                  </>
                ) : (
                  <button onClick={() => canCopy && setShowCopyModal(true)}
                    disabled={!canCopy}
                    className="px-5 py-2.5 rounded-xl font-bold text-sm transition-all hover:opacity-90 disabled:opacity-40"
                    style={{ background: 'linear-gradient(135deg,#FFD700,#FFA800)', color: '#0A1929' }}>
                    <RefreshCw className="h-4 w-4 inline mr-1.5 -mt-0.5" />
                    Copy This Trader
                  </button>
                )}
                {!canCopy && (
                  <p className="text-[10px] text-muted-foreground text-center">
                    Level {MIN_COPY_LEVEL}+ required
                  </p>
                )}
              </div>
            </div>
          </motion.div>

          {/* ── Key stats row ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            <StatBox label="Win Rate"       value={`${trader.winRate}%`}             color={CTV.green}   icon={<TrendingUp className="h-3 w-3" />} />
            <StatBox label="Total Profit"   value={`+${trader.totalProfitPct}%`}     color={CTV.green}   icon={<BarChart2 className="h-3 w-3" />} />
            <StatBox label="Max Drawdown"   value={`-${trader.maxDrawdownPct}%`}     color={CTV.red}     icon={<TrendingDown className="h-3 w-3" />} />
            <StatBox label="Sharpe Ratio"   value={trader.sharpeRatio.toFixed(2)}    color="var(--foreground)" icon={<Award className="h-3 w-3" />} />
            <StatBox label="Total Trades"   value={trader.totalTrades.toLocaleString()} color="var(--foreground)" icon={<Zap className="h-3 w-3" />} />
            <StatBox label="Avg Trade"      value={`$${trader.avgTradeSizeUsd.toLocaleString()}`} color="var(--foreground)" icon={<RefreshCw className="h-3 w-3" />} />
          </div>

          {/* ── Tabs ──────────────────────────────────────────────────────── */}
          <div className="flex gap-1 rounded-xl p-1" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
            {TABS.map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={cn(
                  'flex-1 py-2 rounded-lg text-xs font-semibold capitalize transition-all',
                  activeTab === tab
                    ? 'text-foreground shadow-md'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                style={activeTab === tab ? { background: CTV.goldAlpha, color: CTV.gold } : {}}>
                {tab}
              </button>
            ))}
          </div>

          {/* ── Tab: Overview ─────────────────────────────────────────────── */}
          {activeTab === 'overview' && (
            <div className="space-y-5 animate-in fade-in duration-200">
              {/* Equity curve */}
              <div className="rounded-2xl p-5"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                  Equity Curve (30 days)
                </p>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={equityData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={CTV.green} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={CTV.green} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="i" hide />
                    <YAxis hide />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="v" stroke={CTV.green} strokeWidth={2} fill="url(#eq)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Monthly returns */}
              <div className="rounded-2xl p-5"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                  Monthly Returns
                </p>
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={monthlyData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                    <YAxis hide />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="ret" radius={[4, 4, 0, 0]}>
                      {monthlyData.map((m, i) => (
                        <Cell key={i} fill={m.ret >= 0 ? CTV.green : CTV.red} fillOpacity={0.85} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ── Tab: Trades ───────────────────────────────────────────────── */}
          {activeTab === 'trades' && (
            <div className="rounded-2xl overflow-hidden animate-in fade-in duration-200"
              style={{ border: '1px solid var(--border-color)' }}>
              <div className="grid px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                style={{ gridTemplateColumns: '1fr 4rem 4rem 5rem 5rem', gap: '0.5rem', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                <span>Symbol</span><span>Side</span><span>Result</span><span className="text-right">PnL</span><span className="text-right">PnL %</span>
              </div>
              {tradeHistory.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground text-sm">No recent trades.</div>
              ) : (
                tradeHistory.map((t, i) => {
                  const pnlVal = t.pnl ?? 0;
                  const pnlPctVal = t.pnlPct ?? 0;
                  const isWin = t.pnl !== null && t.pnl > 0;
                  const isLoss = t.pnl !== null && t.pnl < 0;
                  const isOpen = t.pnl === null;
                  return (
                    <div key={t.id} className="grid px-4 py-3 hover:bg-secondary/20 transition-colors text-sm items-center"
                      style={{ gridTemplateColumns: '1fr 4rem 4rem 5rem 5rem', gap: '0.5rem', borderBottom: i < tradeHistory.length - 1 ? '1px solid var(--border-color)' : 'none', background: 'var(--bg-card)' }}>
                      <span className="font-mono font-bold text-foreground">{t.symbol}</span>
                      <span className={cn('text-xs font-bold', t.type === 'BUY' ? 'text-emerald-400' : 'text-red-400')}>
                        {t.type}
                      </span>
                      <span className={cn('text-xs font-bold', isWin && 'text-emerald-400', isLoss && 'text-red-400', isOpen && 'text-muted-foreground')}>
                        {isOpen ? '—' : isWin ? '✓ Win' : '✗ Loss'}
                      </span>
                      <span className={cn('text-right font-mono font-bold text-sm', isWin && 'text-emerald-400', isLoss && 'text-red-400', isOpen && 'text-muted-foreground')}>
                        {isOpen ? '—' : `${isWin ? '+' : ''}${fmtUsd(pnlVal)}`}
                      </span>
                      <span className={cn('text-right font-mono text-xs', isWin && 'text-emerald-400', isLoss && 'text-red-400', isOpen && 'text-muted-foreground')}>
                        {isOpen ? '—' : `${isWin ? '+' : ''}${pnlPctVal.toFixed(1)}%`}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ── Tab: Followers ─────────────────────────────────────────────── */}
          {activeTab === 'followers' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <StatBox label="Total Followers"  value={trader.totalFollowers.toLocaleString()}  color={CTV.gold} icon={<Users className="h-3 w-3" />} />
                <StatBox label="Active Followers" value={trader.activeFollowers.toLocaleString()} color={CTV.green} icon={<Users className="h-3 w-3" />} />
                <StatBox label="Copy Fee"         value={`${trader.copyFeePct}%`}                 color={CTV.gold} icon={<BarChart2 className="h-3 w-3" />} sub="of follower profit" />
              </div>

              {/* Active relationships */}
              {Object.values(relationships).filter(r => r.traderId === trader.id && r.status === 'active').length > 0 ? (
                <div className="rounded-2xl overflow-hidden"
                  style={{ border: '1px solid var(--border-color)' }}>
                  <div className="grid px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                    style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '0.5rem', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                    <span>Follower</span><span>Copy %</span><span>Invested</span><span className="text-right">P&L</span>
                  </div>
                  {Object.values(relationships).filter(r => r.traderId === trader.id && r.status === 'active').map((r, i, arr) => (
                    <div key={r.id} className="grid px-4 py-3 text-sm items-center"
                      style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '0.5rem', borderBottom: i < arr.length - 1 ? '1px solid var(--border-color)' : 'none', background: 'var(--bg-card)' }}>
                      <span className="font-mono text-foreground truncate">{r.followerId.slice(0, 14)}…</span>
                      <span className="text-muted-foreground">{r.settings.copyPct}%</span>
                      <span className="font-mono text-foreground">{fmtUsd(r.totalInvestedUsd)}</span>
                      <span className={cn('text-right font-mono font-bold', r.totalProfitUsd >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                        {r.totalProfitUsd >= 0 ? '+' : ''}{fmtUsd(r.totalProfitUsd)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl py-12 text-center text-muted-foreground"
                  style={{ border: '1px solid var(--border-color)' }}>
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  No active followers yet.
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Copy Settings Modal */}
      {showCopyModal && (
        <CopySettingsModal
          trader={trader}
          followerId={userId}
          onClose={() => setShowCopyModal(false)}
          onSuccess={() => { setShowCopyModal(false); }}
        />
      )}
    </div>
  );
}
