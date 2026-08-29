import React, { useState, useEffect } from 'react';
import { Activity, TrendingUp, AlertTriangle, Shield } from 'lucide-react';
import { useAuthStore } from '@/lib/authStore';
import { Skeleton } from '@/components/ui/skeleton';
import { motion } from 'framer-motion';
import ProFeatureGate from './ProFeatureGate';
import { analyzePortfolioHealth, saveHealthHistory } from '@/features/portfolioHealthEnhanced';

function HealthInner() {
  const [health, setHealth] = useState<Awaited<ReturnType<typeof analyzePortfolioHealth>>|null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);
  const { user } = useAuthStore();

  useEffect(() => {
    analyzePortfolioHealth(user?.plan||'bronze').then(h=>{setHealth(h);saveHealthHistory(h);}).catch(()=>setError('Unavailable')).finally(()=>setLoading(false));
  }, [user?.plan]);

  const grades: Record<string,{color:string;icon:React.ReactNode}> = {
    Excellent:{color:'#00C853',icon:<TrendingUp className="h-4 w-4" style={{color:'#00C853'}}/>},
    Good:{color:'#FFD700',icon:<Activity className="h-4 w-4" style={{color:'#FFD700'}}/>},
    Moderate:{color:'#FF9500',icon:<AlertTriangle className="h-4 w-4" style={{color:'#FF9500'}}/>},
    Poor:{color:'#FF3B30',icon:<Shield className="h-4 w-4" style={{color:'#FF3B30'}}/>},
  };

  return (
    <motion.div initial={{opacity:0,y:4}} animate={{opacity:1,y:0}} className="p-4 rounded-2xl border border-white/10 bg-white/5">
      <h4 className="text-sm font-bold mb-3 flex items-center gap-2"><Activity className="h-4 w-4 text-yellow-400"/>Portfolio Health</h4>
      {loading && <Skeleton className="h-24 w-full rounded-xl"/>}
      {error && <p className="text-xs text-red-400">{error}</p>}
      {health && <>
        <div className="flex items-center gap-2 mb-2">
          {grades[health.grade]?.icon}
          <span className="text-lg font-black" style={{color:grades[health.grade]?.color}}>{health.score}/100</span>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{color:grades[health.grade]?.color,background:`${grades[health.grade]?.color}15`}}>{health.grade}</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5 text-[10px] mb-2">
          <span className="text-white/40">P&amp;L:</span>
          <span className={`font-mono ${health.pnl>=0?'text-green-400':'text-red-400'}`}>${health.pnl}</span>
          <span className="text-white/40">Win Rate:</span><span className="text-white/60">{health.winRate}%</span>
          <span className="text-white/40">Div:</span><span className="text-white/60">{health.diversification.detail}</span>
          <span className="text-white/40">Conc:</span><span className={health.concentration.risk?'text-red-400':'text-green-400'}>{health.concentration.detail}</span>
        </div>
        {health.suggestions.slice(0,2).map((s,i)=><p key={i} className="text-[10px] text-yellow-400/70">💡 {s}</p>)}
      </>}
    </motion.div>
  );
}

export default function AIPortfolioHealth() {
  return <ProFeatureGate featureName="Portfolio Health" featureIcon="🧠"><HealthInner/></ProFeatureGate>;
}
