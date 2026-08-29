import React from 'react';
import { motion } from 'framer-motion';
import { Brain, GraduationCap, ShieldCheck, TrendingUp } from 'lucide-react';
import { LandingSection, SectionLabel, SectionHeading, SectionSubtitle } from './LandingSection';

const TRUST_ITEMS = [
  {
    icon: Brain,
    title: 'AI-Guided Learning',
    desc: 'Learn with Lynx AI through personalized explanations, instant feedback, and adaptive guidance tailored to your progress.',
  },
  {
    icon: GraduationCap,
    title: 'Structured Learning Path',
    desc: 'Follow a clear step-by-step curriculum designed to build knowledge progressively—from fundamentals to advanced trading skills.',
  },
  {
    icon: ShieldCheck,
    title: 'Risk-Free Practice',
    desc: 'Apply what you learn using a $100,000 virtual portfolio before risking real capital.',
  },
  {
    icon: TrendingUp,
    title: 'Build Real Confidence',
    desc: 'Gain experience through practice, track your progress, and develop the confidence to make informed decisions independently.',
  },
];

export function LandingTrust() {
  return (
    <LandingSection id="trust" alt>
      <div className="text-center mb-14">
        <SectionLabel>WHY LEARN WITH US</SectionLabel>
        <SectionHeading>Learn the Right Way—Before You Risk Real Money</SectionHeading>
        <SectionSubtitle>
          Build real skills through structured learning, personalized AI guidance,
          and risk-free practice before entering real markets.
        </SectionSubtitle>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {TRUST_ITEMS.map(({ icon: Icon, title, desc }) => (
          <motion.div
            key={title}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.35 }}
            className="group p-6 rounded-2xl border bg-card hover:border-primary/20 hover:shadow-md transition-all duration-300"
          >
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/15 transition-colors">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <h3 className="text-base font-bold text-foreground mb-2">{title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
          </motion.div>
        ))}
      </div>
    </LandingSection>
  );
}
