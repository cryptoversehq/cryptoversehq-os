/**
 * SmartMoneyWallets.tsx — Smart money wallet tracker
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ExternalLink, TrendingUp, TrendingDown, Star, Copy, Eye, Activity } from 'lucide-react';
import { toast } from 'sonner';
import { CHAIN_META } from '../../lib/onChainTypes';
import {
  SMART_MONEY_WALLETS, SmartWallet, CHAIN_DISPLAY, ALL_CHAINS,
  fmtUsd, fmtAddr, timeAgo,
} from './onChainUtils';
import { MonitoredChain } from '../../lib/onChainTypes';
import { cn } from '@/lib/utils';

function StatPill({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col items-center px-3 py-2 rounded-xl"
      style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className="font-bold text-sm mt-0.5 text-foreground" style={{ color: color ?? undefined }}>{value}</span>
    </div>
  );
}

function WalletCard({ wallet, rank }: { wallet: SmartWallet; rank: number }) {
  const [watching, setWatching] = useState(false);
  const chain = CHAIN_DISPLAY[wallet.chain];
  const explorer = `${CHAIN_META[wallet.chain].explorerUrl.replace('/tx', '/address')}/${wallet.address}`;
  const isPositive = wallet.pnl30d >= 0;

  function copyAddr() {
    navigator.clipboard.writeText(wallet.address).catch(() => {});
    toast.success('Address copied!', { duration: 2_000 });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: rank * 0.05 }}
      className="rounded-2xl p-4 transition-all hover:translate-y-[-1px]"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black shrink-0"
            style={{
              background: rank <= 3 ? 'rgba(255,215,0,0.15)' : 'var(--bg-secondary)',
              color:      rank <= 3 ? '#FFD700' : 'var(--muted-foreground)',
              border:     rank <= 3 ? '1px solid rgba(255,215,0,0.3)' : '1px solid var(--border-color)',
            }}>
            #{rank}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-sm font-bold" style={{ color: chain.color }}>{chain.icon}</span>
              <span className="font-bold text-sm text-foreground truncate">{wallet.label}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[11px] text-muted-foreground">
                {fmtAddr(wallet.address)}
              </span>
              <button onClick={copyAddr} className="text-muted-foreground/40 hover:text-muted-foreground transition-colors">
                <Copy className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={() => { setWatching(w => !w); toast.success(watching ? 'Removed' : 'Added', { duration: 2000 }); }}
            className={cn('p-1.5 rounded-lg transition-colors', watching ? 'text-yellow-400' : 'text-muted-foreground/40 hover:text-muted-foreground')}>
            <Star className={cn('h-4 w-4', watching && 'fill-yellow-400')} />
          </button>
          <a href={explorer} target="_blank" rel="noopener noreferrer"
            className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-primary transition-colors">
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2 mb-3">
        <StatPill label="30d P&L"    value={fmtUsd(Math.abs(wallet.pnl30d))} color={isPositive ? '#34d399' : '#ef4444'} />
        <StatPill label="Win Rate"   value={`${wallet.winRate}%`}            color={wallet.winRate >= 70 ? '#34d399' : wallet.winRate >= 55 ? '#fbbf24' : '#ef4444'} />
        <StatPill label="Trades"     value={wallet.trades30d.toLocaleString()} />
        <StatPill label="Volume"     value={fmtUsd(wallet.totalVolume)} />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1">
          {wallet.tags.map(tag => (
            <span key={tag} className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
              style={{ background: 'rgba(96,165,250,0.1)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.2)' }}>
              {tag}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Activity className="h-3 w-3" />
          {timeAgo(wallet.lastActive)}
        </div>
      </div>
      <div className="mt-3 h-1.5 rounded-full overflow-hidden bg-secondary/30">
        <div className="h-full rounded-full transition-all"
          style={{
            width: `${Math.min(100, (wallet.winRate))}%`,
            background: `linear-gradient(90deg, ${isPositive ? '#34d399' : '#ef4444'}, ${isPositive ? '#059669' : '#dc2626'})`,
          }} />
      </div>
    </motion.div>
  );
}

export function SmartMoneyWallets() {
  const [chainFilter, setChainFilter] = useState<MonitoredChain | 'all'>('all');
  const [sortBy, setSortBy] = useState<'pnl' | 'winRate' | 'volume'>('pnl');

  const wallets = SMART_MONEY_WALLETS
    .filter(w => chainFilter === 'all' || w.chain === chainFilter)
    .sort((a, b) => {
      if (sortBy === 'pnl')     return b.pnl30d - a.pnl30d;
      if (sortBy === 'winRate') return b.winRate - a.winRate;
      return b.totalVolume - a.totalVolume;
    });

  const totalVolume = SMART_MONEY_WALLETS.reduce((s, w) => s + w.totalVolume, 0);
  const avgWinRate  = Math.round(SMART_MONEY_WALLETS.reduce((s, w) => s + w.winRate, 0) / SMART_MONEY_WALLETS.length);
  const totalPnl    = SMART_MONEY_WALLETS.reduce((s, w) => s + w.pnl30d, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total 30d Volume', value: fmtUsd(totalVolume), icon: <Activity className="h-4 w-4" />, color: '#60a5fa' },
          { label: 'Combined P&L',     value: `+${fmtUsd(totalPnl)}`, icon: <TrendingUp className="h-4 w-4" />, color: '#34d399' },
          { label: 'Avg Win Rate',     value: `${avgWinRate}%`,     icon: <Star className="h-4 w-4" />, color: '#FFD700' },
        ].map(s => (
          <div key={s.label} className="rounded-2xl p-4"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <div className="flex items-center gap-1.5 mb-1.5" style={{ color: s.color }}>
              {s.icon}
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{s.label}</span>
            </div>
            <p className="font-black text-xl" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {(['all', ...ALL_CHAINS] as const).map(c => (
            <button key={c} onClick={() => setChainFilter(c as any)}
              className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all',
                chainFilter === c
                  ? 'border-transparent'
                  : 'border-border text-muted-foreground hover:border-border/60')}
              style={chainFilter === c && c !== 'all' ? {
                background: `${CHAIN_DISPLAY[c as MonitoredChain].color}22`,
                color: CHAIN_DISPLAY[c as MonitoredChain].color,
                borderColor: `${CHAIN_DISPLAY[c as MonitoredChain].color}44`,
              } : chainFilter === c ? { background: 'var(--bg-secondary)', color: 'var(--foreground)', borderColor: 'var(--border-color)' } : {}}>
              {c === 'all' ? 'All Chains' : `${CHAIN_DISPLAY[c as MonitoredChain].icon} ${CHAIN_DISPLAY[c as MonitoredChain].abbr}`}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Sort:</span>
          {(['pnl', 'winRate', 'volume'] as const).map(s => (
            <button key={s} onClick={() => setSortBy(s)}
              className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all',
                sortBy === s ? 'bg-secondary border-border text-foreground' : 'border-border text-muted-foreground hover:border-border/60')}>
              {s === 'pnl' ? 'P&L' : s === 'winRate' ? 'Win Rate' : 'Volume'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {wallets.map((w, i) => <WalletCard key={w.address} wallet={w} rank={i + 1} />)}
      </div>

      {wallets.length === 0 && (
        <div className="py-16 text-center text-muted-foreground">
          <Eye className="h-8 w-8 mx-auto mb-3 opacity-20" />
          <p>No wallets for this chain yet.</p>
        </div>
      )}
    </div>
  );
}
