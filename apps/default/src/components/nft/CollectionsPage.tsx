/**
 * CollectionsPage.tsx — NFT Collections browser + Collection Detail
 *
 * Features:
 *  - Filterable/sortable table of all 22+ collections
 *  - Chain, category, verified, blue-chip filters
 *  - Floor price, 24h change, volume, market cap columns
 *  - Click row → detail panel: traits, rarity chart, description, activity feed
 *  - Marketplace links
 */
import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, X, ChevronDown, ChevronUp, ExternalLink, Star,
  Shield, ArrowUpDown, Filter, RefreshCw, TrendingUp, TrendingDown,
  Info, Twitter, MessageSquare, Globe, ChevronRight,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { useNftStore } from '../../lib/nftStore';
import {
  NFTCollection, NFTChain, CollectionCategory, CollectionFilters,
  DEFAULT_COLLECTION_FILTERS, RARITY_TIER_META, getRarityTier,
} from '../../lib/nftTypes';
import {
  CHAIN_DISPLAY, CATEGORY_DISPLAY, fmtNative, fmtUsd, fmtPct,
  fmtAddr, timeAgo, MARKETPLACE_DISPLAY,
} from './nftUtils';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ── Collection row ────────────────────────────────────────────────────────────

function CollectionRow({ col, rank, onClick, isSelected }: {
  col: NFTCollection; rank: number; onClick: () => void; isSelected: boolean;
}) {
  const chain    = CHAIN_DISPLAY[col.chain];
  const category = CATEGORY_DISPLAY[col.category];
  const chgPos   = col.floorChange24h >= 0;

  return (
    <tr onClick={onClick}
      className={cn('cursor-pointer transition-colors border-b border-white/4',
        isSelected ? 'bg-primary/8' : 'hover:bg-white/3')}>
      <td className="px-4 py-3 text-xs font-mono text-muted-foreground/60 w-8">{rank}</td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-2.5">
          {/* Chain icon placeholder */}
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base shrink-0 font-black"
            style={{ background: `${chain.color}15`, color: chain.color }}>
            {chain.icon}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="font-semibold text-sm text-foreground">{col.name}</p>
              {col.verified  && <Shield className="h-3 w-3 text-blue-400" />}
              {col.isBlueChip && <Star  className="h-3 w-3 text-amber-400 fill-amber-400" />}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: `${category.color}12`, color: category.color }}>
                {category.icon} {category.name}
              </span>
              <span className="text-[10px] text-muted-foreground/50">{chain.name}</span>
            </div>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 text-right font-mono font-bold text-sm text-foreground">
        {fmtNative(col.floorPrice)} <span className="text-[10px] text-muted-foreground">{chain.symbol}</span>
      </td>
      <td className="px-3 py-3 text-right">
        <span className={cn('text-xs font-bold', chgPos ? 'text-emerald-400' : 'text-red-400')}>
          {chgPos ? '▲' : '▼'} {Math.abs(col.floorChange24h).toFixed(2)}%
        </span>
      </td>
      <td className="px-3 py-3 text-right font-mono text-sm text-muted-foreground">
        {fmtNative(col.volume24h)} <span className="text-[10px]">{chain.symbol}</span>
      </td>
      <td className="px-3 py-3 text-right text-xs text-muted-foreground">{fmtUsd(col.marketCapUsd)}</td>
      <td className="px-3 py-3 text-right text-xs text-muted-foreground">
        {(col.ownerRatio * 100).toFixed(0)}%
        <div className="w-12 h-1 rounded-full bg-white/5 mt-1 ml-auto">
          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, col.ownerRatio * 100)}%` }} />
        </div>
      </td>
      <td className="px-3 py-3 text-right">
        <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full',
          col.listingRate < 5 ? 'bg-emerald-500/10 text-emerald-400' :
          col.listingRate < 15 ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400')}>
          {col.listingRate.toFixed(1)}%
        </span>
      </td>
      <td className="px-3 py-3">
        <ChevronRight className={cn('h-4 w-4 transition-transform', isSelected ? 'rotate-90 text-primary' : 'text-white/20')} />
      </td>
    </tr>
  );
}

// ── Collection detail panel ───────────────────────────────────────────────────

function CollectionDetail({ col, onClose }: { col: NFTCollection; onClose: () => void }) {
  const chain    = CHAIN_DISPLAY[col.chain];
  const category = CATEGORY_DISPLAY[col.category];

  // Trait rarity chart data
  const traitChartData = col.traits.slice(0, 6).map(t => ({
    name:  t.category.slice(0, 10),
    count: t.values.length,
    rare:  t.values.filter(v => v.percentage < 5).length,
  }));

  // Rarity tier distribution (simulated from rarityScore + supply)
  const rarityDist = [
    { tier: 'legendary', count: Math.round(col.totalSupply * 0.01) },
    { tier: 'epic',      count: Math.round(col.totalSupply * 0.05) },
    { tier: 'rare',      count: Math.round(col.totalSupply * 0.15) },
    { tier: 'uncommon',  count: Math.round(col.totalSupply * 0.30) },
    { tier: 'common',    count: Math.round(col.totalSupply * 0.49) },
  ];

  const marketplaceLinks: { name: string; url: string; icon: string }[] = col.chain === 'solana' ? [
    { name: 'Magic Eden', url: `https://magiceden.io/marketplace/${col.slug}`, icon: '🪄' },
    { name: 'Tensor',     url: `https://tensor.trade/trade/${col.slug}`,       icon: '⚡' },
  ] : [
    { name: 'OpenSea',   url: `https://opensea.io/collection/${col.slug}`,   icon: '🌊' },
    { name: 'Blur',      url: `https://blur.io/collection/${col.slug}`,       icon: '🔥' },
    { name: 'LooksRare', url: `https://looksrare.org/collections/${col.contractAddress}`, icon: '👀' },
  ];

  return (
    <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }}
      className="w-full xl:w-[440px] shrink-0 border-l border-border flex flex-col overflow-y-auto bg-card/30">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 z-10 bg-card/95 backdrop-blur-xl">
        <div>
          <h3 className="font-black text-foreground">{col.name}</h3>
          <p className="text-[10px] text-muted-foreground">{chain.icon} {chain.name} · {category.icon} {category.name}</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-5 space-y-5 flex-1">
        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Floor Price',   value: `${fmtNative(col.floorPrice)} ${chain.symbol}`,   color: '#60a5fa' },
            { label: '24h Change',    value: fmtPct(col.floorChange24h),                         color: col.floorChange24h >= 0 ? '#34d399' : '#f87171' },
            { label: '24h Volume',    value: `${fmtNative(col.volume24h)} ${chain.symbol}`,     color: '#fbbf24' },
            { label: 'Market Cap',    value: fmtUsd(col.marketCapUsd),                           color: '#a78bfa' },
            { label: 'Total Supply',  value: col.totalSupply.toLocaleString(),                   color: '#fb923c' },
            { label: 'Owners',        value: col.owners.toLocaleString(),                        color: '#34d399' },
            { label: 'Listed',        value: `${col.listed} (${col.listingRate.toFixed(1)}%)`,  color: '#f472b6' },
            { label: 'Avg Rarity',    value: col.rarityScore != null ? col.rarityScore.toFixed(0) : 'N/A', color: '#f59e0b' },
          ].map(s => (
            <div key={s.label} className="rounded-xl p-3"
              style={{ background: `${s.color}06`, border: `1px solid ${s.color}18` }}>
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
              <p className="font-black text-sm mt-0.5" style={{ color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Description */}
        {col.description && (
          <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-xs text-muted-foreground leading-relaxed">{col.description}</p>
          </div>
        )}

        {/* Rarity distribution pie */}
        {col.rarityScore != null && (
          <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-3">Rarity Distribution</p>
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={100} height={100}>
                <PieChart>
                  <Pie data={rarityDist} dataKey="count" cx="50%" cy="50%" outerRadius={42} strokeWidth={0}>
                    {rarityDist.map(d => (
                      <Cell key={d.tier} fill={RARITY_TIER_META[d.tier as keyof typeof RARITY_TIER_META]?.color ?? '#6b7280'} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 flex-1">
                {rarityDist.map(d => {
                  const meta = RARITY_TIER_META[d.tier as keyof typeof RARITY_TIER_META];
                  return (
                    <div key={d.tier} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1" style={{ color: meta.color }}>
                        {meta.icon} {meta.label}
                      </span>
                      <span className="font-mono text-muted-foreground">{d.count.toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Trait categories chart */}
        {traitChartData.length > 0 && (
          <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-3">Trait Complexity</p>
            <ResponsiveContainer width="100%" height={100}>
              <BarChart data={traitChartData} margin={{ top: 0, right: 0, left: -30, bottom: 0 }} barGap={2}>
                <XAxis dataKey="name" tick={{ fontSize: 8, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="rounded-lg px-2 py-1 text-xs bg-card border border-border">
                      <p>{label}: <span className="font-bold text-primary">{payload[0]?.value} values</span></p>
                      <p className="text-amber-400">{payload[1]?.value} rare (&lt;5%)</p>
                    </div>
                  );
                }} />
                <Bar dataKey="count" fill="#60a5fa" radius={[3, 3, 0, 0]} maxBarSize={30} />
                <Bar dataKey="rare"  fill="#fbbf24" radius={[3, 3, 0, 0]} maxBarSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Top traits */}
        {col.traits.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Top Traits</p>
            {col.traits.slice(0, 4).map(trait => (
              <div key={trait.category} className="rounded-xl p-3"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <p className="text-xs font-semibold text-foreground mb-2">{trait.category}</p>
                <div className="space-y-1">
                  {trait.values.slice(0, 3).map(v => {
                    const tier = getRarityTier(v.rarityScore);
                    const meta = RARITY_TIER_META[tier];
                    return (
                      <div key={v.value} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <span className="text-[10px]">{meta.icon}</span>
                          {v.value}
                        </span>
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 rounded-full bg-white/5 overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${v.percentage}%`, background: meta.color }} />
                          </div>
                          <span className="font-mono text-[10px]" style={{ color: meta.color }}>{v.percentage}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Social + links */}
        <div className="rounded-xl p-4 space-y-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Community</p>
          <div className="flex gap-3 flex-wrap text-xs">
            <span className="flex items-center gap-1 text-blue-400">
              <Twitter className="h-3.5 w-3.5" /> {(col.twitterFollowers / 1000).toFixed(0)}K followers
            </span>
            <span className="flex items-center gap-1 text-indigo-400">
              <MessageSquare className="h-3.5 w-3.5" /> {(col.discordMembers / 1000).toFixed(0)}K members
            </span>
            {col.websiteUrl && (
              <a href={col.websiteUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-primary hover:underline">
                <Globe className="h-3.5 w-3.5" /> Website
              </a>
            )}
          </div>
        </div>

        {/* Marketplace links */}
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Trade on</p>
          <div className="flex flex-wrap gap-2">
            {marketplaceLinks.map(m => (
              <a key={m.name} href={m.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-white/10 hover:border-white/25 transition-all text-muted-foreground hover:text-foreground">
                {m.icon} {m.name} <ExternalLink className="h-3 w-3" />
              </a>
            ))}
          </div>
        </div>

        {/* Contract */}
        <div className="text-[10px] font-mono text-muted-foreground/40 break-all">
          Contract: {col.contractAddress}
        </div>
      </div>
    </motion.div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'volume_24h_desc', label: '24h Volume ↓' },
  { value: 'floor_desc',      label: 'Floor ↓' },
  { value: 'floor_asc',       label: 'Floor ↑' },
  { value: 'market_cap_desc', label: 'Market Cap ↓' },
  { value: 'owners_desc',     label: 'Owners ↓' },
  { value: 'floor_change_desc', label: 'Change ↓' },
  { value: 'floor_change_asc',  label: 'Change ↑' },
];

const CHAIN_OPTS: NFTChain[] = ['ethereum', 'solana', 'polygon'];

export function CollectionsPage({ focusSlug }: { focusSlug?: boolean }) {
  const { getCollections } = useNftStore();
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const [filters, setFilters] = useState({ ...DEFAULT_COLLECTION_FILTERS });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const collections = getCollections(filters as any);

  // If route has a slug, auto-select
  useEffect(() => {
    if (slug) {
      const col = getCollections().find(c => c.slug === slug);
      if (col) setSelectedId(col.id);
    }
  }, [slug]);

  const selected = collections.find(c => c.id === selectedId) ?? null;

  function toggleChain(ch: NFTChain) {
    setFilters(f => ({
      ...f,
      chains: f.chains.includes(ch) ? f.chains.filter(x => x !== ch) : [...f.chains, ch],
    }));
  }

  function toggleCategory(cat: string) {
    const c = cat as CollectionCategory;
    setFilters(f => ({
      ...f,
      categories: f.categories.includes(c) ? f.categories.filter(x => x !== c) : [...f.categories as string[], c] as CollectionCategory[],
    }));
  }

  return (
    <div className="flex h-full">
      {/* ── Table side ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-white/5 flex-wrap gap-y-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
              placeholder="Search collections…"
              className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-white/5 border border-white/10 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/20" />
          </div>

          {/* Chain pills */}
          <div className="flex gap-1.5">
            {CHAIN_OPTS.map(ch => {
              const d = CHAIN_DISPLAY[ch];
              const on = filters.chains.includes(ch);
              return (
                <button key={ch} onClick={() => toggleChain(ch)}
                  className={cn('flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all',
                    on ? 'text-foreground' : 'border-white/10 text-muted-foreground hover:border-white/20')}
                  style={on ? { background: `${d.color}15`, borderColor: `${d.color}35`, color: d.color } : {}}>
                  {d.icon} {d.name}
                </button>
              );
            })}
          </div>

          <select value={filters.sortBy as string}
            onChange={e => setFilters(f => ({ ...f, sortBy: e.target.value as any }))}
            className="px-3 py-2 rounded-xl text-xs bg-white/5 border border-white/10 text-muted-foreground focus:outline-none appearance-none">
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          <button onClick={() => setShowFilters(v => !v)}
            className={cn('flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs border transition-all',
              showFilters ? 'border-primary/50 bg-primary/10 text-primary' : 'border-white/10 text-muted-foreground hover:text-foreground')}>
            <Filter className="h-3.5 w-3.5" /> Filters
            {(filters.categories.length > 0 || filters.verified !== null || filters.isBlueChip !== null) && (
              <span className="w-4 h-4 rounded-full bg-primary text-[9px] font-black flex items-center justify-center text-primary-foreground">
                {filters.categories.length + (filters.verified !== null ? 1 : 0) + (filters.isBlueChip !== null ? 1 : 0)}
              </span>
            )}
          </button>

          <p className="text-xs text-muted-foreground ml-auto">{collections.length} collections</p>
        </div>

        {/* Advanced filters */}
        <AnimatePresence>
          {showFilters && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-b border-white/5 bg-white/2">
              <div className="px-5 py-3 flex flex-wrap gap-3 items-center">
                <div className="flex gap-1.5 flex-wrap">
                  {Object.entries(CATEGORY_DISPLAY).map(([cat, d]) => {
                    const on = filters.categories.includes(cat as CollectionCategory);
                    return (
                      <button key={cat} onClick={() => toggleCategory(cat)}
                        className={cn('flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all',
                          on ? 'text-foreground' : 'border-white/10 text-muted-foreground hover:border-white/20')}
                        style={on ? { background: `${d.color}15`, borderColor: `${d.color}35`, color: d.color } : {}}>
                        {d.icon} {d.name}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-2 ml-auto">
                  {[
                    { label: '✅ Verified', field: 'verified' },
                    { label: '⭐ Blue Chip', field: 'isBlueChip' },
                  ].map(opt => {
                    const val = filters[opt.field as 'verified' | 'isBlueChip'];
                    return (
                      <button key={opt.field}
                        onClick={() => setFilters(f => ({ ...f, [opt.field]: val === null ? true : val === true ? false : null }))}
                        className={cn('px-3 py-1.5 rounded-xl text-xs font-bold border transition-all',
                          val === true  ? 'border-primary/40 bg-primary/10 text-primary' :
                          val === false ? 'border-red-400/40 bg-red-400/10 text-red-400' :
                          'border-white/10 text-muted-foreground hover:border-white/20')}>
                        {opt.label} {val === true ? '✓' : val === false ? '✗' : ''}
                      </button>
                    );
                  })}
                  <button onClick={() => setFilters({ ...DEFAULT_COLLECTION_FILTERS })}
                    className="px-3 py-1.5 rounded-xl text-xs text-muted-foreground border border-white/10 hover:text-foreground">
                    Reset
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="text-[10px] font-black text-muted-foreground uppercase tracking-wider border-b border-white/5">
                <th className="px-4 py-3 text-left w-8">#</th>
                <th className="px-3 py-3 text-left">Collection</th>
                <th className="px-3 py-3 text-right">Floor</th>
                <th className="px-3 py-3 text-right">24h</th>
                <th className="px-3 py-3 text-right">24h Vol</th>
                <th className="px-3 py-3 text-right">Market Cap</th>
                <th className="px-3 py-3 text-right">Owners</th>
                <th className="px-3 py-3 text-right">Listed</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {collections.map((col, i) => (
                <CollectionRow key={col.id} col={col} rank={i + 1}
                  isSelected={col.id === selectedId}
                  onClick={() => setSelectedId(col.id === selectedId ? null : col.id)} />
              ))}
            </tbody>
          </table>
          {collections.length === 0 && (
            <div className="py-16 text-center">
              <p className="text-muted-foreground text-sm">No collections match your filters.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Detail panel ── */}
      <AnimatePresence>
        {selected && (
          <CollectionDetail key={selected.id} col={selected} onClose={() => setSelectedId(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
