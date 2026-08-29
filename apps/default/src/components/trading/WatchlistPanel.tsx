import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useWatchlistStore, WatchedCoin } from '@/lib/watchlistStore';
import { CoinMeta, COINS } from '@/lib/coins';
import { Sparkline } from './Sparkline';
import {
  Star, Search, X, ChevronLeft, ChevronRight,
  TrendingUp, TrendingDown, Plus, Minus,
  ArrowUp, ArrowDown, BarChart2, Volume2,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPrice(p: number): string {
  if (p >= 10_000) return p.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (p >= 1_000)  return p.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (p >= 100)    return p.toFixed(2);
  if (p >= 1)      return p.toFixed(4);
  if (p >= 0.01)   return p.toFixed(5);
  return p.toFixed(8);
}

function fmtVol(v: number): string {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return v.toFixed(0);
}

// ─── Add Coin Modal ───────────────────────────────────────────────────────────

const TRADEABLE_ALL = COINS.filter(
  c => !['USDT', 'USDC', 'STETH', 'DAI'].includes(c.symbol),
);

function AddCoinModal({
  onClose,
  getBasePrice,
}: {
  onClose: () => void;
  getBasePrice: (id: string) => number;
}) {
  const { addCoin, removeCoin, hasCoin } = useWatchlistStore();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = useMemo(() =>
    TRADEABLE_ALL.filter(c =>
      c.symbol.toLowerCase().includes(query.toLowerCase()) ||
      c.name.toLowerCase().includes(query.toLowerCase()),
    ).slice(0, 40),
  [query]);

  const toggle = (coin: CoinMeta) => {
    if (hasCoin(coin.id)) {
      removeCoin(coin.id);
    } else {
      const base = getBasePrice(coin.id);
      addCoin({
        coinId:       coin.id,
        coinSymbol:   coin.symbol,
        coinName:     coin.name,
        coinColor:    coin.color,
        basePrice:    base,
        currentPrice: base,
        change24h:    (Math.random() - 0.48) * 8,
        high24h:      base * 1.035,
        low24h:       base * 0.962,
        vol24h:       base * 10_000,
      });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[990] flex items-start justify-center pt-20"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <motion.div
        initial={{ y: -20, opacity: 0, scale: 0.97 }}
        animate={{ y: 0,   opacity: 1, scale: 1 }}
        exit={{   y: -10,  opacity: 0, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 380, damping: 28 }}
        className="relative z-10 w-[380px] bg-[#1e2026] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-[#f0b90b]" />
            <span className="text-[13px] font-bold text-[#eaecef]">Add to Watchlist</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-white/8 text-[#848e9c] hover:text-[#eaecef] transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 pt-3 pb-2">
          <div className="flex items-center gap-2 bg-[#2b2f36] border border-white/8 focus-within:border-[#f0b90b]/40 rounded-xl px-3 py-2 transition-colors">
            <Search className="w-3.5 h-3.5 text-[#848e9c] flex-shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search coins..."
              className="flex-1 bg-transparent text-[12px] text-[#eaecef] outline-none placeholder-[#4a4e57]"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-[#4a4e57] hover:text-[#848e9c]">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Coin list */}
        <div className="max-h-[380px] overflow-y-auto pb-2 scrollbar-thin">
          {filtered.map(coin => {
            const watched = hasCoin(coin.id);
            return (
              <button
                key={coin.id}
                onClick={() => toggle(coin)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/4 transition-colors',
                  watched && 'bg-[#f0b90b]/5',
                )}
              >
                {/* Color dot */}
                <span
                  className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center text-[11px] font-bold"
                  style={{ background: coin.color + '22', color: coin.color }}
                >
                  {coin.symbol.slice(0, 2)}
                </span>

                <div className="flex-1 text-left min-w-0">
                  <div className="text-[12px] font-bold text-[#eaecef] leading-tight">{coin.symbol}</div>
                  <div className="text-[10px] text-[#848e9c] truncate">{coin.name}</div>
                </div>

                {/* Watch toggle */}
                <div className={cn(
                  'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all',
                  watched
                    ? 'bg-[#f0b90b] text-black'
                    : 'border border-white/15 text-[#848e9c] hover:border-[#f0b90b]/40 hover:text-[#f0b90b]',
                )}>
                  {watched ? <Minus className="w-2.5 h-2.5" /> : <Plus className="w-2.5 h-2.5" />}
                </div>
              </button>
            );
          })}

          {filtered.length === 0 && (
            <div className="py-8 text-center text-[12px] text-[#848e9c]">
              No coins match "{query}"
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Coin Row ─────────────────────────────────────────────────────────────────

function CoinRow({
  coin,
  isActive,
  isFirst,
  isLast,
  onSelect,
  collapsed,
}: {
  coin:     WatchedCoin;
  isActive: boolean;
  isFirst:  boolean;
  isLast:   boolean;
  onSelect: () => void;
  collapsed:boolean;
}) {
  const { removeCoin, moveCoin } = useWatchlistStore();
  const isUp   = coin.currentPrice >= coin.prevPrice;
  const isGain = coin.change24h >= 0;
  const priceColor = isUp ? '#0ecb81' : '#f6465d';
  const changeColor = isGain ? '#0ecb81' : '#f6465d';
  const sparkColor  = isGain ? '#0ecb81' : '#f6465d';

  if (collapsed) {
    // Mini collapsed view — just dot + sparkline
    return (
      <button
        onClick={onSelect}
        title={`${coin.coinSymbol} — ${fmtPrice(coin.currentPrice)}`}
        className={cn(
          'w-full flex flex-col items-center gap-1 py-2 px-1 border-b border-white/5 transition-colors hover:bg-white/5',
          isActive && 'bg-[#f0b90b]/10',
        )}
      >
        <span
          className="w-6 h-6 rounded-lg flex items-center justify-center text-[9px] font-bold flex-shrink-0"
          style={{ background: coin.coinColor + '25', color: coin.coinColor }}
        >
          {coin.coinSymbol.slice(0, 2)}
        </span>
        <Sparkline data={coin.sparkline} width={36} height={20} color={sparkColor} filled dot={false} />
        <span className={cn('text-[8px] font-bold tabular-nums', isGain ? 'text-[#0ecb81]' : 'text-[#f6465d]')}>
          {isGain ? '+' : ''}{coin.change24h.toFixed(1)}%
        </span>
      </button>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -8 }}
      transition={{ duration: 0.15 }}
      className={cn(
        'group relative border-b border-white/5 transition-colors cursor-pointer',
        isActive ? 'bg-[#f0b90b]/8' : 'hover:bg-white/[0.03]',
      )}
      onClick={onSelect}
    >
      {/* Active left bar */}
      {isActive && (
        <div className="absolute left-0 inset-y-0 w-[2px] bg-[#f0b90b]" />
      )}

      <div className="pl-3 pr-2 pt-2.5 pb-2">
        {/* Row 1: symbol + price */}
        <div className="flex items-start gap-2">
          {/* Icon */}
          <div
            className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center text-[10px] font-bold mt-0.5"
            style={{ background: coin.coinColor + '22', color: coin.coinColor }}
          >
            {coin.coinSymbol.slice(0, 2)}
          </div>

          {/* Symbol + name */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <span className="text-[12px] font-bold text-[#eaecef] leading-tight">{coin.coinSymbol}</span>
              <span className="text-[9px] text-[#4a4e57]">/USDT</span>
            </div>
            <div className="text-[10px] text-[#848e9c] truncate leading-tight">{coin.coinName}</div>
          </div>

          {/* Price */}
          <div className="text-right flex-shrink-0">
            <div
              className="text-[12px] font-bold font-mono tabular-nums leading-tight transition-colors duration-300"
              style={{ color: priceColor }}
            >
              {fmtPrice(coin.currentPrice)}
            </div>
            <div
              className="text-[10px] font-semibold tabular-nums leading-tight"
              style={{ color: changeColor }}
            >
              {isGain ? '+' : ''}{coin.change24h.toFixed(2)}%
            </div>
          </div>
        </div>

        {/* Row 2: sparkline + vol */}
        <div className="flex items-end justify-between mt-1.5 pl-9">
          <Sparkline
            data={coin.sparkline}
            width={88}
            height={28}
            color={sparkColor}
            filled
            dot
            grid
          />
          <div className="text-right pl-1">
            <div className="text-[9px] text-[#4a4e57]">Vol</div>
            <div className="text-[10px] font-mono text-[#848e9c]">{fmtVol(coin.vol24h)}</div>
          </div>
        </div>
      </div>

      {/* Hover actions */}
      <div className="absolute right-1 top-1 hidden group-hover:flex items-center gap-0.5 bg-[#1e2026] rounded-lg border border-white/8 shadow-lg p-0.5">
        {!isFirst && (
          <button
            onClick={e => { e.stopPropagation(); moveCoin(coin.coinId, 'up'); }}
            className="p-1 rounded hover:bg-white/8 text-[#848e9c] hover:text-[#eaecef] transition-colors"
            title="Move up"
          >
            <ArrowUp className="w-2.5 h-2.5" />
          </button>
        )}
        {!isLast && (
          <button
            onClick={e => { e.stopPropagation(); moveCoin(coin.coinId, 'down'); }}
            className="p-1 rounded hover:bg-white/8 text-[#848e9c] hover:text-[#eaecef] transition-colors"
            title="Move down"
          >
            <ArrowDown className="w-2.5 h-2.5" />
          </button>
        )}
        <button
          onClick={e => { e.stopPropagation(); removeCoin(coin.coinId); }}
          className="p-1 rounded hover:bg-[#f6465d]/20 text-[#848e9c] hover:text-[#f6465d] transition-colors"
          title="Remove"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      </div>
    </motion.div>
  );
}

// ─── Sort options ─────────────────────────────────────────────────────────────

type SortKey = 'default' | 'change_desc' | 'change_asc' | 'price_desc' | 'price_asc' | 'vol_desc';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'default',     label: 'Default' },
  { key: 'change_desc', label: 'Gainers' },
  { key: 'change_asc',  label: 'Losers'  },
  { key: 'price_desc',  label: 'Price ↓' },
  { key: 'price_asc',   label: 'Price ↑' },
  { key: 'vol_desc',    label: 'Volume'  },
];

function sortCoins(coins: WatchedCoin[], sort: SortKey): WatchedCoin[] {
  if (sort === 'default') return coins;
  return [...coins].sort((a, b) => {
    switch (sort) {
      case 'change_desc': return b.change24h - a.change24h;
      case 'change_asc':  return a.change24h - b.change24h;
      case 'price_desc':  return b.currentPrice - a.currentPrice;
      case 'price_asc':   return a.currentPrice - b.currentPrice;
      case 'vol_desc':    return b.vol24h - a.vol24h;
      default:            return 0;
    }
  });
}

// ─── Main WatchlistPanel ──────────────────────────────────────────────────────

interface Props {
  activeCoinId:  string;
  onSelectCoin:  (coinId: string) => void;
  getBasePrice:  (id: string) => number;
}

export function WatchlistPanel({ activeCoinId, onSelectCoin, getBasePrice }: Props) {
  const { coins, collapsed, toggleCollapse } = useWatchlistStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [sortKey, setSortKey]           = useState<SortKey>('default');
  const [showSort, setShowSort]         = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  // Close sort dropdown on outside click
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setShowSort(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  const sorted = useMemo(() => sortCoins(coins, sortKey), [coins, sortKey]);

  // Summary stats for header
  const gainers = coins.filter(c => c.change24h >= 0).length;
  const losers  = coins.filter(c => c.change24h < 0).length;

  if (collapsed) {
    return (
      <div className="flex-shrink-0 w-[52px] bg-[#1e2026] border-l border-white/5 flex flex-col overflow-hidden">
        {/* Expand button */}
        <button
          onClick={toggleCollapse}
          className="flex items-center justify-center h-[52px] border-b border-white/5 hover:bg-white/5 transition-colors text-[#848e9c] hover:text-[#eaecef]"
          title="Expand watchlist"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Mini coin rows */}
        <div className="flex-1 overflow-y-auto scrollbar-none">
          {sorted.map(coin => (
            <CoinRow
              key={coin.coinId}
              coin={coin}
              isActive={coin.coinId === activeCoinId}
              isFirst={false}
              isLast={false}
              onSelect={() => onSelectCoin(coin.coinId)}
              collapsed
            />
          ))}
        </div>

        {/* Add button */}
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center justify-center h-10 border-t border-white/5 hover:bg-[#f0b90b]/10 text-[#848e9c] hover:text-[#f0b90b] transition-colors"
          title="Add coin"
        >
          <Plus className="w-4 h-4" />
        </button>

        <AnimatePresence>
          {showAddModal && (
            <AddCoinModal onClose={() => setShowAddModal(false)} getBasePrice={getBasePrice} />
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="flex-shrink-0 w-[200px] bg-[#1e2026] border-l border-white/5 flex flex-col overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-2 h-[34px] border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <Star className="w-3 h-3 text-[#f0b90b]" />
          <span className="text-[11px] font-bold text-[#eaecef]">Watchlist</span>
          <span className="text-[9px] text-[#848e9c] font-mono">({coins.length})</span>
        </div>
        <div className="flex items-center gap-0.5">
          {/* Sort */}
          <div ref={sortRef} className="relative">
            <button
              onClick={() => setShowSort(s => !s)}
              className="p-1 rounded hover:bg-white/8 text-[#848e9c] hover:text-[#eaecef] transition-colors"
              title="Sort"
            >
              <BarChart2 className="w-3 h-3" />
            </button>
            <AnimatePresence>
              {showSort && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0,  scale: 1 }}
                  exit={{   opacity: 0, y: -4, scale: 0.95 }}
                  transition={{ duration: 0.12 }}
                  className="absolute right-0 top-full mt-1 w-32 bg-[#2b2f36] border border-white/10 rounded-xl shadow-xl overflow-hidden z-50"
                >
                  {SORT_OPTIONS.map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => { setSortKey(opt.key); setShowSort(false); }}
                      className={cn(
                        'w-full text-left px-3 py-2 text-[11px] transition-colors',
                        sortKey === opt.key
                          ? 'bg-[#f0b90b]/15 text-[#f0b90b] font-semibold'
                          : 'text-[#848e9c] hover:bg-white/5 hover:text-[#eaecef]',
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Add coin */}
          <button
            onClick={() => setShowAddModal(true)}
            className="p-1 rounded hover:bg-[#f0b90b]/15 text-[#848e9c] hover:text-[#f0b90b] transition-colors"
            title="Add coin"
          >
            <Plus className="w-3 h-3" />
          </button>

          {/* Collapse */}
          <button
            onClick={toggleCollapse}
            className="p-1 rounded hover:bg-white/8 text-[#848e9c] hover:text-[#eaecef] transition-colors"
            title="Collapse"
          >
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* ── Market summary strip ── */}
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-white/5 flex-shrink-0 bg-[#161a1e]">
        <div className="flex items-center gap-1">
          <TrendingUp className="w-2.5 h-2.5 text-[#0ecb81]" />
          <span className="text-[9px] font-bold text-[#0ecb81]">{gainers}</span>
        </div>
        <div className="flex-1 h-[2px] bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#0ecb81] to-[#f6465d] transition-all duration-500"
            style={{ width: coins.length > 0 ? `${(gainers / coins.length) * 100}%` : '50%' }}
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[9px] font-bold text-[#f6465d]">{losers}</span>
          <TrendingDown className="w-2.5 h-2.5 text-[#f6465d]" />
        </div>
      </div>

      {/* ── Coin list ── */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {coins.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-4 text-center">
            <div className="w-10 h-10 rounded-xl bg-[#2b2f36] flex items-center justify-center">
              <Star className="w-5 h-5 text-[#4a4e57]" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-[#848e9c]">No coins watched</p>
              <p className="text-[10px] text-[#4a4e57] mt-0.5">Tap + to add coins</p>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-3 py-1.5 bg-[#f0b90b]/15 hover:bg-[#f0b90b]/25 text-[#f0b90b] rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Add coins
            </button>
          </div>
        ) : (
          <AnimatePresence>
            {sorted.map((coin, i) => (
              <CoinRow
                key={coin.coinId}
                coin={coin}
                isActive={coin.coinId === activeCoinId}
                isFirst={i === 0}
                isLast={i === sorted.length - 1}
                onSelect={() => onSelectCoin(coin.coinId)}
                collapsed={false}
              />
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* ── Footer ── */}
      {coins.length > 0 && (
        <div className="border-t border-white/5 px-2 py-1.5 flex-shrink-0">
          <div className="flex items-center justify-between text-[9px] text-[#4a4e57]">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0ecb81] animate-pulse" />
              Live prices
            </span>
            <span>Updates every 1s</span>
          </div>
        </div>
      )}

      {/* Add Coin Modal */}
      <AnimatePresence>
        {showAddModal && (
          <AddCoinModal onClose={() => setShowAddModal(false)} getBasePrice={getBasePrice} />
        )}
      </AnimatePresence>
    </div>
  );
}
