import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Mail } from 'lucide-react';
import { LandingHeader } from './LandingHeader';
import { LandingFooter } from './LandingFooter';
import { LandingSection, SectionLabel, SectionHeading, SectionSubtitle } from './LandingSection';
import { cn } from '@/lib/utils';

interface TermsSection {
  id: string;
  title: string;
  content: React.ReactNode;
}

// ── Terms of Service section definitions ──

const SECTIONS: TermsSection[] = [
  {
    id: 'acceptance',
    title: '1. Acceptance of Terms',
    content: (
      <div className="space-y-4">
        <p>
          By accessing or using CryptoVerse HQ, you agree to be bound by these
          Terms of Service. If you do not agree, please do not create an
          account or use the platform.
        </p>
        <p>
          These terms form a legally binding agreement between you and
          CryptoVerse HQ. If you are using the platform on behalf of an
          organization, you represent that you have the authority to bind
          that organization to these terms.
        </p>
        <p>
          We reserve the right to update these terms at any time. Continued
          use after changes are posted constitutes acceptance.
        </p>
      </div>
    ),
  },
  {
    id: 'educational-purpose',
    title: '2. Educational Purpose',
    content: (
      <div className="space-y-4">
        <p>
          CryptoVerse HQ is an educational platform. Our mission is to help
          you learn cryptocurrency trading concepts through structured
          lessons, AI-guided practice, virtual simulations, and skill-based
          competitions.
        </p>
        <p>
          Nothing on CryptoVerse HQ constitutes financial, investment, legal,
          or tax advice. All content — including Academy lessons, Lynx AI
          responses, simulator feedback, and competition commentary — is
          provided for educational purposes only.
        </p>
        <p>
          You remain solely responsible for your own financial decisions. We
          do not guarantee any specific trading outcome, profit, or level of
          success, whether in simulation or in real markets.
        </p>
      </div>
    ),
  },
  {
    id: 'user-accounts',
    title: '3. User Accounts',
    content: (
      <div className="space-y-4">
        <p>
          You must be at least 13 years old to create an account. If you are
          between 13 and 18, you must have permission from a parent or
          guardian.
        </p>
        <p>
          You are responsible for maintaining the confidentiality of your
          account credentials and for all activity that occurs under your
          account. Notify us immediately if you suspect unauthorized access.
        </p>
        <p>
          We reserve the right to suspend or terminate accounts that violate
          these terms, engage in fraudulent activity, or otherwise harm the
          platform or its community.
        </p>
      </div>
    ),
  },
  {
    id: 'acceptable-use',
    title: '4. Acceptable Use',
    content: (
      <div className="space-y-4">
        <p>When using CryptoVerse HQ, you agree not to:</p>
        <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
          <li>
            Use the platform for any unlawful purpose or in violation of
            applicable laws and regulations.
          </li>
          <li>
            Attempt to cheat, exploit bugs, or manipulate simulator data,
            competition rankings, leaderboards, or CP coin balances.
          </li>
          <li>
            Misuse Lynx AI by attempting to extract financial advice,
            generate harmful content, or reverse engineer the AI system.
          </li>
          <li>
            Reverse engineer, decompile, or otherwise attempt to extract the
            source code of any part of the platform.
          </li>
          <li>
            Use automated tools, bots, or scripts to interact with the
            platform in ways not intended by the design.
          </li>
          <li>
            Harass, abuse, or harm other users through chat, competition
            communications, or any other platform feature.
          </li>
          <li>
            Upload malicious code, attempt to breach security measures, or
            interfere with platform operation.
          </li>
        </ul>
      </div>
    ),
  },
  {
    id: 'lynx-ai',
    title: '5. Lynx AI',
    content: (
      <div className="space-y-4">
        <p>
          Lynx AI is an educational assistant powered by artificial
          intelligence. It is designed to help you learn trading concepts,
          explain market mechanics, provide feedback on your simulator
          performance, and answer educational questions.
        </p>
        <p>
          Lynx AI does not provide financial advice, investment
          recommendations, or profit predictions. Any trading decision you
          make — whether in simulation or with real funds — is your own.
        </p>
        <p>
          You must not use Lynx AI to generate harmful, misleading, or
          malicious content. We reserve the right to review AI conversations
          flagged for policy violations and to restrict access for users who
          abuse the system.
        </p>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 mt-4">
          <p className="text-sm text-amber-400 font-medium">
            Lynx AI is an educational tool, not a financial advisor. Always
            do your own research before trading with real funds.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: 'simulator',
    title: '6. Simulator',
    content: (
      <div className="space-y-4">
        <p>
          The CryptoVerse HQ Trading Simulator uses virtual funds only. No
          real money is traded, won, or lost during simulation. Simulator
          performance does not guarantee or predict performance in real
          markets.
        </p>
        <p>
          Simulated market data is generated for educational purposes and may
          not reflect actual market conditions. Past simulated results do not
          indicate future simulated or real outcomes.
        </p>
        <p>
          You acknowledge that the simulator is a learning tool and that
          skills developed through simulation may not directly translate to
          real-world trading success.
        </p>
      </div>
    ),
  },
  {
    id: 'competitions',
    title: '7. Competitions',
    content: (
      <div className="space-y-4">
        <p>
          Competitions on CryptoVerse HQ are skill-based educational
          activities. They are not gambling, lotteries, or games of chance.
          Winners are determined by demonstrated trading knowledge and
          strategy — not luck.
        </p>
        <p>
          Some competitions may require an entry fee. Entry fees contribute
          to prize pools and platform operations. Participation is entirely
          voluntary.
        </p>
        <p>
          You agree not to collude, share accounts, use multiple accounts, or
          otherwise attempt to gain an unfair advantage in any competition.
          We reserve the right to disqualify participants and withhold prizes
          where violations are detected.
        </p>
      </div>
    ),
  },
  {
    id: 'subscriptions',
    title: '8. Subscriptions & Payments',
    content: (
      <div className="space-y-4">
        <p>
          CryptoVerse HQ offers Free, Pro, and Pro+ subscription plans. Each
          plan includes a specific set of features as described on our
          Pricing page. Plan features may evolve over time as we improve the
          platform.
        </p>
        <p>
          Subscription fees are billed in advance on a recurring basis
          according to the plan you select. You may cancel at any time from
          your Account Settings. Cancellation takes effect at the end of your
          current billing period — we do not provide prorated refunds for
          partial months.
        </p>
        <p>
          All payments are processed independently by our third-party payment
          providers. CryptoVerse HQ does not store or have access to your
          full payment credentials, credit card numbers, or cryptocurrency
          wallet private keys.
        </p>
        <p>
          CP Coins are a virtual currency used within the platform for
          marketplace purchases, competition entries, and premium features.
          CP Coins have no real-world monetary value and cannot be exchanged
          for fiat currency or cryptocurrency.
        </p>
      </div>
    ),
  },
  {
    id: 'intellectual-property',
    title: '9. Intellectual Property',
    content: (
      <div className="space-y-4">
        <p>
          CryptoVerse HQ owns all rights, title, and interest in the platform
          — including its branding, logo, Academy content, Lynx AI system,
          simulator engine, user interface design, and underlying code.
        </p>
        <p>
          You may not copy, reproduce, distribute, or create derivative works
          from any part of the platform without our express written
          permission.
        </p>
        <p>
          Content you create and publish on the platform — such as trading
          strategies submitted to the Marketplace — remains your intellectual
          property. By publishing, you grant CryptoVerse HQ a non-exclusive,
          worldwide, royalty-free license to display and distribute your
          content within the platform.
        </p>
      </div>
    ),
  },
  {
    id: 'disclaimer',
    title: '10. Disclaimer of Warranties',
    content: (
      <div className="space-y-4">
        <p>
          CryptoVerse HQ is provided "as is" and "as available" without
          warranties of any kind, either express or implied. We do not
          warrant that the platform will be uninterrupted, error-free, or
          completely secure.
        </p>
        <p>
          We make no guarantees about the accuracy, completeness, or
          timeliness of Academy content, Lynx AI responses, simulator data,
          market information, or any other content on the platform.
        </p>
        <p>
          You use the platform at your own risk. We are not responsible for
          any losses or damages arising from your use of the platform,
          including financial losses incurred through real trading decisions
          you make based on educational content or simulator experience.
        </p>
      </div>
    ),
  },
  {
    id: 'liability',
    title: '11. Limitation of Liability',
    content: (
      <div className="space-y-4">
        <p>
          To the fullest extent permitted by law, CryptoVerse HQ and its
          owners, employees, and affiliates shall not be liable for any
          indirect, incidental, special, consequential, or punitive damages
          arising from your use of the platform.
        </p>
        <p>
          This includes, without limitation, damages for loss of profits,
          data loss, trading losses, or any other financial harm — whether
          incurred in simulation or through real trading activity influenced
          by educational content on the platform.
        </p>
        <p>
          Our total liability to you for any claim arising from these terms
          or your use of the platform shall not exceed the amount you have
          paid to CryptoVerse HQ in the twelve months preceding the claim.
        </p>
      </div>
    ),
  },
  {
    id: 'changes',
    title: '12. Changes to These Terms',
    content: (
      <div className="space-y-4">
        <p>
          We may update these Terms of Service from time to time to reflect
          changes in our platform, practices, or legal obligations. When we
          make material changes, we will notify you via email and display a
          notice on the platform at least 14 days before the changes take
          effect.
        </p>
        <p>
          The date at the top of this page indicates when these terms were
          last revised. Continued use of CryptoVerse HQ after changes become
          effective constitutes acceptance of the updated terms.
        </p>
      </div>
    ),
  },
];

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

const TermsPage: React.FC = () => {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

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
            <SectionLabel>TERMS</SectionLabel>
            <SectionHeading>Terms of Service</SectionHeading>
            <SectionSubtitle>
              These terms explain how CryptoVerse HQ works, what you can expect
              from us, and what we ask from you while using our educational
              platform.
            </SectionSubtitle>
            <p className="text-xs text-muted-foreground/60 mt-6">
              Last Updated: July 27, 2026
            </p>
          </div>
        </section>

        {/* ── Content: TOC + Terms ── */}
        <LandingSection>
          <div className="max-w-5xl mx-auto flex flex-col lg:flex-row gap-10 lg:gap-16">
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
                  <FileText className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">
                  Questions about these terms?
                </h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
                  If you need clarification about any part of these Terms of
                  Service, we're here to help.
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

export default TermsPage;
