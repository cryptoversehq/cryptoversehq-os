/**
 * EventResultsPanel.tsx
 * Shows per-event results: final rank, prize receipt (CP + XP + badges),
 * and the claim button powered by §4.3 PrizeDistributor.
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trophy, Star, Award, ChevronDown, ChevronUp,
  Gift, Sparkles, TrendingUp,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useEventsStore } from './eventStore';
import { useAuthStore } from '../../lib/authStore';
import { LiveEvent } from './eventTypes';
import { prizeDistributor } from './eventBusinessLogic';
import { fmtUsd, fmtNum, fmtPct } from './eventUtils';

// ── Confetti burst (CSS-only) ─────────────────────────────────────────────────

function ConfettiDot({ color, style }: { color: string; style: React.CSSProperties }) {
  return (
    <motion.div
      initial={{ opacity: 1, scale: 1, y: 0, x: 0, rotate: 0 }}
      animate={{ opacity: 0, scale: 0.3, y: -80 + Math.random() * 40, x: (Math.random() - 0.5) * 100, rotate: 360 }}
      transition={{ duration: 1.2, ease: 'easeOut' }}
      className="absolute w-2 h-2 rounded-full pointer-events-none"
      style={{ background: color, ...style }}
    />
  );
}

// ── Prize receipt card ─────────────────────────────────────────────────────────

interface PrizeReceiptProps {
  rank:        number;
  cpAmount:    number;
  xpAmount:    number;
  badges:      string[];
  accentColor: string;
  claimed:     boolean;
  onClaim:     () => void;
}

function PrizeReceipt({ rank, cpAmount, xpAmount, badges, accentColor, claimed, onClaim }: PrizeReceiptProps) {
  const [showConfetti, setShowConfetti] = useState(false);
  const confettiColors = ['#6366f1','#f59e0b','#22c55e','#ec4899','#06b6d4'];

  function handleClaim() {
    setShowConfetti(true);
    onClaim();
    setTimeout(() => setShowConfetti(false), 1500);
  }

  return (
    <div className="relative overflow-hidden rounded-2xl p-5"
      style={{ background: `${accentColor}08`, border: `1px solid ${accentColor}25` }}>

      {/* Confetti */}
      <AnimatePresence>
        {showConfetti && confettiColors.map((c, i) => (
          <ConfettiDot key={i} color={c} style={{ left: `${20 + i * 15}%`, top: '50%' }} />
        ))}
      </AnimatePresence>

      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
          style={{ background: `${accentColor}15` }}>
          {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`}
        </div>
        <div>
          <p className="font-black text-foreground">Final Rank #{rank}</p>
          <p className="text-[10px] text-muted-foreground">Event concluded · rewards ready</p>
        </div>
        {!claimed && (
          <motion.div className="ml-auto" animate={{ scale: [1, 1.05, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
            <Gift className="h-5 w-5" style={{ color: accentColor }} />
          </motion.div>
        )}
      </div>

      {/* Rewards grid */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="text-center rounded-xl p-3" style={{ background: `${accentColor}10` }}>
          <p className="text-lg font-black text-amber-400">{cpAmount > 0 ? `+${fmtUsd(cpAmount)}` : '—'}</p>
          <p className="text-[9px] text-muted-foreground mt-0.5">CP Prize</p>
        </div>
        <div className="text-center rounded-xl p-3" style={{ background: 'rgba(99,102,241,0.08)' }}>
          <p className="text-lg font-black text-violet-400">+{fmtNum(xpAmount)}</p>
          <p className="text-[9px] text-muted-foreground mt-0.5">XP Earned</p>
        </div>
        <div className="text-center rounded-xl p-3" style={{ background: 'rgba(34,197,94,0.08)' }}>
          <p className="text-lg font-black text-emerald-400">{badges.length > 0 ? badges.length : '—'}</p>
          <p className="text-[9px] text-muted-foreground mt-0.5">Badges</p>
        </div>
      </div>

      {/* Badge list */}
      {badges.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-4">
          {badges.map((b, i) => (
            <span key={i} className="text-[10px] px-2.5 py-1 rounded-full bg-amber-400/10 text-amber-300 border border-amber-400/20 font-bold">
              🏅 {b}
            </span>
          ))}
        </div>
      )}

      {/* Claim / claimed state */}
      {claimed ? (
        <div className="flex items-center gap-2 justify-center py-2.5 rounded-xl bg-emerald-400/10 border border-emerald-400/20">
          <Sparkles className="h-4 w-4 text-emerald-400" />
          <span className="text-sm font-black text-emerald-400">Rewards Claimed!</span>
        </div>
      ) : (
        <button onClick={handleClaim}
          className="w-full py-2.5 rounded-xl font-black text-sm text-white transition-all hover:brightness-110 flex items-center justify-center gap-2"
          style={{ background: accentColor }}>
          <Gift className="h-4 w-4" /> Claim Rewards
        </button>
      )}
    </div>
  );
}

// ── Prize history log ──────────────────────────────────────────────────────────

export function PrizeHistoryLog() {
  const { prizeHistory, getUserPrizeTotal } = useEventsStore();
  const [expanded, setExpanded] = useState(false);

  if (prizeHistory.length === 0) return null;

  const shown = expanded ? prizeHistory : prizeHistory.slice(0, 3);
  const totalCP = getUserPrizeTotal();
  const totalXP = prizeHistory.reduce((s, t) => s + t.xpAwarded, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-black text-foreground">🏆 Prize History</p>
        <div className="flex gap-3 text-xs">
          <span className="text-amber-400 font-bold">+{fmtUsd(totalCP)} CP total</span>
          <span className="text-violet-400 font-bold">+{fmtNum(totalXP)} XP total</span>
        </div>
      </div>

      <div className="rounded-2xl overflow-hidden border border-white/6">
        {shown.map((tx, i) => (
          <div key={tx.id} className={cn(
            'flex items-center gap-3 px-4 py-3 border-b border-white/4 last:border-0',
            i === 0 ? 'bg-white/3' : '',
          )}>
            <span className="text-xl">🏅</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-foreground truncate">{tx.eventTitle}</p>
              <p className="text-[10px] text-muted-foreground">
                Rank #{tx.rank} · {new Date(tx.timestamp).toLocaleDateString()}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-black text-amber-400">+{fmtUsd(tx.amount)} CP</p>
              <p className="text-[10px] text-violet-400">+{fmtNum(tx.xpAwarded)} XP</p>
            </div>
          </div>
        ))}
      </div>

      {prizeHistory.length > 3 && (
        <button onClick={() => setExpanded(e => !e)}
          className="w-full flex items-center justify-center gap-1 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
          {expanded ? <><ChevronUp className="h-3.5 w-3.5" /> Show less</> : <><ChevronDown className="h-3.5 w-3.5" /> Show all {prizeHistory.length} transactions</>}
        </button>
      )}
    </div>
  );
}

// ── Main panel (shown inside EventDetailPage for completed events) ─────────────

interface EventResultsPanelProps {
  event: LiveEvent;
}

export function EventResultsPanel({ event }: EventResultsPanelProps) {
  const { myEntries, prizeHistory, claimCompletedEventRewards, getLeaderboard } = useEventsStore();
  const { user } = useAuthStore();
  const entry   = myEntries[event.id];

  if (!entry || event.status !== 'completed') return null;

  const alreadyClaimed = prizeHistory.some(t => t.eventId === event.id && t.userId === user?.id);
  const { cpAmount, badgeNames } = prizeDistributor.determinePrize(event, entry.currentRank);
  const xpAmount = prizeDistributor.calculateXP(entry.currentRank, event.type);

  // Find surrounding leaderboard context
  const lb      = getLeaderboard(event.id);
  const myRow   = lb.find((_, i) => i + 1 === entry.currentRank);
  const above   = lb.slice(Math.max(0, entry.currentRank - 3), entry.currentRank - 1);
  const below   = lb.slice(entry.currentRank, Math.min(lb.length, entry.currentRank + 2));

  function handleClaim() {
    if (!user) return;
    claimCompletedEventRewards(event.id, user.id);
  }

  return (
    <div className="space-y-5">

      {/* Performance summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Final Rank',  value: `#${entry.currentRank}`, sub: `of ${fmtNum(event.currentParticipants)}`, color: '#f59e0b' },
          { label: 'Total Return', value: fmtPct(entry.pnlPct),    sub: `${fmtUsd(entry.pnl)} P&L`,             color: entry.pnlPct >= 0 ? '#22c55e' : '#ef4444' },
          { label: 'Win Rate',    value: `${Math.round(entry.winRate * 100)}%`, sub: `${entry.trades} trades`,    color: '#6366f1' },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3 text-center"
            style={{ background: `${s.color}08`, border: `1px solid ${s.color}15` }}>
            <p className="font-black text-sm" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[9px] text-muted-foreground mt-0.5">{s.sub}</p>
            <p className="text-[8px] text-muted-foreground/60 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Prize receipt + claim */}
      <PrizeReceipt
        rank={entry.currentRank}
        cpAmount={cpAmount}
        xpAmount={xpAmount}
        badges={badgeNames}
        accentColor={event.accentColor}
        claimed={alreadyClaimed}
        onClaim={handleClaim}
      />

      {/* Leaderboard snapshot around user */}
      {(above.length > 0 || below.length > 0) && (
        <div className="rounded-2xl overflow-hidden border border-white/6">
          <p className="text-[10px] font-black text-muted-foreground px-4 py-2 border-b border-white/5 uppercase tracking-wider">
            Your final position
          </p>
          {[...above, ...(myRow ? [{ ...myRow, isMe: true }] : []), ...below].map((p: any, i) => (
            <div key={i} className={cn(
              'flex items-center gap-3 px-4 py-2.5 border-b border-white/4 last:border-0',
              p.isMe && 'bg-primary/8',
            )}>
              <span className="text-[11px] font-black text-muted-foreground w-6 shrink-0">
                #{p.rank}
              </span>
              <span className={cn('text-xs font-bold flex-1', p.isMe ? 'text-primary' : 'text-foreground')}>
                {p.isMe ? `${user?.displayName ?? 'You'} ← you` : p.displayName}
              </span>
              <span className={cn('text-xs font-black tabular-nums', p.pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                {fmtPct(p.pnlPct)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
