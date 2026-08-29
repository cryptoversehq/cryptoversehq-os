/**
 * OnChainGuide.tsx
 * Beginner education guide for On-Chain Analysis.
 * Shows on first visit, dismissible to localStorage.
 */
import React, { useState } from 'react';
import { Lightbulb, X, ChevronRight, ChevronLeft, CheckCircle, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS = [
  {
    icon: '⛓️',
    title: 'What is On-Chain Analysis?',
    desc: 'On-chain analysis examines blockchain data directly — transactions, wallet activity, and fund flows — to understand market sentiment, whale behavior, and capital movement. Unlike price charts, on-chain data shows what money is actually doing in real-time across Ethereum, Bitcoin, BNB Chain, Solana, and Polygon.'
  },
  {
    icon: '🐋',
    title: 'Understanding Whale Activity',
    desc: 'Whales are wallets holding or moving large amounts of crypto. When a whale moves $5M+ in a single transaction, it often signals an upcoming market move. Whale tracking lets you spot accumulation (buying) and distribution (selling) before prices react. Key alerts include: large exchange deposits (bearish), withdrawals (bullish), and wallet-to-wallet transfers.'
  },
  {
    icon: '🧠',
    title: 'Smart Money Tracking',
    desc: 'Smart money wallets belong to consistently profitable traders and institutions. Following their moves can give you an edge — if a wallet with an 80%+ win rate is buying SOL, it might be worth paying attention. The Smart Money table ranks wallets by PnL, win rate, and trade consistency across all 5 chains.'
  },
  {
    icon: '💱',
    title: 'Exchange Flow Analysis',
    desc: 'Exchange flows measure how much crypto is moving into or out of centralized exchanges (Binance, Coinbase, Kraken, etc.). High inflows to exchanges typically mean selling pressure (bearish), while high outflows suggest accumulation and holding (bullish). Watching exchange flows alongside whale alerts gives you a powerful market perspective.'
  },
  {
    icon: '🎯',
    title: 'How to Use On-Chain Data for Trading',
    desc: '1) Set whale alerts for your favorite chains. 2) Watch for clusters of large exchange inflows or outflows. 3) Track smart money wallets to see what they are buying. 4) Use trending tokens with high whale activity to find momentum plays. 5) Combine on-chain signals with technical analysis for higher-confidence entries and exits. Remember: on-chain data is a leading indicator -- it shows what is happening BEFORE it appears on price charts.'
  },
];

interface OnChainGuideProps {
  onDismiss: () => void;
}

export function OnChainGuide({ onDismiss }: OnChainGuideProps) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];

  return (
    <div className="bg-card border border-amber-500/20 rounded-2xl p-5 shadow-lg mb-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-amber-400" />
          <h3 className="font-semibold text-sm text-foreground">On-Chain Analysis Quick Start</h3>
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
          <p className="font-bold text-sm text-foreground mb-1">Step {step + 1}/{STEPS.length}: {current.title}</p>
          <p className="text-xs text-muted-foreground leading-relaxed">{current.desc}</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{step === STEPS.length - 1 ? 'Ready to explore on-chain data!' : `${step + 1} of ${STEPS.length}`}</span>
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

export default OnChainGuide;
