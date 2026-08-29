/**
 * EventsGuide.tsx
 * Beginner education guide for Live Events & Competitions.
 * Shows on first visit, dismissible to localStorage.
 */
import React, { useState } from 'react';
import { Lightbulb, X, ChevronRight, ChevronLeft, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS = [
  {
    icon: '🏆',
    title: 'What are CryptoVerse HQ Events?',
    desc: 'CryptoVerse HQ Events are live competitions, webinars, and challenges where you can compete against other traders, learn from experts, and win real rewards (CP coins, XP, badges, and virtual cash). Events run on a schedule -- some are weekend-long competitions, others are quick 2-hour flash challenges. You can participate individually or join a team for team battles.'
  },
  {
    icon: '📋',
    title: 'Types of Events',
    desc: 'There are 6 event types: Weekend Warrior (48-hour trading comp every weekend), Monthly Championship (30-day competition with tiered prizes), Team Battle (team-based PvP with live chat), Live Webinar (educational sessions with expert speakers), Flash Challenge (quick time-limited events, 2-4 hours), and Market Analysis Live (real-time market analysis with Q&A). Each type has unique rules and rewards.'
  },
  {
    icon: '✍️',
    title: 'How to Register',
    desc: 'Browse the Events Dashboard to see upcoming and live events. Click any event card to view details -- rules, prizes, requirements, and speaker info. If you meet the minimum level requirement and the event has capacity, click "Join Event" to register. Some events may require a small CP entry fee which goes toward the prize pool. You will receive a confirmation notification immediately.'
  },
  {
    icon: '⚔️',
    title: 'How to Participate',
    desc: 'Once registered, simply trade as you normally would in the Trading Simulator. Your PnL, win rate, and volume are automatically tracked during the event period. For team battles, coordinate with your team in the event chat. For webinars, tune in at the scheduled time and participate in Q&A. Your results appear on the live leaderboard -- check your ranking anytime during the event.'
  },
  {
    icon: '🎁',
    title: 'Prizes and Rewards',
    desc: 'Prizes are distributed automatically when an event ends: 1st place gets the largest reward, but many events give rewards to top 10, top 50, or even all participants. Rewards include CP coins (platform currency), XP (Academy experience points), virtual cash (for simulator trading), exclusive badges, and even plan upgrades. Your prizes appear in your wallet and profile immediately after the event concludes.'
  },
];

interface EventsGuideProps {
  onDismiss: () => void;
}

export function EventsGuide({ onDismiss }: EventsGuideProps) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];

  return (
    <div className="bg-card border border-amber-500/20 rounded-2xl p-5 shadow-lg mb-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-amber-400" />
          <h3 className="font-semibold text-sm text-foreground">Events & Competitions Quick Start</h3>
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
        <span className="text-xs text-muted-foreground">{step === STEPS.length - 1 ? 'Ready to compete!' : `${step + 1} of ${STEPS.length}`}</span>
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

export default EventsGuide;
