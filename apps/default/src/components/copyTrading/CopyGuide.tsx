import React, { useState } from 'react';
import { Lightbulb, X, ChevronRight, ChevronLeft, CheckCircle, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS = [
  {
    icon: '📋',
    title: 'What is Copy Trading?',
    desc: 'Copy trading lets you automatically mirror the trades of successful traders. When the trader you follow opens a BUY or SELL, the same trade is executed in your account proportionally. You earn when they earn, and lose when they lose — same strategy, same timing.'
  },
  {
    icon: '🔍',
    title: 'Choose a Trader',
    desc: 'Browse the leaderboard of top traders. Key stats to evaluate: Win Rate (higher = more consistent), Total Profit (higher = strong track record), Max Drawdown (lower = less risk), and Copy Fee (trader\'s commission on your profits).' 
  },
  {
    icon: '⚙️',
    title: 'Set Your Parameters',
    desc: 'Configure Copy % (50% means half the trader\'s position size), Stop Loss (automatic cut losses at X%), Max Daily Loss (safety cap), and which trade types to copy (Long, Short, or both).' 
  },
  {
    icon: '📊',
    title: 'Monitor Your Results',
    desc: 'Track your copy trading P&L, win rate, and active positions on the dashboard. Compare your performance against the trader\'s to see how closely your results match.' 
  },
  {
    icon: '🎯',
    title: 'Adjust & Optimize',
    desc: 'Pause, resume, or stop copying at any time. Adjust your copy settings as your risk tolerance changes. Learn from which traders perform best and diversify across multiple traders.' 
  },
];

interface CopyGuideProps {
  onDismiss: () => void;
}

export function CopyGuide({ onDismiss }: CopyGuideProps) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];

  return (
    <div className="bg-card border border-amber-500/20 rounded-2xl p-5 shadow-lg mb-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-amber-400" />
          <h3 className="font-semibold text-sm">Copy Trading Quick Start</h3>
        </div>
        <button onClick={onDismiss} className="p-1 rounded hover:bg-secondary text-muted-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex gap-1.5 mb-4">
        {STEPS.map((_, i) => (
          <div key={i} className={cn('h-1.5 flex-1 rounded-full transition-all',
            i === step ? 'bg-amber-400' : i < step ? 'bg-green-500' : 'bg-secondary/50')} />
        ))}
      </div>

      <div className="flex items-start gap-4 mb-4">
        <span className="text-3xl flex-shrink-0">{current.icon}</span>
        <div>
          <p className="font-bold text-sm mb-1">Step {step + 1}/{STEPS.length}: {current.title}</p>
          <p className="text-xs text-muted-foreground leading-relaxed">{current.desc}</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{step === STEPS.length - 1 ? 'Ready to start!' : `${step + 1} of ${STEPS.length}`}</span>
        <div className="flex gap-2">
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-secondary/50 text-muted-foreground hover:text-foreground transition-all">
              <ChevronLeft className="h-3 w-3" /> Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button onClick={() => setStep(s => s + 1)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/25 hover:bg-amber-500/25 transition-all">
              Next <ChevronRight className="h-3 w-3" />
            </button>
          ) : (
            <button onClick={onDismiss}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-500/15 text-green-400 border border-green-500/25 hover:bg-green-500/25 transition-all">
              <CheckCircle className="h-3 w-3" /> Got it!
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default CopyGuide;
