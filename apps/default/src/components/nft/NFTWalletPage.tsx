/**
 * NFTWalletPage.tsx — NFT Wallet Tracker
 *
 * Features:
 *  - Add wallet (address + chain + label)
 *  - List tracked wallets with portfolio summary
 *  - Click wallet → portfolio detail: holdings, P&L, rarity breakdown
 *  - Refresh snapshot
 *  - Toggle active/pause
 *  - Delete
 */
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Wallet, RefreshCw, Trash2, ToggleLeft, ToggleRight,
  TrendingUp, TrendingDown, X, ChevronRight, ExternalLink, Copy,
  Search, Star, Grid3X3, BarChart3, Link, Unplug,
} from 'lucide-react';
import { toast } from 'sonner';
import { useNftStore } from '../../lib/nftStore';
import { useAuthStore } from '../../lib/authStore';
import { NFTWalletTracking, NFTWalletSnapshot, NFTChain, NFT_CHAIN_META, RARITY_TIER_META } from '../../lib/nftTypes';
import { CHAIN_DISPLAY, fmtNative, fmtUsd, fmtAddr, timeAgo, RARITY_DISPLAY } from './nftUtils';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { cn } from '@/lib/utils';

// ── Add wallet modal ──────────────────────────────────────────────────────────

function AddWalletModal({ onClose, userId }: { onClose: () => void; userId: string }) {
  const { addWallet } = useNftStore();
  const [form, setForm] = useState({ walletAddress: '', chain: 'ethereum' as NFTChain, name: '' });
  const [errors, setErrors] = useState<string[]>([]);

  function submit() {
    const r = addWallet({ ...form, userId });
    if (r.ok) {
      toast.success('Wallet added to tracker!');
      onClose();
    } else {
      setErrors(r.errors ?? ['Unknown error']);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="fixed inset-4 sm:inset-auto sm:left-1/2 sm:-translate-x-1/2 sm:top-24 sm:w-full sm:max-w-md z-[55] rounded-2xl flex flex-col bg-card border border-border shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            <h2 className="font-black">Track NFT Wallet</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {errors.length > 0 && (
            <div className="rounded-xl p-3 text-xs text-red-400" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
              {errors.map(e => <p key={e}>{e}</p>)}
            </div>
          )}

          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1.5">Label</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. NFT Whale #1"
              className="w-full px-4 py-2.5 rounded-xl text-sm border bg-white/4 border-white/10 focus:outline-none focus:border-primary/50" />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1.5">Blockchain</label>
            <div className="grid grid-cols-3 gap-2">
              {(['ethereum', 'solana', 'polygon'] as NFTChain[]).map(ch => {
                const d = CHAIN_DISPLAY[ch];
                return (
                  <button key={ch} onClick={() => setForm(f => ({ ...f, chain: ch }))}
                    className={cn('flex flex-col items-center gap-1 py-3 rounded-xl text-xs font-bold border transition-all',
                      form.chain === ch ? '' : 'border-white/10 text-muted-foreground hover:border-white/20')}
                    style={form.chain === ch ? { background: `${d.color}15`, borderColor: `${d.color}40`, color: d.color } : {}}>
                    <span className="text-lg">{d.icon}</span>
                    {d.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1.5">
              Wallet Address
            </label>
            <input value={form.walletAddress} onChange={e => setForm(f => ({ ...f, walletAddress: e.target.value.trim() }))}
              placeholder={form.chain === 'solana' ? 'Solana wallet address (Base58)' : '0x… EVM address'}
              className="w-full px-4 py-2.5 rounded-xl text-sm font-mono border bg-white/4 border-white/10 focus:outline-none focus:border-primary/50" />
          </div>

          <button onClick={submit}
            className="w-full py-3 rounded-xl font-black text-sm bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
            Add Wallet
          </button>
        </div>
      </motion.div>
    </>
  );
}

// ── Wallet card ───────────────────────────────────────────────────────────────

function WalletCard({ wallet, snapshot, isSelected, onSelect, onToggle, onDelete, onRefresh }: {
  wallet: NFTWalletTracking;
  snapshot: NFTWalletSnapshot | null;
  isSelected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onRefresh: () => void;
}) {
  const chain = CHAIN_DISPLAY[wallet.chain];
  const pnlPos = (snapshot?.unrealizedPnl ?? 0) >= 0;

  return (
    <div
      onClick={onSelect}
      className={cn('rounded-2xl p-4 cursor-pointer transition-all',
        isSelected ? 'ring-1 ring-primary' : 'hover:bg-white/3')}
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center font-black shrink-0"
            style={{ background: `${chain.color}15`, color: chain.color }}>
            {chain.icon}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm text-foreground truncate">{wallet.name}</p>
            <p className="text-[10px] font-mono text-muted-foreground">{fmtAddr(wallet.walletAddress)}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={e => { e.stopPropagation(); onRefresh(); }}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button onClick={e => { e.stopPropagation(); onToggle(); }}
            className={cn('p-1.5 rounded-lg transition-colors', wallet.isActive ? 'text-emerald-400' : 'text-muted-foreground/40')}>
            {wallet.isActive ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
          </button>
          <button onClick={e => { e.stopPropagation(); onDelete(); }}
            className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-red-400 transition-colors">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {snapshot ? (
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Items</p>
            <p className="font-black text-sm text-foreground">{snapshot.totalItems}</p>
          </div>
          <div>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Value</p>
            <p className="font-black text-sm text-primary">{fmtUsd(snapshot.portfolioValueUsd)}</p>
          </div>
          <div>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">P&L</p>
            <p className={cn('font-black text-sm', pnlPos ? 'text-emerald-400' : 'text-red-400')}>
              {pnlPos ? '+' : ''}{snapshot.unrealizedPnlPct.toFixed(1)}%
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground/50 text-center">No snapshot yet — click refresh</p>
      )}
    </div>
  );
}

// ── Wallet portfolio detail ───────────────────────────────────────────────────

function WalletDetail({ wallet, snapshot, onClose, onRefresh }: {
  wallet: NFTWalletTracking;
  snapshot: NFTWalletSnapshot | null;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const chain = CHAIN_DISPLAY[wallet.chain];
  const meta  = NFT_CHAIN_META[wallet.chain];

  // Holdings by collection for chart
  const byCollection = snapshot?.holdings.reduce((acc: Record<string, number>, h) => {
    acc[h.collectionName] = (acc[h.collectionName] ?? 0) + h.estimatedValueUsd;
    return acc;
  }, {}) ?? {};
  const pieData = Object.entries(byCollection).slice(0, 6).map(([name, value]) => ({ name, value }));
  const COLORS  = ['#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#f472b6', '#fb923c'];

  // Rarity distribution
  const rarityDist = (['legendary', 'epic', 'rare', 'uncommon', 'common'] as const).map(tier => ({
    tier,
    count: snapshot?.holdings.filter(h => h.rarityTier === tier).length ?? 0,
  })).filter(r => r.count > 0);

  function copyAddr() {
    navigator.clipboard.writeText(wallet.walletAddress).catch(() => {});
    toast.success('Address copied');
  }

  return (
    <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }}
      className="w-full xl:w-[420px] shrink-0 border-l border-white/5 overflow-y-auto flex flex-col"
      style={{ background: 'rgba(0,0,0,0.2)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 z-10 bg-card/95 backdrop-blur-xl">
        <div>
          <h3 className="font-black text-foreground">{wallet.name}</h3>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[10px] font-mono text-muted-foreground">{fmtAddr(wallet.walletAddress)}</span>
            <button onClick={copyAddr} className="text-muted-foreground/40 hover:text-primary transition-colors">
              <Copy className="h-3 w-3" />
            </button>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs border border-white/10 text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="p-5 space-y-5 flex-1">
        {!snapshot ? (
          <div className="py-12 text-center">
            <Wallet className="h-10 w-10 mx-auto text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground">No snapshot available</p>
            <button onClick={onRefresh}
              className="mt-3 text-xs text-primary hover:underline">Generate snapshot</button>
          </div>
        ) : (
          <>
            {/* Portfolio summary */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Total Value', value: fmtUsd(snapshot.portfolioValueUsd), color: '#60a5fa' },
                { label: 'Total Items', value: snapshot.totalItems.toString(), color: '#fbbf24' },
                { label: 'Collections', value: snapshot.collectionsCount.toString(), color: '#34d399' },
                { label: 'Unrealized P&L',
                  value: `${snapshot.unrealizedPnl >= 0 ? '+' : ''}${fmtUsd(snapshot.unrealizedPnlUsd)}`,
                  color: snapshot.unrealizedPnl >= 0 ? '#34d399' : '#f87171' },
              ].map(s => (
                <div key={s.label} className="rounded-xl p-3"
                  style={{ background: `${s.color}08`, border: `1px solid ${s.color}20` }}>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
                  <p className="font-black text-base mt-0.5" style={{ color: s.color }}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* Portfolio pie */}
            {pieData.length > 0 && (
              <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-3">Portfolio Allocation</p>
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width={100} height={100}>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" cx="50%" cy="50%" outerRadius={42} strokeWidth={0}>
                        {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 flex-1 min-w-0">
                    {pieData.map((d, i) => (
                      <div key={d.name} className="flex items-center justify-between text-xs gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                          <span className="text-muted-foreground truncate">{d.name}</span>
                        </div>
                        <span className="font-mono font-bold shrink-0" style={{ color: COLORS[i % COLORS.length] }}>
                          {fmtUsd(d.value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Rarity breakdown */}
            {rarityDist.length > 0 && (
              <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-3">Rarity Breakdown</p>
                <div className="space-y-2">
                  {rarityDist.map(r => {
                    const meta = RARITY_TIER_META[r.tier];
                    const pct  = snapshot.totalItems > 0 ? (r.count / snapshot.totalItems) * 100 : 0;
                    return (
                      <div key={r.tier} className="flex items-center gap-2 text-xs">
                        <span className="w-4 text-center">{meta.icon}</span>
                        <span className="w-20 text-muted-foreground" style={{ color: meta.color }}>{meta.label}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: meta.color }} />
                        </div>
                        <span className="font-mono font-bold w-6 text-right" style={{ color: meta.color }}>{r.count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Holdings table */}
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Holdings ({snapshot.holdings.length})</p>
              <div className="space-y-1.5">
                {snapshot.holdings.slice(0, 12).map(h => {
                  const pnl    = h.estimatedValue - h.acquiredPrice;
                  const pnlPos = pnl >= 0;
                  const rarityMeta = h.rarityTier ? RARITY_TIER_META[h.rarityTier] : null;
                  return (
                    <div key={`${h.collectionId}-${h.tokenId}`}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors"
                      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">{h.collectionName}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] text-muted-foreground/60 font-mono">{h.tokenId}</span>
                          {rarityMeta && (
                            <span className="text-[9px] font-bold" style={{ color: rarityMeta.color }}>
                              {rarityMeta.icon} {rarityMeta.label}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-bold text-foreground">{fmtUsd(h.estimatedValueUsd)}</p>
                        <p className={cn('text-[10px] font-bold', pnlPos ? 'text-emerald-400' : 'text-red-400')}>
                          {pnlPos ? '+' : ''}{fmtNative(pnl)} {chain.symbol}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <p className="text-[10px] text-muted-foreground/40 text-center">
              Snapshot: {timeAgo(snapshot.timestamp)} · {snapshot.holdings.length} items
            </p>
          </>
        )}
      </div>
    </motion.div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function NFTWalletPage() {
  const { getUserWallets, getWalletSnapshot, refreshWalletSnap, toggleWallet, removeWallet, addWallet } = useNftStore();
  const { user } = useAuthStore();
  const userId = user?.id ?? 'demo';

  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [simulateConnecting, setSimulateConnecting] = useState(false);

  const wallets  = getUserWallets(userId).filter(w =>
    !search || w.name.toLowerCase().includes(search.toLowerCase()) || w.walletAddress.toLowerCase().includes(search.toLowerCase())
  );

  const selectedWallet   = wallets.find(w => w.id === selected) ?? null;
  const selectedSnapshot = selected ? getWalletSnapshot(selected) : null;

  function handleRefresh(walletId: string) {
    const snap = refreshWalletSnap(walletId, userId);
    if (snap) toast.success(`Portfolio refreshed — ${snap.totalItems} items`);
  }

  function handleDelete(walletId: string) {
    removeWallet(walletId, userId);
    if (selected === walletId) setSelected(null);
    toast.success('Wallet removed');
  }

  /** Simulated wallet "connect" — adds a pre-configured demo wallet for practice. */
  function handleSimulateConnect() {
    setSimulateConnecting(true);
    setTimeout(() => {
      const existing = getUserWallets(userId);
      if (existing.length === 0) {
        addWallet({
          walletAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
          chain: 'ethereum',
          name: 'Demo Wallet',
          userId,
        });
        toast.success('Demo wallet connected!', {
          description: 'This is a simulated wallet for practice. Add your own wallet with the Track button.',
        });
      }
      setSimulateConnecting(false);
    }, 800);
  }

  // Auto-snapshot on add
  useEffect(() => {
    wallets.forEach(w => { if (!getWalletSnapshot(w.id)) refreshWalletSnap(w.id, userId); });
  }, [wallets.length]);

  return (
    <div className="flex h-full">
      {/* Left panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-white/5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search wallets…"
              className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-white/5 border border-white/10 focus:outline-none focus:border-white/20" />
          </div>
          <button onClick={handleSimulateConnect}
            disabled={simulateConnecting}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all"
            style={{
              background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(99,102,241,0.2))',
              border: '1px solid rgba(139,92,246,0.3)',
              color: '#a78bfa',
            }}>
            {simulateConnecting ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Unplug className="h-3.5 w-3.5" />
            )}
            {simulateConnecting ? 'Connecting…' : 'Connect Wallet'}
          </button>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
            <Plus className="h-4 w-4" /> Track
          </button>
        </div>

        {/* Simulation notice */}
        {wallets.length > 0 && (
          <div className="mx-4 sm:mx-6 mt-3 mb-0 px-3 py-2 rounded-xl flex items-center gap-2 text-[10px]"
            style={{ background: 'rgba(250,204,21,0.06)', border: '1px solid rgba(250,204,21,0.12)' }}>
            <span>🟡</span>
            <span className="text-yellow-200/70">Wallet tracking is simulated. Web3 wallet integration (MetaMask/WalletConnect) requires ethers.js — coming soon.</span>
          </div>
        )}

        {/* Wallet list */}
        <div className="flex-1 overflow-y-auto">
          {wallets.length === 0 ? (
            <div className="py-20 text-center px-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(139,92,246,0.08)', border: '2px dashed rgba(139,92,246,0.2)' }}>
                <Wallet className="h-7 w-7 text-violet-400/40" />
              </div>
              <p className="text-sm font-bold text-muted-foreground">No wallet connected</p>
              <p className="text-xs text-muted-foreground/60 mt-1.5 max-w-xs mx-auto">
                Connect a demo wallet to explore portfolio tracking, or add your own wallet address to monitor.
              </p>
              <div className="flex items-center justify-center gap-2 mt-5">
                <button onClick={handleSimulateConnect}
                  disabled={simulateConnecting}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all"
                  style={{
                    background: 'linear-gradient(135deg, rgba(139,92,246,0.25), rgba(99,102,241,0.25))',
                    border: '1px solid rgba(139,92,246,0.35)',
                    color: '#a78bfa',
                  }}>
                  {simulateConnecting ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" /> Connecting…
                    </>
                  ) : (
                    <>
                      <Unplug className="h-4 w-4" /> Connect Demo Wallet
                    </>
                  )}
                </button>
                <button onClick={() => setShowAdd(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border border-white/10 text-muted-foreground hover:text-foreground transition-colors">
                  <Plus className="h-4 w-4" /> Add Manually
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground/30 mt-4">
                🔒 Real wallet integration (MetaMask / WalletConnect) requires ethers.js — not yet available in this environment.
              </p>
            </div>
          ) : (
            <div className="p-4 sm:p-6 grid sm:grid-cols-2 gap-3">
              {wallets.map(w => (
                <WalletCard key={w.id} wallet={w}
                  snapshot={getWalletSnapshot(w.id)}
                  isSelected={w.id === selected}
                  onSelect={() => setSelected(w.id === selected ? null : w.id)}
                  onToggle={() => { toggleWallet(w.id, userId); toast.success('Wallet status updated'); }}
                  onDelete={() => handleDelete(w.id)}
                  onRefresh={() => handleRefresh(w.id)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      <AnimatePresence>
        {selectedWallet && (
          <WalletDetail
            key={selectedWallet.id}
            wallet={selectedWallet}
            snapshot={selectedSnapshot}
            onClose={() => setSelected(null)}
            onRefresh={() => handleRefresh(selectedWallet.id)} />
        )}
      </AnimatePresence>

      {/* Add wallet modal */}
      <AnimatePresence>
        {showAdd && <AddWalletModal userId={userId} onClose={() => setShowAdd(false)} />}
      </AnimatePresence>
    </div>
  );
}
