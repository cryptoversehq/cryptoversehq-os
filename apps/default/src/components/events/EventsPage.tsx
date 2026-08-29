/**
 * EventsPage.tsx — Events router shell
 *
 * Routes (relative to /events):
 *   /events                    → EventsDashboard (§3.1)
 *   /events/calendar           → EventsCalendarPage (§3.7)
 *   /events/my                 → MyEventsPage
 *   /events/:id                → EventDetailPage (§3.2)
 *   /events/:id/leaderboard    → EventLeaderboardFullPage (§3.3)
 *   /events/team-battle/:id    → TeamBattleFullPage (§3.4)
 *   /events/webinar/:id        → LiveWebinarFullPage (§3.5)
 *   /events/flash/:id          → FlashChallengePage (§3.6)
 */
import React, { useEffect } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Calendar, Bell } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useEventsStore, startEventsTicker, stopEventsTicker } from './eventStore';
import { EventNotificationBell, EventAlertToasts } from './EventNotificationsPanel';
import { EventsDashboard }            from './EventsDashboard';
import { EventDetailPage }            from './EventDetailPage';
import { EventLeaderboardFullPage }   from './EventLeaderboardFullPage';
import { TeamBattleFullPage }         from './TeamBattleFullPage';
import { LiveWebinarFullPage }        from './LiveWebinarFullPage';
import { FlashChallengePage }        from './FlashChallengePage';
import { MyEventsPage }               from './MyEventsPage';
import { EventsCalendarPage }         from './EventsCalendarPage';
import { EventVerificationPage }      from './EventVerificationPage';

// ── Top nav ───────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { label: 'Dashboard', path: '' },
  { label: 'Calendar',  path: 'calendar' },
  { label: 'My Events', path: 'my' },
] as const;

function EventsNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { getLiveEvents, getUnreadCount, myEntries } = useEventsStore();
  const liveCount      = getLiveEvents().length;
  const unread         = getUnreadCount();
  const myEventsCount  = Object.keys(myEntries).length;

  // Current sub-path
  const base = '/events';
  const sub  = location.pathname.replace(base, '').replace(/^\//, '');

  function isActive(path: string) {
    if (path === '') return sub === '' || sub === '/';
    return sub.startsWith(path);
  }

  return (
    <div className="shrink-0 px-4 pt-4 pb-0 border-b border-border"
      style={{ background: 'var(--bg-secondary)', backdropFilter: 'blur(8px)' }}>

      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🏆</span>
          <h1 className="font-black text-foreground text-base">Live Events & Challenges</h1>
          {liveCount > 0 && (
            <span className="flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/25">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              {liveCount} LIVE
            </span>
          )}
        </div>
        <EventNotificationBell />
      </div>

      {/* Nav tabs */}
      <div className="flex overflow-x-auto -mb-px">
        {NAV_ITEMS.map(item => (
          <button
            key={item.path}
            onClick={() => navigate(`/events${item.path ? `/${item.path}` : ''}`)}
            className={cn(
              'relative flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold whitespace-nowrap transition-colors border-b-2',
              isActive(item.path)
                ? 'text-foreground border-primary'
                : 'text-muted-foreground border-transparent hover:text-foreground',
            )}>
            {item.label}
            {item.label === 'My Events' && myEventsCount > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-black">
                {myEventsCount}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Page wrapper ──────────────────────────────────────────────────────────────

function PageWrap({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className="p-4 sm:p-5 space-y-5">
      {children}
    </motion.div>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────────

export function EventsPage() {
  useEffect(() => {
    startEventsTicker();
    return () => stopEventsTicker();
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <EventsNav />

      <div className="flex-1 overflow-y-auto">
        <Routes>
          {/* §3.1 Dashboard */}
          <Route index element={<PageWrap><EventsDashboard /></PageWrap>} />

          {/* §3.7 Calendar */}
          <Route path="calendar" element={<PageWrap><EventsCalendarPage /></PageWrap>} />

          {/* My events */}
          <Route path="my" element={<PageWrap><MyEventsPage /></PageWrap>} />

          {/* §3.4 Team battle (must come before /:id) */}
          <Route path="team-battle/:id" element={<PageWrap><TeamBattleFullPage /></PageWrap>} />

          {/* §3.5 Webinar */}
          <Route path="webinar/:id" element={<PageWrap><LiveWebinarFullPage /></PageWrap>} />

          {/* §3.6 Flash challenge */}
          <Route path="flash/:id" element={<PageWrap><FlashChallengePage /></PageWrap>} />

          {/* §3.3 Leaderboard */}
          <Route path=":id/leaderboard" element={<PageWrap><EventLeaderboardFullPage /></PageWrap>} />

          {/* §7 Verification */}
          <Route path="verify" element={<PageWrap><EventVerificationPage /></PageWrap>} />

          {/* §3.2 Detail */}
          <Route path=":id" element={<PageWrap><EventDetailPage /></PageWrap>} />
        </Routes>
      </div>

      <EventAlertToasts />
    </div>
  );
}
