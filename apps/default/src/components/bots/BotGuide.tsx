import React, { useState } from 'react';
import { Lightbulb, X, ChevronRight, ChevronLeft, CheckCircle, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS = [
  {
    icon: '🤖',
    title: 'Choose Bot Type',
    desc: 'Select from Grid, DCA, Martingale, Arbitrage, or Rebalancing. Each strategy suits different market conditions. Grid is great for ranging markets, DCA for volatile dips, Martingale for high-risk recovery.'
  },
  {
    icon: '⚙️',
    title: 'Configure Parameters',
    desc: 'Set your bot parameters — coin, investment amount, grid count, price range, and risk level. Use the AI Suggest button to get optimized parameters based on current market conditions.'
  },
  {
    icon: '🔬',
    title: 'Test with Backtest',
    desc: 'Run a backtest on your bot\'s strategy before deploying. The engine simulates every trade over historical data so you can see expected P&L, win rate, and max drawdown.'
  },
  {
    icon: '🚀',
    title: 'Deploy to Simulator',
    desc: 'Deploy your bot in the Trading Simulator. It will execute automatically on live price ticks — buy and sell in real time with simulated $100K capital.'
  },
  {
    icon: '📊',
    title: 'Monitor Performance',
    desc: 'Track your bot\'s P&L, win rate, equity curve, and trade history in the Bot Details page. Compare live results against the original backtest to spot deviations.'
  },
];

interface BotGuideProps {
  onDismiss: () => void;
}

export function BotGuide({ onDismiss }: BotGuideProps) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];

  return (
    <div className="bg-card border border-amber-500/20 rounded-2xl p-5 shadow-lg mb-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-amber-400" />
          <h3 className="font-semibold text-sm">Bot Quick Start</h3>
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
        <span className="text-xs text-muted-foreground">
          {step === STEPS.length - 1 ? 'Ready to create!' : `${step + 1} of ${STEPS.length}`}
        </span>
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

export default BotGuide;
