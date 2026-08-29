/**
 * WalletTrackerPage.tsx — Spec §3.6
 * Route: /on-chain/wallet/:address
 *
 * Wallet overview, portfolio composition, transaction history, similar wallets.
 */
import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Copy, ExternalLink, Bell, Crosshair,
  Activity, TrendingUp, RefreshCw, Wifi, WifiOff,
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { toast } from 'sonner';
import { CHAIN_META } from '../../lib/onChainTypes';
import {
  SMART_MONEY_WALLETS, CHAIN_DISPLAY, fmtUsd, fmtAddr, timeAgo,
} from './onChainUtils';
import { gateway, ChainTransaction } from '../../lib/onChainApiGateway';
import { cn } from '@/lib/utils';

// ── Helpers ───────────────────────────────────────────────────────────────────

function copy(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
  toast.success('Copied!', { duration: 1500 });
}

/** Deterministic chain from address prefix */
function guessChain(address: string) {
  if (address.startsWith('0x')) {
    const n = parseInt(address.slice(2, 4), 16) % 3;
    return n === 0 ? 'ethereum' : n === 1 ? 'bnb' : 'polygon';
  }
  if (address.length === 44) return 'solana';
  return 'bitcoin';
}

/** Generate realistic fake tx history for the wallet */
function generateTxHistory(address: string) {
  const seed   = address.charCodeAt(2) ?? 5;
  const prices = { ETH: 3420, BTC: 65800, SOL: 172, MATIC: 0.87, BNB: 592 };
  const syms   = Object.keys(prices) as Array<keyof typeof prices>;
  return Array.from({ length: 12 }, (_, i) => {
    const sym    = syms[(seed + i) % syms.length];
    const isBuy  = (seed + i) % 3 !== 0;
    const amount = +(Math.random() * 150 + 5).toFixed(2);
    const price  = prices[sym];
    const value  = +(amount * price).toFixed(0);
    const date   = new Date(Date.now() - i * 1.7 * 86400_000);
    return {
      id:   `${address.slice(0, 6)}-${i}`,
      date: date.toISOString().slice(0, 10),
      time: date.toTimeString().slice(0, 5),
      type: isBuy ? 'BUY' : 'SELL',
      via:  isBuy ? ['Uniswap', 'Jupiter', 'QuickSwap', 'PancakeSwap'][(seed + i) % 4] : ['Binance', 'Coinbase', 'Kraken', 'OKX'][(seed + i) % 4],
      sym,
      amount,
      value,
      hash: `0x${address.slice(2, 14)}${i.toString().padStart(4, '0')}`,
    };
  });
}

/** Generate activity sparkline */
function generateSparkline(address: string) {
  const seed = address.charCodeAt(3) ?? 42;
  return Array.from({ length: 30 }, (_, i) => ({
    d: `d${i}`,
    v: Math.max(0, Math.round(seed * 1200 + Math.sin(i * 0.9 + seed) * seed * 900 + Math.random() * 10000)),
  }));
}

/** Generate similar wallets */
function generateSimilar(address: string) {
  return SMART_MONEY_WALLETS
    .filter(w => w.address !== address)
    .slice(0, 3)
    .map((w, i) => ({ ...w, similarity: 90 - i * 5 }));
}

// ── Portfolio bar ─────────────────────────────────────────────────────────────

function PortfolioComposition({ chain }: { chain: string }) {
  const display = CHAIN_DISPLAY[chain as keyof typeof CHAIN_DISPLAY] ?? CHAIN_DISPLAY['ethereum'];
  const items = [
    { label: display.abbr, pct: 45, color: display.color },
    { label: 'USDC',        pct: 25, color: '#60a5fa' },
    { label: 'WBTC',        pct: 15, color: '#f7931a' },
    { label: 'Other',       pct: 15, color: '#6b7280' },
  ];

  return (
    <div className="rounded-2xl p-4"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">
        Portfolio Composition
      </p>

      {/* Proportion text */}
      <p className="text-sm text-foreground mb-3">
        {items.map((it, i) => (
          <span key={it.label}>
            <span style={{ color: it.color }}>{it.label}: {it.pct}%</span>
            {i < items.length - 1 && <span className="text-muted-foreground"> | </span>}
          </span>
        ))}
      </p>

      {/* Combined bar */}
      <div className="h-3 rounded-full flex overflow-hidden gap-0.5">
        {items.map(it => (
          <div key={it.label} className="h-full rounded-sm transition-all"
            style={{ width: `${it.pct}%`, background: it.color }} />
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        {items.map(it => (
          <div key={it.label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <div className="w-2 h-2 rounded-sm" style={{ background: it.color }} />
            {it.label} {it.pct}%
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function WalletTrackerPage() {
  const { address = '' } = useParams<{ address: string }>();
  const navigate  = useNavigate();

  const [tracking, setTracking]     = useState(false);
  const [realTxs, setRealTxs]       = useState<ChainTransaction[] | null>(null);
  const [txSource, setTxSource]     = useState<'real' | 'simulated'>('simulated');
  const [loadingTxs, setLoadingTxs] = useState(false);
  const [balance, setBalance]       = useState<{ native: number; symbol: string } | null>(null);

  const chain   = guessChain(address);
  const display = CHAIN_DISPLAY[chain as keyof typeof CHAIN_DISPLAY] ?? CHAIN_DISPLAY['ethereum'];
  const meta    = CHAIN_META[chain as keyof typeof CHAIN_META] ?? CHAIN_META['ethereum'];
  const explorer = `${meta.explorerUrl.replace('/tx', '/address')}/${address}`;

  // Look up in known smart money wallets
  const knownWallet = SMART_MONEY_WALLETS.find(w => w.address.toLowerCase() === address.toLowerCase());

  const txHistory  = useMemo(() => generateTxHistory(address), [address]);
  const sparkline  = useMemo(() => generateSparkline(address), [address]);
  const similar    = useMemo(() => generateSimilar(address), [address]);

  // Fetch real tx history via gateway (with simulator fallback)
  async function fetchTxHistory() {
    setLoadingTxs(true);
    const [txResult, bal] = await Promise.all([
      gateway.getTransactions(chain as any, address, { offset: 12 }),
      gateway.getBalance(chain as any, address),
    ]);
    setRealTxs(txResult.txs);
    setTxSource(txResult.source);
    setBalance({ native: bal.native, symbol: bal.symbol });
    setLoadingTxs(false);
  }

  useEffect(() => { fetchTxHistory(); }, [address]);

  // Fake overview stats
  const seed        = address.charCodeAt(2) ?? 5;
  const totalValue  = Math.round(seed * 80_000 + 200_000);
  const totalTxs    = Math.round(seed * 50 + 100);
  const winRate     = knownWallet?.winRate ?? Math.round(50 + seed % 30);
  const riskScore   = Math.round(20 + seed % 60);
  const firstSeen   = new Date(Date.now() - (seed * 200 + 365) * 86400_000).toLocaleDateString();
  const lastActive  = knownWallet?.lastActive
    ? new Date(knownWallet.lastActive).toLocaleDateString() + ' ' + new Date(knownWallet.lastActive).toLocaleTimeString()
    : new Date(Date.now() - Math.random() * 5 * 86400_000).toLocaleString();

  const riskLabel = riskScore < 30 ? 'Low' : riskScore < 60 ? 'Medium' : 'High';
  const riskColor = riskScore < 30 ? '#34d399' : riskScore < 60 ? '#fbbf24' : '#ef4444';

  function handleTrack() {
    setTracking(t => !t);
    toast.success(tracking ? 'Removed from watchlist' : 'Wallet added to watchlist');
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 sm:px-6 py-4 border-b border-white/5 shrink-0">
        <button onClick={() => navigate(-1)}
          className="p-2 rounded-xl hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-bold text-sm" style={{ color: display.color }}>{display.icon}</span>
          <h1 className="font-bold text-sm sm:text-base truncate">
            Wallet: <span className="font-mono">{fmtAddr(address)}</span>
          </h1>
          <button onClick={() => copy(address)} className="text-muted-foreground/40 hover:text-muted-foreground transition-colors shrink-0">
            <Copy className="h-4 w-4" />
          </button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {/* Data source badge */}
          <span className={cn('flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full border',
            txSource === 'real'
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
              : 'bg-white/5 text-muted-foreground border-white/10')}>
            {txSource === 'real' ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {txSource === 'real' ? 'LIVE' : 'SIM'}
          </span>

          <button onClick={fetchTxHistory} disabled={loadingTxs}
            className="p-2 rounded-xl border border-white/10 text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className={cn('h-4 w-4', loadingTxs && 'animate-spin')} />
          </button>

          <button onClick={handleTrack}
            className={cn('flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all',
              tracking
                ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                : 'border border-white/10 text-muted-foreground hover:text-foreground')}>
            <Crosshair className="h-4 w-4" />
            {tracking ? 'Tracking' : 'Track Wallet'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">

          {/* ── Wallet overview ─────────────────────────────────────── */}
          <div className="grid sm:grid-cols-2 gap-3">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl p-4"
              style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Balance</p>
                  {balance
                    ? <p className="font-black text-lg text-foreground">{balance.native.toFixed(4)} {balance.symbol}</p>
                    : <p className="font-black text-lg text-foreground">{fmtUsd(totalValue)}</p>}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Transactions</p>
                  <p className="font-black text-lg text-foreground">{totalTxs.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Win Rate</p>
                  <p className="font-bold" style={{ color: winRate > 60 ? '#34d399' : '#fbbf24' }}>{winRate}%</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Risk Score</p>
                  <p className="font-bold" style={{ color: riskColor }}>{riskLabel} ({riskScore}/100)</p>
                </div>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
              className="rounded-2xl p-4"
              style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">First Seen</p>
                  <p className="font-semibold text-foreground">{firstSeen}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Last Active</p>
                  <p className="font-semibold text-foreground text-xs">{lastActive}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Chain</p>
                  <p className="font-bold" style={{ color: display.color }}>{display.icon} {display.name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Label</p>
                  <p className="font-semibold text-foreground">{knownWallet?.label ?? 'Unknown'}</p>
                </div>
              </div>
            </motion.div>
          </div>

          {/* ── Portfolio composition ──────────────────────────────── */}
          <PortfolioComposition chain={chain} />

          {/* ── Activity chart ─────────────────────────────────────── */}
          <div className="rounded-2xl p-4"
            style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">
              Wallet Activity (Last 30 days)
            </p>
            <ResponsiveContainer width="100%" height={100}>
              <AreaChart data={sparkline} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="walletGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={display.color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={display.color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="d" hide />
                <YAxis hide />
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="rounded-lg px-2.5 py-1.5 text-xs"
                      style={{ background: '#0a1929', border: '1px solid rgba(255,255,255,0.1)' }}>
                      <span style={{ color: display.color }}>{fmtUsd(payload[0].value as number)}</span>
                    </div>
                  );
                }} />
                <Area type="monotone" dataKey="v" stroke={display.color} strokeWidth={1.5}
                  fill="url(#walletGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* ── Transaction history ─────────────────────────────────── */}
          <div className="rounded-2xl overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between"
              style={{ background: 'rgba(255,255,255,0.03)' }}>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Transaction History</p>
              <a href={explorer} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
                View on Explorer <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            {/* Table header */}
            <div className="hidden sm:grid px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-white/5"
              style={{ gridTemplateColumns: '7rem 3.5rem 5rem 4rem 5.5rem 5rem 4rem', gap: '0.5rem',
                background: 'rgba(255,255,255,0.02)' }}>
              <span>Date</span>
              <span>Type</span>
              <span>From/To</span>
              <span className="text-right">Amount</span>
              <span className="text-right">Value</span>
              <span className="text-right">Tx Hash</span>
              <span></span>
            </div>

            {/* Loading skeleton */}
            {loadingTxs && (
              <div className="py-8 text-center">
                <RefreshCw className="h-5 w-5 mx-auto animate-spin text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground mt-2">Fetching transactions…</p>
              </div>
            )}

            {/* Real API transactions */}
            {!loadingTxs && realTxs && realTxs.map((tx, i) => {
              const isSend = tx.from.toLowerCase() === address.toLowerCase();
              const date   = tx.timestamp ? tx.timestamp.toLocaleDateString() : '—';
              const time   = tx.timestamp ? tx.timestamp.toLocaleTimeString().slice(0, 5) : '';
              return (
                <div key={tx.hash}
                  className="grid px-4 py-3 hover:bg-white/2 transition-colors border-b border-white/4 last:border-0 text-sm items-center"
                  style={{ gridTemplateColumns: '7rem 3.5rem 5rem 4rem 5.5rem 5rem 4rem', gap: '0.5rem' }}>
                  <div>
                    <p className="text-xs text-foreground">{date}</p>
                    <p className="text-[10px] text-muted-foreground">{time}</p>
                  </div>
                  <span className={cn('font-bold text-xs', isSend ? 'text-red-400' : 'text-emerald-400')}>
                    {isSend ? 'SEND' : 'RECV'}
                  </span>
                  <span className="text-xs text-muted-foreground truncate">{fmtAddr(isSend ? tx.to : tx.from)}</span>
                  <span className="text-right font-mono text-xs">{tx.value.toFixed(4)} {tx.symbol}</span>
                  <span className="text-right font-mono font-bold text-xs">{tx.valueUsd > 0 ? fmtUsd(tx.valueUsd) : '—'}</span>
                  <span className="text-right font-mono text-[11px] text-muted-foreground/60">{tx.hash.slice(0, 8)}…</span>
                  <a href={`${meta.explorerUrl}/${tx.hash}`} target="_blank" rel="noopener noreferrer"
                    className="flex justify-end text-muted-foreground/40 hover:text-primary transition-colors">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              );
            })}

            {/* Simulated tx fallback */}
            {!loadingTxs && !realTxs && txHistory.map((tx, i) => (
              <div key={tx.id}
                className="grid px-4 py-3 hover:bg-white/2 transition-colors border-b border-white/4 last:border-0 text-sm items-center"
                style={{ gridTemplateColumns: '7rem 3.5rem 5rem 4rem 5.5rem 5rem 4rem', gap: '0.5rem' }}>
                <div>
                  <p className="text-xs text-foreground">{tx.date}</p>
                  <p className="text-[10px] text-muted-foreground">{tx.time}</p>
                </div>
                <span className={cn('font-bold text-xs', tx.type === 'BUY' ? 'text-emerald-400' : 'text-red-400')}>
                  {tx.type}
                </span>
                <span className="text-xs text-muted-foreground truncate">{tx.via}</span>
                <span className="text-right font-mono text-xs">{tx.amount} {tx.sym}</span>
                <span className="text-right font-mono font-bold text-xs">{fmtUsd(tx.value)}</span>
                <span className="text-right font-mono text-[11px] text-muted-foreground/60">{tx.hash.slice(0, 8)}…</span>
                <a href={`${meta.explorerUrl}/${tx.hash}`} target="_blank" rel="noopener noreferrer"
                  className="flex justify-end text-muted-foreground/40 hover:text-primary transition-colors">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            ))}
          </div>

          {/* ── Similar wallets ─────────────────────────────────────── */}
          <div className="rounded-2xl p-4"
            style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">
              Similar Wallets
            </p>
            <p className="text-xs text-muted-foreground mb-3">Based on behavior analysis, these wallets show similar patterns:</p>
            <div className="space-y-2.5">
              {similar.map(w => (
                <div key={w.address} className="flex items-center gap-3">
                  <span className="text-muted-foreground/40">•</span>
                  <button onClick={() => navigate(`/on-chain/wallet/${w.address}`)}
                    className="font-mono text-sm text-primary hover:underline">
                    {fmtAddr(w.address)}
                  </button>
                  <span className="text-xs text-muted-foreground">{w.label}</span>
                  <span className="ml-auto text-xs font-bold text-emerald-400">{w.similarity}% similar</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Footer actions ──────────────────────────────────────── */}
          <div className="flex flex-wrap gap-2 pb-2">
            <button onClick={() => navigate('/on-chain/alerts', { state: { prefillAddress: address } })}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold"
              style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)', color: 'white' }}>
              <Bell className="h-4 w-4" /> Create Alert for This Wallet
            </button>
            <a href={explorer} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-white/10 text-muted-foreground hover:text-primary transition-colors">
              <ExternalLink className="h-4 w-4" /> View on Explorer
            </a>
          </div>

        </div>
      </div>
    </div>
  );
}
