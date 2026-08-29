import React, { useState, useEffect } from 'react';
import { MessageCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { fetchSentimentSnapshot, getMoodWidgetData } from '@/features/socialSentimentEngine';
import { Skeleton } from '@/components/ui/skeleton';
import { motion } from 'framer-motion';
import ProFeatureGate from './ProFeatureGate';

function SentimentInner() {
  const [mood, setMood] = useState<{score:number;label:string;topGainer:{coin:string;score:number};topLoser:{coin:string;score:number}}|null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);

  useEffect(() => { fetchSentimentSnapshot().then(s=>setMood(getMoodWidgetData(s))).catch(()=>setError('Unavailable')).finally(()=>setLoading(false)); }, []);

  const barColor = (s:number)=>s>=70?'#00C853':s>=50?'#FFD700':s>=30?'#FF9500':'#FF3B30';

  return (
    <motion.div initial={{opacity:0,y:4}} animate={{opacity:1,y:0}} className="p-4 rounded-2xl border border-white/10 bg-white/5">
      <h4 className="text-sm font-bold mb-3 flex items-center gap-2"><MessageCircle className="h-4 w-4 text-yellow-400"/>Market Sentiment</h4>
      {loading && <Skeleton className="h-24 w-full rounded-xl"/>}
      {error && <p className="text-xs text-red-400">{error}</p>}
      {mood && <>
        <div className="flex items-center gap-3 mb-3"><span className="text-2xl font-black" style={{color:barColor(mood.score)}}>{mood.score}</span><span className="text-sm font-semibold text-white/70">{mood.label}</span></div>
        <div className="h-1.5 w-full rounded-full bg-white/10 mb-3"><motion.div className="h-full rounded-full" initial={{width:0}} animate={{width:`${mood.score}%`}} style={{backgroundColor:barColor(mood.score)}} transition={{duration:0.8}}/></div>
        <div className="flex gap-3 text-[10px]"><div className="flex-1"><span className="text-green-400 flex items-center gap-0.5"><TrendingUp className="h-3 w-3"/>Top: {mood.topGainer.coin}</span><span className="text-white/50 ml-4">{mood.topGainer.score}</span></div><div className="flex-1"><span className="text-red-400 flex items-center gap-0.5"><TrendingDown className="h-3 w-3"/>Low: {mood.topLoser.coin}</span><span className="text-white/50 ml-4">{mood.topLoser.score}</span></div></div>
      </>}
    </motion.div>
  );
}

export default function SocialSentimentWidget() {
  return <ProFeatureGate featureName="Sentiment Engine" featureIcon="📈"><SentimentInner /></ProFeatureGate>;
}
