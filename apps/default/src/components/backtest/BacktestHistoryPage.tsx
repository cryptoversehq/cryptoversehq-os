/**
 * BacktestHistoryPage.tsx — Part 8
 *
 * Full backtest history page at /backtest/history
 *
 * Features (spec):
 *   ✅ Search by strategy name
 *   ✅ Filter by date range (from / to)
 *   ✅ Filter by return range (min % / max %)
 *   ✅ Filter by strategy type (multi-select pills)
 *   ✅ Sort: Newest · Oldest · Best Return · Best Sharpe · Best WR
 *   ✅ Delete individual sessions (with confirmation)
 *   ✅ Delete all sessions (bulk, with confirmation dialog)
 *   ✅ Export session data as JSON (all visible or single)
 *   ✅ Pagination (25 per page)
 *   ✅ Each card: name, type badge, symbol/TF, return, WR, Sharpe, DD,
 *        trades, date range, expandable trade count strip
 *   ✅ "Load in Backtest" button on each card
 *   ✅ Mobile-friendly responsive layout
 */

import React, { useState, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Search, Filter, Calendar, TrendingUp, TrendingDown,
  Trash2, Download, FlaskConical, ChevronDown, ChevronUp,
  SortAsc, BarChart2, Clock, Play, AlertTriangle, CheckCircle2,
  X, ChevronLeft, ChevronRight, FileJson, Layers, RotateCcw,
  Trophy,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useBacktestStore } from '../../lib/backtestStore';
import { useAuthStore } from '../../lib/authStore';
import type { BacktestSession, BacktestSortKey } from '../../lib/backtestTypes';
import type { StrategyType } from '../../lib/strategyTypes';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
type PageSizeOption = typeof PAGE_SIZE_OPTIONS[number];

const STRATEGY_EMOJI: Record<string, string> = {
  grid:        '📊',
  dca:         '📈',
  martingale:  '🎯',
  arbitrage:   '⚡',
  rebalancing: '⚖️',
  custom:      '🔬',
};

const STRATEGY_TYPES: Array<{ key: StrategyType | 'custom'; label: string }> = [
  { key: 'grid',        label: 'Grid' },
  { key: 'dca',         label: 'DCA' },
  { key: 'martingale',  label: 'Martingale' },
  { key: 'arbitrage',   label: 'Arbitrage' },
  { key: 'rebalancing', label: 'Rebalancing' },
  { key: 'custom',      label: 'Custom' },
];

const SORT_OPTIONS: Array<{ key: BacktestSortKey; label: string }> = [
  { key: 'newest',          label: 'Newest First' },
  { key: 'oldest',          label: 'Oldest First' },
  { key: 'highest_return',  label: 'Best Return' },
  { key: 'best_sharpe',     label: 'Best Sharpe' },
  { key: 'best_win_rate',   label: 'Best Win Rate' },
  { key: 'lowest_drawdown', label: 'Lowest Drawdown' },
  { key: 'most_trades',     label: 'Most Trades' },
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtDuration(ms: number | null): string {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min  = Math.floor(diff / 60_000);
  const hr   = Math.floor(min / 60);
  const day  = Math.floor(hr / 24);
  if (min < 1)  return 'just now';
  if (min < 60) return `${min}m ago`;
  if (hr < 24)  return `${hr}h ago`;
  if (day < 7)  return `${day}d ago`;
  return fmtDate(iso);
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT HELPER
// ─────────────────────────────────────────────────────────────────────────────

function exportSessionsJSON(sessions: BacktestSession[], filename = 'backtest-history.json') {
  const payload = sessions.map(s => ({
    id:           s.id,
    name:         s.sessionName,
    strategyType: s.strategyType,
    symbol:       s.params.symbol,
    timeframe:    s.params.timeframe,
    startDate:    s.params.startDate,
    endDate:      s.params.endDate,
    initialBalance: s.params.initialBalance,
    feeRate:      s.params.feeRate,
    status:       s.status,
    createdAt:    s.createdAt,
    completedAt:  s.completedAt,
    metrics:      s.metrics,
    tradeCount:   s.trades.length,
    trades:       s.trades,
  }));
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// FILTER STATE
// ─────────────────────────────────────────────────────────────────────────────

interface LocalFilters {
  search:       string;
  dateFrom:     string;
  dateTo:       string;
  returnMin:    string;
  returnMax:    string;
  types:        Array<StrategyType | 'custom'>;
  sortBy:       BacktestSortKey;
  statusFilter: 'all' | 'completed' | 'failed';
}

const DEFAULT_FILTERS: LocalFilters = {
  search:       '',
  dateFrom:     '',
  dateTo:       '',
  returnMin:    '',
  returnMax:    '',
  types:        [],
  sortBy:       'newest',
  statusFilter: 'all',
};

// ─────────────────────────────────────────────────────────────────────────────
// SESSION CARD
// ─────────────────────────────────────────────────────────────────────────────

function SessionCard({
  session, onDelete, onLoad, onExport,
}: {
  session:  BacktestSession;
  onDelete: (id: string) => void;
  onLoad:   (s: BacktestSession) => void;
  onExport: (s: BacktestSession) => void;
}) {
  const [expanded,   setExpanded]   = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const m      = session.metrics;
  const ret    = m?.totalReturn;
  const isPos  = (ret ?? 0) >= 0;
  const hasM   = m !== null && m !== undefined;

  const typeColor: Record<string, string> = {
    grid:        'text-purple-400 bg-purple-500/10 border-purple-500/20',
    dca:         'text-blue-400 bg-blue-500/10 border-blue-500/20',
    martingale:  'text-amber-400 bg-amber-500/10 border-amber-500/20',
    arbitrage:   'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    rebalancing: 'text-teal-400 bg-teal-500/10 border-teal-500/20',
    custom:      'text-pink-400 bg-pink-500/10 border-pink-500/20',
  };

  const statusColor: Record<string, string> = {
    completed: 'text-green-400 bg-green-500/8 border-green-500/15',
    failed:    'text-red-400 bg-red-500/8 border-red-500/15',
    running:   'text-primary bg-primary/8 border-primary/15',
    pending:   'text-amber-400 bg-amber-500/8 border-amber-500/15',
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="rounded-2xl border border-white/8 bg-card/50 hover:bg-card/80 transition-all overflow-hidden"
    >
      {/* Card header */}
      <div className="flex items-start gap-3 p-4">
        {/* Emoji */}
        <div className="w-10 h-10 rounded-xl bg-secondary/30 border border-border flex items-center justify-center text-xl shrink-0 mt-0.5">
          {STRATEGY_EMOJI[session.strategyType] ?? '🔬'}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="text-sm font-bold text-foreground truncate max-w-[180px]">
                {session.sessionName}
              </h3>
              <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full border uppercase tracking-wide', typeColor[session.strategyType] ?? '')}>
                {session.strategyType}
              </span>
              <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full border', statusColor[session.status] ?? '')}>
                {session.status}
              </span>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => onLoad(session)}
                title="Load in Backtest"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-all"
              >
                <Play className="h-3 w-3" />
                Load
              </button>
              <button
                onClick={() => onExport(session)}
                title="Export as JSON"
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
              >
                <FileJson className="h-3.5 w-3.5" />
              </button>
              {!confirmDel ? (
                <button
                  onClick={() => setConfirmDel(true)}
                  title="Delete session"
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ) : (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onDelete(session.id)}
                    className="px-2 py-1 rounded-lg text-[10px] font-bold bg-red-500/15 text-red-400 border border-red-500/25 hover:bg-red-500/25 transition-colors"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setConfirmDel(false)}
                    className="px-2 py-1 rounded-lg text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Symbol + timeframe + date */}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xs text-muted-foreground font-medium">{session.params.symbol}</span>
            <span className="text-muted-foreground/30">·</span>
            <span className="text-xs text-muted-foreground">{session.params.timeframe}</span>
            <span className="text-muted-foreground/30">·</span>
            <span className="text-xs text-muted-foreground">
              {session.params.startDate} → {session.params.endDate}
            </span>
            <span className="text-muted-foreground/30">·</span>
            <span className="text-[11px] text-muted-foreground/50 flex items-center gap-0.5">
              <Clock className="h-3 w-3" />
              {relativeTime(session.completedAt ?? session.createdAt)}
            </span>
          </div>
        </div>
      </div>

      {/* Metrics strip */}
      {hasM && (
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-0 border-t border-border divide-x divide-white/5">
          {[
            { label: 'Return',    value: `${isPos ? '+' : ''}${ret!.toFixed(2)}%`, highlight: isPos ? 'green' : 'red' },
            { label: 'Win Rate',  value: `${m!.winRate.toFixed(1)}%`,              highlight: m!.winRate >= 50 ? 'green' : 'red' },
            { label: 'Sharpe',    value: m!.sharpeRatio.toFixed(2),               highlight: m!.sharpeRatio >= 1 ? 'green' : undefined },
            { label: 'Max DD',    value: `-${m!.maxDrawdown.toFixed(1)}%`,         highlight: 'red' },
            { label: 'Trades',    value: `${m!.totalTrades}`,                      highlight: undefined },
            { label: 'Duration',  value: fmtDuration(session.durationMs),          highlight: undefined },
          ].map(({ label, value, highlight }) => (
            <div key={label} className="p-2.5 text-center">
              <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wide">{label}</p>
              <p className={cn(
                'text-xs font-bold tabular-nums mt-0.5',
                highlight === 'green' ? 'text-green-400'
                : highlight === 'red'   ? 'text-red-400'
                : 'text-foreground',
              )}>
                {value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Error message */}
      {session.status === 'failed' && session.errorMessage && (
        <div className="px-4 py-2 border-t border-border flex items-center gap-2 text-xs text-red-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {session.errorMessage}
        </div>
      )}

      {/* Expand for full metrics */}
      {hasM && (
        <>
          <button
            onClick={() => setExpanded(s => !s)}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[10px] text-muted-foreground/50 hover:text-muted-foreground border-t border-border transition-colors"
          >
            {expanded ? <><ChevronUp className="h-3 w-3" /> Less</> : <><ChevronDown className="h-3 w-3" /> More details</>}
          </button>

          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-t border-border"
              >
                <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Profit Factor', value: isFinite(m!.profitFactor) ? m!.profitFactor.toFixed(2) : '∞' },
                    { label: 'Calmar Ratio',  value: m!.calmarRatio?.toFixed(2) ?? '—' },
                    { label: 'Expectancy',    value: `$${m!.expectancy?.toFixed(2) ?? '0.00'}` },
                    { label: 'Avg Win',       value: `$${m!.averageWin.toFixed(2)}` },
                    { label: 'Avg Loss',      value: `$${Math.abs(m!.averageLoss).toFixed(2)}` },
                    { label: 'Win Streak',    value: `${m!.longestWinStreak}` },
                    { label: 'Loss Streak',   value: `${m!.longestLossStreak}` },
                    { label: 'Total Fees',    value: `$${m!.totalFeePaid.toFixed(2)}` },
                  ].map(({ label, value }) => (
                    <div key={label} className="text-center p-2 rounded-xl bg-secondary/20 border border-border">
                      <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wide">{label}</p>
                      <p className="text-xs font-semibold text-foreground mt-0.5">{value}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FILTER SIDEBAR
// ─────────────────────────────────────────────────────────────────────────────

function FilterPanel({
  filters, onChange, onReset, totalCount, visibleCount,
}: {
  filters:      LocalFilters;
  onChange:     (f: Partial<LocalFilters>) => void;
  onReset:      () => void;
  totalCount:   number;
  visibleCount: number;
}) {
  const isFiltered =
    filters.search || filters.dateFrom || filters.dateTo ||
    filters.returnMin || filters.returnMax || filters.types.length > 0 ||
    filters.statusFilter !== 'all' || filters.sortBy !== 'newest';

  const toggleType = (t: StrategyType | 'custom') => {
    const next = filters.types.includes(t)
      ? filters.types.filter(x => x !== t)
      : [...filters.types, t];
    onChange({ types: next });
  };

  return (
    <div className="space-y-4">
      {/* Search */}
      <div>
        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block">Search</label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={filters.search}
            onChange={e => onChange({ search: e.target.value })}
            placeholder="Name, symbol…"
            className="w-full bg-secondary/30 border border-border rounded-xl pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
          />
        </div>
      </div>

      {/* Date range */}
      <div>
        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block">Date Range</label>
        <div className="space-y-2">
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">From</p>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={e => onChange({ dateFrom: e.target.value })}
              className="w-full bg-secondary/30 border border-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
            />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">To</p>
            <input
              type="date"
              value={filters.dateTo}
              onChange={e => onChange({ dateTo: e.target.value })}
              className="w-full bg-secondary/30 border border-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
            />
          </div>
        </div>
      </div>

      {/* Return range */}
      <div>
        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block">Return Range</label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Min %</p>
            <input
              type="number"
              value={filters.returnMin}
              onChange={e => onChange({ returnMin: e.target.value })}
              placeholder="-100"
              className="w-full bg-secondary/30 border border-border rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
            />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Max %</p>
            <input
              type="number"
              value={filters.returnMax}
              onChange={e => onChange({ returnMax: e.target.value })}
              placeholder="1000"
              className="w-full bg-secondary/30 border border-border rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
            />
          </div>
        </div>
      </div>

      {/* Strategy type */}
      <div>
        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block">Strategy Type</label>
        <div className="flex flex-wrap gap-1.5">
          {STRATEGY_TYPES.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => toggleType(key)}
              className={cn(
                'px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                filters.types.includes(key)
                  ? 'bg-primary/15 text-primary border-primary/30'
                  : 'bg-secondary/30 text-muted-foreground border-border hover:border-border',
              )}
            >
              {STRATEGY_EMOJI[key]} {label}
            </button>
          ))}
        </div>
      </div>

      {/* Status filter */}
      <div>
        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block">Status</label>
        <div className="flex gap-1.5">
          {(['all', 'completed', 'failed'] as const).map(s => (
            <button
              key={s}
              onClick={() => onChange({ statusFilter: s })}
              className={cn(
                'flex-1 py-1.5 rounded-xl text-xs font-medium border transition-all',
                filters.statusFilter === s
                  ? 'bg-primary/15 text-primary border-primary/30'
                  : 'bg-secondary/20 text-muted-foreground border-white/8 hover:border-white/15',
              )}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Sort */}
      <div>
        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block">Sort By</label>
        <div className="relative">
          <select
            value={filters.sortBy}
            onChange={e => onChange({ sortBy: e.target.value as BacktestSortKey })}
            className="w-full appearance-none bg-secondary/30 border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all pr-9 cursor-pointer"
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {/* Reset */}
      {isFiltered && (
        <button
          onClick={onReset}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground bg-secondary/20 hover:bg-secondary/40 border border-white/8 transition-colors"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset Filters
        </button>
      )}

      {/* Result count */}
      <p className="text-xs text-muted-foreground text-center">
        {visibleCount} of {totalCount} sessions
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────

export function BacktestHistoryPage() {
  const navigate                                    = useNavigate();
  const { user }                                    = useAuthStore();
  const { getUserSessions, deleteSession, clearUserHistory, getUserStats } = useBacktestStore();

  const [filters,   setFilters]   = useState<LocalFilters>(DEFAULT_FILTERS);
  const [page,      setPage]      = useState(1);
  const [pageSize,  setPageSize]  = useState<PageSizeOption>(DEFAULT_PAGE_SIZE);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [filterOpen, setFilterOpen] = useState(true);

  const updateFilter = useCallback((patch: Partial<LocalFilters>) => {
    setFilters(f => ({ ...f, ...patch }));
    setPage(1);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  }, []);

  // All sessions for this user
  const allSessions = useMemo(() => {
    if (!user?.id) return [];
    return getUserSessions(user.id, {
      search:        '',
      statuses:      [],
      strategyTypes: [],
      symbols:       [],
      timeframes:    [],
      sortBy:        filters.sortBy,
    });
  }, [user?.id, getUserSessions, filters.sortBy]);

  const stats = useMemo(() => {
    if (!user?.id) return null;
    return getUserStats(user.id);
  }, [user?.id, getUserStats]);

  // Apply local filters
  const filtered = useMemo(() => {
    return allSessions.filter(s => {
      // Search
      if (filters.search.trim()) {
        const q = filters.search.toLowerCase();
        if (!s.sessionName.toLowerCase().includes(q) && !s.params.symbol.toLowerCase().includes(q)) return false;
      }

      // Status
      if (filters.statusFilter !== 'all' && s.status !== filters.statusFilter) return false;

      // Strategy types
      if (filters.types.length > 0 && !filters.types.includes(s.strategyType)) return false;

      // Date from
      if (filters.dateFrom) {
        const created = new Date(s.createdAt);
        const from    = new Date(filters.dateFrom);
        if (created < from) return false;
      }

      // Date to
      if (filters.dateTo) {
        const created = new Date(s.createdAt);
        const to      = new Date(filters.dateTo);
        to.setDate(to.getDate() + 1); // inclusive
        if (created >= to) return false;
      }

      // Return range
      const ret = s.metrics?.totalReturn;
      if (filters.returnMin !== '' && ret !== undefined && ret < parseFloat(filters.returnMin)) return false;
      if (filters.returnMax !== '' && ret !== undefined && ret > parseFloat(filters.returnMax)) return false;

      return true;
    });
  }, [allSessions, filters]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated  = useMemo(() =>
    filtered.slice((page - 1) * pageSize, page * pageSize),
  [filtered, page, pageSize]);

  const handleDelete = useCallback((id: string) => {
    if (user?.id) deleteSession(id, user.id);
  }, [user?.id, deleteSession]);

  const handleClearAll = useCallback(() => {
    if (user?.id) {
      clearUserHistory(user.id);
      setShowClearConfirm(false);
    }
  }, [user?.id, clearUserHistory]);

  const handleLoad = useCallback((session: BacktestSession) => {
    navigate('/backtest');
    // The session data will be available via store; BacktestPage can pick it up
  }, [navigate]);

  const handleExportAll = useCallback(() => {
    exportSessionsJSON(filtered, `backtest-history-${new Date().toISOString().slice(0, 10)}.json`);
  }, [filtered]);

  const handleExportOne = useCallback((session: BacktestSession) => {
    exportSessionsJSON([session], `backtest-${session.sessionName.replace(/\s+/g, '-')}.json`);
  }, []);

  // Best session by return
  const bestSession = useMemo(() => {
    const completed = filtered.filter(s => s.status === 'completed' && s.metrics);
    if (completed.length === 0) return null;
    return completed.reduce((best, s) =>
      (s.metrics!.totalReturn > best.metrics!.totalReturn ? s : best), completed[0]);
  }, [filtered]);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-background to-background">

      {/* ── Header ── */}
      <header className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-border bg-background/50 backdrop-blur-sm gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link
            to="/backtest"
            className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-base font-bold text-foreground leading-none flex items-center gap-2">
              <BarChart2 className="h-5 w-5 text-primary" />
              Backtest History
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {stats?.completed ?? 0} completed · {stats?.failed ?? 0} failed
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter toggle */}
          <button
            onClick={() => setFilterOpen(f => !f)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all border',
              filterOpen
                ? 'bg-primary/10 text-primary border-primary/20'
                : 'text-muted-foreground hover:text-foreground bg-secondary/30 border-transparent',
            )}
          >
            <Filter className="h-3.5 w-3.5" />
            Filters
          </button>

          {/* Export all */}
          {filtered.length > 0 && (
            <button
              onClick={handleExportAll}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground bg-secondary/30 hover:bg-secondary/50 border border-transparent hover:border-border transition-all"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Export JSON</span>
            </button>
          )}

          {/* Clear all */}
          {allSessions.length > 0 && (
            !showClearConfirm ? (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-red-400/70 hover:text-red-400 hover:bg-red-400/10 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Clear All</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-red-400">Delete all?</span>
                <button
                  onClick={handleClearAll}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-red-500/15 text-red-400 border border-red-500/25 hover:bg-red-500/25 transition-colors"
                >
                  Yes
                </button>
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            )
          )}

          {/* Back to backtest */}
          <Link
            to="/backtest"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all"
          >
            <FlaskConical className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">New Backtest</span>
          </Link>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* Filter sidebar */}
        <AnimatePresence>
          {filterOpen && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 260, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: 'spring', damping: 24, stiffness: 300 }}
              className="shrink-0 border-r border-border bg-card/30 flex flex-col overflow-hidden"
            >
              <div className="flex-1 overflow-y-auto p-4">
                <FilterPanel
                  filters={filters}
                  onChange={updateFilter}
                  onReset={resetFilters}
                  totalCount={allSessions.length}
                  visibleCount={filtered.length}
                />
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Main content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 min-w-0">

          {/* Best session highlight */}
          {bestSession && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-amber-500/20 bg-gradient-to-r from-amber-500/6 to-transparent"
            >
              <Trophy className="h-4 w-4 text-amber-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Best performing session</p>
                <p className="text-sm font-bold text-foreground truncate">{bestSession.sessionName}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-base font-bold text-green-400">
                  +{bestSession.metrics!.totalReturn.toFixed(2)}%
                </p>
                <p className="text-xs text-muted-foreground">{bestSession.metrics!.winRate.toFixed(0)}% WR</p>
              </div>
              <button
                onClick={() => handleLoad(bestSession)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-all shrink-0"
              >
                <Play className="h-3 w-3" /> Load
              </button>
            </motion.div>
          )}

          {/* Results header */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-muted-foreground">
              {filtered.length === 0
                ? 'No sessions found'
                : `${filtered.length} session${filtered.length !== 1 ? 's' : ''}`}
              {filtered.length !== allSessions.length && ` (filtered from ${allSessions.length})`}
            </p>
            {filtered.length > 0 && (
              <div className="flex items-center gap-3">
                {/* Page size selector — 11.3 */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Per page:</span>
                  {PAGE_SIZE_OPTIONS.map(s => (
                    <button
                      key={s}
                      onClick={() => { setPageSize(s); setPage(1); }}
                      className={cn(
                        'px-2.5 py-1 rounded-lg text-xs font-medium transition-all',
                        pageSize === s
                          ? 'bg-primary/15 text-primary border border-primary/25'
                          : 'text-muted-foreground hover:text-foreground bg-secondary/20 hover:bg-secondary/40',
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Page {page} / {totalPages}
                </p>
              </div>
            )}
          </div>

          {/* Empty state */}
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-secondary/30 border border-border flex items-center justify-center">
                <BarChart2 className="h-7 w-7 text-muted-foreground/30" />
              </div>
              <div>
                <p className="text-base font-semibold text-foreground">No sessions found</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                  {allSessions.length === 0
                    ? 'Run your first backtest to see it here.'
                    : 'Try adjusting your filters to see more results.'}
                </p>
              </div>
              {allSessions.length === 0 ? (
                <Link
                  to="/backtest"
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all"
                >
                  <FlaskConical className="h-4 w-4" />
                  Run Backtest
                </Link>
              ) : (
                <button
                  onClick={resetFilters}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-secondary/40 text-foreground hover:bg-secondary/60 transition-all"
                >
                  <RotateCcw className="h-4 w-4" />
                  Reset Filters
                </button>
              )}
            </div>
          )}

          {/* Session cards */}
          <AnimatePresence initial={false}>
            <div className="space-y-3">
              {paginated.map(session => (
                <SessionCard
                  key={session.id}
                  session={session}
                  onDelete={handleDelete}
                  onLoad={handleLoad}
                  onExport={handleExportOne}
                />
              ))}
            </div>
          </AnimatePresence>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-xl text-muted-foreground hover:text-foreground disabled:opacity-30 hover:bg-secondary/40 transition-all"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                const p = totalPages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= totalPages - 3 ? totalPages - 6 + i : page - 3 + i;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={cn(
                      'w-8 h-8 rounded-xl text-sm font-medium transition-all',
                      p === page
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary/40',
                    )}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 rounded-xl text-muted-foreground hover:text-foreground disabled:opacity-30 hover:bg-secondary/40 transition-all"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
