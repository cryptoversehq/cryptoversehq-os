/**
 * ExchangeGuide.tsx
 * Beginner education guide for Real Exchange Trading.
 * Shows on first visit, dismissible to localStorage.
 */
import React, { useState } from 'react';
import { Lightbulb, X, ChevronRight, ChevronLeft, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS = [
  {
    icon: '🔗',
    title: 'What is Real Exchange Trading?',
    desc: 'Real Exchange Trading connects your actual exchange accounts (Binance, Coinbase, Kraken, OKX) to CryptoVerse, allowing you to manage your real portfolio, execute trades, and deploy strategies from one unified platform. This is NOT paper trading -- orders executed here use your real funds on the exchange. Because real money is involved, this feature requires Academy Level 10+ to unlock.'
  },
  {
    icon: '🔑',
    title: 'API Keys and Security',
    desc: 'API keys are like passwords for programmatic access to your exchange account. CryptoVerse uses READ-ONLY API keys by default and NEVER requests withdrawal permissions. Your keys are masked (only first 6 + last 4 characters visible) and all connections use HTTPS encryption. IMPORTANT: Create a dedicated API key with ONLY Read and Trade permissions -- never share your Secret key, and revoke it immediately if you suspect compromise.'
  },
  {
    icon: '🔌',
    title: 'Connecting Your Exchange',
    desc: 'The connection process has 5 steps: 1) Choose your exchange from the list of supported platforms. 2) Enter your API Key and Secret (create these in your exchange settings). 3) Review permissions -- CryptoVerse HQ only requests Read and Trade access, never Withdraw. 4) Set up risk controls -- daily loss limits and position caps. 5) Confirmation! Your exchange will appear as Connected in the dashboard.'
  },
  {
    icon: '🛡️',
    title: 'Risk Management',
    desc: 'Before trading real funds, configure your risk controls: Daily Loss Limit (stops all trading if your daily loss exceeds this amount), Max Position Size (caps single trade size as a percentage of portfolio), Max Leverage (prevents dangerous over-leveraging), and Stop-Loss Automatic (automatically places stop orders on all positions). These controls are enforced at the platform level -- they cannot be bypassed from the trading interface.'
  },
  {
    icon: '📈',
    title: 'Live Trading',
    desc: 'Once connected and risk controls are set, you can place real Market, Limit, and Stop-Limit orders. Your portfolio syncs automatically (configurable from 5 minutes to 1 hour). Trade history shows all your executed orders with P&L, fees, and status. You can also deploy backtested bot strategies directly to your exchange account. Remember: start small, use stop-losses, and never risk more than you can afford to lose.'
  },
];

interface ExchangeGuideProps { onDismiss: () => void; }

export function ExchangeGuide({ onDismiss }: ExchangeGuideProps) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  return (
    <div className="bg-card border border-amber-500/20 rounded-2xl p-5 shadow-lg mb-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2"><Lightbulb className="h-4 w-4 text-amber-400" /><h3 className="font-semibold text-sm text-foreground">Exchange Trading Quick Start</h3></div>
        <button onClick={onDismiss} className="p-1 rounded hover:bg-secondary text-muted-foreground"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex gap-1.5 mb-4">{STEPS.map((_, i) => (<div key={i} className={cn('h-1.5 flex-1 rounded-full transition-all', i === step ? 'bg-amber-400' : i < step ? 'bg-green-500' : 'bg-secondary/50')} />))}</div>
      <div className="flex items-start gap-4 mb-4"><span className="text-3xl flex-shrink-0">{current.icon}</span><div><p className="font-bold text-sm text-foreground mb-1">Step {step + 1}/{STEPS.length}: {current.title}</p><p className="text-xs text-muted-foreground leading-relaxed">{current.desc}</p></div></div>
      <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">{step === STEPS.length - 1 ? 'Ready to connect your exchange!' : `${step + 1} of ${STEPS.length}`}</span><div className="flex gap-2">{step > 0 && (<button onClick={() => setStep(s => s - 1)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-secondary/50 text-muted-foreground hover:text-foreground transition-all"><ChevronLeft className="h-3 w-3" /> Back</button>)}{step < STEPS.length - 1 ? (<button onClick={() => setStep(s => s + 1)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/25 hover:bg-amber-500/25 transition-all">Next <ChevronRight className="h-3 w-3" /></button>) : (<button onClick={onDismiss} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-500/15 text-green-400 border border-green-500/25 hover:bg-green-500/25 transition-all"><CheckCircle className="h-3 w-3" /> Got it!</button>)}</div></div>
    </div>
  );
}
export default ExchangeGuide;
