/**
 * MyStrategiesPage.tsx — /marketplace/my-strategies
 * Creator dashboard: published, drafts, earnings
 */
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Edit2, Eye, Trash2, TrendingUp, DollarSign, BarChart2,
  Star, Users, Clock, CheckCircle, AlertCircle, PauseCircle,
  ArrowLeft, Download, X, Loader2,
} from 'lucide-react';
import { useStrategyStore } from '../../lib/strategyStore';
import { useAuthStore } from '../../lib/authStore';
import { useCpCoinsStore } from '../../lib/cpCoinsStore';
import { Stars } from './StarRating';
import { CV, TYPE_META, RISK_META, fmtCP, fmtPct, timeAgo } from './MarketplaceUtils';
import type { Strategy } from '../../lib/strategyTypes';

// ─────────────────────────────────────────────────────────────────────────────

const STATUS_META: Record<Strategy['status'], { label: string; color: string; bg: string; icon: typeof CheckCircle }> = {
  approved:  { label: 'Published',     color: CV.green,   bg: 'rgba(52,211,153,0.12)',    icon: CheckCircle },
  pending:   { label: 'Under Review',  color: '#fbbf24',  bg: 'rgba(251,191,36,0.12)',   icon: Clock },
  draft:     { label: 'Draft',         color: CV.gray,    bg: 'rgba(156,163,175,0.10)',  icon: Edit2 },
  rejected:  { label: 'Rejected',      color: CV.red,     bg: 'rgba(239,68,68,0.10)',    icon: AlertCircle },
  suspended: { label: 'Suspended',     color: '#f97316',  bg: 'rgba(249,115,22,0.10)',   icon: PauseCircle },
};

// ─────────────────────────────────────────────────────────────────────────────

export function MyStrategiesPage() {
  const navigate    = useNavigate();
  const { user }    = useAuthStore();
  const getBalance  = useCpCoinsStore(s => s.getBalance);
  const initUser    = useCpCoinsStore(s => s.initUser);
  const getCreatorStrategies = useStrategyStore(s => s.getCreatorStrategies);
  const deleteStrategy       = useStrategyStore(s => s.deleteStrategy);
  const submitForReview      = useStrategyStore(s => s.submitForReview);

  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmt,  setWithdrawAmt]  = useState(1_000);
  const [withdrawPhase, setWithdrawPhase] = useState<'form' | 'loading' | 'done'>('form');

  if (!user) return null;

  initUser(user.id);
  const balance = getBalance(user.id);

  const myStrategies = useMemo(() => getCreatorStrategies(user.id), [getCreatorStrategies, user.id]);

  const published = myStrategies.filter(s => s.status === 'approved');
  const pending   = myStrategies.filter(s => s.status === 'pending');
  const drafts    = myStrategies.filter(s => s.status === 'draft' || s.status === 'rejected');

  // Earnings summary
  const totalRevenue  = myStrategies.reduce((sum, s) => sum + s.totalRevenue, 0);
  const platformFee   = Math.round(totalRevenue * 0.20 / 0.80); // back-compute gross from net
  const creatorEarns  = totalRevenue;

  // Streak metric: total sales across all strategies
  const totalSales    = myStrategies.reduce((sum, s) => sum + s.totalSales, 0);

  // ── Sub-components ────────────────────────────────────────────────────────

  function StrategyRow({ s }: { s: Strategy }) {
    const type   = TYPE_META[s.type];
    const status = STATUS_META[s.status];
    const StatusIcon = status.icon;

    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl overflow-hidden"
        style={{ background: 'var(--bg-card)', border: `1px solid ${CV.border}` }}
      >
        <div className="flex items-start gap-4 p-4">
          {/* Icon */}
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
            style={{ background: CV.goldAlpha, border: `1px solid ${CV.goldBorder}` }}>
            {type.emoji}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-sm text-foreground">{s.name}</h3>
              <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold"
                style={{ background: status.bg, color: status.color }}>
                <StatusIcon className="h-2.5 w-2.5" /> {status.label}
              </span>
              {s.version > 1 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: CV.surface, color: CV.gray }}>
                  v{s.version}
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
              <span className="text-xs flex items-center gap-1" style={{ color: CV.gray }}>
                <DollarSign className="h-3 w-3" /> {fmtCP(s.price)}
              </span>
              <span className="text-xs flex items-center gap-1" style={{ color: CV.gray }}>
                <Users className="h-3 w-3" /> {s.totalSales.toLocaleString()} sales
              </span>
              {s.status === 'approved' && (
                <span className="text-xs flex items-center gap-1" style={{ color: CV.green }}>
                  <TrendingUp className="h-3 w-3" /> {s.totalRevenue.toLocaleString()} CP revenue
                </span>
              )}
              {s.rating > 0 && (
                <Stars rating={s.rating} size={11} count={s.ratingCount} />
              )}
              <span className="text-xs" style={{ color: CV.gray }}>
                Updated {timeAgo(s.updatedAt)}
              </span>
            </div>

            {s.status === 'rejected' && s.rejectionReason && (
              <p className="text-xs mt-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.08)', color: CV.red, border: '1px solid rgba(239,68,68,0.15)' }}>
                Rejection reason: {s.rejectionReason}
              </p>
            )}
          </div>
        </div>

        {/* Action bar */}
        <div className="flex items-center gap-2 px-4 py-3 border-t" style={{ borderColor: CV.border }}>
          {s.status === 'approved' && (
            <button onClick={() => navigate(`/marketplace/${s.id}`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{ background: CV.surface, color: 'rgba(255,255,255,0.7)', border: `1px solid ${CV.border}` }}>
              <Eye className="h-3.5 w-3.5" /> View Listing
            </button>
          )}

          <button onClick={() => navigate(`/marketplace/edit/${s.id}`)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={{ background: CV.surface, color: 'rgba(255,255,255,0.7)', border: `1px solid ${CV.border}` }}>
            <Edit2 className="h-3.5 w-3.5" /> Edit
          </button>

          {s.status === 'approved' && (
            <button onClick={() => navigate(`/marketplace/analytics/${s.id}`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{ background: CV.surface, color: 'rgba(255,255,255,0.7)', border: `1px solid ${CV.border}` }}>
              <BarChart2 className="h-3.5 w-3.5" /> Analytics
            </button>
          )}

          {(s.status === 'draft' || s.status === 'rejected') && (
            <button
              onClick={() => submitForReview(s.id, user!.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{ background: CV.goldAlpha, color: CV.gold, border: `1px solid ${CV.goldBorder}` }}>
              Submit for Review
            </button>
          )}

          <button
            onClick={() => { if (confirm(`Delete "${s.name}"?`)) deleteStrategy(s.id, user!.id); }}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={{ background: 'rgba(239,68,68,0.08)', color: CV.red, border: '1px solid rgba(239,68,68,0.15)' }}>
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </div>
      </motion.div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ background: 'radial-gradient(ellipse 70% 50% at 90% 0%, rgba(255,215,0,0.05) 0%, transparent 70%), var(--background)' }}
    >
      {/* Header */}
      <header
        className="flex items-center justify-between px-6 py-4 border-b shrink-0 backdrop-blur-sm"
        style={{ borderColor: CV.goldBorder, background: 'var(--bg-secondary)' }}
      >
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/marketplace')} className="p-1.5 rounded-lg" style={{ color: CV.gray }}>
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
            style={{ background: CV.goldAlpha, border: `1px solid ${CV.goldBorder}` }}>👤</div>
          <div>
            <h1 className="text-lg font-bold text-foreground">My Strategies</h1>
            <p className="text-xs" style={{ color: CV.gray }}>{myStrategies.length} total strategies</p>
          </div>
        </div>
        <button
          onClick={() => navigate('/marketplace/create')}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all"
          style={{ background: 'linear-gradient(135deg, #FFD700 0%, #FFA800 100%)', color: '#0A1929' }}
        >
          <Plus className="h-4 w-4" /> Create New
        </button>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-8">

          {/* Earnings summary */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-foreground flex items-center gap-2">
                <DollarSign className="h-4 w-4" style={{ color: CV.gold }} /> Earnings Summary
              </h2>
              {totalRevenue > 0 && (
                <button
                  onClick={() => { setShowWithdraw(true); setWithdrawPhase('form'); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                  style={{ background: CV.goldAlpha, color: CV.gold, border: `1px solid ${CV.goldBorder}` }}>
                  <Download className="h-3.5 w-3.5" /> Withdraw to Wallet
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Total Revenue',      value: `${totalRevenue.toLocaleString()} CP`,             color: CV.gold },
                { label: 'Platform Fee (20%)', value: `${Math.round(totalRevenue * 0.20).toLocaleString()} CP`, color: CV.gray },
                { label: 'Your Earnings (80%)', value: `${Math.round(totalRevenue * 0.80).toLocaleString()} CP`, color: CV.green },
                { label: 'Total Sales',        value: totalSales.toLocaleString(),                       color: 'rgba(255,255,255,0.85)' },
              ].map(m => (
                <div key={m.label} className="rounded-2xl p-4" style={{ background: 'var(--bg-card)', border: `1px solid ${CV.border}` }}>
                  <p className="text-xs" style={{ color: CV.gray }}>{m.label}</p>
                  <p className="font-bold text-lg mt-1" style={{ color: m.color }}>{m.value}</p>
                </div>
              ))}
            </div>
          </section>

          {/* §9 Withdrawal history */}
          {showWithdraw && (
            <WithdrawModal
              balance={balance}
              amount={withdrawAmt}
              onAmountChange={setWithdrawAmt}
              phase={withdrawPhase}
              onWithdraw={async () => {
                setWithdrawPhase('loading');
                await new Promise(r => setTimeout(r, 900));
                setWithdrawPhase('done');
                setTimeout(() => setShowWithdraw(false), 1800);
              }}
              onClose={() => setShowWithdraw(false)}
            />
          )}

          {/* Published */}
          {published.length > 0 && (
            <section>
              <h2 className="font-bold text-foreground mb-3 flex items-center gap-2">
                <CheckCircle className="h-4 w-4" style={{ color: CV.green }} /> Published Strategies
                <span className="text-xs font-normal" style={{ color: CV.gray }}>({published.length})</span>
              </h2>
              <div className="space-y-3">
                {published.map(s => <StrategyRow key={s.id} s={s} />)}
              </div>
            </section>
          )}

          {/* Pending review */}
          {pending.length > 0 && (
            <section>
              <h2 className="font-bold text-foreground mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4" style={{ color: '#fbbf24' }} /> Under Review
                <span className="text-xs font-normal" style={{ color: CV.gray }}>({pending.length})</span>
              </h2>
              <div className="space-y-3">
                {pending.map(s => <StrategyRow key={s.id} s={s} />)}
              </div>
            </section>
          )}

          {/* Drafts */}
          {drafts.length > 0 && (
            <section>
              <h2 className="font-bold text-foreground mb-3 flex items-center gap-2">
                <Edit2 className="h-4 w-4" style={{ color: CV.gray }} /> Drafts & Rejected
                <span className="text-xs font-normal" style={{ color: CV.gray }}>({drafts.length})</span>
              </h2>
              <div className="space-y-3">
                {drafts.map(s => <StrategyRow key={s.id} s={s} />)}
              </div>
            </section>
          )}

          {/* Empty */}
          {myStrategies.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="text-5xl">📊</div>
              <p className="font-semibold text-foreground">No strategies yet</p>
              <p className="text-sm" style={{ color: CV.gray }}>Create and publish your first trading strategy</p>
              <button
                onClick={() => navigate('/marketplace/create')}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold transition-all"
                style={{ background: CV.goldAlpha, color: CV.gold, border: `1px solid ${CV.goldBorder}` }}
              >
                <Plus className="h-4 w-4" /> Create First Strategy
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Withdrawal modal ──────────────────────────────────────────────────────────

interface WithdrawProps {
  balance: number;
  amount: number;
  onAmountChange: (v: number) => void;
  phase: 'form' | 'loading' | 'done';
  onWithdraw: () => void;
  onClose: () => void;
}

function WithdrawModal({ balance, amount, onAmountChange, phase, onWithdraw, onClose }: WithdrawProps) {
  const PRESETS = [500, 1_000, 2_500, 5_000].filter(p => p <= balance);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

        <motion.div initial={{ scale: 0.93, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }}
          className="relative w-full max-w-sm rounded-2xl overflow-hidden z-10 bg-card border border-border shadow-2xl">

          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: CV.goldBorder }}>
            <div className="flex items-center gap-2">
              <Download className="h-5 w-5" style={{ color: CV.gold }} />
              <p className="font-bold text-foreground">Withdraw to Wallet</p>
            </div>
            <button onClick={onClose} style={{ color: CV.gray }}><X className="h-4 w-4" /></button>
          </div>

          <AnimatePresence mode="wait">
            {phase === 'form' && (
              <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-5 space-y-4">
                <p className="text-xs text-muted-foreground">Available: <strong style={{ color: CV.gold }}>{balance.toLocaleString()} CP</strong></p>

                {PRESETS.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {PRESETS.map(p => (
                      <button key={p} onClick={() => onAmountChange(p)}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                        style={{
                          background: amount === p ? CV.goldAlpha : CV.surface,
                          color:      amount === p ? CV.gold      : CV.gray,
                          border:     `1px solid ${amount === p ? CV.goldBorder : CV.border}`,
                        }}>
                        {p.toLocaleString()} CP
                      </button>
                    ))}
                    <button onClick={() => onAmountChange(balance)}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                      style={{
                        background: amount === balance ? CV.goldAlpha : CV.surface,
                        color:      amount === balance ? CV.gold      : CV.gray,
                        border:     `1px solid ${amount === balance ? CV.goldBorder : CV.border}`,
                      }}>
                      All ({balance.toLocaleString()})
                    </button>
                  </div>
                )}

                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Custom Amount</label>
                  <input type="number" min={100} max={balance} step={100} value={amount}
                    onChange={e => onAmountChange(Math.min(balance, Math.max(0, +e.target.value)))}
                    className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none"
                    style={{ background: CV.surface, border: `1px solid ${CV.border}`, color: 'rgba(255,255,255,0.85)' }} />
                </div>

                <div className="text-xs p-3 rounded-xl" style={{ background: CV.surface, border: `1px solid ${CV.border}` }}>
                  <p className="text-muted-foreground">Withdrawing <strong style={{ color: CV.gold }}>{amount.toLocaleString()} CP</strong> to your CP Coins wallet.</p>
                  <p className="text-muted-foreground mt-1">Processing time: instant · No withdrawal fee.</p>
                </div>

                <div className="flex gap-3">
                  <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                    style={{ background: CV.surface, color: CV.gray, border: `1px solid ${CV.border}` }}>
                    Cancel
                  </button>
                  <button onClick={onWithdraw} disabled={amount <= 0 || amount > balance}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40"
                    style={{ background: 'linear-gradient(135deg,#FFD700,#FFA800)', color: '#0A1929' }}>
                    <Download className="h-4 w-4" /> Withdraw
                  </button>
                </div>
              </motion.div>
            )}

            {phase === 'loading' && (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex flex-col items-center py-14 gap-3">
                <Loader2 className="h-10 w-10 animate-spin" style={{ color: CV.gold }} />
                <p className="text-sm text-muted-foreground">Processing withdrawal…</p>
              </motion.div>
            )}

            {phase === 'done' && (
              <motion.div key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center py-14 gap-3">
                <CheckCircle className="h-12 w-12" style={{ color: CV.green }} />
                <p className="font-bold text-foreground">Withdrawal Successful!</p>
                <p className="text-xs text-muted-foreground">{amount.toLocaleString()} CP added to your wallet.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
