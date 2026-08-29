/**
 * TradeListTable.tsx
 *
 * Full trade log table for a completed backtest session.
 * Features: sortable columns, buy/sell filter, CSV export, pagination.
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronUp, ChevronDown, Download, Filter,
  TrendingUp, TrendingDown, SkipForward, ChevronLeft, ChevronRight,
  AlertCircle, ListChecks,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { BacktestSessionTrade } from '../../lib/backtestTypes';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type SortKey = 'tradeNumber' | 'exitAt' | 'entryPrice' | 'exitPrice' | 'entryValue' | 'netPnl' | 'pnlPct';
type SortDir = 'asc' | 'desc';
type ActionFilter = 'all' | 'long' | 'short' | 'winner' | 'loser';

interface Props {
  trades: BacktestSessionTrade[];
}

const PAGE_SIZE = 50;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function fmt$(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `$${(abs / 1_000).toFixed(2)}k`;
  return `$${abs.toFixed(2)}`;
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function exportCsv(trades: BacktestSessionTrade[]) {
  const headers = ['#', 'Date', 'Side', 'Entry Price', 'Exit Price', 'Quantity', 'Entry Value', 'Exit Value', 'Gross PnL', 'Fee', 'Net PnL', 'PnL %', 'Duration (min)', 'Entry Reason', 'Exit Reason'];
  const rows = trades.map(t => [
    t.tradeNumber,
    new Date(t.exitAt).toISOString(),
    t.side,
    t.entryPrice,
    t.exitPrice,
    t.quantity,
    t.entryValue,
    t.exitValue,
    t.grossPnl,
    t.fee,
    t.netPnl,
    t.pnlPct,
    t.durationMinutes,
    t.entryReason,
    t.exitReason,
  ].join(','));

  const csv  = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `backtest_trades_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// SORT HEADER
// ─────────────────────────────────────────────────────────────────────────────

function SortHeader({
  label, sortKey, current, dir, onClick,
}: {
  label: string; sortKey: SortKey; current: SortKey; dir: SortDir; onClick: () => void;
}) {
  const active = current === sortKey;
  return (
    <th
      onClick={onClick}
      className="px-3 py-2.5 text-left cursor-pointer select-none group whitespace-nowrap"
    >
      <div className={cn('flex items-center gap-1 text-xs font-medium transition-colors', active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')}>
        {label}
        <span className="opacity-0 group-hover:opacity-100 transition-opacity">
          {active
            ? dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
            : <ChevronDown className="h-3 w-3 opacity-50" />}
        </span>
      </div>
    </th>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

export function TradeListTable({ trades }: Props) {
  const [sortKey,  setSortKey]  = useState<SortKey>('tradeNumber');
  const [sortDir,  setSortDir]  = useState<SortDir>('asc');
  const [filter,   setFilter]   = useState<ActionFilter>('all');
  const [page,     setPage]     = useState(0);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(0);
  }

  const filtered = useMemo(() => {
    let arr = [...trades];
    switch (filter) {
      case 'long':   arr = arr.filter(t => t.side === 'long');   break;
      case 'short':  arr = arr.filter(t => t.side === 'short');  break;
      case 'winner': arr = arr.filter(t => t.isWinner);          break;
      case 'loser':  arr = arr.filter(t => !t.isWinner);         break;
    }
    arr.sort((a, b) => {
      let va: number, vb: number;
      switch (sortKey) {
        case 'exitAt':       va = new Date(a.exitAt).getTime();   vb = new Date(b.exitAt).getTime();   break;
        case 'entryPrice':   va = a.entryPrice;  vb = b.entryPrice;  break;
        case 'exitPrice':    va = a.exitPrice;   vb = b.exitPrice;   break;
        case 'entryValue':   va = a.entryValue;  vb = b.entryValue;  break;
        case 'netPnl':       va = a.netPnl;      vb = b.netPnl;      break;
        case 'pnlPct':       va = a.pnlPct;      vb = b.pnlPct;      break;
        default:             va = a.tradeNumber; vb = b.tradeNumber; break;
      }
      return sortDir === 'asc' ? va - vb : vb - va;
    });
    return arr;
  }, [trades, filter, sortKey, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageData   = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const filterOptions: Array<{ value: ActionFilter; label: string }> = [
    { value: 'all',    label: `All (${trades.length})` },
    { value: 'winner', label: `Winners (${trades.filter(t => t.isWinner).length})` },
    { value: 'loser',  label: `Losers (${trades.filter(t => !t.isWinner).length})` },
    { value: 'long',   label: `Long (${trades.filter(t => t.side === 'long').length})` },
    { value: 'short',  label: `Short (${trades.filter(t => t.side === 'short').length})` },
  ];

  if (trades.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <ListChecks className="h-10 w-10 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No trades recorded in this session</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <div className="flex gap-1">
            {filterOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => { setFilter(opt.value); setPage(0); }}
                className={cn(
                  'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                  filter === opt.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary/30 text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1" />

        <button
          onClick={() => exportCsv(filtered)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground bg-secondary/30 hover:bg-secondary/60 transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-white/5">
        <table className="w-full min-w-max">
          <thead className="bg-secondary/20 border-b border-white/5">
            <tr>
              <SortHeader label="#"            sortKey="tradeNumber" current={sortKey} dir={sortDir} onClick={() => toggleSort('tradeNumber')} />
              <SortHeader label="Date"         sortKey="exitAt"      current={sortKey} dir={sortDir} onClick={() => toggleSort('exitAt')} />
              <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Action</th>
              <SortHeader label="Entry"        sortKey="entryPrice"  current={sortKey} dir={sortDir} onClick={() => toggleSort('entryPrice')} />
              <SortHeader label="Exit"         sortKey="exitPrice"   current={sortKey} dir={sortDir} onClick={() => toggleSort('exitPrice')} />
              <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Qty</th>
              <SortHeader label="Size"         sortKey="entryValue"  current={sortKey} dir={sortDir} onClick={() => toggleSort('entryValue')} />
              <SortHeader label="Net PnL"      sortKey="netPnl"      current={sortKey} dir={sortDir} onClick={() => toggleSort('netPnl')} />
              <SortHeader label="PnL %"        sortKey="pnlPct"      current={sortKey} dir={sortDir} onClick={() => toggleSort('pnlPct')} />
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {pageData.map((trade, rowI) => {
                const isWin = trade.isWinner;
                return (
                  <motion.tr
                    key={trade.tradeNumber}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.1, delay: rowI * 0.01 }}
                    className={cn(
                      'border-b border-white/5 transition-colors text-sm',
                      'hover:bg-secondary/20',
                    )}
                  >
                    {/* # */}
                    <td className="px-3 py-3 text-muted-foreground font-mono text-xs">
                      {trade.tradeNumber}
                    </td>
                    {/* Date */}
                    <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {fmtDate(trade.exitAt)}
                    </td>
                    {/* Action */}
                    <td className="px-3 py-3">
                      <div className={cn(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase',
                        trade.side === 'long'
                          ? 'bg-green-500/15 text-green-400'
                          : 'bg-red-500/15 text-red-400',
                      )}>
                        {trade.side === 'long'
                          ? <TrendingUp className="h-2.5 w-2.5" />
                          : <TrendingDown className="h-2.5 w-2.5" />}
                        {trade.side}
                      </div>
                    </td>
                    {/* Entry */}
                    <td className="px-3 py-3 text-xs font-mono text-foreground">
                      ${trade.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                    </td>
                    {/* Exit */}
                    <td className="px-3 py-3 text-xs font-mono text-foreground">
                      ${trade.exitPrice.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                    </td>
                    {/* Qty */}
                    <td className="px-3 py-3 text-xs font-mono text-muted-foreground">
                      {trade.quantity.toFixed(4)}
                    </td>
                    {/* Size */}
                    <td className="px-3 py-3 text-xs font-mono text-foreground">
                      {fmt$(trade.entryValue)}
                    </td>
                    {/* Net PnL */}
                    <td className="px-3 py-3">
                      <span className={cn(
                        'text-xs font-semibold tabular-nums',
                        isWin ? 'text-green-400' : 'text-red-400',
                      )}>
                        {trade.netPnl >= 0 ? '+' : ''}{fmt$(trade.netPnl)}
                      </span>
                    </td>
                    {/* PnL % */}
                    <td className="px-3 py-3">
                      <span className={cn(
                        'text-xs font-semibold tabular-nums',
                        isWin ? 'text-green-400' : 'text-red-400',
                      )}>
                        {trade.pnlPct >= 0 ? '+' : ''}{trade.pnlPct.toFixed(2)}%
                      </span>
                    </td>
                  </motion.tr>
                );
              })}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length} trades
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground bg-secondary/30 hover:bg-secondary/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const p = Math.max(0, Math.min(page - 3, totalPages - 7)) + i;
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={cn(
                    'w-7 h-7 rounded-lg text-xs font-medium transition-colors',
                    page === p
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground bg-secondary/30 hover:bg-secondary/60',
                  )}
                >
                  {p + 1}
                </button>
              );
            })}
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground bg-secondary/30 hover:bg-secondary/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
