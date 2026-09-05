/**
 * EventDetailPage.tsx — Spec §3.2
 * Full event page: overview, countdown, how-it-works, prize distribution, rules
 */
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Share2, Bell, CheckCircle, XCircle,
  Trophy, Users, Clock, Shield, Calendar, Play,
  Star, ChevronRight, AlertCircle,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useEventsStore } from './eventStore';
import { useAuthStore } from '../../lib/authStore';
import { EVENT_TYPE_META, DIFFICULTY_META } from './eventTypes';
import { StatusBadge, DifficultyBadge, fmtNum, fmtUsd } from './eventUtils';
import { EventResultsPanel } from './EventResultsPanel';
import { toast } from 'sonner';

// ── Digit countdown ───────────────────────────────────────────────────────────

function CountdownBlock({ value, label }: { value: number; label: string }) {
  const s = String(value).padStart(2, '0');
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center font-black text-3xl sm:text-4xl text-foreground"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
        {s}
        {/* fold line */}
        <div className="absolute inset-x-0 top-1/2 h-px bg-black/30" />
      </div>
      <span className="text-[11px] text-muted-foreground uppercase tracking-widest">{label}</span>
    </div>
  );
}

function BigCountdown({ startAt, endAt, status }: { startAt: string; endAt: string; status: string }) {
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    const target = status === 'live' ? endAt : startAt;
    const calc   = () => setSecs(Math.max(0, Math.floor((new Date(target).getTime() - Date.now()) / 1000)));
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [startAt, endAt, status]);

  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;

  const label = status === 'live' ? 'Time Remaining' : 'Starts In';

  return (
    <div className="rounded-3xl p-6 sm:p-8 text-center"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <p className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-6">{label}</p>
      <div className="flex items-end justify-center gap-3 sm:gap-5">
        <CountdownBlock value={d} label="Days" />
        <span className="text-3xl font-black text-muted-foreground mb-4">:</span>
        <CountdownBlock value={h} label="Hours" />
        <span className="text-3xl font-black text-muted-foreground mb-4">:</span>
        <CountdownBlock value={m} label="Mins" />
        <span className="text-3xl font-black text-muted-foreground mb-4">:</span>
        <CountdownBlock value={s} label="Secs" />
      </div>
    </div>
  );
}

// ── How it works ──────────────────────────────────────────────────────────────

const HOW_IT_WORKS: Record<string, string[]> = {
  weekend_warrior: [
    'Challenge starts Saturday 00:00 UTC',
    'Trade any supported asset (BTC, ETH, BNB, SOL)',
    'Your ROI is calculated over 48 hours',
    'Top 100 traders share the prize pool',
    'Winners announced Monday 00:00 UTC',
  ],
  monthly_championship: [
    'Championship runs for the full calendar month',
    'Trade freely across all available pairs',
    'Your best 7-day rolling return counts as final score',
    'Minimum 20 completed trades required',
    'Top performers earn CP prizes and badge rewards',
  ],
  team_battle: [
    'Form or join a 5-person team before the event starts',
    'Team captain sets the overall strategy',
    'Each member trades independently',
    'Average team return determines ranking',
    'Winning team splits the prize pool equally',
  ],
  live_webinar: [
    'Join the live stream at event start time',
    'Interact with speakers via live Q&A chat',
    'Ask questions and vote on Q&A queue topics',
    'Stay 30+ minutes to earn the attendance badge',
    'Recording available 24 hours after the event',
  ],
  flash_challenge: [
    'Register before the challenge window opens',
    'Challenge activates at the scheduled start time',
    'Trade the designated asset pair only',
    'Highest ROI within the time window wins',
    'Rewards distributed automatically on completion',
  ],
  market_analysis_live: [
    'AI models run live during the 1-hour session',
    'Real-time analysis across 50+ asset pairs',
    'Ask the AI questions via the chat interface',
    'Full PDF analytical report sent after the session',
    'Attendance badge awarded automatically',
  ],
};

// ── Prize tiers ───────────────────────────────────────────────────────────────

function PrizeTier({ rank, icon, label, value }: { rank: string; icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-4 py-3 border-b border-border last:border-0">
      <span className="text-2xl shrink-0">{icon}</span>
      <div className="flex-1">
        <p className="text-sm font-black text-foreground">{rank}</p>
        <p className="text-[10px] text-muted-foreground">{label}</p>
      </div>
      <p className="text-sm font-black text-amber-400 shrink-0">{value}</p>
    </div>
  );
}

// ── Rule row ──────────────────────────────────────────────────────────────────

function RuleRow({ allowed, text }: { allowed: boolean; text: string }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-white/4 last:border-0">
      {allowed
        ? <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
        : <XCircle    className="h-4 w-4 text-red-400 shrink-0" />}
      <p className="text-sm text-foreground">{text}</p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getEvent, isJoined, registerWithServer, leaveEvent } = useEventsStore();
  const { user } = useAuthStore();
  const [joining, setJoining] = useState(false);

  const event = getEvent(id ?? '');

  if (!event) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-foreground font-black text-xl">Event not found</p>
        <button onClick={() => navigate('/events')} className="text-primary underline text-sm">← Back to Events</button>
      </div>
    );
  }

  const meta   = EVENT_TYPE_META[event.type];
  const joined = isJoined(event.id);

  async function handleJoin() {
    if (!user || !event) return;
    setJoining(true);
    const result = await registerWithServer(event.id, user.id, user.displayName);
    setJoining(false);
    if (result.ok) toast.success(result.message);
    else toast.error(result.message);
  }

  function handleShare() {
    navigator.clipboard?.writeText(window.location.href);
    toast.success('Link copied!');
  }

  const howItWorks = HOW_IT_WORKS[event.type] ?? HOW_IT_WORKS.flash_challenge;

  // Build rule rows from event.rules
  const allowedRules = event.rules.filter(r => !r.label.toLowerCase().includes('no ') && !r.value.toLowerCase().startsWith('no '));
  const bannedRules  = event.rules.filter(r => r.label.toLowerCase().includes('disqualified') || r.value.toLowerCase().startsWith('no '));

  // Format prize rows
  const prizeRows = event.rewards
    .filter(r => r.rank !== 'all')
    .sort((a, b) => (typeof a.rank === 'number' ? a.rank : 999) - (typeof b.rank === 'number' ? b.rank : 999));
  const allParticipantRewards = event.rewards.filter(r => r.rank === 'all');

  return (
    <div className="space-y-6">

      {/* Back + share header */}
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/events')}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Events
        </button>
        <button onClick={handleShare}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/4 border border-white/8 text-xs font-bold hover:bg-white/8 transition-colors">
          <Share2 className="h-3.5 w-3.5" /> Share
        </button>
      </div>

      {/* Event overview */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className={cn('rounded-3xl overflow-hidden bg-gradient-to-br', event.coverGradient)}
        style={{ border: `1px solid ${event.accentColor}25` }}>

        <div className="flex flex-col sm:flex-row gap-6 p-6 sm:p-8">

          {/* Left: event info */}
          <div className="flex-1 space-y-4">
            <div className="flex items-start gap-3">
              <span className="text-5xl">{event.icon}</span>
              <div>
                <h1 className="text-2xl font-black text-white">{event.title}</h1>
                <p className="text-sm text-white/70">{event.subtitle}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Type',          value: event.isTeamEvent ? 'Team Challenge' : 'Individual Challenge' },
                { label: 'Entry Fee',     value: 'FREE' },
                { label: 'Prize Pool',    value: event.prizePool > 0 ? `${fmtUsd(event.prizePool)} CP` : 'Free' },
              ].map(s => (
                <div key={s.label} className="px-3 py-2 rounded-xl bg-black/25 backdrop-blur border border-white/8">
                  <p className="text-[9px] text-white/40 uppercase tracking-wider">{s.label}</p>
                  <p className="text-sm font-black text-white">{s.value}</p>
                </div>
              ))}
            </div>

            <div className="flex gap-2 flex-wrap">
              <StatusBadge status={event.status} />
              <DifficultyBadge difficulty={event.difficulty} />
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: `${meta.color}15`, color: meta.color }}>
                {meta.icon} {meta.label}
              </span>
            </div>
          </div>

          {/* Right: status block */}
          <div className="sm:w-52 space-y-2 text-sm">
            {[
              { label: 'Status',    value: event.status.charAt(0).toUpperCase() + event.status.slice(1) },
              { label: 'Starts',    value: new Date(event.startAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' UTC' },
              { label: 'Duration',  value: event.durationLabel },
              { label: 'Max Participants', value: event.maxParticipants ? fmtNum(event.maxParticipants) : 'Unlimited' },
              { label: 'Registered', value: fmtNum(event.currentParticipants) },
            ].map(s => (
              <div key={s.label} className="flex justify-between items-center py-1.5 border-b border-white/8 last:border-0">
                <span className="text-white/50 text-xs">{s.label}</span>
                <span className="text-white font-bold text-xs">{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Countdown */}
      {event.status !== 'completed' && event.status !== 'cancelled' && (
        <BigCountdown startAt={event.startAt} endAt={event.endAt} status={event.status} />
      )}

      {/* How It Works */}
      <div className="rounded-3xl p-6"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <p className="text-sm font-black text-foreground mb-4">How It Works</p>
        <ol className="space-y-3">
          {howItWorks.map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center font-black text-xs text-white"
                style={{ background: meta.color }}>{i + 1}</span>
              <p className="text-sm text-muted-foreground pt-0.5">{step}</p>
            </li>
          ))}
        </ol>
      </div>

      {/* Prize Distribution */}
      {event.prizePool > 0 && (
        <div className="rounded-3xl p-6"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-sm font-black text-foreground mb-4">Prize Distribution</p>

          {prizeRows.map((r, i) => (
            <PrizeTier
              key={i}
              icon={r.icon}
              rank={`Rank ${r.rank}`}
              label={r.label}
              value={r.type === 'virtual_cash' ? `${fmtUsd(r.value)} CP`
                : r.type === 'xp' ? `+${fmtNum(r.value)} XP`
                : r.label}
            />
          ))}

          {allParticipantRewards.map((r, i) => (
            <PrizeTier
              key={`all-${i}`}
              icon={r.icon}
              rank="All Participants"
              label={r.label}
              value={r.type === 'virtual_cash' ? `${fmtUsd(r.value)} CP`
                : r.type === 'xp' ? `+${fmtNum(r.value)} XP`
                : r.label}
            />
          ))}
        </div>
      )}

      {/* Rules & Restrictions */}
      <div className="rounded-3xl p-6"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <p className="text-sm font-black text-foreground mb-4">Rules & Restrictions</p>

        {/* Allowed */}
        {event.rules.filter(r => !r.label.toLowerCase().includes('disqualified')).map((r, i) => (
          <RuleRow key={i} allowed text={`${r.label}: ${r.value}`} />
        ))}

        {/* Banned */}
        {['No wash trading', 'No multiple accounts', 'No price manipulation'].map((rule, i) => (
          <RuleRow key={`ban-${i}`} allowed={false} text={rule} />
        ))}

        <div className="mt-4 flex items-start gap-2 p-3 rounded-xl bg-amber-500/5 border border-amber-500/15">
          <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            Violations result in immediate disqualification. All decisions by event moderators are final.
          </p>
        </div>
      </div>

      {/* Speakers (webinars) */}
      {event.speakers && event.speakers.length > 0 && (
        <div className="rounded-3xl p-6"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-sm font-black text-foreground mb-4">Speakers</p>
          <div className="space-y-4">
            {event.speakers.map(sp => (
              <div key={sp.name} className="flex gap-4 items-start">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-sm text-white shrink-0"
                  style={{ background: meta.color }}>{sp.avatar}</div>
                <div>
                  <p className="font-black text-foreground">{sp.name}</p>
                  <p className="text-xs font-bold" style={{ color: meta.color }}>{sp.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{sp.bio}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results panel (completed events only) */}
      {event.status === 'completed' && <EventResultsPanel event={event} />}

      {/* CTA row */}
      <div className="flex flex-wrap gap-3 pb-4">
        {event.status === 'completed' ? (
          <>
            <button onClick={() => navigate(`/events/${event.id}/leaderboard`)}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-sm text-white"
              style={{ background: meta.color }}>
              <Trophy className="h-5 w-5" /> View Final Results
            </button>
          </>
        ) : joined ? (
          <>
            <button onClick={() => navigate(
              event.type === 'team_battle'       ? `/events/team-battle/${event.id}` :
              event.type === 'live_webinar' || event.type === 'market_analysis_live' ? `/events/webinar/${event.id}` :
              event.type === 'flash_challenge'   ? `/events/flash/${event.id}` :
              `/events/${event.id}/leaderboard`
            )}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-sm text-white"
              style={{ background: meta.color }}>
              <Play className="h-5 w-5" />
              {event.status === 'live' ? 'Go to Event' : 'View Registration'}
            </button>
            <button onClick={() => navigate(`/events/${event.id}/leaderboard`)}
              className="px-5 py-3.5 rounded-2xl font-bold text-sm border border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20 transition-colors">
              Leaderboard
            </button>
          </>
        ) : (
          <>
            <button onClick={handleJoin} disabled={joining}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-sm text-white transition-all',
                joining ? 'opacity-60' : 'hover:brightness-110',
              )}
              style={{ background: meta.color }}>
              {joining
                ? <><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />Registering…</>
                : event.status === 'live'
                ? <><Play className="h-5 w-5" />Join Now</>
                : <><Star className="h-5 w-5" />Register Now</>}
            </button>
            <button
              onClick={() => { navigator.clipboard?.writeText(window.location.href); toast.success('Invite link copied!'); }}
              className="px-5 py-3.5 rounded-2xl font-bold text-sm border border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground transition-colors">
              Invite Friends
            </button>
            <button
              onClick={() => { handleJoin(); }}
              className="px-5 py-3.5 rounded-2xl font-bold text-sm border border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground transition-colors">
              <Calendar className="h-4 w-4 inline mr-1.5" />Add to Calendar
            </button>
          </>
        )}
      </div>

    </div>
  );
}
