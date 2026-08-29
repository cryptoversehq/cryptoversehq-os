/**
 * SentimentGuide.tsx
 * Beginner education guide for Sentiment Analysis.
 * Shows on first visit, dismissible to localStorage.
 */
import React, { useState } from 'react';
import { Lightbulb, X, ChevronRight, ChevronLeft, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS = [
  {
    icon: '📊',
    title: 'What is Sentiment Analysis?',
    desc: 'Sentiment analysis measures the overall mood of the crypto market by analyzing social media posts, news articles, and community discussions. A positive sentiment (bullish) means most people are optimistic about a coin, while negative sentiment (bearish) signals caution. CryptoVerse tracks sentiment scores from 0-100 across 8 major cryptocurrencies in real-time.'
  },
  {
    icon: '📈',
    title: 'Understanding Fear & Greed Index',
    desc: 'The Fear & Greed Index (0-100) is the most widely-used sentiment indicator in crypto. Below 25 = Extreme Fear (often a buying opportunity), 26-40 = Fear, 41-60 = Neutral, 61-75 = Greed, 76-100 = Extreme Greed (often a selling signal). Legendary investor Warren Buffett advises: "Be fearful when others are greedy, and greedy when others are fearful." Use the gauge to spot market extremes.'
  },
  {
    icon: '📱',
    title: 'Social Media Sentiment',
    desc: 'Social media platforms like Twitter/X, Reddit, and Telegram generate massive crypto discussion volume. CryptoVerse tracks post frequency, engagement, and tone to compute a weighted sentiment score for each coin. High social volume with negative sentiment can signal a local bottom, while excessive hype often precedes a correction. The Social tab lets you filter by platform and symbol.'
  },
  {
    icon: '📰',
    title: 'News Sentiment Analysis',
    desc: 'Crypto news moves markets. Regulatory announcements, protocol upgrades, and exchange listings can dramatically shift sentiment in minutes. The News tab shows the latest headlines with AI-assigned sentiment labels (Bullish/Bearish/Neutral). Pay special attention to news clusters -- multiple bullish articles about the same coin often precede price rallies.'
  },
  {
    icon: '🎯',
    title: 'How to Use Sentiment for Trading',
    desc: '1) Check the Fear & Greed gauge before every trade. 2) Look for divergence between price and sentiment (price rising + sentiment falling = warning sign). 3) Use sentiment alerts to get notified when a coin enters Extreme Fear or Greed. 4) Cross-reference social sentiment with news sentiment -- they should agree for a high-confidence signal. 5) Never trade on sentiment alone -- always combine with technical analysis and on-chain data.'
  },
];

interface SentimentGuideProps {
  onDismiss: () => void;
}

export function SentimentGuide({ onDismiss }: SentimentGuideProps) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];

  return (
    <div className="bg-card border border-amber-500/20 rounded-2xl p-5 shadow-lg mb-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-amber-400" />
          <h3 className="font-semibold text-sm text-foreground">Sentiment Analysis Quick Start</h3>
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
        <span className="text-xs text-muted-foreground">{step === STEPS.length - 1 ? 'Ready to use sentiment data!' : `${step + 1} of ${STEPS.length}`}</span>
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

export default SentimentGuide;
