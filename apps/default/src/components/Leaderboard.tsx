import React, { useState, useEffect, useMemo } from 'react';
import { Trophy, Medal, ArrowUp, ArrowDown, Globe, Swords, Users, Crown, TrendingUp, Search, X, ShoppingBag, Star, Sparkles, RefreshCw, Flame } from 'lucide-react';
import { useNavigate as useRRNavigate } from 'react-router-dom';
import { useCopyTradingStore } from '@/lib/copyTradingStore';
import { useCpCoinsStore } from '@/lib/cpCoinsStore';
import { CopySettingsModal } from './copyTrading/CopySettingsModal';
import { TopTrader } from '@/lib/copyTradingTypes';
import { useStrategyStore } from '@/lib/strategyStore';
import { cn } from '@/lib/utils';
import { useTradingStore } from '@/lib/tradingStore';
import { useAppStore } from '@/lib/appStore';
import { useAuthStore } from '@/lib/authStore';
import { LeaderboardGuide } from './leaderboard/LeaderboardGuide';
import { getValidTradesForLeaderboard, canParticipateInLeaderboard } from '@/lib/leaderboardEngine';
import { COUNTRIES, findCountryByName, type Country } from '@/lib/countries';

type Period = '24h' | '7d' | '30d' | 'all';

const PERIODS: { id: Period; label: string }[] = [
  { id: '24h', label: '24H' },
  { id: '7d',  label: '7D'  },
  { id: '30d', label: '30D' },
  { id: 'all', label: 'All'  },
];

// ─── Faction War end target — fixed future timestamp ─────────────────────────
// Season 4 ends 2 days 14 h 22 m from first load; anchor to page-load time.
const WAR_END_MS = Date.now() + (2 * 86_400 + 14 * 3_600 + 22 * 60) * 1_000;

function useCountdown(endMs: number) {
  const calc = () => Math.max(0, endMs - Date.now());
  const [remaining, setRemaining] = useState(calc);
  useEffect(() => {
    const id = setInterval(() => setRemaining(calc()), 1_000);
    return () => clearInterval(id);
  }, [endMs]);
  const d  = Math.floor(remaining / 86_400_000);
  const h  = Math.floor((remaining % 86_400_000) / 3_600_000);
  const m  = Math.floor((remaining % 3_600_000)  / 60_000);
  const s  = Math.floor((remaining % 60_000)      / 1_000);
  return { d, h, m, s, done: remaining === 0 };
}

type Tab = 'traders' | 'nations' | 'creators';

interface Trader {
  id: string;
  name: string;
  nation: string;
  nationColor: string;
  level: number;
  winRate: number;
  portfolio: number;
  change: number;
  streak: number;
  avatar: string;
}

interface Nation {
  id: string;
  name: string;
  flag: string;
  color: string;
  gradient: string;
  members: number;
  totalVolume: number;
  weeklyPnL: number;
  rank: number;
  description: string;
  trophies: number;
}

const TRADERS: Trader[] = [
  { id: '1', name: 'SatoshiNakamoto99', nation: 'Alpha Republic', nationColor: '#6366f1', level: 98, winRate: 87.3, portfolio: 1842000, change: 12.4, streak: 14, avatar: 'SatoshiNakamoto99' },
  { id: '2', name: 'WhaleRider_2025', nation: 'Bull Empire', nationColor: '#10b981', level: 94, winRate: 83.1, portfolio: 1540000, change: 8.2, streak: 9, avatar: 'WhaleRider' },
  { id: '3', name: 'DiamondHands_Pro', nation: 'Alpha Republic', nationColor: '#6366f1', level: 91, winRate: 81.7, portfolio: 1320000, change: -2.1, streak: 0, avatar: 'DiamondHands' },
  { id: '4', name: 'QuantumLeverage', nation: 'Bear Collective', nationColor: '#ef4444', level: 87, winRate: 79.2, portfolio: 1190000, change: 5.6, streak: 6, avatar: 'QuantumLev' },
  { id: '5', name: 'MoonMathician', nation: 'Bull Empire', nationColor: '#10b981', level: 84, winRate: 76.8, portfolio: 1050000, change: 3.1, streak: 4, avatar: 'MoonMath' },
  { id: '6', name: 'AlgoPhantom_X', nation: 'Sigma Order', nationColor: '#f59e0b', level: 81, winRate: 74.5, portfolio: 940000, change: -4.7, streak: 0, avatar: 'AlgoPhantom' },
  { id: '7', name: 'Leveraged_Legend', nation: 'Bear Collective', nationColor: '#ef4444', level: 78, winRate: 72.1, portfolio: 820000, change: 7.9, streak: 11, avatar: 'LeverLegend' },
  { id: '8', name: 'CryptoNomad_42', nation: 'Sigma Order', nationColor: '#f59e0b', level: 75, winRate: 70.3, portfolio: 730000, change: 1.3, streak: 2, avatar: 'CryptoNomad' },
  { id: '9', name: 'IronHandsOnly', nation: 'Alpha Republic', nationColor: '#6366f1', level: 71, winRate: 68.9, portfolio: 640000, change: -1.5, streak: 0, avatar: 'IronHands' },
  { id: '10', name: 'YourProfile_MVP', nation: 'Bull Empire', nationColor: '#10b981', level: 63, winRate: 68.5, portfolio: 100000, change: 0, streak: 3, avatar: 'Felix' },
];

const NATIONS: Nation[] = [
  {
    id: 'alpha', name: 'Alpha Republic', flag: '🔷', color: '#6366f1',
    gradient: 'from-indigo-500/20 to-violet-500/10',
    members: 2841, totalVolume: 94200000, weeklyPnL: 18.4, rank: 1,
    description: 'The elite guild of systematic quant traders. Precision and discipline above all.',
    trophies: 12
  },
  {
    id: 'bull', name: 'Bull Empire', flag: '🟢', color: '#10b981',
    gradient: 'from-emerald-500/20 to-green-500/10',
    members: 3102, totalVolume: 88500000, weeklyPnL: 14.2, rank: 2,
    description: 'Eternal optimists. Long-only disciples of the infinite upward cycle.',
    trophies: 8
  },
  {
    id: 'sigma', name: 'Sigma Order', flag: '🟡', color: '#f59e0b',
    gradient: 'from-amber-500/20 to-yellow-500/10',
    members: 1977, totalVolume: 71300000, weeklyPnL: 9.7, rank: 3,
    description: 'Secretive arbitrageurs operating across multiple chains and exchanges simultaneously.',
    trophies: 5
  },
  {
    id: 'bear', name: 'Bear Collective', flag: '🔴', color: '#ef4444',
    gradient: 'from-red-500/20 to-rose-500/10',
    members: 1430, totalVolume: 58900000, weeklyPnL: -3.2, rank: 4,
    description: 'Short sellers and volatility hunters. They profit when others panic.',
    trophies: 3
  },
];

const RANK_ICONS = [
  <Crown className="h-5 w-5 text-yellow-400" />,
  <Medal className="h-5 w-5 text-slate-300" />,
  <Medal className="h-5 w-5 text-amber-600" />,
];

// ─── Country leaderboard types ────────────────────────────────────────────────

interface CountryEntry {
  country:     Country;
  members:     number;
  totalVolume: number;
  weeklyPnL:   number;
  score:       number;       // composite ranking score
  isUser:      boolean;      // current user's country
}

/** Seeded pseudo-random for stable simulated stats per country code */
function seededRand(seed: string, idx: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  h = (Math.imul(17, h) + idx) | 0;
  return Math.abs(h) / 2147483647;
}

/** Build country leaderboard from active-country seeds + the current user's country */
function buildCountryLeaderboard(userCountryName: string | undefined): CountryEntry[] {
  // Seed set: well-known active countries + user's country (if set)
  const activeCodes = new Set([
    'US','GB','DE','FR','JP','CN','IN','BR','CA','AU',
    'KR','SG','AE','SA','TR','MX','ID','PK','NG','EG',
    'ZA','RU','IT','ES','NL','CH','SE','NO','PL','TH',
    'MY','PH','BD','VN','UA','AR','CO','IR','IQ','KZ',
    'GH','MA','KE','TZ','DZ','TN','ET','CM','CI','SN',
    'CZ','RO','HU','GR','PT','BE','AT','FI','DK','SK',
    'CL','PE','VE','EC','BO','CR','PY','UY','GT','PA',
    'NZ','FJ','PG',
  ]);

  // Also include the current user's country
  const userCountry = userCountryName ? findCountryByName(userCountryName) : undefined;
  if (userCountry) activeCodes.add(userCountry.code);

  const entries: CountryEntry[] = [];
  for (const c of COUNTRIES) {
    if (!activeCodes.has(c.code)) continue;
    const r1 = seededRand(c.code, 1);
    const r2 = seededRand(c.code, 2);
    const r3 = seededRand(c.code, 3);

    // Scale: US/CN/IN get much higher numbers
    const bigCountries = new Set(['US','CN','IN','BR','ID','PK']);
    const scale = bigCountries.has(c.code) ? 1.0 : 0.15 + r1 * 0.6;

    const members     = Math.round(500 + r1 * 9500 * scale);
    const totalVolume = Math.round((members * (800 + r2 * 4200)) * 1000) / 1000;
    const weeklyPnL   = +((r3 * 28 - 9).toFixed(1));
    const score       = members * 0.4 + totalVolume / 500_000 * 0.4 + (weeklyPnL > 0 ? weeklyPnL * 3 : 0) * 0.2;

    entries.push({
      country:  c,
      members,
      totalVolume,
      weeklyPnL,
      score,
      isUser: userCountry?.code === c.code,
    });
  }

  return entries.sort((a, b) => b.score - a.score);
}

export function Leaderboard() {
  const [activeTab, setActiveTab] = useState<Tab>('traders');
  const [hoveredNation, setHoveredNation] = useState<string | null>(null);
  const [countrySearch, setCountrySearch] = useState('');
  const [period, setPeriod] = useState<Period>('7d');
  void PERIODS; // ensure PERIODS is referenced

  // ── P1: Beginner guide on first visit ──
  const LEADERBOARD_GUIDE_KEY = 'cv_leaderboard_guide_dismissed';
  const [showGuide, setShowGuide] = useState(() => {
    try { return localStorage.getItem(LEADERBOARD_GUIDE_KEY) !== 'true'; } catch { return true; }
  });
  function dismissGuide() {
    try { localStorage.setItem(LEADERBOARD_GUIDE_KEY, 'true'); } catch {}
    setShowGuide(false);
  }

  // Live countdown
  const countdown = useCountdown(WAR_END_MS);

  // Live data from the global trading store
  const { balance, history } = useTradingStore();

  // Nation selection
  const { selectedNationId, joinNation, leaveNation } = useAppStore();

  // Current user (for country highlight)
  const { user } = useAuthStore();

  // ── Copy Trading integration ──────────────────────────────────────────────
  const ctTraders     = useCopyTradingStore(s => s.getTopTraders)();
  const isFollowing   = useCopyTradingStore(s => s.isFollowing);
  const ctRelations   = useCopyTradingStore(s => s.relationships);
  const [copyTarget,  setCopyTarget]  = useState<TopTrader | null>(null);
  const userId = user?.id ?? 'demo_follower';

  // Country leaderboard — rebuild whenever user's country changes
  const allCountryEntries = useMemo(
    () => buildCountryLeaderboard(user?.country),
    [user?.country],
  );

  const countryEntries = useMemo(() => {
    const q = countrySearch.toLowerCase().trim();
    if (!q) return allCountryEntries;
    return allCountryEntries.filter(e =>
      e.country.name.toLowerCase().includes(q) ||
      e.country.code.toLowerCase().includes(q) ||
      e.country.continent.toLowerCase().includes(q),
    );
  }, [allCountryEntries, countrySearch]);
  const isQuarantined = !canParticipateInLeaderboard(userId);
  const rawClosedTrades = history.filter(r => r.action === 'close');
  const closedTrades = getValidTradesForLeaderboard(rawClosedTrades);
  const winCount     = closedTrades.filter(r => r.pnl > 0).length;
  const liveWinRate  = closedTrades.length > 0
    ? Math.round((winCount / closedTrades.length) * 1000) / 10
    : 68.5; // default until first trade

  // Patch the "You" row with live values
  const liveTraders: Trader[] = TRADERS.map(t =>
    t.id === '10'
      ? { ...t, portfolio: balance, winRate: liveWinRate }
      : t,
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      
      {/* Header */}
      <div className="text-center space-y-2 pb-4">
        <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-2xl mb-3 border border-primary/20">
          <Trophy className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-3xl font-bold">Global Rankings</h2>
        <p className="text-muted-foreground text-sm max-w-lg mx-auto">
          Compete across simulated markets. Climb ranks, represent your Nation, and win exclusive prizes.
        </p>
      </div>

      {isQuarantined && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-center gap-3 text-xs text-amber-500">
          <span className="text-base">⚠️</span>
          <div>
            <p className="font-bold">Account Reset Quarantine Active</p>
            <p className="opacity-90">Your account balance was reset within the last 7 days. Under Priority 4 competition rules, your ranking is quarantined for 7 days to ensure leaderboard fairness.</p>
          </div>
        </div>
      )}

      {/* Tab Switch */}
      <div className="flex items-center bg-card border border-border rounded-xl p-1 w-fit mx-auto shadow-lg">
        <button
          onClick={() => setActiveTab('traders')}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all",
            activeTab === 'traders'
              ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <TrendingUp className="h-4 w-4" /> Top Traders
        </button>
        <button
          onClick={() => setActiveTab('nations')}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all",
            activeTab === 'nations'
              ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Globe className="h-4 w-4" /> Nations / Clans
        </button>
        <button
          onClick={() => setActiveTab('creators')}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all",
            activeTab === 'creators'
              ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <ShoppingBag className="h-4 w-4" /> Top Creators
        </button>
      </div>

      {/* ── Period filter ── */}
      {activeTab === 'traders' && (
        <div className="flex items-center gap-1.5 justify-center">
          {PERIODS.map(p => (
            <button key={p.id} onClick={() => setPeriod(p.id)}
              className={cn('px-3 py-1 rounded-lg text-xs font-semibold transition-all',
                period === p.id ? 'bg-primary text-primary-foreground' : 'bg-secondary/30 text-muted-foreground hover:bg-secondary/50')}>
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* ── P1: Beginner guide on first visit ── */}
      {showGuide && <LeaderboardGuide onDismiss={dismissGuide} />}

      {/* ── §4.1 Top Copied Traders ── */}
      {activeTab === 'traders' && (
        <div className="rounded-2xl overflow-hidden border animate-in fade-in duration-300"
          style={{ background: 'var(--bg-card)', borderColor: 'rgba(255,215,0,0.15)' }}>
          <div className="flex items-center justify-between px-5 py-3 border-b"
            style={{ borderColor: 'rgba(255,215,0,0.10)', background: 'rgba(255,215,0,0.04)' }}>
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4" style={{ color: '#FFD700' }} />
              <h3 className="font-bold text-sm text-foreground">Top Copied Traders</h3>
            </div>
            <a href="/copy-trading" className="text-xs font-semibold" style={{ color: '#FFD700' }}>
              View All →
            </a>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
            {ctTraders.slice(0, 3).map(ct => {
              const following = isFollowing(userId, ct.id);
              return (
                <div key={ct.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="text-lg shrink-0">{ct.rank === 1 ? '👑' : ct.rank === 2 ? '🥈' : '🥉'}</span>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold uppercase shrink-0"
                    style={{ background: 'rgba(255,215,0,0.12)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.2)' }}>
                    {ct.displayName.slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-foreground truncate">{ct.displayName}</p>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span style={{ color: '#34d399' }}>{ct.winRate}% win</span>
                      <span>·</span>
                      <Users className="h-2.5 w-2.5" />
                      <span>{ct.totalFollowers.toLocaleString()} followers</span>
                      <span>·</span>
                      <span>Fee: {ct.copyFeePct}%</span>
                    </div>
                  </div>
                  <span className="font-bold text-sm shrink-0" style={{ color: '#34d399' }}>+{ct.totalProfitPct}%</span>
                  {following ? (
                    <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold shrink-0"
                      style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399', border: '1px solid rgba(52,211,153,0.22)' }}>
                      ✓ Copying
                    </span>
                  ) : (
                    <button onClick={() => setCopyTarget(ct)}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all hover:opacity-80"
                      style={{ background: 'rgba(255,215,0,0.12)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.22)' }}>
                      Copy
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TRADERS TAB */}
      {activeTab === 'traders' && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-xl animate-in fade-in duration-300">
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-2 px-6 py-3 border-b border-border bg-secondary/30 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <div className="col-span-1 text-center">#</div>
            <div className="col-span-5 md:col-span-4">Trader</div>
            <div className="col-span-3 md:col-span-2 text-center hidden sm:block">Nation</div>
            <div className="col-span-3 md:col-span-2 text-right">Win Rate</div>
            <div className="col-span-3 md:col-span-2 text-right hidden md:block">Portfolio</div>
            <div className="col-span-3 md:col-span-2 text-right hidden md:block">Streak</div>
          </div>

          <div className="divide-y divide-border">
            {liveTraders.map((trader, idx) => {
              const isYou = trader.id === '10';
              const isPositive = trader.change >= 0;

              return (
                <div
                  key={trader.id}
                  className={cn(
                    "grid grid-cols-12 gap-2 px-6 py-4 items-center hover:bg-secondary/20 transition-colors group",
                    isYou && "bg-primary/5 border-l-2 border-primary"
                  )}
                >
                  {/* Rank */}
                  <div className="col-span-1 flex justify-center">
                    {idx < 3
                      ? RANK_ICONS[idx]
                      : <span className="text-sm font-bold text-muted-foreground group-hover:text-foreground transition-colors">#{idx + 1}</span>
                    }
                  </div>

                  {/* Trader Info */}
                  <div className="col-span-5 md:col-span-4 flex items-center gap-3">
                    <div className="relative flex-shrink-0">
                      <img
                        src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${trader.avatar}`}
                        alt={trader.name}
                        className="h-9 w-9 rounded-full bg-secondary border border-border"
                      />
                      {isYou && (
                        <span className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full border border-card" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className={cn("font-semibold text-sm truncate", isYou && "text-primary")}>
                        {trader.name} {isYou && <span className="text-xs font-normal opacity-70">(You)</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">Lvl {trader.level}</p>
                    </div>
                  </div>

                  {/* Nation badge */}
                  <div className="col-span-3 md:col-span-2 hidden sm:flex justify-center">
                    <span
                      className="text-xs px-2 py-1 rounded-full font-medium"
                      style={{ backgroundColor: trader.nationColor + '22', color: trader.nationColor, border: `1px solid ${trader.nationColor}44` }}
                    >
                      {trader.nation.split(' ')[0]}
                    </span>
                  </div>

                  {/* Win Rate */}
                  <div className="col-span-3 md:col-span-2 flex justify-end items-center gap-1.5">
                    <span className="font-mono text-sm font-bold">{trader.winRate.toFixed(1)}%</span>
                    {isPositive
                      ? <ArrowUp className="h-3 w-3 text-green-400 flex-shrink-0" />
                      : <ArrowDown className="h-3 w-3 text-red-400 flex-shrink-0" />
                    }
                  </div>

                  {/* Portfolio */}
                  <div className="col-span-3 md:col-span-2 text-right hidden md:block">
                    <span className="font-mono text-sm font-bold text-green-400">
                      ${(trader.portfolio / 1000000).toFixed(2)}M
                    </span>
                  </div>

                  {/* Streak */}
                  <div className="col-span-3 md:col-span-2 text-right hidden md:flex justify-end items-center gap-1">
                    {trader.streak > 0 ? (
                      <>
                        <Flame className="h-4 w-4 text-orange-400 flex-shrink-0" />
                        <span className="font-mono font-bold text-orange-400 text-sm">{trader.streak}W</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </div>

                  {/* ── §4.1 Copy button ── */}
                  {(() => {
                    // Match leaderboard trader to a top copy trader by index (demo mapping)
                    const ctTrader = ctTraders[idx % ctTraders.length];
                    const alreadyCopying = isFollowing(userId, ctTrader.id);
                    return (
                      <div className="col-span-2 flex justify-end">
                        {alreadyCopying ? (
                          <span className="px-2 py-1 rounded-lg text-[10px] font-bold"
                            style={{ background: 'rgba(52,211,153,0.10)', color: '#34d399', border: '1px solid rgba(52,211,153,0.20)' }}>
                            ✓ Copying
                          </span>
                        ) : (
                          <button onClick={() => setCopyTarget(ctTrader)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-bold transition-all hover:opacity-80"
                            style={{ background: 'rgba(255,215,0,0.08)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.18)' }}>
                            <RefreshCw className="h-2.5 w-2.5" /> Copy
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* NATIONS TAB */}
      {activeTab === 'nations' && (
        <div className="space-y-5 animate-in fade-in duration-300">

          {/* Faction War Banner */}
          <div className="relative bg-card border border-primary/20 rounded-2xl p-5 overflow-hidden shadow-lg">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-red-500/5 pointer-events-none" />
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-red-500/20 rounded-xl border border-red-500/30">
                  <Swords className="h-6 w-6 text-red-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold flex items-center gap-2">
                    Season 4 Faction War
                    <span className="text-xs px-2 py-0.5 bg-red-500/20 text-red-400 border border-red-500/20 rounded-full animate-pulse">LIVE</span>
                  </h3>
                  <p className="text-xs text-muted-foreground">Alpha Republic vs Bull Empire — 50,000 CP prize pool</p>
                </div>
              </div>
              <div className="flex flex-col items-end flex-shrink-0">
                <div className="flex items-center gap-2 text-xs font-mono">
                  <span className="text-indigo-400 font-bold">🔷 54.2%</span>
                  <div className="w-20 h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 rounded-full" style={{ width: '54.2%' }} />
                  </div>
                  <span className="text-emerald-400 font-bold">45.8% 🟢</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 font-mono tabular-nums">
                  {countdown.done
                    ? 'Season ended'
                    : `Ends ${countdown.d}d ${String(countdown.h).padStart(2,'0')}h ${String(countdown.m).padStart(2,'0')}m ${String(countdown.s).padStart(2,'0')}s`}
                </p>
              </div>
            </div>
          </div>

          {/* Country leaderboard */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-xl">

            {/* Header */}
            <div className="px-5 pt-5 pb-4 border-b border-border">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="font-bold text-base flex items-center gap-2">
                    <Globe className="h-4 w-4 text-primary" />
                    Nations Leaderboard
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {allCountryEntries.length} countries with active traders
                    {user?.country && (
                      <> · Your country: <span className="text-foreground font-medium">
                        {(() => {
                          const c = findCountryByName(user.country);
                          return c ? `${c.flag} ${c.name}` : user.country;
                        })()}
                      </span></>
                    )}
                  </p>
                </div>

                {/* Search */}
                <div className="relative w-full sm:w-56">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    value={countrySearch}
                    onChange={e => setCountrySearch(e.target.value)}
                    placeholder="Search countries…"
                    className="w-full bg-secondary/40 border border-border rounded-xl pl-8 pr-8 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40 transition-colors"
                  />
                  {countrySearch && (
                    <button
                      onClick={() => setCountrySearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Table header */}
            <div className="grid grid-cols-12 gap-2 px-5 py-2.5 border-b border-border bg-secondary/20 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              <div className="col-span-1 text-center">#</div>
              <div className="col-span-5 sm:col-span-4">Country</div>
              <div className="col-span-3 sm:col-span-2 text-center hidden sm:block">Continent</div>
              <div className="col-span-3 sm:col-span-2 text-right">Members</div>
              <div className="col-span-3 sm:col-span-2 text-right hidden sm:block">Weekly P&L</div>
              <div className="col-span-3 sm:col-span-2 text-right hidden md:block">Volume</div>
            </div>

            {/* Table rows */}
            <div className="divide-y divide-white/4 max-h-[520px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
              {countryEntries.length === 0 ? (
                <div className="py-12 text-center">
                  <span className="text-4xl mb-3 block">🌍</span>
                  <p className="text-sm text-muted-foreground">No countries found for "{countrySearch}"</p>
                </div>
              ) : (
                countryEntries.map((entry, idx) => {
                  // Find actual rank in full list
                  const rank = allCountryEntries.findIndex(e => e.country.code === entry.country.code) + 1;
                  const isPos = entry.weeklyPnL >= 0;
                  const isTop3 = rank <= 3;

                  return (
                    <div
                      key={entry.country.code}
                      className={cn(
                        'grid grid-cols-12 gap-2 px-5 py-3 items-center transition-colors hover:bg-secondary/20 group',
                        entry.isUser && 'bg-primary/5 border-l-2 border-primary',
                        isTop3 && !entry.isUser && 'bg-secondary/10',
                      )}
                    >
                      {/* Rank */}
                      <div className="col-span-1 flex justify-center items-center">
                        {rank === 1 ? (
                          <Crown className="h-4 w-4 text-yellow-400" />
                        ) : rank === 2 ? (
                          <Medal className="h-4 w-4 text-slate-300" />
                        ) : rank === 3 ? (
                          <Medal className="h-4 w-4 text-amber-600" />
                        ) : (
                          <span className="text-xs font-bold text-muted-foreground tabular-nums">
                            {rank}
                          </span>
                        )}
                      </div>

                      {/* Country */}
                      <div className="col-span-5 sm:col-span-4 flex items-center gap-2.5 min-w-0">
                        <span className="text-2xl leading-none flex-shrink-0">{entry.country.flag}</span>
                        <div className="min-w-0">
                          <p className={cn(
                            'font-semibold text-sm truncate',
                            entry.isUser ? 'text-primary' : isTop3 ? 'text-foreground' : 'text-foreground/90',
                          )}>
                            {entry.country.name}
                            {entry.isUser && (
                              <span className="ml-1.5 text-[10px] font-normal text-primary/70">(You)</span>
                            )}
                          </p>
                          <p className="text-[10px] text-muted-foreground sm:hidden">{entry.country.continent}</p>
                        </div>
                      </div>

                      {/* Continent */}
                      <div className="col-span-2 text-center hidden sm:block">
                        <span className="text-[10px] text-muted-foreground/70 bg-secondary/40 px-2 py-0.5 rounded-full">
                          {entry.country.continent}
                        </span>
                      </div>

                      {/* Members */}
                      <div className="col-span-3 sm:col-span-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Users className="h-3 w-3 text-muted-foreground/50 flex-shrink-0 hidden sm:block" />
                          <span className="font-mono text-xs font-semibold tabular-nums">
                            {entry.members >= 1000
                              ? `${(entry.members / 1000).toFixed(1)}K`
                              : entry.members.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {/* Weekly PnL */}
                      <div className="col-span-2 text-right hidden sm:flex justify-end items-center gap-1">
                        {isPos
                          ? <ArrowUp className="h-3 w-3 text-green-400 flex-shrink-0" />
                          : <ArrowDown className="h-3 w-3 text-red-400 flex-shrink-0" />
                        }
                        <span className={cn(
                          'font-mono text-xs font-bold tabular-nums',
                          isPos ? 'text-green-400' : 'text-red-400',
                        )}>
                          {isPos ? '+' : ''}{entry.weeklyPnL}%
                        </span>
                      </div>

                      {/* Volume */}
                      <div className="col-span-2 text-right hidden md:block">
                        <span className="font-mono text-xs text-muted-foreground tabular-nums">
                          ${entry.totalVolume >= 1_000_000
                            ? `${(entry.totalVolume / 1_000_000).toFixed(1)}M`
                            : `${(entry.totalVolume / 1_000).toFixed(0)}K`}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-border bg-secondary/10 flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground/50">
                {countrySearch
                  ? `${countryEntries.length} of ${allCountryEntries.length} countries shown`
                  : `${allCountryEntries.length} countries · updated live`}
              </p>
              {!user?.country && (
                <p className="text-[10px] text-primary/70">
                  Set your country in Profile to appear on this leaderboard
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── §4.5 TOP CREATORS TAB ── */}
      {activeTab === 'creators' && (
        <TopCreatorsTab currentUserId={user?.id} />
      )}

      {/* ── §4.1 Copy Settings Modal ── */}
      {copyTarget && (
        <CopySettingsModal
          trader={copyTarget}
          followerId={userId}
          onClose={() => setCopyTarget(null)}
          onSuccess={() => setCopyTarget(null)}
        />
      )}
    </div>
  );
}

// ── §4.5 Top Creators leaderboard ────────────────────────────────────────────

function TopCreatorsTab({ currentUserId }: { currentUserId?: string }) {
  const navigate = useRRNavigate();
  const strategies = useStrategyStore(s => s.strategies);

  // Aggregate per-creator stats
  const creators = useMemo(() => {
    const map: Record<string, {
      id: string; name: string; avatarSeed: string;
      totalSales: number; totalRevenue: number; avgRating: number;
      strategyCount: number; topStrategy: string;
    }> = {};

    Object.values(strategies).filter(s => s.isPublished).forEach(s => {
      if (!map[s.creatorId]) {
        map[s.creatorId] = {
          id:             s.creatorId,
          name:           s.creatorName,
          avatarSeed:     s.creatorAvatarSeed,
          totalSales:     0,
          totalRevenue:   0,
          avgRating:      0,
          strategyCount:  0,
          topStrategy:    s.name,
        };
      }
      const c = map[s.creatorId];
      c.totalSales    += s.totalSales;
      c.totalRevenue  += s.totalRevenue;
      c.strategyCount += 1;
      c.avgRating = Math.max(c.avgRating, s.rating);
      if (s.totalSales > 0 && s.totalSales >= (strategies[s.id]?.totalSales ?? 0)) {
        c.topStrategy = s.name;
      }
    });

    return Object.values(map)
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 10);
  }, [strategies]);

  const MEDAL = ['🥇', '🥈', '🥉'];

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Monthly rewards banner */}
      <div className="bg-card border rounded-2xl p-5 overflow-hidden relative"
        style={{ borderColor: 'rgba(255,215,0,0.20)', background: 'linear-gradient(135deg,rgba(255,215,0,0.06),transparent)' }}>
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-32 h-32 blur-2xl rounded-full"
          style={{ background: 'rgba(255,215,0,0.12)' }} />
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-2xl" style={{ background: 'rgba(255,215,0,0.12)', border: '1px solid rgba(255,215,0,0.20)' }}>
            <Trophy className="h-6 w-6" style={{ color: '#FFD700' }} />
          </div>
          <div className="flex-1">
            <h3 className="font-bold flex items-center gap-2">
              Monthly Creator Rewards
              <span className="text-[10px] px-2 py-0.5 rounded-full animate-pulse font-semibold"
                style={{ background: 'rgba(255,215,0,0.15)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.25)' }}>
                ACTIVE
              </span>
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Top strategy creators earn monthly CP rewards. Top Creator badge awarded to #1.
            </p>
            <div className="grid grid-cols-3 gap-3 mt-3">
              {[
                { place: '🥇 1st', prize: '10,000 CP + Badge' },
                { place: '🥈 2nd', prize: '5,000 CP' },
                { place: '🥉 3rd', prize: '2,500 CP' },
              ].map(r => (
                <div key={r.place} className="text-center p-2 rounded-xl border border-border bg-secondary/20">
                  <p className="text-xs font-bold">{r.place}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{r.prize}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Creator leaderboard */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-xl">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <ShoppingBag className="h-4 w-4 text-primary" />
          <span className="font-bold text-sm">Top Strategy Creators</span>
          <span className="text-xs text-muted-foreground ml-auto">by total revenue</span>
        </div>

        {creators.length === 0 ? (
          <div className="flex flex-col items-center py-12 gap-3 text-center px-6">
            <ShoppingBag className="h-10 w-10 opacity-20" />
            <p className="text-sm font-semibold">No creator data yet</p>
            <p className="text-xs text-muted-foreground">Be the first to publish a strategy!</p>
            <button
              onClick={() => navigate('/marketplace/create')}
              className="px-4 py-2 rounded-xl text-xs font-bold"
              style={{ background: 'rgba(255,215,0,0.10)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.20)' }}>
              Create Strategy
            </button>
          </div>
        ) : (
          <div>
            {creators.map((c, i) => {
              const isMe = c.id === currentUserId;
              const isTop = i === 0;
              return (
                <div key={c.id}
                  className="flex items-center gap-4 px-5 py-4 border-b last:border-0 border-border transition-all hover:bg-secondary/30"
                  style={isMe ? { background: 'rgba(255,215,0,0.04)' } : {}}>
                  {/* Rank */}
                  <div className="w-8 text-center shrink-0">
                    {i < 3
                      ? <span className="text-xl">{MEDAL[i]}</span>
                      : <span className="text-sm font-bold text-muted-foreground">#{i + 1}</span>}
                  </div>

                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
                    style={{ background: 'rgba(255,215,0,0.12)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.20)' }}>
                    {c.name.charAt(0).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-sm text-foreground truncate">{c.name}</p>
                      {isTop && (
                        <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                          style={{ background: 'rgba(255,215,0,0.15)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.25)' }}>
                          <Sparkles className="h-2.5 w-2.5" /> Top Creator
                        </span>
                      )}
                      {isMe && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                          style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.25)' }}>
                          You
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {c.strategyCount} {c.strategyCount === 1 ? 'strategy' : 'strategies'} · Top: {c.topStrategy.slice(0, 24)}
                    </p>
                  </div>

                  {/* Stats */}
                  <div className="hidden sm:flex items-center gap-4 text-right shrink-0">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Sales</p>
                      <p className="text-xs font-bold text-foreground">{c.totalSales.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Rating</p>
                      <p className="text-xs font-bold text-yellow-400">⭐ {c.avgRating.toFixed(1)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Revenue</p>
                      <p className="text-xs font-bold" style={{ color: '#34d399' }}>
                        {c.totalRevenue.toLocaleString()} CP
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}


