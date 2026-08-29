/**
 * ExchangeDeployPage.tsx
 * Route: /exchange/deploy
 * Spec §3.3 — Strategy selector, exchange picker, deployment settings, risk confirmation
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Rocket, CheckCircle, AlertTriangle, Loader2,
  Bot, TrendingUp, BarChart3, Clock, DollarSign,
  Shield, X, ChevronRight,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useExchangeStore } from '../../lib/exchangeStore';
import { useAcademyStore } from '../../lib/academyStore';
import { ExchangeConnection, EXCHANGE_META, TradingMode } from '../../lib/exchangeTypes';
import { toast } from 'sonner';

// ── Strategies catalog ─────────────────────────────────────────────────────────

interface Strategy {
  id:       string;
  name:     string;
  type:     string;
  winRate:  number;
  testedOn: string;
  roi:      number;
  maxDD:    number;
  trades:   number;
  riskLevel:'low' | 'medium' | 'high';
}

const STRATEGIES: Strategy[] = [
  { id: 's1', name: 'RSI Mean Reversion',    type: 'Mean Reversion', winRate: 68, testedOn: '1 year',   roi: 18.4, maxDD: 6.2,  trades: 312, riskLevel: 'medium' },
  { id: 's2', name: 'MACD Crossover',         type: 'Trend Following', winRate: 72, testedOn: '6 months', roi: 24.7, maxDD: 9.1,  trades: 147, riskLevel: 'medium' },
  { id: 's3', name: 'Smart DCA',              type: 'DCA',             winRate: 71, testedOn: '3 months', roi: 11.2, maxDD: 2.8,  trades: 89,  riskLevel: 'low'    },
  { id: 's4', name: 'BTC Momentum Pro',       type: 'Momentum',        winRate: 67, testedOn: '8 months', roi: 31.5, maxDD: 14.3, trades: 204, riskLevel: 'high'   },
  { id: 's5', name: 'Multi-Asset Grid',       type: 'Grid',            winRate: 56, testedOn: '1 year',   roi: 42.1, maxDD: 18.0, trades: 891, riskLevel: 'high'   },
  { id: 's6', name: 'Conservative Scalper',  type: 'Scalping',         winRate: 80, testedOn: '4 months', roi: 7.3,  maxDD: 1.5,  trades: 1204,riskLevel: 'low'    },
];

const RISK_STYLE = {
  low:    'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  medium: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  high:   'text-red-400 bg-red-500/10 border-red-500/20',
};

const PAIRS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT', 'AVAX/USDT'];

function fmtUSD(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

// ── Strategy Card ──────────────────────────────────────────────────────────────

function StrategyCard({ s, selected, onSelect }: { s: Strategy; selected: boolean; onSelect: () => void }) {
  return (
    <button onClick={onSelect}
      className={cn('w-full flex items-start gap-3 p-4 rounded-xl border text-left transition-all',
        selected
          ? 'border-primary/40 bg-primary/8'
          : 'border-white/6 bg-white/[0.02] hover:border-white/15',
      )}>
      <div className={cn('w-4 h-4 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center',
        selected ? 'border-primary' : 'border-white/20',
      )}>
        {selected && <span className="w-2 h-2 rounded-full bg-primary" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-black text-white">{s.name}</span>
          <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full border font-bold capitalize', RISK_STYLE[s.riskLevel])}>
            {s.riskLevel} risk
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5">{s.type} · tested on {s.testedOn} data</p>
        <div className="flex gap-3 mt-2">
          <span className="text-[11px] text-white/50">WR: <span className="text-emerald-400 font-bold">{s.winRate}%</span></span>
          <span className="text-[11px] text-white/50">ROI: <span className="text-emerald-400 font-bold">+{s.roi}%</span></span>
          <span className="text-[11px] text-white/50">DD: <span className="text-red-400 font-bold">-{s.maxDD}%</span></span>
          <span className="text-[11px] text-white/30">{s.trades} trades</span>
        </div>
      </div>
    </button>
  );
}

// ── Exchange Picker ────────────────────────────────────────────────────────────

function ExchangePicker({ connections, selected, onSelect }: {
  connections: ExchangeConnection[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  if (connections.length === 0) {
    return (
      <div className="rounded-xl border border-white/8 px-4 py-4 text-center text-xs text-muted-foreground">
        No exchanges connected. <span className="text-primary">Go to Connections tab first.</span>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {connections.map(c => {
        const ex = EXCHANGE_META[c.exchangeId];
        const isSel = selected === c.id;
        return (
          <button key={c.id} onClick={() => onSelect(c.id)}
            className={cn('w-full flex items-center gap-3 p-4 rounded-xl border text-left transition-all',
              isSel ? 'border-primary/40 bg-primary/8' : 'border-white/6 bg-white/[0.02] hover:border-white/15',
            )}>
            <div className={cn('w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center',
              isSel ? 'border-primary' : 'border-white/20',
            )}>
              {isSel && <span className="w-2 h-2 rounded-full bg-primary" />}
            </div>
            <span className="text-xl">{ex.logo}</span>
            <div className="flex-1">
              <p className="text-sm font-black text-white">{ex.name}</p>
              <p className="text-xs text-muted-foreground">{c.label} · Balance: <span className="text-white/60">{fmtUSD(c.balanceUSD)}</span></p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Deployment Settings ────────────────────────────────────────────────────────

function DeploymentSettings({
  maxPos, setMaxPos, maxLoss, setMaxLoss,
  hours, setHours, pairs, setPairs,
}: {
  maxPos: number; setMaxPos: (v: number) => void;
  maxLoss: number; setMaxLoss: (v: number) => void;
  hours: string; setHours: (v: string) => void;
  pairs: string[]; setPairs: (v: string[]) => void;
}) {
  function togglePair(p: string) {
    setPairs(pairs.includes(p) ? pairs.filter(x => x !== p) : [...pairs, p]);
  }

  return (
    <div className="rounded-2xl border border-white/8 p-5 space-y-4"
      style={{ background: 'rgba(255,255,255,0.02)' }}>
      <div className="grid sm:grid-cols-2 gap-4">
        {/* Max position */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-white/40">Max Position Size (per trade)</label>
          <div className="flex items-center rounded-xl border border-white/10 bg-white/5 overflow-hidden">
            <span className="px-3 text-xs text-white/30 border-r border-white/10">$</span>
            <input type="number" value={maxPos} onChange={e => setMaxPos(Number(e.target.value))} min={50} max={100000}
              className="flex-1 bg-transparent px-3 py-2.5 text-sm text-white focus:outline-none font-mono" />
          </div>
        </div>
        {/* Max daily loss */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-white/40">Max Daily Loss (auto-stop if exceeded)</label>
          <div className="flex items-center rounded-xl border border-white/10 bg-white/5 overflow-hidden">
            <span className="px-3 text-xs text-white/30 border-r border-white/10">$</span>
            <input type="number" value={maxLoss} onChange={e => setMaxLoss(Number(e.target.value))} min={10} max={50000}
              className="flex-1 bg-transparent px-3 py-2.5 text-sm text-white focus:outline-none font-mono" />
          </div>
        </div>
      </div>

      {/* Trading hours */}
      <div className="space-y-1.5">
        <label className="text-xs font-bold text-white/40">Trading Hours (UTC)</label>
        <div className="flex items-center gap-3">
          <button onClick={() => setHours('00:00 - 23:59')}
            className={cn('px-3 py-1.5 rounded-lg text-xs font-bold border transition-all',
              hours === '00:00 - 23:59' ? 'bg-primary/15 border-primary/40 text-primary' : 'border-white/8 text-white/40 hover:border-white/20',
            )}>24/7</button>
          {['06:00 - 22:00', '09:00 - 18:00'].map(h => (
            <button key={h} onClick={() => setHours(h)}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-bold border transition-all',
                hours === h ? 'bg-primary/15 border-primary/40 text-primary' : 'border-white/8 text-white/40 hover:border-white/20',
              )}>{h}</button>
          ))}
          <span className="text-xs text-white/30">or custom</span>
        </div>
        <p className="text-[10px] text-white/25">Current: {hours}</p>
      </div>

      {/* Pairs */}
      <div className="space-y-1.5">
        <label className="text-xs font-bold text-white/40">Pairs to Trade</label>
        <div className="flex flex-wrap gap-2">
          {PAIRS.map(p => (
            <button key={p} onClick={() => togglePair(p)}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-bold border transition-all',
                pairs.includes(p) ? 'bg-primary/15 border-primary/40 text-primary' : 'border-white/8 text-white/40 hover:border-white/20',
              )}>
              {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Risk Confirmation ──────────────────────────────────────────────────────────

const RISK_CHECKS = [
  'I understand that automated trading involves real financial risk',
  'I have backtested this strategy successfully with realistic conditions',
  'I will monitor the bot regularly and intervene if needed',
  'I accept full responsibility for any losses resulting from this deployment',
];

// ── Success State ──────────────────────────────────────────────────────────────

function SuccessState({ stratName, exchangeName, maxPos, onReset, onViewStrategies }: {
  stratName: string; exchangeName: string; maxPos: number;
  onReset: () => void; onViewStrategies: () => void;
}) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
      className="text-center py-12 space-y-5">
      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.15, type: 'spring', stiffness: 200 }}
        className="w-20 h-20 mx-auto rounded-3xl bg-primary/15 border border-primary/30 flex items-center justify-center text-4xl">
        🚀
      </motion.div>
      <div>
        <h3 className="text-lg font-black text-white">Strategy Deployed!</h3>
        <p className="text-sm text-muted-foreground mt-1">
          <span className="text-white font-bold">{stratName}</span> is now running live on{' '}
          <span className="text-white font-bold">{exchangeName}</span> with ${maxPos.toLocaleString()} per trade.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto text-left">
        {['Running on real funds', 'Risk controls active', 'Kill switch armed', 'Monitoring trade history'].map(f => (
          <div key={f} className="flex items-center gap-2 text-xs text-white/50">
            <CheckCircle className="h-3.5 w-3.5 text-emerald-400 shrink-0" /> {f}
          </div>
        ))}
      </div>
      <div className="flex gap-3 justify-center">
        <button onClick={onViewStrategies}
          className="px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-black hover:brightness-110 transition-all">
          View Deployed Strategies
        </button>
        <button onClick={onReset}
          className="px-5 py-2.5 rounded-xl bg-white/6 text-white/60 text-sm font-bold hover:bg-white/10 transition-all">
          Deploy Another
        </button>
      </div>
    </motion.div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export function ExchangeDeployPage({ onViewStrategies }: { onViewStrategies: () => void }) {
  const { connections, deployStrategy } = useExchangeStore();
  const { totalXP } = useAcademyStore();
  const userLevel = Math.max(1, Math.floor(totalXP / 500));

  const [selectedStrat,  setSelectedStrat]  = useState<Strategy | null>(null);
  const [selectedConnId, setSelectedConnId] = useState<string | null>(connections[0]?.id ?? null);
  const [maxPos,         setMaxPos]         = useState(500);
  const [maxLoss,        setMaxLoss]        = useState(200);
  const [hours,          setHours]          = useState('00:00 - 23:59');
  const [pairs,          setPairs]          = useState<string[]>(['BTC/USDT', 'ETH/USDT']);
  const [checks,         setChecks]         = useState<boolean[]>(RISK_CHECKS.map(() => false));
  const [deploying,      setDeploying]      = useState(false);
  const [deployed,       setDeployed]       = useState(false);
  const [deployError,    setDeployError]    = useState('');
  const [deployStatus,   setDeployStatus]   = useState('');

  const allChecked = checks.every(Boolean);

  function toggleCheck(i: number) {
    setChecks(c => c.map((v, idx) => idx === i ? !v : v));
  }

  async function handleDeploy() {
    if (!selectedStrat)  { toast.error('Select a strategy');   return; }
    if (!selectedConnId) { toast.error('Select an exchange');   return; }
    if (pairs.length === 0) { toast.error('Select at least one trading pair'); return; }
    if (!allChecked)     { toast.error('Acknowledge all risk confirmations'); return; }

    const conn = connections.find(c => c.id === selectedConnId);
    if (!conn) return;

    setDeploying(true);
    setDeployError('');
    setDeployStatus('Running safety checks…');

    const result = await deployStrategy({
      connectionId:  selectedConnId,
      strategyId:    selectedStrat.id,
      strategyName:  selectedStrat.name,
      strategyInfo: {
        isBacktested:   true,
        winRate:        selectedStrat.winRate,
        backtestMonths: parseInt(selectedStrat.testedOn.split(' ')[0]) || 3,
        maxDrawdown:    selectedStrat.maxDD,
        riskLevel:      selectedStrat.riskLevel,
      },
      symbol:        pairs[0],
      mode:          'spot',
      allocatedUSD:  maxPos * 5,
      userLevel,
      pairs,
      maxDailyLoss:  maxLoss,
    });

    setDeploying(false);
    setDeployStatus('');

    if (result.success) {
      setDeployed(true);
    } else {
      setDeployError(result.error ?? 'Deployment failed');
      toast.error(result.error ?? 'Deployment failed');
    }
  }

  function resetForm() {
    setSelectedStrat(null); setSelectedConnId(connections[0]?.id ?? null);
    setMaxPos(500); setMaxLoss(200); setHours('00:00 - 23:59');
    setPairs(['BTC/USDT', 'ETH/USDT']); setChecks(RISK_CHECKS.map(() => false));
    setDeployed(false);
  }

  const selectedConn = connections.find(c => c.id === selectedConnId);

  if (deployed && selectedStrat) {
    return (
      <SuccessState
        stratName={selectedStrat.name}
        exchangeName={selectedConn ? EXCHANGE_META[selectedConn.exchangeId].name : ''}
        maxPos={maxPos}
        onReset={resetForm}
        onViewStrategies={onViewStrategies}
      />
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-black text-white flex items-center gap-2">
          <Rocket className="h-5 w-5 text-primary" /> Deploy Strategy to Real Exchange
        </h2>
      </div>

      {/* Select Strategy */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <p className="text-xs font-black text-white/40 uppercase tracking-wider">Select Strategy</p>
          <div className="flex-1 h-px bg-white/5" />
        </div>
        <div className="space-y-2">
          <p className="text-[10px] text-white/25 px-1">Your Strategies:</p>
          {STRATEGIES.map(s => (
            <StrategyCard key={s.id} s={s} selected={selectedStrat?.id === s.id} onSelect={() => setSelectedStrat(s)} />
          ))}
        </div>
      </div>

      {/* Select Exchange */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <p className="text-xs font-black text-white/40 uppercase tracking-wider">Select Exchange</p>
          <div className="flex-1 h-px bg-white/5" />
        </div>
        <ExchangePicker connections={connections} selected={selectedConnId} onSelect={setSelectedConnId} />
      </div>

      {/* Deployment Settings */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <p className="text-xs font-black text-white/40 uppercase tracking-wider">Deployment Settings</p>
          <div className="flex-1 h-px bg-white/5" />
        </div>
        <DeploymentSettings maxPos={maxPos} setMaxPos={setMaxPos} maxLoss={maxLoss} setMaxLoss={setMaxLoss}
          hours={hours} setHours={setHours} pairs={pairs} setPairs={setPairs} />
      </div>

      {/* Risk Confirmation */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <p className="text-xs font-black text-white/40 uppercase tracking-wider">Risk Confirmation</p>
          <div className="flex-1 h-px bg-white/5" />
        </div>
        <div className="rounded-2xl border border-white/8 px-5 py-4 space-y-3"
          style={{ background: 'rgba(255,255,255,0.02)' }}>
          {RISK_CHECKS.map((text, i) => (
            <label key={i} className="flex items-start gap-3 cursor-pointer" onClick={() => toggleCheck(i)}>
              <div className={cn('w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all',
                checks[i] ? 'bg-primary border-primary' : 'border-white/20 hover:border-white/40',
              )}>
                {checks[i] && <CheckCircle className="h-3.5 w-3.5 text-white" />}
              </div>
              <p className="text-xs text-white/60">{text}</p>
            </label>
          ))}
        </div>
      </div>

      {/* Deploy error */}
      {deployError && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-red-500/8 border border-red-500/15 text-xs text-red-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{deployError}</span>
        </div>
      )}

      {/* Deploy / Cancel */}
      <div className="flex gap-3 pb-4">
        <button onClick={handleDeploy} disabled={deploying}
          className={cn('flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-sm transition-all',
            deploying ? 'bg-white/10 text-white/30 cursor-not-allowed' : 'bg-primary text-white hover:brightness-110',
          )}>
          {deploying ? <><Loader2 className="h-4 w-4 animate-spin" /> Deploying…</> : <><Rocket className="h-4 w-4" /> Deploy Strategy</>}
        </button>
        <button onClick={resetForm}
          className="px-6 py-3.5 rounded-2xl bg-white/5 text-white/50 font-bold text-sm hover:bg-white/10 transition-all">
          Cancel
        </button>
      </div>
    </div>
  );
}
