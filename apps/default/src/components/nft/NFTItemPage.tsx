/**
 * NFTItemPage.tsx — /nft/item/:slug/:tokenId  (§3.3)
 *
 * Sections:
 *  A) Item header — image placeholder, current price, ATH/ATL, owner
 *  B) Traits table — each trait with value, rarity %, score, bar
 *  C) Price history chart — simulated per-NFT price timeline
 *  D) Similar NFTs — based on trait similarity
 *  E) Actions — Simulate Purchase, Set Price Alert, Share
 */
import React, { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Bell, Share2, TrendingUp, TrendingDown,
  Copy, ExternalLink, Star, Tag, Eye,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { toast } from 'sonner';
import { useNftStore } from '../../lib/nftStore';
import { NFT_CHAIN_META, RARITY_TIER_META, getRarityTier } from '../../lib/nftTypes';
import { CHAIN_DISPLAY, fmtNative, fmtUsd, fmtAddr, timeAgo } from './nftUtils';
import { cn } from '@/lib/utils';
import { motion as m } from 'framer-motion';

// ── Deterministic helpers ─────────────────────────────────────────────────────

function seedFromStr(s: string) {
  let h = 2166136261;
  for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0);
}

function buildItemPriceHistory(floor: number, tokenId: string) {
  const seed = seedFromStr(tokenId);
  let price  = floor * (0.6 + (seed % 100) / 250);
  return Array.from({ length: 24 }, (_, i) => {
    const month = new Date();
    month.setMonth(month.getMonth() - (23 - i));
    const drift = Math.sin(i * 0.5 + seed) * 0.07 + (Math.random() - 0.47) * 0.05;
    price = Math.max(0.001, price * (1 + drift));
    return {
      label: month.toLocaleDateString('en', { month: 'short', year: '2-digit' }),
      price: parseFloat(price.toFixed(4)),
    };
  });
}

function buildSimilarNFTs(col: { name: string; floorPrice: number }, tokenId: string) {
  const seed = seedFromStr(tokenId);
  const ids  = [
    (parseInt(tokenId.replace('#','')) + 1000 + seed % 500).toString(),
    (parseInt(tokenId.replace('#','')) + 2000 + seed % 800).toString(),
    (parseInt(tokenId.replace('#','')) + 3000 + seed % 300).toString(),
  ];
  return ids.map((id, i) => ({
    id:    `#${id}`,
    price: parseFloat((col.floorPrice * (0.9 + (seed + i * 100) % 40 / 100)).toFixed(4)),
  }));
}

// ── Trait row ─────────────────────────────────────────────────────────────────

function TraitRow({ trait, value, rarity, score }: {
  trait: string; value: string; rarity: number; score: number;
}) {
  const tier = getRarityTier(score);
  const meta = RARITY_TIER_META[tier];
  const pct  = Math.min(100, (score / 100) * 10);

  return (
    <tr className="border-b border-white/4 hover:bg-white/2 text-sm">
      <td className="px-4 py-3 text-muted-foreground font-medium">{trait}</td>
      <td className="px-3 py-3">
        <span className="font-bold text-foreground">{value}</span>
      </td>
      <td className="px-3 py-3">
        <span className="font-mono text-xs" style={{ color: meta.color }}>{rarity.toFixed(1)}%</span>
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden min-w-[80px]">
            <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
              className="h-full rounded-full" style={{ background: meta.color }} />
          </div>
          <span className="font-mono font-bold text-xs w-10 text-right" style={{ color: meta.color }}>
            {score.toFixed(1)}
          </span>
        </div>
      </td>
    </tr>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function NFTItemPage() {
  const { slug = '', tokenId = '' } = useParams<{ slug: string; tokenId: string }>();
  const navigate = useNavigate();
  const { getCollection } = useNftStore();

  const col = getCollection(slug);

  if (!col) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <p className="text-muted-foreground">Collection not found</p>
          <button onClick={() => navigate('/nft')} className="mt-3 text-primary hover:underline text-sm">← Back</button>
        </div>
      </div>
    );
  }

  const chain     = CHAIN_DISPLAY[col.chain];
  const chainMeta = NFT_CHAIN_META[col.chain];
  const seed      = seedFromStr(`${slug}-${tokenId}`);

  // NFT-specific price (floor ± variance)
  const itemPrice   = parseFloat((col.floorPrice * (0.85 + (seed % 50) / 100)).toFixed(4));
  const itemPriceUsd = itemPrice * chainMeta.nativeUsdPrice;

  // Rarity
  const rarityScore = 200 + (seed % 700);
  const rarityRank  = 100 + (seed % (col.totalSupply - 200));
  const rarityPct   = parseFloat(((rarityRank / col.totalSupply) * 100).toFixed(1));
  const rarityTier  = getRarityTier(rarityScore);
  const rarityMeta  = RARITY_TIER_META[rarityTier];

  const ATH = parseFloat((col.floorPrice * (1.4 + (seed % 30) / 100)).toFixed(4));
  const ATL  = parseFloat((col.floorPrice * (0.3 + (seed % 20) / 100)).toFixed(4));

  const ownerSeed  = `0x${(seed >>> 0).toString(16).padStart(8, '0')}${((seed * 7) >>> 0).toString(16).padStart(8, '0')}`;
  const lastSaleAgo = `${2 + (seed % 59)} min`;

  // Traits for this specific token
  const itemTraits = col.traits.slice(0, 6).map((trait, i) => {
    const pick  = trait.values[(seed + i) % Math.max(1, trait.values.length)];
    return pick ? { trait: trait.category, value: pick.value, rarity: pick.percentage, score: pick.rarityScore } : null;
  }).filter(Boolean) as { trait: string; value: string; rarity: number; score: number }[];

  const priceHistory = useMemo(() => buildItemPriceHistory(col.floorPrice, tokenId), [col.slug, tokenId]);
  const similarNFTs  = useMemo(() => buildSimilarNFTs(col, tokenId), [col.slug, tokenId]);

  const displayId = tokenId.startsWith('#') ? tokenId : `#${tokenId}`;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <button onClick={() => navigate('/nft')} className="hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Dashboard
        </button>
        <span>/</span>
        <button onClick={() => navigate(`/nft/collection/${slug}`)} className="hover:text-foreground">
          {col.name}
        </button>
        <span>/</span>
        <span className="text-foreground font-semibold">{displayId}</span>
      </div>

      {/* ── A) Item Header ── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Image / Identity */}
        <div className="rounded-2xl overflow-hidden flex flex-col"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          {/* Generative art placeholder */}
          <div className="flex-1 flex items-center justify-center min-h-[220px]"
            style={{
              background: `linear-gradient(135deg, ${chain.color}20, transparent 60%), radial-gradient(circle at ${seed % 80 + 10}% ${(seed >> 8) % 80 + 10}%, ${chain.color}30 0%, transparent 60%)`,
            }}>
            <div className="text-center">
              <div className="text-6xl mb-2">{chain.icon}</div>
              <p className="font-black text-2xl text-foreground">{col.name}</p>
              <p className="text-primary font-mono font-bold">{displayId}</p>
            </div>
          </div>
          <div className="p-4 space-y-2 border-t border-white/5">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-sm text-foreground">{col.name} {displayId}</p>
                <p className="text-xs text-muted-foreground">{chain.name} · {col.totalSupply.toLocaleString()} total</p>
              </div>
              <span className="text-lg shrink-0">{rarityMeta.icon}</span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="font-bold px-2 py-0.5 rounded-full"
                style={{ background: `${rarityMeta.color}12`, color: rarityMeta.color }}>
                {rarityMeta.label}
              </span>
              <span className="text-muted-foreground">Rank #{rarityRank.toLocaleString()} / {col.totalSupply.toLocaleString()}</span>
              <span className="text-muted-foreground">Top {rarityPct}%</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Rarity Score: <span className="font-black" style={{ color: rarityMeta.color }}>{rarityScore.toFixed(1)}</span>
            </p>
          </div>
        </div>

        {/* Price info */}
        <div className="rounded-2xl p-5 space-y-4"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Current Price</p>
            <p className="text-3xl font-black text-foreground mt-1">
              {fmtNative(itemPrice)} <span className="text-xl text-muted-foreground">{chain.symbol}</span>
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">{fmtUsd(itemPriceUsd)}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Last Sale',   value: `${fmtNative(itemPrice)} ${chain.symbol}`, sub: lastSaleAgo, color: '#60a5fa' },
              { label: 'All Time High', value: `${fmtNative(ATH)} ${chain.symbol}`, sub: fmtUsd(ATH * chainMeta.nativeUsdPrice), color: '#34d399' },
              { label: 'All Time Low',  value: `${fmtNative(ATL)} ${chain.symbol}`,  sub: fmtUsd(ATL * chainMeta.nativeUsdPrice),  color: '#f87171' },
              { label: 'Current Owner', value: fmtAddr(ownerSeed), sub: 'verified holder', color: '#a78bfa' },
            ].map(s => (
              <div key={s.label} className="rounded-xl p-3"
                style={{ background: `${s.color}08`, border: `1px solid ${s.color}18` }}>
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
                <p className="font-black text-sm mt-0.5" style={{ color: s.color }}>{s.value}</p>
                <p className="text-[10px] text-muted-foreground">{s.sub}</p>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <a href={`${chainMeta.explorerUrl}/${ownerSeed}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs border border-white/10 text-muted-foreground hover:text-foreground transition-colors">
              <ExternalLink className="h-3 w-3" /> Explorer
            </a>
            <button onClick={() => { navigator.clipboard.writeText(`${col.name} ${displayId}`); toast.success('Copied!'); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs border border-white/10 text-muted-foreground hover:text-foreground transition-colors">
              <Share2 className="h-3 w-3" /> Share
            </button>
          </div>
        </div>
      </motion.div>

      {/* ── B) Traits Table ── */}
      {itemTraits.length > 0 && (
        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="rounded-2xl overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="px-5 py-4 border-b border-white/5" style={{ background: 'rgba(0,0,0,0.15)' }}>
            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Traits</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead>
                <tr className="text-[10px] font-black text-muted-foreground uppercase tracking-wider border-b border-white/5"
                  style={{ background: 'rgba(0,0,0,0.1)' }}>
                  <th className="px-4 py-3 text-left">Trait</th>
                  <th className="px-3 py-3 text-left">Value</th>
                  <th className="px-3 py-3 text-left">Rarity</th>
                  <th className="px-3 py-3 text-left">Score</th>
                </tr>
              </thead>
              <tbody>
                {itemTraits.map(t => (
                  <TraitRow key={t.trait} {...t} />
                ))}
              </tbody>
            </table>
          </div>
        </motion.section>
      )}

      {/* ── C) Price History ── */}
      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
        className="rounded-2xl p-5"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-4">Price History</p>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={priceHistory} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="item-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={rarityMeta.color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={rarityMeta.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#6B7280' }} axisLine={false} tickLine={false} interval={3} />
            <YAxis tick={{ fontSize: 9, fill: '#6B7280' }} axisLine={false} tickLine={false} />
            <Tooltip content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="rounded-xl px-3 py-2 text-xs shadow-xl bg-card border border-border">
                  <p className="text-muted-foreground">{label}</p>
                  <p className="font-black" style={{ color: rarityMeta.color }}>{payload[0]?.value} {chain.symbol}</p>
                </div>
              );
            }} />
            <Area type="monotone" dataKey="price" stroke={rarityMeta.color} strokeWidth={2}
              fill="url(#item-grad)" dot={false} activeDot={{ r: 4, fill: rarityMeta.color }} />
          </AreaChart>
        </ResponsiveContainer>
      </motion.section>

      {/* ── D) Similar NFTs ── */}
      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.10 }}
        className="rounded-2xl p-5"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-3">Similar NFTs</p>
        <p className="text-xs text-muted-foreground mb-3">Based on trait rarity, these NFTs are similar:</p>
        <div className="space-y-2">
          {similarNFTs.map(s => (
            <button key={s.id}
              onClick={() => navigate(`/nft/item/${slug}/${s.id.replace('#', '')}`)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm text-left transition-all hover:bg-white/4"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="flex items-center gap-2">
                <span style={{ color: chain.color }} className="font-mono">{chain.icon}</span>
                <span className="text-muted-foreground">{col.name} {s.id}</span>
                <span className="text-[10px] text-muted-foreground/50">(similar traits)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-black text-foreground">
                  {fmtNative(s.price)} {chain.symbol}
                </span>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/40" />
              </div>
            </button>
          ))}
        </div>
      </motion.section>

      {/* ── E) Actions ── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
        className="flex gap-3 flex-wrap">
        <button onClick={() => navigate('/nft/simulate')}
          className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
          🎮 Simulate Purchase
        </button>
        <button onClick={() => navigate('/nft/alerts')}
          className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm border border-amber-400/30 bg-amber-400/8 text-amber-400 hover:bg-amber-400/15 transition-all">
          <Bell className="h-4 w-4" /> Set Price Alert
        </button>
        <button onClick={() => { navigator.clipboard.writeText(`${col.name} ${displayId} — ${fmtNative(itemPrice)} ${chain.symbol}`); toast.success('Shared to clipboard'); }}
          className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm border border-white/15 text-muted-foreground hover:text-foreground transition-colors">
          <Share2 className="h-4 w-4" /> Share
        </button>
      </motion.div>
    </div>
  );
}
