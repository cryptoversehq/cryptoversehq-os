import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Shield, Mail, ChevronRight } from 'lucide-react';
import { LandingHeader } from './LandingHeader';
import { LandingFooter } from './LandingFooter';
import { LandingSection, SectionLabel, SectionHeading, SectionSubtitle } from './LandingSection';
import { PageSEO } from './LandingSEO';
import { cn } from '@/lib/utils';

// ── Policy section definitions ──

interface PolicySection {
  id: string;
  title: string;
  content: React.ReactNode;
}

const SECTIONS: PolicySection[] = [
  {
    id: 'introduction',
    title: '1. Introduction',
    content: (
      <div className="space-y-4">
        <p>
          CryptoVerse HQ is an AI-powered educational platform designed to help you learn
          cryptocurrency trading through structured lessons, virtual simulations, and guided
          practice. This Privacy Policy explains how we collect, use, disclose, and safeguard
          your information when you use our platform.
        </p>
        <p>
          By creating an account or using CryptoVerse HQ, you agree to the collection and use
          of information in accordance with this policy. If you do not agree, please do not
          use the platform.
        </p>
      </div>
    ),
  },
  {
    id: 'information-we-collect',
    title: '2. Information We Collect',
    content: (
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">
          Account Information
        </h3>
        <p>
          When you sign up, we collect your email address, display name, and an encrypted
          password. You may optionally provide a profile picture and trading preferences.
          We use OIDC-based authentication through our Genesis auth provider to keep your
          credentials secure.
        </p>
        <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">
          Learning & Platform Data
        </h3>
        <p>
          As you learn, we collect data that makes the educational experience personal and
          effective: Academy lesson progress, quiz results, module completions, simulator
          trade history with virtual funds, competition entries and rankings, and Lynx AI
          conversation history.
        </p>
        <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">
          Technical Data
        </h3>
        <p>
          We automatically receive your IP address, browser type, device information, and
          pages visited. This helps us diagnose issues, prevent abuse, and understand how
          the platform is used so we can improve it.
        </p>
      </div>
    ),
  },
  {
    id: 'how-we-use-information',
    title: '3. How We Use Information',
    content: (
      <div className="space-y-4">
        <p>We use the information we collect to:</p>
        <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
          <li>Provide, maintain, and improve the CryptoVerse HQ platform.</li>
          <li>
            Personalize your learning path based on quiz results, simulator performance,
            and skill progression.
          </li>
          <li>
            Power Lynx AI so it can give you relevant, context-aware educational guidance
            during lessons and practice sessions.
          </li>
          <li>
            Run competitions, calculate leaderboard rankings, and award XP, badges, and
            CP coins for educational achievements.
          </li>
          <li>
            Send account-related notifications such as subscription confirmations, password
            resets, and important platform updates.
          </li>
          <li>
            Detect and prevent fraud, abuse, and violations of our Terms of Service.
          </li>
        </ul>
        <p>
          We never use your learning data or simulator history to make automated decisions
          that affect your legal rights, nor do we sell your personal information to third
          parties.
        </p>
      </div>
    ),
  },
  {
    id: 'ai-learning-data',
    title: '4. AI & Learning Data',
    content: (
      <div className="space-y-4">
        <p>
          Lynx AI is an educational assistant, not a financial advisor. It does not provide
          investment recommendations, profit predictions, or financial advice of any kind.
          Conversations with Lynx AI are stored so you can review your learning history and
          so the AI can maintain context across sessions.
        </p>
        <p>
          Your Lynx AI conversations are private to your account. We may use aggregated,
          anonymized conversation patterns to improve the AI's educational responses, but
          we never share your individual conversations with third parties or use them to
          train external models.
        </p>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 mt-4">
          <p className="text-sm text-amber-400 font-medium">
            Lynx AI is designed for education, not advice. Always do your own research before
            trading with real funds.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: 'simulator-competition-data',
    title: '5. Simulator & Competition Data',
    content: (
      <div className="space-y-4">
        <p>
          CryptoVerse HQ's Trading Simulator uses virtual funds only. No real money is traded
          during simulation, and all trade data is generated within a sandboxed environment.
          Your simulator trades, P&L, and performance metrics are visible on your profile and
          leaderboards based on your privacy settings.
        </p>
        <p>
          Competitions on CryptoVerse HQ are skill-based educational activities, not gambling.
          They are designed to test and improve your trading knowledge in a risk-free
          environment. Entry fees (where applicable) are for platform access and prize pools
          only, and winners are determined by demonstrated trading skill — not chance.
        </p>
        <p>
          Competition results, rankings, and performance data may be displayed publicly on
          leaderboards and your profile. You can control the visibility of your performance
          data in your Privacy Settings.
        </p>
      </div>
    ),
  },
  {
    id: 'cookies-analytics',
    title: '6. Cookies & Analytics',
    content: (
      <div className="space-y-4">
        <p>
          We use essential cookies for authentication and session management. These are
          required for the platform to function and cannot be disabled.
        </p>
        <p>
          We use optional analytics cookies to understand how you use the platform — which
          features are most helpful, where learners spend the most time, and how we can
          improve the experience. You can opt out of analytics cookies in your Account
          Settings at any time.
        </p>
        <p>
          All analytics data is aggregated and anonymised. We do not use tracking cookies
          for advertising purposes, and we do not sell or share cookie data with ad networks.
        </p>
      </div>
    ),
  },
  {
    id: 'third-party-services',
    title: '7. Third-Party Services',
    content: (
      <div className="space-y-4">
        <p>
          CryptoVerse HQ integrates with a limited set of third-party services to provide
          core functionality:
        </p>
        <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
          <li>
            <strong>Payment Processing:</strong> Payments for Pro and Pro+ subscriptions are
            processed independently by our payment providers. CryptoVerse HQ does not store
            or have access to your full credit card numbers, bank account details, or
            cryptocurrency wallet private keys.
          </li>
          <li>
            <strong>Exchange Connections:</strong> If you connect a real exchange account
            (Pro+ feature), your API keys are stored locally on your device and are never
            transmitted to CryptoVerse HQ servers. We only request Read and Trade permissions
            — never Withdraw.
          </li>
          <li>
            <strong>Authentication:</strong> We use OIDC-based authentication through the
            Taskade Genesis platform. Your login credentials are handled securely and never
            shared with third parties.
          </li>
        </ul>
        <p>
          We do not embed third-party advertising networks, social media trackers, or data
          brokers on our platform.
        </p>
      </div>
    ),
  },
  {
    id: 'data-security',
    title: '8. Data Security',
    content: (
      <div className="space-y-4">
        <p>
          We take the security of your data seriously. All traffic between your browser and
          CryptoVerse HQ is encrypted using HTTPS. Passwords are hashed using industry-standard
          algorithms and never stored in plain text.
        </p>
        <p>
          We regularly review our security practices, apply security patches promptly, and
          limit access to personal data to authorised personnel who need it to operate,
          develop, or improve the platform.
        </p>
        <p>
          While we implement strong security measures, no method of transmission over the
          Internet or electronic storage is 100% secure. We cannot guarantee absolute security,
          but we are committed to protecting your data to the highest practical standard.
        </p>
      </div>
    ),
  },
  {
    id: 'your-rights',
    title: '9. Your Rights',
    content: (
      <div className="space-y-4">
        <p>Depending on your jurisdiction, you may have the right to:</p>
        <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
          <li>
            <strong>Access</strong> the personal data we hold about you.
          </li>
          <li>
            <strong>Correct</strong> inaccurate or incomplete data.
          </li>
          <li>
            <strong>Delete</strong> your account and associated data. You can do this from
            your Account Settings at any time.
          </li>
          <li>
            <strong>Export</strong> your learning history, simulator records, and Lynx AI
            conversation logs in a portable format.
          </li>
          <li>
            <strong>Opt out</strong> of non-essential communications and analytics tracking.
          </li>
        </ul>
        <p>
          To exercise any of these rights, contact us at the email address below or use the
          tools available in your Account Settings. We will respond within 30 days.
        </p>
      </div>
    ),
  },
  {
    id: 'changes',
    title: '10. Changes to This Policy',
    content: (
      <div className="space-y-4">
        <p>
          We may update this Privacy Policy from time to time to reflect changes in our
          practices, platform features, or legal requirements. When we make material changes,
          we will notify you via email and display a notice on the platform at least 14 days
          before the changes take effect.
        </p>
        <p>
          The date at the top of this page indicates when the policy was last revised.
          Continued use of CryptoVerse HQ after changes become effective constitutes
          acceptance of the updated policy.
        </p>
      </div>
    ),
  },
];

// ── Table-of-contents link component ──

function TocLink({ id, title, activeId, onClick }: {
  id: string;
  title: string;
  activeId: string | null;
  onClick: (id: string) => void;
}) {
  const isActive = activeId === id;
  return (
    <button
      onClick={() => onClick(id)}
      className={cn(
        'block w-full text-left py-1.5 text-sm transition-colors border-l-2 pl-3',
        isActive
          ? 'border-primary text-primary font-medium'
          : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
      )}
    >
      {title}
    </button>
  );
}

// ── Main page component ──

const PrivacyPage: React.FC = () => {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Track visible section on scroll for TOC highlighting
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0.1 },
    );

    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/20">
      <LandingHeader />

      <main>
        {/* ── Hero ── */}
        <section className="relative pt-32 pb-16 lg:pt-40 lg:pb-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-primary/[0.02] to-transparent">
          <div className="max-w-3xl mx-auto text-center">
            <SectionLabel>PRIVACY</SectionLabel>
            <SectionHeading>Your Privacy Matters.</SectionHeading>
            <SectionSubtitle>
              We believe learning should be transparent — not only in education, but also in
              how we collect, use, and protect your information.
            </SectionSubtitle>
            <p className="text-xs text-muted-foreground/60 mt-6">
              Last Updated: July 27, 2026
            </p>
          </div>
        </section>

        {/* ── Content: TOC + Policy ── */}
        <LandingSection>
          <div className="max-w-5xl mx-auto flex flex-col lg:flex-row gap-10 lg:gap-16">
            {/* Sticky Table of Contents */}
            <aside className="lg:w-56 shrink-0">
              <nav className="lg:sticky lg:top-24 space-y-1" aria-label="Table of Contents">
                <h4 className="text-xs font-bold text-foreground/50 uppercase tracking-wider mb-3 pl-3">
                  On This Page
                </h4>
                {SECTIONS.map((s) => (
                  <TocLink
                    key={s.id}
                    id={s.id}
                    title={s.title}
                    activeId={activeId}
                    onClick={scrollToSection}
                  />
                ))}
              </nav>
            </aside>

            {/* Policy sections */}
            <div className="flex-1 min-w-0 space-y-16">
              {SECTIONS.map((section) => (
                <section key={section.id} id={section.id} className="scroll-mt-24">
                  <h2 className="text-xl font-bold text-foreground mb-5 pb-3 border-b border-border/50">
                    {section.title}
                  </h2>
                  <div className="text-sm text-muted-foreground leading-relaxed space-y-3">
                    {section.content}
                  </div>
                </section>
              ))}

              {/* ── Help card ── */}
              <div className="rounded-2xl border border-primary/10 bg-gradient-to-br from-primary/[0.03] to-transparent p-8 text-center">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Shield className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">
                  Questions about privacy?
                </h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
                  If you have any questions about how we handle your data, we're here to help.
                </p>
                <Link
                  to="/help"
                  className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl transition-all shadow-sm"
                >
                  <Mail className="h-4 w-4" />
                  Contact Us
                </Link>
              </div>
            </div>
          </div>
        </LandingSection>
      </main>

      <LandingFooter />
    </div>
  );
};

export default PrivacyPage;

