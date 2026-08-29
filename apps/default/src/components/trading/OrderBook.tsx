/**
 * OrderBook.tsx
 * Full-featured order book widget with:
 * - Simulated live data (bids/asks regenerated every 800ms)
 * - Click-to-fill price/amount into trade panel via callback
 * - Loading skeleton
 * - Collapse/expand with localStorage persistence
 * - Mobile: collapsed by default
 * - Best bid/ask highlighted
 * - Depth bar visualization
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp, BookOpen, Activity, Grid3X3 } from 'lucide-react';
import { generateOrderBook, OrderBook as OBType, OrderBookLevel } from '@/lib/marketEngine';
import { InfoTooltip } from '@/components/common/InfoTooltip';

const LS_KEY = 'cv_orderbook_collapsed_v1';

function getInitialCollapsed(): boolean {
  try {
    const stored = localStorage.getItem(LS_KEY);
    if (stored !== null) return stored === 'true';
  } catch { /**/ }
  // Collapse by default on mobile
  return window.innerWidth < 768;
}

// ── Formatting helpers ────────────────────────────────────────────────────────
function fmtPrice(price: number, ref: number): string {
  const dec = ref > 10000 ? 2 : ref > 1000 ? 2 : ref > 10 ? 4 : ref > 1 ? 5 : 8;
  return price.toFixed(dec);
}
function fmtAmt(n: number): string {
  return n >= 1000 ? n.toFixed(2) : n.toFixed(4);
}
function fmtTotal(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
  if (n >= 1000)    return (n / 1000).toFixed(2) + 'K';
  return n.toFixed(2);
}

// ── Row component ─────────────────────────────────────────────────────────────
interface RowProps {
  level: OrderBookLevel;
  side: 'bid' | 'ask';
  midPrice: number;
  isBest: boolean;
  onClickPrice?: (price: number) => void;
  onClickAmount?: (amount: number) => void;
  flashKey: number;
  /** Mobile: smaller font (10px vs 11px) but a slightly taller row (22px vs
   * 20px) — the row is a tap target (click-to-fill price/amount), so touch
   * comfort matters more here than raw density. */
  dense?: boolean;
}

function Row({ level, side, midPrice, isBest, onClickPrice, onClickAmount, flashKey, dense }: RowProps) {
  const isAsk      = side === 'ask';
  const barColor   = isAsk ? 'rgba(246,70,93,0.18)' : 'rgba(14,203,129,0.18)';
  const textColor  = isAsk ? 'text-red-400' : 'text-emerald-400';
  const bestBorder = isBest
    ? isAsk ? 'border-l-2 border-red-400/50' : 'border-l-2 border-emerald-400/50'
    : '';

  return (
    <div className={cn(
      'relative flex items-center font-mono select-none',
      dense ? 'h-[22px] text-[10px]' : 'h-[20px] text-[11px]',
      'hover:bg-white/[0.06] transition-colors group',
      bestBorder,
    )}>
      {/* Depth bar */}
      <div className="absolute inset-y-0 pointer-events-none transition-all duration-300"
        style={{
          [isAsk ? 'right' : 'left']: 0,
          width: (level.depth * 100).toFixed(1) + '%',
          background: barColor,
        }} />

      {/* Price — clickable */}
      <button
        onClick={() => onClickPrice?.(level.price)}
        className={cn('w-[38%] pl-2 z-10 tabular-nums text-left hover:underline decoration-dotted', textColor,
          isBest && 'font-bold')}>
        {fmtPrice(level.price, midPrice)}
      </button>

      {/* Amount — clickable */}
      <button
        onClick={() => onClickAmount?.(level.amount)}
        className="w-[31%] text-right z-10 tabular-nums text-white/75 hover:text-white transition-colors">
        {fmtAmt(level.amount)}
      </button>

      {/* Total */}
      <span className="w-[31%] text-right pr-2 z-10 tabular-nums text-white/35">
        {fmtTotal(level.total * level.price)}
      </span>
    </div>
  );
}

// ── Skeleton loader ───────────────────────────────────────────────────────────
function SkeletonRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center h-[20px] px-2 gap-2">
          <div className="h-2.5 rounded animate-pulse bg-white/[0.06]" style={{ width: '38%' }} />
          <div className="h-2.5 rounded animate-pulse bg-white/[0.04]" style={{ width: '31%', marginLeft: 'auto' }} />
          <div className="h-2.5 rounded animate-pulse bg-white/[0.03]" style={{ width: '25%' }} />
        </div>
      ))}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export interface OrderBookCallbacks {
  onSelectPrice?: (price: number) => void;
  onSelectAmount?: (amount: number) => void;
}

interface Props {
  currentPrice: number;
  prevPrice: number;
  coinSymbol: string;
  compact?: boolean;
  callbacks?: OrderBookCallbacks;
  externalBook?: OBType | null;
  /** Where `externalBook` actually came from — the badge used to always say
   * "Live Sim" even when a real WebSocket/CoinGecko-driven book was passed
   * in via `externalBook`, which stopped being true once real price feeds
   * were wired up. Defaults to 'sim' since the internal 800ms fallback
   * generator genuinely always is simulated. */
  dataSource?: 'live' | 'sim';
  /** Mobile terminal mode for the FULL (non-`compact`) view: 10 rows per side
   * instead of 14, smaller row font. Unlike `compact` (which swaps to an
   * entirely different tiny-preview layout), `dense` keeps the normal
   * collapsible full-book layout — appropriate when Order Book has a whole
   * dedicated tab/pane to itself, as it does in ProDashboard's mobile view. */
  dense?: boolean;
}

export function OrderBook({ currentPrice, prevPrice, coinSymbol, compact = false, callbacks, externalBook, dataSource = 'sim', dense = false }: Props) {
  // getInitialCollapsed()'s "collapse by default on mobile" heuristic was
  // written for OrderBook as a small embedded widget sharing space with
  // other panels. `dense` means it's the sole content of a dedicated tab
  // (ProDashboard's mobile "Order Book" tab) — the user just tapped that tab
  // specifically to see the book, so it should already be open, not require
  // a second tap to un-collapse it.
  const [collapsed, setCollapsed] = useState(() => dense ? false : getInitialCollapsed());
  const [book,      setBook]      = useState<OBType | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [flashKey,  setFlashKey]  = useState(0);
  const priceRef = useRef(currentPrice);
  priceRef.current = currentPrice;

  const toggleCollapse = useCallback(() => {
    setCollapsed(c => { const next = !c; try { localStorage.setItem(LS_KEY, String(next)); } catch { /**/ } return next; });
  }, []);

  // Use externalBook if provided (shared from Dashboard), otherwise generate locally
  useEffect(() => {
    if (externalBook !== undefined) {
      if (externalBook) {
        setBook(externalBook);
        setLoading(false);
        setFlashKey(k => k + 1);
      }
      return;
    }
    // Fallback: local generation (legacy standalone usage)
    setLoading(true);
    const timer = setTimeout(() => {
      setBook(generateOrderBook(priceRef.current, 20));
      setLoading(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [externalBook]);

  // Live simulation fallback — only when no externalBook is provided
  useEffect(() => {
    if (externalBook !== undefined || loading) return;
    const id = setInterval(() => {
      setBook(generateOrderBook(priceRef.current, 20));
      setFlashKey(k => k + 1);
    }, 800);
    return () => clearInterval(id);
  }, [externalBook, loading]);

  const isUp    = currentPrice >= prevPrice;
  const levels  = compact ? 8 : dense ? 10 : 14;

  const asks = useMemo(() => book?.asks.slice(0, levels) ?? [], [book, levels]);
  const bids = useMemo(() => book?.bids.slice(0, levels) ?? [], [book, levels]);

  // Best bid = bids[0] (highest bid). Best ask = asks[0] — OBType's contract
  // sorts asks LOW → HIGH, so the lowest (best) ask is index 0. The previous
  // `asks[asks.length-1]` highlighted the highest visible ask, i.e. the row
  // FURTHEST from the spread, as "best".
  const bestBidPrice = bids.length > 0 ? bids[0].price : null;
  const bestAskPrice = asks.length > 0 ? asks[0].price : null;

  if (compact) {
    // Compact mode: used as a small inline preview (not used in ProDashboard but available)
    return (
      <div className="text-[11px] font-mono">
        <div className="flex items-center text-[10px] text-white/35 mb-1 px-2">
          <span className="w-[38%]">Price</span>
          <span className="w-[31%] text-right">Qty</span>
          <span className="w-[31%] text-right pr-2">Total</span>
        </div>
        {loading ? <SkeletonRows count={5} /> : (
          <>
            <div className="flex flex-col-reverse">
              {asks.slice(0, 5).map((lvl, i) => (
                <Row key={i} level={lvl} side="ask" midPrice={currentPrice}
                  isBest={lvl.price === bestAskPrice} flashKey={flashKey}
                  onClickPrice={callbacks?.onSelectPrice}
                  onClickAmount={callbacks?.onSelectAmount} />
              ))}
            </div>
            <div className="flex items-center justify-between px-2 py-1 border-y border-white/[0.06]">
              <span className={cn('text-[12px] font-bold', isUp ? 'text-emerald-400' : 'text-red-400')}>
                {fmtPrice(currentPrice, currentPrice)}
              </span>
              <span className="text-[10px] text-white/35">
                {book ? book.spreadPct.toFixed(3) + '%' : '—'}
              </span>
            </div>
            {bids.slice(0, 5).map((lvl, i) => (
              <Row key={i} level={lvl} side="bid" midPrice={currentPrice}
                isBest={lvl.price === bestBidPrice} flashKey={flashKey}
                onClickPrice={callbacks?.onSelectPrice}
                onClickAmount={callbacks?.onSelectAmount} />
            ))}
          </>
        )}
      </div>
    );
  }

  // ── Full mode ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full select-none">

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b flex-shrink-0 cursor-pointer"
        style={{ borderColor: 'var(--cv-dash-divider)', background: 'var(--cv-dash-header-bg)' }}
        onClick={toggleCollapse}>
        <BookOpen className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
        <span className="text-[11px] font-semibold flex-1" style={{ color: 'var(--cv-dash-text-secondary)' }}>Order Book</span>
        <span onClick={e => e.stopPropagation()}>
          <InfoTooltip text="Green (bids) = orders waiting to buy. Red (asks) = orders waiting to sell. The gap between the best bid and best ask is the 'spread' — tighter usually means an easier, cheaper fill." />
        </span>
        <div className="flex items-center gap-2">
          <span className={cn('flex items-center gap-1 text-[10px]', dataSource === 'live' ? 'text-emerald-400' : 'text-white/35')}>
            <Activity className="w-3 h-3" />
            <span>{dataSource === 'live' ? 'Live' : 'Simulated'}</span>
          </span>
          {collapsed
            ? <ChevronDown className="w-3.5 h-3.5 text-white/30" />
            : <ChevronUp   className="w-3.5 h-3.5 text-white/30" />}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            key="ob-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="flex flex-col overflow-hidden flex-1 min-h-0">

            {/* Column headers */}
            <div className="flex items-center text-[9px] font-semibold text-white/30 uppercase tracking-wider px-2 py-1.5 border-b flex-shrink-0"
              style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              <span className="w-[38%] pl-0">Price (USDT)</span>
              <span className="w-[31%] text-right">Amount ({coinSymbol})</span>
              <span className="w-[31%] text-right pr-2">Total (USDT)</span>
            </div>

            {loading ? (
              <div className="flex-1">
                <SkeletonRows count={8} />
                <div className="h-8 my-1 mx-2 rounded animate-pulse bg-white/[0.04]" />
                <SkeletonRows count={8} />
              </div>
            ) : (
              <div className="flex flex-col flex-1 overflow-hidden min-h-0">

                {/* ASKS — scroll from bottom, lowest ask nearest spread */}
                <div className="flex-1 flex flex-col justify-end overflow-hidden min-h-0">
                  <div className="flex flex-col-reverse overflow-hidden">
                    {asks.map((lvl, i) => (
                      <Row key={i} level={lvl} side="ask" midPrice={currentPrice}
                        isBest={lvl.price === bestAskPrice} flashKey={flashKey} dense={dense}
                        onClickPrice={callbacks?.onSelectPrice}
                        onClickAmount={callbacks?.onSelectAmount} />
                    ))}
                  </div>
                </div>

                {/* Mid price / spread bar */}
                <div className="flex items-center justify-between px-3 py-1.5 border-y flex-shrink-0"
                  style={{ borderColor: 'var(--cv-dash-divider)', background: 'var(--cv-dash-bg)' }}>
                  <div className="flex items-center gap-2">
                    <span className={cn('text-[15px] font-bold tabular-nums font-mono',
                      isUp ? 'text-emerald-400' : 'text-red-400')}>
                      {fmtPrice(currentPrice, currentPrice)}
                    </span>
                    <svg viewBox="0 0 10 10" className={cn('w-3 h-3 flex-shrink-0', isUp ? 'text-emerald-400' : 'text-red-400 rotate-180')}
                      fill="currentColor">
                      <path d="M5 1L9.33 8H0.67L5 1Z" />
                    </svg>
                  </div>
                  {book && (
                    <div className="text-right">
                      <span className="text-[10px] text-white/35">Spread </span>
                      <span className="text-[10px] font-mono text-white/60">{fmtPrice(book.spread, currentPrice)}</span>
                      <span className="text-[10px] text-amber-400 ml-1">({book.spreadPct.toFixed(3)}%)</span>
                    </div>
                  )}
                </div>

                {/* BIDS */}
                <div className="flex-1 overflow-hidden min-h-0">
                  {bids.map((lvl, i) => (
                    <Row key={i} level={lvl} side="bid" midPrice={currentPrice}
                      isBest={lvl.price === bestBidPrice} flashKey={flashKey} dense={dense}
                      onClickPrice={callbacks?.onSelectPrice}
                      onClickAmount={callbacks?.onSelectAmount} />
                  ))}
                </div>

              </div>
            )}

            {/* Footer hint */}
            {!loading && (
              <div className="flex-shrink-0 px-3 py-1.5 border-t text-[9px] text-white/20 flex justify-between"
                style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                <span>Click price → fill limit field</span>
                <span>Click amount → fill quantity</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* When collapsed — mini summary */}
      {collapsed && !loading && book && (
        <div className="px-3 py-2 flex items-center gap-4 text-[11px] font-mono">
          <div className="flex items-center gap-1.5">
            <span className="text-red-400/60 text-[9px]">ASK</span>
            <span className="text-red-400 font-semibold">
              {bestAskPrice ? fmtPrice(bestAskPrice, currentPrice) : '—'}
            </span>
          </div>
          <div className="flex-1 text-center text-white/20 text-[9px]">
            {book.spreadPct.toFixed(3)}%
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-emerald-400/60 text-[9px]">BID</span>
            <span className="text-emerald-400 font-semibold">
              {bestBidPrice ? fmtPrice(bestBidPrice, currentPrice) : '—'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
