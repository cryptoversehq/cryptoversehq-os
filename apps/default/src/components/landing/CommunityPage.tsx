import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronDown, ChevronUp, ArrowRight,
  Users, Trophy, Shield, Sparkles,
  Heart, Lightbulb, TrendingUp,
  Zap, MessageCircle, Award, Star,
} from 'lucide-react';
import { LandingHeader } from './LandingHeader';
import { LandingFooter } from './LandingFooter';
import { LandingSection, SectionLabel, SectionHeading, SectionSubtitle } from './LandingSection';

const WHY_JOIN = [
  {
    icon: Users, title: 'Learn from Others',
    desc: 'Share experiences and discover new learning strategies.',
    iconBg: 'bg-primary/10', iconColor: 'text-primary',
  },
  {
    icon: Trophy, title: 'Celebrate Progress',
    desc: 'Earn achievements and recognize milestones together.',
    iconBg: 'bg-amber-500/10', iconColor: 'text-amber-600 dark:text-amber-400',
  },
  {
    icon: Sparkles, title: 'Friendly Competitions',
    desc: 'Improve your skills through healthy competition.',
    iconBg: 'bg-violet-500/10', iconColor: 'text-violet-600 dark:text-violet-400',
  },
  {
    icon: Shield, title: 'Safe Learning Environment',
    desc: 'Respect, curiosity and continuous improvement come first.',
    iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
];

const VALUES = [
  {
    icon: Heart, title: 'Respect', desc: 'Support every learner.',
    iconBg: 'bg-red-500/10', iconColor: 'text-red-600 dark:text-red-400',
  },
  {
    icon: Lightbulb, title: 'Curiosity', desc: 'Ask questions and keep exploring.',
    iconBg: 'bg-amber-500/10', iconColor: 'text-amber-600 dark:text-amber-400',
  },
  {
    icon: TrendingUp, title: 'Growth', desc: 'Focus on steady improvement instead of quick wins.',
    iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
];

const RECOGNITION = [
  {
    icon: Zap, title: 'Learning Streaks',
    desc: 'Consistent learners earn recognition for showing up day after day and completing their lessons.',
    iconBg: 'bg-primary/10', iconColor: 'text-primary',
  },
  {
    icon: MessageCircle, title: 'Helpful Contributions',
    desc: 'Members who share knowledge, answer questions, and support their peers earn recognition.',
    iconBg: 'bg-blue-500/10', iconColor: 'text-blue-600 dark:text-blue-400',
  },
  {
    icon: Award, title: 'Competition Achievements',
    desc: 'Placing well in tournaments and challenges earns your profile visible achievement badges.',
    iconBg: 'bg-violet-500/10', iconColor: 'text-violet-600 dark:text-violet-400',
  },
  {
    icon: Star, title: 'Community Reputation',
    desc: 'Over time, consistent participation builds a reputation score that reflects your contributions.',
    iconBg: 'bg-amber-500/10', iconColor: 'text-amber-600 dark:text-amber-400',
  },
];

const GUIDELINES = [
  {
    q: 'Respect others',
    a: 'Treat every member with kindness and professionalism. Disagreements are natural, but personal attacks, harassment, and bullying are never tolerated. We are all here to learn.',
  },
  {
    q: 'No financial advice',
    a: 'CryptoVerse HQ is an educational platform. Do not present personal opinions as financial advice, make price predictions, or tell others how to invest. Share what you have learned, not what others should do.',
  },
  {
    q: 'No spam',
    a: 'Do not post repetitive content, unsolicited promotions, referral links, or advertisements. Keep conversations meaningful and on-topic.',
  },
  {
    q: 'No scams',
    a: 'Any attempt to deceive, phish, or defraud other members results in immediate and permanent removal. This includes fake giveaways, impersonation, and requests for personal information or funds.',
  },
  {
    q: 'Report inappropriate content',
    a: 'If you see something that violates our guidelines, report it. Every report is reviewed by our team, and we take action quickly. You help keep the community safe for everyone.',
  },
  {
    q: 'Protect your account',
    a: 'Never share your password, API keys, or personal information with anyone. CryptoVerse HQ will never ask for your credentials via direct message.',
  },
];

const CARD_CLASS = 'flex flex-col items-start text-left p-8 rounded-2xl border bg-card hover:border-primary/15 hover:shadow-md transition-all duration-300';
const CENTERED_CARD = 'flex flex-col items-center text-center p-8 rounded-2xl border bg-card hover:border-primary/15 hover:shadow-md transition-all duration-300';

function CommunityGuidelines() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  return (
    <LandingSection id="community-guidelines">
      <div className="text-center mb-14">
        <SectionLabel>Community Guidelines</SectionLabel>
        <SectionHeading>Keeping the community safe.</SectionHeading>
        <SectionSubtitle>A few simple rules ensure everyone has a positive experience.</SectionSubtitle>
      </div>
      <div className="max-w-2xl mx-auto space-y-3">
        {GUIDELINES.map((item, i) => {
          const isOpen = openIndex === i;
          return (
            <div key={i} className="rounded-2xl border bg-card overflow-hidden transition-all duration-200">
              <button
                onClick={() => setOpenIndex(isOpen ? null : i)}
                className="w-full flex items-center justify-between p-5 text-left"
                aria-expanded={isOpen}
                aria-controls={`guideline-${i}`}
              >
                <span className="text-sm font-semibold text-foreground pr-4">{item.q}</span>
                {isOpen ? <ChevronUp className="h-4 w-4 text-primary shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
              </button>
              {isOpen && (
                <div id={`guideline-${i}`} className="px-5 pb-5">
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.a}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </LandingSection>
  );
}

function CommunityCTA() {
  return (
    <LandingSection className="text-center">
      <div className="relative rounded-3xl border border-primary/10 bg-gradient-to-br from-primary/[0.03] to-transparent p-10 sm:p-16 overflow-hidden">
        <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-primary/5 blur-[80px] rounded-full" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-blue-500/5 blur-[80px] rounded-full" />
        <div className="relative z-10">
          <SectionLabel>JOIN THE COMMUNITY</SectionLabel>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-foreground mt-2 mb-4 tracking-tight">
            Learn together. Improve together.
          </h2>
          <p className="max-w-lg mx-auto text-muted-foreground text-base sm:text-lg mb-8">
            Every great learner grows with the support of others.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/signup" className="inline-flex items-center gap-2 px-8 py-4 text-sm font-bold text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl transition-all shadow-lg shadow-primary/20">
              Start Learning Free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/academy" className="px-8 py-4 text-sm font-semibold text-foreground hover:text-primary transition-colors">Explore Academy</Link>
          </div>
          <p className="text-xs text-muted-foreground/70 mt-6">Free forever to get started. Upgrade only when you're ready.</p>
        </div>
      </div>
    </LandingSection>
  );
}

const CommunityPage: React.FC = () => {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/20">
      <LandingHeader />
      <main>
        {/* Hero */}
        <LandingSection id="community-hero">
          <div className="text-center max-w-2xl mx-auto">
            <SectionLabel>Community</SectionLabel>
            <SectionHeading>Learn Better Together.</SectionHeading>
            <SectionSubtitle>
              Join a global community of learners who share ideas, celebrate progress, and grow together through AI-powered crypto education.
            </SectionSubtitle>
            <p className="mt-4 text-sm text-muted-foreground/70">Everyone starts somewhere. Everyone keeps learning.</p>
          </div>
        </LandingSection>

        {/* Why Join */}
        <LandingSection id="community-why-join" alt>
          <div className="text-center mb-14">
            <SectionLabel>Why Join the Community</SectionLabel>
            <SectionHeading>Grow with others.</SectionHeading>
            <SectionSubtitle>Learning is better when you are not doing it alone.</SectionSubtitle>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {WHY_JOIN.map(({ icon: Icon, title, desc, iconBg, iconColor }) => (
              <div key={title} className={CARD_CLASS}>
                <div className={`w-12 h-12 rounded-xl ${iconBg} flex items-center justify-center mb-4`}><Icon className={`h-6 w-6 ${iconColor}`} /></div>
                <h3 className="text-lg font-bold text-foreground mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </LandingSection>

        {/* Values */}
        <LandingSection id="community-values">
          <div className="text-center mb-14">
            <SectionLabel>Community Values</SectionLabel>
            <SectionHeading>What we stand for.</SectionHeading>
            <SectionSubtitle>These principles guide every interaction in our community.</SectionSubtitle>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {VALUES.map(({ icon: Icon, title, desc, iconBg, iconColor }) => (
              <div key={title} className={CENTERED_CARD}>
                <div className={`w-14 h-14 rounded-2xl ${iconBg} flex items-center justify-center mb-5`}><Icon className={`h-7 w-7 ${iconColor}`} /></div>
                <h3 className="text-xl font-bold text-foreground mb-3">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </LandingSection>

        {/* Recognition */}
        <LandingSection id="community-recognition" alt>
          <div className="text-center mb-14">
            <SectionLabel>Recognition System</SectionLabel>
            <SectionHeading>Learning deserves to be seen.</SectionHeading>
            <SectionSubtitle>Recognition reflects learning engagement — not financial success.</SectionSubtitle>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {RECOGNITION.map(({ icon: Icon, title, desc, iconBg, iconColor }) => (
              <div key={title} className={CARD_CLASS}>
                <div className={`w-12 h-12 rounded-xl ${iconBg} flex items-center justify-center mb-4`}><Icon className={`h-6 w-6 ${iconColor}`} /></div>
                <h3 className="text-lg font-bold text-foreground mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </LandingSection>

        {/* Guidelines */}
        <CommunityGuidelines />

        {/* Mentor */}
        <LandingSection id="community-mentor" alt>
          <div className="text-center max-w-2xl mx-auto">
            <SectionLabel>Become a Community Mentor</SectionLabel>
            <SectionHeading>Help Others Learn.</SectionHeading>
            <p className="text-muted-foreground text-base sm:text-lg leading-relaxed mb-6">
              Experienced learners may become Community Mentors after consistently demonstrating knowledge, positive participation, and responsible behavior.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed mb-2">
              Lynx AI continuously evaluates educational progress, simulator performance, helpfulness, and community reputation.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed mb-8">
              Eligible members may request mentor status from their profile. Lynx AI provides a recommendation — final approval always belongs to the Super Admin.
            </p>
          </div>
        </LandingSection>

        <CommunityCTA />
      </main>
      <LandingFooter />
    </div>
  );
};

export default CommunityPage;
