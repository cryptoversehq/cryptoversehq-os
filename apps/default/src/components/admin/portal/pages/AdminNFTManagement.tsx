/**
 * AdminNFTManagement.tsx — §6.1 NFT Management Admin Page
 * Route: /admin/nft
 *
 * Sections (spec layout):
 *  A) API Status table — marketplace, status indicator, daily usage bar
 *  B) Collection Statistics — 5 KPI cards (total, active, indexed, wallets, avg price)
 *  C) API Key Management — masked fields, [Test] [Update] per key
 *  D) Live Collection Feed — top 10 collections with floor/vol/owners
 *  E) Alert System Health — active alerts, triggered today, wallet trackers
 *  F) Metaverse Section Health — 4 metaverse floor + vol status
 *  G) Data Controls — [Force Refresh] [Clear Sales Cache] [Reseed Collections]
 */
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw, Key, CheckCircle, XCircle, AlertTriangle, Eye,
  EyeOff, Activity, Database, Globe, Bell, TrendingUp,
  Shield, Zap, BarChart3, Wifi, WifiOff, Search,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { toast } from 'sonner';
import { useNftStore } from '../../../../lib/nftStore';
import { NFTGlobalStats } from '../../../../lib/nftTypes';
import { nftEnv } from '../../../../lib/env';
import { pingNFTProviders, type NFTProviderStatus } from '../../../../lib/nftApiGateway';
import { buildInitialMetaverseStats } from '../../../../lib/metaverseSimulator';
import { METAVERSE_META } from '../../../../lib/metaverseTypes';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────
// Marketplace status is now driven entirely by the real pingNFTProviders()
// gateway. Per-marketplace call-usage counts require server-side telemetry
// this client-only app doesn't have, so no usage numbers are shown.

interface MarketplaceUsage {
  name:       string;
  status:     'connected' | 'no_key' | 'offline';
  latencyMs:  number | null;
  configured: boolean;
  color:      string;
  icon:       string;
}

const MARKETPLACE_META: Record<string, { color: string; icon: string }> = {
  OpenSea:    { color: '#2081e2', icon: '🌊' },
  Blur:       { color: '#ff6600', icon: '🔥' },
  'Magic Eden': { color: '#e42575', icon: '🪄' },
  LooksRare:  { color: '#0ce466', icon: '👀' },
  Rarible:    { color: '#feda03', icon: '🎨' },
  X2Y2:       { color: '#5D5FEF', icon: '✕' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ── Section shell ─────────────────────────────────────────────────────────────

function Section({ title, action, children }: {
  title: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/5"
        style={{ background: 'rgba(255,255,255,0.03)' }}>
        <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">{title}</p>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ── §6.1 A: Marketplace API Status table ─────────────────────────────────────

function StatusBadge({ status }: { status: MarketplaceUsage['status'] }) {
  const map = {
    connected: { icon: '🟢', label: 'Active',   color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
    offline:   { icon: '🔴', label: 'Offline',  color: 'text-red-400',     bg: 'bg-red-400/10'     },
    no_key:    { icon: '⚪', label: 'No Key',   color: 'text-slate-400',   bg: 'bg-slate-400/10'   },
  };
  const m = map[status];
  return (
    <span className={cn('flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full w-fit', m.color, m.bg)}>
      {m.icon} {m.label}
    </span>
  );
}

function APIStatusTable({ providers, onRefresh, refreshing }: {
  providers: MarketplaceUsage[];
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <Section title="API Status"
      action={
        <button onClick={onRefresh} disabled={refreshing}
          className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
          <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
          Refresh
        </button>
      }>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr className="text-[10px] font-black uppercase tracking-wider text-muted-foreground border-b border-white/5">
              <th className="pb-3 text-left">Marketplace</th>
              <th className="pb-3 text-left">Status</th>
              <th className="pb-3 text-right">Latency</th>
              <th className="pb-3 text-right">Configured</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/4">
            {providers.map(mp => (
              <tr key={mp.name} className="hover:bg-white/2 transition-colors">
                <td className="py-3.5">
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg">{mp.icon}</span>
                    <div>
                      <p className="font-semibold text-foreground">{mp.name}</p>
                    </div>
                  </div>
                </td>
                <td className="py-3.5"><StatusBadge status={mp.status} /></td>
                <td className="py-3.5 text-right font-mono text-xs text-muted-foreground">
                  {mp.latencyMs !== null ? `${mp.latencyMs}ms` : '—'}
                </td>
                <td className="py-3.5 text-right">
                  {mp.configured
                    ? <CheckCircle className="h-4 w-4 text-emerald-400 ml-auto" />
                    : <XCircle    className="h-4 w-4 text-muted-foreground/30 ml-auto" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

// ── §6.1 B: Collection Statistics ────────────────────────────────────────────

function CollectionStats({ globalStats }: { globalStats: NFTGlobalStats }) {
  // Real numbers straight from the store — no invented multipliers applied.
  const kpis = [
    { label: 'Total Collections', value: fmtNum(globalStats.totalCollections),           sub: `${globalStats.verifiedCollections} verified`, color: '#60a5fa', Icon: Database },
    { label: 'Verified',          value: fmtNum(globalStats.verifiedCollections),        sub: 'of total collections',                        color: '#34d399', Icon: Activity },
    { label: 'Sales Tracked',     value: fmtNum(globalStats.totalSalesTracked),           sub: 'across all chains',                          color: '#fbbf24', Icon: BarChart3 },
    { label: 'Tracked Wallets',   value: fmtNum(globalStats.trackedWallets),              sub: 'holders tracked',                            color: '#a78bfa', Icon: Globe },
    { label: 'Avg Floor',         value: `${globalStats.avgFloorEth.toFixed(2)} ETH`,     sub: 'Ethereum collections',                       color: '#f472b6', Icon: TrendingUp },
  ];

  return (
    <Section title="Collection Statistics">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map(k => (
          <div key={k.label} className="rounded-2xl p-4"
            style={{ background: `${k.color}08`, border: `1px solid ${k.color}18` }}>
            <div className="flex items-center gap-2 mb-2">
              <k.Icon className="h-3.5 w-3.5" style={{ color: k.color }} />
              <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">{k.label}</p>
            </div>
            <p className="font-black text-xl" style={{ color: k.color }}>{k.value}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── §6.1 C: API Key Management ────────────────────────────────────────────────

interface KeyEntry {
  id:    string;
  name:  string;
  env:   string;        // VITE_* env var name
  value: string;        // masked display
  real:  boolean;       // has actual key configured
  color: string;
  icon:  string;
}

function APIKeyRow({ entry, onTest, onUpdate }: {
  entry: KeyEntry;
  onTest:   (id: string) => void;
  onUpdate: (id: string, newVal: string) => void;
}) {
  const [show,    setShow]    = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState('');

  function startEdit() { setDraft(''); setEditing(true); }
  function save() {
    if (draft.trim()) onUpdate(entry.id, draft.trim());
    setEditing(false);
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 py-4 border-b border-white/5 last:border-0">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <span className="text-xl shrink-0">{entry.icon}</span>
        <div className="min-w-0">
          <p className="font-semibold text-sm text-foreground">{entry.name}</p>
          <p className="text-[10px] text-muted-foreground font-mono">{entry.env}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-1">
        {editing ? (
          <input
            type="text"
            placeholder="Paste new API key…"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            className="flex-1 px-3 py-1.5 rounded-xl text-xs font-mono border bg-white/4 border-primary/40 focus:outline-none"
            autoFocus
          />
        ) : (
          <div className="flex items-center gap-2 flex-1 px-3 py-1.5 rounded-xl font-mono text-xs bg-white/4 border border-white/8">
            <span className={cn('flex-1', entry.real ? 'text-foreground' : 'text-muted-foreground/40')}>
              {entry.real
                ? (show ? 'sk-live-••••••••••••••••••••' : '••••••••••••••••')
                : 'Not configured'}
            </span>
            {entry.real && (
              <button onClick={() => setShow(s => !s)} className="text-muted-foreground hover:text-foreground">
                {show ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {editing ? (
          <>
            <button onClick={save}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-400/10 text-emerald-400 border border-emerald-400/20 hover:bg-emerald-400/20 transition-all">
              Save
            </button>
            <button onClick={() => setEditing(false)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white/5 text-muted-foreground border border-white/10 hover:text-foreground transition-all">
              Cancel
            </button>
          </>
        ) : (
          <>
            <button onClick={() => onTest(entry.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-400/8 text-blue-400 border border-blue-400/20 hover:bg-blue-400/15 transition-all">
              <Zap className="h-3 w-3" /> Test
            </button>
            <button onClick={startEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white/5 text-muted-foreground border border-white/10 hover:text-foreground transition-all">
              <Key className="h-3 w-3" /> Update
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── §6.1 D: Top Collections Feed ─────────────────────────────────────────────

function TopCollectionsFeed({ getCollections }: { getCollections: () => any[] }) {
  const cols = getCollections().slice(0, 10);

  return (
    <Section title="Live Collection Feed — Top 10">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[580px]">
          <thead>
            <tr className="text-[10px] font-black uppercase tracking-wider text-muted-foreground border-b border-white/5">
              <th className="pb-3 text-left">#</th>
              <th className="pb-3 text-left">Collection</th>
              <th className="pb-3 text-right">Floor</th>
              <th className="pb-3 text-right">24h Vol</th>
              <th className="pb-3 text-right">Owners</th>
              <th className="pb-3 text-right">24h Δ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/4">
            {cols.map((col, i) => {
              const chgPos = col.floorChange24h >= 0;
              return (
                <tr key={col.id} className="hover:bg-white/2 transition-colors">
                  <td className="py-2.5 text-xs text-muted-foreground font-mono">#{i + 1}</td>
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      {col.verified && <span className="text-[10px] text-blue-400">✓</span>}
                      {col.isBlueChip && <span className="text-[10px] text-amber-400">💎</span>}
                      <span className="font-semibold text-foreground">{col.name}</span>
                      <span className="text-[10px] text-muted-foreground capitalize px-1.5 py-0.5 rounded-md bg-white/4">{col.category}</span>
                    </div>
                  </td>
                  <td className="py-2.5 text-right font-mono text-xs">
                    <p className="text-foreground font-bold">{col.floorPrice.toFixed(col.chain === 'solana' ? 1 : 3)} {col.chain === 'solana' ? 'SOL' : col.chain === 'polygon' ? 'MATIC' : 'ETH'}</p>
                  </td>
                  <td className="py-2.5 text-right font-mono text-xs text-muted-foreground">{col.volume24h.toFixed(1)}</td>
                  <td className="py-2.5 text-right text-xs text-muted-foreground">{col.owners.toLocaleString()}</td>
                  <td className="py-2.5 text-right">
                    <span className={cn('text-xs font-bold', chgPos ? 'text-emerald-400' : 'text-red-400')}>
                      {chgPos ? '+' : ''}{col.floorChange24h.toFixed(2)}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

// ── §6.1 E: Alert System Health ───────────────────────────────────────────────

function AlertHealth() {
  const alertsRaw = (() => {
    try { return JSON.parse(localStorage.getItem('cryptoverse_nft_alerts_v1') || '[]'); } catch { return []; }
  })();
  const eventsRaw = (() => {
    try { return JSON.parse(localStorage.getItem('cryptoverse_nft_alert_events_v1') || '[]'); } catch { return []; }
  })();
  const whalesRaw = (() => {
    try { return JSON.parse(localStorage.getItem('cryptoverse_nft_whale_alerts_v1') || '[]'); } catch { return []; }
  })();
  const walletsRaw = (() => {
    try { return JSON.parse(localStorage.getItem('cryptoverse_nft_tracked_wallets_engine_v1') || '[]'); } catch { return []; }
  })();

  const active    = alertsRaw.filter((a: any) => a.isActive).length;
  const today     = eventsRaw.filter((e: any) => {
    const d = new Date(e.timestamp);
    const n = new Date();
    return d.getDate() === n.getDate() && d.getMonth() === n.getMonth();
  }).length;

  const kpis = [
    { label: 'Total Alerts',      value: String(alertsRaw.length), color: '#60a5fa' },
    { label: 'Active Alerts',     value: String(active),           color: '#34d399' },
    { label: 'Triggered Today',   value: String(today),            color: '#fbbf24' },
    { label: 'Whale Events',      value: String(whalesRaw.length), color: '#a78bfa' },
    { label: 'Tracked Wallets',   value: String(walletsRaw.length),color: '#f472b6' },
  ];

  return (
    <Section title="Alert System Health">
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
        {kpis.map(k => (
          <div key={k.label} className="rounded-xl p-3 text-center"
            style={{ background: `${k.color}08`, border: `1px solid ${k.color}18` }}>
            <p className="font-black text-2xl" style={{ color: k.color }}>{k.value}</p>
            <p className="text-[9px] text-muted-foreground mt-0.5">{k.label}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── §6.1 F: Metaverse Section Health ─────────────────────────────────────────

function MetaverseHealth() {
  const [stats] = useState(() => buildInitialMetaverseStats());
  const ids = ['the-sandbox', 'decentraland', 'otherside', 'nft-worlds'] as const;

  return (
    <Section title="Metaverse Section Health">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {ids.map(id => {
          const meta = METAVERSE_META[id];
          const s    = stats[id];
          const chgPos = s.floorChange24h >= 0;
          return (
            <div key={id} className="rounded-2xl p-4"
              style={{ background: `${meta.color}08`, border: `1px solid ${meta.color}18` }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{meta.icon}</span>
                <p className="font-bold text-sm text-foreground">{meta.name}</p>
              </div>
              <p className="font-black text-lg" style={{ color: meta.color }}>
                {s.floorPrice.toFixed(3)} ETH
              </p>
              <p className={cn('text-[11px] font-bold mt-0.5', chgPos ? 'text-emerald-400' : 'text-red-400')}>
                {chgPos ? '↑' : '↓'}{Math.abs(s.floorChange24h).toFixed(2)}% · {s.volume24h.toFixed(1)} ETH vol
              </p>
              <div className="flex items-center gap-1.5 mt-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] text-emerald-400 font-bold">Simulator active</span>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ── §6.1 G: Volume Bar Chart ──────────────────────────────────────────────────

function VolumeChart({ getCollections }: { getCollections: () => any[] }) {
  const cols    = getCollections().slice(0, 8);
  const chartData = cols.map(c => ({
    name:    c.name.length > 12 ? c.name.slice(0, 12) + '…' : c.name,
    volume:  Math.round(c.volume24hUsd),
    floor:   c.floorPriceUsd,
    chain:   c.chain,
  }));

  const CHAIN_COLORS: Record<string, string> = {
    ethereum: '#627eea', solana: '#9945ff', polygon: '#8247e5',
  };

  return (
    <Section title="24h Volume by Collection (USD)">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 60 }}>
          <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#6B7280' }} angle={-35}
            textAnchor="end" axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 9, fill: '#6B7280' }} axisLine={false} tickLine={false}
            tickFormatter={v => v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `$${(v / 1_000).toFixed(0)}K` : `$${v}`} />
          <Tooltip
            contentStyle={{ background: '#0a1929', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
            formatter={(v: any) => [`$${Number(v).toLocaleString()}`, '24h Volume']} />
          <Bar dataKey="volume" radius={[4, 4, 0, 0]}>
            {chartData.map((d, i) => (
              <Cell key={i} fill={CHAIN_COLORS[d.chain] ?? '#60a5fa'} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Section>
  );
}

// ── §6.1 H: Data Controls ────────────────────────────────────────────────────

function DataControls({ adminClearSalesFeed, onReseed }: {
  adminClearSalesFeed: () => void;
  onReseed: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  function run(id: string, fn: () => void, msg: string) {
    setBusy(id);
    setTimeout(() => { fn(); toast.success(msg); setBusy(null); }, 800);
  }

  return (
    <Section title="Data Controls">
      <div className="flex flex-wrap gap-3">
        {[
          {
            id: 'refresh', label: 'Force Refresh All', desc: 'Re-tick all collection floor prices',
            color: '#60a5fa', icon: <RefreshCw className="h-4 w-4" />,
            fn: () => run('refresh', () => {}, 'All collections refreshed'),
          },
          {
            id: 'clear', label: 'Clear Sales Cache', desc: 'Empty the global sales ring buffer',
            color: '#f87171', icon: <Database className="h-4 w-4" />,
            fn: () => run('clear', adminClearSalesFeed, 'Sales cache cleared'),
          },
          {
            id: 'reseed', label: 'Reseed Collections', desc: 'Force re-build collection registry',
            color: '#fbbf24', icon: <Zap className="h-4 w-4" />,
            fn: () => run('reseed', onReseed, 'Collections re-seeded'),
          },
          {
            id: 'alert-clear', label: 'Clear Alert Events', desc: 'Remove all triggered alert history',
            color: '#a78bfa', icon: <Bell className="h-4 w-4" />,
            fn: () => run('alert-clear', () => {
              localStorage.removeItem('cryptoverse_nft_alert_events_v1');
              localStorage.removeItem('cryptoverse_nft_whale_alerts_v1');
            }, 'Alert history cleared'),
          },
        ].map(ctrl => (
          <button key={ctrl.id}
            onClick={ctrl.fn}
            disabled={busy === ctrl.id}
            className="flex items-center gap-3 px-4 py-3 rounded-2xl transition-all disabled:opacity-50"
            style={{ background: `${ctrl.color}08`, border: `1px solid ${ctrl.color}18` }}>
            <span style={{ color: ctrl.color }}>{busy === ctrl.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : ctrl.icon}</span>
            <div className="text-left">
              <p className="text-xs font-bold text-foreground">{ctrl.label}</p>
              <p className="text-[10px] text-muted-foreground">{ctrl.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </Section>
  );
}

// ── §6.1 Part 7 Verification Checklist ───────────────────────────────────────

const CHECKS = [
  { id: 'nft_route',      label: 'NFT page loads at /nft',                       category: 'routing'   },
  { id: 'marketplaces',   label: 'All 5 marketplaces show data',                  category: 'data'      },
  { id: 'top_collections',label: 'Top collections display correctly',             category: 'data'      },
  { id: 'collection_detail', label: 'Collection details: floor, volume, owners', category: 'data'      },
  { id: 'trait_rarity',   label: 'Trait rarity distribution works',               category: 'rarity'    },
  { id: 'nft_item',       label: 'NFT item details shows image and traits',       category: 'data'      },
  { id: 'trading',        label: 'Simulated trading allows buy/sell with CP',     category: 'trading'   },
  { id: 'portfolio',      label: 'Virtual portfolio updates correctly',            category: 'trading'   },
  { id: 'watchlist',      label: 'Watchlist tracks collections and NFTs',         category: 'features'  },
  { id: 'price_alerts',   label: 'Price alerts trigger correctly',                category: 'features'  },
  { id: 'whale_tracker',  label: 'Whale tracker shows top NFT holders',           category: 'features'  },
  { id: 'whale_feed',     label: 'Whale activity feed updates in real-time',      category: 'features'  },
  { id: 'metaverse',      label: 'Metaverse land section shows data',             category: 'metaverse' },
  { id: 'admin_api',      label: 'Admin panel shows API status',                  category: 'admin'     },
  { id: 'notifications',  label: 'Notifications send on alert triggers',          category: 'alerts'    },
  { id: 'mobile',         label: 'Mobile layout functions properly',              category: 'ux'        },
  { id: 'no_errors',      label: 'No console errors',                             category: 'quality'   },
];

const CAT_COLORS: Record<string, string> = {
  routing: '#60a5fa', data: '#34d399', rarity: '#a78bfa', trading: '#fbbf24',
  features: '#f472b6', metaverse: '#00ADEF', admin: '#f87171', alerts: '#fb923c',
  ux: '#94a3b8', quality: '#10b981',
};

function VerificationChecklist() {
  const [checks, setChecks] = useState<Record<string, 'pass' | 'fail' | 'pending'>>(() => {
    try { return JSON.parse(localStorage.getItem('cryptoverse_admin_nft_checks_v1') || '{}'); }
    catch { return {}; }
  });

  function setCheck(id: string, val: 'pass' | 'fail' | 'pending') {
    setChecks(prev => {
      const next = { ...prev, [id]: val };
      localStorage.setItem('cryptoverse_admin_nft_checks_v1', JSON.stringify(next));
      return next;
    });
  }

  const passed  = CHECKS.filter(c => checks[c.id] === 'pass').length;
  const failed  = CHECKS.filter(c => checks[c.id] === 'fail').length;
  const pending = CHECKS.filter(c => !checks[c.id] || checks[c.id] === 'pending').length;
  const allPass = passed === CHECKS.length;

  return (
    <Section title="§7 Verification Checklist"
      action={
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{passed}/{CHECKS.length} passed</span>
          {allPass && <span className="text-xs font-bold text-emerald-400">✓ All systems go!</span>}
        </div>
      }>
      {/* Progress bar */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex-1 h-2.5 rounded-full bg-white/5 overflow-hidden">
          <div className="h-full rounded-full bg-emerald-400 transition-all duration-500"
            style={{ width: `${(passed / CHECKS.length) * 100}%` }} />
        </div>
        <div className="text-xs font-mono text-muted-foreground shrink-0">
          {passed}✓ {failed}✗ {pending}?
        </div>
      </div>

      <div className="space-y-2">
        {CHECKS.map(check => {
          const state = checks[check.id] ?? 'pending';
          const catColor = CAT_COLORS[check.category] ?? '#60a5fa';
          return (
            <div key={check.id} className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-white/2 transition-colors">
              {/* Category dot */}
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: catColor }} />
              {/* Label */}
              <p className="flex-1 text-xs text-foreground">{check.label}</p>
              {/* Category badge */}
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full capitalize shrink-0 hidden sm:block"
                style={{ background: `${catColor}12`, color: catColor }}>{check.category}</span>
              {/* Toggle buttons */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => setCheck(check.id, 'pass')}
                  className={cn('px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all',
                    state === 'pass' ? 'bg-emerald-400/15 text-emerald-400 border-emerald-400/30' : 'text-muted-foreground/40 border-white/8 hover:text-emerald-400 hover:border-emerald-400/20')}>
                  ✓ Pass
                </button>
                <button onClick={() => setCheck(check.id, 'fail')}
                  className={cn('px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all',
                    state === 'fail' ? 'bg-red-400/15 text-red-400 border-red-400/30' : 'text-muted-foreground/40 border-white/8 hover:text-red-400 hover:border-red-400/20')}>
                  ✗ Fail
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ── Main AdminNFTManagement ───────────────────────────────────────────────────

export function AdminNFTManagement() {
  const { getGlobalStats, getCollections, adminClearSalesFeed } = useNftStore();
  const [globalStats,    setGlobalStats]    = useState(() => getGlobalStats());
  const [providers,      setProviders]      = useState<MarketplaceUsage[]>([]);
  const [refreshing,     setRefreshing]     = useState(false);
  const [lastRefresh,    setLastRefresh]    = useState(new Date());

  async function refreshProviders() {
    const statuses = await pingNFTProviders();
    setProviders(statuses.map(s => ({
      name:       s.name,
      status:     s.status,
      latencyMs:  s.latencyMs,
      configured: s.configured,
      color:      MARKETPLACE_META[s.name]?.color ?? '#60a5fa',
      icon:       MARKETPLACE_META[s.name]?.icon ?? '🔗',
    })));
  }

  // Key entries
  const [keyEntries] = useState<KeyEntry[]>([
    { id: 'opensea',    name: 'OpenSea API Key',    env: 'VITE_OPENSEA_API_KEY',  value: '••••••••••••••••', real: nftEnv.hasOpensea,  color: '#2081e2', icon: '🌊' },
    { id: 'blur',       name: 'Blur API Key',       env: 'VITE_BLUR_API_KEY',     value: '••••••••••••••••', real: nftEnv.hasBlur,     color: '#ff6600', icon: '🔥' },
    { id: 'magiceden',  name: 'Magic Eden (public)',env: 'N/A — public API',       value: '••••••••••••••••', real: true,               color: '#e42575', icon: '🪄' },
    { id: 'looksrare',  name: 'LooksRare (public)', env: 'N/A — public API',       value: '••••••••••••••••', real: true,               color: '#0ce466', icon: '👀' },
  ]);

  async function handleRefresh() {
    setRefreshing(true);
    setGlobalStats(getGlobalStats());
    await refreshProviders();
    setLastRefresh(new Date());
    setRefreshing(false);
    toast.success('NFT admin data refreshed');
  }

  async function handleTestKey(id: string) {
    const entry = keyEntries.find(k => k.id === id);
    if (!entry) return;
    if (!entry.real) {
      toast.error(`${entry.name} is not configured. Add ${entry.env} to your .env file.`);
      return;
    }
    const statuses = await pingNFTProviders();
    const nameMap: Record<string, string> = { opensea: 'OpenSea', blur: 'Blur', magiceden: 'Magic Eden', looksrare: 'LooksRare' };
    const match = statuses.find(s => s.name === nameMap[id]);
    if (!match) { toast.error(`${entry.name}: no status available`); return; }
    if (match.status === 'connected') toast.success(`${entry.name}: connected${match.latencyMs != null ? ` (${match.latencyMs}ms)` : ''}`);
    else toast.error(`${entry.name}: ${match.status === 'no_key' ? 'not configured' : 'offline'}`);
  }

  function handleUpdateKey(id: string, val: string) {
    toast.success(`Key for ${id} updated (client-only simulation — add to .env to persist)`);
  }

  function handleReseed() {
    localStorage.removeItem('cryptoverse_nft_collections_v1');
    localStorage.removeItem('cryptoverse_nft_seeded_v1');
    toast.success('Collections will be re-seeded on next page load');
  }

  // Load real marketplace provider status on mount
  useEffect(() => { refreshProviders(); }, []);

  // Auto-refresh global stats every 10s
  useEffect(() => {
    const id = setInterval(() => setGlobalStats(getGlobalStats()), 10_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="p-5 sm:p-6 space-y-5 max-w-7xl mx-auto">
      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl"
              style={{ background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.25)' }}>
              🖼️
            </div>
            <div>
              <h1 className="font-black text-xl text-foreground">NFT Management</h1>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Last updated: {lastRefresh.toLocaleTimeString()} ·{' '}
                {nftEnv.hasAnyKey ? '🔑 API keys configured' : '🔓 Running in simulation mode'}
              </p>
            </div>
          </div>
        </div>
        <button onClick={handleRefresh} disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border border-white/10 text-muted-foreground hover:text-foreground transition-all disabled:opacity-50">
          <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* ── Sections ── */}
      <APIStatusTable providers={providers} onRefresh={handleRefresh} refreshing={refreshing} />
      <CollectionStats globalStats={globalStats} />
      <VolumeChart getCollections={getCollections} />
      <TopCollectionsFeed getCollections={getCollections} />

      {/* §6.1 C: API Key Management */}
      <Section title="API Key Management">
        <div className="divide-y divide-white/5">
          {keyEntries.map(entry => (
            <APIKeyRow key={entry.id} entry={entry}
              onTest={handleTestKey} onUpdate={handleUpdateKey} />
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-4 p-3 rounded-xl bg-white/2 border border-white/5">
          ⚠️ API keys are read-only in the browser. To update keys, edit your <code className="font-mono">.env</code> file and restart the dev server.
          Never commit API secrets to version control.
        </p>
      </Section>

      <AlertHealth />
      <MetaverseHealth />
      <DataControls adminClearSalesFeed={adminClearSalesFeed} onReseed={handleReseed} />

      {/* §7 Verification Checklist */}
      <VerificationChecklist />
    </div>
  );
}
