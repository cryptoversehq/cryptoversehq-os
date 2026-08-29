/**
 * MarketplaceSearch.tsx — §7
 * Complete search system with:
 * - Full-text autocomplete on name / description / tags / creator
 * - Recent searches (localStorage, last 10)
 * - Saved searches (localStorage, persistent)
 * - Full filter panel: type, risk, price range, min rating, sort
 */
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, X, Clock, Bookmark, BookmarkCheck, SlidersHorizontal,
  Star, ChevronDown, ChevronUp, RotateCcw,
} from 'lucide-react';
import { useStrategyStore } from '../../lib/strategyStore';
import type { StrategyType, RiskLevel, StrategySortKey } from '../../lib/strategyTypes';
import { DEFAULT_STRATEGY_FILTERS } from '../../lib/strategyTypes';
import { CV, TYPE_META, RISK_META } from './MarketplaceUtils';

// ── Constants ─────────────────────────────────────────────────────────────────

const RECENT_KEY = 'cryptoverse_mkt_recent_searches';
const SAVED_KEY  = 'cryptoverse_mkt_saved_searches';
const MAX_RECENT = 10;

const SORT_OPTIONS: { value: StrategySortKey; label: string }[] = [
  { value: 'most_sales',    label: '🔥 Best Selling' },
  { value: 'best_rating',   label: '⭐ Highest Rated' },
  { value: 'newest',        label: '🆕 Newest' },
  { value: 'lowest_price',  label: '💰 Price: Low → High' },
  { value: 'highest_price', label: '💎 Price: High → Low' },
  { value: 'best_win_rate', label: '🎯 Best Win Rate' },
  { value: 'highest_profit',label: '📈 Best Performance' },
];

const PRICE_RANGES: { label: string; min: number; max: number }[] = [
  { label: 'Any Price',    min: 0, max: Infinity },
  { label: 'Free',         min: 0, max: 0 },
  { label: '1 – 500 CP',   min: 1, max: 500 },
  { label: '501 – 1000 CP', min: 501, max: 1000 },
  { label: '1000+ CP',     min: 1001, max: Infinity },
];

// ── Persistence helpers ────────────────────────────────────────────────────────

function loadJSON<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
}
function saveJSON(key: string, val: unknown) {
  localStorage.setItem(key, JSON.stringify(val));
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SearchFilters {
  search:     string;
  types:      StrategyType[];
  riskLevels: RiskLevel[];
  priceMin:   number;
  priceMax:   number;
  ratingMin:  number;
  sortBy:     StrategySortKey;
  onlyFree:   boolean;
}

export const DEFAULT_SEARCH_FILTERS: SearchFilters = {
  search:     '',
  types:      [],
  riskLevels: [],
  priceMin:   0,
  priceMax:   Infinity,
  ratingMin:  0,
  sortBy:     'most_sales',
  onlyFree:   false,
};

interface Props {
  filters:  SearchFilters;
  onChange: (f: SearchFilters) => void;
}

// ─────────────────────────────────────────────────────────────────────────────

export function MarketplaceSearch({ filters, onChange }: Props) {
  const strategies = useStrategyStore(s => s.strategies);

  const [inputFocused, setInputFocused] = useState(false);
  const [showFilters,  setShowFilters]  = useState(false);
  const [recent,       setRecent]       = useState<string[]>(() => loadJSON(RECENT_KEY, []));
  const [saved,        setSaved]        = useState<string[]>(() => loadJSON(SAVED_KEY, []));
  const inputRef  = useRef<HTMLInputElement>(null);
  const dropRef   = useRef<HTMLDivElement>(null);

  const patch = useCallback((p: Partial<SearchFilters>) => onChange({ ...filters, ...p }), [filters, onChange]);

  // ── Autocomplete suggestions ────────────────────────────────────────────────

  const suggestions = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    if (q.length < 2) return [];
    const allPub = Object.values(strategies).filter(s => s.isPublished);
    const results: string[] = [];
    const seen = new Set<string>();

    allPub.forEach(s => {
      const candidates = [
        s.name,
        s.creatorName,
        ...s.tags,
        s.shortDescription.slice(0, 60),
      ];
      candidates.forEach(c => {
        if (c.toLowerCase().includes(q) && !seen.has(c) && c !== filters.search) {
          seen.add(c);
          results.push(c);
        }
      });
    });

    return results.slice(0, 6);
  }, [filters.search, strategies]);

  const showDropdown = inputFocused && (suggestions.length > 0 || recent.length > 0);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setInputFocused(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Search commit ─────────────────────────────────────────────────────────

  const commitSearch = (term: string) => {
    if (!term.trim()) return;
    patch({ search: term });
    setInputFocused(false);
    // Add to recent
    setRecent(prev => {
      const next = [term, ...prev.filter(r => r !== term)].slice(0, MAX_RECENT);
      saveJSON(RECENT_KEY, next);
      return next;
    });
  };

  const clearSearch = () => patch({ search: '' });

  // ── Save / unsave search ──────────────────────────────────────────────────

  const isSaved = saved.includes(filters.search);
  const toggleSave = () => {
    if (!filters.search.trim()) return;
    setSaved(prev => {
      const next = isSaved
        ? prev.filter(s => s !== filters.search)
        : [filters.search, ...prev];
      saveJSON(SAVED_KEY, next);
      return next;
    });
  };

  // ── Active filter count ───────────────────────────────────────────────────

  const activeCount = [
    filters.types.length > 0,
    filters.riskLevels.length > 0,
    filters.priceMin > 0 || filters.priceMax !== Infinity,
    filters.ratingMin > 0,
    filters.onlyFree,
    filters.sortBy !== 'most_sales',
  ].filter(Boolean).length;

  // ── Price range helpers ────────────────────────────────────────────────────

  const activePriceIdx = PRICE_RANGES.findIndex(
    r => r.min === filters.priceMin && r.max === filters.priceMax
  );

  const setPriceRange = (r: { min: number; max: number }) =>
    patch({ priceMin: r.min, priceMax: r.max, onlyFree: r.min === 0 && r.max === 0 });

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">

      {/* ── Search bar row ── */}
      <div className="flex gap-2">

        {/* Search input */}
        <div className="relative flex-1" ref={dropRef}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: CV.gray }} />

          <input
            ref={inputRef}
            type="text"
            value={filters.search}
            onChange={e => patch({ search: e.target.value })}
            onFocus={() => setInputFocused(true)}
            onKeyDown={e => e.key === 'Enter' && commitSearch(filters.search)}
            placeholder="Search strategies, creators, tags…"
            className="w-full pl-9 pr-8 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-1"
            style={{
              background: CV.surface,
              border: `1px solid ${inputFocused ? CV.goldBorder : CV.border}`,
              color: 'var(--text-primary)',
              transition: 'border-color 0.15s',
            }}
          />

          {/* Clear + save buttons */}
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {filters.search && (
              <>
                <button onClick={toggleSave} title={isSaved ? 'Unsave search' : 'Save search'}
                  style={{ color: isSaved ? CV.gold : CV.gray }}>
                  {isSaved
                    ? <BookmarkCheck className="h-3.5 w-3.5" />
                    : <Bookmark className="h-3.5 w-3.5" />}
                </button>
                <button onClick={clearSearch} style={{ color: CV.gray }}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>

          {/* Autocomplete dropdown */}
          <AnimatePresence>
            {showDropdown && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden z-30 shadow-2xl"
                style={{ background: 'var(--bg-card)', border: `1px solid ${CV.goldBorder}` }}
              >
                {/* Live suggestions */}
                {suggestions.length > 0 && (
                  <div>
                    <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: CV.gray }}>
                      Suggestions
                    </p>
                    {suggestions.map(s => (
                      <button key={s} onClick={() => commitSearch(s)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/5 transition-colors">
                        <Search className="h-3.5 w-3.5 shrink-0" style={{ color: CV.gray }} />
                        <span className="text-foreground truncate">{highlight(s, filters.search)}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Recent searches */}
                {recent.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between px-3 pt-2 pb-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: CV.gray }}>Recent</p>
                      <button onClick={() => { setRecent([]); saveJSON(RECENT_KEY, []); }}
                        className="text-[10px]" style={{ color: CV.gray }}>Clear</button>
                    </div>
                    {recent.slice(0, 5).map(r => (
                      <button key={r} onClick={() => commitSearch(r)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/5 transition-colors">
                        <Clock className="h-3.5 w-3.5 shrink-0" style={{ color: CV.gray }} />
                        <span className="text-foreground truncate">{r}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Saved searches */}
                {saved.length > 0 && (
                  <div className="border-t" style={{ borderColor: CV.border }}>
                    <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: CV.gray }}>
                      Saved
                    </p>
                    {saved.map(s => (
                      <button key={s} onClick={() => commitSearch(s)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/5 transition-colors">
                        <BookmarkCheck className="h-3.5 w-3.5 shrink-0" style={{ color: CV.gold }} />
                        <span className="text-foreground truncate">{s}</span>
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Sort */}
        <div className="relative">
          <select
            value={filters.sortBy}
            onChange={e => patch({ sortBy: e.target.value as StrategySortKey })}
            className="appearance-none pl-3 pr-8 py-2.5 rounded-xl text-sm focus:outline-none hidden sm:block"
            style={{
              background: CV.surface,
              border: `1px solid ${CV.border}`,
              color: 'rgba(255,255,255,0.85)',
              minWidth: 180,
            }}
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none hidden sm:block"
            style={{ color: CV.gray }} />
        </div>

        {/* Filter toggle */}
        <button
          onClick={() => setShowFilters(v => !v)}
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all"
          style={{
            background: showFilters || activeCount > 0 ? CV.goldAlpha : CV.surface,
            border: `1px solid ${showFilters || activeCount > 0 ? CV.goldBorder : CV.border}`,
            color: showFilters || activeCount > 0 ? CV.gold : CV.gray,
          }}
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span className="hidden sm:inline">Filters</span>
          {activeCount > 0 && (
            <span className="flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold"
              style={{ background: CV.gold, color: '#0A1929' }}>
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {/* ── Filter panel ── */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 rounded-2xl space-y-4" style={{ background: CV.surface, border: `1px solid ${CV.border}` }}>

              {/* Strategy type */}
              <FilterRow label="Type">
                {(Object.entries(TYPE_META) as [StrategyType, typeof TYPE_META[StrategyType]][]).map(([k, v]) => {
                  const active = filters.types.includes(k);
                  return (
                    <Chip key={k} active={active}
                      onClick={() => patch({
                        types: active ? filters.types.filter(t => t !== k) : [...filters.types, k]
                      })}
                    >
                      {v.emoji} {v.label}
                    </Chip>
                  );
                })}
              </FilterRow>

              {/* Risk level */}
              <FilterRow label="Risk">
                {(['low', 'medium', 'high', 'very-high'] as RiskLevel[]).map(r => {
                  const m = RISK_META[r];
                  const active = filters.riskLevels.includes(r);
                  return (
                    <Chip key={r} active={active} activeColor={m.color} activeBg={m.bg}
                      onClick={() => patch({
                        riskLevels: active ? filters.riskLevels.filter(x => x !== r) : [...filters.riskLevels, r]
                      })}
                    >
                      {m.label}
                    </Chip>
                  );
                })}
              </FilterRow>

              {/* Price range */}
              <FilterRow label="Price">
                {PRICE_RANGES.map((r, i) => (
                  <Chip key={r.label} active={activePriceIdx === i}
                    onClick={() => setPriceRange(r)}>
                    {r.label}
                  </Chip>
                ))}
              </FilterRow>

              {/* Min rating */}
              <FilterRow label="Min Rating">
                {[0, 1, 2, 3, 4, 4.5].map(v => (
                  <Chip key={v} active={filters.ratingMin === v}
                    onClick={() => patch({ ratingMin: v })}>
                    {v === 0 ? 'Any' : `${v}+ ★`}
                  </Chip>
                ))}
              </FilterRow>

              {/* Sort (mobile) */}
              <div className="sm:hidden">
                <FilterRow label="Sort">
                  {SORT_OPTIONS.map(o => (
                    <Chip key={o.value} active={filters.sortBy === o.value}
                      onClick={() => patch({ sortBy: o.value })}>
                      {o.label}
                    </Chip>
                  ))}
                </FilterRow>
              </div>

              {/* Reset */}
              {activeCount > 0 && (
                <button
                  onClick={() => onChange({ ...DEFAULT_SEARCH_FILTERS, search: filters.search })}
                  className="flex items-center gap-1.5 text-xs font-semibold ml-auto"
                  style={{ color: CV.gray }}
                >
                  <RotateCcw className="h-3 w-3" /> Reset all filters
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active filter pills row */}
      {(filters.search || activeCount > 0) && (
        <ActivePills filters={filters} patch={patch} onChange={onChange} />
      )}
    </div>
  );
}

// ── Active filter pills ────────────────────────────────────────────────────────

function ActivePills({ filters, patch, onChange }: {
  filters: SearchFilters;
  patch: (p: Partial<SearchFilters>) => void;
  onChange: (f: SearchFilters) => void;
}) {
  const pills: { label: string; onRemove: () => void }[] = [];

  if (filters.search)
    pills.push({ label: `"${filters.search}"`, onRemove: () => patch({ search: '' }) });

  filters.types.forEach(t =>
    pills.push({ label: TYPE_META[t].label, onRemove: () => patch({ types: filters.types.filter(x => x !== t) }) })
  );

  filters.riskLevels.forEach(r =>
    pills.push({ label: RISK_META[r].label, onRemove: () => patch({ riskLevels: filters.riskLevels.filter(x => x !== r) }) })
  );

  if (filters.priceMin > 0 || filters.priceMax !== Infinity) {
    const label = filters.priceMax === Infinity
      ? `≥ ${filters.priceMin} CP`
      : filters.priceMin === 0 ? 'Free' : `${filters.priceMin}–${filters.priceMax} CP`;
    pills.push({ label, onRemove: () => patch({ priceMin: 0, priceMax: Infinity, onlyFree: false }) });
  }

  if (filters.ratingMin > 0)
    pills.push({ label: `${filters.ratingMin}+ ★`, onRemove: () => patch({ ratingMin: 0 }) });

  if (filters.sortBy !== 'most_sales') {
    const label = SORT_OPTIONS.find(o => o.value === filters.sortBy)?.label ?? filters.sortBy;
    pills.push({ label, onRemove: () => patch({ sortBy: 'most_sales' }) });
  }

  if (pills.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {pills.map(p => (
        <span key={p.label}
          className="flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold"
          style={{ background: CV.goldAlpha, color: CV.gold, border: `1px solid ${CV.goldBorder}` }}>
          {p.label}
          <button onClick={p.onRemove} className="hover:opacity-70 transition-opacity ml-0.5">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {pills.length > 1 && (
        <button
          onClick={() => onChange(DEFAULT_SEARCH_FILTERS)}
          className="px-2 py-1 rounded-full text-[11px] font-semibold"
          style={{ color: CV.gray, border: `1px solid ${CV.border}` }}>
          Clear all
        </button>
      )}
    </div>
  );
}

// ── Chip component ─────────────────────────────────────────────────────────────

function Chip({ children, active, onClick, activeColor, activeBg }: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  activeColor?: string;
  activeBg?: string;
}) {
  return (
    <button onClick={onClick}
      className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
      style={{
        background: active ? (activeBg ?? CV.goldAlpha) : 'transparent',
        color:      active ? (activeColor ?? CV.gold)   : CV.gray,
        border:     `1px solid ${active ? (activeColor ? `${activeColor}40` : CV.goldBorder) : CV.border}`,
      }}>
      {children}
    </button>
  );
}

// ── FilterRow ──────────────────────────────────────────────────────────────────

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 flex-wrap">
      <span className="text-xs font-semibold shrink-0 pt-1 w-20" style={{ color: CV.gray }}>{label}</span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

// ── Highlight helper ───────────────────────────────────────────────────────────

function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <strong style={{ color: CV.gold }}>{text.slice(idx, idx + query.length)}</strong>
      {text.slice(idx + query.length)}
    </>
  );
}
