/**
 * CreateStrategyPage.tsx — /marketplace/create and /marketplace/edit/:id
 * Full wizard: metadata → code → backtest → pricing → publish
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Save, Play, CheckCircle, AlertTriangle, Plus, X,
  Code, Info, DollarSign, Send, ChevronRight, ChevronLeft,
  Loader2, FlaskConical,
} from 'lucide-react';
import { useStrategyStore } from '../../lib/strategyStore';
import { useAuthStore } from '../../lib/authStore';
import { useAcademyStore } from '../../lib/academyStore';
import { getLevelFromXP, CV, TYPE_META, RISK_META } from './MarketplaceUtils';
import type { StrategyType, RiskLevel } from '../../lib/strategyTypes';
import { STRATEGY_TAGS } from '../../lib/strategyTypes';
import { cn } from '../../lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface FormState {
  name:             string;
  shortDescription: string;
  description:      string;
  type:             StrategyType;
  riskLevel:        RiskLevel;
  tags:             string[];
  price:            number;
  code:             string;
  paramDocs:        string;
  requiredLevel:    number;
  requiredPlan:     'bronze' | 'silver' | 'gold' | 'any';
}

const PRICE_OPTIONS = [
  { value: 0,     label: 'FREE' },
  { value: 250,   label: '250 CP' },
  { value: 500,   label: '500 CP' },
  { value: 1000,  label: '1,000 CP' },
  { value: 2500,  label: '2,500 CP' },
];

const STEPS = [
  { id: 'info',     label: 'Basic Info',  icon: Info },
  { id: 'code',     label: 'Code',        icon: Code },
  { id: 'backtest', label: 'Backtest',    icon: FlaskConical },
  { id: 'publish',  label: 'Publish',     icon: Send },
];

const DEFAULT_CODE = `{
  "strategy": "custom",
  "description": "My trading strategy",
  "entryConditions": {
    "rsi": { "operator": "<", "value": 30 },
    "volume": { "operator": ">", "multiplier": 1.5 }
  },
  "exitConditions": {
    "rsi": { "operator": ">", "value": 70 },
    "stopLoss": { "pct": 2 },
    "takeProfit": { "pct": 5 }
  },
  "params": {
    "positionSize": 10,
    "maxPositions": 3,
    "timeframe": "1h"
  }
}`;

// ─────────────────────────────────────────────────────────────────────────────

export function CreateStrategyPage() {
  const { id }     = useParams<{ id?: string }>();
  const navigate   = useNavigate();
  const { user }   = useAuthStore();
  const { totalXP } = useAcademyStore();
  const createStrategy  = useStrategyStore(s => s.createStrategy);
  const updateStrategy  = useStrategyStore(s => s.updateStrategy);
  const submitForReview = useStrategyStore(s => s.submitForReview);
  const runBacktest     = useStrategyStore(s => s.runBacktest);
  const strategies      = useStrategyStore(s => s.strategies);
  const backtestResults = useStrategyStore(s => s.backtestResults);

  const isEdit    = Boolean(id);
  const editTarget = id ? strategies[id] : null;
  const level      = getLevelFromXP(totalXP);

  const [step, setStep]       = useState(0);
  const [saving, setSaving]   = useState(false);
  const [running, setRunning] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [useCustom, setUseCustom]     = useState(false);
  const [strategyId, setStrategyId]   = useState<string | null>(id ?? null);
  const [backtestDone, setBacktestDone] = useState(!!backtestResults[id ?? '']);
  const [errors, setErrors]   = useState<string[]>([]);

  const [form, setForm] = useState<FormState>({
    name:             editTarget?.name ?? '',
    shortDescription: editTarget?.shortDescription ?? '',
    description:      editTarget?.description ?? '',
    type:             editTarget?.type ?? 'custom',
    riskLevel:        editTarget?.riskLevel ?? 'medium',
    tags:             editTarget?.tags ?? [],
    price:            editTarget?.price ?? 0,
    code:             editTarget?.code ?? DEFAULT_CODE,
    paramDocs:        editTarget?.paramDocs ?? '',
    requiredLevel:    editTarget?.requiredLevel ?? 0,
    requiredPlan:     editTarget?.requiredPlan ?? 'any',
  });

  const btResult = strategyId ? backtestResults[strategyId] : null;

  const patch = (p: Partial<FormState>) => setForm(f => ({ ...f, ...p }));

  // ── Validators ────────────────────────────────────────────────────────────

  function validateStep(s: number): string[] {
    const errs: string[] = [];
    if (s === 0) {
      if (!form.name.trim())             errs.push('Strategy name is required.');
      if (form.name.length > 100)        errs.push('Name must be ≤ 100 characters.');
      if (!form.shortDescription.trim()) errs.push('Short description is required.');
      if (!form.description.trim())      errs.push('Description is required.');
    }
    if (s === 1) {
      try { JSON.parse(form.code); } catch {
        errs.push('Strategy code must be valid JSON.');
      }
    }
    return errs;
  }

  const goNext = () => {
    const errs = validateStep(step);
    if (errs.length) { setErrors(errs); return; }
    setErrors([]);
    setStep(s => Math.min(STEPS.length - 1, s + 1));
  };

  const goPrev = () => { setErrors([]); setStep(s => Math.max(0, s - 1)); };

  // ── Save draft ────────────────────────────────────────────────────────────

  const handleSaveDraft = async () => {
    if (!user) return;
    setSaving(true);
    await new Promise(r => setTimeout(r, 400));

    if (!strategyId) {
      const result = createStrategy({
        creatorId:         user.id,
        creatorName:       user.displayName,
        creatorAvatarSeed: user.avatarSeed,
        name:              form.name || 'Untitled Strategy',
        description:       form.description,
        shortDescription:  form.shortDescription,
        type:              form.type,
        price:             form.price,
        tags:              form.tags,
        requiredLevel:     form.requiredLevel,
        requiredPlan:      form.requiredPlan,
        requiresKyc:       false,
        code:              form.code,
        paramDocs:         form.paramDocs,
      });
      if (result.ok && result.strategy) {
        setStrategyId(result.strategy.id);
      }
    } else {
      updateStrategy(strategyId, user.id, {
        name:             form.name,
        description:      form.description,
        shortDescription: form.shortDescription,
        type:             form.type,
        price:            form.price,
        tags:             form.tags,
        requiredLevel:    form.requiredLevel,
        requiredPlan:     form.requiredPlan,
        requiresKyc:      false,
        code:             form.code,
        paramDocs:        form.paramDocs,
      });
    }

    setSaving(false);
  };

  // ── Run backtest ──────────────────────────────────────────────────────────

  const handleRunBacktest = async () => {
    if (!user) return;
    setRunning(true);
    await handleSaveDraft();
    await new Promise(r => setTimeout(r, 1000));
    if (strategyId) {
      runBacktest(strategyId);
      setBacktestDone(true);
    }
    setRunning(false);
  };

  // ── Submit for review ────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!user || !strategyId) return;
    setSaving(true);
    await handleSaveDraft();
    await new Promise(r => setTimeout(r, 400));
    const result = submitForReview(strategyId, user.id);
    setSaving(false);
    if (result.ok) {
      navigate('/marketplace/my-strategies');
    } else {
      setErrors([result.error ?? 'Submission failed.']);
    }
  };

  // ── Tag helpers ───────────────────────────────────────────────────────────

  const addTag = (tag: string) => {
    const t = tag.toLowerCase().trim().replace(/\s+/g, '-');
    if (!t || form.tags.includes(t) || form.tags.length >= 10) return;
    patch({ tags: [...form.tags, t] });
    setTagInput('');
  };

  const removeTag = (tag: string) => patch({ tags: form.tags.filter(t => t !== tag) });

  // ── Render ────────────────────────────────────────────────────────────────

  if (level < 5 && !isEdit) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
        <div className="text-5xl">🔒</div>
        <p className="text-xl font-bold text-foreground">Academy Level 5 Required</p>
        <p className="text-sm max-w-sm" style={{ color: CV.gray }}>
          You need to reach Academy Level 5 to publish strategies. Keep learning!
          <br />You are currently Level {level}.
        </p>
        <button onClick={() => navigate('/academy')} className="px-5 py-2 rounded-xl text-sm font-bold"
          style={{ background: CV.goldAlpha, color: CV.gold, border: `1px solid ${CV.goldBorder}` }}>
          Go to Academy
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ background: 'radial-gradient(ellipse 70% 50% at 90% 0%, rgba(255,215,0,0.05) 0%, transparent 70%), var(--background)' }}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b shrink-0 backdrop-blur-sm"
        style={{ borderColor: CV.goldBorder, background: 'var(--bg-secondary)' }}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/marketplace/my-strategies')} className="p-1.5 rounded-lg" style={{ color: CV.gray }}>
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: CV.goldAlpha, border: `1px solid ${CV.goldBorder}` }}>
            <Code className="h-5 w-5" style={{ color: CV.gold }} />
          </div>
          <h1 className="text-lg font-bold text-foreground">{isEdit ? 'Edit Strategy' : 'Create New Strategy'}</h1>
        </div>

        <button
          onClick={handleSaveDraft}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
          style={{ background: CV.surface, color: CV.gray, border: `1px solid ${CV.border}` }}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Draft
        </button>
      </header>

      {/* Step indicator */}
      <div className="flex items-center gap-2 px-6 py-3 border-b" style={{ borderColor: CV.border }}>
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const done  = i < step;
          const active = i === step;
          return (
            <React.Fragment key={s.id}>
              <button
                onClick={() => { if (i < step) setStep(i); }}
                disabled={i > step}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all disabled:cursor-not-allowed"
                style={{
                  background: active ? CV.goldAlpha : done ? 'rgba(52,211,153,0.08)' : CV.surface,
                  color:      active ? CV.gold      : done ? CV.green                : CV.gray,
                  border:     `1px solid ${active ? CV.goldBorder : done ? 'rgba(52,211,153,0.20)' : CV.border}`,
                }}
              >
                {done ? <CheckCircle className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                {s.label}
              </button>
              {i < STEPS.length - 1 && (
                <ChevronRight className="h-3.5 w-3.5 shrink-0" style={{ color: CV.gray }} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
          <AnimatePresence mode="wait">

            {/* ── Step 0: Basic Info ── */}
            {step === 0 && (
              <motion.div key="info" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
                <div className="rounded-2xl p-5 space-y-4" style={{ background: 'var(--bg-card)', border: `1px solid ${CV.border}` }}>
                  <h2 className="font-bold text-foreground">Basic Information</h2>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold" style={{ color: CV.gray }}>Strategy Name *</label>
                    <input type="text" value={form.name} onChange={e => patch({ name: e.target.value })} maxLength={100}
                      placeholder="e.g. RSI Mean Reversion Pro"
                      className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-yellow-500/40"
                      style={{ background: CV.surface, border: `1px solid ${CV.border}`, color: 'rgba(255,255,255,0.85)' }}
                    />
                    <p className="text-[10px] text-right" style={{ color: CV.gray }}>{form.name.length}/100</p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold" style={{ color: CV.gray }}>Short Description * (shown on cards)</label>
                    <input type="text" value={form.shortDescription} onChange={e => patch({ shortDescription: e.target.value })} maxLength={200}
                      placeholder="One-sentence tagline for marketplace listings"
                      className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-yellow-500/40"
                      style={{ background: CV.surface, border: `1px solid ${CV.border}`, color: 'rgba(255,255,255,0.85)' }}
                    />
                    <p className="text-[10px] text-right" style={{ color: CV.gray }}>{form.shortDescription.length}/200</p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold" style={{ color: CV.gray }}>Full Description *</label>
                    <textarea value={form.description} onChange={e => patch({ description: e.target.value })} rows={4} maxLength={2000}
                      placeholder="Describe how the strategy works, what market conditions it's optimised for, and any risks…"
                      className="w-full resize-none px-3 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-yellow-500/40"
                      style={{ background: CV.surface, border: `1px solid ${CV.border}`, color: 'rgba(255,255,255,0.85)' }}
                    />
                    <p className="text-[10px] text-right" style={{ color: CV.gray }}>{form.description.length}/2000</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold" style={{ color: CV.gray }}>Strategy Type</label>
                      <select value={form.type} onChange={e => patch({ type: e.target.value as StrategyType })}
                        className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none"
                        style={{ background: CV.surface, border: `1px solid ${CV.border}`, color: 'rgba(255,255,255,0.85)' }}>
                        {Object.entries(TYPE_META).map(([k, v]) => (
                          <option key={k} value={k}>{v.emoji} {v.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold" style={{ color: CV.gray }}>Risk Level</label>
                      <select value={form.riskLevel} onChange={e => patch({ riskLevel: e.target.value as RiskLevel })}
                        className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none"
                        style={{ background: CV.surface, border: `1px solid ${CV.border}`, color: 'rgba(255,255,255,0.85)' }}>
                        {Object.entries(RISK_META).map(([k, v]) => (
                          <option key={k} value={k}>{v.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Tags */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold" style={{ color: CV.gray }}>Tags (max 10)</label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {form.tags.map(tag => (
                        <span key={tag} className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full"
                          style={{ background: CV.goldAlpha, color: CV.gold, border: `1px solid ${CV.goldBorder}` }}>
                          {tag}
                          <button onClick={() => removeTag(tag)}><X className="h-2.5 w-2.5" /></button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={tagInput}
                        onChange={e => setTagInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput); }}}
                        placeholder="Add a tag…"
                        className="flex-1 px-3 py-2 rounded-xl text-xs focus:outline-none"
                        style={{ background: CV.surface, border: `1px solid ${CV.border}`, color: 'rgba(255,255,255,0.85)' }}
                      />
                      <button onClick={() => addTag(tagInput)} className="px-3 py-2 rounded-xl text-xs font-semibold"
                        style={{ background: CV.goldAlpha, color: CV.gold, border: `1px solid ${CV.goldBorder}` }}>
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {/* Quick-add popular tags */}
                    <div className="flex flex-wrap gap-1">
                      {STRATEGY_TAGS.slice(0, 8).filter(t => !form.tags.includes(t)).map(tag => (
                        <button key={tag} onClick={() => addTag(tag)}
                          className="text-[10px] px-2 py-0.5 rounded-full transition-all"
                          style={{ background: CV.surface, color: CV.gray, border: `1px solid ${CV.border}` }}>
                          + {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── Step 1: Code ── */}
            {step === 1 && (
              <motion.div key="code" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
                <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: `1px solid ${CV.border}` }}>
                  <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: CV.border }}>
                    <div className="flex items-center gap-2">
                      <Code className="h-4 w-4" style={{ color: CV.gold }} />
                      <span className="font-semibold text-sm text-foreground">Strategy Configuration (JSON)</span>
                    </div>
                    <span className="text-[10px]" style={{ color: CV.gray }}>
                      {new Blob([form.code]).size.toLocaleString()} / 65,536 bytes
                    </span>
                  </div>
                  <textarea
                    value={form.code}
                    onChange={e => patch({ code: e.target.value })}
                    rows={16}
                    spellCheck={false}
                    className="w-full resize-none p-4 text-xs focus:outline-none font-mono leading-relaxed"
                    style={{ background: 'transparent', color: '#34d399' }}
                  />
                </div>

                <div className="rounded-2xl p-5 space-y-3" style={{ background: 'var(--bg-card)', border: `1px solid ${CV.border}` }}>
                  <h3 className="font-semibold text-sm text-foreground">Parameter Documentation (markdown)</h3>
                  <textarea
                    value={form.paramDocs}
                    onChange={e => patch({ paramDocs: e.target.value })}
                    rows={5}
                    placeholder="## Parameters&#10;- **rsi**: RSI period (default 14)&#10;- **stopLoss**: Stop-loss % (default 2%)"
                    className="w-full resize-none px-3 py-2.5 rounded-xl text-sm focus:outline-none font-mono"
                    style={{ background: CV.surface, border: `1px solid ${CV.border}`, color: 'rgba(255,255,255,0.85)' }}
                  />
                </div>
              </motion.div>
            )}

            {/* ── Step 2: Backtest ── */}
            {step === 2 && (
              <motion.div key="backtest" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
                <div className="rounded-2xl p-5 space-y-4" style={{ background: 'var(--bg-card)', border: `1px solid ${CV.border}` }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-bold text-foreground">Run Backtest</h2>
                      <p className="text-xs mt-0.5" style={{ color: CV.gray }}>
                        Validate strategy performance against historical data before publishing.
                      </p>
                    </div>
                    <button
                      onClick={handleRunBacktest}
                      disabled={running}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-60"
                      style={{ background: CV.goldAlpha, color: CV.gold, border: `1px solid ${CV.goldBorder}` }}
                    >
                      {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                      {running ? 'Running…' : 'Run Backtest'}
                    </button>
                  </div>

                  {btResult ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                      <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                        style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.20)' }}>
                        <CheckCircle className="h-4 w-4" style={{ color: CV.green }} />
                        <p className="text-xs font-semibold" style={{ color: CV.green }}>
                          Strategy passed validation. Ready for review.
                        </p>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { label: 'Win Rate',     value: `${btResult.winRate.toFixed(1)}%` },
                          { label: 'Total Return', value: `+${btResult.totalProfitPct.toFixed(1)}%` },
                          { label: 'Sharpe Ratio', value: btResult.sharpeRatio.toFixed(2) },
                          { label: 'Max Drawdown', value: `−${btResult.maxDrawdown.toFixed(1)}%` },
                          { label: 'Total Trades', value: btResult.totalTrades.toString() },
                          { label: 'Period',       value: `${btResult.periodDays}d` },
                        ].map(m => (
                          <div key={m.label} className="rounded-xl p-3" style={{ background: CV.surface, border: `1px solid ${CV.border}` }}>
                            <p className="text-[10px]" style={{ color: CV.gray }}>{m.label}</p>
                            <p className="font-bold text-sm text-foreground mt-0.5">{m.value}</p>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  ) : (
                    <div className="flex flex-col items-center py-10 gap-3 text-center">
                      <FlaskConical className="h-10 w-10 opacity-20" />
                      <p className="text-sm" style={{ color: CV.gray }}>No backtest results yet.</p>
                      <p className="text-xs" style={{ color: CV.gray }}>Run a backtest to validate your strategy before publishing.</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* ── Step 3: Pricing & Publish ── */}
            {step === 3 && (
              <motion.div key="publish" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
                <div className="rounded-2xl p-5 space-y-4" style={{ background: 'var(--bg-card)', border: `1px solid ${CV.border}` }}>
                  <h2 className="font-bold text-foreground">Pricing</h2>

                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {PRICE_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => { setUseCustom(false); patch({ price: opt.value }); }}
                        className="py-3 rounded-xl text-sm font-bold transition-all"
                        style={{
                          background: (!useCustom && form.price === opt.value) ? CV.goldAlpha : CV.surface,
                          color:      (!useCustom && form.price === opt.value) ? CV.gold      : CV.gray,
                          border:     `1px solid ${(!useCustom && form.price === opt.value) ? CV.goldBorder : CV.border}`,
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setUseCustom(v => !v)}
                      className="text-xs font-semibold px-3 py-1.5 rounded-xl transition-all"
                      style={{
                        background: useCustom ? CV.goldAlpha : CV.surface,
                        color:      useCustom ? CV.gold      : CV.gray,
                        border:     `1px solid ${useCustom ? CV.goldBorder : CV.border}`,
                      }}
                    >Custom Price</button>
                    {useCustom && (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={customPrice}
                          onChange={e => { setCustomPrice(e.target.value); patch({ price: Number(e.target.value) || 0 }); }}
                          placeholder="e.g. 1500"
                          min={0}
                          className="w-28 px-3 py-1.5 rounded-xl text-sm focus:outline-none"
                          style={{ background: CV.surface, border: `1px solid ${CV.goldBorder}`, color: CV.gold }}
                        />
                        <span className="text-xs" style={{ color: CV.gray }}>CP Coins</span>
                      </div>
                    )}
                  </div>

                  {/* Earnings preview */}
                  {form.price > 0 && (
                    <div className="rounded-xl p-3 space-y-1" style={{ background: CV.surface, border: `1px solid ${CV.border}` }}>
                      <p className="text-xs font-semibold mb-2 text-foreground">Earnings Preview (per sale)</p>
                      <div className="flex justify-between text-xs">
                        <span style={{ color: CV.gray }}>Sale price</span>
                        <span className="font-semibold">{form.price.toLocaleString()} CP</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span style={{ color: CV.gray }}>Platform fee (20%)</span>
                        <span style={{ color: CV.gray }}>−{Math.round(form.price * 0.20).toLocaleString()} CP</span>
                      </div>
                      <div className="flex justify-between text-xs font-bold border-t pt-1" style={{ borderColor: CV.border }}>
                        <span>You earn</span>
                        <span style={{ color: CV.green }}>{Math.round(form.price * 0.80).toLocaleString()} CP</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Access requirements */}
                <div className="rounded-2xl p-5 space-y-4" style={{ background: 'var(--bg-card)', border: `1px solid ${CV.border}` }}>
                  <h2 className="font-bold text-foreground">Access Requirements</h2>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold" style={{ color: CV.gray }}>Minimum Academy Level</label>
                      <select value={form.requiredLevel} onChange={e => patch({ requiredLevel: Number(e.target.value) })}
                        className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none"
                        style={{ background: CV.surface, border: `1px solid ${CV.border}`, color: 'rgba(255,255,255,0.85)' }}>
                        <option value={0}>Any Level</option>
                        {[1, 2, 3, 4, 5].map(l => <option key={l} value={l}>Level {l}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold" style={{ color: CV.gray }}>Minimum Plan</label>
                      <select value={form.requiredPlan} onChange={e => patch({ requiredPlan: e.target.value as any })}
                        className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none"
                        style={{ background: CV.surface, border: `1px solid ${CV.border}`, color: 'rgba(255,255,255,0.85)' }}>
                        <option value="any">Any Plan</option>
                        <option value="bronze">Bronze+</option>
                        <option value="silver">Silver+</option>
                        <option value="gold">Gold Only</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Submit */}
                <div className="rounded-2xl p-5 space-y-3" style={{ background: 'var(--bg-card)', border: `1px solid ${CV.goldBorder}` }}>
                  <h2 className="font-bold text-foreground">Ready to Publish?</h2>
                  <p className="text-xs" style={{ color: CV.gray }}>
                    Your strategy will be submitted to our team for review. Once approved it will appear in the marketplace.
                    Reviews typically take 24–48 hours.
                  </p>

                  {!backtestDone && !btResult && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                      style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.20)' }}>
                      <AlertTriangle className="h-4 w-4" style={{ color: '#fbbf24' }} />
                      <p className="text-xs" style={{ color: '#fbbf24' }}>
                        Backtest not run. We recommend completing Step 3 before submitting.
                      </p>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button onClick={handleSaveDraft} disabled={saving}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
                      style={{ background: CV.surface, color: CV.gray, border: `1px solid ${CV.border}` }}>
                      <Save className="h-4 w-4" /> Save Draft
                    </button>
                    <button onClick={handleSubmit} disabled={saving || !form.name.trim()}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-40"
                      style={{ background: 'linear-gradient(135deg, #FFD700 0%, #FFA800 100%)', color: '#0A1929' }}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Submit for Review
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

          </AnimatePresence>

          {/* Validation errors */}
          {errors.length > 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 space-y-1">
              {errors.map((e, i) => (
                <p key={i} className="flex items-center gap-2 text-xs" style={{ color: CV.red }}>
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {e}
                </p>
              ))}
            </motion.div>
          )}

          {/* Navigation buttons */}
          <div className="flex items-center justify-between mt-6">
            <button onClick={goPrev} disabled={step === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-0 transition-all"
              style={{ background: CV.surface, color: 'rgba(255,255,255,0.7)', border: `1px solid ${CV.border}` }}>
              <ChevronLeft className="h-4 w-4" /> Back
            </button>

            {step < STEPS.length - 1 && (
              <button onClick={goNext}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all"
                style={{ background: CV.goldAlpha, color: CV.gold, border: `1px solid ${CV.goldBorder}` }}>
                Next <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
