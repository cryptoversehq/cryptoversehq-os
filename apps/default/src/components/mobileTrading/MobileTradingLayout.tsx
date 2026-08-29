/**
 * MobileTradingLayout.tsx
 * Native mobile trading terminal — completely separate from desktop.
 * 
 * Architecture:
 *   Top:    Symbol header (BTC/USDT, price, 24h%)
 *   Middle: Chart (40% screen height, edge-to-edge)
 *   Below:  Timeframe selector (scrollable horizontal)
 *   Bottom: 5-tab navigation (Trade | Positions | Orders | History | Portfolio)
 * 
 * Lazy renders tabs — only mounts content when tab is opened.
 * Zero dependency on desktop components. Uses same stores/engines only.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Search, ChevronDown, Bell, Zap } from 'lucide-react';
import { useTradingStore, calcPositionPnl } from '@/lib/tradingStore';
import { usePriceAlertStore } from '@/lib/priceAlertStore';
import { COINS } from '@/lib/coins';
import { CoinSearchModal } from '@/components/trading/CoinSearchModal';
import { getBasePrice as getBase } from '@/lib/priceSimulation';
import { generateOrderBook } from '@/lib/marketEngine';
import type { OrderBook as OBType } from '@/lib/marketEngine';
import { useBinanceLiveFeed } from '@/hooks/useBinanceLiveFeed';
import { useLiveCoinGeckoPrice } from '@/hooks/useLiveCoinGeckoPrice';
import { getBinanceSymbol } from '@/lib/binanceSymbols';

import { MobileChart } from './MobileChart';
import { MobileTradePanel } from './MobileTradePanel';
import { MobilePositionCard } from './MobilePositionCard';
import { MobileBottomTabs } from './MobileBottomTabs';
import { MobileTradeHistory } from './MobileTradeHistory';
import { MobilePortfolio } from './MobilePortfolio';
import { MobileOrderSheet } from './MobileOrderSheet';
import { OrderBook } from '@/components/trading/OrderBook';

// ── Types ─────────────────────────────────────────────────────────────────────
export type CoinInfo = { id: string; symbol: string; name: string; color: string };
export type MobileTab = 'trade' | 'positions' | 'orders' | 'history' | 'portfolio' | 'book';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtP(p: number): string {
  const d = p >= 10000 ? 2 : p >= 100 ? 2 : p >= 1 ? 4 : p >= 0.01 ? 6 : 8;
  return p.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}

const TIMEFRAMES = [
  { id: '1m', label: '1m' },
  { id: '5m', label: '5m' },
  { id: '15m', label: '15m' },
  { id: '1h', label: '1H' },
  { id: '4h', label: '4H' },
  { id: '1D', label: '1D' },
  { id: '1W', label: '1W' },
] as const;

export type TimeframeId = typeof TIMEFRAMES[number]['id'];

// ═══════════════════════════════════════════════════════════════════════════════
export function MobileTradingLayout() {
  // ── Coin & Price State ────────────────────────────────────────────────────
  const [coin, setCoin] = useState<CoinInfo>({ id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', color: '#F7931A' });
  const [price, setPrice] = useState(() => getBase('bitcoin'));
  const [prev, setPrev] = useState(() => getBase('bitcoin'));
  const [change24h, setChange24h] = useState(-0.42);
  const [high24h, setHigh24h] = useState(() => getBase('bitcoin') * 1.035);
  const [low24h, setLow24h] = useState(() => getBase('bitcoin') * 0.962);
  const [vol24h, setVol24h] = useState(() => getBase('bitcoin') * 12000);
  const [book, setBook] = useState<OBType | null>(() => generateOrderBook(getBase('bitcoin')));
  const [searchOpen, setSearchOpen] = useState(false);
  const [timeframe, setTimeframe] = useState<TimeframeId>('15m');

  // ── Tab State ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<MobileTab>('trade');
  // Track which tabs have been mounted (lazy)
  const [mountedTabs, setMountedTabs] = useState<Set<MobileTab>>(new Set(['trade']));

  const { positions } = useTradingStore();
  const { alerts } = usePriceAlertStore();

  const priceRef = useRef(price);
  priceRef.current = price;
  const wsConnectedRef = useRef(false);

  // ── Price feed ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let unsub: (() => void) | undefined;
    import('@/lib/globalPriceEngine').then(({ subscribePrices }) => {
      unsub = subscribePrices([coin.id], (snapshot) => {
        const p = snapshot.prices.get(coin.id);
        if (!p || wsConnectedRef.current) return;
        setPrev(priceRef.current);
        setPrice(p.price);
        setBook(generateOrderBook(p.price));
        setChange24h(p.change24h);
        setHigh24h(p.high24h);
        setLow24h(p.low24h);
        setVol24h(p.volume24h);
      });
    });
    return () => { unsub?.(); };
  }, [coin.id]);

  const { live: liveCg } = useLiveCoinGeckoPrice(coin.id, 5_000);
  useEffect(() => {
    if (!liveCg || wsConnectedRef.current) return;
    setPrev(priceRef.current);
    setPrice(liveCg.usd);
    setBook(generateOrderBook(liveCg.usd));
    setChange24h(liveCg.usd_24h_change);
    setHigh24h(h => Math.max(h, liveCg.usd));
    setLow24h(l => Math.min(l, liveCg.usd));
    setVol24h(liveCg.usd_24h_vol);
  }, [liveCg]);

  // WebSocket
  const binanceSymbol = useMemo(() => getBinanceSymbol(coin.id), [coin.id]);
  const { connected: wsConnected, ticker: wsTicker, book: wsBook } = useBinanceLiveFeed(binanceSymbol, false);
  wsConnectedRef.current = wsConnected;

  useEffect(() => {
    if (!wsConnected || !wsTicker) return;
    setPrev(priceRef.current);
    setPrice(wsTicker.price);
    setHigh24h(wsTicker.high24h);
    setLow24h(wsTicker.low24h);
    setVol24h(wsTicker.volumeQuote);
    setChange24h(wsTicker.changePct24h);
  }, [wsConnected, wsTicker]);

  useEffect(() => {
    if (wsConnected && wsBook) setBook(wsBook);
  }, [wsConnected, wsBook]);

  // ── Coin Select ───────────────────────────────────────────────────────────
  const handleCoinSelect = useCallback((c: CoinInfo) => {
    const base = getBase(c.id);
    setCoin(c); setPrice(base); setPrev(base);
    setBook(generateOrderBook(base));
    setChange24h((Math.random() - 0.5) * 8);
    setHigh24h(base * 1.035);
    setLow24h(base * 0.962);
    setVol24h(base * 12000);
    try { (useState as any).clearAll?.(); } catch {}
  }, []);

  // ── Tab mounting (lazy) ───────────────────────────────────────────────────
  const switchTab = useCallback((tab: MobileTab) => {
    setActiveTab(tab);
    setMountedTabs(prev => new Set([...prev, tab]));
  }, []);

  const isUp = price >= prev;
  const isUp24 = change24h >= 0;
  const alertCount = alerts.filter(a => a.coinId === coin.id && a.status === 'active').length;

  // ── Refs for tab content containers (for layout measurement if needed)
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <div className="mobile-trading-layout flex flex-col h-full flex-1 min-h-0 overflow-y-auto bg-background text-foreground font-sans"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>

      {/* ═══ TOP HEADER ═══════════════════════════════════════════════════════ */}
      <header className="flex-shrink-0 px-4 py-3 border-b border-border bg-card" role="banner">
        <div className="flex items-center justify-between">
          {/* Symbol selector */}
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 min-w-0"
            aria-label="Search trading pair"
          >
            <span className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ background: coin.color }} />
            <span className="text-lg font-bold truncate">{coin.symbol}/USDT</span>
            <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          </button>

          {/* Price + 24h change */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="text-right">
              <div className={cn('text-lg font-bold tabular-nums leading-tight', isUp ? 'text-emerald-400' : 'text-red-400')}>
                {fmtP(price)}
              </div>
              <div className={cn('text-xs font-semibold tabular-nums', isUp24 ? 'text-emerald-400' : 'text-red-400')}>
                {isUp24 ? '▲ ' : '▼ '}{Math.abs(change24h).toFixed(2)}%
              </div>
            </div>
          </div>
        </div>

        {/* Market stats row */}
        <div className="flex items-center gap-4 mt-2 text-[10px]">
          <div className="flex items-center gap-1">
            <span className="text-white/30">H:</span>
            <span className="font-mono text-emerald-400/80 tabular-nums">{fmtP(high24h)}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-white/30">L:</span>
            <span className="font-mono text-red-400/80 tabular-nums">{fmtP(low24h)}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-white/30">Vol:</span>
            <span className="font-mono text-white/50 tabular-nums">{(vol24h / 1e6).toFixed(2)}M</span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <span className={cn('w-1.5 h-1.5 rounded-full', wsConnected ? 'bg-emerald-400' : liveCg ? 'bg-cyan-400' : 'bg-amber-400')} />
            <span className="text-white/30">{wsConnected ? 'Live' : liveCg ? 'CG' : 'Sim'}</span>
          </div>
        </div>
      </header>

      {/* ═══ CHART SECTION (40% screen height) ════════════════════════════════ */}
      <SectionChart
        coin={coin}
        price={price}
        prev={prev}
        change24h={change24h}
        high24h={high24h}
        low24h={low24h}
        vol24h={vol24h}
        book={book}
        positions={positions.filter(p => p.coinId === coin.id).map(p => ({ entryPrice: p.entryPrice, side: p.side, color: p.color }))}
        timeframe={timeframe}
        onTimeframeChange={setTimeframe}
        wsConnected={wsConnected}
      />

      {/* ═══ TIMEFRAME SELECTOR ═══════════════════════════════════════════════ */}
      <TimeframeBar timeframe={timeframe} onChange={setTimeframe} />

      {/* ═══ TAB CONTENT ══════════════════════════════════════════════════════ */}
      <div ref={contentRef} className="flex-1 min-h-0 overflow-y-auto">
        <TabContent
          activeTab={activeTab}
          mountedTabs={mountedTabs}
          coin={coin}
          price={price}
          prev={prev}
          book={book}
        />
      </div>

      {/* ═══ BOTTOM TABS ══════════════════════════════════════════════════════ */}
      <MobileBottomTabs activeTab={activeTab} onTabChange={switchTab} />

      {/* ═══ OVERLAYS ═════════════════════════════════════════════════════════ */}
      <CoinSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} onSelect={handleCoinSelect as any} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Internal sub-components
// ═══════════════════════════════════════════════════════════════════════════════

// ── Chart Section ─────────────────────────────────────────────────────────────
function SectionChart({ coin, price, prev, change24h, high24h, low24h, vol24h, book, positions, timeframe, onTimeframeChange, wsConnected }: {
  coin: CoinInfo;
  price: number;
  prev: number;
  change24h: number;
  high24h: number;
  low24h: number;
  vol24h: number;
  book: OBType | null;
  positions: { entryPrice: number; side: string; color: string }[];
  timeframe: TimeframeId;
  onTimeframeChange: (tf: TimeframeId) => void;
  wsConnected: boolean;
}) {
  return (
    <div className="flex-shrink-0 w-full" style={{ height: '40%', maxHeight: '50vh', minHeight: 200 }}>
      <MobileChart
        coinId={coin.id}
        coinSymbol={coin.symbol}
        coinColor={coin.color}
        currentPrice={price}
        prevPrice={prev}
        priceChange24h={change24h}
        high24h={high24h}
        low24h={low24h}
        vol24h={vol24h}
        orderBook={book}
        positions={positions}
        timeframe={timeframe}
        wsConnected={wsConnected}
        onTimeframeChange={(tf) => onTimeframeChange(tf as TimeframeId)}
      />
    </div>
  );
}

// ── Timeframe Bar ─────────────────────────────────────────────────────────────
function TimeframeBar({ timeframe, onChange }: { timeframe: TimeframeId; onChange: (tf: TimeframeId) => void }) {
  return (
    <nav
      className="flex-shrink-0 flex items-center gap-1 px-2 py-2 overflow-x-auto scrollbar-none border-b border-border"
      role="tablist"
      aria-label="Chart timeframe"
    >
      {TIMEFRAMES.map(tf => {
        const isActive = tf.id === timeframe;
        return (
          <button
            key={tf.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tf.id)}
            className={cn(
              'flex-shrink-0 min-w-[44px] h-[36px] flex items-center justify-center rounded-lg text-xs font-semibold transition-colors',
              isActive
                ? 'bg-amber-400/15 text-amber-400 border border-amber-400/25'
                : 'text-white/40 hover:text-white/70 bg-white/[0.03] border border-white/[0.05]'
            )}
          >
            {tf.label}
          </button>
        );
      })}
    </nav>
  );
}

// ── Tab Content Switcher (lazy rendering) ────────────────────────────────────
function TabContent({ activeTab, mountedTabs, coin, price, prev, book }: {
  activeTab: MobileTab;
  mountedTabs: Set<MobileTab>;
  coin: CoinInfo;
  price: number;
  prev: number;
  book: OBType | null;
}) {
  const visible = activeTab === 'trade';
  return (
    <div className="h-full overflow-hidden relative">
      {/* Trade Panel */}
      {(mountedTabs.has('trade')) && (
        <div className={cn('absolute inset-0 overflow-y-auto', activeTab === 'trade' ? 'block' : 'hidden')}>
          <MobileTradePanel coin={coin} price={price} prev={prev} />
        </div>
      )}

      {/* Positions Panel */}
      {(mountedTabs.has('positions')) && (
        <div className={cn('absolute inset-0 overflow-y-auto', activeTab === 'positions' ? 'block' : 'hidden')}>
          <MobilePositionCard coin={coin} price={price} />
        </div>
      )}

      {/* Orders Panel */}
      {(mountedTabs.has('orders')) && (
        <div className={cn('absolute inset-0 overflow-y-auto', activeTab === 'orders' ? 'block' : 'hidden')}>
          <MobileOrderSheet coin={coin} price={price} />
        </div>
      )}

      {/* History Panel */}
      {(mountedTabs.has('history')) && (
        <div className={cn('absolute inset-0 overflow-y-auto', activeTab === 'history' ? 'block' : 'hidden')}>
          <MobileTradeHistory coin={coin} />
        </div>
      )}

      {/* Portfolio Panel */}
      {(mountedTabs.has('portfolio')) && (
        <div className={cn('absolute inset-0 overflow-y-auto', activeTab === 'portfolio' ? 'block' : 'hidden')}>
          <MobilePortfolio coin={coin} price={price} />
        </div>
      )}

      {/* Order Book Panel */}
      {(mountedTabs.has('book')) && (
        <div className={cn('absolute inset-0 overflow-hidden', activeTab === 'book' ? 'block' : 'hidden')}>
          <OrderBook
            currentPrice={price}
            prevPrice={prev}
            coinSymbol={coin.symbol}
            externalBook={book}
            dataSource={'sim'}
            dense
          />
        </div>
      )}
    </div>
  );
}
