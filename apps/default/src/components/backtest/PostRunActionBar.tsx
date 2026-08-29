/**
 * PostRunActionBar.tsx — Parts 9.1 · 9.2 · 9.3 · 9.4
 *
 * Floating action bar that appears below the Results panel after a
 * successful backtest run. Surfaces every integration point in one place.
 *
 * ┌───────────────────────────────────────────────────────────────────┐
 * │  🏆 Publish to Marketplace  |  🚀 Deploy to Demo  |  🤖 Create Bot │
 * │  🏅 Submit to Competition   |  ⭐ Claim XP (Academy)             │
 * └───────────────────────────────────────────────────────────────────┘
 *
 * Integrations:
 *   9.1 — strategyStore.createStrategy() → publishes + populates metrics
 *   9.2 — Demo deploy / bot creation (simulated — opens confirmation toast)
 *   9.3 — academyStore.awardXP() — awards 250 XP for first backtest run
 *   9.4 — competitionStore stub — submits strategy to active competition
 */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trophy, Rocket, Bot, Swords, GraduationCap,
  CheckCircle2, ChevronRight, Zap, Star, Shield,
  BarChart2, TrendingUp, Lock, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../lib/authStore';
import { useAcademyStore } from '../../lib/academyStore';
import { useStrategyStore } from '../../lib/strategyStore';
import type { EnrichedBacktestOutput } from '../../lib/backtestRunner';
import type { BacktestConfig } from './BacktestConfigPanel';
import { PublishStrategyModal } from './PublishStrategyModal';
import { DeployDemoModal } from './DeployDemoModal';
import { CompetitionSubmitModal } from './CompetitionSubmitModal';
import { DeployBotModal } from '../bots/DeployBotModal';

// ─────────────────────────────────────────────────────────────────────────────
// XP REWARD LOGIC
// ─────────────────────────────────────────────────────────────────────────────

const BACKTEST_XP_LESSON_ID  = 'backtest_challenge_v1';
const BACKTEST_XP_AMOUNT     = 250;
const FIRST_POSITIVE_XP_ID   = 'backtest_positive_return_v1';
const FIRST_POSITIVE_XP      = 150;
const SHARPE_ABOVE_1_XP_ID   = 'backtest_sharpe_1_v1';
const SHARPE_ABOVE_1_XP      = 100;

// ─────────────────────────────────────────────────────────────────────────────
// VERIFIED BADGE THRESHOLD
// ─────────────────────────────────────────────────────────────────────────────

export const VERIFIED_BADGE_RUNS = 100;  // exported so other components can show it

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  enrichedResult: EnrichedBacktestOutput;
  config:         BacktestConfig;
  /** How many total backtest sessions the user has run */
  sessionCount:   number;
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTION BUTTON
// ─────────────────────────────────────────────────────────────────────────────

function ActionButton({
  icon: Icon, label, sub, onClick, variant, disabled, badge,
}: {
  icon:     React.ElementType;
  label:    string;
  sub?:     string;
  onClick:  () => void;
  variant:  'primary' | 'secondary' | 'success' | 'warning' | 'academy';
  disabled?: boolean;
  badge?:   string;
}) {
  const variants = {
    primary:  'bg-primary/10 border-primary/25 text-primary hover:bg-primary/20',
    secondary:'bg-secondary/40 border-white/10 text-muted-foreground hover:text-foreground hover:bg-secondary/60',
    success:  'bg-green-500/10 border-green-500/20 text-green-400 hover:bg-green-500/20',
    warning:  'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20',
    academy:  'bg-purple-500/10 border-purple-500/20 text-purple-400 hover:bg-purple-500/20',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'relative flex items-center gap-2.5 px-4 py-3 rounded-xl border transition-all font-medium text-sm shrink-0',
        variants[variant],
        disabled && 'opacity-40 cursor-not-allowed pointer-events-none',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <div className="text-left">
        <span className="leading-none block">{label}</span>
        {sub && <span className="text-[10px] opacity-70 block mt-0.5 leading-none">{sub}</span>}
      </div>
      {badge && (
        <span className="absolute -top-2 -right-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-400 text-black">
          {badge}
        </span>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// XP CLAIM BADGE
// ─────────────────────────────────────────────────────────────────────────────

function XpClaim({
  lessonId, xp, label, icon: Icon, onClaim, alreadyClaimed,
}: {
  lessonId:      string;
  xp:            number;
  label:         string;
  icon:          React.ElementType;
  onClaim:       (id: string, xp: number) => void;
  alreadyClaimed: boolean;
}) {
  return (
    <button
      onClick={() => !alreadyClaimed && onClaim(lessonId, xp)}
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all',
        alreadyClaimed
          ? 'bg-green-500/8 border-green-500/15 text-green-400 cursor-default'
          : 'bg-purple-500/10 border-purple-500/20 text-purple-300 hover:bg-purple-500/20',
      )}
    >
      {alreadyClaimed
        ? <CheckCircle2 className="h-3.5 w-3.5" />
        : <Icon className="h-3.5 w-3.5" />}
      <span>{alreadyClaimed ? 'Claimed' : `+${xp} XP`}</span>
      {!alreadyClaimed && <span className="text-muted-foreground/60">— {label}</span>}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN BAR
// ─────────────────────────────────────────────────────────────────────────────

export function PostRunActionBar({ enrichedResult, config, sessionCount }: Props) {
  const { user }                   = useAuthStore();
  const { awardXP, completedLessons } = useAcademyStore();
  const { createStrategy }         = useStrategyStore();

  const navigate = useNavigate();
  const [publishOpen,    setPublishOpen]   = useState(false);
  const [deployOpen,     setDeployOpen]    = useState(false);
  const [deployBotOpen,  setDeployBotOpen] = useState(false);
  const [competOpen,     setCompetOpen]    = useState(false);
  const [dismissed,      setDismissed]     = useState(false);

  const metrics = enrichedResult.metrics;
  const isPos   = metrics.totalReturn > 0;
  const hasSharpe = metrics.sharpeRatio >= 1;

  // XP claims
  const claimXP = useCallback((lessonId: string, xp: number) => {
    awardXP(lessonId, xp);
    toast.success(`+${xp} XP awarded!`, {
      description: 'Keep running backtests to earn more Academy XP.',
      icon: '🎓',
    });
  }, [awardXP]);

  // Verified badge eligibility
  const isVerified = sessionCount >= VERIFIED_BADGE_RUNS;

  if (dismissed) return null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        className="border-t border-white/5 bg-gradient-to-r from-card/80 via-card/60 to-card/40 backdrop-blur-sm"
      >
        {/* Top strip: integrations */}
        <div className="px-4 py-3 flex items-center gap-2 flex-wrap">
          {/* Section label */}
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest shrink-0 mr-1">
            Integrate →
          </span>

          {/* 9.1 Publish to Marketplace */}
          <ActionButton
            icon={Trophy}
            label="Publish to Marketplace"
            sub={isVerified ? '✓ Verified badge eligible' : `${sessionCount}/${VERIFIED_BADGE_RUNS} runs for Verified`}
            onClick={() => setPublishOpen(true)}
            variant="primary"
            badge={isVerified ? '✓' : undefined}
          />

          {/* 9.2 Deploy to Demo */}
          <ActionButton
            icon={Rocket}
            label="Deploy to Demo"
            sub="Use in live demo trading"
            onClick={() => setDeployOpen(true)}
            variant="success"
          />

          {/* 6.1: Deploy Bot — convert backtest result into a live bot */}
          <ActionButton
            icon={Bot}
            label="Deploy Bot"
            sub="Convert result to bot"
            onClick={() => setDeployBotOpen(true)}
            variant="secondary"
          />

          {/* 9.4 Submit to Competition */}
          <ActionButton
            icon={Swords}
            label="Enter Competition"
            sub="Submit to strategy contest"
            onClick={() => setCompetOpen(true)}
            variant="warning"
          />

          {/* Dismiss */}
          <button
            onClick={() => setDismissed(true)}
            className="ml-auto p-1.5 rounded-lg text-muted-foreground/40 hover:text-muted-foreground transition-colors shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Bottom strip: 9.3 Academy XP */}
        <div className="px-4 py-2 border-t border-white/5 flex items-center gap-2 flex-wrap bg-purple-500/3">
          <GraduationCap className="h-3.5 w-3.5 text-purple-400 shrink-0" />
          <span className="text-[10px] font-bold text-purple-400/70 uppercase tracking-widest">Academy XP</span>

          <XpClaim
            lessonId={BACKTEST_XP_LESSON_ID}
            xp={BACKTEST_XP_AMOUNT}
            label="Completed a backtest"
            icon={BarChart2}
            onClaim={claimXP}
            alreadyClaimed={completedLessons.includes(BACKTEST_XP_LESSON_ID)}
          />

          {isPos && (
            <XpClaim
              lessonId={FIRST_POSITIVE_XP_ID}
              xp={FIRST_POSITIVE_XP}
              label="Positive return"
              icon={TrendingUp}
              onClaim={claimXP}
              alreadyClaimed={completedLessons.includes(FIRST_POSITIVE_XP_ID)}
            />
          )}

          {hasSharpe && (
            <XpClaim
              lessonId={SHARPE_ABOVE_1_XP_ID}
              xp={SHARPE_ABOVE_1_XP}
              label="Sharpe ≥ 1.0"
              icon={Shield}
              onClaim={claimXP}
              alreadyClaimed={completedLessons.includes(SHARPE_ABOVE_1_XP_ID)}
            />
          )}
        </div>
      </motion.div>

      {/* Modals */}
      <PublishStrategyModal
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        enrichedResult={enrichedResult}
        config={config}
        sessionCount={sessionCount}
        isVerified={isVerified}
      />

      <DeployDemoModal
        open={deployOpen}
        onClose={() => setDeployOpen(false)}
        enrichedResult={enrichedResult}
        config={config}
      />

      <CompetitionSubmitModal
        open={competOpen}
        onClose={() => setCompetOpen(false)}
        enrichedResult={enrichedResult}
        config={config}
      />

      {/* 6.1: Deploy Bot modal */}
      <DeployBotModal
        open={deployBotOpen}
        onClose={() => setDeployBotOpen(false)}
        enrichedResult={enrichedResult}
        config={config}
        onDeployed={() => {
          setDeployBotOpen(false);
          navigate('/bots');
        }}
      />
    </>
  );
}
