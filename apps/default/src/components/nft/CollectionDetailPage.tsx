/**
 * CollectionDetailPage.tsx — /nft/collection/:slug  (§3.2)
 *
 * Sections:
 *  A) Collection Overview — logo area, stats box (floor, change, volume, sales, avg price)
 *  B) Price Chart — 30-day simulated floor price line chart
 *  C) Collection Stats — listed, owners change, blue chips, rarity score, market cap
 *  D) Trait Rarity Distribution — most rare traits + horizontal rarity bars
 *  E) Recent Sales — token id, price, buyer, seller, time
 *  F) Actions — Simulate Trading, Set Price Alert, View NFTs
 */
import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Star, Shield, ExternalLink, Bell, ShoppingBag,
  TrendingUp, TrendingDown, Users, BarChart3, Eye, Share2,
  Copy, Globe, Twitter, MessageSquare, RefreshCw,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { toast } from 'sonner';
import { useNftStore } from '../../lib/nftStore';
import { NFTCollection, NFTSale, NFT_CHAIN_META, RARITY_TIER_META, getRarityTier } from '../../lib/nftTypes';
import { CHAIN_DISPLAY, CATEGORY_DISPLAY, MARKETPLACE_DISPLAY, fmtNative, fmtUsd, fmtPct, fmtAddr, timeAgo, getCollectionImageUrl, getCollectionGradient } from './nftUtils';
import { cn } from '@/lib/utils';
import { generateId } from '../../lib/strategyUtils';

// ── Simulated price history ───────────────────────────────────────────────────

function buildPriceHistory(col: NFTCollection): Array<{ week: string; floor: number; vol: number }> {
  let price = col.floorPrice * 0.75;
  return Array.from({ length: 30 }, (_, i) => {
    const drift = (Math.sin(i * 0.4 + col.slug.length) * 0.06 + (Math.random() - 0.48) * 0.04);
    price = Math.max(0.001, price * (1 + drift));
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    return {
      week:  d.toLocaleDateString('en', { month: 'short', day: 'numeric' }),
      floor: parseFloat(price.toFixed(4)),
      vol:   parseFloat((col.volume24h * (0.6 + Math.random() * 0.8)).toFixed(2)),
    };
  });
}

// ── Custom chart tooltip ──────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, symbol }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl px-3 py-2 text-xs shadow-xl bg-card border border-border">
      <p className="text-muted-foreground mb-1">{label}</p>
      <p className="font-black text-primary">{payload[0]?.value?.toFixed(4)} {symbol}</p>
      {payload[1] && <p className="text-muted-foreground">Vol: {payload[1]?.value} {symbol}</p>}
    </div>
  );
}

// ── Stat box ─────────────────────────────────────────────────────────────────

function StatBox({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="flex-1 rounded-2xl p-4 min-w-[120px]"
      style={{ background: `${color}08`, border: `1px solid ${color}20` }}>
      <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="font-black text-lg mt-0.5" style={{ color }}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Recent sale row ───────────────────────────────────────────────────────────

function SaleRow({ sale, chainSymbol }: { sale: NFTSale; chainSymbol: string }) {
  const mkt = MARKETPLACE_DISPLAY[sale.marketplace];
  return (
    <tr className="border-b border-white/4 hover:bg-white/2 text-sm">
      <td className="px-4 py-3">
        <button className="font-mono text-primary hover:underline text-xs">
          {sale.tokenId}
        </button>
      </td>
      <td className="px-3 py-3 font-black text-foreground">
        {fmtNative(sale.price)} <span className="text-[10px] text-muted-foreground font-normal">{chainSymbol}</span>
      </td>
      <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{fmtAddr(sale.toAddress)}</td>
      <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{fmtAddr(sale.fromAddress)}</td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{mkt.icon}</span>
          <span className="text-[10px] text-muted-foreground/60">{timeAgo(sale.timestamp)}</span>
        </div>
      </td>
    </tr>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function CollectionDetailPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { getCollection, getSalesFeed } = useNftStore();

  const col = getCollection(slug);

  if (!col) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <div className="text-center">
          <p className="text-muted-foreground">Collection not found: <code className="text-primary">{slug}</code></p>
          <button onClick={() => navigate('/nft')} className="mt-3 text-primary hover:underline text-sm">← Back to dashboard</button>
        </div>
      </div>
    );
  }

  const chain     = CHAIN_DISPLAY[col.chain];
  const chainMeta = NFT_CHAIN_META[col.chain];
  const category  = CATEGORY_DISPLAY[col.category];
  const imageUrl  = getCollectionImageUrl(col.slug);
  const gradient  = getCollectionGradient(col.slug);

  const priceHistory = useMemo(() => buildPriceHistory(col), [col.slug]);
  const allSales     = getSalesFeed({ collectionIds: [col.id] } as any, 20);
  // Fill with global sales if not enough
  const recentSales  = allSales.length >= 5 ? allSales : getSalesFeed({} as any, 10);

  // Derived stats
  const avgSalePrice = recentSales.length > 0
    ? recentSales.reduce((s, x) => s + x.price, 0) / recentSales.length
    : col.floorPrice * 1.05;
  const totalSales   = recentSales.length;
  const w7dVol       = col.volume7d;

  // Most rare traits
  const rareTraits = col.traits.flatMap(t => t.values)
    .filter(v => v.percentage < 3)
    .sort((a, b) => a.percentage - b.percentage)
    .slice(0, 5);

  function copyContract() {
    navigator.clipboard.writeText(col.contractAddress).catch(() => {});
    toast.success('Contract address copied');
  }

  function handleSimulateTrade() { navigate('/nft/simulate'); }
  function handleSetAlert()      { navigate('/nft/alerts'); }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">

      {/* ── Breadcrumb ── */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <button onClick={() => navigate('/nft')} className="hover:text-foreground transition-colors flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Dashboard
        </button>
        <span>/</span>
        <span className="text-foreground font-semibold">{col.name}</span>
      </div>

      {/* ── A) Collection Overview ── */}
      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left — Identity */}
        <div className="rounded-2xl p-5 space-y-4"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              {/* Collection image */}
              <div className="w-16 h-16 rounded-2xl overflow-hidden shrink-0 border border-white/10"
                style={{ background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})` }}>
                {imageUrl ? (
                  <img src={imageUrl} alt={col.name} className="w-full h-full object-cover" loading="lazy"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                  <span className="w-full h-full flex items-center justify-center text-2xl font-black"
                    style={{ color: chain.color }}>{chain.icon}</span>
                )}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-black text-foreground">{col.name}</h1>
                  {col.verified   && <Shield className="h-4 w-4 text-blue-400" />}
                  {col.isBlueChip && <Star   className="h-4 w-4 text-amber-400 fill-amber-400" />}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{ background: `${category.color}12`, color: category.color }}>
                    {category.icon} {category.name}
                  </span>
                  <span className="text-xs" style={{ color: chain.color }}>{chain.icon} {chain.name}</span>
                </div>
              </div>
            </div>
            <button onClick={() => navigate('/nft/watchlist')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs border border-white/10 text-muted-foreground hover:text-foreground transition-colors shrink-0">
              <Eye className="h-3.5 w-3.5" /> Watchlist
            </button>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">{col.description}</p>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <p className="text-muted-foreground/70">Chain</p>
              <p className="font-bold" style={{ color: chain.color }}>{chain.name}</p>
            </div>
            <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <p className="text-muted-foreground/70">Total Supply</p>
              <p className="font-bold text-foreground">{col.totalSupply.toLocaleString()}</p>
            </div>
            <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <p className="text-muted-foreground/70">Unique Owners</p>
              <p className="font-bold text-foreground">{col.owners.toLocaleString()}</p>
            </div>
            <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <p className="text-muted-foreground/70">Floor Cap</p>
              <p className="font-bold text-foreground">{Math.round(col.floorPrice * col.totalSupply).toLocaleString()} {chain.symbol}</p>
            </div>
          </div>

          {/* Social + links */}
          <div className="flex gap-3 flex-wrap text-xs">
            <a href={col.websiteUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-primary hover:underline">
              <Globe className="h-3.5 w-3.5" /> Website
            </a>
            <span className="flex items-center gap-1 text-blue-400">
              <Twitter className="h-3.5 w-3.5" /> {(col.twitterFollowers / 1000).toFixed(0)}K
            </span>
            <span className="flex items-center gap-1 text-indigo-400">
              <MessageSquare className="h-3.5 w-3.5" /> {(col.discordMembers / 1000).toFixed(0)}K
            </span>
            <button onClick={copyContract} className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
              <Copy className="h-3 w-3" /> Contract
            </button>
          </div>
        </div>

        {/* Right — Price stats */}
        <div className="rounded-2xl p-5 space-y-3"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Floor Price</p>
            <div className="flex items-end gap-3 mt-1">
              <p className="text-3xl font-black text-foreground">{fmtNative(col.floorPrice)} <span className="text-lg text-muted-foreground">{chain.symbol}</span></p>
              <div className={cn('flex items-center gap-1 text-sm font-bold pb-1', col.floorChange24h >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                {col.floorChange24h >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                {col.floorChange24h >= 0 ? '+' : ''}{col.floorChange24h.toFixed(2)}% last 24h
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">{fmtUsd(col.floorPriceUsd)}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            {[
              { label: 'Volume (7d)',   value: `${fmtNative(w7dVol)} ${chain.symbol}`,   sub: fmtUsd(col.volume7dUsd),   color: '#60a5fa' },
              { label: 'Total Sales',   value: totalSales.toString(),                     sub: 'in feed',                  color: '#34d399' },
              { label: 'Avg Price',     value: `${fmtNative(avgSalePrice)} ${chain.symbol}`, sub: fmtUsd(avgSalePrice * chainMeta.nativeUsdPrice), color: '#fbbf24' },
              { label: '24h Volume',    value: `${fmtNative(col.volume24h)} ${chain.symbol}`, sub: fmtUsd(col.volume24hUsd), color: '#a78bfa' },
            ].map(s => (
              <div key={s.label} className="rounded-xl p-3"
                style={{ background: `${s.color}08`, border: `1px solid ${s.color}18` }}>
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
                <p className="font-black text-sm mt-0.5" style={{ color: s.color }}>{s.value}</p>
                <p className="text-[10px] text-muted-foreground">{s.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* ── B) Price Chart ── */}
      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="rounded-2xl p-5"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Floor Price Chart (30 Days)</p>
          <p className="text-xs text-muted-foreground">{chain.symbol}</p>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={priceHistory} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id={`grad-${col.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={chain.color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={chain.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="week" tick={{ fontSize: 9, fill: '#6B7280' }} axisLine={false} tickLine={false}
              interval={4} />
            <YAxis tick={{ fontSize: 9, fill: '#6B7280' }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip symbol={chain.symbol} />} />
            <Area type="monotone" dataKey="floor" stroke={chain.color} strokeWidth={2}
              fill={`url(#grad-${col.id})`} dot={false} activeDot={{ r: 4, fill: chain.color }} />
          </AreaChart>
        </ResponsiveContainer>
      </motion.section>

      {/* ── C) Collection Stats ── */}
      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
        <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-3">Collection Stats</p>
        <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
          <StatBox label="Listed Count"   value={col.listed.toLocaleString()}              sub={`${col.listingRate.toFixed(1)}% of supply`} color="#60a5fa" />
          <StatBox label="Owners Change"  value="+12"                                       sub="last 24h"                                    color="#34d399" />
          <StatBox label="Blue Chips"     value={`${Math.round(col.owners * 0.03).toLocaleString()}`} sub="top 3% holders"                color="#fbbf24" />
          <StatBox label="Rarity Score"   value={col.rarityScore?.toFixed(1) ?? 'N/A'}     sub="avg score"                                   color="#a78bfa" />
          <StatBox label="Market Cap"     value={`${Math.round(col.floorPrice * col.totalSupply).toLocaleString()} ${chain.symbol}`} sub={fmtUsd(col.marketCapUsd)} color="#f472b6" />
        </div>
      </motion.section>

      {/* ── D) Trait Rarity Distribution ── */}
      {col.traits.length > 0 && (
        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="rounded-2xl p-5"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-4">Trait Rarity Distribution</p>

          {/* Most rare traits */}
          {rareTraits.length > 0 && (
            <div className="mb-4 p-3 rounded-xl text-xs"
              style={{ background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.15)' }}>
              <p className="text-amber-300 font-bold mb-1.5">Most Rare Traits:</p>
              <div className="flex flex-wrap gap-2">
                {rareTraits.map(t => (
                  <span key={t.value} className="text-amber-400/80">
                    • {t.value} ({t.percentage.toFixed(1)}%)
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Rarity bars */}
          <div className="space-y-3">
            {col.traits.slice(0, 6).map(trait => {
              const topValue = trait.values[0];
              const tier     = topValue ? getRarityTier(topValue.rarityScore) : 'common';
              const tierMeta = RARITY_TIER_META[tier];
              return (
                <div key={trait.category}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground font-semibold">{trait.category}</span>
                    <span className="text-muted-foreground/60">{trait.values.length} values</span>
                  </div>
                  {trait.values.slice(0, 3).map(v => {
                    const vTier = getRarityTier(v.rarityScore);
                    const vMeta = RARITY_TIER_META[vTier];
                    return (
                      <div key={v.value} className="flex items-center gap-3 text-[11px] mb-1.5">
                        <span className="w-28 truncate text-muted-foreground">{v.value}</span>
                        <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                          <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, v.percentage * 5)}%` }}
                            transition={{ duration: 0.7, ease: 'easeOut' }}
                            className="h-full rounded-full" style={{ background: vMeta.color }} />
                        </div>
                        <span className="font-mono w-10 text-right" style={{ color: vMeta.color }}>{v.percentage}%</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </motion.section>
      )}

      {/* ── E) Recent Sales ── */}
      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
        className="rounded-2xl overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="px-5 py-4 border-b border-white/5" style={{ background: 'rgba(0,0,0,0.15)' }}>
          <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Recent Sales</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[580px]">
            <thead>
              <tr className="text-[10px] font-black text-muted-foreground uppercase tracking-wider border-b border-white/5"
                style={{ background: 'rgba(0,0,0,0.1)' }}>
                <th className="px-4 py-3 text-left">Token ID</th>
                <th className="px-3 py-3 text-left">Price</th>
                <th className="px-3 py-3 text-left">Buyer</th>
                <th className="px-3 py-3 text-left">Seller</th>
                <th className="px-3 py-3 text-left">Time</th>
              </tr>
            </thead>
            <tbody>
              {recentSales.slice(0, 8).map(sale => (
                <SaleRow key={sale.id} sale={sale} chainSymbol={chain.symbol} />
              ))}
            </tbody>
          </table>
        </div>
      </motion.section>

      {/* ── F) Action buttons ── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}
        className="flex gap-3 flex-wrap">
        <button onClick={handleSimulateTrade}
          className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
          🎮 Simulate Trading
        </button>
        <button onClick={handleSetAlert}
          className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm border border-amber-400/30 bg-amber-400/8 text-amber-400 hover:bg-amber-400/15 transition-all">
          <Bell className="h-4 w-4" /> Set Price Alert
        </button>
        <button onClick={() => navigate(`/nft/live-sales`)}
          className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm border border-white/15 text-muted-foreground hover:text-foreground transition-colors">
          <Eye className="h-4 w-4" /> View NFTs in Collection
        </button>
      </motion.div>
    </div>
  );
}
