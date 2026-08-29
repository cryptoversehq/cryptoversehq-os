/**
 * MobileOrderSheet.tsx
 * Pending orders display - Limit, Stop, OCO as cards. No tables.
 */

import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { cancelOrder, getPendingOrders, subscribeOrderStatus, type PendingOrder } from '@/lib/orderEngine';

function fmtP(p: number): string {
  const d = p >= 10000 ? 2 : p >= 100 ? 2 : p >= 1 ? 4 : p >= 0.01 ? 6 : 8;
  return p.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}

interface Props {
  coin: { id: string; symbol: string; name: string; color: string };
  price: number;
}

export function MobileOrderSheet({ coin, price }: Props) {
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [filter, setFilter] = useState<'all' | 'limit' | 'stop'>('all');

  useEffect(() => {
    setOrders(getPendingOrders());
    const unsub = subscribeOrderStatus(() => {
      setOrders(getPendingOrders());
    });
    return unsub;
  }, []);

  const filteredOrders = filter === 'all' ? orders : orders.filter(o => o.type === filter);

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground px-4">
        <span className="text-4xl">{String.fromCodePoint(0x1F4CB)}</span>
        <p className="text-sm text-center">No pending orders</p>
        <p className="text-xs text-center">Limit and stop orders will appear here</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="flex items-center gap-1 px-4 py-2 border-b border-border flex-shrink-0">
        {(['all', 'limit', 'stop'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn('px-4 py-1.5 rounded-full text-xs font-semibold transition-colors',
              filter === f ? 'bg-amber-400/15 text-amber-400' : 'text-white/35 hover:text-white/60')}>
            {f === 'all' ? 'All' : f === 'limit' ? 'Limit' : 'Stop'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {filteredOrders.map(order => {
          const isBuy = order.side === 'buy';
          return (
            <div key={order.id} className="bg-card border border-border rounded-2xl p-4 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: order.color }} />
                  <span className="text-sm font-bold">{order.symbol}/USDT</span>
                  <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold',
                    isBuy ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400')}>
                    {isBuy ? 'Buy' : 'Sell'}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400/15 text-amber-400">
                    {order.type === 'limit' ? 'Limit' : 'Stop'}
                  </span>
                </div>
                <span className="text-xs text-white/35">{order.leverage}x</span>
              </div>

              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="block text-white/30 mb-0.5">Price</span>
                  <span className="font-mono text-white/70 tabular-nums">{fmtP(order.limitPrice)}</span>
                </div>
                <div>
                  <span className="block text-white/30 mb-0.5">Amount</span>
                  <span className="font-mono text-white/70 tabular-nums">{order.amount.toFixed(4)}</span>
                </div>
                <div>
                  <span className="block text-white/30 mb-0.5">Total</span>
                  <span className="font-mono text-white/70 tabular-nums">{(order.limitPrice * order.amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                </div>
              </div>

              <div className="flex justify-end">
                <button onClick={() => cancelOrder(order.id)}
                  className="min-h-[44px] px-5 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl text-sm font-semibold transition-colors"
                  aria-label={`Cancel ${order.symbol} order`}>Cancel</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
