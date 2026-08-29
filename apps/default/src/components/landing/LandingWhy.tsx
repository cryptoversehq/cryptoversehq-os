import React from 'react';
import { BookOpen, Gamepad2, TrendingUp } from 'lucide-react';
import { LandingSection, SectionLabel, SectionHeading, SectionSubtitle } from './LandingSection';

const PILLARS = [
  {
    icon: BookOpen,
    title: 'Learn',
    desc: 'Master crypto fundamentals, technical analysis, risk management, and trading psychology through structured AI-guided lessons.',
    color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    iconBg: 'bg-blue-500/10',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  {
    icon: Gamepad2,
    title: 'Practice',
    desc: 'Apply what you learn in a realistic simulator with live market data. Deploy practice bots, join competitions, and track your progress.',
    color: 'bg-primary/10 text-primary',
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
  },
  {
    icon: TrendingUp,
    title: 'Improve',
    desc: 'Get AI-powered feedback on every trade. Review your performance metrics, identify patterns, and continuously refine your strategy.',
    color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    iconBg: 'bg-emerald-500/10',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
];

export function LandingWhy() {
  return (
    <LandingSection id="why">
      <div className="text-center mb-14">
        <SectionLabel>Our Approach</SectionLabel>
        <SectionHeading>Learn. Practice. Improve.</SectionHeading>
        <SectionSubtitle>
          Three pillars that turn beginners into confident traders through deliberate practice and AI guidance.
        </SectionSubtitle>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
        {PILLARS.map(({ icon: Icon, title, desc, iconBg, iconColor }) => (
          <div
            key={title}
            className="flex flex-col items-center text-center p-8 rounded-2xl border bg-card hover:border-primary/15 hover:shadow-md transition-all duration-300"
          >
            <div className={`w-14 h-14 rounded-2xl ${iconBg} flex items-center justify-center mb-5`}>
              <Icon className={`h-7 w-7 ${iconColor}`} />
            </div>
            <h3 className="text-xl font-bold text-foreground mb-3">{title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>
    </LandingSection>
  );
}
