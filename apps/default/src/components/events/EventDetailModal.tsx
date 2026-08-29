/**
 * EventDetailModal.tsx — Full-screen event detail sheet with join/leave
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Users, Clock, Trophy, Shield, ChevronRight, AlertCircle,
  CheckCircle, Star, Zap, Play, Calendar,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useEventsStore } from './eventStore';
import { useAuthStore } from '../../lib/authStore';
import {
  LiveEvent, EVENT_TYPE_META, DIFFICULTY_META,
} from './eventTypes';
import {
  StatusBadge, DifficultyBadge, Avatar, Countdown,
  fmtUsd, fmtNum, fmtPct, ParticipantCount,
} from './eventUtils';

interface Props {
  eventId: string;
  onClose: () => void;
}

export function EventDetailModal({ eventId, onClose }: Props) {
  const { getEvent, isJoined, joinEvent, leaveEvent, getLeaderboard, getMyEntry } = useEventsStore();
  const { user } = useAuthStore();
  const event   = getEvent(eventId);
  const joined  = isJoined(eventId);
  const entry   = getMyEntry(eventId);
  const [tab, setTab] = useState<'overview' | 'leaderboard' | 'rewards' | 'rules'>('overview');
  const [joining, setJoining] = useState(false);

  if (!event) return null;
  const meta  = EVENT_TYPE_META[event.type];
  const diff  = DIFFICULTY_META[event.difficulty];
  const top10 = getLeaderboard(eventId).slice(0, 10);

  async function handleJoin() {
    if (!user) return;
    setJoining(true);
    setTimeout(() => {
      joinEvent(eventId, user.id, user.displayName);
      setJoining(false);
    }, 600);
  }

  function handleLeave() {
    if (!user) return;
    leaveEvent(eventId, user.id);
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
        onClick={e => e.target === e.currentTarget && onClose()}>

        <motion.div
          initial={{ y: 40, opacity: 0, scale: 0.97 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ type: 'spring', damping: 24 }}
          className="w-full sm:max-w-2xl max-h-[92vh] overflow-hidden rounded-t-3xl sm:rounded-3xl flex flex-col bg-card border border-border"
        >

          {/* Cover */}
          <div className={cn('relative h-36 bg-gradient-to-br shrink-0', event.coverGradient)}>
            <div className="absolute inset-0 bg-black/30" />
            <button onClick={onClose}
              className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/40 hover:bg-black/60 transition-colors">
              <X className="h-4 w-4 text-white" />
            </button>
            <div className="absolute bottom-4 left-5 z-10 flex items-end gap-3">
              <span className="text-5xl drop-shadow-lg">{event.icon}</span>
              <div>
                <p className="text-xl font-black text-white drop-shadow">{event.title}</p>
                <p className="text-xs text-white/70">{event.subtitle}</p>
              </div>
            </div>
            {event.status === 'live' && (
              <div className="absolute top-4 left-5 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/90 backdrop-blur text-white text-[10px] font-black">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                LIVE NOW
              </div>
            )}
          </div>

          {/* Badges row */}
          <div className="flex items-center gap-2 px-5 py-3 border-b border-border flex-wrap shrink-0">
            <StatusBadge status={event.status} />
            <DifficultyBadge difficulty={event.difficulty} />
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: `${meta.color}12`, color: meta.color }}>
              {meta.icon} {meta.label}
            </span>
            <span className="text-[10px] text-muted-foreground ml-auto">
              <Countdown endAt={event.endAt} startAt={event.startAt} status={event.status} />
            </span>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-border shrink-0 overflow-x-auto">
            {(['overview','leaderboard','rewards','rules'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={cn(
                  'px-4 py-3 text-xs font-bold capitalize whitespace-nowrap transition-colors',
                  tab === t ? 'text-foreground border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground',
                )}>
                {t}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

            {/* ── OVERVIEW ── */}
            {tab === 'overview' && (
              <div className="space-y-5">
                {/* Stats grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { icon: Trophy, label: 'Prize Pool', value: event.prizePool > 0 ? fmtUsd(event.prizePool) : 'Free' },
                    { icon: Users,  label: 'Participants', value: fmtNum(event.currentParticipants) + (event.maxParticipants ? `/${fmtNum(event.maxParticipants)}` : '') },
                    { icon: Clock,  label: 'Duration', value: event.durationLabel },
                    { icon: Shield, label: 'Min Level', value: event.minLevel > 0 ? `Lv.${event.minLevel}` : 'Open to all' },
                  ].map(s => (
                    <div key={s.label} className="rounded-xl p-3 text-center bg-secondary/30 border border-border">
                      <s.icon className="h-4 w-4 mx-auto mb-1" style={{ color: meta.color }} />
                      <p className="text-[10px] text-muted-foreground">{s.label}</p>
                      <p className="text-sm font-black text-foreground mt-0.5">{s.value}</p>
                    </div>
                  ))}
                </div>

                {/* Description */}
                <div>
                  <p className="text-xs font-black text-foreground mb-2">About this event</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{event.description}</p>
                </div>

                {/* Speakers (webinars) */}
                {event.speakers && event.speakers.length > 0 && (
                  <div>
                    <p className="text-xs font-black text-foreground mb-3">Speakers</p>
                    <div className="space-y-3">
                      {event.speakers.map(sp => (
                        <div key={sp.name} className="flex items-start gap-3 p-3 rounded-xl"
                          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                          <div className="w-10 h-10 rounded-full flex items-center justify-center font-black text-sm text-white shrink-0"
                            style={{ background: meta.color }}>
                            {sp.avatar}
                          </div>
                          <div>
                            <p className="text-sm font-black text-foreground">{sp.name}</p>
                            <p className="text-[10px] font-bold" style={{ color: meta.color }}>{sp.title}</p>
                            <p className="text-[11px] text-muted-foreground mt-1">{sp.bio}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tags */}
                <div className="flex gap-2 flex-wrap">
                  {event.tags.map(t => (
                    <span key={t} className="text-[10px] px-2.5 py-1 rounded-full bg-white/4 text-muted-foreground border border-white/6">
                      #{t}
                    </span>
                  ))}
                </div>

                {/* My entry if joined */}
                {joined && entry && (
                  <div className="rounded-xl p-4 border"
                    style={{ background: `${meta.color}08`, borderColor: `${meta.color}25` }}>
                    <p className="text-xs font-black mb-3" style={{ color: meta.color }}>Your Progress</p>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: 'Rank',    value: `#${entry.currentRank}` },
                        { label: 'Return',  value: fmtPct(entry.pnlPct) },
                        { label: 'Trades',  value: String(entry.trades) },
                      ].map(s => (
                        <div key={s.label} className="text-center">
                          <p className="text-sm font-black text-foreground">{s.value}</p>
                          <p className="text-[10px] text-muted-foreground">{s.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Participant bar */}
                <ParticipantCount current={event.currentParticipants} max={event.maxParticipants} color={meta.color} />
              </div>
            )}

            {/* ── LEADERBOARD ── */}
            {tab === 'leaderboard' && (
              <div className="space-y-2">
                {top10.map((p, i) => (
                  <div key={p.userId} className={cn(
                    'flex items-center gap-3 p-3 rounded-xl transition-colors',
                    i < 3 ? 'bg-white/5 border border-white/8' : 'bg-white/2',
                  )}>
                    <div className="w-7 text-center shrink-0">
                      {p.badge
                        ? <span className="text-lg">{p.badge}</span>
                        : <span className="text-xs font-black text-muted-foreground">#{p.rank}</span>}
                    </div>
                    <Avatar seed={p.avatarSeed} size={32} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{p.displayName}</p>
                      <p className="text-[10px] text-muted-foreground">{p.trades} trades · {Math.round(p.winRate * 100)}% win</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={cn('font-black text-sm', p.pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                        {fmtPct(p.pnlPct)}
                      </p>
                      {p.delta !== 0 && (
                        <p className={cn('text-[9px] font-bold', p.delta > 0 ? 'text-emerald-400' : 'text-red-400')}>
                          {p.delta > 0 ? '↑' : '↓'}{Math.abs(p.delta)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                <p className="text-[11px] text-muted-foreground text-center pt-2">
                  Showing top 10 of {fmtNum(event.currentParticipants)} participants
                </p>
              </div>
            )}

            {/* ── REWARDS ── */}
            {tab === 'rewards' && (
              <div className="space-y-3">
                {event.rewards.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white/3 border border-white/6">
                    <span className="text-2xl">{r.icon}</span>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-foreground">{r.label}</p>
                      <p className="text-[10px] text-muted-foreground capitalize">{r.type.replace('_', ' ')}</p>
                    </div>
                    {r.value > 0 && (
                      <span className="font-black text-sm" style={{ color: meta.color }}>
                        {r.type === 'virtual_cash' ? fmtUsd(r.value) : `+${fmtNum(r.value)} XP`}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ── RULES ── */}
            {tab === 'rules' && (
              <div className="space-y-3">
                {event.rules.map((r, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-white/2 border border-white/5">
                    <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: meta.color }} />
                    <div>
                      <p className="text-xs font-black text-foreground">{r.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{r.value}</p>
                    </div>
                  </div>
                ))}
                <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                  <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    Violations of any rule may result in immediate disqualification without refund of entry stakes.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* CTA */}
          <div className="px-5 py-4 border-t border-white/5 shrink-0">
            {event.status === 'completed' ? (
              <div className="flex items-center justify-center gap-2 py-3 rounded-xl bg-white/3 text-muted-foreground text-sm font-bold">
                <CheckCircle className="h-4 w-4" /> Event Completed
              </div>
            ) : joined ? (
              <div className="flex gap-3">
                <button className="flex-1 py-3 rounded-xl font-black text-sm text-white transition-all"
                  style={{ background: meta.color }}>
                  {event.status === 'live' ? '🎯 Go Trade' : '📋 My Progress'}
                </button>
                <button onClick={handleLeave}
                  className="px-4 py-3 rounded-xl border border-white/10 text-muted-foreground text-sm hover:border-red-500/40 hover:text-red-400 transition-colors">
                  Leave
                </button>
              </div>
            ) : (
              <button onClick={handleJoin} disabled={joining}
                className={cn(
                  'w-full py-3 rounded-xl font-black text-sm text-white transition-all flex items-center justify-center gap-2',
                  joining ? 'opacity-60 cursor-not-allowed' : 'hover:brightness-110 active:scale-[0.98]',
                )}
                style={{ background: joining ? '#666' : meta.color }}>
                {joining ? (
                  <><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />Joining…</>
                ) : event.status === 'live' ? (
                  <><Play className="h-4 w-4" />Join Now — Event is LIVE!</>
                ) : (
                  <><Star className="h-4 w-4" />Register for Event</>
                )}
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
