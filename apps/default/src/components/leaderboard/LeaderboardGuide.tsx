import React, { useState } from 'react';
import { Lightbulb, X, ChevronRight, ChevronLeft, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS = [
  { icon: '🏆', title: 'What is the Leaderboard?', desc: 'The CryptoVerse Leaderboard ranks the best traders on the platform based on their simulation performance. Rankings are calculated from your trading P&L, win rate, volume, and consistency. The leaderboard is divided into three categories: Top Traders (individual rankings), Nations & Clans (team rankings), and Top Creators (strategy marketplace publishers).' },
  { icon: '📊', title: 'Top Traders Rankings', desc: 'Top Traders shows the highest-performing individual traders. Rankings are determined by portfolio value, win rate, recent P&L changes, and trading streaks. Your position is highlighted in blue — check it regularly to track your improvement. The table shows: Rank, Trader name, Level, Nation, Win Rate, Portfolio value, and Win Streak.' },
  { icon: '🌍', title: 'Nations & Clans', desc: 'Nations are teams of traders who compete together. There are four nations: Alpha Republic (quant traders), Bull Empire (long-only), Sigma Order (arbitrage), and Bear Collective (short sellers). Joining a nation gives you access to the Nation Chat Room and lets you contribute to your nation ranking. Nations are scored by: total members, trading volume, and weekly PnL.' },
  { icon: '🛒', title: 'Top Creators', desc: 'Top Creators ranks users who publish trading strategies on the CryptoVerse Marketplace. Rankings are based on strategy rating, total sales, and community reviews. Publishing high-quality strategies can earn you CP coins and build your reputation as a creator.' },
  { icon: '🚀', title: 'How to Improve Your Ranking', desc: '1) Trade consistently in the simulator to build your portfolio. 2) Focus on win rate — quality trades over quantity. 3) Build trading streaks (consecutive wins) for bonus ranking points. 4) Join a nation to contribute to team rankings and access nation-exclusive events. 5) Publish strategies on the Marketplace if you want to rank as a creator.' },
];

interface Props { onDismiss: () => void; }

export function LeaderboardGuide({ onDismiss }: Props) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  return (
    <div className="bg-card border border-amber-500/20 rounded-2xl p-5 shadow-lg mb-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2"><Lightbulb className="h-4 w-4 text-amber-400" /><h3 className="font-semibold text-sm text-foreground">Leaderboard Quick Start</h3></div>
        <button onClick={onDismiss} className="p-1 rounded hover:bg-secondary text-muted-foreground"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex gap-1.5 mb-4">{STEPS.map((_, i) => (<div key={i} className={cn('h-1.5 flex-1 rounded-full transition-all', i === step ? 'bg-amber-400' : i < step ? 'bg-green-500' : 'bg-secondary/50')} />))}</div>
      <div className="flex items-start gap-4 mb-4"><span className="text-3xl flex-shrink-0">{current.icon}</span><div><p className="font-bold text-sm text-foreground mb-1">Step {step + 1}/{STEPS.length}: {current.title}</p><p className="text-xs text-muted-foreground leading-relaxed">{current.desc}</p></div></div>
      <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">{step === STEPS.length - 1 ? 'Ready to climb the ranks!' : `${step + 1} of ${STEPS.length}`}</span><div className="flex gap-2">{step > 0 && (<button onClick={() => setStep(s => s - 1)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-secondary/50 text-muted-foreground hover:text-foreground transition-all"><ChevronLeft className="h-3 w-3" /> Back</button>)}{step < STEPS.length - 1 ? (<button onClick={() => setStep(s => s + 1)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/25 hover:bg-amber-500/25 transition-all">Next <ChevronRight className="h-3 w-3" /></button>) : (<button onClick={onDismiss} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-500/15 text-green-400 border border-green-500/25 hover:bg-green-500/25 transition-all"><CheckCircle className="h-3 w-3" /> Got it!</button>)}</div></div>
    </div>
  );
}
export default LeaderboardGuide;
