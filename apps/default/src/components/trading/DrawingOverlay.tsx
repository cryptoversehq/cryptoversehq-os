import React, { useRef, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, BellOff, Trash2, TrendingUp, TrendingDown, ArrowLeftRight, Volume2, VolumeX, X } from 'lucide-react';
import { useDrawingStore, newId, TrendLine, FibRetracement, HorizontalLine } from '@/lib/drawingStore';
import { usePriceAlertStore, AlertCondition, AlertSounds } from '@/lib/priceAlertStore';
import { cn } from '@/lib/utils';

// Fibonacci levels to render (only the 5 requested + 0 + 1 anchors)
const FIB_DISPLAY = [
  { level: 0,     label: '0',     color: '#aab0bc' },
  { level: 0.236, label: '23.6%', color: '#f0b90b' },
  { level: 0.382, label: '38.2%', color: '#00bcd4' },
  { level: 0.5,   label: '50%',   color: '#9945FF' },
  { level: 0.618, label: '61.8%', color: '#f6465d' },
  { level: 0.786, label: '78.6%', color: '#ff9800' },
  { level: 1,     label: '100%',  color: '#aab0bc' },
];

// ─── Chart coordinate helpers (must match CandlestickSVG) ─────────────────────

interface CoordSystem {
  pad:      { l: number; r: number; t: number; b: number };
  chartW:   number;
  chartH:   number;
  yMin:     number;
  yMax:     number;
  yRange:   number;
  n:        number;
  gap:      number;
  width:    number;
  height:   number;
}

function buildCoords(
  width: number,
  height: number,
  prices: number[],
  n: number,
): CoordSystem {
  const pad    = { l: 4, r: 60, t: 12, b: 24 };
  const chartW = width  - pad.l - pad.r;
  const chartH = height - pad.t - pad.b;
  const priceMin  = Math.min(...prices);
  const priceMax  = Math.max(...prices);
  const priceRange = priceMax - priceMin || 1;
  const pricePad  = priceRange * 0.06;
  const yMin      = priceMin - pricePad;
  const yMax      = priceMax + pricePad;
  const yRange    = yMax - yMin;
  const gap       = chartW / n;
  return { pad, chartW, chartH, yMin, yMax, yRange, n, gap, width, height };
}

function toY(cs: CoordSystem, price: number): number {
  return cs.pad.t + ((cs.yMax - price) / cs.yRange) * cs.chartH;
}

function fromY(cs: CoordSystem, y: number): number {
  return cs.yMax - ((y - cs.pad.t) / cs.chartH) * cs.yRange;
}

function toX(cs: CoordSystem, i: number): number {
  return cs.pad.l + i * cs.gap + cs.gap / 2;
}

function fromX(cs: CoordSystem, x: number): number {
  return (x - cs.pad.l - cs.gap / 2) / cs.gap;
}

// ─── Format price label ────────────────────────────────────────────────────────
function fmtPrice(p: number): string {
  if (p > 10_000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (p > 100)    return p.toFixed(2);
  if (p > 1)      return p.toFixed(4);
  return p.toFixed(6);
}

// ─── Context Menu (HTML overlay, not SVG) ────────────────────────────────────

interface ContextMenuProps {
  line:         HorizontalLine;
  svgX:         number;   // pixel position relative to SVG
  svgY:         number;
  containerRef: React.RefObject<HTMLDivElement>;
  coinId:       string;
  coinSymbol:   string;
  coinColor:    string;
  onClose:      () => void;
}

function HLineContextMenu({
  line, svgX, svgY, containerRef, coinId, coinSymbol, coinColor, onClose,
}: ContextMenuProps) {
  const { updateDrawing, removeDrawing } = useDrawingStore();
  const { addAlert, removeAlert, alerts }  = usePriceAlertStore();

  const [step, setStep]               = useState<'menu' | 'alert'>('menu');
  const [condition, setCondition]     = useState<AlertCondition>('above');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [note, setNote]               = useState('');

  // Existing linked alert (if any)
  const linkedAlert = line.alertId
    ? alerts.find(a => a.id === line.alertId)
    : null;

  // Position menu: prefer right of click, flip if too close to right edge
  const containerRect = containerRef.current?.getBoundingClientRect();
  const menuW = 220;
  const menuH = step === 'alert' ? 280 : 160;
  const left  = containerRect
    ? Math.min(svgX, containerRect.width  - menuW - 8)
    : svgX;
  const top   = containerRect
    ? Math.min(svgY, containerRect.height - menuH - 8)
    : svgY;

  const handleCreateAlert = () => {
    const alertId = `alert-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    addAlert({
      coinId,
      coinSymbol,
      coinColor,
      targetPrice:  line.price,
      condition,
      note:         note || `${condition === 'above' ? 'Resistance' : condition === 'below' ? 'Support' : 'Level'} @ ${fmtPrice(line.price)}`,
      soundEnabled,
    });
    // Link alert id back to the drawing so the bell icon shows
    // We read the just-added alert from the store after add
    // Use a small timeout to let Zustand flush
    setTimeout(() => {
      const { alerts: updatedAlerts } = usePriceAlertStore.getState();
      const newAlert = updatedAlerts[0]; // addAlert prepends
      if (newAlert) {
        updateDrawing(line.id, { alertId: newAlert.id, color: '#f0b90b' });
      }
    }, 0);
    if (soundEnabled) AlertSounds.preview();
    onClose();
  };

  const handleRemoveAlert = () => {
    if (line.alertId) {
      removeAlert(line.alertId);
      updateDrawing(line.id, { alertId: undefined, alertTriggered: false, color: '#f0b90b' });
    }
    onClose();
  };

  const CONDITIONS: { id: AlertCondition; label: string; icon: React.ElementType; color: string; hint: string }[] = [
    { id: 'above', label: 'Price Above', icon: TrendingUp,     color: '#0ecb81', hint: 'Alert when price rises above this level' },
    { id: 'below', label: 'Price Below', icon: TrendingDown,   color: '#f6465d', hint: 'Alert when price falls below this level' },
    { id: 'cross', label: 'Price Cross', icon: ArrowLeftRight, color: '#f0b90b', hint: 'Alert when price crosses in either direction' },
  ];

  return (
    <div
      className="absolute z-[500] select-none"
      style={{ left, top }}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: -4 }}
        animate={{ opacity: 1, scale: 1,    y: 0  }}
        exit={{   opacity: 0, scale: 0.92, y: -4  }}
        transition={{ duration: 0.12 }}
        className="bg-[#1e2026] border border-white/10 rounded-xl shadow-2xl overflow-hidden"
        style={{ width: menuW, boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 bg-[#161a1e]">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#f0b90b]" />
            <span className="text-[11px] font-bold text-[#eaecef]">H-Line</span>
            <span className="text-[10px] font-mono text-[#848e9c]">{fmtPrice(line.price)}</span>
          </div>
          <button onClick={onClose} className="p-0.5 hover:bg-white/8 rounded text-[#848e9c] hover:text-[#eaecef] transition-colors">
            <X className="w-3 h-3" />
          </button>
        </div>

        {step === 'menu' && (
          <div className="p-1.5 space-y-0.5">
            {/* Alert action */}
            {linkedAlert ? (
              <>
                <button
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/5 transition-colors text-left"
                  onClick={() => setStep('alert')}
                >
                  <Bell className="w-3.5 h-3.5 text-[#f0b90b] flex-shrink-0" />
                  <div>
                    <div className="text-[11px] font-semibold text-[#eaecef]">Edit Alert</div>
                    <div className="text-[9px] text-[#848e9c]">{linkedAlert.condition} · {linkedAlert.status}</div>
                  </div>
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[#0ecb81] animate-pulse flex-shrink-0" />
                </button>
                <button
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-[#f6465d]/8 transition-colors text-left"
                  onClick={handleRemoveAlert}
                >
                  <BellOff className="w-3.5 h-3.5 text-[#f6465d] flex-shrink-0" />
                  <span className="text-[11px] text-[#f6465d]">Remove Alert</span>
                </button>
              </>
            ) : (
              <button
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-[#f0b90b]/8 transition-colors text-left"
                onClick={() => setStep('alert')}
              >
                <Bell className="w-3.5 h-3.5 text-[#f0b90b] flex-shrink-0" />
                <div>
                  <div className="text-[11px] font-semibold text-[#eaecef]">Set Price Alert</div>
                  <div className="text-[9px] text-[#848e9c]">Notify when price crosses {fmtPrice(line.price)}</div>
                </div>
              </button>
            )}

            <div className="h-px bg-white/5 mx-1" />

            {/* Delete line */}
            <button
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-[#f6465d]/8 transition-colors text-left"
              onClick={() => { removeDrawing(line.id); onClose(); }}
            >
              <Trash2 className="w-3.5 h-3.5 text-[#f6465d] flex-shrink-0" />
              <span className="text-[11px] text-[#f6465d]">Delete Line</span>
            </button>
          </div>
        )}

        {step === 'alert' && (
          <div className="p-3 space-y-3">
            {/* Condition */}
            <div>
              <p className="text-[9px] text-[#848e9c] uppercase tracking-wide mb-1.5 font-semibold">Condition</p>
              <div className="grid grid-cols-3 gap-1">
                {CONDITIONS.map(c => {
                  const Icon = c.icon;
                  const active = condition === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setCondition(c.id)}
                      className="flex flex-col items-center gap-1 py-1.5 rounded-lg border text-[9px] font-semibold transition-all"
                      style={active
                        ? { borderColor: c.color, color: c.color, background: c.color + '15' }
                        : { borderColor: 'rgba(255,255,255,0.08)', color: '#848e9c' }
                      }
                    >
                      <Icon className="w-3 h-3" />
                      <span className="leading-none">{c.label.split(' ')[1]}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[9px] text-[#4a4e57] mt-1 leading-snug">
                {CONDITIONS.find(c => c.id === condition)?.hint}
              </p>
            </div>

            {/* Note */}
            <div>
              <p className="text-[9px] text-[#848e9c] uppercase tracking-wide mb-1 font-semibold">Note (optional)</p>
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="e.g. Key resistance level"
                className="w-full bg-[#161a1e] border border-white/10 focus:border-[#f0b90b]/40 rounded-lg px-2 py-1.5 text-[10px] text-[#eaecef] outline-none transition-colors placeholder-[#4a4e57]"
                onKeyDown={e => { if (e.key === 'Enter') handleCreateAlert(); if (e.key === 'Escape') onClose(); }}
                autoFocus
              />
            </div>

            {/* Sound toggle */}
            <button
              onClick={() => { setSoundEnabled(s => !s); if (!soundEnabled) AlertSounds.preview(); }}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[#161a1e] border border-white/5 hover:border-white/10 transition-colors"
            >
              <div className="flex items-center gap-2">
                {soundEnabled
                  ? <Volume2 className="w-3 h-3 text-[#f0b90b]" />
                  : <VolumeX className="w-3 h-3 text-[#848e9c]" />}
                <span className="text-[10px] text-[#eaecef]">Sound notification</span>
              </div>
              <div
                className="relative inline-flex h-4 w-7 items-center rounded-full transition-colors flex-shrink-0"
                style={{ background: soundEnabled ? '#f0b90b' : '#2b2f36' }}
              >
                <span
                  className="inline-block h-3 w-3 rounded-full bg-white shadow transition-transform"
                  style={{ transform: soundEnabled ? 'translateX(14px)' : 'translateX(2px)' }}
                />
              </div>
            </button>

            {/* Target price (read-only pill) */}
            <div className="flex items-center justify-between bg-[#161a1e] rounded-lg px-2.5 py-1.5 border border-white/5">
              <span className="text-[9px] text-[#848e9c]">Target price</span>
              <span className="text-[11px] font-mono font-bold text-[#f0b90b]">{fmtPrice(line.price)}</span>
            </div>

            {/* Actions */}
            <div className="flex gap-1.5">
              <button
                onClick={() => setStep('menu')}
                className="flex-1 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[#848e9c] text-[10px] font-semibold transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleCreateAlert}
                className="flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-colors flex items-center justify-center gap-1"
                style={{ background: '#f0b90b', color: '#000' }}
              >
                <Bell className="w-3 h-3" />
                Set Alert
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ─── Single horizontal line ───────────────────────────────────────────────────
function HLineSVG({
  d, cs, selected, onSelect, onContextMenu,
}: {
  d: HorizontalLine;
  cs: CoordSystem;
  selected: boolean;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const { removeDrawing } = useDrawingStore();
  const { alerts } = usePriceAlertStore();

  const y = toY(cs, d.price);
  const isVisible = y >= cs.pad.t && y <= cs.pad.t + cs.chartH;
  if (!isVisible) return null;

  const dash =
    d.style === 'dashed' ? '6 4' :
    d.style === 'dotted' ? '2 4' : undefined;

  // Check alert status
  const linkedAlert = d.alertId ? alerts.find(a => a.id === d.alertId) : null;
  const hasActiveAlert   = linkedAlert?.status === 'active';
  const hasTriggeredAlert = linkedAlert?.status === 'triggered';

  // Line color: gold when alert active, red-flash when triggered
  const lineColor = hasTriggeredAlert ? '#f6465d' : d.color;
  const lineOpacity = selected ? 1 : hasActiveAlert ? 0.9 : 0.75;
  const lineWidth   = selected ? 2 : hasActiveAlert ? 1.5 : 1;

  // Bell icon position
  const bellX = cs.pad.l + 24;

  return (
    <g
      onClick={(e)  => { e.stopPropagation(); onSelect(); }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu(e); }}
      style={{ cursor: 'context-menu' }}
    >
      {/* Hit area */}
      <line
        x1={cs.pad.l} y1={y} x2={cs.pad.l + cs.chartW} y2={y}
        stroke="transparent" strokeWidth={14}
      />

      {/* Main line — pulsing when alert is triggered */}
      <line
        x1={cs.pad.l} y1={y} x2={cs.pad.l + cs.chartW} y2={y}
        stroke={lineColor}
        strokeWidth={lineWidth}
        strokeDasharray={dash}
        opacity={lineOpacity}
      >
        {hasTriggeredAlert && (
          <animate attributeName="opacity" values="1;0.2;1" dur="0.6s" repeatCount="5" />
        )}
      </line>

      {/* Alert glow band when active */}
      {hasActiveAlert && (
        <rect
          x={cs.pad.l} y={y - 6}
          width={cs.chartW} height={12}
          fill={lineColor} opacity={0.04}
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Price label tag */}
      <rect
        x={cs.pad.l + cs.chartW + 4} y={y - 9}
        width={54} height={16}
        rx={3} fill={lineColor} opacity={0.92}
      />
      <text
        x={cs.pad.l + cs.chartW + 31} y={y + 3}
        fontSize={9} fill="#000" textAnchor="middle" fontWeight="bold"
      >
        {fmtPrice(d.price)}
      </text>

      {/* Bell badge */}
      {hasActiveAlert && (
        <g style={{ pointerEvents: 'none' }}>
          <circle cx={bellX} cy={y} r={8} fill="#f0b90b" opacity={0.15} />
          <text x={bellX} y={y + 4} fontSize={10} textAnchor="middle">🔔</text>
        </g>
      )}
      {hasTriggeredAlert && (
        <g style={{ pointerEvents: 'none' }}>
          <circle cx={bellX} cy={y} r={8} fill="#f6465d" opacity={0.2} />
          <text x={bellX} y={y + 4} fontSize={10} textAnchor="middle">🔕</text>
        </g>
      )}

      {/* Delete handle when selected */}
      {selected && (
        <g
          onClick={(e) => { e.stopPropagation(); removeDrawing(d.id); }}
          style={{ cursor: 'pointer' }}
        >
          <circle cx={cs.pad.l + 10} cy={y} r={7} fill="#f6465d" />
          <text x={cs.pad.l + 10} y={y + 3.5} fontSize={10} fill="#fff" textAnchor="middle">×</text>
        </g>
      )}

      {/* Drag handle */}
      {selected && (
        <circle cx={cs.pad.l + cs.chartW / 2} cy={y} r={5}
          fill={lineColor} stroke="#fff" strokeWidth={1} style={{ cursor: 'ns-resize' }}
        />
      )}

      {/* Right-click hint (shown when selected + no alert) */}
      {selected && !linkedAlert && (
        <text
          x={cs.pad.l + cs.chartW / 2 + 10} y={y - 5}
          fontSize={8} fill="#848e9c" textAnchor="middle"
          style={{ pointerEvents: 'none' }}
        >
          right-click to set alert
        </text>
      )}
    </g>
  );
}

// ─── Trend line ───────────────────────────────────────────────────────────────
function TrendLineSVG({
  d, cs, selected, onSelect,
}: {
  d: TrendLine;
  cs: CoordSystem;
  selected: boolean;
  onSelect: () => void;
}) {
  const { removeDrawing } = useDrawingStore();
  const x1 = toX(cs, d.x1);
  const y1 = toY(cs, d.price1);
  const x2 = toX(cs, d.x2);
  const y2 = toY(cs, d.price2);

  const dash = d.style === 'dashed' ? '6 4' : undefined;

  // Extension beyond the two anchor points (to right edge of chart)
  const rightEdge = cs.pad.l + cs.chartW;
  let extX2 = x2;
  let extY2 = y2;
  if (x2 !== x1) {
    const slope = (y2 - y1) / (x2 - x1);
    extX2 = rightEdge;
    extY2 = y1 + slope * (rightEdge - x1);
  }

  return (
    <g onClick={(e) => { e.stopPropagation(); onSelect(); }} style={{ cursor: 'pointer' }}>
      {/* Hit area */}
      <line x1={x1} y1={y1} x2={extX2} y2={extY2}
        stroke="transparent" strokeWidth={12}
      />
      {/* Extended faint line */}
      <line x1={x2} y1={y2} x2={extX2} y2={extY2}
        stroke={d.color} strokeWidth={1} strokeDasharray="4 4" opacity={0.3}
      />
      {/* Main line */}
      <line x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={d.color} strokeWidth={selected ? 2 : 1.5}
        strokeDasharray={dash} opacity={selected ? 1 : 0.85}
      />
      {/* Anchor dots */}
      <circle cx={x1} cy={y1} r={selected ? 5 : 3} fill={d.color} />
      <circle cx={x2} cy={y2} r={selected ? 5 : 3} fill={d.color} />

      {/* Delete handle */}
      {selected && (
        <g
          onClick={(e) => { e.stopPropagation(); removeDrawing(d.id); }}
          style={{ cursor: 'pointer' }}
        >
          <circle cx={(x1 + x2) / 2} cy={(y1 + y2) / 2} r={8} fill="#f6465d" />
          <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 + 4} fontSize={11} fill="#fff" textAnchor="middle">×</text>
        </g>
      )}
    </g>
  );
}

// ─── Fibonacci retracement ────────────────────────────────────────────────────
function FibSVG({
  d, cs, selected, onSelect,
}: {
  d: FibRetracement;
  cs: CoordSystem;
  selected: boolean;
  onSelect: () => void;
}) {
  const { removeDrawing } = useDrawingStore();

  const high = Math.max(d.price1, d.price2);
  const low  = Math.min(d.price1, d.price2);
  const diff = high - low;

  // Chart boundaries
  const lineX1    = cs.pad.l;
  const lineX2    = cs.pad.l + cs.chartW;
  // Right-side label zone lives inside the padR space
  const labelX    = lineX2 + 4;
  const labelW    = cs.pad.r - 6;   // ~54 px
  const labelCX   = labelX + labelW / 2;

  // Compute all level positions first (for band rendering)
  const levels = FIB_DISPLAY.map(f => ({
    ...f,
    price: high - diff * f.level,
    y:     toY(cs, high - diff * f.level),
  }));

  return (
    <g
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      style={{ cursor: 'pointer' }}
    >
      {/* ── Shaded bands between consecutive levels ── */}
      {levels.map((lv, idx) => {
        if (idx === 0) return null;
        const prev   = levels[idx - 1];
        const topY   = Math.min(prev.y, lv.y);
        const botY   = Math.max(prev.y, lv.y);
        const bandH  = Math.max(0, botY - topY);
        const clampT = Math.max(topY, cs.pad.t);
        const clampB = Math.min(botY, cs.pad.t + cs.chartH);
        if (clampB <= clampT) return null;
        return (
          <rect
            key={`band-${lv.level}`}
            x={lineX1} y={clampT}
            width={lineX2 - lineX1} height={clampB - clampT}
            fill={lv.color} opacity={selected ? 0.07 : 0.04}
            style={{ pointerEvents: 'none' }}
          />
        );
      })}

      {/* ── Horizontal lines + labels for each level ── */}
      {levels.map((lv) => {
        const { level, label, color, price, y } = lv;
        const isVisible = y >= cs.pad.t - 1 && y <= cs.pad.t + cs.chartH + 1;
        if (!isVisible) return null;

        const sw     = selected ? 1.5 : 1;
        const op     = selected ? 0.92 : 0.72;
        const isEdge = level === 0 || level === 1;

        return (
          <g key={level} style={{ pointerEvents: 'none' }}>
            {/* Full-width horizontal line */}
            <line
              x1={lineX1} y1={y} x2={lineX2} y2={y}
              stroke={color}
              strokeWidth={isEdge ? sw + 0.5 : sw}
              strokeDasharray={isEdge ? undefined : '7 4'}
              opacity={op}
            />

            {/* ── Left label: percentage ── */}
            <g>
              <rect
                x={lineX1 + 2} y={y - 8}
                width={32} height={13}
                rx={3}
                fill="rgba(14,16,22,0.75)"
                style={{ pointerEvents: 'none' }}
              />
              <text
                x={lineX1 + 18} y={y + 3}
                textAnchor="middle"
                fontSize={8.5}
                fontWeight={isEdge ? 'bold' : 'normal'}
                fill={color}
                opacity={op + 0.08}
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {label}
              </text>
            </g>

            {/* ── Right label: price in pill ── */}
            <g>
              <rect
                x={labelX} y={y - 9}
                width={labelW} height={16}
                rx={3}
                fill={color}
                opacity={selected ? 0.92 : 0.78}
              />
              <text
                x={labelCX} y={y + 3}
                textAnchor="middle"
                fontSize={8.5}
                fontWeight="bold"
                fill="#000"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {fmtPrice(price)}
              </text>
            </g>
          </g>
        );
      })}

      {/* ── Invisible hit area across full chart ── */}
      {levels.map((lv) => (
        <line
          key={`hit-${lv.level}`}
          x1={lineX1} y1={lv.y} x2={lineX2} y2={lv.y}
          stroke="transparent" strokeWidth={12}
        />
      ))}

      {/* ── Selection highlight: border box around whole range ── */}
      {selected && (() => {
        const topY = Math.max(Math.min(...levels.map(l => l.y)), cs.pad.t);
        const botY = Math.min(Math.max(...levels.map(l => l.y)), cs.pad.t + cs.chartH);
        return (
          <rect
            x={lineX1} y={topY}
            width={lineX2 - lineX1} height={Math.max(0, botY - topY)}
            fill="none"
            stroke="#9945FF" strokeWidth={1}
            strokeDasharray="4 4"
            opacity={0.4}
            style={{ pointerEvents: 'none' }}
          />
        );
      })()}

      {/* ── Delete handle at 50% level ── */}
      {selected && (() => {
        const mid50 = levels.find(l => l.level === 0.5);
        if (!mid50) return null;
        const mx = lineX1 + (lineX2 - lineX1) / 2;
        const my = mid50.y;
        return (
          <g
            onClick={(e) => { e.stopPropagation(); removeDrawing(d.id); }}
            style={{ cursor: 'pointer' }}
          >
            <circle cx={mx} cy={my} r={9} fill="#f6465d" />
            <text x={mx} y={my + 4.5} fontSize={13} fill="#fff" textAnchor="middle"
              style={{ userSelect: 'none' }}>×</text>
          </g>
        );
      })()}
    </g>
  );
}

// ─── Ghost lines while drawing ─────────────────────────────────────────────────
function GhostHLine({ y, cs, color }: { y: number; cs: CoordSystem; color: string }) {
  const price = fromY(cs, y);
  return (
    <g>
      <line x1={cs.pad.l} y1={y} x2={cs.pad.l + cs.chartW} y2={y}
        stroke={color} strokeWidth={1.5} strokeDasharray="4 3" opacity={0.7}
      />
      <rect x={cs.pad.l + cs.chartW + 4} y={y - 9} width={54} height={16} rx={3} fill={color} opacity={0.85} />
      <text x={cs.pad.l + cs.chartW + 31} y={y + 3} fontSize={9} fill="#000" textAnchor="middle" fontWeight="bold">
        {fmtPrice(price)}
      </text>
    </g>
  );
}

function GhostTrendLine({
  x1, y1, x2, y2, color,
}: { x1: number; y1: number; x2: number; y2: number; color: string }) {
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={color} strokeWidth={1.5} strokeDasharray="4 3" opacity={0.7}
      />
      <circle cx={x1} cy={y1} r={4} fill={color} opacity={0.8} />
      <circle cx={x2} cy={y2} r={4} fill={color} opacity={0.8} />
    </g>
  );
}

function GhostFib({
  startY, currentY, cs,
}: { startY: number; currentY: number; cs: CoordSystem }) {
  const highY     = Math.min(startY, currentY);
  const lowY      = Math.max(startY, currentY);
  const highPrice = fromY(cs, highY);
  const lowPrice  = fromY(cs, lowY);
  const diff      = highPrice - lowPrice;

  const lineX1  = cs.pad.l;
  const lineX2  = cs.pad.l + cs.chartW;
  const labelX  = lineX2 + 4;
  const labelW  = cs.pad.r - 6;
  const labelCX = labelX + labelW / 2;

  const levels = FIB_DISPLAY.map(f => ({
    ...f,
    price: highPrice - diff * f.level,
    y:     toY(cs, highPrice - diff * f.level),
  }));

  // Don't render if the range is trivially small
  if (Math.abs(highY - lowY) < 4) return null;

  const isDescending = currentY > startY; // user dragged down

  return (
    <g opacity={0.82} style={{ pointerEvents: 'none' }}>
      {/* Shaded bands */}
      {levels.map((lv, idx) => {
        if (idx === 0) return null;
        const prev  = levels[idx - 1];
        const topY  = Math.min(prev.y, lv.y);
        const botY  = Math.max(prev.y, lv.y);
        const clampT = Math.max(topY, cs.pad.t);
        const clampB = Math.min(botY, cs.pad.t + cs.chartH);
        if (clampB <= clampT) return null;
        return (
          <rect
            key={`ghost-band-${lv.level}`}
            x={lineX1} y={clampT}
            width={lineX2 - lineX1} height={clampB - clampT}
            fill={lv.color} opacity={0.06}
          />
        );
      })}

      {/* Lines + labels */}
      {levels.map((lv) => {
        const { level, label, color, price, y } = lv;
        const isVisible = y >= cs.pad.t - 1 && y <= cs.pad.t + cs.chartH + 1;
        if (!isVisible) return null;
        const isEdge = level === 0 || level === 1;

        return (
          <g key={`ghost-lv-${level}`}>
            {/* Line */}
            <line
              x1={lineX1} y1={y} x2={lineX2} y2={y}
              stroke={color}
              strokeWidth={isEdge ? 1.5 : 1}
              strokeDasharray={isEdge ? undefined : '7 4'}
              opacity={isEdge ? 0.85 : 0.7}
            />
            {/* % label left */}
            <rect x={lineX1 + 2} y={y - 8} width={32} height={13} rx={3}
              fill="rgba(14,16,22,0.8)" />
            <text
              x={lineX1 + 18} y={y + 3}
              textAnchor="middle" fontSize={8.5}
              fontWeight={isEdge ? 'bold' : 'normal'}
              fill={color} opacity={0.95}
              style={{ userSelect: 'none' }}
            >{label}</text>

            {/* Price pill right */}
            <rect x={labelX} y={y - 9} width={labelW} height={16} rx={3}
              fill={color} opacity={0.82} />
            <text
              x={labelCX} y={y + 3}
              textAnchor="middle" fontSize={8.5} fontWeight="bold"
              fill="#000"
              style={{ userSelect: 'none' }}
            >{fmtPrice(price)}</text>
          </g>
        );
      })}

      {/* Anchor drag line (shows the swing high→low span) */}
      <line
        x1={cs.pad.l + cs.chartW * 0.5}
        y1={highY}
        x2={cs.pad.l + cs.chartW * 0.5}
        y2={lowY}
        stroke="#9945FF" strokeWidth={1}
        strokeDasharray="3 3" opacity={0.4}
      />

      {/* Direction arrow tip */}
      {isDescending ? (
        <polygon
          points={`
            ${cs.pad.l + cs.chartW * 0.5 - 5},${lowY - 8}
            ${cs.pad.l + cs.chartW * 0.5 + 5},${lowY - 8}
            ${cs.pad.l + cs.chartW * 0.5},${lowY - 1}
          `}
          fill="#9945FF" opacity={0.6}
        />
      ) : (
        <polygon
          points={`
            ${cs.pad.l + cs.chartW * 0.5 - 5},${highY + 8}
            ${cs.pad.l + cs.chartW * 0.5 + 5},${highY + 8}
            ${cs.pad.l + cs.chartW * 0.5},${highY + 1}
          `}
          fill="#9945FF" opacity={0.6}
        />
      )}
    </g>
  );
}

// ─── Main DrawingOverlay ──────────────────────────────────────────────────────

interface Props {
  width:       number;
  height:      number;
  prices:      number[];
  nCandles:    number;
  coinId:      string;
  coinSymbol:  string;
  coinColor:   string;
}

interface ContextMenuState {
  line:  HorizontalLine;
  svgX:  number;
  svgY:  number;
}

const TOOL_COLORS = {
  hline:     '#f0b90b',
  trendline: '#00bcd4',
  fibonacci: '#9945FF',
  none:      '#fff',
} as const;

export function DrawingOverlay({ width, height, prices, nCandles, coinId, coinSymbol, coinColor }: Props) {
  const {
    activeTool, drawings, selectedId,
    addDrawing, selectDrawing, setActiveTool,
  } = useDrawingStore();

  const svgRef       = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Ghost state (hline + trendline)
  const [mousePos,    setMousePos]    = useState<{ x: number; y: number } | null>(null);
  const [anchor,      setAnchor]      = useState<{ x: number; y: number } | null>(null);

  // ── Fibonacci drag state ──────────────────────────────────────────────────
  // fibDragStart is set on mousedown; fibDragCurrent tracks live position.
  // On mouseup (with enough distance) we commit the drawing.
  const [fibDragStart,   setFibDragStart]   = useState<{ x: number; y: number } | null>(null);
  const [fibDragCurrent, setFibDragCurrent] = useState<{ x: number; y: number } | null>(null);
  const isDraggingFib = fibDragStart !== null;

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const cs = buildCoords(width, height, prices.length ? prices : [0, 1], nCandles);

  // ── Coordinate helpers ────────────────────────────────────────────────────
  const getSVGPos = useCallback((e: React.MouseEvent<SVGSVGElement> | MouseEvent): { x: number; y: number } => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const snapToChart = useCallback((pos: { x: number; y: number }) => ({
    x: Math.max(cs.pad.l, Math.min(pos.x, cs.pad.l + cs.chartW)),
    y: Math.max(cs.pad.t, Math.min(pos.y, cs.pad.t + cs.chartH)),
  }), [cs]);

  // ── Mouse event handlers ──────────────────────────────────────────────────

  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (activeTool !== 'fibonacci') return;
    e.preventDefault();
    const pos = snapToChart(getSVGPos(e));
    setFibDragStart(pos);
    setFibDragCurrent(pos);
  }, [activeTool, getSVGPos, snapToChart]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (activeTool === 'none') return;
    const pos = snapToChart(getSVGPos(e));
    setMousePos(pos);

    // Live update during fib drag
    if (activeTool === 'fibonacci' && isDraggingFib) {
      setFibDragCurrent(pos);
    }
  }, [activeTool, isDraggingFib, getSVGPos, snapToChart]);

  const handleMouseUp = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (activeTool !== 'fibonacci' || !fibDragStart) return;
    e.preventDefault();

    const pos  = snapToChart(getSVGPos(e));
    const dy   = Math.abs(pos.y - fibDragStart.y);

    // Only commit if user dragged at least 12px vertically
    if (dy >= 12) {
      const p1  = fromY(cs, fibDragStart.y);
      const p2  = fromY(cs, pos.y);
      const xi1 = Math.round(Math.max(0, Math.min(fromX(cs, fibDragStart.x), nCandles - 1)));
      const xi2 = Math.round(Math.max(0, Math.min(fromX(cs, pos.x), nCandles - 1)));
      addDrawing({
        kind: 'fibonacci', id: newId(),
        x1: xi1, price1: p1,
        x2: xi2, price2: p2,
        color: TOOL_COLORS.fibonacci,
      });
    }

    setFibDragStart(null);
    setFibDragCurrent(null);
  }, [activeTool, fibDragStart, cs, nCandles, addDrawing, getSVGPos, snapToChart]);

  const handleMouseLeave = useCallback(() => {
    setMousePos(null);
    // Cancel incomplete drag if mouse leaves chart
    if (isDraggingFib) {
      setFibDragStart(null);
      setFibDragCurrent(null);
    }
  }, [isDraggingFib]);

  // Click handler — hline and trendline only (fibonacci uses drag)
  const handleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (contextMenu) { setContextMenu(null); return; }
    if (activeTool === 'none') { selectDrawing(null); return; }
    if (activeTool === 'fibonacci') return; // handled by drag

    const pos   = snapToChart(getSVGPos(e));
    const price = fromY(cs, pos.y);
    const xi    = Math.round(Math.max(0, Math.min(fromX(cs, pos.x), nCandles - 1)));

    if (activeTool === 'hline') {
      addDrawing({
        kind: 'hline', id: newId(),
        price,
        color: TOOL_COLORS.hline,
        style: 'dashed',
        label: fmtPrice(price),
      });
      return;
    }

    if (activeTool === 'trendline') {
      if (!anchor) { setAnchor(pos); return; }
      const p1  = fromY(cs, anchor.y);
      const p2  = price;
      const xi1 = Math.round(Math.max(0, Math.min(fromX(cs, anchor.x), nCandles - 1)));
      addDrawing({
        kind: 'trendline', id: newId(),
        x1: xi1, price1: p1, x2: xi, price2: p2,
        color: TOOL_COLORS.trendline, style: 'solid',
      });
      setAnchor(null);
    }
  }, [activeTool, anchor, contextMenu, cs, nCandles, addDrawing, selectDrawing, getSVGPos, snapToChart]);

  const openContextMenu = useCallback((e: React.MouseEvent, line: HorizontalLine) => {
    const rect = svgRef.current!.getBoundingClientRect();
    setContextMenu({ line, svgX: e.clientX - rect.left, svgY: e.clientY - rect.top });
    selectDrawing(line.id);
  }, [selectDrawing]);

  // ESC to cancel
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (contextMenu)    { setContextMenu(null); return; }
      if (isDraggingFib)  { setFibDragStart(null); setFibDragCurrent(null); return; }
      setAnchor(null);
      setActiveTool('none');
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [setActiveTool, contextMenu, isDraggingFib]);

  if (width === 0 || height === 0) return null;

  const cursorStyle =
    activeTool === 'fibonacci'  ? (isDraggingFib ? 'cursor-ns-resize' : 'cursor-crosshair') :
    activeTool !== 'none'       ? 'cursor-crosshair' : 'cursor-default';

  const hasInteraction = activeTool !== 'none' || drawings.length > 0 || contextMenu !== null;

  // Is fib ghost renderable?
  const showFibGhost = activeTool === 'fibonacci' && isDraggingFib &&
    fibDragStart && fibDragCurrent &&
    Math.abs(fibDragCurrent.y - fibDragStart.y) >= 4;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ pointerEvents: 'none' }}
    >
      {/* ── SVG drawing layer ── */}
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className={`absolute inset-0 overflow-visible ${cursorStyle}`}
        style={{ pointerEvents: hasInteraction ? 'auto' : 'none' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onContextMenu={e => e.preventDefault()}
      >
        {/* ── Committed drawings ── */}
        {drawings.map(d => {
          const sel = d.id === selectedId;
          if (d.kind === 'hline') return (
            <HLineSVG key={d.id} d={d} cs={cs} selected={sel}
              onSelect={() => { setContextMenu(null); selectDrawing(d.id); }}
              onContextMenu={e => openContextMenu(e, d)}
            />
          );
          if (d.kind === 'trendline') return (
            <TrendLineSVG key={d.id} d={d} cs={cs} selected={sel}
              onSelect={() => { setContextMenu(null); selectDrawing(d.id); }}
            />
          );
          if (d.kind === 'fibonacci') return (
            <FibSVG key={d.id} d={d} cs={cs} selected={sel}
              onSelect={() => { setContextMenu(null); selectDrawing(d.id); }}
            />
          );
          return null;
        })}

        {/* ── Ghosts ── */}

        {/* H-line ghost */}
        {activeTool === 'hline' && mousePos && (
          <GhostHLine y={mousePos.y} cs={cs} color={TOOL_COLORS.hline} />
        )}

        {/* Trend-line ghost */}
        {activeTool === 'trendline' && mousePos && anchor && (
          <GhostTrendLine x1={anchor.x} y1={anchor.y} x2={mousePos.x} y2={mousePos.y} color={TOOL_COLORS.trendline} />
        )}
        {activeTool === 'trendline' && anchor && !mousePos && (
          <circle cx={anchor.x} cy={anchor.y} r={4} fill={TOOL_COLORS.trendline} opacity={0.8} />
        )}

        {/* Fibonacci drag ghost — live preview while dragging */}
        {showFibGhost && (
          <GhostFib
            startY={fibDragStart!.y}
            currentY={fibDragCurrent!.y}
            cs={cs}
          />
        )}

        {/* Fibonacci start-dot before dragging begins */}
        {activeTool === 'fibonacci' && !isDraggingFib && mousePos && (
          <g style={{ pointerEvents: 'none' }}>
            <circle cx={mousePos.x} cy={mousePos.y} r={18}
              fill="#9945FF" opacity={0.08} />
            <circle cx={mousePos.x} cy={mousePos.y} r={4}
              fill="#9945FF" opacity={0.85} />
            {/* Crosshair arms */}
            <line x1={mousePos.x - 10} y1={mousePos.y} x2={mousePos.x + 10} y2={mousePos.y}
              stroke="#9945FF" strokeWidth={1} opacity={0.5} />
            <line x1={mousePos.x} y1={mousePos.y - 10} x2={mousePos.x} y2={mousePos.y + 10}
              stroke="#9945FF" strokeWidth={1} opacity={0.5} />
            {/* Helper label */}
            <rect x={mousePos.x + 10} y={mousePos.y - 14} width={78} height={13} rx={3}
              fill="rgba(14,16,22,0.88)" />
            <text x={mousePos.x + 14} y={mousePos.y - 4} fontSize={8.5}
              fill="#9945FF" opacity={0.9}
              style={{ userSelect: 'none' }}>
              drag to draw Fib
            </text>
          </g>
        )}

        {/* Crosshair dot for hline/trendline */}
        {activeTool !== 'none' && activeTool !== 'fibonacci' && mousePos && (
          <circle cx={mousePos.x} cy={mousePos.y} r={3}
            fill={TOOL_COLORS[activeTool]} opacity={0.9}
            style={{ pointerEvents: 'none' }}
          />
        )}
      </svg>

      {/* ── Context menu ── */}
      <AnimatePresence>
        {contextMenu && (
          <HLineContextMenu
            key={contextMenu.line.id}
            line={contextMenu.line}
            svgX={contextMenu.svgX}
            svgY={contextMenu.svgY}
            containerRef={containerRef}
            coinId={coinId}
            coinSymbol={coinSymbol}
            coinColor={coinColor}
            onClose={() => setContextMenu(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
