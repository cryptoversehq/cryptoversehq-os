import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Candle } from '@/lib/marketEngine';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PriceBin {
  priceLevel: number;   // bottom of this bucket
  priceTop:   number;   // top    of this bucket
  volume:     number;   // total volume in this bucket
  buyVolume:  number;   // bullish-candle volume
  sellVolume: number;   // bearish-candle volume
  isPOC:      boolean;  // Point of Control (highest volume)
  inVA:       boolean;  // inside Value Area (70% of volume)
}

interface CoordSystem {
  yMin:   number;
  yMax:   number;
  yRange: number;
  padT:   number;
  padB:   number;
  chartH: number;
  height: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildProfile(candles: Candle[], numBins: number): PriceBin[] {
  if (candles.length === 0) return [];

  const highs  = candles.map(c => c.high);
  const lows   = candles.map(c => c.low);
  const priceMin = Math.min(...lows);
  const priceMax = Math.max(...highs);
  const range    = priceMax - priceMin || 1;
  const binSize  = range / numBins;

  // Initialise buckets
  const bins: Omit<PriceBin, 'isPOC' | 'inVA'>[] = Array.from({ length: numBins }, (_, i) => ({
    priceLevel: priceMin + i * binSize,
    priceTop:   priceMin + (i + 1) * binSize,
    volume:     0,
    buyVolume:  0,
    sellVolume: 0,
  }));

  // Distribute each candle's volume across bins it spans
  for (const c of candles) {
    const isBull  = c.close >= c.open;
    const candleH = c.high - c.low || 0.000001;

    for (let i = 0; i < numBins; i++) {
      const binLow  = bins[i].priceLevel;
      const binHigh = bins[i].priceTop;

      // Overlap between candle range and bin range
      const overlapLow  = Math.max(c.low,  binLow);
      const overlapHigh = Math.min(c.high, binHigh);
      if (overlapHigh <= overlapLow) continue;

      const fraction = (overlapHigh - overlapLow) / candleH;
      const vol      = c.volume * fraction;

      bins[i].volume     += vol;
      if (isBull) bins[i].buyVolume  += vol;
      else        bins[i].sellVolume += vol;
    }
  }

  // Find POC
  const maxVol = Math.max(...bins.map(b => b.volume));
  const pocIdx = bins.findIndex(b => b.volume === maxVol);

  // Value Area — 70% of total volume around POC
  const totalVol   = bins.reduce((s, b) => s + b.volume, 0);
  const vaTarget   = totalVol * 0.70;
  let   vaVol      = bins[pocIdx]?.volume ?? 0;
  let   vaLow      = pocIdx;
  let   vaHigh     = pocIdx;

  while (vaVol < vaTarget) {
    const nextLow  = vaLow  > 0            ? bins[vaLow  - 1].volume : 0;
    const nextHigh = vaHigh < numBins - 1  ? bins[vaHigh + 1].volume : 0;
    if (nextLow === 0 && nextHigh === 0) break;
    if (nextHigh >= nextLow) { vaHigh++; vaVol += nextHigh; }
    else                     { vaLow--;  vaVol += nextLow;  }
  }

  return bins.map((b, i) => ({
    ...b,
    isPOC: i === pocIdx,
    inVA:  i >= vaLow && i <= vaHigh,
  }));
}

function toY(cs: CoordSystem, price: number): number {
  return cs.padT + ((cs.yMax - price) / cs.yRange) * cs.chartH;
}

function fmtPrice(p: number): string {
  if (p >= 10_000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (p >= 100)    return p.toFixed(2);
  if (p >= 1)      return p.toFixed(4);
  return p.toFixed(6);
}

function fmtVol(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(1)}K`;
  return v.toFixed(0);
}

// ─── VolumeProfileSVG ─────────────────────────────────────────────────────────
// Rendered as SVG so it can be absolutely positioned over the candle chart and
// share the exact same Y-axis coordinate system.

interface SVGProps {
  bins:     PriceBin[];
  cs:       CoordSystem;
  panelW:   number;   // width of the profile panel in px (right-side)
  offsetX:  number;   // left edge of the panel in the SVG coordinate space
  maxVol:   number;
  hovered:  number | null;
  onHover:  (idx: number | null) => void;
}

function VolumeProfileSVG({ bins, cs, panelW, offsetX, maxVol, hovered, onHover }: SVGProps) {
  if (bins.length === 0) return null;
  const barMaxW = panelW - 2;  // leave 2px gap on left

  return (
    <g>
      {bins.map((bin, i) => {
        const yTop    = toY(cs, bin.priceTop);
        const yBot    = toY(cs, bin.priceLevel);
        const barH    = Math.max(1, yBot - yTop);
        const barW    = maxVol > 0 ? (bin.volume / maxVol) * barMaxW : 0;
        const buyW    = maxVol > 0 ? (bin.buyVolume  / maxVol) * barMaxW : 0;
        const sellW   = maxVol > 0 ? (bin.sellVolume / maxVol) * barMaxW : 0;
        const isHov   = hovered === i;

        // Colour hierarchy: POC → Value Area → normal
        const baseOpacity = bin.isPOC ? 0.90 : bin.inVA ? 0.55 : 0.28;

        return (
          <g
            key={i}
            onMouseEnter={() => onHover(i)}
            onMouseLeave={() => onHover(null)}
            style={{ cursor: 'default' }}
          >
            {/* Background row highlight on hover */}
            {isHov && (
              <rect
                x={offsetX} y={yTop}
                width={panelW} height={barH}
                fill="rgba(255,255,255,0.06)"
              />
            )}

            {/* Value Area background glow */}
            {bin.inVA && !bin.isPOC && (
              <rect
                x={offsetX} y={yTop}
                width={panelW} height={barH}
                fill="#00bcd4" opacity={0.04}
              />
            )}

            {/* Sell volume (red, behind) */}
            <rect
              x={offsetX + 2} y={yTop + 0.5}
              width={sellW} height={Math.max(0.5, barH - 1)}
              fill="#f6465d" opacity={baseOpacity * 0.85}
              rx={1}
            />

            {/* Buy volume (green, in front — stacked from left) */}
            <rect
              x={offsetX + 2} y={yTop + 0.5}
              width={buyW} height={Math.max(0.5, barH - 1)}
              fill="#0ecb81" opacity={baseOpacity}
              rx={1}
            />

            {/* POC highlight bar */}
            {bin.isPOC && (
              <>
                <rect
                  x={offsetX} y={yTop}
                  width={panelW} height={barH}
                  fill="#f0b90b" opacity={0.08}
                />
                {/* POC marker line at left edge */}
                <line
                  x1={offsetX} y1={yTop + barH / 2}
                  x2={offsetX + barW + 2} y2={yTop + barH / 2}
                  stroke="#f0b90b" strokeWidth={1.5} opacity={0.9}
                  strokeDasharray="3 2"
                />
              </>
            )}

            {/* POC label */}
            {bin.isPOC && barH > 6 && (
              <text
                x={offsetX + 4}
                y={yTop + barH / 2 + 3.5}
                fontSize={8}
                fill="#f0b90b"
                fontWeight="bold"
                style={{ pointerEvents: 'none' }}
              >
                POC
              </text>
            )}
          </g>
        );
      })}

      {/* Separator line between chart and profile */}
      <line
        x1={offsetX - 1} y1={cs.padT}
        x2={offsetX - 1} y2={cs.padT + cs.chartH}
        stroke="rgba(255,255,255,0.08)" strokeWidth={1}
      />
    </g>
  );
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

interface TooltipProps {
  bin: PriceBin;
  totalVol: number;
  x: number;
  y: number;
}

function BinTooltip({ bin, totalVol, x, y }: TooltipProps) {
  const pct = totalVol > 0 ? ((bin.volume / totalVol) * 100).toFixed(1) : '0.0';
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.1 }}
      className="absolute z-50 pointer-events-none"
      style={{ left: Math.max(8, x - 180), top: Math.max(8, y - 8) }}
    >
      <div
        className="bg-card border border-border rounded-xl px-3 py-2 shadow-lg"
        style={{ minWidth: 170 }}
      >
        {/* Price range */}
        <div className="text-[10px] text-muted-foreground mb-1.5 font-medium">
          {fmtPrice(bin.priceLevel)} – {fmtPrice(bin.priceTop)}
        </div>

        {/* Badges */}
        <div className="flex gap-1 mb-2 flex-wrap">
          {bin.isPOC && (
            <span className="px-1.5 py-0.5 bg-amber-500/15 text-amber-500 text-[9px] font-bold rounded-full">
              POC
            </span>
          )}
          {bin.inVA && (
            <span className="px-1.5 py-0.5 bg-cyan-500/15 text-cyan-500 text-[9px] font-bold rounded-full">
              Value Area
            </span>
          )}
        </div>

        {/* Volume rows */}
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-4">
            <span className="text-[10px] text-muted-foreground">Total Vol</span>
            <span className="text-[11px] font-mono font-bold text-foreground">{fmtVol(bin.volume)}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1 text-[10px] text-emerald-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
              Buy
            </span>
            <span className="text-[10px] font-mono text-emerald-500">{fmtVol(bin.buyVolume)}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1 text-[10px] text-red-500">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
              Sell
            </span>
            <span className="text-[10px] font-mono text-red-500">{fmtVol(bin.sellVolume)}</span>
          </div>
          <div className="h-px bg-border my-0.5" />
          <div className="flex items-center justify-between gap-4">
            <span className="text-[10px] text-muted-foreground">% of total</span>
            <span className="text-[10px] font-mono text-amber-500">{pct}%</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Panel Header / Toggle Button ─────────────────────────────────────────────
// This small HTML overlay sits at the top-right corner of the chart.

interface HeaderProps {
  visible:  boolean;
  onToggle: () => void;
  numBins:  number;
  onBins:   (n: number) => void;
}

function VolumeProfileHeader({ visible, onToggle, numBins, onBins }: HeaderProps) {
  const BIN_OPTIONS = [24, 36, 48, 64];

  return (
    <div className="absolute top-2 right-2 z-30 flex items-center gap-1">
      {visible && (
        <motion.div
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 8 }}
          className="flex items-center gap-0.5 bg-card/90 border border-border rounded-lg px-1.5 py-1 backdrop-blur-sm"
        >
          <span className="text-[9px] text-muted-foreground mr-1">Rows</span>
          {BIN_OPTIONS.map(n => (
            <button
              key={n}
              onClick={() => onBins(n)}
              className={cn(
                'px-1.5 py-0.5 text-[9px] rounded font-semibold transition-colors',
                numBins === n
                  ? 'bg-amber-500/20 text-amber-500'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {n}
            </button>
          ))}
        </motion.div>
      )}

      <button
        onClick={onToggle}
        title={visible ? 'Hide Volume Profile' : 'Show Volume Profile'}
        className={cn(
          'flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-semibold transition-all backdrop-blur-sm',
          visible
            ? 'bg-amber-500/15 border-amber-500/40 text-amber-500 hover:bg-amber-500/25'
            : 'bg-card/90 border-border text-muted-foreground hover:text-foreground hover:border-border',
        )}
      >
        <BarChart2 className="w-3 h-3" />
        VP
      </button>
    </div>
  );
}

// ─── Legend (bottom-right of chart) ──────────────────────────────────────────

function VolumeProfileLegend({ bins, totalVol }: { bins: PriceBin[]; totalVol: number }) {
  const poc    = bins.find(b => b.isPOC);
  const vaLow  = bins.find(b => b.inVA);
  const vaHigh = [...bins].reverse().find(b => b.inVA);

  if (!poc) return null;

  return (
    <div className="absolute bottom-7 right-2 z-20 pointer-events-none">
      <div className="bg-card/85 border border-border rounded-lg px-2.5 py-2 backdrop-blur-sm space-y-1.5">
        {/* POC */}
        <div className="flex items-center gap-2">
          <span className="w-3 h-[2px] bg-amber-500 inline-block" />
          <span className="text-[9px] text-muted-foreground">POC</span>
          <span className="text-[9px] font-mono font-bold text-amber-500 ml-auto pl-2">
            {fmtPrice((poc.priceLevel + poc.priceTop) / 2)}
          </span>
        </div>
        {/* Value Area */}
        {vaLow && vaHigh && (
          <>
            <div className="flex items-center gap-2">
              <span className="w-3 h-[2px] bg-cyan-500 inline-block" />
              <span className="text-[9px] text-muted-foreground">VAH</span>
              <span className="text-[9px] font-mono text-cyan-500 ml-auto pl-2">
                {fmtPrice(vaHigh.priceTop)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-[2px] bg-cyan-500 inline-block opacity-60" />
              <span className="text-[9px] text-muted-foreground">VAL</span>
              <span className="text-[9px] font-mono text-cyan-500 ml-auto pl-2">
                {fmtPrice(vaLow.priceLevel)}
              </span>
            </div>
          </>
        )}
        {/* Buy/Sell ratio */}
        <div className="h-px bg-border" />
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-muted-foreground">Buy/Sell</span>
          <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-red-500/40 ml-1">
            {(() => {
              const totalBuy  = bins.reduce((s, b) => s + b.buyVolume, 0);
              const buyPct    = totalVol > 0 ? (totalBuy / totalVol) * 100 : 50;
              return (
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${buyPct.toFixed(0)}%` }}
                />
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────
// This component renders two layers:
//   1. An SVG <g> fragment to be embedded INSIDE the candle SVG (bars aligned to Y-axis)
//   2. HTML overlays (tooltip, legend, header) positioned absolutely over the chart

export interface VolumeProfileProps {
  candles:       Candle[];
  /** The same coordinate params used by CandlestickSVG */
  chartHeight:   number;
  padT:          number;
  padB:          number;
  yMin:          number;
  yMax:          number;
  /** Total SVG width */
  svgWidth:      number;
  /** Width reserved for right Y-axis labels (same as CandlestickSVG pad.r) */
  padR:          number;
  /** Width of the volume profile bars (carved from within padR space) */
  profileWidth?: number;
  /** Whether the panel is currently visible */
  visible:       boolean;
  onToggle:      () => void;
  numBins:       number;
  onNumBins:     (n: number) => void;
}

export function VolumeProfileOverlay({
  candles,
  chartHeight, padT, padB, yMin, yMax,
  svgWidth, padR,
  profileWidth = 56,
  visible, onToggle, numBins, onNumBins,
}: VolumeProfileProps) {
  const [hovered,     setHovered]     = useState<number | null>(null);
  const [tooltipPos,  setTooltipPos]  = useState({ x: 0, y: 0 });

  const visible80 = useMemo(() => candles.slice(-80), [candles]);

  const bins = useMemo(
    () => buildProfile(visible80, numBins),
    [visible80, numBins],
  );

  const maxVol   = useMemo(() => Math.max(...bins.map(b => b.volume), 1), [bins]);
  const totalVol = useMemo(() => bins.reduce((s, b) => s + b.volume, 0), [bins]);

  const cs: CoordSystem = {
    yMin, yMax,
    yRange:  yMax - yMin,
    padT,   padB,
    chartH:  chartHeight - padT - padB,
    height:  chartHeight,
  };

  // The profile bars sit inside the padR area, starting profileWidth px from right
  // padR = 60, we use the inner 56px for bars, leaving 4px gap before Y labels
  const offsetX = svgWidth - padR + 4;  // start of profile zone

  const hoveredBin = hovered !== null ? bins[hovered] : null;

  return (
    <>
      {/* ── Header toggle (pure HTML) ── */}
      <VolumeProfileHeader
        visible={visible}
        onToggle={onToggle}
        numBins={numBins}
        onBins={onNumBins}
      />

      {/* ── SVG bars (rendered inside parent SVG via a portal-like sibling) ── */}
      {/* We expose a VolumeProfileSVGBars sub-component for embedding in CandlestickSVG */}

      {/* ── Legend ── */}
      <AnimatePresence>
        {visible && bins.length > 0 && (
          <motion.div
            key="legend"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <VolumeProfileLegend bins={bins} totalVol={totalVol} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Tooltip ── */}
      <AnimatePresence>
        {visible && hoveredBin && (
          <BinTooltip
            key="tooltip"
            bin={hoveredBin}
            totalVol={totalVol}
            x={tooltipPos.x}
            y={tooltipPos.y}
          />
        )}
      </AnimatePresence>
    </>
  );
}

// ─── SVG-embeddable bars (used directly inside CandlestickSVG) ────────────────

export interface VolumeProfileBarsProps {
  candles:      Candle[];
  numBins:      number;
  cs:           CoordSystem;
  offsetX:      number;
  panelW:       number;
  onHoverBin:   (idx: number | null) => void;
  onHoverMove:  (x: number, y: number) => void;
}

export function VolumeProfileBars({
  candles, numBins, cs, offsetX, panelW, onHoverBin, onHoverMove,
}: VolumeProfileBarsProps) {
  const visible80 = useMemo(() => candles.slice(-80), [candles]);
  const bins   = useMemo(() => buildProfile(visible80, numBins), [visible80, numBins]);
  const maxVol = useMemo(() => Math.max(...bins.map(b => b.volume), 1), [bins]);
  const [hovered, setHovered] = useState<number | null>(null);

  const handleEnter = (i: number) => { setHovered(i); onHoverBin(i); };
  const handleLeave = ()          => { setHovered(null); onHoverBin(null); };

  return (
    <VolumeProfileSVG
      bins={bins}
      cs={cs}
      panelW={panelW}
      offsetX={offsetX}
      maxVol={maxVol}
      hovered={hovered}
      onHover={(i) => {
        setHovered(i);
        onHoverBin(i);
      }}
    />
  );
}

// ─── Re-export CoordSystem type for CandlestickSVG ───────────────────────────
export type { CoordSystem as VPCoordSystem, PriceBin };
export { buildProfile, toY as vpToY };
