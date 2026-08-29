import React from 'react';
import { BarChart3, Shield, Coins, TrendingUp } from 'lucide-react';
import { LandingSection, SectionLabel, SectionHeading, SectionSubtitle } from './LandingSection';

const HIGHLIGHTS = [
  { icon: Coins, label: '$100K Virtual Portfolio', desc: 'Start with virtual funds and learn by doing before investing real capital.' },
  { icon: BarChart3, label: 'Live Market Simulation', desc: 'Practice using live market data and realistic trading scenarios designed for learning.' },
  { icon: TrendingUp, label: 'AI Performance Review', desc: 'Receive personalized feedback after every practice session to understand what went well and what you can improve.' },
  { icon: Shield, label: 'Risk-Free Learning', desc: 'Experiment freely, learn from mistakes, and build confidence before entering real markets.' },
];

export function LandingSimulator() {
  return (
    <LandingSection id="simulator" alt>
      <div className="text-center mb-14">
        <SectionLabel>PRACTICE WITHOUT RISK</SectionLabel>
        <SectionHeading>Practice Like It's Real—Without the Risk</SectionHeading>
        <SectionSubtitle>
          Build confidence by practicing in realistic market conditions using a $100,000 virtual
          portfolio, real-time market data, and AI-powered feedback—all without risking real money.
        </SectionSubtitle>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {HIGHLIGHTS.map(({ icon: Icon, label, desc }) => (
          <div key={label} className="p-6 rounded-2xl border bg-card hover:border-primary/15 transition-all duration-300">
            <Icon className="h-6 w-6 text-primary mb-4" />
            <h3 className="text-sm font-bold text-foreground mb-2">{label}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>
    </LandingSection>
  );
}
