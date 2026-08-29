import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Shield, Lock, Fingerprint, History, Key, Server, CreditCard, FileText, Eye, BrainCircuit, MessageCircle, Users, ShieldCheck, FileCheck, Activity, BarChart2, Clock, Mail, AlertTriangle } from 'lucide-react';
import { LandingHeader } from './LandingHeader';
import { LandingFooter } from './LandingFooter';
import { LandingSection, SectionLabel, SectionHeading, SectionSubtitle } from './LandingSection';
import { PageSEO } from './LandingSEO';

const ACCOUNT = [
  { icon: Shield, title: 'OIDC Authentication', desc: 'Identity is managed through Taskade Genesis using the OpenID Connect standard. Auto-discovery ensures standards-compliant authentication.', iconBg: 'bg-primary/10', iconColor: 'text-primary' },
  { icon: Lock, title: 'SHA-256 Password Hashing', desc: 'All passwords are hashed using SHA-256 via the browser native WebCrypto API. Hashes are stored — never plaintext. Legacy accounts are migrated automatically on next login.', iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400' },
  { icon: Fingerprint, title: 'Biometric Login', desc: 'Supported devices can authenticate using biometric sensors. Credentials are stored securely and never transmitted in plain form.', iconBg: 'bg-violet-500/10', iconColor: 'text-violet-600 dark:text-violet-400' },
  { icon: History, title: 'Session Management', desc: 'Sessions persist securely across browser restarts with cross-device sync. Login history is tracked and viewable from your profile.', iconBg: 'bg-blue-500/10', iconColor: 'text-blue-600 dark:text-blue-400' },
];

const PRINCIPLES = [
  { icon: Eye, title: 'Privacy by Design', desc: 'Data collection is limited to what is necessary. You control the visibility of your profile and performance data.', iconBg: 'bg-primary/10', iconColor: 'text-primary' },
  { icon: ShieldCheck, title: 'Least Privilege', desc: 'Administrator access is scoped by role and section. No one has more access than they need — including our own team.', iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400' },
  { icon: FileText, title: 'Transparency', desc: 'Our security practices are documented openly. Privacy policies and terms are publicly available in plain language.', iconBg: 'bg-blue-500/10', iconColor: 'text-blue-600 dark:text-blue-400' },
  { icon: Activity, title: 'Continuous Improvement', desc: 'Every error captured, every audit log reviewed, and every background job tracked strengthens the platform over time.', iconBg: 'bg-amber-500/10', iconColor: 'text-amber-600 dark:text-amber-400' },
];

const DATA = [
  { icon: Lock, title: 'HTTPS Encryption', desc: 'All communication between your browser and CryptoVerse HQ is encrypted using HTTPS.', iconBg: 'bg-primary/10', iconColor: 'text-primary' },
  { icon: Server, title: 'Server-Side Secret Storage', desc: 'API keys for AI services are stored in Taskade Space Settings. They are resolved server-side — never in the browser.', iconBg: 'bg-violet-500/10', iconColor: 'text-violet-600 dark:text-violet-400' },
  { icon: Key, title: 'Exchange API Key Isolation', desc: 'When you connect a real exchange account, your API keys stay on your device. Only Read and Trade permissions — never Withdraw.', iconBg: 'bg-amber-500/10', iconColor: 'text-amber-600 dark:text-amber-400' },
  { icon: CreditCard, title: 'External Payment Processors', desc: 'All payments are processed by NOWPayments and IronixPay. We never store or access your full payment credentials.', iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400' },
  { icon: FileText, title: 'User Data Rights', desc: 'Access, correct, export, and delete your data — including learning history, simulator records, and AI conversations — from Account Settings.', iconBg: 'bg-blue-500/10', iconColor: 'text-blue-600 dark:text-blue-400' },
];

const AI = [
  { icon: Server, title: 'Server-Side Proxy', desc: 'All Lynx AI requests go through GenesisClient.proxy(). The DeepSeek API key is resolved server-side — it never touches your browser.', iconBg: 'bg-primary/10', iconColor: 'text-primary' },
  { icon: Lock, title: 'Secret Isolation', desc: 'API credentials are stored as named aliases. Each key is independently managed and can be revoked without affecting other services.', iconBg: 'bg-violet-500/10', iconColor: 'text-violet-600 dark:text-violet-400' },
  { icon: MessageCircle, title: 'Private Conversations', desc: 'Your Lynx AI conversations are private to your account. Individual conversations are never shared with third parties.', iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400' },
  { icon: ShieldCheck, title: 'AI Recommendations Are Advisory', desc: 'Lynx AI never grants administrator privileges automatically. It evaluates and recommends — final approval always requires a human Super Admin.', iconBg: 'bg-amber-500/10', iconColor: 'text-amber-600 dark:text-amber-400' },
];

const OVERSIGHT = [
  { icon: Users, title: 'Six-Level Admin Hierarchy', desc: 'Administrator roles range from Content Admin to Technical Admin, each with scoped permissions and specific eligibility requirements.', iconBg: 'bg-primary/10', iconColor: 'text-primary' },
  { icon: Eye, title: 'View-Only Admin Mode', desc: 'Administrators viewing user accounts operate in strictly read-only mode. All mutating actions are blocked at the framework level.', iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400' },
  { icon: FileCheck, title: 'Rich Audit Trail', desc: 'Over 30 types of administrative actions are logged — who performed them, when, IP address, reason, and whether they were reverted.', iconBg: 'bg-violet-500/10', iconColor: 'text-violet-600 dark:text-violet-400' },
  { icon: ShieldCheck, title: 'Super Admin Approval', desc: 'Community members request administrator status from their profile. After AI evaluation, only a Super Admin grants final approval.', iconBg: 'bg-amber-500/10', iconColor: 'text-amber-600 dark:text-amber-400' },
];

const MONITOR = [
  { icon: Activity, title: 'AI Error Monitor', desc: 'Frontend errors are captured, classified by severity, deduplicated, and diagnosed with AI to accelerate response times.', iconBg: 'bg-red-500/10', iconColor: 'text-red-600 dark:text-red-400' },
  { icon: BarChart2, title: 'API Status Service', desc: 'Five key integrations are registered with health checks. Each can be independently tested with a kill-switch for rapid response.', iconBg: 'bg-primary/10', iconColor: 'text-primary' },
  { icon: Clock, title: 'Background Jobs', desc: 'Long-running operations persist across navigation. Job progress is tracked and results are stored for later review.', iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400' },
  { icon: History, title: 'Login History', desc: 'Every login is recorded and viewable from your profile, helping you monitor account access over time.', iconBg: 'bg-blue-500/10', iconColor: 'text-blue-600 dark:text-blue-400' },
];

type Item = { icon: any; title: string; desc: string; iconBg: string; iconColor: string };
function CardGrid({ items }: { items: Item[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-4xl mx-auto">
      {items.map(({ icon: Icon, title, desc, iconBg, iconColor }) => (
        <div key={title} className="flex flex-col items-start text-left p-8 rounded-2xl border bg-card hover:border-primary/15 hover:shadow-md transition-all duration-300">
          <div className={`w-12 h-12 rounded-xl ${iconBg} flex items-center justify-center mb-4`}><Icon className={`h-6 w-6 ${iconColor}`} /></div>
          <h3 className="text-lg font-bold text-foreground mb-2">{title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
        </div>
      ))}
    </div>
  );
}

function TinyGrid({ items }: { items: Item[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
      {items.map(({ icon: Icon, title, desc, iconBg, iconColor }) => (
        <div key={title} className="flex flex-col items-start text-left p-6 rounded-2xl border bg-card hover:border-primary/15 hover:shadow-md transition-all duration-300">
          <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center mb-3`}><Icon className={`h-5 w-5 ${iconColor}`} /></div>
          <h3 className="text-base font-bold text-foreground mb-1.5">{title}</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
        </div>
      ))}
    </div>
  );
}

const SecurityPage: React.FC = () => {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/20">
      <LandingHeader />
      <main>
        <LandingSection id="security-hero">
          <div className="text-center max-w-2xl mx-auto">
            <SectionLabel>Security</SectionLabel>
            <SectionHeading>Security at CryptoVerse HQ</SectionHeading>
            <SectionSubtitle>How we protect your account, your data, and the integrity of the learning platform.</SectionSubtitle>
          </div>
        </LandingSection>

        <LandingSection id="security-account" alt>
          <div className="text-center mb-14"><SectionLabel>Account Security</SectionLabel><SectionHeading>Your account is protected.</SectionHeading><SectionSubtitle>Multiple layers of security keep your credentials and session safe.</SectionSubtitle></div>
          <CardGrid items={ACCOUNT} />
        </LandingSection>

        <LandingSection id="security-principles">
          <div className="text-center mb-14"><SectionLabel>Security Principles</SectionLabel><SectionHeading>What guides our approach.</SectionHeading><SectionSubtitle>These principles shape every security decision we make.</SectionSubtitle></div>
          <CardGrid items={PRINCIPLES} />
        </LandingSection>

        <LandingSection id="security-data" alt>
          <div className="text-center mb-14"><SectionLabel>Data Protection</SectionLabel><SectionHeading>Your data stays yours.</SectionHeading><SectionSubtitle>From encryption to access controls, here is how your information is safeguarded.</SectionSubtitle></div>
          <TinyGrid items={DATA} />
        </LandingSection>

        <LandingSection id="security-ai">
          <div className="text-center mb-14"><SectionLabel>AI Security</SectionLabel><SectionHeading>Intelligence without exposure.</SectionHeading><SectionSubtitle>Lynx AI is designed to be powerful and private — your data and our keys are never at risk.</SectionSubtitle></div>
          <CardGrid items={AI} />
        </LandingSection>

        <LandingSection id="security-oversight" alt>
          <div className="text-center mb-14"><SectionLabel>Platform Oversight</SectionLabel><SectionHeading>Accountability at every level.</SectionHeading><SectionSubtitle>Administrator access is structured, logged, and always subject to human review.</SectionSubtitle></div>
          <CardGrid items={OVERSIGHT} />
        </LandingSection>

        <LandingSection id="security-monitoring">
          <div className="text-center mb-14"><SectionLabel>Continuous Monitoring</SectionLabel><SectionHeading>We keep watch.</SectionHeading><SectionSubtitle>Tools and systems that help us detect, diagnose, and resolve issues.</SectionSubtitle></div>
          <CardGrid items={MONITOR} />
        </LandingSection>

        <LandingSection id="security-disclosure" alt>
          <div className="max-w-2xl mx-auto">
            <div className="p-8 rounded-2xl border bg-card">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><AlertTriangle className="h-5 w-5 text-primary" /></div>
                <div>
                  <h3 className="text-lg font-bold text-foreground mb-2">Responsible Disclosure</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-4">If you discover a security vulnerability, we want to hear from you. Please email us with as much relevant information as possible so we can investigate and respond quickly.</p>
                  <a href="mailto:security@cryptoversehq.com" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"><Mail className="h-4 w-4" /> security@cryptoversehq.com</a>
                  <p className="text-xs text-muted-foreground/70 mt-4">You can also reach us through the <Link to="/contact" className="text-primary hover:underline">Contact page</Link>.</p>
                </div>
              </div>
            </div>
          </div>
        </LandingSection>

        <LandingSection id="security-quote">
          <div className="max-w-2xl mx-auto text-center">
            <blockquote className="text-3xl sm:text-4xl lg:text-5xl font-black text-foreground tracking-tight leading-tight">"Security is not a feature. It is a commitment."</blockquote>
            <p className="mt-6 text-base sm:text-lg text-muted-foreground leading-relaxed">Every line of code, every architectural decision, and every operational practice exists to protect the trust our community places in us.</p>
          </div>
        </LandingSection>
      </main>
      <LandingFooter />
    </div>
  );
};

export default SecurityPage;
