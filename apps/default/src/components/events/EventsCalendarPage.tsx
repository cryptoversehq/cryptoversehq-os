/**
 * EventsCalendarPage.tsx — Spec §3.7
 * Monthly calendar grid with event dots, view toggle, upcoming week strip
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, Calendar, List, Clock,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useEventsStore } from './eventStore';
import { LiveEvent, EVENT_TYPE_META } from './eventTypes';
import { StatusBadge } from './eventUtils';

// ── Emoji legend ──────────────────────────────────────────────────────────────

const TYPE_EMOJI: Record<string, string> = {
  flash_challenge:      '🎯',
  weekend_warrior:      '🏆',
  monthly_championship: '🏆',
  team_battle:          '🛡️',
  live_webinar:         '📺',
  market_analysis_live: '📊',
};

// ── Day cell ──────────────────────────────────────────────────────────────────

function DayCell({
  day, events, isToday, isOtherMonth, onSelect,
}: {
  day: Date; events: LiveEvent[]; isToday: boolean; isOtherMonth: boolean; onSelect: (d: Date) => void;
}) {
  const hasEvents = events.length > 0;

  return (
    <div
      onClick={() => hasEvents && onSelect(day)}
      className={cn(
        'min-h-[72px] p-2 rounded-xl transition-all',
        isOtherMonth ? 'opacity-25' : '',
        isToday ? 'ring-2 ring-primary/40' : '',
        hasEvents ? 'cursor-pointer hover:bg-secondary/30' : '',
      )}
      style={{ background: isToday ? 'rgba(99,102,241,0.06)' : 'var(--bg-card)' }}>

      <p className={cn(
        'text-[11px] font-bold mb-1',
        isToday ? 'text-primary font-black' : 'text-muted-foreground',
      )}>
        {day.getDate()}
      </p>

      <div className="space-y-0.5">
        {events.slice(0, 2).map(ev => (
          <div key={ev.id} className="flex items-center gap-1">
            <span className="text-[10px]">{TYPE_EMOJI[ev.type] ?? '🎯'}</span>
            <span className="text-[9px] text-foreground/70 truncate">{ev.title.replace(/^[^\w]*/, '').slice(0, 12)}</span>
          </div>
        ))}
        {events.length > 2 && (
          <p className="text-[9px] text-muted-foreground">+{events.length - 2} more</p>
        )}
      </div>
    </div>
  );
}

// ── Upcoming event row ─────────────────────────────────────────────────────────

function UpcomingRow({ event }: { event: LiveEvent }) {
  const navigate = useNavigate();
  const meta = EVENT_TYPE_META[event.type];
  const dt   = new Date(event.startAt);
  const dateStr = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const timeStr = dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="flex items-center gap-4 py-3 border-b border-white/4 last:border-0 cursor-pointer hover:bg-white/2 px-4 transition-colors rounded-xl"
      onClick={() => navigate(`/events/${event.id}`)}>
      <div className="w-14 text-center shrink-0">
        <p className="text-[10px] font-black" style={{ color: meta.color }}>{dateStr}</p>
        <p className="text-[9px] text-muted-foreground">{timeStr}</p>
      </div>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-xl shrink-0">{event.icon}</span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground truncate">{event.title}</p>
          <p className="text-[10px] text-muted-foreground">{meta.label} · {event.durationLabel}</p>
        </div>
      </div>
      <StatusBadge status={event.status} />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function EventsCalendarPage() {
  const navigate = useNavigate();
  const { events } = useEventsStore();
  const [viewDate, setViewDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'list'>('month');
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const today  = new Date();
  const year   = viewDate.getFullYear();
  const month  = viewDate.getMonth();

  // Build calendar grid (6 weeks × 7 days)
  const firstDay  = new Date(year, month, 1);
  const lastDay   = new Date(year, month + 1, 0);
  // Start on Monday
  const startWd   = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(firstDay);
  gridStart.setDate(gridStart.getDate() - startWd);

  const weeks: Date[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + w * 7 + d);
      week.push(date);
    }
    weeks.push(week);
  }

  // Map events to dates
  function eventsOnDay(day: Date): LiveEvent[] {
    return events.filter(ev => {
      const start = new Date(ev.startAt);
      const end   = new Date(ev.endAt);
      const d     = new Date(day);
      d.setHours(0, 0, 0, 0);
      const s = new Date(start); s.setHours(0, 0, 0, 0);
      const e = new Date(end);   e.setHours(23, 59, 59, 999);
      return d >= s && d <= e;
    });
  }

  function prevMonth() { setViewDate(new Date(year, month - 1, 1)); }
  function nextMonth() { setViewDate(new Date(year, month + 1, 1)); }

  // Upcoming this week
  const weekStart = new Date(today); weekStart.setHours(0, 0, 0, 0);
  const weekEnd   = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7);
  const thisWeek  = events
    .filter(ev => new Date(ev.startAt) >= weekStart && new Date(ev.startAt) <= weekEnd)
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

  // Day detail
  const dayEvents = selectedDay ? eventsOnDay(selectedDay) : [];

  const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  const competitions = [
    { id: 'ww_1', date: 'Sat, Aug 12 · 14:00 UTC', name: 'Weekend Warrior #48', prizePool: '15,000' },
    { id: 'mc_1', date: 'Mon, Aug 14 · 00:00 UTC', name: 'Monthly Grand Prix', prizePool: '100,000' },
    { id: 'fc_1', date: 'Thu, Aug 17 · 18:00 UTC', name: 'Flash Sprint BTC', prizePool: '5,000' },
  ];

  return (
    <div className="space-y-6">

      {/* ── Competition Calendar (Fix 1) ── */}
      <div className="competition-calendar rounded-2xl border border-border bg-card p-5 space-y-3 shadow-sm">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          📅 Competition Calendar — Upcoming Battles
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {competitions.map(comp => (
            <div key={comp.id} className="calendar-event rounded-xl border border-border bg-secondary/20 p-3 flex flex-col justify-between gap-2">
              <div>
                <span className="text-[11px] font-semibold text-primary block">{comp.date}</span>
                <span className="text-xs font-bold text-foreground block mt-0.5">{comp.name}</span>
                <span className="text-[11px] text-amber-500 font-semibold block mt-1">🏆 {comp.prizePool} CP Pool</span>
              </div>
              <button
                onClick={() => navigate(`/events/${comp.id}`)}
                className="w-full py-1.5 rounded-lg text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Join Competition
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Calendar className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-black text-foreground">Events Calendar</h2>
        </div>
        {/* View toggle */}
        <div className="flex gap-1 p-1 rounded-xl bg-white/4 border border-border">
          <button onClick={() => setViewMode('month')}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
              viewMode === 'month' ? 'bg-secondary/50 text-foreground' : 'text-muted-foreground hover:text-foreground')}>
            <Calendar className="h-3.5 w-3.5" /> Month
          </button>
          <button onClick={() => setViewMode('list')}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
              viewMode === 'list' ? 'bg-secondary/50 text-foreground' : 'text-muted-foreground hover:text-foreground')}>
            <List className="h-3.5 w-3.5" /> List
          </button>
        </div>
      </div>

      {viewMode === 'month' ? (
        <>
          {/* Calendar */}
          <div className="rounded-3xl overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.06)' }}>

            {/* Month nav */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <button onClick={prevMonth}
                className="p-2 rounded-xl hover:bg-white/8 transition-colors text-muted-foreground">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <p className="font-black text-foreground">{MONTHS[month]} {year}</p>
              <button onClick={nextMonth}
                className="p-2 rounded-xl hover:bg-white/8 transition-colors text-muted-foreground">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 gap-0 px-3 py-2 border-b border-border">
              {DAYS.map(d => (
                <div key={d} className="text-center text-[10px] font-black text-muted-foreground uppercase tracking-wider py-1">{d}</div>
              ))}
            </div>

            {/* Grid */}
            <div className="p-3">
              {weeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 gap-1 mb-1">
                  {week.map((day, di) => {
                    const dayEvs  = eventsOnDay(day);
                    const isToday = day.toDateString() === today.toDateString();
                    const isOther = day.getMonth() !== month;
                    return (
                      <DayCell key={di} day={day} events={dayEvs}
                        isToday={isToday} isOtherMonth={isOther}
                        onSelect={setSelectedDay} />
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="px-5 py-3 border-t border-border flex flex-wrap gap-3">
              {Object.entries(TYPE_EMOJI).slice(0, 4).map(([type, emoji]) => (
                <span key={type} className="text-[10px] text-muted-foreground flex items-center gap-1">
                  {emoji} {EVENT_TYPE_META[type as keyof typeof EVENT_TYPE_META]?.label ?? type}
                </span>
              ))}
            </div>
          </div>

          {/* Day detail popup */}
          {selectedDay && dayEvents.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl p-4 space-y-3"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-black text-foreground">
                  {selectedDay.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </p>
                <button onClick={() => setSelectedDay(null)} className="text-muted-foreground hover:text-foreground text-xs">✕</button>
              </div>
              {dayEvents.map(ev => (
                <div key={ev.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/3 cursor-pointer hover:bg-secondary/30 transition-colors"
                  onClick={() => navigate(`/events/${ev.id}`)}>
                  <span className="text-xl">{ev.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{ev.title}</p>
                    <p className="text-[10px] text-muted-foreground">{ev.durationLabel} · {ev.prize}</p>
                  </div>
                  <StatusBadge status={ev.status} />
                </div>
              ))}
            </motion.div>
          )}
        </>
      ) : (
        /* List view */
        <div className="space-y-2">
          {events
            .filter(ev => ev.status !== 'completed')
            .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
            .map(ev => (
              <div key={ev.id} className="flex items-center gap-4 p-4 rounded-2xl cursor-pointer hover:bg-white/3 transition-colors"
                style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}
                onClick={() => navigate(`/events/${ev.id}`)}>
                <span className="text-2xl">{ev.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-foreground truncate">{ev.title}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {new Date(ev.startAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {ev.durationLabel}
                  </p>
                </div>
                <StatusBadge status={ev.status} />
              </div>
            ))}
        </div>
      )}

      {/* Upcoming this week */}
      <div className="rounded-3xl overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <p className="text-sm font-black text-foreground">Upcoming This Week</p>
        </div>
        {thisWeek.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground text-center">No events this week.</p>
        ) : (
          <div className="px-2 py-2">
            {thisWeek.map(ev => <UpcomingRow key={ev.id} event={ev} />)}
          </div>
        )}
      </div>
    </div>
  );
}
