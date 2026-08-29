/**
 * MobileTradePanel.tsx - Mobile-optimized trade panel with Market/Limit/Stop-Limit support.
 */

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { useTradingStore } from '@/lib/tradingStore';
import { useTradingLevelStore } from '@/lib/tradingLevelStore';
import { checkDailyTradeLimit, recordDailyTrade } from '@/lib/dailyTradeLimit';
import { placeOrder } from '@/lib/orderEngine';
import { Wallet, CheckCircle, XCircle, Link2 } from 'lucide-react';
import { InfoTooltip } from '@/components/common/InfoTooltip';
import { LEVERAGE_HELP, TPSL_HELP, ORDER_TYPE_HELP } from '@/lib/tradingHelpText';
import { PositionSizeCalculator } from '@/components/trading/PositionSizeCalculator';
import { lynxEvents } from '@/lib/eventSystem';

function fmtP(p: number): string {
  const d = p >= 10000 ? 2 : p >= 100 ? 2 : p >= 1 ? 4 : p >= 0.01 ? 6 : 8;
  return p.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}

interface Props {
  coin: { id: string; symbol: string; name: string; color: string };
  price: number;
  prev: number;
}

export function MobileTradePanel({ coin, price, prev }: Props) {
  const { balance, openPosition } = useTradingStore();
  const { level } = useTradingLevelStore();

  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<'Market' | 'Limit' | 'Stop-Limit'>('Market');
  const [limitPx, setLimitPx] = useState('');
  const [amt, setAmt] = useState('');
  const [lev, setLev] = useState(1);
  const [tp, setTp] = useState('');
  const [sl, setSl] = useState('');
  const [tpslOn, setTpslOn] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; msg: string } | null>(null);
  const [marginMode, setMarginMode] = useState<'isolated' | 'cross'>('isolated');

  const isPro = level === 'pro' || level === 'proplus';
  const isProPlus = level === 'proplus';
  const execPx = orderType === 'Market' ? price : (parseFloat(limitPx) || price);
  const qty = parseFloat(amt) || 0;
  const total = qty * execPx;
  const fee = total * 0.001;
  const isBuy = side === 'buy';
  const hasTotal = total > 0;
  const MAX_POSITION_PCT = 0.25;

  const setPct = (pct: number) => {
    const maxUsd = balance * MAX_POSITION_PCT;
    const u = (maxUsd * pct / 100) / execPx;
    setAmt(u > 0 ? u.toFixed(6) : '');
  };

  const handleSubmit = () => {
    if (!hasTotal) {
      setFlash({ ok: false, msg: 'Enter a valid amount' });
      setTimeout(() => setFlash(null), 2500);
      return;
    }
    if (total < 10) {
      setFlash({ ok: false, msg: 'Minimum trade size is $10' });
      setTimeout(() => setFlash(null), 2500);
      return;
    }
    if (total > balance * MAX_POSITION_PCT) {
      setFlash({ ok: false, msg: 'Max position 25% of portfolio' });
      setTimeout(() => setFlash(null), 2500);
      return;
    }
    if (total > balance) {
      setFlash({ ok: false, msg: 'Insufficient balance' });
      setTimeout(() => setFlash(null), 2500);
      return;
    }
    const dtl = checkDailyTradeLimit();
    if (!dtl.canTrade) {
      setFlash({ ok: false, msg: `Daily limit reached (${dtl.max}/day). Upgrade for unlimited.` });
      setTimeout(() => setFlash(null), 3000);
      return;
    }

    if (orderType === 'Market') {
      try {
        openPosition({
          coinId: coin.id, symbol: coin.symbol, name: coin.name,
          side: isBuy ? 'long' : 'short',
          usdAmount: total, currentPrice: price, leverage: lev,
          color: coin.color,
          takeProfit: tpslOn && tp ? parseFloat(tp) : undefined,
          stopLoss: tpslOn && sl ? parseFloat(sl) : undefined,
          marginMode,
        });
        recordDailyTrade();
        lynxEvents.emit({
          type: 'TRADE_OPEN',
          symbol: coin.symbol,
          side: isBuy ? 'long' : 'short',
          leverage: lev,
          amount: qty,
          price,
        });
        setFlash({ ok: true, msg: `${isBuy ? 'Buy' : 'Sell'} ${qty.toFixed(4)} ${coin.symbol}` });
        setAmt(''); setTp(''); setSl('');
      } catch (err: any) {
        setFlash({ ok: false, msg: err?.message ?? 'Order failed' });
      }
    } else {
      try {
        placeOrder({
          coinId: coin.id, symbol: coin.symbol, name: coin.name,
          side: isBuy ? 'buy' : 'sell',
          orderType: orderType === 'Limit' ? 'limit' : 'stop',
          usdAmount: total,
          limitPrice: execPx,
          leverage: lev,
          color: coin.color,
          stopLoss: tpslOn && sl ? parseFloat(sl) : undefined,
          takeProfit: tpslOn && tp ? parseFloat(tp) : undefined,
        });
        setFlash({ ok: true, msg: `${orderType} order placed: ${qty.toFixed(4)} ${coin.symbol} @ ${fmtP(execPx)}` });
        lynxEvents.emit({
          type: 'TRADE_OPEN',
          symbol: coin.symbol,
          side: isBuy ? 'buy' : 'sell',
          leverage: lev,
          amount: qty,
          price: execPx,
        });
        setAmt(''); setLimitPx(''); setTp(''); setSl('');
      } catch (err: any) {
        setFlash({ ok: false, msg: err?.message ?? 'Order failed' });
      }
    }
    setTimeout(() => setFlash(null), 3000);
  };

  return (
    <div className="flex flex-col h-full bg-background px-4 py-3 space-y-4 overflow-y-auto"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      
      {/* Order Type Tabs */}
      <div className="flex items-center border-b flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        {(['Market', 'Limit', 'Stop-Limit'] as const).map(t => {
          const isActive = t === orderType;
          return (
            <button key={t} onClick={() => setOrderType(t)}
              className={cn('flex-1 py-2.5 text-xs font-semibold transition-colors border-b-2',
                isActive ? 'border-amber-400 text-amber-400' : 'border-transparent text-white/35 hover:text-white/60')}>
              {t}
            </button>
          );
        })}
        <InfoTooltip side="bottom" className="mr-2 flex-shrink-0" text={ORDER_TYPE_HELP[orderType]} />
      </div>

      {/* Buy/Sell */}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setSide('buy')} aria-label="Buy Long"
          className={cn('min-h-[48px] rounded-xl font-bold text-base transition-all',
            isBuy ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-white/[0.05] text-white/40 border border-white/[0.06]')}>
          Buy / Long
        </button>
        <button onClick={() => setSide('sell')} aria-label="Sell Short"
          className={cn('min-h-[48px] rounded-xl font-bold text-base transition-all',
            !isBuy ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 'bg-white/[0.05] text-white/40 border border-white/[0.06]')}>
          Sell / Short
        </button>
      </div>

      {/* Balance */}
      <div className="flex justify-between items-center bg-white/[0.03] rounded-xl px-4 py-3">
        <span className="flex items-center gap-2 text-sm text-white/40"><Wallet className="w-4 h-4" /> Balance</span>
        <span className="text-sm font-mono font-semibold tabular-nums text-white/80">
          {balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT
        </span>
      </div>

      {/* Limit Price (for Limit/Stop orders) */}
      {orderType !== 'Market' && (
        <div>
          <label className="block text-xs text-white/40 mb-2">Limit Price</label>
          <div className="flex items-center bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-3 focus-within:border-amber-400/40">
            <input type="number" value={limitPx} onChange={e => setLimitPx(e.target.value)}
              placeholder={price.toFixed(2)}
              className="flex-1 bg-transparent text-base font-mono text-white/80 outline-none placeholder-white/15" aria-label="Limit price" />
            <button onClick={() => setLimitPx(price.toFixed(2))}
              className="text-xs text-amber-400 ml-2 flex items-center gap-1 min-h-[32px]">
              <Link2 className="w-3.5 h-3.5" /> Mkt
            </button>
            <span className="text-sm text-white/30 ml-2">USDT</span>
          </div>
        </div>
      )}

      {/* Market price (shown for Market orders) */}
      {orderType === 'Market' && (
        <div className="flex justify-between items-center bg-white/[0.03] rounded-xl px-4 py-3">
          <span className="text-sm text-white/40">Market Price</span>
          <span className={cn('text-base font-mono font-bold tabular-nums', price >= prev ? 'text-emerald-400' : 'text-red-400')}>
            {fmtP(price)}
          </span>
        </div>
      )}

      {/* Amount */}
      <div>
        <label className="block text-xs text-white/40 mb-2">Amount ({coin.symbol})</label>
        <div className="flex items-center bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-3 focus-within:border-amber-400/40">
          <input type="number" value={amt} onChange={e => setAmt(e.target.value)} placeholder="0.00000"
            className="flex-1 bg-transparent text-base font-mono text-white/80 outline-none placeholder-white/15" aria-label="Trade amount" />
          <span className="text-sm text-white/30 ml-2 tabular-nums">{coin.symbol}</span>
        </div>
      </div>

      {/* Quick % Buttons */}
      <div className="grid grid-cols-4 gap-2">
        {[25, 50, 75, 100].map(p => (
          <button key={p} onClick={() => setPct(p)}
            className="min-h-[40px] rounded-lg text-xs font-semibold text-white/50 bg-white/[0.04] hover:bg-amber-400/15 hover:text-amber-400 border border-white/[0.05] transition-colors"
            aria-label={`${p}% of max position`}>{p}%</button>
        ))}
      </div>
      <p className="text-[10px] text-white/20 -mt-2">% of 25% max position</p>

      {/* Total */}
      <div className="flex justify-between items-center bg-white/[0.03] rounded-xl px-4 py-3">
        <span className="text-sm text-white/40">Total (USDT)</span>
        <span className="text-base font-mono font-semibold tabular-nums text-white/70">
          {hasTotal ? total.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String.fromCharCode(8212)}
        </span>
      </div>

      {/* Fee */}
      {hasTotal && (
        <div className="flex justify-between text-xs -mt-2">
          <span className="text-white/25">Est. Fee (0.1%)</span>
          <span className="text-white/40 font-mono tabular-nums">{fee.toFixed(4)} USDT</span>
        </div>
      )}

      {/* Leverage */}
      {isProPlus && (
        <div>
          <div className="flex justify-between text-xs mb-2">
            <span className="text-white/40 flex items-center gap-1">Leverage <InfoTooltip text={LEVERAGE_HELP} /></span>
            <span className="text-amber-400 font-bold font-mono tabular-nums">{lev}x</span>
          </div>
          <input type="range" min={1} max={100} value={lev} onChange={e => setLev(Number(e.target.value))}
            className="w-full h-2 accent-amber-400 cursor-pointer rounded" aria-label="Leverage slider" />
          <div className="flex justify-between text-[10px] text-white/20 mt-1">
            {[1, 25, 50, 75, 100].map(v => <span key={v}>{v}x</span>)}
          </div>
        </div>
      )}

      {/* TP/SL */}
      {isPro && (
        <div>
          <button onClick={() => setTpslOn(o => !o)}
            className="flex items-center gap-2 text-sm text-white/40 hover:text-white/70 transition-colors w-full text-left min-h-[44px]"
            aria-label="Toggle Take Profit / Stop Loss">
            <span className={cn('transition-transform', tpslOn && 'rotate-90')}>{String.fromCharCode(9654)}</span>
            TP / SL
            <InfoTooltip text={TPSL_HELP} />
          </button>
          {tpslOn && (
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div>
                <label className="block text-[11px] text-emerald-400/70 mb-1">Take Profit</label>
                <div className="flex items-center bg-white/[0.05] border border-emerald-500/20 rounded-lg px-3 py-2.5">
                  <input type="number" value={tp} onChange={e => setTp(e.target.value)} placeholder="0.00"
                    className="flex-1 bg-transparent text-sm font-mono text-emerald-400 outline-none placeholder-white/15" aria-label="Take profit price" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-red-400/70 mb-1">Stop Loss</label>
                <div className="flex items-center bg-white/[0.05] border border-red-500/20 rounded-lg px-3 py-2.5">
                  <input type="number" value={sl} onChange={e => setSl(e.target.value)} placeholder="0.00"
                    className="flex-1 bg-transparent text-sm font-mono text-red-400 outline-none placeholder-white/15" aria-label="Stop loss price" />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Position Size Calculator */}
      {isPro && (
        <PositionSizeCalculator balance={balance} entryPrice={execPx} leverage={isProPlus ? lev : 1} stopLoss={sl} onApply={(qtyStr) => setAmt(qtyStr)} />
      )}

      {/* Summary */}
      {hasTotal && (
        <div className="bg-white/[0.03] rounded-xl px-4 py-3 space-y-2 text-sm border border-white/[0.04]">
          <div className="flex justify-between">
            <span className="text-white/30">Type</span>
            <span className="text-amber-400 font-semibold">{orderType}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/30">Side</span>
            <span className={isBuy ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>{isBuy ? 'Buy (Long)' : 'Sell (Short)'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/30">Order Value</span>
            <span className="font-mono text-white/70 tabular-nums">{total.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/30">Quantity</span>
            <span className="font-mono text-white/70 tabular-nums">{qty.toFixed(6)} {coin.symbol}</span>
          </div>
          {isProPlus && (
            <div className="flex justify-between">
              <span className="text-white/30">Leverage</span>
              <span className="font-mono text-amber-400 tabular-nums">{lev}x</span>
            </div>
          )}
          <div className="flex justify-between items-center">
            <span className="text-white/30">Margin</span>
            <select value={marginMode} onChange={e => setMarginMode(e.target.value as 'isolated' | 'cross')}
              className="text-xs font-semibold bg-white/[0.05] border border-white/10 rounded-md px-2 py-1 text-white/80 cursor-pointer outline-none" aria-label="Margin mode">
              <option value="isolated">Isolated</option>
              <option value="cross">Cross</option>
            </select>
          </div>
        </div>
      )}

      {/* Flash */}
      {flash && (
        <div className={cn('flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold border',
          flash.ok ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400')}>
          {flash.ok ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <XCircle className="w-4 h-4 flex-shrink-0" />}
          {flash.msg}
        </div>
      )}

      {/* Submit */}
      <button onClick={handleSubmit} aria-label={isBuy ? `Buy ${coin.symbol}` : `Sell ${coin.symbol}`}
        className={cn('w-full min-h-[56px] rounded-xl font-bold text-lg transition-all active:scale-[0.98]',
          isBuy ? 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/25' : 'bg-red-500 hover:bg-red-400 text-white shadow-lg shadow-red-500/25')}>
        {orderType === 'Market'
          ? (isBuy ? 'Buy ' + coin.symbol : 'Sell ' + coin.symbol)
          : (isBuy ? 'Place Buy ' + orderType : 'Place Sell ' + orderType)}
      </button>
    </div>
  );
}
