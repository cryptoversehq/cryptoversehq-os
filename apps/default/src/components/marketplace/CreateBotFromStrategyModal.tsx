/**
 * CreateBotFromStrategyModal.tsx
 * §4.2 — "Create Bot from Strategy" — deploys a purchased strategy as a live bot.
 * Maps strategy type → bot template type, pre-fills config from strategy params.
 */
import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Bot, CheckCircle, AlertTriangle, Loader2, Rocket, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useBotStore } from '../../lib/botStore';
import { useBotTemplateStore } from '../../lib/botTemplateStore';
import { useAuthStore } from '../../lib/authStore';
import { useAcademyStore } from '../../lib/academyStore';
import { useTradingStore } from '../../lib/tradingStore';
import { getLevelFromXP, CV, TYPE_META, RISK_META } from './MarketplaceUtils';
import type { Strategy, StrategyType } from '../../lib/strategyTypes';
import type { BotType } from '../../lib/botTypes';

// ── Strategy type → bot type mapping ─────────────────────────────────────────
const STRATEGY_TO_BOT_TYPE: Record<StrategyType, BotType> = {
  grid:       'grid',
  dca:        'dca',
  martingale: 'martingale',
  arbitrage:  'arbitrage',
  custom:     'grid',  // fallback
};

// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  strategy: Strategy;
  onClose: () => void;
}

export function CreateBotFromStrategyModal({ strategy, onClose }: Props) {
  const navigate = useNavigate();
  const { user }   = useAuthStore();
  const { totalXP } = useAcademyStore();
  const createBot  = useBotStore(s => s.createBot);
  const getActiveTemplates = useBotTemplateStore(s => s.getActiveTemplates);
  const getTemplatesByType = useBotTemplateStore(s => s.getTemplatesByType);
  const balance    = useTradingStore(s => s.balance);

  const [botName,    setBotName]    = useState(`${strategy.name} Bot`);
  const [investment, setInvestment] = useState(1_000);
  const [schedule,   setSchedule]   = useState<'every_tick' | 'hourly' | 'daily'>('every_tick');
  const [phase,      setPhase]      = useState<'config' | 'creating' | 'success' | 'error'>('config');
  const [errorMsg,   setErrorMsg]   = useState('');
  const [createdBotId, setCreatedBotId] = useState('');

  const level = getLevelFromXP(totalXP);

  // Find the best matching template
  const botType = STRATEGY_TO_BOT_TYPE[strategy.type];
  const templates = useMemo(() => getTemplatesByType(botType), [getTemplatesByType, botType]);
  const template  = templates[0] ?? getActiveTemplates()[0];

  // Parse strategy code for config hints
  const strategyConfig = useMemo(() => {
    try { return JSON.parse(strategy.code); } catch { return {}; }
  }, [strategy.code]);

  if (!user || !template) return null;

  // Build bot config from strategy type + extracted params
  function buildBotConfig() {
    const base = { ...template.defaultConfig };

    if (botType === 'grid') {
      return {
        ...base,
        type:            'grid' as const,
        totalInvestment: investment,
        gridCount:       strategyConfig.levels ?? base.gridCount ?? 10,
        autoAdjust:      strategyConfig.useATR ?? false,
      };
    }
    if (botType === 'dca') {
      return {
        ...base,
        type:               'dca' as const,
        initialInvestment:  investment,
        safetyOrderAmount:  investment * 0.1,
      };
    }
    if (botType === 'martingale') {
      return {
        ...base,
        type:           'martingale' as const,
        baseAmount:     investment * 0.1,
        baseOrderSize:  investment * 0.1,
        multiplier:     strategyConfig.martingaleMultiplier ?? 2,
      };
    }
    return { ...base, type: botType, totalInvestment: investment };
  }

  const handleCreate = async () => {
    setPhase('creating');
    await new Promise(r => setTimeout(r, 800));

    const result = createBot({
      userId:             user.id,
      templateId:         template.id,
      name:               botName.trim() || `${strategy.name} Bot`,
      config:             buildBotConfig() as any,
      scheduleType:       schedule,
      scheduleValue:      schedule === 'hourly' ? '60' : schedule === 'daily' ? '1440' : '1',
      userTradingBalance: balance,
      userPlan:           user.plan,
      userLevel:          level,
    });

    if (result.ok && result.bot) {
      setCreatedBotId(result.bot.id);
      setPhase('success');
    } else {
      setErrorMsg(result.error ?? 'Failed to create bot.');
      setPhase('error');
    }
  };

  const type = TYPE_META[strategy.type];
  const risk = RISK_META[strategy.riskLevel];

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="relative w-full max-w-md rounded-2xl overflow-hidden z-10 bg-card border border-border shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: CV.goldBorder }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: CV.goldAlpha, border: `1px solid ${CV.goldBorder}` }}>
              <Bot className="h-5 w-5" style={{ color: CV.gold }} />
            </div>
            <div>
              <p className="font-bold text-sm text-foreground">Create Bot from Strategy</p>
              <p className="text-xs" style={{ color: CV.gray }}>{strategy.name}</p>
            </div>
          </div>
          <button onClick={onClose} style={{ color: CV.gray }}><X className="h-4 w-4" /></button>
        </div>

        <AnimatePresence mode="wait">

          {/* Config phase */}
          {phase === 'config' && (
            <motion.div key="config" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-5 space-y-4">
              {/* Strategy summary */}
              <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: CV.surface, border: `1px solid ${CV.border}` }}>
                <span className="text-2xl">{type.emoji}</span>
                <div className="flex-1">
                  <p className="font-semibold text-sm text-foreground">{strategy.name}</p>
                  <div className="flex gap-2 mt-1">
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                      style={{ background: risk.bg, color: risk.color }}>{risk.label}</span>
                    <span className="text-[10px]" style={{ color: CV.gray }}>WR: {strategy.winRate.toFixed(0)}% | Sharpe: {strategy.sharpeRatio.toFixed(1)}</span>
                  </div>
                </div>
              </div>

              {/* Bot name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold" style={{ color: CV.gray }}>Bot Name</label>
                <input type="text" value={botName} onChange={e => setBotName(e.target.value)} maxLength={50}
                  className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-yellow-500/40"
                  style={{ background: CV.surface, border: `1px solid ${CV.border}`, color: 'rgba(255,255,255,0.85)' }} />
              </div>

              {/* Investment */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold" style={{ color: CV.gray }}>
                  Initial Investment (USD) — Available: ${balance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </label>
                <div className="flex gap-2">
                  {[500, 1_000, 5_000, 10_000].map(v => (
                    <button key={v} onClick={() => setInvestment(v)}
                      className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
                      style={{
                        background: investment === v ? CV.goldAlpha : CV.surface,
                        color:      investment === v ? CV.gold      : CV.gray,
                        border:     `1px solid ${investment === v ? CV.goldBorder : CV.border}`,
                      }}>
                      ${v >= 1000 ? `${v / 1000}K` : v}
                    </button>
                  ))}
                </div>
                {investment > balance && (
                  <p className="text-xs" style={{ color: CV.red }}>
                    ⚠ Insufficient balance. You need ${(investment - balance).toLocaleString()} more.
                  </p>
                )}
              </div>

              {/* Schedule */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold" style={{ color: CV.gray }}>Execution Schedule</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'every_tick', label: 'Real-time' },
                    { value: 'hourly',     label: 'Hourly' },
                    { value: 'daily',      label: 'Daily' },
                  ].map(opt => (
                    <button key={opt.value}
                      onClick={() => setSchedule(opt.value as typeof schedule)}
                      className="py-2 rounded-xl text-xs font-semibold transition-all"
                      style={{
                        background: schedule === opt.value ? CV.goldAlpha : CV.surface,
                        color:      schedule === opt.value ? CV.gold      : CV.gray,
                        border:     `1px solid ${schedule === opt.value ? CV.goldBorder : CV.border}`,
                      }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Template info */}
              <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-xl"
                style={{ background: 'rgba(129,140,248,0.08)', border: '1px solid rgba(129,140,248,0.20)' }}>
                <Bot className="h-3.5 w-3.5 shrink-0" style={{ color: '#818cf8' }} />
                <p style={{ color: '#818cf8' }}>
                  Using <strong>{template.name}</strong> template · {type.label} engine
                </p>
              </div>

              <div className="flex gap-3">
                <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ background: CV.surface, color: CV.gray, border: `1px solid ${CV.border}` }}>
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={investment > balance || !botName.trim()}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg,#FFD700,#FFA800)', color: '#0A1929' }}
                >
                  <Rocket className="h-4 w-4" /> Create Bot
                </button>
              </div>
            </motion.div>
          )}

          {/* Creating */}
          {phase === 'creating' && (
            <motion.div key="creating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center py-16 gap-4 text-center">
              <Loader2 className="h-10 w-10 animate-spin" style={{ color: CV.gold }} />
              <p className="font-semibold text-foreground">Deploying bot…</p>
              <p className="text-xs" style={{ color: CV.gray }}>Configuring {type.label} engine with strategy parameters</p>
            </motion.div>
          )}

          {/* Success */}
          {phase === 'success' && (
            <motion.div key="success" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center py-12 gap-4 text-center px-6">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}>
                <CheckCircle className="h-14 w-14" style={{ color: CV.green }} />
              </motion.div>
              <p className="font-bold text-lg text-foreground">Bot Created!</p>
              <p className="text-sm" style={{ color: CV.gray }}>
                <strong style={{ color: CV.gold }}>{botName}</strong> is ready to trade using <strong>{strategy.name}</strong> strategy.
              </p>
              <div className="flex gap-3 w-full">
                <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ background: CV.surface, color: CV.gray, border: `1px solid ${CV.border}` }}>
                  Close
                </button>
                <button
                  onClick={() => { onClose(); navigate(`/bots/${createdBotId}`); }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                  style={{ background: CV.goldAlpha, color: CV.gold, border: `1px solid ${CV.goldBorder}` }}
                >
                  View Bot <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* Error */}
          {phase === 'error' && (
            <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center py-12 gap-4 px-6 text-center">
              <AlertTriangle className="h-10 w-10" style={{ color: CV.red }} />
              <p className="font-bold text-foreground">Bot Creation Failed</p>
              <p className="text-sm" style={{ color: CV.gray }}>{errorMsg}</p>
              <button onClick={() => setPhase('config')} className="px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ background: CV.surface, color: CV.gray, border: `1px solid ${CV.border}` }}>
                Try Again
              </button>
            </motion.div>
          )}

        </AnimatePresence>
      </motion.div>
    </div>
  );
}
