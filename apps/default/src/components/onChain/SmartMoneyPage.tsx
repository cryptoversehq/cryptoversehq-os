/**
 * SmartMoneyPage.tsx — Spec §3.3
 * Route: /on-chain/smart-money
 *
 * Filterable table of top smart wallets with expandable detail rows.
 */
import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, RefreshCw, Search, ChevronDown, ChevronUp,
  TrendingUp, Crosshair, Copy, ExternalLink, Star,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  SMART_MONEY_WALLETS, SmartWallet, ALL_CHAINS, CHAIN_DISPLAY,
  fmtUsd, fmtAddr, timeAgo,
} from './onChainUtils';
import { CHAIN_META } from '../../lib/onChainTypes';
import { MonitoredChain } from '../../lib/onChainTypes';
import { cn } from '@/lib/utils';

// ── Fake recent trade generator ───────────────────────────────────────────────

function genTrades(w: SmartWallet) {
  const symbols = ['ETH', 'BTC', 'SOL', 'MATIC', 'BNB', 'USDC', 'LINK', 'UNI'];
  return Array.from({ length: 3 }, (_, i) => {
    const sym    = symbols[Math.floor(Math.random() * symbols.length)];
    const isBuy  = Math.random() > 0.4;
    const amount = Math.round(Math.random() * 200 + 10);
    const price  = Math.round(Math.random() * 3000 + 50);
    const pnlPct = (Math.random() * 30 - 5).toFixed(1);
    return { sym, isBuy, amount, price, pnlPct: +pnlPct };
  });
}

// ── Portfolio composition ─────────────────────────────────────────────────────

function PortfolioBar({ items }: { items: { label: string; pct: number; color: string }[] }) {
  return (
    <div className="space-y-1.5">
      {items.map(item => (
        <div key={item.label} className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground w-12 text-right shrink-0">{item.label}</span>
          <div className="flex-1 h-2 rounded-full bg-secondary/30 overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${item.pct}%`, background: item.color }} />
          </div>
          <span className="text-[11px] font-bold text-foreground w-8 shrink-0">{item.pct}%</span>
        </div>
      ))}
    </div>
  );
}

// ── Expanded wallet detail ────────────────────────────────────────────────────

function WalletDetail({ wallet }: { wallet: SmartWallet }) {
  const navigate = useNavigate();
  const trades   = useMemo(() => genTrades(wallet), [wallet.address]);
  const chain    = CHAIN_DISPLAY[wallet.chain];
  const explorer = `${CHAIN_META[wallet.chain].explorerUrl.replace('/tx', '/address')}/${wallet.address}`;

  const portfolio = [
    { label: chain.abbr, pct: 45, color: chain.color },
    { label: 'USDC',     pct: 25, color: '#60a5fa' },
    { label: 'WBTC',     pct: 15, color: '#f7931a' },
    { label: 'Other',    pct: 15, color: '#6b7280' },
  ];

  return (
    <div className="px-4 pb-4 pt-2 space-y-4">
      {/* Portfolio composition */}
      <div>
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
          Portfolio Composition
        </p>
        <PortfolioBar items={portfolio} />
      </div>

      {/* Recent trades */}
      <div>
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
          Recent Trades (Last 7 days)
        </p>
        <div className="space-y-1.5">
          {trades.map((t, i) => (
            <div key={i} className="flex items-center gap-3 text-xs">
              <span className={cn('font-bold w-8', t.isBuy ? 'text-emerald-400' : 'text-red-400')}>
                {t.isBuy ? 'BUY' : 'SELL'}
              </span>
              <span className="text-foreground">{t.amount} {t.sym} @ ${t.price.toLocaleString()}</span>
              <span className={cn('ml-auto font-bold', t.pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                {t.pnlPct >= 0 ? '+' : ''}{t.pnlPct}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
        <button onClick={() => navigate(`/on-chain/wallet/${wallet.address}`)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
          style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.25)' }}>
          <TrendingUp className="h-3.5 w-3.5" /> View Full Portfolio
        </button>
        <button onClick={() => navigate(`/on-chain/wallet/${wallet.address}`)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-border text-muted-foreground hover:text-foreground transition-colors">
          <Crosshair className="h-3.5 w-3.5" /> Track This Wallet
        </button>
        <a href={explorer} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-border text-muted-foreground hover:text-primary transition-colors">
          <ExternalLink className="h-3.5 w-3.5" /> Explorer
        </a>
      </div>
    </div>
  );
}

// ── Table row ─────────────────────────────────────────────────────────────────

function WalletRow({ wallet, rank, isExpanded, onToggle }: {
  wallet: SmartWallet; rank: number; isExpanded: boolean; onToggle: () => void;
}) {
  const navigate  = useNavigate();
  const chain     = CHAIN_DISPLAY[wallet.chain];
  const [starred, setStarred] = useState(false);
  const isPositive = wallet.pnl30d >= 0;
  const isTopThree = rank <= 3;

  const badgeEmoji = rank === 1 ? '🏆' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;
  const subtitle   = isTopThree ? `${badgeEmoji} ${rank <= 1 ? '3 weeks top performer' : rank === 2 ? 'Rising this week' : 'Consistent earner'}` : null;

  return (
    <>
      <div
        className="grid items-center px-4 py-3 hover:bg-white/2 transition-colors cursor-pointer border-b border-white/4"
        style={{ gridTemplateColumns: '2.5rem 1fr 3.5rem 5rem 5rem 4rem 4rem 2.5rem', gap: '0.5rem' }}
        onClick={onToggle}
      >
        {/* Rank */}
        <div className="text-center">
          <span className="font-black text-sm" style={{ color: isTopThree ? '#FFD700' : 'rgba(255,255,255,0.4)' }}>
            #{rank}
          </span>
        </div>

        {/* Wallet + label */}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold" style={{ color: chain.color }}>{chain.icon}</span>
            <span className="font-mono text-sm text-foreground">{fmtAddr(wallet.address)}</span>
            <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(wallet.address).catch(() => {}); toast.success('Copied!', { duration: 1500 }); }}
              className="text-muted-foreground/40 hover:text-muted-foreground transition-colors">
              <Copy className="h-3 w-3" />
            </button>
          </div>
          {subtitle && <p className="text-[10px] text-muted-foreground">{subtitle}</p>}
        </div>

        {/* Chain */}
        <span className="text-xs font-bold text-center" style={{ color: chain.color }}>{chain.abbr}</span>

        {/* 7d PnL */}
        <span className={cn('font-bold text-sm text-right', isPositive ? 'text-emerald-400' : 'text-red-400')}>
          {isPositive ? '+' : ''}{((wallet.pnl30d / wallet.totalVolume) * 100 * 0.7).toFixed(1)}%
        </span>

        {/* 30d PnL */}
        <span className={cn('font-bold text-sm text-right', isPositive ? 'text-emerald-400' : 'text-red-400')}>
          {isPositive ? '+' : ''}{fmtUsd(Math.abs(wallet.pnl30d))}
        </span>

        {/* Trades */}
        <span className="text-sm text-right text-foreground">{wallet.trades30d}</span>

        {/* Follow button */}
        <button
          onClick={e => {
            e.stopPropagation();
            navigate(`/on-chain/wallet/${wallet.address}`);
          }}
          className="flex items-center justify-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold border transition-all"
          style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.25)' }}>
          Copy
        </button>

        {/* Expand arrow */}
        <div className="flex justify-center text-muted-foreground">
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </div>

      {/* Expanded detail */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-b border-white/4"
            style={{ background: 'rgba(255,255,255,0.015)' }}>
            <WalletDetail wallet={wallet} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function SmartMoneyPage() {
  const navigate = useNavigate();
  const [chainFilter, setChainFilter] = useState<MonitoredChain | 'all'>('all');
  const [period, setPeriod]           = useState<'7d' | '30d'>('7d');
  const [minPnlPct, setMinPnlPct]     = useState(0);
  const [search, setSearch]           = useState('');
  const [expandedAddr, setExpandedAddr] = useState<string | null>(null);

  const filtered = useMemo(() =>
    SMART_MONEY_WALLETS
      .filter(w => {
        if (chainFilter !== 'all' && w.chain !== chainFilter) return false;
        if (search && !w.address.toLowerCase().includes(search.toLowerCase()) &&
            !w.label.toLowerCase().includes(search.toLowerCase())) return false;
        const pctPnl = (w.pnl30d / w.totalVolume) * 100;
        if (minPnlPct > 0 && pctPnl < minPnlPct) return false;
        return true;
      })
      .sort((a, b) => b.pnl30d - a.pnl30d),
    [chainFilter, search, minPnlPct],
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 sm:px-6 py-4 border-b border-border shrink-0">
        <button onClick={() => navigate('/on-chain')}
          className="p-2 rounded-xl hover:bg-secondary/30 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="font-bold text-lg">🧠 Smart Money Tracker</h1>
        <button onClick={() => toast.success('Data refreshed')}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-border text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">

          {/* Filters bar */}
          <div className="flex flex-wrap gap-2 items-center">
            {/* Chain */}
            <select value={chainFilter} onChange={e => setChainFilter(e.target.value as any)}
              className="px-3 py-2 rounded-xl text-xs font-semibold border bg-transparent appearance-none cursor-pointer"
              style={{ background: 'var(--cv-dash-input-bg)', borderColor: 'var(--cv-dash-border)', color: 'var(--cv-dash-text)' }}>
              <option value="all" style={{ background: 'var(--cv-dash-panel-bg)', color: 'var(--cv-dash-text)' }}>All Chains</option>
              {ALL_CHAINS.map(c => <option key={c} value={c} style={{ background: 'var(--cv-dash-panel-bg)', color: 'var(--cv-dash-text)' }}>{CHAIN_DISPLAY[c].icon} {CHAIN_DISPLAY[c].name}</option>)}
            </select>

            {/* Period */}
            {(['7d', '30d'] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all',
                  period === p ? 'bg-secondary/50 border-border text-foreground' : 'border-border text-muted-foreground hover:border-border')}>
                {p}
              </button>
            ))}

            {/* Min PnL */}
            <select value={minPnlPct} onChange={e => setMinPnlPct(+e.target.value)}
              className="px-3 py-2 rounded-xl text-xs font-semibold border bg-transparent appearance-none cursor-pointer"
              style={{ background: 'var(--cv-dash-input-bg)', borderColor: 'var(--cv-dash-border)', color: 'var(--cv-dash-text)' }}>
              <option value={0}  style={{ background: 'var(--cv-dash-panel-bg)', color: 'var(--cv-dash-text)' }}>Min PnL: Any</option>
              <option value={10} style={{ background: 'var(--cv-dash-panel-bg)', color: 'var(--cv-dash-text)' }}>Min PnL: 10%</option>
              <option value={20} style={{ background: 'var(--cv-dash-panel-bg)', color: 'var(--cv-dash-text)' }}>Min PnL: 20%</option>
              <option value={50} style={{ background: 'var(--cv-dash-panel-bg)', color: 'var(--cv-dash-text)' }}>Min PnL: 50%</option>
            </select>

            {/* Search */}
            <div className="relative flex items-center ml-auto">
              <Search className="absolute left-3 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search wallet..."
                className="pl-8 pr-4 py-2 rounded-xl text-xs border bg-transparent w-44 focus:outline-none"
                style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)' }} />
            </div>
          </div>

          {/* Table */}
          <div className="rounded-2xl overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
            {/* Header */}
            <div className="grid px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border"
              style={{ gridTemplateColumns: '2.5rem 1fr 3.5rem 5rem 5rem 4rem 4rem 2.5rem', gap: '0.5rem',
                background: 'rgba(255,255,255,0.03)' }}>
              <span className="text-center">Rank</span>
              <span>Wallet</span>
              <span className="text-center">Chain</span>
              <span className="text-right">7d PnL</span>
              <span className="text-right">30d PnL</span>
              <span className="text-right">Trades</span>
              <span className="text-right">Follow</span>
              <span></span>
            </div>

            {/* Rows */}
            {filtered.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">No wallets match your filters.</div>
            ) : (
              filtered.map((w, i) => (
                <WalletRow
                  key={w.address}
                  wallet={w}
                  rank={i + 1}
                  isExpanded={expandedAddr === w.address}
                  onToggle={() => setExpandedAddr(a => a === w.address ? null : w.address)}
                />
              ))
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
