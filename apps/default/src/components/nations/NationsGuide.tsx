import React, { useState } from 'react';
import { Lightbulb, X, ChevronRight, ChevronLeft, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS = [
  { icon: '🌍', title: 'What are Nations?', desc: 'Nations are competitive teams of traders on CryptoVerse. There are four nations: Alpha Republic (quant/algorithmic traders), Bull Empire (long-only optimists), Sigma Order (arbitrage/secretive traders), and Bear Collective (short sellers/contrarians). Each nation has unique perks, stats, and a distinct trading philosophy.' },
  { icon: '✍️', title: 'Joining a Nation', desc: 'Click the green Join button on any nation card to become a member. Your nation appears on your profile and leaderboard entries. You can only be in one nation at a time. To switch, leave your current nation first. There are no level restrictions — anyone can join any nation.' },
  { icon: '🎁', title: 'Nation Perks and Benefits', desc: 'Each nation offers unique perks: Alpha Republic gives a daily 5% XP boost and access to quant tools. Bull Empire offers long position fee rebates and monthly tournaments. Sigma Order provides arbitrage scanners and research reports. Bear Collective grants volatility hunting tools and short signal channels.' },
  { icon: '⚔️', title: 'Faction Wars', desc: 'Faction Wars are periodic competitions between nations where members contribute War Points through their trading performance (PnL, volume, win streaks). The war countdown shows time remaining until the next scoring period ends. Your trades automatically contribute to your nation War Score.' },
  { icon: '🚀', title: 'How to Contribute', desc: '1) Trade actively in the simulator — every trade with positive PnL contributes to your nation. 2) Build trading streaks for bonus War Points. 3) Participate in nation chat to coordinate strategies. 4) Recruit other traders to grow your nation. 5) Check the nation leaderboard to track your ranking.' },
];

interface Props { onDismiss: () => void; }

export function NationsGuide({ onDismiss }: Props) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  return (
    <div className="bg-card border border-amber-500/20 rounded-2xl p-5 shadow-lg mb-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2"><Lightbulb className="h-4 w-4 text-amber-400" /><h3 className="font-semibold text-sm text-foreground">Nations Quick Start</h3></div>
        <button onClick={onDismiss} className="p-1 rounded hover:bg-secondary text-muted-foreground"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex gap-1.5 mb-4">{STEPS.map((_, i) => (<div key={i} className={cn('h-1.5 flex-1 rounded-full transition-all', i === step ? 'bg-amber-400' : i < step ? 'bg-green-500' : 'bg-secondary/50')} />))}</div>
      <div className="flex items-start gap-4 mb-4"><span className="text-3xl flex-shrink-0">{current.icon}</span><div><p className="font-bold text-sm text-foreground mb-1">Step {step + 1}/{STEPS.length}: {current.title}</p><p className="text-xs text-muted-foreground leading-relaxed">{current.desc}</p></div></div>
      <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">{step === STEPS.length - 1 ? 'Ready to choose your nation!' : `${step + 1} of ${STEPS.length}`}</span><div className="flex gap-2">{step > 0 && (<button onClick={() => setStep(s => s - 1)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-secondary/50 text-muted-foreground hover:text-foreground transition-all"><ChevronLeft className="h-3 w-3" /> Back</button>)}{step < STEPS.length - 1 ? (<button onClick={() => setStep(s => s + 1)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/25 hover:bg-amber-500/25 transition-all">Next <ChevronRight className="h-3 w-3" /></button>) : (<button onClick={onDismiss} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-500/15 text-green-400 border border-green-500/25 hover:bg-green-500/25 transition-all"><CheckCircle className="h-3 w-3" /> Got it!</button>)}</div></div>
    </div>
  );
}
export default NationsGuide;
