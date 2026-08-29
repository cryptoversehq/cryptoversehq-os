import React from 'react';
import { LandingSection, SectionLabel, SectionHeading, SectionSubtitle } from './LandingSection';

const TRUST_PILLS = [
  'AI-Powered Learning',
  'Risk-Free Practice',
  'Built for Long-Term Growth',
];

export function AboutMission() {
  return (
    <LandingSection id="about-mission">
      <div className="text-center max-w-2xl mx-auto">
        <SectionLabel>Our Mission</SectionLabel>
        <SectionHeading>
          Crypto education should be safe, intelligent, and free from hype.
        </SectionHeading>
        <SectionSubtitle>
          The crypto learning landscape is filled with noise, scams, and financial
          risk. People deserve a place to learn with an AI mentor, practice without
          real money, and build real competence before risking capital.
          CryptoVerseHQ was built to be that place.
        </SectionSubtitle>

        {/* Trust pills — lightweight visual labels */}
        <div className="flex flex-wrap items-center justify-center gap-3 mt-10">
          {TRUST_PILLS.map((pill) => (
            <span
              key={pill}
              className="inline-block px-4 py-1.5 text-xs font-medium text-muted-foreground bg-muted/60 rounded-full border border-border/60"
            >
              {pill}
            </span>
          ))}
        </div>
      </div>
    </LandingSection>
  );
}
