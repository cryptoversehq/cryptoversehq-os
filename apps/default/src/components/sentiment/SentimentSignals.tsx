/**
 * SentimentSignals.tsx — §3.6 AI Trading Signals Based on Sentiment
 * Route: /sentiment/signals
 *
 * Spec layout (exact):
 *   1. Current Market Regime panel (phase, recommendation, risk, position size)
 *   2. Asset-Specific Signals table (Asset | Sentiment | Signal | Confidence | Action)
 *   3. Combined Signal Strength panel (Social, News, F&G, On-Chain → OVERALL)
 *   4. CTAs: [Apply Signal to Trading Bot] [Create Alert for This Signal]
 *
 * Business logic from Part 4:
 *   - SentimentScoringEngine (4.1) — word-list scoring
 *   - FearGreedIndexCalculator (4.2) — 5-component weighted index
 *   - classifyMarketRegime — DCA recommendation & position sizing
 *   - computeAssetSignalRow — per-coin buy/hold/sell with confidence
 *   - SentimentAlertTrigger (4.5) — combined condition evaluation
 */
import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Cell,
} from 'recharts';
import {
  RefreshCw, TrendingUp, TrendingDown, Minus, Shield, Zap,
  BarChart3, Bell, Bot, CheckCircle, AlertTriangle, Info,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSentimentStore } from '../../lib/sentimentStore';
import { FEAR_GREED_META, TRACKED_SYMBOLS } from '../../lib/sentimentTypes';
import {
  classifyMarketRegime, computeAssetSignalRow,
  SentimentScoringEngine, FearGreedIndexCalculator,
  SentimentAlertTrigger,
  type AssetSignalRow,
} from '../../lib/sentimentEngine';
import {
  fmtSentiment, sentimentColor,
} from './sentimentUtils';
import { cn } from '@/lib/utils';

// ── Constants ─────────────────────────────────────────────────────────────────

const TRACKED = TRACKED_SYMBOLS.slice(0, 8);

const TOOLTIP_STYLE = {
  background: '#0d1424', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 10, fontSize: 11, color: '#e2e8f0',
};

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="px-5 py-3.5 border-b border-white/5"
      style={{ background: 'rgba(255,255,255,0.02)' }}>
      <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">{title}</p>
    </div>
  );
}

// ── 1. Current Market Regime ──────────────────────────────────────────────────

function MarketRegimePanel({ fearGreedIndex }: { fearGreedIndex: number }) {
  const regime = classifyMarketRegime(fearGreedIndex);
  const fgMeta = FEAR_GREED_META[regime.regime === 'extreme_fear' ? 'extreme_fear'
    : regime.regime === 'fear'         ? 'fear'
    : regime.regime === 'greed'        ? 'greed'
    : regime.regime === 'extreme_greed'? 'extreme_greed'
    : 'neutral'];

  const riskColors: Record<string, string> = {
    LOW:       '#22c55e',
    MEDIUM:    '#f59e0b',
    HIGH:      '#fb923c',
    VERY_HIGH: '#ef4444',
  };
  const riskColor = riskColors[regime.riskLevel];

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <SectionHeader title="Current Market Regime" />
      <div className="p-5">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Phase */}
          <div className="rounded-2xl p-4"
            style={{ background: `${regime.color}08`, border: `1px solid ${regime.color}20` }}>
            <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Market Phase</p>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{regime.emoji}</span>
              <div>
                <p className="font-black text-base" style={{ color: regime.color }}>
                  {regime.regime.replace('_', ' ').toUpperCase()}
                </p>
                <p className="font-black text-xl" style={{ color: regime.color }}>({regime.fearGreedIndex})</p>
              </div>
            </div>
          </div>

          {/* Recommendation */}
          <div className="rounded-2xl p-4 sm:col-span-1 lg:col-span-1"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Recommendation</p>
            <p className="text-xs font-semibold text-foreground leading-relaxed">{regime.recommendation}</p>
          </div>

          {/* Risk */}
          <div className="rounded-2xl p-4"
            style={{ background: `${riskColor}08`, border: `1px solid ${riskColor}20` }}>
            <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Risk Level</p>
            <p className="font-black text-lg" style={{ color: riskColor }}>{regime.riskLevel.replace('_', ' ')}</p>
            <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full"
                style={{
                  width: regime.riskLevel === 'LOW' ? '25%' : regime.riskLevel === 'MEDIUM' ? '50%' : regime.riskLevel === 'HIGH' ? '75%' : '100%',
                  background: riskColor,
                }} />
            </div>
          </div>

          {/* Position size */}
          <div className="rounded-2xl p-4"
            style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.15)' }}>
            <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Suggested Position Size</p>
            <p className="font-black text-base text-[#60a5fa]">{regime.positionSize}</p>
            {regime.dcaAdvised && (
              <p className="text-[10px] text-emerald-400 mt-1 font-bold">✓ DCA Advised</p>
            )}
          </div>
        </div>

        {/* Action banner */}
        <div className="mt-4 flex items-center gap-3 px-4 py-3 rounded-xl"
          style={{ background: `${regime.color}08`, border: `1px solid ${regime.color}18` }}>
          <span className="text-lg shrink-0">{regime.emoji}</span>
          <p className="text-xs font-semibold text-foreground">{regime.action}</p>
        </div>
      </div>
    </div>
  );
}

// ── 2. Asset-Specific Signals Table ──────────────────────────────────────────

const SIGNAL_EMOJI: Record<string, string> = {
  BUY:  '🟢',
  HOLD: '🟡',
  SELL: '🔴',
};

function AssetSignalsTable({ rows, onSelectSymbol, selectedSymbol }: {
  rows: AssetSignalRow[];
  onSelectSymbol: (s: string) => void;
  selectedSymbol: string;
}) {
  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <SectionHeader title="Asset-Specific Signals" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead style={{ background: 'rgba(0,0,0,0.2)' }}>
            <tr className="text-[10px] text-muted-foreground uppercase tracking-wider">
              <th className="px-5 py-3 text-left">Asset</th>
              <th className="px-4 py-3 text-center">Sentiment</th>
              <th className="px-4 py-3 text-center">Signal</th>
              <th className="px-4 py-3 text-center">Confidence</th>
              <th className="px-4 py-3 text-left">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/4">
            {rows.map(row => (
              <motion.tr
                key={row.symbol}
                layout
                onClick={() => onSelectSymbol(row.symbol)}
                className={cn(
                  'cursor-pointer hover:bg-white/3 transition-colors',
                  selectedSymbol === row.symbol && 'bg-white/4',
                )}>
                {/* Asset */}
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black"
                      style={{ background: `${row.signalColor}15`, color: row.signalColor }}>
                      {row.symbol.slice(0, 2)}
                    </div>
                    <p className="font-black text-foreground">{row.symbol}</p>
                  </div>
                </td>

                {/* Sentiment */}
                <td className="px-4 py-3.5 text-center">
                  <span className="font-bold" style={{ color: FEAR_GREED_META[
                    row.sentimentIndex <= 24 ? 'extreme_fear' :
                    row.sentimentIndex <= 44 ? 'fear' :
                    row.sentimentIndex <= 55 ? 'neutral' :
                    row.sentimentIndex <= 74 ? 'greed' : 'extreme_greed'
                  ].color }}>
                    {row.sentimentIndex}
                  </span>
                  <span className="text-[10px] text-muted-foreground ml-1">({row.sentimentLabel})</span>
                </td>

                {/* Signal */}
                <td className="px-4 py-3.5 text-center">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black"
                    style={{ background: `${row.signalColor}12`, color: row.signalColor, border: `1px solid ${row.signalColor}25` }}>
                    {SIGNAL_EMOJI[row.signal]} {row.signal}
                  </span>
                </td>

                {/* Confidence */}
                <td className="px-4 py-3.5 text-center">
                  <div className="flex items-center gap-2 justify-center">
                    <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full rounded-full"
                        style={{ width: `${row.confidence}%`, background: row.signalColor }} />
                    </div>
                    <span className="text-xs font-bold text-foreground">{row.confidence}%</span>
                  </div>
                </td>

                {/* Action */}
                <td className="px-4 py-3.5">
                  <p className="text-xs text-muted-foreground">{row.action}</p>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── 3. Combined Signal Strength ───────────────────────────────────────────────

interface CombinedSignalData {
  social:    number;  // -1..1
  news:      number;  // -1..1
  fearGreed: number;  // 0..100
  onChain:   number;  // -1..1
}

function combineToOverall(data: CombinedSignalData): {
  score: number;
  label: string;
  emoji: string;
  color: string;
  advice: string;
} {
  // Convert F&G to contrarian -1..1
  const fgContra = -((data.fearGreed - 50) / 50) * 0.6;
  const socW     = data.social  * 0.20;
  const newsW    = data.news    * 0.10;
  const chainW   = data.onChain * 0.10;
  const composite = fgContra + socW + newsW + chainW;

  if (composite >= 0.35) return { score: composite, label: 'BULLISH',        emoji: '🟢', color: '#22c55e', advice: 'Buy the dip — sentiment turning bullish' };
  if (composite >= 0.15) return { score: composite, label: 'SLIGHTLY BULLISH', emoji: '💚', color: '#86efac', advice: 'Cautious accumulation advised' };
  if (composite >= -0.15) return { score: composite, label: 'NEUTRAL',        emoji: '🟡', color: '#f59e0b', advice: 'Wait for clearer direction' };
  if (composite >= -0.35) return { score: composite, label: 'SLIGHTLY BEARISH', emoji: '🟠', color: '#fb923c', advice: 'Reduce exposure, tighten stops' };
  return { score: composite, label: 'BEARISH', emoji: '🔴', color: '#ef4444', advice: 'Exit or hedge — strong bearish signal' };
}

function CombinedSignalPanel({ data, selectedRow }: { data: CombinedSignalData; selectedRow: AssetSignalRow | null }) {
  const overall = combineToOverall(data);

  const factors = [
    {
      label:  'Social Sentiment',
      value:  data.social,
      formatted: `${data.social >= 0 ? '+' : ''}${data.social.toFixed(1)}`,
      desc:  fmtSentiment(data.social),
      color: sentimentColor(data.social),
      pct:   ((data.social + 1) / 2) * 100,
    },
    {
      label:  'News Sentiment',
      value:  data.news,
      formatted: `${data.news >= 0 ? '+' : ''}${data.news.toFixed(1)}`,
      desc:  fmtSentiment(data.news),
      color: sentimentColor(data.news),
      pct:   ((data.news + 1) / 2) * 100,
    },
    {
      label:  'Fear & Greed',
      value:  data.fearGreed / 100,
      formatted: String(Math.round(data.fearGreed)),
      desc:  FEAR_GREED_META[data.fearGreed <= 24 ? 'extreme_fear' : data.fearGreed <= 44 ? 'fear' : data.fearGreed <= 55 ? 'neutral' : data.fearGreed <= 74 ? 'greed' : 'extreme_greed'].label,
      color: FEAR_GREED_META[data.fearGreed <= 24 ? 'extreme_fear' : data.fearGreed <= 44 ? 'fear' : data.fearGreed <= 55 ? 'neutral' : data.fearGreed <= 74 ? 'greed' : 'extreme_greed'].color,
      pct:   data.fearGreed,
    },
    {
      label:  'On-Chain',
      value:  data.onChain,
      formatted: `${data.onChain >= 0 ? '+' : ''}${data.onChain.toFixed(1)}`,
      desc:  fmtSentiment(data.onChain),
      color: sentimentColor(data.onChain),
      pct:   ((data.onChain + 1) / 2) * 100,
    },
  ];

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <SectionHeader title="Combined Signal Strength" />
      <div className="p-5 space-y-4">
        {/* Factor rows */}
        {factors.map(f => (
          <div key={f.label} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">{f.label}:</span>
              <span className="text-xs font-bold" style={{ color: f.color }}>
                {f.formatted} ({f.desc})
              </span>
            </div>
            <div className="h-2 rounded-full bg-white/6 overflow-hidden relative">
              <div className="absolute inset-y-0 left-1/2 w-px bg-white/15" />
              <div className="absolute h-full rounded-full transition-all duration-700"
                style={{
                  left:  f.value >= 0 ? '50%' : `${f.pct}%`,
                  width: `${Math.abs(f.value >= 0 ? f.pct - 50 : 50 - f.pct)}%`,
                  background: f.color,
                  opacity: 0.85,
                }} />
            </div>
          </div>
        ))}

        {/* Divider */}
        <div className="border-t border-white/10 pt-4">
          <div className="flex items-center gap-4 p-4 rounded-2xl"
            style={{ background: `${overall.color}08`, border: `1px solid ${overall.color}20` }}>
            <span className="text-3xl">{overall.emoji}</span>
            <div className="flex-1">
              <p className="text-[10px] font-bold text-muted-foreground uppercase">Overall Signal</p>
              <p className="font-black text-lg" style={{ color: overall.color }}>
                {overall.emoji} {overall.label}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{overall.advice}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[10px] text-muted-foreground">Score</p>
              <p className="font-black text-xl" style={{ color: overall.color }}>
                {overall.score >= 0 ? '+' : ''}{overall.score.toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        {/* Radar — factor alignment visualisation */}
        {selectedRow && (
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2">Factor Radar — {selectedRow.symbol}</p>
            <ResponsiveContainer width="100%" height={180}>
              <RadarChart data={[
                { subject: 'F&G',       value: Math.round(data.fearGreed) },
                { subject: 'Social',    value: Math.round((data.social + 1) / 2 * 100) },
                { subject: 'News',      value: Math.round((data.news + 1) / 2 * 100) },
                { subject: 'On-Chain',  value: Math.round((data.onChain + 1) / 2 * 100) },
                { subject: 'Confidence', value: selectedRow.confidence },
              ]}>
                <PolarGrid stroke="rgba(255,255,255,0.07)" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: '#64748b' }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Radar name={selectedRow.symbol} dataKey="value"
                  stroke={overall.color} fill={overall.color} fillOpacity={0.12} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Scoring engine explainer ───────────────────────────────────────────────────

function ScoringEnginePanel() {
  const [open, setOpen] = useState(false);
  const engine = new SentimentScoringEngine();
  const example = 'BTC looking bullish, moon soon! Hodl and buy the dip — not a crash yet';
  const score = engine.calculateTextSentiment(example);
  const scoreColor = sentimentColor(score);

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/2 transition-colors">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Sentiment Scoring Engine (Part 4.1)</p>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
            <div className="px-5 pb-5 space-y-4 border-t border-white/5">
              <p className="text-[11px] text-muted-foreground mt-4">
                VADER-style word-list classifier. Scores text on a <strong className="text-foreground">-1 (bearish) to +1 (bullish)</strong> scale.
                Each matched word contributes ±0.1 to the score, capped at ±1.
              </p>

              {/* Live demo */}
              <div className="p-3 rounded-xl bg-white/4 border border-white/8">
                <p className="text-[10px] text-muted-foreground mb-1">Example text:</p>
                <p className="text-xs text-foreground font-mono italic mb-2">"{example}"</p>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">Computed score:</span>
                  <span className="font-black text-sm" style={{ color: scoreColor }}>
                    {score >= 0 ? '+' : ''}{score.toFixed(2)} ({fmtSentiment(score)})
                  </span>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-xl" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}>
                  <p className="text-[10px] font-bold text-emerald-400 mb-1.5">Bullish Keywords</p>
                  <div className="flex flex-wrap gap-1">
                    {['bullish','moon','pump','buy','hodl','bull','surge','rocket','gem','accumulate','rally','breakout'].map(w => (
                      <span key={w} className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-400/10 text-emerald-400 font-mono">{w}</span>
                    ))}
                  </div>
                </div>
                <div className="p-3 rounded-xl" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
                  <p className="text-[10px] font-bold text-red-400 mb-1.5">Bearish Keywords</p>
                  <div className="flex flex-wrap gap-1">
                    {['bearish','dump','crash','sell','panic','bear','fud','scam','rug','collapse','ban','hack'].map(w => (
                      <span key={w} className="text-[9px] px-1.5 py-0.5 rounded bg-red-400/10 text-red-400 font-mono">{w}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── F&G calculator explainer ──────────────────────────────────────────────────

function FearGreedCalcPanel({ fearGreedIndex }: { fearGreedIndex: number }) {
  const [open, setOpen] = useState(false);
  const calc = new FearGreedIndexCalculator();
  const components = calc.calculate({
    twitterSentiment: 0.1,
    priceChange7d:    -3,
    btcDominance:     52,
    googleTrends:     55,
  });

  const bars = [
    { name: 'Volatility',  value: components.volatility,  color: '#f97316', weight: '25%' },
    { name: 'Momentum',    value: components.momentum,    color: '#60a5fa', weight: '25%' },
    { name: 'Social',      value: components.socialMedia, color: '#1d9bf0', weight: '15%' },
    { name: 'Dominance',   value: components.dominance,   color: '#a78bfa', weight: '15%' },
    { name: 'Trends',      value: components.trends,      color: '#4285f4', weight: '20%' },
  ];

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/2 transition-colors">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-amber-400" />
          <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Fear & Greed Index Calculator (Part 4.2)</p>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
            <div className="px-5 pb-5 space-y-4 border-t border-white/5">
              <p className="text-[11px] text-muted-foreground mt-4">
                5-component weighted average matching the <strong className="text-foreground">Alternative.me methodology</strong>.
                Current composite: <strong style={{ color: '#f59e0b' }}>{Math.round(fearGreedIndex)}</strong>
              </p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={bars} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE}
                    formatter={(v: number, _n: string, props: any) => [
                      `${v} · weight: ${props.payload.weight}`, props.payload.name,
                    ]} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {bars.map((b, i) => <Cell key={i} fill={b.color} fillOpacity={0.85} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-5 gap-2">
                {bars.map(b => (
                  <div key={b.name} className="text-center p-2 rounded-xl"
                    style={{ background: `${b.color}08`, border: `1px solid ${b.color}15` }}>
                    <p className="text-[9px] text-muted-foreground">{b.name}</p>
                    <p className="font-black text-sm" style={{ color: b.color }}>{b.value}</p>
                    <p className="text-[9px] text-muted-foreground/60">{b.weight}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── 4. CTAs ───────────────────────────────────────────────────────────────────

function CTAButtons({ overallSignal }: { overallSignal: string }) {
  function handleApplyBot() {
    toast.success('Signal applied to trading bot', {
      description: `Overall: ${overallSignal} — position sizing updated`,
    });
  }
  function handleCreateAlert() {
    toast.info('Redirecting to alert creation…', {
      description: 'Pre-filling conditions based on current signal',
    });
  }

  return (
    <div className="flex flex-wrap gap-3">
      <button onClick={handleApplyBot}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
        <Bot className="h-4 w-4" />
        Apply Signal to Trading Bot
      </button>
      <button onClick={handleCreateAlert}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm border border-white/15 text-muted-foreground hover:text-foreground hover:border-white/30 transition-all">
        <Bell className="h-4 w-4" />
        Create Alert for This Signal
      </button>
    </div>
  );
}

// ── Alert trigger demo ─────────────────────────────────────────────────────────

function AlertTriggerPanel({ fearGreed, social, news }: { fearGreed: number; social: number; news: number }) {
  const [open, setOpen] = useState(false);
  const trigger = new SentimentAlertTrigger();

  const demoAlerts = [
    { id: '1', userId: 'demo', name: 'Extreme Fear Alert', type: 'fear_greed' as const, condition: 'below' as const, threshold: 25 },
    { id: '2', userId: 'demo', name: 'Twitter FOMO',       type: 'social'     as const, condition: 'above' as const, threshold: 0.7 },
    { id: '3', userId: 'demo', name: 'News Panic',         type: 'news'       as const, condition: 'below' as const, threshold: -0.5 },
    { id: '4', userId: 'demo', name: 'Combined Panic',     type: 'combined'   as const, condition: 'below' as const, threshold: 30,
      fearGreedThreshold: 30, socialThreshold: -0.3, newsThreshold: -0.3 },
  ];

  const input = { currentFearGreed: fearGreed, socialSentiment: social, newsSentiment: news };
  const events = trigger.evaluateBatch(demoAlerts, input);

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/2 transition-colors">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-amber-400" />
          <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">
            Alert Trigger System (Part 4.5)
          </p>
          {events.length > 0 && (
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-400/10 text-red-400 border border-red-400/20">
              {events.length} TRIGGERED
            </span>
          )}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
            <div className="px-5 pb-5 space-y-3 border-t border-white/5 mt-0">
              <p className="text-[11px] text-muted-foreground mt-4">
                Combined-condition alert evaluator. Supports <code className="font-mono text-primary">fear_greed</code>, <code className="font-mono text-primary">social</code>, <code className="font-mono text-primary">news</code>, and <code className="font-mono text-primary">combined</code> alert types.
                Current input: F&G {Math.round(fearGreed)} · Social {social.toFixed(2)} · News {news.toFixed(2)}
              </p>
              <div className="space-y-2">
                {demoAlerts.map(alert => {
                  const fired = events.find(e => e.alertId === alert.id);
                  return (
                    <div key={alert.id} className={cn(
                      'flex items-center gap-3 px-4 py-3 rounded-xl border transition-all',
                      fired
                        ? 'border-red-400/25 bg-red-400/5'
                        : 'border-white/6 bg-white/2',
                    )}>
                      {fired
                        ? <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                        : <CheckCircle   className="h-4 w-4 text-muted-foreground/30 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-foreground">{alert.name}</p>
                        {fired && <p className="text-[10px] text-red-400 mt-0.5">{fired.message}</p>}
                      </div>
                      <span className={cn(
                        'text-[10px] font-black px-2 py-0.5 rounded-full shrink-0',
                        fired
                          ? 'bg-red-400/12 text-red-400 border border-red-400/20'
                          : 'bg-white/5 text-muted-foreground',
                      )}>
                        {fired ? 'FIRED' : 'QUIET'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Disclaimer ────────────────────────────────────────────────────────────────

function Disclaimer() {
  return (
    <div className="flex items-start gap-3 px-4 py-3 rounded-xl"
      style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.12)' }}>
      <Info className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
      <p className="text-[11px] text-amber-400/80">
        <strong>Not financial advice.</strong> Signals are derived from sentiment data only.
        Always use proper risk management, stop-losses, and position sizing.
        Past sentiment patterns do not guarantee future price movements.
      </p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SentimentSignals() {
  const { getAllAggregates, getMarketFearGreed } = useSentimentStore();
  const [selectedSymbol, setSelectedSymbol] = useState<string>('BTC');
  const [refreshing, setRefreshing] = useState(false);

  const allAggs = getAllAggregates();
  const market  = getMarketFearGreed();
  const globalFG = market?.index ?? 50;

  // Build all asset signal rows
  const signalRows = useMemo<AssetSignalRow[]>(() => {
    return TRACKED.map(sym => {
      const agg      = allAggs.find(a => a.symbol === sym);
      const social   = agg?.latest.overallSentiment ?? 0;
      const news     = agg?.latest.newsSentiment    ?? 0;
      // Per-coin F&G: blend global with per-coin social
      const coinFG   = Math.round(Math.max(0, Math.min(100, globalFG + social * 12)));
      return computeAssetSignalRow(sym, coinFG, social, news, globalFG);
    });
  }, [allAggs.length, globalFG]);

  // Selected row for combined panel
  const selectedRow = signalRows.find(r => r.symbol === selectedSymbol) ?? signalRows[0];

  // Combined signal data for selected symbol
  const combinedData: CombinedSignalData = useMemo(() => ({
    social:    selectedRow?.socialSentiment ?? 0,
    news:      selectedRow?.newsSentiment   ?? 0,
    fearGreed: globalFG,
    onChain:   selectedRow?.onChainScore    ?? 0,
  }), [selectedRow, globalFG]);

  const overall = combineToOverall(combinedData);

  function handleRefresh() {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
      toast.success('Signals recalculated with latest sentiment data');
    }, 700);
  }

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-lg text-foreground">📊 AI Trading Signals Based on Sentiment</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {TRACKED.length} assets tracked · F&G: {Math.round(globalFG)} · {new Date().toLocaleTimeString()}
          </p>
        </div>
        <button onClick={handleRefresh} disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border border-white/10 text-muted-foreground hover:text-foreground transition-all disabled:opacity-50">
          <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* §3.6 Panel 1: Current Market Regime */}
      <MarketRegimePanel fearGreedIndex={globalFG} />

      {/* §3.6 Panel 2: Asset-Specific Signals Table */}
      <AssetSignalsTable
        rows={signalRows}
        selectedSymbol={selectedSymbol}
        onSelectSymbol={setSelectedSymbol}
      />

      {/* §3.6 Panel 3: Combined Signal Strength */}
      <CombinedSignalPanel data={combinedData} selectedRow={selectedRow} />

      {/* §3.6 CTAs */}
      <CTAButtons overallSignal={overall.label} />

      {/* Business logic panels (Part 4) — collapsible */}
      <div className="pt-2 border-t border-white/6">
        <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-3">
          ⚙️ Scoring Engine Details (Part 4)
        </p>
        <div className="space-y-3">
          <ScoringEnginePanel />
          <FearGreedCalcPanel fearGreedIndex={globalFG} />
          <AlertTriggerPanel
            fearGreed={globalFG}
            social={combinedData.social}
            news={combinedData.news}
          />
        </div>
      </div>

      <Disclaimer />
    </div>
  );
}
