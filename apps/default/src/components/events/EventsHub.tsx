/**
 * EventsHub.tsx — Browse, filter & search all events
 */
import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Search, Filter, Zap } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useEventsStore } from './eventStore';
import { EventType, EventStatus, EVENT_TYPE_META } from './eventTypes';
import { EventCard, EmptyState, SectionHeader, fmtNum } from './eventUtils';
import { EventDetailModal } from './EventDetailModal';

const TYPE_FILTERS: { id: EventType | 'all'; label: string; icon: string }[] = [
  { id: 'all',                   label: 'All Events',   icon: '🌐' },
  { id: 'flash_challenge',       label: 'Flash',        icon: '⚡' },
  { id: 'weekend_warrior',       label: 'Weekend',      icon: '⚔️' },
  { id: 'monthly_championship',  label: 'Monthly',      icon: '🏆' },
  { id: 'team_battle',           label: 'Teams',        icon: '🛡️' },
  { id: 'live_webinar',          label: 'Webinars',     icon: '🎙️' },
  { id: 'market_analysis_live',  label: 'AI Analysis',  icon: '📊' },
];

const STATUS_FILTERS: { id: EventStatus | 'all'; label: string }[] = [
  { id: 'all',       label: 'All' },
  { id: 'live',      label: '🔴 Live' },
  { id: 'upcoming',  label: '🔵 Upcoming' },
  { id: 'completed', label: '⚫ Past' },
];

export function EventsHub() {
  const { events, myEntries, getMyEntry } = useEventsStore();
  const [typeFilter,   setTypeFilter]   = useState<EventType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<EventStatus | 'all'>('all');
  const [search,       setSearch]       = useState('');
  const [selectedId,   setSelectedId]   = useState<string | null>(null);

  const filtered = useMemo(() => {
    return events
      .filter(e => typeFilter   === 'all' || e.type   === typeFilter)
      .filter(e => statusFilter === 'all' || e.status === statusFilter)
      .filter(e => !search || e.title.toLowerCase().includes(search.toLowerCase()) ||
                              e.tags.some(t => t.toLowerCase().includes(search.toLowerCase())))
      .sort((a, b) => {
        // live first, then upcoming, then completed
        const order: Record<typeof a.status, number> = { live: 0, upcoming: 1, completed: 2, cancelled: 3 };
        return order[a.status] - order[b.status];
      });
  }, [events, typeFilter, statusFilter, search]);

  // Featured / live banner events
  const liveNow     = events.filter(e => e.status === 'live');
  const featuredNow = events.filter(e => e.isFeatured && e.status !== 'completed');

  return (
    <div className="space-y-6">

      {/* Live NOW banner */}
      {liveNow.length > 0 && (
        <div className="rounded-2xl overflow-hidden relative"
          style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(239,68,68,0.04))', border: '1px solid rgba(239,68,68,0.2)' }}>
          <div className="px-5 py-3 flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400 animate-pulse shrink-0" />
            <p className="text-sm font-black text-red-400">
              {liveNow.length} event{liveNow.length > 1 ? 's' : ''} happening RIGHT NOW
            </p>
            <div className="ml-auto flex gap-2">
              {liveNow.map(e => (
                <button key={e.id} onClick={() => setSelectedId(e.id)}
                  className="text-[11px] font-bold px-3 py-1 rounded-full bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-colors border border-red-500/30">
                  {e.icon} {e.title}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Search + filters */}
      <div className="space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search events, tags…"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/3 border border-white/8 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40 transition-colors"
          />
        </div>

        {/* Type chips */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {TYPE_FILTERS.map(f => (
            <button key={f.id} onClick={() => setTypeFilter(f.id as EventType | 'all')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all',
                typeFilter === f.id
                  ? 'bg-primary text-white shadow-sm shadow-primary/30'
                  : 'bg-white/4 text-muted-foreground hover:bg-white/8 border border-white/6',
              )}>
              <span>{f.icon}</span> {f.label}
            </button>
          ))}
        </div>

        {/* Status chips */}
        <div className="flex gap-2 flex-wrap items-center">
          {STATUS_FILTERS.map(f => (
            <button key={f.id} onClick={() => setStatusFilter(f.id as EventStatus | 'all')}
              className={cn(
                'px-3 py-1 rounded-full text-[11px] font-bold transition-all',
                statusFilter === f.id
                  ? 'bg-foreground/10 text-foreground border border-white/20'
                  : 'text-muted-foreground hover:text-foreground',
              )}>
              {f.label}
            </button>
          ))}
          <span className="ml-auto text-[11px] text-muted-foreground">{fmtNum(filtered.length)} events</span>
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <EmptyState icon="🔭" title="No events found" body="Try adjusting your filters or check back later for new events." />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((ev, i) => {
            const entry = getMyEntry(ev.id);
            return (
              <motion.div key={ev.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <EventCard
                  event={ev}
                  joined={!!myEntries[ev.id]}
                  myScore={entry?.pnlPct}
                  myRank={entry?.currentRank}
                  onClick={() => setSelectedId(ev.id)}
                />
              </motion.div>
            );
          })}
        </div>
      )}

      {selectedId && (
        <EventDetailModal eventId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}
