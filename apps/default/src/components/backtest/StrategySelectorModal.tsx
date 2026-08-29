/**
 * StrategySelectorModal.tsx
 *
 * Modal for browsing and selecting marketplace strategies to backtest.
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Search, Star, TrendingUp, BarChart2, ShoppingBag,
  CheckCircle2, Filter, Zap, Lock,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useStrategyStore } from '../../lib/strategyStore';
import { useAuthStore } from '../../lib/authStore';
import type { Strategy, StrategyType } from '../../lib/strategyTypes';

// ─────────────────────────────────────────────────────────────────────────────
// STARS
// ─────────────────────────────────────────────────────────────────────────────

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <Star
          key={n}
          className={cn(
            'h-3 w-3',
            n <= Math.round(rating) ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/30',
          )}
        />
      ))}
      <span className="text-xs text-muted-foreground ml-1">{rating.toFixed(1)}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BADGE
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<StrategyType | string, string> = {
  grid:        'bg-blue-500/15 text-blue-400',
  dca:         'bg-green-500/15 text-green-400',
  martingale:  'bg-orange-500/15 text-orange-400',
  arbitrage:   'bg-purple-500/15 text-purple-400',
  custom:      'bg-pink-500/15 text-pink-400',
};

function TypeBadge({ type }: { type: StrategyType }) {
  const label = type.charAt(0).toUpperCase() + type.slice(1);
  return (
    <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-md uppercase', TYPE_COLORS[type] ?? 'bg-secondary text-foreground')}>
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY CARD (inside modal)
// ─────────────────────────────────────────────────────────────────────────────

function StrategyCard({
  strategy,
  isOwned,
  onSelect,
}: {
  strategy:  Strategy;
  isOwned:   boolean;
  onSelect:  (s: Strategy) => void;
}) {
  const canUse = strategy.isFree || isOwned;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'flex flex-col gap-3 p-4 rounded-xl border transition-all duration-200',
        canUse
          ? 'border-white/10 bg-secondary/20 hover:border-primary/30 hover:bg-secondary/40'
          : 'border-white/5 bg-secondary/10 opacity-75',
      )}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <TypeBadge type={strategy.type} />
            {strategy.isFree && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-green-500/15 text-green-400 uppercase">
                Free
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-foreground mt-1.5 leading-tight">
            {strategy.name}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
            {strategy.shortDescription}
          </p>
        </div>
        {!canUse && <Lock className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-0.5" />}
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <TrendingUp className="h-3 w-3 text-green-400" />
          <span className="text-green-400 font-medium">{strategy.winRate.toFixed(0)}% WR</span>
        </div>
        <div className="flex items-center gap-1">
          <BarChart2 className="h-3 w-3" />
          <span>{strategy.totalTrades} trades</span>
        </div>
        <div className="flex items-center gap-1">
          <ShoppingBag className="h-3 w-3" />
          <span>{strategy.isFree ? 'Free' : `${strategy.price} CP`}</span>
        </div>
      </div>

      {/* Rating + Button */}
      <div className="flex items-center justify-between">
        <Stars rating={strategy.rating} />

        <button
          disabled={!canUse}
          onClick={() => canUse && onSelect(strategy)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200',
            canUse
              ? 'bg-primary text-primary-foreground hover:bg-primary/80 active:scale-95'
              : 'bg-secondary/30 text-muted-foreground cursor-not-allowed',
          )}
        >
          {canUse ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" />
              Select
            </>
          ) : (
            <>
              <Lock className="h-3.5 w-3.5" />
              {strategy.isFree ? 'Locked' : `${strategy.price} CP`}
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  open:     boolean;
  onClose:  () => void;
  onSelect: (strategy: Strategy) => void;
}

export function StrategySelectorModal({ open, onClose, onSelect }: Props) {
  const [search,      setSearch]      = useState('');
  const [typeFilter,  setTypeFilter]  = useState<StrategyType | 'all'>('all');

  const { user } = useAuthStore();
  const { strategies, purchases } = useStrategyStore();

  const ownedIds = useMemo(() =>
    new Set(
      Object.values(purchases)
        .filter(p => p.buyerId === user?.id && p.status === 'active')
        .map(p => p.strategyId),
    ),
  [purchases, user?.id]);

  const published = useMemo(() =>
    Object.values(strategies).filter(s => s.isPublished),
  [strategies]);

  const filtered = useMemo(() => {
    return published.filter(s => {
      if (typeFilter !== 'all' && s.type !== typeFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const inName = s.name.toLowerCase().includes(q);
        const inDesc = s.shortDescription.toLowerCase().includes(q);
        if (!inName && !inDesc) return false;
      }
      return true;
    }).sort((a, b) => b.rating - a.rating);
  }, [published, typeFilter, search]);

  const types: Array<{ value: StrategyType | 'all'; label: string }> = [
    { value: 'all',       label: 'All Types' },
    { value: 'grid',      label: 'Grid' },
    { value: 'dca',       label: 'DCA' },
    { value: 'martingale',label: 'Martingale' },
    { value: 'arbitrage', label: 'Arbitrage' },
    { value: 'custom',    label: 'Custom' },
  ];

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', damping: 22, stiffness: 300 }}
            className="relative w-full max-w-2xl max-h-[80vh] bg-card border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden z-10"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-white/5">
              <div className="flex items-center gap-2.5">
                <ShoppingBag className="h-5 w-5 text-primary" />
                <h2 className="text-base font-semibold text-foreground">Select Strategy</h2>
                <span className="text-xs text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded-full">
                  {filtered.length} available
                </span>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Search + Filter */}
            <div className="p-4 border-b border-white/5 flex flex-col gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search strategies…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded-lg text-sm bg-background border border-white/10 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              {/* Type filter pills */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                {types.map(t => (
                  <button
                    key={t.value}
                    onClick={() => setTypeFilter(t.value)}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                      typeFilter === t.value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary/30 text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Strategy List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Zap className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {search ? 'No strategies match your search.' : 'No published strategies available.'}
                  </p>
                </div>
              ) : (
                filtered.map(s => (
                  <StrategyCard
                    key={s.id}
                    strategy={s}
                    isOwned={ownedIds.has(s.id)}
                    onSelect={(s) => { onSelect(s); onClose(); }}
                  />
                ))
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
