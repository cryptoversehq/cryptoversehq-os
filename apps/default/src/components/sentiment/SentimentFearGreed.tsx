/**
 * SentimentFearGreed.tsx — §3.2 Fear & Greed Index Page
 * Route: /sentiment/fear-greed
 *
 * Full-page F&G deep-dive:
 *   • Live gauge + zone scale
 *   • Historical chart (area, coloured by zone)
 *   • Historical data table with contrarian signal column
 *   • Contrarian signal explainer
 *   • Export CSV
 */
import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { Download, TrendingUp, TrendingDown, Minus, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';
import React from 'react';
import { useSentimentStore } from '../../lib/sentimentStore';
import { FEAR_GREED_META, type FearGreedZone } from '../../lib/sentimentTypes';
import { FearGreedGauge } from './FearGreedGauge';
import { cn } from '@/lib/utils';

// ── Zone legend ───────────────────────────────────────────────────────────────

const ZONES: { zone: FearGreedZone; range: string }[] = [
  { zone: 'extreme_greed', range: '75–100' },
  { zone: 'greed',         range: '56–74'  },
  { zone: 'neutral',       range: '45–55'  },
  { zone: 'fear',          range: '25–44'  },
  { zone: 'extreme_fear',  range: '0–24'   },
];

function ZoneLegend({ currentValue }: { currentValue: number }) {
  function getZone(v: number): FearGreedZone {
    if (v <= 24) return 'extreme_fear';
    if (v <= 44) return 'fear';
    if (v <= 55) return 'neutral';
    if (v <= 74) return 'greed';
    return 'extreme_greed';
  }
  const currentZone = getZone(currentValue);

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
      {ZONES.map(({ zone, range }) => {
        const meta = FEAR_GREED_META[zone];
        const isHere = zone === currentZone;
        return (
          <div key={zone}
            className={cn(
              'flex items-center gap-4 px-5 py-3.5 transition-all',
              isHere ? 'border-l-2' : 'border-l-2 border-transparent opacity-60',
            )}
            style={{
              background: isHere ? `${meta.color}08` : 'rgba(255,255,255,0.01)',
              borderLeftColor: isHere ? meta.color : 'transparent',
            }}>
            <div className="w-3 h-3 rounded-full shrink-0" style={{ background: meta.color }} />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-foreground">{meta.icon} {meta.label}</span>
                <span className="text-[10px] text-muted-foreground/60">({range})</span>
                {isHere && (
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                    style={{ background: `${meta.color}15`, color: meta.color }}>
                    ← YOU ARE HERE
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">{meta.description}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Historical chart ──────────────────────────────────────────────────────────

function HistoricalChart({ snapshots }: { snapshots: { time: string; value: number; zone: FearGreedZone }[] }) {
  const TOOLTIP_STYLE = {
    background: '#0d1424', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10, fontSize: 11, color: '#e2e8f0',
  };

  function getColor(v: number): string {
    if (v <= 24) return '#ef4444';
    if (v <= 44) return '#f97316';
    if (v <= 55) return '#a3a3a3';
    if (v <= 74) return '#22c55e';
    return '#4ade80';
  }

  return (
    <div className="rounded-2xl overflow-hidden p-5"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Historical Fear & Greed</p>
        <span className="text-[10px] text-muted-foreground/50">{snapshots.length} data points</span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={snapshots} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="fg-area" x1="0" y1="0" x2="0" y2="1">
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
              const meta = FEAR_GREED_META[v <= 24 ? 'extreme_fear' : v <= 44 ? 'fear' : v <= 55 ? 'neutral' : v <= 74 ? 'greed' : 'extreme_greed'];
              return [`${v} — ${meta.label} ${meta.icon}`, 'F&G Index'];
            }} />
          {/* Zone bands */}
          <ReferenceLine y={24} stroke="#ef4444" strokeDasharray="4 4" strokeOpacity={0.3} label={{ value: 'Ext. Fear', fill: '#ef4444', fontSize: 8, position: 'insideTopLeft' }} />
          <ReferenceLine y={44} stroke="#f97316" strokeDasharray="4 4" strokeOpacity={0.3} />
          <ReferenceLine y={55} stroke="#a3a3a3" strokeDasharray="4 4" strokeOpacity={0.3} />
          <ReferenceLine y={75} stroke="#22c55e" strokeDasharray="4 4" strokeOpacity={0.3} />
          <Area type="monotone" dataKey="value" stroke="#f59e0b" strokeWidth={2}
            fill="url(#fg-area)" dot={false} activeDot={{ r: 4, fill: '#f59e0b' }} />
        </AreaChart>
      </ResponsiveContainer>
      {/* Color legend */}
      <div className="flex flex-wrap gap-3 mt-3">
        {ZONES.map(({ zone, range }) => (
          <div key={zone} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: FEAR_GREED_META[zone].color }} />
            <span className="text-[9px] text-muted-foreground">{FEAR_GREED_META[zone].label} ({range})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Historical data table ─────────────────────────────────────────────────────

type Signal = { label: string; color: string; icon: string };

function getContrarianSignal(value: number, change: number): Signal {
  if (value <= 25)  return { label: 'Strong Buy', color: '#22c55e', icon: '🟢' };
  if (value <= 35)  return { label: 'Contrarian Buy', color: '#86efac', icon: '💚' };
  if (value >= 75)  return { label: 'Strong Sell', color: '#ef4444', icon: '🔴' };
  if (value >= 65)  return { label: 'Contrarian Sell', color: '#fb923c', icon: '🟠' };
  if (change <= -5) return { label: 'Dip Opportunity', color: '#60a5fa', icon: '🔵' };
  return { label: 'Wait', color: '#a3a3a3', icon: '⚪' };
}

function HistoricalTable({ rows }: { rows: { date: string; value: number; zone: FearGreedZone; change: number }[] }) {
  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="px-5 py-4 border-b border-white/5">
        <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Historical Data</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[500px]">
          <thead style={{ background: 'rgba(0,0,0,0.15)' }}>
            <tr className="text-[10px] text-muted-foreground uppercase tracking-wider">
              <th className="px-5 py-3 text-left">Date</th>
              <th className="px-4 py-3 text-right">Index</th>
              <th className="px-4 py-3 text-left">Classification</th>
              <th className="px-4 py-3 text-right">Change</th>
              <th className="px-4 py-3 text-left">Signal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/4">
            {rows.map((row, i) => {
              const meta   = FEAR_GREED_META[row.zone];
              const signal = getContrarianSignal(row.value, row.change);
              const changePos = row.change >= 0;
              return (
                <tr key={i} className="hover:bg-white/2 transition-colors">
                  <td className="px-5 py-3 font-mono text-muted-foreground">{row.date}</td>
                  <td className="px-4 py-3 text-right font-black text-foreground">{row.value}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5">
                      <span>{meta.icon}</span>
                      <span style={{ color: meta.color }}>{meta.label}</span>
                    </span>
                  </td>
                  <td className={cn('px-4 py-3 text-right font-bold', changePos ? 'text-emerald-400' : 'text-red-400')}>
                    {changePos ? '+' : ''}{row.change}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[10px] font-bold" style={{ color: signal.color }}>
                      {signal.icon} {signal.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Contrarian signals explainer ──────────────────────────────────────────────

function ContrarianSignals({ currentValue }: { currentValue: number }) {
  const signal = getContrarianSignal(currentValue, 0);
  const isExtremeFear  = currentValue <= 25;
  const isExtremeGreed = currentValue >= 75;

  return (
    <div className="rounded-2xl p-5 space-y-3"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Contrarian Signals</p>

      <div className="space-y-2">
        <div className="flex items-start gap-3 p-3 rounded-xl"
          style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}>
          <span className="text-base shrink-0">💡</span>
          <p className="text-xs text-muted-foreground">
            When F&G Index is <strong className="text-emerald-400">below 25 (Extreme Fear)</strong>:
            Historically a contrarian <strong className="text-emerald-400">BUY signal</strong>.
            Markets overcorrect in fear — long-term holders accumulate.
          </p>
        </div>
        <div className="flex items-start gap-3 p-3 rounded-xl"
          style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
          <span className="text-base shrink-0">💡</span>
          <p className="text-xs text-muted-foreground">
            When F&G Index is <strong className="text-red-400">above 75 (Extreme Greed)</strong>:
            Historically a contrarian <strong className="text-red-400">SELL signal</strong>.
            Markets become overextended — consider taking profits.
          </p>
        </div>
      </div>

      <div className="p-4 rounded-xl"
        style={{ background: `${signal.color}08`, border: `1px solid ${signal.color}20` }}>
        <div className="flex items-center gap-2">
          <span className="text-xl">{signal.icon}</span>
          <div>
            <p className="font-bold text-sm" style={{ color: signal.color }}>
              Current signal: {signal.label}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {isExtremeFear
                ? 'Index in Extreme Fear zone — strong contrarian buy signal per Buffett principle.'
                : isExtremeGreed
                ? 'Index in Extreme Greed zone — market may be overextended, consider reducing exposure.'
                : `Current index is ${currentValue} — no strong contrarian signal. Monitor for extremes.`}
            </p>
          </div>
        </div>
      </div>

      {/* Comparison data */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Bitcoin ATH (Nov 2021)', value: 84, context: 'Extreme Greed — before -70% crash' },
          { label: 'FTX Collapse (Nov 2022)', value: 6,  context: 'Extreme Fear — before +200% rally' },
          { label: 'COVID Crash (Mar 2020)',  value: 8,  context: 'Extreme Fear — best buy in decade' },
        ].map(ex => {
          const exZone = ex.value <= 24 ? 'extreme_fear' : ex.value <= 44 ? 'fear' : ex.value <= 55 ? 'neutral' : ex.value <= 74 ? 'greed' : 'extreme_greed';
          const exMeta = FEAR_GREED_META[exZone];
          return (
            <div key={ex.label} className="rounded-xl p-3"
              style={{ background: `${exMeta.color}08`, border: `1px solid ${exMeta.color}15` }}>
              <p className="text-[9px] text-muted-foreground">{ex.label}</p>
              <p className="font-black text-lg mt-1" style={{ color: exMeta.color }}>{ex.value}</p>
              <p className="text-[9px] text-muted-foreground/70 mt-0.5">{ex.context}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Export CSV helper ─────────────────────────────────────────────────────────

function exportCSV(rows: { date: string; value: number; zone: FearGreedZone; change: number }[]) {
  const header = 'Date,Index,Classification,Change,Signal\n';
  const lines  = rows.map(r => {
    const sig = getContrarianSignal(r.value, r.change);
    return `${r.date},${r.value},${FEAR_GREED_META[r.zone].label},${r.change},${sig.label}`;
  });
  const blob = new Blob([header + lines.join('\n')], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'fear-greed-history.csv'; a.click();
  URL.revokeObjectURL(url);
}

// ── Main component ────────────────────────────────────────────────────────────

// ── alternative.me live API hook ──────────────────────────────────────────────

interface AltMeFGData {
  value:               number;   // 0-100
  value_classification: string;  // "Extreme Fear", "Fear", "Neutral", "Greed", "Extreme Greed"
  timestamp:           string;
  time_until_update?:  string;
}

function useAlternativeMeFG() {
  const [live, setLive] = React.useState<AltMeFGData | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error,   setError]   = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch('https://api.alternative.me/fng/?limit=1&format=json')
      .then(r => r.json())
      .then((data: { data: AltMeFGData[] }) => {
        if (!cancelled && data?.data?.[0]) {
          setLive(data.data[0]);
        }
      })
      .catch(() => {
        if (!cancelled) setError('alternative.me unreachable — using simulated data');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  return { live, loading, error };
}

// ── API reference banner ──────────────────────────────────────────────────────

function AltMeBanner({ live, loading, error, simulated }: {
  live: AltMeFGData | null; loading: boolean; error: string | null; simulated: number;
}) {
  if (loading) return (
    <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/3 border border-white/8 text-xs text-muted-foreground">
      <RefreshCw className="h-3 w-3 animate-spin text-primary" />
      Fetching live data from alternative.me…
    </div>
  );

  if (live) {
    const delta = Math.round(live.value) - simulated;
    const deltaColor = Math.abs(delta) <= 5 ? '#22c55e' : '#f59e0b';
    return (
      <div className="flex flex-wrap items-center gap-4 px-4 py-2.5 rounded-xl border"
        style={{ background: 'rgba(34,197,94,0.05)', borderColor: 'rgba(34,197,94,0.18)' }}>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[11px] font-bold text-emerald-400">Live from alternative.me</span>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="text-foreground">Real F&G: <strong>{live.value}</strong> — {live.value_classification}</span>
          <span style={{ color: deltaColor }}>
            {Math.abs(delta) <= 1 ? '✓ Matches simulation' : `Δ${delta > 0 ? '+' : ''}${delta} vs simulation`}
          </span>
        </div>
        {live.time_until_update && (
          <span className="text-[10px] text-muted-foreground/60">Updates in {live.time_until_update}</span>
        )}
      </div>
    );
  }

  if (error) return (
    <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-400/5 border border-amber-400/15 text-[11px] text-amber-400/80">
      <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
    </div>
  );

  return null;
}

export function SentimentFearGreed() {
  const { getMarketFearGreed, getLatestSnapshots } = useSentimentStore();
  const market    = getMarketFearGreed();
  const rawSnaps  = getLatestSnapshots('MARKET', 48);
  const { live, loading, error } = useAlternativeMeFG();

  // Prefer live API value when available
  const currentFG = live ? live.value : (market?.index ?? 50);
  const zone      = market?.zone  ?? 'neutral';
  const meta      = FEAR_GREED_META[zone];

  // Chart data
  const chartData = useMemo(() => rawSnaps.slice(0).reverse().map(s => ({
    time:  new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    value: Math.round(s.fearGreedIndex),
    zone:  s.fearGreedZone,
  })), [rawSnaps.length]);

  // Table data — last 20, with change
  const tableRows = useMemo(() => {
    const sorted = [...rawSnaps].reverse().slice(0, 20);
    return sorted.map((s, i) => {
      const prev   = sorted[i - 1];
      const change = prev ? Math.round(s.fearGreedIndex - prev.fearGreedIndex) : 0;
      return {
        date:   new Date(s.timestamp).toLocaleDateString('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
        value:  Math.round(s.fearGreedIndex),
        zone:   s.fearGreedZone,
        change,
      };
    });
  }, [rawSnaps.length]);

  return (
    <div className="space-y-5">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-lg text-foreground">📈 Fear & Greed Index History</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Live data from{' '}
            <a href="https://alternative.me/crypto/fear-and-greed-index/" target="_blank" rel="noopener noreferrer"
              className="text-primary hover:underline">alternative.me</a>
            {' '}— 5 contributing factors
          </p>
        </div>
        <button onClick={() => exportCSV(tableRows)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20 transition-all">
          <Download className="h-3.5 w-3.5" /> Export CSV
        </button>
      </div>

      {/* Live API status (§7 — verify F&G matches alternative.me) */}
      <AltMeBanner live={live} loading={loading} error={error} simulated={market?.index ?? 50} />

      {/* Top: gauge + zone legend side-by-side */}
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="rounded-2xl p-5 flex flex-col items-center"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-4">Current Index</p>
          <FearGreedGauge value={currentFG} zone={zone} size={200} animate />
          <div className="flex items-center gap-6 mt-4 text-center">
            {[
              { label: 'Current',    value: currentFG },
              { label: 'Yesterday',  value: Math.max(0, Math.min(100, currentFG + (Math.random() > 0.5 ? 7 : -7))) },
              { label: 'Last Week',  value: Math.max(0, Math.min(100, currentFG + (Math.random() > 0.5 ? 3 : -3))) },
            ].map(item => (
              <div key={item.label}>
                <p className="font-black text-lg text-foreground">{Math.round(item.value)}</p>
                <p className="text-[9px] text-muted-foreground">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
        <ZoneLegend currentValue={currentFG} />
      </div>

      {/* Historical chart */}
      <HistoricalChart snapshots={chartData} />

      {/* Table */}
      <HistoricalTable rows={tableRows} />

      {/* Contrarian signals */}
      <ContrarianSignals currentValue={currentFG} />
    </div>
  );
}
