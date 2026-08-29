/**
 * ExchangeTradePage.tsx
 * Route: /exchange/trade
 * Spec §3.2 — Demo/Real mode toggle + real trading panel + risk limits
 */
import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp, TrendingDown, AlertTriangle, Settings,
  ChevronDown, Zap, Loader2, Shield,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useExchangeStore } from '../../lib/exchangeStore';
import { riskManager } from '../../lib/exchangeRiskManager';
import { ExchangeConnection, EXCHANGE_META, OrderType } from '../../lib/exchangeTypes';
import { toast } from 'sonner';

// ── Data ───────────────────────────────────────────────────────────────────────

interface SymbolInfo { symbol: string; base: string; quote: string; price: number; change24h: number; }

const SYMBOLS: SymbolInfo[] = [
  { symbol: 'BTC/USDT', base: 'BTC', quote: 'USDT', price: 67432.50, change24h: 2.34  },
  { symbol: 'ETH/USDT', base: 'ETH', quote: 'USDT', price: 3411.20, change24h: 1.87  },
  { symbol: 'BNB/USDT', base: 'BNB', quote: 'USDT', price:  591.80, change24h: -0.43 },
  { symbol: 'SOL/USDT', base: 'SOL', quote: 'USDT', price:  182.40, change24h: 4.12  },
  { symbol: 'XRP/USDT', base: 'XRP', quote: 'USDT', price:    0.621, change24h: -1.20 },
  { symbol: 'AVAX/USDT',base: 'AVAX',quote: 'USDT', price:   38.90, change24h: 3.05  },
];

const ORDER_TYPES: { id: OrderType; label: string }[] = [
  { id: 'limit',       label: 'Limit'       },
  { id: 'market',      label: 'Market'      },
  { id: 'stop_limit',  label: 'Stop-Limit'  },
];

function fmtUSD(n: number, dp = 2): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: dp }).format(n);
}

function fmtNum(n: number, dp = 6): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

// ── Mode Toggle ────────────────────────────────────────────────────────────────

function ModeSelector({ mode, onChange }: { mode: 'demo' | 'real'; onChange: (m: 'demo' | 'real') => void }) {
  return (
    <div className="rounded-2xl border border-white/8 p-1 flex gap-1"
      style={{ background: 'rgba(255,255,255,0.02)' }}>
      {(['demo', 'real'] as const).map(m => (
        <button key={m} onClick={() => onChange(m)}
          className={cn(
            'flex-1 flex flex-col items-center gap-1 py-3 rounded-xl text-xs font-bold transition-all',
            mode === m
              ? m === 'real'
                ? 'bg-emerald-500/15 border border-emerald-500/25 text-emerald-400'
                : 'bg-primary/15 border border-primary/25 text-primary'
              : 'text-white/30 hover:text-white/50',
          )}>
          <span className="text-base">{m === 'demo' ? '🎭' : '💰'}</span>
          <span className="font-black text-[11px]">{m === 'demo' ? '○ Demo Mode' : '● Real Mode'} {m === 'real' ? '(Live Funds)' : '(Virtual)'}</span>
          <span className={cn('text-[9px]', mode === m ? 'opacity-80' : 'opacity-40')}>
            {m === 'demo' ? 'Practice with virtual USD' : 'Trade with real exchange balance'}
          </span>
        </button>
      ))}
    </div>
  );
}

// ── Balance Display ────────────────────────────────────────────────────────────

function BalancePanel({ connection, symbolInfo }: { connection: ExchangeConnection; symbolInfo: SymbolInfo }) {
  const ex = EXCHANGE_META[connection.exchangeId];
  const available = connection.balanceUSD * 0.82;
  const inOrders  = connection.balanceUSD * 0.18;

  // Derive some "asset" breakdown
  const assets = [
    { symbol: 'BTC',  qty: connection.balanceBTC, valueUSD: connection.balanceBTC * 67432 },
    { symbol: 'ETH',  qty: connection.balanceBTC * 8,  valueUSD: connection.balanceBTC * 8 * 3411 },
    { symbol: 'BNB',  qty: 10, valueUSD: 10 * 591  },
    { symbol: 'USDT', qty: connection.balanceUSD * 0.25, valueUSD: connection.balanceUSD * 0.25 },
  ];

  return (
    <div className="rounded-2xl border border-white/8 overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.02)' }}>
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="text-lg">{ex.logo}</span>
          <p className="text-sm font-black text-white">Active Exchange: {ex.name}</p>
        </div>
      </div>
      <div className="p-5 space-y-4">
        {/* Totals */}
        <div>
          <p className="text-xs text-white/30 uppercase tracking-wider font-bold">Total Balance</p>
          <p className="text-2xl font-black text-white mt-1">{fmtUSD(connection.balanceUSD)} <span className="text-sm font-normal text-white/30">USDT</span></p>
          <div className="flex gap-5 mt-1 text-xs text-white/40">
            <span>Available: <span className="text-white/60 font-bold">{fmtUSD(available)}</span></span>
            <span>In Orders: <span className="text-amber-400/70 font-bold">{fmtUSD(inOrders)}</span></span>
          </div>
        </div>
        {/* Asset grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {assets.map(a => (
            <div key={a.symbol} className="rounded-xl px-3 py-2.5 bg-white/4 border border-white/6">
              <p className="text-[10px] font-black text-white/40">{a.symbol}</p>
              <p className="text-sm font-black text-white mt-0.5">{a.qty.toFixed(a.symbol === 'USDT' ? 2 : 4)}</p>
              <p className="text-[10px] text-white/30">{fmtUSD(a.valueUSD, 0)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Order Form ─────────────────────────────────────────────────────────────────

function OrderForm({
  mode, connection, symbolInfo, onSymbolChange,
}: {
  mode: 'demo' | 'real';
  connection: ExchangeConnection | undefined;
  symbolInfo: SymbolInfo;
  onSymbolChange: (s: SymbolInfo) => void;
}) {
  const { executeTrade, isExecutingTrade, tradeError, tradeWarnings, clearTradeError } = useExchangeStore();
  const [orderType, setOrderType] = useState<OrderType>('limit');
  const [price,     setPrice]     = useState(symbolInfo.price.toFixed(2));
  const [amount,    setAmount]    = useState('0.01');
  const [symOpen,   setSymOpen]   = useState(false);
  const [placing,   setPlacing]   = useState<'buy' | 'sell' | null>(null);
  const [localErr,  setLocalErr]  = useState('');

  const priceNum  = Number(price)  || symbolInfo.price;
  const amountNum = Number(amount) || 0;
  const total     = orderType === 'market' ? symbolInfo.price * amountNum : priceNum * amountNum;
  const maxBalance = (connection?.balanceUSD ?? 10000) * 0.82;

  function setPercent(pct: number) {
    const usdAlloc = (maxBalance * pct) / 100;
    const baseAmt  = usdAlloc / (orderType === 'market' ? symbolInfo.price : priceNum);
    setAmount(baseAmt.toFixed(6));
  }

  async function placeOrder(side: 'buy' | 'sell') {
    setLocalErr('');
    clearTradeError();

    if (mode === 'demo') {
      // Demo: simple simulation, no risk check
      setPlacing(side);
      await new Promise(r => setTimeout(r, 900));
      setPlacing(null);
      toast.success(`${side.toUpperCase()} ${amountNum.toFixed(4)} ${symbolInfo.base} @ ${orderType === 'market' ? 'Market' : fmtUSD(priceNum)} [DEMO]`);
      return;
    }

    // Real mode: go through the full §4.2 executor pipeline
    if (!connection) { toast.error('Connect an exchange first'); return; }

    setPlacing(side);
    const result = await executeTrade(connection.id, {
      symbol:    symbolInfo.symbol,
      side,
      amount:    amountNum,
      price:     priceNum,
      orderType,
      mode:      'spot',
    }, false);
    setPlacing(null);

    if (!result.success) {
      setLocalErr(result.error ?? 'Order failed');
    } else {
      // Show risk warnings if any
      if (result.riskWarnings && result.riskWarnings.length > 0) {
        result.riskWarnings.forEach(w => toast.warning(w));
      }
    }
  }

  return (
    <div className="rounded-2xl border border-white/8 overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.02)' }}>
      <div className="px-5 py-3.5 border-b border-white/5">
        <p className="text-sm font-black text-white flex items-center gap-2">
          Real Trading Panel
          {mode === 'real' && (
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20 font-black">LIVE FUNDS</span>
          )}
        </p>
      </div>

      <div className="p-5 space-y-4">
        {/* Symbol selector */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-white/40">Symbol</label>
          <div className="relative">
            <button onClick={() => setSymOpen(v => !v)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition-colors">
              <div className="flex items-center gap-2">
                <span className="font-black text-sm text-white">{symbolInfo.symbol}</span>
                <span className="text-sm font-mono text-white/60">{fmtUSD(symbolInfo.price)}</span>
                <span className={cn('text-xs font-bold', symbolInfo.change24h >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {symbolInfo.change24h >= 0 ? '+' : ''}{symbolInfo.change24h.toFixed(2)}%
                </span>
              </div>
              <ChevronDown className="h-4 w-4 text-white/30" />
            </button>
            <AnimatePresence>
              {symOpen && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
                  className="absolute top-full mt-1 left-0 right-0 rounded-xl border border-white/10 overflow-hidden z-20"
                  style={{ background: 'rgba(12,12,18,0.98)' }}>
                  {SYMBOLS.map(s => (
                    <button key={s.symbol} onClick={() => { onSymbolChange(s); setSymOpen(false); setPrice(s.price.toFixed(2)); }}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-xs hover:bg-white/5 transition-colors text-left">
                      <span className="font-bold text-white">{s.symbol}</span>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-white/50">{fmtUSD(s.price)}</span>
                        <span className={cn('font-bold', s.change24h >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                          {s.change24h >= 0 ? '+' : ''}{s.change24h.toFixed(2)}%
                        </span>
                      </div>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Order type */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-white/40">Order Type</label>
          <div className="flex gap-2">
            {ORDER_TYPES.map(t => (
              <button key={t.id} onClick={() => setOrderType(t.id)}
                className={cn('flex-1 py-2 rounded-xl text-xs font-bold border transition-all',
                  orderType === t.id ? 'bg-primary/15 border-primary/40 text-primary' : 'border-white/8 text-white/40 hover:border-white/20',
                )}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Price */}
        {orderType !== 'market' && (
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <label className="text-xs font-bold text-white/40">Price</label>
              <span className="text-[10px] text-white/25">Market: {fmtUSD(symbolInfo.price)}</span>
            </div>
            <div className="flex items-center rounded-xl border border-white/10 bg-white/5 overflow-hidden">
              <span className="px-3 text-xs text-white/30 border-r border-white/10">$</span>
              <input type="number" value={price} onChange={e => setPrice(e.target.value)}
                className="flex-1 bg-transparent px-3 py-2.5 text-sm text-white focus:outline-none font-mono" />
              <button onClick={() => setPrice(symbolInfo.price.toFixed(2))}
                className="px-3 text-[9px] text-primary/60 hover:text-primary font-bold transition-colors">MARK</button>
            </div>
          </div>
        )}

        {/* Amount */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-white/40">Amount</label>
          <div className="flex items-center rounded-xl border border-white/10 bg-white/5 overflow-hidden">
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} min="0"
              className="flex-1 bg-transparent px-3 py-2.5 text-sm text-white focus:outline-none font-mono" />
            <span className="px-3 text-xs text-white/30 border-l border-white/10">{symbolInfo.base}</span>
          </div>
        </div>

        {/* Total */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-white/40">Total</label>
          <div className="flex items-center rounded-xl border border-primary/20 bg-primary/5 overflow-hidden">
            <span className="px-3 text-xs text-primary/50 border-r border-primary/10">$</span>
            <input type="number" value={total.toFixed(2)} readOnly
              className="flex-1 bg-transparent px-3 py-2.5 text-sm text-white focus:outline-none font-mono" />
            <span className="px-3 text-xs text-white/30 border-l border-primary/10">{symbolInfo.quote}</span>
          </div>
        </div>

        {/* Percent quick-fill */}
        <div className="flex gap-2">
          {[25, 50, 75, 100].map(pct => (
            <button key={pct} onClick={() => setPercent(pct)}
              className="flex-1 py-1.5 rounded-lg bg-white/5 text-[10px] font-bold text-white/40 hover:bg-white/10 hover:text-white/70 transition-colors">
              {pct}%
            </button>
          ))}
        </div>

        {/* Buy / Sell */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button onClick={() => placeOrder('buy')} disabled={placing !== null}
            className={cn('flex flex-col items-center gap-1 py-4 rounded-2xl font-black text-sm transition-all',
              placing === 'buy' ? 'bg-emerald-500/30 text-emerald-300 cursor-wait' : 'bg-emerald-500 text-white hover:bg-emerald-400',
            )}>
            {placing === 'buy' ? <Loader2 className="h-5 w-5 animate-spin" /> : <TrendingUp className="h-5 w-5" />}
            BUY / LONG 🟢
            <span className="text-[10px] font-normal opacity-70">{fmtUSD(total)}</span>
          </button>
          <button onClick={() => placeOrder('sell')} disabled={placing !== null}
            className={cn('flex flex-col items-center gap-1 py-4 rounded-2xl font-black text-sm transition-all',
              placing === 'sell' ? 'bg-red-500/30 text-red-300 cursor-wait' : 'bg-red-500 text-white hover:bg-red-400',
            )}>
            {placing === 'sell' ? <Loader2 className="h-5 w-5 animate-spin" /> : <TrendingDown className="h-5 w-5" />}
            SELL / SHORT 🔴
            <span className="text-[10px] font-normal opacity-70">{fmtUSD(total)}</span>
          </button>
        </div>

        {/* Local error */}
        {localErr && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-500/8 border border-red-500/15 text-xs text-red-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{localErr}</span>
          </div>
        )}

        {/* Kill switch warning */}
        {mode === 'real' && connection && riskManager.isKillSwitchActive(connection.id) && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-500/12 border border-red-500/25 text-xs text-red-300 font-bold">
            <Zap className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>🛑 Kill switch active — trading paused. Reset in Settings → Risk Controls.</span>
          </div>
        )}

        {/* Real mode warning */}
        {mode === 'real' && !riskManager.isKillSwitchActive(connection?.id ?? '') && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-500/5 border border-red-500/12 text-xs text-red-400/80">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>Real mode — this order will execute with real funds on your exchange account.</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Risk Limits Summary ────────────────────────────────────────────────────────

function RiskLimitsSummary({ connectionId, onEdit }: { connectionId: string; onEdit: () => void }) {
  const { getRiskControls } = useExchangeStore();
  const rc = getRiskControls(connectionId);

  return (
    <div className="rounded-2xl border border-white/8 px-5 py-4 flex items-center justify-between gap-4"
      style={{ background: 'rgba(255,255,255,0.02)' }}>
      <div className="flex items-center gap-2 text-xs shrink-0">
        <Shield className="h-4 w-4 text-primary" />
        <span className="font-black text-white/60">Risk Limits (Real Mode)</span>
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-white/40 flex-1">
        <span>Max Position: <span className="text-white/70 font-bold">${rc.maxPositionSizeUSD.toLocaleString()}</span></span>
        <span>Max Daily Loss: <span className="text-white/70 font-bold">${rc.maxDailyLossUSD.toLocaleString()}</span></span>
        <span>Max Leverage: <span className="text-white/70 font-bold">{rc.maxLeverage}x</span></span>
      </div>
      <button onClick={onEdit}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-xs font-bold text-white/50 hover:bg-white/10 transition-colors shrink-0">
        <Settings className="h-3 w-3" /> Edit Limits
      </button>
    </div>
  );
}

// ── No Connection State ────────────────────────────────────────────────────────

function NoConnectionState({ onGoConnect }: { onGoConnect: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center space-y-4 max-w-sm mx-auto">
      <div className="w-16 h-16 rounded-2xl bg-white/4 flex items-center justify-center text-3xl">🔌</div>
      <div>
        <p className="font-black text-white">No Exchange Connected</p>
        <p className="text-sm text-muted-foreground mt-1">Connect an exchange account to start trading with real funds.</p>
      </div>
      <button onClick={onGoConnect}
        className="px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:brightness-110 transition-all">
        Connect Exchange
      </button>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export function ExchangeTradePage({ onGoConnect, onGoSettings }: {
  onGoConnect: () => void;
  onGoSettings: () => void;
}) {
  const { getActiveConnection } = useExchangeStore();
  const connection = getActiveConnection();

  const [tradingMode, setTradingMode] = useState<'demo' | 'real'>('demo');
  const [symbolInfo,  setSymbolInfo]  = useState<SymbolInfo>(SYMBOLS[0]);

  // Warn before switching to real
  function handleModeChange(m: 'demo' | 'real') {
    if (m === 'real' && !connection) { toast.error('Connect an exchange first'); return; }
    if (m === 'real') {
      if (!confirm('Switch to Real Mode? Orders will execute with real funds on your exchange.')) return;
    }
    setTradingMode(m);
  }

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-black text-white flex items-center gap-2">
          💰 Real Trading Mode
          <span className={cn('text-[9px] px-2 py-0.5 rounded-full border font-black',
            tradingMode === 'real'
              ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
              : 'text-primary bg-primary/10 border-primary/20',
          )}>
            {tradingMode === 'demo' ? 'DEMO ▼' : 'REAL ▼'}
          </span>
        </h2>
      </div>

      {/* Mode selector */}
      <ModeSelector mode={tradingMode} onChange={handleModeChange} />

      {/* No connection in real mode */}
      {tradingMode === 'real' && !connection ? (
        <NoConnectionState onGoConnect={onGoConnect} />
      ) : (
        <>
          {/* Balance panel (real mode) */}
          {tradingMode === 'real' && connection && (
            <BalancePanel connection={connection} symbolInfo={symbolInfo} />
          )}

          {/* Demo balance (demo mode) */}
          {tradingMode === 'demo' && (
            <div className="rounded-2xl border border-primary/15 px-5 py-4 flex items-center gap-3"
              style={{ background: 'rgba(99,102,241,0.05)' }}>
              <span className="text-2xl">🎭</span>
              <div>
                <p className="text-sm font-black text-white">Demo Account</p>
                <p className="text-xs text-muted-foreground">Virtual Balance: <span className="text-primary font-black">$100,000 USDT</span> · No real funds at risk</p>
              </div>
            </div>
          )}

          {/* Order form */}
          <OrderForm
            mode={tradingMode}
            connection={connection}
            symbolInfo={symbolInfo}
            onSymbolChange={setSymbolInfo}
          />

          {/* Risk limits */}
          {tradingMode === 'real' && connection && (
            <RiskLimitsSummary connectionId={connection.id} onEdit={onGoSettings} />
          )}
        </>
      )}
    </div>
  );
}
