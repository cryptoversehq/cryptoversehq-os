import React from 'react';
import { Milestone, Compass, Rocket, Infinity } from 'lucide-react';
import { LandingSection, SectionLabel, SectionHeading, SectionSubtitle } from './LandingSection';

const STAGES = [
  {
    icon: Compass,
    step: '01',
    title: 'Beginner',
    desc: 'Learn crypto fundamentals, understand how markets work, and build your first skills with personalized AI guidance.',
    topics: ['Blockchain Fundamentals', 'Market Basics', 'Chart Reading 101'],
  },
  {
    icon: Milestone,
    step: '02',
    title: 'Intermediate',
    desc: 'Develop practical trading skills through technical analysis, risk management, and guided simulator practice.',
    topics: ['Technical Analysis', 'Risk Management', 'Strategy Building'],
  },
  {
    icon: Rocket,
    step: '03',
    title: 'Advanced',
    desc: 'Master advanced strategies, backtesting, market analysis, and confident decision-making in realistic trading scenarios.',
    topics: ['Advanced Strategies', 'On-Chain Analysis', 'Portfolio Theory'],
  },
  {
    icon: Infinity,
    step: '04',
    title: 'Continuous Growth',
    desc: 'Keep improving with AI insights, competitions, evolving market scenarios, and new learning content as your skills grow.',
    topics: ['Weekly AI Insights', 'Live Competitions', 'Community Learning'],
  },
];

export function LandingJourney() {
  return (
    <LandingSection id="learning-journey" alt>
      <div className="text-center mb-14">
        <SectionLabel>Learning Journey</SectionLabel>
        <SectionHeading>From First Lesson to Real Confidence</SectionHeading>
        <SectionSubtitle>
          Learn the fundamentals, practice with AI, build real trading skills,
          and grow your confidence—one step at a time.
        </SectionSubtitle>
      </div>

      <div className="relative">
        <div className="hidden lg:block absolute left-1/2 top-0 bottom-0 w-px bg-border -translate-x-1/2" />

        <div className="space-y-8 lg:space-y-0">
          {STAGES.map((stage, i) => {
            const isEven = i % 2 === 0;
            return (
              <div key={stage.step} className={`lg:flex items-center gap-5 ${isEven ? '' : 'lg:flex-row-reverse'}`}>
                <div className="hidden lg:flex items-center justify-center w-12 shrink-0 relative z-10">
                  <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-black shadow-lg shadow-primary/20">
                    {stage.step}
                  </div>
                </div>

                <div className={`flex-1 min-w-0 ${isEven ? 'lg:text-right' : ''}`}>
                  <div className="p-6 rounded-2xl border bg-card hover:border-primary/20 hover:shadow-sm transition-all duration-300 lg:ml-auto">
                    <div className="flex items-center gap-3 mb-3 lg:hidden">
                      <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-black">
                        {stage.step}
                      </div>
                      <h3 className="text-lg font-bold text-foreground">{stage.title}</h3>
                    </div>
                    <div className="hidden lg:flex items-center gap-3 mb-3">
                      <stage.icon className="h-5 w-5 text-primary shrink-0" />
                      <h3 className="text-lg font-bold text-foreground">{stage.title}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-4">{stage.desc}</p>
                    <div className="flex flex-wrap gap-2">
                      {stage.topics.map((t) => (
                        <span key={t} className="px-2.5 py-1 rounded-md bg-muted text-xs font-medium text-muted-foreground">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </LandingSection>
  );
}
