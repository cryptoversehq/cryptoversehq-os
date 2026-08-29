import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BrainCircuit, BookOpen, Rocket, CheckCircle, BookMarked, History, Sparkles, Shield, TrendingUp } from 'lucide-react';
import { LandingHeader } from './LandingHeader';
import { LandingFooter } from './LandingFooter';
import { LandingSection, SectionLabel, SectionHeading, SectionSubtitle } from './LandingSection';
import { PageSEO } from './LandingSEO';

const FUTURE_TOPICS = [
  { icon: BrainCircuit, title: 'AI Insights', desc: 'Articles exploring how Lynx AI helps learners understand crypto markets, trading psychology, and decision making.', iconBg: 'bg-primary/10', iconColor: 'text-primary' },
  { icon: BookOpen, title: 'Learning Guides', desc: 'Educational articles that complement the Academy with practical explanations and beginner-friendly guides.', iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400' },
  { icon: Rocket, title: 'Platform Updates', desc: 'Posts highlighting major releases, improvements, and new educational capabilities as the platform evolves.', iconBg: 'bg-violet-500/10', iconColor: 'text-violet-600 dark:text-violet-400' },
];

const AVAILABLE_RESOURCES = [
  { icon: BookMarked, title: 'Academy', desc: 'Continue learning through our structured Academy curriculum.', href: '/academy', cta: 'Explore Academy' },
  { icon: History, title: 'Changelog', desc: 'Follow the evolution of CryptoVerse HQ through verified platform updates.', href: '/changelog', cta: 'View Changelog' },
  { icon: Sparkles, title: "What's New", desc: 'Discover recently introduced features and improvements.', href: '/whats-new', cta: "See What\'s New" },
];

const PRINCIPLES = [
  { icon: CheckCircle, title: 'Accuracy', desc: 'We prioritize facts over speculation.', iconBg: 'bg-primary/10', iconColor: 'text-primary' },
  { icon: BookOpen, title: 'Education First', desc: 'We explain before we recommend.', iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400' },
  { icon: Shield, title: 'Transparency', desc: 'Educational content is clearly separated from financial advice.', iconBg: 'bg-blue-500/10', iconColor: 'text-blue-600 dark:text-blue-400' },
  { icon: TrendingUp, title: 'Long-Term Thinking', desc: 'Our goal is lasting understanding, not short-term excitement.', iconBg: 'bg-amber-500/10', iconColor: 'text-amber-600 dark:text-amber-400' },
];

const BlogPage: React.FC = () => {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/20">
      <LandingHeader />
      <main>
        <LandingSection id="blog-hero">
          <div className="text-center max-w-2xl mx-auto">
            <SectionLabel>Blog</SectionLabel>
            <SectionHeading>Insights for Smarter Crypto Learning</SectionHeading>
            <SectionSubtitle>Educational articles, AI insights, platform updates, and practical guides to help you grow with confidence.</SectionSubtitle>
            <p className="mt-4 text-sm text-muted-foreground/70">Our editorial platform is currently in development. Until then, explore the Academy and the latest platform updates.</p>
          </div>
        </LandingSection>

        <LandingSection id="blog-topics" alt>
          <div className="text-center mb-14">
            <SectionLabel>What You'll Find Here</SectionLabel>
            <SectionHeading>Knowledge worth sharing.</SectionHeading>
            <SectionSubtitle>When our publishing platform launches, these are the areas we will focus on.</SectionSubtitle>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {FUTURE_TOPICS.map(({ icon: Icon, title, desc, iconBg, iconColor }) => (
              <div key={title} className="flex flex-col items-center text-center p-8 rounded-2xl border bg-card hover:border-primary/15 hover:shadow-md transition-all duration-300">
                <div className={`w-14 h-14 rounded-2xl ${iconBg} flex items-center justify-center mb-5`}><Icon className={`h-7 w-7 ${iconColor}`} /></div>
                <h3 className="text-xl font-bold text-foreground mb-3">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </LandingSection>

        <LandingSection id="blog-available">
          <div className="text-center mb-14">
            <SectionLabel>Available Today</SectionLabel>
            <SectionHeading>Start exploring right now.</SectionHeading>
            <SectionSubtitle>Real resources you can access immediately.</SectionSubtitle>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {AVAILABLE_RESOURCES.map(({ icon: Icon, title, desc, href, cta }) => (
              <div key={title} className="flex flex-col items-center text-center p-8 rounded-2xl border bg-card hover:border-primary/15 hover:shadow-md transition-all duration-300">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-5"><Icon className="h-7 w-7 text-primary" /></div>
                <h3 className="text-xl font-bold text-foreground mb-3">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-6 flex-1">{desc}</p>
                <Link to={href} className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl transition-all shadow-sm">{cta} <ArrowRight className="h-4 w-4" /></Link>
              </div>
            ))}
          </div>
        </LandingSection>

        <LandingSection id="blog-principles" alt>
          <div className="text-center mb-14">
            <SectionLabel>Editorial Principles</SectionLabel>
            <SectionHeading>Learning deserves clarity — not hype.</SectionHeading>
            <SectionSubtitle>Every article we publish will follow these commitments.</SectionSubtitle>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {PRINCIPLES.map(({ icon: Icon, title, desc, iconBg, iconColor }) => (
              <div key={title} className="flex flex-col items-start text-left p-8 rounded-2xl border bg-card hover:border-primary/15 hover:shadow-md transition-all duration-300">
                <div className={`w-12 h-12 rounded-xl ${iconBg} flex items-center justify-center mb-4`}><Icon className={`h-6 w-6 ${iconColor}`} /></div>
                <h3 className="text-lg font-bold text-foreground mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </LandingSection>

        <LandingSection id="blog-next">
          <div className="max-w-2xl mx-auto text-center">
            <SectionHeading>What's Next</SectionHeading>
            <p className="mt-6 text-base text-muted-foreground leading-relaxed">
              Our editorial platform is under active development. We are building
              the infrastructure to publish and organize educational content — from
              writing tools to category systems and reader experience.
            </p>
            <p className="mt-4 text-sm text-muted-foreground/70">
              No launch date has been announced. When the blog is ready, you will
              find the first articles here.
            </p>
          </div>
        </LandingSection>

        <LandingSection id="blog-quote" alt>
          <div className="max-w-2xl mx-auto text-center">
            <blockquote className="text-3xl sm:text-4xl lg:text-5xl font-black text-foreground tracking-tight leading-tight">"Learning never stops.<br />Neither should curiosity."</blockquote>
            <p className="mt-6 text-base sm:text-lg text-muted-foreground leading-relaxed">Every lesson, every simulation and every conversation with Lynx AI is designed to help you become a more thoughtful crypto learner.</p>
          </div>
        </LandingSection>
      </main>
      <LandingFooter />
    </div>
  );
};

export default BlogPage;
