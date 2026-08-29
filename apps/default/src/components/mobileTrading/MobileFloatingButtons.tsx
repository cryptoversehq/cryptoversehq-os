/**
 * MobileFloatingButtons.tsx
 * FAB (floating action buttons) bottom-right corner.
 * Trade quick-access + Close All positions.
 * Only visible on mobile.
 */

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { useTradingStore } from '@/lib/tradingStore';

interface Props {
  coin: { id: string; symbol: string; name: string; color: string };
  price: number;
}

export function MobileFloatingButtons({ coin, price }: Props) {
  const { positions, closePosition } = useTradingStore();
  const [expanded, setExpanded] = useState(false);

  const hasPositions = positions.length > 0;

  const closeAll = () => {
    positions.forEach(p => {
      closePosition(p.id, p.coinId === coin.id ? price : p.entryPrice);
    });
    setExpanded(false);
  };

  return (
    <div
      className="fixed z-30 flex flex-col items-start gap-2"
      style={{
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)',
        left: '16px',
      }}
      aria-label="Quick actions"
    >
      {/* Expanded actions */}
      {expanded && (
        <div className="flex flex-col items-end gap-2 mb-1">
          {hasPositions && (
            <button
              onClick={closeAll}
              className="min-h-[48px] min-w-[48px] flex items-center gap-2 px-4 bg-red-500/90 text-white rounded-2xl shadow-lg text-sm font-bold active:scale-95 transition-transform backdrop-blur-sm"
              aria-label="Close all positions"
            >
              Close All ({positions.length})
            </button>
          )}
        </div>
      )}

      {/* Main FAB */}
      <button
        onClick={() => setExpanded(o => !o)}
        className={cn(
          'min-h-[56px] min-w-[56px] flex items-center justify-center rounded-2xl shadow-xl active:scale-95 transition-transform text-xl',
          expanded ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground',
        )}
        aria-label="Quick actions"
      >
        {expanded ? String.fromCodePoint(0x2715) : String.fromCodePoint(0x26A1)}
      </button>
    </div>
  );
}
