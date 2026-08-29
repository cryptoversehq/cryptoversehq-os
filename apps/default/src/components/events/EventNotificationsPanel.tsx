/**
 * EventNotificationsPanel.tsx — Slide-in notifications + in-app alert bell
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, CheckCheck, Trophy, Zap, Users, Award, Clock } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useEventsStore } from './eventStore';
import { EventNotification } from './eventTypes';

const TYPE_ICONS: Record<EventNotification['type'], React.ElementType> = {
  start:       Zap,
  end_soon:    Clock,
  rank_change: Trophy,
  team_invite: Users,
  reward:      Award,
};

function NotifCard({ notif, onRead }: { notif: EventNotification; onRead: () => void }) {
  const Icon = TYPE_ICONS[notif.type];
  const age  = (() => {
    const ms = Date.now() - new Date(notif.timestamp).getTime();
    const m = Math.floor(ms / 60000);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  })();

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
      className={cn(
        'flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all hover:bg-secondary/20',
        !notif.read ? 'bg-secondary/20' : 'opacity-60',
      )}
      onClick={onRead}>
      <div className={cn('p-2 rounded-lg shrink-0', !notif.read ? 'bg-primary/15' : 'bg-secondary/20')}>
        <Icon className={cn('h-3.5 w-3.5', !notif.read ? 'text-primary' : 'text-muted-foreground')} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-black text-foreground leading-tight">{notif.title}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{notif.body}</p>
        <p className="text-[10px] text-muted-foreground/60 mt-1">{age}</p>
      </div>
      {!notif.read && (
        <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1" />
      )}
    </motion.div>
  );
}

interface Props {
  trigger?: React.ReactNode;
}

export function EventNotificationBell() {
  const { notifications, markNotificationRead, markAllRead, getUnreadCount } = useEventsStore();
  const [open, setOpen] = useState(false);
  const unread = getUnreadCount();

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-xl bg-white/4 hover:bg-white/8 border border-white/6 transition-colors">
        <Bell className="h-4 w-4 text-foreground" />
        {unread > 0 ? (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-red-500 text-[9px] font-black text-white px-1">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              className="absolute right-0 top-full mt-2 z-50 w-80 rounded-2xl overflow-hidden shadow-2xl"
              style={{ background: '#0d0d14', border: '1px solid rgba(255,255,255,0.08)' }}>

              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-primary" />
                  <span className="text-sm font-black text-foreground">Event Alerts</span>
                  {unread > 0 ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500 text-white font-bold">{unread}</span>
                  ) : null}
                </div>
                <div className="flex items-center gap-1">
                  {unread > 0 ? (
                    <button onClick={() => { markAllRead(); }}
                      className="text-[10px] text-primary hover:underline font-bold">
                      Mark all read
                    </button>
                  ) : null}
                  <button onClick={() => setOpen(false)} className="p-1 text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* List */}
              <div className="max-h-80 overflow-y-auto p-2 space-y-1">
                {notifications.length === 0 ? (
                  <div className="py-8 text-center">
                    <Bell className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                    <p className="text-xs text-muted-foreground">No notifications yet</p>
                  </div>
                ) : notifications.map(n => (
                  <NotifCard key={n.id} notif={n} onRead={() => markNotificationRead(n.id)} />
                ))}
              </div>

              {/* Footer */}
              <div className="px-4 py-2.5 border-t border-white/5">
                <p className="text-[10px] text-muted-foreground text-center">
                  Push notifications available via browser settings
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Floating toast-style event alert ──────────────────────────────────────────

export function EventAlertToasts() {
  const { notifications } = useEventsStore();
  const recent = notifications.filter(n => {
    const age = Date.now() - new Date(n.timestamp).getTime();
    return age < 300000 && !n.read; // last 5 min, unread
  }).slice(0, 2);

  return (
    <div className="fixed bottom-20 right-4 z-40 space-y-2 pointer-events-none">
      <AnimatePresence>
        {recent.map(n => (
          <motion.div
            key={n.id}
            initial={{ opacity: 0, x: 60 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 60 }}
            className="flex items-start gap-3 p-3 rounded-xl shadow-lg pointer-events-auto max-w-[300px]"
            style={{ background: '#0d0d14', border: '1px solid rgba(255,255,255,0.1)' }}>
            <span className="text-xl">{n.icon}</span>
            <div className="flex-1">
              <p className="text-xs font-black text-foreground">{n.title}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
