import React, { useState } from 'react';
import { Trophy, ChevronLeft, ChevronRight, Search, Download, X, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TradeRecord } from '@/lib/tradingStore';

const PAGE_SIZE = 10;

function exportCSV(rows: TradeRecord[]) {
  const header = 'Date,Symbol,Side,Action,Entry,Exit,Leverage,P&L,Fee';
  const body = rows.map(r => [
    r.timestamp, r.symbol, r.side.toUpperCase(), r.action.toUpperCase(),
    r.entryPrice.toFixed(2), r.exitPrice?.toFixed(2) ?? '', r.leverage,
    r.pnl.toFixed(2), r.fee.toFixed(2),
  ].join(',')).join('\n');
  const blob = new Blob([header + '\n' + body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cryptoverse_trades_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

interface TradeHistoryProps {
  history: TradeRecord[];
}

export function TradeHistory({ history }: TradeHistoryProps) {
  const [page, setPage] = useState(1);
  const [filterSide, setFilterSide] = useState<'all' | 'long' | 'short'>('all');
  const [filterAction, setFilterAction] = useState<'all' | 'open' | 'close'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const hasActiveFilters = searchQuery !== '' || dateFrom !== '' || dateTo !== '' || filterSide !== 'all' || filterAction !== 'all';

  const clearAllFilters = () => {
    setSearchQuery('');
    setDateFrom('');
    setDateTo('');
    setFilterSide('all');
    setFilterAction('all');
    setPage(1);
  };

  const filtered = history.filter(r => {
    const sideOk = filterSide === 'all' || r.side === filterSide;
    const actionOk = filterAction === 'all' || r.action === filterAction;
    const searchOk = searchQuery === '' || r.symbol.toLowerCase().includes(searchQuery.toLowerCase());
    return sideOk && actionOk && searchOk;
  });
  const totalFilteredCount = filtered.length;
  const totalPages = Math.ceil(totalFilteredCount / PAGE_SIZE);
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="bg-card border border-white/5 rounded-2xl shadow-lg overflow-hidden">
      <div className="p-5 border-b border-white/5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h3 className="font-semibold flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-400" />
            Trade History
            <span className="text-xs text-muted-foreground font-normal">({totalFilteredCount} records)</span>
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            {(['all', 'long', 'short'] as const).map(s => (
              <button key={s} onClick={() => { setFilterSide(s); setPage(1); }}
                className={cn('px-3 py-1 rounded-lg text-xs font-medium transition-colors capitalize',
                  filterSide === s ? 'bg-primary text-primary-foreground' : 'bg-secondary/50 text-muted-foreground hover:text-foreground')}
              >{s}</button>
            ))}
            <span className="w-px h-4 bg-white/10" />
            {(['all', 'open', 'close'] as const).map(a => (
              <button key={a} onClick={() => { setFilterAction(a); setPage(1); }}
                className={cn('px-3 py-1 rounded-lg text-xs font-medium transition-colors capitalize',
                  filterAction === a ? 'bg-primary text-primary-foreground' : 'bg-secondary/50 text-muted-foreground hover:text-foreground')}
              >{a === 'all' ? 'All actions' : a === 'open' ? 'Opens' : 'Closes'}</button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-[280px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input type="text" placeholder="Search by symbol..." value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              className="w-full h-9 pl-9 pr-3 rounded-lg bg-secondary/30 border border-white/5 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/40 transition-colors" />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(''); setPage(1); }} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="h-9 px-3 rounded-lg bg-secondary/30 border border-white/5 text-xs text-muted-foreground focus:outline-none focus:border-primary/40 transition-colors" title="From date" />
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="h-9 px-3 rounded-lg bg-secondary/30 border border-white/5 text-xs text-muted-foreground focus:outline-none focus:border-primary/40 transition-colors" title="To date" />
          {hasActiveFilters && (
            <button onClick={clearAllFilters} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              <X className="h-3 w-3" />Clear
            </button>
          )}
          <button onClick={() => exportCSV(filtered)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-500/15 text-green-400 border border-green-500/25 hover:bg-green-500/25 transition-colors ml-auto">
            <Download className="h-3.5 w-3.5" />Export CSV
          </button>
        </div>
      </div>

      <div className="hidden md:grid grid-cols-12 gap-2 px-5 py-2.5 bg-secondary/20 text-xs text-muted-foreground font-semibold uppercase tracking-wider border-b border-white/5">
        <div className="col-span-2">Coin</div><div className="col-span-2">Side</div><div className="col-span-2">Action</div>
        <div className="col-span-2 text-right">Entry</div><div className="col-span-2 text-right">Exit</div>
        <div className="col-span-1 text-right">Lev</div><div className="col-span-1 text-right">P&L</div>
      </div>

      {pageRows.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground text-sm">
          <Activity className="h-8 w-8 mx-auto mb-3 opacity-30" />
          No trades match the current filters.
        </div>
      ) : (
        <div className="divide-y divide-white/5">
          {pageRows.map(trade => {
            const isClose = trade.action === 'close';
            const isProfit = trade.pnl > 0;
            return (
              <div key={trade.id} className="grid grid-cols-12 gap-2 px-5 py-3 items-center hover:bg-secondary/10 transition-colors text-sm">
                <div className="col-span-4 md:col-span-2 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: trade.color }} />
                  <span className="font-semibold">{trade.symbol}</span>
                  <span className="text-muted-foreground text-xs hidden md:inline">{trade.timestamp}</span>
                </div>
                <div className="col-span-3 md:col-span-2">
                  <span className={cn('px-2 py-0.5 rounded-md text-xs font-bold', trade.side === 'long' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400')}>{trade.side.toUpperCase()}</span>
                </div>
                <div className="col-span-3 md:col-span-2">
                  <span className={cn('px-2 py-0.5 rounded-md text-xs font-medium', isClose ? 'bg-secondary/60 text-foreground' : 'bg-primary/15 text-primary')}>{isClose ? 'CLOSE' : 'OPEN'}</span>
                </div>
                <div className="col-span-2 text-right font-mono text-xs hidden md:block">${trade.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                <div className="col-span-2 text-right font-mono text-xs hidden md:block text-muted-foreground">{isClose && trade.exitPrice ? `$${trade.exitPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}</div>
                <div className="col-span-1 text-right font-mono text-xs text-muted-foreground hidden md:block">{trade.leverage}x</div>
                <div className={cn('col-span-2 md:col-span-1 text-right font-mono text-xs font-bold', isClose ? (isProfit ? 'text-green-400' : 'text-red-400') : 'text-muted-foreground')}>
                  {isClose ? `${isProfit ? '+' : ''}${trade.pnl.toFixed(2)}` : `−${trade.fee.toFixed(2)}`}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between px-5 py-3 border-t border-white/5">
        <span className="text-xs text-muted-foreground">
          Showing {pageRows.length > 0 ? (page - 1) * PAGE_SIZE + 1 : 0}{"–"}{Math.min(page * PAGE_SIZE, totalFilteredCount)} of {totalFilteredCount} trades
          {totalPages > 1 && ` · Page ${page} of ${totalPages}`}
        </span>
        {totalPages > 1 && (
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="p-1.5 rounded-lg bg-secondary/50 disabled:opacity-30 hover:bg-secondary transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-1.5 rounded-lg bg-secondary/50 disabled:opacity-30 hover:bg-secondary transition-colors">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default TradeHistory;
