import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronDown, ChevronUp, ArrowRight,
  Rocket, Bot, Gamepad2, Trophy, Crown, Shield,
  Mail, Users,
} from 'lucide-react';
import { LandingHeader } from './LandingHeader';
import { LandingFooter } from './LandingFooter';
import { LandingSection, SectionLabel, SectionHeading, SectionSubtitle } from './LandingSection';

// ── Popular Topics ──

const TOPICS = [
  {
    icon: Rocket,
    title: 'Getting Started',
    desc: 'Learn how to create an account and begin your first lesson.',
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
  },
  {
    icon: Bot,
    title: 'Learning with Lynx AI',
    desc: 'Understand how your AI coach personalizes your learning.',
    iconBg: 'bg-violet-500/10',
    iconColor: 'text-violet-600 dark:text-violet-400',
  },
  {
    icon: Gamepad2,
    title: 'Trading Simulator',
    desc: 'Practice safely with virtual funds and realistic market conditions.',
    iconBg: 'bg-emerald-500/10',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    icon: Trophy,
    title: 'Competitions',
    desc: 'How rankings, challenges and achievements work.',
    iconBg: 'bg-amber-500/10',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  {
    icon: Crown,
    title: 'Subscriptions',
    desc: 'Compare plans and manage your membership.',
    iconBg: 'bg-blue-500/10',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  {
    icon: Shield,
    title: 'Account & Security',
    desc: 'Password, privacy and account protection.',
    iconBg: 'bg-red-500/10',
    iconColor: 'text-red-600 dark:text-red-400',
  },
];

// ── FAQ ──

const FAQS = [
  {
    q: 'Is CryptoVerse HQ free?',
    a: 'Yes. The Free plan gives you permanent access to the trading simulator, the full Academy curriculum, Lynx AI guidance, and community features. No credit card is required to start learning. You only upgrade if and when you want more advanced tools.',
  },
  {
    q: 'Does Lynx AI give financial advice?',
    a: 'No. Lynx AI is strictly an educational assistant. It explains concepts, reviews your practice trades to help you improve, and adapts your learning path. It never provides financial advice, investment recommendations, profit predictions, or trading signals.',
  },
  {
    q: 'Can I trade with real money?',
    a: 'By default, CryptoVerse HQ uses a simulated trading environment with virtual funds. Pro+ subscribers can optionally connect real exchange accounts via API, but simulation is always available and recommended for learning. The platform is designed for education, not live trading.',
  },
  {
    q: 'How does the simulator work?',
    a: 'The simulator uses real-time market data to create a realistic trading experience without financial risk. You start with $100,000 in virtual USD and can trade supported cryptocurrencies using market, limit, and stop-limit orders. Every trade is tracked for performance review with Lynx AI.',
  },
  {
    q: 'Can I cancel my subscription anytime?',
    a: 'Absolutely. All paid plans are month-to-month with no long-term commitment. Cancel at any time and you retain access until the end of your current billing period. Your learning progress, XP, and achievements are never lost when you downgrade.',
  },
  {
    q: 'How does AI personalize learning?',
    a: "Lynx AI analyzes your quiz results, simulator performance, and learning patterns to recommend lessons, highlight areas for improvement, and adjust the difficulty of content. It is like having a personal tutor who knows exactly where you need to focus.",
  },
  {
    q: 'Do competitions involve real money?',
    a: 'No. All competitions use virtual funds and simulated trading. They are designed to be fun, educational challenges where you can test your skills against other learners without any financial risk. Winners earn XP, badges, and CP coins.',
  },
];

// ── Popular Topics Section ──

function PopularTopics() {
  return (
    <LandingSection id="help-topics" alt>
      <div className="text-center mb-14">
        <SectionLabel>Popular Topics</SectionLabel>
        <SectionHeading>Find what you need.</SectionHeading>
        <SectionSubtitle>
          Browse the most common topics to get answers fast.
        </SectionSubtitle>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {TOPICS.map(({ icon: Icon, title, desc, iconBg, iconColor }) => (
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

// ── FAQ Section (reusing exact LandingFAQ accordion pattern) ──

function HelpFAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <LandingSection id="help-faq">
      <div className="text-center mb-14">
        <SectionLabel>FAQ</SectionLabel>
        <SectionHeading>Frequently Asked Questions</SectionHeading>
        <SectionSubtitle>
          Quick answers to the questions we hear most often.
        </SectionSubtitle>
      </div>

      <div className="max-w-2xl mx-auto space-y-3">
        {FAQS.map((item, i) => {
          const isOpen = openIndex === i;
          return (
            <div
              key={i}
              className="rounded-2xl border bg-card overflow-hidden transition-all duration-200"
            >
              <button
                onClick={() => setOpenIndex(isOpen ? null : i)}
                className="w-full flex items-center justify-between p-5 text-left"
                aria-expanded={isOpen}
                aria-controls={`help-faq-answer-${i}`}
              >
                <span className="text-sm font-semibold text-foreground pr-4">{item.q}</span>
                {isOpen
                  ? <ChevronUp className="h-4 w-4 text-primary shrink-0" />
                  : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                }
              </button>
              {isOpen && (
                <div id={`help-faq-answer-${i}`} className="px-5 pb-5">
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

// ── Need More Help Section ──

function NeedMoreHelp() {
  return (
    <LandingSection id="help-more" alt>
      <div className="text-center mb-14">
        <SectionLabel>Need More Help?</SectionLabel>
        <SectionHeading>We're here for you.</SectionHeading>
        <SectionSubtitle>
          If you can't find what you're looking for, reach out directly or join the community.
        </SectionSubtitle>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
        {/* Contact Support */}
        <div className="flex flex-col items-center text-center p-8 rounded-2xl border bg-card hover:border-primary/15 hover:shadow-md transition-all duration-300">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
            <Mail className="h-7 w-7 text-primary" />
          </div>
          <h3 className="text-xl font-bold text-foreground mb-3">Contact Support</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-6">
            Email our support team anytime.
          </p>
          <Link
            to="/contact"
            className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl transition-all shadow-sm"
          >
            Contact Us
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Community */}
        <div className="flex flex-col items-center text-center p-8 rounded-2xl border bg-card hover:border-primary/15 hover:shadow-md transition-all duration-300">
          <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-5">
            <Users className="h-7 w-7 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 className="text-xl font-bold text-foreground mb-3">Community</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-6">
            Learn together with other members.
          </p>
          <Link
            to="/community"
            className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl transition-all shadow-sm"
          >
            Join Community
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </LandingSection>
  );
}

// ── Final CTA (reusing LandingCTA pattern exactly) ──

function HelpCTA() {
  return (
    <LandingSection className="text-center">
      <div className="relative rounded-3xl border border-primary/10 bg-gradient-to-br from-primary/[0.03] to-transparent p-10 sm:p-16 overflow-hidden">
        <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-primary/5 blur-[80px] rounded-full" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-blue-500/5 blur-[80px] rounded-full" />

        <div className="relative z-10">
          <SectionLabel>START LEARNING</SectionLabel>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-foreground mt-2 mb-4 tracking-tight">
            Every expert started with a first lesson.
          </h2>
          <p className="max-w-lg mx-auto text-muted-foreground text-base sm:text-lg mb-8">
            Learn with AI, practice safely, and build confidence one step at a time.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 px-8 py-4 text-sm font-bold text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl transition-all shadow-lg shadow-primary/20"
            >
              Start Learning Free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/academy"
              className="px-8 py-4 text-sm font-semibold text-foreground hover:text-primary transition-colors"
            >
              Explore Academy
            </Link>
          </div>
          <p className="text-xs text-muted-foreground/70 mt-6">
            Free forever to get started. Upgrade only when you're ready.
          </p>
        </div>
      </div>
    </LandingSection>
  );
}

// ── Help Page ──

const HelpPage: React.FC = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/20">
      <LandingHeader />
      <main>
        {/* Hero */}
        <LandingSection id="help-hero">
          <div className="text-center max-w-2xl mx-auto">
            <SectionLabel>Help Center</SectionLabel>
            <SectionHeading>How Can We Help?</SectionHeading>
            <SectionSubtitle>
              Find answers, learn how the platform works, and get the support you need throughout your learning journey.
            </SectionSubtitle>
            <p className="mt-4 text-sm text-muted-foreground/70">
              Can't find what you're looking for?{' '}
              <Link to="/contact" className="text-primary hover:underline">
                Our support team
              </Link>{' '}
              is always here to help.
            </p>
          </div>
        </LandingSection>

        <PopularTopics />
        <HelpFAQ />
        <NeedMoreHelp />
        <HelpCTA />
      </main>
      <LandingFooter />
    </div>
  );
};

export default HelpPage;
