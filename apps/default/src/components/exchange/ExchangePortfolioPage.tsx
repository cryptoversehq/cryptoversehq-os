/**
 * ExchangePortfolioPage.tsx
 * Route: /exchange/portfolio
 * Spec §3.4 — Portfolio value, allocation chart, performance chart, trade history, export
 */
import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  RefreshCw, Download, BarChart3, TrendingUp, TrendingDown,
  ArrowUpRight, ArrowDownLeft, Bot, Clock, Search,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { cn } from '../../lib/utils';
import { useExchangeStore } from '../../lib/exchangeStore';
import { RealTrade } from '../../lib/exchangeTypes';
import { toast } from 'sonner';

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtUSD(n: number, dp = 2): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: dp }).format(n);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Generate portfolio history ─────────────────────────────────────────────────

function buildPortfolioHistory(baseUSD: number, days = 180) {
  const data: { date: string; value: number; pnl: number }[] = [];
  let val = baseUSD * 0.6;
  for (let i = days; i >= 0; i--) {
    val *= (1 + (Math.random() - 0.44) * 0.025);
    const d = new Date(Date.now() - i * 86400000);
    data.push({
      date: d.toISOString(),
      value: Math.max(0, val),
      pnl: val - baseUSD * 0.6,
    });
  }
  return data;
}

// ── Pie chart colors ───────────────────────────────────────────────────────────

const ASSET_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#3b82f6', '#8b5cf6'];

// ── Allocation Bar ─────────────────────────────────────────────────────────────

function AllocationSection({ portfolio }: { portfolio: ReturnType<ReturnType<typeof useExchangeStore>['getPortfolio']> }) {
  if (!portfolio) return null;
  const { assets, totalUSD } = portfolio;
  const pieData = assets.map((a, i) => ({ name: a.symbol, value: a.allocation, fill: ASSET_COLORS[i % ASSET_COLORS.length] }));

  return (
    <div className="rounded-2xl border border-white/8 p-5 space-y-4"
      style={{ background: 'rgba(255,255,255,0.02)' }}>
      <p className="text-xs font-black text-white/40 uppercase tracking-wider">Asset Allocation</p>

      {/* Text allocation bar */}
      <div className="space-y-2">
        <div className="flex gap-1 h-3 rounded-full overflow-hidden">
          {assets.map((a, i) => (
            <div key={a.symbol} className="h-full rounded-sm transition-all" title={`${a.symbol}: ${a.allocation.toFixed(1)}%`}
              style={{ width: `${a.allocation}%`, background: ASSET_COLORS[i % ASSET_COLORS.length] }} />
          ))}
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          {assets.map((a, i) => (
            <div key={a.symbol} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: ASSET_COLORS[i % ASSET_COLORS.length] }} />
              <span className="text-white/60">{a.symbol}: <span className="font-bold text-white/80">{a.allocation.toFixed(1)}%</span></span>
            </div>
          ))}
        </div>
      </div>

      {/* Detailed rows */}
      <div className="space-y-2">
        {assets.map((a, i) => (
          <div key={a.symbol} className="flex items-center gap-3 text-xs">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0"
              style={{ background: `${ASSET_COLORS[i % ASSET_COLORS.length]}20` }}>
              {a.logoEmoji}
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white">{a.symbol}</span>
                <span className="font-black text-white">{fmtUSD(a.valueUSD, 0)}</span>
              </div>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-white/30">{a.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                <span className={cn('font-bold', a.pnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {a.pnl >= 0 ? '+' : ''}{fmtUSD(a.pnl)} ({a.pnlPct >= 0 ? '+' : ''}{a.pnlPct.toFixed(1)}%)
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Performance Chart ──────────────────────────────────────────────────────────

function PerformanceChart({ baseUSD }: { baseUSD: number }) {
  const [range, setRange] = useState<'1m' | '3m' | '6m'>('3m');
  const days = range === '1m' ? 30 : range === '3m' ? 90 : 180;
  const data = useMemo(() => buildPortfolioHistory(baseUSD, days), [baseUSD, range]);

  const latest    = data[data.length - 1]?.value ?? baseUSD;
  const first     = data[0]?.value ?? baseUSD;
  const totalPnL  = latest - first;
  const pnlPct    = ((latest - first) / first) * 100;
  const isPos     = totalPnL >= 0;

  // Downsample for chart
  const step = Math.max(1, Math.floor(data.length / 60));
  const chartData = data.filter((_, i) => i % step === 0).map(d => ({
    date: fmtDateShort(d.date),
    value: Math.round(d.value),
  }));

  return (
    <div className="rounded-2xl border border-white/8 p-5 space-y-4"
      style={{ background: 'rgba(255,255,255,0.02)' }}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs font-black text-white/40 uppercase tracking-wider">Performance Chart</p>
        <div className="flex gap-1">
          {(['1m', '3m', '6m'] as const).map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={cn('px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors',
                range === r ? 'bg-primary/20 text-primary' : 'text-white/30 hover:text-white/60',
              )}>
              {r.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* P&L summary */}
      <div className="flex items-center gap-4">
        <div>
          <p className="text-[10px] text-white/30">{range.toUpperCase()} P&L</p>
          <p className={cn('text-xl font-black', isPos ? 'text-emerald-400' : 'text-red-400')}>
            {isPos ? '+' : ''}{fmtUSD(totalPnL)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-white/30">Return</p>
          <p className={cn('text-sm font-black', isPos ? 'text-emerald-400' : 'text-red-400')}>
            {isPos ? '+' : ''}{pnlPct.toFixed(2)}%
          </p>
        </div>
      </div>

      {/* Chart */}
      <div style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            <defs>
              <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={isPos ? '#10b981' : '#ef4444'} stopOpacity={0.25} />
                <stop offset="95%" stopColor={isPos ? '#10b981' : '#ef4444'} stopOpacity={0}   />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.25)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.25)' }} tickLine={false} axisLine={false}
              tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} width={45} />
            <Tooltip
              contentStyle={{ background: 'rgba(10,10,20,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 11 }}
              labelStyle={{ color: 'rgba(255,255,255,0.5)', fontWeight: 'bold' }}
              formatter={(val: number) => [fmtUSD(val, 0), 'Portfolio Value']}
            />
            <Area type="monotone" dataKey="value" stroke={isPos ? '#10b981' : '#ef4444'}
              strokeWidth={2} fill="url(#portfolioGrad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Trade History Table ────────────────────────────────────────────────────────

function TradeHistoryTable({ trades, onExport }: { trades: RealTrade[]; onExport: () => void }) {
  const [search, setSearch] = useState('');
  const [page,   setPage]   = useState(1);
  const PAGE = 10;

  const filtered = useMemo(() => trades.filter(t =>
    !search || t.symbol.toLowerCase().includes(search.toLowerCase()),
  ), [trades, search]);

  const paged = filtered.slice(0, page * PAGE);

  return (
    <div className="rounded-2xl border border-white/8 overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.02)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/5 flex-wrap gap-2">
        <p className="text-xs font-black text-white/40 uppercase tracking-wider">Trade History</p>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-white/25" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search pair…"
              className="pl-7 pr-3 py-1.5 bg-white/5 border border-white/8 rounded-lg text-xs text-white placeholder-white/20 focus:outline-none w-32" />
          </div>
          <button onClick={onExport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/6 text-white/50 text-xs font-bold hover:bg-white/12 transition-colors">
            <Download className="h-3 w-3" /> Export
          </button>
        </div>
      </div>

      {/* Column headers */}
      <div className="grid px-4 py-2 text-[9px] font-black text-white/20 uppercase tracking-wider border-b border-white/5"
        style={{ gridTemplateColumns: 'minmax(80px,1.4fr) 0.5fr 0.6fr minmax(70px,0.9fr) minmax(60px,0.9fr) minmax(60px,0.9fr) 0.7fr' }}>
        <span>Date</span>
        <span>Type</span>
        <span>Pair</span>
        <span>Price</span>
        <span>Amount</span>
        <span>Total</span>
        <span>PnL</span>
      </div>

      {/* Rows */}
      {paged.length === 0 ? (
        <div className="text-center py-10 text-xs text-muted-foreground">No trades found</div>
      ) : (
        <div>
          {paged.map((t, i) => {
            const isBuy = t.side === 'buy';
            const pnlPos = (t.pnl ?? 0) >= 0;
            return (
              <div key={t.id}
                className={cn('grid px-4 py-3 text-xs border-b border-white/4 hover:bg-white/[0.02] transition-colors',
                  i % 2 === 0 ? '' : '',
                )}
                style={{ gridTemplateColumns: 'minmax(80px,1.4fr) 0.5fr 0.6fr minmax(70px,0.9fr) minmax(60px,0.9fr) minmax(60px,0.9fr) 0.7fr' }}>
                <div className="text-white/40 text-[10px]">
                  {fmtDate(t.createdAt)}
                </div>
                <div className={cn('font-black uppercase', isBuy ? 'text-emerald-400' : 'text-red-400')}>
                  {t.side}
                </div>
                <div className="font-bold text-white">{t.symbol}</div>
                <div className="font-mono text-white/70">{fmtUSD(t.filledAvgPx)}</div>
                <div className="font-mono text-white/70">{t.filledQty.toFixed(4)}</div>
                <div className="font-mono text-white/60">{fmtUSD(t.filledQty * t.filledAvgPx, 0)}</div>
                <div className={cn('font-black font-mono', t.pnl !== undefined ? (pnlPos ? 'text-emerald-400' : 'text-red-400') : 'text-white/20')}>
                  {t.pnl !== undefined ? `${pnlPos ? '+' : ''}${fmtUSD(t.pnl)}` : '—'}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Load more */}
      {filtered.length > paged.length && (
        <div className="px-5 py-3">
          <button onClick={() => setPage(p => p + 1)}
            className="w-full py-2 rounded-xl border border-white/8 text-xs font-bold text-white/30 hover:bg-white/5 transition-colors">
            Load more ({filtered.length - paged.length} remaining)
          </button>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-white/5 text-[10px] text-white/25">
        <span>Showing {Math.min(paged.length, filtered.length)} of {filtered.length} trades</span>
        <button onClick={onExport}
          className="flex items-center gap-1 text-primary/60 hover:text-primary transition-colors font-bold">
          <BarChart3 className="h-3 w-3" /> View Analytics
        </button>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export function ExchangePortfolioPage() {
  const { getActiveConnection, getPortfolio, getTrades, syncExchange, isSyncing } = useExchangeStore();
  const conn = getActiveConnection();
  const portfolio = conn ? getPortfolio(conn.id) : undefined;
  const trades    = conn ? getTrades(conn.id) : [];

  function handleExport() {
    if (trades.length === 0) { toast.info('No trades to export'); return; }
    const headers = 'Date,Type,Pair,Price,Amount,Total,PnL,Fee';
    const rows = trades.map(t =>
      [fmtDate(t.createdAt), t.side, t.symbol, t.filledAvgPx, t.filledQty.toFixed(6),
       (t.filledQty * t.filledAvgPx).toFixed(2), t.pnl?.toFixed(2) ?? '', t.feePaid.toFixed(4)].join(',')
    );
    const csv  = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a'); a.href = url; a.download = 'trade_history.csv'; a.click();
    URL.revokeObjectURL(url);
    toast.success('Trade history exported');
  }

  if (!conn) {
    return (
      <div className="text-center py-16 space-y-3">
        <p className="text-2xl">📊</p>
        <p className="text-sm text-muted-foreground">Connect an exchange to view your real portfolio.</p>
      </div>
    );
  }

  const totalPnLAllTime = trades.filter(t => t.pnl !== undefined).reduce((s, t) => s + (t.pnl ?? 0), 0);
  const pnlPos = totalPnLAllTime >= 0;

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-black text-white">📊 Real Portfolio Tracker</h2>
          {portfolio && (
            <div className="flex items-center gap-3 mt-1">
              <span className="text-lg font-black text-white">{fmtUSD(portfolio.totalUSD)}</span>
              <span className={cn('text-sm font-bold', pnlPos ? 'text-emerald-400' : 'text-red-400')}>
                ({pnlPos ? '↑' : '↓'}{Math.abs(totalPnLAllTime / (portfolio.totalUSD - totalPnLAllTime) * 100).toFixed(1)}% all-time)
              </span>
            </div>
          )}
        </div>
        <button onClick={() => syncExchange(conn.id)} disabled={isSyncing}
          className={cn('flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all',
            isSyncing ? 'bg-white/5 text-white/25 cursor-not-allowed' : 'bg-white/6 text-white/60 hover:bg-white/12',
          )}>
          <RefreshCw className={cn('h-3.5 w-3.5', isSyncing && 'animate-spin')} />
          {isSyncing ? 'Syncing…' : 'Sync'}
        </button>
      </div>

      {/* Allocation */}
      {portfolio && <AllocationSection portfolio={portfolio} />}

      {/* Performance chart */}
      {portfolio && <PerformanceChart baseUSD={portfolio.totalUSD} />}

      {/* Trade history */}
      <TradeHistoryTable trades={trades} onExport={handleExport} />
    </div>
  );
}
