/**
 * ExchangeFlowPage.tsx — Spec §3.4
 * Route: /on-chain/exchange-flow
 *
 * Net flow chart, exchange comparison table, smart money flow signal.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Download, TrendingUp, TrendingDown, Minus,
  ArrowDown, ArrowUp, RefreshCw,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import { toast } from 'sonner';
import {
  ExchangeFlow, generateExchangeFlows, ALL_CHAINS, CHAIN_DISPLAY,
  SMART_MONEY_WALLETS, fmtUsd,
} from './onChainUtils';
import { MonitoredChain } from '../../lib/onChainTypes';
import { cn } from '@/lib/utils';

// ── Generate time-series net flow chart data ──────────────────────────────────

function generateNetFlowTimeSeries(period: '24h' | '7d' | '30d') {
  const points = period === '24h' ? 24 : period === '7d' ? 7 : 30;
  const label  = period === '24h' ? (i: number) => `${i}:00` : (i: number) => {
    const d = new Date(Date.now() - (points - 1 - i) * (period === '7d' ? 86400_000 : 86400_000));
    return d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
  };
  return Array.from({ length: points }, (_, i) => ({
    time: label(i),
    net:  Math.round((Math.sin(i * 0.8) * 15000 + Math.cos(i * 0.5) * 8000 + (Math.random() - 0.5) * 5000)),
  }));
}

// ── Signal badge ──────────────────────────────────────────────────────────────

function SignalBadge({ signal }: { signal: 'bullish' | 'bearish' | 'neutral' }) {
  const config = {
    bullish: { label: '🟢 Bullish', color: '#34d399', bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.25)' },
    bearish: { label: '🔴 Bearish', color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.25)' },
    neutral: { label: '⚪ Neutral', color: '#6b7280', bg: 'rgba(107,114,128,0.1)', border: 'rgba(107,114,128,0.2)' },
  }[signal];
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-bold"
      style={{ background: config.bg, color: config.color, border: `1px solid ${config.border}` }}>
      {config.label}
    </span>
  );
}

// ── Chart tooltip ─────────────────────────────────────────────────────────────

function NetTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const v = payload[0]?.value as number;
  const positive = v >= 0;
  return (
    <div className="rounded-xl px-3 py-2 text-xs shadow-xl"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
      <p className="text-muted-foreground mb-0.5">{label}</p>
      <p style={{ color: positive ? '#34d399' : '#ef4444' }}>
        {positive ? '+' : ''}{v.toLocaleString()} BTC net flow
      </p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ExchangeFlowPage() {
  const navigate = useNavigate();
  const [period, setPeriod]       = useState<'24h' | '7d' | '30d'>('24h');
  const [symbol, setSymbol]       = useState<'BTC' | 'ETH' | 'ALL'>('BTC');
  const [flows, setFlows]         = useState<ExchangeFlow[]>([]);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  function refresh() { setFlows(generateExchangeFlows()); setLastUpdate(new Date()); }
  useEffect(() => { refresh(); const t = setInterval(refresh, 60_000); return () => clearInterval(t); }, []);

  const timeSeries = useMemo(() => generateNetFlowTimeSeries(period), [period]);

  // Smart money signal
  const totalWallets  = SMART_MONEY_WALLETS.length;
  const buying        = Math.round(totalWallets * 0.6);
  const selling       = Math.round(totalWallets * 0.3);
  const holding       = totalWallets - buying - selling;
  const overallSignal = buying > selling ? 'bullish' : selling > buying ? 'bearish' : 'neutral';

  const totalIn  = flows.reduce((s, f) => s + f.inflow24h, 0);
  const totalOut = flows.reduce((s, f) => s + f.outflow24h, 0);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 sm:px-6 py-4 border-b border-white/5 shrink-0">
        <button onClick={() => navigate('/on-chain')}
          className="p-2 rounded-xl hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="font-bold text-lg">💱 Exchange Flow Analysis</h1>
        <button onClick={() => toast.success('Exported as CSV')}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-white/10 text-muted-foreground hover:text-foreground transition-colors">
          <Download className="h-3.5 w-3.5" /> Export
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">

          {/* Controls */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">Timeframe:</div>
            {(['24h', '7d', '30d'] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all',
                  period === p ? 'bg-white/10 border-white/20 text-foreground' : 'border-white/10 text-muted-foreground hover:border-white/20')}>
                {p}
              </button>
            ))}
            <div className="w-px h-5 bg-white/10 mx-1" />
            <div className="flex items-center gap-1 text-xs text-muted-foreground">Symbol:</div>
            {(['BTC', 'ETH', 'ALL'] as const).map(s => (
              <button key={s} onClick={() => setSymbol(s)}
                className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all',
                  symbol === s ? 'bg-white/10 border-white/20 text-foreground' : 'border-white/10 text-muted-foreground hover:border-white/20')}>
                {s}
              </button>
            ))}
            <button onClick={refresh}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-white/10 text-muted-foreground hover:text-foreground transition-colors">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
          </div>

          {/* Net Flow Chart */}
          <div className="rounded-2xl p-5"
            style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">
              Net Exchange Flow ({period}) — {symbol}
            </p>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={timeSeries} margin={{ top: 10, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="posGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#34d399" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="negGrad" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#6B7280' }} axisLine={false} tickLine={false}
                  interval={Math.floor(timeSeries.length / 6)} />
                <YAxis hide />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" strokeDasharray="3 3" />
                <Tooltip content={<NetTooltip />} />
                <Area type="monotone" dataKey="net" stroke="#34d399" strokeWidth={1.5}
                  fill="url(#posGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Exchange comparison table */}
          <div className="rounded-2xl overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between"
              style={{ background: 'rgba(255,255,255,0.03)' }}>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Exchange Comparison</p>
              <span className="text-[10px] text-muted-foreground">Updated {lastUpdate.toLocaleTimeString()}</span>
            </div>

            {/* Table header */}
            <div className="grid px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-white/5"
              style={{ gridTemplateColumns: '2rem 1fr 5.5rem 5.5rem 5rem 5rem', gap: '0.5rem' }}>
              <span></span>
              <span>Exchange</span>
              <span className="text-right">Inflow 24h</span>
              <span className="text-right">Outflow 24h</span>
              <span className="text-right">Net</span>
              <span className="text-right">Signal</span>
            </div>

            {flows.map((f, i) => {
              const signal: 'bullish' | 'bearish' | 'neutral' = f.trend === 'accumulating' ? 'bullish' : f.trend === 'distributing' ? 'bearish' : 'neutral';
              const netPos = f.net24h >= 0;
              return (
                <motion.div key={`${f.exchange}-${f.chain}`}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}
                  className="grid items-center px-4 py-3.5 hover:bg-white/2 transition-colors border-b border-white/4 last:border-0"
                  style={{ gridTemplateColumns: '2rem 1fr 5.5rem 5.5rem 5rem 5rem', gap: '0.5rem' }}>
                  <span className="text-xl text-center">{f.logo}</span>
                  <div>
                    <p className="font-bold text-sm">{f.exchange}</p>
                    <p className="text-[11px] font-semibold" style={{ color: CHAIN_DISPLAY[f.chain].color }}>
                      {CHAIN_DISPLAY[f.chain].icon} {CHAIN_DISPLAY[f.chain].name}
                    </p>
                  </div>
                  <span className="text-right font-mono text-xs font-bold text-emerald-400">
                    {fmtUsd(f.inflow24h)}
                  </span>
                  <span className="text-right font-mono text-xs font-bold text-red-400">
                    {fmtUsd(f.outflow24h)}
                  </span>
                  <span className={cn('text-right font-mono font-bold text-sm', netPos ? 'text-emerald-400' : 'text-red-400')}>
                    {netPos ? '+' : ''}{fmtUsd(f.net24h)}
                  </span>
                  <div className="flex justify-end">
                    <SignalBadge signal={signal} />
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Smart Money Flow signal */}
          <div className="rounded-2xl p-5"
            style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">
              Smart Money Flow
            </p>
            <p className="text-sm text-muted-foreground mb-3">
              Top {totalWallets} Smart Wallets are currently:
            </p>
            <div className="space-y-2 mb-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl font-black text-emerald-400">{buying}</span>
                <div>
                  <span className="text-sm font-semibold text-emerald-400">are BUYING</span>
                  <span className="text-sm text-muted-foreground"> (moving funds TO exchanges)</span>
                  <span className="ml-2 text-xs font-bold text-emerald-400">🟢 Bullish signal</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-black text-red-400">{selling}</span>
                <div>
                  <span className="text-sm font-semibold text-red-400">are SELLING</span>
                  <span className="text-sm text-muted-foreground"> (moving funds FROM exchanges)</span>
                  <span className="ml-2 text-xs font-bold text-red-400">🔴 Bearish signal</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-black text-muted-foreground">{holding}</span>
                <div>
                  <span className="text-sm font-semibold text-muted-foreground">are HOLDING</span>
                  <span className="text-sm text-muted-foreground"> (no movement)</span>
                  <span className="ml-2 text-xs font-bold text-muted-foreground">⚪ Neutral</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-3 border-t border-white/5">
              <span className="text-sm text-muted-foreground font-semibold">Overall Signal:</span>
              <SignalBadge signal={overallSignal} />
              <span className="text-sm font-black" style={{ color: overallSignal === 'bullish' ? '#34d399' : overallSignal === 'bearish' ? '#ef4444' : '#6b7280' }}>
                {overallSignal.toUpperCase()}
              </span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
