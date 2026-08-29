/**
 * TrendingTokens.tsx — On-chain trending token analysis
 *
 * Shows tokens gaining traction based on on-chain metrics:
 * whale activity, smart money flows, new holder growth.
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Flame, Users, ArrowUpRight, ArrowDownRight, Zap } from 'lucide-react';
import { TRENDING_TOKENS, TrendingToken, CHAIN_DISPLAY, ALL_CHAINS, fmtUsd } from './onChainUtils';
import { MonitoredChain } from '../../lib/onChainTypes';
import { cn } from '@/lib/utils';

// ── Whale activity badge ──────────────────────────────────────────────────────

function ActivityBadge({ level }: { level: TrendingToken['whaleActivity'] }) {
  const config = {
    very_high: { label: 'Very High', color: '#FFD700', bg: 'rgba(255,215,0,0.12)', dot: '🔱' },
    high:      { label: 'High',      color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', dot: '🐋' },
    medium:    { label: 'Medium',    color: '#60a5fa', bg: 'rgba(96,165,250,0.12)', dot: '🐬' },
    low:       { label: 'Low',       color: '#6b7280', bg: 'rgba(107,114,128,0.12)', dot: '🐟' },
  }[level];

  return (
    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
      style={{ background: config.bg, color: config.color, border: `1px solid ${config.color}33` }}>
      {config.dot} {config.label}
    </span>
  );
}

// ── Token row ─────────────────────────────────────────────────────────────────

function TokenRow({ token, rank }: { token: TrendingToken; rank: number }) {
  const chain     = CHAIN_DISPLAY[token.chain];
  const isUp      = token.change24h >= 0;
  const flowPos   = token.netFlow >= 0;
  const isHot     = token.whaleActivity === 'very_high' || token.change24h > 5;

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: rank * 0.04 }}
      className="grid items-center px-4 py-3.5 hover:bg-white/2 transition-colors border-b border-white/4 last:border-0"
      style={{ gridTemplateColumns: '2rem 2.5rem 1fr 5rem 6rem 5.5rem 5rem 4rem', gap: '0.5rem' }}
    >
      {/* Rank */}
      <span className="text-xs font-bold text-muted-foreground text-center">#{rank}</span>

      {/* Icon */}
      <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base font-bold"
        style={{ background: `${chain.color}18`, border: `1px solid ${chain.color}30` }}>
        {token.icon}
      </div>

      {/* Name + chain */}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-sm">{token.symbol}</span>
          {isHot && <Flame className="h-3.5 w-3.5 text-orange-400" />}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-semibold" style={{ color: chain.color }}>{chain.icon}</span>
          <span className="text-[11px] text-muted-foreground">{token.name}</span>
        </div>
      </div>

      {/* Price */}
      <div className="text-right">
        <p className="font-mono font-bold text-sm">
          {token.price >= 1 ? `$${token.price.toLocaleString()}` : `$${token.price.toFixed(6)}`}
        </p>
      </div>

      {/* 24h change */}
      <div className={cn('flex items-center justify-end gap-1 font-bold text-sm', isUp ? 'text-emerald-400' : 'text-red-400')}>
        {isUp ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
        {Math.abs(token.change24h).toFixed(1)}%
      </div>

      {/* Net flow */}
      <div className={cn('font-mono font-bold text-xs text-right', flowPos ? 'text-emerald-400' : 'text-red-400')}>
        {flowPos ? '+' : ''}{fmtUsd(token.netFlow)}
      </div>

      {/* Volume */}
      <div className="text-right">
        <p className="text-xs font-bold text-foreground">{fmtUsd(token.volume24h)}</p>
      </div>

      {/* Whale activity */}
      <div className="flex justify-end">
        <ActivityBadge level={token.whaleActivity} />
      </div>
    </motion.div>
  );
}

// ── Mobile token card (for small screens) ────────────────────────────────────

function TokenCard({ token, rank }: { token: TrendingToken; rank: number }) {
  const chain  = CHAIN_DISPLAY[token.chain];
  const isUp   = token.change24h >= 0;
  const flowPos = token.netFlow >= 0;
  const isHot  = token.whaleActivity === 'very_high' || token.change24h > 5;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: rank * 0.04 }}
      className="rounded-2xl p-4"
      style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-muted-foreground">#{rank}</span>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base"
            style={{ background: `${chain.color}18`, border: `1px solid ${chain.color}30` }}>
            {token.icon}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm">{token.symbol}</span>
              {isHot && <Flame className="h-3.5 w-3.5 text-orange-400" />}
            </div>
            <span className="text-[11px]" style={{ color: chain.color }}>{chain.icon} {token.name}</span>
          </div>
        </div>
        <ActivityBadge level={token.whaleActivity} />
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase">Price</p>
          <p className="font-mono font-bold text-xs">
            {token.price >= 1 ? `$${token.price.toLocaleString()}` : `$${token.price.toFixed(6)}`}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase">24h</p>
          <p className={cn('font-bold text-xs', isUp ? 'text-emerald-400' : 'text-red-400')}>
            {isUp ? '+' : ''}{token.change24h.toFixed(1)}%
          </p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase">Net Flow</p>
          <p className={cn('font-bold text-xs', flowPos ? 'text-emerald-400' : 'text-red-400')}>
            {flowPos ? '+' : ''}{fmtUsd(token.netFlow)}
          </p>
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          +{token.newHolders24h.toLocaleString()} new holders
        </div>
        <div className="flex items-center gap-1">
          <Zap className="h-3 w-3" />
          {fmtUsd(token.volume24h)} vol
        </div>
      </div>
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function TrendingTokens() {
  const [chainFilter, setChainFilter] = useState<MonitoredChain | 'all'>('all');
  const [sortBy, setSortBy] = useState<'whale' | 'change' | 'flow' | 'volume'>('whale');

  const sorted = TRENDING_TOKENS
    .filter(t => chainFilter === 'all' || t.chain === chainFilter)
    .sort((a, b) => {
      const actOrder = { very_high: 4, high: 3, medium: 2, low: 1 };
      if (sortBy === 'whale')  return actOrder[b.whaleActivity] - actOrder[a.whaleActivity];
      if (sortBy === 'change') return Math.abs(b.change24h) - Math.abs(a.change24h);
      if (sortBy === 'flow')   return b.netFlow - a.netFlow;
      return b.volume24h - a.volume24h;
    });

  // Highlights
  const hottest = TRENDING_TOKENS.reduce((a, b) => Math.abs(a.change24h) > Math.abs(b.change24h) ? a : b);
  const mostFlow = TRENDING_TOKENS.reduce((a, b) => b.netFlow > a.netFlow ? b : a);
  const mostActive = TRENDING_TOKENS.find(t => t.whaleActivity === 'very_high') ?? TRENDING_TOKENS[0];

  return (
    <div className="flex flex-col gap-5">

      {/* ── Spotlight row ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: '🔥 Hottest Move', token: hottest, stat: `${hottest.change24h > 0 ? '+' : ''}${hottest.change24h.toFixed(1)}%`, color: '#f97316' },
          { label: '💸 Smart Money Inflow', token: mostFlow, stat: `+${fmtUsd(mostFlow.netFlow)}`, color: '#34d399' },
          { label: '🔱 Most Whale Activity', token: mostActive, stat: 'Very High', color: '#FFD700' },
        ].map((s, i) => (
          <div key={i} className="rounded-2xl p-4"
            style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${s.color}22` }}>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">{s.label}</p>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{s.token.icon}</span>
              <div>
                <p className="font-black text-sm">{s.token.symbol}</p>
                <p className="font-bold text-base" style={{ color: s.color }}>{s.stat}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filter + Sort bar ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {(['all', ...ALL_CHAINS] as const).map(c => (
            <button key={c} onClick={() => setChainFilter(c as any)}
              className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all',
                chainFilter === c
                  ? 'bg-white/10 border-white/20 text-foreground'
                  : 'border-white/10 text-muted-foreground hover:border-white/20')}
              style={chainFilter === c && c !== 'all' ? {
                background: `${CHAIN_DISPLAY[c as MonitoredChain].color}20`,
                color: CHAIN_DISPLAY[c as MonitoredChain].color,
                borderColor: `${CHAIN_DISPLAY[c as MonitoredChain].color}40`,
              } : {}}>
              {c === 'all' ? 'All' : `${CHAIN_DISPLAY[c as MonitoredChain].icon} ${CHAIN_DISPLAY[c as MonitoredChain].abbr}`}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Sort:</span>
          {([
            { key: 'whale', label: '🐋 Whale Activity' },
            { key: 'change', label: '📈 Price Change' },
            { key: 'flow', label: '💸 Net Flow' },
            { key: 'volume', label: '📊 Volume' },
          ] as const).map(s => (
            <button key={s.key} onClick={() => setSortBy(s.key)}
              className={cn('px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all',
                sortBy === s.key ? 'bg-white/10 border-white/20 text-foreground' : 'border-white/10 text-muted-foreground hover:border-white/20')}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Desktop table (hidden on mobile) ─────────────────────────── */}
      <div className="hidden md:block rounded-2xl overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
        {/* Table header */}
        <div className="grid px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
          style={{ gridTemplateColumns: '2rem 2.5rem 1fr 5rem 6rem 5.5rem 5rem 4rem', gap: '0.5rem',
            background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <span>#</span><span></span>
          <span>Token</span><span className="text-right">Price</span>
          <span className="text-right">24h Change</span>
          <span className="text-right">Net Flow</span>
          <span className="text-right">Volume</span>
          <span className="text-right">Whales</span>
        </div>
        {sorted.map((t, i) => <TokenRow key={t.symbol} token={t} rank={i + 1} />)}
      </div>

      {/* ── Mobile cards ─────────────────────────────────────────────── */}
      <div className="grid md:hidden grid-cols-1 sm:grid-cols-2 gap-3">
        {sorted.map((t, i) => <TokenCard key={t.symbol} token={t} rank={i + 1} />)}
      </div>

      {sorted.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">No tokens for this chain.</div>
      )}
    </div>
  );
}
