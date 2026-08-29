import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { LandingSection, SectionLabel } from './LandingSection';

export function LandingCTA() {
  return (
    <LandingSection className="text-center">
      <div className="relative rounded-3xl border border-primary/10 bg-gradient-to-br from-primary/[0.03] to-transparent p-10 sm:p-16 overflow-hidden">
        <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-primary/5 blur-[80px] rounded-full" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-blue-500/5 blur-[80px] rounded-full" />

        <div className="relative z-10">
          <SectionLabel>START YOUR JOURNEY</SectionLabel>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-foreground mt-2 mb-4 tracking-tight">
            Build Real Crypto Skills—One Lesson at a Time
          </h2>
          <p className="max-w-lg mx-auto text-muted-foreground text-base sm:text-lg mb-8">
            Learn with AI guidance, practice in a risk-free simulator, challenge yourself
            through competitions, and build the confidence to navigate real markets—all at
            your own pace.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/signup"
              className="inline-flex items-center gap-2 px-8 py-4 text-sm font-bold text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl transition-all shadow-lg shadow-primary/20"
            >
              Start Learning Free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#pricing"
              className="px-8 py-4 text-sm font-semibold text-foreground hover:text-primary transition-colors"
            >
              Compare Plans
            </a>
          </div>
          <p className="text-xs text-muted-foreground/70 mt-6">
            Free forever to get started. Upgrade only when you're ready.
          </p>
        </div>
      </div>
    </LandingSection>
  );
}
