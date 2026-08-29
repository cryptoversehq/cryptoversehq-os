import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { LandingSection, SectionLabel, SectionHeading, SectionSubtitle } from './LandingSection';

const FAQS = [
  {
    q: 'Is CryptoVerse HQ really free?',
    a: 'Yes! The Free plan gives you access to the trading simulator (10 trades), 5 academy modules, basic market data, and community features. No credit card required to start learning.',
  },
  {
    q: 'Do I need any crypto experience?',
    a: 'Not at all. Our platform is built for complete beginners. The Academy starts with blockchain fundamentals and progresses at your pace. Lynx AI is always available to answer questions.',
  },
  {
    q: 'Is this real trading or simulation?',
    a: 'CryptoVerse HQ is primarily an educational platform. The default experience uses simulated trading with virtual funds. Pro+ users can optionally connect real exchange accounts, but simulation is always the default learning mode.',
  },
  {
    q: 'Does Lynx AI give financial advice?',
    a: 'No. Lynx AI is an educational assistant that explains concepts, provides trade feedback on your practice trades, and helps you learn. It never provides financial advice, investment recommendations, or profit predictions.',
  },
  {
    q: 'Can I cancel my subscription?',
    a: 'Absolutely. All paid plans are month-to-month. Cancel anytime and you will retain access until the end of your billing period. Your learning progress is never lost.',
  },
  {
    q: 'How do competitions work?',
    a: 'Competitions are simulated trading challenges where you compete against other learners. Each competition has specific rules, timeframes, and leaderboards. They are a fun way to test your skills risk-free.',
  },
];

export function LandingFAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <LandingSection id="faq">
      <div className="text-center mb-14">
        <SectionLabel>FAQ</SectionLabel>
        <SectionHeading>Frequently Asked Questions</SectionHeading>
        <SectionSubtitle>
          Everything you need to know about learning with CryptoVerse HQ.
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
                aria-controls={`faq-answer-${i}`}
              >
                <span className="text-sm font-semibold text-foreground pr-4">{item.q}</span>
                {isOpen
                  ? <ChevronUp className="h-4 w-4 text-primary shrink-0" />
                  : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                }
              </button>
              {isOpen && (
                <div id={`faq-answer-${i}`} className="px-5 pb-5">
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
