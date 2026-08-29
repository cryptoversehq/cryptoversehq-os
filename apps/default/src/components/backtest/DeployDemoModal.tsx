/**
 * DeployDemoModal.tsx — Part 9.2
 *
 * Two-mode modal:
 *   Mode A: "Deploy to Demo" — activates the backtested strategy config
 *           in the live demo trading engine (simulated — shows toast confirmation)
 *   Mode B: "Create Bot" — generates an automated bot from the strategy
 *           parameters, persisted to localStorage for the Bots page
 *
 * Since we don't have a full live trading engine here, both actions are
 * simulated with realistic UI feedback and localStorage persistence.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Rocket, Bot, CheckCircle2, Zap, AlertTriangle,
  ArrowRight, Settings2, Clock, DollarSign, Activity,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../lib/authStore';
import type { EnrichedBacktestOutput } from '../../lib/backtestRunner';
import type { BacktestConfig } from './BacktestConfigPanel';

// ─────────────────────────────────────────────────────────────────────────────
// BOT PERSISTENCE
// ─────────────────────────────────────────────────────────────────────────────

interface BotRecord {
  id:           string;
  userId:       string;
  name:         string;
  strategyType: string;
  symbol:       string;
  timeframe:    string;
  config:       Record<string, unknown>;
  metrics:      { totalReturn: number; winRate: number; sharpeRatio: number };
  createdAt:    string;
  status:       'active' | 'paused';
  mode:         'demo' | 'live';
}

function saveBotRecord(bot: BotRecord) {
  const key  = 'cryptoverse_bots_v1';
  const bots: BotRecord[] = JSON.parse(localStorage.getItem(key) || '[]');
  bots.unshift(bot);
  if (bots.length > 20) bots.pop();
  localStorage.setItem(key, JSON.stringify(bots));
}

// ─────────────────────────────────────────────────────────────────────────────
// MODE SELECTOR TAB
// ─────────────────────────────────────────────────────────────────────────────

type Mode = 'demo' | 'bot';

// ─────────────────────────────────────────────────────────────────────────────
// PROPS
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  open:           boolean;
  onClose:        () => void;
  enrichedResult: EnrichedBacktestOutput;
  config:         BacktestConfig;
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL
// ─────────────────────────────────────────────────────────────────────────────

export function DeployDemoModal({ open, onClose, enrichedResult, config }: Props) {
  const { user }    = useAuthStore();
  const [mode,      setMode]      = useState<Mode>('demo');
  const [botName,   setBotName]   = useState(`${config.strategyType} Bot — ${config.params.symbol}`);
  const [deploying, setDeploying] = useState(false);
  const [done,      setDone]      = useState(false);
  const [doneMode,  setDoneMode]  = useState<Mode>('demo');

  const m = enrichedResult.metrics;

  const handleDeploy = async () => {
    setDeploying(true);
    await new Promise(r => setTimeout(r, 900)); // realistic delay

    if (mode === 'bot') {
      const bot: BotRecord = {
        id:           `bot-${Date.now()}`,
        userId:       user?.id ?? 'anon',
        name:         botName.trim() || `${config.strategyType} Bot`,
        strategyType: config.strategyType,
        symbol:       config.params.symbol,
        timeframe:    config.params.timeframe,
        config:       config.params.strategyConfig ?? {},
        metrics:      { totalReturn: m.totalReturn, winRate: m.winRate, sharpeRatio: m.sharpeRatio },
        createdAt:    new Date().toISOString(),
        status:       'active',
        mode:         'demo',
      };
      saveBotRecord(bot);
      toast.success('Bot created!', {
        description: `${bot.name} is now running in demo mode.`,
        icon: '🤖',
      });
    } else {
      toast.success('Strategy deployed to Demo!', {
        description: `${config.strategyType} strategy is now active on ${config.params.symbol} ${config.params.timeframe}.`,
        icon: '🚀',
      });
    }

    setDoneMode(mode);
    setDone(true);
    setDeploying(false);
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          className="relative w-full max-w-md bg-card border border-white/10 rounded-2xl overflow-hidden shadow-2xl z-10"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                {mode === 'demo' ? <Rocket className="h-4 w-4 text-green-400" /> : <Bot className="h-4 w-4 text-green-400" />}
              </div>
              <div>
                <h2 className="text-sm font-bold text-foreground">Deploy Strategy</h2>
                <p className="text-xs text-muted-foreground">Demo environment · No real funds</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-5 space-y-5">
            {done ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center gap-4 py-6 text-center"
              >
                <div className="w-14 h-14 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                  <CheckCircle2 className="h-7 w-7 text-green-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">
                    {doneMode === 'bot' ? 'Bot Created!' : 'Strategy Deployed!'}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                    {doneMode === 'bot'
                      ? 'Your bot is now running in demo mode. Monitor it in the Bots dashboard.'
                      : 'Your strategy is now active in the demo trading engine.'}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-3 w-full">
                  {[
                    { label: 'Return', value: `${m.totalReturn >= 0 ? '+' : ''}${m.totalReturn.toFixed(1)}%` },
                    { label: 'Win Rate', value: `${m.winRate.toFixed(1)}%` },
                    { label: 'Sharpe', value: m.sharpeRatio.toFixed(2) },
                  ].map(({ label, value }) => (
                    <div key={label} className="text-center p-2.5 rounded-xl bg-secondary/20 border border-white/5">
                      <p className="text-[9px] text-muted-foreground/60 uppercase">{label}</p>
                      <p className="text-sm font-bold text-foreground mt-0.5">{value}</p>
                    </div>
                  ))}
                </div>
                <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all">
                  Close
                </button>
              </motion.div>
            ) : (
              <>
                {/* Mode tabs */}
                <div className="grid grid-cols-2 gap-2 p-1 bg-secondary/20 rounded-xl">
                  {([
                    { key: 'demo' as Mode, icon: Rocket, label: 'Deploy to Demo', desc: 'Use in live demo session' },
                    { key: 'bot'  as Mode, icon: Bot,    label: 'Create Bot',     desc: 'Automated 24/7 execution' },
                  ] as const).map(({ key, icon: Icon, label, desc }) => (
                    <button
                      key={key}
                      onClick={() => setMode(key)}
                      className={cn(
                        'flex flex-col items-center gap-1 py-3 px-2 rounded-xl text-center transition-all',
                        mode === key
                          ? 'bg-card border border-white/10 text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <Icon className={cn('h-5 w-5', mode === key ? 'text-green-400' : 'text-muted-foreground')} />
                      <span className="text-xs font-semibold">{label}</span>
                      <span className="text-[10px] text-muted-foreground/60">{desc}</span>
                    </button>
                  ))}
                </div>

                {/* Strategy summary */}
                <div className="p-3.5 rounded-xl bg-secondary/20 border border-white/5 space-y-2">
                  <p className="text-xs font-semibold text-foreground">Strategy Summary</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {[
                      ['Type', config.strategyType],
                      ['Symbol', config.params.symbol],
                      ['Timeframe', config.params.timeframe],
                      ['Return', `${m.totalReturn >= 0 ? '+' : ''}${m.totalReturn.toFixed(2)}%`],
                    ].map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between">
                        <span className="text-muted-foreground">{k}</span>
                        <span className="font-medium text-foreground">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bot name (only for bot mode) */}
                {mode === 'bot' && (
                  <div>
                    <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Bot Name</label>
                    <input
                      value={botName}
                      onChange={e => setBotName(e.target.value)}
                      placeholder="My Strategy Bot"
                      className="w-full bg-secondary/30 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                    />
                  </div>
                )}

                {/* Demo warning */}
                <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/8 border border-amber-500/15">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-400/80">
                    This deploys to the <strong>demo environment only</strong>. No real funds are involved.
                  </p>
                </div>

                {/* Action */}
                <button
                  onClick={handleDeploy}
                  disabled={deploying}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-green-500/15 border border-green-500/25 text-green-400 font-bold text-sm hover:bg-green-500/25 disabled:opacity-60 transition-all"
                >
                  {deploying
                    ? <><Activity className="h-4 w-4 animate-pulse" /> Deploying…</>
                    : mode === 'demo'
                      ? <><Rocket className="h-4 w-4" /> Deploy to Demo</>
                      : <><Bot className="h-4 w-4" /> Create Bot</>}
                </button>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
