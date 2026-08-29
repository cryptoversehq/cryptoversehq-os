/**
 * MarketplaceNotificationBell.tsx — §6
 * A self-contained notification bell for the marketplace.
 * Reads MarketplaceNotification[] from strategyStore and renders a dropdown.
 */
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell, X, CheckCheck, CheckCircle, XCircle, ShoppingBag,
  Star, AlertTriangle, Info,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useStrategyStore, MarketplaceNotification } from '../../lib/strategyStore';
import { useAuthStore } from '../../lib/authStore';
import { CV } from './MarketplaceUtils';

// ── Icon / colour per notification type ──────────────────────────────────────

function notifMeta(type: MarketplaceNotification['type']): {
  icon: React.ReactNode;
  bg: string;
} {
  switch (type) {
    case 'strategy_published':
      return {
        icon: <CheckCircle className="h-4 w-4 text-emerald-400" />,
        bg: 'bg-emerald-500/10 border-emerald-500/20',
      };
    case 'strategy_rejected':
      return {
        icon: <XCircle className="h-4 w-4 text-red-400" />,
        bg: 'bg-red-500/10 border-red-500/20',
      };
    case 'strategy_pending':
      return {
        icon: <Info className="h-4 w-4 text-blue-400" />,
        bg: 'bg-blue-500/10 border-blue-500/20',
      };
    case 'strategy_purchased':
      return {
        icon: <ShoppingBag className="h-4 w-4 text-yellow-400" />,
        bg: 'bg-yellow-500/10 border-yellow-500/20',
      };
    case 'strategy_sold':
      return {
        icon: <Star className="h-4 w-4 text-yellow-400" />,
        bg: 'bg-yellow-500/10 border-yellow-500/20',
      };
    case 'strategy_flagged':
      return {
        icon: <AlertTriangle className="h-4 w-4 text-orange-400" />,
        bg: 'bg-orange-500/10 border-orange-500/20',
      };
    default:
      return {
        icon: <AlertTriangle className="h-4 w-4 text-muted-foreground" />,
        bg: 'bg-secondary/30 border-border',
      };
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export function MarketplaceNotificationBell() {
  const { user } = useAuthStore();
  const getNotifications   = useStrategyStore(s => s.getNotifications);
  const markNotificationRead = useStrategyStore(s => s.markNotificationRead);

  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const notifications = user ? getNotifications(user.id) : [];
  const unread = notifications.filter(n => !n.read);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const markAllRead = () => {
    unread.forEach(n => markNotificationRead(n.id));
  };

  if (!user) return null;

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(v => !v)}
        className="relative flex items-center justify-center w-9 h-9 rounded-xl transition-all"
        style={{
          background: open ? CV.goldAlpha : CV.surface,
          border: `1px solid ${open ? CV.goldBorder : CV.border}`,
        }}
        title="Marketplace notifications"
      >
        <Bell className="h-4 w-4" style={{ color: open ? CV.gold : CV.gray }} />
        {unread.length > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full flex items-center justify-center text-[9px] font-bold px-1"
            style={{ background: CV.gold, color: '#0A1929' }}
          >
            {unread.length > 9 ? '9+' : unread.length}
          </motion.span>
        )}
      </button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -8 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-12 z-50 w-80 max-h-[480px] flex flex-col rounded-2xl overflow-hidden shadow-2xl"
            style={{ background: 'var(--bg-card)', border: `1px solid ${CV.goldBorder}` }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b shrink-0"
              style={{ borderColor: CV.border }}>
              <h3 className="font-bold text-sm flex items-center gap-2 text-foreground">
                <Bell className="h-4 w-4" style={{ color: CV.gold }} />
                Marketplace
                {unread.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                    style={{ background: CV.goldAlpha, color: CV.gold, border: `1px solid ${CV.goldBorder}` }}>
                    {unread.length}
                  </span>
                )}
              </h3>
              <div className="flex items-center gap-1">
                {unread.length > 0 && (
                  <button onClick={markAllRead} title="Mark all read"
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors">
                    <CheckCheck className="h-3.5 w-3.5" />
                  </button>
                )}
                <button onClick={() => setOpen(false)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 scrollbar-thin">
              {notifications.length === 0 ? (
                <div className="py-14 text-center text-muted-foreground text-sm">
                  <Bell className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  <p>No notifications yet.</p>
                  <p className="text-xs mt-1 opacity-60">Strategy events appear here.</p>
                </div>
              ) : (
                <>
                  {/* Unread */}
                  {unread.length > 0 && (
                    <div>
                      <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        New
                      </p>
                      {unread.map(n => (
                        <NotifRow key={n.id} n={n} onRead={() => markNotificationRead(n.id)} />
                      ))}
                    </div>
                  )}
                  {/* Read */}
                  {notifications.filter(n => n.read).length > 0 && (
                    <div>
                      <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Earlier
                      </p>
                      {notifications.filter(n => n.read).map(n => (
                        <NotifRow key={n.id} n={n} onRead={() => {}} dimmed />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Individual notification row ───────────────────────────────────────────────

function NotifRow({
  n, onRead, dimmed = false,
}: { n: MarketplaceNotification; onRead: () => void; dimmed?: boolean }) {
  const meta = notifMeta(n.type);
  return (
    <button
      onClick={onRead}
      className="w-full flex items-start gap-3 px-4 py-3 border-b text-left transition-colors hover:bg-secondary/30"
      style={{ borderColor: 'var(--border-color)', opacity: dimmed ? 0.6 : 1 }}
    >
      <div className={`p-1.5 rounded-xl border flex-shrink-0 mt-0.5 ${meta.bg}`}>
        {meta.icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-foreground leading-tight">{n.message}</p>
        <p className="text-[10px] mt-1" style={{ color: CV.gray }}>
          {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
        </p>
      </div>
      {!dimmed && <span className="w-2 h-2 rounded-full bg-yellow-400 shrink-0 mt-2" />}
    </button>
  );
}
