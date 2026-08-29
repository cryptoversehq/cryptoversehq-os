import React from 'react';
import { BookOpen, Sparkles, Shield } from 'lucide-react';
import { LandingSection, SectionLabel, SectionHeading, SectionSubtitle } from './LandingSection';

const PILLARS = [
  {
    icon: BookOpen,
    title: 'Structured Curriculum',
    desc: 'Crypto is complex, so lessons are broken into progressive modules with quizzes and hands-on exercises. No skipping steps.',
    iconBg: 'bg-blue-500/10',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  {
    icon: Sparkles,
    title: 'AI-Powered Feedback',
    desc: 'Lynx AI reviews your trades, explains what went right or wrong, and adapts recommendations to your skill level.',
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
  },
  {
    icon: Shield,
    title: 'Risk-Free Environment',
    desc: 'A fully simulated market with virtual funds means you can make mistakes, experiment with strategies, and learn — all without financial consequences.',
    iconBg: 'bg-emerald-500/10',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
];

export function AboutHowWeTeach() {
  return (
    <LandingSection id="about-how-we-teach" alt>
      <div className="text-center mb-14">
        <SectionLabel>How We Teach</SectionLabel>
        <SectionHeading>Deliberate practice meets AI mentorship.</SectionHeading>
        <SectionSubtitle>
          Three principles that shape every lesson, every simulation, and every piece of feedback on the platform.
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
