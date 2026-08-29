import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, Gamepad2, Trophy, Sparkles, PieChart, CheckCircle2, Clock,
  MessageCircle, Mic, Flame, Target, Zap, Shield, TrendingUp, Star,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'academy' as const, icon: BookOpen, label: 'Academy' },
  { id: 'simulator' as const, icon: Gamepad2, label: 'Simulator' },
  { id: 'competitions' as const, icon: Trophy, label: 'Competitions' },
  { id: 'lynx' as const, icon: Sparkles, label: 'Lynx AI' },
  { id: 'portfolio' as const, icon: PieChart, label: 'Portfolio' },
];

type TabId = (typeof TABS)[number]['id'];

function useCountdown() {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    const target = Date.now() + 2 * 3600_000 + 11 * 60_000 + 58_000;
    const tick = () => setRemaining(Math.max(0, target - Date.now()));
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, []);
  const h = Math.floor(remaining / 3600_000);
  const m = Math.floor((remaining % 3600_000) / 60_000);
  const s = Math.floor((remaining % 60_000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function ProgressBar({ pct, color = 'bg-primary' }: { pct: number; color?: string }) {
  return (
    <div className="h-2 rounded-full bg-muted/60 overflow-hidden">
      <motion.div
        className={cn('h-full rounded-full', color)}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
      />
    </div>
  );
}

function GlassCard({
  children, className, hover = false,
}: { children: React.ReactNode; className?: string; hover?: boolean }) {
  return (
    <motion.div
      whileHover={hover ? { scale: 1.01, y: -2 } : undefined}
      className={cn(
        'rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl',
        'shadow-[0_8px_32px_-8px_rgba(0,0,0,0.08)]',
        'dark:border-white/[0.04] dark:bg-white/[0.02] dark:shadow-[0_8px_32px_-8px_rgba(0,0,0,0.3)]',
        hover && 'cursor-pointer transition-shadow hover:shadow-[0_12px_40px_-8px_rgba(0,0,0,0.12)]',
        className,
      )}
    >
      {children}
    </motion.div>
  );
}

function Sparkline({
  values, color = 'hsl(var(--primary))', height = 32,
}: { values: number[]; color?: string; height?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 120;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${height - ((v - min) / range) * (height - 4) - 2}`)
    .join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full h-full" preserveAspectRatio="none">
      <polyline
        points={pts} fill="none" stroke={color}
        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

// ═══════ ACADEMY ═══════
function AcademyPanel() {
  const lessons = [
    { title: 'Risk Management Fundamentals', difficulty: 'Beginner', duration: '12 min', progress: 100 },
    { title: 'Support & Resistance Mastery', difficulty: 'Intermediate', duration: '18 min', progress: 100 },
    { title: 'Technical Indicators Deep Dive', difficulty: 'Intermediate', duration: '22 min', progress: 45 },
    { title: 'Candlestick Patterns', difficulty: 'Advanced', duration: '25 min', progress: 0 },
  ];
  const badges = ['🎯', '📊', '🛡️', '🔥'];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.6fr] gap-5">
      <div className="space-y-3">
        <GlassCard className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
              Learning Path
            </div>
            <span className="text-[10px] font-bold text-primary tabular-nums">82%</span>
          </div>
          <ProgressBar pct={82} />
          <div className="flex items-center gap-4 pt-0.5">
            <div className="flex items-center gap-1.5">
              <Flame className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-xs font-semibold text-foreground">7 day streak</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-xs font-semibold text-foreground">Daily goal 3/3</span>
            </div>
          </div>
        </GlassCard>

        <div className="grid grid-cols-2 gap-3">
          <GlassCard className="p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Learning XP</div>
            <div className="text-lg font-black text-violet-500 tabular-nums">1,240</div>
          </GlassCard>
          <GlassCard className="p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Next Lesson</div>
            <div className="text-xs font-bold text-amber-500">Tech. Indicators</div>
          </GlassCard>
        </div>

        <GlassCard className="p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2">
            Badges Earned
          </div>
          <div className="flex gap-2">
            {badges.map((b, i) => (
              <div
                key={i}
                className={cn(
                  'w-10 h-10 rounded-xl flex items-center justify-center text-lg transition-all hover:scale-110',
                  i < 3
                    ? 'bg-accent/15 ring-1 ring-accent/20'
                    : 'bg-muted/20 opacity-25',
                )}
              >
                {b}
              </div>
            ))}
            <div className="w-10 h-10 rounded-xl border border-dashed border-muted-foreground/20 flex items-center justify-center text-[10px] text-muted-foreground">
              +2
            </div>
          </div>
        </GlassCard>
      </div>

      <div className="space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold px-1 mb-1">
          Course Modules
        </div>
        {lessons.map((l) => {
          const done = l.progress === 100;
          const started = l.progress > 0;
          return (
            <motion.div
              key={l.title}
              whileHover={{ scale: 1.01, y: -1 }}
              className={cn(
                'flex items-center gap-4 p-3.5 rounded-xl border border-white/[0.04] bg-white/[0.02] backdrop-blur-sm transition-shadow',
                'hover:shadow-[0_8px_24px_-4px_rgba(0,0,0,0.1)]',
                done && 'opacity-70',
              )}
            >
              <div
                className={cn(
                  'shrink-0 w-9 h-9 rounded-lg flex items-center justify-center',
                  done
                    ? 'bg-emerald-500/10'
                    : started
                      ? 'bg-amber-500/10'
                      : 'bg-muted/30',
                )}
              >
                {done ? (
                  <CheckCircle2 className="h-[18px] w-[18px] text-emerald-500" />
                ) : started ? (
                  <Zap className="h-[18px] w-[18px] text-amber-500" />
                ) : (
                  <BookOpen className="h-[18px] w-[18px] text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-semibold text-foreground truncate block">
                  {l.title}
                </span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span
                    className={cn(
                      'text-[10px] font-medium',
                      l.difficulty === 'Beginner'
                        ? 'text-emerald-500'
                        : l.difficulty === 'Intermediate'
                          ? 'text-amber-500'
                          : 'text-red-500',
                    )}
                  >
                    {l.difficulty}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{l.duration}</span>
                  {started && !done && (
                    <span className="text-[10px] text-amber-500 font-medium">{l.progress}%</span>
                  )}
                </div>
              </div>
              <div className="shrink-0 w-12">
                <div className="h-1 rounded-full bg-muted/30 overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full',
                      done
                        ? 'bg-emerald-500'
                        : started
                          ? 'bg-amber-500'
                          : 'bg-muted/40',
                    )}
                    style={{ width: `${l.progress}%` }}
                  />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════ SIMULATOR ═══════
function SimulatorPanel() {
  const assets = [
    { symbol: 'BTC', amount: '0.85', value: '$56,200', alloc: 56, change: '+2.1', spark: [42, 44, 43, 47, 45, 48, 50, 49, 52, 54, 53, 56] },
    { symbol: 'ETH', amount: '12.4', value: '$28,400', alloc: 28, change: '+1.4', spark: [30, 31, 29, 32, 33, 31, 30, 32, 34, 33, 35, 34] },
    { symbol: 'SOL', amount: '85', value: '$9,350', alloc: 10, change: '-0.8', spark: [14, 15, 13, 12, 11, 13, 12, 10, 11, 9, 10, 9] },
  ];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-5">
      <div className="space-y-3">
        <GlassCard className="p-4">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-4">
            Practice Trade (Learning Mode)
          </div>
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-1">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Asset</label>
              <div className="flex items-center gap-2 mt-1 px-3 py-2 rounded-lg border border-white/[0.06] bg-white/[0.03]">
                <span className="text-sm font-bold text-foreground">BTC/USDT</span>
                <span className="text-[10px] text-emerald-500 font-medium">+2.1%</span>
              </div>
            </div>
            <div className="flex-1">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Amount</label>
              <div className="flex items-center gap-2 mt-1 px-3 py-2 rounded-lg border border-white/[0.06] bg-white/[0.03]">
                <span className="text-sm font-bold text-foreground tabular-nums">0.5</span>
                <span className="text-[10px] text-muted-foreground">BTC</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <Shield className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Risk Meter</span>
            <div className="flex-1 h-1.5 rounded-full bg-muted/40 overflow-hidden">
              <div className="h-full w-[25%] rounded-full bg-emerald-500" />
            </div>
            <span className="text-[10px] font-bold text-emerald-500">Low</span>
          </div>
          <div className="flex gap-2">
            <button className="flex-1 py-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-xs hover:bg-emerald-500/20 transition-all active:scale-[0.98]">
              Practice Buy
            </button>
            <button className="flex-1 py-2.5 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 font-bold text-xs hover:bg-red-500/20 transition-all active:scale-[0.98]">
              Practice Sell
            </button>
          </div>
        </GlassCard>

        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Balance', value: '$100K', accent: 'text-emerald-500' },
            { label: 'Open', value: '2 trades', accent: 'text-amber-500' },
            { label: 'PnL', value: '+8.3%', accent: 'text-emerald-500' },
          ].map((s) => (
            <GlassCard key={s.label} className="p-2.5 text-center">
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{s.label}</div>
              <div className={cn('text-xs font-black tabular-nums mt-0.5', s.accent)}>{s.value}</div>
            </GlassCard>
          ))}
        </div>
      </div>

      <div className="space-y-2.5">
        <GlassCard className="p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-3">
            Portfolio Summary
          </div>
          {assets.map((a) => (
            <div
              key={a.symbol}
              className="flex items-center gap-3 py-2.5 border-b border-white/[0.04] last:border-0"
            >
              <div className="w-8 h-8 rounded-lg bg-muted/30 flex items-center justify-center text-[10px] font-black text-foreground">
                {a.symbol.slice(0, 1)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">{a.symbol}</span>
                  <span className={cn('text-xs font-bold tabular-nums', parseFloat(a.change) >= 0 ? 'text-emerald-500' : 'text-red-500')}>
                    {parseFloat(a.change) >= 0 ? '+' : ''}{a.change}%
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-muted-foreground">{a.value}</span>
                  <span className="text-[10px] text-muted-foreground">{a.alloc}% alloc.</span>
                </div>
              </div>
              <div className="w-14 h-7">
                <Sparkline values={a.spark} color={parseFloat(a.change) >= 0 ? 'hsl(var(--emerald-500))' : 'hsl(var(--red-500))'} />
              </div>
            </div>
          ))}
        </GlassCard>

        <GlassCard className="p-3 flex items-center gap-3">
          <TrendingUp className="h-4 w-4 text-primary" />
          <div>
            <div className="text-[10px] font-bold text-foreground">Educational Market Analysis</div>
            <div className="text-[9px] text-muted-foreground mt-0.5">Learn how BTC is trending based on real patterns.</div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

// ═══════ COMPETITIONS ═══════
function CompetitionsPanel() {
  const countdown = useCountdown();
  const allLeaders = [
    { rank: 1, name: 'Sarah Chen', xp: '3,240' },
    { rank: 2, name: 'Ali Reza', xp: '2,980' },
    { rank: 3, name: 'David Kim', xp: '2,750' },
    { rank: 4, name: 'Maria Silva', xp: '2,410' },
    { rank: 5, name: 'Alex Park', xp: '2,180' },
    { rank: 6, name: 'Jamie Lee', xp: '2,050' },
    { rank: 7, name: 'Taylor Wu', xp: '1,940' },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-5">
      <div className="space-y-3">
        <GlassCard className="p-4 bg-gradient-to-br from-primary/[0.04] to-transparent">
          <div className="text-[10px] uppercase tracking-wider text-primary font-bold mb-1">
            Weekly Competition
          </div>
          <div className="text-[1.75rem] font-black text-foreground tabular-nums tracking-tight mb-2">
            {countdown}
          </div>
          <div className="text-xs text-muted-foreground">
            Starts in — join now to secure your spot!
          </div>
        </GlassCard>

        <div className="grid grid-cols-2 gap-3">
          <GlassCard className="p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Your Rank</div>
            <div className="text-xl font-black text-primary tabular-nums">#18</div>
          </GlassCard>
          <GlassCard className="p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Your XP</div>
            <div className="text-xl font-black text-violet-500 tabular-nums">1,840</div>
          </GlassCard>
        </div>

        <GlassCard className="p-3">
          <div className="flex items-center gap-2 mb-2">
            <Star className="h-4 w-4 text-amber-500" />
            <span className="text-[10px] font-bold text-foreground uppercase tracking-wider">Upcoming Rewards</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center ring-1 ring-amber-500/20">
              <Trophy className="h-5 w-5 text-amber-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-foreground">Competition Champion</div>
              <div className="text-[10px] text-muted-foreground">Top 10 earn XP bonus + exclusive badge</div>
            </div>
          </div>
        </GlassCard>
      </div>

      <div className="space-y-2">
        <GlassCard className="p-4">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-3">
            Leaderboard
          </div>
          <div className="space-y-0.5 max-h-[220px] overflow-y-auto overscroll-contain">
            {allLeaders.map((l) => {
              const trophy = l.rank === 1 ? '🥇' : l.rank === 2 ? '🥈' : l.rank === 3 ? '🥉' : '';
              return (
                <motion.div
                  key={l.rank}
                  whileHover={{ scale: 1.005 }}
                  className={cn(
                    'flex items-center gap-3 p-2.5 rounded-lg transition-colors',
                    l.rank <= 3 ? 'bg-accent/[0.04]' : '',
                  )}
                >
                  <span className="w-5 text-center font-bold text-xs tabular-nums text-muted-foreground">
                    {l.rank}
                  </span>
                  <span className="text-base w-5 text-center">{trophy}</span>
                  <span className="flex-1 text-sm font-semibold text-foreground">{l.name}</span>
                  <span className="text-xs font-bold text-muted-foreground tabular-nums">
                    {l.xp} XP
                  </span>
                </motion.div>
              );
            })}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

// ═══════ LYNX AI ═══════
function LynxPanel() {
  const questions = ['Explain Bitcoin in simple terms', 'How do I manage risk?', 'Build my personalized study plan'];
  const [visibleIdx, setVisibleIdx] = useState(0);
  const [typing, setTyping] = useState(true);

  useEffect(() => {
    const typingTimer = setTimeout(() => setTyping(false), 1500);
    const cycle = setInterval(() => {
      setTyping(true);
      setVisibleIdx((v) => (v + 1) % questions.length);
      setTimeout(() => setTyping(false), 1500);
    }, 4000);
    return () => {
      clearTimeout(typingTimer);
      clearInterval(cycle);
    };
  }, [questions.length]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-5">
      <div className="flex flex-col items-center text-center p-6">
        <GlassCard className="w-full p-5 flex flex-col items-center">
          <motion.div
            animate={{ scale: [1, 1.03, 1] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            className="w-20 h-20 rounded-full bg-accent/15 flex items-center justify-center mb-4 ring-4 ring-accent/[0.06]"
          >
            <Sparkles className="h-9 w-9 text-primary" />
          </motion.div>
          <h3 className="text-lg font-black text-foreground mb-1">Hello!</h3>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-[200px]">
            I&apos;m Lynx, your personal AI mentor. How can I help you learn crypto today?
          </p>
          <div className="flex gap-2 mt-4 w-full max-w-[220px]">
            <button className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:bg-primary/90 transition-all active:scale-[0.98]">
              Start Chat
            </button>
            <button className="flex-1 py-2.5 rounded-xl border border-white/[0.06] bg-white/[0.03] text-muted-foreground font-bold text-xs flex items-center justify-center gap-1.5 hover:border-white/[0.12] transition-all">
              <Mic className="h-3.5 w-3.5" />
              <span className="text-[9px]">Coming Soon</span>
            </button>
          </div>
        </GlassCard>
      </div>

      <div className="space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold px-1">
          Try asking me
        </div>
        <AnimatePresence mode="wait">
          {questions.map((q, i) => {
            const isActive = i === visibleIdx;
            return (
              <motion.div
                key={q}
                initial={{ opacity: 0.4 }}
                animate={{ opacity: isActive ? 1 : 0.45 }}
                transition={{ duration: 0.5 }}
                className={cn(
                  'flex items-center gap-3 p-3.5 rounded-xl border border-white/[0.04] bg-white/[0.02] backdrop-blur-sm transition-all cursor-pointer hover:border-primary/15',
                  isActive && 'border-primary/15 bg-primary/[0.03]',
                )}
              >
                <MessageCircle className={cn('h-4 w-4 shrink-0', isActive ? 'text-primary' : 'text-muted-foreground')} />
                <span className={cn('flex-1 text-sm', isActive ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                  {q}
                </span>
                {isActive && typing && (
                  <motion.span
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 0.8, repeat: Infinity }}
                    className="text-primary font-bold text-lg"
                  >
                    |
                  </motion.span>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ═══════ PORTFOLIO ═══════
function PortfolioPanel() {
  const alloc = [
    { label: 'BTC', pct: 45, color: 'bg-amber-500' },
    { label: 'ETH', pct: 30, color: 'bg-blue-500' },
    { label: 'SOL', pct: 15, color: 'bg-violet-500' },
    { label: 'Other', pct: 10, color: 'bg-muted-foreground/30' },
  ];

  const sparkVals = useMemo(() => Array.from({ length: 14 }, () => Math.floor(Math.random() * 40 + 30)), []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-5">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <GlassCard className="p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Win Rate</div>
            <div className="text-xl font-black text-emerald-500 tabular-nums">74%</div>
          </GlassCard>
          <GlassCard className="p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Performance</div>
            <div className="text-xl font-black text-emerald-500 tabular-nums">+8.3%</div>
          </GlassCard>
          <GlassCard className="p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Balance</div>
            <div className="text-xl font-black text-primary tabular-nums">$100K</div>
          </GlassCard>
          <GlassCard className="p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Total XP</div>
            <div className="text-xl font-black text-violet-500 tabular-nums">5,620</div>
          </GlassCard>
        </div>

        <GlassCard className="p-4">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-3">
            Portfolio Performance
          </div>
          <div className="h-[80px]">
            <Sparkline values={sparkVals} color="hsl(var(--primary))" height={40} />
          </div>
        </GlassCard>
      </div>

      <div className="space-y-3">
        <GlassCard className="p-4">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-3">
            Asset Allocation
          </div>
          <div className="space-y-2.5">
            {alloc.map((a) => (
              <div key={a.label} className="flex items-center gap-3">
                <span className="text-[10px] font-bold text-foreground w-8">{a.label}</span>
                <div className="flex-1 h-2 rounded-full bg-muted/30 overflow-hidden">
                  <motion.div
                    className={cn('h-full rounded-full', a.color)}
                    initial={{ width: 0 }}
                    animate={{ width: `${a.pct}%` }}
                    transition={{ duration: 1, delay: 0.2 }}
                  />
                </div>
                <span className="text-[10px] font-bold text-muted-foreground tabular-nums w-8 text-right">
                  {a.pct}%
                </span>
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard className="p-4">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-3">
            Learning Progress
          </div>
          <div className="flex items-end gap-2 mb-2">
            <span className="text-2xl font-black text-foreground tabular-nums">64%</span>
            <span className="text-xs text-muted-foreground pb-1">overall</span>
          </div>
          <ProgressBar pct={64} color="bg-primary" />
        </GlassCard>

        <GlassCard className="p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2">
            Recent Activity
          </div>
          {[
            { text: 'Completed Risk Management lesson', time: '2m ago' },
            { text: 'Earned Technical Analysis badge', time: '1h ago' },
            { text: 'Ranked #18 in Weekly Competition', time: '3h ago' },
          ].map((a) => (
            <div key={a.text} className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0">
              <span className="text-xs text-foreground truncate mr-2">{a.text}</span>
              <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">{a.time}</span>
            </div>
          ))}
        </GlassCard>
      </div>
    </div>
  );
}

// ═══════ MAIN COMPONENT ═══════
export function LandingExplore() {
  const [activeTab, setActiveTab] = useState<TabId>('academy');
  const [demoRunning, setDemoRunning] = useState(false);
  const [demoPaused, setDemoPaused] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  // IntersectionObserver to trigger auto-demo
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !demoPaused) {
          setDemoRunning(true);
        }
      },
      { threshold: 0.3 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [demoPaused]);

  // Auto-rotate tabs every 5s
  useEffect(() => {
    if (!demoRunning) return;
    const tabIds = TABS.map((t) => t.id);
    const i = setInterval(() => {
      setActiveTab((prev) => {
        const idx = tabIds.indexOf(prev);
        return tabIds[(idx + 1) % tabIds.length];
      });
    }, 5000);
    return () => clearInterval(i);
  }, [demoRunning]);

  const handleTabClick = useCallback((id: TabId) => {
    setActiveTab(id);
    setDemoPaused(true);
    setDemoRunning(false);
  }, []);

  const panels: Record<TabId, React.ReactNode> = useMemo(
    () => ({
      academy: <AcademyPanel />,
      simulator: <SimulatorPanel />,
      competitions: <CompetitionsPanel />,
      lynx: <LynxPanel />,
      portfolio: <PortfolioPanel />,
    }),
    [],
  );

  return (
    <section
      ref={sectionRef}
      id="explore"
      className="relative py-20 lg:py-28 px-4 sm:px-6 lg:px-8 overflow-hidden"
    >
      {/* Background */}
      <div className="absolute inset-0 bg-background" />
      <div className="absolute top-[10%] left-[15%] w-[700px] h-[700px] bg-primary/[0.025] blur-[180px] rounded-full" />
      <div className="absolute bottom-[5%] right-[5%] w-[600px] h-[600px] bg-blue-500/[0.02] blur-[160px] rounded-full" />
      <div
        className="absolute inset-0 opacity-[0.006]"
        style={{
          backgroundImage:
            'linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)',
          backgroundSize: '80px 80px',
        }}
      />

      <div className="relative z-10 max-w-5xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-10 lg:mb-14">
          <span className="inline-block text-xs font-bold text-primary uppercase tracking-[0.2em] mb-4">
            Product Tour
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-foreground mb-4 tracking-tight">
            See CryptoVerse HQ in Action
          </h2>
          <p className="max-w-[700px] mx-auto text-muted-foreground text-base sm:text-lg leading-relaxed">
            Explore how AI guidance, structured learning, risk-free practice, and competitions
            work together to help you build real crypto skills.
          </p>
        </div>

        {/* Horizontal Pill Tabs */}
        <div className="flex justify-center mb-8">
          <div
            className="inline-flex items-center gap-1 p-1 rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl shadow-[0_4px_24px_-4px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_24px_-4px_rgba(0,0,0,0.2)]"
            role="tablist"
            aria-label="Product Tour"
          >
            {TABS.map(({ id, icon: Icon, label }) => {
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  role="tab"
                  id={`tab-${id}`}
                  aria-selected={isActive}
                  aria-controls={`panel-${id}`}
                  onClick={() => handleTabClick(id)}
                  className={cn(
                    'relative flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-250',
                    isActive
                      ? 'text-foreground bg-primary/[0.1] shadow-[0_0_0_1px_theme(colors.primary/0.2),0_2px_12px_-2px_theme(colors.primary/0.15)]'
                      : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.03]',
                  )}
                >
                  <Icon className={cn('h-4 w-4', isActive ? 'text-primary' : 'text-muted-foreground')} />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content Panel */}
        <div
          className="rounded-[28px] border border-white/[0.06] bg-white/[0.03] backdrop-blur-2xl shadow-[0_12px_48px_-8px_rgba(0,0,0,0.08)] dark:border-white/[0.04] dark:bg-white/[0.02] dark:shadow-[0_12px_48px_-8px_rgba(0,0,0,0.3)] overflow-hidden min-h-[380px]"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              role="tabpanel"
              id={`panel-${activeTab}`}
              aria-labelledby={`tab-${activeTab}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="p-5 sm:p-6 lg:p-8"
            >
              {panels[activeTab]}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Demo indicator */}
        {demoRunning && (
          <div className="flex justify-center mt-4">
            <span className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              Auto-demo playing — click a tab to explore
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
