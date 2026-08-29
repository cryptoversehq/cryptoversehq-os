/**
 * CopyHistoryPage.tsx — /copy-trading/history
 * Complete copy trade history with filters, table and summary stats.
 */
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, History, Download, Filter, ChevronDown } from 'lucide-react';
import { useCopyTradingStore } from '../../lib/copyTradingStore';
import { useAuthStore } from '../../lib/authStore';
import { CopyExecution } from '../../lib/copyTradingTypes';
import { CTV, fmtUsd, fmtDateTime } from './CopyTradingUtils';

type DateRange = '7d' | '30d' | '90d' | 'all';
const DATE_RANGE_OPTIONS: { label: string; value: DateRange }[] = [
  { label: 'Last 7 Days',  value: '7d'  },
  { label: 'Last 30 Days', value: '30d' },
  { label: 'Last 90 Days', value: '90d' },
  { label: 'All Time',     value: 'all' },
];

export function CopyHistoryPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const userId   = user?.id ?? 'demo_follower';

  const getMyExecutions   = useCopyTradingStore(s => s.getMyExecutions);
  const getTopTraders     = useCopyTradingStore(s => s.getTopTraders);
  const traders           = useCopyTradingStore(s => s.traders);

  const [traderFilter,  setTraderFilter]  = useState<string>('all');
  const [dateRange,     setDateRange]     = useState<DateRange>('30d');
  const [symbolFilter,  setSymbolFilter]  = useState<string>('all');
  const [page,          setPage]          = useState(0);
  const PAGE_SIZE = 15;

  const allExecs   = useMemo(() => getMyExecutions(userId), [userId]);
  const topTraders = useMemo(() => getTopTraders(), [traders]);
  const traderIds  = useMemo(() => Array.from(new Set(allExecs.map(e => e.traderId))), [allExecs]);
  const symbols    = useMemo(() => Array.from(new Set(allExecs.map(e => e.symbol))).sort(), [allExecs]);

  const cutoff: Record<DateRange, number> = {
    '7d':  7  * 86_400_000,
    '30d': 30 * 86_400_000,
    '90d': 90 * 86_400_000,
    'all': Infinity,
  };

  const filtered = useMemo(() => allExecs.filter(e => {
    const tOk   = traderFilter === 'all' || e.traderId === traderFilter;
    const symOk = symbolFilter === 'all' || e.symbol === symbolFilter;
    const dOk   = Date.now() - new Date(e.executedAt).getTime() <= cutoff[dateRange];
    return tOk && symOk && dOk;
  }), [allExecs, traderFilter, symbolFilter, dateRange]);

  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  // Summary stats
  const closed     = filtered.filter(e => e.status === 'closed' && e.pnlUsd !== null);
  const wins       = closed.filter(e => (e.pnlUsd ?? 0) >= 0);
  const losses     = closed.filter(e => (e.pnlUsd ?? 0) < 0);
  const totalProfit = closed.reduce((s, e) => s + (e.pnlUsd ?? 0), 0);
  const totalFees   = filtered.reduce((s, e) => s + e.feePaidCP, 0);
  const winRate     = closed.length > 0 ? ((wins.length / closed.length) * 100).toFixed(1) : '0.0';

  function exportCSV() {
    const rows = ['Date,Trader,Symbol,Type,Price,Amount,PnL,PnL%,Fee(CP)'];
    filtered.forEach(e => {
      rows.push([
        fmtDateTime(e.executedAt), e.traderName, e.symbol, e.type,
        e.originalPriceUsd.toFixed(2), e.copiedAmountUsd.toFixed(2),
        e.pnlUsd?.toFixed(2) ?? '', e.pnlPct?.toFixed(2) ?? '', e.feePaidCP.toFixed(2),
      ].join(','));
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'copy-trades.csv'; a.click();
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 border-b shrink-0"
        style={{ borderColor: CTV.goldBorder, background: 'var(--bg-card)' }}>
        <button onClick={() => navigate('/copy-trading')}
          className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: CTV.gray }}>
          <ArrowLeft className="h-3.5 w-3.5" /> Copy Trading
        </button>
        <h1 className="font-bold text-foreground flex items-center gap-2">
          <History className="h-4 w-4" style={{ color: CTV.gold }} /> Copy Trade History
        </h1>
        <button onClick={exportCSV}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
          style={{ background: CTV.surface, color: CTV.gray, border: `1px solid ${CTV.border}` }}>
          <Download className="h-3.5 w-3.5" /> Export
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">

          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <Select
              value={traderFilter}
              onChange={setTraderFilter}
              options={[{ label: 'All Traders', value: 'all' }, ...traderIds.map(id => ({
                label: allExecs.find(e => e.traderId === id)?.traderName ?? id,
                value: id,
              }))]}
              placeholder="All Traders"
            />
            <Select
              value={dateRange}
              onChange={v => setDateRange(v as DateRange)}
              options={DATE_RANGE_OPTIONS}
              placeholder="Last 30 Days"
            />
            <Select
              value={symbolFilter}
              onChange={setSymbolFilter}
              options={[{ label: 'All Symbols', value: 'all' }, ...symbols.map(s => ({ label: s, value: s }))]}
              placeholder="All Symbols"
            />
          </div>

          {/* Table */}
          <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${CTV.border}` }}>
            <div className="grid grid-cols-7 gap-2 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider"
              style={{ background: 'var(--bg-secondary)', color: CTV.gray, borderBottom: `1px solid ${CTV.border}`, gridTemplateColumns: '2fr 1.5fr 1fr 1fr 1fr 1fr 1fr' }}>
              <span>Date / Time</span><span>Trader</span><span>Symbol</span>
              <span>Type</span><span>Price</span><span>Amount</span><span className="text-right">PnL</span>
            </div>

            {paginated.length === 0 ? (
              <div className="py-16 text-center" style={{ background: 'var(--bg-card)' }}>
                <p className="text-sm text-muted-foreground">No trades match your filters.</p>
              </div>
            ) : paginated.map((exec, i) => (
              <ExecRow key={exec.id} exec={exec} isLast={i === paginated.length - 1} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold disabled:opacity-40"
                style={{ background: CTV.surface, color: CTV.gray, border: `1px solid ${CTV.border}` }}>
                Previous
              </button>
              <span className="text-xs" style={{ color: CTV.gray }}>Page {page + 1} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold disabled:opacity-40"
                style={{ background: CTV.surface, color: CTV.gray, border: `1px solid ${CTV.border}` }}>
                Next
              </button>
            </div>
          )}

          {/* Summary Stats */}
          <section>
            <h2 className="font-bold text-foreground mb-3">Summary Statistics</h2>
            <div className="rounded-2xl p-5 space-y-2" style={{ background: 'var(--bg-card)', border: `1px solid ${CTV.border}` }}>
              {[
                { label: 'Total Copied Trades',     value: filtered.length.toLocaleString() },
                { label: 'Winning Trades',           value: `${wins.length} (${winRate}%)` },
                { label: 'Losing Trades',            value: `${losses.length} (${closed.length > 0 ? (100 - +winRate).toFixed(1) : '0.0'}%)` },
                { label: 'Total Profit',             value: fmtUsd(totalProfit), color: totalProfit >= 0 ? CTV.green : CTV.red },
                { label: 'Total Copy Fees Paid',     value: `${totalFees.toFixed(2)} CP` },
                { label: 'Net Profit (after fees)',  value: fmtUsd(totalProfit - totalFees * 0.01), color: (totalProfit - totalFees * 0.01) >= 0 ? CTV.green : CTV.red },
              ].map(s => (
                <div key={s.label} className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{s.label}</span>
                  <span className="text-sm font-bold" style={{ color: s.color ?? 'var(--foreground)' }}>{s.value}</span>
                </div>
              ))}
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Select({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void; options: { label: string; value: string }[]; placeholder: string;
}) {
  return (
    <div className="relative">
      <select value={value} onChange={e => onChange(e.target.value)}
        className="appearance-none pl-3 pr-8 py-2 rounded-xl text-xs font-semibold focus:outline-none cursor-pointer"
        style={{ background: 'var(--bg-secondary)', border: `1px solid ${CTV.border}`, color: 'var(--foreground)' }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none" style={{ color: CTV.gray }} />
    </div>
  );
}

function ExecRow({ exec, isLast }: { exec: CopyExecution; isLast: boolean }) {
  const profitOk = exec.pnlUsd === null ? null : exec.pnlUsd >= 0;

  return (
    <div className="grid gap-2 px-4 py-3 text-xs"
      style={{
        gridTemplateColumns: '2fr 1.5fr 1fr 1fr 1fr 1fr 1fr',
        background: 'var(--bg-card)',
        borderBottom: isLast ? 'none' : `1px solid ${CTV.border}`,
      }}>
      <span className="text-muted-foreground">{fmtDateTime(exec.executedAt)}</span>
      <span className="font-semibold text-foreground truncate">{exec.traderName}</span>
      <span className="font-bold text-foreground">{exec.symbol}</span>
      <span className="font-bold" style={{ color: exec.type === 'BUY' ? CTV.green : CTV.red }}>{exec.type}</span>
      <span style={{ color: CTV.gray }}>${exec.originalPriceUsd.toLocaleString()}</span>
      <span style={{ color: CTV.gray }}>{fmtUsd(exec.copiedAmountUsd)}</span>
      <span className="text-right font-bold" style={{ color: exec.pnlUsd === null ? CTV.gray : profitOk ? CTV.green : CTV.red }}>
        {exec.pnlUsd === null ? 'Open' : fmtUsd(exec.pnlUsd)}
      </span>
    </div>
  );
}
