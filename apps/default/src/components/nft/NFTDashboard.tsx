/**
 * NFTDashboard.tsx — Main NFT landing page (§3.1)
 *
 * Sections:
 *  A) Marketplace Selector — 5 cards with live/offline status
 *  B) Market Overview — 5 KPI cards (volume, sales, buyers, listings, holders)
 *  C) Top Collections — sortable table with rank, floor, volume, owners, 7d%
 *  D) Trending Mints — new collection alerts with progress bar
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  TrendingUp, TrendingDown, Star, Shield, RefreshCw,
  ExternalLink, Zap, Bell, ShoppingBag, Users, BarChart3,
  List, Activity, Globe,
} from 'lucide-react';
import { useNftStore } from '../../lib/nftStore';
import { NFTCollection, NFT_CHAIN_META } from '../../lib/nftTypes';
import { fmtUsd, fmtNative, fmtPct, CHAIN_DISPLAY, MARKETPLACE_DISPLAY, CATEGORY_DISPLAY, getCollectionImageUrl, getCollectionGradient } from './nftUtils';
import { pingNFTProviders, type NFTProviderStatus } from '../../lib/nftApiGateway';
import { cn } from '@/lib/utils';

// ── Marketplace card ──────────────────────────────────────────────────────────

const MARKETPLACE_CONFIG = [
  { name: 'OpenSea',    icon: '🌊', color: '#2081e2', chain: 'ETH/Polygon', desc: 'Largest NFT marketplace' },
  { name: 'Blur',       icon: '🔥', color: '#ff6600', chain: 'Ethereum',    desc: 'Pro trader platform' },
  { name: 'LooksRare',  icon: '👀', color: '#0ce466', chain: 'Ethereum',    desc: 'Community rewards' },
  { name: 'Magic Eden', icon: '🪄', color: '#e42575', chain: 'Solana/ETH',  desc: 'Cross-chain NFTs' },
  { name: 'Rarible',    icon: '🟣', color: '#feda03', chain: 'Multi-chain', desc: 'Creator-owned protocol' },
];

function MarketplaceCard({ mkt, status }: {
  mkt: typeof MARKETPLACE_CONFIG[0];
  status: NFTProviderStatus | null;
}) {
  const isOnline = status?.status === 'connected' || status == null;
  const latency  = status?.latencyMs;

  return (
    <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}
      className="rounded-2xl p-4 cursor-pointer flex flex-col gap-2 shrink-0"
      style={{ background: `${mkt.color}10`, border: `1px solid ${mkt.color}25`, minWidth: 140 }}>
      <div className="flex items-center justify-between">
        <span className="text-2xl">{mkt.icon}</span>
        <div className={cn('flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full',
          isOnline ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400')}>
          <span className={cn('w-1.5 h-1.5 rounded-full', isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-red-400')} />
          {isOnline ? 'Active' : 'Offline'}
        </div>
      </div>
      <div>
        <p className="font-black text-sm text-foreground">{mkt.name}</p>
        <p className="text-[10px] text-muted-foreground">{mkt.chain}</p>
        <p className="text-[10px] text-muted-foreground/60 mt-0.5">{mkt.desc}</p>
      </div>
      {latency != null && (
        <p className="text-[9px] text-muted-foreground/40">{latency}ms</p>
      )}
    </motion.div>
  );
}

// ── Market KPI ────────────────────────────────────────────────────────────────

function MarketKPI({ label, value, change, color, icon: Icon }: {
  label: string; value: string; change?: number; color: string; icon: React.ElementType;
}) {
  const chgPos = (change ?? 0) >= 0;
  return (
    <div className="flex-1 rounded-2xl p-4 min-w-[120px]"
      style={{ background: `${color}08`, border: `1px solid ${color}20` }}>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="h-3.5 w-3.5" style={{ color }} />
        <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
      </div>
      <p className="text-xl font-black leading-none" style={{ color }}>{value}</p>
      {change != null && (
        <div className={cn('flex items-center gap-0.5 mt-1.5 text-[11px] font-bold', chgPos ? 'text-emerald-400' : 'text-red-400')}>
          {chgPos ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {chgPos ? '+' : ''}{change.toFixed(1)}%
        </div>
      )}
    </div>
  );
}

// ── Top collection row ────────────────────────────────────────────────────────

function CollectionRow({ col, rank, onClick }: {
  col: NFTCollection; rank: number; onClick: () => void;
}) {
  const chain  = CHAIN_DISPLAY[col.chain];
  const chgPos = col.floorChange24h >= 0;
  const w7dChg = (col.floorChange24h * 1.4 + (Math.sin(rank) * 3)).toFixed(1);
  const imageUrl = getCollectionImageUrl(col.slug);
  const gradient = getCollectionGradient(col.slug);
  const w7dPos = parseFloat(w7dChg) >= 0;

  return (
    <tr className="border-b border-white/4 hover:bg-white/3 cursor-pointer transition-colors group" onClick={onClick}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono text-muted-foreground/50 w-5 text-right">#{rank}</span>
        </div>
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl shrink-0 overflow-hidden border border-white/10"
            style={{ background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})` }}>
            {imageUrl ? (
              <img src={imageUrl} alt={col.name} className="w-full h-full object-cover" loading="lazy"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            ) : (
              <span className="w-full h-full flex items-center justify-center text-xs font-black"
                style={{ color: chain.color }}>{col.name.charAt(0)}</span>
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="font-bold text-sm text-foreground group-hover:text-primary transition-colors">{col.name}</p>
              {col.verified  && <Shield className="h-3 w-3 text-blue-400" />}
              {col.isBlueChip && <Star  className="h-3 w-3 text-amber-400 fill-amber-400" />}
            </div>
            <p className="text-[10px] text-muted-foreground">{chain.name} · {CATEGORY_DISPLAY[col.category].name}</p>
            {rank <= 3 && col.isBlueChip && (
              <span className="text-[9px] font-bold text-amber-400">⭐ Floor Alert!</span>
            )}
          </div>
        </div>
      </td>
      <td className="px-3 py-3 text-right">
        <p className="font-black text-sm text-foreground">{fmtNative(col.floorPrice)} <span className="text-[10px] text-muted-foreground">{chain.symbol}</span></p>
        <p className="text-[10px] text-muted-foreground">{fmtUsd(col.floorPriceUsd)}</p>
      </td>
      <td className="px-3 py-3 text-right">
        <p className="font-semibold text-sm text-foreground">{fmtUsd(col.volume24hUsd)}</p>
        <p className="text-[10px] text-muted-foreground">{fmtNative(col.volume24h)} {chain.symbol}</p>
      </td>
      <td className="px-3 py-3 text-right">
        <p className="text-sm text-muted-foreground">{col.owners.toLocaleString()}</p>
        <p className="text-[10px] text-muted-foreground/50">{(col.ownerRatio * 100).toFixed(0)}% unique</p>
      </td>
      <td className="px-3 py-3 text-right">
        <span className={cn('text-sm font-black flex items-center justify-end gap-0.5',
          chgPos ? 'text-emerald-400' : 'text-red-400')}>
          {chgPos ? '▲' : '▼'} {Math.abs(col.floorChange24h).toFixed(2)}%
        </span>
      </td>
      <td className="px-3 py-3 text-right">
        <span className={cn('inline-flex items-center gap-1 text-sm font-black px-2 py-0.5 rounded-full',
          w7dPos ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400')}>
          {w7dPos ? '🟢' : '🔴'} {w7dPos ? '+' : ''}{w7dChg}%
        </span>
      </td>
    </tr>
  );
}

// ── Trending mint card ────────────────────────────────────────────────────────

const TRENDING_MINTS = [
  { name: 'Pixel Punks', price: 0.1, supply: 10000, minted: 45, chain: 'ethereum' as const, hot: true },
  { name: 'Cyber Kittens', price: 0.05, supply: 5000, minted: 78, chain: 'solana' as const, hot: false },
  { name: 'MetaWorld Land', price: 0.25, supply: 50000, minted: 23, chain: 'polygon' as const, hot: false },
];

function TrendingMintCard({ mint, onViewCollection, onSimulateMint }: {
  mint: typeof TRENDING_MINTS[0];
  onViewCollection: () => void;
  onSimulateMint: () => void;
}) {
  const chain = CHAIN_DISPLAY[mint.chain];
  return (
    <motion.div whileHover={{ scale: 1.01 }}
      className="rounded-2xl p-4"
      style={{ background: mint.hot ? 'rgba(251,191,36,0.05)' : 'rgba(255,255,255,0.03)',
               border: mint.hot ? '1px solid rgba(251,191,36,0.2)' : '1px solid rgba(255,255,255,0.07)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {mint.hot && <Zap className="h-4 w-4 text-amber-400 shrink-0" />}
          <div>
            <p className="font-black text-sm text-foreground">
              🔥 New Collection Alert: <span className="text-primary">"{mint.name}"</span> minting now!
            </p>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
              <span>Price: <strong style={{ color: chain.color }}>{mint.price} {chain.symbol}</strong></span>
              <span>Supply: {mint.supply.toLocaleString()}</span>
              <span>Minted: <strong className="text-emerald-400">{mint.minted}%</strong></span>
              <span style={{ color: chain.color }}>{chain.icon} {chain.name}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
          <span>Mint progress</span>
          <span className="font-bold text-emerald-400">{mint.minted}%</span>
        </div>
        <div className="h-2 rounded-full bg-white/5 overflow-hidden">
          <motion.div initial={{ width: 0 }} animate={{ width: `${mint.minted}%` }}
            transition={{ duration: 1, ease: 'easeOut' }}
            className="h-full rounded-full"
            style={{ background: 'linear-gradient(90deg, #34d399, #059669)' }} />
        </div>
      </div>

      <div className="flex gap-2 mt-3">
        <button onClick={onViewCollection}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-white/15 text-muted-foreground hover:text-foreground hover:border-white/30 transition-all">
          <ExternalLink className="h-3.5 w-3.5" /> View Collection
        </button>
        <button onClick={onSimulateMint}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
          style={{ background: 'rgba(96,165,250,0.12)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.25)' }}>
          🎮 Simulate Mint
        </button>
      </div>
    </motion.div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export function NFTDashboard() {
  const { getCollections, getGlobalStats } = useNftStore();
  const navigate = useNavigate();

  const [providerStatuses, setProviderStatuses] = useState<NFTProviderStatus[]>([]);
  const [stats, setStats] = useState(() => getGlobalStats());
  const [sortBy, setSortBy] = useState<'volume' | 'floor' | 'owners'>('volume');

  // Ping providers on mount
  useEffect(() => {
    pingNFTProviders().then(setProviderStatuses);
    const id = setInterval(() => setStats(getGlobalStats()), 5_000);
    return () => clearInterval(id);
  }, []);

  const topCollections = useMemo(() => {
    const cols = getCollections();
    const sorted = [...cols].sort((a, b) => {
      if (sortBy === 'volume') return b.volume24hUsd - a.volume24hUsd;
      if (sortBy === 'floor')  return b.floorPriceUsd - a.floorPriceUsd;
      return b.owners - a.owners;
    });
    return sorted.slice(0, 10);
  }, [sortBy, stats]);  // re-derive on tick

  // Derived market overview numbers (seeded from stats)
  const totalSales24h  = Math.round(stats.totalSalesTracked * 0.15);
  const totalBuyers24h = Math.round(totalSales24h * 0.6);
  const activeListings = topCollections.reduce((s, c) => s + c.listed, 0);
  const totalHolders   = Math.round(stats.totalCollections * 3800);

  function getProviderStatus(name: string): NFTProviderStatus | null {
    return providerStatuses.find(p => p.name === name) ?? null;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-8">

      {/* ── A) Marketplace Selector ── */}
      <section>
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">
          Marketplace Selector
        </p>
        <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
          {MARKETPLACE_CONFIG.map(mkt => (
            <MarketplaceCard key={mkt.name} mkt={mkt} status={getProviderStatus(mkt.name)} />
          ))}
        </div>
      </section>

      {/* ── B) Market Overview KPIs ── */}
      <section>
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">
          Market Overview
        </p>
        <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
          <MarketKPI label="Total Volume"    value={fmtUsd(stats.totalVolumeUsd)} change={12}  color="#60a5fa" icon={BarChart3} />
          <MarketKPI label="24h Sales"       value={totalSales24h.toLocaleString()} change={5}  color="#34d399" icon={Activity} />
          <MarketKPI label="24h Buyers"      value={totalBuyers24h.toLocaleString()} change={-2} color="#fbbf24" icon={Users} />
          <MarketKPI label="Active Listings" value={activeListings.toLocaleString()} change={8}  color="#a78bfa" icon={List} />
          <MarketKPI label="NFT Holders"     value={`${(totalHolders / 1000).toFixed(1)}K`} change={3} color="#f472b6" icon={Globe} />
        </div>
      </section>

      {/* ── C) Top Collections ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Top Collections
          </p>
          <div className="flex gap-1.5">
            {[
              { id: 'volume', label: '24h Vol' },
              { id: 'floor',  label: 'Floor' },
              { id: 'owners', label: 'Owners' },
            ].map(s => (
              <button key={s.id} onClick={() => setSortBy(s.id as any)}
                className={cn('px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all',
                  sortBy === s.id
                    ? 'bg-primary/10 text-primary border-primary/30'
                    : 'border-white/10 text-muted-foreground hover:border-white/20')}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-2xl overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead style={{ background: 'rgba(0,0,0,0.2)' }}>
                <tr className="text-[10px] font-black text-muted-foreground uppercase tracking-wider border-b border-white/5">
                  <th className="px-4 py-3 text-left w-10">#</th>
                  <th className="px-3 py-3 text-left">Collection</th>
                  <th className="px-3 py-3 text-right">Floor</th>
                  <th className="px-3 py-3 text-right">Volume</th>
                  <th className="px-3 py-3 text-right">Owners</th>
                  <th className="px-3 py-3 text-right">24h %</th>
                  <th className="px-3 py-3 text-right">7d %</th>
                </tr>
              </thead>
              <tbody>
                {topCollections.map((col, i) => (
                  <CollectionRow key={col.id} col={col} rank={i + 1}
                    onClick={() => navigate(`/nft/collection/${col.slug}`)} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-white/5">
            <button onClick={() => navigate('/nft/live-sales')}
              className="text-xs text-primary hover:underline">
              View all collections in Live Sales →
            </button>
          </div>
        </div>
      </section>

      {/* ── D) Trending Mints ── */}
      <section>
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">
          Trending Mints
        </p>
        <div className="space-y-3">
          {TRENDING_MINTS.map((mint, i) => (
            <TrendingMintCard key={mint.name} mint={mint}
              onViewCollection={() => navigate('/nft/live-sales')}
              onSimulateMint={() => navigate('/nft/simulate')} />
          ))}
        </div>
      </section>

    </div>
  );
}
