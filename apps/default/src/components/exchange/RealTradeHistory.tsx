/**
 * RealTradeHistory.tsx — Synced real exchange trade history
 */
import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  RefreshCw, Filter, TrendingUp, TrendingDown, ArrowUpRight,
  ArrowDownLeft, Search, Bot, Clock, DollarSign,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useExchangeStore } from '../../lib/exchangeStore';
import { RealTrade, OrderSide, OrderStatus } from '../../lib/exchangeTypes';

// ── Utils ──────────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtUSD(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);
}

function fmtPrice(n: number, symbol: string): string {
  const dp = symbol.includes('BTC') ? 2 : symbol.includes('ETH') ? 2 : symbol.includes('USDT') ? 4 : 4;
  return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

// ── Trade row ──────────────────────────────────────────────────────────────────

function TradeRow({ trade }: { trade: RealTrade }) {
  const isBuy = trade.side === 'buy';
  const hasPnl = trade.pnl !== undefined;
  const pnlPos = (trade.pnl ?? 0) >= 0;

  const statusColor: Record<OrderStatus, string> = {
    filled:    'text-emerald-400 bg-emerald-500/10',
    open:      'text-blue-400 bg-blue-500/10',
    partial:   'text-amber-400 bg-amber-500/10',
    cancelled: 'text-white/30 bg-white/5',
    rejected:  'text-red-400 bg-red-500/10',
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="grid gap-2 px-4 py-3 border-b border-white/4 hover:bg-white/[0.02] transition-colors text-xs"
      style={{ gridTemplateColumns: '1.5fr 0.7fr 0.7fr 1fr 1fr 0.8fr 0.8fr' }}>

      {/* Symbol + type */}
      <div className="flex items-center gap-2 min-w-0">
        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
          isBuy ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400')}>
          {isBuy ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
        </div>
        <div className="min-w-0">
          <p className="font-black text-white truncate">{trade.symbol}</p>
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-white/30 uppercase">{trade.type}</span>
            {trade.isFromBot && <Bot className="h-2.5 w-2.5 text-purple-400" />}
          </div>
        </div>
      </div>

      {/* Side */}
      <div className={cn('font-black uppercase self-center', isBuy ? 'text-emerald-400' : 'text-red-400')}>
        {trade.side}
      </div>

      {/* Status */}
      <div className="self-center">
        <span className={cn('px-2 py-0.5 rounded-full text-[9px] font-black uppercase', statusColor[trade.status])}>
          {trade.status}
        </span>
      </div>

      {/* Qty / Price */}
      <div className="self-center font-mono">
        <p className="text-white">{trade.filledQty.toFixed(4)}</p>
        <p className="text-[10px] text-white/30">@ {fmtPrice(trade.filledAvgPx, trade.symbol)}</p>
      </div>

      {/* Value */}
      <div className="self-center font-mono text-white/70">
        {fmtUSD(trade.filledQty * trade.filledAvgPx)}
      </div>

      {/* Fee */}
      <div className="self-center font-mono text-white/30 text-[10px]">
        {fmtUSD(trade.feePaid)}
      </div>

      {/* PnL */}
      <div className="self-center font-mono">
        {hasPnl ? (
          <span className={cn('font-black', pnlPos ? 'text-emerald-400' : 'text-red-400')}>
            {pnlPos ? '+' : ''}{fmtUSD(trade.pnl!)}
          </span>
        ) : (
          <span className="text-white/20">—</span>
        )}
      </div>
    </motion.div>
  );
}

// ── Stats bar ──────────────────────────────────────────────────────────────────

function StatsBar({ trades }: { trades: RealTrade[] }) {
  const filled    = trades.filter(t => t.status === 'filled');
  const sells     = filled.filter(t => t.side === 'sell' && t.pnl !== undefined);
  const wins      = sells.filter(t => (t.pnl ?? 0) > 0);
  const totalPnL  = sells.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const totalFees = filled.reduce((s, t) => s + t.feePaid, 0);
  const winRate   = sells.length > 0 ? (wins.length / sells.length) * 100 : 0;
  const pnlPos    = totalPnL >= 0;

  const stats = [
    { label: 'Total Trades',  value: filled.length.toString(), sub: 'executed' },
    { label: 'Win Rate',      value: `${winRate.toFixed(1)}%`, sub: `${wins.length}/${sells.length} sells` },
    { label: 'Realized P&L',  value: `${pnlPos ? '+' : ''}${fmtUSD(totalPnL)}`, sub: 'from closed trades', highlight: pnlPos ? 'green' : 'red' },
    { label: 'Total Fees',    value: fmtUSD(totalFees), sub: 'paid to exchange' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 pb-4">
      {stats.map(s => (
        <div key={s.label} className="rounded-2xl px-4 py-3"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <p className="text-[10px] text-white/30 uppercase tracking-wider">{s.label}</p>
          <p className={cn('text-base font-black mt-1',
            s.highlight === 'green' ? 'text-emerald-400' : s.highlight === 'red' ? 'text-red-400' : 'text-white'
          )}>{s.value}</p>
          <p className="text-[10px] text-white/20 mt-0.5">{s.sub}</p>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function RealTradeHistory({ connectionId }: { connectionId: string }) {
  const { getTrades, syncExchange, isSyncing } = useExchangeStore();
  const allTrades = getTrades(connectionId);

  const [sideFilter,   setSideFilter]   = useState<OrderSide | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [search,       setSearch]       = useState('');
  const [botOnly,      setBotOnly]      = useState(false);
  const [page,         setPage]         = useState(1);

  const PAGE_SIZE = 20;

  const filtered = useMemo(() => {
    return allTrades
      .filter(t => sideFilter === 'all' || t.side === sideFilter)
      .filter(t => statusFilter === 'all' || t.status === statusFilter)
      .filter(t => !botOnly || t.isFromBot)
      .filter(t => !search || t.symbol.toLowerCase().includes(search.toLowerCase()));
  }, [allTrades, sideFilter, statusFilter, search, botOnly]);

  const paginated = filtered.slice(0, page * PAGE_SIZE);
  const hasMore   = filtered.length > paginated.length;

  return (
    <div className="space-y-4">

      {/* Stats */}
      <StatsBar trades={allTrades} />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 px-4">
        {/* Search */}
        <div className="relative flex-1 min-w-32">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search symbol…"
            className="w-full bg-white/5 border border-white/8 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-white/20" />
        </div>

        {/* Filters */}
        {[
          { label: 'All', value: 'all' as const },
          { label: 'Buy',  value: 'buy'  as OrderSide },
          { label: 'Sell', value: 'sell' as OrderSide },
        ].map(f => (
          <button key={f.value} onClick={() => setSideFilter(f.value as any)}
            className={cn('px-3 py-1.5 rounded-lg text-xs font-bold transition-colors',
              sideFilter === f.value ? 'bg-primary/20 text-primary' : 'bg-white/5 text-white/40 hover:bg-white/10',
            )}>
            {f.label}
          </button>
        ))}

        {/* Bot only */}
        <button onClick={() => setBotOnly(v => !v)}
          className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors',
            botOnly ? 'bg-purple-500/20 text-purple-400 border border-purple-500/25' : 'bg-white/5 text-white/40 hover:bg-white/10',
          )}>
          <Bot className="h-3 w-3" /> Bot Only
        </button>

        {/* Sync */}
        <button onClick={() => syncExchange(connectionId)} disabled={isSyncing}
          className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ml-auto',
            isSyncing ? 'bg-white/5 text-white/30 cursor-not-allowed' : 'bg-primary/15 text-primary hover:bg-primary/25',
          )}>
          <RefreshCw className={cn('h-3 w-3', isSyncing && 'animate-spin')} />
          {isSyncing ? 'Syncing…' : 'Sync'}
        </button>
      </div>

      {/* Table header */}
      <div className="grid gap-2 px-4 py-2 text-[9px] font-black text-white/25 uppercase tracking-wider border-b border-white/5"
        style={{ gridTemplateColumns: '1.5fr 0.7fr 0.7fr 1fr 1fr 0.8fr 0.8fr' }}>
        <span>Pair</span>
        <span>Side</span>
        <span>Status</span>
        <span>Qty / Avg Price</span>
        <span>Value</span>
        <span>Fee</span>
        <span>P&amp;L</span>
      </div>

      {/* Rows */}
      {paginated.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No trades found
        </div>
      ) : (
        <div>
          {paginated.map(t => <TradeRow key={t.id} trade={t} />)}
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <div className="px-4 pb-4">
          <button onClick={() => setPage(p => p + 1)}
            className="w-full py-2.5 rounded-xl border border-white/8 text-xs font-bold text-white/40 hover:bg-white/5 transition-colors">
            Load more ({filtered.length - paginated.length} remaining)
          </button>
        </div>
      )}
    </div>
  );
}
