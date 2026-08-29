/**
 * ExchangeDashboard.tsx — Main hub for the Real Exchange Connection feature
 * Tabs: Overview | Positions | Trade History | Deployed Strategies | Risk Controls
 */
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, RefreshCw, Settings, Trash2, Pause, Play,
  TrendingUp, TrendingDown, DollarSign, Zap, Shield,
  Wifi, WifiOff, ChevronDown, MoreVertical, Rocket,
  BarChart3, Clock, Bot, AlertTriangle, CheckCircle,
  ExternalLink,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useExchangeStore, startExchangeTicker, stopExchangeTicker } from '../../lib/exchangeStore';
import { ExchangeConnection, EXCHANGE_META } from '../../lib/exchangeTypes';
import { RiskControlsPanel } from './RiskControlsPanel';
import { RealTradeHistory } from './RealTradeHistory';
import { DeployStrategyModal } from './DeployStrategyModal';
import { toast } from 'sonner';

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtUSD(n: number, dp = 2): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: dp }).format(n);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function pctColor(n: number): string {
  return n >= 0 ? 'text-emerald-400' : 'text-red-400';
}

// ── Connection selector ────────────────────────────────────────────────────────

function ConnectionSelector({
  connections, active, onSelect, onAdd,
}: {
  connections: ExchangeConnection[];
  active: ExchangeConnection | undefined;
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button onClick={() => setOpen(v => !v)}
        className="flex items-center gap-3 px-4 py-2.5 rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.05] transition-colors min-w-48">
        {active ? (
          <>
            <span className="text-xl">{EXCHANGE_META[active.exchangeId].logo}</span>
            <div className="flex-1 text-left min-w-0">
              <p className="text-xs font-black text-white truncate">{active.label}</p>
              <p className="text-[10px] text-muted-foreground">{EXCHANGE_META[active.exchangeId].name}</p>
            </div>
            <div className={cn('w-2 h-2 rounded-full shrink-0',
              active.status === 'connected' ? 'bg-emerald-400' : 'bg-red-400',
            )} />
          </>
        ) : (
          <span className="text-xs text-white/40 flex-1">No exchange selected</span>
        )}
        <ChevronDown className="h-3.5 w-3.5 text-white/30 shrink-0" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
            className="absolute top-full mt-2 left-0 w-64 rounded-2xl border border-white/10 overflow-hidden z-30"
            style={{ background: 'rgba(12,12,18,0.98)' }}
            onMouseLeave={() => setOpen(false)}>
            {connections.map(c => {
              const ex = EXCHANGE_META[c.exchangeId];
              return (
                <button key={c.id} onClick={() => { onSelect(c.id); setOpen(false); }}
                  className={cn('w-full flex items-center gap-3 px-4 py-3 transition-colors text-left hover:bg-white/5',
                    c.id === active?.id && 'bg-primary/8',
                  )}>
                  <span className="text-lg">{ex.logo}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white truncate">{c.label}</p>
                    <p className="text-[10px] text-white/30">{ex.name} · {fmtUSD(c.balanceUSD, 0)}</p>
                  </div>
                  <div className={cn('w-2 h-2 rounded-full shrink-0',
                    c.status === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-red-400',
                  )} />
                </button>
              );
            })}
            <div className="border-t border-white/5">
              <button onClick={() => { onAdd(); setOpen(false); }}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-xs font-bold text-primary hover:bg-primary/5 transition-colors">
                <Plus className="h-3.5 w-3.5" /> Add Exchange
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Portfolio card ─────────────────────────────────────────────────────────────

function PortfolioOverview({ connectionId }: { connectionId: string }) {
  const { getPortfolio } = useExchangeStore();
  const portfolio = getPortfolio(connectionId);
  if (!portfolio) return null;

  const { assets, totalUSD, dailyPnL, dailyPnLPct, weeklyPnL, monthlyPnL } = portfolio;
  const pnlPos = dailyPnL >= 0;

  return (
    <div className="space-y-4">
      {/* Total balance */}
      <div className="rounded-3xl p-6 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(99,102,241,0.03) 100%)', border: '1px solid rgba(99,102,241,0.2)' }}>
        <div className="absolute top-0 right-0 w-40 h-40 rounded-full opacity-10 blur-3xl bg-primary" />
        <p className="text-xs font-bold text-white/40 uppercase tracking-wider">Total Portfolio Value</p>
        <p className="text-4xl font-black text-white mt-1">{fmtUSD(totalUSD)}</p>
        <div className="flex items-center gap-3 mt-2">
          <span className={cn('text-sm font-black', pnlPos ? 'text-emerald-400' : 'text-red-400')}>
            {pnlPos ? '+' : ''}{fmtUSD(dailyPnL)} ({pnlPos ? '+' : ''}{dailyPnLPct.toFixed(2)}%)
          </span>
          <span className="text-xs text-white/30">Today</span>
        </div>

        {/* Period PnLs */}
        <div className="flex gap-5 mt-4 pt-4 border-t border-white/8">
          {[
            { label: '7D P&L',   v: weeklyPnL  },
            { label: '30D P&L',  v: monthlyPnL },
          ].map(p => (
            <div key={p.label}>
              <p className="text-[10px] text-white/30">{p.label}</p>
              <p className={cn('text-sm font-black', p.v >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                {p.v >= 0 ? '+' : ''}{fmtUSD(p.v)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Asset breakdown */}
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="px-4 py-3 border-b border-white/5">
          <p className="text-xs font-black text-white/40 uppercase tracking-wider">Asset Breakdown</p>
        </div>
        {assets.map((a, i) => (
          <div key={a.symbol} className={cn('flex items-center gap-4 px-4 py-3 text-sm', i > 0 && 'border-t border-white/4')}>
            <div className="w-8 h-8 rounded-full bg-white/6 flex items-center justify-center text-base shrink-0">
              {a.logoEmoji}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="font-black text-white text-xs">{a.symbol}</span>
                <span className="font-black text-white text-xs">{fmtUSD(a.valueUSD)}</span>
              </div>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-[10px] text-white/30">{a.quantity.toLocaleString()} · {a.allocation.toFixed(1)}%</span>
                <span className={cn('text-[10px] font-bold', a.pnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {a.pnl >= 0 ? '+' : ''}{fmtUSD(a.pnl)} ({a.pnlPct >= 0 ? '+' : ''}{a.pnlPct.toFixed(1)}%)
                </span>
              </div>
              {/* Bar */}
              <div className="mt-1.5 h-1 rounded-full bg-white/5 overflow-hidden">
                <div className="h-full rounded-full bg-primary/50" style={{ width: `${a.allocation}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Deployed strategies panel ──────────────────────────────────────────────────

function DeployedStrategies({
  connectionId, connection, onDeploy,
}: { connectionId: string; connection: ExchangeConnection; onDeploy: () => void }) {
  const { getDeployedStrategies, toggleDeployedStrategy, removeDeployedStrategy } = useExchangeStore();
  const strategies = getDeployedStrategies(connectionId);

  const deployStatusColor: Record<string, string> = {
    running: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    paused:  'text-amber-400 bg-amber-500/10 border-amber-500/20',
    stopped: 'text-white/30 bg-white/5 border-white/10',
    error:   'text-red-400 bg-red-500/10 border-red-500/20',
  };

  function handleRemove(id: string, name: string) {
    if (confirm(`Stop and remove "${name}"? This will close any open positions.`)) {
      removeDeployedStrategy(id);
      toast.success('Strategy removed');
    }
  }

  return (
    <div className="space-y-4">
      {/* Deploy button */}
      <button onClick={onDeploy}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-dashed border-primary/30 text-primary text-sm font-bold hover:bg-primary/5 transition-colors">
        <Rocket className="h-4 w-4" /> Deploy New Strategy
      </button>

      {strategies.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No strategies deployed yet
        </div>
      ) : (
        <div className="space-y-3">
          {strategies.map(s => {
            const totalPnL = s.realizedPnl + s.unrealizedPnl;
            const pnlPos   = totalPnL >= 0;
            return (
              <div key={s.id} className="rounded-2xl p-4 space-y-3"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-black text-white">{s.strategyName}</p>
                      <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full border font-bold capitalize', deployStatusColor[s.status])}>
                        {s.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.symbol} · {s.mode} · {fmtDate(s.deployedAt)}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => toggleDeployedStrategy(s.id, s.status === 'running' ? 'paused' : 'running')}
                      className="w-7 h-7 rounded-lg bg-white/6 hover:bg-white/12 flex items-center justify-center transition-colors">
                      {s.status === 'running' ? <Pause className="h-3.5 w-3.5 text-white/60" /> : <Play className="h-3.5 w-3.5 text-emerald-400" />}
                    </button>
                    <button onClick={() => handleRemove(s.id, s.strategyName)}
                      className="w-7 h-7 rounded-lg bg-white/6 hover:bg-red-500/15 flex items-center justify-center transition-colors">
                      <Trash2 className="h-3.5 w-3.5 text-white/40 hover:text-red-400" />
                    </button>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Allocated',     v: fmtUSD(s.allocatedUSD),      color: 'text-white'       },
                    { label: 'Current Value', v: fmtUSD(s.currentValueUSD),   color: 'text-white'       },
                    { label: 'Total P&L',     v: `${pnlPos ? '+' : ''}${fmtUSD(totalPnL)}`, color: pnlPos ? 'text-emerald-400' : 'text-red-400' },
                    { label: 'Unrealized',    v: `${s.unrealizedPnl >= 0 ? '+' : ''}${fmtUSD(s.unrealizedPnl)}`, color: s.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400' },
                  ].map(stat => (
                    <div key={stat.label}>
                      <p className="text-[10px] text-white/30">{stat.label}</p>
                      <p className={cn('text-xs font-black mt-0.5', stat.color)}>{stat.v}</p>
                    </div>
                  ))}
                </div>

                {/* Progress bar: unrealized vs allocated */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-white/20">
                    <span>Performance vs allocation</span>
                    <span>{((s.currentValueUSD / s.allocatedUSD - 1) * 100).toFixed(2)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div className={cn('h-full rounded-full transition-all', s.currentValueUSD >= s.allocatedUSD ? 'bg-emerald-500' : 'bg-red-500')}
                      style={{ width: `${Math.min(100, Math.abs((s.currentValueUSD / s.allocatedUSD) * 100 - 100) + 50)}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Connection card ────────────────────────────────────────────────────────────

function ConnectionCard({ connection, onDisconnect, onSync }: {
  connection: ExchangeConnection;
  onDisconnect: () => void;
  onSync: () => void;
}) {
  const ex = EXCHANGE_META[connection.exchangeId];
  const isConnected = connection.status === 'connected';

  return (
    <div className="rounded-2xl p-5 space-y-4"
      style={{ background: `linear-gradient(135deg, ${ex.accentGradient.replace('from-', '').replace('via-', '').split(' ')[0]}0A 0%, transparent 100%)`, border: '1px solid rgba(255,255,255,0.08)' }}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
            style={{ background: `${ex.color}15`, border: `1px solid ${ex.color}30` }}>
            {ex.logo}
          </div>
          <div>
            <p className="font-black text-white">{connection.label}</p>
            <p className="text-xs text-muted-foreground">{ex.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border',
            isConnected
              ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
              : 'text-red-400 bg-red-500/10 border-red-500/20',
          )}>
            {isConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {isConnected ? 'Connected' : 'Error'}
          </span>
        </div>
      </div>

      {/* Balances */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl p-3 bg-white/4">
          <p className="text-[10px] text-white/30">Balance (USD)</p>
          <p className="text-sm font-black text-white mt-0.5">{fmtUSD(connection.balanceUSD)}</p>
        </div>
        <div className="rounded-xl p-3 bg-white/4">
          <p className="text-[10px] text-white/30">Balance (BTC)</p>
          <p className="text-sm font-black text-white mt-0.5">₿ {connection.balanceBTC.toFixed(6)}</p>
        </div>
      </div>

      {/* Meta */}
      <div className="flex flex-wrap gap-4 text-xs text-white/30">
        {connection.maskedKey && (
          <span className="flex items-center gap-1.5 font-mono">
            <span className="text-white/20">Key:</span> {connection.maskedKey}
          </span>
        )}
        {connection.lastSyncAt && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Synced {fmtDate(connection.lastSyncAt)}
          </span>
        )}
        {connection.isReadOnly && (
          <span className="text-amber-400/70">📖 Read-only</span>
        )}
      </div>

      {/* Permissions */}
      <div className="flex flex-wrap gap-1.5">
        {connection.permissions.map(p => (
          <span key={p} className="text-[9px] px-2 py-1 rounded-lg bg-white/5 text-white/30 font-bold uppercase">{p}</span>
        ))}
        {connection.modes.map(m => (
          <span key={m} className="text-[9px] px-2 py-1 rounded-lg bg-primary/8 text-primary/60 font-bold uppercase border border-primary/15">{m}</span>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button onClick={onSync}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-white/5 text-white/60 text-xs font-bold hover:bg-white/10 transition-colors">
          <RefreshCw className="h-3.5 w-3.5" /> Sync
        </button>
        <button onClick={onDisconnect}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-red-500/8 text-red-400 text-xs font-bold hover:bg-red-500/15 transition-colors border border-red-500/15">
          <Trash2 className="h-3.5 w-3.5" /> Disconnect
        </button>
      </div>
    </div>
  );
}

// ── Tab config ─────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'trades' | 'strategies' | 'risk' | 'connections';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'overview',     label: 'Overview',    icon: BarChart3     },
  { id: 'trades',       label: 'Trade History', icon: Clock       },
  { id: 'strategies',  label: 'Strategies',  icon: Rocket        },
  { id: 'risk',         label: 'Risk Controls', icon: Shield      },
  { id: 'connections',  label: 'Connections', icon: Wifi          },
];

// ── Main Dashboard ─────────────────────────────────────────────────────────────

export function ExchangeDashboard({ onAddExchange }: { onAddExchange: () => void }) {
  const {
    connections, getActiveConnection, setActiveConnection,
    disconnectExchange, syncExchange, isSyncing, getTotalRealBalance, getTotalRealPnL,
  } = useExchangeStore();

  const [tab,         setTab]         = useState<Tab>('overview');
  const [deployModal, setDeployModal] = useState(false);

  const active = getActiveConnection();

  useEffect(() => {
    startExchangeTicker();
    return () => stopExchangeTicker();
  }, []);

  function handleDisconnect(id: string) {
    if (confirm('Disconnect this exchange? All deployed strategies will be stopped.')) {
      disconnectExchange(id);
      toast.success('Exchange disconnected');
    }
  }

  // If no connections — show empty state
  if (connections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-5 max-w-md mx-auto text-center">
        <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center text-4xl">
          🔗
        </div>
        <div>
          <h2 className="text-xl font-black text-white">No Exchange Connected</h2>
          <p className="text-sm text-muted-foreground mt-2">
            Connect your first real exchange account to start deploying strategies with real funds.
          </p>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {(['binance', 'coinbase', 'kraken', 'okx'] as const).map(id => (
            <div key={id} className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl"
              style={{ background: `${EXCHANGE_META[id].color}12`, border: `1px solid ${EXCHANGE_META[id].color}20` }}>
              {EXCHANGE_META[id].logo}
            </div>
          ))}
        </div>
        <button onClick={onAddExchange}
          className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-primary text-white font-black hover:brightness-110 transition-all">
          <Plus className="h-4 w-4" /> Connect Exchange
        </button>
        <p className="text-xs text-muted-foreground">
          Requires Level 10+ · API keys stored locally · No funds transferred to CryptoVerse HQ
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Top bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        {/* Connection selector */}
        <ConnectionSelector connections={connections} active={active}
          onSelect={setActiveConnection} onAdd={onAddExchange} />

        {/* Global stats */}
        <div className="flex items-center gap-3 ml-auto">
          <div className="hidden sm:flex items-center gap-4 px-4 py-2 rounded-xl bg-white/4 border border-white/8 text-xs">
            <div>
              <span className="text-white/30">Total Value </span>
              <span className="font-black text-white">{fmtUSD(getTotalRealBalance())}</span>
            </div>
            <div className="w-px h-4 bg-white/10" />
            <div>
              <span className="text-white/30">Today's P&L </span>
              <span className={cn('font-black', getTotalRealPnL() >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                {getTotalRealPnL() >= 0 ? '+' : ''}{fmtUSD(getTotalRealPnL())}
              </span>
            </div>
          </div>
          <button onClick={onAddExchange}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:brightness-110 transition-all">
            <Plus className="h-3.5 w-3.5" /> Add Exchange
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto -mb-1 pb-1 gap-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors',
              tab === t.id ? 'bg-primary/15 text-primary' : 'text-white/40 hover:text-white hover:bg-white/5',
            )}>
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}>

          {tab === 'overview' && active && (
            <PortfolioOverview connectionId={active.id} />
          )}

          {tab === 'trades' && active && (
            <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                <p className="text-xs font-black text-white">Trade History</p>
                <p className="text-[10px] text-white/30">Synced from {EXCHANGE_META[active.exchangeId].name}</p>
              </div>
              <RealTradeHistory connectionId={active.id} />
            </div>
          )}

          {tab === 'strategies' && active && (
            <DeployedStrategies connectionId={active.id} connection={active} onDeploy={() => setDeployModal(true)} />
          )}

          {tab === 'risk' && active && (
            <RiskControlsPanel connectionId={active.id} />
          )}

          {tab === 'connections' && (
            <div className="space-y-4">
              {connections.map(c => (
                <ConnectionCard key={c.id} connection={c}
                  onDisconnect={() => handleDisconnect(c.id)}
                  onSync={() => syncExchange(c.id)} />
              ))}
              <button onClick={onAddExchange}
                className="w-full py-3 rounded-2xl border border-dashed border-white/10 text-xs font-bold text-white/30 hover:border-primary/30 hover:text-primary transition-all flex items-center justify-center gap-2">
                <Plus className="h-3.5 w-3.5" /> Connect Another Exchange
              </button>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Deploy strategy modal */}
      <AnimatePresence>
        {deployModal && active && (
          <DeployStrategyModal connection={active} onClose={() => setDeployModal(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}
