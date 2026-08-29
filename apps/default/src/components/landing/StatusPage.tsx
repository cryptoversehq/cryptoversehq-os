import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Shield, BrainCircuit, BarChart3, CreditCard, Activity, BarChart2, Clock, FileText, Users, BookOpen, HelpCircle, Mail } from 'lucide-react';
import { LandingHeader } from './LandingHeader';
import { LandingFooter } from './LandingFooter';
import { LandingSection, SectionLabel, SectionHeading, SectionSubtitle } from './LandingSection';

const ARCHITECTURE = [
  { icon: Shield, title: 'Authentication', desc: 'OIDC-based identity via Taskade Genesis. Sessions are managed securely with cross-device sync and encrypted credential storage.', iconBg: 'bg-primary/10', iconColor: 'text-primary' },
  { icon: BrainCircuit, title: 'AI Services', desc: 'Lynx AI is powered by DeepSeek and OpenRouter. API keys are stored server-side and proxied — never exposed to the browser.', iconBg: 'bg-violet-500/10', iconColor: 'text-violet-600 dark:text-violet-400' },
  { icon: BarChart3, title: 'Market Data', desc: 'Real-time and historical market data from CoinGecko, Binance WebSocket streams, Etherscan on-chain data, and Mempool API.', iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400' },
  { icon: CreditCard, title: 'Payments', desc: 'Subscription and CP coin payments processed externally through NOWPayments and IronixPay. Payment credentials are never stored on our servers.', iconBg: 'bg-amber-500/10', iconColor: 'text-amber-600 dark:text-amber-400' },
];

const MONITORING = [
  { icon: Activity, title: 'AI Error Monitor', desc: 'Frontend errors are automatically captured, classified by severity, deduplicated, and diagnosed with AI assistance to help our team respond quickly.', iconBg: 'bg-red-500/10', iconColor: 'text-red-600 dark:text-red-400' },
  { icon: BarChart2, title: 'API Status Service', desc: 'Five key external integrations are registered and testable — DeepSeek, CoinGecko, Etherscan, NewsAPI, and NOWPayments — each with a kill-switch for rapid response.', iconBg: 'bg-primary/10', iconColor: 'text-primary' },
  { icon: Clock, title: 'Background Jobs', desc: 'Long-running operations such as strategy backtests persist across page navigations so progress is never lost. Completed results are stored for later review.', iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400' },
  { icon: Users, title: 'Admin Dashboard', desc: 'Platform administrators have access to real-time activity sparklines, audit logs, user management, ticket tracking, and payment oversight.', iconBg: 'bg-blue-500/10', iconColor: 'text-blue-600 dark:text-blue-400' },
  { icon: FileText, title: 'Audit Logs', desc: 'A rich audit trail captures administrative actions — including who performed them, when, and whether they were reverted — supporting accountability and transparency.', iconBg: 'bg-violet-500/10', iconColor: 'text-violet-600 dark:text-violet-400' },
];

const PRINCIPLES = [
  { icon: Shield, title: 'Transparency', desc: 'We communicate honestly about what our platform can and cannot do today.', iconBg: 'bg-primary/10', iconColor: 'text-primary' },
  { icon: Shield, title: 'Security', desc: 'API keys stay on the server. Passwords are hashed. Payment credentials are never stored.', iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400' },
  { icon: Activity, title: 'Continuous Improvement', desc: 'Every error captured and every background job tracked helps us make the platform more reliable over time.', iconBg: 'bg-amber-500/10', iconColor: 'text-amber-600 dark:text-amber-400' },
  { icon: Users, title: 'Responsible Operations', desc: 'Administrative access is scoped by role. Sensitive actions are logged. Community trust is fundamental.', iconBg: 'bg-blue-500/10', iconColor: 'text-blue-600 dark:text-blue-400' },
];

const StatusPage: React.FC = () => {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/20">
      <LandingHeader />
      <main>
        <LandingSection id="status-hero">
          <div className="text-center max-w-2xl mx-auto">
            <SectionLabel>Status</SectionLabel>
            <SectionHeading>Platform Status</SectionHeading>
            <SectionSubtitle>CryptoVerse HQ continuously works to improve platform reliability and transparency. This page explains how platform health is managed and where to go if you need help.</SectionSubtitle>
          </div>
        </LandingSection>
        <LandingSection id="status-architecture" alt>
          <div className="text-center mb-14">
            <SectionLabel>Platform Architecture</SectionLabel>
            <SectionHeading>How the platform is built.</SectionHeading>
            <SectionSubtitle>Reliability starts with a solid foundation.</SectionSubtitle>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {ARCHITECTURE.map(({ icon: Icon, title, desc, iconBg, iconColor }) => (
              <div key={title} className="flex flex-col items-start text-left p-8 rounded-2xl border bg-card hover:border-primary/15 hover:shadow-md transition-all duration-300">
                <div className={`w-12 h-12 rounded-xl ${iconBg} flex items-center justify-center mb-4`}><Icon className={`h-6 w-6 ${iconColor}`} /></div>
                <h3 className="text-lg font-bold text-foreground mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </LandingSection>
        <LandingSection id="status-monitoring">
          <div className="text-center mb-14">
            <SectionLabel>Internal Monitoring</SectionLabel>
            <SectionHeading>How we stay informed.</SectionHeading>
            <SectionSubtitle>Tools and systems that help maintain platform reliability.</SectionSubtitle>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {MONITORING.map(({ icon: Icon, title, desc, iconBg, iconColor }) => (
              <div key={title} className="flex flex-col items-start text-left p-6 rounded-2xl border bg-card hover:border-primary/15 hover:shadow-md transition-all duration-300">
                <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center mb-3`}><Icon className={`h-5 w-5 ${iconColor}`} /></div>
                <h3 className="text-base font-bold text-foreground mb-1.5">{title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </LandingSection>
        <LandingSection id="status-principles" alt>
          <div className="text-center mb-14">
            <SectionLabel>Reliability Principles</SectionLabel>
            <SectionHeading>What guides our operations.</SectionHeading>
            <SectionSubtitle>These principles shape every decision about platform health.</SectionSubtitle>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {PRINCIPLES.map(({ icon: Icon, title, desc, iconBg, iconColor }) => (
              <div key={title} className="flex flex-col items-start text-left p-8 rounded-2xl border bg-card hover:border-primary/15 hover:shadow-md transition-all duration-300">
                <div className={`w-12 h-12 rounded-xl ${iconBg} flex items-center justify-center mb-4`}><Icon className={`h-6 w-6 ${iconColor}`} /></div>
                <h3 className="text-lg font-bold text-foreground mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </LandingSection>
        <LandingSection id="status-current">
          <div className="max-w-2xl mx-auto">
            <div className="p-8 rounded-2xl border bg-card">
              <h3 className="text-lg font-bold text-foreground mb-4">Current Public Status</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-3">Today, CryptoVerse HQ does not publish live operational metrics or uptime dashboards for public viewing.</p>
              <p className="text-sm text-muted-foreground leading-relaxed mb-3">Internal monitoring tools — including the AI Error Monitor, API Status Service, and Admin Dashboard — help our team detect and investigate issues as they arise.</p>
              <p className="text-sm text-muted-foreground leading-relaxed">As the platform evolves, this page will expand to provide additional visibility into platform health and service availability.</p>
            </div>
          </div>
        </LandingSection>
        <LandingSection id="status-help" alt>
          <div className="text-center mb-12">
            <SectionLabel>If Something Goes Wrong</SectionLabel>
            <SectionHeading>We're here to help.</SectionHeading>
            <SectionSubtitle>Here is what to do if you experience an issue.</SectionSubtitle>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <Link to="/help" className="flex flex-col items-center text-center p-8 rounded-2xl border bg-card hover:border-primary/15 hover:shadow-md transition-all duration-300 group">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform"><HelpCircle className="h-7 w-7 text-primary" /></div>
              <h3 className="text-xl font-bold text-foreground mb-3">Help Center</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">Browse articles and frequently asked questions.</p>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary group-hover:gap-2 transition-all">Browse Help Center <ArrowRight className="h-4 w-4" /></span>
            </Link>
            <Link to="/contact" className="flex flex-col items-center text-center p-8 rounded-2xl border bg-card hover:border-primary/15 hover:shadow-md transition-all duration-300 group">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform"><Mail className="h-7 w-7 text-primary" /></div>
              <h3 className="text-xl font-bold text-foreground mb-3">Contact Support</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">Reach out to our support team for assistance.</p>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary group-hover:gap-2 transition-all">Contact Us <ArrowRight className="h-4 w-4" /></span>
            </Link>
            <div className="flex flex-col items-center text-center p-8 rounded-2xl border bg-card hover:border-primary/15 hover:shadow-md transition-all duration-300">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-5"><Activity className="h-7 w-7 text-amber-600 dark:text-amber-400" /></div>
              <h3 className="text-xl font-bold text-foreground mb-3">Report an Issue</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Describe unexpected behavior or bugs so we can investigate and resolve them.</p>
            </div>
          </div>
        </LandingSection>
        <LandingSection id="status-quote">
          <div className="max-w-2xl mx-auto text-center">
            <blockquote className="text-3xl sm:text-4xl lg:text-5xl font-black text-foreground tracking-tight leading-tight">"Trust is built through transparency, not promises."</blockquote>
            <p className="mt-6 text-base sm:text-lg text-muted-foreground leading-relaxed">Every monitoring tool, every audit log, and every reliability improvement exists to earn and maintain the trust of our community.</p>
          </div>
        </LandingSection>
      </main>
      <LandingFooter />
    </div>
  );
};

export default StatusPage;
