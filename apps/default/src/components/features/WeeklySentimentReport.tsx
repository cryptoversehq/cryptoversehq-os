import React, { useState, useEffect } from 'react';
import { Calendar, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';
import { useAuthStore } from '@/lib/authStore';
import { Skeleton } from '@/components/ui/skeleton';
import { motion } from 'framer-motion';
import ProFeatureGate from './ProFeatureGate';
import { generateWeeklyReport, getReportHistory, getReportPreference, setReportPreference } from '@/features/weeklySentimentEnhanced';

function ReportInner() {
  const [report, setReport] = useState<Awaited<ReturnType<typeof generateWeeklyReport>>|null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [pref] = useState(getReportPreference());
  const { user } = useAuthStore();

  useEffect(() => {
    const h = getReportHistory();
    if (h.length>0) { setReport(h[h.length-1]); setLoading(false); }
    else { generateWeeklyReport(user?.plan||'bronze').then(setReport).catch(()=>setError('Unavailable')).finally(()=>setLoading(false)); }
  }, []);

  async function regen() { setGenerating(true); try { setReport(await generateWeeklyReport(user?.plan||'bronze')); } catch {} setGenerating(false); }

  return (
    <motion.div initial={{opacity:0,y:4}} animate={{opacity:1,y:0}} className="p-4 rounded-2xl border border-white/10 bg-white/5 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold flex items-center gap-2"><Calendar className="h-4 w-4 text-purple-400"/>Weekly Report</h4>
        <button onClick={regen} disabled={generating} className="p-1 text-white/30 hover:text-white/60"><RefreshCw className={`h-3 w-3 ${generating?'animate-spin':''}`}/></button>
      </div>
      {loading && <Skeleton className="h-24 w-full rounded-xl"/>}
      {error && <p className="text-xs text-red-400">{error}</p>}
      {report && <>
        <p className="text-xs text-white/70">{report.summary}</p>
        <span className={`text-xs font-bold ${report.marketOutlook==='Bullish'?'text-green-400':'text-red-400'}`}>
          {report.marketOutlook==='Bullish'?<TrendingUp className="h-3 w-3 inline"/>:<TrendingDown className="h-3 w-3 inline"/>} {report.marketOutlook} · {report.topPerformer} top
        </span>
        {report.tips.map((t,i)=><p key={i} className="text-[10px] text-yellow-400/70">💡 {t}</p>)}
      </>}
    </motion.div>
  );
}

export default function WeeklySentimentReport() {
  return <ProFeatureGate featureName="Weekly Report" featureIcon="📰"><ReportInner/></ProFeatureGate>;
}
