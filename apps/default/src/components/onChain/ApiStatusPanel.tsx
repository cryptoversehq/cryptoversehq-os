/**
 * ApiStatusPanel.tsx — Live API Integration Status (§5.1 + §5.2)
 *
 * Displays the connection status of all on-chain API providers:
 *  - Etherscan (Ethereum)
 *  - BscScan (BNB Chain)
 *  - Mempool.space (Bitcoin) — no key required
 *  - Simulator fallbacks (always available)
 *
 * Features:
 *  - Live ping with latency display
 *  - Config key indicator (configured / missing)
 *  - "Test Connection" per provider
 *  - Fee rate widget (real BTC fees, gas prices)
 *  - API key setup guide
 */
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown, ChevronUp, Wifi, WifiOff, AlertTriangle,
  ExternalLink, RefreshCw, Key, CheckCircle, Zap, Clock,
  Copy,
} from 'lucide-react';
import { toast } from 'sonner';
import { gateway, ApiProviderStatus, ChainFeeEstimate } from '../../lib/onChainApiGateway';
import { onChainEnv } from '../../lib/env';
import { CHAIN_DISPLAY } from './onChainUtils';
import { cn } from '@/lib/utils';

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ApiProviderStatus['status'] }) {
  const cfg = {
    connected:    { label: 'Connected',    color: '#34d399', Icon: CheckCircle },
    degraded:     { label: 'Degraded',     color: '#fbbf24', Icon: AlertTriangle },
    offline:      { label: 'Offline',      color: '#ef4444', Icon: WifiOff },
    unconfigured: { label: 'No API Key',   color: '#6b7280', Icon: Key },
  }[status];

  return (
    <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: `${cfg.color}15`, color: cfg.color, border: `1px solid ${cfg.color}30` }}>
      <cfg.Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

// ── Provider row ──────────────────────────────────────────────────────────────

function ProviderRow({ p, onPing }: { p: ApiProviderStatus; onPing: (id: string) => void }) {
  const chain   = CHAIN_DISPLAY[p.chain];
  const isPinging = p.status === 'degraded';

  // API key config links
  const keyLinks: Record<string, string> = {
    etherscan: 'https://etherscan.io/apis',
    bscscan:   'https://bscscan.com/apis',
    mempool:   'https://mempool.space/api',
  };

  const keyVars: Record<string, string> = {
    etherscan: 'VITE_ETHERSCAN_API_KEY',
    bscscan:   'VITE_BSCSCAN_API_KEY',
  };

  return (
    <div className="flex items-center gap-3 py-3 border-b border-white/5 last:border-0">
      {/* Chain icon */}
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-base"
        style={{ background: `${chain?.color ?? '#60a5fa'}15`, border: `1px solid ${chain?.color ?? '#60a5fa'}25` }}>
        {chain?.icon ?? '⛓'}
      </div>

      {/* Name + chain */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-sm text-foreground">{p.name}</p>
          {p.source === 'simulated' && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground">SIM</span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">{chain?.name ?? p.chain}</p>
      </div>

      {/* Latency */}
      {p.latencyMs !== null ? (
        <div className="flex items-center gap-1 text-[11px]">
          <Clock className="h-3 w-3 text-muted-foreground" />
          <span className={cn('font-mono font-bold', p.latencyMs < 300 ? 'text-emerald-400' : p.latencyMs < 800 ? 'text-amber-400' : 'text-red-400')}>
            {p.latencyMs}ms
          </span>
        </div>
      ) : (
        <span className="text-[11px] text-muted-foreground w-12 text-center">—</span>
      )}

      {/* Status */}
      <StatusBadge status={p.status} />

      {/* Actions */}
      {p.source === 'real' && (
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={() => onPing(p.id)}
            disabled={isPinging}
            className="p-1.5 rounded-lg border border-white/10 text-muted-foreground hover:text-foreground transition-colors"
            title="Test connection">
            <RefreshCw className={cn('h-3.5 w-3.5', isPinging && 'animate-spin')} />
          </button>
          {keyLinks[p.id] && (
            <a href={keyLinks[p.id]} target="_blank" rel="noopener noreferrer"
              className="p-1.5 rounded-lg border border-white/10 text-muted-foreground hover:text-primary transition-colors"
              title="Get API key">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ── Fee widget ────────────────────────────────────────────────────────────────

function FeeWidget() {
  const [btcFees, setBtcFees] = useState<ChainFeeEstimate | null>(null);
  const [ethFees, setEthFees] = useState<ChainFeeEstimate | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [btc, eth] = await Promise.all([
      gateway.getFees('bitcoin'),
      gateway.getFees('ethereum'),
    ]);
    setBtcFees(btc);
    setEthFees(eth);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, []);

  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {/* BTC Fees */}
      {btcFees && (
        <div className="rounded-2xl p-4"
          style={{ background: 'rgba(247,147,26,0.06)', border: '1px solid rgba(247,147,26,0.15)' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-amber-400">₿ Bitcoin Fees</p>
            {btcFees.source === 'real'
              ? <span className="text-[10px] text-emerald-400 font-bold">● LIVE</span>
              : <span className="text-[10px] text-muted-foreground font-bold">SIM</span>}
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: 'Fastest', value: btcFees.fast, color: '#ef4444' },
              { label: '~30 min', value: btcFees.medium, color: '#fbbf24' },
              { label: 'Economy', value: btcFees.slow, color: '#34d399' },
            ].map(f => (
              <div key={f.label}>
                <p className="font-black text-base" style={{ color: f.color }}>{f.value}</p>
                <p className="text-[9px] text-muted-foreground">{btcFees.unit}</p>
                <p className="text-[9px] text-muted-foreground">{f.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ETH Gas */}
      {ethFees && (
        <div className="rounded-2xl p-4"
          style={{ background: 'rgba(98,126,234,0.06)', border: '1px solid rgba(98,126,234,0.15)' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold" style={{ color: '#627eea' }}>Ξ Ethereum Gas</p>
            {ethFees.source === 'real'
              ? <span className="text-[10px] text-emerald-400 font-bold">● LIVE</span>
              : <span className="text-[10px] text-muted-foreground font-bold">SIM</span>}
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: 'Fast', value: ethFees.fast, color: '#ef4444' },
              { label: 'Avg',  value: ethFees.medium, color: '#fbbf24' },
              { label: 'Slow', value: ethFees.slow, color: '#34d399' },
            ].map(f => (
              <div key={f.label}>
                <p className="font-black text-base" style={{ color: f.color }}>{f.value}</p>
                <p className="text-[9px] text-muted-foreground">{ethFees.unit}</p>
                <p className="text-[9px] text-muted-foreground">{f.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── API Key setup guide ───────────────────────────────────────────────────────

function ApiKeyGuide() {
  const vars = [
    { key: 'VITE_ETHERSCAN_API_KEY',   label: 'Etherscan',      link: 'https://etherscan.io/apis',   free: true },
    { key: 'VITE_BSCSCAN_API_KEY',     label: 'BscScan',        link: 'https://bscscan.com/apis',    free: true },
    { key: 'VITE_POLYGONSCAN_API_KEY', label: 'Polygonscan',    link: 'https://polygonscan.com/apis', free: true },
    { key: 'VITE_ARBISCAN_API_KEY',    label: 'Arbiscan',       link: 'https://arbiscan.io/apis',    free: true },
    { key: 'VITE_SOLANA_RPC_URL',      label: 'Solana RPC',     link: 'https://helius.dev',          free: false },
  ];

  const hasAny = onChainEnv.hasAnyKey;

  return (
    <div className="rounded-2xl p-4"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="flex items-center gap-2 mb-3">
        <Key className="h-4 w-4 text-primary" />
        <p className="text-xs font-bold text-foreground">API Key Setup</p>
        {!hasAny && (
          <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20">
            Running in simulation mode
          </span>
        )}
      </div>

      <p className="text-xs text-muted-foreground mb-3">
        Add API keys to your <code className="bg-white/5 px-1 rounded text-foreground">.env</code> file to enable real blockchain data.
        Bitcoin via <strong>Mempool.space</strong> is always free — no key needed.
      </p>

      <div className="space-y-2">
        {vars.map(v => (
          <div key={v.key} className="flex items-center gap-3 text-xs">
            <code className="flex-1 font-mono text-muted-foreground bg-white/4 px-2 py-1 rounded truncate">{v.key}</code>
            {v.free && <span className="text-[10px] text-emerald-400 font-bold shrink-0">FREE</span>}
            <a href={v.link} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-primary hover:underline shrink-0">
              Get key <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        ))}
      </div>

      <div className="mt-3 p-3 rounded-xl bg-white/3 font-mono text-[11px] text-muted-foreground">
        <p className="text-foreground font-bold mb-1"># .env (project root)</p>
        {vars.slice(0, 3).map(v => (
          <p key={v.key}>{v.key}=<span className="text-primary">your_key_here</span></p>
        ))}
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function ApiStatusPanel() {
  const [open, setOpen]       = useState(false);
  const [statuses, setStatuses] = useState<ApiProviderStatus[]>(gateway.getStatus());
  const [pinging, setPinging]  = useState<Set<string>>(new Set());

  const refresh = useCallback(() => setStatuses(gateway.getStatus()), []);

  // Auto-ping once on mount — previously this only ran when the user
  // manually expanded the panel, so the one provider that needs no API key
  // at all (Mempool.space for Bitcoin) never got checked unless someone
  // happened to open this collapsed section. Now it checks itself silently
  // in the background so the "LIVE" badge is accurate from first paint.
  useEffect(() => {
    pingAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-ping whenever the panel is opened, so status is fresh if it's been a while.
  useEffect(() => {
    if (!open) return;
    pingAll();
  }, [open]);

  async function pingAll() {
    setPinging(new Set(['etherscan', 'bscscan', 'mempool']));
    await gateway.pingAll();
    setStatuses(gateway.getStatus());
    setPinging(new Set());
  }

  async function pingOne(id: string) {
    setPinging(prev => new Set([...prev, id]));
    if (id === 'etherscan') await gateway.pingEtherscan();
    if (id === 'bscscan')   await gateway.pingBscscan();
    if (id === 'mempool')   await gateway.pingMempool();
    setStatuses(gateway.getStatus());
    setPinging(prev => { const n = new Set(prev); n.delete(id); return n; });
    toast.success(`${id} ping complete`);
  }

  const realStatuses = statuses.filter(s => s.source === 'real');
  const simStatuses  = statuses.filter(s => s.source === 'simulated');
  const connectedReal = realStatuses.filter(s => s.status === 'connected').length;

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>

      {/* Toggle header */}
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/2 transition-colors">
        <div className="flex items-center gap-3">
          {connectedReal > 0
            ? <Wifi className="h-4 w-4 text-emerald-400" />
            : <WifiOff className="h-4 w-4 text-amber-400" />}
          <span className="font-bold text-sm">API Integrations</span>
          <span className="text-xs text-muted-foreground">§5.1 Etherscan · §5.2 Mempool.space</span>
          <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border',
            connectedReal > 0
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
              : 'bg-amber-500/10 text-amber-400 border-amber-500/25')}>
            {connectedReal > 0 ? `${connectedReal} live` : 'Simulation mode'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={e => { e.stopPropagation(); pingAll(); }}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="px-5 pb-5 space-y-5">

              {/* Real providers */}
              <div className="rounded-2xl overflow-hidden"
                style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="px-4 py-2.5 border-b border-white/5"
                  style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Real API Providers
                  </p>
                </div>
                <div className="px-4">
                  {realStatuses.map(p => (
                    <ProviderRow key={p.id} p={p} onPing={pingOne} />
                  ))}
                </div>
              </div>

              {/* Live fee rates */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  Live Fee Rates
                </p>
                <FeeWidget />
              </div>

              {/* Simulator providers */}
              <div className="rounded-2xl overflow-hidden"
                style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="px-4 py-2.5 border-b border-white/5"
                  style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Simulator Fallbacks (always active)
                  </p>
                </div>
                <div className="px-4">
                  {simStatuses.map(p => (
                    <ProviderRow key={p.id} p={p} onPing={pingOne} />
                  ))}
                </div>
              </div>

              {/* API key setup guide */}
              <ApiKeyGuide />

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
