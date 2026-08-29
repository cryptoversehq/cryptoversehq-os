/**
 * QuickTour.tsx — Step-by-step guided tour of new features for new users.
 * 5 steps pointing to key feature locations. Dismissible, auto-saves to localStorage.
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, ArrowLeft, X, CheckCircle } from 'lucide-react';

const STEPS = [
  { title:'AI Risk Check', desc:'Before every trade on the trading page, click "Run Risk Analysis" for a 0-100 risk score.', emoji:'🛡' },
  { title:'Market Sentiment', desc:'On your dashboard, check the Market Sentiment widget for real-time mood scores on 10 coins.', emoji:'📈' },
  { title:'Daily Predictions', desc:'Predict 3 coins daily in the Prediction Game on your dashboard. Earn XP for correct guesses!', emoji:'🎯' },
  { title:'Lynx AI Chat', desc:'Click the 🤖 button (bottom-right) to chat with AI agents. Ask trading questions anytime.', emoji:'🤖' },
  { title:'Portfolio Health', desc:'Check your Portfolio Health on the dashboard for diversification tips and risk warnings.', emoji:'🧠' },
];

export default function QuickTour() {
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(()=>!localStorage.getItem('cv_tour_done'));

  function finish() { setOpen(false); localStorage.setItem('cv_tour_done','1'); }
  function next() { if (step<STEPS.length-1) setStep(s=>s+1); else finish(); }
  function prev() { if (step>0) setStep(s=>s-1); }

  if (!open) return null;

  const s = STEPS[step];

  return (
    <AnimatePresence>
      <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-full max-w-sm">
        <div className="rounded-2xl border border-white/10 shadow-2xl overflow-hidden" style={{background:'#0A1929'}}>
          {/* Progress bar */}
          <div className="h-1 bg-white/10"><div className="h-full bg-yellow-400 transition-all" style={{width:`${((step+1)/STEPS.length)*100}%`}}/></div>
          <div className="p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="text-3xl">{s.emoji}</div>
              <button onClick={finish} className="p-1 text-white/30 hover:text-white/60"><X className="h-4 w-4"/></button>
            </div>
            <h3 className="text-sm font-bold text-white mb-1">{s.title} ({step+1}/{STEPS.length})</h3>
            <p className="text-xs text-white/50 leading-relaxed mb-4">{s.desc}</p>
            <div className="flex items-center gap-2">
              {step>0 && <button onClick={prev} className="p-2 rounded-lg border border-white/10 text-white/40 hover:text-white/60"><ArrowLeft className="h-4 w-4"/></button>}
              <button onClick={next} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold text-white"
                style={{background:'linear-gradient(135deg,#FFD700,#FF9500)',color:'#0A1929'}}>
                {step<STEPS.length-1 ? <><ArrowRight className="h-4 w-4"/>Next</> : <><CheckCircle className="h-4 w-4"/>Got It!</>}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
