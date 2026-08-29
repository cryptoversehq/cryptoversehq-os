/**
 * MyFollowingPage.tsx — /copy-trading/following
 * Active copies, paused copies, and stopped copy history.
 */
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Users, Play, Pause, StopCircle, Settings2,
  ChevronRight, PlusCircle, TrendingUp, TrendingDown, Clock,
} from 'lucide-react';
import { useCopyTradingStore } from '../../lib/copyTradingStore';
import { useAuthStore } from '../../lib/authStore';
import { CopyRelationship, TopTrader } from '../../lib/copyTradingTypes';
import { CopySettingsModal } from './CopySettingsModal';
import { TraderDetailModal } from './TraderDetailModal';
import { CTV, fmtUsd, fmtPct, relWinRate, lastFiveTrades, timeAgo, MIN_COPY_LEVEL } from './CopyTradingUtils';

const DEMO_LEVEL = 5;

export function MyFollowingPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const userId   = user?.id ?? 'demo_follower';

  const getActiveRelationships  = useCopyTradingStore(s => s.getActiveRelationships);
  const getPausedRelationships  = useCopyTradingStore(s => s.getPausedRelationships);
  const getStoppedRelationships = useCopyTradingStore(s => s.getStoppedRelationships);
  const getTopTraders           = useCopyTradingStore(s => s.getTopTraders);
  const pauseCopying            = useCopyTradingStore(s => s.pauseCopying);
  const resumeCopying           = useCopyTradingStore(s => s.resumeCopying);
  const stopCopying             = useCopyTradingStore(s => s.stopCopying);
  const traders                 = useCopyTradingStore(s => s.traders);

  const [adjustRelId,      setAdjustRelId]      = useState<string | null>(null);
  const [detailTraderId,   setDetailTraderId]    = useState<string | null>(null);
  const [confirmStopRelId, setConfirmStopRelId]  = useState<string | null>(null);

  const activeRels  = useMemo(() => getActiveRelationships(userId),  [userId, traders]);
  const pausedRels  = useMemo(() => getPausedRelationships(userId),  [userId, traders]);
  const stoppedRels = useMemo(() => getStoppedRelationships(userId), [userId, traders]);
  const topTraders  = useMemo(() => getTopTraders(), [traders]);

  function getTrader(id: string) { return topTraders.find(t => t.id === id); }

  const selectedDetailTrader = detailTraderId ? getTrader(detailTraderId) ?? null : null;
  const adjustRel = adjustRelId ? [...activeRels, ...pausedRels].find(r => r.id === adjustRelId) ?? null : null;
  const adjustTrader = adjustRel ? getTrader(adjustRel.traderId) ?? null : null;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 border-b shrink-0"
        style={{ borderColor: CTV.goldBorder, background: 'var(--bg-card)' }}>
        <button onClick={() => navigate('/copy-trading')}
          className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: CTV.gray }}>
          <ArrowLeft className="h-3.5 w-3.5" /> Copy Trading
        </button>
        <h1 className="font-bold text-foreground flex items-center gap-2">
          <Users className="h-4 w-4" style={{ color: CTV.gold }} /> My Following
        </h1>
        <button onClick={() => navigate('/copy-trading')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold"
          style={{ background: CTV.goldAlpha, color: CTV.gold, border: `1px solid ${CTV.goldBorder}` }}>
          <PlusCircle className="h-3.5 w-3.5" /> Add New
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-8">

          {/* ── Active ── */}
          <section>
            <h2 className="font-bold text-foreground mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              Active Copies <span className="text-xs font-normal" style={{ color: CTV.gray }}>({activeRels.length})</span>
            </h2>
            {activeRels.length === 0 ? (
              <EmptyState text="No active copies. Start copying a trader from the main page." />
            ) : (
              <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${CTV.border}` }}>
                <TableHeader cols={['Trader', 'Copy %', 'Invested', 'Profit', 'Win Rate', 'Actions']} />
                {activeRels.map((rel, i) => (
                  <RelRow key={rel.id} rel={rel} trader={getTrader(rel.traderId)} isLast={i === activeRels.length - 1}
                    onDetail={() => setDetailTraderId(rel.traderId)}
                    onAdjust={() => setAdjustRelId(rel.id)}
                    onPause={() => pauseCopying(rel.id, 'manual')}
                    onStop={() => setConfirmStopRelId(rel.id)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* ── Paused ── */}
          {pausedRels.length > 0 && (
            <section>
              <h2 className="font-bold text-foreground mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-yellow-400" />
                Paused Copies <span className="text-xs font-normal" style={{ color: CTV.gray }}>({pausedRels.length})</span>
              </h2>
              <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${CTV.border}` }}>
                <TableHeader cols={['Trader', 'Copy %', 'Invested', 'Profit', 'Pause Reason', 'Actions']} />
                {pausedRels.map((rel, i) => (
                  <RelRow key={rel.id} rel={rel} trader={getTrader(rel.traderId)} isLast={i === pausedRels.length - 1}
                    isPaused
                    onDetail={() => setDetailTraderId(rel.traderId)}
                    onAdjust={() => setAdjustRelId(rel.id)}
                    onResume={() => resumeCopying(rel.id)}
                    onStop={() => setConfirmStopRelId(rel.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* ── History ── */}
          {stoppedRels.length > 0 && (
            <section>
              <h2 className="font-bold text-foreground mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4" style={{ color: CTV.gray }} />
                Copy History <span className="text-xs font-normal" style={{ color: CTV.gray }}>({stoppedRels.length} previously followed)</span>
              </h2>
              <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: `1px solid ${CTV.border}` }}>
                {stoppedRels.map((rel, i) => (
                  <div key={rel.id} className="flex items-center gap-4 px-4 py-3 text-sm"
                    style={{ borderBottom: i < stoppedRels.length - 1 ? `1px solid ${CTV.border}` : 'none' }}>
                    <span className="w-2 h-2 rounded-full bg-gray-500 shrink-0" />
                    <span className="font-semibold text-foreground flex-1">{rel.traderName}</span>
                    <span className="text-xs" style={{ color: CTV.gray }}>
                      Followed for {rel.stoppedAt ? Math.round((new Date(rel.stoppedAt).getTime() - new Date(rel.startedAt).getTime()) / 86_400_000) : 0}d
                    </span>
                    <span className="font-bold text-sm" style={{ color: rel.totalProfitUsd >= 0 ? CTV.green : CTV.red }}>
                      {fmtUsd(rel.totalProfitUsd)}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: CTV.surface, color: CTV.gray }}>Stopped</span>
                  </div>
                ))}
              </div>
            </section>
          )}

        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {selectedDetailTrader && (
          <TraderDetailModal
            trader={selectedDetailTrader}
            relationship={[...activeRels, ...pausedRels].find(r => r.traderId === selectedDetailTrader.id)}
            followerId={userId}
            userLevel={DEMO_LEVEL}
            minLevel={MIN_COPY_LEVEL}
            onClose={() => setDetailTraderId(null)}
            onCopied={() => setDetailTraderId(null)}
          />
        )}
      </AnimatePresence>

      {adjustRel && adjustTrader && (
        <CopySettingsModal
          trader={adjustTrader}
          existingRelId={adjustRel.id}
          initialSettings={adjustRel.settings}
          followerId={userId}
          onClose={() => setAdjustRelId(null)}
          onSuccess={() => setAdjustRelId(null)}
        />
      )}

      <AnimatePresence>
        {confirmStopRelId && (
          <>
            <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm" onClick={() => setConfirmStopRelId(null)} />
            <motion.div initial={{ scale: 0.93, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.93, opacity: 0 }}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 sm:inset-auto sm:left-1/2 sm:-translate-x-1/2 sm:top-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-sm z-[85] rounded-2xl p-6 space-y-4"
              style={{ background: '#0A1929', border: `1px solid ${CTV.redBorder}` }}>
              <p className="font-bold text-foreground">Stop Copying?</p>
              <p className="text-sm text-muted-foreground">Future trades from this trader will no longer be mirrored.</p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmStopRelId(null)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ background: CTV.surface, color: CTV.gray, border: `1px solid ${CTV.border}` }}>Cancel</button>
                <button onClick={() => { stopCopying(confirmStopRelId!); setConfirmStopRelId(null); }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold"
                  style={{ background: CTV.redAlpha, color: CTV.red, border: `1px solid ${CTV.redBorder}` }}>Stop Copying</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function TableHeader({ cols }: { cols: string[] }) {
  return (
    <div className={`grid gap-2 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider`}
      style={{
        gridTemplateColumns: `2fr repeat(${cols.length - 1}, 1fr)`,
        background: 'var(--bg-secondary)', color: CTV.gray, borderBottom: `1px solid ${CTV.border}`,
      }}>
      {cols.map(c => <span key={c}>{c}</span>)}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-center py-10 rounded-2xl" style={{ background: CTV.surface, border: `1px solid ${CTV.border}` }}>
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

interface RelRowProps {
  rel: CopyRelationship;
  trader?: TopTrader;
  isLast: boolean;
  isPaused?: boolean;
  onDetail: () => void;
  onAdjust: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onStop: () => void;
}

function RelRow({ rel, trader, isLast, isPaused, onDetail, onAdjust, onPause, onResume, onStop }: RelRowProps) {
  const winRate  = relWinRate(rel);
  const profitOk = rel.totalProfitUsd >= 0;

  return (
    <div className="flex items-center gap-2 px-4 py-3 text-sm"
      style={{ background: 'var(--bg-card)', borderBottom: isLast ? 'none' : `1px solid ${CTV.border}` }}>
      {/* Name */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold uppercase shrink-0"
          style={{ background: CTV.goldAlpha, color: CTV.gold, border: `1px solid ${CTV.goldBorder}` }}>
          {rel.traderName.slice(0, 2)}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-foreground truncate">{rel.traderName}</p>
          {isPaused && rel.pauseReason && (
            <p className="text-[10px]" style={{ color: '#fbbf24' }}>
              {rel.pauseReason === 'daily_loss_limit' ? 'Daily loss limit reached' : 'Manually paused'}
            </p>
          )}
        </div>
      </div>

      {/* Stats */}
      <span className="text-xs font-bold text-foreground shrink-0 w-12 text-center">{rel.settings.copyPct}%</span>
      <span className="text-xs shrink-0 w-20 text-center" style={{ color: CTV.gray }}>{fmtUsd(rel.totalInvestedUsd)}</span>
      <span className="text-xs font-bold shrink-0 w-16 text-center" style={{ color: profitOk ? CTV.green : CTV.red }}>
        {fmtUsd(rel.totalProfitUsd)}
      </span>
      <span className="text-xs shrink-0 w-14 text-center" style={{ color: winRate >= 60 ? CTV.green : CTV.gray }}>
        {winRate}%
      </span>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <IBtn icon={<ChevronRight className="h-3 w-3" />} label="Details" onClick={onDetail} />
        <IBtn icon={<Settings2 className="h-3 w-3" />} label="Adjust" onClick={onAdjust} />
        {isPaused
          ? <IBtn icon={<Play className="h-3 w-3" />} label="Resume" onClick={onResume!} color={CTV.green} />
          : <IBtn icon={<Pause className="h-3 w-3" />} label="Pause" onClick={onPause!} />
        }
        <IBtn icon={<StopCircle className="h-3 w-3" />} label="Stop" onClick={onStop} color={CTV.red} />
      </div>
    </div>
  );
}

function IBtn({ icon, label, onClick, color }: { icon: React.ReactNode; label: string; onClick: () => void; color?: string }) {
  return (
    <button onClick={onClick} title={label}
      className="p-1.5 rounded-lg transition-all hover:opacity-80"
      style={{ background: CTV.surface, color: color ?? CTV.gray, border: `1px solid ${CTV.border}` }}>
      {icon}
    </button>
  );
}
