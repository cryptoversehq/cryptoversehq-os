import React, { useState } from 'react';
import { Sparkles, AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import ProFeatureGate from './ProFeatureGate';
import { calculateSmartStopLoss, saveSLHistory, shouldForceStopLoss, SLRecommendation } from '@/features/smartStopLossEnhanced';

interface Props { coin: string; entryPrice: number; side?: 'long'|'short'; leverage?: number; isNewUser?: boolean; onSelect: (sl: number) => void; }

function SLInner({ coin, entryPrice, side='long', leverage, isNewUser, onSelect }: Props) {
  const [suggestions, setSuggestions] = useState<SLRecommendation[]|null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string|null>(null);

  async function fetch() {
    setLoading(true); setError(null);
    try { const r = await calculateSmartStopLoss({coin,currentPrice:entryPrice,side}); setSuggestions(r); }
    catch { setError('Could not generate suggestions.'); }
    setLoading(false);
  }

  const forceSl = shouldForceStopLoss(leverage||1, !!isNewUser);
  const colors = ['border-green-500/30 bg-green-500/5','border-yellow-500/30 bg-yellow-500/5','border-red-500/30 bg-red-500/5'];

  return (
    <div className="mt-2">
      {forceSl && !suggestions && (
        <p className="flex items-center gap-1 text-[10px] text-yellow-400/70">
          <AlertTriangle className="h-3 w-3"/>Stop-loss required for new users & high leverage
        </p>
      )}
      <button onClick={fetch} disabled={loading}
        className="flex items-center gap-1.5 text-[11px] text-yellow-400/70 hover:text-yellow-400 disabled:opacity-50">
        <Sparkles className="h-3 w-3"/>{loading?'Analyzing...':'AI smart stop-loss'}
      </button>
      {loading && <Skeleton className="h-14 w-full mt-1 rounded-lg"/>}
      {error && <p className="text-[10px] text-red-400 mt-1">{error}</p>}
      {suggestions && (
        <div className="flex gap-2 mt-1.5">
          {suggestions.map((s,i)=>(
            <button key={i} onClick={()=>{onSelect(s.price);saveSLHistory(s);}}
              className={`flex-1 p-2 rounded-lg border ${colors[i]} hover:bg-white/10 transition-colors text-center`}>
              <div className="text-[10px] text-white/50">{s.label}</div>
              <div className="text-xs font-bold text-white">${s.price.toFixed(2)}</div>
              <div className="text-[9px] text-red-400">{s.pct.toFixed(1)}%</div>
              <div className="text-[9px] text-white/40 mt-0.5">{s.description}</div>
            </button>
          ))}
        </div>
      )}
      {!suggestions && !loading && (
        <p className="text-[9px] text-red-400/60 mt-1 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3"/>You're trading without a stop-loss. This is very risky!
        </p>
      )}
    </div>
  );
}

export default function SmartStopLoss(props: Props) {
  return <ProFeatureGate featureName="Smart Stop-Loss" featureIcon="📊"><SLInner {...props}/></ProFeatureGate>;
}
