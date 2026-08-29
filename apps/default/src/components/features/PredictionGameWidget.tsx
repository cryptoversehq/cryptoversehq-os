import React, { useState, useEffect } from 'react';
import { Trophy, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { getDailyChallenge } from '@/features/predictionGame';
import { Skeleton } from '@/components/ui/skeleton';
import { motion } from 'framer-motion';
import ProFeatureGate from './ProFeatureGate';

function GameInner() {
  const [challenge, setChallenge] = useState<ReturnType<typeof getDailyChallenge> | null>(null);
  const [guesses, setGuesses] = useState<Record<string,'up'|'down'|'stable'>>({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { try { setChallenge(getDailyChallenge()); } catch {} setLoading(false); }, []);

  function toggle(coin: string, g: 'up'|'down'|'stable') { setGuesses(p=>({...p,[coin]:p[coin]===g?undefined as never:g})); }
  function submit() {
    const v = Object.entries(guesses).filter(([,v])=>v).map(([k,v])=>({coin:k,guess:v as 'up'|'down'|'stable'}));
    if (v.length<3) return; import('@/features/predictionGame').then(m=>m.submitPrediction(v)); setSubmitted(true);
  }

  const icons: Record<string,React.ReactNode> = { up:<TrendingUp className="h-3.5 w-3.5"/>, down:<TrendingDown className="h-3.5 w-3.5"/>, stable:<Minus className="h-3.5 w-3.5"/> };
  const c: Record<string,string> = { up:'text-green-400 border-green-500/30 bg-green-500/10', down:'text-red-400 border-red-500/30 bg-red-500/10', stable:'text-yellow-400 border-yellow-500/30 bg-yellow-500/10' };

  return (
    <motion.div initial={{opacity:0,y:4}} animate={{opacity:1,y:0}} className="p-4 rounded-2xl border border-white/10 bg-white/5">
      <h4 className="text-sm font-bold mb-3 flex items-center gap-2"><Trophy className="h-4 w-4 text-yellow-400"/>Daily Predictions</h4>
      {loading && <Skeleton className="h-24 w-full rounded-xl"/>}
      {challenge && <>
        <p className="text-[10px] text-white/40 mb-2">Predict 24h direction. +10 XP each correct.</p>
        <div className="space-y-1.5 mb-3">
          {challenge.coins.map(coin=>(<div key={coin} className="flex items-center justify-between"><span className="text-xs font-semibold">{coin}</span><div className="flex gap-1">{(['up','down','stable']as const).map(g=>(<button key={g} onClick={()=>!submitted&&toggle(coin,g)} disabled={submitted} className={`flex items-center gap-0.5 px-2 py-1 rounded-md text-[10px] font-medium border transition-all ${guesses[coin]===g?c[g]+' border-current':'border-white/10 text-white/30 hover:text-white/60'}`}>{icons[g]}{g}</button>))}</div></div>))}
        </div>
        {!submitted?<button onClick={submit} className="w-full py-2 rounded-lg bg-yellow-500/15 hover:bg-yellow-500/25 text-yellow-400 text-xs font-semibold">Submit (+{Object.values(guesses).filter(Boolean).length*10} XP)</button>:<p className="text-xs text-green-400 text-center">Submitted! Results in ~24h.</p>}
      </>}
    </motion.div>
  );
}

export default function PredictionGameWidget() {
  return <ProFeatureGate featureName="Prediction Game" featureIcon="🎯"><GameInner /></ProFeatureGate>;
}
