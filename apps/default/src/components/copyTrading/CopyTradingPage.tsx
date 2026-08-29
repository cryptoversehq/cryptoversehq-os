/**
 * CopyTradingPage.tsx — /copy-trading
 * Main hub: stats, top traders leaderboard, my following, my followers section.
 */
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw, Users, TrendingUp, Star, BarChart2,
  Trophy, ChevronRight, Play, Pause, StopCircle, Settings2, History,
  PlusCircle, AlertTriangle,
} from 'lucide-react';
import { useCopyTradingStore } from '../../lib/copyTradingStore';
import { useAuthStore } from '../../lib/authStore';
import { TopTrader, CopyRelationship } from '../../lib/copyTradingTypes';
import { TraderCard } from './TraderCard';
import { TraderDetailModal } from './TraderDetailModal';
import { CopySettingsModal } from './CopySettingsModal';
import { CTV, fmtUsd, fmtPct, timeAgo, relWinRate, lastFiveTrades, MIN_COPY_LEVEL } from './CopyTradingUtils';
import { LiveTradeSimulator } from './LiveTradeSimulator';
import { CopyGuide } from './CopyGuide';
import { useCopyTradingNotifications } from '../../hooks/useCopyTradingNotifications';
import { useAIRecommenderStore } from '../../lib/aiRecommenderStore';
import { useSubscriptionAccess } from '@/hooks/useSubscriptionAccess';
import { toast } from 'sonner';

// ─────────────────────────────────────────────────────────────────────────────

const DEMO_LEVEL = 5;  // demo user level for access gates

export function CopyTradingPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { hasAccess: canCopy } = useSubscriptionAccess('pro');

  const getTopTraders          = useCopyTradingStore(s => s.getTopTraders);
  const getActiveRelationships = useCopyTradingStore(s => s.getActiveRelationships);
  const getPausedRelationships = useCopyTradingStore(s => s.getPausedRelationships);
  const getMyExecutions        = useCopyTradingStore(s => s.getMyExecutions);
  const isFollowing            = useCopyTradingStore(s => s.isFollowing);
  const getRelationshipWith    = useCopyTradingStore(s => s.getRelationshipWith);
  const pauseCopying           = useCopyTradingStore(s => s.pauseCopying);
  const resumeCopying          = useCopyTradingStore(s => s.resumeCopying);
  const stopCopying            = useCopyTradingStore(s => s.stopCopying);
  const getTraderEarnings      = useCopyTradingStore(s => s.getTraderEarnings);
  const traders                = useCopyTradingStore(s => s.traders);

  // Use a consistent demo user id so seeded relationships show up
  const userId = user?.id ?? 'demo_follower';
  const userLevel = DEMO_LEVEL;

  // §6 — Activate full notification system (diff-watcher + digest)
  useCopyTradingNotifications({ userId, digestInterval: 30 * 60 * 1_000 });

  // §4 — AI Recommendations
  const aiRecs        = useAIRecommenderStore(s => s.getRecommendationsByType);
  const seedUser      = useAIRecommenderStore(s => s.seedUser);

  // Seed AI recommender for this user
  React.useEffect(() => { seedUser(userId); }, [userId, seedUser]);

  const traderRecs = useMemo(() => aiRecs(userId, 'trader', 5), [userId, aiRecs]);

  const [selectedTrader,    setSelectedTrader]    = useState<TopTrader | null>(null);
  const [copyTrader,        setCopyTrader]         = useState<TopTrader | null>(null);
  const [adjustRelId,       setAdjustRelId]        = useState<string | null>(null);
  const [confirmStopRelId,  setConfirmStopRelId]   = useState<string | null>(null);

  const topTraders  = useMemo(() => getTopTraders(), [traders]);
  const activeRels  = useMemo(() => getActiveRelationships(userId), [userId]);
  const pausedRels  = useMemo(() => getPausedRelationships(userId), [userId]);
  const myExecs     = useMemo(() => getMyExecutions(userId), [userId]);

  // My stats
  const totalProfit    = [...activeRels, ...pausedRels].reduce((s, r) => s + r.totalProfitUsd, 0);
  const totalCopied    = [...activeRels, ...pausedRels].reduce((s, r) => s + r.totalCopiedTrades, 0);
  const avgCopyPct     = activeRels.length > 0
    ? Math.round(activeRels.reduce((s, r) => s + r.settings.copyPct, 0) / activeRels.length)
    : 0;
  const bestRel        = [...activeRels, ...pausedRels].sort((a, b) => b.totalProfitUsd - a.totalProfitUsd)[0];
  const bestTrader     = bestRel ? topTraders.find(t => t.id === bestRel.traderId) : null;
  const bestProfit     = bestRel ? fmtUsd(bestRel.totalProfitUsd) : '—';

  // My follower stats (is this user also a top trader?)
  const myTraderProfile = Object.values(traders).find(t => t.userId === userId);
  const followerEarnings = myTraderProfile ? getTraderEarnings(myTraderProfile.id) : null;

  // §3 — CopyGuide: show on first visit, dismiss to localStorage
  const COPY_GUIDE_KEY = 'cv_copy_guide_dismissed';
  const [showGuide, setShowGuide] = useState(() => {
    try {
      return localStorage.getItem(COPY_GUIDE_KEY) !== 'true';
    } catch {
      return true;
    }
  });

  function dismissGuide() {
    try {
      localStorage.setItem(COPY_GUIDE_KEY, 'true');
    } catch {}
    setShowGuide(false);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--background)]">
      {/* ── Header ── */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 border-b shrink-0 backdrop-blur-sm"
        style={{ borderColor: CTV.goldBorder, background: 'var(--bg-card)' }}>
        <div className="flex items-center gap-2.5">
          <RefreshCw className="h-5 w-5" style={{ color: CTV.gold }} />
          <h1 className="font-bold text-foreground">Copy Trading</h1>
          <span className="text-[10px] px-2 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-md font-medium">
            🧪 Demo Data
          </span>
          {userLevel < MIN_COPY_LEVEL && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
              style={{ background: CTV.redAlpha, color: CTV.red, border: `1px solid ${CTV.redBorder}` }}>
              Level {MIN_COPY_LEVEL}+ required
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/copy-trading/history')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
            style={{ background: CTV.surface, color: CTV.gray, border: `1px solid ${CTV.border}` }}>
            <History className="h-3.5 w-3.5" /> History
          </button>
          <button onClick={() => navigate('/copy-trading/following')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
            style={{ background: CTV.surface, color: CTV.gray, border: `1px solid ${CTV.border}` }}>
            <Users className="h-3.5 w-3.5" /> My Following
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-8">

          {/* §3 — Beginner education guide on first visit */}
          {showGuide && (
            <CopyGuide onDismiss={dismissGuide} />
          )}

          {/* Level gate banner */}
          {userLevel < MIN_COPY_LEVEL && (
            <div className="flex items-start gap-3 p-4 rounded-2xl" style={{ background: CTV.redAlpha, border: `1px solid ${CTV.redBorder}` }}>
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" style={{ color: CTV.red }} />
              <div>
                <p className="font-bold text-foreground">Academy Level {MIN_COPY_LEVEL} Required</p>
                <p className="text-xs mt-0.5 text-muted-foreground">Complete Academy courses to unlock Copy Trading. Your current level: {userLevel}.</p>
              </div>
            </div>
          )}

          {/* ── My Copy Stats ── */}
          <section>
            <SectionHeader icon={<BarChart2 className="h-4 w-4" style={{ color: CTV.gold }} />} title="My Copy Stats" />
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: 'Following',       value: activeRels.length.toString(),   sub: 'active traders',  color: CTV.gold },
                { label: 'Total Copied',    value: totalCopied.toLocaleString(),   sub: 'trades',          color: 'var(--text-primary)' },
                { label: 'Total Profit',    value: fmtUsd(totalProfit),             sub: 'net PnL',        color: totalProfit >= 0 ? CTV.green : CTV.red },
                { label: 'Avg Copy %',      value: `${avgCopyPct}%`,               sub: 'of position',    color: CTV.gold },
                { label: 'Best Trader',     value: bestTrader?.displayName ?? '—', sub: bestProfit,        color: CTV.green },
              ].map(m => (
                <div key={m.label} className="rounded-2xl p-4" style={{ background: 'var(--bg-card)', border: `1px solid ${CTV.border}` }}>
                  <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: CTV.gray }}>{m.label}</p>
                  <p className="font-bold text-base leading-tight truncate" style={{ color: m.color }}>{m.value}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: CTV.gray }}>{m.sub}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── Top Traders ── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <SectionHeader icon={<Trophy className="h-4 w-4" style={{ color: CTV.gold }} />} title="Top Traders to Copy" />
              <button onClick={() => navigate('/copy-trading/following')}
                className="flex items-center gap-1 text-xs" style={{ color: CTV.gray }}>
                Browse all <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: `1px solid ${CTV.border}` }}>
              {/* Table header */}
              <div className="hidden sm:grid grid-cols-5 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider"
                style={{ background: 'var(--bg-secondary)', color: CTV.gray, borderBottom: `1px solid ${CTV.border}` }}>
                <span className="col-span-2">Trader</span>
                <span>Win Rate</span>
                <span>Profit</span>
                <span className="text-right">Action</span>
              </div>
              {topTraders.map(t => (
                <TraderCard
                  key={t.id}
                  trader={t}
                  isFollowing={isFollowing(userId, t.id)}
                  onCopy={tr => {
                    if (!canCopy) {
                      toast('Copy Trading requires Pro subscription.', {
                        description: 'Upgrade to unlock copy trading.',
                        action: { label: 'Upgrade', onClick: () => navigate('/subscription?plan=pro') },
                        duration: 6000,
                      });
                      return;
                    }
                    setCopyTrader(tr);
                  }}
                  onViewDetails={(t) => { setSelectedTrader(t); navigate(`/copy-trading/trader/${t.id}`); }}
                />
              ))}
            </div>
          </section>

          {/* §4 — 🤖 AI Recommended for You */}
          {traderRecs.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <SectionHeader icon={<span className="text-lg">🤖</span>} title="Recommended for You" />
              </div>
              <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: `1px solid ${CTV.border}` }}>
                <div className="grid grid-cols-5 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider"
                  style={{ background: 'var(--bg-secondary)', color: CTV.gray, borderBottom: `1px solid ${CTV.border}` }}>
                  <span className="col-span-2">Trader</span>
                  <span>Win Rate</span>
                  <span>Profit</span>
                  <span className="text-right">Action</span>
                </div>
                {traderRecs.map(rec => {
                  const recTrader = topTraders.find(t => t.id === rec.targetId);
                  if (!recTrader) return null;
                  return (
                    <TraderCard
                      key={rec.id}
                      trader={recTrader}
                      isFollowing={isFollowing(userId, recTrader.id)}
                      onCopy={tr => {
                        if (!canCopy) {
                          toast('Copy Trading requires Pro subscription.', {
                            description: 'Upgrade to unlock copy trading.',
                            action: { label: 'Upgrade', onClick: () => navigate('/subscription?plan=pro') },
                            duration: 6000,
                          });
                          return;
                        }
                        setCopyTrader(tr);
                      }}
                      onViewDetails={(t) => { setSelectedTrader(t); navigate(`/copy-trading/trader/${t.id}`); }}
                    />
                  );
                })}
              </div>
              <p className="text-[10px] mt-1" style={{ color: CTV.gray }}>
                Based on your copy history and preferences. <button onClick={() => navigate('/copy-trading/following')} className="underline hover:text-foreground">Browse all</button>
              </p>
            </section>
          )}

          {/* ── My Following ── */}
          {(activeRels.length > 0 || pausedRels.length > 0) && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <SectionHeader icon={<Users className="h-4 w-4 text-blue-400" />} title="My Following (Active)" />
                <button onClick={() => navigate('/copy-trading/following')}
                  className="flex items-center gap-1 text-xs" style={{ color: CTV.gray }}>
                  View all <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="space-y-3">
                {activeRels.slice(0, 4).map(rel => (
                  <FollowingCard
                    key={rel.id} rel={rel}
                    trader={topTraders.find(t => t.id === rel.traderId)}
                    onViewDetails={() => { const t = topTraders.find(x => x.id === rel.traderId); if (t) setSelectedTrader(t); }}
                    onAdjust={() => setAdjustRelId(rel.id)}
                    onPause={() => pauseCopying(rel.id, 'manual')}
                    onResume={() => resumeCopying(rel.id)}
                    onStop={() => setConfirmStopRelId(rel.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* ── My Followers (trader role) ── */}
          {followerEarnings && (
            <section>
              <SectionHeader icon={<Star className="h-4 w-4" style={{ color: CTV.gold }} />} title="My Followers" />
              <div className="rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                style={{ background: CTV.goldAlpha, border: `1px solid ${CTV.goldBorder}` }}>
                <div>
                  <p className="font-bold text-foreground text-lg">👥 You have <strong style={{ color: CTV.gold }}>{followerEarnings.totalFollowers.toLocaleString()}</strong> followers!</p>
                  <p className="text-sm text-muted-foreground mt-1">Total earnings from profit share: <strong style={{ color: CTV.gold }}>{followerEarnings.totalCP.toLocaleString()} CP</strong></p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => navigate('/copy-trading/followers')}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold"
                    style={{ background: CTV.goldAlpha, color: CTV.gold, border: `1px solid ${CTV.goldBorder}` }}>
                    View Follower Analytics
                  </button>
                </div>
              </div>
            </section>
          )}

        </div>
      </div>

      {/* ── Trader Detail Modal ── */}
      <AnimatePresence>
        {selectedTrader && (
          <TraderDetailModal
            trader={selectedTrader}
            relationship={getRelationshipWith(userId, selectedTrader.id)}
            followerId={userId}
            userLevel={userLevel}
            minLevel={MIN_COPY_LEVEL}
            onClose={() => setSelectedTrader(null)}
            onCopied={() => setSelectedTrader(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Copy Settings Modal (quick-start) ── */}
      {copyTrader && (
        <CopySettingsModal
          trader={copyTrader}
          followerId={userId}
          onClose={() => setCopyTrader(null)}
          onSuccess={() => setCopyTrader(null)}
        />
      )}

      {/* ── Adjust Rel Settings Modal ── */}
      {adjustRelId && (() => {
        const rel    = activeRels.find(r => r.id === adjustRelId) ?? pausedRels.find(r => r.id === adjustRelId);
        const trader = rel ? topTraders.find(t => t.id === rel.traderId) : null;
        if (!rel || !trader) return null;
        return (
          <CopySettingsModal
            trader={trader}
            existingRelId={rel.id}
            initialSettings={rel.settings}
            followerId={userId}
            onClose={() => setAdjustRelId(null)}
            onSuccess={() => setAdjustRelId(null)}
          />
        );
      })()}

      {/* ── Confirm Stop Modal ── */}
      <AnimatePresence>
        {confirmStopRelId && (
          <ConfirmStopModal
            onConfirm={() => { stopCopying(confirmStopRelId); setConfirmStopRelId(null); }}
            onCancel={() => setConfirmStopRelId(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Live Engine Simulator widget ── */}
      <LiveTradeSimulator />
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {icon}
      <h2 className="font-bold text-foreground">{title}</h2>
    </div>
  );
}

interface FollowingCardProps {
  rel: CopyRelationship;
  trader?: TopTrader;
  onViewDetails: () => void;
  onAdjust: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

function FollowingCard({ rel, trader, onViewDetails, onAdjust, onPause, onResume, onStop }: FollowingCardProps) {
  const winRate = relWinRate(rel);
  const lastFive = lastFiveTrades(rel);
  const isActive = rel.status === 'active';
  const profitPos = rel.totalProfitUsd >= 0;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-4" style={{ background: 'var(--bg-card)', border: `1px solid ${CTV.border}` }}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        {/* Name + status */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold uppercase shrink-0"
            style={{ background: CTV.goldAlpha, color: CTV.gold, border: `1px solid ${CTV.goldBorder}` }}>
            {rel.traderName.slice(0, 2)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-bold text-foreground truncate">{rel.traderName}</p>
              <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                style={{
                  background: isActive ? CTV.greenAlpha : 'rgba(251,191,36,0.12)',
                  color:      isActive ? CTV.green      : '#fbbf24',
                  border:     `1px solid ${isActive ? CTV.greenBorder : 'rgba(251,191,36,0.25)'}`,
                }}>
                <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-400' : 'bg-yellow-400'}`} />
                {isActive ? 'Active' : 'Paused'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-1 text-xs" style={{ color: CTV.gray }}>
              <span>Copy: <strong className="text-foreground">{rel.settings.copyPct}%</strong></span>
              <span>Profit: <strong style={{ color: profitPos ? CTV.green : CTV.red }}>{fmtUsd(rel.totalProfitUsd)}</strong></span>
              <span>Win: <strong className="text-foreground">{winRate}%</strong></span>
            </div>
          </div>
        </div>

        {/* Last 5 trades */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] mr-1" style={{ color: CTV.gray }}>Last 5:</span>
          {lastFive.map((r, i) => (
            <span key={i} className="text-sm">
              {r === 'win' ? '✅' : r === 'loss' ? '❌' : '⏳'}
            </span>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <ActionBtn icon={<ChevronRight className="h-3.5 w-3.5" />} label="Details" onClick={onViewDetails} />
          <ActionBtn icon={<Settings2 className="h-3.5 w-3.5" />} label="Adjust" onClick={onAdjust} />
          {isActive
            ? <ActionBtn icon={<Pause className="h-3.5 w-3.5" />} label="Pause" onClick={onPause} />
            : <ActionBtn icon={<Play className="h-3.5 w-3.5" />} label="Resume" onClick={onResume} />
          }
          <ActionBtn icon={<StopCircle className="h-3.5 w-3.5" />} label="Stop" onClick={onStop} color={CTV.red} />
        </div>
      </div>
    </motion.div>
  );
}

function ActionBtn({ icon, label, onClick, color }: { icon: React.ReactNode; label: string; onClick: () => void; color?: string }) {
  return (
    <button onClick={onClick} title={label}
      className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all hover:opacity-80"
      style={{ background: CTV.surface, color: color ?? CTV.gray, border: `1px solid ${CTV.border}` }}>
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function ConfirmStopModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <motion.div initial={{ scale: 0.93, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.93, opacity: 0 }}
        className="fixed inset-x-4 top-1/2 -translate-y-1/2 sm:inset-auto sm:left-1/2 sm:-translate-x-1/2 sm:top-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-sm z-[85] rounded-2xl p-6 space-y-4"
        style={{ background: 'var(--bg-card)', border: `1px solid ${CTV.redBorder}` }}>
        <div className="flex items-center gap-3">
          <StopCircle className="h-6 w-6" style={{ color: CTV.red }} />
          <p className="font-bold text-foreground">Stop Copying?</p>
        </div>
        <p className="text-sm text-muted-foreground">All future trades from this trader will no longer be copied. Existing positions remain open.</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: CTV.surface, color: CTV.gray, border: `1px solid ${CTV.border}` }}>
            Cancel
          </button>
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-xl text-sm font-bold"
            style={{ background: CTV.redAlpha, color: CTV.red, border: `1px solid ${CTV.redBorder}` }}>
            Stop Copying
          </button>
        </div>
      </motion.div>
    </>
  );
}
