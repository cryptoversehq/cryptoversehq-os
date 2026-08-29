import React, { useState } from 'react';
import { Play, RotateCcw, ChevronRight, Loader2 } from 'lucide-react';
import { analyzeTradeInReplay, REPLAY_SPEEDS } from '@/features/tradeReplay';
import type { TradeRecord } from '@/lib/tradingStore';
import { Skeleton } from '@/components/ui/skeleton';
import { motion, AnimatePresence } from 'framer-motion';
import ProFeatureGate from './ProFeatureGate';

interface Props { trades: TradeRecord[]; }

function ReplayInner({ trades }: Props) {
  const [selected, setSelected] = useState<TradeRecord|null>(null);
  const [analysis, setAnalysis] = useState<Awaited<ReturnType<typeof analyzeTradeInReplay>>|null>(null);
  const [speed, setSpeed] = useState<typeof REPLAY_SPEEDS[number]>(1);
  const [phase, setPhase] = useState<0|1|2|3>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string|null>(null);

  async function startReplay(trade: TradeRecord) { setSelected(trade); setAnalysis(null); setPhase(0); setError(null); setLoading(true); try { setAnalysis(await analyzeTradeInReplay(trade)); } catch { setError('Replay failed.'); } setLoading(false); }

  const phases = [{label:'Before Entry',content:analysis?.beforeEntry,color:'#FFD700'},{label:'During Trade',content:analysis?.duringTrade,color:'#FF9500'},{label:'After Exit',content:analysis?.afterExit,color:'#00C853'}];

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold flex items-center gap-2"><Play className="h-5 w-5 text-yellow-400"/>Trade Replay</h3>
      {!selected && <div className="space-y-1.5 max-h-64 overflow-y-auto">{trades.slice(0,20).map(t=>(<button key={t.id} onClick={()=>startReplay(t)} className="w-full flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/[0.07] transition-colors text-left"><span className={`text-xs font-bold min-w-[40px] ${t.pnl>=0?'text-green-400':'text-red-400'}`}>{t.pnl>=0?'+':''}${t.pnl}</span><span className="text-sm font-semibold">{t.symbol}</span><span className="text-xs text-white/40 capitalize">{t.side}</span><span className="text-xs text-white/40">{t.leverage}x</span><ChevronRight className="h-4 w-4 text-white/20 ml-auto"/></button>))}</div>}
      {selected && <div className="space-y-3 p-4 rounded-2xl border border-white/10 bg-white/5">
        <div className="flex items-center justify-between"><span className="font-bold">{selected.symbol} {selected.side} · {selected.leverage}x</span><span className={`text-sm font-bold ${selected.pnl>=0?'text-green-400':'text-red-400'}`}>{selected.pnl>=0?'+':''}${selected.pnl}</span></div>
        <div className="flex gap-2">{REPLAY_SPEEDS.map(s=>(<button key={s} onClick={()=>setSpeed(s)} className={`px-3 py-1 rounded-lg text-xs font-semibold ${speed===s?'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30':'bg-white/5 text-white/40 border border-white/10'}`}>{s}x</button>))}</div>
        {loading && <Skeleton className="h-24 w-full rounded-xl"/>}
        {error && <p className="text-xs text-red-400 p-3 rounded-xl bg-red-500/10">{error}</p>}
        {analysis && <>
          <div className="flex gap-1">{phases.map((p,i)=>(<button key={i} onClick={()=>setPhase(i as 0|1|2)} className={`flex-1 py-1.5 rounded-lg text-[10px] font-semibold ${phase===i?'border border-current':'border border-white/5 text-white/30'}`} style={phase===i?{color:p.color,backgroundColor:`${p.color}10`}:{}}>{p.label}</button>))}</div>
          <AnimatePresence mode="wait"><motion.div key={phase} initial={{opacity:0,y:4}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-4}} className="p-3 rounded-xl border border-white/10 bg-white/5"><p className="text-xs text-white/70">{phases[phase].content}</p></motion.div></AnimatePresence>
          <div className="flex justify-center"><button onClick={()=>setPhase(Math.min(3,phase+1)as 0|1|2|3)} className="px-4 py-2 rounded-lg bg-yellow-500/15 hover:bg-yellow-500/25 text-yellow-400 text-xs font-semibold" disabled={phase>=2}>{phase<2?'Next Phase →':'View Summary'}</button></div>
        </>}
        <button onClick={()=>{setSelected(null);setAnalysis(null);}} className="w-full py-2 rounded-lg border border-white/10 text-xs text-white/40 hover:text-white/70"><RotateCcw className="h-3 w-3 inline mr-1"/>Back</button>
      </div>}
    </div>
  );
}

export default function TradeReplayViewer(props: Props) {
  return <ProFeatureGate featureName="Trade Replay" featureIcon="🔄"><ReplayInner {...props} /></ProFeatureGate>;
}
