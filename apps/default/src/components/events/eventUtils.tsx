/**
 * eventUtils.tsx — Shared UI primitives for the Events feature
 */
import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';
import {
  LiveEvent, EventStatus, EventDifficulty,
  EVENT_TYPE_META, DIFFICULTY_META,
} from './eventTypes';

// ── Time helpers ──────────────────────────────────────────────────────────────

export function timeLeft(endAt: string): string {
  const ms = new Date(endAt).getTime() - Date.now();
  if (ms <= 0) return 'Ended';
  const h  = Math.floor(ms / 3600000);
  const m  = Math.floor((ms % 3600000) / 60000);
  if (h > 48) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0)  return `${h}h ${m}m`;
  return `${m}m`;
}

export function timeUntil(startAt: string): string {
  const ms = new Date(startAt).getTime() - Date.now();
  if (ms <= 0) return 'Now';
  const h  = Math.floor(ms / 3600000);
  const m  = Math.floor((ms % 3600000) / 60000);
  if (h > 48) return `in ${Math.floor(h / 24)}d`;
  if (h > 0)  return `in ${h}h ${m}m`;
  return `in ${m}m`;
}

export function fmtUsd(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

export function fmtPct(n: number): string {
  const v = parseFloat(n.toFixed(2));
  return (v >= 0 ? '+' : '') + v + '%';
}

export function fmtNum(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_CFG: Record<EventStatus, { label: string; className: string; dot: string }> = {
  live:      { label: 'LIVE',      className: 'bg-red-500/15 text-red-400 border-red-500/30',       dot: 'bg-red-400 animate-pulse' },
  upcoming:  { label: 'UPCOMING',  className: 'bg-blue-500/15 text-blue-400 border-blue-500/30',    dot: 'bg-blue-400' },
  completed: { label: 'COMPLETED', className: 'bg-slate-500/15 text-slate-400 border-slate-500/30', dot: 'bg-slate-400' },
  cancelled: { label: 'CANCELLED', className: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',    dot: 'bg-zinc-400' },
};

export function StatusBadge({ status }: { status: EventStatus }) {
  const cfg = STATUS_CFG[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[10px] font-black px-2.5 py-1 rounded-full border', cfg.className)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
      {cfg.label}
    </span>
  );
}

// ── Difficulty badge ──────────────────────────────────────────────────────────

export function DifficultyBadge({ difficulty }: { difficulty: EventDifficulty }) {
  const meta = DIFFICULTY_META[difficulty];
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: `${meta.color}15`, color: meta.color, border: `1px solid ${meta.color}30` }}>
      {meta.label}
    </span>
  );
}

// ── Progress arc ─────────────────────────────────────────────────────────────

export function ProgressRing({ value, max, color, size = 48 }: {
  value: number; max: number; color: string; size?: number;
}) {
  const pct    = max > 0 ? Math.min(1, value / max) : 0;
  const r      = (size / 2) - 4;
  const circ   = 2 * Math.PI * r;
  const offset = circ * (1 - pct);
  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={3} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={3}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
    </svg>
  );
}

// ── Countdown timer ───────────────────────────────────────────────────────────

export function Countdown({ endAt, startAt, status }: { endAt: string; startAt: string; status: EventStatus }) {
  const [_, forceRender] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => forceRender(n => n + 1), 10000);
    return () => clearInterval(id);
  }, []);

  if (status === 'live')      return <span className="text-red-400 font-black tabular-nums">{timeLeft(endAt)} left</span>;
  if (status === 'upcoming')  return <span className="text-blue-400 font-bold tabular-nums">Starts {timeUntil(startAt)}</span>;
  if (status === 'completed') return <span className="text-muted-foreground font-bold">Ended</span>;
  return null;
}

// ── Avatar ────────────────────────────────────────────────────────────────────

export function Avatar({ seed, size = 32 }: { seed: string; size?: number }) {
  const h = seed.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 0);
  const colors = ['#6366f1','#ec4899','#f59e0b','#22c55e','#06b6d4','#ef4444','#8b5cf6','#f97316'];
  const bg = colors[Math.abs(h) % colors.length];
  const initials = seed.slice(0, 2).toUpperCase();
  return (
    <div className="rounded-full flex items-center justify-center font-black text-white shrink-0"
      style={{ width: size, height: size, background: bg, fontSize: size * 0.35 }}>
      {initials}
    </div>
  );
}

// ── Prize pill ────────────────────────────────────────────────────────────────

export function PrizePill({ prize, accentColor }: { prize: string; accentColor: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-black px-3 py-1 rounded-full"
      style={{ background: `${accentColor}15`, color: accentColor, border: `1px solid ${accentColor}25` }}>
      🏆 {prize}
    </span>
  );
}

// ── Participant count ─────────────────────────────────────────────────────────

export function ParticipantCount({ current, max, color }: { current: number; max: number | null; color: string }) {
  const pct = max ? current / max : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground">Participants</span>
        <span className="font-bold text-foreground">{fmtNum(current)}{max ? `/${fmtNum(max)}` : ''}</span>
      </div>
      {max && (
        <div className="h-1 rounded-full bg-white/5 overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pct*100)}%`, background: color }} />
        </div>
      )}
    </div>
  );
}

// ── Event Card (used in grid) ─────────────────────────────────────────────────

interface EventCardProps {
  event:    LiveEvent;
  joined?:  boolean;
  myScore?: number;
  myRank?:  number;
  onClick:  () => void;
}

export function EventCard({ event, joined, myScore, myRank, onClick }: EventCardProps) {
  const meta = EVENT_TYPE_META[event.type];
  const isLive = event.status === 'live';

  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.01 }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      className={cn(
        'relative rounded-2xl overflow-hidden cursor-pointer group',
        'border transition-all duration-300',
        isLive ? 'border-red-500/30 shadow-lg shadow-red-500/5' : 'border-white/6 hover:border-white/15',
      )}
      style={{ background: 'rgba(255,255,255,0.02)' }}>

      {/* Cover gradient */}
      <div className={cn('absolute inset-0 bg-gradient-to-br opacity-60', event.coverGradient)} />

      {/* HOT / FEATURED ribbons */}
      {event.isHot && (
        <div className="absolute top-3 right-3 z-10 text-[10px] font-black px-2 py-0.5 rounded-full bg-red-500 text-white">
          🔥 HOT
        </div>
      )}
      {event.isFeatured && !event.isHot && (
        <div className="absolute top-3 right-3 z-10 text-[10px] font-black px-2 py-0.5 rounded-full bg-violet-600 text-white">
          ⭐ FEATURED
        </div>
      )}

      {/* Live pulse border */}
      {isLive && (
        <div className="absolute inset-0 rounded-2xl border-2 border-red-500/40 animate-pulse pointer-events-none" />
      )}

      <div className="relative z-10 p-5 flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{event.icon}</span>
            <div>
              <p className="text-sm font-black text-foreground leading-tight">{event.title}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{event.subtitle}</p>
            </div>
          </div>
          <StatusBadge status={event.status} />
        </div>

        {/* Type & difficulty */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: `${meta.color}15`, color: meta.color }}>
            {meta.icon} {meta.label}
          </span>
          <DifficultyBadge difficulty={event.difficulty} />
          <span className="text-[10px] text-muted-foreground">⏱ {event.durationLabel}</span>
        </div>

        {/* Prize */}
        <PrizePill prize={event.prize} accentColor={event.accentColor} />

        {/* Participants */}
        <ParticipantCount current={event.currentParticipants} max={event.maxParticipants} color={meta.color} />

        {/* My entry stats */}
        {joined && myRank != null && (
          <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white/4 border border-white/8">
            <span className="text-[10px] text-muted-foreground">Your rank</span>
            <span className="font-black text-sm" style={{ color: meta.color }}>#{myRank}</span>
            <span className="text-[10px] text-muted-foreground ml-auto">Return</span>
            <span className={cn('font-black text-sm', (myScore ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400')}>
              {fmtPct(myScore ?? 0)}
            </span>
          </div>
        )}

        {/* Countdown */}
        <div className="flex items-center justify-between mt-1">
          <Countdown endAt={event.endAt} startAt={event.startAt} status={event.status} />
          {joined
            ? <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-400/10 text-emerald-400 border border-emerald-400/20">✓ Joined</span>
            : <span className="text-[10px] text-muted-foreground group-hover:text-foreground transition-colors">View details →</span>}
        </div>
      </div>
    </motion.div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

export function SectionHeader({ title, subtitle, action }: {
  title: string; subtitle?: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div>
        <h2 className="text-lg font-black text-foreground">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

export function EmptyState({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <span className="text-5xl">{icon}</span>
      <p className="font-black text-foreground text-lg">{title}</p>
      <p className="text-sm text-muted-foreground max-w-xs">{body}</p>
    </div>
  );
}
