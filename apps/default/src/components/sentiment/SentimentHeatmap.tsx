/**
 * SentimentHeatmap.tsx
 * Grid of all tracked symbols coloured by overall sentiment.
 * Each cell shows: symbol, sentiment score, F&G index, trend arrow.
 * Clicking a cell opens that symbol's detail.
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { type AggregateSentiment } from '../../lib/sentimentTypes';
import { FEAR_GREED_META } from '../../lib/sentimentTypes';
import {
  fmtSentiment, sentimentColor, heatmapColor, heatmapBorder,
  trendIcon, trendColor, fmtVolume,
} from './sentimentUtils';
import { cn } from '@/lib/utils';

interface HeatmapCellProps {
  agg:      AggregateSentiment;
  selected: boolean;
  onClick:  () => void;
}

function HeatmapCell({ agg, selected, onClick }: HeatmapCellProps) {
  const { latest, trend } = agg;
  const bgColor  = heatmapColor(latest.overallSentiment);
  const border   = selected
    ? 'rgba(96,165,250,0.8)'
    : heatmapBorder(latest.overallSentiment);
  const sentColor = sentimentColor(latest.overallSentiment);
  const zoneMeta  = FEAR_GREED_META[latest.fearGreedZone];

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      className="rounded-2xl p-3 text-left transition-all relative overflow-hidden"
      style={{ background: bgColor, border: `1px solid ${border}` }}>
      {/* Symbol */}
      <div className="flex items-start justify-between mb-1.5">
        <p className="font-black text-sm text-foreground">{agg.symbol}</p>
        <span className="text-xs font-bold" style={{ color: trendColor(trend) }}>
          {trendIcon(trend)}
        </span>
      </div>

      {/* Sentiment score */}
      <p className="font-bold text-lg leading-none" style={{ color: sentColor }}>
        {(latest.overallSentiment >= 0 ? '+' : '')}{(latest.overallSentiment ?? 0).toFixed(2)}
      </p>
      <p className="text-[9px] text-muted-foreground mt-0.5">{fmtSentiment(latest.overallSentiment)}</p>

      {/* F&G */}
      <div className="flex items-center gap-1.5 mt-2">
        <div className="w-1.5 h-1.5 rounded-full" style={{ background: zoneMeta.color }} />
        <span className="text-[9px] font-bold" style={{ color: zoneMeta.color }}>
          F&G: {Math.round(latest.fearGreedIndex)}
        </span>
      </div>

      {/* Volume */}
      <p className="text-[9px] text-muted-foreground/60 mt-0.5">
        Vol: {fmtVolume(latest.totalVolume)}
      </p>

      {selected && (
        <div className="absolute inset-0 rounded-2xl border-2 border-primary pointer-events-none" />
      )}
    </motion.button>
  );
}

interface SentimentHeatmapProps {
  aggregates:       AggregateSentiment[];
  selectedSymbol:   string;
  onSelectSymbol:   (s: string) => void;
}

// Sort options
const SORT_OPTIONS = [
  { id: 'bullish',   label: 'Most Bullish' },
  { id: 'bearish',   label: 'Most Bearish' },
  { id: 'volume',    label: 'Highest Volume' },
  { id: 'feargreed', label: 'Fear & Greed' },
  { id: 'alpha',     label: 'A-Z' },
] as const;

type SortId = typeof SORT_OPTIONS[number]['id'];

function sortAggregates(aggs: AggregateSentiment[], sortId: SortId): AggregateSentiment[] {
  const arr = [...aggs];
  switch (sortId) {
    case 'bullish':   return arr.sort((a, b) => b.latest.overallSentiment - a.latest.overallSentiment);
    case 'bearish':   return arr.sort((a, b) => a.latest.overallSentiment - b.latest.overallSentiment);
    case 'volume':    return arr.sort((a, b) => b.latest.totalVolume - a.latest.totalVolume);
    case 'feargreed': return arr.sort((a, b) => b.latest.fearGreedIndex - a.latest.fearGreedIndex);
    case 'alpha':     return arr.sort((a, b) => a.symbol.localeCompare(b.symbol));
    default:          return arr;
  }
}

export function SentimentHeatmap({ aggregates, selectedSymbol, onSelectSymbol }: SentimentHeatmapProps) {
  const [sortBy, setSortBy] = useState<SortId>('bullish');
  const sorted = sortAggregates(aggregates, sortBy);

  const bullishCount = aggregates.filter(a => a.latest.overallSentiment >= 0.2).length;
  const bearishCount = aggregates.filter(a => a.latest.overallSentiment <= -0.2).length;
  const neutralCount = aggregates.length - bullishCount - bearishCount;

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-white/5"
        style={{ background: 'rgba(255,255,255,0.03)' }}>
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Sentiment Heatmap</p>
          <div className="flex items-center gap-4 mt-1.5">
            <span className="text-[10px] font-bold text-emerald-400">↑ {bullishCount} Bullish</span>
            <span className="text-[10px] font-bold text-muted-foreground">→ {neutralCount} Neutral</span>
            <span className="text-[10px] font-bold text-red-400">↓ {bearishCount} Bearish</span>
          </div>
        </div>
        {/* Sort */}
        <div className="flex gap-1 flex-wrap">
          {SORT_OPTIONS.map(s => (
            <button key={s.id} onClick={() => setSortBy(s.id)}
              className={cn(
                'px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all',
                sortBy === s.id
                  ? 'bg-primary/15 text-primary border border-primary/25'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/4',
              )}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5">
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
          {sorted.map(agg => (
            <HeatmapCell
              key={agg.symbol}
              agg={agg}
              selected={agg.symbol === selectedSymbol}
              onClick={() => onSelectSymbol(agg.symbol)}
            />
          ))}
        </div>
      </div>

      {/* Color legend */}
      <div className="flex items-center gap-3 px-5 pb-4">
        <span className="text-[9px] text-muted-foreground">Sentiment:</span>
        {[
          { color: '#ef4444', label: 'Very Bearish' },
          { color: '#fb923c', label: 'Bearish' },
          { color: '#a3a3a3', label: 'Neutral' },
          { color: '#86efac', label: 'Bullish' },
          { color: '#22c55e', label: 'Very Bullish' },
        ].map(b => (
          <div key={b.label} className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ background: b.color + '40', border: `1px solid ${b.color}60` }} />
            <span className="text-[9px] text-muted-foreground">{b.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
