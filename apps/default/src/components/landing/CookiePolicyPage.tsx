import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Cookie, Shield, BarChart3, Lock } from 'lucide-react';
import { LandingHeader } from './LandingHeader';
import { LandingFooter } from './LandingFooter';
import { LandingSection, SectionLabel, SectionHeading, SectionSubtitle } from './LandingSection';

const CookiePolicyPage: React.FC = () => {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/20">
      <LandingHeader />
      <main>
        <LandingSection id="cookie-hero">
          <div className="text-center max-w-2xl mx-auto">
            <SectionLabel>Cookie Policy</SectionLabel>
            <SectionHeading>How we use cookies.</SectionHeading>
            <SectionSubtitle>Transparent information about the cookies used on the CryptoVerse HQ platform.</SectionSubtitle>
          </div>
        </LandingSection>

        <LandingSection id="cookie-what" alt>
          <div className="max-w-2xl mx-auto">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Cookie className="h-5 w-5 text-primary" /></div>
              <div>
                <h3 className="text-lg font-bold text-foreground mb-2">What Are Cookies</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">Cookies are small text files placed on your device when you visit a website. They help the site remember your preferences, keep you signed in, and understand how the platform is being used.</p>
              </div>
            </div>
          </div>
        </LandingSection>

        <LandingSection id="cookie-types">
          <div className="text-center mb-14"><SectionLabel>Types of Cookies We Use</SectionLabel><SectionHeading>Only what the platform needs.</SectionHeading></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-4xl mx-auto">
            <div className="p-8 rounded-2xl border bg-card">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4"><Lock className="h-6 w-6 text-primary" /></div>
              <h3 className="text-lg font-bold text-foreground mb-2">Essential Cookies</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-3">Required for the platform to function. These cookies handle authentication, session management, and security. They cannot be disabled.</p>
            </div>
            <div className="p-8 rounded-2xl border bg-card">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-4"><BarChart3 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" /></div>
              <h3 className="text-lg font-bold text-foreground mb-2">Analytics Cookies</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-3">Optional cookies that help us understand how the platform is used. You can opt out in your Account Settings at any time. All analytics data is aggregated and anonymised.</p>
            </div>
          </div>
        </LandingSection>

        <LandingSection id="cookie-third" alt>
          <div className="max-w-2xl mx-auto">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0"><Shield className="h-5 w-5 text-amber-600 dark:text-amber-400" /></div>
              <div>
                <h3 className="text-lg font-bold text-foreground mb-2">Third-Party Services</h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-3">CryptoVerse HQ does not use tracking cookies for advertising purposes. We do not embed third-party advertising networks, social media trackers, or data brokers on our platform.</p>
                <p className="text-sm text-muted-foreground leading-relaxed">The limited third-party services we use may set their own essential cookies. These are governed by each provider's respective privacy policy.</p>
              </div>
            </div>
          </div>
        </LandingSection>

        <LandingSection id="cookie-choices">
          <div className="max-w-2xl mx-auto">
            <div className="p-8 rounded-2xl border bg-card">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Shield className="h-5 w-5 text-primary" /></div>
                <div>
                  <h3 className="text-lg font-bold text-foreground mb-2">Your Cookie Choices</h3>
                  <ul className="space-y-2 text-sm text-muted-foreground leading-relaxed list-disc pl-5">
                    <li>Essential cookies are always active — they are required for the platform to function.</li>
                    <li>Analytics cookies are optional. You can opt out in your Account Settings at any time.</li>
                    <li>You can configure your browser to block or alert you about cookies.</li>
                    <li>We do not use advertising cookies or sell cookie data to any third party.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </LandingSection>

        <LandingSection id="cookie-contact" alt>
          <div className="max-w-2xl mx-auto text-center">
            <p className="text-sm text-muted-foreground leading-relaxed">
              For questions about this Cookie Policy, contact{' '}
              <a href="mailto:privacy@cryptoversehq.com" className="text-primary hover:underline">privacy@cryptoversehq.com</a>
              {' '}or visit our{' '}
              <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
            </p>
          </div>
        </LandingSection>
      </main>
      <LandingFooter />
    </div>
  );
};

export default CookiePolicyPage;
