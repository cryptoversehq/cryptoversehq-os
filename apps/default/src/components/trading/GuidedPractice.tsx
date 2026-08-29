/**
 * GuidedPractice.tsx — Step-by-step guided first-trade experience.
 * 5 steps, spotlight, progress bar, hint/skip/exit, congrats modal,
 * localStorage persistence, disabled after 3+ trades.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  GraduationCap, X, SkipForward, HelpCircle,
  CheckCircle, RotateCcw, Sparkles, Lightbulb, ArrowRight,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
export type GuidedStep = 'coin' | 'amount' | 'stopLoss' | 'takeProfit' | 'execute';

export interface GuidedPracticeState {
  active:    boolean;
  step:      GuidedStep;
  completed: boolean;
  stepsDone: GuidedStep[];
}

export const STEP_ORDER: GuidedStep[] = ['coin', 'amount', 'stopLoss', 'takeProfit', 'execute'];
export const STEP_COUNT = STEP_ORDER.length;

export const STEP_META: Record<GuidedStep, {
  title: string; message: string; hint: string; target: string;
}> = {
  coin: {
    title:   'Step 1: Select a Currency',
    message: 'First, select a currency you want to trade. Click the pair name in the header or any coin in the watchlist.',
    hint:    'Click the BTC/USDT label at the top-left to open coin search. Pick any coin — Bitcoin is a great start!',
    target:  'coin-selector',
  },
  amount: {
    title:   'Step 2: Enter Amount',
    message: 'Specify how much you want to buy. Use the 25%, 50%, 75%, or 100% buttons for quick entry.',
    hint:    'The % buttons calculate the amount from your available balance. Start small — try 25% first.',
    target:  'amount-field',
  },
  stopLoss: {
    title:   'Step 3: Set Stop Loss',
    message: 'To manage risk, set a Stop Loss price — the trade closes automatically if price drops here. Try ~5% below current price.',
    hint:    'A Stop Loss protects you from large losses. If Bitcoin is at $67,000 a 5% SL would be ~$63,650.',
    target:  'sl-field',
  },
  takeProfit: {
    title:   'Step 4: Set Take Profit',
    message: 'Set a price target where your trade closes automatically with profit. Try ~5% above the current price.',
    hint:    'Take Profit locks in gains automatically. If Bitcoin is at $67,000, a 5% TP would be ~$70,350.',
    target:  'tp-field',
  },
  execute: {
    title:   'Step 5: Place Your Trade!',
    message: '🎯 Everything is ready. Hit the Buy button to place your very first simulated trade!',
    hint:    "This is a practice account with virtual money — no real funds are at risk. Go ahead and click Buy!",
    target:  'buy-button',
  },
};

const LS_KEY = 'cv_guided_practice_v1';
const DEFAULT_STATE: GuidedPracticeState = { active: false, step: 'coin', completed: false, stepsDone: [] };

function loadState(): GuidedPracticeState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? { ...DEFAULT_STATE, ...JSON.parse(raw) } : DEFAULT_STATE;
  } catch { return DEFAULT_STATE; }
}

function saveState(s: GuidedPracticeState) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /**/ }
}

function clearSaved() {
  try { localStorage.removeItem(LS_KEY); } catch { /**/ }
}

// ── Spotlight ─────────────────────────────────────────────────────────────────
function Spotlight({ target, padding = 8 }: { target: string; padding?: number }) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const update = () => {
      const el = document.querySelector(`[data-guide="${target}"]`);
      if (el) setRect(el.getBoundingClientRect());
    };
    update();
    const id = setInterval(update, 200);
    return () => clearInterval(id);
  }, [target]);

  if (!rect) return null;

  const cx = rect.left - padding + (rect.width  + padding * 2) / 2;
  const cy = rect.top  - padding + (rect.height + padding * 2) / 2;
  const r  = Math.max(rect.width, rect.height) / 2 + padding;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[9998]"
      style={{
        background: `radial-gradient(circle at ${cx}px ${cy}px, transparent ${r * 0.85}px, rgba(0,0,0,0.78) ${r * 1.35}px)`,
      }}
    >
      <div
        className="absolute rounded-2xl pointer-events-none"
        style={{
          top: rect.top - padding, left: rect.left - padding,
          width: rect.width + padding * 2, height: rect.height + padding * 2,
          boxShadow: '0 0 0 2.5px rgba(251,191,36,0.9), 0 0 0 6px rgba(251,191,36,0.18), 0 0 40px rgba(251,191,36,0.25)',
          animation: 'gp-pulse 2s ease-in-out infinite',
        }}
      />
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ stepIndex }: { stepIndex: number }) {
  const pct = ((stepIndex + 1) / STEP_COUNT) * 100;
  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] h-1.5" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <motion.div
        className="h-full rounded-r-full"
        style={{ background: 'linear-gradient(90deg,#10B981,#F59E0B)' }}
        animate={{ width: pct + '%' }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      />
      <div className="absolute inset-0 flex items-center px-4">
        {STEP_ORDER.map((_, i) => {
          const isDone = i <= stepIndex;
          return (
            <div key={i} className="flex-1 flex justify-center">
              <div className={cn(
                'w-2.5 h-2.5 rounded-full border-2 transition-all duration-300',
                isDone ? 'bg-amber-400 border-amber-300' : 'bg-white/15 border-white/20',
              )} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Step Panel ────────────────────────────────────────────────────────────────
interface StepPanelProps {
  step: GuidedStep; stepIndex: number;
  onNext: () => void; onSkip: () => void; onExit: () => void;
  canNext: boolean; nextLabel: string;
}

function StepPanel({ step, stepIndex, onNext, onSkip, onExit, canNext, nextLabel }: StepPanelProps) {
  const [showHint, setShowHint] = useState(false);
  const meta = STEP_META[step];

  return (
    <motion.div
      key={step}
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.96 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="fixed z-[10000] left-1/2 -translate-x-1/2"
      style={{ bottom: 28, width: '94%', maxWidth: 500 }}
    >
      <div className="rounded-2xl border shadow-2xl overflow-hidden"
        style={{ background: '#0f172a', borderColor: 'rgba(251,191,36,0.28)' }}>

        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 pt-4 pb-2.5">
          <div className="w-8 h-8 rounded-full bg-amber-400/15 flex items-center justify-center flex-shrink-0">
            <GraduationCap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-amber-400/60 font-bold uppercase tracking-widest mb-0.5">
              Guided Practice &middot; {stepIndex + 1} / {STEP_COUNT}
            </div>
            <div className="text-[13px] font-bold text-white truncate">{meta.title}</div>
          </div>
          <button onClick={onExit} className="text-white/20 hover:text-white/60 transition-colors flex-shrink-0 ml-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Message */}
        <div className="px-4 pb-3">
          <p className="text-[13px] text-white/65 leading-relaxed">{meta.message}</p>
        </div>

        {/* Hint */}
        <AnimatePresence>
          {showHint && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="mx-4 mb-3 p-3 rounded-xl bg-amber-400/5 border border-amber-400/15">
                <div className="flex items-start gap-2">
                  <Lightbulb className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-[12px] text-amber-300/80 leading-relaxed">{meta.hint}</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Step indicator pills */}
        <div className="flex items-center gap-1 px-4 pb-3">
          {STEP_ORDER.map((_, i) => {
            const isDone = i < stepIndex;
            const isCur  = i === stepIndex;
            return (
              <div key={i} className={cn(
                'h-1 rounded-full flex-1 transition-all duration-300',
                isDone ? 'bg-emerald-500' : isCur ? 'bg-amber-400' : 'bg-white/10',
              )} />
            );
          })}
        </div>

        {/* Action bar */}
        <div className="flex items-center gap-2 px-4 pb-4">
          <button onClick={() => setShowHint(h => !h)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-white/40 hover:text-white/70 text-[11px] font-semibold transition-all">
            <HelpCircle className="w-3.5 h-3.5" />
            {showHint ? 'Hide' : 'Hint'}
          </button>

          <div className="flex-1" />

          <button onClick={onSkip}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-white/30 hover:text-white/60 text-[11px] font-semibold transition-all">
            <SkipForward className="w-3.5 h-3.5" /> Skip
          </button>

          <button onClick={onNext} disabled={!canNext}
            className={cn(
              'flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[12px] font-bold transition-all',
              canNext
                ? 'bg-amber-400 hover:bg-amber-300 text-black shadow-lg'
                : 'bg-white/[0.07] text-white/25 cursor-not-allowed',
            )}>
            {nextLabel} <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Congratulations ───────────────────────────────────────────────────────────
function Congratulations({ onRestart, onExit }: { onRestart: () => void; onExit: () => void }) {
  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.88)' }}>
      <motion.div
        initial={{ scale: 0.82, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 24 }}
        className="rounded-2xl border overflow-hidden w-full max-w-sm text-center"
        style={{ background: '#0f172a', borderColor: 'rgba(16,185,129,0.35)' }}>
        <div className="px-6 pt-8 pb-6">
          <motion.div
            animate={{ rotate: [0, -12, 12, -6, 6, 0], scale: [1, 1.18, 1] }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="text-5xl mb-4">🎉</motion.div>
          <h2 className="text-[22px] font-bold text-white mb-2">Well done!</h2>
          <p className="text-[14px] text-white/60 leading-relaxed mb-5">
            You have successfully completed your first simulated trade!
            You&apos;re on your way to becoming a crypto trader.
          </p>
          <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 mb-5">
            <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span className="text-[12px] text-emerald-400 font-semibold">
              All 5 steps completed &middot; Practice trade placed
            </span>
          </div>
          <div className="space-y-2">
            <button onClick={onRestart}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] text-white/70 text-[13px] font-semibold transition-all">
              <RotateCcw className="w-4 h-4" /> Do the same exercise again
            </button>
            <button onClick={onExit}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-[13px] font-bold transition-all">
              <Sparkles className="w-4 h-4" /> Return to normal trading
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ── useGuidedPractice hook ────────────────────────────────────────────────────
export interface UseGuidedPracticeReturn {
  state:     GuidedPracticeState;
  start:     () => void;
  advance:   (fromStep: GuidedStep) => void;
  skip:      () => void;
  exit:      () => void;
  restart:   () => void;
  isStep:    (s: GuidedStep) => boolean;
  stepIndex: number;
}

export function useGuidedPractice(tradeCount: number): UseGuidedPracticeReturn {
  const [state, setRaw] = useState<GuidedPracticeState>(loadState);

  const set = useCallback((next: GuidedPracticeState) => { setRaw(next); saveState(next); }, []);

  const start = useCallback(() => {
    const isExperienced = tradeCount > 3;
    if (isExperienced) return;
    set({ active: true, step: 'coin', completed: false, stepsDone: [] });
  }, [tradeCount, set]);

  const advance = useCallback((fromStep: GuidedStep) => {
    setRaw(prev => {
      if (!prev.active || prev.step !== fromStep) return prev;
      const idx    = STEP_ORDER.indexOf(fromStep);
      const isLast = idx === STEP_COUNT - 1;
      const next: GuidedPracticeState = isLast
        ? { ...prev, completed: true, active: false, stepsDone: [...prev.stepsDone, fromStep] }
        : { ...prev, step: STEP_ORDER[idx + 1], stepsDone: [...prev.stepsDone, fromStep] };
      saveState(next); return next;
    });
  }, []);

  const skip = useCallback(() => {
    setRaw(prev => {
      if (!prev.active) return prev;
      const idx    = STEP_ORDER.indexOf(prev.step);
      const isLast = idx === STEP_COUNT - 1;
      const next: GuidedPracticeState = isLast
        ? { ...prev, completed: true, active: false }
        : { ...prev, step: STEP_ORDER[idx + 1] };
      saveState(next); return next;
    });
  }, []);

  const exit    = useCallback(() => { clearSaved(); setRaw(DEFAULT_STATE); }, []);
  const restart = useCallback(() => { set({ active: true, step: 'coin', completed: false, stepsDone: [] }); }, [set]);
  const isStep  = useCallback((s: GuidedStep) => state.active && state.step === s, [state]);
  const stepIndex = STEP_ORDER.indexOf(state.step);

  return { state, start, advance, skip, exit, restart, isStep, stepIndex };
}

// ── GuidedPracticeOverlay (render) ────────────────────────────────────────────
export function GuidedPracticeOverlay({
  practice, stepSatisfied,
}: {
  practice: UseGuidedPracticeReturn;
  stepSatisfied: boolean;
}) {
  const { state, skip, exit, restart, stepIndex } = practice;
  const isLast = stepIndex === STEP_COUNT - 1;

  const handleNext = useCallback(() => practice.advance(state.step), [practice, state.step]);

  return (
    <>
      <style>{`
        @keyframes gp-pulse { 0%,100%{opacity:1} 50%{opacity:.55} }
      `}</style>

      <AnimatePresence>
        {state.active && (
          <React.Fragment key="gp-active">
            <Spotlight target={STEP_META[state.step].target} />
            <ProgressBar stepIndex={stepIndex} />
            <StepPanel
              step={state.step}
              stepIndex={stepIndex}
              onNext={handleNext}
              onSkip={skip}
              onExit={exit}
              canNext={stepSatisfied}
              nextLabel={isLast ? 'Finish' : 'Next step'}
            />
          </React.Fragment>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {state.completed && (
          <Congratulations key="congrats" onRestart={restart} onExit={exit} />
        )}
      </AnimatePresence>
    </>
  );
}

// ── GuidedPracticeButton ──────────────────────────────────────────────────────
export function GuidedPracticeButton({
  onClick, disabled, isActive,
}: { onClick: () => void; disabled: boolean; isActive: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={disabled ? 'Available for new traders only (fewer than 3 trades)' : 'Start guided first-trade practice'}
      className={cn(
        'flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-bold transition-all',
        isActive
          ? 'border-amber-400/60 bg-amber-400/15 text-amber-400'
          : disabled
            ? 'border-white/[0.05] text-white/15 cursor-not-allowed'
            : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20',
      )}>
      <GraduationCap className="w-3.5 h-3.5" />
      <span>{isActive ? 'Practicing…' : '🎓 Practice'}</span>
    </button>
  );
}
