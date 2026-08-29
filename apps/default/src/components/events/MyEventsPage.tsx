/**
 * MyEventsPage.tsx — User's registered events with live progress tracking
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp, TrendingDown, Trophy, Clock, Award, Target,
  BarChart3, Zap, CheckCircle,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useEventsStore } from './eventStore';
import { useAuthStore } from '../../lib/authStore';
import { EVENT_TYPE_META } from './eventTypes';
import { PrizeHistoryLog } from './EventResultsPanel';
import {
  Avatar, StatusBadge, Countdown, EmptyState,
  fmtUsd, fmtPct, fmtNum,
} from './eventUtils';
import { EventDetailModal } from './EventDetailModal';

export function MyEventsPage() {
  const { myEntries, getEvent, earnedBadges, leaveEvent } = useEventsStore();
  const { user } = useAuthStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const entries = Object.values(myEntries);
  const liveEntries      = entries.filter(e => { const ev = getEvent(e.eventId); return ev?.status === 'live'; });
  const upcomingEntries  = entries.filter(e => { const ev = getEvent(e.eventId); return ev?.status === 'upcoming'; });
  const completedEntries = entries.filter(e => { const ev = getEvent(e.eventId); return ev?.status === 'completed'; });

  // Total stats across all events
  const totalPnl      = entries.reduce((s, e) => s + e.pnl, 0);
  const totalTrades   = entries.reduce((s, e) => s + e.trades, 0);
  const avgWinRate    = entries.length > 0 ? entries.reduce((s, e) => s + e.winRate, 0) / entries.length : 0;
  const bestRank      = entries.length > 0 ? Math.min(...entries.map(e => e.currentRank)) : 0;

  if (entries.length === 0) {
    return (
      <EmptyState
        icon="🎯"
        title="No events joined yet"
        body="Browse the Events tab and join a challenge to see your progress here."
      />
    );
  }

  function EntryCard({ entryId }: { entryId: string }) {
    const entry = myEntries[entryId];
    const ev    = getEvent(entry.eventId);
    if (!ev) return null;
    const meta = EVENT_TYPE_META[ev.type];
    const isUp = entry.pnlPct >= 0;

    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl p-5 cursor-pointer group transition-all hover:scale-[1.01]"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
        onClick={() => setSelectedId(ev.id)}>

        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{ev.icon}</span>
            <div>
              <p className="font-black text-sm text-foreground">{ev.title}</p>
              <p className="text-[10px] text-muted-foreground">{meta.icon} {meta.label}</p>
            </div>
          </div>
          <StatusBadge status={ev.status} />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          {[
            { label: 'Rank', value: `#${entry.currentRank}`, color: meta.color },
            { label: 'Return', value: fmtPct(entry.pnlPct), color: isUp ? '#22c55e' : '#ef4444' },
            { label: 'Trades', value: String(entry.trades), color: '#94a3b8' },
            { label: 'Win Rate', value: `${Math.round(entry.winRate * 100)}%`, color: entry.winRate >= 0.6 ? '#22c55e' : '#f59e0b' },
          ].map(s => (
            <div key={s.label} className="text-center rounded-xl p-2"
              style={{ background: `${s.color}08` }}>
              <p className="text-sm font-black" style={{ color: s.color }}>{s.value}</p>
              <p className="text-[9px] text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Countdown + PnL */}
        <div className="flex items-center justify-between">
          <Countdown endAt={ev.endAt} startAt={ev.startAt} status={ev.status} />
          <div className={cn('flex items-center gap-1 font-black text-sm', isUp ? 'text-emerald-400' : 'text-red-400')}>
            {isUp ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            {isUp ? '+' : ''}{fmtUsd(entry.pnl)}
          </div>
        </div>

        {/* Progress bar (rank) */}
        {ev.currentParticipants > 0 && (
          <div className="mt-3">
            <div className="flex justify-between text-[9px] text-muted-foreground mb-1">
              <span>Top {Math.round((entry.currentRank / ev.currentParticipants) * 100)}%</span>
              <span>{fmtNum(entry.currentRank)} / {fmtNum(ev.currentParticipants)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/5">
              <div className="h-full rounded-full transition-all"
                style={{ width: `${Math.max(2, 100 - (entry.currentRank / ev.currentParticipants) * 100)}%`, background: meta.color }} />
            </div>
          </div>
        )}
      </motion.div>
    );
  }

  return (
    <div className="space-y-8">

      {/* Overview stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: Trophy,    label: 'Events Joined', value: String(entries.length), color: '#6366f1' },
          { icon: TrendingUp,label: 'Total P&L',     value: (totalPnl >= 0 ? '+' : '') + fmtUsd(totalPnl), color: totalPnl >= 0 ? '#22c55e' : '#ef4444' },
          { icon: BarChart3, label: 'Total Trades',  value: fmtNum(totalTrades), color: '#f59e0b' },
          { icon: Target,    label: 'Best Rank',     value: bestRank > 0 ? `#${bestRank}` : '—', color: '#ec4899' },
        ].map(s => (
          <div key={s.label} className="rounded-2xl p-4 text-center"
            style={{ background: `${s.color}08`, border: `1px solid ${s.color}18` }}>
            <s.icon className="h-5 w-5 mx-auto mb-2" style={{ color: s.color }} />
            <p className="text-xl font-black" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Live events */}
      {liveEntries.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
            <p className="text-sm font-black text-red-400">LIVE — Trading Now</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {liveEntries.map(e => <EntryCard key={e.eventId} entryId={e.eventId} />)}
          </div>
        </div>
      )}

      {/* Upcoming */}
      {upcomingEntries.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-black text-blue-400">🔵 Upcoming</p>
          <div className="grid sm:grid-cols-2 gap-4">
            {upcomingEntries.map(e => <EntryCard key={e.eventId} entryId={e.eventId} />)}
          </div>
        </div>
      )}

      {/* Completed */}
      {completedEntries.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-black text-muted-foreground">Past Events</p>
          <div className="grid sm:grid-cols-2 gap-4">
            {completedEntries.map(e => <EntryCard key={e.eventId} entryId={e.eventId} />)}
          </div>
        </div>
      )}

      {/* Earned badges */}
      {earnedBadges.length > 0 && (
        <div>
          <p className="text-sm font-black text-foreground mb-3">🏅 Earned Badges</p>
          <div className="flex gap-3 flex-wrap">
            {earnedBadges.map((b, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-400/8 border border-amber-400/20">
                <span className="text-xl">{b}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Prize history */}
      <PrizeHistoryLog />

      {selectedId && <EventDetailModal eventId={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
