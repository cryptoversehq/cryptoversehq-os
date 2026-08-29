/**
 * TraderDetailModal.tsx
 * Full trader profile modal with performance chart, monthly returns,
 * recent trades table, and copy action.
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Shield, Star, TrendingUp, TrendingDown, Users, BarChart2, ArrowRight } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { TopTrader } from '../../lib/copyTradingTypes';
import { CopyRelationship } from '../../lib/copyTradingTypes';
import { CTV, badgeEmoji, fmtPct, fmtUsd, starsArr, fmtDateTime } from './CopyTradingUtils';
import { CopySettingsModal } from './CopySettingsModal';

interface Props {
  trader: TopTrader;
  relationship?: CopyRelationship;  // existing rel if user follows already
  followerId: string;
  userLevel: number;
  minLevel: number;
  onClose: () => void;
  onCopied: () => void;
}

export function TraderDetailModal({ trader, relationship, followerId, userLevel, minLevel, onClose, onCopied }: Props) {
  const [showCopySettings, setShowCopySettings] = useState(false);
  const isFollowing = !!relationship && relationship.status !== 'stopped';
  const canCopy     = userLevel >= minLevel;

  const equityData = trader.equityCurve.map((v, i) => ({ i, v }));

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        className="fixed inset-4 sm:inset-auto sm:left-1/2 sm:-translate-x-1/2 sm:top-10 sm:bottom-10 sm:w-full sm:max-w-4xl z-[65] rounded-2xl flex flex-col overflow-hidden"
        style={{ background: 'var(--bg-card)', border: `1px solid ${CTV.goldBorder}`, boxShadow: '0 30px 100px rgba(0,0,0,0.7)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0"
          style={{ borderColor: CTV.goldBorder }}>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-lg uppercase"
              style={{ background: CTV.goldAlpha, color: CTV.gold, border: `1.5px solid ${CTV.goldBorder}` }}>
              {trader.displayName.slice(0, 2)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">{badgeEmoji(trader)}</span>
                <p className="font-bold text-foreground">{trader.displayName}</p>
                {trader.isVerified && <Shield className="h-4 w-4 text-blue-400" />}
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                {starsArr(trader.rating).map((s, i) => (
                  <Star key={i} size={11} fill={s === 'full' ? CTV.gold : 'transparent'} stroke={s === 'empty' ? 'rgba(255,215,0,0.3)' : CTV.gold} />
                ))}
                <span className="text-xs ml-1" style={{ color: CTV.gray }}>{trader.rating} ({trader.ratingCount.toLocaleString()} reviews)</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl transition-colors hover:bg-white/5" style={{ color: CTV.gray }}>
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-0 h-full">

            {/* Left — info + chart */}
            <div className="lg:col-span-3 p-5 space-y-5 border-b lg:border-b-0 lg:border-r" style={{ borderColor: CTV.border }}>

              {/* Bio */}
              <p className="text-xs leading-relaxed" style={{ color: CTV.gray }}>{trader.bio}</p>

              {/* Stats grid */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Win Rate',    value: fmtPct(trader.winRate, false),     color: CTV.green },
                  { label: 'Total Profit', value: fmtPct(trader.totalProfitPct),    color: CTV.green },
                  { label: 'Max Drawdown', value: `-${trader.maxDrawdownPct}%`,     color: CTV.red   },
                  { label: 'Sharpe Ratio', value: trader.sharpeRatio.toFixed(1),    color: CTV.gold  },
                  { label: 'Total Trades', value: trader.totalTrades.toLocaleString(), color: 'var(--foreground)' },
                  { label: 'Avg Trade',   value: fmtUsd(trader.avgTradeSizeUsd),    color: 'var(--foreground)' },
                ].map(s => (
                  <div key={s.label} className="rounded-xl p-3" style={{ background: CTV.surface, border: `1px solid ${CTV.border}` }}>
                    <p className="text-[10px] uppercase tracking-wide" style={{ color: CTV.gray }}>{s.label}</p>
                    <p className="font-bold text-sm mt-0.5" style={{ color: s.color }}>{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Equity chart */}
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: CTV.gray }}>Performance Curve (30d)</p>
                <div className="rounded-xl overflow-hidden" style={{ background: CTV.surface, border: `1px solid ${CTV.border}` }}>
                  <ResponsiveContainer width="100%" height={140}>
                    <AreaChart data={equityData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="ctGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={CTV.gold} stopOpacity={0.25} />
                          <stop offset="95%" stopColor={CTV.gold} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="i" hide />
                      <YAxis hide domain={['auto', 'auto']} />
                      <Tooltip
                        formatter={(v: number) => [`$${v.toLocaleString()}`, 'Equity']}
                        contentStyle={{ background: '#0A1929', border: `1px solid ${CTV.goldBorder}`, borderRadius: 8, fontSize: 11 }}
                      />
                      <Area type="monotone" dataKey="v" stroke={CTV.gold} strokeWidth={2} fill="url(#ctGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Monthly returns */}
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: CTV.gray }}>Monthly Returns</p>
                <div className="rounded-xl overflow-hidden" style={{ background: CTV.surface, border: `1px solid ${CTV.border}` }}>
                  <ResponsiveContainer width="100%" height={100}>
                    <BarChart data={trader.monthlyReturns} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                      <XAxis dataKey="month" tick={{ fontSize: 9, fill: CTV.gray }} axisLine={false} tickLine={false} />
                      <YAxis hide />
                      <Tooltip
                        formatter={(v: number) => [`${v > 0 ? '+' : ''}${v}%`, 'Return']}
                        contentStyle={{ background: '#0A1929', border: `1px solid ${CTV.goldBorder}`, borderRadius: 8, fontSize: 11 }}
                      />
                      <Bar dataKey="returnPct" radius={[3, 3, 0, 0]}>
                        {trader.monthlyReturns.map((entry, i) => (
                          <Cell key={i} fill={entry.returnPct >= 0 ? CTV.green : CTV.red} fillOpacity={0.8} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {trader.monthlyReturns.map(m => (
                    <span key={m.month} className="text-[10px] px-2 py-0.5 rounded-lg font-semibold"
                      style={{ background: m.returnPct >= 0 ? CTV.greenAlpha : CTV.redAlpha, color: m.returnPct >= 0 ? CTV.green : CTV.red }}>
                      {m.month} {fmtPct(m.returnPct)}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Right — copy panel + trades */}
            <div className="lg:col-span-2 p-5 space-y-5">

              {/* Copy fee + CTA */}
              <div className="rounded-2xl p-4 space-y-3" style={{ background: CTV.goldAlpha, border: `1px solid ${CTV.goldBorder}` }}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold" style={{ color: CTV.gray }}>Copy Fee</p>
                  <p className="font-bold text-sm" style={{ color: CTV.gold }}>{trader.copyFeePct}% of profit</p>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" style={{ color: CTV.gray }} />
                  <p className="text-xs" style={{ color: CTV.gray }}>
                    <strong className="text-foreground">{trader.activeFollowers.toLocaleString()}</strong> active followers
                  </p>
                </div>

                {!canCopy ? (
                  <div className="rounded-xl p-3 text-center" style={{ background: CTV.redAlpha, border: `1px solid ${CTV.redBorder}` }}>
                    <p className="text-xs font-semibold" style={{ color: CTV.red }}>Requires Academy Level {minLevel}</p>
                    <p className="text-[11px] mt-0.5 text-muted-foreground">Your level: {userLevel}</p>
                  </div>
                ) : isFollowing ? (
                  <button onClick={() => setShowCopySettings(true)}
                    className="w-full py-2.5 rounded-xl text-sm font-bold transition-all hover:opacity-90"
                    style={{ background: CTV.surface, color: CTV.green, border: `1px solid ${CTV.greenBorder}` }}>
                    ✓ Copying — Adjust Settings
                  </button>
                ) : (
                  <button onClick={() => setShowCopySettings(true)}
                    className="w-full py-2.5 rounded-xl text-sm font-bold transition-all hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg,#FFD700,#FFA800)', color: '#0A1929' }}>
                    🚀 Copy This Trader
                  </button>
                )}
              </div>

              {/* Recent Trades */}
              <div>
                <p className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: CTV.gray }}>
                  <BarChart2 className="h-3.5 w-3.5" /> Recent Trades
                </p>
                <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${CTV.border}` }}>
                  <div className="grid grid-cols-5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider"
                    style={{ background: 'var(--bg-secondary)', color: CTV.gray, borderBottom: `1px solid ${CTV.border}` }}>
                    <span>Time</span><span>Type</span><span>Symbol</span><span>Amount</span><span className="text-right">PnL</span>
                  </div>
                  {trader.recentTrades.slice(0, 6).map((t, i) => (
                    <div key={t.id}
                      className="grid grid-cols-5 px-3 py-2 text-xs"
                      style={{ background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-secondary)', borderBottom: i < 5 ? `1px solid ${CTV.border}` : 'none' }}>
                      <span className="text-muted-foreground text-[10px]">{new Date(t.openedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="font-bold" style={{ color: t.type === 'BUY' ? CTV.green : CTV.red }}>{t.type}</span>
                      <span className="font-semibold text-foreground">{t.symbol}</span>
                      <span style={{ color: CTV.gray }}>${t.amount.toFixed(0)}</span>
                      <span className="text-right font-bold" style={{ color: t.pnl === null ? CTV.gray : t.pnl >= 0 ? CTV.green : CTV.red }}>
                        {t.pnl === null ? '—' : fmtUsd(t.pnl)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Copy settings sub-modal */}
      {showCopySettings && (
        <CopySettingsModal
          trader={trader}
          existingRelId={relationship?.id}
          initialSettings={relationship?.settings}
          followerId={followerId}
          onClose={() => setShowCopySettings(false)}
          onSuccess={() => { setShowCopySettings(false); onCopied(); }}
        />
      )}
    </>
  );
}
