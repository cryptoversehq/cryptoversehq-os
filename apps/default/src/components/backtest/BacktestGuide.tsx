import React, { useState } from 'react';
import { Lightbulb, X, ChevronRight, ChevronLeft, CheckCircle, FlaskConical } from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS = [
  {
    icon: '📅',
    title: 'Choose Coin & Timeframe',
    desc: 'Select a cryptocurrency (BTC, ETH, SOL...) and a candle timeframe (1h, 4h, 1D...). Longer timeframes give fewer candles but cover more calendar time.'
  },
  {
    icon: '🎯',
    title: 'Pick a Strategy',
    desc: 'Choose "My Strategy" to configure Grid, DCA, or Martingale parameters. Or load a published strategy from the Marketplace.'
  },
  {
    icon: '▶️',
    title: 'Run Backtest',
    desc: 'Click "Run Backtest" — the engine simulates every trade over your chosen date range using synthetic market data. Results appear in seconds.'
  },
  {
    icon: '📊',
    title: 'Analyze Results',
    desc: 'Check P&L, Win Rate, Sharpe Ratio, and Max Drawdown. The equity curve shows your balance over time — green is profit, red is loss.'
  },
  {
    icon: '🚀',
    title: 'Deploy or Save',
    desc: 'Save the strategy to the Marketplace, deploy it in the live simulator, or submit results to a competition. Your history is saved automatically.'
  },
];

interface BacktestGuideProps {
  onDismiss: () => void;
}

export function BacktestGuide({ onDismiss }: BacktestGuideProps) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];

  return (
    <div className="bg-card border border-amber-500/20 rounded-2xl p-5 shadow-lg mb-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-amber-400" />
          <h3 className="font-semibold text-sm">Backtest Quick Start</h3>
        </div>
        <button onClick={onDismiss} className="p-1 rounded hover:bg-secondary text-muted-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Step indicator */}
      <div className="flex gap-1.5 mb-4">
        {STEPS.map((_, i) => (
          <div key={i} className={cn('h-1.5 flex-1 rounded-full transition-all',
            i === step ? 'bg-amber-400' :
            i < step ? 'bg-green-500' : 'bg-secondary/50'
          )} />
        ))}
      </div>

      {/* Step content */}
      <div className="flex items-start gap-4 mb-4">
        <span className="text-3xl flex-shrink-0">{current.icon}</span>
        <div>
          <p className="font-bold text-sm mb-1">
            Step {step + 1}/{STEPS.length}: {current.title}
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">{current.desc}</p>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {step === STEPS.length - 1 ? 'Ready to start!' : `${step + 1} of ${STEPS.length}`}
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

export default BacktestGuide;
