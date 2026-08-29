import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Play, Sparkles, Check, TrendingUp, TrendingDown, Shield, GraduationCap, Trophy, Sparkles as SparklesIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const TRUST_SIGNALS = [
  { icon: Shield, text: 'No Real Money Required' },
  { icon: SparklesIcon, text: 'Personalized AI Guidance' },
  { icon: GraduationCap, text: 'Beginner-Friendly Learning' },
  { icon: Trophy, text: 'Practice Before You Invest' },
];

const MARKET_COINS = [
  { symbol: 'BTC', change: '+2.1', positive: true },
  { symbol: 'ETH', change: '+1.4', positive: true },
  { symbol: 'SOL', change: '-0.8', positive: false },
];

const LEADERBOARD_ENTRIES = [
  ['Sarah Chen', 'Ali Reza', 'David Kim'],
  ['Ali Reza', 'Maria Silva', 'Sarah Chen'],
  ['David Kim', 'Sarah Chen', 'Alex Park'],
];

const CHART_POINTS = 'M0,80 C20,75 40,60 60,50 C80,40 100,35 120,45 C140,55 160,30 180,25 C200,20 220,45 240,35 C260,25 280,20 300,15 C320,10 340,25 360,30 C380,35 400,15 420,10 C440,5 460,20 480,25 C500,30 520,18 540,12 C560,6 580,22 600,18';

function HeroBackground() {
  return (
    <>
      {/* Base background — slightly lifted for contrast */}
      <div className="absolute inset-0 bg-background" />

      {/* Premium radial gradient orbs — increased opacity for contrast */}
      <div className="absolute top-[-15%] right-[-8%] w-[900px] h-[900px] bg-gradient-to-br from-primary/[0.09] to-amber-400/[0.05] blur-[200px] rounded-full" />
      <div className="absolute bottom-[-20%] left-[-12%] w-[800px] h-[800px] bg-gradient-to-tr from-blue-500/[0.06] to-violet-500/[0.05] blur-[180px] rounded-full" />
      <div className="absolute top-[45%] left-[45%] w-[500px] h-[500px] bg-gradient-to-r from-primary/[0.06] to-emerald-500/[0.03] blur-[140px] rounded-full" />

      {/* Subtle top-to-bottom vignette for depth */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 80% 60% at 50% 40%, transparent 0%, hsl(var(--background) / 0.25) 100%)',
        }}
      />

      {/* Blockchain / hex grid pattern — slightly more visible */}
      <div
        className="absolute inset-0 opacity-[0.028]"
        style={{
          backgroundImage: `
            linear-gradient(30deg, hsl(var(--foreground)) 1px, transparent 1px),
            linear-gradient(-30deg, hsl(var(--foreground)) 1px, transparent 1px),
            linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px),
            linear-gradient(0deg, hsl(var(--foreground)) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px, 48px 48px, 96px 96px, 96px 96px',
        }}
      />
    </>
  );
}

function AnimatedChart() {
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  useEffect(() => {
    intervalRef.current = setInterval(() => setProgress((p) => (p + 0.3) % 100), 50);
    return () => clearInterval(intervalRef.current);
  }, []);
  const dashOffset = useMemo(() => 120 - progress * 1.2, [progress]);
  return (
    <div className="w-full h-full flex items-center justify-center" role="img" aria-label="Animated portfolio chart (demo)">
      <svg viewBox="0 0 600 100" className="w-full h-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.3" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.01" />
          </linearGradient>
        </defs>
        <path d={`${CHART_POINTS} L600,100 L0,100 Z`} fill="url(#chartGrad)" />
        <path
          d={CHART_POINTS}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="120"
          strokeDashoffset={dashOffset}
        />
      </svg>
    </div>
  );
}

function AnimatedMarketTicker() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 3000);
    return () => clearInterval(i);
  }, []);
  const coins = useMemo(() => MARKET_COINS.map((c) => {
    const drift = (Math.random() - 0.5) * 0.4;
    const newChange = (parseFloat(c.change) + drift).toFixed(1);
    return { ...c, change: newChange, positive: parseFloat(newChange) >= 0 };
  }), [tick]);

  return (
    <div className="flex items-center gap-3 text-xs">
      {coins.map((coin) => {
        const Icon = coin.positive ? TrendingUp : TrendingDown;
        return (
          <div key={coin.symbol} className="flex items-center gap-1">
            <span className="font-bold text-foreground">{coin.symbol}</span>
            <Icon className={cn('h-3 w-3', coin.positive ? 'text-emerald-500' : 'text-red-500')} />
            <span className={cn('tabular-nums font-medium', coin.positive ? 'text-emerald-500' : 'text-red-500')}>
              {coin.positive ? '+' : ''}{coin.change}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

function AnimatedLeaderboard() {
  const [entryIdx, setEntryIdx] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setEntryIdx((e) => (e + 1) % LEADERBOARD_ENTRIES.length), 4000);
    return () => clearInterval(i);
  }, []);
  return (
    <div className="space-y-1.5">
      <AnimatePresence mode="wait">
        <motion.div key={entryIdx} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.4 }}>
          {LEADERBOARD_ENTRIES[entryIdx].map((name, i) => (
            <div key={name} className="flex items-center gap-2 py-1 text-xs">
              <span className={cn('w-4 text-center font-bold tabular-nums', i === 0 ? 'text-primary' : 'text-muted-foreground')}>{i + 1}</span>
              <span className={cn('flex-1 truncate', i === 0 ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{name}</span>
            </div>
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function LynxWidget() {
  const messages = [
    { text: 'Great job! You completed Lesson 7. Ready for your next challenge?', btn: 'Continue' },
    { text: 'Your portfolio is up 3.2% this week. Keep up the momentum!', btn: 'View Stats' },
    { text: 'New lesson unlocked: Advanced DeFi Strategies. Want to dive in?', btn: 'Start Lesson' },
  ];
  const [msgIdx, setMsgIdx] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setMsgIdx((m) => (m + 1) % messages.length), 8000);
    return () => clearInterval(i);
  }, [messages.length]);
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl border bg-accent/10">
      <div className="shrink-0 w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Lynx AI</span>
        <AnimatePresence mode="wait">
          <motion.p key={msgIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }} className="text-xs text-foreground leading-relaxed mt-0.5">
            {messages[msgIdx].text}
          </motion.p>
        </AnimatePresence>
        <AnimatePresence mode="wait">
          <motion.button
            key={`btn-${msgIdx}`}
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.4 }}
            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          >
            {messages[msgIdx].btn}
            <ArrowRight className="h-3 w-3" />
          </motion.button>
        </AnimatePresence>
      </div>
    </div>
  );
}

const STATS = [
  { label: 'Practice Balance', value: '$100,000', accent: 'text-emerald-500' },
  { label: "Today's Lesson", value: 'Risk Mgmt', accent: 'text-amber-500' },
  { label: 'Leaderboard', value: '#42', accent: 'text-primary' },
  { label: 'Progress', value: 'Week 3', accent: 'text-blue-500' },
  { label: 'Skills', value: '17 / 24', accent: 'text-violet-500' },
];

function HeroDashboard() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mouseRotate, setMouseRotate] = useState({ x: 0, y: 0 });
  const [floatOffset, setFloatOffset] = useState(0);

  // Gentle continuous floating animation
  useEffect(() => {
    let raf: number;
    const start = performance.now();
    const tick = () => {
      setFloatOffset(Math.sin((performance.now() - start) * 0.0006) * 6);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const rx = ((e.clientY - cy) / (rect.height / 2)) * -4;
    const ry = ((e.clientX - cx) / (rect.width / 2)) * 4;
    setMouseRotate({ x: rx, y: ry });
  }, []);

  const handleMouseLeave = useCallback(() => { setMouseRotate({ x: 0, y: 0 }); }, []);

  return (
    <motion.div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      initial={{ opacity: 0, y: 40, scale: 0.96 }}
      animate={{
        opacity: 1,
        y: floatOffset,
        scale: 1,
        rotateX: mouseRotate.x,
        rotateY: mouseRotate.y,
      }}
      transition={{
        opacity: { duration: 0.7, delay: 0.25, ease: [0.25, 0.1, 0.25, 1] },
        y: { duration: 0.7, delay: 0.25, ease: [0.25, 0.1, 0.25, 1] },
        scale: { duration: 0.7, delay: 0.25, ease: [0.25, 0.1, 0.25, 1] },
        rotateX: { type: 'spring', stiffness: 35, damping: 18 },
        rotateY: { type: 'spring', stiffness: 35, damping: 18 },
      }}
      style={{ transformStyle: 'preserve-3d', perspective: 1200 }}
      className="relative w-full max-w-[756px] mx-auto rounded-2xl overflow-hidden"
      role="img"
      aria-label="CryptoVerse HQ dashboard preview"
    >
      {/* ── Outer glow ring ── */}
      <div
        className="absolute -inset-[2px] rounded-2xl pointer-events-none"
        style={{
          background: 'linear-gradient(135deg, hsl(var(--primary) / 0.12), transparent 40%, transparent 60%, hsl(var(--primary) / 0.06))',
          filter: 'blur(20px)',
        }}
      />

      {/* ── Glass card container ── */}
      <div
        className="relative rounded-2xl border border-white/[0.08] overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, hsl(var(--card) / 0.85), hsl(var(--card) / 0.55))',
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
          boxShadow: [
            '0 0 0 1px hsl(var(--primary) / 0.05)',
            '0 2px 4px rgba(0,0,0,0.04)',
            '0 8px 16px rgba(0,0,0,0.05)',
            '0 16px 32px rgba(0,0,0,0.06)',
            '0 32px 64px rgba(0,0,0,0.08)',
            '0 48px 96px rgba(0,0,0,0.06)',
            'inset 0 1px 0 hsl(var(--border) / 0.3)',
            'inset 0 -1px 0 hsl(var(--background) / 0.4)',
          ].join(', '),
        }}
      >
        {/* ── Top glass glare strip ── */}
        <div
          className="absolute top-0 inset-x-0 h-[1px] pointer-events-none z-30"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, hsl(var(--primary) / 0.25) 20%, hsl(var(--foreground) / 0.15) 50%, hsl(var(--primary) / 0.25) 80%, transparent 100%)',
          }}
        />

        {/* ── Window chrome (browser toolbar) ── */}
        <div
          className="flex items-center gap-2 px-5 py-3.5 border-b relative z-10"
          style={{
            background: 'linear-gradient(180deg, hsl(var(--muted) / 0.3), hsl(var(--muted) / 0.1))',
            borderColor: 'hsl(var(--border) / 0.35)',
          }}
        >
          {/* Traffic lights */}
          <div className="flex gap-1.5 shrink-0">
            <div className="w-3 h-3 rounded-full bg-red-400/70 shadow-inner" />
            <div className="w-3 h-3 rounded-full bg-amber-400/70 shadow-inner" />
            <div className="w-3 h-3 rounded-full bg-emerald-400/70 shadow-inner" />
          </div>

          {/* Browser tabs */}
          <div className="flex items-center gap-1 mx-3 flex-1 min-w-0">
            <div
              className="flex items-center gap-1.5 px-3 py-1 rounded-t-md text-[10px] font-medium text-foreground/80 max-w-[160px] truncate"
              style={{
                background: 'hsl(var(--card) / 0.7)',
                border: '1px solid hsl(var(--border) / 0.2)',
                borderBottom: 'none',
              }}
            >
              <span className="w-3.5 h-3.5 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              </span>
              <span className="truncate">Dashboard</span>
            </div>
          </div>

          {/* URL bar */}
          <div
            className="flex-1 max-w-[280px] h-6 rounded-md flex items-center px-3 gap-1.5"
            style={{ background: 'hsl(var(--muted) / 0.2)' }}
          >
            <svg className="h-3 w-3 text-emerald-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span className="text-[10px] text-muted-foreground truncate">cryptoversehq.com</span>
          </div>
        </div>

        {/* ── Dashboard body ── */}
        <div className="relative z-10 p-4 sm:p-5 space-y-3.5 sm:space-y-4">
          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            {STATS.map((s) => (
              <div key={s.label} className="p-2.5 sm:p-3 rounded-xl border bg-card/50 backdrop-blur-sm hover:scale-[1.04] hover:shadow-lg hover:border-primary/20 transition-all duration-300 cursor-default">
                <div className="text-[8px] sm:text-[9px] uppercase tracking-[0.08em] text-muted-foreground mb-0.5 truncate font-semibold">{s.label}</div>
                <div className={cn('text-xs sm:text-sm font-black tabular-nums truncate', s.accent)}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Chart area */}
          <div className="rounded-xl border bg-card/40 backdrop-blur-sm p-3 h-[110px] sm:h-[130px]">
            <AnimatedChart />
          </div>

          {/* Widgets row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <LynxWidget />
            </div>
            <div className="rounded-xl border bg-card/40 backdrop-blur-sm p-3 space-y-2.5">
              <div className="text-[9px] uppercase tracking-[0.08em] text-muted-foreground font-bold">Market</div>
              <AnimatedMarketTicker />
            </div>
          </div>

          {/* Leaderboard */}
          <div className="rounded-xl border bg-card/40 backdrop-blur-sm p-3">
            <div className="text-[9px] uppercase tracking-[0.08em] text-muted-foreground font-bold mb-2">Leaderboard</div>
            <AnimatedLeaderboard />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function LandingHero() {
  return (
    <section
      className="relative min-h-screen flex items-center overflow-hidden pt-16 sm:pt-24 pb-8 sm:pb-16"
      aria-label="Hero section"
    >
      <HeroBackground />

      <div className="relative z-10 max-w-7xl mx-auto px-5 sm:px-8 lg:px-10 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-[45fr_55fr] gap-10 lg:gap-14 items-center">
          {/* ─────── Left Column ─────── */}
          <div className="flex flex-col justify-center">
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.05, ease: [0.25, 0.1, 0.25, 1] }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-primary/20 bg-primary/[0.08] mb-8 w-fit"
            >
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-semibold text-primary tracking-wide">AI-Powered Crypto Learning Platform</span>
            </motion.div>

            {/* Headline — approved 3-line brand messaging */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.1, ease: [0.25, 0.1, 0.25, 1] }}
              className="text-[2.5rem] sm:text-[3.25rem] lg:text-[3.75rem] xl:text-[4.25rem] font-black tracking-[-0.025em] leading-[1.05] mb-6 text-foreground"
            >
              Learn Crypto.
              <br />
              Practice Safely.
              <br />
              Grow with{' '}
              <span
                className="relative inline-block"
                style={{
                  background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.8))',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  filter: 'drop-shadow(0 0 40px hsl(var(--primary) / 0.15))',
                }}
              >
                AI
              </span>
              .
            </motion.h1>

            {/* Subheadline — approved brand messaging */}
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
              className="max-w-[480px] text-base sm:text-lg text-muted-foreground leading-relaxed mb-8"
            >
              Master crypto through structured lessons, risk-free trading practice,
              and personalized AI guidance—all in one platform designed to help you
              build real confidence.
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.24, ease: [0.25, 0.1, 0.25, 1] }}
              className="space-y-4 mb-10"
            >
              {/* CTA row */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3.5">
                {/* Primary CTA */}
                <Link
                  to="/signup"
                  className="group relative inline-flex items-center gap-2.5 px-10 py-[18px] text-[15px] font-bold text-primary-foreground bg-primary rounded-2xl transition-all duration-300 overflow-hidden"
                  style={{
                    boxShadow: '0 4px 24px hsl(var(--primary) / 0.3), 0 1px 3px hsl(var(--primary) / 0.15)',
                  }}
                >
                  {/* Shine effect on hover */}
                  <span className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/[0.08] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out" />
                  <span className="relative z-10 flex items-center gap-2.5">
                    Start Learning Free
                    <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </span>
                </Link>

                {/* Secondary CTA — video play button */}
                <a
                  href="#explore"
                  className="group inline-flex items-center gap-3 px-7 py-[18px] text-sm font-semibold text-foreground border border-border/60 bg-background/40 backdrop-blur-sm hover:bg-background/60 hover:border-primary/30 rounded-2xl transition-all duration-300"
                >
                  <span className="relative flex items-center justify-center w-9 h-9 rounded-full bg-primary/10 group-hover:bg-primary/15 transition-colors duration-300">
                    <Play className="h-3.5 w-3.5 text-primary fill-primary ml-0.5 transition-transform duration-300 group-hover:scale-110" />
                    <span className="absolute inset-0 rounded-full border-2 border-primary/30 animate-ping" style={{ animationDuration: '2.5s' }} />
                  </span>
                  <span className="group-hover:text-primary transition-colors duration-300">See How It Works</span>
                </a>
              </div>

              {/* Trust note */}
              <p className="text-[13px] text-muted-foreground/70 font-medium pl-1">
                Free • No Credit Card Required
              </p>
            </motion.div>

            {/* Trust signals */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.32, ease: [0.25, 0.1, 0.25, 1] }}
              className="flex flex-wrap gap-x-6 gap-y-2 sm:gap-y-3"
            >
              {TRUST_SIGNALS.map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-2 text-sm font-medium text-foreground/80">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/10">
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  </span>
                  <span className="whitespace-nowrap">{text}</span>
                </div>
              ))}
            </motion.div>
          </div>

          {/* ─────── Right Column ─────── */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="flex items-center justify-center"
          >
            <HeroDashboard />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
