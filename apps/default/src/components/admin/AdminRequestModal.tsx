import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Bot, CheckCircle2, XCircle, ChevronRight,
  Check, Clock, Zap, Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/authStore';
import {
  useAdminManagementStore,
  ADMIN_LEVEL_META,
  LEVEL_REQUIREMENTS,
  AdminLevel,
  AdminRequest,
} from '@/lib/adminManagementStore';

interface AdminRequestModalProps {
  open: boolean;
  onClose: () => void;
}

type Phase = 'select' | 'evaluating' | 'result';

const PHASES = [
  { label: 'Checking trades…',         pct: 25 },
  { label: 'Reviewing community…',      pct: 50 },
  { label: 'Evaluating academy…',       pct: 75 },
  { label: 'Finalizing decision…',      pct: 100 },
];

export function AdminRequestModal({ open, onClose }: AdminRequestModalProps) {
  const { user, updateProfile } = useAuthStore();
  const { submitRequest, requests } = useAdminManagementStore();

  const [selectedLevel, setSelectedLevel] = useState<AdminLevel | null>(null);
  const [phase, setPhase]                 = useState<Phase>('select');
  const [progressPhase, setProgressPhase] = useState(0);
  const [result, setResult]               = useState<AdminRequest | null>(null);

  // Check attempts remaining
  const attemptsUsed = user?.adminRequestAttempts ?? 0;
  const attemptsLeft = Math.max(0, 3 - attemptsUsed);
  const isBlocked    = attemptsLeft <= 0;

  // Check if user already has a pending or approved request
  const existingRequest = user
    ? requests.find(r => r.userId === user.id && (r.status === 'pending' || r.status === 'ai_approved' || r.status === 'super_approved'))
    : null;

  const handleSubmit = async () => {
    if (!selectedLevel || !user || isBlocked) return;
    setPhase('evaluating');
    setProgressPhase(0);

    // Increment attempt counter
    const newAttempts = attemptsUsed + 1;
    updateProfile({ adminRequestAttempts: newAttempts });

    // Animate progress steps
    for (let i = 0; i < PHASES.length; i++) {
      await new Promise(res => setTimeout(res, 600 + Math.random() * 400));
      setProgressPhase(i + 1);
    }

    const req = await submitRequest(user, selectedLevel);
    setResult(req);
    setPhase('result');
  };

  const handleClose = () => {
    setPhase('select');
    setSelectedLevel(null);
    setResult(null);
    setProgressPhase(0);
    onClose();
  };

  const requestableLevels = ([1, 2, 3, 4, 5] as AdminLevel[]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={phase !== 'evaluating' ? handleClose : undefined}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 20 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="w-full max-w-lg bg-card border border-white/8 rounded-3xl shadow-2xl overflow-hidden">

              {/* Header */}
              <div className="relative px-6 py-5 border-b border-white/5 bg-gradient-to-r from-primary/5 to-transparent">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center">
                    <Bot className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-bold text-base">🤖 Request Admin Status</h2>
                    <p className="text-xs text-muted-foreground">AI-powered eligibility review</p>
                  </div>
                </div>
                {phase !== 'evaluating' && (
                  <button
                    onClick={handleClose}
                    className="absolute top-4 right-4 p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="p-6">
                <AnimatePresence mode="wait">

                  {/* ── Phase: Select level ── */}
                  {phase === 'select' && (
                    <motion.div
                      key="select"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      className="space-y-5"
                    >
                      {/* Existing request notice */}
                      {existingRequest && (
                        <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-amber-500/8 border border-amber-500/20">
                          <Clock className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
                          <p className="text-xs text-amber-300">
                            You already have a {existingRequest.status === 'super_approved' ? 'granted' : 'pending'} request for Level {existingRequest.requestedLevel}. You can submit a new one for a different level.
                          </p>
                        </div>
                      )}

                      <p className="text-sm text-muted-foreground">
                        Select the admin role you'd like to apply for. Our AI will evaluate your eligibility in under 60 seconds.
                      </p>

                      {/* Level cards */}
                      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                        {requestableLevels.map(level => {
                          const meta = ADMIN_LEVEL_META[level];
                          const reqs = LEVEL_REQUIREMENTS[level];
                          const isSelected = selectedLevel === level;
                          return (
                            <button
                              key={level}
                              onClick={() => setSelectedLevel(level)}
                              className={cn(
                                'w-full text-left flex items-start gap-3 p-4 rounded-2xl border transition-all duration-200',
                                isSelected
                                  ? 'border-opacity-60'
                                  : 'border-white/8 bg-secondary/20 hover:border-white/15 hover:bg-secondary/30',
                              )}
                              style={isSelected ? { borderColor: meta.color + '60', background: meta.bg } : {}}
                            >
                              <span className="text-xl mt-0.5 flex-shrink-0">{meta.icon}</span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-bold text-sm" style={isSelected ? { color: meta.color } : {}}>
                                    {meta.role}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">Level {level}</span>
                                  {isSelected && (
                                    <span className="ml-auto flex-shrink-0 h-4 w-4 rounded-full bg-green-500/20 flex items-center justify-center">
                                      <Check className="h-2.5 w-2.5 text-green-400" />
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground mb-2">{meta.description}</p>
                                {/* Requirements preview */}
                                <div className="flex flex-wrap gap-1">
                                  {reqs.checks.slice(0, 3).map(c => (
                                    <span
                                      key={c.key}
                                      className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/8 text-muted-foreground"
                                    >
                                      {c.label}: {c.threshold}{c.unit}
                                    </span>
                                  ))}
                                  {reqs.checks.length > 3 && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/8 text-muted-foreground">
                                      +{reqs.checks.length - 3} more
                                    </span>
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {/* Technical admin note */}
                      <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-secondary/20 border border-white/5">
                        <Shield className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <p className="text-[11px] text-muted-foreground">
                          <strong>⚙️ Technical Admin (Level 6)</strong> is exclusively assigned by Super Admin and cannot be requested.
                        </p>
                      </div>

                      {/* Submit button */}
                      <button
                        onClick={handleSubmit}
                        disabled={!selectedLevel}
                        className={cn(
                          'w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm transition-all',
                          selectedLevel
                            ? 'bg-primary text-primary-foreground hover:brightness-110 shadow-lg shadow-primary/20'
                            : 'bg-secondary/40 text-muted-foreground cursor-not-allowed',
                        )}
                      >
                        <Zap className="h-4 w-4" />
                        Start AI Evaluation
                        {selectedLevel && <ChevronRight className="h-4 w-4" />}
                      </button>
                    </motion.div>
                  )}

                  {/* ── Phase: Evaluating ── */}
                  {phase === 'evaluating' && (
                    <motion.div
                      key="evaluating"
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      className="py-4 space-y-6"
                    >
                      {/* Animated brain */}
                      <div className="flex flex-col items-center gap-4">
                        <motion.div
                          animate={{ rotate: [0, 5, -5, 0], scale: [1, 1.05, 0.95, 1] }}
                          transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
                          className="h-20 w-20 rounded-3xl bg-gradient-to-br from-primary/20 to-purple-500/20 border border-primary/20 flex items-center justify-center shadow-xl shadow-primary/10"
                        >
                          <Bot className="h-10 w-10 text-primary" />
                        </motion.div>
                        <div className="text-center">
                          <h3 className="font-bold text-base">⏳ AI Review in Progress…</h3>
                          <p className="text-xs text-muted-foreground mt-1">
                            Analyzing your activity for {selectedLevel ? ADMIN_LEVEL_META[selectedLevel].role : ''}
                          </p>
                        </div>
                      </div>

                      {/* Progress steps */}
                      <div className="space-y-3">
                        {PHASES.map((p, i) => {
                          const done    = progressPhase > i;
                          const active  = progressPhase === i;
                          return (
                            <div key={p.label} className="flex items-center gap-3">
                              {/* Step indicator */}
                              <div className={cn(
                                'h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 text-xs font-bold border',
                                done   ? 'bg-green-500/20 border-green-500/40 text-green-400' :
                                active ? 'bg-primary/20 border-primary/40 text-primary animate-pulse' :
                                         'bg-secondary/30 border-white/10 text-muted-foreground',
                              )}>
                                {done ? <Check className="h-3 w-3" /> : i + 1}
                              </div>

                              {/* Label */}
                              <span className={cn(
                                'text-sm flex-1 transition-colors',
                                done   ? 'text-green-400 font-medium' :
                                active ? 'text-foreground font-medium' :
                                         'text-muted-foreground',
                              )}>
                                {p.label}
                              </span>

                              {/* Individual bar */}
                              <div className="w-20 h-1 bg-white/5 rounded-full overflow-hidden">
                                <motion.div
                                  className="h-full rounded-full bg-primary"
                                  animate={{ width: done ? '100%' : active ? '60%' : '0%' }}
                                  transition={{ duration: 0.5 }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Overall bar */}
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Overall progress</span>
                          <span>{Math.round((progressPhase / PHASES.length) * 100)}%</span>
                        </div>
                        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                          <motion.div
                            className="h-full rounded-full bg-gradient-to-r from-primary to-purple-500"
                            animate={{ width: `${(progressPhase / PHASES.length) * 100}%` }}
                            transition={{ duration: 0.4, ease: 'easeOut' }}
                          />
                        </div>
                      </div>

                      <p className="text-center text-xs text-muted-foreground">
                        Estimated time: 30–45 seconds · Please wait…
                      </p>
                    </motion.div>
                  )}

                  {/* ── Phase: Result ── */}
                  {phase === 'result' && result && (
                    <motion.div
                      key="result"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      className="space-y-5"
                    >
                      {result.status === 'ai_approved' ? (
                        /* ✅ Approved */
                        <div className="text-center space-y-3">
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: 'spring', delay: 0.1, damping: 15 }}
                            className="h-20 w-20 mx-auto rounded-3xl bg-green-500/15 border border-green-500/30 flex items-center justify-center shadow-xl shadow-green-500/10"
                          >
                            <CheckCircle2 className="h-10 w-10 text-green-400" />
                          </motion.div>
                          <div>
                            <h3 className="font-bold text-lg text-green-400">✅ Pre-Approved by AI!</h3>
                            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                              Congratulations! You meet all requirements for{' '}
                              <strong>{ADMIN_LEVEL_META[result.requestedLevel].role}</strong>.
                            </p>
                          </div>
                          <div className="bg-green-500/8 border border-green-500/20 rounded-xl px-4 py-3 text-sm text-left space-y-1">
                            <p className="font-semibold text-green-400 text-xs">What happens next:</p>
                            <p className="text-xs text-muted-foreground">
                              A Super Admin will review your case within <strong>24–48 hours</strong>.
                              You'll receive a notification once your status is activated.
                            </p>
                          </div>
                          {/* AI Score */}
                          {result.aiReport && (
                            <div className="flex items-center justify-center gap-3 text-sm">
                              <span className="text-muted-foreground">AI Score:</span>
                              <span className="font-mono font-bold text-green-400 text-lg">
                                {result.aiReport.score}/100
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        /* ❌ Rejected */
                        <div className="space-y-4">
                          <div className="text-center space-y-3">
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ type: 'spring', delay: 0.1, damping: 15 }}
                              className="h-20 w-20 mx-auto rounded-3xl bg-red-500/15 border border-red-500/30 flex items-center justify-center shadow-xl shadow-red-500/10"
                            >
                              <XCircle className="h-10 w-10 text-red-400" />
                            </motion.div>
                            <div>
                              <h3 className="font-bold text-lg text-red-400">❌ Not Ready Yet</h3>
                              <p className="text-sm text-muted-foreground mt-1">
                                You don't meet all requirements for{' '}
                                <strong>{ADMIN_LEVEL_META[result.requestedLevel].role}</strong> yet.
                              </p>
                            </div>
                          </div>

                          {/* Missing items */}
                          {result.aiReport && result.aiReport.missingItems.length > 0 && (
                            <div className="bg-secondary/20 border border-white/5 rounded-xl p-4 space-y-2">
                              <p className="text-xs font-semibold text-muted-foreground">Here's what you need to improve:</p>
                              {result.aiReport.missingItems.map((item, i) => (
                                <div key={i} className="flex items-start gap-2 text-xs">
                                  <span className="text-red-400 font-bold flex-shrink-0 mt-0.5">•</span>
                                  <span className="text-foreground/80">{item}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {result.aiReport && (
                            <div className="flex items-center justify-between text-sm px-1">
                              <span className="text-muted-foreground text-xs">AI Score:</span>
                              <span className="font-mono font-bold text-amber-400">
                                {result.aiReport.score}/100
                              </span>
                            </div>
                          )}

                          <div className="bg-secondary/20 border border-white/5 rounded-xl px-4 py-3 text-xs text-muted-foreground">
                            Keep learning and trading! You can re-apply in <strong>30 days</strong>.
                            Need help? Chat with our Lynx AI for personalized advice.
                          </div>
                        </div>
                      )}

                      <button
                        onClick={handleClose}
                        className="w-full py-3 rounded-2xl bg-secondary/40 text-muted-foreground text-sm font-semibold hover:bg-secondary/60 hover:text-foreground transition-all"
                      >
                        Close
                      </button>
                    </motion.div>
                  )}

                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
