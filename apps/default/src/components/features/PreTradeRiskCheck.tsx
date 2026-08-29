import React, { useState } from 'react';
import { Shield, Loader2, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { motion, AnimatePresence } from 'framer-motion';
import ProFeatureGate from './ProFeatureGate';
import { analyzeRisk, getRiskMessage, saveRiskHistory, RiskParams, RiskReport } from '@/features/preTradeRiskCheckEnhanced';
import { useTradingStore } from '@/lib/tradingStore';

interface Props { coin: string; side: 'long'|'short'; amount: number; leverage: number; entryPrice: number; balance: number; onProceed: () => void; }

function RiskInner({ coin, side, amount, leverage, entryPrice, balance, onProceed }: Props) {
  const [report, setReport] = useState<RiskReport|null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const { positions } = useTradingStore();

  async function runCheck() {
    setLoading(true); setError(null);
    try {
      const params: RiskParams = { coin, orderType:'Market', tradeSize:amount, leverage, entryPrice, balance, positions:positions||[] };
      const r = await analyzeRisk(params);
      setReport(r); saveRiskHistory(r);
    } catch { setError('Risk analysis unavailable.'); }
    setLoading(false);
  }

  const msg = report ? getRiskMessage(report.score) : null;

  return (
    <div className="mb-4 p-4 rounded-xl border border-white/10 bg-white/5">
      <h4 className="text-sm font-bold mb-2 flex items-center gap-2"><Shield className="h-4 w-4 text-yellow-400"/>AI Risk Check (0-100)</h4>
      {!report && !loading && !error && (
        <button onClick={runCheck} className="w-full py-2 rounded-lg bg-yellow-500/15 hover:bg-yellow-500/25 text-yellow-400 text-xs font-semibold">Run Risk Analysis</button>
      )}
      {loading && <Skeleton className="h-16 w-full rounded-xl"/>}
      {error && <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20"><AlertTriangle className="h-4 w-4 text-red-400"/><p className="text-xs text-red-300">{error}</p></div>}
      {report && msg && (
        <motion.div initial={{opacity:0}} animate={{opacity:1}}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg font-black" style={{color:msg.color}}>{msg.icon} {report.score}/100</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{color:msg.color,background:`${msg.color}15`}}>{report.level.toUpperCase()}</span>
          </div>
          <p className="text-xs text-white/70 mb-2">{msg.msg}</p>
          <button onClick={()=>setDetailOpen(!detailOpen)} className="flex items-center gap-1 text-[10px] text-white/40 hover:text-white/70 mb-2"><Info className="h-3 w-3"/>{detailOpen?'Hide':'Show'} details</button>
          <AnimatePresence>
            {detailOpen && (
              <motion.div initial={{height:0}} animate={{height:'auto'}} exit={{height:0}} className="overflow-hidden space-y-1.5 mb-2">
                {[report.positionRisk,report.leverageRisk,report.stopLossRisk,report.correlationRisk].map((r,i)=>(
                  <div key={i} className={`flex items-center gap-1.5 p-1.5 rounded text-[10px] ${r.ok?'bg-green-500/5 text-green-400/70':'bg-red-500/5 text-red-400/70'}`}>
                    {r.ok?<CheckCircle className="h-3 w-3"/>:<AlertTriangle className="h-3 w-3"/>}{r.msg}
                  </div>
                ))}
                {report.suggestions.map((s,i)=><p key={i} className="text-[10px] text-yellow-400/70">💡 {s}</p>)}
              </motion.div>
            )}
          </AnimatePresence>
          {msg.canProceed ? (
            <button onClick={onProceed} className="w-full py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold">
              <CheckCircle className="h-3.5 w-3.5 inline mr-1"/>Proceed with Trade
            </button>
          ) : (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 text-center">
              🚨 Trade blocked — risk too high. Please adjust parameters.
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

export default function PreTradeRiskCheck(props: Props) {
  return <ProFeatureGate featureName="AI Risk Check" featureIcon="🛡"><RiskInner {...props}/></ProFeatureGate>;
}
