import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { useLiveSubscriptionPlans, type PlanId } from '@/lib/monetizationStore';
import { LandingSection, SectionLabel, SectionHeading, SectionSubtitle } from './LandingSection';
import { cn } from '@/lib/utils';

const PLAN_FEATURES: Record<PlanId, string[]> = {
  free: [
    'Lynx AI (basic)',
    'Trading Simulator (10 trades)',
    '5 Academy Modules',
    'Basic Market Data',
    'Community Chat',
  ],
  pro: [
    'Unlimited Simulator Access',
    'Full Academy Curriculum',
    '5 AI Practice Bots',
    'Competitions & Leagues',
    'Lynx AI (full)',
    'Market Sentiment Data',
    'Performance Analytics',
    'Priority Support',
  ],
  pro_plus: [
    'Everything in Pro',
    '20 AI Practice Bots',
    'Advanced On-Chain Data',
    'Strategy Backtesting',
    'API Access',
    'Custom Indicators',
  ],
};

const PLAN_META: Record<PlanId, { highlight: boolean; cta: string }> = {
  free: { highlight: false, cta: 'Start Learning' },
  pro: { highlight: true, cta: 'Upgrade to Pro' },
  pro_plus: { highlight: false, cta: 'Go Pro+' },
};

export function LandingPricing() {
  const livePlans = useLiveSubscriptionPlans();
  const [yearly, setYearly] = useState(false);
  const plans = Object.values(livePlans).sort((a, b) => a.priceUSD - b.priceUSD);

  return (
    <LandingSection id="pricing">
      <div className="text-center mb-14">
        <SectionLabel>Pricing</SectionLabel>
        <SectionHeading>Start Free. Upgrade When You're Ready.</SectionHeading>
        <SectionSubtitle>
          Free to start, upgrade anytime. Every plan includes AI-powered learning,
          simulator practice, and advanced tools to grow your skills.
        </SectionSubtitle>

        <div className="inline-flex items-center gap-3 bg-muted border rounded-xl p-1 mt-8">
          <button
            onClick={() => setYearly(false)}
            aria-pressed={!yearly}
            aria-label="Billed monthly"
            className={cn('px-4 py-2 text-sm font-medium rounded-lg transition-all', !yearly ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground')}
          >
            Monthly
          </button>
          <button
            onClick={() => setYearly(true)}
            aria-pressed={yearly}
            aria-label="Billed yearly, save 20%"
            className={cn('px-4 py-2 text-sm font-medium rounded-lg transition-all', yearly ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground')}
          >
            Yearly
            <span className="ml-1.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
              Save 20%
            </span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
        {plans.map((plan) => {
          const meta = PLAN_META[plan.id];
          const features = PLAN_FEATURES[plan.id];
          const displayPrice = yearly ? Math.round(plan.priceUSD * 0.8) : plan.priceUSD;

          return (
            <div
              key={plan.id}
              className={cn(
                'relative p-6 rounded-2xl border transition-all duration-300',
                meta.highlight
                  ? 'border-primary/30 bg-primary/[0.02] shadow-xl shadow-primary/5 ring-1 ring-primary/10'
                  : 'border-border bg-card hover:border-primary/20 hover:shadow-md',
              )}
            >
              {meta.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-primary text-primary-foreground text-xs font-bold rounded-full shadow-md">
                  Most Popular
                </div>
              )}

              <div className="text-2xl mb-2">{plan.icon}</div>
              <h3 className="text-lg font-bold text-foreground mb-1">{plan.name}</h3>
              <p className="text-sm text-muted-foreground mb-5">{plan.cpPerMonth.toLocaleString()} CP / month</p>

              <div className="mb-5">
                <span className="text-4xl font-black text-foreground">${displayPrice}</span>
                <span className="text-muted-foreground text-sm">/mo</span>
                {plan.priceUSD === 0 && (
                  <span className="ml-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">Free forever</span>
                )}
              </div>

              <Link
                to="/signup"
                className={cn(
                  'block w-full py-2.5 text-center text-sm font-bold rounded-xl transition-all mb-5',
                  meta.highlight
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20'
                    : 'border bg-card text-foreground hover:bg-accent',
                )}
              >
                {meta.cta}
              </Link>

              <ul className="space-y-2.5">
                {features.map((feat) => (
                  <li key={feat} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                    <Check className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                    {feat}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground/70 mt-8">
        Cancel anytime. No hidden fees. Upgrade whenever you're ready.
      </p>
    </LandingSection>
  );
}
