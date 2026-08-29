/**
 * LoadStrategyPanel.tsx — Part 4.2
 *
 * Slide-in panel showing the user's strategy library:
 *   Tab 1 — "My Strategies"   → created by the user (all statuses)
 *   Tab 2 — "Purchased"       → marketplace strategies the user bought
 *
 * For each strategy:
 *   - Card with name, type badge, key metrics, tags
 *   - "Load" button → fires onLoad(strategy)
 *   - Expandable preview with full metrics breakdown
 *
 * One-click load sets the config on BacktestPage.
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, FolderOpen, ShoppingBag, Search, ChevronDown, ChevronUp,
  TrendingUp, TrendingDown, Zap, Shield, Target, Play,
  Tag, Star, Clock, BarChart2, Globe, Lock, CheckCircle2,
  AlertTriangle, RefreshCw,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useStrategyStore } from '../../lib/strategyStore';
import { useAuthStore } from '../../lib/authStore';
import type { Strategy, StrategyPurchase } from '../../lib/strategyTypes';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  open:    boolean;
  onClose: () => void;
  onLoad:  (strategy: Strategy) => void;
}

type Tab = 'mine' | 'purchased';

// ─────────────────────────────────────────────────────────────────────────────
// RISK + STATUS HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const RISK_COLORS: Record<string, string> = {
  'low':       'text-green-400 bg-green-500/10 border-green-500/20',
  'medium':    'text-blue-400 bg-blue-500/10 border-blue-500/20',
  'high':      'text-amber-400 bg-amber-500/10 border-amber-500/20',
  'very-high': 'text-red-400 bg-red-500/10 border-red-500/20',
};

const TYPE_COLORS: Record<string, string> = {
  grid:       'text-purple-400 bg-purple-500/10 border-purple-500/20',
  dca:        'text-blue-400 bg-blue-500/10 border-blue-500/20',
  martingale: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  arbitrage:  'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  custom:     'text-pink-400 bg-pink-500/10 border-pink-500/20',
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft:     { label: 'Draft',     className: 'text-muted-foreground bg-secondary/40 border-white/10' },
  pending:   { label: 'In Review', className: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  approved:  { label: 'Published', className: 'text-green-400 bg-green-500/10 border-green-500/20' },
  rejected:  { label: 'Rejected',  className: 'text-red-400 bg-red-500/10 border-red-500/20' },
  suspended: { label: 'Suspended', className: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
};

// ─────────────────────────────────────────────────────────────────────────────
// METRIC CHIP
// ─────────────────────────────────────────────────────────────────────────────

function MetricChip({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className={cn('text-xs font-bold tabular-nums', positive === true ? 'text-green-400' : positive === false ? 'text-red-400' : 'text-foreground')}>
        {value}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY CARD
// ─────────────────────────────────────────────────────────────────────────────

function StrategyCard({
  strategy, onLoad, isPurchased,
}: {
  strategy:    Strategy;
  onLoad:      (s: Strategy) => void;
  isPurchased: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const statusCfg = STATUS_CONFIG[strategy.status] ?? STATUS_CONFIG.draft;
  const riskClass = RISK_COLORS[strategy.riskLevel] ?? RISK_COLORS.medium;
  const typeClass = TYPE_COLORS[strategy.type] ?? TYPE_COLORS.custom;
  const isPos     = strategy.totalProfitPct >= 0;

  return (
    <div className="rounded-xl border border-white/8 bg-secondary/10 hover:bg-secondary/20 transition-colors overflow-hidden">
      {/* Card header */}
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full border uppercase tracking-wide', typeClass)}>
                {strategy.type}
              </span>
              <span className={cn('text-[9px] font-semibold px-1.5 py-0.5 rounded-full border', statusCfg.className)}>
                {statusCfg.label}
              </span>
              {isPurchased && (
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full border text-sky-400 bg-sky-500/10 border-sky-500/20 flex items-center gap-0.5">
                  <ShoppingBag className="h-2.5 w-2.5" /> Owned
                </span>
              )}
            </div>
            <h3 className="text-sm font-semibold text-foreground leading-tight truncate">{strategy.name}</h3>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
              {strategy.shortDescription}
            </p>
          </div>

          {/* Load button */}
          <button
            onClick={() => onLoad(strategy)}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary/15 border border-primary/25 text-primary hover:bg-primary/25 transition-all"
          >
            <Play className="h-3 w-3" />
            Load
          </button>
        </div>

        {/* Key metric row */}
        <div className="grid grid-cols-4 gap-2 p-2.5 rounded-lg bg-background/30 border border-white/5">
          <MetricChip label="Return"  value={`${isPos ? '+' : ''}${strategy.totalProfitPct.toFixed(1)}%`} positive={isPos} />
          <MetricChip label="Win Rate" value={`${strategy.winRate.toFixed(0)}%`} positive={strategy.winRate >= 50} />
          <MetricChip label="Sharpe"  value={strategy.sharpeRatio.toFixed(2)} positive={strategy.sharpeRatio >= 1} />
          <MetricChip label="Max DD"  value={`-${strategy.maxDrawdown.toFixed(1)}%`} positive={strategy.maxDrawdown < 15} />
        </div>

        {/* Tags + expand toggle */}
        <div className="flex items-center justify-between mt-2.5">
          <div className="flex gap-1 flex-wrap flex-1 min-w-0">
            {strategy.tags.slice(0, 4).map(tag => (
              <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-full bg-secondary/30 text-muted-foreground border border-white/5">
                {tag}
              </span>
            ))}
            {strategy.tags.length > 4 && (
              <span className="text-[9px] text-muted-foreground/60">+{strategy.tags.length - 4}</span>
            )}
          </div>
          <button
            onClick={() => setExpanded(s => !s)}
            className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 ml-2 shrink-0 transition-colors"
          >
            {expanded ? 'Less' : 'Preview'}
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {/* Expanded preview */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-white/5"
          >
            <div className="p-3.5 space-y-3">
              {/* Extended metrics */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Total Trades',  value: strategy.totalTrades.toString() },
                  { label: 'Avg Duration',  value: `${Math.round(strategy.avgTradeDuration)}min` },
                  { label: 'Backtest Days', value: `${strategy.backtestPeriodDays}d` },
                  { label: 'Risk Level',    value: strategy.riskLevel },
                  { label: 'Rating',        value: strategy.ratingCount > 0 ? `${strategy.rating.toFixed(1)} ★` : 'No ratings' },
                  { label: 'Price',         value: strategy.price === 0 ? 'Free' : `${strategy.price} CP` },
                ].map(({ label, value }) => (
                  <div key={label} className="text-center p-2 rounded-lg bg-background/20 border border-white/5">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</p>
                    <p className="text-xs font-semibold text-foreground mt-0.5">{value}</p>
                  </div>
                ))}
              </div>

              {/* Strategy info */}
              <div className="text-[10px] text-muted-foreground space-y-1">
                <div className="flex justify-between">
                  <span>Created by</span>
                  <span className="text-foreground font-medium">{strategy.creatorName}</span>
                </div>
                <div className="flex justify-between">
                  <span>Version</span>
                  <span className="text-foreground">v{strategy.version}</span>
                </div>
                {strategy.rejectionReason && (
                  <div className="flex items-start gap-1.5 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[9px]">
                    <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                    <span>{strategy.rejectionReason}</span>
                  </div>
                )}
              </div>

              <button
                onClick={() => onLoad(strategy)}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold bg-primary/15 border border-primary/25 text-primary hover:bg-primary/25 transition-all"
              >
                <Play className="h-3.5 w-3.5" />
                Load & Run Backtest
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export function LoadStrategyPanel({ open, onClose, onLoad }: Props) {
  const { user }                                = useAuthStore();
  const { getCreatorStrategies, getUserPurchases, strategies } = useStrategyStore();

  const [tab,    setTab]    = useState<Tab>('mine');
  const [search, setSearch] = useState('');

  const myStrategies = useMemo<Strategy[]>(() => {
    if (!user?.id) return [];
    return getCreatorStrategies(user.id);
  }, [user?.id, getCreatorStrategies]);

  const purchases = useMemo<StrategyPurchase[]>(() => {
    if (!user?.id) return [];
    return getUserPurchases(user.id).filter(p => p.status === 'active');
  }, [user?.id, getUserPurchases]);

  const purchasedStrategies = useMemo<Strategy[]>(() => {
    return purchases
      .map(p => strategies[p.strategyId])
      .filter((s): s is Strategy => !!s);
  }, [purchases, strategies]);

  const q = search.trim().toLowerCase();

  const filteredMine = useMemo(() =>
    myStrategies.filter(s =>
      !q || s.name.toLowerCase().includes(q) || s.type.includes(q)
    ), [myStrategies, q]);

  const filteredPurchased = useMemo(() =>
    purchasedStrategies.filter(s =>
      !q || s.name.toLowerCase().includes(q) || s.type.includes(q)
    ), [purchasedStrategies, q]);

  const purchasedIds = useMemo(() =>
    new Set(purchasedStrategies.map(s => s.id)),
  [purchasedStrategies]);

  const handleLoad = (strategy: Strategy) => {
    onLoad(strategy);
    onClose();
  };

  if (!open) return null;

  const activeList = tab === 'mine' ? filteredMine : filteredPurchased;
  const emptyLabel = tab === 'mine'
    ? (q ? 'No strategies match your search.' : 'You haven\'t created any strategies yet. Run a backtest and click Save Strategy.')
    : (q ? 'No purchased strategies match your search.' : 'You haven\'t purchased any strategies. Browse the marketplace.');

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />

      {/* Panel */}
      <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 32 }}
        transition={{ type: 'spring', damping: 24, stiffness: 300 }}
        className="relative z-10 w-full sm:max-w-lg bg-card border border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-2.5">
            <FolderOpen className="h-5 w-5 text-primary" />
            <h2 className="text-base font-bold text-foreground">Load Strategy</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-5 pt-3 gap-1 shrink-0">
          {(['mine', 'purchased'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium transition-all',
                tab === t
                  ? 'bg-primary/10 text-primary border border-primary/20'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/30',
              )}
            >
              {t === 'mine' ? <Lock className="h-3.5 w-3.5" /> : <ShoppingBag className="h-3.5 w-3.5" />}
              {t === 'mine' ? 'My Strategies' : 'Purchased'}
              <span className={cn(
                'text-[10px] px-1.5 py-0.5 rounded-full font-bold',
                tab === t ? 'bg-primary/20 text-primary' : 'bg-secondary/40 text-muted-foreground',
              )}>
                {t === 'mine' ? myStrategies.length : purchasedStrategies.length}
              </span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="px-5 py-3 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search strategies…"
              className="w-full bg-secondary/30 border border-white/10 rounded-xl pl-9 pr-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-2.5">
          {activeList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <div className="w-12 h-12 rounded-2xl bg-secondary/30 border border-white/5 flex items-center justify-center">
                <FolderOpen className="h-5 w-5 text-muted-foreground/40" />
              </div>
              <p className="text-sm text-muted-foreground/70 max-w-xs">{emptyLabel}</p>
            </div>
          ) : (
            activeList.map(strategy => (
              <StrategyCard
                key={strategy.id}
                strategy={strategy}
                onLoad={handleLoad}
                isPurchased={purchasedIds.has(strategy.id)}
              />
            ))
          )}
        </div>
      </motion.div>
    </div>
  );
}
