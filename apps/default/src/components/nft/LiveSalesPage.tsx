/**
 * LiveSalesPage.tsx — Real-time NFT sales feed
 *
 * Features:
 *  - Auto-updating feed of generated sales (every 20s tick)
 *  - Filter by chain, rarity tier, marketplace, minimum price
 *  - Sort: newest / highest price / highest vs floor
 *  - Each row: collection, token id, price, rarity badge, marketplace, buyer/seller
 *  - Whale alert highlight for sales > 3× floor
 */
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, Filter, Search, ExternalLink, Copy,
  Zap, TrendingUp, RefreshCw, Bell,
} from 'lucide-react';
import { toast } from 'sonner';
import { useNftStore } from '../../lib/nftStore';
import {
  NFTSale, NFTChain, NFTMarketplace, RarityTier,
  SaleFeedFilters, DEFAULT_SALE_FILTERS, RARITY_TIER_META,
} from '../../lib/nftTypes';
import {
  CHAIN_DISPLAY, MARKETPLACE_DISPLAY, RARITY_DISPLAY,
  fmtNative, fmtUsd, fmtAddr, timeAgo,
} from './nftUtils';
import { cn } from '@/lib/utils';

// ── Sale row ─────────────────────────────────────────────────────────────────

function SaleRow({ sale, isNew }: { sale: NFTSale; isNew: boolean }) {
  const chain = CHAIN_DISPLAY[sale.chain];
  const mkt   = MARKETPLACE_DISPLAY[sale.marketplace];
  const rarity = sale.rarityTier ? RARITY_TIER_META[sale.rarityTier] : null;
  const isWhale = sale.priceVsFloor >= 3;
  const isAbove = sale.priceVsFloor >= 1;

  return (
    <motion.div
      initial={isNew ? { opacity: 0, x: -12, backgroundColor: 'rgba(96,165,250,0.12)' } : { opacity: 1, x: 0 }}
      animate={{ opacity: 1, x: 0, backgroundColor: 'transparent' }}
      transition={{ duration: isNew ? 0.8 : 0 }}
      className={cn(
        'flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-white/4 hover:bg-white/2 transition-colors',
        isWhale && 'border-l-2 border-l-amber-400',
      )}>
      {/* Chain */}
      <span className="font-black text-base shrink-0" style={{ color: chain.color }}>{chain.icon}</span>

      {/* Collection + token */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="font-semibold text-sm text-foreground truncate">{sale.collectionSlug.replace(/-/g, ' ')}</p>
          <span className="text-xs text-muted-foreground/60 font-mono">{sale.tokenId}</span>
          {isWhale && <Zap className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {rarity && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: rarity.bg, color: rarity.color }}>
              {rarity.icon} {rarity.label}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground/50">{timeAgo(sale.timestamp)}</span>
        </div>
      </div>

      {/* Marketplace */}
      <span className="text-sm shrink-0" title={mkt.name}>{mkt.icon}</span>

      {/* Price */}
      <div className="text-right shrink-0">
        <p className="font-black text-sm text-foreground">
          {fmtNative(sale.price)} <span className="text-muted-foreground text-[10px]">{chain.symbol}</span>
        </p>
        <p className="text-[10px] text-muted-foreground">{fmtUsd(sale.priceUsd)}</p>
      </div>

      {/* vs Floor */}
      <div className="text-right w-16 shrink-0">
        <span className={cn('text-xs font-bold',
          isAbove ? (isWhale ? 'text-amber-400' : 'text-emerald-400') : 'text-red-400')}>
          {sale.priceVsFloor.toFixed(2)}× floor
        </span>
      </div>

      {/* Explorer */}
      <a href={`https://etherscan.io/tx/${sale.txHash}`} target="_blank" rel="noopener noreferrer"
        className="shrink-0 text-muted-foreground/30 hover:text-primary transition-colors">
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </motion.div>
  );
}

// ── Stats banner ─────────────────────────────────────────────────────────────

function StatBanner({ sales }: { sales: NFTSale[] }) {
  const totalUsd    = sales.reduce((s, x) => s + x.priceUsd, 0);
  const avgVsFloor  = sales.length > 0 ? sales.reduce((s, x) => s + x.priceVsFloor, 0) / sales.length : 0;
  const whaleCount  = sales.filter(s => s.priceVsFloor >= 3).length;
  const topMkts     = Object.entries(
    sales.reduce((acc: Record<string, number>, s) => ({ ...acc, [s.marketplace]: (acc[s.marketplace] ?? 0) + 1 }), {})
  ).sort((a, b) => b[1] - a[1]).slice(0, 3);

  const stats = [
    { label: 'Volume Shown', value: fmtUsd(totalUsd), color: '#60a5fa' },
    { label: 'Avg vs Floor', value: `${avgVsFloor.toFixed(2)}×`, color: '#34d399' },
    { label: 'Whale Sales',  value: String(whaleCount), color: '#fbbf24' },
    { label: 'Top Market', value: topMkts[0]?.[0] ?? '—', color: '#a78bfa' },
  ];

  return (
    <div className="flex gap-4 px-4 sm:px-6 py-3 border-b border-white/5 overflow-x-auto">
      {stats.map(s => (
        <div key={s.label} className="shrink-0">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
          <p className="font-black text-sm" style={{ color: s.color }}>{s.value}</p>
        </div>
      ))}
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

const CHAIN_OPTS: NFTChain[]       = ['ethereum', 'solana', 'polygon'];
const RARITY_OPTS: RarityTier[]    = ['legendary', 'epic', 'rare', 'uncommon', 'common'];
const MKT_OPTS: NFTMarketplace[]   = ['OpenSea', 'Blur', 'Magic Eden', 'LooksRare', 'X2Y2', 'Tensor'];

export function LiveSalesPage() {
  const { getSalesFeed } = useNftStore();
  const [filters, setFilters] = useState<SaleFeedFilters>({ ...DEFAULT_SALE_FILTERS });
  const [limit, setLimit]     = useState(50);
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const [newIds, setNewIds]   = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);

  const sales = getSalesFeed(filters, limit);

  // Detect new sales for flash animation
  useEffect(() => {
    const currentIds = new Set(sales.map(s => s.id));
    const fresh = [...currentIds].filter(id => !seenIds.has(id));
    if (fresh.length > 0) {
      setNewIds(new Set(fresh));
      setTimeout(() => setNewIds(new Set()), 3000);
    }
    setSeenIds(currentIds);
  }, [sales.length]);

  function toggleRarity(r: RarityTier) {
    setFilters(f => ({
      ...f,
      rarityTiers: f.rarityTiers.includes(r) ? f.rarityTiers.filter(x => x !== r) : [...f.rarityTiers, r],
    }));
  }

  function toggleChain(ch: NFTChain) {
    setFilters(f => ({
      ...f,
      chains: f.chains.includes(ch) ? f.chains.filter(x => x !== ch) : [...f.chains, ch],
    }));
  }

  function toggleMkt(m: NFTMarketplace) {
    setFilters(f => ({
      ...f,
      marketplaces: f.marketplaces.includes(m) ? f.marketplaces.filter(x => x !== m) : [...f.marketplaces, m],
    }));
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-white/5 flex-wrap gap-y-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> LIVE FEED
        </div>

        {/* Chain pills */}
        <div className="flex gap-1.5">
          {CHAIN_OPTS.map(ch => {
            const d  = CHAIN_DISPLAY[ch];
            const on = filters.chains.includes(ch);
            return (
              <button key={ch} onClick={() => toggleChain(ch)}
                className={cn('flex items-center gap-1 px-2 py-1.5 rounded-xl text-[11px] font-bold border transition-all',
                  on ? 'text-foreground' : 'border-white/10 text-muted-foreground hover:border-white/20')}
                style={on ? { background: `${d.color}15`, borderColor: `${d.color}35`, color: d.color } : {}}>
                {d.icon} {d.name}
              </button>
            );
          })}
        </div>

        <select value={filters.sortBy}
          onChange={e => setFilters(f => ({ ...f, sortBy: e.target.value as any }))}
          className="px-3 py-2 rounded-xl text-xs bg-white/5 border border-white/10 text-muted-foreground focus:outline-none appearance-none">
          <option value="newest">Newest</option>
          <option value="highest_price">Highest Price</option>
          <option value="highest_vs_floor">Highest vs Floor</option>
        </select>

        <div className="flex items-center gap-2">
          <label className="text-[10px] text-muted-foreground">Min USD</label>
          <input type="number" value={filters.minPriceUsd} min={0}
            onChange={e => setFilters(f => ({ ...f, minPriceUsd: +e.target.value }))}
            className="w-20 px-2 py-1.5 rounded-xl text-xs bg-white/5 border border-white/10 focus:outline-none" />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-[10px] text-muted-foreground">Min Floor×</label>
          <input type="number" value={filters.minVsFloor} min={0} step={0.5}
            onChange={e => setFilters(f => ({ ...f, minVsFloor: +e.target.value }))}
            className="w-16 px-2 py-1.5 rounded-xl text-xs bg-white/5 border border-white/10 focus:outline-none" />
        </div>

        <button onClick={() => setShowFilters(v => !v)}
          className={cn('flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs border transition-all',
            showFilters ? 'border-primary/50 bg-primary/10 text-primary' : 'border-white/10 text-muted-foreground hover:text-foreground')}>
          <Filter className="h-3.5 w-3.5" /> Filters
        </button>

        <p className="ml-auto text-xs text-muted-foreground">{sales.length} sales</p>
      </div>

      {/* Rarity / Marketplace filter strip */}
      <AnimatePresence>
        {showFilters && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-white/5 bg-white/2">
            <div className="px-5 py-3 flex flex-wrap gap-4">
              <div>
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-2">Rarity</p>
                <div className="flex gap-1.5">
                  {RARITY_OPTS.map(r => {
                    const d  = RARITY_TIER_META[r];
                    const on = filters.rarityTiers.includes(r);
                    return (
                      <button key={r} onClick={() => toggleRarity(r)}
                        className={cn('px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-all',
                          on ? '' : 'border-white/10 text-muted-foreground hover:border-white/20')}
                        style={on ? { background: `${d.color}15`, borderColor: `${d.color}40`, color: d.color } : {}}>
                        {d.icon} {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-2">Marketplace</p>
                <div className="flex flex-wrap gap-1.5">
                  {MKT_OPTS.map(m => {
                    const d  = MARKETPLACE_DISPLAY[m];
                    const on = filters.marketplaces.includes(m);
                    return (
                      <button key={m} onClick={() => toggleMkt(m)}
                        className={cn('flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-all',
                          on ? '' : 'border-white/10 text-muted-foreground hover:border-white/20')}
                        style={on ? { background: `${d.color}15`, borderColor: `${d.color}40`, color: d.color } : {}}>
                        {d.icon} {m}
                      </button>
                    );
                  })}
                </div>
              </div>
              <button className="self-end text-xs text-muted-foreground border border-white/10 px-3 py-1.5 rounded-xl hover:text-foreground"
                onClick={() => setFilters({ ...DEFAULT_SALE_FILTERS })}>
                Reset
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <StatBanner sales={sales} />

      {/* Sales list */}
      <div className="flex-1 overflow-y-auto">
        {sales.length === 0 ? (
          <div className="py-16 text-center">
            <Activity className="h-10 w-10 mx-auto text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground">No sales match your filters.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Polling engine generates a sale every ~20s per collection.</p>
          </div>
        ) : (
          <>
            <AnimatePresence initial={false}>
              {sales.map(sale => (
                <SaleRow key={sale.id} sale={sale} isNew={newIds.has(sale.id)} />
              ))}
            </AnimatePresence>
            {limit !== 500 && (
              <div className="text-center py-4">
                <button onClick={() => setLimit(l => l + 50)}
                  className="text-xs text-muted-foreground hover:text-foreground border border-white/10 px-4 py-2 rounded-xl transition-colors">
                  Load more
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
