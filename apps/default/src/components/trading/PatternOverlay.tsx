import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Candle } from '@/lib/marketEngine';

// ─── Pattern Types ─────────────────────────────────────────────────────────────

export type PatternKind =
  | 'doji'
  | 'hammer'
  | 'inverted_hammer'
  | 'shooting_star'
  | 'bullish_engulfing'
  | 'bearish_engulfing'
  | 'morning_star'
  | 'evening_star'
  | 'spinning_top'
  | 'marubozu_bull'
  | 'marubozu_bear';

export type PatternBias = 'bullish' | 'bearish' | 'neutral';

export interface PatternMatch {
  kind:        PatternKind;
  bias:        PatternBias;
  label:       string;
  shortLabel:  string;
  description: string;
  /** index of the primary (last) candle in `visible` array */
  candleIdx:   number;
  /** reliability score 1-5 */
  strength:    number;
}

// ─── Colour palette per bias ───────────────────────────────────────────────────

const BIAS_COLOR: Record<PatternBias, { fill: string; stroke: string; text: string; glow: string }> = {
  bullish: { fill: 'rgba(14,203,129,0.18)', stroke: '#0ecb81', text: '#0ecb81', glow: 'rgba(14,203,129,0.35)' },
  bearish: { fill: 'rgba(246,70,93,0.18)',  stroke: '#f6465d', text: '#f6465d', glow: 'rgba(246,70,93,0.35)'  },
  neutral: { fill: 'rgba(240,185,11,0.18)', stroke: '#f0b90b', text: '#f0b90b', glow: 'rgba(240,185,11,0.35)' },
};

// ─── Detection Helpers ─────────────────────────────────────────────────────────

function bodySize(c: Candle)  { return Math.abs(c.close - c.open); }
function range(c: Candle)     { return c.high - c.low || 0.0001; }
function upperWick(c: Candle) { return c.high - Math.max(c.open, c.close); }
function lowerWick(c: Candle) { return Math.min(c.open, c.close) - c.low; }
function isBull(c: Candle)    { return c.close > c.open; }
function isBear(c: Candle)    { return c.close < c.open; }
function midpoint(c: Candle)  { return (c.open + c.close) / 2; }

// ─── Pattern Detectors ────────────────────────────────────────────────────────

function detectDoji(c: Candle): boolean {
  const body  = bodySize(c);
  const total = range(c);
  return body / total < 0.1 && total > 0;
}

function detectSpinningTop(c: Candle): boolean {
  const body  = bodySize(c);
  const total = range(c);
  const ratio = body / total;
  const uw    = upperWick(c);
  const lw    = lowerWick(c);
  return ratio >= 0.1 && ratio <= 0.35 && uw > body && lw > body;
}

function detectHammer(c: Candle): boolean {
  const body = bodySize(c);
  const lw   = lowerWick(c);
  const uw   = upperWick(c);
  const tot  = range(c);
  return lw >= body * 2 && uw < body * 0.5 && body / tot > 0.05;
}

function detectInvertedHammer(c: Candle): boolean {
  const body = bodySize(c);
  const uw   = upperWick(c);
  const lw   = lowerWick(c);
  const tot  = range(c);
  return uw >= body * 2 && lw < body * 0.5 && body / tot > 0.05;
}

function detectShootingStar(c: Candle, prev: Candle): boolean {
  // Shooting star: bearish inverted hammer after uptrend
  const trendUp = prev.close > prev.open;
  return trendUp && detectInvertedHammer(c) && isBear(c);
}

function detectBullishEngulfing(prev: Candle, curr: Candle): boolean {
  return (
    isBear(prev) &&
    isBull(curr) &&
    curr.open  < prev.close &&
    curr.close > prev.open
  );
}

function detectBearishEngulfing(prev: Candle, curr: Candle): boolean {
  return (
    isBull(prev) &&
    isBear(curr) &&
    curr.open  > prev.close &&
    curr.close < prev.open
  );
}

function detectMoringStar(a: Candle, b: Candle, c: Candle): boolean {
  const bigBear   = isBear(a) && bodySize(a) > range(a) * 0.5;
  const smallBody = bodySize(b) / range(b) < 0.35;
  const bigBull   = isBull(c) && bodySize(c) > range(c) * 0.5;
  const gapDown   = Math.max(b.open, b.close) < a.close; // b gaps below a's close
  const recovers  = c.close > midpoint(a);
  return bigBear && smallBody && gapDown && bigBull && recovers;
}

function detectEveningStar(a: Candle, b: Candle, c: Candle): boolean {
  const bigBull   = isBull(a) && bodySize(a) > range(a) * 0.5;
  const smallBody = bodySize(b) / range(b) < 0.35;
  const bigBear   = isBear(c) && bodySize(c) > range(c) * 0.5;
  const gapUp     = Math.min(b.open, b.close) > a.close;
  const drops     = c.close < midpoint(a);
  return bigBull && smallBody && gapUp && bigBear && drops;
}

function detectMarubozuBull(c: Candle): boolean {
  const uw = upperWick(c);
  const lw = lowerWick(c);
  const tot = range(c);
  return isBull(c) && uw / tot < 0.02 && lw / tot < 0.02 && bodySize(c) / tot > 0.95;
}

function detectMarubozuBear(c: Candle): boolean {
  const uw = upperWick(c);
  const lw = lowerWick(c);
  const tot = range(c);
  return isBear(c) && uw / tot < 0.02 && lw / tot < 0.02 && bodySize(c) / tot > 0.95;
}

// ─── Main Pattern Scanner ─────────────────────────────────────────────────────

export function scanPatterns(candles: Candle[]): PatternMatch[] {
  const results: PatternMatch[] = [];

  for (let i = 0; i < candles.length; i++) {
    const c    = candles[i];
    const prev = i > 0 ? candles[i - 1] : null;
    const prev2= i > 1 ? candles[i - 2] : null;

    // ── Single-candle patterns ─────────────────────────────────────────

    if (detectDoji(c)) {
      results.push({
        kind: 'doji', bias: 'neutral', candleIdx: i, strength: 3,
        label: 'Doji', shortLabel: 'DJ',
        description: 'Opening and closing prices are nearly equal — market indecision. Watch for a reversal signal.',
      });
      continue; // doji is exclusive — don't stack more single-candle patterns
    }

    if (detectSpinningTop(c)) {
      results.push({
        kind: 'spinning_top', bias: 'neutral', candleIdx: i, strength: 2,
        label: 'Spinning Top', shortLabel: 'ST',
        description: 'Small body with long wicks on both sides — indecision between buyers and sellers.',
      });
    }

    if (detectMarubozuBull(c)) {
      results.push({
        kind: 'marubozu_bull', bias: 'bullish', candleIdx: i, strength: 4,
        label: 'Bull Marubozu', shortLabel: 'MB↑',
        description: 'Strong bullish candle with no wicks — buyers in full control from open to close.',
      });
    }

    if (detectMarubozuBear(c)) {
      results.push({
        kind: 'marubozu_bear', bias: 'bearish', candleIdx: i, strength: 4,
        label: 'Bear Marubozu', shortLabel: 'MB↓',
        description: 'Strong bearish candle with no wicks — sellers in full control from open to close.',
      });
    }

    if (prev && !detectMarubozuBull(c) && !detectMarubozuBear(c)) {
      if (detectShootingStar(c, prev)) {
        results.push({
          kind: 'shooting_star', bias: 'bearish', candleIdx: i, strength: 3,
          label: 'Shooting Star', shortLabel: 'SS',
          description: 'Long upper wick after an uptrend — buyers pushed prices up but sellers took control.',
        });
      } else if (detectHammer(c) && isBull(c)) {
        results.push({
          kind: 'hammer', bias: 'bullish', candleIdx: i, strength: 3,
          label: 'Hammer', shortLabel: 'HM',
          description: 'Long lower wick with small body near the top — sellers tried but buyers pushed back strongly.',
        });
      } else if (detectInvertedHammer(c) && isBull(c)) {
        results.push({
          kind: 'inverted_hammer', bias: 'bullish', candleIdx: i, strength: 2,
          label: 'Inverted Hammer', shortLabel: 'IH',
          description: 'Long upper wick, small body near bottom — potential bullish reversal after a downtrend.',
        });
      }
    }

    // ── Two-candle patterns ────────────────────────────────────────────

    if (prev) {
      if (detectBullishEngulfing(prev, c)) {
        results.push({
          kind: 'bullish_engulfing', bias: 'bullish', candleIdx: i, strength: 5,
          label: 'Bullish Engulfing', shortLabel: 'BE↑',
          description: 'A large green candle fully engulfs the prior red candle — strong reversal signal indicating buyers have taken control.',
        });
      }

      if (detectBearishEngulfing(prev, c)) {
        results.push({
          kind: 'bearish_engulfing', bias: 'bearish', candleIdx: i, strength: 5,
          label: 'Bearish Engulfing', shortLabel: 'BE↓',
          description: 'A large red candle fully engulfs the prior green candle — strong reversal signal indicating sellers have taken control.',
        });
      }
    }

    // ── Three-candle patterns ──────────────────────────────────────────

    if (prev && prev2) {
      if (detectMoringStar(prev2, prev, c)) {
        results.push({
          kind: 'morning_star', bias: 'bullish', candleIdx: i, strength: 5,
          label: 'Morning Star', shortLabel: 'MS',
          description: 'Three-candle bullish reversal: large red → small indecision → large green. Strong bottom reversal signal.',
        });
      }

      if (detectEveningStar(prev2, prev, c)) {
        results.push({
          kind: 'evening_star', bias: 'bearish', candleIdx: i, strength: 5,
          label: 'Evening Star', shortLabel: 'ES',
          description: 'Three-candle bearish reversal: large green → small indecision → large red. Strong top reversal signal.',
        });
      }
    }
  }

  // Deduplicate: if multiple patterns land on the same candle, keep the highest-strength one
  const byIdx = new Map<number, PatternMatch>();
  for (const p of results) {
    const existing = byIdx.get(p.candleIdx);
    if (!existing || p.strength > existing.strength) {
      byIdx.set(p.candleIdx, p);
    }
  }

  return Array.from(byIdx.values()).sort((a, b) => a.candleIdx - b.candleIdx);
}

// ─── Strength Stars ───────────────────────────────────────────────────────────

function StrengthDots({ strength, color }: { strength: number; color: string }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className="w-1 h-1 rounded-full inline-block"
          style={{ background: i < strength ? color : 'rgba(255,255,255,0.15)' }}
        />
      ))}
    </div>
  );
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

interface TooltipProps {
  pattern:  PatternMatch;
  x:        number;
  y:        number;
  svgW:     number;
}

function PatternTooltip({ pattern, x, y, svgW }: TooltipProps) {
  const col  = BIAS_COLOR[pattern.bias];
  // flip to the left if near right edge
  const left = x + 170 > svgW ? x - 178 : x + 10;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 4 }}
      animate={{ opacity: 1, scale: 1,    y: 0 }}
      exit={   { opacity: 0, scale: 0.92, y: 4 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="absolute z-50 pointer-events-none"
      style={{ left, top: Math.max(4, y - 4) }}
    >
      <div
        className="rounded-xl border px-3 py-2.5 shadow-2xl backdrop-blur-md"
        style={{
          minWidth: 168,
          background: 'rgba(18,20,26,0.97)',
          borderColor: col.stroke + '55',
          boxShadow: `0 8px 32px rgba(0,0,0,0.7), 0 0 0 1px ${col.stroke}22`,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="text-[12px] font-bold" style={{ color: col.text }}>
            {pattern.label}
          </span>
          <span
            className="px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider"
            style={{ background: col.fill, color: col.text }}
          >
            {pattern.bias}
          </span>
        </div>

        {/* Strength */}
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-[9px] text-[#848e9c]">Strength</span>
          <StrengthDots strength={pattern.strength} color={col.text} />
        </div>

        {/* Divider */}
        <div className="h-px mb-2" style={{ background: col.stroke + '30' }} />

        {/* Description */}
        <p className="text-[10px] leading-[1.45] text-[#a0a6b5]">
          {pattern.description}
        </p>
      </div>
    </motion.div>
  );
}

// ─── SVG Badge ────────────────────────────────────────────────────────────────
// Rendered inside the CandlestickSVG — uses same coordinate space

interface BadgeProps {
  pattern:   PatternMatch;
  cx:        number;          // centre-x of the candle
  anchorY:   number;          // tip of the badge arrow (high or low of candle)
  above:     boolean;         // badge above the candle?
  isHovered: boolean;
  onEnter:   () => void;
  onLeave:   () => void;
}

// Badge dimensions
const BW = 28;   // width
const BH = 14;   // height
const AR = 4;    // arrow height

function PatternBadgeSVG({
  pattern, cx, anchorY, above, isHovered, onEnter, onLeave,
}: BadgeProps) {
  const col = BIAS_COLOR[pattern.bias];
  const BY  = above ? anchorY - AR - BH - 4 : anchorY + AR + 4;

  // Arrow polygon points (pointing toward the candle)
  const arrowPts = above
    ? `${cx},${anchorY - 2} ${cx - 4},${BY + BH} ${cx + 4},${BY + BH}`
    : `${cx},${anchorY + 2} ${cx - 4},${BY}      ${cx + 4},${BY}`;

  return (
    <g
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{ cursor: 'default' }}
    >
      {/* Glow ring on hover */}
      {isHovered && (
        <ellipse
          cx={cx}
          cy={above ? BY + BH / 2 : BY + BH / 2}
          rx={BW / 2 + 5}
          ry={BH / 2 + 5}
          fill={col.glow}
          style={{ filter: `blur(6px)` }}
        />
      )}

      {/* Arrow */}
      <polygon points={arrowPts} fill={col.stroke} opacity={isHovered ? 0.9 : 0.6} />

      {/* Badge body */}
      <rect
        x={cx - BW / 2}
        y={BY}
        width={BW}
        height={BH}
        rx={3}
        fill={isHovered ? col.stroke : col.fill}
        stroke={col.stroke}
        strokeWidth={isHovered ? 0 : 1}
        opacity={isHovered ? 0.95 : 0.85}
      />

      {/* Label text */}
      <text
        x={cx}
        y={BY + BH / 2 + 3.5}
        textAnchor="middle"
        fontSize={7.5}
        fontWeight="bold"
        fill={isHovered ? '#fff' : col.text}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {pattern.shortLabel}
      </text>

      {/* Strength dot strip (top of badge) */}
      {pattern.strength >= 4 && (
        <circle cx={cx + BW / 2 - 3} cy={BY + 2.5} r={1.5} fill={col.stroke} opacity={0.9} />
      )}
      {pattern.strength === 5 && (
        <circle cx={cx + BW / 2 - 7} cy={BY + 2.5} r={1.5} fill={col.stroke} opacity={0.7} />
      )}
    </g>
  );
}

// ─── Legend Panel ─────────────────────────────────────────────────────────────

const LEGEND_ITEMS: { bias: PatternBias; label: string }[] = [
  { bias: 'bullish', label: 'Bullish' },
  { bias: 'bearish', label: 'Bearish' },
  { bias: 'neutral', label: 'Neutral' },
];

interface LegendProps {
  patterns:    PatternMatch[];
  onlyBias:    PatternBias | 'all';
  onFilterBias: (b: PatternBias | 'all') => void;
  visible:     boolean;
}

function PatternLegend({ patterns, onlyBias, onFilterBias, visible }: LegendProps) {
  const counts = {
    bullish: patterns.filter(p => p.bias === 'bullish').length,
    bearish: patterns.filter(p => p.bias === 'bearish').length,
    neutral: patterns.filter(p => p.bias === 'neutral').length,
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="pattern-legend"
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 8 }}
          transition={{ duration: 0.2 }}
          className="absolute bottom-7 left-2 z-20 pointer-events-auto"
        >
          <div
            className="rounded-xl border border-white/8 px-2.5 py-2 backdrop-blur-sm space-y-1.5"
            style={{ background: 'rgba(18,20,26,0.88)', minWidth: 130 }}
          >
            <div className="text-[9px] text-[#848e9c] font-semibold uppercase tracking-wider mb-1">
              Patterns ({patterns.length})
            </div>

            {/* All filter */}
            <button
              onClick={() => onFilterBias('all')}
              className={cn(
                'w-full flex items-center justify-between px-1.5 py-0.5 rounded text-[9px] transition-colors',
                onlyBias === 'all'
                  ? 'bg-white/10 text-[#eaecef]'
                  : 'text-[#848e9c] hover:text-[#eaecef]',
              )}
            >
              <span>All patterns</span>
              <span className="font-bold text-[#eaecef]">{patterns.length}</span>
            </button>

            {/* Per-bias filters */}
            {LEGEND_ITEMS.map(({ bias, label }) => {
              const col = BIAS_COLOR[bias];
              const cnt = counts[bias];
              return (
                <button
                  key={bias}
                  onClick={() => onFilterBias(onlyBias === bias ? 'all' : bias)}
                  className={cn(
                    'w-full flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[9px] transition-all',
                    onlyBias === bias ? 'bg-white/8' : 'hover:bg-white/5',
                    cnt === 0 && 'opacity-40 pointer-events-none',
                  )}
                >
                  <span
                    className="w-2 h-2 rounded-sm flex-shrink-0"
                    style={{ background: col.stroke, opacity: 0.85 }}
                  />
                  <span style={{ color: col.text }}>{label}</span>
                  <span className="ml-auto font-bold" style={{ color: col.text }}>{cnt}</span>
                </button>
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Toggle Button ─────────────────────────────────────────────────────────────

interface ToggleProps {
  active:   boolean;
  count:    number;
  onToggle: () => void;
}

function PatternToggleButton({ active, count, onToggle }: ToggleProps) {
  return (
    <button
      onClick={onToggle}
      title={active ? 'Hide pattern overlays' : 'Show pattern overlays'}
      className={cn(
        'flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-semibold transition-all backdrop-blur-sm',
        active
          ? 'bg-[#9945FF]/15 border-[#9945FF]/40 text-[#9945FF] hover:bg-[#9945FF]/25'
          : 'bg-[#1e2026]/90 border-white/8 text-[#848e9c] hover:text-[#eaecef] hover:border-white/20',
      )}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M6 1L7.5 4.5H11L8 6.8L9.2 10.5L6 8.2L2.8 10.5L4 6.8L1 4.5H4.5L6 1Z"
              fill="currentColor" opacity={active ? 1 : 0.7} />
      </svg>
      Patterns
      {active && count > 0 && (
        <span
          className="ml-0.5 px-1 py-0.5 rounded-full text-[8px] font-bold leading-none"
          style={{ background: 'rgba(153,69,255,0.3)', color: '#bf7fff' }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ─── Main SVG Overlay ─────────────────────────────────────────────────────────
// Rendered as <g> elements INSIDE CandlestickSVG so it shares the exact coordinate system.

export interface PatternSVGLayerProps {
  patterns:    PatternMatch[];
  visibleLen:  number;       // number of candles visible (up to 80)
  /** toX(i) and toY(p) must match CandlestickSVG exactly */
  toX:         (i: number) => number;
  toY:         (p: number) => number;
  candles:     Candle[];     // visible slice
  svgW:        number;
  onHover:     (p: PatternMatch | null, x: number, y: number) => void;
  filterBias:  PatternBias | 'all';
}

export function PatternSVGLayer({
  patterns, visibleLen, toX, toY, candles, svgW, onHover, filterBias,
}: PatternSVGLayerProps) {
  const [hoveredKind, setHoveredKind] = useState<string | null>(null);

  const filtered = filterBias === 'all'
    ? patterns
    : patterns.filter(p => p.bias === filterBias);

  return (
    <>
      {filtered.map((p) => {
        const i = p.candleIdx;
        if (i < 0 || i >= candles.length) return null;

        const candle  = candles[i];
        const cx      = toX(i);
        const highY   = toY(candle.high);
        const lowY    = toY(candle.low);
        const isHov   = hoveredKind === `${p.kind}-${i}`;

        // Alternate: bullish → below, bearish → above, neutral → above
        const above = p.bias === 'bearish' || p.bias === 'neutral';
        const anchorY = above ? highY : lowY;

        return (
          <PatternBadgeSVG
            key={`${p.kind}-${i}`}
            pattern={p}
            cx={cx}
            anchorY={anchorY}
            above={above}
            isHovered={isHov}
            onEnter={() => {
              setHoveredKind(`${p.kind}-${i}`);
              onHover(p, cx, above ? highY - 30 : lowY + 10);
            }}
            onLeave={() => {
              setHoveredKind(null);
              onHover(null, 0, 0);
            }}
          />
        );
      })}
    </>
  );
}

// ─── HTML Overlay (tooltip + legend + toggle) ─────────────────────────────────
// Absolutely positioned over the chart container — does NOT affect SVG coordinates.

export interface PatternOverlayProps {
  candles:       Candle[];
  visible:       boolean;
  onToggle:      () => void;
  svgW:          number;
  svgH:          number;
  filterBias:    PatternBias | 'all';
  onFilterBias:  (b: PatternBias | 'all') => void;
  /** Externally provided patterns (already computed) */
  patterns:      PatternMatch[];
}

export function PatternOverlay({
  candles, visible, onToggle, svgW, svgH,
  filterBias, onFilterBias, patterns,
}: PatternOverlayProps) {
  const [hoveredPattern, setHoveredPattern] = useState<PatternMatch | null>(null);
  const [tooltipPos, setTooltipPos]         = useState({ x: 0, y: 0 });

  const handleHover = useCallback((p: PatternMatch | null, x: number, y: number) => {
    setHoveredPattern(p);
    setTooltipPos({ x, y });
  }, []);

  return (
    <>
      {/* ── Toggle button (top-left) ── */}
      <div className="absolute top-2 left-2 z-30">
        <PatternToggleButton
          active={visible}
          count={patterns.length}
          onToggle={onToggle}
        />
      </div>

      {/* ── Legend ── */}
      <PatternLegend
        patterns={patterns}
        onlyBias={filterBias}
        onFilterBias={onFilterBias}
        visible={visible}
      />

      {/* ── Tooltip ── */}
      <AnimatePresence>
        {visible && hoveredPattern && (
          <PatternTooltip
            key={`tt-${hoveredPattern.kind}-${hoveredPattern.candleIdx}`}
            pattern={hoveredPattern}
            x={tooltipPos.x}
            y={tooltipPos.y}
            svgW={svgW}
          />
        )}
      </AnimatePresence>
    </>
  );
}

// Re-export hook for CandlestickSVG to consume
export { BIAS_COLOR };
