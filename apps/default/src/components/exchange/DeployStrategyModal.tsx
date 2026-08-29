/**
 * DeployStrategyModal.tsx — Deploy a tested strategy to a real exchange
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  X, Rocket, AlertTriangle, CheckCircle, Loader2,
  Shield, TrendingUp, DollarSign, ChevronRight, Info,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useExchangeStore } from '../../lib/exchangeStore';
import { useAcademyStore } from '../../lib/academyStore';
import { ExchangeConnection, TradingMode, EXCHANGE_META } from '../../lib/exchangeTypes';
import { toast } from 'sonner';

// ── Mock strategy catalog (would come from marketplaceStore in real app) ───────

interface MockStrategy {
  id:       string;
  name:     string;
  author:   string;
  symbol:   string;
  winRate:  number;
  roi3m:    number;
  maxDD:    number;
  trades:   number;
  modes:    TradingMode[];
  isBacktested: boolean;
  riskLevel: 'low' | 'medium' | 'high';
}

const MOCK_STRATEGIES: MockStrategy[] = [
  { id: 's1', name: 'BTC Momentum Pro',       author: 'AlphaTrader',  symbol: 'BTC/USDT', winRate: 67.2, roi3m: 22.4, maxDD: 8.2,  trades: 142, modes: ['spot', 'futures'], isBacktested: true, riskLevel: 'medium' },
  { id: 's2', name: 'ETH Mean Reversion',     author: 'QuantKing',    symbol: 'ETH/USDT', winRate: 71.5, roi3m: 18.7, maxDD: 5.4,  trades: 89,  modes: ['spot'],           isBacktested: true, riskLevel: 'low'    },
  { id: 's3', name: 'Multi-Asset Grid Bot',   author: 'GridMaster',   symbol: 'BTC/USDT', winRate: 55.8, roi3m: 31.2, maxDD: 14.5, trades: 386, modes: ['spot', 'margin'],  isBacktested: true, riskLevel: 'high'   },
  { id: 's4', name: 'SOL Breakout Scanner',   author: 'CryptoWave',   symbol: 'SOL/USDT', winRate: 63.1, roi3m: 27.8, maxDD: 11.0, trades: 67,  modes: ['spot', 'futures'], isBacktested: true, riskLevel: 'medium' },
  { id: 's5', name: 'Conservative DCA',       author: 'SafeHands',    symbol: 'BTC/USDT', winRate: 80.3, roi3m: 9.1,  maxDD: 2.1,  trades: 210, modes: ['spot'],           isBacktested: true, riskLevel: 'low'    },
];

const RISK_COLOR = { low: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', medium: 'text-amber-400 bg-amber-500/10 border-amber-500/20', high: 'text-red-400 bg-red-500/10 border-red-500/20' };

interface Props {
  connection: ExchangeConnection;
  onClose: () => void;
}

export function DeployStrategyModal({ connection, onClose }: Props) {
  const { deployStrategy } = useExchangeStore();
  const { totalXP } = useAcademyStore();
  const userLevel = Math.max(1, Math.floor(totalXP / 500));
  const exMeta = EXCHANGE_META[connection.exchangeId];

  const [selected,    setSelected]    = useState<MockStrategy | null>(null);
  const [selectedMode,setSelectedMode]= useState<TradingMode>('spot');
  const [allocation,  setAllocation]  = useState(500);
  const [agreed,      setAgreed]      = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [deployed,    setDeployed]    = useState(false);

  // Filter strategies by what this exchange supports
  const compatible = MOCK_STRATEGIES.filter(s =>
    s.modes.some(m => connection.modes.includes(m)),
  );

  async function handleDeploy() {
    if (!selected || !agreed) return;
    setLoading(true);

    const result = await deployStrategy({
      connectionId:  connection.id,
      strategyId:    selected.id,
      strategyName:  selected.name,
      strategyInfo: {
        isBacktested:   selected.isBacktested,
        winRate:        selected.winRate,
        backtestMonths: 3,
        maxDrawdown:    selected.maxDD,
        riskLevel:      selected.riskLevel,
      },
      symbol:        selected.symbol,
      mode:          selectedMode,
      allocatedUSD:  allocation,
      userLevel,
      pairs:         [selected.symbol],
      maxDailyLoss:  allocation * 0.1,
    });

    setLoading(false);
    if (result.success) {
      setDeployed(true);
      toast.success(`"${selected.name}" is now live on ${exMeta.name}! 🚀`);
    } else {
      toast.error(result.error ?? 'Deployment failed');
    }
  }

  if (deployed && selected) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="relative w-full max-w-sm rounded-3xl p-8 text-center space-y-5"
          style={{ background: 'rgba(10,10,14,0.97)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: 'spring' }}
            className="w-20 h-20 mx-auto rounded-full bg-primary/15 flex items-center justify-center">
            <Rocket className="h-10 w-10 text-primary" />
          </motion.div>
          <div>
            <h2 className="text-lg font-black text-white">Strategy Deployed!</h2>
            <p className="text-sm text-muted-foreground mt-1">
              <span className="text-white font-bold">{selected.name}</span> is live on {exMeta.name} with ${allocation.toLocaleString()} allocated
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-left">
            {['Running on real funds', 'Risk controls active', 'Trade history syncing', 'Kill switch enabled'].map(f => (
              <div key={f} className="flex items-center gap-2 text-xs text-white/60">
                <CheckCircle className="h-3.5 w-3.5 text-emerald-400 shrink-0" />{f}
              </div>
            ))}
          </div>
          <button onClick={onClose} className="w-full py-3 rounded-2xl bg-primary text-white font-black text-sm hover:brightness-110 transition-all">
            View Dashboard
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}
        className="relative w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl overflow-hidden"
        style={{ background: 'rgba(10,10,14,0.97)', border: '1px solid rgba(255,255,255,0.08)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/5">
          <div>
            <h2 className="font-black text-white text-base flex items-center gap-2">
              <Rocket className="h-5 w-5 text-primary" /> Deploy Strategy
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Connect to {exMeta.logo} {exMeta.name} — {connection.label}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/6 hover:bg-white/12 flex items-center justify-center transition-colors">
            <X className="h-4 w-4 text-white/60" />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[75vh]">
          {/* Strategy picker */}
          <div className="px-6 py-4 space-y-3">
            <p className="text-xs font-black text-white/40 uppercase tracking-wider">Choose Strategy</p>
            <div className="space-y-2">
              {compatible.map(s => (
                <button key={s.id} onClick={() => { setSelected(s); setSelectedMode(s.modes.find(m => connection.modes.includes(m)) ?? 'spot'); }}
                  className={cn(
                    'w-full flex items-center gap-4 p-4 rounded-2xl border text-left transition-all',
                    selected?.id === s.id ? 'border-primary/40 bg-primary/8' : 'border-white/6 bg-white/[0.02] hover:border-white/12',
                  )}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-sm text-white">{s.name}</span>
                      <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full border font-bold capitalize', RISK_COLOR[s.riskLevel])}>
                        {s.riskLevel} risk
                      </span>
                      {s.isBacktested && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold">
                          ✓ Backtested
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">by {s.author} · {s.symbol}</p>
                    <div className="flex gap-4 mt-2">
                      <span className="text-[11px] text-emerald-400 font-bold">+{s.roi3m}% ROI (3m)</span>
                      <span className="text-[11px] text-white/50">WR: {s.winRate}%</span>
                      <span className="text-[11px] text-red-400/70">DD: -{s.maxDD}%</span>
                    </div>
                  </div>
                  {selected?.id === s.id && <CheckCircle className="h-5 w-5 text-primary shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          {selected && (
            <>
              {/* Mode selector */}
              {selected.modes.filter(m => connection.modes.includes(m)).length > 1 && (
                <div className="px-6 py-2 space-y-2">
                  <p className="text-xs font-black text-white/40 uppercase tracking-wider">Trading Mode</p>
                  <div className="flex gap-2">
                    {selected.modes.filter(m => connection.modes.includes(m)).map(m => (
                      <button key={m} onClick={() => setSelectedMode(m)}
                        className={cn('px-4 py-2 rounded-xl text-xs font-bold border capitalize transition-all',
                          selectedMode === m ? 'bg-primary/15 border-primary/40 text-primary' : 'bg-white/4 border-white/8 text-white/40 hover:border-white/20',
                        )}>
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Allocation */}
              <div className="px-6 py-3 space-y-3">
                <p className="text-xs font-black text-white/40 uppercase tracking-wider">Allocation</p>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-white/60">Allocate (USD)</span>
                    <span className="font-black text-white">${allocation.toLocaleString()}</span>
                  </div>
                  <input type="range" min={50} max={Math.min(connection.balanceUSD * 0.9, 50000)} step={50}
                    value={allocation} onChange={e => setAllocation(Number(e.target.value))}
                    className="w-full" style={{ accentColor: '#6366f1' }} />
                  <div className="flex justify-between text-[10px] text-white/20">
                    <span>$50</span>
                    <span>Available: ${connection.balanceUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                  </div>
                </div>
                {/* Quick presets */}
                <div className="flex gap-2">
                  {[5, 10, 25, 50].map(pct => (
                    <button key={pct} onClick={() => setAllocation(Math.round(connection.balanceUSD * (pct / 100) / 50) * 50)}
                      className="flex-1 py-1.5 rounded-lg bg-white/5 text-[10px] font-bold text-white/40 hover:bg-white/10 hover:text-white/70 transition-colors">
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>

              {/* Risk warning */}
              <div className="mx-6 my-3 px-4 py-3 rounded-xl flex items-start gap-2.5"
                style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
                <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                <div className="text-[11px] text-red-300/80 space-y-0.5">
                  <p className="font-bold">Real funds at risk</p>
                  <p>This strategy will execute real trades on {exMeta.name}. Past performance does not guarantee future results. Never invest more than you can afford to lose.</p>
                </div>
              </div>

              {/* Agreement */}
              <div className="px-6 pb-2">
                <label className="flex items-start gap-3 cursor-pointer">
                  <div onClick={() => setAgreed(v => !v)}
                    className={cn('w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors',
                      agreed ? 'bg-primary border-primary' : 'border-white/20',
                    )}>
                    {agreed && <CheckCircle className="h-3.5 w-3.5 text-white" />}
                  </div>
                  <p className="text-xs text-white/50">
                    I understand this uses real funds and I accept full responsibility for all trades executed by this strategy. I have reviewed the risk controls.
                  </p>
                </label>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-3 border-t border-white/5">
          <button onClick={handleDeploy} disabled={!selected || !agreed || loading}
            className={cn(
              'w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-black text-sm transition-all',
              selected && agreed && !loading
                ? 'bg-primary text-white hover:brightness-110'
                : 'bg-white/5 text-white/30 cursor-not-allowed',
            )}>
            {loading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Deploying…</>
            ) : (
              <><Rocket className="h-4 w-4" /> Deploy with ${allocation.toLocaleString()}</>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
