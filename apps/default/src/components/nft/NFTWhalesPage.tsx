/**
 * NFTWhalesPage.tsx — /nft/whales  (§3.6)
 *
 * Sections:
 *  A) Top NFT Holders — rank table: wallet, NFT count, estimated value, recent buy, badge
 *  B) Whale Activity Feed — live feed of whale buys/sells/listings
 *  C) Actions — Track Wallet, Set Whale Alert
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap, RefreshCw, ExternalLink, Bell, Eye,
  TrendingUp, Copy, ChevronRight, Activity, Trophy,
} from 'lucide-react';
import { toast } from 'sonner';
import { useNftStore } from '../../lib/nftStore';
import { NFT_CHAIN_META } from '../../lib/nftTypes';
import { CHAIN_DISPLAY, fmtNative, fmtUsd, fmtAddr, timeAgo } from './nftUtils';
import { cn } from '@/lib/utils';

// ── Deterministic whale generator ────────────────────────────────────────────

function seedRng(seed: number) {
  let s = seed >>> 0;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4_294_967_296; };
}

interface WhaleHolder {
  rank:       number;
  address:    string;
  label:      string | null;
  badge:      string;
  nftCount:   number;
  estValueEth: number;
  estValueUsd:  number;
  recentBuy:  { collection: string; tokenId: string; time: string } | null;
}

interface WhaleActivity {
  id:         string;
  address:    string;
  label:      string | null;
  action:     'bought' | 'sold' | 'listed';
  collection: string;
  tokenId:    string;
  price:      number;
  chain:      string;
  time:       string;
}

const WHALE_BADGES = ['🏆 Top Collector', '📈 Active Trader', '🔥 Whale Alert!', '💎 Diamond Hands', '🎯 Smart Money'];

function buildWhaleHolders(): WhaleHolder[] {
  const rng = seedRng(0xdeadbeef);
  return Array.from({ length: 10 }, (_, i) => {
    const addrSeed = Math.floor(rng() * 0xffffff);
    const addr     = `0x${addrSeed.toString(16).padStart(6,'0')}${(rng() * 0xffffffffffff | 0).toString(16).padStart(12,'0')}`;
    const nftCount = Math.round(80 + rng() * 200 - i * 8);
    const ethValue = parseFloat((nftCount * (2 + rng() * 15)).toFixed(1));
    const badge    = WHALE_BADGES[i % WHALE_BADGES.length];
    const COLLECTIONS = ['BAYC', 'CryptoPunks', 'Azuki', 'Pudgy Penguins', 'Milady Maker', 'Doodles'];
    const col      = COLLECTIONS[Math.floor(rng() * COLLECTIONS.length)];
    const tokenId  = `#${Math.floor(rng() * 9999)}`;
    const minsAgo  = Math.floor(rng() * 360);

    return {
      rank:        i + 1,
      address:     addr,
      label:       null,
      badge,
      nftCount,
      estValueEth: ethValue,
      estValueUsd: parseFloat((ethValue * 3420).toFixed(0)),
      recentBuy: {
        collection: col,
        tokenId,
        time: new Date(Date.now() - minsAgo * 60_000).toISOString(),
      },
    };
  });
}

function buildWhaleActivity(holders: WhaleHolder[]): WhaleActivity[] {
  const ACTIONS: Array<'bought' | 'sold' | 'listed'> = ['bought', 'sold', 'listed'];
  const COLLECTIONS = ['BAYC', 'CryptoPunks', 'Azuki', 'Mad Lads', 'CloneX', 'Pudgy Penguins'];
  return Array.from({ length: 12 }, (_, i) => {
    const rng = seedRng(0xcafebabe + i * 7);
    const holder  = holders[i % holders.length];
    const action  = ACTIONS[Math.floor(rng() * ACTIONS.length)];
    const col     = COLLECTIONS[Math.floor(rng() * COLLECTIONS.length)];
    const price   = parseFloat((0.5 + rng() * 30).toFixed(2));
    const minsAgo = Math.floor(rng() * 180);
    return {
      id:         `whale-${i}`,
      address:    holder.address,
      label:      null,
      action,
      collection: col,
      tokenId:    `#${Math.floor(rng() * 9999)}`,
      price,
      chain:      'ethereum',
      time:       new Date(Date.now() - minsAgo * 60_000).toISOString(),
    };
  }).sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
}

// ── Whale holder row ──────────────────────────────────────────────────────────

function HolderRow({ whale, onTrack }: { whale: WhaleHolder; onTrack: () => void }) {
  return (
    <tr className="border-b border-white/4 hover:bg-white/2 transition-colors text-sm">
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-muted-foreground/50 text-xs">#{whale.rank}</span>
          {whale.rank <= 3 && <Trophy className={cn('h-3.5 w-3.5', whale.rank === 1 ? 'text-amber-400' : whale.rank === 2 ? 'text-slate-300' : 'text-amber-700')} />}
        </div>
      </td>
      <td className="px-3 py-3">
        <div>
          <p className="font-mono text-xs text-foreground">{fmtAddr(whale.address)}</p>
          <span className="text-[10px] font-bold text-muted-foreground/80">{whale.badge}</span>
        </div>
      </td>
      <td className="px-3 py-3 text-right font-bold text-foreground">{whale.nftCount}</td>
      <td className="px-3 py-3 text-right">
        <p className="font-black text-sm text-primary">{fmtNative(whale.estValueEth)} ETH</p>
        <p className="text-[10px] text-muted-foreground">{fmtUsd(whale.estValueUsd)}</p>
      </td>
      <td className="px-3 py-3">
        {whale.recentBuy && (
          <div>
            <p className="text-xs text-foreground">{whale.recentBuy.collection} {whale.recentBuy.tokenId}</p>
            <p className="text-[10px] text-muted-foreground">{timeAgo(whale.recentBuy.time)}</p>
          </div>
        )}
      </td>
      <td className="px-3 py-3">
        <button onClick={onTrack}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold border border-primary/30 bg-primary/8 text-primary hover:bg-primary/15 transition-all">
          <Eye className="h-3 w-3" /> Track
        </button>
      </td>
    </tr>
  );
}

// ── Activity feed item ────────────────────────────────────────────────────────

function ActivityItem({ item, isNew }: { item: WhaleActivity; isNew: boolean }) {
  const actionConfig = {
    bought: { icon: '🐋', verb: 'just bought',   color: '#34d399' },
    sold:   { icon: '🐋', verb: 'just sold',     color: '#f87171' },
    listed: { icon: '🐋', verb: 'just listed',   color: '#60a5fa' },
  };
  const cfg = actionConfig[item.action];

  return (
    <motion.div
      initial={isNew ? { opacity: 0, x: -10, backgroundColor: 'rgba(96,165,250,0.1)' } : { opacity: 1, x: 0 }}
      animate={{ opacity: 1, x: 0, backgroundColor: 'transparent' }}
      transition={{ duration: isNew ? 0.8 : 0 }}
      className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-white/4 hover:bg-white/2">
      <span className="text-xl shrink-0">{cfg.icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs">
          <span className="font-mono font-bold text-foreground">{fmtAddr(item.address)}</span>{' '}
          <span style={{ color: cfg.color }}>{cfg.verb}</span>{' '}
          <span className="font-bold text-foreground">{item.collection} {item.tokenId}</span>{' '}
          {item.action !== 'listed' && (
            <span>for <span className="font-bold text-primary">{fmtNative(item.price)} ETH</span></span>
          )}
          {item.action === 'listed' && (
            <span className="text-muted-foreground">for sale</span>
          )}
        </p>
        <p className="text-[10px] text-muted-foreground/60 mt-0.5">{timeAgo(item.time)}</p>
      </div>
      {item.action !== 'listed' && (
        <span className="text-xs font-bold shrink-0" style={{ color: cfg.color }}>
          {fmtNative(item.price)} ETH
        </span>
      )}
    </motion.div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function NFTWhalesPage() {
  const navigate = useNavigate();
  const [holders,  setHolders]  = useState<WhaleHolder[]>(() => buildWhaleHolders());
  const [activity, setActivity] = useState<WhaleActivity[]>(() => buildWhaleActivity(buildWhaleHolders()));
  const [newIds,   setNewIds]   = useState<Set<string>>(new Set());

  // Simulate new activity every 15s
  useEffect(() => {
    const id = setInterval(() => {
      const newHolders = buildWhaleHolders();
      const newActivity = buildWhaleActivity(newHolders);
      const freshItem = newActivity[0];
      if (freshItem) {
        setActivity(prev => [freshItem, ...prev].slice(0, 20));
        setNewIds(new Set([freshItem.id]));
        setTimeout(() => setNewIds(new Set()), 3000);
      }
    }, 15_000);
    return () => clearInterval(id);
  }, []);

  function handleRefresh() {
    const newHolders = buildWhaleHolders();
    setHolders(newHolders);
    setActivity(buildWhaleActivity(newHolders));
    toast.success('Whale data refreshed');
  }

  function handleTrack(whale: WhaleHolder) {
    navigate(`/nft/wallets`);
    toast.success(`Opening wallet tracker for ${fmtAddr(whale.address)}`);
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="text-xl">🐋</span>
          <span className="font-black text-foreground">NFT Whale Tracker</span>
          <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 px-2 py-0.5 rounded-full ml-2"
            style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)' }}>
            <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" /> LIVE
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs border border-white/10 text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">

          {/* ── A) Top Holders ── */}
          <section>
            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-3">
              Top NFT Holders
            </p>
            <div className="rounded-2xl overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead style={{ background: 'rgba(0,0,0,0.2)' }}>
                    <tr className="text-[10px] font-black text-muted-foreground uppercase tracking-wider border-b border-white/5">
                      <th className="px-4 py-3 text-left">Rank</th>
                      <th className="px-3 py-3 text-left">Wallet</th>
                      <th className="px-3 py-3 text-right">NFTs</th>
                      <th className="px-3 py-3 text-right">Est. Value</th>
                      <th className="px-3 py-3 text-left">Recent Buy</th>
                      <th className="px-3 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {holders.map(whale => (
                      <HolderRow key={whale.rank} whale={whale} onTrack={() => handleTrack(whale)} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* ── B) Activity Feed ── */}
          <section>
            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-3">
              Whale Activity Feed
            </p>
            <div className="rounded-2xl overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <AnimatePresence initial={false}>
                {activity.map(item => (
                  <ActivityItem key={item.id} item={item} isNew={newIds.has(item.id)} />
                ))}
              </AnimatePresence>
            </div>
          </section>

          {/* ── C) Actions ── */}
          <div className="flex gap-3 flex-wrap">
            <button onClick={() => navigate('/nft/wallets')}
              className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm bg-primary text-primary-foreground hover:opacity-90">
              <Eye className="h-4 w-4" /> Track Wallet
            </button>
            <button onClick={() => navigate('/nft/alerts')}
              className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm border border-amber-400/30 bg-amber-400/8 text-amber-400 hover:bg-amber-400/15 transition-all">
              <Bell className="h-4 w-4" /> Set Whale Alert
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
