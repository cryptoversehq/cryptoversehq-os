/**
 * DeployBotModal.tsx — Spec 6.1
 *
 * Modal shown from the backtest PostRunActionBar's "Deploy Bot" button.
 * Lets the user review the backtest metrics, give the bot a name,
 * then click "Deploy" to create + start a live bot seeded from the
 * backtest strategy type and parameters.
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Bot, TrendingUp, TrendingDown, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { useBotStore } from '../../lib/botStore';
import { useBotTemplateStore } from '../../lib/botTemplateStore';
import { useAuthStore } from '../../lib/authStore';
import { useTradingStore } from '../../lib/tradingStore';
import { BOT_TYPE_META, CV, fmtUsd } from './BotConstants';
import type { EnrichedBacktestOutput } from '../../lib/backtestRunner';
import type { BacktestConfig } from '../backtest/BacktestConfigPanel';
import type { BotType } from '../../lib/botTypes';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  open:          boolean;
  onClose:       () => void;
  enrichedResult: EnrichedBacktestOutput;
  config:        BacktestConfig;
  onDeployed:    () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY TYPE → BOT TYPE
// ─────────────────────────────────────────────────────────────────────────────

function strategyTypeToBotType(strategyType: string): BotType {
  const map: Record<string, BotType> = {
    grid:        'grid',
    martingale:  'martingale',
    dca:         'dca',
    custom:      'grid',
  };
  return map[strategyType] ?? 'grid';
}

// ─────────────────────────────────────────────────────────────────────────────
// METRIC ROW
// ─────────────────────────────────────────────────────────────────────────────

function MetricRow({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
      <span className="text-xs" style={{ color: CV.gray }}>{label}</span>
      <span
        className="text-xs font-bold tabular-nums"
        style={{ color: positive === undefined ? 'var(--foreground)' : positive ? CV.green : CV.red }}
      >
        {value}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export function DeployBotModal({ open, onClose, enrichedResult, config, onDeployed }: Props) {
  const { user } = useAuthStore();
  const { createBot, startBot } = useBotStore();
  const { getTemplates } = useBotTemplateStore();
  const tradingBalance = useTradingStore(s => s.balance);

  const botType = strategyTypeToBotType(config.strategyType);
  const meta    = BOT_TYPE_META[botType];
  const metrics = enrichedResult.metrics;
  const isPos   = metrics.totalReturn > 0;

  const suggestedName = useMemo(() => {
    const sign = metrics.totalReturn >= 0 ? '+' : '';
    return `${config.strategyName || 'Backtest'} Bot (${sign}${metrics.totalReturn.toFixed(1)}%)`;
  }, [config.strategyName, metrics.totalReturn]);

  const [botName,    setBotName]    = useState(suggestedName);
  const [deploying,  setDeploying]  = useState(false);
  const [deployed,   setDeployed]   = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const handleDeploy = async () => {
    if (!user) return;
    setDeploying(true);
    setError(null);

    try {
      // Find the first template of the right type
      const templates = Object.values(getTemplates()).filter(t => t.type === botType && t.isActive);
      const template  = templates[0];
      if (!template) {
        setError(`No ${botType} template available. Please create a bot manually.`);
        return;
      }

      // Build bot config from backtest params
      const stratCfg = config.params.strategyConfig ?? {};
      const botConfig = {
        ...JSON.parse(JSON.stringify(template.defaultConfig)),
        ...(stratCfg as any),
        type: botType,
        // Map backtest symbol → bot coinId / coinSymbol
        coinId:     config.params.coinId,
        coinSymbol: config.params.symbol.split('/')[0] ?? 'BTC',
      };

      const result = createBot({
        userId:             user.id,
        templateId:         template.id,
        name:               botName.trim() || suggestedName,
        config:             botConfig,
        scheduleType:       'interval',
        scheduleValue:      '1m',
        userTradingBalance: tradingBalance ?? 10_000,
        userPlan:           (user as any).subscription ?? 'bronze',
        userLevel:          (user as any).level ?? 0,
      });

      if (!result.ok) {
        setError(result.errors?.join(' ') ?? 'Failed to deploy bot.');
        return;
      }

      startBot(result.bot!.id);
      setDeployed(true);
      toast.success(`🤖 ${result.bot!.name} deployed!`, {
        description: `Bot is now running with your backtest configuration.`,
      });

      setTimeout(() => {
        setDeployed(false);
        onDeployed();
      }, 1_200);
    } finally {
      setDeploying(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="relative z-10 w-full max-w-md rounded-2xl overflow-hidden flex flex-col"
        style={{ background: '#0A1929', border: '1px solid rgba(255,255,255,0.10)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'rgba(255,255,255,0.07)', background: `${meta.bgAlpha}` }}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">{meta.emoji}</span>
            <div>
              <h2 className="text-sm font-bold text-foreground">Deploy Bot from Backtest</h2>
              <p className="text-[10px] mt-0.5" style={{ color: CV.gray }}>
                Configure and launch your bot with backtest-proven settings
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: CV.gray }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* Backtest performance summary */}
          <div
            className="p-3 rounded-xl border"
            style={{
              background:  isPos ? 'rgba(0,200,83,0.06)' : 'rgba(255,59,48,0.06)',
              borderColor: isPos ? 'rgba(0,200,83,0.20)' : 'rgba(255,59,48,0.20)',
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              {isPos
                ? <TrendingUp className="h-4 w-4" style={{ color: CV.green }} />
                : <TrendingDown className="h-4 w-4" style={{ color: CV.red }} />}
              <span className="text-xs font-bold" style={{ color: isPos ? CV.green : CV.red }}>
                Backtest Result: {isPos ? '+' : ''}{metrics.totalReturn.toFixed(2)}%
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <MetricRow label="Win Rate"    value={`${metrics.winRate.toFixed(1)}%`}     positive={metrics.winRate >= 50} />
              <MetricRow label="Sharpe"      value={metrics.sharpeRatio.toFixed(2)}        positive={metrics.sharpeRatio >= 1} />
              <MetricRow label="Max DD"      value={`${metrics.maxDrawdown.toFixed(1)}%`}  positive={false} />
              <MetricRow label="Trades"      value={metrics.totalTrades.toString()} />
              <MetricRow label="Profit"      value={`$${metrics.totalProfit.toFixed(0)}`}  positive={metrics.totalProfit >= 0} />
              <MetricRow label="Avg/Trade"   value={`$${(metrics.averageWin ?? 0).toFixed(0)}`} positive={(metrics.averageWin ?? 0) >= 0} />
            </div>
          </div>

          {/* Bot name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: CV.gray }}>
              Bot Name
            </label>
            <input
              type="text"
              value={botName}
              onChange={e => setBotName(e.target.value)}
              placeholder="My Deployed Bot"
              className="w-full px-3 py-2 rounded-xl text-sm text-foreground outline-none"
              style={{
                background:  'rgba(10,25,41,0.60)',
                border:      `1px solid ${meta.color}30`,
              }}
              onFocus={e => (e.target.style.borderColor = `${meta.color}70`)}
              onBlur={e  => (e.target.style.borderColor = `${meta.color}30`)}
            />
          </div>

          {/* Config summary */}
          <div className="flex flex-col gap-1">
            <MetricRow label="Strategy Type" value={config.strategyType.toUpperCase()} />
            <MetricRow label="Symbol"        value={config.params.symbol} />
            <MetricRow label="Timeframe"     value={config.params.timeframe} />
            <MetricRow label="Capital"       value={fmtUsd(config.params.initialBalance, false)} />
          </div>

          {/* Error */}
          {error && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
              style={{ background: 'rgba(255,59,48,0.10)', color: CV.red, border: '1px solid rgba(255,59,48,0.22)' }}
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}

          {/* Notice */}
          <div
            className="flex items-start gap-2 p-3 rounded-xl text-xs"
            style={{ background: 'rgba(255,149,0,0.06)', color: CV.orange, border: '1px solid rgba(255,149,0,0.15)' }}
          >
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            Bot uses demo engine — no real funds. Performance may differ from backtest due to live market conditions.
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center gap-3 px-5 py-4 border-t"
          style={{ borderColor: 'rgba(255,255,255,0.07)' }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
            style={{ color: CV.gray, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleDeploy}
            disabled={deploying || deployed || !botName.trim()}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-[0.97]"
            style={deployed ? {
              background: 'rgba(0,200,83,0.15)',
              color:      CV.green,
              border:     '1px solid rgba(0,200,83,0.30)',
            } : {
              background: `linear-gradient(135deg, ${meta.color} 0%, ${meta.color}cc 100%)`,
              color:      '#0A1929',
              boxShadow:  `0 3px 14px ${meta.color}40`,
              opacity:    deploying ? 0.7 : 1,
            }}
          >
            {deployed  ? <><CheckCircle2 className="h-4 w-4" /> Deployed!</> :
             deploying ? <><Loader2 className="h-4 w-4 animate-spin" /> Deploying…</> :
                         <><Bot className="h-4 w-4" /> Deploy &amp; Start Bot</>}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
