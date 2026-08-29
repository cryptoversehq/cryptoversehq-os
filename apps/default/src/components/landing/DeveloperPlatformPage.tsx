import React, { useEffect } from 'react';
import {
  Layers, Shield, Zap, Puzzle,
  Database, BrainCircuit, Network, Coins,
  Link2, BarChart3, CreditCard, Globe,
  Server,
} from 'lucide-react';
import { LandingHeader } from './LandingHeader';
import { LandingFooter } from './LandingFooter';
import { LandingSection, SectionLabel, SectionHeading, SectionSubtitle } from './LandingSection';

// ── Internal Architecture cards ──

const ARCHITECTURE = [
  {
    icon: Layers,
    title: 'Virtual REST API',
    desc: 'The platform operates on a clean REST contract — GET, POST, PUT, DELETE — that the UI consumes through a unified API client. Under the hood, requests route to Zustand stores rather than a remote HTTP server, keeping the architecture swap-ready for a future backend migration.',
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
  },
  {
    icon: Zap,
    title: 'Zustand-Powered State',
    desc: 'Every domain — trading, academy, bots, competitions — runs through dedicated Zustand stores. This means instant response times, offline-tolerant state, and a consistent data model across the entire application.',
    iconBg: 'bg-amber-500/10',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  {
    icon: Shield,
    title: 'Typed API Contracts',
    desc: 'All API responses follow a strict discriminated union — ApiSuccess<T> or ApiError — ensuring every caller handles both outcomes. Field-level validation errors, pagination metadata, and error codes are type-safe end to end.',
    iconBg: 'bg-emerald-500/10',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    icon: Puzzle,
    title: 'Modular Domain APIs',
    desc: 'Ten independent domain modules — strategies, bots, backtest, copy trading, on-chain, sentiment, NFT, events, recommendations, and exchange — each with its own typed endpoints, auth guards, and contract file.',
    iconBg: 'bg-violet-500/10',
    iconColor: 'text-violet-600 dark:text-violet-400',
  },
];

// ── Verified Integrations ──

const INTEGRATIONS = [
  {
    icon: BarChart3,
    title: 'CoinGecko',
    desc: 'Live cryptocurrency price data, market caps, and historical charts power the simulator, portfolio tracking, and market analysis tools.',
    iconBg: 'bg-emerald-500/10',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    icon: BrainCircuit,
    title: 'DeepSeek AI',
    desc: 'Lynx AI\'s core reasoning engine. API keys are stored server-side via Taskade Secrets and never enter the browser — every AI call is proxied securely.',
    iconBg: 'bg-violet-500/10',
    iconColor: 'text-violet-600 dark:text-violet-400',
  },
  {
    icon: Network,
    title: 'OpenRouter',
    desc: 'Multi-model AI routing enables Lynx AI to select the best model for each task — from quick answers to in-depth trading analysis.',
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
  },
  {
    icon: Coins,
    title: 'Binance',
    desc: 'Verified symbol listings, trading pairs, and exchange metadata ensure the simulator and bots operate on accurate, up-to-date market structures.',
    iconBg: 'bg-amber-500/10',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  {
    icon: Database,
    title: 'Etherscan',
    desc: 'On-chain transaction data, wallet activity, and smart contract events power the on-chain analytics, whale tracking, and smart money identification features.',
    iconBg: 'bg-blue-500/10',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  {
    icon: Link2,
    title: 'Mempool API',
    desc: 'Real-time Bitcoin mempool data enables transaction fee estimation and network congestion analysis for on-chain learning modules.',
    iconBg: 'bg-red-500/10',
    iconColor: 'text-red-600 dark:text-red-400',
  },
  {
    icon: CreditCard,
    title: 'NOWPayments',
    desc: 'Cryptocurrency payment processing for subscriptions, CP coin purchases, and marketplace transactions — supporting multiple cryptocurrencies.',
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
  },
  {
    icon: Globe,
    title: 'IronixPay',
    desc: 'Regional payment gateway integration for users in supported regions, providing localised payment options with full subscription management.',
    iconBg: 'bg-amber-500/10',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  {
    icon: Server,
    title: 'Taskade Genesis',
    desc: 'The foundational platform powering authentication, OIDC-based identity, server-side secrets management, and secure API proxying — ensuring credentials never touch the browser.',
    iconBg: 'bg-violet-500/10',
    iconColor: 'text-violet-600 dark:text-violet-400',
  },
];

// ── Developer Platform Page ──

const DeveloperPlatformPage: React.FC = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/20">
      <LandingHeader />
      <main>
        {/* Hero */}
        <LandingSection id="dev-hero">
          <div className="text-center max-w-2xl mx-auto">
            <SectionLabel>Developer Platform</SectionLabel>
            <SectionHeading>Building the Future Developer Platform</SectionHeading>
            <SectionSubtitle>
              CryptoVerse HQ currently uses a powerful internal API architecture to
              power the learning platform. Public developer APIs are planned for the
              future and will be introduced when they are ready.
            </SectionSubtitle>
          </div>
        </LandingSection>

        {/* Internal Platform Architecture */}
        <LandingSection id="dev-architecture" alt>
          <div className="text-center mb-14">
            <SectionLabel>Internal Platform Architecture</SectionLabel>
            <SectionHeading>Built for scale from day one.</SectionHeading>
            <SectionSubtitle>
              The platform runs on a clean, modular architecture designed to grow alongside the product.
            </SectionSubtitle>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {ARCHITECTURE.map(({ icon: Icon, title, desc, iconBg, iconColor }) => (
              <div
                key={title}
                className="flex flex-col items-start text-left p-8 rounded-2xl border bg-card hover:border-primary/15 hover:shadow-md transition-all duration-300"
              >
                <div className={`w-12 h-12 rounded-xl ${iconBg} flex items-center justify-center mb-4`}>
                  <Icon className={`h-6 w-6 ${iconColor}`} />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </LandingSection>

        {/* Existing Integrations */}
        <LandingSection id="dev-integrations">
          <div className="text-center mb-14">
            <SectionLabel>Existing Integrations</SectionLabel>
            <SectionHeading>Powered by trusted services.</SectionHeading>
            <SectionSubtitle>
              Every integration is carefully selected to support the learning experience.
            </SectionSubtitle>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {INTEGRATIONS.map(({ icon: Icon, title, desc, iconBg, iconColor }) => (
              <div
                key={title}
                className="flex flex-col items-start text-left p-6 rounded-2xl border bg-card hover:border-primary/15 hover:shadow-md transition-all duration-300"
              >
                <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center mb-3`}>
                  <Icon className={`h-5 w-5 ${iconColor}`} />
                </div>
                <h3 className="text-base font-bold text-foreground mb-1.5">{title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </LandingSection>

        {/* Public API Status */}
        <LandingSection id="dev-status" alt>
          <div className="max-w-2xl mx-auto">
            <div className="p-8 rounded-2xl border bg-card">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                  <Zap className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground mb-3">Public API Status</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                    Public developer APIs are not available today.
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    As CryptoVerse HQ evolves, we plan to introduce secure APIs for
                    selected platform capabilities such as market data, learning
                    progress, and educational integrations.
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-4">
                    No release date is currently available.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </LandingSection>

        {/* Developer Philosophy */}
        <LandingSection id="dev-philosophy">
          <div className="max-w-2xl mx-auto text-center">
            <blockquote className="text-3xl sm:text-4xl lg:text-5xl font-black text-foreground tracking-tight leading-tight">
              "Great APIs shouldn't just expose data.
              <br />
              They should help developers build meaningful experiences."
            </blockquote>
            <p className="mt-8 text-base sm:text-lg text-muted-foreground leading-relaxed">
              When a public developer platform becomes available, it will follow the
              same principles that guide CryptoVerse HQ today: security, simplicity,
              transparency, and long-term reliability.
            </p>
          </div>
        </LandingSection>
      </main>
      <LandingFooter />
    </div>
  );
};

export default DeveloperPlatformPage;
