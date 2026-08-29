import React, { useRef, useEffect } from 'react';
import { Bell, X, CheckCheck, Trash2, TrendingUp, TrendingDown, AlertTriangle, Trophy, Info, RefreshCw, DollarSign, PauseCircle, PlayCircle, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore, AppNotification } from '@/lib/appStore';
import { formatDistanceToNow } from 'date-fns';

// Matches both legacy types and copy-trading specific message signatures
function typeIcon(type: AppNotification['type'], title: string) {
  // Copy trading event detection from title prefix
  if (title.startsWith('📋') || title.includes('Trade Copied'))  return <RefreshCw className="h-4 w-4" style={{ color: '#60a5fa' }} />;
  if (title.startsWith('👥') || title.includes('Follower'))      return <Trophy className="h-4 w-4" style={{ color: '#FFD700' }} />;
  if (title.startsWith('⏸') || title.includes('Paused'))        return <PauseCircle className="h-4 w-4" style={{ color: '#fbbf24' }} />;
  if (title.startsWith('▶️') || title.includes('Resumed'))       return <PlayCircle className="h-4 w-4 text-emerald-400" />;
  if (title.startsWith('⚠️') || title.includes('Warning'))       return <AlertTriangle className="h-4 w-4 text-amber-400" />;
  if (title.startsWith('💰') || title.includes('Fee Earned'))    return <DollarSign className="h-4 w-4" style={{ color: '#FFD700' }} />;
  if (title.startsWith('🛑') || title.includes('Stop Loss'))     return <ShieldAlert className="h-4 w-4 text-red-400" />;
  if (title.startsWith('📊') || title.includes('Summary'))       return <TrendingUp className="h-4 w-4" style={{ color: '#34d399' }} />;

  switch (type) {
    case 'trade':        return <TrendingUp className="h-4 w-4 text-blue-400" />;
    case 'liquidation':  return <AlertTriangle className="h-4 w-4 text-red-400" />;
    case 'achievement':  return <Trophy className="h-4 w-4 text-amber-400" />;
    default:             return <Info className="h-4 w-4 text-muted-foreground" />;
  }
}

function typeBg(type: AppNotification['type'], title: string) {
  if (title.startsWith('🛑') || title.includes('Stop Loss') || title.includes('Paused'))
    return 'bg-red-500/10 border-red-500/20';
  if (title.startsWith('💰') || title.includes('Fee Earned') || title.startsWith('👥'))
    return 'bg-yellow-500/10 border-yellow-500/20';
  if (title.startsWith('▶️') || title.includes('Resumed') || title.startsWith('📋'))
    return 'bg-emerald-500/10 border-emerald-500/20';
  if (title.startsWith('📊') || title.startsWith('⚠️'))
    return 'bg-purple-500/10 border-purple-500/20';

  switch (type) {
    case 'trade':        return 'bg-blue-500/10 border-blue-500/20';
    case 'liquidation':  return 'bg-red-500/10 border-red-500/20';
    case 'achievement':  return 'bg-amber-500/10 border-amber-500/20';
    default:             return 'bg-secondary/30 border-white/5';
  }
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function NotificationPanel({ open, onClose }: Props) {
  const { notifications, markAllRead, clearNotifications } = useAppStore();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const unread = notifications.filter(n => !n.read);
  const read   = notifications.filter(n => n.read);

  return (
    <div
      ref={panelRef}
      className="fixed top-20 right-4 z-50 w-[360px] max-h-[calc(100vh-6rem)] flex flex-col bg-card border border-white/10 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
        <h3 className="font-semibold flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          Notifications
          {unread.length > 0 && (
            <span className="px-1.5 py-0.5 bg-primary text-primary-foreground text-xs rounded-full font-bold">
              {unread.length}
            </span>
          )}
        </h3>
        <div className="flex items-center gap-1">
          {unread.length > 0 && (
            <button
              onClick={markAllRead}
              className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary/50 transition-colors"
              title="Mark all read"
            >
              <CheckCheck className="h-4 w-4" />
            </button>
          )}
          {notifications.length > 0 && (
            <button
              onClick={clearNotifications}
              className="p-1.5 text-muted-foreground hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors"
              title="Clear all"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary/50 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="overflow-y-auto flex-1">
        {notifications.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground text-sm">
            <Bell className="h-8 w-8 mx-auto mb-3 opacity-20" />
            <p>No notifications yet.</p>
            <p className="text-xs mt-1 opacity-60">Trade alerts will appear here.</p>
          </div>
        ) : (
          <>
            {unread.length > 0 && (
              <div>
                <p className="px-5 pt-3 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">New</p>
                {unread.map(n => (
                  <div
                    key={n.id}
                    className={cn('flex items-start gap-3 px-5 py-3.5 border-b border-white/5 hover:bg-secondary/10 transition-colors')}
                  >
                    <div className={cn('p-2 rounded-xl border flex-shrink-0 mt-0.5', typeBg(n.type, n.title))}>
                      {typeIcon(n.type, n.title)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-tight">{n.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{n.message}</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">
                        {formatDistanceToNow(n.timestamp, { addSuffix: true })}
                      </p>
                    </div>
                    <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-2" />
                  </div>
                ))}
              </div>
            )}
            {read.length > 0 && (
              <div>
                <p className="px-5 pt-3 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Earlier</p>
                {read.map(n => (
                  <div
                    key={n.id}
                    className="flex items-start gap-3 px-5 py-3 border-b border-white/5 opacity-60 hover:opacity-80 transition-opacity"
                  >
                    <div className={cn('p-1.5 rounded-xl border flex-shrink-0 mt-0.5', typeBg(n.type, n.title))}>
                      {typeIcon(n.type, n.title)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-tight">{n.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                      <p className="text-xs text-muted-foreground/50 mt-1">
                        {formatDistanceToNow(n.timestamp, { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
