import React, { useEffect } from 'react';
import { ArrowRight, BookOpen, Users, Headphones, Trophy, Coins, Cog, Shield, Check, TrendingUp, BrainCircuit, UserCheck, Star, MessageCircle, FileCheck } from 'lucide-react';
import { LandingHeader } from './LandingHeader';
import { LandingFooter } from './LandingFooter';
import { LandingSection, SectionLabel, SectionHeading, SectionSubtitle } from './LandingSection';
import { ADMIN_LEVEL_META, AdminLevel } from '@/lib/adminManagementStore';

const LEADERSHIP_PATHS: Array<{ level: AdminLevel; icon: React.ElementType }> = [
  { level: 1, icon: BookOpen },
  { level: 2, icon: Users },
  { level: 3, icon: Headphones },
  { level: 4, icon: Trophy },
  { level: 5, icon: Coins },
  { level: 6, icon: Cog },
];

const WHAT_WE_LOOK_FOR = [
  { icon: BookOpen, title: 'Academy Progress', desc: 'Continuous learning and educational achievement.', iconBg: 'bg-primary/10', iconColor: 'text-primary' },
  { icon: MessageCircle, title: 'Positive Community Participation', desc: 'Helping other learners and maintaining respectful discussions.', iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400' },
  { icon: Shield, title: 'Responsible Platform Behavior', desc: 'Following community guidelines and demonstrating trustworthiness.', iconBg: 'bg-blue-500/10', iconColor: 'text-blue-600 dark:text-blue-400' },
  { icon: TrendingUp, title: 'Leadership Potential', desc: 'Consistency, reputation, maturity, and long-term engagement.', iconBg: 'bg-amber-500/10', iconColor: 'text-amber-600 dark:text-amber-400' },
];

const PRINCIPLES = [
  'No employment application',
  'No resume required',
  'No interviews',
  'No payment required',
  'No guaranteed approval',
  'Maximum request attempts follow platform rules',
  'Final approval is always performed by the Super Admin',
];

const CareersPage: React.FC = () => {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/20">
      <LandingHeader />
      <main>
        {/* Hero */}
        <LandingSection id="careers-hero">
          <div className="text-center max-w-2xl mx-auto">
            <SectionLabel>Careers</SectionLabel>
            <SectionHeading>Become a Community Leader.</SectionHeading>
            <SectionSubtitle>
              Leadership within CryptoVerseHQ is earned through continuous learning,
              responsible participation, and meaningful contributions — not through
              traditional job applications.
            </SectionSubtitle>
          </div>
        </LandingSection>

        {/* Community Leadership Philosophy */}
        <LandingSection id="careers-philosophy" alt>
          <div className="max-w-2xl mx-auto text-center">
            <SectionHeading className="mb-8">Leadership grows from within.</SectionHeading>
            <p className="text-base text-muted-foreground leading-relaxed">
              CryptoVerseHQ believes the best community leaders are people who have
              already demonstrated knowledge, integrity, consistency, and a willingness
              to help others. Administrators are not recruited from outside — they grow
              from within the community, selected from trusted members who have proven
              their commitment to learning and their respect for fellow learners.
            </p>
          </div>
        </LandingSection>

        {/* Leadership Paths */}
        <LandingSection id="careers-paths">
          <div className="text-center mb-14">
            <SectionLabel>Leadership Paths</SectionLabel>
            <SectionHeading>Six ways to serve the community.</SectionHeading>
            <SectionSubtitle>
              Each administrator role focuses on a specific area of the platform.
            </SectionSubtitle>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {LEADERSHIP_PATHS.map(({ level, icon: Icon }) => {
              const meta = ADMIN_LEVEL_META[level];
              return (
                <div key={level} className="flex flex-col items-start text-left p-6 rounded-2xl border bg-card hover:border-primary/15 hover:shadow-md transition-all duration-300">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3" style={{ backgroundColor: meta.bg }}>
                    <Icon className="h-5 w-5" style={{ color: meta.color }} />
                  </div>
                  <h3 className="text-base font-bold text-foreground mb-1.5">
                    <span className="mr-2">{meta.icon}</span>{meta.role}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{meta.description}</p>
                  {!meta.canRequest && (
                    <span className="mt-3 inline-block text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-500/10 text-red-500">
                      Assigned by Super Admin only
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </LandingSection>

        {/* What We Look For */}
        <LandingSection id="careers-criteria" alt>
          <div className="text-center mb-14">
            <SectionLabel>What We Look For</SectionLabel>
            <SectionHeading>More than trading performance.</SectionHeading>
            <SectionSubtitle>
              Administrator selection is holistic — it considers your entire contribution to the community.
            </SectionSubtitle>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-4xl mx-auto mb-10">
            {WHAT_WE_LOOK_FOR.map(({ icon: Icon, title, desc, iconBg, iconColor }) => (
              <div key={title} className="flex flex-col items-start text-left p-8 rounded-2xl border bg-card hover:border-primary/15 hover:shadow-md transition-all duration-300">
                <div className={`w-12 h-12 rounded-xl ${iconBg} flex items-center justify-center mb-4`}><Icon className={`h-6 w-6 ${iconColor}`} /></div>
                <h3 className="text-lg font-bold text-foreground mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-muted-foreground/70 max-w-xl mx-auto">
            Leadership is earned through trust — not financial performance alone.
            Trading profits are only one small part of the overall evaluation.
          </p>
        </LandingSection>

        {/* How Evaluation Works */}
        <LandingSection id="careers-process">
          <div className="text-center mb-14">
            <SectionLabel>How the Evaluation Works</SectionLabel>
            <SectionHeading>AI assists. Humans decide.</SectionHeading>
            <SectionSubtitle>
              The evaluation process is transparent, consistent, and always requires human approval.
            </SectionSubtitle>
          </div>

          <div className="max-w-2xl mx-auto space-y-0">
            {[
              { icon: UserCheck, title: 'Request from Your Profile', desc: 'Eligible community members request administrator status directly from their Profile page. Select the role that matches your strengths and contributions.' },
              { icon: BrainCircuit, title: 'Lynx AI Evaluation', desc: 'Lynx AI reviews your educational progress, simulator activity, community participation, and platform behavior against the requirements for your selected role.' },
              { icon: FileCheck, title: 'AI Recommendation', desc: 'Based on the evaluation, Lynx AI prepares a recommendation. The AI never grants administrator privileges automatically — it only advises.' },
              { icon: Shield, title: 'Super Admin Review', desc: 'A Super Admin reviews the AI recommendation and your profile. Final approval is always made by a human — no exceptions.' },
            ].map(({ icon: Icon, title, desc }, i) => (
              <div key={i} className="flex items-start gap-5 p-6 border-l-2 border-primary/20 hover:border-primary/40 transition-colors">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-primary">Step {i + 1}</span>
                    <h3 className="text-base font-bold text-foreground">{title}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="text-center text-xs text-muted-foreground/70 mt-8 max-w-lg mx-auto">
            AI never grants administrator privileges automatically. Human approval is always required.
          </p>
        </LandingSection>

        {/* Administrator Requirements Summary */}
        <LandingSection id="careers-requirements" alt>
          <div className="max-w-2xl mx-auto text-center">
            <SectionLabel>Administrator Requirements</SectionLabel>
            <SectionHeading>Each role has its own criteria.</SectionHeading>
            <p className="text-base text-muted-foreground leading-relaxed mb-6">
              Every leadership role includes specific eligibility requirements.
              These may include academy progress, quiz performance, community reputation,
              platform activity, competition experience, support quality, and responsible behavior.
            </p>
            <p className="text-sm text-muted-foreground/70">
              Specific eligibility requirements vary depending on the administrator role.
            </p>
          </div>
        </LandingSection>

        {/* Important Principles */}
        <LandingSection id="careers-principles">
          <div className="max-w-2xl mx-auto">
            <div className="p-8 rounded-2xl border bg-card">
              <h3 className="text-lg font-bold text-foreground mb-5">What you should know</h3>
              <ul className="space-y-3">
                {PRINCIPLES.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-muted-foreground">
                    <Check className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </LandingSection>

        {/* Brand Philosophy */}
        <LandingSection id="careers-quote" alt>
          <div className="max-w-2xl mx-auto text-center">
            <blockquote className="text-3xl sm:text-4xl lg:text-5xl font-black text-foreground tracking-tight leading-tight">
              "Great communities aren't built by hiring everyone.
              <br />
              They're built by empowering the people who consistently help others learn."
            </blockquote>
            <p className="mt-6 text-base sm:text-lg text-muted-foreground leading-relaxed">
              Leadership begins with learning, grows through contribution, and is strengthened by trust.
            </p>
          </div>
        </LandingSection>
      </main>
      <LandingFooter />
    </div>
  );
};

export default CareersPage;
