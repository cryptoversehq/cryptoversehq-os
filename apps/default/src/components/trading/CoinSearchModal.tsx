import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchCoinList, LiveCoin } from '@/lib/liveMarketService';
import { useTradingLevelStore } from '@/lib/tradingLevelStore';
import { COINS } from '@/lib/coins';

const CATEGORIES = [
  { id:'all',     label:'All',       icon:'🌐' },
  { id:'fav',     label:'Watchlist', icon:'⭐' },
  { id:'defi',    label:'DeFi',      icon:'🔷' },
  { id:'layer1',  label:'Layer 1',   icon:'⛓️' },
  { id:'meme',    label:'Meme',      icon:'🐸' },
  { id:'stables', label:'Stables',   icon:'💵' },
] as const;

const MEME_IDS    = ['dogecoin','shiba-inu','pepe','floki','bonk','baby-doge-coin'];
const DEFI_IDS    = ['uniswap','aave','curve-dao-token','maker','compound-governance-token','sushiswap'];
const L1_IDS      = ['bitcoin','ethereum','solana','binancecoin','avalanche-2','cardano','polkadot','near','cosmos'];
const STABLE_IDS  = ['tether','usd-coin','dai','binance-usd','frax','true-usd'];
const PAGE_SIZE   = 50;

interface Coin { id: string; symbol: string; name: string; color: string; }
interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (coin: Coin) => void;
}

function getColor(id: string): string {
  const known = COINS.find(c => c.id === id);
  return known?.color ?? '#6B7280';
}

export function CoinSearchModal({ open, onClose, onSelect }: Props) {
  const { watchlist, toggleWatchlist } = useTradingLevelStore();
  const [query,    setQuery]    = useState('');
  const [category, setCategory] = useState<string>('all');
  const [coins,    setCoins]    = useState<LiveCoin[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [page,     setPage]     = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => inputRef.current?.focus(), 50);
    setLoading(true);
    fetchCoinList().then(list => { setCoins(list); setLoading(false); });
  }, [open]);

  useEffect(() => { setPage(0); }, [query, category]);

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const filtered = useMemo(() => {
    let list = coins;
    if (query) {
      const q = query.toLowerCase();
      list = list.filter(c =>
        c.symbol.toLowerCase().startsWith(q) ||
        c.name.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q),
      );
      list = [...list].sort((a, b) => {
        const aS = a.symbol.toLowerCase().startsWith(query.toLowerCase()) ? 0 : 1;
        const bS = b.symbol.toLowerCase().startsWith(query.toLowerCase()) ? 0 : 1;
        return aS - bS;
      });
    } else {
      if (category === 'fav')     list = list.filter(c => watchlist.includes(c.id));
      if (category === 'meme')    list = list.filter(c => MEME_IDS.includes(c.id));
      if (category === 'defi')    list = list.filter(c => DEFI_IDS.includes(c.id));
      if (category === 'layer1')  list = list.filter(c => L1_IDS.includes(c.id));
      if (category === 'stables') list = list.filter(c => STABLE_IDS.includes(c.id));
    }
    return list;
  }, [coins, query, category, watchlist]);

  const visible  = filtered.slice(0, (page + 1) * PAGE_SIZE);
  const hasMore  = visible.length < filtered.length;
  const isEmpty  = !loading && visible.length === 0;
  const coinCount = coins.length;

  const handleSelect = useCallback((coin: LiveCoin) => {
    onSelect({ id: coin.id, symbol: coin.symbol, name: coin.name, color: getColor(coin.id) });
    onClose();
  }, [onSelect, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-start justify-center pt-16 px-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            className="w-full max-w-2xl bg-[#0f1117] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            style={{ maxHeight: '75vh' }}>

            {/* Search bar */}
            <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
              <Search className="w-4 h-4 text-white/30 flex-shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search 10,000+ currencies by name, symbol or ID…"
                className="flex-1 bg-transparent text-[13px] text-white/80 outline-none placeholder-white/20" />
              {query && (
                <button onClick={() => setQuery('')} className="text-white/30 hover:text-white/60">
                  <X className="w-4 h-4" />
                </button>
              )}
              <button onClick={onClose} className="text-white/30 hover:text-white/60 ml-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Category tabs */}
            {!query && (
              <div className="flex items-center gap-1 px-3 py-2 border-b overflow-x-auto scrollbar-none"
                style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                {CATEGORIES.map(cat => {
                  const isActive = category === cat.id;
                  return (
                    <button key={cat.id} onClick={() => setCategory(cat.id)}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold whitespace-nowrap transition-colors flex-shrink-0',
                        isActive ? 'bg-amber-400/15 text-amber-400' : 'text-white/35 hover:text-white/65 hover:bg-white/[0.04]',
                      )}>
                      <span>{cat.icon}</span> {cat.label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Header row */}
            <div className="flex items-center px-4 py-2 text-[10px] text-white/25 border-b sticky top-0 bg-[#0f1117] z-10"
              style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              <span className="flex-1">Name</span>
              <span className="w-24 text-right">Symbol</span>
              <span className="w-8 text-center">★</span>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <div className="w-6 h-6 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
                  <p className="text-[12px] text-white/30">Loading coin list…</p>
                </div>
              ) : isEmpty ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2">
                  <Search className="w-8 h-8 text-white/10" />
                  <p className="text-[13px] text-white/30">No coins found</p>
                </div>
              ) : (
                <>
                  {visible.map(coin => {
                    const color  = getColor(coin.id);
                    const isFav  = watchlist.includes(coin.id);
                    return (
                      <button key={coin.id} onClick={() => handleSelect(coin)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.04] transition-colors text-left">
                        <span className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
                          style={{ background: color }}>
                          {coin.symbol.slice(0, 1)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-white/80 truncate">{coin.name}</p>
                          <p className="text-[10px] text-white/25 truncate">{coin.id}</p>
                        </div>
                        <span className="w-24 text-right text-[12px] font-mono font-bold text-white/60">{coin.symbol}</span>
                        <button
                          onClick={e => { e.stopPropagation(); toggleWatchlist(coin.id); }}
                          className={cn('w-8 flex justify-center flex-shrink-0', isFav ? 'text-amber-400' : 'text-white/15 hover:text-amber-400/60')}>
                          <Star className="w-3.5 h-3.5" fill={isFav ? 'currentColor' : 'none'} />
                        </button>
                      </button>
                    );
                  })}
                  {hasMore && (
                    <button onClick={() => setPage(p => p + 1)}
                      className="w-full py-3 text-[12px] text-white/40 hover:text-white/70 hover:bg-white/[0.03] transition-colors border-t border-white/[0.04]">
                      Load more ({filtered.length - visible.length} remaining)
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t text-[10px] text-white/25 flex items-center justify-between"
              style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              <span>CoinGecko • {coinCount.toLocaleString()} coins</span>
              <span className="text-white/15">ESC to close</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
