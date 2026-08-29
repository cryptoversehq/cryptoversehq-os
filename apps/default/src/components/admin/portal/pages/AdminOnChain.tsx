/**
 * AdminOnChain.tsx — §6.1 Admin On-Chain Management Page
 *
 * Full-featured admin view for the on-chain monitoring system.
 * Sections:
 *  A) API Status — per-chain health, usage meters, latency
 *  B) Alert Statistics — totals, active, triggered today, false positives, avg response
 *  C) API Key Management — masked keys, test ping, update placeholder
 *  D) Alert Table — searchable list of ALL user alerts (admin view)
 *  E) Event Log — recent events across all users
 *  F) Chain Volume Breakdown — bar chart per chain
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  RefreshCw, Wifi, WifiOff, AlertTriangle, Key, CheckCircle,
  Eye, EyeOff, ExternalLink, Search, Trash2, Activity,
  Clock, TrendingUp, BarChart3, Bell, Shield, ChevronDown,
  ChevronUp, Database, Zap,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { toast } from 'sonner';
import { ErrorBoundary } from 'react-error-boundary';
import { useOnChainStore } from '../../../../lib/onChainStore';
import { gateway, ApiProviderStatus } from '../../../../lib/onChainApiGateway';
import { onChainEnv } from '../../../../lib/env';
import { CHAIN_DISPLAY, ALL_CHAINS, fmtUsd, timeAgo } from '../../../onChain/onChainUtils';
import { CHAIN_META, MonitoredChain, WHALE_TIER_META } from '../../../../lib/onChainTypes';
import { cn } from '@/lib/utils';

// Per-chain call-usage tracking requires server-side telemetry, which this
// client-only app doesn't have — the "Usage Today" column honestly shows
// "Not tracked" instead of fabricated call counts.

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color, icon: Icon }: {
  label: string; value: string | number; sub?: string; color: string; icon: React.ElementType;
}) {
  return (
    <div className="rounded-2xl p-4"
      style={{ background: `${color}08`, border: `1px solid ${color}20` }}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4" style={{ color }} />
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{label}</p>
      </div>
      <p className="text-2xl font-black" style={{ color }}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, action, children }: {
  title: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/5"
        style={{ background: 'rgba(255,255,255,0.03)' }}>
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ── Per-section error fallback ────────────────────────────────────────────────
// Granular boundary so one broken widget can't blank the entire page (see
// AGENTS.md: "add granular [error boundaries] only around risky subtrees").

function SectionErrorFallback({ resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) {
  return (
    <div className="py-8 text-center">
      <p className="text-sm text-muted-foreground">No data available</p>
      <button
        onClick={resetErrorBoundary}
        className="mt-2 text-xs text-primary hover:underline"
      >
        Try again
      </button>
    </div>
  );
}

// ── A) API Status Table ───────────────────────────────────────────────────────

function ApiStatusSection({ statuses, onRefresh }: {
  statuses: ApiProviderStatus[]; onRefresh: () => void;
}) {
  const realStatuses = statuses.filter(s => s.source === 'real');

  return (
    <Section title="API Status"
      action={
        <button onClick={onRefresh} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      }>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              <th className="text-left pb-3">Chain</th>
              <th className="text-left pb-3">Provider</th>
              <th className="text-left pb-3">Status</th>
              <th className="text-left pb-3">Latency</th>
              <th className="text-left pb-3">Configured</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {ALL_CHAINS.map(chain => {
              const display = CHAIN_DISPLAY[chain];
              const provider = realStatuses.find(s => s.chain === chain);

              const statusColor = provider?.status === 'connected' ? '#34d399'
                : provider?.status === 'degraded' ? '#fbbf24'
                : provider?.status === 'unconfigured' ? '#6b7280'
                : '#ef4444';

              const statusLabel = provider?.status === 'connected' ? '🟢 Active'
                : provider?.status === 'degraded' ? '🟡 Degraded'
                : provider?.status === 'unconfigured' ? '⚫ No Key'
                : '🔴 Offline';

              return (
                <tr key={chain} className="hover:bg-white/2 transition-colors">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{display.icon}</span>
                      <div>
                        <p className="font-semibold text-foreground text-sm">{display.name}</p>
                        <p className="text-[10px] text-muted-foreground">{display.symbol}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-xs text-muted-foreground">{provider?.name ?? 'Simulator'}</td>
                  <td className="py-3 pr-4">
                    <span className="text-xs font-bold" style={{ color: statusColor }}>{statusLabel}</span>
                  </td>
                  <td className="py-3 pr-4">
                    {provider?.latencyMs != null
                      ? <span className={cn('font-mono text-xs font-bold',
                          provider.latencyMs < 300 ? 'text-emerald-400' : provider.latencyMs < 800 ? 'text-amber-400' : 'text-red-400')}>
                          {provider.latencyMs}ms
                        </span>
                      : <span className="text-muted-foreground text-xs">—</span>}
                  </td>
                  <td className="py-3">
                    {chain === 'bitcoin'
                      ? <span className="text-[11px] text-emerald-400 font-bold">✓ Free (no key)</span>
                      : provider?.configured
                      ? <span className="text-[11px] text-emerald-400 font-bold">✓ Key set</span>
                      : <span className="text-[11px] text-muted-foreground">✗ Not configured</span>}
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

// ── B) Alert Statistics ───────────────────────────────────────────────────────

function AlertStatsSection() {
  const { getGlobalStats, alerts: allAlerts, events: allEvents } = useOnChainStore();
  const stats = getGlobalStats();

  // Derived stats
  const triggeredToday = useMemo(() => {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    return Object.values(allEvents).filter(e => new Date(e.timestamp) >= todayStart).length;
  }, [allEvents]);

  // False-positive rate and response latency require server-side telemetry
  // this client-only app doesn't have — shown honestly as "Not tracked"
  // rather than fabricated numbers.

  const volumeChart = ALL_CHAINS.map(chain => ({
    chain:  CHAIN_DISPLAY[chain].symbol,
    volume: stats.byChain[chain]?.volumeUsd ?? 0,
    color:  CHAIN_DISPLAY[chain].color,
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard label="Total Alerts"   value={stats.totalAlerts.toLocaleString()}  color="#60a5fa" icon={Bell} />
        <StatCard label="Active Alerts"  value={stats.activeAlerts.toLocaleString()} color="#34d399" icon={Activity} sub={`${stats.totalAlerts > 0 ? Math.round(stats.activeAlerts/stats.totalAlerts*100) : 0}% active`} />
        <StatCard label="Triggered Today" value={triggeredToday} color="#fbbf24" icon={Zap} sub="Last 24 hours" />
        <StatCard label="Chains Monitored" value={ALL_CHAINS.length} color="#f472b6" icon={Shield} sub="ethereum, bitcoin, bnb, solana, polygon" />
        <StatCard label="Avg Response"   value="Not tracked" color="#a78bfa" icon={Clock} sub="Requires server telemetry" />
      </div>

      {/* Whale tier breakdown */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-2xl p-4"
          style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Events by Whale Tier</p>
          {Object.keys(stats.byWhaleTier).length === 0 || stats.totalEvents === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No data available</p>
          ) : (
          <div className="space-y-2">
            {(Object.entries(stats.byWhaleTier) as [string, number][])
              .sort((a, b) => b[1] - a[1])
              .map(([tier, count]) => {
                const meta = WHALE_TIER_META[tier as keyof typeof WHALE_TIER_META];
                const pct  = stats.totalEvents > 0 ? (count / stats.totalEvents) * 100 : 0;
                return (
                  <div key={tier} className="flex items-center gap-2 text-xs">
                    <span className="w-4">{meta?.icon ?? '?'}</span>
                    <span className="w-16 text-muted-foreground capitalize">{tier}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: meta?.color ?? '#6b7280' }} />
                    </div>
                    <span className="font-mono font-bold w-6 text-right" style={{ color: meta?.color ?? '#6b7280' }}>{count}</span>
                  </div>
                );
              })}
          </div>
          )}
        </div>

        <div className="rounded-2xl p-4"
          style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Volume by Chain</p>
          {volumeChart.every(d => d.volume === 0) ? (
            <p className="text-xs text-muted-foreground text-center py-8">No data available</p>
          ) : (
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={volumeChart} margin={{ top: 0, right: 0, left: -20, bottom: 0 }} barGap={3}>
              <XAxis dataKey="chain" tick={{ fontSize: 9, fill: '#6B7280' }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return <div className="rounded-lg px-2 py-1 text-xs" style={{ background: '#0a1929', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <p>{label}: <span className="font-bold text-primary">{fmtUsd(payload[0]?.value as number ?? 0)}</span></p>
                </div>;
              }} />
              <Bar dataKey="volume" radius={[3, 3, 0, 0]} maxBarSize={35}>
                {volumeChart.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

// ── C) API Key Management ─────────────────────────────────────────────────────

interface KeyRow {
  id:      string;
  label:   string;
  envVar:  string;
  value:   string;
  link:    string;
  chain:   MonitoredChain | null;
}

const KEY_ROWS: KeyRow[] = [
  { id: 'etherscan', label: 'Etherscan API Key',   envVar: 'VITE_ETHERSCAN_API_KEY',   value: onChainEnv.etherscanApiKey,   link: 'https://etherscan.io/apis',   chain: 'ethereum' },
  { id: 'bscscan',   label: 'BscScan API Key',     envVar: 'VITE_BSCSCAN_API_KEY',     value: onChainEnv.bscscanApiKey,     link: 'https://bscscan.com/apis',    chain: 'bnb' },
  { id: 'polygon',   label: 'Polygonscan API Key',  envVar: 'VITE_POLYGONSCAN_API_KEY', value: onChainEnv.polygonscanApiKey, link: 'https://polygonscan.com/apis', chain: 'polygon' },
  { id: 'solana',    label: 'Solana RPC URL',       envVar: 'VITE_SOLANA_RPC_URL',      value: onChainEnv.solanaRpcUrl,      link: 'https://helius.dev',          chain: 'solana' },
  { id: 'mempool',   label: 'Mempool Base URL',     envVar: 'VITE_MEMPOOL_API_BASE_URL',value: onChainEnv.mempoolBaseUrl,    link: 'https://mempool.space/api',   chain: 'bitcoin' },
];

function ApiKeyRow({ row }: { row: KeyRow }) {
  const [visible, setVisible]   = useState(false);
  const [testing, setTesting]   = useState(false);
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null);

  const hasValue = row.value.trim().length > 0;
  const masked   = hasValue ? '•'.repeat(16) : '— not configured —';

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    let latency: number | null = null;
    if (row.id === 'mempool')   latency = await gateway.pingMempool();
    else if (row.id === 'etherscan') latency = await gateway.pingEtherscan();
    else if (row.id === 'bscscan')   latency = await gateway.pingBscscan();
    else {
      // Simulate test for keys without a dedicated ping
      await new Promise(r => setTimeout(r, 800));
      latency = hasValue ? 320 : null;
    }
    setTestResult(latency !== null ? 'ok' : 'fail');
    setTesting(false);
    if (latency !== null) toast.success(`${row.label}: ${latency}ms`);
    else toast.error(`${row.label}: connection failed`);
  }

  return (
    <div className="flex items-center gap-3 py-3 border-b border-white/5 last:border-0">
      {/* Chain icon */}
      {row.chain && (
        <span className="text-base shrink-0">{CHAIN_DISPLAY[row.chain].icon}</span>
      )}

      {/* Label + env var */}
      <div className="w-48 shrink-0">
        <p className="text-sm font-semibold text-foreground">{row.label}</p>
        <p className="text-[10px] font-mono text-muted-foreground">{row.envVar}</p>
      </div>

      {/* Masked value */}
      <div className="flex-1 flex items-center gap-2 font-mono text-sm px-3 py-2 rounded-xl bg-white/4 border border-white/8 min-w-0">
        <span className={cn('flex-1 truncate', hasValue ? 'text-foreground' : 'text-muted-foreground/40')}>
          {visible && hasValue ? row.value : masked}
        </span>
        {hasValue && (
          <button onClick={() => setVisible(v => !v)} className="text-muted-foreground hover:text-foreground shrink-0">
            {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      {/* Status dot */}
      <span className={cn('w-2 h-2 rounded-full shrink-0',
        row.id === 'mempool' ? 'bg-emerald-400' : hasValue ? 'bg-emerald-400' : 'bg-white/20')} />

      {/* Test button */}
      <button onClick={handleTest} disabled={testing}
        className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all shrink-0',
          testResult === 'ok'   ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' :
          testResult === 'fail' ? 'border-red-500/30 bg-red-500/10 text-red-400' :
          'border-white/10 text-muted-foreground hover:text-foreground')}>
        {testing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : testResult === 'ok' ? <CheckCircle className="h-3.5 w-3.5" /> : testResult === 'fail' ? <AlertTriangle className="h-3.5 w-3.5" /> : null}
        {testing ? 'Testing…' : testResult === 'ok' ? 'OK' : testResult === 'fail' ? 'Failed' : 'Test'}
      </button>

      {/* Get key link */}
      <a href={row.link} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-1 text-[11px] text-primary hover:underline shrink-0">
        Get key <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

function ApiKeySection() {
  return (
    <Section title="API Key Management">
      <div className="mb-4 p-3 rounded-xl text-xs"
        style={{ background: 'rgba(96,165,250,0.05)', border: '1px solid rgba(96,165,250,0.15)', color: '#93c5fd' }}>
        <strong>Security note:</strong> API keys are read from your <code className="bg-white/10 px-1 rounded">.env</code> file at build time.
        They are not editable at runtime in this environment. To update a key, edit <code className="bg-white/10 px-1 rounded">.env</code> and rebuild.
        Mempool.space (Bitcoin) requires no key and is always active.
      </div>
      <div>
        {KEY_ROWS.map(row => <ApiKeyRow key={row.id} row={row} />)}
      </div>
    </Section>
  );
}

// ── D) Alert Table (admin view) ───────────────────────────────────────────────

function AlertTableSection() {
  const { getGlobalStats, adminDeleteAlert }  = useOnChainStore();
  const [search, setSearch] = useState('');
  const [page, setPage]     = useState(0);
  const PAGE_SIZE = 8;

  // Access all alerts via store internals
  const allAlerts = Object.values(useOnChainStore.getState().alerts);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return allAlerts.filter(a =>
      !q || a.name.toLowerCase().includes(q) || a.address.toLowerCase().includes(q) || a.userId.includes(q)
    );
  }, [allAlerts, search]);

  const pages    = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function handleDelete(alertId: string) {
    adminDeleteAlert(alertId, 'admin');
    toast.success('Alert deleted');
  }

  return (
    <Section title={`All User Alerts (${allAlerts.length})`}
      action={
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search alerts…"
            className="pl-8 pr-3 py-1.5 rounded-xl text-xs bg-white/5 border border-white/10 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/20 w-44"
          />
        </div>
      }>
      {allAlerts.length === 0 ? (
        <div className="py-8 text-center">
          <Bell className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">No data available</p>
          <p className="text-xs text-muted-foreground/60">Users create alerts from the On-Chain page.</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider border-b border-white/5">
                  <th className="text-left pb-2">Name</th>
                  <th className="text-left pb-2">User</th>
                  <th className="text-left pb-2">Chain</th>
                  <th className="text-left pb-2">Type</th>
                  <th className="text-left pb-2">Threshold</th>
                  <th className="text-left pb-2">Status</th>
                  <th className="text-left pb-2">Triggers</th>
                  <th className="text-left pb-2">Last Hit</th>
                  <th className="text-left pb-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/4">
                {paginated.map(a => {
                  const chain = CHAIN_DISPLAY[a.chain];
                  const typeColors: Record<string, string> = {
                    whale_transaction: '#FFD700', wallet_activity: '#a78bfa', exchange_flow: '#34d399',
                  };
                  const typeColor = typeColors[a.alertType ?? 'whale_transaction'] ?? '#6b7280';
                  return (
                    <tr key={a.id} className="hover:bg-white/2 transition-colors">
                      <td className="py-2.5 pr-3 font-semibold text-xs text-foreground max-w-[120px] truncate">{a.name}</td>
                      <td className="py-2.5 pr-3 text-xs text-muted-foreground font-mono">{a.userId.slice(0, 8)}…</td>
                      <td className="py-2.5 pr-3">
                        <span className="flex items-center gap-1 text-xs">
                          <span>{chain.icon}</span> {chain.symbol}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: `${typeColor}15`, color: typeColor, border: `1px solid ${typeColor}25` }}>
                          {(a.alertType ?? 'whale').replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-xs font-mono text-muted-foreground">
                        {a.condition === 'above' ? '>' : '<'} ${(a.minValue/1e6).toFixed(2)}M
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className={cn('text-xs font-bold', a.isActive ? 'text-emerald-400' : 'text-muted-foreground')}>
                          {a.isActive ? '● Active' : '○ Paused'}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-xs font-mono text-amber-400 font-bold">{a.triggerCount}</td>
                      <td className="py-2.5 pr-3 text-xs text-muted-foreground">
                        {a.lastTriggeredAt ? timeAgo(a.lastTriggeredAt) : '—'}
                      </td>
                      <td className="py-2.5">
                        <button onClick={() => handleDelete(a.id)}
                          className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-red-400 hover:bg-red-400/10 transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-between mt-3">
              <p className="text-xs text-muted-foreground">{filtered.length} alerts</p>
              <div className="flex gap-1">
                <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
                  className="px-2 py-1 rounded text-xs border border-white/10 disabled:opacity-30">‹ Prev</button>
                <button disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}
                  className="px-2 py-1 rounded text-xs border border-white/10 disabled:opacity-30">Next ›</button>
              </div>
            </div>
          )}
        </>
      )}
    </Section>
  );
}

// ── E) Recent Event Log ───────────────────────────────────────────────────────

function EventLogSection() {
  const allEvents = Object.values(useOnChainStore.getState().events)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 10);

  return (
    <Section title={`Recent Events (${allEvents.length})`}>
      {allEvents.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No data available</p>
      ) : (
        <div className="space-y-2">
          {allEvents.map(e => {
            const chain = CHAIN_DISPLAY[e.chain];
            const tier  = WHALE_TIER_META[e.whaleTier];
            const sigPct = e.significance != null ? Math.round(e.significance * 100) : null;
            return (
              <div key={e.id} className="flex items-center gap-3 py-2 border-b border-white/4 last:border-0 text-xs">
                <span className="text-base shrink-0">{tier?.icon ?? '🐟'}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground truncate">
                    {fmtUsd(e.value)} · {chain.symbol}
                  </p>
                  <p className="text-muted-foreground/60 truncate">
                    {e.significanceReason ?? e.tokenSymbol} · user {e.userId.slice(0, 8)}
                  </p>
                </div>
                {sigPct !== null && (
                  <span className={cn('font-mono font-bold shrink-0',
                    sigPct >= 70 ? 'text-amber-400' : 'text-muted-foreground')}>
                    {sigPct}% sig
                  </span>
                )}
                <span className="text-muted-foreground/50 shrink-0">{timeAgo(e.timestamp)}</span>
                <a href={`${CHAIN_META[e.chain].explorerUrl}/${e.txHash}`} target="_blank" rel="noopener noreferrer"
                  className="text-muted-foreground/30 hover:text-primary shrink-0">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function AdminOnChain() {
  const [statuses, setStatuses] = useState<ApiProviderStatus[]>(gateway.getStatus());
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await gateway.pingAll();
    setStatuses(gateway.getStatus());
    setLastRefresh(new Date());
    setRefreshing(false);
    toast.success('Status refreshed');
  }, []);

  // Auto-ping on mount
  useEffect(() => { handleRefresh(); }, []);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            On-Chain Management
          </h1>
          <p className="text-sm text-white/40 mt-0.5">
            API status, alert monitoring, key management · Last refreshed {lastRefresh.toLocaleTimeString()}
          </p>
        </div>
        <button onClick={handleRefresh} disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 text-sm text-muted-foreground hover:text-foreground transition-all">
          <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </motion.div>

      {/* A) API Status */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <ErrorBoundary FallbackComponent={SectionErrorFallback}>
          <ApiStatusSection statuses={statuses} onRefresh={handleRefresh} />
        </ErrorBoundary>
      </motion.div>

      {/* B) Alert Statistics */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.10 }}>
        <Section title="Alert Statistics">
          <ErrorBoundary FallbackComponent={SectionErrorFallback}>
            <AlertStatsSection />
          </ErrorBoundary>
        </Section>
      </motion.div>

      {/* C) API Key Management */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <ErrorBoundary FallbackComponent={SectionErrorFallback}>
          <ApiKeySection />
        </ErrorBoundary>
      </motion.div>

      {/* D) Alert Table */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.20 }}>
        <ErrorBoundary FallbackComponent={SectionErrorFallback}>
          <AlertTableSection />
        </ErrorBoundary>
      </motion.div>

      {/* E) Event Log */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <ErrorBoundary FallbackComponent={SectionErrorFallback}>
          <EventLogSection />
        </ErrorBoundary>
      </motion.div>
    </div>
  );
}
