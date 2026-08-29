import React from 'react';
import { BrainCircuit, FlaskConical, Target, Gift } from 'lucide-react';
import { LandingSection, SectionLabel, SectionHeading, SectionSubtitle } from './LandingSection';

const DIFFERENTIATORS = [
  {
    icon: BrainCircuit,
    title: 'AI in Every Lesson',
    desc: "Lynx AI is there from day one — guiding your lessons, reviewing your trades, and helping you grow. Not a chatbot tacked on as an afterthought.",
    iconBg: 'bg-violet-500/10',
    iconColor: 'text-violet-500 dark:text-violet-400',
  },
  {
    icon: FlaskConical,
    title: 'Practice Before Risk',
    desc: 'Every concept you learn goes straight into the simulator. Apply new skills immediately with real market data and zero financial risk.',
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
  },
  {
    icon: Target,
    title: 'Learn Skills, Not Hype',
    desc: "No 'get rich quick' promises. No signal groups. Progress is measured by what you understand and can do — not by what you 'could have' made.",
    iconBg: 'bg-amber-500/10',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  {
    icon: Gift,
    title: 'Free to Start',
    desc: 'The full academy, simulator, and AI mentor are free forever. No credit card required. Upgrade only if and when you are ready.',
    iconBg: 'bg-emerald-500/10',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
];

export function AboutBuiltDifferent() {
  return (
    <LandingSection id="about-built-different">
      <div className="text-center mb-14">
        <SectionLabel>Built Different</SectionLabel>
        <SectionHeading>Not another crypto course. Not another trading bot.</SectionHeading>
        <SectionSubtitle>
          Here is what makes CryptoVerseHQ fundamentally different from everything else out there.
        </SectionSubtitle>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-4xl mx-auto">
        {DIFFERENTIATORS.map(({ icon: Icon, title, desc, iconBg, iconColor }) => (
          <div
            key={title}
            className="flex flex-col items-start text-left p-8 rounded-2xl border bg-card hover:border-primary/15 hover:shadow-md transition-all duration-300"
          >
            <div className={`w-12 h-12 rounded-xl ${iconBg} flex items-center justify-center mb-4`}>
              <Icon className={`h-6 w-6 ${iconColor}`} />
            </div>
            <h3 className="text-lg font-bold text-foreground mb-2">{title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>
    </LandingSection>
  );
}
