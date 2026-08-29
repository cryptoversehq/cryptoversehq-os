/**
 * WhaleFeed.tsx — Live whale transaction feed (Spec §3.1 section)
 *
 * Each alert card shows: amount, route, tx hash, action buttons.
 * Clicking "View Transaction" opens TransactionDetailModal (§3.2).
 * Clicking "Track Wallet" navigates to /on-chain/wallet/:address.
 * Clicking "Create Alert" navigates to /on-chain/alerts.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, RefreshCw, Filter, ChevronDown, Eye, Bell, Crosshair } from 'lucide-react';
import { simulateTick, SimulatedTx } from '../../lib/onChainSimulator';
import { MonitoredChain, WhaleTier, WHALE_TIER_META, CHAIN_META } from '../../lib/onChainTypes';
import { ALL_CHAINS, CHAIN_DISPLAY, fmtUsd, fmtAddr, fmtHash, timeAgo } from './onChainUtils';
import { TransactionDetailModal } from './TransactionDetailModal';
import { cn } from '@/lib/utils';

// ── Filters ───────────────────────────────────────────────────────────────────

interface FeedFilters {
  chains:   MonitoredChain[];
  tiers:    WhaleTier[];
  minValue: number;
}

const DEFAULT_FILTERS: FeedFilters = { chains: [], tiers: [], minValue: 100_000 };

// ── Filter pill ───────────────────────────────────────────────────────────────

function Pill({ active, color, onClick, children }: {
  active: boolean; color: string; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick}
      className={cn('px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all',
        active ? 'border-transparent' : 'border-border text-muted-foreground hover:border-border/60')}
      style={active ? { background: `${color}22`, color, borderColor: `${color}44` } : {}}>
      {children}
    </button>
  );
}

// ── Alert card (spec §3.1 visual) ─────────────────────────────────────────────

function WhaleAlertCard({ tx, isNew, onViewDetail }: {
  tx: SimulatedTx; isNew: boolean; onViewDetail: (tx: SimulatedTx) => void;
}) {
  const navigate  = useNavigate();
  const chain     = CHAIN_DISPLAY[tx.chain];
  const tier      = WHALE_TIER_META[tx.whaleTier];
  const explorer  = `${CHAIN_META[tx.chain].explorerUrl}/${tx.txHash}`;

  const from = tx.fromLabel ?? fmtAddr(tx.fromAddress);
  const to   = tx.toLabel   ?? fmtAddr(tx.toAddress);

  return (
    <motion.div
      initial={isNew ? { opacity: 0, y: -12, borderColor: 'rgba(255,215,0,0.4)' } : { opacity: 1 }}
      animate={{ opacity: 1, y: 0, borderColor: 'var(--border-color)' }}
      transition={{ duration: 0.6 }}
      className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
    >
      {/* Card header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border"
        style={{ background: 'var(--bg-secondary)' }}>
        <div className="flex items-center gap-2">
          <span className={cn('flex items-center gap-1.5 text-xs font-bold')} style={{ color: tier.color.split('-')[1] ? typeof tier.color === 'string' ? tier.color.replace('text-', '') : tier.color : undefined }}>
            {tier.icon} {tier.label.toUpperCase()} ALERT
          </span>
          <span className="text-[11px] text-muted-foreground font-bold" style={{ color: chain.color }}>
            · {chain.icon} {chain.name}
          </span>
        </div>
        <span className="text-[11px] text-muted-foreground">{timeAgo(tx.timestamp)}</span>
      </div>

      {/* Card body */}
      <div className="px-4 py-3">
        <div className="flex items-start gap-4">
          {/* Amount */}
          <div className="shrink-0">
            <p className="font-black text-xl" style={{
              color: tx.whaleTier === 'mega' ? '#FFD700' : tx.whaleTier === 'whale' ? '#a78bfa' : '#34d399',
            }}>
              {fmtUsd(tx.valueUsd)}
            </p>
            <p className="text-xs font-mono text-muted-foreground">{tx.valueNative}</p>
          </div>

          {/* Route */}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground">
              <span className="font-semibold">{tx.tokenSymbol}</span> transferred from
            </p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="font-mono text-xs px-2 py-0.5 rounded-lg bg-secondary/30 text-foreground">{from}</span>
              <span className="text-muted-foreground/50">→</span>
              <span className="font-mono text-xs px-2 py-0.5 rounded-lg bg-secondary/30 text-foreground">{to}</span>
            </div>
            <p className="mt-1.5 font-mono text-[11px] text-muted-foreground/70">
              Tx: {fmtHash(tx.txHash)}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border">
          <button onClick={() => onViewDetail(tx)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
            style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.25)' }}>
            <Eye className="h-3.5 w-3.5" /> View Transaction
          </button>
          <button onClick={() => navigate(`/on-chain/wallet/${tx.fromAddress}`)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-border text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors">
            <Crosshair className="h-3.5 w-3.5" /> Track Wallet
          </button>
          <button onClick={() => navigate('/on-chain/alerts')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-border text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors">
            <Bell className="h-3.5 w-3.5" /> Create Alert
          </button>
          <a href={explorer} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-border text-muted-foreground hover:text-primary transition-colors ml-auto">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props { userId: string; }

export function WhaleFeed({ userId }: Props) {
  const [liveFeed, setLiveFeed]       = useState<SimulatedTx[]>([]);
  const [newIds, setNewIds]           = useState<Set<string>>(new Set());
  const [filters, setFilters]         = useState<FeedFilters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [isPaused, setIsPaused]       = useState(false);
  const [detailTx, setDetailTx]       = useState<SimulatedTx | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Seed initial batch
  useEffect(() => {
    const initial: SimulatedTx[] = [];
    for (const chain of ALL_CHAINS) {
      initial.push(...simulateTick([chain]));
    }
    setLiveFeed(initial.filter(t => t.valueUsd >= filters.minValue).slice(0, 20));
  }, []);

  // Live tick
  const tick = useCallback(() => {
    if (isPaused) return;
    const chains = filters.chains.length > 0 ? filters.chains : ALL_CHAINS;
    const pick   = chains.slice().sort(() => Math.random() - 0.5).slice(0, 2);
    const batch  = simulateTick(pick).filter(t => t.valueUsd >= filters.minValue);
    if (batch.length === 0) return;

    const freshIds = new Set(batch.map(t => t.txHash));
    setNewIds(freshIds);
    setLiveFeed(prev => [...batch, ...prev].slice(0, 60));
    setTimeout(() => setNewIds(new Set()), 3000);
  }, [isPaused, filters]);

  useEffect(() => {
    intervalRef.current = setInterval(tick, 8_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [tick]);

  // Filtered view
  const displayed = liveFeed.filter(tx => {
    const chainOk = filters.chains.length === 0 || filters.chains.includes(tx.chain);
    const tierOk  = filters.tiers.length  === 0 || filters.tiers.includes(tx.whaleTier);
    const valOk   = tx.valueUsd >= filters.minValue;
    return chainOk && tierOk && valOk;
  });

  function toggleChain(c: MonitoredChain) {
    setFilters(f => ({ ...f, chains: f.chains.includes(c) ? f.chains.filter(x => x !== c) : [...f.chains, c] }));
  }
  function toggleTier(t: WhaleTier) {
    setFilters(f => ({ ...f, tiers: f.tiers.includes(t) ? f.tiers.filter(x => x !== t) : [...f.tiers, t] }));
  }

  const TIERS: WhaleTier[] = ['fish', 'dolphin', 'whale', 'mega'];
  const MIN_VALUES = [10_000, 100_000, 500_000, 1_000_000, 5_000_000];

  return (
    <>
      <div className="flex flex-col gap-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="flex items-center gap-2">
            <div className={cn('w-2 h-2 rounded-full', isPaused ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse')} />
            <span className="text-sm font-semibold text-foreground">{isPaused ? 'Paused' : 'Live'}</span>
            <span className="text-xs text-muted-foreground">· {displayed.length} alerts</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setIsPaused(p => !p)}
              className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all',
                isPaused
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
                  : 'border-border text-muted-foreground hover:border-border/60')}>
              {isPaused ? '▶ Resume' : '⏸ Pause'}
            </button>
            <button onClick={() => setShowFilters(f => !f)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-border text-muted-foreground hover:border-border/60 transition-all">
              <Filter className="h-3 w-3" /> Filters
              <ChevronDown className={cn('h-3 w-3 transition-transform', showFilters && 'rotate-180')} />
            </button>
          </div>
        </div>

        {/* Filter panel */}
        <AnimatePresence>
          {showFilters && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="rounded-2xl p-4 space-y-3"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Chain</p>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_CHAINS.map(c => (
                      <Pill key={c} active={filters.chains.includes(c)} color={CHAIN_DISPLAY[c].color}
                        onClick={() => toggleChain(c)}>
                        {CHAIN_DISPLAY[c].icon} {CHAIN_DISPLAY[c].abbr}
                      </Pill>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Whale Tier</p>
                  <div className="flex flex-wrap gap-1.5">
                    {TIERS.map(t => (
                      <Pill key={t} active={filters.tiers.includes(t)} color="#a78bfa"
                        onClick={() => toggleTier(t)}>
                        {WHALE_TIER_META[t].icon} {WHALE_TIER_META[t].label}
                      </Pill>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                    Min Value: <span className="text-foreground">{fmtUsd(filters.minValue)}</span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {MIN_VALUES.map(v => (
                      <Pill key={v} active={filters.minValue === v} color="#60a5fa"
                        onClick={() => setFilters(f => ({ ...f, minValue: v }))}>
                        {fmtUsd(v)}+
                      </Pill>
                    ))}
                  </div>
                </div>
                <button onClick={() => setFilters(DEFAULT_FILTERS)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  ✕ Clear all
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Whale alert cards */}
        {displayed.length === 0 ? (
          <div className="rounded-2xl py-16 text-center"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <RefreshCw className="h-8 w-8 mx-auto mb-3 opacity-20 animate-spin" />
            <p className="text-sm text-muted-foreground">Scanning chains for whale activity…</p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayed.map(tx => (
              <WhaleAlertCard
                key={tx.txHash}
                tx={tx}
                isNew={newIds.has(tx.txHash)}
                onViewDetail={setDetailTx}
              />
            ))}
          </div>
        )}
      </div>

      {/* Transaction Detail Modal */}
      <AnimatePresence>
        {detailTx && (
          <TransactionDetailModal tx={detailTx} onClose={() => setDetailTx(null)} />
        )}
      </AnimatePresence>
    </>
  );
}
