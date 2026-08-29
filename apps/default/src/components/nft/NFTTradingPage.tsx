/**
 * NFTTradingPage.tsx — Virtual NFT Trading Simulator
 *
 * Features:
 *  - $50,000 virtual USD starting balance
 *  - Buy any NFT at floor price (simulated)
 *  - Open positions table with live P&L (ticks with floor price)
 *  - Sell to close position
 *  - Closed trades history
 *  - Portfolio analytics: total value, unrealised P&L, win rate
 */
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShoppingBag, TrendingUp, TrendingDown, DollarSign,
  X, Search, RefreshCw, BarChart3, Percent,
  ChevronDown, ChevronUp, Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { useNftStore } from '../../lib/nftStore';
import { NFTCollection, NFT_CHAIN_META } from '../../lib/nftTypes';
import {
  loadPortfolio, savePortfolio, VirtualNFTPortfolio, VirtualNFTPosition, ClosedNFTTrade,
  fmtNative, fmtUsd, fmtPct, fmtAddr, CHAIN_DISPLAY,
} from './nftUtils';
import { cn } from '@/lib/utils';
import { generateId } from '../../lib/strategyUtils';

// ── Buy modal ────────────────────────────────────────────────────────────────

function BuyModal({ col, portfolio, onClose, onBuy }: {
  col: NFTCollection;
  portfolio: VirtualNFTPortfolio;
  onClose: () => void;
  onBuy: (col: NFTCollection, qty: number) => void;
}) {
  const chain   = CHAIN_DISPLAY[col.chain];
  const meta    = NFT_CHAIN_META[col.chain];
  const [qty, setQty] = useState(1);
  const totalUsd = col.floorPriceUsd * qty;
  const canAfford = totalUsd <= portfolio.balance;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="fixed inset-4 sm:inset-auto sm:left-1/2 sm:-translate-x-1/2 sm:top-24 sm:w-full sm:max-w-sm z-[55] rounded-2xl bg-card border border-border">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-black text-foreground">Buy NFT (Simulated)</h2>
            <p className="text-[10px] text-muted-foreground">{col.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Floor Price</span>
              <span className="font-black">{fmtNative(col.floorPrice)} {chain.symbol} <span className="text-muted-foreground text-xs">({fmtUsd(col.floorPriceUsd)})</span></span>
            </div>
            <div className="flex justify-between text-sm mt-2">
              <span className="text-muted-foreground">Your Balance</span>
              <span className="font-bold text-primary">{fmtUsd(portfolio.balance)}</span>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1.5">Quantity</label>
            <div className="flex items-center gap-3">
              <button onClick={() => setQty(q => Math.max(1, q - 1))}
                className="w-9 h-9 rounded-xl border border-white/10 text-lg hover:bg-white/5 flex items-center justify-center font-black">−</button>
              <span className="text-2xl font-black flex-1 text-center">{qty}</span>
              <button onClick={() => setQty(q => Math.min(10, q + 1))}
                className="w-9 h-9 rounded-xl border border-white/10 text-lg hover:bg-white/5 flex items-center justify-center font-black">+</button>
            </div>
          </div>

          <div className="rounded-xl p-4" style={{ background: canAfford ? 'rgba(52,211,153,0.06)' : 'rgba(239,68,68,0.06)', border: `1px solid ${canAfford ? 'rgba(52,211,153,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
            <div className="flex justify-between text-sm font-black">
              <span>Total Cost</span>
              <span style={{ color: canAfford ? '#34d399' : '#f87171' }}>{fmtUsd(totalUsd)}</span>
            </div>
            {!canAfford && <p className="text-[11px] text-red-400 mt-1">Insufficient virtual balance</p>}
          </div>

          <button onClick={() => { if (canAfford) { onBuy(col, qty); onClose(); } }}
            disabled={!canAfford}
            className="w-full py-3 rounded-xl font-black text-sm transition-opacity disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #34d399, #059669)', color: '#fff' }}>
            Buy {qty} NFT{qty > 1 ? 's' : ''} at Floor — {fmtUsd(totalUsd)}
          </button>
        </div>
      </motion.div>
    </>
  );
}

// ── Position row ─────────────────────────────────────────────────────────────

function PositionRow({ pos, currentFloor, onSell }: {
  pos: VirtualNFTPosition;
  currentFloor: number;
  onSell: () => void;
}) {
  const chain    = CHAIN_DISPLAY[pos.chain];
  const pnl      = (currentFloor - pos.buyPrice) * pos.quantity * NFT_CHAIN_META[pos.chain].nativeUsdPrice;
  const pnlPct   = ((currentFloor - pos.buyPrice) / pos.buyPrice) * 100;
  const pnlPos   = pnl >= 0;

  return (
    <tr className="border-b border-white/4 hover:bg-white/2 transition-colors text-sm">
      <td className="px-4 py-3">
        <p className="font-semibold text-foreground">{pos.collectionName}</p>
        <p className="text-[10px] text-muted-foreground/60 font-mono">{pos.tokenId} · {chain.icon} {chain.name}</p>
      </td>
      <td className="px-3 py-3 text-right font-mono text-xs text-muted-foreground">
        {fmtNative(pos.buyPrice)} {chain.symbol}
      </td>
      <td className="px-3 py-3 text-right font-mono text-xs">
        <span className={pnlPos ? 'text-emerald-400' : 'text-red-400'}>{fmtNative(currentFloor)} {chain.symbol}</span>
      </td>
      <td className="px-3 py-3 text-right text-xs font-mono">{pos.quantity}</td>
      <td className="px-3 py-3 text-right">
        <p className={cn('font-black text-sm', pnlPos ? 'text-emerald-400' : 'text-red-400')}>
          {pnlPos ? '+' : ''}{fmtUsd(pnl)}
        </p>
        <p className={cn('text-[10px]', pnlPos ? 'text-emerald-400' : 'text-red-400')}>
          {pnlPos ? '▲' : '▼'} {Math.abs(pnlPct).toFixed(2)}%
        </p>
      </td>
      <td className="px-3 py-3">
        <button onClick={onSell}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-red-400/30 bg-red-400/8 text-red-400 hover:bg-red-400/15 transition-all">
          Sell
        </button>
      </td>
    </tr>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function NFTTradingPage() {
  const { getCollections } = useNftStore();
  const [portfolio, setPortfolio] = useState<VirtualNFTPortfolio>(() => loadPortfolio());
  const [buyTarget, setBuyTarget] = useState<NFTCollection | null>(null);
  const [search, setSearch]       = useState('');
  const [tab, setTab]             = useState<'market' | 'positions' | 'history'>('market');

  const collections = getCollections().filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 30);

  // Live floor update for positions
  const [tick, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick(t => t + 1), 5000); return () => clearInterval(id); }, []);

  function getFloor(pos: VirtualNFTPosition): number {
    const col = getCollections().find(c => c.id === pos.collectionId);
    return col?.floorPrice ?? pos.buyPrice;
  }

  function handleBuy(col: NFTCollection, qty: number) {
    const costUsd  = col.floorPriceUsd * qty;
    const newPos: VirtualNFTPosition = {
      collectionId:    col.id,
      collectionName:  col.name,
      collectionSlug:  col.slug,
      chain:           col.chain,
      tokenId:         `#${1 + Math.floor(Math.random() * col.totalSupply)}`,
      buyPrice:        col.floorPrice,
      buyPriceUsd:     col.floorPriceUsd,
      currentFloor:    col.floorPrice,
      currentFloorUsd: col.floorPriceUsd,
      quantity:        qty,
      purchasedAt:     new Date().toISOString(),
    };
    const updated: VirtualNFTPortfolio = {
      ...portfolio,
      balance:       portfolio.balance - costUsd,
      totalInvested: portfolio.totalInvested + costUsd,
      positions:     [...portfolio.positions, newPos],
    };
    setPortfolio(updated);
    savePortfolio(updated);
    toast.success(`Bought ${qty}× ${col.name} at floor!`);
    setTab('positions');
  }

  function handleSell(idx: number) {
    const pos      = portfolio.positions[idx];
    const floor    = getFloor(pos);
    const meta     = NFT_CHAIN_META[pos.chain];
    const saleUsd  = floor * meta.nativeUsdPrice * pos.quantity;
    const costUsd  = pos.buyPrice * meta.nativeUsdPrice * pos.quantity;
    const pnl      = saleUsd - costUsd;
    const pnlPct   = ((floor - pos.buyPrice) / pos.buyPrice) * 100;

    const closed: ClosedNFTTrade = {
      collectionName: pos.collectionName, tokenId: pos.tokenId,
      buyPrice: pos.buyPriceUsd, sellPrice: saleUsd / pos.quantity,
      pnl, pnlPct, closedAt: new Date().toISOString(),
    };

    const newPositions = portfolio.positions.filter((_, i) => i !== idx);
    const updated: VirtualNFTPortfolio = {
      ...portfolio,
      balance:      portfolio.balance + saleUsd,
      positions:    newPositions,
      closedTrades: [...portfolio.closedTrades, closed],
      totalPnl:     portfolio.totalPnl + pnl,
    };
    setPortfolio(updated);
    savePortfolio(updated);
    toast.success(`Sold ${pos.tokenId} for ${fmtUsd(saleUsd)} (${pnl >= 0 ? '+' : ''}${fmtUsd(pnl)})`);
  }

  // Stats
  const unrealizedPnl = portfolio.positions.reduce((sum, pos) => {
    const floor = getFloor(pos);
    const meta  = NFT_CHAIN_META[pos.chain];
    return sum + (floor - pos.buyPrice) * pos.quantity * meta.nativeUsdPrice;
  }, 0);
  const positionsValue = portfolio.positions.reduce((sum, pos) => {
    const floor = getFloor(pos);
    const meta  = NFT_CHAIN_META[pos.chain];
    return sum + floor * pos.quantity * meta.nativeUsdPrice;
  }, 0);
  const winningTrades = portfolio.closedTrades.filter(t => t.pnl > 0).length;
  const winRate = portfolio.closedTrades.length > 0 ? (winningTrades / portfolio.closedTrades.length) * 100 : 0;
  const totalValue = portfolio.balance + positionsValue;

  function resetPortfolio() {
    const fresh: VirtualNFTPortfolio = { balance: 50_000, totalInvested: 0, positions: [], closedTrades: [], totalPnl: 0 };
    setPortfolio(fresh);
    savePortfolio(fresh);
    toast.success('Portfolio reset to $50,000');
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* KPI strip */}
      <div className="flex gap-4 px-4 sm:px-6 py-4 border-b border-white/5 overflow-x-auto scrollbar-hide"
        style={{ background: 'rgba(0,0,0,0.1)' }}>
        {[
          { label: 'Cash Balance',   value: fmtUsd(portfolio.balance),    color: '#60a5fa' },
          { label: 'Portfolio Value', value: fmtUsd(totalValue),           color: '#fbbf24' },
          { label: 'Unrealised P&L', value: `${unrealizedPnl >= 0 ? '+' : ''}${fmtUsd(unrealizedPnl)}`, color: unrealizedPnl >= 0 ? '#34d399' : '#f87171' },
          { label: 'Realised P&L',   value: `${portfolio.totalPnl >= 0 ? '+' : ''}${fmtUsd(portfolio.totalPnl)}`, color: portfolio.totalPnl >= 0 ? '#34d399' : '#f87171' },
          { label: 'Win Rate',       value: `${winRate.toFixed(1)}%`,     color: '#a78bfa' },
          { label: 'Open Positions', value: String(portfolio.positions.length), color: '#fb923c' },
        ].map(s => (
          <div key={s.label} className="shrink-0">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
            <p className="font-black text-lg leading-tight" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
        <button onClick={resetPortfolio}
          className="ml-auto self-center text-xs text-muted-foreground border border-white/10 px-3 py-1.5 rounded-xl hover:text-foreground shrink-0">
          Reset
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 px-4 sm:px-6 border-b border-white/5">
        {[
          { id: 'market',    label: '🏪 Market',    badge: 0 },
          { id: 'positions', label: '📂 Positions', badge: portfolio.positions.length },
          { id: 'history',   label: '📋 History',   badge: portfolio.closedTrades.length },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)}
            className={cn('flex items-center gap-1.5 px-4 py-3 text-sm font-semibold border-b-2 transition-all',
              tab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {t.label}
            {t.badge > 0 && (
              <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-black flex items-center justify-center">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'market' && (
          <div className="p-4 sm:p-6 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search collections to buy…"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm bg-white/5 border border-white/10 focus:outline-none focus:border-white/20" />
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {collections.map(col => {
                const chain = CHAIN_DISPLAY[col.chain];
                const chgPos = col.floorChange24h >= 0;
                return (
                  <div key={col.id} className="rounded-2xl p-4 transition-all hover:scale-[1.01]"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer' }}
                    onClick={() => setBuyTarget(col)}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="font-black text-xl" style={{ color: chain.color }}>{chain.icon}</span>
                      <div className="min-w-0">
                        <p className="font-bold text-sm truncate text-foreground">{col.name}</p>
                        <p className="text-[10px] text-muted-foreground">{chain.name}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">Floor</p>
                        <p className="font-black text-sm text-foreground">
                          {fmtNative(col.floorPrice)} {chain.symbol}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{fmtUsd(col.floorPriceUsd)}</p>
                      </div>
                      <div className="text-right">
                        <span className={cn('text-xs font-bold', chgPos ? 'text-emerald-400' : 'text-red-400')}>
                          {chgPos ? '▲' : '▼'} {Math.abs(col.floorChange24h).toFixed(2)}%
                        </span>
                        <button
                          className="block mt-1 text-[10px] font-bold px-2.5 py-1 rounded-lg"
                          style={{ background: 'rgba(96,165,250,0.12)', color: '#60a5fa' }}>
                          Buy at Floor
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'positions' && (
          portfolio.positions.length === 0 ? (
            <div className="py-20 text-center">
              <ShoppingBag className="h-12 w-12 mx-auto text-muted-foreground/20 mb-4" />
              <p className="text-sm text-muted-foreground">No open positions</p>
              <button onClick={() => setTab('market')} className="mt-3 text-sm text-primary hover:underline">Browse market</button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-card">
                  <tr className="text-[10px] font-black text-muted-foreground uppercase tracking-wider border-b border-white/5">
                    <th className="px-4 py-3 text-left">Collection</th>
                    <th className="px-3 py-3 text-right">Buy Price</th>
                    <th className="px-3 py-3 text-right">Current Floor</th>
                    <th className="px-3 py-3 text-right">Qty</th>
                    <th className="px-3 py-3 text-right">P&L</th>
                    <th className="px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {portfolio.positions.map((pos, i) => (
                    <PositionRow key={i} pos={pos} currentFloor={getFloor(pos)}
                      onSell={() => handleSell(i)} />
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {tab === 'history' && (
          portfolio.closedTrades.length === 0 ? (
            <div className="py-20 text-center">
              <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground/20 mb-4" />
              <p className="text-sm text-muted-foreground">No closed trades yet</p>
            </div>
          ) : (
            <div className="p-4 sm:p-6 space-y-2">
              {[...portfolio.closedTrades].reverse().map((t, i) => {
                const pnlPos = t.pnl >= 0;
                return (
                  <div key={i} className="flex items-center gap-4 px-4 py-3 rounded-xl"
                    style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex-1">
                      <p className="font-semibold text-sm text-foreground">{t.collectionName}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{t.tokenId}</p>
                    </div>
                    <div className="text-right">
                      <p className={cn('font-black text-sm', pnlPos ? 'text-emerald-400' : 'text-red-400')}>
                        {pnlPos ? '+' : ''}{fmtUsd(t.pnl)}
                      </p>
                      <p className={cn('text-[10px]', pnlPos ? 'text-emerald-400' : 'text-red-400')}>
                        {pnlPos ? '▲' : '▼'} {Math.abs(t.pnlPct).toFixed(2)}%
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>

      {/* Buy modal */}
      <AnimatePresence>
        {buyTarget && (
          <BuyModal col={buyTarget} portfolio={portfolio} onClose={() => setBuyTarget(null)} onBuy={handleBuy} />
        )}
      </AnimatePresence>
    </div>
  );
}
