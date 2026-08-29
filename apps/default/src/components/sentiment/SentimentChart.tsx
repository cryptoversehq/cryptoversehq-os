/**
 * SentimentChart.tsx
 * Historical charts for Fear & Greed and per-source sentiment.
 * Tabs: F&G Timeline | Source Breakdown | Volume
 */
import React, { useState } from 'react';
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ReferenceLine, Cell, Legend,
} from 'recharts';
import {
  buildFearGreedChartData,
  buildSourceChartData,
  buildVolumeChartData,
  fmtVolume,
} from './sentimentUtils';
import { FEAR_GREED_META } from '../../lib/sentimentTypes';
import type { SentimentSnapshot } from '../../lib/sentimentTypes';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'feargreed', label: 'Fear & Greed' },
  { id: 'sources',   label: 'Source Sentiment' },
  { id: 'volume',    label: 'Mention Volume' },
] as const;

type TabId = typeof TABS[number]['id'];

const TOOLTIP_STYLE = {
  background: '#0d1424', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 10, fontSize: 11, color: '#e2e8f0',
};

function FearGreedAreaChart({ data }: { data: ReturnType<typeof buildFearGreedChartData> }) {
  return (
    <ResponsiveContainer width="100%" height={210}>
      <AreaChart data={data} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="fg-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
        <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false}
          interval="preserveStartEnd" />
        <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE}
          formatter={(v: number) => {
            const zone = v <= 24 ? 'extreme_fear' : v <= 44 ? 'fear' : v <= 55 ? 'neutral' : v <= 74 ? 'greed' : 'extreme_greed';
            return [`${v} — ${FEAR_GREED_META[zone].label} ${FEAR_GREED_META[zone].icon}`, 'F&G Index'];
          }} />
        {/* Zone reference lines */}
        <ReferenceLine y={25} stroke="#f97316" strokeDasharray="4 4" strokeOpacity={0.4} />
        <ReferenceLine y={45} stroke="#a3a3a3" strokeDasharray="4 4" strokeOpacity={0.4} />
        <ReferenceLine y={56} stroke="#22c55e" strokeDasharray="4 4" strokeOpacity={0.4} />
        <ReferenceLine y={75} stroke="#4ade80" strokeDasharray="4 4" strokeOpacity={0.4} />
        <Area type="monotone" dataKey="value" stroke="#f59e0b" strokeWidth={2}
          fill="url(#fg-grad)" dot={false} activeDot={{ r: 4, fill: '#f59e0b' }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function SourceLineChart({ data }: { data: ReturnType<typeof buildSourceChartData> }) {
  return (
    <ResponsiveContainer width="100%" height={210}>
      <LineChart data={data} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
        <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false}
          interval="preserveStartEnd" />
        <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={TOOLTIP_STYLE}
          formatter={(v: number, name: string) => [`${v}`, name.charAt(0).toUpperCase() + name.slice(1)]} />
        <ReferenceLine y={50} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />
        <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
        <Line type="monotone" dataKey="overall" stroke="#f59e0b" strokeWidth={2.5} dot={false}
          activeDot={{ r: 4 }} name="Overall" strokeDasharray="0" />
        <Line type="monotone" dataKey="twitter" stroke="#1d9bf0" strokeWidth={1.5} dot={false} name="Twitter" />
        <Line type="monotone" dataKey="reddit"  stroke="#ff4500" strokeWidth={1.5} dot={false} name="Reddit" />
        <Line type="monotone" dataKey="news"    stroke="#6366f1" strokeWidth={1.5} dot={false} name="News" />
      </LineChart>
    </ResponsiveContainer>
  );
}

function VolumeStackedChart({ data }: { data: ReturnType<typeof buildVolumeChartData> }) {
  return (
    <ResponsiveContainer width="100%" height={210}>
      <BarChart data={data} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
        <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false}
          interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false}
          tickFormatter={fmtVolume} />
        <Tooltip contentStyle={TOOLTIP_STYLE}
          formatter={(v: number, name: string) => [fmtVolume(v), name.charAt(0).toUpperCase() + name.slice(1)]} />
        <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
        <Bar dataKey="twitter" stackId="v" fill="#1d9bf0" fillOpacity={0.8} name="Twitter" radius={[0, 0, 0, 0]} />
        <Bar dataKey="reddit"  stackId="v" fill="#ff4500" fillOpacity={0.8} name="Reddit" />
        <Bar dataKey="news"    stackId="v" fill="#6366f1" fillOpacity={0.85} name="News" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

interface SentimentChartProps {
  snapshots: SentimentSnapshot[];
  symbol:   string;
}

export function SentimentChart({ snapshots, symbol }: SentimentChartProps) {
  const [tab, setTab] = useState<TabId>('feargreed');

  const fgData  = buildFearGreedChartData(snapshots);
  const srcData = buildSourceChartData(snapshots);
  const volData = buildVolumeChartData(snapshots);

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/5">
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Historical Sentiment</p>
          <p className="text-[10px] text-muted-foreground/50 mt-0.5">{symbol} · last {snapshots.length} snapshots</p>
        </div>
        {/* Tabs */}
        <div className="flex gap-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn(
                'px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all',
                tab === t.id
                  ? 'bg-primary/15 text-primary border border-primary/25'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/4',
              )}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4 pb-3">
        {tab === 'feargreed' && <FearGreedAreaChart data={fgData} />}
        {tab === 'sources'   && <SourceLineChart   data={srcData} />}
        {tab === 'volume'    && <VolumeStackedChart data={volData} />}
      </div>

      {/* Legend for F&G zones */}
      {tab === 'feargreed' && (
        <div className="flex flex-wrap gap-2 px-5 pb-4">
          {(['extreme_fear', 'fear', 'neutral', 'greed', 'extreme_greed'] as const).map(z => (
            <div key={z} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ background: FEAR_GREED_META[z].color }} />
              <span className="text-[9px] text-muted-foreground">{FEAR_GREED_META[z].label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
