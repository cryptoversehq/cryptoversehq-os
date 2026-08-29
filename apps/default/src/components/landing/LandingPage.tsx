import React, { useEffect } from 'react';
import { LandingSEO, LandingStructuredData } from './LandingSEO';
import { LandingHeader } from './LandingHeader';
import { LandingHero } from './LandingHero';
import { LandingTrust } from './LandingTrust';
import { LandingExplore } from './LandingExplore';
import { LandingJourney } from './LandingJourney';
import { LandingLynx } from './LandingLynx';
import { LandingSimulator } from './LandingSimulator';
import { LandingCompetitions } from './LandingCompetitions';
import { LandingFeatures } from './LandingFeatures';
import { LandingPricing } from './LandingPricing';
import { LandingFAQ } from './LandingFAQ';
import { LandingCTA } from './LandingCTA';
import { LandingFooter } from './LandingFooter';

const LandingPage: React.FC = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/20">
      <LandingSEO />
      <LandingStructuredData />
      <LandingHeader />
      <main>
        <LandingHero />
        <LandingTrust />
        <LandingExplore />
        <LandingJourney />
        <LandingLynx />
        <LandingSimulator />
        <LandingCompetitions />
        <LandingFeatures />
        <LandingPricing />
        <LandingFAQ />
        <LandingCTA />
      </main>
      <LandingFooter />
    </div>
  );
};

export default LandingPage;
