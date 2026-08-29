import React, { useState } from 'react';
import { Lightbulb, X, ChevronRight, ChevronLeft, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS = [
  { icon: '🧠', title: 'What is Twin League?', desc: 'Twin League is an AI-vs-AI trading competition where your personal AI Twin competes against other AI traders. Your twin is created from your trading history and simulator performance. Matches simulate real trading scenarios with CP stakes and prizes.' },
  { icon: '🤖', title: 'Your AI Twin', desc: 'Your AI Twin is automatically generated from your trading data — your win rate, PnL patterns, risk tolerance, and asset preferences all shape how your twin trades. The more you trade, the smarter your twin becomes. No setup needed.' },
  { icon: '⚔️', title: 'How Matches Work', desc: 'Matches pair your twin against opponent AI traders. Click Simulate to run the match — you will see streaming progress, score comparisons, and a narrative explaining the outcome. Each match has a CP stake, and the winner takes the prize pool.' },
  { icon: '💰', title: 'CP Stakes and Prizes', desc: 'Each match has a CP stake (250-1000 CP). Win and you earn CP. Higher stakes mean tougher opponents. Prizes are credited to your CP wallet automatically. Check your win/loss record in the match history.' },
  { icon: '📈', title: 'Improving Your Twin', desc: '1) Trade consistently in the simulator. 2) Focus on win rate — your twin inherits your trading consistency. 3) Try different asset pairs. 4) Review match narratives to learn from losses. 5) Aim for higher-stakes matches as your twin improves.' },
];

interface Props { onDismiss: () => void; }

export function TwinLeagueGuide({ onDismiss }: Props) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  return (
    <div className="bg-card border border-amber-500/20 rounded-2xl p-5 shadow-lg mb-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2"><Lightbulb className="h-4 w-4 text-amber-400" /><h3 className="font-semibold text-sm text-foreground">Twin League Quick Start</h3></div>
        <button onClick={onDismiss} className="p-1 rounded hover:bg-secondary text-muted-foreground"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex gap-1.5 mb-4">{STEPS.map((_, i) => (<div key={i} className={cn('h-1.5 flex-1 rounded-full transition-all', i === step ? 'bg-amber-400' : i < step ? 'bg-green-500' : 'bg-secondary/50')} />))}</div>
      <div className="flex items-start gap-4 mb-4"><span className="text-3xl flex-shrink-0">{current.icon}</span><div><p className="font-bold text-sm text-foreground mb-1">Step {step + 1}/{STEPS.length}: {current.title}</p><p className="text-xs text-muted-foreground leading-relaxed">{current.desc}</p></div></div>
      <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">{step === STEPS.length - 1 ? 'Ready to battle!' : `${step + 1} of ${STEPS.length}`}</span><div className="flex gap-2">{step > 0 && (<button onClick={() => setStep(s => s - 1)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-secondary/50 text-muted-foreground hover:text-foreground transition-all"><ChevronLeft className="h-3 w-3" /> Back</button>)}{step < STEPS.length - 1 ? (<button onClick={() => setStep(s => s + 1)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/25 hover:bg-amber-500/25 transition-all">Next <ChevronRight className="h-3 w-3" /></button>) : (<button onClick={onDismiss} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-500/15 text-green-400 border border-green-500/25 hover:bg-green-500/25 transition-all"><CheckCircle className="h-3 w-3" /> Got it!</button>)}</div></div>
    </div>
  );
}
export default TwinLeagueGuide;
