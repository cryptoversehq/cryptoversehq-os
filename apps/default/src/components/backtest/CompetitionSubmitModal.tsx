/**
 * CompetitionSubmitModal.tsx — Part 9.4
 *
 * Lets users submit a completed backtest to active Strategy Competitions.
 *
 * Features:
 *   - Lists all active competitions (seeded + any user submissions)
 *   - Shows the current strategy leaderboard per competition
 *   - User can enter their strategy with one click
 *   - Entry is persisted to localStorage so other sessions can see it
 *   - Basic ranking: sorted by the competition's objective metric
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Swords, Trophy, Medal, CheckCircle2, Loader2,
  ChevronRight, TrendingUp, Users, Calendar, Star,
  Crown,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../lib/authStore';
import type { EnrichedBacktestOutput } from '../../lib/backtestRunner';
import type { BacktestConfig } from './BacktestConfigPanel';

// ─────────────────────────────────────────────────────────────────────────────
// COMPETITION TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface Competition {
  id:        string;
  name:      string;
  desc:      string;
  objective: 'sharpeRatio' | 'totalReturn' | 'winRate';
  objLabel:  string;
  endsAt:    string; // ISO
  prize:     string;
  entries:   number;
}

interface CompetitionEntry {
  competitionId: string;
  userId:        string;
  userName:      string;
  strategyName:  string;
  strategyType:  string;
  symbol:        string;
  score:         number;        // the objective metric value
  totalReturn:   number;
  winRate:       number;
  sharpeRatio:   number;
  submittedAt:   string;
}

// ─────────────────────────────────────────────────────────────────────────────
// SEED DATA
// ─────────────────────────────────────────────────────────────────────────────

const now = new Date();
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000).toISOString();

const SEED_COMPETITIONS: Competition[] = [
  {
    id:        'comp_sharpe_monthly',
    name:      '⚡ Monthly Sharpe Challenge',
    desc:      'Best risk-adjusted return wins. Sharpe Ratio is king.',
    objective: 'sharpeRatio',
    objLabel:  'Sharpe Ratio',
    endsAt:    addDays(now, 12),
    prize:     '5,000 CP Coins',
    entries:   142,
  },
  {
    id:        'comp_return_weekly',
    name:      '📈 Weekly Return Sprint',
    desc:      'Highest total return in 7 days — pure alpha.',
    objective: 'totalReturn',
    objLabel:  'Total Return %',
    endsAt:    addDays(now, 4),
    prize:     '2,000 CP Coins',
    entries:   67,
  },
  {
    id:        'comp_winrate_btc',
    name:      '🎯 BTC Win Rate Masters',
    desc:      'Highest win rate on BTC/USDT strategies only.',
    objective: 'winRate',
    objLabel:  'Win Rate %',
    endsAt:    addDays(now, 21),
    prize:     '3,500 CP Coins',
    entries:   89,
  },
];

const SEED_ENTRIES: CompetitionEntry[] = [
  { competitionId: 'comp_sharpe_monthly', userId: 'u1', userName: 'QuantEdge', strategyName: 'BTC Grid Master', strategyType: 'grid', symbol: 'BTC/USDT', score: 2.41, totalReturn: 38.2, winRate: 71.4, sharpeRatio: 2.41, submittedAt: addDays(now, -3) },
  { competitionId: 'comp_sharpe_monthly', userId: 'u2', userName: 'AlgoWave',  strategyName: 'ETH Momentum',   strategyType: 'custom', symbol: 'ETH/USDT', score: 1.98, totalReturn: 29.1, winRate: 65.8, sharpeRatio: 1.98, submittedAt: addDays(now, -1) },
  { competitionId: 'comp_return_weekly',  userId: 'u3', userName: 'MomentumAI', strategyName: 'Trend Rider',   strategyType: 'custom', symbol: 'SOL/USDT', score: 61.3, totalReturn: 61.3, winRate: 58.2, sharpeRatio: 1.44, submittedAt: addDays(now, -2) },
  { competitionId: 'comp_return_weekly',  userId: 'u4', userName: 'RiskMatrix', strategyName: 'ARB Scanner',   strategyType: 'arbitrage', symbol: 'BTC/USDT', score: 48.7, totalReturn: 48.7, winRate: 80.1, sharpeRatio: 2.12, submittedAt: addDays(now, -1) },
  { competitionId: 'comp_winrate_btc',    userId: 'u5', userName: 'CryptoAlpha', strategyName: 'DCA Diamond',  strategyType: 'dca', symbol: 'BTC/USDT', score: 78.9, totalReturn: 22.1, winRate: 78.9, sharpeRatio: 1.65, submittedAt: addDays(now, -5) },
];

const STORAGE_KEY = 'cryptoverse_competition_entries_v1';

function loadUserEntries(): CompetitionEntry[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

function saveUserEntry(entry: CompetitionEntry) {
  const entries = loadUserEntries();
  entries.unshift(entry);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, 50)));
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

function rankIcon(i: number) {
  if (i === 0) return <Crown className="h-4 w-4 text-amber-400" />;
  if (i === 1) return <Medal className="h-4 w-4 text-slate-300" />;
  if (i === 2) return <Medal className="h-4 w-4 text-amber-700" />;
  return <span className="text-xs font-bold text-muted-foreground w-4 text-center">{i + 1}</span>;
}

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

export function CompetitionSubmitModal({ open, onClose, enrichedResult, config }: Props) {
  const { user }                         = useAuthStore();
  const [selectedComp, setSelectedComp]  = useState<string | null>(null);
  const [submitting,   setSubmitting]    = useState(false);
  const [userEntries,  setUserEntries]   = useState<CompetitionEntry[]>([]);

  useEffect(() => { if (open) setUserEntries(loadUserEntries()); }, [open]);

  const m = enrichedResult.metrics;

  const allEntries = useMemo(() => [...SEED_ENTRIES, ...userEntries], [userEntries]);

  const getLeaderboard = useCallback((compId: string, objective: Competition['objective']) => {
    return allEntries
      .filter(e => e.competitionId === compId)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [allEntries]);

  const alreadyEntered = useCallback((compId: string) => {
    return userEntries.some(e => e.competitionId === compId && e.userId === user?.id);
  }, [userEntries, user?.id]);

  const handleSubmit = useCallback(async (comp: Competition) => {
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 700));

    const score = comp.objective === 'sharpeRatio' ? m.sharpeRatio
                : comp.objective === 'winRate'      ? m.winRate
                : m.totalReturn;

    const entry: CompetitionEntry = {
      competitionId: comp.id,
      userId:        user?.id ?? 'anon',
      userName:      user?.username ?? 'You',
      strategyName:  config.strategyName?.trim() || `${config.strategyType} on ${config.params.symbol}`,
      strategyType:  config.strategyType,
      symbol:        config.params.symbol,
      score,
      totalReturn:   m.totalReturn,
      winRate:       m.winRate,
      sharpeRatio:   m.sharpeRatio,
      submittedAt:   new Date().toISOString(),
    };

    saveUserEntry(entry);
    setUserEntries(loadUserEntries());
    setSubmitting(false);

    toast.success(`Entered: ${comp.name}!`, {
      description: `Your strategy scored ${score.toFixed(2)} on ${comp.objLabel}.`,
      icon: '🏅',
    });
  }, [m, config, user]);

  if (!open) return null;

  const comp = selectedComp ? SEED_COMPETITIONS.find(c => c.id === selectedComp) ?? null : null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          className="relative w-full max-w-lg bg-card border border-white/10 rounded-2xl overflow-hidden shadow-2xl max-h-[88vh] flex flex-col z-10"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <Swords className="h-4 w-4 text-amber-400" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-foreground">
                  {comp ? comp.name : 'Strategy Competitions'}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {comp ? 'Leaderboard' : 'Submit your strategy to active contests'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {comp && (
                <button
                  onClick={() => setSelectedComp(null)}
                  className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground bg-secondary/30 transition-colors"
                >
                  ← Back
                </button>
              )}
              <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {!comp ? (
              /* Competition list */
              <>
                {/* Your strategy metrics */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Sharpe', value: m.sharpeRatio.toFixed(2) },
                    { label: 'Return', value: `${m.totalReturn >= 0 ? '+' : ''}${m.totalReturn.toFixed(1)}%` },
                    { label: 'Win Rate', value: `${m.winRate.toFixed(1)}%` },
                  ].map(({ label, value }) => (
                    <div key={label} className="text-center p-2 rounded-xl bg-secondary/20 border border-white/5">
                      <p className="text-[9px] text-muted-foreground/60 uppercase">{label}</p>
                      <p className="text-sm font-bold text-foreground mt-0.5">{value}</p>
                    </div>
                  ))}
                </div>

                {SEED_COMPETITIONS.map(comp => {
                  const entered    = alreadyEntered(comp.id);
                  const board      = getLeaderboard(comp.id, comp.objective);
                  const myScore    = comp.objective === 'sharpeRatio' ? m.sharpeRatio : comp.objective === 'winRate' ? m.winRate : m.totalReturn;
                  const myRank     = board.filter(e => e.score > myScore).length + 1;

                  return (
                    <div key={comp.id} className="rounded-2xl border border-white/8 bg-secondary/10 overflow-hidden hover:border-amber-500/20 transition-all">
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <h3 className="text-sm font-bold text-foreground">{comp.name}</h3>
                            <p className="text-xs text-muted-foreground mt-0.5">{comp.desc}</p>
                          </div>
                          {entered
                            ? <span className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-green-500/10 border border-green-500/20 text-green-400">
                                <CheckCircle2 className="h-3 w-3" /> Entered
                              </span>
                            : <button
                                onClick={() => handleSubmit(comp)}
                                disabled={submitting}
                                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 disabled:opacity-60 transition-all"
                              >
                                {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Swords className="h-3 w-3" />}
                                Enter
                              </button>}
                        </div>

                        <div className="flex items-center gap-3 mt-3 flex-wrap text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{daysUntil(comp.endsAt)}d left</span>
                          <span className="flex items-center gap-1"><Users className="h-3 w-3" />{comp.entries + userEntries.filter(e => e.competitionId === comp.id).length} entries</span>
                          <span className="flex items-center gap-1"><Trophy className="h-3 w-3 text-amber-400" />{comp.prize}</span>
                          <span className="text-primary font-medium">Your rank: #{myRank}</span>
                        </div>
                      </div>

                      {/* Mini leaderboard */}
                      <div className="border-t border-white/5 px-4 py-2 space-y-1">
                        {board.slice(0, 3).map((e, i) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              {rankIcon(i)}
                              <span className={cn('font-medium', e.userId === user?.id ? 'text-primary' : 'text-foreground')}>
                                {e.userName}
                              </span>
                              <span className="text-muted-foreground/60">{e.strategyType}</span>
                            </div>
                            <span className="font-bold tabular-nums">{e.score.toFixed(2)}</span>
                          </div>
                        ))}
                        <button
                          onClick={() => setSelectedComp(comp.id)}
                          className="w-full text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors py-1 flex items-center justify-center gap-1"
                        >
                          View full leaderboard <ChevronRight className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </>
            ) : (
              /* Full leaderboard */
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/20 border border-white/5">
                  <Trophy className="h-4 w-4 text-amber-400" />
                  <div>
                    <p className="text-xs font-semibold text-foreground">{comp.prize}</p>
                    <p className="text-[10px] text-muted-foreground">{daysUntil(comp.endsAt)} days remaining</p>
                  </div>
                </div>

                {getLeaderboard(comp.id, comp.objective).map((e, i) => (
                  <div key={i} className={cn(
                    'flex items-center gap-3 p-3 rounded-xl border',
                    e.userId === user?.id
                      ? 'bg-primary/5 border-primary/20'
                      : i === 0 ? 'bg-amber-500/5 border-amber-500/15' : 'bg-secondary/10 border-white/5',
                  )}>
                    <div className="flex items-center justify-center w-6 shrink-0">{rankIcon(i)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-foreground truncate">{e.userName}</p>
                      <p className="text-[10px] text-muted-foreground">{e.strategyName} · {e.symbol}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-foreground tabular-nums">{e.score.toFixed(2)}</p>
                      <p className="text-[10px] text-muted-foreground">{comp.objLabel}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
