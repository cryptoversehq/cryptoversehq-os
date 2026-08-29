/**
 * MetaversePage.tsx — §5.2 Metaverse Land Analytics
 * Route: /nft/metaverse
 *
 * Sections:
 *  A) Global header banner — total market cap, 24h volume, active listings
 *  B) Top Metaverses — 4 cards (spec layout): floor, 24h %, volume, chain, features
 *  C) Selected metaverse deep-dive (tabs: Overview | Land Map | Parcels | Sales | Auctions)
 *     Overview  — price chart (30d), KPI strip, district list
 *     Land Map  — SVG/canvas grid parcels coloured by rarity
 *     Parcels   — sortable table of individual parcels
 *     Sales     — recent land sale events
 *     Auctions  — live auctions with countdown
 *  D) Action bar — [Simulate Land Purchase] [Set Land Alert] [Explore]
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp, TrendingDown, Bell, ShoppingBag, Map,
  List, Activity, RefreshCw, ExternalLink, Globe, Clock,
  Zap, Star, ChevronRight, X, DollarSign, BarChart3, Users,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, BarChart, Bar,
} from 'recharts';
import { toast } from 'sonner';
import {
  MetaverseId, MetaverseStats, LandParcel, LandSaleEvent,
  MetaverseDistrict, LandAuction, METAVERSE_META, LAND_RARITY_META,
  VirtualLandPortfolio,
} from '../../lib/metaverseTypes';
import {
  buildInitialMetaverseStats, tickMetaverseStats, buildLandParcels,
  generateLandSale, buildDistricts, buildPriceHistory, buildActiveAuctions,
  buildColdStartSales,
} from '../../lib/metaverseSimulator';
import { fmtUsd, fmtNative } from './nftUtils';
import { cn } from '@/lib/utils';
import { generateId } from '../../lib/strategyUtils';

// ── Constants ─────────────────────────────────────────────────────────────────

const METAVERSE_IDS: MetaverseId[] = ['the-sandbox', 'decentraland', 'otherside', 'nft-worlds'];

const LAND_PORTFOLIO_KEY = 'cryptoverse_land_portfolio_v1';
function loadLandPortfolio(): VirtualLandPortfolio {
  try { return JSON.parse(localStorage.getItem(LAND_PORTFOLIO_KEY) || 'null') ?? { balance: 50_000, positions: [], closedTrades: [], totalPnl: 0 }; }
  catch { return { balance: 50_000, positions: [], closedTrades: [], totalPnl: 0 }; }
}
function saveLandPortfolio(p: VirtualLandPortfolio) { localStorage.setItem(LAND_PORTFOLIO_KEY, JSON.stringify(p)); }

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCountdown(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'Ended';
  const h  = Math.floor(ms / 3_600_000);
  const m  = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000)    return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  return `${Math.floor(ms / 3_600_000)}h ago`;
}

function fmtAddr(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 8)}…${addr.slice(-4)}` : addr;
}

// ── §5.2 Spec: Metaverse card (top row) ──────────────────────────────────────

function MetaverseCard({
  id, stats, isSelected, onSelect,
}: {
  id:         MetaverseId;
  stats:      MetaverseStats;
  isSelected: boolean;
  onSelect:   () => void;
}) {
  const meta   = METAVERSE_META[id];
  const chgPos = stats.floorChange24h >= 0;

  return (
    <motion.button
      whileHover={{ scale: 1.03, y: -2 }}
      whileTap={{ scale: 0.97 }}
      onClick={onSelect}
      className={cn(
        'flex-1 min-w-[150px] rounded-2xl p-4 text-left transition-all border-2',
        isSelected
          ? 'border-opacity-80'
          : 'border-white/8 hover:border-white/20',
      )}
      style={{
        background:  isSelected ? `${meta.color}15` : 'rgba(255,255,255,0.03)',
        borderColor: isSelected ? meta.color        : undefined,
      }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-1 mb-3">
        <span className="text-2xl">{meta.icon}</span>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: `${meta.color}15`, color: meta.color }}>
          {meta.chains[0]}
        </span>
      </div>

      {/* Name */}
      <p className="font-black text-sm text-foreground leading-tight">{meta.name}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5 mb-2">{meta.landUnit}s</p>

      {/* §5.2 spec: floor + % */}
      <div className="space-y-1">
        <div className="flex items-end gap-1.5">
          <span className="font-black text-lg text-foreground">{stats.floorPrice.toFixed(2)}</span>
          <span className="text-xs text-muted-foreground mb-0.5">ETH</span>
        </div>
        <div className={cn('flex items-center gap-1 text-[11px] font-bold', chgPos ? 'text-emerald-400' : 'text-red-400')}>
          {chgPos ? '↑' : '↓'}{Math.abs(stats.floorChange24h).toFixed(1)}%
        </div>
        <p className="text-[10px] text-muted-foreground">{fmtUsd(stats.floorPriceUsd)}</p>
      </div>

      {/* Vol */}
      <div className="mt-3 pt-3 border-t border-white/5">
        <p className="text-[9px] text-muted-foreground uppercase tracking-wider">24h Vol</p>
        <p className="font-bold text-xs text-foreground">{stats.volume24h.toFixed(1)} ETH</p>
        <p className="text-[9px] text-muted-foreground">{fmtUsd(stats.volume24hUsd)}</p>
      </div>

      {isSelected && (
        <div className="mt-2">
          <span className="text-[10px] font-bold" style={{ color: meta.color }}>▲ Selected</span>
        </div>
      )}
    </motion.button>
  );
}

// ── Global KPI strip ──────────────────────────────────────────────────────────

function GlobalKPI({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="flex-1 rounded-2xl p-4 min-w-[120px]"
      style={{ background: `${color}08`, border: `1px solid ${color}18` }}>
      <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-black text-lg mt-0.5" style={{ color }}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Price chart tooltip ───────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl px-3 py-2 text-xs shadow-xl bg-card border border-border">
      <p className="text-muted-foreground mb-1">{label}</p>
      <p className="font-black text-primary">{payload[0]?.value?.toFixed(4)} ETH</p>
      {payload[1] && <p className="text-muted-foreground">Vol: {payload[1]?.value?.toFixed(1)} ETH</p>}
    </div>
  );
}

// ── Land Map (SVG grid) ───────────────────────────────────────────────────────

function LandMap({ parcels, metaverse }: { parcels: LandParcel[]; metaverse: MetaverseId }) {
  const meta = METAVERSE_META[metaverse];
  const SIZE = 280;
  const CELL = 18;

  // Normalise x,y to grid
  const xs = parcels.map(p => p.x);
  const ys = parcels.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const cols = Math.min(14, maxX - minX + 1);
  const rows = Math.min(14, maxY - minY + 1);

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(0,0,0,0.3)', border: `1px solid ${meta.color}20` }}>
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Map className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Land Grid</p>
        </div>
        <div className="flex items-center gap-2">
          {(['common', 'uncommon', 'rare', 'legendary'] as const).map(r => (
            <div key={r} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm" style={{ background: LAND_RARITY_META[r].color }} />
              <span className="text-[9px] text-muted-foreground">{LAND_RARITY_META[r].label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="p-4 overflow-auto">
        <svg
          width={cols * CELL + 4}
          height={rows * CELL + 4}
          className="mx-auto">
          {/* Grid background */}
          {Array.from({ length: rows }, (_, row) =>
            Array.from({ length: cols }, (_, col) => (
              <rect key={`bg-${row}-${col}`}
                x={col * CELL + 2} y={row * CELL + 2}
                width={CELL - 2} height={CELL - 2}
                fill="rgba(255,255,255,0.03)"
                rx={2} />
            ))
          )}
          {/* Parcel tiles */}
          {parcels.map(p => {
            const col = Math.min(cols - 1, p.x - minX);
            const row = Math.min(rows - 1, p.y - minY);
            const rarityMeta = LAND_RARITY_META[p.rarity];
            return (
              <g key={p.id}>
                <rect
                  x={col * CELL + 2} y={row * CELL + 2}
                  width={CELL - 2} height={CELL - 2}
                  fill={rarityMeta.color}
                  fillOpacity={0.7}
                  rx={2}>
                  <title>{p.district} {p.tokenId} — {p.rarity} · {p.floorPrice.toFixed(3)} ETH</title>
                </rect>
                {p.isEstate && (
                  <text x={col * CELL + CELL / 2 + 1} y={row * CELL + CELL / 2 + 3}
                    textAnchor="middle" fontSize={8} fill="white" opacity={0.9}>E</text>
                )}
              </g>
            );
          })}
          {/* Origin crosshair */}
          <circle cx={cols * CELL / 2} cy={rows * CELL / 2} r={3}
            fill="white" opacity={0.5} />
        </svg>
        <p className="text-[9px] text-muted-foreground text-center mt-2">
          Hover tiles for details · Centre = Origin (0,0) · E = Estate
        </p>
      </div>
    </div>
  );
}

// ── Parcel row ────────────────────────────────────────────────────────────────

function ParcelRow({ parcel, onBuy }: { parcel: LandParcel; onBuy: () => void }) {
  const rarityMeta = LAND_RARITY_META[parcel.rarity];
  const hasLastSale = parcel.lastSalePrice > 0;
  const pnlVsLast = hasLastSale ? ((parcel.floorPrice - parcel.lastSalePrice) / parcel.lastSalePrice) * 100 : null;
  const pnlPos = (pnlVsLast ?? 0) >= 0;

  return (
    <tr className="border-b border-white/4 hover:bg-white/2 transition-colors text-sm">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm">{rarityMeta.icon}</span>
          <div>
            <p className="font-semibold text-foreground font-mono">{parcel.tokenId}</p>
            <p className="text-[10px] text-muted-foreground">{parcel.district}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3">
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: `${rarityMeta.color}15`, color: rarityMeta.color }}>
          {rarityMeta.label}
        </span>
      </td>
      <td className="px-3 py-3 text-right font-mono text-xs">
        <p className="font-bold text-foreground">{parcel.floorPrice.toFixed(3)} ETH</p>
        <p className="text-muted-foreground text-[10px]">{fmtUsd(parcel.floorPriceUsd)}</p>
      </td>
      <td className="px-3 py-3 text-right text-xs text-muted-foreground">
        {parcel.isEstate ? (
          <span className="text-amber-400 font-bold">Estate ({parcel.estateParcels}p)</span>
        ) : (
          <span className="capitalize">{parcel.proximity}</span>
        )}
      </td>
      <td className="px-3 py-3 text-right text-xs">
        {pnlVsLast !== null ? (
          <span className={cn('font-bold', pnlPos ? 'text-emerald-400' : 'text-red-400')}>
            {pnlPos ? '+' : ''}{pnlVsLast.toFixed(1)}%
          </span>
        ) : <span className="text-muted-foreground/40">—</span>}
      </td>
      <td className="px-3 py-3 text-right text-xs font-mono text-muted-foreground">
        {fmtAddr(parcel.owner)}
      </td>
      <td className="px-3 py-3">
        <button onClick={onBuy}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold border border-primary/30 bg-primary/8 text-primary hover:bg-primary/15 transition-all whitespace-nowrap">
          🎮 Simulate
        </button>
      </td>
    </tr>
  );
}

// ── Sale event row ────────────────────────────────────────────────────────────

function SaleRow({ sale }: { sale: LandSaleEvent }) {
  const meta = METAVERSE_META[sale.metaverse];
  const isWhale = sale.priceVsFloor >= 3;
  return (
    <div className={cn(
      'flex items-center gap-3 px-4 sm:px-5 py-3 border-b border-white/4 hover:bg-white/2 transition-colors',
    )}>
      <span className="text-xl shrink-0">{meta.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs font-semibold text-foreground">{meta.name} {sale.tokenId}</p>
          <span className="text-[10px] text-muted-foreground">{sale.district}</span>
          {sale.isEstate && <span className="text-[10px] text-amber-400 font-bold">Estate({sale.estateParcels}p)</span>}
          {isWhale && <span className="text-[10px] font-bold text-amber-300">🐋 {sale.priceVsFloor.toFixed(1)}× floor</span>}
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {fmtAddr(sale.fromAddress)} → {fmtAddr(sale.toAddress)} · {sale.marketplace} · {timeAgo(sale.timestamp)}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="font-black text-sm text-foreground">{sale.price.toFixed(3)} ETH</p>
        <p className="text-[10px] text-muted-foreground">{fmtUsd(sale.priceUsd)}</p>
      </div>
    </div>
  );
}

// ── Auction card ──────────────────────────────────────────────────────────────

function AuctionCard({ auction, metaverseMeta }: { auction: LandAuction; metaverseMeta: typeof METAVERSE_META[MetaverseId] }) {
  const [countdown, setCountdown] = useState(fmtCountdown(auction.endsAt));

  useEffect(() => {
    const id = setInterval(() => setCountdown(fmtCountdown(auction.endsAt)), 1_000);
    return () => clearInterval(id);
  }, [auction.endsAt]);

  const timeLeft = new Date(auction.endsAt).getTime() - Date.now();
  const isUrgent = timeLeft < 3_600_000;

  return (
    <motion.div whileHover={{ scale: 1.01 }}
      className="rounded-2xl p-4"
      style={{
        background: isUrgent ? 'rgba(239,68,68,0.05)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${isUrgent ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.07)'}`,
      }}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">{metaverseMeta.icon}</span>
            <div>
              <p className="font-black text-sm text-foreground">{metaverseMeta.name} {auction.tokenId}</p>
              <p className="text-[10px] text-muted-foreground">{auction.district}</p>
            </div>
          </div>
        </div>
        <div className={cn(
          'flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full',
          isUrgent ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/10 text-amber-400',
        )}>
          <Clock className="h-3 w-3" />
          {countdown}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-xl p-2.5" style={{ background: 'rgba(255,255,255,0.04)' }}>
          <p className="text-[9px] text-muted-foreground uppercase">Start</p>
          <p className="font-bold text-foreground">{auction.startPrice.toFixed(3)} ETH</p>
        </div>
        <div className="rounded-xl p-2.5" style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)' }}>
          <p className="text-[9px] text-blue-400 uppercase">Top Bid</p>
          <p className="font-black text-blue-400">{auction.currentBid.toFixed(3)} ETH</p>
        </div>
        <div className="rounded-xl p-2.5" style={{ background: 'rgba(255,255,255,0.04)' }}>
          <p className="text-[9px] text-muted-foreground uppercase">Bids</p>
          <p className="font-bold text-foreground">{auction.bidCount}</p>
        </div>
      </div>

      <button className="mt-3 w-full py-2 rounded-xl text-xs font-bold transition-all"
        style={{ background: `${metaverseMeta.color}15`, color: metaverseMeta.color, border: `1px solid ${metaverseMeta.color}30` }}
        onClick={() => toast.info(`Simulated bid on ${metaverseMeta.name} ${auction.tokenId}`)}>
        🎮 Simulate Bid
      </button>
    </motion.div>
  );
}

// ── Buy modal ─────────────────────────────────────────────────────────────────

function BuyLandModal({ parcel, metaverseMeta, portfolio, onClose, onBuy }: {
  parcel: LandParcel;
  metaverseMeta: typeof METAVERSE_META[MetaverseId];
  portfolio: VirtualLandPortfolio;
  onClose: () => void;
  onBuy: (parcel: LandParcel) => void;
}) {
  const costUsd = parcel.floorPriceUsd;
  const canAfford = portfolio.balance >= costUsd;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="fixed inset-4 sm:inset-auto sm:left-1/2 sm:-translate-x-1/2 sm:top-24 sm:w-full sm:max-w-sm z-[55] rounded-2xl bg-card border border-border">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-xl">{metaverseMeta.icon}</span>
            <div>
              <h2 className="font-black text-foreground text-sm">Simulate Land Purchase</h2>
              <p className="text-[10px] text-muted-foreground">{metaverseMeta.name} · {parcel.tokenId}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {/* Parcel details */}
          <div className="rounded-xl p-4 space-y-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">District</span>
              <span className="font-bold text-foreground">{parcel.district}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Coordinates</span>
              <span className="font-mono text-foreground">({parcel.x}, {parcel.y})</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Rarity</span>
              <span style={{ color: LAND_RARITY_META[parcel.rarity].color }} className="font-bold">
                {LAND_RARITY_META[parcel.rarity].icon} {LAND_RARITY_META[parcel.rarity].label}
              </span>
            </div>
            {parcel.isEstate && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Estate</span>
                <span className="text-amber-400 font-bold">{parcel.estateParcels} parcels bundled</span>
              </div>
            )}
          </div>
          {/* Price */}
          <div className="rounded-xl p-4"
            style={{ background: canAfford ? 'rgba(52,211,153,0.06)' : 'rgba(239,68,68,0.06)', border: `1px solid ${canAfford ? 'rgba(52,211,153,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
            <div className="flex justify-between text-sm font-black">
              <span>Floor Price</span>
              <span style={{ color: canAfford ? '#34d399' : '#f87171' }}>
                {parcel.floorPrice.toFixed(4)} ETH ({fmtUsd(costUsd)})
              </span>
            </div>
            <div className="flex justify-between text-xs mt-1.5 text-muted-foreground">
              <span>Your Balance</span>
              <span className="text-primary font-bold">{fmtUsd(portfolio.balance)}</span>
            </div>
            {!canAfford && <p className="text-[11px] text-red-400 mt-1">Insufficient virtual balance</p>}
          </div>
          <button onClick={() => { if (canAfford) { onBuy(parcel); onClose(); } }}
            disabled={!canAfford}
            className="w-full py-3 rounded-xl font-black text-sm transition-opacity disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #34d399, #059669)', color: '#fff' }}>
            Buy {parcel.isEstate ? 'Estate' : metaverseMeta.landUnit} — {fmtUsd(costUsd)}
          </button>
        </div>
      </motion.div>
    </>
  );
}

// ── Alert modal ───────────────────────────────────────────────────────────────

function LandAlertModal({ metaverseId, metaverseMeta, currentFloor, onClose }: {
  metaverseId: MetaverseId;
  metaverseMeta: typeof METAVERSE_META[MetaverseId];
  currentFloor: number;
  onClose: () => void;
}) {
  const [alertPrice, setAlertPrice] = useState(String((currentFloor * 0.8).toFixed(3)));
  const [type, setType] = useState<'below' | 'above'>('below');

  function handleSave() {
    toast.success(`Alert set: notify when ${metaverseMeta.name} floor ${type === 'below' ? 'drops below' : 'rises above'} ${alertPrice} ETH`);
    onClose();
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="fixed inset-4 sm:inset-auto sm:left-1/2 sm:-translate-x-1/2 sm:top-24 sm:w-full sm:max-w-sm z-[55] rounded-2xl bg-card border border-border">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-amber-400" />
            <h2 className="font-black text-sm">Set Land Price Alert</h2>
          </div>
          <button onClick={onClose}><X className="h-4 w-4 text-muted-foreground" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="rounded-xl p-3 text-xs" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-muted-foreground">Metaverse: <strong className="text-foreground">{metaverseMeta.name}</strong></p>
            <p className="text-muted-foreground mt-0.5">Current Floor: <strong className="text-primary">{currentFloor.toFixed(4)} ETH</strong></p>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2">Alert Type</label>
            <div className="flex gap-2">
              {(['below', 'above'] as const).map(t => (
                <button key={t} onClick={() => setType(t)}
                  className={cn('flex-1 py-2 rounded-xl text-xs font-bold border transition-all capitalize', type === t
                    ? (t === 'below' ? 'border-red-400/40 bg-red-400/10 text-red-400' : 'border-emerald-400/40 bg-emerald-400/10 text-emerald-400')
                    : 'border-white/10 text-muted-foreground hover:border-white/20')}>
                  {t === 'below' ? '📉 Drop Below' : '🚀 Rise Above'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1.5">Target Price (ETH)</label>
            <input type="number" value={alertPrice} onChange={e => setAlertPrice(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl text-sm border bg-white/4 border-white/10 focus:outline-none focus:border-primary/50" />
          </div>
          <button onClick={handleSave}
            className="w-full py-3 rounded-xl font-black text-sm transition-all"
            style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}>
            🔔 Set Alert
          </button>
        </div>
      </motion.div>
    </>
  );
}

// ── Main MetaversePage ────────────────────────────────────────────────────────

type TabId = 'overview' | 'map' | 'parcels' | 'sales' | 'auctions';

export function MetaversePage() {
  const navigate = useNavigate();

  // ── State ──────────────────────────────────────────────────────────────────
  const [allStats, setAllStats]      = useState(() => buildInitialMetaverseStats());
  const [selected,  setSelected]     = useState<MetaverseId>('the-sandbox');
  const [tab,       setTab]          = useState<TabId>('overview');
  const [buyTarget, setBuyTarget]    = useState<LandParcel | null>(null);
  const [showAlert, setShowAlert]    = useState(false);
  const [portfolio, setPortfolio]    = useState(loadLandPortfolio);
  const [sales,     setSales]        = useState(() => buildColdStartSales());
  const [tick,      setTick]         = useState(0);

  // Lazy-build expensive data
  const parcels    = useMemo(() => buildLandParcels(selected, 24), [selected]);
  const districts  = useMemo(() => buildDistricts(selected), [selected]);
  const history    = useMemo(() => buildPriceHistory(selected, 30), [selected]);
  const auctions   = useMemo(() => buildActiveAuctions(selected, 4), [selected]);

  // ── Polling tick ───────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      setAllStats(prev => tickMetaverseStats(prev));
      setTick(t => t + 1);
      // Inject a new sale every 20s
      setSales(prev => {
        const mv  = METAVERSE_IDS[Math.floor(Math.random() * 4)];
        const newSale = generateLandSale(mv, allStats[mv], Date.now());
        return [newSale, ...prev].slice(0, 40);
      });
    }, 20_000);
    return () => clearInterval(id);
  }, [allStats]);

  const stats    = allStats[selected];
  const metaMeta = METAVERSE_META[selected];

  // ── Buy handler ────────────────────────────────────────────────────────────
  function handleBuy(parcel: LandParcel) {
    const costUsd = parcel.floorPriceUsd;
    if (portfolio.balance < costUsd) { toast.error('Insufficient virtual balance'); return; }
    const updated: VirtualLandPortfolio = {
      ...portfolio,
      balance: portfolio.balance - costUsd,
      positions: [...portfolio.positions, {
        id:           generateId(),
        metaverse:    parcel.metaverse,
        tokenId:      parcel.tokenId,
        district:     parcel.district,
        x:            parcel.x,
        y:            parcel.y,
        buyPrice:     parcel.floorPrice,
        buyPriceUsd:  costUsd,
        currentFloor: parcel.floorPrice,
        rarity:       parcel.rarity,
        purchasedAt:  new Date().toISOString(),
      }],
    };
    setPortfolio(updated);
    saveLandPortfolio(updated);
    toast.success(`Purchased ${metaMeta.name} ${parcel.tokenId} in ${parcel.district}!`);
    setTab('overview');
  }

  // ── Global KPIs ────────────────────────────────────────────────────────────
  const totalVol24hUsd = METAVERSE_IDS.reduce((s, id) => s + allStats[id].volume24hUsd, 0);
  const totalCapUsd    = METAVERSE_IDS.reduce((s, id) => s + allStats[id].marketCapUsd, 0);
  const totalListings  = METAVERSE_IDS.reduce((s, id) => s + allStats[id].activeListings, 0);
  const totalOwners    = METAVERSE_IDS.reduce((s, id) => s + allStats[id].uniqueOwners, 0);

  const TABS: Array<{ id: TabId; label: string }> = [
    { id: 'overview',  label: '📈 Overview'  },
    { id: 'map',       label: '🗺️ Land Map'  },
    { id: 'parcels',   label: '🏡 Parcels'   },
    { id: 'sales',     label: '💸 Sales'     },
    { id: 'auctions',  label: '🔨 Auctions'  },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* ── §5.2 Spec Banner ── */}
      <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-white/5"
        style={{ background: 'linear-gradient(135deg, rgba(0,173,239,0.06) 0%, rgba(123,63,228,0.06) 100%)' }}>
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl"
                style={{ background: 'rgba(0,173,239,0.12)', border: '1px solid rgba(0,173,239,0.25)' }}>
                🌐
              </div>
              <div>
                <h2 className="font-black text-foreground text-lg">Metaverse Land Analytics</h2>
                <p className="text-[10px] text-muted-foreground">
                  {METAVERSE_IDS.length} worlds · {totalListings.toLocaleString()} active listings · {totalOwners.toLocaleString()} unique owners
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 px-2.5 py-1 rounded-full"
                style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> LIVE
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

          {/* ── Global KPIs ── */}
          <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
            <GlobalKPI label="Total Market Cap"   value={fmtUsd(totalCapUsd)}    sub="across 4 metaverses"                        color="#60a5fa" />
            <GlobalKPI label="24h Volume"          value={fmtUsd(totalVol24hUsd)} sub="+12% from yesterday"                        color="#34d399" />
            <GlobalKPI label="Active Listings"     value={totalListings.toLocaleString()} sub="floor-level parcels"               color="#fbbf24" />
            <GlobalKPI label="Unique Owners"       value={totalOwners.toLocaleString()} sub="across all worlds"                   color="#a78bfa" />
            <GlobalKPI label="Virtual Balance"     value={fmtUsd(portfolio.balance)} sub={`${portfolio.positions.length} positions`} color="#f472b6" />
          </div>

          {/* ── §5.2 Top Metaverses — 4-card row ── */}
          <section>
            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-3">Top Metaverses</p>
            <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
              {METAVERSE_IDS.map(id => (
                <MetaverseCard key={id} id={id} stats={allStats[id]}
                  isSelected={id === selected}
                  onSelect={() => { setSelected(id); setTab('overview'); }} />
              ))}
            </div>
          </section>

          {/* ── §5.2 Spec CTAs ── */}
          <div className="flex gap-3 flex-wrap">
            <button onClick={() => setBuyTarget(parcels[0] ?? null)}
              className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
              🎮 Simulate Land Purchase
            </button>
            <button onClick={() => setShowAlert(true)}
              className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm border border-amber-400/30 bg-amber-400/8 text-amber-400 hover:bg-amber-400/15 transition-all">
              <Bell className="h-4 w-4" /> Set Land Alert
            </button>
            <a href={metaMeta.website} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm border border-white/15 text-muted-foreground hover:text-foreground transition-colors">
              <ExternalLink className="h-4 w-4" /> Explore {metaMeta.name}
            </a>
          </div>

          {/* ── Deep-dive panel ── */}
          <section className="rounded-2xl overflow-hidden"
            style={{ border: `1px solid ${metaMeta.color}20` }}>
            {/* Deep-dive header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/5"
              style={{ background: `${metaMeta.color}08` }}>
              <span className="text-2xl">{metaMeta.icon}</span>
              <div className="flex-1">
                <p className="font-black text-foreground">{metaMeta.name}</p>
                <p className="text-[10px] text-muted-foreground">{metaMeta.description}</p>
              </div>
              <div className="text-right">
                <p className="font-black text-foreground">{stats.floorPrice.toFixed(3)} ETH</p>
                <p className={cn('text-[11px] font-bold', stats.floorChange24h >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {stats.floorChange24h >= 0 ? '↑' : '↓'}{Math.abs(stats.floorChange24h).toFixed(2)}%
                </p>
              </div>
            </div>

            {/* Tab bar */}
            <div className="flex border-b border-white/5" style={{ background: 'rgba(0,0,0,0.15)' }}>
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={cn(
                    'px-4 py-3 text-xs font-bold border-b-2 transition-all whitespace-nowrap',
                    tab === t.id
                      ? 'text-primary border-primary'
                      : 'text-muted-foreground border-transparent hover:text-foreground',
                  )}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <AnimatePresence mode="wait">
              <motion.div key={`${selected}-${tab}`}
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.1 }}>

                {/* OVERVIEW */}
                {tab === 'overview' && (
                  <div className="p-5 space-y-5">
                    {/* KPI strip */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: '7d Volume',     value: `${stats.volume7d.toFixed(1)} ETH`,      sub: fmtUsd(stats.volume7dUsd),   color: '#60a5fa' },
                        { label: 'Avg Sale (24h)', value: `${stats.avgSalePrice24h.toFixed(3)} ETH`, sub: `${stats.totalSales24h} sales`, color: '#34d399' },
                        { label: 'Market Cap',     value: fmtUsd(stats.marketCapUsd),              sub: `${stats.marketCap.toFixed(0)} ETH`, color: '#fbbf24' },
                        { label: 'Listed Rate',    value: `${stats.listedRate.toFixed(1)}%`,        sub: `${stats.activeListings.toLocaleString()} parcels`, color: '#a78bfa' },
                      ].map(k => (
                        <div key={k.label} className="rounded-xl p-3"
                          style={{ background: `${k.color}08`, border: `1px solid ${k.color}18` }}>
                          <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{k.label}</p>
                          <p className="font-black text-sm mt-0.5" style={{ color: k.color }}>{k.value}</p>
                          <p className="text-[10px] text-muted-foreground">{k.sub}</p>
                        </div>
                      ))}
                    </div>

                    {/* Price chart */}
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-3">30-Day Floor Price</p>
                      <ResponsiveContainer width="100%" height={180}>
                        <AreaChart data={history} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id={`meta-grad-${selected}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%"  stopColor={metaMeta.color} stopOpacity={0.3} />
                              <stop offset="95%" stopColor={metaMeta.color} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                          <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#6B7280' }} axisLine={false} tickLine={false} interval={4} />
                          <YAxis tick={{ fontSize: 9, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                          <Tooltip content={<ChartTooltip />} />
                          <Area type="monotone" dataKey="floor" stroke={metaMeta.color} strokeWidth={2}
                            fill={`url(#meta-grad-${selected})`} dot={false}
                            activeDot={{ r: 4, fill: metaMeta.color }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Districts */}
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-3">Districts</p>
                      <div className="space-y-2">
                        {districts.map(d => {
                          const hasListings = d.parcelCount > 100;
                          return (
                            <div key={d.id} className="flex items-center gap-3 px-4 py-3 rounded-xl"
                              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                              <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: d.color }} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-bold text-sm text-foreground">{d.name}</p>
                                  <span className="text-[10px] text-muted-foreground/60 capitalize">{d.category}</span>
                                </div>
                                <p className="text-[10px] text-muted-foreground truncate">{d.description}</p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="font-black text-xs text-foreground">{d.floorPrice.toFixed(3)} ETH</p>
                                <p className={cn('text-[10px] font-bold', d.premiumPct >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                                  {d.premiumPct >= 0 ? '+' : ''}{d.premiumPct}% vs floor
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Features */}
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2">Platform Features</p>
                      <div className="flex flex-wrap gap-2">
                        {metaMeta.features.map(f => (
                          <span key={f} className="text-xs px-2.5 py-1 rounded-full font-medium"
                            style={{ background: `${metaMeta.color}12`, color: metaMeta.color, border: `1px solid ${metaMeta.color}25` }}>
                            {f}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* LAND MAP */}
                {tab === 'map' && (
                  <div className="p-5">
                    <LandMap parcels={parcels} metaverse={selected} />
                    <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {(['common', 'uncommon', 'rare', 'legendary'] as const).map(r => {
                        const count = parcels.filter(p => p.rarity === r).length;
                        const m     = LAND_RARITY_META[r];
                        return (
                          <div key={r} className="rounded-xl p-3 text-center"
                            style={{ background: `${m.color}08`, border: `1px solid ${m.color}15` }}>
                            <p className="text-lg">{m.icon}</p>
                            <p className="text-xs font-bold mt-0.5" style={{ color: m.color }}>{m.label}</p>
                            <p className="text-[10px] text-muted-foreground">{count} / {parcels.length} shown</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* PARCELS */}
                {tab === 'parcels' && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[700px]">
                      <thead style={{ background: 'rgba(0,0,0,0.2)' }}>
                        <tr className="text-[10px] font-black text-muted-foreground uppercase tracking-wider border-b border-white/5">
                          <th className="px-4 py-3 text-left">Token</th>
                          <th className="px-3 py-3 text-left">Rarity</th>
                          <th className="px-3 py-3 text-right">Floor</th>
                          <th className="px-3 py-3 text-right">Type</th>
                          <th className="px-3 py-3 text-right">vs Last Sale</th>
                          <th className="px-3 py-3 text-right">Owner</th>
                          <th className="px-3 py-3"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {parcels.map(p => (
                          <ParcelRow key={p.id} parcel={p} onBuy={() => setBuyTarget(p)} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* SALES */}
                {tab === 'sales' && (
                  <div>
                    <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between"
                      style={{ background: 'rgba(0,0,0,0.1)' }}>
                      <p className="text-[10px] text-muted-foreground">
                        {sales.filter(s => s.metaverse === selected).length} sales for {metaMeta.name}
                      </p>
                      <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
                      </span>
                    </div>
                    {sales.filter(s => s.metaverse === selected).slice(0, 15).map(sale => (
                      <SaleRow key={sale.id} sale={sale} />
                    ))}
                    {sales.filter(s => s.metaverse === selected).length === 0 && (
                      <div className="py-10 text-center text-sm text-muted-foreground">No sales yet — check back soon</div>
                    )}
                  </div>
                )}

                {/* AUCTIONS */}
                {tab === 'auctions' && (
                  <div className="p-5">
                    <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-3">
                      Live Auctions — {metaMeta.name}
                    </p>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {auctions.map(a => (
                        <AuctionCard key={a.id} auction={a} metaverseMeta={metaMeta} />
                      ))}
                    </div>
                    <div className="mt-4 rounded-2xl p-4 text-xs"
                      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <p className="text-muted-foreground">
                        All auctions are simulated for educational purposes. Connect your wallet on{' '}
                        <a href={metaMeta.website} target="_blank" rel="noopener noreferrer"
                          className="text-primary hover:underline">{metaMeta.website}</a>{' '}
                        to participate in real auctions.
                      </p>
                    </div>
                  </div>
                )}

              </motion.div>
            </AnimatePresence>
          </section>

        </div>
      </div>

      {/* ── Modals ── */}
      <AnimatePresence>
        {buyTarget && (
          <BuyLandModal parcel={buyTarget} metaverseMeta={metaMeta}
            portfolio={portfolio}
            onClose={() => setBuyTarget(null)}
            onBuy={handleBuy} />
        )}
        {showAlert && (
          <LandAlertModal metaverseId={selected} metaverseMeta={metaMeta}
            currentFloor={stats.floorPrice}
            onClose={() => setShowAlert(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}
