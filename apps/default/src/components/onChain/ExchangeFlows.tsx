/**
 * ExchangeFlows.tsx — Exchange inflow / outflow analysis
 *
 * Simulates real-time exchange flow data for 5 supported chains.
 * Net inflow = accumulating pressure (bullish for price).
 * Net outflow = distribution pressure (bearish for price).
 */
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, ArrowDown, ArrowUp, RefreshCw } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  AreaChart, Area,
} from 'recharts';
import {
  ExchangeFlow, generateExchangeFlows, CHAIN_DISPLAY, ALL_CHAINS,
  fmtUsd,
} from './onChainUtils';
import { MonitoredChain } from '../../lib/onChainTypes';
import { cn } from '@/lib/utils';

// ── Trend badge ───────────────────────────────────────────────────────────────

function TrendBadge({ trend }: { trend: ExchangeFlow['trend'] }) {
  const config = {
    accumulating: { label: 'Accumulating', color: '#34d399', bg: 'rgba(52,211,153,0.1)', icon: <ArrowDown className="h-3 w-3" /> },
    distributing: { label: 'Distributing', color: '#ef4444', bg: 'rgba(239,68,68,0.1)',  icon: <ArrowUp   className="h-3 w-3" /> },
    neutral:      { label: 'Neutral',       color: '#6b7280', bg: 'rgba(107,114,128,0.1)', icon: <Minus    className="h-3 w-3" /> },
  }[trend];

  return (
    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
      style={{ background: config.bg, color: config.color, border: `1px solid ${config.color}33` }}>
      {config.icon}
      {config.label}
    </div>
  );
}

// ── Flow bar ─────────────────────────────────────────────────────────────────

function FlowBar({ inflow, outflow, max }: { inflow: number; outflow: number; max: number }) {
  const inPct  = (inflow  / max) * 100;
  const outPct = (outflow / max) * 100;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-emerald-400 w-8 text-right shrink-0">IN</span>
        <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${inPct}%` }} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-red-400 w-8 text-right shrink-0">OUT</span>
        <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
          <div className="h-full rounded-full bg-red-500" style={{ width: `${outPct}%` }} />
        </div>
      </div>
    </div>
  );
}

// ── Exchange card ─────────────────────────────────────────────────────────────

function ExchangeCard({ flow, maxFlow, index }: { flow: ExchangeFlow; maxFlow: number; index: number }) {
  const chain   = CHAIN_DISPLAY[flow.chain];
  const netPositive = flow.net24h >= 0;
  const netPct  = Math.abs(flow.net24h) / flow.inflow24h * 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="rounded-2xl p-4"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{flow.logo}</span>
          <div>
            <p className="font-bold text-sm">{flow.exchange}</p>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold" style={{ color: chain.color }}>{chain.icon} {chain.abbr}</span>
            </div>
          </div>
        </div>
        <TrendBadge trend={flow.trend} />
      </div>

      {/* Inflow / Outflow bars */}
      <FlowBar inflow={flow.inflow24h} outflow={flow.outflow24h} max={maxFlow} />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mt-3">
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground uppercase">Inflow 24h</p>
          <p className="text-xs font-bold text-emerald-400">{fmtUsd(flow.inflow24h)}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground uppercase">Outflow 24h</p>
          <p className="text-xs font-bold text-red-400">{fmtUsd(flow.outflow24h)}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground uppercase">Net Flow</p>
          <p className={cn('text-xs font-bold', netPositive ? 'text-emerald-400' : 'text-red-400')}>
            {netPositive ? '+' : ''}{fmtUsd(flow.net24h)}
          </p>
        </div>
      </div>

      {/* Net flow progress */}
      <div className="mt-3">
        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
          <div className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(100, netPct)}%`,
              background: netPositive
                ? 'linear-gradient(90deg, #34d399, #059669)'
                : 'linear-gradient(90deg, #f87171, #dc2626)',
            }} />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-muted-foreground">Reserve: {fmtUsd(flow.reserve)}</span>
          <span className={cn('text-[10px] font-bold', netPositive ? 'text-emerald-400' : 'text-red-400')}>
            {netPositive ? '▼' : '▲'} {netPct.toFixed(1)}% net
          </span>
        </div>
      </div>
    </motion.div>
  );
}

// ── Chart tooltip ─────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl px-3 py-2 text-xs shadow-xl"
      style={{ background: '#060F1A', border: '1px solid rgba(255,255,255,0.1)' }}>
      <p className="font-bold mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.fill }}>
          {p.name}: {fmtUsd(p.value)}
        </p>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ExchangeFlows() {
  const [flows, setFlows] = useState<ExchangeFlow[]>([]);
  const [chainFilter, setChainFilter] = useState<MonitoredChain | 'all'>('all');
  const [lastUpdate, setLastUpdate] = useState(new Date());

  function refresh() {
    setFlows(generateExchangeFlows());
    setLastUpdate(new Date());
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 60_000);
    return () => clearInterval(t);
  }, []);

  const filtered = flows.filter(f => chainFilter === 'all' || f.chain === chainFilter);
  const maxFlow  = Math.max(...filtered.map(f => f.inflow24h), 1);

  // Aggregate bar chart data
  const chainData = ALL_CHAINS.map(c => {
    const chainFlows = flows.filter(f => f.chain === c);
    return {
      name:     CHAIN_DISPLAY[c].abbr,
      inflow:   chainFlows.reduce((s, f) => s + f.inflow24h, 0),
      outflow:  chainFlows.reduce((s, f) => s + f.outflow24h, 0),
      color:    CHAIN_DISPLAY[c].color,
    };
  }).filter(d => d.inflow > 0 || d.outflow > 0);

  // Market signals
  const totalIn  = flows.reduce((s, f) => s + f.inflow24h, 0);
  const totalOut = flows.reduce((s, f) => s + f.outflow24h, 0);
  const netSignal = totalIn > totalOut ? 'Accumulation' : 'Distribution';
  const netColor  = totalIn > totalOut ? '#34d399' : '#ef4444';

  return (
    <div className="flex flex-col gap-5">

      {/* ── Market signal banner ─────────────────────────────────────── */}
      <div className="rounded-2xl p-5 relative overflow-hidden"
        style={{ background: '#060F1A', border: `1px solid ${netColor}33` }}>
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: `radial-gradient(ellipse at top right, ${netColor}08 0%, transparent 60%)` }} />
        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Market Signal</p>
            <div className="flex items-center gap-2">
              {totalIn > totalOut
                ? <TrendingDown className="h-6 w-6 text-emerald-400" />
                : <TrendingUp   className="h-6 w-6 text-red-400" />}
              <h2 className="text-2xl font-black" style={{ color: netColor }}>{netSignal}</h2>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Net {totalIn > totalOut ? 'inflow' : 'outflow'}: {fmtUsd(Math.abs(totalIn - totalOut))} across all exchanges
            </p>
          </div>
          <div className="flex gap-4 shrink-0">
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase">Total Inflow 24h</p>
              <p className="text-lg font-black text-emerald-400">{fmtUsd(totalIn)}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase">Total Outflow 24h</p>
              <p className="text-lg font-black text-red-400">{fmtUsd(totalOut)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Chain comparison chart ────────────────────────────────────── */}
      <div className="rounded-2xl p-5"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">
          Inflow vs Outflow by Chain (24h)
        </p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={chainData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }} barGap={2}>
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="inflow" name="Inflow" radius={[4,4,0,0]} maxBarSize={28}>
              {chainData.map((d, i) => <Cell key={i} fill={d.color} fillOpacity={0.8} />)}
            </Bar>
            <Bar dataKey="outflow" name="Outflow" radius={[4,4,0,0]} maxBarSize={28} fill="#ef4444" fillOpacity={0.6} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Chain filter ─────────────────────────────────────────────── */}
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
        <button onClick={refresh} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-white/10 text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* ── Exchange cards grid ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((f, i) => (
          <ExchangeCard key={`${f.exchange}-${f.chain}`} flow={f} maxFlow={maxFlow} index={i} />
        ))}
      </div>

      <p className="text-center text-[10px] text-muted-foreground">
        Last updated: {lastUpdate.toLocaleTimeString()} · Refreshes every 60s
      </p>
    </div>
  );
}
