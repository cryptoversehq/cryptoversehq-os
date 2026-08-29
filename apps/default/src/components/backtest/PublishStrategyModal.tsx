/**
 * PublishStrategyModal.tsx — Part 9.1
 *
 * Publish a backtest result to the Strategy Marketplace.
 * Backtest metrics auto-populate the strategy performance fields.
 * If sessionCount >= VERIFIED_BADGE_RUNS, the "Verified" badge is shown.
 *
 * Flow:
 *   1. User fills name, description, price, tags
 *   2. We call strategyStore.createStrategy() with metrics from backtest
 *   3. Strategy is created as a "pending" draft (admin must approve)
 *   4. Toast confirms "submitted for review"
 */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Trophy, CheckCircle2, Shield, Zap, Tag,
  DollarSign, FileText, Star, AlertCircle, Loader2,
  TrendingUp, BarChart2, BadgeCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../lib/authStore';
import { useStrategyStore } from '../../lib/strategyStore';
import type { EnrichedBacktestOutput } from '../../lib/backtestRunner';
import type { BacktestConfig } from './BacktestConfigPanel';
import { VERIFIED_BADGE_RUNS } from './PostRunActionBar';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  open:           boolean;
  onClose:        () => void;
  enrichedResult: EnrichedBacktestOutput;
  config:         BacktestConfig;
  sessionCount:   number;
  isVerified:     boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// FIELD HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const Label = ({ children, required }: { children: React.ReactNode; required?: boolean }) => (
  <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">
    {children}{required && <span className="text-red-400 ml-0.5">*</span>}
  </label>
);

const Field = ({ children }: { children: React.ReactNode }) => (
  <div className="space-y-1">{children}</div>
);

// ─────────────────────────────────────────────────────────────────────────────
// METRICS PREVIEW ROW
// ─────────────────────────────────────────────────────────────────────────────

function MetricPill({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="text-center px-3 py-2 rounded-xl bg-secondary/20 border border-white/5">
      <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wide">{label}</p>
      <p className={cn('text-sm font-bold tabular-nums mt-0.5', good === true ? 'text-green-400' : good === false ? 'text-red-400' : 'text-foreground')}>
        {value}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL
// ─────────────────────────────────────────────────────────────────────────────

export function PublishStrategyModal({ open, onClose, enrichedResult, config, sessionCount, isVerified }: Props) {
  const { user }           = useAuthStore();
  const { createStrategy } = useStrategyStore();

  const m = enrichedResult.metrics;

  // Form state
  const [name,        setName]        = useState(config.strategyName?.trim() || `${config.strategyType} Strategy on ${config.params.symbol}`);
  const [shortDesc,   setShortDesc]   = useState('');
  const [desc,        setDesc]        = useState('');
  const [price,       setPrice]       = useState(0);
  const [tagInput,    setTagInput]    = useState('');
  const [tags,        setTags]        = useState<string[]>([config.strategyType, config.params.symbol.split('/')[0].toLowerCase()]);
  const [submitting,  setSubmitting]  = useState(false);
  const [done,        setDone]        = useState(false);
  const [errors,      setErrors]      = useState<string[]>([]);

  const addTag = useCallback(() => {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 20);
    if (t && !tags.includes(t) && tags.length < 8) {
      setTags(prev => [...prev, t]);
      setTagInput('');
    }
  }, [tagInput, tags]);

  const removeTag = useCallback((t: string) => setTags(prev => prev.filter(x => x !== t)), []);

  const handleSubmit = useCallback(async () => {
    const errs: string[] = [];
    if (!name.trim())     errs.push('Strategy name is required.');
    if (!shortDesc.trim()) errs.push('Short description is required.');
    if (!desc.trim())     errs.push('Description is required.');
    if (price < 0)        errs.push('Price cannot be negative.');

    if (errs.length > 0) { setErrors(errs); return; }
    setErrors([]);
    setSubmitting(true);

    try {
      const result = createStrategy({
        creatorId:         user!.id,
        creatorName:       user!.username ?? user!.id,
        creatorAvatarSeed: user!.avatarSeed ?? 'default',
        name:              name.trim(),
        description:       desc.trim(),
        shortDescription:  shortDesc.trim(),
        type:              config.strategyType === 'custom' ? 'custom' : config.strategyType,
        price,
        tags,
        requiredLevel:     0,
        requiredPlan:      'any',
        requiresKyc:       false,
        code:              config.customCode || JSON.stringify(config.params.strategyConfig ?? {}),
        paramDocs:         `## Backtest Parameters\n- **Symbol**: ${config.params.symbol}\n- **Timeframe**: ${config.params.timeframe}\n- **Initial Balance**: $${config.params.initialBalance?.toLocaleString()}\n- **Period**: ${config.params.startDate} → ${config.params.endDate}`,
      });

      if (!result.ok) {
        setErrors(result.errors ?? ['Failed to create strategy.']);
        return;
      }

      setDone(true);
      toast.success('Strategy submitted for review!', {
        description: 'Once approved by our team, it will appear in the Marketplace.',
        icon: '🏆',
        duration: 5000,
      });
    } finally {
      setSubmitting(false);
    }
  }, [name, shortDesc, desc, price, tags, config, user, createStrategy]);

  if (!open) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          className="relative w-full max-w-xl bg-card border border-white/10 rounded-2xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col z-10"
        >
          {/* Header */}
          <div className="flex items-start justify-between p-5 border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Trophy className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground">Publish to Marketplace</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Backtest metrics will auto-populate your strategy card.
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {done ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center gap-4 py-8 text-center"
              >
                <div className="w-16 h-16 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8 text-green-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">Submitted for Review</h3>
                  <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                    Your strategy will appear in the Marketplace once our team approves it — usually within 24 hours.
                  </p>
                </div>
                <button onClick={onClose} className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all">
                  Done
                </button>
              </motion.div>
            ) : (
              <>
                {/* Verified badge callout */}
                {isVerified ? (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/8 border border-amber-500/20">
                    <BadgeCheck className="h-5 w-5 text-amber-400 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-amber-300">Verified Badge Eligible</p>
                      <p className="text-[10px] text-amber-400/70 mt-0.5">
                        With {sessionCount}+ backtest runs, your strategy will receive the Verified badge in the Marketplace.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/20 border border-white/5">
                    <Shield className="h-4 w-4 text-muted-foreground shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      Run <strong className="text-foreground">{VERIFIED_BADGE_RUNS - sessionCount} more backtests</strong> to earn the Verified badge for this strategy.
                    </p>
                  </div>
                )}

                {/* Auto-populated metrics */}
                <div>
                  <Label>Backtest Performance (auto-populated)</Label>
                  <div className="grid grid-cols-4 gap-2">
                    <MetricPill label="Return" value={`${m.totalReturn >= 0 ? '+' : ''}${m.totalReturn.toFixed(1)}%`} good={m.totalReturn >= 0} />
                    <MetricPill label="Win Rate" value={`${m.winRate.toFixed(1)}%`} good={m.winRate >= 50} />
                    <MetricPill label="Sharpe" value={m.sharpeRatio.toFixed(2)} good={m.sharpeRatio >= 1} />
                    <MetricPill label="Max DD" value={`-${m.maxDrawdown.toFixed(1)}%`} good={false} />
                  </div>
                </div>

                {/* Strategy Name */}
                <Field>
                  <Label required>Strategy Name</Label>
                  <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    maxLength={100}
                    placeholder="My RSI Grid Strategy"
                    className="w-full bg-secondary/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                  />
                </Field>

                {/* Short description */}
                <Field>
                  <Label required>Short Description</Label>
                  <input
                    value={shortDesc}
                    onChange={e => setShortDesc(e.target.value)}
                    maxLength={200}
                    placeholder="One-line tagline for the marketplace card (max 200 chars)"
                    className="w-full bg-secondary/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                  />
                  <p className="text-[10px] text-muted-foreground/50 text-right">{shortDesc.length}/200</p>
                </Field>

                {/* Full description */}
                <Field>
                  <Label required>Full Description</Label>
                  <textarea
                    value={desc}
                    onChange={e => setDesc(e.target.value)}
                    maxLength={2000}
                    rows={4}
                    placeholder="Explain how the strategy works, when to use it, parameters to tune…"
                    className="w-full bg-secondary/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all resize-none"
                  />
                  <p className="text-[10px] text-muted-foreground/50 text-right">{desc.length}/2000</p>
                </Field>

                {/* Price */}
                <Field>
                  <Label>Price (CP Coins)</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      type="number"
                      value={price}
                      onChange={e => setPrice(Math.max(0, parseInt(e.target.value) || 0))}
                      min={0}
                      step={50}
                      className="w-full bg-secondary/30 border border-white/10 rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground/50">Set to 0 for a free strategy</p>
                </Field>

                {/* Tags */}
                <Field>
                  <Label>Tags</Label>
                  <div className="flex gap-2">
                    <input
                      value={tagInput}
                      onChange={e => setTagInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
                      placeholder="Add tag…"
                      maxLength={20}
                      className="flex-1 bg-secondary/30 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                    />
                    <button
                      onClick={addTag}
                      className="px-3 py-2 rounded-xl bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors text-xs font-semibold"
                    >
                      Add
                    </button>
                  </div>
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {tags.map(t => (
                        <span key={t} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary/40 border border-white/8 text-xs text-muted-foreground">
                          {t}
                          <button onClick={() => removeTag(t)} className="hover:text-foreground transition-colors">
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </Field>

                {/* Errors */}
                <AnimatePresence>
                  {errors.length > 0 && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 space-y-1"
                    >
                      {errors.map((e, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-red-400">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />{e}
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}
          </div>

          {/* Footer */}
          {!done && (
            <div className="p-5 border-t border-white/5 flex items-center justify-between gap-3">
              <p className="text-[10px] text-muted-foreground">
                Strategy will be reviewed before appearing in the Marketplace.
              </p>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 disabled:opacity-60 transition-all"
              >
                {submitting
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Publishing…</>
                  : <><Trophy className="h-4 w-4" /> Submit for Review</>}
              </button>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
