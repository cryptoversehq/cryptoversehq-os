/**
 * MobileTradeHistory.tsx
 * Trade history as expandable cards grouped by date.
 * Collapsed: Symbol | +PnL | Today
 * Expanded: Entry | Exit | Fee | Leverage | Reason | Notes
 */

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useTradingStore } from '@/lib/tradingStore';

function fmtP(p: number): string {
  const d = p >= 10000 ? 2 : p >= 100 ? 2 : p >= 1 ? 4 : p >= 0.01 ? 6 : 8;
  return p.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}

interface Props {
  coin: { id: string; symbol: string; name: string; color: string };
}

export function MobileTradeHistory({ coin }: Props) {
  const { history } = useTradingStore();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const groupedByDate = useMemo(() => {
    const groups: Record<string, typeof history> = {};
    for (const h of history) {
      const dateKey = h.timestamp?.split(' ')[0] ?? 'Unknown';
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(h);
    }
    return groups;
  }, [history]);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground px-4">
        <span className="text-4xl">{String.fromCodePoint(0x1F4C4)}</span>
        <p className="text-sm text-center">No trade history</p>
        <p className="text-xs text-center">Closed trades will appear here</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col py-3 space-y-4" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {Object.entries(groupedByDate).map(([dateKey, trades]) => (
        <div key={dateKey}>
          <div className="px-4 py-2 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
            <span className="text-xs font-semibold text-white/50">{dateKey}</span>
            <span className="text-[10px] text-white/25 ml-auto">{trades.length} trade{trades.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="space-y-2 px-4">
            {trades.map(h => {
              const isExpanded = expandedIds.has(h.id);
              const isPnlPos = h.pnl >= 0;
              const isOpen = h.action === 'open';
              const isLong = h.side === 'long';
              const hasExit = h.exitPrice !== undefined;

              return (
                <button
                  key={h.id}
                  onClick={() => toggleExpand(h.id)}
                  className="w-full bg-card border border-border rounded-xl overflow-hidden transition-colors hover:bg-accent text-left shadow-sm"
                  aria-expanded={isExpanded}
                >
                  {/* Collapsed row */}
                  <div className="flex items-center gap-2 px-4 py-3 min-h-[48px]">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: h.color }} />
                    <span className="text-sm font-bold truncate flex-1">{h.symbol}</span>
                    <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold flex-shrink-0',
                      isOpen ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400')}>
                      {h.action}
                    </span>
                    <span className={cn('text-sm font-mono font-bold tabular-nums flex-shrink-0',
                      isPnlPos ? 'text-emerald-400' : 'text-red-400')}>
                      {isPnlPos ? '+' : ''}{h.pnl.toFixed(2)} USDT
                    </span>
                    <span className="text-white/20 text-xs flex-shrink-0">{isExpanded ? String.fromCodePoint(0x25B2) : String.fromCodePoint(0x25BC)}</span>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="px-4 pb-3 space-y-2 border-t border-border">
                      <div className="grid grid-cols-2 gap-3 text-xs mt-3">
                        <div>
                          <span className="block text-white/30 mb-0.5">Entry</span>
                          <span className="font-mono text-white/70 tabular-nums">{fmtP(h.entryPrice)}</span>
                        </div>
                        <div>
                          <span className="block text-white/30 mb-0.5">Exit</span>
                          <span className="font-mono text-white/40 tabular-nums">{hasExit ? fmtP(h.exitPrice as number) : String.fromCodePoint(8212)}</span>
                        </div>
                        <div>
                          <span className="block text-white/30 mb-0.5">Fee</span>
                          <span className="font-mono text-white/40 tabular-nums">{h.fee.toFixed(4)} USDT</span>
                        </div>
                        <div>
                          <span className="block text-white/30 mb-0.5">Side</span>
                          <span className={cn('font-semibold', isLong ? 'text-emerald-400' : 'text-red-400')}>{h.side}</span>
                        </div>
                        <div className="col-span-2">
                          <span className="block text-white/30 mb-0.5">Quantity</span>
                          <span className="font-mono text-white/50 tabular-nums">{h.quantity.toFixed(4)} {h.symbol}</span>
                        </div>
                      </div>
                      <div className="text-[10px] text-white/25 pt-1">{h.timestamp}</div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
