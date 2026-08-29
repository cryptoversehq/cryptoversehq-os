/**
 * MobilePositionCard.tsx
 * Vertical position cards - one per position. Never tables.
 * Card layout: Symbol | LONG/SHORT | Leverage | PnL | Entry | Mark | SL | TP | Actions
 */

import React, { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useTradingStore, calcPositionPnl, Position } from '@/lib/tradingStore';

function fmtP(p: number): string {
  const d = p >= 10000 ? 2 : p >= 100 ? 2 : p >= 1 ? 4 : p >= 0.01 ? 6 : 8;
  return p.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}

interface Props {
  coin: { id: string; symbol: string; name: string; color: string };
  price: number;
}

function LeverageEditor({ position, onUpdate }: {
  position: Position;
  onUpdate: (positionId: string, newLeverage: number) => { success: boolean; error?: string };
}) {
  const [open, setOpen] = useState(false);
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
      <button onClick={() => { setValue(String(position.leverage)); setError(null); setOpen(o => !o); }}
        className="px-2 py-1 rounded-lg text-[11px] font-mono font-bold bg-amber-400/10 text-amber-400 border border-amber-400/20 hover:bg-amber-400/20 transition-colors">
        {position.leverage}x edit
      </button>
      {open && (
        <div className="absolute z-50 bottom-full mb-1 left-0 w-44 p-2.5 rounded-xl border border-border shadow-xl bg-popover space-y-2">
          <p className="text-[9px] text-white/40 leading-relaxed">Position size stays the same</p>
          <div className="flex items-center gap-1.5">
            <input type="number" min={1} max={100} value={value} onChange={e => setValue(e.target.value)}
              className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-2 py-1 text-[11px] font-mono text-white/80 outline-none focus:border-amber-400/50" />
            <span className="text-[10px] text-white/30">x</span>
          </div>
          {error && <p className="text-[9px] text-red-400">{error}</p>}
          <button onClick={apply}
            className="w-full py-1 rounded-lg bg-amber-400/15 hover:bg-amber-400/25 text-amber-400 text-[10px] font-semibold transition-colors">Apply</button>
        </div>
      )}
    </div>
  );
}

export function MobilePositionCard({ coin, price }: Props) {
  const { positions, closePosition, updateLeverage, openPosition } = useTradingStore();

  if (positions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground px-4">
        <span className="text-4xl">{String.fromCharCode(128200)}</span>
        <p className="text-sm text-center">No open positions</p>
        <p className="text-xs text-center">Place a trade to get started</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-3 px-4 py-3" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {positions.map(pos => {
        const mp = pos.coinId === coin.id ? price : pos.entryPrice;
        const { rawPnl, pnlPct } = calcPositionPnl(pos, mp);
        const isLong = pos.side === 'long';
        const isPnlPos = rawPnl >= 0;
        const hasTp = pos.takeProfit !== undefined;
        const hasSl = pos.stopLoss !== undefined;
        const liqFact = isLong ? (1 - 1 / pos.leverage * 0.9) : (1 + 1 / pos.leverage * 0.9);
        const liqPx = pos.entryPrice * liqFact;

        return (
          <div key={pos.id} className="bg-card border border-border rounded-2xl p-4 space-y-3 shadow-sm">
            {/* Row 1: Symbol + Direction + Leverage + PnL */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: pos.color }} />
                <span className="text-sm font-bold truncate">{pos.symbol}/USDT</span>
                <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-bold flex-shrink-0',
                  isLong ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400')}>
                  {isLong ? 'LONG' : 'SHORT'}
                </span>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-xs font-mono font-bold text-amber-400 tabular-nums">{pos.leverage}x</span>
                <div className="text-right">
                  <span className={cn('text-base font-mono font-bold tabular-nums', isPnlPos ? 'text-emerald-400' : 'text-red-400')}>
                    {isPnlPos ? '+' : ''}{rawPnl.toFixed(2)}
                  </span>
                  <span className={cn('text-[11px] font-mono ml-1 tabular-nums', isPnlPos ? 'text-emerald-400/70' : 'text-red-400/70')}>
                    ({isPnlPos ? '+' : ''}{pnlPct.toFixed(2)}%)
                  </span>
                </div>
              </div>
            </div>

            {/* Row 2: Entry | Mark | SL | TP */}
            <div className="grid grid-cols-4 gap-3 text-xs">
              <div>
                <span className="block text-white/30 mb-0.5">Entry</span>
                <span className="font-mono text-white/70 tabular-nums">{fmtP(pos.entryPrice)}</span>
              </div>
              <div>
                <span className="block text-white/30 mb-0.5">Mark</span>
                <span className="font-mono text-white/80 tabular-nums">{fmtP(mp)}</span>
              </div>
              <div>
                <span className="block text-white/30 mb-0.5">SL</span>
                <span className="font-mono tabular-nums">{hasSl ? fmtP(pos.stopLoss as number) : String.fromCharCode(8212)}</span>
              </div>
              <div>
                <span className="block text-white/30 mb-0.5">TP</span>
                <span className="font-mono tabular-nums">{hasTp ? fmtP(pos.takeProfit as number) : String.fromCharCode(8212)}</span>
              </div>
            </div>

            {/* Row 3: Liq Price | Margin */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="block text-white/30 mb-0.5">Liq. Price</span>
                <span className="font-mono text-orange-400 tabular-nums">{fmtP(liqPx)}</span>
              </div>
              <div>
                <span className="block text-white/30 mb-0.5">Margin</span>
                <span className="font-mono text-white/50 tabular-nums">{pos.costBasis.toFixed(2)} USDT</span>
              </div>
            </div>

            {/* Row 4: Actions */}
            <div className="flex items-center gap-2 pt-1 border-t border-white/[0.04]">
              <LeverageEditor position={pos} onUpdate={updateLeverage} />
              <span className="flex-1" />
              <button onClick={() => closePosition(pos.id, mp)}
                className="min-h-[44px] px-5 py-2.5 bg-red-500/15 hover:bg-red-500/30 text-red-400 rounded-xl text-sm font-semibold transition-colors"
                aria-label={`Close ${pos.symbol} position`}>
                Close
              </button>
              <button onClick={() => {
                const reversedSide = isLong ? 'short' : 'long';
                const usdAmount = pos.costBasis;
                closePosition(pos.id, mp);
                openPosition({
                  coinId: pos.coinId,
                  symbol: pos.symbol,
                  name: pos.name || pos.symbol,
                  side: reversedSide,
                  usdAmount,
                  currentPrice: mp,
                  leverage: pos.leverage,
                  color: pos.color,
                  takeProfit: pos.takeProfit,
                  stopLoss: pos.stopLoss,
                  marginMode: pos.marginMode,
                });
              }}
                className="min-h-[44px] px-5 py-2.5 bg-amber-400/10 hover:bg-amber-400/20 text-amber-400 rounded-xl text-sm font-semibold transition-colors"
                aria-label={`Reverse ${pos.symbol} position`}>
                Reverse
              </button>
            </div>
          </div>
        );
      })}

      {positions.length > 1 && (
        <button
          onClick={() => positions.forEach(p => closePosition(p.id, p.coinId === coin.id ? price : p.entryPrice))}
          className="min-h-[48px] w-full bg-destructive/10 hover:bg-destructive/20 text-destructive rounded-2xl text-sm font-bold border border-destructive/20 transition-colors"
          aria-label="Close all positions">
          Close All Positions ({positions.length})
        </button>
      )}
    </div>
  );
}
