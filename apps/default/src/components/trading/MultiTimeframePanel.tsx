import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  Candle, Timeframe, generateCandles, tickCandles,
  calcRSI, calcSMA, IndicatorPoint,
} from '@/lib/marketEngine';

// ─── Types ─────────────────────────────────────────────────────────────────────

type Trend = 'strong_bull' | 'bull' | 'neutral' | 'bear' | 'strong_bear';

interface TFAnalysis {
  tf:        Timeframe;
  rsi:       number | null;
  trend:     Trend;
  ma20:      number | null;
  ma50:      number | null;
  price:     number | null;
  change:    number;    // % change over last 10 candles
  momentum:  number;   // rate of RSI change
  overbought: boolean;
  oversold:   boolean;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1D', '1W'];

const TF_LABEL: Record<Timeframe, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m',
  '1h': '1H', '4h': '4H', '1D': '1D', '1W': '1W',
};

const TF_FULL: Record<Timeframe, string> = {
  '1m': '1 Minute', '5m': '5 Minutes', '15m': '15 Minutes',
  '1h': '1 Hour',   '4h': '4 Hours',   '1D': '1 Day', '1W': '1 Week',
};

const TREND_CFG: Record<Trend, {
  label: string; short: string;
  bg: string; text: string; dot: string; border: string;
}> = {
  strong_bull: { label: 'Strong Bull', short: '↑↑', bg: 'rgba(14,203,129,0.2)',  text: '#0ecb81', dot: '#0ecb81', border: 'rgba(14,203,129,0.45)' },
  bull:        { label: 'Bullish',     short: '↑',  bg: 'rgba(14,203,129,0.1)',  text: '#0ecb81', dot: '#2fd898', border: 'rgba(14,203,129,0.25)' },
  neutral:     { label: 'Neutral',     short: '→',  bg: 'rgba(240,185,11,0.1)',  text: '#f0b90b', dot: '#f0b90b', border: 'rgba(240,185,11,0.25)' },
  bear:        { label: 'Bearish',     short: '↓',  bg: 'rgba(246,70,93,0.1)',   text: '#f6465d', dot: '#f6465d', border: 'rgba(246,70,93,0.25)'  },
  strong_bear: { label: 'Strong Bear', short: '↓↓', bg: 'rgba(246,70,93,0.22)',  text: '#f6465d', dot: '#f6465d', border: 'rgba(246,70,93,0.45)'  },
};

// ─── Analysis Logic ─────────────────────────────────────────────────────────────

function deriveTrend(candles: Candle[], rsi: number | null): Trend {
  if (candles.length < 20) return 'neutral';

  const last   = candles[candles.length - 1];
  const prev10 = candles[candles.length - 11];
  const pctChg = prev10 ? ((last.close - prev10.close) / prev10.close) * 100 : 0;

  // MA cross
  const closes   = candles.map(c => c.close);
  const last20   = closes.slice(-20);
  const last50   = closes.slice(-50);
  const ma20val  = last20.length >= 20  ? last20.reduce((a, b) => a + b, 0) / 20  : null;
  const ma50val  = last50.length >= 50  ? last50.reduce((a, b) => a + b, 0) / 50  : null;
  const maBull   = ma20val !== null && ma50val !== null && ma20val > ma50val;
  const maBear   = ma20val !== null && ma50val !== null && ma20val < ma50val;

  const rsiVal = rsi ?? 50;

  // Score-based approach: –2 .. +2
  let score = 0;

  // RSI
  if (rsiVal > 60) score += 1;
  else if (rsiVal < 40) score -= 1;
  if (rsiVal > 70) score += 1;
  else if (rsiVal < 30) score -= 1;

  // Price momentum
  if (pctChg > 1.5) score += 1;
  else if (pctChg < -1.5) score -= 1;

  // MA alignment
  if (maBull) score += 1;
  else if (maBear) score -= 1;

  // Price vs MA20
  if (ma20val !== null) {
    if (last.close > ma20val * 1.005) score += 0.5;
    else if (last.close < ma20val * 0.995) score -= 0.5;
  }

  if (score >= 2)       return 'strong_bull';
  if (score >= 0.75)    return 'bull';
  if (score <= -2)      return 'strong_bear';
  if (score <= -0.75)   return 'bear';
  return 'neutral';
}

function analyseTimeframe(candles: Candle[]): Omit<TFAnalysis, 'tf'> {
  if (candles.length === 0) {
    return { rsi: null, trend: 'neutral', ma20: null, ma50: null, price: null,
             change: 0, momentum: 0, overbought: false, oversold: false };
  }

  const rsiArr  = calcRSI(candles, 14);
  const sma20Arr = calcSMA(candles, 20);
  const sma50Arr = calcSMA(candles, 50);

  const lastRsi  = rsiArr[rsiArr.length - 1]?.value ?? null;
  const prevRsi  = rsiArr[rsiArr.length - 4]?.value ?? null;   // 3 bars ago for momentum
  const lastMa20 = sma20Arr[sma20Arr.length - 1]?.value ?? null;
  const lastMa50 = sma50Arr[sma50Arr.length - 1]?.value ?? null;
  const lastPrice = candles[candles.length - 1]?.close ?? null;
  const prev10Price = candles[candles.length - 11]?.close ?? null;

  const change = lastPrice && prev10Price
    ? ((lastPrice - prev10Price) / prev10Price) * 100
    : 0;

  const momentum = lastRsi !== null && prevRsi !== null ? lastRsi - prevRsi : 0;

  const trend = deriveTrend(candles, lastRsi);

  return {
    rsi:  lastRsi !== null ? +lastRsi.toFixed(1) : null,
    trend,
    ma20: lastMa20,
    ma50: lastMa50,
    price: lastPrice,
    change: +change.toFixed(2),
    momentum: +momentum.toFixed(1),
    overbought: lastRsi !== null && lastRsi > 70,
    oversold:   lastRsi !== null && lastRsi < 30,
  };
}

// ─── Alignment Summary ──────────────────────────────────────────────────────────

function getAlignmentSummary(analyses: TFAnalysis[]): {
  bullCount:   number;
  bearCount:   number;
  neutralCount: number;
  dominance:   'bull' | 'bear' | 'mixed';
  strength:    number;  // 0-100
} {
  const bullCount    = analyses.filter(a => a.trend === 'strong_bull' || a.trend === 'bull').length;
  const bearCount    = analyses.filter(a => a.trend === 'strong_bear' || a.trend === 'bear').length;
  const neutralCount = analyses.filter(a => a.trend === 'neutral').length;
  const total        = analyses.length;

  const dominance = bullCount > bearCount ? 'bull' : bearCount > bullCount ? 'bear' : 'mixed';
  const strength  = Math.round((Math.max(bullCount, bearCount) / total) * 100);

  return { bullCount, bearCount, neutralCount, dominance, strength };
}

// ─── RSI Arc Gauge ──────────────────────────────────────────────────────────────

function RSIArc({ rsi, overbought, oversold }: { rsi: number | null; overbought: boolean; oversold: boolean }) {
  const val    = rsi ?? 50;
  const pct    = Math.min(Math.max(val, 0), 100) / 100;
  const radius = 14;
  const cx = 18; const cy = 18;
  const startAngle = -210;
  const sweepAngle = 240;

  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const describeArc = (pct: number) => {
    const end = startAngle + sweepAngle * pct;
    const sx = cx + radius * Math.cos(toRad(startAngle));
    const sy = cy + radius * Math.sin(toRad(startAngle));
    const ex = cx + radius * Math.cos(toRad(end));
    const ey = cy + radius * Math.sin(toRad(end));
    const large = sweepAngle * pct > 180 ? 1 : 0;
    return `M ${sx} ${sy} A ${radius} ${radius} 0 ${large} 1 ${ex} ${ey}`;
  };

  const color = overbought ? '#f6465d' : oversold ? '#0ecb81' : val > 55 ? '#0ecb81' : val < 45 ? '#f6465d' : '#f0b90b';

  return (
    <svg width={36} height={28} viewBox="0 0 36 28" className="flex-shrink-0">
      {/* Track */}
      <path
        d={describeArc(1)}
        fill="none" stroke="var(--cv-dash-border)"
        strokeWidth={3} strokeLinecap="round"
      />
      {/* Fill */}
      {rsi !== null && (
        <path
          d={describeArc(pct)}
          fill="none" stroke={color}
          strokeWidth={3} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.4s ease' }}
        />
      )}
      {/* Value text */}
      <text x={cx} y={cy + 4} textAnchor="middle"
        fontSize={7.5} fontWeight="bold"
        fill={rsi !== null ? color : '#848e9c'}
        style={{ userSelect: 'none' }}
      >
        {rsi !== null ? Math.round(val) : '–'}
      </text>
    </svg>
  );
}

// ─── Mini Sparkline ─────────────────────────────────────────────────────────────

function MiniSparkline({ candles, trend }: { candles: Candle[]; trend: Trend }) {
  const last = candles.slice(-20);
  if (last.length < 2) return null;

  const prices = last.map(c => c.close);
  const minP   = Math.min(...prices);
  const maxP   = Math.max(...prices);
  const range  = maxP - minP || 1;

  const W = 52; const H = 20;
  const pts = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * W;
    const y = H - ((p - minP) / range) * H;
    return `${x},${y}`;
  }).join(' ');

  const col = TREND_CFG[trend].dot;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="flex-shrink-0 opacity-80">
      <polyline
        points={pts}
        fill="none"
        stroke={col}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Last point dot */}
      <circle
        cx={W}
        cy={H - ((prices[prices.length - 1] - minP) / range) * H}
        r={2.5}
        fill={col}
      />
    </svg>
  );
}

// ─── Single TF Card ─────────────────────────────────────────────────────────────

interface CardProps {
  analysis:  TFAnalysis;
  candles:   Candle[];
  isActive:  boolean;
  onClick:   () => void;
}

function TFCard({ analysis, candles, isActive, onClick }: CardProps) {
  const { tf, rsi, trend, change, momentum, overbought, oversold } = analysis;
  const cfg = TREND_CFG[trend];
  const changePos = change >= 0;

  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'relative flex flex-col gap-1 px-2 py-2 rounded-xl border transition-all text-left cursor-pointer',
        'min-w-[108px] flex-shrink-0 flex-1',
      )}
      style={{
        background:  isActive ? 'var(--cv-dash-active-bg)' : 'var(--cv-dash-hover-bg)',
        borderColor: isActive ? cfg.border : 'var(--cv-dash-border)',
        ...(isActive ? { boxShadow: `0 0 0 1px ${cfg.border}, 0 4px 16px rgba(0,0,0,0.25)` } : {}),
      }}
    >
      {/* Active glow */}
      {isActive && (
        <div
          className="absolute inset-0 rounded-xl pointer-events-none"
          style={{ background: `radial-gradient(ellipse at 50% 0%, ${cfg.bg} 0%, transparent 70%)` }}
        />
      )}

      {/* ── Row 1: TF label + trend badge ── */}
      <div className="flex items-center justify-between gap-1 relative z-10">
        <span className="text-[11px] font-bold" style={{ color: 'var(--cv-dash-text)' }}>{TF_LABEL[tf]}</span>
        <span
          className="text-[9px] font-bold px-1.5 py-0.5 rounded-full border flex-shrink-0"
          style={{ background: cfg.bg, color: cfg.text, borderColor: cfg.border }}
        >
          {cfg.short} {cfg.label}
        </span>
      </div>

      {/* ── Row 2: RSI Arc + Sparkline ── */}
      <div className="flex items-center justify-between gap-1 relative z-10">
        <RSIArc rsi={rsi} overbought={overbought} oversold={oversold} />
        <MiniSparkline candles={candles} trend={trend} />
      </div>

      {/* ── Row 3: Change + Momentum ── */}
      <div className="flex items-center justify-between gap-1 relative z-10">
        <span
          className="text-[9px] font-semibold tabular-nums"
          style={{ color: changePos ? '#0ecb81' : '#f6465d' }}
        >
          {changePos ? '+' : ''}{change.toFixed(2)}%
        </span>
        <div className="flex items-center gap-0.5">
          <span className="text-[8px]" style={{ color: 'var(--cv-dash-text-tertiary)' }}>RSI Δ</span>
          <span
            className="text-[9px] font-semibold tabular-nums"
            style={{ color: momentum > 0 ? '#0ecb81' : momentum < 0 ? '#f6465d' : '#848e9c' }}
          >
            {momentum > 0 ? '+' : ''}{momentum.toFixed(1)}
          </span>
        </div>
      </div>

      {/* ── Overbought / Oversold warning ── */}
      {(overbought || oversold) && (
        <div
          className="text-[8px] font-bold text-center py-0.5 rounded-md relative z-10"
          style={{
            background: overbought ? 'rgba(246,70,93,0.15)' : 'rgba(14,203,129,0.15)',
            color:      overbought ? '#f6465d'              : '#0ecb81',
          }}
        >
          {overbought ? '⚠ OVERBOUGHT' : '⚠ OVERSOLD'}
        </div>
      )}
    </motion.button>
  );
}

// ─── Alignment Bar ──────────────────────────────────────────────────────────────

function AlignmentBar({ analyses }: { analyses: TFAnalysis[] }) {
  const { bullCount, bearCount, neutralCount, dominance, strength } = getAlignmentSummary(analyses);
  const total = analyses.length;

  const bullW   = (bullCount   / total) * 100;
  const bearW   = (bearCount   / total) * 100;
  const neutW   = (neutralCount / total) * 100;

  const signalText =
    strength >= 86 ? (dominance === 'bull' ? 'Strong Buy Signal' : dominance === 'bear' ? 'Strong Sell Signal' : 'Mixed') :
    strength >= 57 ? (dominance === 'bull' ? 'Buy Signal'        : dominance === 'bear' ? 'Sell Signal'        : 'Mixed') :
    'No Clear Signal';

  const signalColor =
    dominance === 'bull' ? '#0ecb81' :
    dominance === 'bear' ? '#f6465d' : '#f0b90b';

  return (
    <div
      className="flex items-center gap-3 px-3 py-2 border-b flex-shrink-0"
      style={{ background: 'var(--cv-dash-bg)', borderColor: 'var(--cv-dash-divider)' }}
    >
      {/* Label */}
      <span
        className="text-[9px] font-semibold uppercase tracking-wider whitespace-nowrap flex-shrink-0"
        style={{ color: 'var(--cv-dash-text-tertiary)' }}
      >
        TF Alignment
      </span>

      {/* Segmented bar */}
      <div className="flex-1 flex h-2 rounded-full overflow-hidden gap-px min-w-0">
        {bullW > 0 && (
          <div
            className="h-full rounded-l-full transition-all duration-500"
            style={{ width: `${bullW}%`, background: 'linear-gradient(90deg, #0a9e64, #0ecb81)' }}
          />
        )}
        {neutW > 0 && (
          <div
            className="h-full transition-all duration-500"
            style={{ width: `${neutW}%`, background: '#f0b90b88' }}
          />
        )}
        {bearW > 0 && (
          <div
            className="h-full rounded-r-full transition-all duration-500"
            style={{ width: `${bearW}%`, background: 'linear-gradient(90deg, #c73550, #f6465d)' }}
          />
        )}
      </div>

      {/* Counts */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {bullCount > 0 && (
          <span className="text-[9px] font-bold text-[#0ecb81]">
            {bullCount}↑
          </span>
        )}
        {neutralCount > 0 && (
          <span className="text-[9px] font-bold text-[#f0b90b]">
            {neutralCount}→
          </span>
        )}
        {bearCount > 0 && (
          <span className="text-[9px] font-bold text-[#f6465d]">
            {bearCount}↓
          </span>
        )}
      </div>

      {/* Signal pill */}
      <div
        className="text-[9px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap"
        style={{
          background: signalColor + '20',
          color: signalColor,
          border: `1px solid ${signalColor}40`,
        }}
      >
        {signalText}
      </div>
    </div>
  );
}

// ─── Detail Drawer (expands below cards row on click) ──────────────────────────

function TFDetailDrawer({ analysis, candles }: { analysis: TFAnalysis; candles: Candle[] }) {
  const { tf, rsi, trend, ma20, ma50, price, change, momentum, overbought, oversold } = analysis;
  const cfg = TREND_CFG[trend];

  const fmtP = (v: number | null) => {
    if (v === null) return '–';
    if (v > 10000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (v > 100)   return v.toFixed(2);
    if (v > 1)     return v.toFixed(4);
    return v.toFixed(6);
  };

  // MA status
  const maStatus = ma20 !== null && ma50 !== null
    ? ma20 > ma50 ? 'Golden Cross (MA20 > MA50)' : 'Death Cross (MA20 < MA50)'
    : '–';

  const maColor = ma20 !== null && ma50 !== null && ma20 > ma50 ? '#0ecb81' : '#f6465d';

  // Price vs MA20
  const vsMA20 = price !== null && ma20 !== null
    ? ((price - ma20) / ma20) * 100 : null;

  const rows = [
    { label: 'Timeframe',     value: TF_FULL[tf],                                  color: 'var(--cv-dash-text)' },
    { label: 'RSI (14)',      value: rsi !== null ? `${rsi}` : '–',                color: overbought ? '#f6465d' : oversold ? '#0ecb81' : 'var(--cv-dash-text)' },
    { label: 'RSI Momentum',  value: `${momentum > 0 ? '+' : ''}${momentum}`,      color: momentum > 0 ? '#0ecb81' : momentum < 0 ? '#f6465d' : 'var(--cv-dash-text-tertiary)' },
    { label: 'Price (close)', value: fmtP(price),                                  color: 'var(--cv-dash-text)' },
    { label: '10-Bar Change', value: `${change >= 0 ? '+' : ''}${change}%`,        color: change >= 0 ? '#0ecb81' : '#f6465d' },
    { label: 'MA 20',         value: fmtP(ma20),                                  color: '#f0b90b' },
    { label: 'MA 50',         value: fmtP(ma50),                                  color: '#00bcd4' },
    { label: 'MA Status',     value: maStatus,                                     color: maColor },
    { label: 'Price vs MA20', value: vsMA20 !== null ? `${vsMA20 >= 0 ? '+' : ''}${vsMA20.toFixed(2)}%` : '–', color: vsMA20 !== null && vsMA20 >= 0 ? '#0ecb81' : '#f6465d' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="overflow-hidden"
    >
      <div
        className="mx-2 mb-2 rounded-xl border p-3"
        style={{
          background: 'var(--cv-dash-panel-bg)',
          borderColor: cfg.border,
          boxShadow: `0 4px 20px rgba(0,0,0,0.18), 0 0 0 1px ${cfg.border}`,
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-2.5">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.dot }} />
          <span className="text-[11px] font-bold" style={{ color: 'var(--cv-dash-text)' }}>{TF_FULL[tf]} Analysis</span>
          <span
            className="ml-auto text-[9px] font-bold px-2 py-0.5 rounded-full border"
            style={{ background: cfg.bg, color: cfg.text, borderColor: cfg.border }}
          >
            {cfg.label}
          </span>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {rows.map(r => (
            <div key={r.label} className="flex items-center justify-between gap-2">
              <span className="text-[9px] truncate" style={{ color: 'var(--cv-dash-text-tertiary)' }}>{r.label}</span>
              <span className="text-[9px] font-semibold tabular-nums" style={{ color: r.color }}>
                {r.value}
              </span>
            </div>
          ))}
        </div>

        {/* RSI bar */}
        {rsi !== null && (
          <div className="mt-2.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[8px]" style={{ color: 'var(--cv-dash-text-tertiary)' }}>RSI Zone</span>
              <div className="flex items-center gap-2 text-[8px]">
                <span className="text-[#f6465d]">OB 70</span>
                <span className="text-[#f0b90b]">50</span>
                <span className="text-[#0ecb81]">OS 30</span>
              </div>
            </div>
            <div className="relative h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--cv-dash-border)' }}>
              {/* Zone markers */}
              <div className="absolute inset-y-0 left-[30%] w-px bg-[#0ecb81]/30" />
              <div className="absolute inset-y-0 left-[50%] w-px bg-[#f0b90b]/30" />
              <div className="absolute inset-y-0 left-[70%] w-px bg-[#f6465d]/30" />
              {/* Fill */}
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                style={{
                  width: `${rsi}%`,
                  background: overbought
                    ? 'linear-gradient(90deg, #f0b90b, #f6465d)'
                    : oversold
                    ? 'linear-gradient(90deg, #0ecb81, #f0b90b)'
                    : 'linear-gradient(90deg, #f0b90b, #0ecb81)',
                }}
              />
              {/* Thumb */}
              <div
                className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full border border-white/40 shadow"
                style={{
                  left: `calc(${rsi}% - 4px)`,
                  background: overbought ? '#f6465d' : oversold ? '#0ecb81' : '#f0b90b',
                }}
              />
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Main Panel ────────────────────────────────────────────────────────────────

interface Props {
  basePrice:    number;
  currentPrice: number;
  activeTF:     Timeframe;
  onTFClick?:   (tf: Timeframe) => void;
  /** Candles the host chart is actually rendering for `activeTF`. When
   * provided, the active timeframe's card/analysis is computed from these
   * REAL chart candles instead of an independently generated random series —
   * previously TradingChart passed this prop but the panel silently dropped
   * it (it wasn't declared), so the MTF card for e.g. "1h" could show a
   * bearish trend while the main 1h chart was clearly bullish. */
  sharedCandles?: Candle[];
}

// Per-TF candle cache: regenerate only when basePrice changes
type CandleCache = Partial<Record<Timeframe, Candle[]>>;

export function MultiTimeframePanel({ basePrice, currentPrice, activeTF, onTFClick, sharedCandles }: Props) {
  const [candleCache, setCandleCache] = useState<CandleCache>({});
  const [expandedTF,  setExpandedTF]  = useState<Timeframe | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Generate candles for all TFs on mount / basePrice change ──────────────
  useEffect(() => {
    const cache: CandleCache = {};
    for (const tf of TIMEFRAMES) {
      cache[tf] = generateCandles(basePrice, tf, 120);
    }
    setCandleCache(cache);
  }, [basePrice]);

  // ── Tick the current candle with live price ────────────────────────────────
  useEffect(() => {
    if (currentPrice === 0 || Object.keys(candleCache).length === 0) return;
    setCandleCache(prev => {
      const next = { ...prev };
      for (const tf of TIMEFRAMES) {
        if (next[tf] && next[tf]!.length > 0) {
          next[tf] = tickCandles(next[tf]!, currentPrice, tf);
        }
      }
      return next;
    });
  }, [currentPrice]);

  // ── Effective cache: active TF uses the host chart's real candles ─────────
  const effectiveCache: CandleCache = useMemo(() => {
    if (!sharedCandles || sharedCandles.length === 0) return candleCache;
    return { ...candleCache, [activeTF]: sharedCandles };
  }, [candleCache, sharedCandles, activeTF]);

  // ── Compute analyses ───────────────────────────────────────────────────────
  const analyses: TFAnalysis[] = useMemo(() => {
    return TIMEFRAMES.map(tf => ({
      tf,
      ...analyseTimeframe(effectiveCache[tf] ?? []),
    }));
  }, [effectiveCache]);

  const handleCardClick = (tf: Timeframe) => {
    setExpandedTF(prev => prev === tf ? null : tf);
    onTFClick?.(tf);
  };

  const expandedAnalysis = expandedTF ? analyses.find(a => a.tf === expandedTF) : null;
  const expandedCandles  = expandedTF ? (effectiveCache[expandedTF] ?? []) : [];

  return (
    <div
      className="flex flex-col border-t flex-shrink-0"
      style={{ background: 'var(--cv-dash-panel-bg)', borderColor: 'var(--cv-dash-divider)' }}
    >
      {/* ── Header row ── */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b" style={{ borderColor: 'var(--cv-dash-divider)' }}>
        <div className="flex items-center gap-2">
          {/* Animated dot */}
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#9945FF] opacity-50" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#9945FF]" />
          </span>
          <span className="text-[10px] font-bold tracking-wide uppercase" style={{ color: 'var(--cv-dash-text)' }}>
            Multi-Timeframe Analysis
          </span>
          <span className="text-[9px]" style={{ color: 'var(--cv-dash-text-tertiary)' }}>· RSI + Trend · all 7 frames</span>
        </div>
        <button
          onClick={() => setIsCollapsed(v => !v)}
          className="transition-colors p-1 rounded"
          style={{ color: 'var(--cv-dash-text-tertiary)' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--cv-dash-text)'; e.currentTarget.style.background = 'var(--cv-dash-hover-bg)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--cv-dash-text-tertiary)'; e.currentTarget.style.background = 'transparent'; }}
          title={isCollapsed ? 'Expand' : 'Collapse'}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            {isCollapsed
              ? <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              : <path d="M2 8l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            }
          </svg>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            key="mtf-body"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            {/* ── Alignment bar ── */}
            <AlignmentBar analyses={analyses} />

            {/* ── Cards scroll row ── */}
            <div
              ref={scrollRef}
              className="flex gap-2 px-2 py-2 overflow-x-auto scrollbar-thin scrollbar-thumb-white/10"
            >
              {TIMEFRAMES.map(tf => {
                const a = analyses.find(x => x.tf === tf)!;
                const c = effectiveCache[tf] ?? [];
                return (
                  <TFCard
                    key={tf}
                    analysis={a}
                    candles={c}
                    isActive={expandedTF === tf}
                    onClick={() => handleCardClick(tf)}
                  />
                );
              })}
            </div>

            {/* ── Detail drawer (animated expand) ── */}
            <AnimatePresence>
              {expandedAnalysis && (
                <TFDetailDrawer
                  key={expandedTF}
                  analysis={expandedAnalysis}
                  candles={expandedCandles}
                />
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
