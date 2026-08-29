/**
 * ProDashboard.tsx
 * Full trading terminal. All JSX comparison operators extracted to variables.
 * No raw > or < inside JSX markup.
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  ChevronDown, ChevronUp, Search, Star, Bell,
  BarChart2, Zap, Wallet, RotateCcw, Activity,
  X, AlertTriangle, CheckCircle, XCircle, Link2, TrendingUp, HelpCircle,
} from 'lucide-react';
import { useTradingStore, calcPositionPnl, Position } from '@/lib/tradingStore';
import { checkDailyTradeLimit, recordDailyTrade } from '@/lib/dailyTradeLimit';
import { usePriceAlertStore } from '@/lib/priceAlertStore';
import { useTradingLevelStore, TradingLevel } from '@/lib/tradingLevelStore';
import { TradingChart } from './trading/TradingChart';
import { CoinSearchModal } from './trading/CoinSearchModal';
import { TradingSchool } from './trading/TradingSchool';
import { PriceAlertPanel, AlertToastStack } from './trading/PriceAlertPanel';
import { COINS } from '@/lib/coins';
import { OrderBook } from './trading/OrderBook';
import { MobileTabBar } from './trading/MobileTabBar';
import { useIsMobile } from '@/hooks/useIsMobile';
import { ChartErrorBoundary } from './common/ChartErrorBoundary';
import { EquityCurveChart } from './common/EquityCurveChart';
import { useBinanceLiveFeed } from '@/hooks/useBinanceLiveFeed';
import { useLiveCoinGeckoPrice } from '@/hooks/useLiveCoinGeckoPrice';
import { getBinanceSymbol } from '@/lib/binanceSymbols';
import { getBasePrice as getBase } from '@/lib/priceSimulation';
import { generateOrderBook, OrderBook as OBType } from '@/lib/marketEngine';
import { useDrawingStore } from '@/lib/drawingStore';
import { InfoTooltip } from '@/components/common/InfoTooltip';
import { ORDER_TYPE_HELP, LEVERAGE_HELP, TPSL_HELP } from '@/lib/tradingHelpText';
import { StrategyBuilderPanel } from './trading/StrategyBuilderPanel';
import { PositionSizeCalculator } from './trading/PositionSizeCalculator';
import {
  useGuidedPractice,
  GuidedPracticeOverlay,
  GuidedPracticeButton,
} from './trading/GuidedPractice';
import {
  subscribePrices,
  pushBinancePrice,
  clearBinancePrice,
  type CoinPrice,
  type CoinPriceSnapshot,
} from '@/lib/globalPriceEngine';
import { placeOrder, cancelOrder, getPendingOrders, subscribeOrderStatus, type PendingOrder } from '@/lib/orderEngine';

// ── Types ─────────────────────────────────────────────────────────────────────
type CoinInfo = { id: string; symbol: string; name: string; color: string };

// ── Helpers ───────────────────────────────────────────────────────────────────
// NOTE: base-price table now lives in `@/lib/priceSimulation` (imported
// above as `getBase`) — shared with Dashboard.tsx to remove the duplicated
// (and slightly divergent) copy that used to live here.
//
function fmtP(p: number): string {
  const d = p >= 10000 ? 2 : p >= 100 ? 2 : p >= 1 ? 4 : p >= 0.01 ? 6 : 8;
  return p.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}

// ── Level config ──────────────────────────────────────────────────────────────
const LEVELS: { id: TradingLevel; label: string; color: string; desc: string }[] = [
  { id: 'simple',  label: 'Simple', color: '#10B981', desc: 'Basic buy/sell + chart' },
  { id: 'pro',     label: 'Pro',    color: '#6366F1', desc: '+ Indicators, TP/SL' },
  { id: 'proplus', label: 'Pro+',   color: '#F59E0B', desc: '+ Leverage, Limit orders' },
];

// ── ProTradePanel ─────────────────────────────────────────────────────────────
function ProTradePanel({ coin, price, prev, level, fillPrice, fillAmount, onGuidedAmountSet, onGuidedSlSet, onGuidedTpSet, onGuidedBuy }: {
  coin: CoinInfo; price: number; prev: number; level: TradingLevel;
  fillPrice?: number | null;
  fillAmount?: number | null;
  onGuidedAmountSet?: (v: string) => void;
  onGuidedSlSet?:     (v: string) => void;
  onGuidedTpSet?:     (v: string) => void;
  onGuidedBuy?:       () => void;
}) {
  const { balance, openPosition } = useTradingStore();
  const [tab,    setTab]   = useState<'Market' | 'Limit' | 'Stop-Limit'>('Market');
  const [side,   setSide]  = useState<'buy' | 'sell'>('buy');
  const [limitPx, setLimitPx] = useState('');
  const [amt,    setAmt]   = useState('');
  // On mobile this panel has a full-width dedicated tab (no cramped 280px
  // desktop column), so touch targets get bigger: Buy/Sell/Submit buttons
  // grow to a comfortable >=44px tall tap target, and input text is large
  // enough to read/edit without zooming.
  const isMobileP = useIsMobile(768);

  // Accept fills from order book clicks — use a timestamp-keyed object so
  // clicking the same value twice still triggers the effect.
  const prevFillPriceRef  = useRef<number | null>(null);
  const prevFillAmountRef = useRef<number | null>(null);

  useEffect(() => {
    if (fillPrice != null && fillPrice !== prevFillPriceRef.current) {
      prevFillPriceRef.current = fillPrice;
      const dec = fillPrice > 10000 ? 2 : fillPrice > 10 ? 2 : fillPrice > 1 ? 4 : 6;
      setLimitPx(fillPrice.toFixed(dec));
      if (tab === 'Market') setTab('Limit');
    }
  }, [fillPrice, tab]);

  useEffect(() => {
    if (fillAmount != null && fillAmount !== prevFillAmountRef.current) {
      prevFillAmountRef.current = fillAmount;
      setAmt(fillAmount.toFixed(4));
    }
  }, [fillAmount]);
  const [lev,    setLev]   = useState(1);
  const [tp,     setTp]    = useState('');
  const [sl,     setSl]    = useState('');
  const [tpslOn, setTpslOn] = useState(false);
  const [flash,  setFlash] = useState<{ ok: boolean; msg: string } | null>(null);
  const [marginMode, setMarginMode] = useState<'isolated' | 'cross'>('isolated');

  // Guided practice: auto-expand TP/SL + pre-fill suggestions when guided there
  useEffect(() => {
    if (onGuidedSlSet || onGuidedTpSet) {
      // When sl/tp callbacks are present AND tpslOn is false, open the panel
      if (!tpslOn) setTpslOn(true);
      // Pre-fill with 5% suggestions if empty
      const dec5 = price > 10000 ? 2 : price > 10 ? 2 : price > 1 ? 4 : 6;
      if (!sl && onGuidedSlSet) {
        const suggested = (price * 0.95).toFixed(dec5);
        setSl(suggested);
        onGuidedSlSet(suggested);
      }
      if (!tp && onGuidedTpSet) {
        const suggested = (price * 1.05).toFixed(dec5);
        setTp(suggested);
        onGuidedTpSet(suggested);
      }
    }
  // only run once on mount or when the guided callbacks first appear
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!onGuidedSlSet, !!onGuidedTpSet]);

  // During guided steps 3 & 4 we need TP/SL visible regardless of level
  const needsTpSl = !!onGuidedSlSet || !!onGuidedTpSet;
  const isPro     = level === 'pro' || level === 'proplus' || needsTpSl;
  const isProPlus = level === 'proplus';
  const execPx    = tab === 'Market' ? price : (parseFloat(limitPx) || price);
  const qty       = parseFloat(amt) || 0;
  const total     = qty * execPx;
  const fee       = total * 0.001;
  const isBuy     = side === 'buy';

  // All booleans extracted
  const hasTotal    = total > 0;
  const hasQty      = qty > 0;

  // Quick-fill now scales against the 25%-of-portfolio guardrail ceiling,
  // not the full balance — otherwise the 50/75/100% buttons would always
  // produce an order that handleSubmit immediately rejects, which is a
  // confusing "the button lied to me" experience for exactly the users
  // these guardrails are meant to protect.
  const MAX_POSITION_PCT_OF_BALANCE = 0.25;
  const setPct = (pct: number) => {
    const maxUsd = balance * MAX_POSITION_PCT_OF_BALANCE;
    const u = (maxUsd * pct / 100) / execPx;
    const v = u > 0 ? u.toFixed(6) : '';
    setAmt(v);
    onGuidedAmountSet?.(v);
  };

  const handleSubmit = () => {
    if (!hasQty || !hasTotal) {
      setFlash({ ok: false, msg: 'Enter a valid amount' });
      setTimeout(() => setFlash(null), 2500);
      return;
    }
    // Trading guardrails — ported from the (now-retired) Dashboard.tsx
    // terminal's TradePanel.tsx, which had these checks but was never
    // reachable at /trading. ProTradePanel is the terminal real users hit,
    // so it needs them directly: a $10 floor stops dust-sized test orders
    // from cluttering history, and the 25%-of-portfolio cap stops a single
    // order from risking most of the account in one shot.
    if (total < 10) {
      setFlash({ ok: false, msg: 'Minimum trade size is $10' });
      setTimeout(() => setFlash(null), 2500);
      return;
    }
    if (total > balance * MAX_POSITION_PCT_OF_BALANCE) {
      setFlash({ ok: false, msg: 'Max position size is 25% of your portfolio' });
      setTimeout(() => setFlash(null), 2500);
      return;
    }
    if (total > balance) {
      setFlash({ ok: false, msg: 'Insufficient balance' });
      setTimeout(() => setFlash(null), 2500);
      return;
    }
    // Free plan: daily trade limit (10 trades/day)
    const dtl = checkDailyTradeLimit();
    if (!dtl.canTrade) {
      setFlash({ ok: false, msg: `Daily trade limit reached (${dtl.max}/day). Upgrade to Pro for unlimited trading.` });
      setTimeout(() => setFlash(null), 3000);
      return;
    }
    const r = openPosition({
      coinId: coin.id, symbol: coin.symbol, name: coin.name,
      side: isBuy ? 'long' : 'short',
      usdAmount: total, currentPrice: execPx, leverage: lev,
      color: coin.color,
      takeProfit: tpslOn && tp ? parseFloat(tp) : undefined,
      stopLoss:   tpslOn && sl ? parseFloat(sl) : undefined,
      marginMode,
    });
    if (r.success) {
      recordDailyTrade();
      setFlash({ ok: true, msg: (isBuy ? 'Buy' : 'Sell') + ' ' + qty.toFixed(4) + ' ' + coin.symbol });
      setAmt(''); setTp(''); setSl('');
    } else {
      setFlash({ ok: false, msg: r.error ?? 'Order failed' });
    }
    setTimeout(() => setFlash(null), 3000);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-card">
      {isProPlus && (
        <div className="flex items-center border-b flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          {(['Market', 'Limit', 'Stop-Limit'] as const).map(t => {
            const isActive = t === tab;
            return (
              <button key={t} onClick={() => setTab(t)}
                className={cn('flex-1 py-2.5 text-[11px] font-semibold transition-colors border-b-2',
                  isActive ? 'border-amber-400 text-amber-400' : 'border-transparent text-white/30 hover:text-white/60')}>
                {t}
              </button>
            );
          })}
          <InfoTooltip side="bottom" className="mr-2 flex-shrink-0" text={ORDER_TYPE_HELP[tab]} />
        </div>
      )}

      <div className={cn('flex-1 space-y-3', isMobileP ? 'p-2' : 'p-3')}>
        {/* Buy/Sell */}
        <div className="grid grid-cols-2 gap-1.5">
          <button onClick={() => setSide('buy')}
            className={cn('rounded-xl font-bold transition-all',
              isMobileP ? 'min-h-11 py-3.5 text-[14px]' : 'py-2.5 text-[13px]',
              isBuy ? 'bg-emerald-500 text-white shadow-lg' : 'bg-white/[0.05] text-white/40 hover:text-emerald-400')}>
            Buy / Long
          </button>
          <div className="relative">
            <button onClick={() => setSide('sell')}
              className={cn('w-full rounded-xl font-bold transition-all',
                isMobileP ? 'min-h-11 py-3.5 text-[14px]' : 'py-2.5 text-[13px]',
                !isBuy ? 'bg-red-500 text-white shadow-lg' : 'bg-white/[0.05] text-white/40 hover:text-red-400')}>
              Sell / Short
            </button>
            <div className="absolute -top-1 -right-1 group">
              <HelpCircle className="w-4 h-4 text-white/30 hover:text-amber-400 cursor-help" />
              <div className="absolute right-0 bottom-full mb-2 w-64 bg-[#1a1d26] border border-white/[0.1] rounded-lg p-3 text-[10px] text-white/70 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-xl">
                <p className="leading-relaxed">Short selling allows you to profit from price decreases. You don't need to own the asset. Your P&L is calculated based on price difference.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Balance */}
        <div className="flex justify-between text-[11px] bg-white/[0.03] rounded-xl px-3 py-2">
          <span className="text-white/35 flex items-center gap-1"><Wallet className="w-3 h-3" /> Balance</span>
          <span className="text-white/70 font-mono font-semibold tabular-nums">
            {balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            <span className="text-white/30"> USDT</span>
          </span>
        </div>

        {/* Limit price */}
        {isProPlus && tab === 'Limit' && (
          <div>
            <label className="block text-[10px] text-white/35 mb-1">Limit Price</label>
            <div className="flex items-center bg-white/[0.05] border border-white/[0.06] rounded-xl px-3 py-2 focus-within:border-amber-400/40">
              <input type="number" value={limitPx} onChange={e => setLimitPx(e.target.value)}
                placeholder={price.toFixed(2)}
                className="flex-1 bg-transparent text-[12px] font-mono text-white/80 outline-none placeholder-white/20" />
              <button onClick={() => setLimitPx(price.toFixed(2))}
                className="text-[10px] text-amber-400 ml-1 flex items-center gap-0.5">
                <Link2 className="w-3 h-3" /> Mkt
              </button>
              <span className="text-[11px] text-white/30 ml-2">USDT</span>
            </div>
          </div>
        )}

        {/* Market price */}
        {tab === 'Market' && (
          <div className="flex items-center justify-between bg-white/[0.03] rounded-xl px-3 py-2">
            <span className="text-[11px] text-white/35">Market Price</span>
            <span className={cn('text-[14px] font-mono font-bold tabular-nums', price >= prev ? 'text-emerald-400' : 'text-red-400')}>
              {fmtP(price)}
            </span>
          </div>
        )}

        {/* Amount */}
        <div data-guide="amount-field">
          <label className="block text-[10px] text-white/35 mb-1">Amount ({coin.symbol})</label>
          <div className={cn('flex items-center bg-white/[0.05] border border-white/[0.06] rounded-xl focus-within:border-amber-400/40',
            isMobileP ? 'px-3 py-3' : 'px-3 py-2')}>
            <input type="number" value={amt} onChange={e => { setAmt(e.target.value); onGuidedAmountSet?.(e.target.value); }}
              placeholder="0.00000"
              className={cn('flex-1 bg-transparent font-mono text-white/80 outline-none placeholder-white/20',
                isMobileP ? 'text-[15px]' : 'text-[12px]')} />
            <span className="text-[11px] text-white/30 ml-2">{coin.symbol}</span>
          </div>
        </div>

        {/* % buttons */}
        <div>
          <div className="grid grid-cols-4 gap-1">
            {[25, 50, 75, 100].map(p => (
              <button key={p} onClick={() => setPct(p)}
                className="py-1.5 text-[10px] font-semibold text-white/40 bg-white/[0.04] hover:bg-amber-400/15 hover:text-amber-400 rounded-lg transition-colors border border-white/[0.05]">
                {p}%
              </button>
            ))}
          </div>
          <p className="text-[9px] text-white/20 mt-1">% of your 25% max position size, not your full balance</p>
        </div>

        {/* Total */}
        <div className="flex justify-between items-center bg-white/[0.03] rounded-xl px-3 py-2">
          <span className="text-[11px] text-white/35">Total (USDT)</span>
          <span className="text-[13px] font-mono font-semibold tabular-nums text-white/70">
            {hasTotal ? total.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}
          </span>
        </div>

        {/* Fee */}
        {hasTotal && (
          <div className="flex justify-between text-[10px]">
            <span className="text-white/25">Est. Fee (0.1%)</span>
            <span className="text-white/40 font-mono tabular-nums">{fee.toFixed(4)} USDT</span>
          </div>
        )}

        {/* Leverage */}
        {isProPlus && (
          <div>
            <div className="flex justify-between text-[11px] mb-1.5">
              <span className="text-white/35 flex items-center gap-1">
                Leverage
                <InfoTooltip text={LEVERAGE_HELP} />
              </span>
              <span className="text-amber-400 font-bold font-mono">{lev}x</span>
            </div>
            <input type="range" min={1} max={100} value={lev}
              onChange={e => setLev(Number(e.target.value))}
              className="w-full h-1.5 accent-amber-400 cursor-pointer rounded" />
            <div className="flex justify-between text-[9px] text-white/20 mt-0.5">
              {[1, 25, 50, 75, 100].map(v => <span key={v}>{v}x</span>)}
            </div>
          </div>
        )}

        {/* TP/SL */}
        {isPro && (
          <div>
            <div className="flex items-center gap-1.5 text-[11px] text-white/40 w-full">
              <button onClick={() => setTpslOn(o => !o)}
                className="flex items-center gap-1.5 hover:text-white/70 transition-colors flex-1 text-left">
                {tpslOn ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                <span>TP / SL</span>
                <span className="text-[10px] text-white/20">(Take Profit / Stop Loss)</span>
              </button>
              <InfoTooltip text={TPSL_HELP} />
            </div>
            {tpslOn && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div data-guide="tp-field">
                  <label className="block text-[9px] text-emerald-400/70 mb-1">Take Profit</label>
                  <div className="flex items-center bg-white/[0.05] border border-emerald-500/20 rounded-lg px-2 py-1.5">
                    <input type="number" value={tp} onChange={e => { setTp(e.target.value); onGuidedTpSet?.(e.target.value); }} placeholder="0.00"
                      className="flex-1 bg-transparent text-[11px] font-mono text-emerald-400 outline-none placeholder-white/15" />
                  </div>
                </div>
                <div data-guide="sl-field">
                  <label className="block text-[9px] text-red-400/70 mb-1">Stop Loss</label>
                  <div className="flex items-center bg-white/[0.05] border border-red-500/20 rounded-lg px-2 py-1.5">
                    <input type="number" value={sl} onChange={e => { setSl(e.target.value); onGuidedSlSet?.(e.target.value); }} placeholder="0.00"
                      className="flex-1 bg-transparent text-[11px] font-mono text-red-400 outline-none placeholder-white/15" />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Position Size Calculator — new: sizes the trade so that hitting
            your Stop Loss costs a fixed, chosen % of your portfolio (the
            standard "risk 1-2% per trade" rule), instead of the user
            guessing an amount and only finding out the real dollar risk
            after the fact. */}
        {isPro && (
          <PositionSizeCalculator
            balance={balance}
            entryPrice={execPx}
            leverage={isProPlus ? lev : 1}
            stopLoss={sl}
            onApply={(qtyStr) => { setAmt(qtyStr); onGuidedAmountSet?.(qtyStr); }}
          />
        )}

        {/* Summary */}
        {hasTotal && (
          <div className="bg-white/[0.03] rounded-xl px-3 py-2.5 space-y-1 text-[11px] border border-white/[0.04]">
            <div className="flex justify-between">
              <span className="text-white/30">Side</span>
              <span className={isBuy ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
                {isBuy ? 'Buy (Long)' : 'Sell (Short)'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/30">Order Value</span>
              <span className="font-mono text-white/70">{total.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/30">Quantity</span>
              <span className="font-mono text-white/70">{qty.toFixed(6)} {coin.symbol}</span>
            </div>
            {isProPlus && (
              <div className="flex justify-between">
                <span className="text-white/30">Leverage</span>
                <span className="font-mono text-amber-400">{lev}x</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-white/30">Margin</span>
              <select
                value={marginMode}
                onChange={e => setMarginMode(e.target.value as 'isolated' | 'cross')}
                className="text-[10px] font-semibold bg-white/[0.05] border border-border rounded-md px-1.5 py-0.5 text-white/80 cursor-pointer outline-none hover:border-primary/40 transition-colors"
              >
                <option value="isolated">{'\u00A0'}Isolated{' '}(default)</option>
                <option value="cross">{'\u00A0'}Cross{' '}(portfolio)</option>
              </select>
            </div>
          </div>
        )}

        {/* Flash */}
        {flash && (
          <div className={cn(
            'flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-semibold border',
            flash.ok ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400',
          )}>
            {flash.ok
              ? <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
              : <XCircle className="w-3.5 h-3.5 flex-shrink-0" />}
            {flash.msg}
          </div>
        )}

        {/* Submit */}
        <button
          data-guide="buy-button"
          onClick={() => { handleSubmit(); onGuidedBuy?.(); }}
          className={cn('w-full rounded-xl font-bold transition-all active:scale-95',
            isMobileP ? 'min-h-12 py-4 text-[15px]' : 'py-3 text-[14px]',
            isBuy ? 'bg-emerald-500 hover:bg-emerald-400 text-white' : 'bg-red-500 hover:bg-red-400 text-white')}>
          {isBuy ? 'Buy ' + coin.symbol : 'Sell ' + coin.symbol}
        </button>
      </div>
    </div>
  );
}

// ── LeverageEditor ─────────────────────────────────────────────────────────────
// New: lets a user adjust leverage on an already-open position — previously
// leverage was fixed at open time with no way to change it, and the
// Positions table didn't even display it. Position size stays fixed;
// changing leverage only reallocates margin between the position and
// available balance (see tradingStore.updateLeverage).
function LeverageEditor({ position, onUpdate }: {
  position: Position;
  onUpdate: (positionId: string, newLeverage: number) => { success: boolean; error?: string };
}) {
  const [open, setOpen]   = useState(false);
  const [value, setValue] = useState(String(position.leverage));
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const apply = () => {
    const n = Math.round(parseFloat(value));
    if (isNaN(n)) { setError('Enter a number'); return; }
    const result = onUpdate(position.id, n);
    if (result.success) { setOpen(false); setError(null); }
    else setError(result.error ?? 'Could not update leverage');
  };

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => { setValue(String(position.leverage)); setError(null); setOpen(o => !o); }}
        className="px-2 py-1 rounded-lg text-[10px] font-mono font-bold bg-amber-400/10 text-amber-400 border border-amber-400/20 hover:bg-amber-400/20 transition-colors"
      >
        {position.leverage}x ✎
      </button>
      {open && (
        <div
          className="absolute z-50 top-full mt-1 left-0 w-44 p-2.5 rounded-xl border border-border shadow-xl space-y-2"
          style={{ background: '#1a1d26' }}
        >
          <p className="text-[9px] text-white/40 leading-relaxed">
            Position size stays the same — this only moves margin between this trade and your balance.
          </p>
          <div className="flex items-center gap-1.5">
            <input
              type="number" min={1} max={100} value={value}
              onChange={e => setValue(e.target.value)}
              className="w-full bg-white/[0.06] border border-border rounded-lg px-2 py-1 text-[11px] font-mono text-white/80 outline-none focus:border-amber-400/50"
            />
            <span className="text-[10px] text-white/30">x</span>
          </div>
          {error && <p className="text-[9px] text-red-400">{error}</p>}
          <button
            onClick={apply}
            className="w-full py-1 rounded-lg bg-amber-400/15 hover:bg-amber-400/25 text-amber-400 text-[10px] font-semibold transition-colors"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}

// ── ProBottomPanel ────────────────────────────────────────────────────────────
function ProBottomPanel({ coin, price }: { coin: CoinInfo; price: number }) {
  type BTab = 'positions' | 'orders' | 'history' | 'wallet' | 'perf' | 'strategy';
  const [tab, setTab]       = useState<BTab>('positions');
  const [search, setSearch] = useState('');
  const { balance, positions, history, openPosition, closePosition, resetBalance, updateLeverage } = useTradingStore();
  const { level } = useTradingLevelStore();

  const reversePosition = useCallback((pos: Position, mp: number) => {
    closePosition(pos.id, mp);
    openPosition({
      coinId: pos.coinId,
      symbol: pos.symbol,
      name: pos.name,
      side: pos.side === 'long' ? 'short' : 'long',
      usdAmount: pos.quantity * mp,
      currentPrice: mp,
      leverage: pos.leverage,
      marginMode: pos.marginMode ?? 'isolated',
      color: pos.color,
    });
  }, [closePosition, openPosition]);

  // If the user downgrades to Simple while the Strategy tab is open, fall
  // back to Positions rather than leaving them stranded on a tab that's
  // about to disappear from the tab bar.
  useEffect(() => {
    if (tab === 'strategy' && level === 'simple') setTab('positions');
  }, [tab, level]);

  const totalPnl = positions.reduce((acc, pos) => {
    const mp = pos.coinId === coin.id ? price : pos.entryPrice;
    return acc + calcPositionPnl(pos, mp).rawPnl;
  }, 0);

  const filteredHistory = useMemo(() => {
    if (!search) return history;
    const q = search.toLowerCase();
    return history.filter(h => h.symbol.toLowerCase().includes(q));
  }, [history, search]);

  // All booleans extracted from JSX
  const hasPositions   = positions.length > 0;
  const hasPnlPositive = totalPnl >= 0;
  const hasHistory     = filteredHistory.length > 0;
  const hasSearch      = search.length > 0;

  const TABS: { id: BTab; label: string; count: number }[] = [
    { id: 'positions', label: 'Open Positions', count: positions.length },
    { id: 'orders',    label: 'Active Orders',  count: 0 },
    { id: 'history',   label: 'Trade History',  count: 0 },
    { id: 'perf',      label: 'Performance',    count: 0 },
    // Strategy Builder + backtesting is an advanced feature — gated to
    // Pro/Pro+ the same way Leverage and TP/SL already are, rather than
    // showing beginners a condition-builder + backtest engine on day one.
    ...(level !== 'simple' ? [{ id: 'strategy' as BTab, label: 'Strategy', count: 0 }] : []),
    { id: 'wallet',    label: 'Wallet',          count: 0 },
  ];

  return (
    <div className="flex flex-col h-full border-t" style={{ background: 'var(--cv-dash-panel-bg)', borderColor: 'var(--cv-dash-divider)' }}>
      {/* Tab bar */}
      <div className="flex items-center border-b flex-shrink-0 overflow-x-auto" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        {TABS.map(t => {
          const isActive  = t.id === tab;
          const hasBadge  = t.count > 0;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn('px-4 py-2.5 text-[12px] font-medium whitespace-nowrap transition-colors border-b-2 flex items-center gap-1.5',
                isActive ? 'border-amber-400 text-amber-400' : 'border-transparent text-white/35 hover:text-white/65')}>
              {t.label}
              {hasBadge && (
                <span className="px-1.5 py-0.5 bg-amber-400/20 text-amber-400 text-[10px] rounded-full font-bold">{t.count}</span>
              )}
            </button>
          );
        })}
        {hasPositions && (
          <div className="ml-auto pr-4 flex-shrink-0 text-[11px] flex items-center gap-2">
            <span className="text-white/25">Unrealized:</span>
            <span className={cn('font-mono font-bold tabular-nums', hasPnlPositive ? 'text-emerald-400' : 'text-red-400')}>
              {hasPnlPositive ? '+' : ''}{totalPnl.toFixed(2)} USDT
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto scrollbar-thin">
        {tab === 'positions' && (
          !hasPositions ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-white/25">
              <AlertTriangle className="w-8 h-8 opacity-30" />
              <p className="text-[12px]">No open positions — place a trade to get started</p>
            </div>
          ) : (
            <>
              {/* Desktop table (md+) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-[11px] min-w-[880px]">
                  <thead className="sticky top-0 bg-card z-10">
                    <tr className="text-white/25 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                      {['Symbol','Side','Qty','Entry','Mark','Liq. Price','Margin','Leverage','Unr. PnL','TP / SL','Close'].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map(pos => {
                      const mp      = pos.coinId === coin.id ? price : pos.entryPrice;
                      const { rawPnl, pnlPct } = calcPositionPnl(pos, mp);
                      const isLong  = pos.side === 'long';
                      const liqFact = isLong ? (1 - 1 / pos.leverage * 0.9) : (1 + 1 / pos.leverage * 0.9);
                      const liqPx   = pos.entryPrice * liqFact;
                      const isPnlPos = rawPnl >= 0;
                      const hasTp    = pos.takeProfit !== undefined;
                      const hasSl    = pos.stopLoss !== undefined;
                      return (
                        <tr key={pos.id} className="border-b hover:bg-white/[0.02] transition-colors"
                          style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                          <td className="px-3 py-2">
                            <span className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full" style={{ background: pos.color }} />
                              {pos.symbol}/USDT
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold',
                              isLong ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400')}>
                              {isLong ? 'Long' : 'Short'}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono">{pos.quantity.toFixed(4)}</td>
                          <td className="px-3 py-2 font-mono text-white/60">{fmtP(pos.entryPrice)}</td>
                          <td className="px-3 py-2 font-mono text-white/80">{fmtP(mp)}</td>
                          <td className="px-3 py-2 font-mono text-orange-400">{fmtP(liqPx)}</td>
                          <td className="px-3 py-2 font-mono text-white/50">{pos.costBasis.toFixed(2)}</td>
                          <td className="px-3 py-2">
                            <LeverageEditor position={pos} onUpdate={updateLeverage} />
                          </td>
                          <td className="px-3 py-2">
                            <span className={cn('font-mono font-semibold', isPnlPos ? 'text-emerald-400' : 'text-red-400')}>
                              {isPnlPos ? '+' : ''}{rawPnl.toFixed(2)}
                              <span className="text-[10px] opacity-70 ml-1">({pnlPct.toFixed(2)}%)</span>
                            </span>
                          </td>
                          <td className="px-3 py-2 text-white/30 text-[10px]">
                            {hasTp ? 'TP: ' + fmtP(pos.takeProfit as number) : '—'}
                            {hasSl ? ' SL: ' + fmtP(pos.stopLoss as number) : ''}
                          </td>
                          <td className="px-3 py-2 flex items-center gap-1.5">
                            <button onClick={() => reversePosition(pos, mp)}
                              className="px-2.5 py-1 bg-amber-500/15 hover:bg-amber-500/30 text-amber-400 rounded-lg text-[10px] font-semibold transition-colors"
                              title="Reverse position (close current and open opposite)">
                              🔄 Reverse
                            </button>
                            <button onClick={() => closePosition(pos.id, mp)}
                              className="px-2.5 py-1 bg-red-500/15 hover:bg-red-500/30 text-red-400 rounded-lg text-[10px] font-semibold transition-colors">
                              Close
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* Mobile cards (below md) — stacked vertical layout, no horizontal scroll */}
              <div className="md:hidden space-y-3 p-2">
                {positions.map(pos => {
                  const mp      = pos.coinId === coin.id ? price : pos.entryPrice;
                  const { rawPnl } = calcPositionPnl(pos, mp);
                  const isLong  = pos.side === 'long';
                  const isPnlPos = rawPnl >= 0;
                  const hasTp    = pos.takeProfit !== undefined;
                  const hasSl    = pos.stopLoss !== undefined;
                  return (
                    <div key={pos.id} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                      {/* Row 1: Symbol + Direction + Leverage + PnL */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: pos.color }} />
                          <span className="text-[13px] font-bold truncate">{pos.symbol}/USDT</span>
                          <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0',
                            isLong ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400')}>
                            {isLong ? 'Long' : 'Short'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[11px] font-mono font-bold text-amber-400 tabular-nums">{pos.leverage}x</span>
                          <span className={cn('text-[13px] font-mono font-bold tabular-nums', isPnlPos ? 'text-emerald-400' : 'text-red-400')}>
                            {isPnlPos ? '+' : ''}{rawPnl.toFixed(2)}
                          </span>
                        </div>
                      </div>
                      {/* Row 2: Entry | Mark | SL | TP */}
                      <div className="grid grid-cols-4 gap-2 mb-2 text-[10px]">
                        <div>
                          <span className="text-white/30 block">Entry</span>
                          <span className="font-mono text-white/70 tabular-nums">{fmtP(pos.entryPrice)}</span>
                        </div>
                        <div>
                          <span className="text-white/30 block">Mark</span>
                          <span className="font-mono text-white/80 tabular-nums">{fmtP(mp)}</span>
                        </div>
                        <div>
                          <span className="text-white/30 block">SL</span>
                          <span className="font-mono tabular-nums">{hasSl ? fmtP(pos.stopLoss as number) : '—'}</span>
                        </div>
                        <div>
                          <span className="text-white/30 block">TP</span>
                          <span className="font-mono tabular-nums">{hasTp ? fmtP(pos.takeProfit as number) : '—'}</span>
                        </div>
                      </div>
                      {/* Row 3: Actions */}
                      <div className="flex items-center gap-2">
                        <LeverageEditor position={pos} onUpdate={updateLeverage} />
                        <span className="flex-1" />
                        <button onClick={() => reversePosition(pos, mp)}
                          className="min-h-11 px-3 py-2 bg-amber-500/15 hover:bg-amber-500/30 text-amber-400 rounded-xl text-[12px] font-semibold transition-colors">
                          🔄 Reverse
                        </button>
                        <button onClick={() => closePosition(pos.id, mp)}
                          className="min-h-11 px-4 py-2 bg-red-500/15 hover:bg-red-500/30 text-red-400 rounded-xl text-[12px] font-semibold transition-colors">
                          Close
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )
        )}
        {tab === 'positions' && hasPositions && (
          <div className="px-4 py-2 bg-amber-400/5 border-t border-amber-400/10">
            <p className="text-[10px] text-amber-400/70 flex items-center gap-1.5">
              <HelpCircle className="w-3 h-3" />
              Positions are derivatives (futures). P&L is unrealized until closed.
            </p>
          </div>
        )}

        {tab === 'orders' && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-white/25">
            <Activity className="w-7 h-7 opacity-30" />
            <p className="text-[12px]">No active limit orders</p>
            <p className="text-[10px]">Switch to Pro+ and use Limit orders</p>
          </div>
        )}

        {tab === 'history' && (
          <div className="flex flex-col h-full">
            <div className="flex items-center gap-2 px-3 py-2 border-b flex-shrink-0"
              style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              <Search className="w-3.5 h-3.5 text-white/25" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter by symbol…"
                className="flex-1 bg-transparent text-[11px] text-white/60 outline-none placeholder-white/20" />
              {hasSearch && (
                <button onClick={() => setSearch('')} className="text-white/25">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {!hasHistory ? (
              <div className="flex items-center justify-center flex-1 text-white/25 text-[12px]">No trades yet</div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-[11px] min-w-[600px]">
                    <thead className="sticky top-0 bg-card">
                      <tr className="text-white/25 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                        {['Symbol','Action','Side','Qty','Entry','Exit','PnL','Fee','Time'].map(h => (
                          <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHistory.map(h => {
                        const isPnlPos  = h.pnl >= 0;
                        const isOpen    = h.action === 'open';
                        const isLong    = h.side === 'long';
                        const hasExit   = h.exitPrice !== undefined;
                        return (
                          <tr key={h.id} className="border-b hover:bg-white/[0.02]"
                            style={{ borderColor: 'rgba(255,255,255,0.03)' }}>
                            <td className="px-3 py-1.5">
                              <span className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full" style={{ background: h.color }} />
                                {h.symbol}
                              </span>
                            </td>
                            <td className="px-3 py-1.5">
                              <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold',
                                isOpen ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400')}>
                                {h.action}
                              </span>
                            </td>
                            <td className="px-3 py-1.5">
                              <span className={cn('text-[10px] font-bold', isLong ? 'text-emerald-400' : 'text-red-400')}>
                                {h.side}
                              </span>
                            </td>
                            <td className="px-3 py-1.5 font-mono text-white/50">{h.quantity.toFixed(4)}</td>
                            <td className="px-3 py-1.5 font-mono text-white/50">{fmtP(h.entryPrice)}</td>
                            <td className="px-3 py-1.5 font-mono text-white/40">{hasExit ? fmtP(h.exitPrice as number) : '—'}</td>
                            <td className="px-3 py-1.5">
                              <span className={cn('font-mono font-semibold', isPnlPos ? 'text-emerald-400' : 'text-red-400')}>
                                {isPnlPos ? '+' : ''}{h.pnl.toFixed(2)}
                              </span>
                            </td>
                            <td className="px-3 py-1.5 font-mono text-white/30">{h.fee.toFixed(4)}</td>
                            <td className="px-3 py-1.5 text-white/30">{h.timestamp}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {/* Mobile cards */}
                <div className="md:hidden space-y-2 p-2">
                  {filteredHistory.map(h => {
                    const isPnlPos  = h.pnl >= 0;
                    const isOpen    = h.action === 'open';
                    const isLong    = h.side === 'long';
                    const hasExit   = h.exitPrice !== undefined;
                    return (
                      <div key={h.id} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: h.color }} />
                            <span className="text-[13px] font-bold truncate">{h.symbol}</span>
                            <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold flex-shrink-0',
                              isOpen ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400')}>
                              {h.action}
                            </span>
                            <span className={cn('text-[10px] font-bold flex-shrink-0', isLong ? 'text-emerald-400' : 'text-red-400')}>
                              {h.side}
                            </span>
                          </div>
                          <span className={cn('text-[13px] font-mono font-bold tabular-nums flex-shrink-0', isPnlPos ? 'text-emerald-400' : 'text-red-400')}>
                            {isPnlPos ? '+' : ''}{h.pnl.toFixed(2)}
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-2 text-[10px]">
                          <div><span className="text-white/30 block">Qty</span><span className="font-mono text-white/50 tabular-nums">{h.quantity.toFixed(4)}</span></div>
                          <div><span className="text-white/30 block">Entry</span><span className="font-mono text-white/50 tabular-nums">{fmtP(h.entryPrice)}</span></div>
                          <div><span className="text-white/30 block">Exit</span><span className="font-mono text-white/40 tabular-nums">{hasExit ? fmtP(h.exitPrice as number) : '—'}</span></div>
                          <div><span className="text-white/30 block">Fee</span><span className="font-mono text-white/30 tabular-nums">{h.fee.toFixed(4)}</span></div>
                        </div>
                        <div className="text-[10px] text-white/25 mt-1">{h.timestamp}</div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'perf' && (() => {
          const closed = history.filter(h => h.action === 'close');
          if (closed.length === 0) {
            return (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-white/25">
                <AlertTriangle className="w-7 h-7 opacity-30" />
                <p className="text-[12px]">No closed trades yet</p>
              </div>
            );
          }
          const winners = closed.filter(r => r.pnl > 0);
          const losers  = closed.filter(r => r.pnl < 0);
          const winRate = (winners.length / closed.length) * 100;
          const totalPnl = closed.reduce((s, r) => s + r.pnl, 0);
          const avgWin  = winners.length > 0 ? winners.reduce((s, r) => s + r.pnl, 0) / winners.length : 0;
          const avgLoss = losers.length  > 0 ? Math.abs(losers.reduce((s, r) => s + r.pnl, 0) / losers.length) : 0;
          const profitFactor = avgLoss > 0 ? (avgWin * winners.length) / (avgLoss * losers.length) : (winners.length > 0 ? 999 : 0);
          // history is newest-first; walk chronologically to build the equity curve
          const equityCurve = [...closed].reverse().reduce<number[]>((curve, r) => {
            curve.push(curve[curve.length - 1] + r.pnl);
            return curve;
          }, [100_000]);
          return (
            <div className="p-4 space-y-4 text-[11px]">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Equity Curve</span>
                  <span className={cn('text-[11px] font-mono font-bold tabular-nums', totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                    {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)} USDT since start
                  </span>
                </div>
                <EquityCurveChart points={equityCurve} formatValue={v => v.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' USDT'} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Total Trades', value: closed.length.toString() },
                  { label: 'Win Rate', value: `${winRate.toFixed(1)}%`, cls: winRate >= 50 ? 'text-emerald-400' : 'text-red-400' },
                  { label: 'Total P&L', value: `${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)} USDT`, cls: totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400' },
                  { label: 'Profit Factor', value: profitFactor === 999 ? '—' : profitFactor.toFixed(2), cls: profitFactor >= 1.5 ? 'text-emerald-400' : profitFactor >= 1 ? 'text-amber-400' : 'text-red-400' },
                ].map(({ label, value, cls }) => (
                  <div key={label} className="bg-white/[0.03] border border-white/[0.05] rounded-xl p-3 text-center">
                    <p className={cn('text-lg font-black font-mono tabular-nums', cls ?? 'text-white/80')}>{value}</p>
                    <p className="text-[10px] text-white/40 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {tab === 'strategy' && level !== 'simple' && (
          <div className="p-3">
            <StrategyBuilderPanel coinId={coin.id} coinSymbol={coin.symbol} currentPrice={price} />
          </div>
        )}

        {tab === 'wallet' && (
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { l: 'Available Balance', v: balance.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' USDT', Icon: Wallet,    c: 'text-white/80' },
                { l: 'In Positions',      v: positions.reduce((a, p) => a + p.costBasis, 0).toFixed(2) + ' USDT',        Icon: Activity,  c: 'text-amber-400' },
                { l: 'Unrealized PnL',   v: (hasPnlPositive ? '+' : '') + totalPnl.toFixed(2) + ' USDT',                 Icon: TrendingUp, c: hasPnlPositive ? 'text-emerald-400' : 'text-red-400' },
              ].map(({ l, v, Icon, c }) => (
                <div key={l} className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.05]">
                  <div className="flex items-center gap-1.5 text-white/30 mb-2 text-[10px]">
                    <Icon className="w-3 h-3" />{l}
                  </div>
                  <p className={cn('font-mono font-bold tabular-nums text-[14px]', c)}>{v}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-white/[0.03] rounded-xl p-3 border border-white/[0.05]">
                <p className="text-[11px] text-white/30 mb-1">Practice Account</p>
                <p className="text-[12px] text-white/60">Virtual trading with $100,000. No real money involved.</p>
              </div>
              <button onClick={() => window.location.href = '/buy-cp'}
                className="flex items-center gap-2 px-4 py-3 bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/20 text-amber-400 rounded-xl text-[12px] font-semibold transition-colors mr-2 md:mr-44">
                <Wallet className="w-4 h-4" /> Top Up
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main ProDashboard ─────────────────────────────────────────────────────────
export function ProDashboard() {
  const { level, setLevel } = useTradingLevelStore();
  const { history, positions } = useTradingStore();
  const { alerts } = usePriceAlertStore();

  const [coin, setCoin]       = useState<CoinInfo>({ id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', color: '#F7931A' });
  const [price, setPrice]     = useState(() => getBase('bitcoin'));
  const [prev,  setPrev]      = useState(() => getBase('bitcoin'));
  const [change24h, setChange24h] = useState(-0.42);
  const [high24h,   setHigh24h]   = useState(() => getBase('bitcoin') * 1.035);
  const [low24h,    setLow24h]    = useState(() => getBase('bitcoin') * 0.962);
  const [vol24h,    setVol24h]    = useState(() => getBase('bitcoin') * 12000);
  // Order book now lives on the SAME price tick as everything else, instead
  // of OrderBook.tsx's own independent 800ms interval — this was the
  // "OrderBook and Dashboard use separate simulation intervals" drift bug
  // flagged in the trading-simulator audit. Passing it down as
  // `externalBook` makes OrderBook.tsx skip its local timer entirely
  // (see OrderBook.tsx's `externalBook !== undefined` branch).
  const [book, setBook] = useState<OBType | null>(() => generateOrderBook(getBase('bitcoin')));
  const [searchOpen, setSearchOpen] = useState(false);
  const [alertOpen,  setAlertOpen]  = useState(false);
  const [rightTab,   setRightTab]   = useState<'trade' | 'book'>('trade');
  const [showWL,     setShowWL]     = useState(true);
  const [highlight,  setHighlight]  = useState<string | null>(null);

  // ── Responsive terminal layout ─────────────────────────────────────────
  // <768px:  full mobile redesign — a single pane switched via tab bar
  //          (Chart / Order Book / Trade / More), since the desktop's
  //          side-by-side panels (280px order panel + 180px watchlist +
  //          272px Trading School) can't fit a phone screen at all.
  // 768-1024px (tablet): keep the desktop Chart + Order-panel layout (the
  //          order panel already has its own internal Trade/Book tabs), but
  //          drop the Watchlist and Trading School side columns so the
  //          chart isn't squeezed to nothing.
  // >=1024px: unchanged desktop 4-column layout.
  const isMobile = useIsMobile(768);
  const isNarrow = useIsMobile(1024); // true for both mobile and tablet widths
  const [mobileTab, setMobileTab] = useState<'chart' | 'book' | 'trade' | 'more'>('chart');

  // Guided practice
  const tradeCount = history.length;
  const practice   = useGuidedPractice(tradeCount);

  // Guided practice field satisfaction tracking
  const [gpAmtSet,  setGpAmtSet]  = useState(false);
  const [gpSlSet,   setGpSlSet]   = useState(false);
  const [gpTpSet,   setGpTpSet]   = useState(false);
  const [gpBuyDone, setGpBuyDone] = useState(false);
  const [gpCoinChanged, setGpCoinChanged] = useState(false);

  // Reset field flags when step changes
  const gpStep = practice.state.step;
  useEffect(() => {
    setGpAmtSet(false); setGpSlSet(false); setGpTpSet(false);
    setGpBuyDone(false);
  }, [gpStep]);

  const gpStepSatisfied = (() => {
    if (!practice.state.active) return false;
    if (practice.state.step === 'coin')       return gpCoinChanged;
    if (practice.state.step === 'amount')     return gpAmtSet;
    if (practice.state.step === 'stopLoss')   return gpSlSet;
    if (practice.state.step === 'takeProfit') return gpTpSet;
    if (practice.state.step === 'execute')    return gpBuyDone;
    return false;
  })();

  // Order book click-to-fill state
  const [obFillPrice,  setObFillPrice]  = useState<number | null>(null);
  const [obFillAmount, setObFillAmount] = useState<number | null>(null);

  const handleObSelectPrice = useCallback((p: number) => {
    setObFillPrice(p);
    setRightTab('trade');
    setMobileTab('trade');
  }, []);
  const handleObSelectAmount = useCallback((a: number) => {
    setObFillAmount(a);
    setRightTab('trade');
    setMobileTab('trade');
  }, []);

  const priceRef = useRef(price);
  priceRef.current = price;
  // Declared here (before the tick effect below) so the tick's setInterval
  // closure can check it; kept in sync via an effect once wsConnected
  // exists further down. Refs read their latest .current at call time
  // regardless of where in the component they're declared, but keeping it
  // near priceRef makes the "who wins" precedence readable in one place.
  const wsConnectedRef = useRef(false);

  // GlobalPriceEngine subscription — replaces the old 1-second simulated
  // tick. The engine aggregates CoinGecko / Binance WS / simulation into
  // one feed and forwards every price through the GlobalPositionMonitor.
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

  // CoinGecko live price — now sourced from the same shared
  // useLiveCoinGeckoPrice hook that Dashboard.tsx uses (which itself wraps
  // liveMarketService.fetchLivePrices), instead of a locally re-implemented
  // poll loop. Behavior is unchanged: still applies live data on top of the
  // simulated tick whenever a fresh price arrives.
  const { live: liveCg } = useLiveCoinGeckoPrice(coin.id, 5_000);
  useEffect(() => {
    if (!liveCg || wsConnectedRef.current) return;
    setPrev(priceRef.current);
    setPrice(liveCg.usd);
    setBook(generateOrderBook(liveCg.usd));
    setChange24h(liveCg.usd_24h_change);
    setHigh24h(h => Math.max(h, liveCg.usd));
    setLow24h(l  => Math.min(l, liveCg.usd));
    setVol24h(liveCg.usd_24h_vol);
    // alerts moved to GlobalPositionMonitor (fed by GlobalPriceEngine)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveCg]);

  // ── Optional WebSocket live feed (priority #5 — ported from the retired
  // Dashboard.tsx terminal, this is the only push-based, not-polled data
  // source in the app). Off by default; only takes effect when the user
  // toggles it on AND the current coin has a Binance USDT market. Highest
  // priority of the three price sources when connected — overrides both
  // the simulated tick and the CoinGecko poll, same as it did before.
  const [wsEnabled, setWsEnabled] = useState(() => {
    try { return localStorage.getItem('cv_ws_feed_enabled') === 'true'; }
    catch { return false; }
  });
  const binanceSymbol = useMemo(() => getBinanceSymbol(coin.id), [coin.id]);
  const { connected: wsConnected, ticker: wsTicker, book: wsBook } = useBinanceLiveFeed(binanceSymbol, wsEnabled);
  wsConnectedRef.current = wsConnected;

  const toggleWsFeed = useCallback(() => {
    setWsEnabled(prev => {
      const next = !prev;
      try { localStorage.setItem('cv_ws_feed_enabled', String(next)); } catch {}
      return next;
    });
  }, []);

  useEffect(() => {
    if (!wsConnected || !wsTicker) return;
    setPrev(priceRef.current);
    setPrice(wsTicker.price);
    setHigh24h(wsTicker.high24h);
    setLow24h(wsTicker.low24h);
    setVol24h(wsTicker.volumeQuote);
    setChange24h(wsTicker.changePct24h);
    // alerts moved to GlobalPositionMonitor
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsConnected, wsTicker]);

  useEffect(() => {
    if (wsConnected && wsBook) setBook(wsBook);
  }, [wsConnected, wsBook]);

  const handleCoinSelect = useCallback((c: CoinInfo) => {
    const base = getBase(c.id);
    setCoin(c); setPrice(base); setPrev(base);
    setBook(generateOrderBook(base));
    setChange24h((Math.random() - 0.5) * 8);
    setHigh24h(base * 1.035);
    setLow24h(base * 0.962);
    setVol24h(base * 12000);
    setGpCoinChanged(true);
    // Now that this terminal has drawing tools (via TradingChart), clear
    // stale drawings on coin switch — otherwise BTC trendlines would show
    // up on the SOL chart, a bug the original audit already caught once
    // in Dashboard.tsx and which this migration would otherwise reintroduce.
    try { (useDrawingStore.getState() as any).clearAll?.(); } catch {}
  }, []);

  // All booleans extracted — never use > inside JSX markup
  const isUp       = price >= prev;
  const isUp24     = change24h >= 0;
  const hasAlerts  = alerts.filter(a => a.coinId === coin.id && a.status === 'active').length > 0;
  const alertCount = alerts.filter(a => a.coinId === coin.id && a.status === 'active').length;

  // Watchlist fix (audit): the previous version mapped the raw CoinGecko
  // /coins/list response (~17k coins, alphabetical by id), so the visible
  // rows were junk-named tokens ("000", "0x...", binary-named memecoins),
  // and LiveCoin has no `color` field so every bullet dot was undefined.
  // The curated COINS list (with brand colors) is the right source for the
  // watchlist; the full CoinGecko list remains available via coin search.
  const tradeable = useMemo(() => {
    const excludedSymbols = ['USDT', 'USDC', 'STETH', 'DAI', 'BUSD', 'FRAX', 'TUSD', 'WBTC'];
    return COINS.filter(c => !excludedSymbols.includes(c.symbol));
  }, []);

  // Stable simulated 24h changes — previously `(Math.random()-0.48)*6` was
  // evaluated inside the render loop, so every watchlist row's % flickered
  // to a new random value on every price tick (once per second).
  const wlChanges = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of tradeable) m[c.id] = (Math.random() - 0.48) * 6;
    return m;
  }, [tradeable]);

  // Position entry markers for the chart — same shape TradingChart already
  // renders in Dashboard.tsx, now shared here too.
  const entryPrices = useMemo(
    () => positions.filter(p => p.coinId === coin.id).map(p => ({ entryPrice: p.entryPrice, side: p.side, color: p.color })),
    [positions, coin.id],
  );

  return (
    <div className="flex flex-col h-full overflow-hidden"
      style={{ background: 'var(--cv-dash-bg)', color: 'var(--cv-dash-text)', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* ═══ HEADER ═══ */}
      <div className="flex items-center gap-3 px-3 border-b flex-shrink-0 overflow-x-auto scrollbar-none"
        style={{ height: 56, borderColor: 'var(--cv-dash-divider)', background: 'var(--cv-dash-header-bg)' }}>

        <button
          data-guide="coin-selector"
          onClick={() => setSearchOpen(true)}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/[0.05] transition-colors',
            highlight === 'header-pair' && 'ring-2 ring-amber-400/50',
          )}>
          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: coin.color }} />
          <span className="text-[16px] font-bold">{coin.symbol}/USDT</span>
          <span className="text-[10px] text-white/25 px-1.5 py-0.5 bg-white/[0.06] rounded-md">Perp</span>
          <ChevronDown className="w-3.5 h-3.5 text-white/30" />
          <Search className="w-3 h-3 text-white/25" />
        </button>

        <div className="w-px h-7 bg-white/[0.06]" />

        <div className="flex-shrink-0">
          <motion.div key={Math.round(price * 100)} initial={{ opacity: 0.5 }} animate={{ opacity: 1 }}
            className={cn('text-[22px] font-bold tabular-nums', isUp ? 'text-emerald-400' : 'text-red-400')}>
            {fmtP(price)}
          </motion.div>
          <div className={cn('text-[11px] font-semibold tabular-nums', isUp24 ? 'text-emerald-400' : 'text-red-400')}>
            {isUp24 ? '▲' : '▼'} {Math.abs(change24h).toFixed(2)}%
          </div>
        </div>

        <div className="w-px h-7 bg-white/[0.06]" />

        <div className="flex items-center gap-5 overflow-x-auto scrollbar-none flex-1">
          {[
            { l: '24h High', v: fmtP(high24h), c: 'text-emerald-400/80' },
            { l: '24h Low',  v: fmtP(low24h),  c: 'text-red-400/80' },
            { l: '24h Vol',  v: (vol24h / 1e6).toFixed(2) + 'M USDT', c: 'text-white/50' },
          ].map(({ l, v, c }) => (
            <div key={l} className="flex-shrink-0">
              <div className="text-[9px] text-white/25">{l}</div>
              <div className={cn('text-[12px] font-semibold tabular-nums mt-0.5', c)}>{v}</div>
            </div>
          ))}
        </div>

        {/* WebSocket live feed toggle — only shown for Binance-listed coins */}
        {binanceSymbol && (
          <button onClick={toggleWsFeed}
            title={wsEnabled ? 'Disable real-time WebSocket feed' : 'Enable real-time WebSocket feed (Binance, beta)'}
            className={cn('hidden md:flex items-center gap-1 px-2 py-1.5 rounded-xl border text-[10px] font-bold transition-all flex-shrink-0',
              wsEnabled
                ? (wsConnected ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-400' : 'border-amber-400/30 bg-amber-400/10 text-amber-400')
                : 'border-white/[0.08] bg-white/[0.04] text-white/40 hover:text-white/70')}>
            🔌 {wsEnabled ? (wsConnected ? 'WS Live' : 'Connecting…') : 'WS Feed'}
          </button>
        )}
        <span className={cn('hidden lg:flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] font-semibold whitespace-nowrap flex-shrink-0',
          wsConnected ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-400'
            : liveCg ? 'border-cyan-400/20 bg-cyan-400/10 text-cyan-400'
            : 'border-amber-400/20 bg-amber-400/10 text-amber-400')}>
          {wsConnected ? '🟢 Live (WebSocket)' : liveCg ? '🟡 Live (CoinGecko)' : '📡 Paper Trading'}
        </span>

        {/* Level switcher */}
        <div className="flex items-center gap-1 bg-white/[0.04] rounded-xl p-1 border border-white/[0.06]">
          {LEVELS.map(lv => {
            const isActive = level === lv.id;
            return (
              <button key={lv.id} onClick={() => setLevel(lv.id)} title={lv.desc}
                style={isActive ? { background: lv.color + '22', color: lv.color } : {}}
                className={cn('px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all',
                  isActive ? '' : 'text-white/25 hover:text-white/60')}>
                {lv.label}
              </button>
            );
          })}
        </div>

        {/* Guided Practice button — Simple level only */}
        {level === 'simple' && (
          <GuidedPracticeButton
            onClick={practice.start}
            disabled={tradeCount > 3}
            isActive={practice.state.active}
          />
        )}

        {/* Alert bell */}
        <button onClick={() => setAlertOpen(true)}
          className={cn('flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold transition-all',
            hasAlerts
              ? 'border-amber-400/30 bg-amber-400/10 text-amber-400'
              : 'border-white/[0.07] text-white/30 hover:text-white/60')}>
          <Bell className="w-3.5 h-3.5" />
          {hasAlerts && (
            <span className="w-4 h-4 bg-amber-400 text-black text-[9px] font-bold rounded-full flex items-center justify-center">
              {alertCount}
            </span>
          )}
        </button>
      </div>

      {isMobile ? (
        /* ═══ MOBILE LAYOUT (<768px) ═══════════════════════════════════════
         * Single pane, switched via a tab bar, instead of the desktop's
         * side-by-side panels. Reuses the exact same components/state as
         * desktop (TradingChart, OrderBook, ProTradePanel, ProBottomPanel) —
         * just one shown at a time, each given the full width and most of
         * the remaining height. */
        <div className="mobile-trading flex-1 min-h-0 safe-bottom">
          <MobileTabBar
            tabs={[
              { id: 'chart', label: 'Chart',      emoji: '📊' },
              { id: 'book',  label: 'Order Book', emoji: '📖' },
              { id: 'trade', label: 'Trade',      emoji: '💰' },
              { id: 'more',  label: 'More',       emoji: '📋' },
            ]}
            activeTab={mobileTab}
            onChange={(id) => setMobileTab(id as typeof mobileTab)}
          />
          <div className="tab-content">
            {mobileTab === 'chart' && (
              <div className="flex flex-col overflow-hidden" style={{ height: 'calc(100dvh - 200px)', maxHeight: 500 }}>
                <ChartErrorBoundary label="Trading Chart">
                  <TradingChart
                    coinId={coin.id}
                    coinSymbol={coin.symbol}
                    coinColor={coin.color}
                    basePrice={getBase(coin.id)}
                    currentPrice={price}
                    prevPrice={prev}
                    priceChange24h={change24h}
                    high24h={high24h}
                    low24h={low24h}
                    vol24h={vol24h}
                    orderBook={book}
                    positions={entryPrices}
                    beginnerMode={level === 'simple'}
                    showTickerBar={false}
                    compact
                  />
                </ChartErrorBoundary>
              </div>
            )}

            {mobileTab === 'book' && (
              <ChartErrorBoundary label="Order Book">
                <OrderBook
                  currentPrice={price}
                  prevPrice={prev}
                  coinSymbol={coin.symbol}
                  externalBook={book}
                  dataSource={wsConnected ? 'live' : 'sim'}
                  dense
                  callbacks={{
                    onSelectPrice: handleObSelectPrice,
                    onSelectAmount: handleObSelectAmount,
                  }}
                />
              </ChartErrorBoundary>
            )}

            {mobileTab === 'trade' && (
              <ChartErrorBoundary label="Order Panel">
                <ProTradePanel
                  coin={coin} price={price} prev={prev} level={level}
                  fillPrice={obFillPrice} fillAmount={obFillAmount}
                  onGuidedAmountSet={practice.isStep('amount')   ? (v => setGpAmtSet(v.trim().length > 0))  : undefined}
                  onGuidedSlSet=    {practice.isStep('stopLoss') ? (v => setGpSlSet(v.trim().length > 0))   : undefined}
                  onGuidedTpSet=    {practice.isStep('takeProfit') ? (v => setGpTpSet(v.trim().length > 0)) : undefined}
                  onGuidedBuy=      {practice.isStep('execute')  ? (() => setGpBuyDone(true))               : undefined}
                />
              </ChartErrorBoundary>
            )}

            {mobileTab === 'more' && (
              <ChartErrorBoundary label="Positions & History">
                <ProBottomPanel coin={coin} price={price} />
              </ChartErrorBoundary>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* ═══ BODY (tablet + desktop, >=768px) ═══ */}
          <div className="flex flex-1 min-h-0 overflow-hidden">

            {/* Chart */}
            <div className={cn('flex-1 min-w-0 flex flex-col overflow-hidden border-r',
                highlight === 'chart-area' && 'ring-2 ring-amber-400/40 ring-inset')}
              style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              <ChartErrorBoundary label="Trading Chart">
                <TradingChart
                  coinId={coin.id}
                  coinSymbol={coin.symbol}
                  coinColor={coin.color}
                  basePrice={getBase(coin.id)}
                  currentPrice={price}
                  prevPrice={prev}
                  priceChange24h={change24h}
                  high24h={high24h}
                  low24h={low24h}
                  vol24h={vol24h}
                  orderBook={book}
                  positions={entryPrices}
                  beginnerMode={level === 'simple'}
                  showTickerBar={false}
                  compact={isNarrow}
                />
              </ChartErrorBoundary>
            </div>

            {/* Right panel */}
            <div className="flex-shrink-0 flex flex-col overflow-hidden border-r"
              style={{ width: 280, background: 'var(--cv-dash-panel-bg)', borderColor: 'var(--cv-dash-divider)' }}>
              <div className="flex border-b flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                {([
                  { id: 'trade', label: 'Place Order', Icon: Zap },
                  { id: 'book',  label: 'Order Book',  Icon: BarChart2 },
                ] as const).map(({ id, label, Icon }) => {
                  const isActive = rightTab === id;
                  return (
                    <button key={id} onClick={() => setRightTab(id)}
                      className={cn('flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-semibold transition-colors border-b-2',
                        isActive ? 'border-amber-400 text-amber-400' : 'border-transparent text-white/30 hover:text-white/60')}>
                      <Icon className="w-3.5 h-3.5" />{label}
                    </button>
                  );
                })}
              </div>
              <div className={cn('flex-1 overflow-y-auto scrollbar-thin',
                highlight === 'trade-panel' && 'ring-2 ring-amber-400/40 ring-inset')}>
                <ChartErrorBoundary label="Order Panel">
                  {rightTab === 'trade'
                    ? <ProTradePanel
                        coin={coin} price={price} prev={prev} level={level}
                        fillPrice={obFillPrice} fillAmount={obFillAmount}
                        onGuidedAmountSet={practice.isStep('amount')   ? (v => setGpAmtSet(v.trim().length > 0))  : undefined}
                        onGuidedSlSet=    {practice.isStep('stopLoss') ? (v => setGpSlSet(v.trim().length > 0))   : undefined}
                        onGuidedTpSet=    {practice.isStep('takeProfit') ? (v => setGpTpSet(v.trim().length > 0)) : undefined}
                        onGuidedBuy=      {practice.isStep('execute')  ? (() => setGpBuyDone(true))               : undefined}
                      />
                    : <OrderBook
                        currentPrice={price}
                        prevPrice={prev}
                        coinSymbol={coin.symbol}
                        externalBook={book}
                        dataSource={wsConnected ? 'live' : 'sim'}
                        callbacks={{
                          onSelectPrice: handleObSelectPrice,
                          onSelectAmount: handleObSelectAmount,
                        }}
                      />}
                </ChartErrorBoundary>
              </div>
            </div>

            {/* Watchlist + Trading School — desktop only (>=1024px). At
                tablet widths (768-1024px) these are dropped so the chart and
                order panel above aren't squeezed into a sliver; Chart +
                Order Panel (which already has its own Trade/Book tabs)
                reads as the "two panels + tabs" tablet layout. */}
            {!isNarrow && (
              <>
                {showWL ? (
                  <div className="flex-shrink-0 border-r overflow-hidden flex flex-col"
                    style={{ width: 180, borderColor: 'rgba(255,255,255,0.06)', background: '#0b0e14' }}>
                    <div className="flex items-center gap-2 px-3 py-2 border-b flex-shrink-0"
                      style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                      <Star className="w-3 h-3 text-amber-400" />
                      <span className="text-[10px] text-white/40 font-semibold flex-1">Watchlist</span>
                      <button onClick={() => setShowWL(false)} className="text-white/15 hover:text-white/40">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto scrollbar-thin">
                      {tradeable.map(c => {
                        const isActive = c.id === coin.id;
                        const chg = wlChanges[c.id] ?? 0;
                        const isPos = chg >= 0;
                        return (
                          <button key={c.id} onClick={() => handleCoinSelect(c)}
                            className={cn('w-full flex items-center px-3 py-2 hover:bg-white/[0.04] transition-colors',
                              isActive && 'bg-white/[0.06]')}>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.color }} />
                                <span className={cn('text-[12px] font-semibold truncate', isActive ? 'text-white' : 'text-white/60')}>
                                  {c.symbol}
                                </span>
                              </div>
                            </div>
                            <span className={cn('text-[10px] font-semibold tabular-nums', isPos ? 'text-emerald-400' : 'text-red-400')}>
                              {isPos ? '+' : ''}{chg.toFixed(2)}%
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setShowWL(true)}
                    className="flex-shrink-0 w-8 flex items-center justify-center bg-secondary border-r text-white/20 hover:text-amber-400 transition-colors"
                    style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    <Star className="w-3.5 h-3.5" />
                  </button>
                )}

                <TradingSchool onHighlight={setHighlight} />
              </>
            )}
          </div>

          {/* ═══ BOTTOM (tablet + desktop) ═══ */}
          <div className="flex-shrink-0 border-t" style={{ height: 215, borderColor: 'rgba(255,255,255,0.06)' }}>
            <ChartErrorBoundary label="Positions & History">
              <ProBottomPanel coin={coin} price={price} />
            </ChartErrorBoundary>
          </div>
        </>
      )}

      {/* ═══ OVERLAYS ═══ */}
      <CoinSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} onSelect={handleCoinSelect} />
      <PriceAlertPanel open={alertOpen} onClose={() => setAlertOpen(false)} coin={coin as any} currentPrice={price} />
      <AlertToastStack />

      {/* Guided Practice overlay — portal-style, fixed positioning */}
      <GuidedPracticeOverlay
        practice={practice}
        stepSatisfied={gpStepSatisfied}
      />
    </div>
  );
}
