/**
 * DashboardHome.tsx — /dashboard (and /)
 * The main overview page shown after login.
 * Displays account summary, live markets, recent trades, events, and daily rewards.
 */
import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import {
  TrendingUp, TrendingDown, Activity, Trophy, Star, Zap,
  ChevronRight, ChevronUp, ChevronDown, ArrowUpRight, ArrowDownRight, Clock, Target,
  Award, BarChart2, Flame, Gift, Crown, BookOpen, Wallet,
  RefreshCw, CalendarDays, ArrowRight,
} from 'lucide-react';
import { useTradingStore }    from '@/lib/tradingStore';
import { useAcademyStore }    from '@/lib/academyStore';
import { QuickTradeModal }    from '@/components/QuickTradeModal';
import { useAuthStore }       from '@/lib/authStore';
import { useLiveEventStore }  from '@/lib/liveEventStore';
import { useSentimentStore }  from '@/lib/sentimentStore';
import { FEAR_GREED_META }    from '@/lib/sentimentTypes';
import { sentimentColor }     from './sentiment/sentimentUtils';
import { cn } from '@/lib/utils';
import { COINS } from '@/lib/coins';
import { useCpCoinsStore }    from '@/lib/cpCoinsStore';
import { useMonetizationStore } from '@/lib/monetizationStore';
import { useSubscriptionStore } from '@/lib/subscriptionStore';
import { useMarketOverview }    from '@/hooks/useMarketOverview';
import AIPortfolioHealth from '@/components/features/AIPortfolioHealth';
import PredictionGameWidget from '@/components/features/PredictionGameWidget';
import SocialSentimentWidget from '@/components/features/SocialSentimentWidget';
import { CorrelationMatrixWidget } from '@/components/features/CorrelationMatrixWidget';
import { EconomicCalendarWidget } from '@/components/features/EconomicCalendarWidget';
import { OnboardingChecklist } from '@/components/OnboardingChecklist';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { DailyReward } from '@/components/portfolio/DailyReward';
import { AgentAutomationPanel } from '@/components/AgentAutomationPanel';

// ── Live market sources ───────────────────────────────────────────────────────
const MARKET_COINS = [
  { id: 'bitcoin',           symbol: 'BTC',  name: 'Bitcoin',           color: '#F7931A' },
  { id: 'ethereum',          symbol: 'ETH',  name: 'Ethereum',          color: '#627EEA'},
  { id: 'binancecoin',       symbol: 'BNB',  name: 'BNB',               color: '#F3BA2F'},
  { id: 'solana',            symbol: 'SOL',  name: 'Solana',            color: '#9945FF'},
  { id: 'ripple',            symbol: 'XRP',  name: 'XRP',               color: '#00AAE4'},
  { id: 'cardano',           symbol: 'ADA',  name: 'Cardano',           color: '#0D1E7E'},
  { id: 'dogecoin',          symbol: 'DOGE', name: 'Dogecoin',          color: '#C2A633'},
  { id: 'polkadot',          symbol: 'DOT',  name: 'Polkadot',          color: '#E6007A'},
  { id: 'chainlink',         symbol: 'LINK', name: 'Chainlink',         color: '#2A5ADA'},
  { id: 'matic-network',     symbol: 'MATIC',name: 'Polygon',           color: '#8247E5'},
];

function useTickingPrices() {
  const [prices, setPrices] = useState<Record<string, { price: number | null; change: number | null }>>(() => {
    const m: Record<string, { price: number | null; change: number | null }> = {};
    MARKET_COINS.forEach(c => {
      m[c.id] = { price: null, change: null };
    });
    return m;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const coinIds = MARKET_COINS.map(c => c.id);

    import('@/lib/globalPriceEngine').then(({ subscribePrices }) => {
      if (cancelled) return;
      subscribePrices(coinIds, (snapshot) => {
        if (cancelled) return;
        setLoading(false);
        setPrices(prev => {
          const next = { ...prev };
          for (const c of MARKET_COINS) {
            const cp = snapshot.prices.get(c.id);
            if (cp) {
              next[c.id] = { price: cp.price, change: cp.change24h };
            }
          }
          return next;
        });
      });
    });

    return () => { cancelled = true; };
  }, []);

  return { prices, loading };
}

// ── Daily Reward State ────────────────────────────────────────────────────────
const DAILY_KEY = 'cryptoverse_daily_reward_v1';
function getDailyState(): { lastClaimed: string | null; streak: number } {
  try { return JSON.parse(localStorage.getItem(DAILY_KEY) || 'null') ?? { lastClaimed: null, streak: 0 }; }
  catch { return { lastClaimed: null, streak: 0 }; }
}
function saveDailyState(s: { lastClaimed: string; streak: number }) {
  localStorage.setItem(DAILY_KEY, JSON.stringify(s));
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, title, linkTo, linkLabel, collapsible, collapsed, onToggle }: {
  icon: React.ElementType; title: string; linkTo?: string; linkLabel?: string;
  collapsible?: boolean; collapsed?: boolean; onToggle?: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        {collapsible && (
          <button onClick={onToggle} className="p-0.5 hover:bg-secondary/30 rounded transition-colors">
            {collapsed ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>
        )}
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          {title}
        </h2>
      </div>
      {linkTo && (
        <Link to={linkTo} className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors font-semibold">
          {linkLabel ?? 'View all'} <ChevronRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

// ── Collapsible wrapper ───────────────────────────────────────────────────────
const SECTION_COLLAPSE_KEY = 'cv_dashboard_sections_v1';
type SectionId = 'account' | 'marketOverview' | 'movingMarkets' | 'portfolio' | 'events' | 'sentiment' | 'finance' | 'aiWidgets' | 'quickActions';
function loadCollapseState(): Record<SectionId, boolean> {
  try {
    const raw = localStorage.getItem(SECTION_COLLAPSE_KEY);
    return raw ? JSON.parse(raw) as Record<SectionId, boolean> : {} as Record<SectionId, boolean>;
  } catch { return {} as Record<SectionId, boolean>; }
}
function saveCollapseState(state: Record<SectionId, boolean>) {
  localStorage.setItem(SECTION_COLLAPSE_KEY, JSON.stringify(state));
}

function CollapsibleSection({ id, icon: Icon, title, linkTo, linkLabel, children, defaultOpen = true }: {
  id: SectionId; icon: React.ElementType; title: string; linkTo?: string; linkLabel?: string;
  children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [collapseState, setCollapseState] = useState<Record<SectionId, boolean>>(loadCollapseState);
  const collapsed = collapseState[id] ?? !defaultOpen;
  const toggle = () => {
    const next = { ...collapseState, [id]: !collapsed };
    setCollapseState(next);
    saveCollapseState(next);
  };
  return (
    <div>
      <SectionHeader icon={Icon} title={title} linkTo={linkTo} linkLabel={linkLabel} collapsible collapsed={collapsed} onToggle={toggle} />
      {!collapsed && children}
    </div>
  );
}


// ── Dashboard Sentiment Widget ────────────────────────────────────────────────
function SentimentDashboardWidget() {
  const navigate = useNavigate();
  const { getMarketFearGreed, getAllAggregates } = useSentimentStore();

  const market  = getMarketFearGreed();
  const allAggs = getAllAggregates();

  const fg   = market?.index ?? 50;
  const zone = market?.zone  ?? 'neutral';
  const meta = FEAR_GREED_META[zone as keyof typeof FEAR_GREED_META] ?? FEAR_GREED_META['neutral'];

  const overallSentiment = allAggs.length > 0
    ? allAggs.reduce((s, a) => s + a.latest.overallSentiment, 0) / allAggs.length
    : 0;

  const topCoins = ['BTC', 'ETH', 'SOL', 'BNB'].map(sym => {
    const agg = allAggs.find(a => a.symbol === sym);
    return { symbol: sym, sentiment: agg?.latest.overallSentiment ?? 0 };
  });

  // Arc needle for the mini gauge
  const angle  = (fg / 100) * 180;
  const rad    = (angle - 90) * (Math.PI / 180);
  const cx = 50; const cy = 50; const r = 34;
  const nx = cx + r * Math.cos(rad);
  const ny = cy + r * Math.sin(rad);

  const isExtremeFear  = zone === 'extreme_fear';
  const isExtremeGreed = zone === 'extreme_greed';
  const showAlert      = isExtremeFear || isExtremeGreed;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-2xl overflow-hidden hover:border-border transition-all"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-amber-400/10 flex items-center justify-center">
            <span className="text-sm">🧠</span>
          </div>
          Market Sentiment
        </h2>
        <Link to="/sentiment"
          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors font-semibold">
          Full Analysis <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="p-5">
        <div className="flex items-start gap-6">

          {/* Mini Fear & Greed Gauge */}
          <div className="flex flex-col items-center flex-shrink-0">
            <svg width="100" height="58" viewBox="0 0 100 58">
              <path d="M 16,50 A 34,34 0 0,1 84,50" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" strokeLinecap="round" />
              <path d="M 16,50 A 34,34 0 0,1 84,50" fill="none" stroke="url(#dash-fg-grad)" strokeWidth="7" strokeLinecap="round"
                strokeDasharray={`${angle * 1.19} 200`} />
              <defs>
                <linearGradient id="dash-fg-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%"   stopColor="#ef4444" />
                  <stop offset="50%"  stopColor="#f59e0b" />
                  <stop offset="100%" stopColor="#22c55e" />
                </linearGradient>
              </defs>
              <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={meta.color} strokeWidth="2.5" strokeLinecap="round" />
              <circle cx={cx} cy={cy} r="3.5" fill={meta.color} />
            </svg>
            <p className="text-2xl font-black leading-none" style={{ color: meta.color }}>{Math.round(fg)}</p>
            <p className="text-[11px] font-bold mt-0.5" style={{ color: meta.color }}>{meta.icon} {meta.label}</p>
            <p className="text-[9px] text-muted-foreground/50 mt-1 text-center max-w-[90px]">{meta.description}</p>
          </div>

          {/* Right side: overall bar + coin pills + alert */}
          <div className="flex-1 min-w-0 space-y-3">

            {/* Overall sentiment bar */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-muted-foreground">Overall Market</span>
                <span className="text-xs font-bold" style={{ color: sentimentColor(overallSentiment) }}>
                  {overallSentiment >= 0 ? '+' : ''}{overallSentiment.toFixed(2)}
                </span>
              </div>
              <div className="h-2 rounded-full bg-secondary/40 overflow-hidden relative">
                <div className="absolute inset-y-0 left-1/2 w-px bg-white/20" />
                <div className="absolute h-full rounded-full transition-all"
                  style={{
                    left:       overallSentiment >= 0 ? '50%' : `${(overallSentiment + 1) / 2 * 100}%`,
                    width:      `${Math.abs(overallSentiment) * 50}%`,
                    background: sentimentColor(overallSentiment),
                  }} />
              </div>
            </div>

            {/* Extreme alert */}
            {showAlert && (
              <div className={cn('flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-bold',
                isExtremeFear ? 'bg-red-400/8 border border-red-400/20 text-red-400' : 'bg-emerald-400/8 border border-emerald-400/20 text-emerald-400')}>
                ⚠ {isExtremeFear ? `Extreme Fear (${Math.round(fg)}) — Contrarian signal` : `Extreme Greed (${Math.round(fg)}) — Consider profits`}
              </div>
            )}

            {/* Coin pills */}
            <div className="grid grid-cols-2 gap-1.5">
              {topCoins.map(({ symbol, sentiment }) => {
                const color = sentimentColor(sentiment);
                const isPos = sentiment >= 0;
                return (
                  <div key={symbol}
                    className="flex items-center justify-between px-2.5 py-1.5 rounded-lg"
                    style={{ background: color + '0d', border: `1px solid ${color}20` }}>
                    <span className="text-[11px] font-black text-foreground">{symbol}</span>
                    <span className="text-[10px] font-bold" style={{ color }}>
                      {isPos ? '+' : ''}{sentiment.toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* CTA buttons */}
            <div className="flex gap-2 pt-1">
              <button onClick={() => navigate('/sentiment/signals')}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-primary/10 border border-primary/20 text-primary text-[11px] font-bold hover:bg-primary/20 transition-all">
                <Zap className="h-3 w-3" /> Signals
              </button>
              <button onClick={() => navigate('/sentiment/fear-greed')}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-secondary/30 border border-border text-muted-foreground text-[11px] font-bold hover:text-foreground hover:border-border transition-all">
                📈 F&G Index
              </button>
              <button onClick={() => navigate('/sentiment/social')}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-secondary/30 border border-border text-muted-foreground text-[11px] font-bold hover:text-foreground hover:border-border transition-all">
                📱 Social
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Dashboard Finance Panel ───────────────────────────────────────────────────
function DashboardFinancePanel() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const userId   = user?.id ?? 'demo_user';

  const getBalance    = useCpCoinsStore(s => s.getBalance);
  const { getTotalPending } = useMonetizationStore();
  const { getActiveSubscription } = useSubscriptionStore();

  const balance  = getBalance(userId);
  const totPend  = getTotalPending(userId);
  const activeSub = getActiveSubscription(userId);
  const planLabel = activeSub
    ? activeSub.planId.charAt(0).toUpperCase() + activeSub.planId.slice(1)
    : 'Free';

  const financeItems = [
    {
      emoji: '💳',
      label: 'Wallet',
      stat: `${balance.toLocaleString()} CP`,
      statLabel: 'Balance',
      path: '/wallet',
      gradient: 'from-amber-500/20 to-yellow-600/10',
      border: 'border-amber-500/30',
      statColor: '#f59e0b',
    },
    {
      emoji: '🛒',
      label: 'Buy CP',
      stat: `${balance.toLocaleString()} CP`,
      statLabel: 'Current Balance',
      path: '/buy-cp',
      gradient: 'from-violet-500/20 to-purple-600/10',
      border: 'border-violet-500/30',
      statColor: '#a78bfa',
    },
    {
      emoji: '📊',
      label: 'Earnings',
      stat: `${totPend.toLocaleString()} CP`,
      statLabel: 'Pending Payout',
      path: '/creator/earnings',
      gradient: 'from-emerald-500/20 to-green-600/10',
      border: 'border-emerald-500/30',
      statColor: '#34d399',
    },
    {
      emoji: '💎',
      label: 'Subscription',
      stat: planLabel,
      statLabel: activeSub ? `Expires ${new Date(activeSub.expiresAt).toLocaleDateString()}` : 'No active plan',
      path: '/subscription',
      gradient: 'from-sky-500/20 to-blue-600/10',
      border: 'border-sky-500/30',
      statColor: '#38bdf8',
    },
  ] as const;

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <SectionHeader icon={Wallet} title="Finance Overview" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {financeItems.map(item => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={`flex flex-col items-center gap-2 p-4 rounded-2xl border bg-gradient-to-br ${item.gradient} ${item.border} hover:scale-[1.03] active:scale-[0.97] transition-all duration-200 text-center group w-full`}
          >
            <span className="text-2xl">{item.emoji}</span>
            <span className="text-sm font-bold text-foreground">{item.label}</span>
            <div>
              <p className="text-xs font-black" style={{ color: item.statColor }}>{item.stat}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{item.statLabel}</p>
            </div>
            <ArrowRight className="h-3 w-3 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main Export ───────────────────────────────────────────────────────────────
export function DashboardHome() {
  const { balance, history, positions } = useTradingStore();
  const { totalXP, completedLessons }   = useAcademyStore();
  const { user }                        = useAuthStore();
  const { events, seedEvents }          = useLiveEventStore();
  const { prices, loading }            = useTickingPrices();

  // Seed events once on mount
  useEffect(() => { seedEvents(); }, []);

  // ── Trading stats ──────────────────────────────────────────────────────────
  const closedTrades  = history.filter(r => r.action === 'close');
  const todayTrades   = closedTrades.filter(r => {
    const d = new Date(r.timestamp); const now = new Date();
    return d.getDate() === now.getDate() && d.getMonth() === now.getMonth();
  });
  const todayPnl      = todayTrades.reduce((a, r) => a + r.pnl, 0);
  const totalPnl      = closedTrades.reduce((a, r) => a + r.pnl, 0);
  const winners       = closedTrades.filter(r => r.pnl > 0);
  const winRate       = closedTrades.length > 0 ? (winners.length / closedTrades.length) * 100 : 0;
  const xpLevel       = Math.floor(totalXP / 500) + 1;
  const xpProgress    = (totalXP % 500) / 500;
  const recentTrades  = closedTrades.slice(-5).reverse();
  const totalUnrealPnl = positions.reduce((acc, pos) => {
    const price = prices[pos.coinId]?.price ?? pos.entryPrice;
    const rawPnl = pos.side === 'long' ? (price - pos.entryPrice) * pos.quantity : (pos.entryPrice - price) * pos.quantity;
    return acc + rawPnl;
  }, 0);

  // ── Events ────────────────────────────────────────────────────────────────
  const activeEvents  = Object.values(events)
    .filter(e => e.status === 'active' || e.status === 'pending')
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    .slice(0, 3);

  const { marketCap, volume24h } = useMarketOverview();

  // Subscribe to sentiment store properly (not getState() in JSX)
  const fearGreedIndex = useSentimentStore(s => {
    try { return s.getMarketFearGreed()?.index ?? 50; }
    catch { return 50; }
  });

  // ── Quick Trade Modal state ──────────────────────────────────────────────
  const [showQuickTrade, setShowQuickTrade] = useState(false);

  // ── Daily Briefing Modal ─────────────────────────────────────────────────
  const [showBriefing, setShowBriefing] = useState(() => {
    const today = new Date().toDateString();
    const lastSeen = localStorage.getItem('cv_briefing_last_seen');
    if (lastSeen === today) return false;
    // First login today — show briefing
    localStorage.setItem('cv_briefing_last_seen', today);
    return true;
  });

  // ── Daily Reward ──────────────────────────────────────────────────────────
  const [daily, setDaily]       = useState(getDailyState);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed]   = useState(false);

  const today        = new Date().toDateString();
  const canClaim     = daily.lastClaimed !== today;
  const rewardAmount = 50 + daily.streak * 10;

  const handleClaim = async () => {
    if (!canClaim || claiming) return;
    setClaiming(true);
    await new Promise(r => setTimeout(r, 800));
    // Award real XP and CP
    const xpReward = rewardAmount;
    const cpReward = 5 + (daily.streak % 7);
    try {
      useAcademyStore.getState().awardXP(`daily_${today}`, xpReward);
      useCpCoinsStore.getState().addCPCoins(cpReward);
    } catch { /* store might not be ready */ }
    const newState = { lastClaimed: today, streak: daily.lastClaimed === new Date(Date.now() - 86400000).toDateString() ? daily.streak + 1 : 1 };
    saveDailyState(newState);
    setDaily(newState);
    setClaiming(false);
    setClaimed(true);
    setTimeout(() => setClaimed(false), 3000);
  };

  const avatarSrc = user?.avatarUrl ?? `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.avatarSeed ?? 'Felix'}`;

  // ── Market Status Bar ───────────────────────────────────────────────────
  const [btcDominance, setBtcDominance] = useState(53.2);
  const [totalMarketCap, setTotalMarketCap] = useState(2.47e12);

  useEffect(() => {
    const id = setInterval(() => {
      setBtcDominance(d => Math.max(40, Math.min(63, d + (Math.random() - 0.5) * 0.15)));
      setTotalMarketCap(m => m * (1 + (Math.random() - 0.5) * 0.001));
    }, 10_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex-1 overflow-y-auto bg-background pb-24 lg:pb-6">
      {/* ── Market Status Bar ── */}
      <div className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-1.5 flex items-center gap-4 text-[11px] overflow-x-auto scrollbar-none">
          <span className="flex items-center gap-1.5 text-muted-foreground flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-[#F7931A] flex-shrink-0" />
            BTC Dominance: <span className="font-bold text-foreground">{btcDominance.toFixed(1)}%</span>
          </span>
          <span className="w-px h-3 bg-border flex-shrink-0" />
          <span className="text-muted-foreground flex-shrink-0">
            Total MCap: <span className="font-bold text-foreground">${(totalMarketCap / 1e12).toFixed(2)}T</span>
          </span>
          <span className="w-px h-3 bg-border flex-shrink-0" />
          <span className="text-muted-foreground flex-shrink-0">
            F&G: <span className={cn('font-bold', fearGreedIndex > 60 ? 'text-emerald-400' : fearGreedIndex < 40 ? 'text-red-400' : 'text-amber-400')}>{Math.round(fearGreedIndex)}/100</span>
          </span>
          <span className="w-px h-3 bg-border flex-shrink-0" />
          <span className={cn('flex-shrink-0 font-semibold', positions.length === 0 ? 'text-muted-foreground' : totalUnrealPnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
            Live P&L: {positions.length > 0 ? <AnimatedNumber value={totalUnrealPnl} format="$" /> : '—'}
          </span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── Greeting Banner ── */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/15 via-transparent to-transparent pointer-events-none" />
          <div className="flex items-center gap-4">
            <img src={avatarSrc} alt="" className="h-14 w-14 rounded-2xl border-2 border-primary/30 bg-secondary/50 flex-shrink-0 object-cover" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-muted-foreground">Welcome back,</p>
              <h1 className="text-2xl font-black text-foreground truncate">{user?.displayName ?? 'Trader'}</h1>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <span className="text-xs text-muted-foreground capitalize bg-secondary/40 px-2 py-0.5 rounded-full border border-border">
                  {user?.plan ?? 'Bronze'} Plan
                </span>
                <span className="text-xs text-primary font-semibold">Level {xpLevel}</span>
                <div className="flex items-center gap-1">
                  <div className="h-1.5 w-24 rounded-full bg-secondary/60 overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${xpProgress * 100}%` }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{totalXP} XP</span>
                </div>
              </div>
            </div>
            <Link to="/subscription"
              className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/20 border border-primary/30 text-primary text-sm font-semibold hover:bg-primary/30 transition-all flex-shrink-0">
              <Crown className="h-4 w-4" /> Upgrade
            </Link>
          </div>
        </motion.div>

        {/* ── Onboarding Checklist ── */}
        <OnboardingChecklist />

        {/* ── Account Summary Cards ── */}
        <CollapsibleSection id="account" icon={Wallet} title="Account Summary" defaultOpen>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              label: 'Total Balance', value: `${balance.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
              sub: `${positions.length} open position${positions.length !== 1 ? 's' : ''}`,
              icon: Wallet, color: '#6366f1', link: '/trading',
            },
            {
              label: "Today's P&L",
              value: todayTrades.length > 0 ? `${todayPnl >= 0 ? '+' : ''}${todayPnl.toFixed(2)}` : '—',
              sub: `${todayTrades.length} trade${todayTrades.length !== 1 ? 's' : ''} today`,
              icon: todayPnl >= 0 ? TrendingUp : TrendingDown,
              color: todayTrades.length === 0 ? '#94a3b8' : todayPnl >= 0 ? '#22c55e' : '#ef4444', link: '/portfolio',
            },
            {
              label: 'Win Rate', value: closedTrades.length > 0 ? `${winRate.toFixed(1)}%` : '—',
              sub: `${closedTrades.length} total trades`,
              icon: Target, color: '#3b82f6', link: '/portfolio',
            },
            {
              label: 'XP Points', value: totalXP.toLocaleString(),
              sub: `${completedLessons.length} lesson${completedLessons.length !== 1 ? 's' : ''} done`,
              icon: Star, color: '#f59e0b', link: '/academy',
            },
          ].map(({ label, value, sub, icon: Icon, color, link }, i) => (
            <motion.div key={label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
              <Link to={link}
                className="block bg-card border border-border rounded-2xl p-4 hover:border-border hover:shadow-lg transition-all group">
                <div className="flex items-start justify-between mb-3">
                  <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: color + '18' }}>
                    <Icon className="h-4 w-4" style={{ color }} />
                  </div>
                  <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                </div>
                <p className="text-2xl font-black text-foreground font-mono leading-none" style={{ color }}>{value}</p>
                <p className="text-[11px] text-muted-foreground mt-1">{label}</p>
                <p className="text-[10px] text-muted-foreground/50 mt-0.5">{sub}</p>
              </Link>
            </motion.div>
          ))}
        </div>
        </CollapsibleSection>

        {/* ── Daily Reward ── */}
        <DailyReward />

        {/* ── Market Overview ── */}
        <CollapsibleSection id="marketOverview" icon={BarChart2} title="Market Overview" defaultOpen>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {[
            { label: '🌍 Market Cap', value: marketCap },
            { label: '📊 24h Volume', value: volume24h },
            { label: '🔥 Fear & Greed', value: Math.round(fearGreedIndex) },
          ].map(({ label, value }) => (
            <div key={label} className="bg-card border border-border rounded-xl p-2 sm:p-3 text-center overflow-hidden">
              <span className="block text-[10px] sm:text-[11px] text-muted-foreground truncate">{label}</span>
              <p className="text-xs sm:text-sm font-black text-foreground mt-0.5 truncate">
                {label.includes('Market Cap') || label.includes('Volume') ? <AnimatedNumber value={value as number} format="$" compact /> : `${value} / 100`}
              </p>
            </div>
          ))}
        </div>
        </CollapsibleSection>

        {/* ── Live Markets + Recent Trades ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

          {/* Moving Markets */}
          <div className="lg:col-span-3 bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-5 pt-4 pb-2">
              <SectionHeader icon={BarChart2} title="Moving Markets" linkTo="/" linkLabel="Trade" />
            </div>
            <div className="divide-y divide-white/4">
              {loading
                ? Array.from({ length: 5 }, (_, i) => (
                  <div key={i} className="flex items-center gap-4 px-5 py-3">
                    <div className="h-8 w-8 rounded-xl bg-secondary/30 animate-pulse flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-16 bg-secondary/30 animate-pulse rounded" />
                      <div className="h-2 w-24 bg-secondary/20 animate-pulse rounded" />
                    </div>
                    <div className="w-24 h-8 bg-secondary/20 animate-pulse rounded" />
                    <div className="w-20 text-right space-y-1">
                      <div className="h-3 w-16 bg-secondary/30 animate-pulse rounded ml-auto" />
                      <div className="h-2 w-12 bg-secondary/20 animate-pulse rounded ml-auto" />
                    </div>
                  </div>
                ))
                : MARKET_COINS.map((coin, i) => {
                const data   = prices[coin.id];
                const price = data?.price;
                const change = data?.change;
                const livePrice = typeof price === 'number' ? price : null;
                const liveChange = typeof change === 'number' ? change : null;
                const hasLiveData = livePrice !== null && liveChange !== null;
                const isUp = (liveChange ?? 0) >= 0;
                return (
                  <motion.div key={coin.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}>
                    <Link to="/"
                      className="flex items-center gap-4 px-5 py-3 hover:bg-white/3 transition-colors group">
                      {/* Coin dot + name */}
                      <div className="flex items-center gap-3 w-32 flex-shrink-0">
                        <div className="h-8 w-8 rounded-xl flex items-center justify-center font-bold text-[11px] text-white flex-shrink-0"
                          style={{ backgroundColor: coin.color + '25' }}>
                          <span style={{ color: coin.color }}>{coin.symbol.slice(0, 2)}</span>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-foreground">{coin.symbol}</p>
                          <p className="text-[10px] text-muted-foreground">{coin.name}</p>
                        </div>
                      </div>
                      <div className="flex-1 min-w-0 flex items-center justify-center">
                        <span className={cn('text-[10px] font-semibold uppercase tracking-[0.16em]', hasLiveData ? 'text-emerald-400' : 'text-muted-foreground/60')}>
                          {hasLiveData ? 'Live feed' : 'Waiting for feed'}
                        </span>
                      </div>
                      <div className="text-right flex-shrink-0 w-28">
                        {hasLiveData ? (
                          <>
                            <p className="text-sm font-bold font-mono text-foreground">
                              ${livePrice.toLocaleString(undefined, {
                                minimumFractionDigits: livePrice > 100 ? 2 : livePrice > 1 ? 4 : 6,
                                maximumFractionDigits: livePrice > 100 ? 2 : livePrice > 1 ? 4 : 6,
                              })}
                            </p>
                            <div className={cn('flex items-center justify-end gap-1 text-xs font-semibold', isUp ? 'text-emerald-400' : 'text-red-400')}>
                              {isUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                              {isUp ? '+' : ''}{liveChange.toFixed(2)}%
                            </div>
                          </>
                        ) : (
                          <p className="text-xs font-semibold text-muted-foreground">Unavailable</p>
                        )}
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* Recent Trades */}
          <div className="lg:col-span-2 bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-5 pt-4 pb-2">
              <SectionHeader icon={Activity} title="Recent Trades" linkTo="/portfolio" />
            </div>
            {recentTrades.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-5">
                <div className="h-12 w-12 rounded-2xl bg-secondary/40 flex items-center justify-center mb-3">
                  <Activity className="h-6 w-6 text-muted-foreground/40" />
                </div>
                <p className="text-sm text-muted-foreground font-medium">No trades yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Your closed trades appear here</p>
                <Link to="/" className="mt-4 px-4 py-2 rounded-xl bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-all">
                  Start Trading
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-white/4">
                {recentTrades.map((trade, i) => {
                  const isProfit = trade.pnl >= 0;
                  const date     = new Date(trade.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                  const coinMeta = COINS.find(c => c.id === trade.coinId);
                  return (
                    <div key={trade.id} className="flex items-center gap-3 px-5 py-3">
                      <div className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: (coinMeta?.color ?? '#6366f1') + '20' }}>
                        <span className="text-[10px] font-bold" style={{ color: coinMeta?.color ?? '#6366f1' }}>
                          {trade.symbol.slice(0, 2)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">{trade.symbol}</span>
                          <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-bold',
                            trade.side === 'long' ? 'bg-emerald-400/10 text-emerald-400' : 'bg-red-400/10 text-red-400')}>
                            {trade.side.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground/60">{date} · ×{trade.leverage}</p>
                      </div>
                      <div className={cn('text-right font-mono text-sm font-bold', isProfit ? 'text-emerald-400' : 'text-red-400')}>
                        {isProfit ? '+' : ''}${(trade.pnl ?? 0).toFixed(2)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── User Portfolio Allocation ── */}
        {positions.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-5">
            <SectionHeader icon={BarChart2} title="Portfolio Allocation" />
            <div className="space-y-2 mt-2">
              {positions.map(pos => {
                const pct = balance > 0 ? ((pos.costBasis / balance) * 100) : 0;
                const coin = MARKET_COINS.find(c => c.id === pos.coinId) || COINS.find(c => c.id === pos.coinId);
                const color = coin?.color || '#6366f1';
                return (
                  <div key={pos.id} className="flex items-center gap-3">
                    <span className="text-xs font-bold w-10 text-right" style={{ color }}>{pos.symbol}</span>
                    <div className="flex-1 h-3 rounded-full bg-secondary/40 overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }} />
                    </div>
                    <span className="text-[11px] font-mono text-muted-foreground w-14 text-right">{pct.toFixed(1)}%</span>
                    <span className="text-[10px] text-muted-foreground/60">{pos.side.toUpperCase()} {pos.leverage}x</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Upcoming Events + Daily Reward ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Upcoming Events */}
          <div className="lg:col-span-2 bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-5 pt-4 pb-2">
              <SectionHeader icon={CalendarDays} title="Upcoming Events" linkTo="/events" />
            </div>
            {activeEvents.length === 0 ? (
              <div className="flex flex-col items-center py-10 text-center px-5">
                <CalendarDays className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">No active events right now</p>
                <Link to="/events" className="mt-3 text-xs text-primary hover:underline">Browse all events</Link>
              </div>
            ) : (
              <div className="space-y-3 px-5 pb-4">
                {activeEvents.map((event, i) => {
                  const isActive = event.status === 'active';
                  const starts   = new Date(event.startsAt);
                  const timeStr  = starts.toLocaleDateString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
                  return (
                    <motion.div key={event.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}>
                      <Link to="/events"
                        className="flex items-center gap-4 p-4 rounded-2xl border border-border bg-secondary/10 hover:border-border hover:bg-secondary/20 transition-all group">
                        <div className="h-10 w-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 bg-secondary/40">
                          {event.type === 'trading_competition' ? '⚔️'
                            : event.type === 'prediction_challenge' ? '🎯'
                            : event.type === 'market_analysis' ? '📊' : '🏆'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-foreground truncate">{event.title}</p>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                              isActive ? 'bg-emerald-400/10 text-emerald-400' : 'bg-amber-400/10 text-amber-400')}>
                              {isActive ? '● LIVE' : '⏳ Upcoming'}
                            </span>
                            <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                              <Clock className="h-2.5 w-2.5" />{timeStr}
                            </span>
                          </div>
                        </div>
                        {event.prizePool && (
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-black text-amber-400">{event.prizePool.toLocaleString()} CP</p>
                            <p className="text-[10px] text-muted-foreground/50">Prize Pool</p>
                          </div>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors flex-shrink-0" />
                      </Link>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Daily Reward */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-5 pt-4 pb-2">
              <SectionHeader icon={Gift} title="Daily Reward" />
            </div>
            <div className="px-5 pb-5 space-y-4">
              {/* Streak */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-400/5 border border-amber-400/15">
                <Flame className="h-5 w-5 text-amber-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-black text-amber-400">{daily.streak}-Day Streak</p>
                  <p className="text-[10px] text-muted-foreground/60">Keep it up to earn more!</p>
                </div>
              </div>

              {/* Reward amount */}
              <div className="text-center py-4">
                <div className="text-4xl font-black text-foreground">
                  <span className="text-amber-400">{rewardAmount}</span>
                  <span className="text-lg text-muted-foreground ml-1">XP</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Today's reward</p>
              </div>

              {/* 7-day dots */}
              <div className="flex justify-center gap-2">
                {Array.from({ length: 7 }, (_, i) => {
                  const isClaimed = i < (daily.streak % 7 || 7);
                  const isToday   = i === (daily.streak % 7) && canClaim;
                  return (
                    <div key={i} className={cn('h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all',
                      isClaimed ? 'bg-amber-400 text-black' : isToday ? 'bg-amber-400/30 border border-amber-400/60 text-amber-400' : 'bg-secondary/40 text-muted-foreground/40')}>
                      {isClaimed ? '✓' : i + 1}
                    </div>
                  );
                })}
              </div>

              {/* Claim button */}
              <button
                onClick={handleClaim}
                disabled={!canClaim || claiming}
                className={cn('w-full py-3 rounded-2xl font-bold text-sm transition-all',
                  canClaim && !claiming
                    ? 'bg-amber-400 text-black hover:bg-amber-300 shadow-lg shadow-amber-400/25 active:scale-95'
                    : claimed
                      ? 'bg-emerald-400/20 text-emerald-400 border border-emerald-400/30'
                      : 'bg-secondary/30 text-muted-foreground/40 cursor-not-allowed',
                )}>
                {claiming ? (
                  <span className="flex items-center justify-center gap-2"><RefreshCw className="h-4 w-4 animate-spin" /> Claiming…</span>
                ) : claimed ? (
                  <span className="flex items-center justify-center gap-2">✓ Claimed!</span>
                ) : canClaim ? (
                  <span className="flex items-center justify-center gap-2"><Gift className="h-4 w-4" /> Claim Reward</span>
                ) : (
                  <span className="flex items-center justify-center gap-2"><Clock className="h-4 w-4" /> Come back tomorrow</span>
                )}
              </button>

              {!canClaim && !claimed && (
                <p className="text-[10px] text-center text-muted-foreground/50">Resets at midnight</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Market Sentiment Widget ── */}
        <SentimentDashboardWidget />

        {/* ── Finance Quick Actions ── */}
        <DashboardFinancePanel />

        {/* ── AI Feature Widgets (Pro+) ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <AIPortfolioHealth />
          <PredictionGameWidget />
          <SocialSentimentWidget />
        </div>

        {/* ── Correlation Matrix ── */}
        <CorrelationMatrixWidget />

        {/* ── Economic Calendar ── */}
        <EconomicCalendarWidget />

        <AgentAutomationPanel />

        {/* ── Quick Actions ── */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <SectionHeader icon={Zap} title="Quick Actions" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Trade Now',    icon: Activity,    color: '#6366f1', action: () => setShowQuickTrade(true) },
              { label: 'Portfolio',    icon: BarChart2,   color: '#3b82f6', to: '/portfolio' },
              { label: 'Academy',      icon: BookOpen,    color: '#f59e0b', to: '/academy' },
              { label: 'Leaderboard',  icon: Trophy,      color: '#22c55e', to: '/leaderboard' },
            ].map(({ label, icon: Icon, color, to, action }) => (
              action ? (
                <button key={label} onClick={action}
                  className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-border bg-secondary/10 hover:border-border hover:bg-secondary/20 transition-all group text-center">
                  <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: color + '18' }}>
                    <Icon className="h-5 w-5 group-hover:scale-110 transition-transform" style={{ color }} />
                  </div>
                  <span className="text-xs font-semibold text-foreground">{label}</span>
                </button>
              ) : (
              <Link key={label} to={to!}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-border bg-secondary/10 hover:border-border hover:bg-secondary/20 transition-all group text-center">
                <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: color + '18' }}>
                  <Icon className="h-5 w-5 group-hover:scale-110 transition-transform" style={{ color }} />
                </div>
                <span className="text-xs font-semibold text-foreground">{label}</span>
              </Link>
            )))}
          </div>
        </div>

        <QuickTradeModal isOpen={showQuickTrade} onClose={() => setShowQuickTrade(false)} />
      </div>
    </div>
  );
}
