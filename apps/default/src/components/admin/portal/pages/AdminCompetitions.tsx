import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Users, DollarSign, Play, Square, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminPortalStore } from '@/lib/adminPortalStore';
import { useAdminAuthStore } from '@/lib/adminAuthStore';
import { useEventsStore } from '../../../events/eventStore';

const STATUS_STYLE = {
  live:      'bg-green-500/10 border-green-500/20 text-green-400',
  completed: 'bg-white/5 border-white/10 text-white/30',
  upcoming:  'bg-blue-500/10 border-blue-500/20 text-blue-400',
  cancelled: 'bg-orange-500/10 border-orange-500/20 text-orange-400',
};

/**
 * Competition Management is a live view over the same event data that
 * powers Events Management (LiveEvent records) — competitions and events
 * are the same underlying feature, so this page no longer keeps a
 * separate fabricated dataset. It adds the Two-Man-Rule deletion
 * safeguard on top of the real event list.
 */
export function AdminCompetitions() {
  const { events } = useEventsStore();
  const { twoManRequests, requestTwoMan } = useAdminPortalStore();
  const { session } = useAdminAuthStore();
  const [requested, setRequested] = useState<Set<string>>(new Set());

  const active   = events.filter(e => e.status === 'live').length;
  const upcoming = events.filter(e => e.status === 'upcoming').length;
  const totalParticipants = events.reduce((s, e) => s + e.currentParticipants, 0);
  const totalPrize = events.reduce((s, e) => s + e.prizePool, 0);

  const handleDeleteRequest = (ev: typeof events[0]) => {
    requestTwoMan({
      action:        'delete_competition',
      requesterId:   session?.adminId ?? '',
      requesterName: session?.displayName ?? '',
      targetId:      ev.id,
      targetLabel:   ev.title,
      reason:        'Admin-initiated deletion of active competition/event',
    });
    setRequested(prev => new Set([...prev, ev.id]));
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div>
        <h1 className="text-lg font-bold text-white flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-400" /> Competition Management
        </h1>
        <p className="text-xs text-white/30 mt-1">
          Live data from Events Management — competitions and events share the same records.
          Use Events Management to create, edit, or force start/end.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Active',       value: active,           color: '#34d399', icon: Play },
          { label: 'Upcoming',     value: upcoming,         color: '#60a5fa', icon: Play },
          { label: 'Participants', value: totalParticipants.toLocaleString(), color: '#a78bfa', icon: Users },
          { label: 'Total Prize',  value: `${totalPrize.toLocaleString()} CP`, color: '#f59e0b', icon: DollarSign },
        ].map(k => (
          <div key={k.label} className="bg-white/[0.03] border border-white/8 rounded-2xl p-4">
            <k.icon className="h-4 w-4 mb-2" style={{ color: k.color }} />
            <p className="text-xl font-bold text-white font-mono">{k.value}</p>
            <p className="text-xs text-white/40 mt-0.5">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Competition cards */}
      {events.length === 0 ? (
        <div className="text-center py-16 text-white/30">
          <Trophy className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No competitions yet. Create one from Events Management.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {events.map(ev => {
            const isRequested = requested.has(ev.id);
            const hasTwoMan = twoManRequests.some(r => r.targetId === ev.id && r.status === 'pending');

            return (
              <motion.div key={ev.id} layout
                className="p-5 rounded-2xl border border-white/5 bg-white/[0.02] transition-all">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0 text-lg">
                      {ev.icon}
                    </div>
                    <div>
                      <p className="font-semibold text-white text-sm">{ev.title}</p>
                      <span className={cn('text-[10px] px-2 py-0.5 rounded-full border capitalize mt-1 inline-flex', STATUS_STYLE[ev.status])}>
                        {ev.status}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  {[
                    { label: 'Participants', value: ev.currentParticipants.toLocaleString(), icon: Users },
                    { label: 'Prize Pool',   value: `${ev.prizePool.toLocaleString()} CP`, icon: DollarSign },
                  ].map(s => (
                    <div key={s.label} className="bg-white/3 rounded-xl p-2.5 text-center">
                      <p className="text-sm font-bold text-white font-mono">{s.value}</p>
                      <p className="text-[10px] text-white/30 mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between text-[11px] text-white/30 mb-3">
                  <span>{new Date(ev.startAt).toLocaleDateString()} →</span>
                  <span>{new Date(ev.endAt).toLocaleDateString()}</span>
                </div>

                {ev.status === 'live' && (
                  <div className="flex gap-2">
                    {isRequested || hasTwoMan ? (
                      <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/8 border border-amber-500/15 rounded-xl px-3 py-2 w-full">
                        <ShieldAlert className="h-3.5 w-3.5 flex-shrink-0" />
                        Two-man approval pending
                      </div>
                    ) : (
                      <button onClick={() => handleDeleteRequest(ev)}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-all">
                        <Square className="h-3.5 w-3.5" /> Request Deletion (2-man rule)
                      </button>
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
