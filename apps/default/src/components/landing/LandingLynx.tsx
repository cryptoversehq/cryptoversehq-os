import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles, MessageSquare, BookOpen, AlertTriangle, BarChart3, GraduationCap } from 'lucide-react';
import { LandingSection, SectionLabel, SectionHeading, SectionSubtitle } from './LandingSection';

const CAPABILITIES = [
  { icon: BookOpen, title: 'Personalized Learning', desc: 'Lynx adapts every lesson to your experience level, learning pace, and progress.' },
  { icon: MessageSquare, title: 'Instant Explanations', desc: 'Ask questions anytime and receive clear, easy-to-understand answers tailored to your current lesson.' },
  { icon: BarChart3, title: 'Practice Feedback', desc: 'After every simulator session, Lynx explains what you did well, where you can improve, and what to learn next.' },
  { icon: GraduationCap, title: 'Confidence Building', desc: 'Build practical knowledge through continuous guidance before making decisions in real markets.' },
];

export function LandingLynx() {
  return (
    <LandingSection id="lynx">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.4 }}
        >
          <SectionLabel>Meet Lynx AI</SectionLabel>
          <SectionHeading>Meet Lynx, Your Personal AI Learning Coach</SectionHeading>
          <p className="text-muted-foreground leading-relaxed mb-8 max-w-lg">
            Learn faster with personalized guidance, instant explanations, practice feedback,
            and AI-powered coaching that adapts to your learning journey—every step of the way.
          </p>

          <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 mb-6">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <span className="text-xs font-bold text-amber-600 dark:text-amber-400">Important:</span>
                <span className="text-xs text-muted-foreground ml-1">
                  Lynx helps you learn and practice with confidence, but it does not provide financial
                  advice or investment recommendations. Always make your own informed decisions.
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            {CAPABILITIES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex gap-3">
                <Icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-foreground mb-1">{title}</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          <a
            href="#"
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-foreground border border-border/60 bg-background/50 hover:bg-accent/10 hover:border-primary/30 rounded-xl transition-all duration-300"
          >
            Try Lynx AI Demo
          </a>

          <p className="text-xs text-muted-foreground/70 mt-3">
            See how Lynx guides your learning.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="hidden lg:block"
        >
          <div className="rounded-2xl border bg-card shadow-lg p-6 space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div>
                <div className="text-sm font-bold text-foreground">Lynx AI</div>
                <div className="text-[10px] text-muted-foreground">Learning Assistant</div>
                <div className="text-[10px] text-muted-foreground/70 mt-1.5 leading-relaxed">
                  AI Coach &bull; Practice Review &bull; Learning Guide
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="bg-muted/50 rounded-xl p-3">
                <div className="text-xs text-muted-foreground mb-1">You</div>
                <div className="text-sm text-foreground">I just finished the risk management lesson — can you help me apply it?</div>
              </div>
              <div className="bg-primary/5 rounded-xl p-3">
                <div className="text-xs text-primary mb-1 font-medium">Lynx AI</div>
                <div className="text-sm text-foreground leading-relaxed">
                  Nice work! Let us put that into practice. I recommend a simulator session where you set a stop‑loss
                  at <span className="font-semibold">2%</span> of your position. This is a key habit for protecting your virtual portfolio.
                </div>
              </div>
              <div className="bg-muted/50 rounded-xl p-3">
                <div className="text-xs text-muted-foreground mb-1">You</div>
                <div className="text-sm text-foreground">Alright — take me to the simulator.</div>
              </div>
              <div className="bg-primary/5 rounded-xl p-3">
                <div className="text-xs text-primary mb-1 font-medium">Lynx AI</div>
                <div className="text-sm text-foreground">
                  Open your simulator, pick any asset, and place a trade with a stop‑loss. I will review it with you right
                  after and share tips on what worked and what to improve.
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </LandingSection>
  );
}
