/**
 * RecentBacktestsSidebar.tsx — Part 8
 *
 * Spec wireframe:
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  Recent Backtests                                           │
 *   ├─────────────────────────────────────────────────────────────┤
 *   │  📊 RSI Strategy                                            │
 *   │     +45.2% | 68% WR | 2 min ago                           │
 *   │  📈 MACD Crossover                                          │
 *   │     +52.1% | 72% WR | 1 hour                              │
 *   │  🔬 SMA Cross                                               │
 *   │     +38.7% | 61% WR | yesterday                           │
 *   │                                                             │
 *   │  [View All History →]                                      │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * Features:
 *   - Shows up to 5 most recent completed sessions
 *   - Strategy-type emoji mapping
 *   - Relative time (2 min ago / 1 hr / yesterday / 3 days ago / date)
 *   - Return coloured green/red, win rate, trade count
 *   - Click row → loads session config back into backtest (via onLoad)
 *   - "View All History →" navigates to /backtest/history
 *   - Animated entry on mount; empty state when no sessions
 *   - Live refresh: re-renders whenever sessions list changes
 */

import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  ArrowRight, FlaskConical, TrendingUp, TrendingDown,
  Clock, BarChart2, Trash2, AlertCircle,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useBacktestStore } from '../../lib/backtestStore';
import { useAuthStore } from '../../lib/authStore';
import type { BacktestSession } from '../../lib/backtestTypes';

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY EMOJI MAP
// ─────────────────────────────────────────────────────────────────────────────

const STRATEGY_EMOJI: Record<string, string> = {
  grid:        '📊',
  dca:         '📈',
  martingale:  '🎯',
  arbitrage:   '⚡',
  rebalancing: '⚖️',
  custom:      '🔬',
};

function strategyEmoji(type: string): string {
  return STRATEGY_EMOJI[type] ?? '🔬';
}

// ─────────────────────────────────────────────────────────────────────────────
// RELATIVE TIME
// ─────────────────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec  = Math.floor(diff / 1000);
  const min  = Math.floor(sec / 60);
  const hr   = Math.floor(min / 60);
  const day  = Math.floor(hr / 24);

  if (sec < 60)  return 'just now';
  if (min < 60)  return `${min} min ago`;
  if (hr === 1)  return '1 hour ago';
  if (hr < 24)   return `${hr} hours ago`;
  if (day === 1) return 'yesterday';
  if (day < 7)   return `${day} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ─────────────────────────────────────────────────────────────────────────────
// SINGLE SESSION ROW
// ─────────────────────────────────────────────────────────────────────────────

function SessionRow({
  session, onLoad, onDelete, index,
}: {
  session:  BacktestSession;
  onLoad:   (s: BacktestSession) => void;
  onDelete: (id: string) => void;
  index:    number;
}) {
  const ret    = session.metrics?.totalReturn;
  const wr     = session.metrics?.winRate;
  const trades = session.metrics?.totalTrades;
  const hasRet = ret !== undefined && ret !== null;
  const isPos  = hasRet && ret >= 0;
  const time   = session.completedAt ?? session.createdAt;

  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05, type: 'spring', damping: 24, stiffness: 300 }}
      className="group flex items-start gap-2.5 px-3 py-2.5 rounded-xl hover:bg-secondary/30 transition-all cursor-pointer"
      onClick={() => onLoad(session)}
    >
      {/* Emoji icon */}
      <div className="w-8 h-8 rounded-xl bg-secondary/40 border border-white/5 flex items-center justify-center text-base shrink-0 mt-0.5">
        {strategyEmoji(session.strategyType)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-foreground truncate leading-tight">
          {session.sessionName}
        </p>

        {session.status === 'completed' && hasRet ? (
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className={cn('text-[11px] font-bold tabular-nums', isPos ? 'text-green-400' : 'text-red-400')}>
              {isPos ? '+' : ''}{ret!.toFixed(1)}%
            </span>
            {wr !== undefined && (
              <>
                <span className="text-muted-foreground/40 text-[10px]">·</span>
                <span className="text-[10px] text-muted-foreground">{wr.toFixed(0)}% WR</span>
              </>
            )}
            {trades !== undefined && (
              <>
                <span className="text-muted-foreground/40 text-[10px]">·</span>
                <span className="text-[10px] text-muted-foreground">{trades}T</span>
              </>
            )}
          </div>
        ) : (
          <span className={cn(
            'text-[10px] font-medium px-1.5 py-0.5 rounded-full mt-0.5 inline-block',
            session.status === 'running' || session.status === 'pending'
              ? 'bg-primary/10 text-primary'
              : 'bg-red-500/10 text-red-400',
          )}>
            {session.status}
          </span>
        )}

        <p className="text-[10px] text-muted-foreground/50 mt-0.5 flex items-center gap-1">
          <Clock className="h-2.5 w-2.5" />
          {relativeTime(time)}
          <span className="text-muted-foreground/30 mx-0.5">·</span>
          {session.params.symbol}
        </p>
      </div>

      {/* Delete button — appears on hover */}
      <button
        onClick={e => { e.stopPropagation(); onDelete(session.id); }}
        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-muted-foreground/40 hover:text-red-400 hover:bg-red-400/10 transition-all shrink-0 mt-0.5"
        title="Delete session"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MINI STAT CHIP
// ─────────────────────────────────────────────────────────────────────────────

function StatChip({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="text-center">
      <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wide">{label}</p>
      <p className={cn('text-xs font-bold tabular-nums', good === true ? 'text-green-400' : good === false ? 'text-red-400' : 'text-foreground')}>
        {value}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN WIDGET
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  /** Called when user clicks a session row — lets BacktestPage reload its config */
  onLoad: (session: BacktestSession) => void;
}

export function RecentBacktestsSidebar({ onLoad }: Props) {
  const { user }                               = useAuthStore();
  const { getUserSessions, deleteSession, getUserStats } = useBacktestStore();

  const sessions = useMemo(() => {
    if (!user?.id) return [];
    return getUserSessions(user.id, {
      search: '', statuses: ['completed'], strategyTypes: [],
      symbols: [], timeframes: [], sortBy: 'newest',
    }).slice(0, 5);
  }, [user?.id, getUserSessions]);

  const stats = useMemo(() => {
    if (!user?.id) return null;
    return getUserStats(user.id);
  }, [user?.id, getUserStats]);

  const handleDelete = (id: string) => {
    if (user?.id) deleteSession(id, user.id);
  };

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2">
          <BarChart2 className="h-3.5 w-3.5 text-primary" />
          <h3 className="text-xs font-bold text-foreground uppercase tracking-wide">Recent Backtests</h3>
        </div>
        {sessions.length > 0 && (
          <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-semibold">
            {stats?.completed ?? sessions.length}
          </span>
        )}
      </div>

      {/* Session rows */}
      <div className="flex-1">
        <AnimatePresence initial={false}>
          {sessions.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-6 px-3 gap-2 text-center"
            >
              <div className="w-10 h-10 rounded-xl bg-secondary/20 border border-white/5 flex items-center justify-center">
                <FlaskConical className="h-4 w-4 text-muted-foreground/40" />
              </div>
              <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
                No completed backtests yet.
                <br />Run your first strategy above.
              </p>
            </motion.div>
          ) : (
            <div className="space-y-0.5 px-1">
              {sessions.map((s, i) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  onLoad={onLoad}
                  onDelete={handleDelete}
                  index={i}
                />
              ))}
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Summary stats strip */}
      {stats && stats.completed > 0 && (
        <div className="mx-3 mb-2 p-2.5 rounded-xl bg-secondary/15 border border-white/5 grid grid-cols-3 gap-2">
          <StatChip
            label="Avg Return"
            value={`${stats.avgReturn >= 0 ? '+' : ''}${stats.avgReturn.toFixed(1)}%`}
            good={stats.avgReturn >= 0}
          />
          <StatChip
            label="Avg WR"
            value={`${stats.avgWinRate.toFixed(0)}%`}
            good={stats.avgWinRate >= 50}
          />
          <StatChip label="Total" value={`${stats.completed}`} />
        </div>
      )}

      {/* View All History link */}
      <div className="px-3 pb-3">
        <Link
          to="/backtest/history"
          className="flex items-center justify-between w-full px-3 py-2 rounded-xl text-xs font-semibold text-primary bg-primary/8 border border-primary/15 hover:bg-primary/15 transition-all group"
        >
          <span>View All History</span>
          <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>
    </div>
  );
}
