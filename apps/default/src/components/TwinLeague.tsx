import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  BrainCircuit, Swords, ShieldAlert, Zap, Trophy, Timer,
  ChevronRight, Activity, Users, Sparkles, TrendingUp,
  TrendingDown, Minus, Loader2, RefreshCcw, CheckCircle2,
  AlertCircle, Target, Flame,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { simulateMatch, SimulatedMatchResult, MatchOpponent } from '@/lib/simulateMatch';
import { useTradingStore } from '@/lib/tradingStore';
import { useSubscriptionAccess } from '@/hooks/useSubscriptionAccess';
import { toast } from 'sonner';
import { TwinLeagueGuide } from './twinLeague/TwinLeagueGuide';

// ─── Countdown hook ──────────────────────────────────────────────────────────

function useCountdown(targetHour: number) {
  const getSecondsUntil = () => {
    const now = new Date();
    const target = new Date();
    target.setHours(targetHour, 0, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    return Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000));
  };
  const [seconds, setSeconds] = useState(getSecondsUntil);
  useEffect(() => {
    const id = setInterval(() => setSeconds(getSecondsUntil()), 1000);
    return () => clearInterval(id);
  }, [targetHour]);
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface MatchState {
  status: 'pending' | 'simulating' | 'done' | 'error';
  streamingText: string;
  result: SimulatedMatchResult | null;
  error: string | null;
}

const INITIAL_MATCHES: MatchOpponent[] = [
  { opponent: 'WhaleHunter_99',  rank: 142, stake: 500,  time: 'Today, 18:00 UTC' },
  { opponent: 'AlgoTrader_Pro',  rank: 89,  stake: 1000, time: 'Tomorrow, 12:00 UTC' },
  { opponent: 'Liquidator_Bot',  rank: 412, stake: 250,  time: 'Fri, 15:30 UTC' },
];

// ─── Sub-components ──────────────────────────────────────────────────────────

const OutcomeBadge = ({ outcome }: { outcome: 'win' | 'loss' | 'draw' }) => {
  const map = {
    win:  { label: 'VICTORY',   cls: 'bg-green-500/20 text-green-400 border-green-500/30', icon: CheckCircle2 },
    loss: { label: 'DEFEATED',  cls: 'bg-red-500/20 text-red-400 border-red-500/30',       icon: AlertCircle  },
    draw: { label: 'DRAW',      cls: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: Minus        },
  }[outcome];
  const Icon = map.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border', map.cls)}>
      <Icon className="h-3 w-3" /> {map.label}
    </span>
  );
};

const ScoreBar = ({ label, score, isYou }: { label: string; score: number; isYou: boolean }) => (
  <div className="space-y-1">
    <div className="flex justify-between text-xs text-muted-foreground">
      <span>{label}</span>
      <span className="font-mono font-semibold text-foreground">{score}</span>
    </div>
    <div className="h-1.5 bg-secondary/50 rounded-full overflow-hidden">
      <div
        className={cn(
          'h-full rounded-full transition-all duration-700',
          isYou ? 'bg-primary' : 'bg-red-500',
        )}
        style={{ width: `${score}%` }}
      />
    </div>
  </div>
);

// ─── Match Card ───────────────────────────────────────────────────────────────

interface MatchCardProps {
  match: MatchOpponent;
  twinName: string;
  matchState: MatchState;
  onSimulate: () => void;
}

function MatchCard({ match, twinName, matchState, onSimulate }: MatchCardProps) {
  const { status, result, error, streamingText } = matchState;
  const isPending    = status === 'pending';
  const isSimulating = status === 'simulating';
  const isDone       = status === 'done';
  const isError      = status === 'error';

  return (
    <div
      className={cn(
        'group relative overflow-hidden border rounded-xl p-4 transition-all duration-300',
        isDone && result?.outcome === 'win'  && 'bg-green-500/5 border-green-500/20',
        isDone && result?.outcome === 'loss' && 'bg-red-500/5 border-red-500/20',
        isDone && result?.outcome === 'draw' && 'bg-amber-500/5 border-amber-500/20',
        isSimulating && 'bg-primary/5 border-primary/20 animate-pulse-border',
        isPending && 'bg-secondary/30 border-border hover:border-primary/20 hover:bg-secondary/30',
        isError && 'bg-red-500/5 border-red-500/20',
      )}
    >
      {/* Shimmer overlay when simulating */}
      {isSimulating && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent -translate-x-full animate-[shimmer_1.8s_ease-in-out_infinite] pointer-events-none" />
      )}

      {/* VS row */}
      <div className="flex items-center justify-between relative z-10">
        {/* Your twin */}
        <div className="flex items-center gap-3 w-[38%]">
          <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-blue-600 to-purple-600 border-2 border-card flex items-center justify-center shadow-lg flex-shrink-0">
            <BrainCircuit className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{twinName}</p>
            <p className="text-xs text-muted-foreground">Your Twin</p>
          </div>
        </div>

        {/* Centre VS / outcome */}
        <div className="flex flex-col items-center justify-center px-2">
          {isDone && result ? (
            <OutcomeBadge outcome={result.outcome} />
          ) : (
            <span className="text-xs font-bold text-red-400 bg-red-400/10 px-2.5 py-1 rounded-full">VS</span>
          )}
          <span className="text-[10px] text-muted-foreground font-mono mt-1">{match.time}</span>
        </div>

        {/* Opponent */}
        <div className="flex items-center justify-end gap-3 w-[38%]">
          <div className="text-right min-w-0">
            <p className="font-semibold text-sm truncate text-foreground/80">{match.opponent}</p>
            <p className="text-xs text-muted-foreground">Rank #{match.rank}</p>
          </div>
          <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-red-600 to-orange-600 border-2 border-card flex items-center justify-center shadow-lg flex-shrink-0">
            <Users className="h-5 w-5 text-primary-foreground" />
          </div>
        </div>
      </div>

      {/* Score bars — shown after simulation */}
      {isDone && result && (
        <div className="mt-4 space-y-2 border-t border-border pt-3">
          <ScoreBar label={twinName} score={result.yourScore}     isYou={true}  />
          <ScoreBar label={match.opponent} score={result.opponentScore} isYou={false} />
        </div>
      )}

      {/* Streaming progress text */}
      {isSimulating && streamingText && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-xs text-primary/70 font-mono leading-relaxed line-clamp-2 italic">
            {streamingText}<span className="animate-pulse">▌</span>
          </p>
        </div>
      )}

      {/* Narrative + key factor */}
      {isDone && result && (
        <div className="mt-3 pt-3 border-t border-border space-y-2">
          <p className="text-xs text-muted-foreground leading-relaxed italic">
            "{result.narrative}"
          </p>
          <div className="flex items-center gap-1.5 text-xs">
            <Target className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
            <span className="text-amber-400 font-medium">Key factor:</span>
            <span className="text-muted-foreground">{result.keyFactor}</span>
          </div>
        </div>
      )}

      {/* Error state */}
      {isError && error && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Bottom bar */}
      <div className="mt-4 pt-3 border-t border-border flex justify-between items-center text-sm">
        {/* Prize / P&L */}
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-500 flex-shrink-0" />
          {isDone && result ? (
            <div className="flex items-center gap-3">
              <span className={cn(
                'font-bold text-sm',
                result.outcome === 'win' ? 'text-green-400' : result.outcome === 'loss' ? 'text-red-400' : 'text-amber-400',
              )}>
                {result.prizeEarned > 0 ? `+${result.prizeEarned}` : result.prizeEarned} CP
              </span>
              <span className={cn(
                'font-mono text-xs',
                result.pnl >= 0 ? 'text-green-400' : 'text-red-400',
              )}>
                {result.pnl >= 0 ? '+' : ''}{result.pnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
              </span>
            </div>
          ) : (
            <span className="font-bold text-amber-500">{match.stake * 2} CP Prize Pool</span>
          )}
        </div>

        {/* Action */}
        {isPending && (
          <button
            onClick={onSimulate}
            className="flex items-center gap-1.5 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 px-3 py-1.5 rounded-lg transition-all hover:scale-105 active:scale-95"
          >
            <Sparkles className="h-3.5 w-3.5" /> Simulate
          </button>
        )}

        {isSimulating && (
          <span className="flex items-center gap-1.5 text-xs text-primary/70">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Running AI...
          </span>
        )}

        {isDone && (
          <button
            onClick={onSimulate}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCcw className="h-3.5 w-3.5" /> Re-simulate
          </button>
        )}

        {isError && (
          <button
            onClick={onSimulate}
            className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            <RefreshCcw className="h-3.5 w-3.5" /> Retry
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function TwinLeague() {
  const { hasAccess: canSimulate } = useSubscriptionAccess('pro');
  const [twinName, setTwinName]           = useState('Quantum_Strider_v1');
  const [riskTolerance, setRiskTolerance] = useState(60);
  const [isTraining, setIsTraining]       = useState(false);
  const [trainingDone, setTrainingDone]   = useState(false);
  const countdown = useCountdown(18);

  // Live trade count from the global store — fixes P2-E
  const tradeCount = useTradingStore(s => s.history.length);

  const [matchStates, setMatchStates] = useState<MatchState[]>(
    INITIAL_MATCHES.map(() => ({ status: 'pending', streamingText: '', result: null, error: null })),
  );

  // Ref that always reflects the latest matchStates — fixes stale closure in handleSimulateAll (P2-C)
  const matchStatesRef = useRef(matchStates);
  useEffect(() => { matchStatesRef.current = matchStates; }, [matchStates]);

  // Derived live stats from completed simulations
  const completedResults = matchStates
    .filter(m => m.status === 'done' && m.result)
    .map(m => m.result!);

  const wins     = completedResults.filter(r => r.outcome === 'win').length;
  const losses   = completedResults.filter(r => r.outcome === 'loss').length;
  const totalPnl = completedResults.reduce((acc, r) => acc + r.pnl, 0);
  const winRate  = completedResults.length > 0 ? Math.round((wins / completedResults.length) * 100) : null;

  const updateMatchState = useCallback((index: number, patch: Partial<MatchState>) => {
    setMatchStates(prev =>
      prev.map((m, i) => (i === index ? { ...m, ...patch } : m)),
    );
  }, []);

  const handleSimulate = useCallback(async (index: number) => {
    if (!canSimulate) {
      toast('Twin League requires Pro subscription.', {
        description: 'Upgrade to unlock AI competitions.',
        action: { label: 'Upgrade', onClick: () => window.location.href = '/subscription?plan=pro' },
        duration: 6000,
      });
      return;
    }
    const match = INITIAL_MATCHES[index];

    updateMatchState(index, {
      status: 'simulating',
      streamingText: '',
      result: null,
      error: null,
    });

    try {
      const result = await simulateMatch(
        twinName,
        riskTolerance,
        match,
        // P2-D: only the functional state update — ghost intermediate call removed
        (_delta) => {
          setMatchStates(prev =>
            prev.map((m, i) =>
              i === index
                ? { ...m, streamingText: m.streamingText + _delta }
                : m,
            ),
          );
        },
      );

      updateMatchState(index, { status: 'done', result, streamingText: '' });
    } catch (err) {
      updateMatchState(index, {
        status: 'error',
        error: err instanceof Error ? err.message : 'Simulation failed',
        streamingText: '',
      });
    }
  }, [twinName, riskTolerance, updateMatchState]);

  const handleSimulateAll = useCallback(async () => {
    // P2-C: read from ref — never stale, even after earlier awaits resolve
    for (let i = 0; i < INITIAL_MATCHES.length; i++) {
      const st = matchStatesRef.current[i].status;
      if (st === 'pending' || st === 'error') {
        await handleSimulate(i);
      }
    }
  }, [handleSimulate]);

  const handleTraining = useCallback(async () => {
    setIsTraining(true);
    setTrainingDone(false);
    // Reset all match results so fresh simulations use the new weights
    setMatchStates(INITIAL_MATCHES.map(() => ({ status: 'pending', streamingText: '', result: null, error: null })));
    await new Promise(r => setTimeout(r, 2200));
    setIsTraining(false);
    setTrainingDone(true);
    setTimeout(() => setTrainingDone(false), 3000);
  }, []);

  const anySimulating = matchStates.some(m => m.status === 'simulating');
  const allDone       = matchStates.every(m => m.status === 'done');

  // Show guide on first visit
  const [showGuide, setShowGuide] = useState(() => {
    try { return !localStorage.getItem('cv_twin_guide_dismissed'); } catch { return true; }
  });

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-24">

      {/* Header banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card border border-border rounded-2xl p-6 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-primary/20 blur-3xl rounded-full pointer-events-none" />
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <BrainCircuit className="h-6 w-6 text-primary" />
            Twin League{' '}
            <span className="text-xs px-2 py-1 bg-primary/20 text-primary rounded-md font-medium ml-2">
              SEASON 4
            </span>
            <span className="text-[10px] px-2 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-md font-medium">
              🧪 Demo Data
            </span>
          </h2>
          <p className="text-muted-foreground mt-1 max-w-xl text-sm">
            Configure your AI Twin and simulate matches against opponents. Each simulation is run
            live by the CryptoVerse HQ engine using your Twin's weighted parameters.
          </p>
        </div>
        <div className="flex items-center gap-3 bg-secondary/50 border border-border px-4 py-2 rounded-xl backdrop-blur-md">
          <Timer className="h-5 w-5 text-amber-500" />
          <div className="text-sm">
            <p className="text-muted-foreground text-xs">Next Match In</p>
            <p className="font-mono font-bold">{countdown}</p>
          </div>
        </div>
      </div>

      {/* Beginner's Guide */}
      {showGuide && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-500">
          <TwinLeagueGuide onDismiss={() => {
            try { localStorage.setItem('cv_twin_guide_dismissed', 'true'); } catch {}
            setShowGuide(false);
          }} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Left column: config + stats ── */}
        <div className="lg:col-span-1 space-y-5">

          {/* Twin Configuration */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-lg">
            <h3 className="text-base font-semibold mb-5 flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              Twin Configuration
            </h3>

            <div className="space-y-5">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Twin Designation</label>
                <input
                  type="text"
                  value={twinName}
                  onChange={e => setTwinName(e.target.value)}
                  disabled={isTraining || anySimulating}
                  className="w-full bg-secondary/30 border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-primary transition-all font-mono text-sm disabled:opacity-50"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <label className="text-muted-foreground">Aggression / Risk Tolerance</label>
                  <span className="font-mono text-primary font-semibold">{riskTolerance}%</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={riskTolerance}
                  onChange={e => setRiskTolerance(Number(e.target.value))}
                  disabled={isTraining || anySimulating}
                  className="w-full accent-primary disabled:opacity-50"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                  <span>Conservative</span>
                  <span>Balanced</span>
                  <span>Degen</span>
                </div>
              </div>

              <div className="pt-4 border-t border-border">
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-muted-foreground">Base Model:</span>
                  <span className="font-medium">Taskade-o1-Mini</span>
                </div>
                <div className="flex justify-between text-sm mb-4">
                  <span className="text-muted-foreground">Training Data:</span>
                  <span className="font-medium text-green-400">{tradeCount} Trades Sync'd</span>
                </div>

                <button
                  onClick={handleTraining}
                  disabled={isTraining || anySimulating}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-2.5 rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-60 disabled:pointer-events-none text-sm"
                >
                  {isTraining ? (
                    <><Activity className="h-4 w-4 animate-pulse" /> Syncing Weights...</>
                  ) : trainingDone ? (
                    <><CheckCircle2 className="h-4 w-4 text-green-300" /> Weights Updated!</>
                  ) : (
                    <><BrainCircuit className="h-4 w-4" /> Update Twin Weights</>
                  )}
                </button>

                {trainingDone && (
                  <p className="text-xs text-center text-green-400 mt-2 animate-in fade-in duration-300">
                    Matches reset — simulate with new weights below
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Performance Stats — update live */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-lg">
            <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-blue-400" />
              Performance Stats
            </h3>
            <div className="space-y-3">
              {/* Win Rate */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/30">
                <span className="text-sm text-muted-foreground">Win Rate</span>
                {winRate !== null ? (
                  <span className={cn('font-bold text-sm', winRate >= 50 ? 'text-green-400' : 'text-red-400')}>
                    {winRate}%
                  </span>
                ) : (
                  <span className="text-muted-foreground text-xs italic">Simulate to reveal</span>
                )}
              </div>

              {/* W / L record */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/30">
                <span className="text-sm text-muted-foreground">Record (W / L)</span>
                {completedResults.length > 0 ? (
                  <span className="font-bold text-sm">
                    <span className="text-green-400">{wins}W</span>
                    {' / '}
                    <span className="text-red-400">{losses}L</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground text-xs italic">—</span>
                )}
              </div>

              {/* Total P&L */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/30">
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  {totalPnl >= 0
                    ? <TrendingUp className="h-3.5 w-3.5 text-green-400" />
                    : <TrendingDown className="h-3.5 w-3.5 text-red-400" />}
                  Session P&amp;L
                </span>
                {completedResults.length > 0 ? (
                  <span className={cn('font-bold font-mono text-sm', totalPnl >= 0 ? 'text-green-400' : 'text-red-400')}>
                    {totalPnl >= 0 ? '+' : ''}{totalPnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                ) : (
                  <span className="text-muted-foreground text-xs italic">—</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Right column: matches ── */}
        <div className="lg:col-span-2">
          <div className="bg-card border border-border rounded-2xl p-6 shadow-lg flex flex-col">

            {/* Panel header */}
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-base font-semibold flex items-center gap-2">
                <Swords className="h-4 w-4 text-red-400" />
                {allDone ? 'Match Results' : 'Upcoming Matches'}
              </h3>
              <button
                onClick={handleSimulateAll}
                disabled={anySimulating || allDone}
                className={cn(
                  'flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all border',
                  anySimulating || allDone
                    ? 'opacity-40 pointer-events-none border-border text-muted-foreground'
                    : 'text-primary bg-primary/10 hover:bg-primary/20 border-primary/20 hover:scale-105 active:scale-95',
                )}
              >
                {anySimulating
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Simulating...</>
                  : allDone
                    ? <><CheckCircle2 className="h-3.5 w-3.5" /> All Done</>
                    : <><Flame className="h-3.5 w-3.5" /> Simulate All</>}
              </button>
            </div>

            {/* Match cards */}
            <div className="space-y-4 flex-1">
              {INITIAL_MATCHES.map((match, i) => (
                <MatchCard
                  key={match.opponent}
                  match={match}
                  twinName={twinName}
                  matchState={matchStates[i]}
                  onSimulate={() => handleSimulate(i)}
                />
              ))}
            </div>

            {/* Footer info */}
            <div className={cn(
              'mt-6 p-4 rounded-xl border flex gap-3 transition-colors duration-500',
              allDone
                ? 'bg-green-500/10 border-green-500/20'
                : 'bg-primary/10 border-primary/20',
            )}>
              <Activity className={cn('h-4 w-4 flex-shrink-0 mt-0.5', allDone ? 'text-green-400' : 'text-primary')} />
              <p className={cn('text-xs', allDone ? 'text-green-400/90' : 'text-primary/90')}>
                {allDone
                  ? `Season simulation complete. ${wins} win${wins !== 1 ? 's' : ''} recorded. Results sync to the Global Leaderboard at next cycle.`
                  : 'Each match is simulated live by the CryptoVerse HQ engine using your Twin\'s risk parameters and market conditions. Hit Simulate per match or Simulate All.'}
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
