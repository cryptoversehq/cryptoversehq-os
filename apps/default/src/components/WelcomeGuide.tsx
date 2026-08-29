import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, ArrowLeft, X,
  TrendingUp, BookOpen, Trophy, Zap,
  BarChart2, Activity, Target, Star,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/authStore';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Step {
  id: number;
  icon: string;
  accentFrom: string;
  accentTo: string;
  shadowColor: string;
  tag: string;
  title: string;
  subtitle: string;
  bullets: { icon: React.ElementType; text: string }[];
  preview: React.ReactNode;
}

// ─── Step Previews ────────────────────────────────────────────────────────────

function TradePreview() {
  const [price, setPrice] = useState(67420.5);
  const [dir, setDir]     = useState(1);

  useEffect(() => {
    const id = setInterval(() => {
      setPrice(p => {
        const delta = (Math.random() - 0.48) * 60;
        const next  = parseFloat((p + delta).toFixed(2));
        setDir(delta >= 0 ? 1 : -1);
        return next;
      });
    }, 900);
    return () => clearInterval(id);
  }, []);

  const bars = [55, 38, 62, 44, 70, 52, 80, 66, 74, 58, 85, 72];

  return (
    <div className="bg-black/30 border border-white/10 rounded-2xl p-4 overflow-hidden">
      <div className="flex justify-between items-center mb-3">
        <div>
          <p className="text-white/40 text-[10px] font-mono">BTC / USDT</p>
          <motion.p
            key={price}
            initial={{ y: dir > 0 ? 4 : -4, opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            className={cn(
              'text-xl font-bold font-mono',
              dir > 0 ? 'text-green-400' : 'text-red-400',
            )}
          >
            ${price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </motion.p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full font-bold">LIVE</span>
          <span className={cn('text-xs font-bold', dir > 0 ? 'text-green-400' : 'text-red-400')}>
            {dir > 0 ? '+' : ''}2.4%
          </span>
        </div>
      </div>
      {/* Mini chart bars */}
      <div className="flex items-end gap-0.5 h-10 mb-3">
        {bars.map((h, i) => (
          <motion.div
            key={i}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ delay: i * 0.04, duration: 0.3 }}
            style={{ height: `${h}%` }}
            className={cn(
              'flex-1 rounded-sm origin-bottom',
              i % 3 === 0 ? 'bg-red-500/70' : 'bg-green-500/70',
            )}
          />
        ))}
      </div>
      {/* Buy / Sell */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-green-500/15 border border-green-500/25 rounded-xl p-2 text-center">
          <p className="text-green-400 text-xs font-bold">BUY / LONG</p>
          <p className="text-white/60 text-[10px] mt-0.5">10× leverage</p>
        </div>
        <div className="bg-red-500/15 border border-red-500/25 rounded-xl p-2 text-center">
          <p className="text-red-400 text-xs font-bold">SELL / SHORT</p>
          <p className="text-white/60 text-[10px] mt-0.5">10× leverage</p>
        </div>
      </div>
    </div>
  );
}

function AcademyPreview() {
  const lessons = [
    { title: 'What is Crypto?',        xp: 50,  done: true  },
    { title: 'Reading Candlestick Charts', xp: 100, done: true  },
    { title: 'Support & Resistance',   xp: 150, done: false },
    { title: 'RSI & MACD Indicators',  xp: 200, done: false },
  ];

  return (
    <div className="bg-black/30 border border-white/10 rounded-2xl p-4 space-y-2">
      {lessons.map((l, i) => (
        <motion.div
          key={l.title}
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.1 }}
          className={cn(
            'flex items-center gap-3 p-2.5 rounded-xl border',
            l.done
              ? 'bg-amber-500/10 border-amber-500/20'
              : 'bg-white/3 border-white/8',
          )}
        >
          <div className={cn(
            'h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0',
            l.done ? 'bg-amber-500/20' : 'bg-white/5',
          )}>
            {l.done
              ? <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
              : <BookOpen className="h-3.5 w-3.5 text-white/30" />}
          </div>
          <span className={cn('text-xs flex-1 font-medium', l.done ? 'text-white/80' : 'text-white/40')}>
            {l.title}
          </span>
          <span className={cn(
            'text-[10px] font-bold px-2 py-0.5 rounded-full',
            l.done ? 'bg-amber-500/20 text-amber-400' : 'bg-white/5 text-white/30',
          )}>
            +{l.xp} XP
          </span>
        </motion.div>
      ))}
    </div>
  );
}

function LeaderboardPreview() {
  const rows = [
    { rank: 1, name: 'SatoshiWhale', pnl: '+$48,320', flag: '🇯🇵', crown: true  },
    { rank: 2, name: 'BullRunner99',  pnl: '+$41,780', flag: '🇺🇸', crown: false },
    { rank: 3, name: 'CryptoNova',   pnl: '+$38,100', flag: '🇩🇪', crown: false },
    { rank: '…', name: 'You',        pnl: '+$12,500', flag: '🌍', crown: false  },
  ];
  const rankColors = ['text-yellow-400', 'text-slate-300', 'text-orange-400', 'text-primary'];

  return (
    <div className="bg-black/30 border border-white/10 rounded-2xl p-4 space-y-2">
      {rows.map((r, i) => (
        <motion.div
          key={r.name}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1 }}
          className={cn(
            'flex items-center gap-3 p-2.5 rounded-xl border',
            r.name === 'You' ? 'bg-primary/10 border-primary/25' : 'bg-white/3 border-white/8',
          )}
        >
          <span className={cn('text-sm font-black w-6 text-center', rankColors[i])}>
            {r.rank}
          </span>
          <span className="text-sm">{r.flag}</span>
          <span className={cn('flex-1 text-xs font-semibold', r.name === 'You' ? 'text-primary' : 'text-white/80')}>
            {r.name} {r.crown && '👑'}
          </span>
          <span className="text-xs font-bold text-green-400 font-mono">{r.pnl}</span>
        </motion.div>
      ))}
    </div>
  );
}

function TwinLeaguePreview() {
  const [thinking, setThinking] = useState(false);
  const [msg, setMsg]           = useState('');

  useEffect(() => {
    const msgs = [
      'Analyzing momentum…',
      'RSI at 68 — near overbought.',
      'Entering short position.',
      'Stop-loss set at $69,200.',
    ];
    let i = 0;
    const loop = () => {
      setThinking(true);
      setTimeout(() => {
        setMsg(msgs[i % msgs.length]);
        setThinking(false);
        i++;
        setTimeout(loop, 2200);
      }, 800);
    };
    const t = setTimeout(loop, 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="bg-black/30 border border-white/10 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
          <Zap className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="text-xs font-bold text-white">AI Opponent</p>
          <p className="text-[10px] text-violet-400">SigmaBot v3.2</p>
        </div>
        <span className="ml-auto text-[10px] bg-violet-500/20 text-violet-400 px-2 py-0.5 rounded-full border border-violet-500/30">
          ACTIVE
        </span>
      </div>
      <div className="bg-violet-500/8 border border-violet-500/15 rounded-xl p-3 min-h-[52px] flex items-center gap-2">
        {thinking ? (
          <div className="flex gap-1">
            {[0, 1, 2].map(i => (
              <motion.div
                key={i}
                className="h-1.5 w-1.5 bg-violet-400 rounded-full"
                animate={{ y: [0, -4, 0] }}
                transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.15 }}
              />
            ))}
          </div>
        ) : (
          <motion.p
            key={msg}
            initial={{ opacity: 0, x: 6 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-xs text-violet-300 font-medium"
          >
            {msg}
          </motion.p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 mt-3">
        <div className="text-center">
          <p className="text-lg font-black text-white">68%</p>
          <p className="text-[10px] text-white/40">AI Win Rate</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-black text-primary">72%</p>
          <p className="text-[10px] text-white/40">Your Best</p>
        </div>
      </div>
    </div>
  );
}

// ─── Particle burst on final step ─────────────────────────────────────────────
function ParticleBurst() {
  const particles = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    angle: (i / 20) * 360,
    dist:  60 + Math.random() * 60,
    color: ['#f59e0b', '#fb923c', '#facc15', '#34d399', '#818cf8'][i % 5],
    size:  3 + Math.random() * 5,
  }));

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-3xl">
      {particles.map(p => {
        const rad = (p.angle * Math.PI) / 180;
        const tx  = Math.cos(rad) * p.dist;
        const ty  = Math.sin(rad) * p.dist;
        return (
          <motion.div
            key={p.id}
            className="absolute rounded-full"
            style={{
              width: p.size,
              height: p.size,
              background: p.color,
              top: '50%',
              left: '50%',
              marginTop: -p.size / 2,
              marginLeft: -p.size / 2,
            }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: tx, y: ty, opacity: 0, scale: 0 }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
          />
        );
      })}
    </div>
  );
}

// ─── Progress ring ─────────────────────────────────────────────────────────────
function ProgressRing({ step, total }: { step: number; total: number }) {
  const r         = 22;
  const circ      = 2 * Math.PI * r;
  const progress  = ((step + 1) / total) * circ;

  return (
    <svg width="56" height="56" className="rotate-[-90deg]">
      <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
      <motion.circle
        cx="28" cy="28" r={r}
        fill="none"
        stroke="url(#ringGrad)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={circ}
        initial={{ strokeDashoffset: circ }}
        animate={{ strokeDashoffset: circ - progress }}
        transition={{ duration: 0.5, ease: 'easeInOut' }}
      />
      <defs>
        <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#fb923c" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ─── Steps definition ─────────────────────────────────────────────────────────
const STEPS: Step[] = [
  {
    id: 0,
    icon: '📈',
    accentFrom: '#f59e0b',
    accentTo:   '#fb923c',
    shadowColor: 'rgba(245,158,11,0.35)',
    tag: 'TRADE',
    title: 'Trade Like a Pro',
    subtitle: 'Real markets. Zero real money. All the adrenaline.',
    bullets: [
      { icon: Activity,  text: '$100,000 virtual USD on day one' },
      { icon: BarChart2, text: 'Leverage up to 100× with live order books' },
      { icon: TrendingUp,text: 'Long & short any major crypto asset' },
    ],
    preview: <TradePreview />,
  },
  {
    id: 1,
    icon: '📚',
    accentFrom: '#8b5cf6',
    accentTo:   '#a78bfa',
    shadowColor: 'rgba(139,92,246,0.35)',
    tag: 'ACADEMY',
    title: 'Learn & Level Up',
    subtitle: 'Every lesson makes you a sharper trader.',
    bullets: [
      { icon: BookOpen, text: 'Bite-sized lessons from basics to advanced TA' },
      { icon: Zap,      text: 'Earn XP and unlock higher-tier features' },
      { icon: Star,     text: 'Track your progress across 30+ modules' },
    ],
    preview: <AcademyPreview />,
  },
  {
    id: 2,
    icon: '🏆',
    accentFrom: '#10b981',
    accentTo:   '#34d399',
    shadowColor: 'rgba(16,185,129,0.35)',
    tag: 'LEADERBOARD',
    title: 'Compete Globally',
    subtitle: 'Your P&L is your rank. Every trade matters.',
    bullets: [
      { icon: Trophy, text: 'Global and regional leaderboards updated live' },
      { icon: Target, text: 'Join Nations and earn collective glory' },
      { icon: Star,   text: 'Weekly tournaments with special rewards' },
    ],
    preview: <LeaderboardPreview />,
  },
  {
    id: 3,
    icon: '🤖',
    accentFrom: '#6366f1',
    accentTo:   '#8b5cf6',
    shadowColor: 'rgba(99,102,241,0.35)',
    tag: 'TWIN LEAGUE',
    title: 'Challenge AI Bots',
    subtitle: 'Beat the machine. Prove your edge.',
    bullets: [
      { icon: Zap,      text: 'Face AI bots with real trading strategies' },
      { icon: Activity, text: 'Each win unlocks harder, smarter opponents' },
      { icon: Trophy,   text: 'Exclusive Twin League badges and rewards' },
    ],
    preview: <TwinLeaguePreview />,
  },
];

// ─── Main WelcomeGuide ────────────────────────────────────────────────────────
export function WelcomeGuide() {
  const { user, dismissFirstLogin } = useAuthStore();
  const [step, setStep]             = useState(0);
  const [burst, setBurst]           = useState(false);
  const [exiting, setExiting]       = useState(false);

  const isLast   = step === STEPS.length - 1;
  const current  = STEPS[step];

  // Only show when user has isFirstLogin flag
  const shouldShow = !!user?.isFirstLogin;

  const dismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => dismissFirstLogin(), 400);
  }, [dismissFirstLogin]);

  const next = useCallback(() => {
    if (isLast) {
      setBurst(true);
      setTimeout(dismiss, 900);
    } else {
      setStep(s => s + 1);
    }
  }, [isLast, dismiss]);

  const prev = useCallback(() => {
    if (step > 0) setStep(s => s - 1);
  }, [step]);

  // Keyboard navigation
  useEffect(() => {
    if (!shouldShow) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      if (e.key === 'ArrowLeft')                        prev();
      if (e.key === 'Escape')                           dismiss();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shouldShow, next, prev, dismiss]);

  if (!shouldShow) return null;

  return (
    <AnimatePresence>
      {!exiting && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ backdropFilter: 'blur(16px)', background: 'rgba(0,0,0,0.75)' }}
        >
          {/* Ambient glow behind card */}
          <motion.div
            className="absolute w-96 h-96 rounded-full blur-3xl opacity-20 pointer-events-none"
            animate={{ background: `radial-gradient(circle, ${current.accentFrom}, transparent)` }}
            transition={{ duration: 0.6 }}
          />

          {/* Card */}
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 24 }}
            animate={{ scale: 1,    opacity: 1, y: 0 }}
            exit={{ scale: 0.92,    opacity: 0, y: 24 }}
            transition={{ type: 'spring', stiffness: 280, damping: 24 }}
            className="relative w-full max-w-lg bg-card border border-white/8 rounded-3xl shadow-2xl overflow-hidden"
          >
            {burst && <ParticleBurst />}

            {/* Top gradient bar */}
            <motion.div
              className="absolute top-0 left-0 right-0 h-0.5"
              animate={{ background: `linear-gradient(to right, ${current.accentFrom}, ${current.accentTo})` }}
              transition={{ duration: 0.5 }}
            />

            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-0">
              {/* Progress ring + step counter */}
              <div className="relative flex items-center justify-center">
                <ProgressRing step={step} total={STEPS.length} />
                <span className="absolute text-[11px] font-bold text-white/70 rotate-90">
                  {step + 1}/{STEPS.length}
                </span>
              </div>

              {/* Tag pill */}
              <motion.span
                key={current.tag}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-[11px] font-black tracking-widest px-3 py-1 rounded-full border"
                style={{
                  color:            current.accentFrom,
                  borderColor:      current.accentFrom + '40',
                  background:       current.accentFrom + '15',
                }}
              >
                {current.tag}
              </motion.span>

              {/* Close */}
              <button
                onClick={dismiss}
                className="p-2 rounded-xl text-white/30 hover:text-white/70 hover:bg-white/5 transition-colors"
                aria-label="Skip guide"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Step content */}
            <div className="px-6 pt-5 pb-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0  }}
                  exit={{ opacity: 0,   x: -24 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                >
                  {/* Icon */}
                  <motion.div
                    className="flex justify-center mb-5"
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1,   opacity: 1 }}
                    transition={{ delay: 0.05, type: 'spring', stiffness: 320 }}
                  >
                    <div
                      className="h-16 w-16 rounded-2xl flex items-center justify-center shadow-xl text-3xl"
                      style={{
                        background: `linear-gradient(135deg, ${current.accentFrom}, ${current.accentTo})`,
                        boxShadow: `0 12px 32px ${current.shadowColor}`,
                      }}
                    >
                      {current.icon}
                    </div>
                  </motion.div>

                  {/* Title + subtitle */}
                  <h2 className="text-2xl font-black text-center mb-1 leading-tight">
                    {current.title}
                  </h2>
                  <p className="text-muted-foreground text-sm text-center mb-5 leading-relaxed">
                    {current.subtitle}
                  </p>

                  {/* Bullets */}
                  <div className="space-y-2 mb-5">
                    {current.bullets.map(({ icon: Icon, text }, i) => (
                      <motion.div
                        key={text}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0  }}
                        transition={{ delay: 0.08 + i * 0.07 }}
                        className="flex items-center gap-3 bg-white/3 border border-white/6 rounded-xl px-4 py-2.5"
                      >
                        <div
                          className="h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: current.accentFrom + '20' }}
                        >
                          <Icon className="h-3.5 w-3.5" style={{ color: current.accentFrom }} />
                        </div>
                        <span className="text-sm text-white/75 font-medium">{text}</span>
                      </motion.div>
                    ))}
                  </div>

                  {/* Live preview */}
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    {current.preview}
                  </motion.div>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="px-6 pb-6 flex items-center gap-3">
              {/* Back */}
              <motion.button
                onClick={prev}
                animate={{ opacity: step > 0 ? 1 : 0, pointerEvents: step > 0 ? 'auto' : 'none' }}
                className="flex items-center justify-center h-11 w-11 rounded-xl border border-white/10 text-white/50 hover:text-white hover:border-white/20 hover:bg-white/5 transition-all flex-shrink-0"
              >
                <ArrowLeft className="h-4 w-4" />
              </motion.button>

              {/* Step dots */}
              <div className="flex-1 flex items-center justify-center gap-1.5">
                {STEPS.map((s, i) => (
                  <button
                    key={s.id}
                    onClick={() => setStep(i)}
                    className="relative h-1.5 rounded-full transition-all duration-300 overflow-hidden"
                    style={{ width: i === step ? 24 : 6 }}
                  >
                    <div className="absolute inset-0 bg-white/15 rounded-full" />
                    {i === step && (
                      <motion.div
                        layoutId="activeDot"
                        className="absolute inset-0 rounded-full"
                        style={{ background: `linear-gradient(to right, ${current.accentFrom}, ${current.accentTo})` }}
                      />
                    )}
                    {i < step && (
                      <div
                        className="absolute inset-0 rounded-full opacity-50"
                        style={{ background: current.accentFrom }}
                      />
                    )}
                  </button>
                ))}
              </div>

              {/* Next / Start */}
              <motion.button
                onClick={next}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="flex items-center gap-2 px-5 h-11 rounded-xl font-bold text-sm text-black shadow-lg transition-all flex-shrink-0"
                style={{
                  background: `linear-gradient(135deg, ${current.accentFrom}, ${current.accentTo})`,
                  boxShadow: `0 6px 20px ${current.shadowColor}`,
                }}
              >
                {isLast ? (
                  <>Start Trading <span>🚀</span></>
                ) : (
                  <>Next <ArrowRight className="h-4 w-4" /></>
                )}
              </motion.button>
            </div>

            {/* Keyboard hint */}
            <div className="pb-4 flex justify-center gap-3">
              {[
                { key: '←', label: 'Prev' },
                { key: '→', label: 'Next' },
                { key: 'Esc', label: 'Skip' },
              ].map(k => (
                <span key={k.key} className="flex items-center gap-1 text-[10px] text-white/20">
                  <kbd className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-[10px] font-mono">{k.key}</kbd>
                  {k.label}
                </span>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
