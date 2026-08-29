/**
 * SaveStrategyModal.tsx — Part 4.1
 *
 * Shown after a successful backtest when user clicks "Save Strategy".
 *
 * Fields (matches spec wireframe exactly):
 *   - Strategy Name
 *   - Description (tagline + long form)
 *   - Tags (multi-select from STRATEGY_TAGS)
 *   - Price: Free | 500 CP | 1000 CP | Custom CP
 *   - Publish to Marketplace toggle
 *   - Keep Private toggle (exclusive with Publish)
 *
 * On save → strategyStore.createStrategy() → success toast
 */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Tag, DollarSign, Globe, Lock, Save,
  CheckCircle2, AlertCircle, ChevronDown, Loader2,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useStrategyStore } from '../../lib/strategyStore';
import { useAuthStore } from '../../lib/authStore';
import { STRATEGY_TAGS, MAX_STRATEGY_TAGS } from '../../lib/strategyTypes';
import type { EnrichedBacktestOutput } from '../../lib/backtestRunner';
import type { BacktestConfig } from './BacktestConfigPanel';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  open:           boolean;
  onClose:        () => void;
  enrichedResult: EnrichedBacktestOutput;
  config:         BacktestConfig;
  onSaved:        (strategyId: string, strategyName: string) => void;
}

type PricePreset = 'free' | '500' | '1000' | 'custom';

// ─────────────────────────────────────────────────────────────────────────────
// PRICE PRESET CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const PRICE_PRESETS: Array<{ key: PricePreset; label: string; value: number | null }> = [
  { key: 'free',   label: 'Free',     value: 0 },
  { key: '500',    label: '500 CP',   value: 500 },
  { key: '1000',   label: '1,000 CP', value: 1000 },
  { key: 'custom', label: 'Custom',   value: null },
];

// ─────────────────────────────────────────────────────────────────────────────
// FIELD HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const FieldLabel = ({ children, required }: { children: React.ReactNode; required?: boolean }) => (
  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
    {children}
    {required && <span className="ml-0.5 text-red-400">*</span>}
  </label>
);

const FieldInput = ({
  value, onChange, placeholder, maxLength, disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
}) => (
  <input
    type="text"
    value={value}
    onChange={e => onChange(e.target.value)}
    placeholder={placeholder}
    maxLength={maxLength}
    disabled={disabled}
    className="w-full bg-secondary/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 disabled:opacity-50 transition-all"
  />
);

const FieldTextarea = ({
  value, onChange, placeholder, maxLength, rows = 3, disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  rows?: number;
  disabled?: boolean;
}) => (
  <textarea
    value={value}
    onChange={e => onChange(e.target.value)}
    placeholder={placeholder}
    maxLength={maxLength}
    rows={rows}
    disabled={disabled}
    className="w-full bg-secondary/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 resize-none disabled:opacity-50 transition-all"
  />
);

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export function SaveStrategyModal({ open, onClose, enrichedResult, config, onSaved }: Props) {
  const { user }            = useAuthStore();
  const { createStrategy }  = useStrategyStore();

  // ── Form state ──
  const defaultName = config.strategyName?.trim()
    || `${config.strategyType.charAt(0).toUpperCase() + config.strategyType.slice(1)} Strategy`;

  const [name,         setName]         = useState(defaultName);
  const [shortDesc,    setShortDesc]    = useState('');
  const [description,  setDescription]  = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [pricePreset,  setPricePreset]  = useState<PricePreset>('free');
  const [customPrice,  setCustomPrice]  = useState('');
  const [isPublish,    setIsPublish]    = useState(true);
  const [showAllTags,  setShowAllTags]  = useState(false);
  const [isSaving,     setIsSaving]     = useState(false);
  const [errors,       setErrors]       = useState<string[]>([]);
  const [saved,        setSaved]        = useState(false);

  const resolvedPrice = (() => {
    if (pricePreset === 'free')   return 0;
    if (pricePreset === '500')    return 500;
    if (pricePreset === '1000')   return 1000;
    const parsed = parseInt(customPrice, 10);
    return isNaN(parsed) ? 0 : Math.max(0, parsed);
  })();

  const visibleTags = showAllTags ? STRATEGY_TAGS : STRATEGY_TAGS.slice(0, 12);

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags(prev => {
      if (prev.includes(tag)) return prev.filter(t => t !== tag);
      if (prev.length >= MAX_STRATEGY_TAGS) return prev;
      return [...prev, tag];
    });
  }, []);

  // ── Save ──
  const handleSave = useCallback(async () => {
    if (!user) return;

    const errs: string[] = [];
    if (!name.trim())           errs.push('Strategy name is required.');
    if (!shortDesc.trim())      errs.push('Short description is required.');
    if (name.trim().length > 100) errs.push('Name must be 100 characters or fewer.');
    if (shortDesc.length > 200)   errs.push('Short description must be 200 characters or fewer.');
    if (pricePreset === 'custom' && (isNaN(parseInt(customPrice, 10)) || parseInt(customPrice, 10) < 0)) {
      errs.push('Custom price must be a positive number.');
    }

    if (errs.length > 0) {
      setErrors(errs);
      return;
    }

    setErrors([]);
    setIsSaving(true);

    // Small async delay so the loading state is visible
    await new Promise(r => setTimeout(r, 350));

    const metrics = enrichedResult.metrics;
    const result = createStrategy({
      creatorId:        user.id,
      creatorName:      user.displayName,
      creatorAvatarSeed: user.avatarSeed,
      name:             name.trim(),
      shortDescription: shortDesc.trim(),
      description:      description.trim() || shortDesc.trim(),
      type:             config.strategyType === 'custom' ? 'custom' : config.strategyType as any,
      price:            resolvedPrice,
      tags:             selectedTags,
      requiredLevel:    0,
      requiredPlan:     'any',
      requiresKyc:      false,
      code:             config.customCode || JSON.stringify({ strategyType: config.strategyType, params: config.params }),
      paramDocs:        `Backtested on ${config.params.symbol} · ${config.params.timeframe} · ${config.params.startDate} → ${config.params.endDate}`,
    });

    setIsSaving(false);

    if (!result.ok || !result.strategy) {
      setErrors(result.errors ?? ['Failed to save strategy. Please try again.']);
      return;
    }

    setSaved(true);
    setTimeout(() => {
      onSaved(result.strategy!.id, result.strategy!.name);
      onClose();
    }, 1200);
  }, [
    user, name, shortDesc, description, selectedTags, resolvedPrice,
    pricePreset, customPrice, config, enrichedResult, createStrategy, onSaved, onClose,
  ]);

  if (!open) return null;

  const metrics = enrichedResult.metrics;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ type: 'spring', damping: 24, stiffness: 300 }}
          className="relative z-10 w-full max-w-xl bg-card border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-gradient-to-r from-primary/5 to-transparent">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Save className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground">Save Strategy</h2>
                <p className="text-xs text-muted-foreground">Publish to marketplace or keep private</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Success state */}
          <AnimatePresence>
            {saved && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-card/95 backdrop-blur-sm"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', damping: 14, stiffness: 200 }}
                  className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center"
                >
                  <CheckCircle2 className="h-8 w-8 text-green-400" />
                </motion.div>
                <p className="text-lg font-bold text-foreground">Strategy Saved!</p>
                <p className="text-sm text-muted-foreground text-center max-w-xs">
                  {isPublish
                    ? 'Submitted for marketplace review. You will be notified when approved.'
                    : 'Saved privately. Load it anytime from your strategy library.'}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Backtest summary strip */}
          <div className="px-6 py-3 bg-secondary/10 border-b border-white/5 flex items-center gap-4 text-xs">
            <span className="text-muted-foreground">Backtest snapshot:</span>
            <span className={cn('font-bold', metrics.totalReturn >= 0 ? 'text-green-400' : 'text-red-400')}>
              {metrics.totalReturn >= 0 ? '+' : ''}{metrics.totalReturn.toFixed(2)}% return
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="text-foreground/80">{metrics.winRate.toFixed(1)}% win rate</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-foreground/80">{metrics.totalTrades} trades</span>
            <span className={cn(
              'ml-auto text-xs px-2 py-0.5 rounded-full border',
              enrichedResult.data.source === 'coingecko'
                ? 'text-green-400 bg-green-500/10 border-green-500/20'
                : 'text-amber-400 bg-amber-500/10 border-amber-500/20',
            )}>
              {enrichedResult.data.source === 'coingecko' ? 'Live data' : 'Simulated'}
            </span>
          </div>

          {/* Form */}
          <div className="p-6 space-y-5 overflow-y-auto max-h-[60vh]">

            {/* Errors */}
            <AnimatePresence>
              {errors.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400"
                >
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <ul className="space-y-0.5">
                    {errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Strategy Name */}
            <div>
              <FieldLabel required>Strategy Name</FieldLabel>
              <FieldInput
                value={name}
                onChange={setName}
                placeholder="e.g. My RSI Mean Reversion"
                maxLength={100}
                disabled={isSaving}
              />
              <p className="text-[10px] text-muted-foreground/60 mt-1 text-right">{name.length}/100</p>
            </div>

            {/* Short Description */}
            <div>
              <FieldLabel required>Short Description</FieldLabel>
              <FieldInput
                value={shortDesc}
                onChange={setShortDesc}
                placeholder="Buys when RSI < 30, sells when RSI > 70"
                maxLength={200}
                disabled={isSaving}
              />
              <p className="text-[10px] text-muted-foreground/60 mt-1 text-right">{shortDesc.length}/200</p>
            </div>

            {/* Full Description */}
            <div>
              <FieldLabel>Description</FieldLabel>
              <FieldTextarea
                value={description}
                onChange={setDescription}
                placeholder="Describe your strategy in more detail — entry/exit logic, market conditions, risk management…"
                maxLength={2000}
                rows={3}
                disabled={isSaving}
              />
            </div>

            {/* Tags */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <FieldLabel>Tags</FieldLabel>
                <span className="text-[10px] text-muted-foreground/60">{selectedTags.length}/{MAX_STRATEGY_TAGS}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {visibleTags.map(tag => {
                  const active = selectedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      disabled={isSaving}
                      className={cn(
                        'px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                        active
                          ? 'bg-primary/20 border-primary/40 text-primary'
                          : 'bg-secondary/30 border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground',
                        !active && selectedTags.length >= MAX_STRATEGY_TAGS && 'opacity-40 cursor-not-allowed',
                      )}
                    >
                      {tag}
                    </button>
                  );
                })}
                {STRATEGY_TAGS.length > 12 && (
                  <button
                    onClick={() => setShowAllTags(s => !s)}
                    className="px-2.5 py-1 rounded-full text-xs text-muted-foreground hover:text-foreground border border-white/10 hover:border-white/20 transition-all flex items-center gap-1"
                  >
                    {showAllTags ? 'Show less' : `+${STRATEGY_TAGS.length - 12} more`}
                    <ChevronDown className={cn('h-3 w-3 transition-transform', showAllTags && 'rotate-180')} />
                  </button>
                )}
              </div>
            </div>

            {/* Price */}
            <div>
              <FieldLabel>Price</FieldLabel>
              <div className="flex items-center gap-2 flex-wrap">
                {PRICE_PRESETS.map(preset => (
                  <button
                    key={preset.key}
                    onClick={() => setPricePreset(preset.key)}
                    disabled={isSaving}
                    className={cn(
                      'px-3 py-2 rounded-xl text-sm font-medium border transition-all',
                      pricePreset === preset.key
                        ? 'bg-primary/20 border-primary/40 text-primary'
                        : 'bg-secondary/30 border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20',
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <AnimatePresence>
                {pricePreset === 'custom' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-2 overflow-hidden"
                  >
                    <div className="flex items-center gap-2">
                      <FieldInput
                        value={customPrice}
                        onChange={setCustomPrice}
                        placeholder="Enter amount"
                        disabled={isSaving}
                      />
                      <span className="text-sm text-muted-foreground whitespace-nowrap">CP</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Visibility — Publish / Private (exclusive) */}
            <div>
              <FieldLabel>Visibility</FieldLabel>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setIsPublish(true)}
                  disabled={isSaving}
                  className={cn(
                    'flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all',
                    isPublish
                      ? 'bg-primary/10 border-primary/30 text-primary'
                      : 'bg-secondary/20 border-white/10 text-muted-foreground hover:border-white/20',
                  )}
                >
                  <Globe className="h-4 w-4 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold leading-none">Publish to Marketplace</p>
                    <p className="text-[10px] opacity-70 mt-0.5">Reviewed by admin, then public</p>
                  </div>
                  {isPublish && <div className="ml-auto w-2 h-2 rounded-full bg-primary" />}
                </button>
                <button
                  onClick={() => setIsPublish(false)}
                  disabled={isSaving}
                  className={cn(
                    'flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all',
                    !isPublish
                      ? 'bg-secondary/40 border-white/20 text-foreground'
                      : 'bg-secondary/20 border-white/10 text-muted-foreground hover:border-white/20',
                  )}
                >
                  <Lock className="h-4 w-4 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold leading-none">Keep Private</p>
                    <p className="text-[10px] opacity-70 mt-0.5">Only visible to you</p>
                  </div>
                  {!isPublish && <div className="ml-auto w-2 h-2 rounded-full bg-foreground/60" />}
                </button>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between gap-3 bg-card/50">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || saved}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-all shadow-lg shadow-primary/20"
            >
              {isSaving ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
              ) : (
                <><Save className="h-4 w-4" /> Save Strategy</>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
