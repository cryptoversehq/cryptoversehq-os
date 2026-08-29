import React, { useEffect } from 'react';
import { PageSEO } from './LandingSEO';
import { LandingHeader } from './LandingHeader';
import { LandingFooter } from './LandingFooter';
import { AboutMission } from './AboutMission';
import { AboutHowWeTeach } from './AboutHowWeTeach';
import { AboutBuiltDifferent } from './AboutBuiltDifferent';
import { AboutWhoItsFor } from './AboutWhoItsFor';
import { AboutBrandPrinciple } from './AboutBrandPrinciple';
import { LandingCTA } from './LandingCTA';

const AboutPage: React.FC = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/20">
      <LandingHeader />
      <main>
        <AboutMission />
        <AboutHowWeTeach />
        <AboutBuiltDifferent />
        <AboutWhoItsFor />
        <AboutBrandPrinciple />
        <LandingCTA />
      </main>
      <LandingFooter />
    </div>
  );
};

export default AboutPage;
