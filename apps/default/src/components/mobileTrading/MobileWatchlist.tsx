/**
 * MobileWatchlist.tsx
 * Scrollable watchlist for quick symbol switching.
 * Uses the curated COINS list.
 */

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { COINS } from '@/lib/coins';

export type CoinInfo = { id: string; symbol: string; name: string; color: string };

interface Props {
  currentCoinId: string;
  onSelect: (coin: CoinInfo) => void;
  onClose?: () => void;
}

export function MobileWatchlist({ currentCoinId, onSelect, onClose }: Props) {
  const tradeable = useMemo(() => {
    const excludedSymbols = ['USDT', 'USDC', 'STETH', 'DAI', 'BUSD', 'FRAX', 'TUSD', 'WBTC'];
    return COINS.filter(c => !excludedSymbols.includes(c.symbol));
  }, []);

  const wlChanges = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of tradeable) m[c.id] = (Math.random() - 0.48) * 6;
    return m;
  }, [tradeable]);

  return (
    <div className="flex flex-col h-full bg-[#0b0e14]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <span className="text-xs font-semibold text-white/50">Watchlist</span>
        {onClose && (
          <button onClick={onClose} className="text-white/30 hover:text-white/60 min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label="Close watchlist">
            {String.fromCodePoint(0x2715)}
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {tradeable.map(c => {
          const isActive = c.id === currentCoinId;
          const chg = wlChanges[c.id] ?? 0;
          const isPos = chg >= 0;
          return (
            <button key={c.id} onClick={() => onSelect(c)}
              className={cn('w-full flex items-center px-4 py-3 hover:bg-white/[0.04] transition-colors text-left',
                isActive && 'bg-white/[0.06]')}>
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c.color }} />
                <div>
                  <span className={cn('text-sm font-semibold block', isActive ? 'text-white' : 'text-white/60')}>{c.symbol}</span>
                  <span className="text-[10px] text-white/25 block truncate">{c.name}</span>
                </div>
              </div>
              <span className={cn('text-[11px] font-semibold tabular-nums flex-shrink-0', isPos ? 'text-emerald-400' : 'text-red-400')}>
                {isPos ? '+' : ''}{chg.toFixed(2)}%
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
