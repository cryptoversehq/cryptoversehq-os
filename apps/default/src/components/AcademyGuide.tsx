import React, { useState } from 'react';
import { Lightbulb, X, ChevronRight, ChevronLeft, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS = [
  { icon: '🎓', title: 'How Academy Works', desc: 'The CryptoVerse HQ Academy is your structured learning path to becoming a pro trader. It contains 9 modules covering blockchain basics, market analysis, risk management, DeFi, backtesting, sentiment analysis, on-chain data, live events, and real exchange trading. Each module has 3-5 lessons with a quiz at the end.' },
  { icon: '📚', title: 'Modules and Lessons', desc: 'Each module focuses on a specific topic. Read the lesson content carefully. Lessons are unlocked progressively based on your XP level. Completed modules show a green checkmark, locked modules show a lock icon, and available modules are highlighted.' },
  { icon: '⭐', title: 'XP and Level System', desc: 'You earn XP for every quiz you pass. XP determines your Level: Novice (0-500), Apprentice (500-1250), Analyst (1250-2250), and Pro Trader (2250+). Higher levels unlock more modules and platform features like Copy Trading.' },
  { icon: '💰', title: 'CP Rewards', desc: 'Every lesson earns 10 CP. Completing a module awards 50 CP bonus. Completing ALL modules awards 200 CP! CP is credited to your wallet immediately and can be used for Copy Trading fees, marketplace purchases, and more.' },
  { icon: '✅', title: 'Quizzes and Progression', desc: 'After reading each lesson, click Start Quiz. Each quiz has 4 multiple-choice options. Answer correctly to earn XP and CP. Wrong answers show the correct answer with an explanation. Track progress with the XP bar in the Academy header.' },
];

interface AcademyGuideProps { onDismiss: () => void; }

export function AcademyGuide({ onDismiss }: AcademyGuideProps) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  return (
    <div className="bg-card border border-amber-500/20 rounded-2xl p-5 shadow-lg mb-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2"><Lightbulb className="h-4 w-4 text-amber-400" /><h3 className="font-semibold text-sm text-foreground">Academy Quick Start</h3></div>
        <button onClick={onDismiss} className="p-1 rounded hover:bg-secondary text-muted-foreground"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex gap-1.5 mb-4">{STEPS.map((_, i) => (<div key={i} className={cn('h-1.5 flex-1 rounded-full transition-all', i === step ? 'bg-amber-400' : i < step ? 'bg-green-500' : 'bg-secondary/50')} />))}</div>
      <div className="flex items-start gap-4 mb-4"><span className="text-3xl flex-shrink-0">{current.icon}</span><div><p className="font-bold text-sm text-foreground mb-1">Step {step + 1}/{STEPS.length}: {current.title}</p><p className="text-xs text-muted-foreground leading-relaxed">{current.desc}</p></div></div>
      <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">{step === STEPS.length - 1 ? 'Ready to start learning!' : `${step + 1} of ${STEPS.length}`}</span><div className="flex gap-2">{step > 0 && (<button onClick={() => setStep(s => s - 1)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-secondary/50 text-muted-foreground hover:text-foreground transition-all"><ChevronLeft className="h-3 w-3" /> Back</button>)}{step < STEPS.length - 1 ? (<button onClick={() => setStep(s => s + 1)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/25 hover:bg-amber-500/25 transition-all">Next <ChevronRight className="h-3 w-3" /></button>) : (<button onClick={onDismiss} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-500/15 text-green-400 border border-green-500/25 hover:bg-green-500/25 transition-all"><CheckCircle className="h-3 w-3" /> Got it!</button>)}</div></div>
    </div>
  );
}
export default AcademyGuide;
