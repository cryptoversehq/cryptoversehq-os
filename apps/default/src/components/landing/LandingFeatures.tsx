import React from 'react';
import { motion } from 'framer-motion';
import {
  BookOpen, BarChart3, Bot, Brain, Globe, Shield,
  Trophy, Sparkles,
} from 'lucide-react';
import { LandingSection, SectionLabel, SectionHeading, SectionSubtitle } from './LandingSection';
import { cn } from '@/lib/utils';

const FEATURES = [
  {
    icon: BookOpen,
    title: 'Interactive Academy',
    desc: 'Structured courses that adapt to your level with AI-personalized learning paths.',
  },
  {
    icon: Brain,
    title: 'Lynx AI',
    desc: 'Get explanations, trade feedback, and personalized guidance from your AI learning companion.',
  },
  {
    icon: BarChart3,
    title: 'Trading Simulator',
    desc: 'Practice strategies with a $100K virtual portfolio in realistic market conditions.',
  },
  {
    icon: Trophy,
    title: 'Competitions & Leagues',
    desc: 'Compete in weekly challenges and measure your growth alongside other learners.',
  },
  {
    icon: Globe,
    title: 'Market Data & Analysis',
    desc: 'Understand what moves markets with real-time data and on-chain insights.',
  },
  {
    icon: Shield,
    title: 'Risk Management Tools',
    desc: 'Master position sizing, stop-loss placement, and portfolio diversification.',
  },
  {
    icon: Sparkles,
    title: 'Performance Analytics',
    desc: 'Track win rate, growth, and detailed metrics on every practice session.',
  },
  {
    icon: Bot,
    title: 'AI Practice Bots',
    desc: 'Deploy automated strategies in the simulator to learn algorithmic trading.',
  },
];

export function LandingFeatures() {
  return (
    <LandingSection id="features" alt>
      <div className="text-center mb-14">
        <SectionLabel>Platform Features</SectionLabel>
        <SectionHeading>Everything You Need to Learn Crypto with Confidence</SectionHeading>
        <SectionSubtitle>
          One integrated platform combining structured learning, AI coaching, simulator practice,
          competitions, analytics, and continuous improvement.
        </SectionSubtitle>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {FEATURES.map(({ icon: Icon, title, desc }) => (
          <motion.div
            key={title}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.35 }}
            className="group p-6 rounded-2xl border bg-card hover:border-primary/30 hover:shadow-lg transition-all duration-300"
          >
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/15 group-hover:scale-105 transition-all duration-300">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <h3 className="text-base font-bold text-foreground mb-2">{title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
          </motion.div>
        ))}
      </div>

      <p className="text-center text-sm text-muted-foreground/70 mt-10 max-w-2xl mx-auto">
        Every tool works together—learn with AI, practice safely,
        compete confidently, and keep improving.
      </p>
    </LandingSection>
  );
}
