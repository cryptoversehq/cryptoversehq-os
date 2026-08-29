/**
 * MarketplacePage.tsx — /marketplace
 * Home: featured, top-rated, categories, search & filter grid
 */
import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MarketplaceNotificationBell } from './MarketplaceNotificationBell';
import { MarketplaceSearch, DEFAULT_SEARCH_FILTERS, type SearchFilters } from './MarketplaceSearch';
import {
  TrendingUp, Star, ShoppingBag, Users, ChevronRight,
  Sparkles, LayoutGrid, List,
} from 'lucide-react';
import { useStrategyStore } from '../../lib/strategyStore';
import { useAuthStore } from '../../lib/authStore';
import { useCpCoinsStore } from '../../lib/cpCoinsStore';
import { useAcademyStore } from '../../lib/academyStore';
import type { StrategyType, RiskLevel, StrategySortKey } from '../../lib/strategyTypes';
import { DEFAULT_STRATEGY_FILTERS } from '../../lib/strategyTypes';
import { StrategyCard } from './StrategyCard';
import { PurchaseModal } from './PurchaseModal';
import { CV, CATEGORIES, TYPE_META, RISK_META, fmtCP, getLevelFromXP } from './MarketplaceUtils';
import { cn } from '../../lib/utils';
import { useSubscriptionAccess } from '@/hooks/useSubscriptionAccess';
import { toast } from 'sonner';

// ─────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 9;

const SORT_OPTIONS: { value: StrategySortKey; label: string }[] = [
  { value: 'newest',        label: 'Newest' },
  { value: 'best_rating',   label: 'Top Rated' },
  { value: 'most_sales',    label: 'Best Selling' },
  { value: 'highest_profit',label: 'Highest Return' },
  { value: 'lowest_price',  label: 'Price: Low → High' },
  { value: 'highest_price', label: 'Price: High → Low' },
  { value: 'best_win_rate', label: 'Best Win Rate' },
  { value: 'best_sharpe',   label: 'Best Sharpe' },
];

// ─────────────────────────────────────────────────────────────────────────────

export function MarketplacePage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { totalXP } = useAcademyStore();
  const getBalance = useCpCoinsStore(s => s.getBalance);
  const initUser   = useCpCoinsStore(s => s.initUser);
  const getMarketplacePage = useStrategyStore(s => s.getMarketplacePage);
  const userOwnsStrategy   = useStrategyStore(s => s.userOwnsStrategy);
  const strategies         = useStrategyStore(s => s.strategies);

  // Init wallet
  if (user) initUser(user.id);
  const balance = user ? getBalance(user.id) : 0;
  const level   = getLevelFromXP(totalXP);

  const [searchFilters, setSearchFilters] = useState<SearchFilters>(DEFAULT_SEARCH_FILTERS);
  const [page,         setPage]           = useState(1);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [purchasing, setPurchasing]   = useState<string | null>(null);

  // Map SearchFilters → StrategyFilters for the store
  const filters = useMemo(() => ({
    ...DEFAULT_STRATEGY_FILTERS,
    search:     searchFilters.search,
    types:      searchFilters.types,
    riskLevels: searchFilters.riskLevels,
    priceRange: [searchFilters.priceMin, searchFilters.priceMax] as [number, number],
    ratingMin:  searchFilters.ratingMin,
    sortBy:     searchFilters.sortBy,
    onlyFree:   searchFilters.onlyFree,
  }), [searchFilters]);

  const patch = useCallback((p: Partial<typeof filters>) => {
    setSearchFilters(prev => ({
      ...prev,
      ...(p.search    !== undefined ? { search: p.search }         : {}),
      ...(p.types     !== undefined ? { types: p.types }           : {}),
      ...(p.riskLevels!== undefined ? { riskLevels: p.riskLevels } : {}),
      ...(p.ratingMin !== undefined ? { ratingMin: p.ratingMin }   : {}),
      ...(p.sortBy    !== undefined ? { sortBy: p.sortBy }         : {}),
      ...(p.onlyFree  !== undefined ? { onlyFree: p.onlyFree }     : {}),
    }));
    setPage(1);
  }, []);

  // ── Derived data ──────────────────────────────────────────────────────────

  const result = useMemo(() => getMarketplacePage(filters, page, PAGE_SIZE), [getMarketplacePage, filters, page]);

  // Featured: top 3 by rating among approved
  const featured = useMemo(() => {
    return Object.values(strategies)
      .filter(s => s.isPublished)
      .sort((a, b) => b.rating - a.rating || b.totalSales - a.totalSales)
      .slice(0, 3);
  }, [strategies]);

  // Top 5 leaderboard
  const topRated = useMemo(() => {
    return Object.values(strategies)
      .filter(s => s.isPublished)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 5);
  }, [strategies]);

  const purchasingStrategy = purchasing ? strategies[purchasing] : null;

  // ── Helpers ───────────────────────────────────────────────────────────────

  const { hasAccess: canPurchase } = useSubscriptionAccess('pro');
  const handleView     = (id: string) => navigate(`/marketplace/${id}`);
  const handlePurchase = (id: string) => {
    if (!canPurchase) {
      toast('Buying strategies requires Pro subscription.', {
        description: 'Upgrade to unlock the full Marketplace.',
        action: { label: 'Upgrade', onClick: () => navigate('/subscription?plan=pro') },
        duration: 6000,
      });
      return;
    }
    setPurchasing(id);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ background: 'radial-gradient(ellipse 70% 50% at 90% 0%, rgba(255,215,0,0.05) 0%, transparent 70%), var(--background)' }}
    >
      {/* ── Header ── */}
      <header
        className="flex items-center justify-between px-6 py-4 border-b shrink-0 backdrop-blur-sm"
        style={{ borderColor: CV.goldBorder, background: 'var(--bg-card)' }}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: CV.goldAlpha, border: `1px solid ${CV.goldBorder}` }}>
            <ShoppingBag className="h-5 w-5" style={{ color: CV.gold }} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground leading-none">Strategy Marketplace</h1>
            <p className="text-xs mt-0.5" style={{ color: CV.gray }}>Discover & purchase battle-tested trading strategies
              <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-[10px] font-semibold text-amber-400">🧪 Demo</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Balance pill */}
          {user && (
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold"
              style={{ background: CV.goldAlpha, color: CV.gold, border: `1px solid ${CV.goldBorder}` }}>
              💰 {balance.toLocaleString()} CP
            </div>
          )}
          <button
            onClick={() => navigate('/marketplace/my-strategies')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-secondary text-foreground hover:bg-secondary/80 border border-border transition-all"
          >
            <Users className="h-3.5 w-3.5" /> My Strategies
          </button>
          {/* Final Report link */}
          <button
            onClick={() => navigate('/marketplace/report')}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-secondary text-foreground hover:bg-secondary/80 border border-border transition-all"
            title="View system report"
          >
            📋 Report
          </button>
          {/* §6 Marketplace notification bell */}
          <MarketplaceNotificationBell />
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-8">

          {/* ── §7 Search & filter bar ── */}
          <MarketplaceSearch
            filters={searchFilters}
            onChange={f => { setSearchFilters(f); setPage(1); }}
          />

          {/* ── Featured strategies ── */}
          {!filters.search && filters.types.length === 0 && (
            <>
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="h-4 w-4" style={{ color: CV.gold }} />
                  <h2 className="font-bold text-foreground">Featured Strategies</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {featured.map(s => (
                    <StrategyCard
                      key={s.id}
                      strategy={s}
                      owned={user ? userOwnsStrategy(s.id, user.id) : false}
                      onView={() => handleView(s.id)}
                      onPurchase={() => handlePurchase(s.id)}
                    />
                  ))}
                </div>
              </section>

              {/* ── Top Rated leaderboard ── */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Star className="h-4 w-4" style={{ color: CV.gold }} />
                  <h2 className="font-bold text-foreground">Top Rated</h2>
                </div>
                <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                  {topRated.map((s, i) => {
                    const type = TYPE_META[s.type];
                    return (
                      <div
                        key={s.id}
                        onClick={() => handleView(s.id)}
                        className="flex items-center gap-4 px-5 py-3.5 cursor-pointer transition-all hover:bg-secondary/30"
                        style={{ borderBottom: i < topRated.length - 1 ? `1px solid ${CV.border}` : 'none' }}
                      >
                        <span className="w-6 font-bold text-sm shrink-0" style={{ color: i < 3 ? CV.gold : CV.gray }}>
                          #{i + 1}
                        </span>
                        <span className="text-lg">{type.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-foreground truncate">{s.name}</p>
                          <p className="text-xs" style={{ color: CV.gray }}>by {s.creatorName}</p>
                        </div>
                        <div className="flex items-center gap-1 text-xs shrink-0">
                          <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                          <span className="font-bold text-foreground">{s.rating.toFixed(1)}</span>
                          <span style={{ color: CV.gray }}>({s.ratingCount})</span>
                        </div>
                        <div className="text-xs font-bold shrink-0" style={{ color: s.isFree ? CV.green : CV.gold }}>
                          {fmtCP(s.price)}
                        </div>
                        <div className="hidden sm:block text-xs shrink-0" style={{ color: CV.gray }}>
                          {s.totalSales.toLocaleString()} sold
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0" style={{ color: CV.gray }} />
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* ── Categories ── */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <LayoutGrid className="h-4 w-4" style={{ color: CV.gold }} />
                  <h2 className="font-bold text-foreground">Categories</h2>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => patch({ types: [cat.id as StrategyType] })}
                      className="flex flex-col items-center gap-2 py-4 px-3 rounded-2xl transition-all hover:scale-[1.02]"
                      style={{ background: CV.surface, border: `1px solid ${CV.border}` }}
                    >
                      <span className="text-2xl">{cat.emoji}</span>
                      <span className="text-xs font-semibold text-foreground">{cat.label}</span>
                      <span className="text-[10px]" style={{ color: CV.gray }}>{cat.count} strategies</span>
                    </button>
                  ))}
                </div>
              </section>

              <div className="flex items-center gap-2 pt-2">
                <div className="flex-1 h-px" style={{ background: CV.border }} />
                <span className="text-xs font-semibold" style={{ color: CV.gray }}>All Strategies</span>
                <div className="flex-1 h-px" style={{ background: CV.border }} />
              </div>
            </>
          )}

          {/* ── Main grid / list ── */}
          <section>
            {result.total > 0 && (
              <p className="text-xs mb-4" style={{ color: CV.gray }}>
                Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, result.total)} of {result.total} strategies
              </p>
            )}

            {result.items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <ShoppingBag className="h-12 w-12 opacity-20" />
                <p className="text-sm font-semibold" style={{ color: CV.gray }}>No strategies match your filters</p>
                <button onClick={() => patch(DEFAULT_STRATEGY_FILTERS)} className="text-xs" style={{ color: CV.gold }}>
                  Clear filters
                </button>
              </div>
            ) : (
              <div className={cn(
                viewMode === 'grid'
                  ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'
                  : 'flex flex-col gap-3'
              )}>
                {result.items.map((s, i) => (
                  <StrategyCard
                    key={s.id}
                    strategy={s}
                    owned={user ? userOwnsStrategy(s.id, user.id) : false}
                    onView={() => handleView(s.id)}
                    onPurchase={() => handlePurchase(s.id)}
                    rank={viewMode === 'list' ? i + 1 + (page - 1) * PAGE_SIZE : undefined}
                  />
                ))}
              </div>
            )}

            {/* Pagination */}
            {result.total > PAGE_SIZE && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-40 transition-all bg-secondary text-foreground hover:bg-secondary/80 border border-border"
                >← Prev</button>

                {Array.from({ length: Math.min(5, Math.ceil(result.total / PAGE_SIZE)) }, (_, i) => {
                  const p = i + 1;
                  return (
                    <button key={p} onClick={() => setPage(p)}
                      className={cn("w-9 h-9 rounded-xl text-sm font-semibold transition-all border border-border", page === p ? "bg-amber-500/10 text-amber-500 border-amber-500/20" : "bg-secondary text-foreground hover:bg-secondary/80")}>
                      {p}
                    </button>
                  );
                })}

                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={!result.hasMore}
                  className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-40 transition-all bg-secondary text-foreground hover:bg-secondary/80 border border-border"
                >Next →</button>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Purchase modal */}
      {purchasingStrategy && (
        <PurchaseModal
          strategy={purchasingStrategy}
          onClose={() => setPurchasing(null)}
          onSuccess={() => {
            setPurchasing(null);
            navigate(`/marketplace/${purchasingStrategy.id}`);
          }}
        />
      )}
    </div>
  );
}
