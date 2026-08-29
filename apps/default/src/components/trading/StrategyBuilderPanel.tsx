import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Play, BarChart2, Zap, X, Plus, Trash2, CheckCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { enqueueBacktest } from '@/lib/backtestQueue';
import type { BacktestParams } from '@/lib/backtestTypes';
import type { StrategyType } from '@/lib/strategyTypes';
import { useAuthStore } from '@/lib/authStore';
import { BacktestResultsModal } from './BacktestResultsModal';

type IndicatorType = 'RSI' | 'MA_CROSS' | 'PRICE_LEVEL' | 'VOLUME' | 'MACD';

interface Condition {
  id: string;
  indicator: IndicatorType;
  operator: string;
  value: number;
}

interface Strategy {
  id: string;
  name: string;
  conditions: Condition[];
  action: 'buy' | 'sell';
  leverage: number;
  takeProfit: number;
  stopLoss: number;
}

const INDICATOR_OPTIONS: { value: IndicatorType; label: string; operators: string[] }[] = [
  { value: 'RSI', label: 'RSI(14)', operators: ['>', '<'] },
  { value: 'MA_CROSS', label: 'MA Cross', operators: ['crosses above', 'crosses below'] },
  { value: 'PRICE_LEVEL', label: 'Price Level', operators: ['breaks above', 'breaks below'] },
  { value: 'VOLUME', label: 'Volume Spike', operators: ['>', '<'] },
  { value: 'MACD', label: 'MACD Crossover', operators: ['bullish cross', 'bearish cross'] },
];

function uid() { return Math.random().toString(36).slice(2, 10); }

interface Props {
  coinId: string;
  coinSymbol: string;
  currentPrice: number;
}

/**
 * A saved strategy's leading condition indicator maps onto the real
 * backtest engine's `StrategyType` dispatch (see backtestRunner.ts —
 * 'dca'→RSI, 'martingale'→MACD, 'grid'→SMA-crossover, 'arbitrage'→
 * Bollinger bounce). There's no dedicated "price level" or "volume spike"
 * simulator, so those fall back to 'custom' (ATR trailing-stop), which is
 * the closest generic price-action strategy already implemented.
 */
function inferStrategyType(strategy: Strategy): StrategyType | 'custom' {
  const lead = strategy.conditions[0]?.indicator;
  switch (lead) {
    case 'RSI':      return 'dca';
    case 'MACD':     return 'martingale';
    case 'MA_CROSS': return 'grid';
    default:         return 'custom';
  }
}

export function StrategyBuilderPanel({ coinId, coinSymbol, currentPrice }: Props) {
  // Now that this panel lives inside its own dedicated "Strategy" tab in
  // ProBottomPanel (rather than bolted onto the bottom of the chart), it
  // should just be visible immediately when that tab is selected — the
  // tab itself is the show/hide mechanism now, so defaulting collapsed
  // would just be a redundant extra click.
  const [open, setOpen] = useState(true);
  const [strategies, setStrategies] = useState<Strategy[]>(() => {
    try { return JSON.parse(localStorage.getItem('cv_strategies') || '[]'); }
    catch { return []; }
  });
  const [editing, setEditing] = useState<Strategy | null>(null);
  const [newName, setNewName] = useState('');
  const [newAction, setNewAction] = useState<'buy' | 'sell'>('buy');
  const [newLeverage, setNewLeverage] = useState(5);
  const [newTP, setNewTP] = useState(10);
  const [newSL, setNewSL] = useState(5);
  const [conditions, setConditions] = useState<Condition[]>([]);

  const addCondition = () => {
    setConditions(prev => [...prev, { id: uid(), indicator: 'RSI', operator: '>', value: 50 }]);
  };

  const removeCondition = (id: string) => setConditions(prev => prev.filter(c => c.id !== id));

  const updateCondition = (id: string, patch: Partial<Condition>) => {
    setConditions(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  };

  const saveStrategy = () => {
    if (!newName.trim() || conditions.length === 0) return;
    const strategy: Strategy = {
      id: uid(),
      name: newName,
      conditions: [...conditions],
      action: newAction,
      leverage: newLeverage,
      takeProfit: newTP,
      stopLoss: newSL,
    };
    const updated = [...strategies, strategy];
    setStrategies(updated);
    localStorage.setItem('cv_strategies', JSON.stringify(updated));
    setNewName('');
    setConditions([]);
  };

  const deleteStrategy = (id: string) => {
    const updated = strategies.filter(s => s.id !== id);
    setStrategies(updated);
    localStorage.setItem('cv_strategies', JSON.stringify(updated));
  };

  // ── Real backtest wiring ────────────────────────────────────────────────
  // Previously this called a nonexistent `backtestQueue.enqueue()` via
  // `require()` (which doesn't exist in a browser bundle) wrapped in a
  // silent try/catch, then showed a bare `alert()` — so "Test" did nothing
  // and no result was ever visible. This now runs the real engine
  // (`enqueueBacktest`, same one used by the dedicated /backtest page) and
  // shows the results in `BacktestResultsModal`, including an equity curve.
  const { user } = useAuthStore();
  const [runningId, setRunningId] = useState<string | null>(null);
  const [runError, setRunError]   = useState<string | null>(null);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [results, setResults] = useState<{
    totalTrades: number; winRate: number; totalPnl: number; maxDrawdown: number;
    profitFactor: number; avgWin: number; avgLoss: number; equityCurve: number[]; subtitle: string;
  } | null>(null);

  const runBacktest = async (strategy: Strategy) => {
    setRunningId(strategy.id);
    setRunError(null);
    try {
      const initialBalance = 10_000;
      const endDate   = new Date();
      const startDate = new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000); // last 90 days

      const params: BacktestParams = {
        coinId,
        symbol: `${coinSymbol}/USDT`,
        timeframe: '1h',
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        initialBalance,
        feeRate: 0.001,
        strategyConfig: { ...strategy },
      };

      const output = await enqueueBacktest(
        { params, strategyType: inferStrategyType(strategy) },
        { name: `${strategy.name} · ${coinSymbol}`, userId: user?.id ?? 'guest' },
      );

      setResults({
        totalTrades:  output.metrics.totalTrades,
        winRate:      output.metrics.winRate,
        totalPnl:     output.metrics.finalBalance - initialBalance,
        maxDrawdown:  output.metrics.maxDrawdown,
        profitFactor: output.metrics.profitFactor,
        avgWin:       output.metrics.averageWin,
        avgLoss:      output.metrics.averageLoss,
        equityCurve:  output.metrics.equityCurve,
        subtitle:     `${coinSymbol}/USDT · ${strategy.name} · last 90 days (${output.metrics.dataSource === 'coingecko' ? 'real CoinGecko history' : 'simulated history'})`,
      });
      setResultsOpen(true);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Backtest failed to run');
    } finally {
      setRunningId(null);
    }
  };

  return (
    <div className="rounded-xl border" style={{ borderColor: 'var(--cv-dash-divider)' }}>
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.02] transition-colors"
      >
        <Zap className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
        <span className="text-[11px] font-semibold text-white/60 flex-1 text-left">Strategy Builder</span>
        <span className="text-[9px] text-white/20">{strategies.length} saved</span>
        {open ? <ChevronUp className="w-3 h-3 text-white/30" /> : <ChevronDown className="w-3 h-3 text-white/30" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-3">
              {/* New Strategy Form */}
              <div className="bg-white/[0.03] rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="Strategy name..."
                    className="flex-1 bg-white/[0.05] border border-white/[0.06] rounded-lg px-2 py-1.5 text-[11px] text-white/80 outline-none focus:border-amber-400/50"
                  />
                  <select
                    value={newAction}
                    onChange={e => setNewAction(e.target.value as 'buy' | 'sell')}
                    className="bg-white/[0.05] border border-white/[0.06] rounded-lg px-2 py-1.5 text-[11px] text-white/80 outline-none"
                  >
                    <option value="buy">Buy/Long</option>
                    <option value="sell">Sell/Short</option>
                  </select>
                </div>

                {/* Conditions */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-white/30 uppercase tracking-wider">Conditions</span>
                    <button onClick={addCondition} className="flex items-center gap-1 text-[9px] text-amber-400 hover:text-amber-300 transition-colors">
                      <Plus className="w-2.5 h-2.5" /> Add
                    </button>
                  </div>
                  {conditions.map((cond, i) => {
                    const indicator = INDICATOR_OPTIONS.find(o => o.value === cond.indicator)!;
                    return (
                      <div key={cond.id} className="flex items-center gap-1.5">
                        <span className="text-[9px] text-white/20 w-4">{i > 0 ? 'AND' : 'IF'}</span>
                        <select
                          value={cond.indicator}
                          onChange={e => updateCondition(cond.id, { indicator: e.target.value as IndicatorType, operator: INDICATOR_OPTIONS.find(o => o.value === e.target.value)!.operators[0] })}
                          className="bg-white/[0.05] border border-white/[0.06] rounded px-1.5 py-1 text-[10px] text-white/70 outline-none"
                        >
                          {INDICATOR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <select
                          value={cond.operator}
                          onChange={e => updateCondition(cond.id, { operator: e.target.value })}
                          className="bg-white/[0.05] border border-white/[0.06] rounded px-1.5 py-1 text-[10px] text-white/70 outline-none"
                        >
                          {indicator.operators.map(op => <option key={op} value={op}>{op}</option>)}
                        </select>
                        <input
                          type="number" value={cond.value}
                          onChange={e => updateCondition(cond.id, { value: Number(e.target.value) })}
                          className="w-14 bg-white/[0.05] border border-white/[0.06] rounded px-1.5 py-1 text-[10px] text-white/70 outline-none"
                        />
                        <button onClick={() => removeCondition(cond.id)} className="text-white/20 hover:text-red-400 transition-colors">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* TP/SL/Lev */}
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { label: 'Leverage', value: newLeverage, set: setNewLeverage, suffix: '×' },
                    { label: 'Take Profit %', value: newTP, set: setNewTP, suffix: '%' },
                    { label: 'Stop Loss %', value: newSL, set: setNewSL, suffix: '%' },
                  ].map(({ label, value, set, suffix }) => (
                    <div key={label}>
                      <span className="text-[8px] text-white/30">{label}</span>
                      <div className="flex items-center bg-white/[0.05] border border-white/[0.06] rounded px-1.5 py-1 mt-0.5">
                        <input type="number" value={value} onChange={e => set(Number(e.target.value))} className="w-full bg-transparent text-[10px] text-white/70 outline-none" />
                        <span className="text-[9px] text-white/30">{suffix}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={saveStrategy}
                  disabled={!newName.trim() || conditions.length === 0}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-amber-400 text-black text-[11px] font-bold hover:bg-amber-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <CheckCircle className="w-3 h-3" /> Save Strategy
                </button>
              </div>

              {runError && (
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/25 text-[10px] text-red-400">
                  {runError}
                </div>
              )}

              {/* Saved Strategies */}
              {strategies.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[9px] text-white/30 uppercase tracking-wider">Saved Strategies ({strategies.length})</span>
                  {strategies.map(strategy => (
                    <div key={strategy.id} className="flex items-center gap-2 bg-white/[0.02] rounded-lg px-2 py-1.5 hover:bg-white/[0.04] transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-white/80 font-semibold truncate">{strategy.name}</p>
                        <p className="text-[9px] text-white/30">{strategy.conditions.length} conditions · {strategy.action.toUpperCase()}</p>
                      </div>
                      <button
                        onClick={() => runBacktest(strategy)}
                        disabled={runningId === strategy.id}
                        className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/15 text-emerald-400 text-[9px] font-semibold hover:bg-emerald-500/25 transition-colors disabled:opacity-50 disabled:cursor-wait"
                      >
                        {runningId === strategy.id
                          ? <><Loader2 className="w-2.5 h-2.5 animate-spin" /> Running…</>
                          : <><Play className="w-2.5 h-2.5" /> Test</>}
                      </button>
                      <button onClick={() => deleteStrategy(strategy.id)} className="text-white/20 hover:text-red-400 transition-colors">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <BacktestResultsModal
        isOpen={resultsOpen}
        onClose={() => setResultsOpen(false)}
        results={results}
      />
    </div>
  );
}
