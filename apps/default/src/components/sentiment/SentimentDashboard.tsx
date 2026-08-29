/**
 * SentimentDashboard.tsx
 * Main dashboard tab: F&G gauge, market overview KPIs, live ticker,
 * per-symbol source breakdown, news feed simulation, trending signals.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp, TrendingDown, Minus, RefreshCw, Activity,
  Zap, AlertTriangle, CheckCircle, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer } from 'recharts';
import { useSentimentStore } from '../../lib/sentimentStore';
import {
  FEAR_GREED_META, TRACKED_SYMBOLS, MARKET_SYMBOL,
  type FearGreedZone, type AggregateSentiment,
} from '../../lib/sentimentTypes';
import { FearGreedGauge } from './FearGreedGauge';
import {
  fmtSentiment, sentimentColor, fmtVolume, fmtDelta,
  trendIcon, trendColor, timeAgoSentiment,
} from './sentimentUtils';
import { cn } from '@/lib/utils';

// ── Simulated news feed ───────────────────────────────────────────────────────

const NEWS_POOL = [
  { headline: 'Bitcoin options data suggests bullish momentum building', sentiment: 0.6,  source: 'CryptoSlate', time: '2m' },
  { headline: 'Fed signals potential rate cuts — crypto markets rally', sentiment: 0.75, source: 'Bloomberg', time: '8m' },
  { headline: 'Ethereum ETF inflows hit record $420M in single day', sentiment: 0.8,  source: 'CoinDesk', time: '15m' },
  { headline: 'Whale wallets accumulating SOL at 60-day lows', sentiment: 0.5,  source: 'Santiment', time: '22m' },
  { headline: 'Altcoin market cap breaks $1T as sentiment turns bullish', sentiment: 0.7, source: 'CoinGecko', time: '35m' },
  { headline: 'SEC approves spot crypto ETF in landmark decision', sentiment: 0.9,  source: 'Reuters', time: '42m' },
  { headline: 'Crypto market correction deepens as fear index hits 18', sentiment: -0.7, source: 'Bloomberg', time: '51m' },
  { headline: 'Major exchange outage raises custody concerns', sentiment: -0.65, source: 'Decrypt', time: '1h' },
  { headline: 'Stablecoin depegging fears return amid liquidity crisis', sentiment: -0.8, source: 'The Block', time: '1h 10m' },
  { headline: 'Regulatory pressure mounts — traders de-risk portfolios', sentiment: -0.55, source: 'CoinDesk', time: '1h 30m' },
  { headline: 'Google Trends: "buy bitcoin" searches at 6-month high', sentiment: 0.55, source: 'Google', time: '2h' },
  { headline: 'DeFi TVL surges $8B in 48 hours — on-chain data bullish', sentiment: 0.65, source: 'DeFiLlama', time: '2h 30m' },
];

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KPICard({ label, value, sub, delta, color, icon: Icon }: {
  label: string; value: string; sub?: string;
  delta?: number | null; color: string; icon: React.ElementType;
}) {
  const deltaPos = delta !== null && delta !== undefined && delta >= 0;
  return (
    <div className="rounded-2xl p-4 transition-all"
      style={{ background: `${color}08`, border: `1px solid ${color}18` }}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-3.5 w-3.5" style={{ color }} />
        <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">{label}</p>
      </div>
      <p className="font-black text-2xl" style={{ color }}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      {delta !== null && delta !== undefined && (
        <div className={cn('flex items-center gap-1 mt-1.5 text-[11px] font-bold', deltaPos ? 'text-emerald-400' : 'text-red-400')}>
          {deltaPos ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {deltaPos ? '+' : ''}{delta.toFixed(1)} vs prev
        </div>
      )}
    </div>
  );
}

// ── Market overview mini-ticker ────────────────────────────────────────────────

function LiveTicker({ aggregates }: { aggregates: AggregateSentiment[] }) {
  const top8 = aggregates.slice(0, 8);
  return (
    <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide py-1">
      {top8.map(agg => {
        const s    = agg.latest.overallSentiment;
        const col  = sentimentColor(s);
        return (
          <div key={agg.symbol}
            className="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-xl"
            style={{ background: `${col}08`, border: `1px solid ${col}18` }}>
            <span className="text-[10px] font-black text-foreground">{agg.symbol}</span>
            <span className="text-[10px] font-bold" style={{ color: col }}>
              {s >= 0 ? '+' : ''}{s.toFixed(2)}
            </span>
            <span className="text-[9px]" style={{ color: trendColor(agg.trend) }}>{trendIcon(agg.trend)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Source breakdown (bar chart per source) ────────────────────────────────────

function SourceBreakdown({ agg }: { agg: AggregateSentiment }) {
  const s = agg.latest;
  const sources = [
    { label: '𝕏 Twitter',    value: s.twitterSentiment, weight: 0.45, color: '#1d9bf0', vol: s.twitterVolume },
    { label: '🤖 Reddit',    value: s.redditSentiment,  weight: 0.30, color: '#ff4500', vol: s.redditVolume  },
    { label: '📰 News',      value: s.newsSentiment,    weight: 0.25, color: '#6366f1', vol: s.newsVolume    },
  ];

  return (
    <div className="space-y-3">
      {sources.map(src => {
        const pct = ((src.value + 1) / 2) * 100;  // -1..1 → 0..100
        return (
          <div key={src.label}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-foreground">{src.label}</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">{fmtVolume(src.vol)} mentions</span>
                <span className="text-[11px] font-bold" style={{ color: sentimentColor(src.value) }}>
                  {src.value >= 0 ? '+' : ''}{src.value.toFixed(2)}
                </span>
              </div>
            </div>
            <div className="h-2.5 rounded-full bg-secondary/30 overflow-hidden relative">
              <div className="absolute inset-y-0 left-1/2 w-px bg-white/15" />
              <div className="absolute h-full rounded-full transition-all duration-700"
                style={{
                  left:  src.value >= 0 ? '50%' : `${pct}%`,
                  width: `${Math.abs(src.value) * 50}%`,
                  background: sentimentColor(src.value),
                  opacity: 0.9,
                }} />
            </div>
            <div className="flex justify-between mt-0.5">
              <span className="text-[8px] text-muted-foreground/40">Bearish</span>
              <span className="text-[8px] text-muted-foreground/40">Weight: {(src.weight * 100).toFixed(0)}%</span>
              <span className="text-[8px] text-muted-foreground/40">Bullish</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Extreme signals ────────────────────────────────────────────────────────────

function ExtremeSignals({ aggregates }: { aggregates: AggregateSentiment[] }) {
  const signals = useMemo(() => {
    const res: { symbol: string; type: 'bullish' | 'bearish'; value: number; message: string }[] = [];
    for (const agg of aggregates) {
      const s = agg.latest;
      if (s.overallSentiment >= 0.7) res.push({ symbol: agg.symbol, type: 'bullish', value: s.overallSentiment, message: 'Extreme bullish sentiment' });
      else if (s.overallSentiment <= -0.7) res.push({ symbol: agg.symbol, type: 'bearish', value: s.overallSentiment, message: 'Extreme bearish sentiment — potential bottom' });
      if (s.fearGreedIndex >= 85) res.push({ symbol: agg.symbol, type: 'bearish', value: s.fearGreedIndex, message: 'Extreme greed — market may be overextended' });
      if (s.fearGreedIndex <= 15) res.push({ symbol: agg.symbol, type: 'bullish', value: s.fearGreedIndex, message: 'Extreme fear — contrarian buy signal' });
    }
    return res.slice(0, 6);
  }, [aggregates]);

  const hasSignals = signals.length > 0;

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/5">
        <Zap className="h-4 w-4 text-amber-400" />
        <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Extreme Signals</p>
        {hasSignals && (
          <span className="ml-auto text-[10px] font-bold text-amber-400">{signals.length} detected</span>
        )}
      </div>
      <div className="p-5">
        {!hasSignals ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            No extreme signals detected — market sentiment is balanced
          </p>
        ) : (
          <div className="space-y-2">
            {signals.map((sig, i) => (
              <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl"
                style={{
                  background: sig.type === 'bullish' ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
                  border: sig.type === 'bullish' ? '1px solid rgba(34,197,94,0.15)' : '1px solid rgba(239,68,68,0.15)',
                }}>
                {sig.type === 'bullish'
                  ? <TrendingUp className="h-4 w-4 text-emerald-400 shrink-0" />
                  : <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-foreground">{sig.symbol}</p>
                  <p className="text-[10px] text-muted-foreground">{sig.message}</p>
                </div>
                <span className={cn('text-xs font-black shrink-0', sig.type === 'bullish' ? 'text-emerald-400' : 'text-red-400')}>
                  {sig.value.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── News Feed ─────────────────────────────────────────────────────────────────

function NewsFeed({ marketSentiment }: { marketSentiment: number }) {
  const news = useMemo(() => {
    const sorted = [...NEWS_POOL].sort((a, b) =>
      marketSentiment >= 0
        ? b.sentiment - a.sentiment
        : a.sentiment - b.sentiment,
    );
    return sorted.slice(0, 6);
  }, []);

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="px-5 py-3.5 border-b border-white/5">
        <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">📰 Sentiment News Feed</p>
        <p className="text-[10px] text-muted-foreground/50 mt-0.5">Simulated · ranked by relevance</p>
      </div>
      <div className="divide-y divide-white/4">
        {news.map((item, i) => {
          const col = sentimentColor(item.sentiment);
          return (
            <div key={i} className="flex items-start gap-3 px-5 py-3.5 hover:bg-white/2 transition-colors">
              <div className="w-1 self-stretch rounded-full shrink-0" style={{ background: col }} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground leading-snug">{item.headline}</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-[9px] text-muted-foreground">{item.source}</span>
                  <span className="text-[9px] text-muted-foreground/50">{item.time} ago</span>
                  <span className="text-[9px] font-bold" style={{ color: col }}>
                    {item.sentiment >= 0 ? '📈' : '📉'} {fmtSentiment(item.sentiment)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main SentimentDashboard ───────────────────────────────────────────────────

interface SentimentDashboardProps {
  selectedSymbol: string;
  onSelectSymbol: (s: string) => void;
}

export function SentimentDashboard({ selectedSymbol, onSelectSymbol }: SentimentDashboardProps) {
  const { getMarketFearGreed, getAggregate, getAllAggregates, getLatestSnapshots } = useSentimentStore();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  const market    = getMarketFearGreed();
  const agg       = getAggregate(selectedSymbol);
  const allAggs   = getAllAggregates();
  const coinSnaps = getLatestSnapshots(selectedSymbol, 2);

  const currentFG  = market?.index ?? 50;
  const marketZone = market?.zone ?? 'neutral';
  const marketMeta = FEAR_GREED_META[marketZone];

  const prevSnap   = coinSnaps[1] ?? null;
  const curSnap    = agg?.latest;

  const fgDelta    = agg?.fearGreedDelta ?? null;
  const overDelta  = agg?.overallDelta   ?? null;

  // Symbol quick-select
  const TOP_SYMBOLS = TRACKED_SYMBOLS.slice(0, 8);

  return (
    <div className="space-y-5">
      {/* Live ticker */}
      <div className="rounded-2xl px-4 py-3"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <p className="text-[10px] font-bold text-emerald-400">LIVE</p>
          <p className="text-[10px] text-muted-foreground/50">Sentiment Ticker</p>
        </div>
        <LiveTicker aggregates={allAggs} />
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* ── LEFT: F&G Gauge + market overview ── */}
        <div className="lg:col-span-1 space-y-5">
          {/* F&G Gauge */}
          <div className="rounded-2xl p-5"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-4 text-center">
              Market Fear & Greed Index
            </p>
            <div className="flex justify-center">
              <FearGreedGauge value={currentFG} zone={marketZone} size={220} animate />
            </div>
            <p className="text-center text-[11px] text-muted-foreground mt-3 leading-relaxed">
              {marketMeta.description}
            </p>

            {/* Zone scale */}
            <div className="flex justify-between mt-4 px-2">
              {(['extreme_fear', 'fear', 'neutral', 'greed', 'extreme_greed'] as const).map(z => (
                <div key={z} className={cn('flex flex-col items-center gap-1', marketZone === z ? 'opacity-100' : 'opacity-40')}>
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: FEAR_GREED_META[z].color }} />
                  <span className="text-[8px] text-muted-foreground">{FEAR_GREED_META[z].shortLabel}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Symbol picker */}
          <div className="rounded-2xl p-4"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-3">Select Asset</p>
            <div className="flex flex-wrap gap-1.5">
              {TOP_SYMBOLS.map(sym => {
                const a = allAggs.find(x => x.symbol === sym);
                const col = a ? sentimentColor(a.latest.overallSentiment) : '#64748b';
                return (
                  <button key={sym} onClick={() => onSelectSymbol(sym)}
                    className={cn(
                      'px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all',
                      selectedSymbol === sym
                        ? 'border-2 text-foreground'
                        : 'border text-muted-foreground hover:text-foreground',
                    )}
                    style={{
                      borderColor: selectedSymbol === sym ? col : 'rgba(255,255,255,0.1)',
                      background:  selectedSymbol === sym ? `${col}12` : 'transparent',
                    }}>
                    {sym}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── RIGHT: KPIs + source breakdown ── */}
        <div className="lg:col-span-2 space-y-5">
          {/* KPI grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KPICard
              label="Overall"
              value={curSnap ? `${curSnap.overallSentiment >= 0 ? '+' : ''}${curSnap.overallSentiment.toFixed(2)}` : '—'}
              sub={curSnap ? fmtSentiment(curSnap.overallSentiment) : '—'}
              delta={overDelta}
              color={curSnap ? sentimentColor(curSnap.overallSentiment) : '#64748b'}
              icon={curSnap && curSnap.overallSentiment >= 0 ? TrendingUp : TrendingDown}
            />
            <KPICard
              label="F&G Index"
              value={curSnap ? String(Math.round(curSnap.fearGreedIndex)) : '—'}
              sub={curSnap ? FEAR_GREED_META[curSnap.fearGreedZone].label : '—'}
              delta={fgDelta}
              color="#f59e0b"
              icon={Activity}
            />
            <KPICard
              label="Total Volume"
              value={curSnap ? fmtVolume(curSnap.totalVolume) : '—'}
              sub="mentions"
              color="#60a5fa"
              icon={Zap}
            />
            <KPICard
              label="Trend"
              value={curSnap?.trend ? trendIcon(curSnap.trend) : '—'}
              sub={curSnap?.trend ?? '—'}
              color={curSnap?.trend ? trendColor(curSnap.trend) : '#64748b'}
              icon={curSnap?.trend === 'rising' ? TrendingUp : curSnap?.trend === 'falling' ? TrendingDown : Minus}
            />
          </div>

          {/* Source breakdown */}
          {agg && (
            <div className="rounded-2xl p-5"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-4">
                Source Breakdown — {selectedSymbol}
              </p>
              <SourceBreakdown agg={agg} />

              {/* Overall composite */}
              <div className="mt-4 pt-4 border-t border-white/5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-muted-foreground">🔗 Weighted Overall</span>
                  <span className="text-xs font-black" style={{ color: sentimentColor(agg.latest.overallSentiment) }}>
                    {agg.latest.overallSentiment >= 0 ? '+' : ''}{agg.latest.overallSentiment.toFixed(3)}
                  </span>
                </div>
                <div className="h-3 rounded-full bg-white/5 overflow-hidden relative">
                  <div className="absolute inset-y-0 left-1/2 w-0.5 bg-white/20" />
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{
                      left: agg.latest.overallSentiment >= 0 ? '50%' : `${(agg.latest.overallSentiment + 1) / 2 * 100}%`,
                      width: `${Math.abs(agg.latest.overallSentiment) * 50}%`,
                      background: `linear-gradient(90deg, ${sentimentColor(agg.latest.overallSentiment)}, ${sentimentColor(agg.latest.overallSentiment)}cc)`,
                      position: 'absolute',
                    }} />
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">
                  Twitter 45% + Reddit 30% + News 25% · Updated {curSnap ? timeAgoSentiment(curSnap.timestamp) : '—'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid lg:grid-cols-2 gap-5">
        <ExtremeSignals aggregates={allAggs} />
        <NewsFeed marketSentiment={curSnap?.overallSentiment ?? 0} />
      </div>
    </div>
  );
}
