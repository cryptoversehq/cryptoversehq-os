/**
 * EventsDashboard.tsx — Spec §3.1
 * Featured event hero + live events + upcoming + my events sections
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Bell, Calendar, ChevronRight, Trophy, Users, Clock,
  TrendingUp, Play, CheckCircle, BarChart3, Zap,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useEventsStore } from './eventStore';
import { useAuthStore } from '../../lib/authStore';
import { EventsGuide } from './EventsGuide';
import { LiveEvent, EVENT_TYPE_META } from './eventTypes';
import {
  StatusBadge, DifficultyBadge, Countdown, Avatar,
  fmtNum, fmtUsd, fmtPct,
} from './eventUtils';

// ── Countdown clock (digits) ──────────────────────────────────────────────────

function DigitBlock({ value, label }: { value: number; label: string }) {
  const str = String(value).padStart(2, '0');
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex gap-0.5">
        {str.split('').map((d, i) => (
          <div key={i} className="w-10 h-12 rounded-xl flex items-center justify-center font-black text-2xl text-foreground"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
            {d}
          </div>
        ))}
      </div>
      <span className="text-[10px] text-muted-foreground uppercase tracking-widest">{label}</span>
    </div>
  );
}

function LiveCountdown({ targetAt, label = 'Starts in' }: { targetAt: string; label?: string }) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    const calc = () => setRemaining(Math.max(0, Math.floor((new Date(targetAt).getTime() - Date.now()) / 1000)));
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [targetAt]);

  const d  = Math.floor(remaining / 86400);
  const h  = Math.floor((remaining % 86400) / 3600);
  const m  = Math.floor((remaining % 3600) / 60);
  const s  = remaining % 60;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground text-center">{label}</p>
      <div className="flex items-end gap-2 justify-center">
        <DigitBlock value={d} label="Days" />
        <span className="text-xl font-black text-muted-foreground mb-3">:</span>
        <DigitBlock value={h} label="Hours" />
        <span className="text-xl font-black text-muted-foreground mb-3">:</span>
        <DigitBlock value={m} label="Mins" />
        <span className="text-xl font-black text-muted-foreground mb-3">:</span>
        <DigitBlock value={s} label="Secs" />
      </div>
    </div>
  );
}

// ── Featured Hero ─────────────────────────────────────────────────────────────

function FeaturedEventHero({ event }: { event: LiveEvent }) {
  const navigate = useNavigate();
  const { isJoined, joinEvent } = useEventsStore();
  const { user } = useAuthStore();
  const meta   = EVENT_TYPE_META[event.type];
  const joined = isJoined(event.id);

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
      className={cn('relative rounded-3xl overflow-hidden p-6 sm:p-8', 'bg-gradient-to-br', event.coverGradient)}
      style={{ border: `1px solid ${event.accentColor}30` }}>

      {/* Animated glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-64 h-64 rounded-full blur-3xl opacity-20"
          style={{ background: event.accentColor }} />
      </div>

      {/* HOT badge */}
      <div className="flex items-center justify-between mb-4 relative z-10">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-white/10 text-white border border-white/20">
            🔥 FEATURED EVENT
          </span>
          <StatusBadge status={event.status} />
        </div>
        <span className="text-[10px] text-white/60">{meta.icon} {meta.label}</span>
      </div>

      {/* Title */}
      <div className="relative z-10 space-y-1 mb-6">
        <div className="flex items-center gap-3">
          <span className="text-4xl">{event.icon}</span>
          <div>
            <h2 className="text-2xl font-black text-white">{event.title}</h2>
            <p className="text-sm text-white/70">{event.subtitle}</p>
          </div>
        </div>
      </div>

      {/* Prize / entry info */}
      <div className="relative z-10 flex flex-wrap gap-4 mb-6">
        {[
          { label: 'Prize Pool',  value: event.prizePool > 0 ? fmtUsd(event.prizePool) + ' CP' : 'FREE' },
          { label: 'Entry Fee',   value: 'FREE' },
          { label: 'Level',       value: event.minLevel > 0 ? `Lv. ${event.minLevel}+` : 'Any' },
          { label: 'Duration',    value: event.durationLabel },
        ].map(s => (
          <div key={s.label} className="px-3 py-1.5 rounded-xl bg-black/30 backdrop-blur border border-border">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
            <p className="text-sm font-black text-foreground">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Countdown */}
      {event.status === 'upcoming' && (
        <div className="relative z-10 mb-6">
          <LiveCountdown targetAt={event.startAt} />
        </div>
      )}

      {/* Description */}
      <p className="relative z-10 text-sm text-white/70 mb-6 max-w-xl">{event.description}</p>

      {/* CTAs */}
      <div className="relative z-10 flex gap-3 flex-wrap">
        <button
          onClick={() => navigate(`/events/${event.id}`)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-sm text-white transition-all hover:brightness-110 hover:scale-[1.02]"
          style={{ background: event.accentColor }}>
          {event.status === 'live' ? <><Play className="h-4 w-4" />Join Live</> : <><Trophy className="h-4 w-4" />View Details</>}
        </button>
        {event.status === 'upcoming' && !joined && (
          <button
            onClick={() => user && joinEvent(event.id, user.id, user.displayName)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm bg-secondary/50 hover:bg-secondary/70 text-foreground border border-border transition-all">
            <Bell className="h-4 w-4" /> Notify Me
          </button>
        )}
        {joined && (
          <span className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-emerald-400/15 text-emerald-300 border border-emerald-400/25">
            <CheckCircle className="h-4 w-4" /> Registered
          </span>
        )}
      </div>

      {/* Participants */}
      <div className="relative z-10 flex items-center gap-2 mt-4 text-xs text-muted-foreground">
        <Users className="h-3.5 w-3.5" />
        <span>{fmtNum(event.currentParticipants)} registered</span>
        {event.maxParticipants && <span>· {fmtNum(event.maxParticipants - event.currentParticipants)} spots left</span>}
      </div>
    </motion.div>
  );
}

// ── Live event card (compact) ─────────────────────────────────────────────────

function LiveEventRow({ event }: { event: LiveEvent }) {
  const navigate  = useNavigate();
  const { myEntries } = useEventsStore();
  const entry = myEntries[event.id];
  const meta  = EVENT_TYPE_META[event.type];

  return (
    <div className="flex items-center gap-4 p-4 rounded-2xl group cursor-pointer hover:bg-secondary/30 transition-colors border border-border"
      onClick={() => navigate(`/events/${event.id}`)}>

      {/* Live pulse */}
      <div className="relative shrink-0">
        <span className="text-2xl">{event.icon}</span>
        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-400 animate-pulse border border-background" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[9px] font-black text-red-400 uppercase tracking-wider">● LIVE</span>
          <span className="text-[9px] text-muted-foreground">{meta.label}</span>
        </div>
        <p className="font-black text-sm text-foreground truncate">{event.title}</p>
        <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground">
          <span><Users className="inline h-3 w-3 mr-0.5" />{fmtNum(event.currentParticipants)} participants</span>
          {entry && <span className="text-emerald-400">Your Rank: #{entry.currentRank}</span>}
          <span className="ml-auto">Prize: <span className="text-foreground font-bold">{event.prize}</span></span>
        </div>
      </div>

      <div className="flex gap-2 shrink-0">
        {entry && (
          <button onClick={e => { e.stopPropagation(); navigate(`/events/${event.id}/leaderboard`); }}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white/5 border border-white/8 hover:bg-white/10 transition-colors">
            Leaderboard
          </button>
        )}
        <button onClick={e => { e.stopPropagation(); navigate(`/events/${event.id}`); }}
          className="px-3 py-1.5 rounded-xl text-xs font-bold text-white transition-all hover:brightness-110"
          style={{ background: meta.color }}>
          {event.type === 'team_battle' ? 'Team Chat' : event.type === 'live_webinar' ? 'Watch' : 'View'}
        </button>
      </div>
    </div>
  );
}

// ── Upcoming event row ────────────────────────────────────────────────────────

function UpcomingEventRow({ event }: { event: LiveEvent }) {
  const navigate = useNavigate();
  const { isJoined, joinEvent } = useEventsStore();
  const { user } = useAuthStore();
  const meta     = EVENT_TYPE_META[event.type];
  const joined   = isJoined(event.id);

  const startDate = new Date(event.startAt);
  const isToday   = startDate.toDateString() === new Date().toDateString();
  const isTomorrow = new Date(Date.now() + 86400000).toDateString() === startDate.toDateString();
  const dateLabel = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const timeLabel = startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="flex items-center gap-4 p-4 rounded-2xl border border-border hover:border-border/60 transition-colors cursor-pointer group"
      onClick={() => navigate(`/events/${event.id}`)}>

      {/* Date block */}
      <div className="shrink-0 text-center min-w-[52px]">
        <div className="w-12 h-12 rounded-xl flex flex-col items-center justify-center"
          style={{ background: `${meta.color}12`, border: `1px solid ${meta.color}25` }}>
          <span className="text-[9px] font-black uppercase" style={{ color: meta.color }}>{dateLabel}</span>
          <span className="text-[11px] font-black text-foreground">{timeLabel}</span>
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-base">{event.icon}</span>
          <p className="font-black text-sm text-foreground truncate">{event.title}</p>
        </div>
        <p className="text-[11px] text-muted-foreground truncate">{event.subtitle}</p>
        <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
          {event.speakers && event.speakers.length > 0 && (
            <span>Speaker: <span className="text-foreground">{event.speakers[0].name}</span></span>
          )}
          <span>{fmtNum(event.currentParticipants)} registered</span>
          <span className="font-bold" style={{ color: meta.color }}>{event.prize}</span>
        </div>
      </div>

      <button
        onClick={e => {
          e.stopPropagation();
          if (user) joinEvent(event.id, user.id, user.displayName);
        }}
        className={cn(
          'shrink-0 px-4 py-2 rounded-xl text-xs font-black transition-all',
          joined
            ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20'
            : 'text-white hover:brightness-110',
        )}
        style={!joined ? { background: meta.color } : {}}>
        {joined ? '✓ Registered' : 'Register'}
      </button>
    </div>
  );
}

// ── My events strip ───────────────────────────────────────────────────────────

function MyEventsStrip() {
  const navigate = useNavigate();
  const { myEntries, getEvent, events } = useEventsStore();
  const entries = Object.values(myEntries);

  if (entries.length === 0) return null;

  return (
    <div className="space-y-2">
      {entries.map(e => {
        const ev = getEvent(e.eventId);
        if (!ev) return null;
        const meta = EVENT_TYPE_META[ev.type];
        const isCompleted = ev.status === 'completed';
        return (
          <div key={e.eventId}
            className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer hover:bg-white/3 transition-colors"
            onClick={() => navigate(`/events/${ev.id}`)}>
            <span className={cn('text-sm shrink-0', isCompleted ? '📊' : '✅')}>{isCompleted ? '📊' : '✅'}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground truncate">
                {isCompleted ? 'Completed' : ev.status === 'live' ? 'Active' : 'Registered'}: {ev.title}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {isCompleted
                  ? `Rank #${e.currentRank} — Reward: ${fmtUsd(e.rewardsEarned.reduce((s, r) => s + r.value, 0))} CP`
                  : ev.status === 'live'
                  ? `Rank #${e.currentRank} · Return ${fmtPct(e.pnlPct)}`
                  : `Starts ${new Date(ev.startAt).toLocaleDateString()}`}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>
        );
      })}
    </div>
  );
}

// ── Section header ─────────────────────────────────────────────────────────────

function Section({ title, accent, action, children }: {
  title: string; accent?: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {accent && <span className="w-1 h-4 rounded-full shrink-0" style={{ background: accent }} />}
          <h3 className="text-sm font-black text-foreground">{title}</h3>
        </div>
        {action}
      </div>
      <div className="rounded-2xl overflow-hidden border border-white/5"
        style={{ background: 'rgba(255,255,255,0.015)' }}>
        {children}
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export function EventsDashboard() {
  const navigate = useNavigate();
  const { events, myEntries } = useEventsStore();

  const featured   = events.find(e => e.isFeatured && e.status !== 'completed') ?? events[0];
  const liveEvents = events.filter(e => e.status === 'live');
  const upcoming   = events.filter(e => e.status === 'upcoming').slice(0, 4);
  const hasMyEvents= Object.keys(myEntries).length > 0;

  return (
    <div className="space-y-8">

      {/* Featured hero */}
      {featured && <FeaturedEventHero event={featured} />}

      {/* Active / LIVE */}
      {liveEvents.length > 0 && (
        <Section title="Active Events (LIVE)" accent="#ef4444"
          action={
            <button onClick={() => {}} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1">
              View all <ChevronRight className="h-3 w-3" />
            </button>
          }>
          <div className="divide-y divide-white/4">
            {liveEvents.map(ev => <LiveEventRow key={ev.id} event={ev} />)}
          </div>
        </Section>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <Section title="Upcoming Events"
          accent="#60a5fa"
          action={
            <button onClick={() => navigate('/events/calendar')}
              className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 font-bold">
              <Calendar className="h-3 w-3" /> Calendar
            </button>
          }>
          <div className="divide-y divide-white/4">
            {upcoming.map(ev => <UpcomingEventRow key={ev.id} event={ev} />)}
          </div>
        </Section>
      )}

      {/* My Events */}
      {hasMyEvents && (
        <Section title="My Events" accent="#f59e0b"
          action={
            <button onClick={() => navigate('/events/my')}
              className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-1 font-bold">
              View all <ChevronRight className="h-3 w-3" />
            </button>
          }>
          <MyEventsStrip />
        </Section>
      )}

    </div>
  );
}
