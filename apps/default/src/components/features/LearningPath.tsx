import React, { useState, useEffect } from 'react';
import { BookOpen, CheckCircle, ArrowRight, Sparkles, RefreshCw } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { motion } from 'framer-motion';
import ProFeatureGate from './ProFeatureGate';
import { generatePath, getQuestionnaire, saveQuestionnaire, savePath, loadPath, getProgress, Questionnaire } from '@/features/learningPathEnhanced';

function PathInner() {
  const [path, setPath] = useState(loadPath());
  const [quiz, setQuiz] = useState(getQuestionnaire());
  const [loading, setLoading] = useState(!quiz || path.length===0);
  const [error, setError] = useState<string|null>(null);

  const [form, setForm] = useState<Questionnaire>({level:'beginner',goals:'trading',interests:'Bitcoin',hoursPerWeek:'1-2'});

  useEffect(() => {
    if (quiz && path.length===0) { setLoading(true); generatePath(quiz).then(p=>{setPath(p);savePath(p);setLoading(false);}).catch(()=>{setError('Failed');setLoading(false);}); }
    else if (!quiz) setLoading(false);
  }, [quiz]);

  function submitQuiz() { saveQuestionnaire(form); setQuiz(form); setLoading(true); generatePath(form).then(p=>{setPath(p);savePath(p);setLoading(false);}).catch(()=>{setError('Failed');setLoading(false);}); }

  const prog = getProgress(path);

  return (
    <motion.div initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} className="space-y-4">
      <div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-yellow-400"/><h3 className="text-lg font-bold">My Learning Path</h3></div>

      {!quiz && (
        <div className="p-4 rounded-xl border border-white/10 bg-white/5 space-y-3">
          <p className="text-xs text-white/60">Tell us about yourself for a personalized path:</p>
          {(['level','goals','interests','hoursPerWeek']as const).map(f=>(<div key={f}><label className="text-[10px] text-white/40 capitalize">{f.replace(/([A-Z])/g,' $1')}</label><input value={form[f]} onChange={e=>setForm({...form,[f]:e.target.value})} className="w-full mt-0.5 bg-white/10 border border-white/10 rounded-lg px-2 py-1 text-xs text-white"/></div>))}
          <button onClick={submitQuiz} className="w-full py-2 rounded-lg bg-yellow-500/15 hover:bg-yellow-500/25 text-yellow-400 text-xs font-semibold">Generate My Path</button>
        </div>
      )}

      {loading && <div className="space-y-2">{[...Array(3)].map((_,i)=><Skeleton key={i} className="h-16 w-full rounded-xl"/>)}</div>}
      {error && <p className="text-sm text-red-400 p-4 rounded-xl bg-red-500/10">{error}</p>}

      {!loading && !error && path.length>0 && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-xs text-white/50">{prog.message}</p>
            <div className="h-1.5 flex-1 mx-3 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-yellow-400 rounded-full transition-all" style={{width:`${prog.pct}%`}}/>
            </div>
          </div>
          <div className="space-y-2">
            {path.map((rec,i)=>(
              <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border ${rec.completed?'border-green-500/20 bg-green-500/5':'border-white/10 bg-white/5'}`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg ${rec.completed?'bg-green-500/20':'bg-yellow-500/15'}`}>{rec.badge||(rec.completed?'✅':'📖')}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{rec.module} — {rec.lesson}</p>
                  <p className="text-[10px] text-white/40">~{rec.estimatedMinutes}min</p>
                </div>
                {rec.completed ? <CheckCircle className="h-4 w-4 text-green-400"/> : <ArrowRight className="h-4 w-4 text-yellow-400"/>}
              </div>
            ))}
          </div>
          <button onClick={()=>{saveQuestionnaire(null as any);setQuiz(null);setPath([]);}} className="flex items-center gap-1.5 text-[11px] text-white/30 hover:text-white/60"><RefreshCw className="h-3 w-3"/>Reset path</button>
        </>
      )}
    </motion.div>
  );
}

export default function LearningPath() {
  return <ProFeatureGate featureName="Learning Path" featureIcon="📚"><PathInner/></ProFeatureGate>;
}
