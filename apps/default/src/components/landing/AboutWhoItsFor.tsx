import React from 'react';
import { Check, Info } from 'lucide-react';
import { LandingSection, SectionLabel, SectionHeading, SectionSubtitle } from './LandingSection';

const CHECK_ITEMS = [
  "You're new to crypto and want a structured place to start.",
  'You prefer learning by doing instead of only watching videos.',
  'You want to practice before risking real money.',
  'You enjoy having AI guidance throughout your learning journey.',
];

export function AboutWhoItsFor() {
  return (
    <LandingSection id="about-who-its-for" alt>
      <div className="text-center mb-14">
        <SectionLabel>Who It's For</SectionLabel>
        <SectionHeading>Built for learners, not gamblers.</SectionHeading>
        <SectionSubtitle>
          CryptoVerseHQ is designed for people who want to understand crypto — not just chase pumps.
        </SectionSubtitle>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
        {/* Left card — who this is for */}
        <div className="p-8 rounded-2xl border bg-card hover:border-primary/15 hover:shadow-md transition-all duration-300">
          <h3 className="text-lg font-bold text-foreground mb-4">
            You'll feel at home here if you...
          </h3>
          <ul className="space-y-3">
            {CHECK_ITEMS.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-muted-foreground leading-relaxed">
                <Check className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Right card — important context */}
        <div className="p-8 rounded-2xl border bg-card hover:border-primary/15 hover:shadow-md transition-all duration-300">
          <div className="flex items-center gap-2 mb-4">
            <Info className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-bold text-foreground">A note to keep in mind</h3>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            CryptoVerseHQ is an educational platform, not a financial advisor. We do not
            promise returns, issue trading signals, or encourage high-risk speculation.
            Everything we build is designed to help you learn at your own pace, in a safe
            environment, with no real money at stake until you choose otherwise.
          </p>
        </div>
      </div>
    </LandingSection>
  );
}
