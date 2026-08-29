import React from 'react';
import { Trophy, Users, Calendar, TrendingUp } from 'lucide-react';
import { LandingSection, SectionLabel, SectionHeading, SectionSubtitle } from './LandingSection';

export function LandingCompetitions() {
  return (
    <LandingSection id="competitions">
      <div className="text-center mb-14">
        <SectionLabel>COMPETE & GROW</SectionLabel>
        <SectionHeading>Learn Together. Improve Together.</SectionHeading>
        <SectionSubtitle>
          Challenge yourself through friendly competitions, climb the leaderboard,
          and track your progress while improving your trading skills in a risk-free environment.
        </SectionSubtitle>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {[
          { icon: Trophy, title: 'Weekly Challenges', desc: 'Complete new trading challenges every week and strengthen your decision-making skills.' },
          { icon: Users, title: 'Compete at Your Level', desc: 'Compete with learners at your experience level and improve together.' },
          { icon: Calendar, title: 'Seasonal Events', desc: 'Join special learning events with unique market scenarios and exclusive achievements.' },
          { icon: TrendingUp, title: 'Track Your Growth', desc: 'Measure your improvement through rankings, achievements, and performance insights over time.' },
        ].map(({ icon: Icon, title, desc }) => (
          <div key={title} className="p-6 rounded-2xl border bg-card hover:border-primary/15 transition-all duration-300">
            <Icon className="h-6 w-6 text-primary mb-4" />
            <h3 className="text-sm font-bold text-foreground mb-2">{title}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 text-center">
        <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted text-xs font-medium text-muted-foreground">
          <span className="w-2 h-2 rounded-full bg-primary" />
          Built for Learning, Not Gambling
        </span>
      </div>
    </LandingSection>
  );
}
