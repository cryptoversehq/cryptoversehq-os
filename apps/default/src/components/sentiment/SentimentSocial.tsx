/**
 * SentimentSocial.tsx — §3.3 Social Media Analytics Page
 * Route: /sentiment/social
 *
 * Platform selector: Twitter | Reddit | Telegram | All
 * Symbol selector: BTC, ETH, BNB, SOL, ALL
 * Panels: tweet volume, sentiment breakdown, top hashtags, influencers,
 *         subreddits, trending posts, Telegram groups
 */
import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell,
} from 'recharts';
import { RefreshCw, TrendingUp, TrendingDown, Minus, Users, MessageSquare, Hash } from 'lucide-react';
import { toast } from 'sonner';
import { useSentimentStore } from '../../lib/sentimentStore';
import { TRACKED_SYMBOLS } from '../../lib/sentimentTypes';
import {
  fmtSentiment, sentimentColor, fmtVolume, trendColor,
} from './sentimentUtils';
import { cn } from '@/lib/utils';

type Platform = 'twitter' | 'reddit' | 'telegram' | 'all';
type SymbolFilter = string; // 'ALL' or coin symbol

// ── Seeded simulation data ────────────────────────────────────────────────────

interface TwitterData {
  volume24h:    number;
  volumeDelta:  number;   // % vs yesterday
  positive:     number;   // 0-100
  neutral:      number;
  negative:     number;
  hashtags: { tag: string; count: number }[];
  influencers: { handle: string; followers: string; sentiment: number; label: string }[];
}

interface RedditData {
  subreddits: { name: string; members: string; sentiment: number }[];
  trendingPosts: { title: string; upvotes: number; sentiment: string; direction: 'bullish' | 'bearish' | 'neutral' }[];
}

interface TelegramData {
  groups: { name: string; members: string; sentiment: number }[];
}

function buildSocialData(symbol: SymbolFilter, agg: any): { twitter: TwitterData; reddit: RedditData; telegram: TelegramData } {
  const base = agg?.latest?.overallSentiment ?? 0;
  const posBase = Math.round(50 + base * 30);
  const negBase = Math.round(15 - base * 10);
  const neuBase = 100 - posBase - negBase;

  return {
    twitter: {
      volume24h:   symbol === 'ALL' ? 145_678 : 45_678 + Math.round(Math.abs(base) * 10_000),
      volumeDelta: base >= 0 ? 12 : -8,
      positive:    Math.max(10, Math.min(80, posBase)),
      neutral:     Math.max(10, Math.min(50, neuBase)),
      negative:    Math.max(5,  Math.min(50, negBase)),
      hashtags: symbol === 'BTC' || symbol === 'ALL'
        ? [
            { tag: '#BTC',       count: 12_345 },
            { tag: '#Crypto',    count: 8_901  },
            { tag: base > 0 ? '#Bullish' : '#Bearish',   count: 5_678 },
            { tag: '#BuyTheDip', count: 3_456  },
            { tag: `#${symbol === 'ALL' ? 'Altcoin' : symbol}`,  count: 2_890 },
          ]
        : [
            { tag: `#${symbol}`,     count: 9_234  },
            { tag: '#Crypto',        count: 6_701  },
            { tag: '#DeFi',          count: 4_512  },
            { tag: base > 0 ? '#Bullish' : '#Bearish', count: 3_200 },
          ],
      influencers: [
        { handle: '@CryptoWhale',  followers: '1.2M', sentiment: 0.9,  label: 'Bullish'  },
        { handle: '@TechCrunch',   followers: '2.3M', sentiment: 0.0,  label: 'Neutral'  },
        { handle: '@CoinDesk',     followers: '1.8M', sentiment: -0.4, label: 'Bearish'  },
        { handle: '@VitalikFan',   followers: '0.9M', sentiment: 0.6,  label: 'Bullish'  },
        { handle: '@BearMarket99', followers: '0.5M', sentiment: -0.7, label: 'Very Bearish' },
      ],
    },
    reddit: {
      subreddits: [
        { name: 'r/CryptoCurrency', members: '6.2M', sentiment: base + 0.1  },
        { name: 'r/Bitcoin',        members: '4.8M', sentiment: base + 0.2  },
        { name: 'r/ethereum',       members: '2.1M', sentiment: base - 0.05 },
        { name: 'r/solana',         members: '1.3M', sentiment: base + 0.15 },
        { name: 'r/CryptoMarkets',  members: '0.9M', sentiment: base        },
      ],
      trendingPosts: [
        { title: `${symbol === 'ALL' ? 'BTC' : symbol} to $100K by end of year?`, upvotes: 2300, sentiment: 'Bullish', direction: 'bullish' },
        { title: 'Is the bear market back?',                   upvotes: 1800, sentiment: 'Bearish',  direction: 'bearish' },
        { title: 'Dollar cost averaging strategy thread',      upvotes: 1560, sentiment: 'Neutral',  direction: 'neutral' },
        { title: 'Institutional adoption accelerating',        upvotes: 1200, sentiment: 'Bullish',  direction: 'bullish' },
        { title: `${symbol === 'ALL' ? 'Altcoin' : symbol} season incoming?`, upvotes: 980, sentiment: 'Bullish', direction: 'bullish' },
      ],
    },
    telegram: {
      groups: [
        { name: 'Crypto Signals (Official)',  members: '250K', sentiment: 0.7  },
        { name: 'Whale Watching',             members: '180K', sentiment: -0.2 },
        { name: 'DeFi Insights',              members: '142K', sentiment: 0.4  },
        { name: 'Altcoin Hunters',            members: '98K',  sentiment: 0.5  },
        { name: 'Bear Market Survivors',      members: '75K',  sentiment: -0.6 },
      ],
    },
  };
}

// ── Twitter panel ─────────────────────────────────────────────────────────────

const TOOLTIP_STYLE = {
  background: '#0d1424', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 10, fontSize: 11, color: '#e2e8f0',
};

function TwitterPanel({ data }: { data: TwitterData }) {
  const sentData = [
    { label: 'Positive', value: data.positive, color: '#22c55e' },
    { label: 'Neutral',  value: data.neutral,  color: '#a3a3a3' },
    { label: 'Negative', value: data.negative, color: '#ef4444' },
  ];
  const volPos = data.volumeDelta >= 0;

  return (
    <div className="space-y-4">
      {/* Volume header */}
      <div className="flex items-center justify-between p-4 rounded-2xl"
        style={{ background: 'rgba(29,155,240,0.06)', border: '1px solid rgba(29,155,240,0.15)' }}>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase font-bold">Tweet Volume (24h)</p>
          <p className="font-black text-2xl text-[#1d9bf0] mt-0.5">{fmtVolume(data.volume24h)}</p>
        </div>
        <div className={cn('flex items-center gap-1 text-sm font-bold', volPos ? 'text-emerald-400' : 'text-red-400')}>
          {volPos ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          {volPos ? '+' : ''}{data.volumeDelta}% vs yesterday
        </div>
      </div>

      {/* Sentiment breakdown */}
      <div className="p-4 rounded-2xl"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <p className="text-[10px] font-bold text-muted-foreground uppercase mb-3">Sentiment Breakdown</p>
        <div className="flex items-center gap-4 mb-3">
          {sentData.map(s => (
            <div key={s.label} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
              <span className="text-xs text-muted-foreground">{s.label}</span>
              <span className="font-bold text-sm" style={{ color: s.color }}>{s.value}%</span>
            </div>
          ))}
        </div>
        <div className="h-3 rounded-full overflow-hidden flex">
          {sentData.map(s => (
            <div key={s.label} className="h-full transition-all duration-700"
              style={{ width: `${s.value}%`, background: s.color, opacity: 0.85 }} />
          ))}
        </div>
      </div>

      {/* Top hashtags */}
      <div className="p-4 rounded-2xl"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <p className="text-[10px] font-bold text-muted-foreground uppercase mb-3">
          <Hash className="inline h-3 w-3 mr-1" />Top Hashtags
        </p>
        <div className="flex flex-wrap gap-2">
          {data.hashtags.map(h => (
            <div key={h.tag} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl"
              style={{ background: 'rgba(29,155,240,0.08)', border: '1px solid rgba(29,155,240,0.15)' }}>
              <span className="text-[#1d9bf0] font-bold text-xs">{h.tag}</span>
              <span className="text-[10px] text-muted-foreground">({fmtVolume(h.count)})</span>
            </div>
          ))}
        </div>
      </div>

      {/* Influencers */}
      <div className="p-4 rounded-2xl"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <p className="text-[10px] font-bold text-muted-foreground uppercase mb-3">
          <Users className="inline h-3 w-3 mr-1" />Top Influencers
        </p>
        <div className="space-y-2">
          {data.influencers.map(inf => (
            <div key={inf.handle} className="flex items-center gap-3 py-1.5">
              <span className="font-mono text-xs font-bold text-[#1d9bf0] w-32 shrink-0">{inf.handle}</span>
              <span className="text-[10px] text-muted-foreground">{inf.followers} followers</span>
              <span className="ml-auto text-xs font-bold" style={{ color: sentimentColor(inf.sentiment) }}>
                {inf.sentiment >= 0 ? '+' : ''}{inf.sentiment.toFixed(1)} {inf.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Reddit panel ──────────────────────────────────────────────────────────────

function RedditPanel({ data }: { data: RedditData }) {
  return (
    <div className="space-y-4">
      {/* Subreddits */}
      <div className="p-4 rounded-2xl"
        style={{ background: 'rgba(255,69,0,0.06)', border: '1px solid rgba(255,69,0,0.15)' }}>
        <p className="text-[10px] font-bold text-muted-foreground uppercase mb-3">Top Subreddits</p>
        <div className="space-y-2.5">
          {data.subreddits.map(sub => (
            <div key={sub.name} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">{sub.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">{sub.members} members</span>
                  <span className="text-xs font-bold" style={{ color: sentimentColor(sub.sentiment) }}>
                    {sub.sentiment >= 0 ? '+' : ''}{sub.sentiment.toFixed(2)}
                  </span>
                  <span className="text-[10px]" style={{ color: sentimentColor(sub.sentiment) }}>
                    ({fmtSentiment(sub.sentiment)})
                  </span>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-white/6 overflow-hidden relative">
                <div className="absolute inset-y-0 left-1/2 w-px bg-white/15" />
                <div className="absolute h-full rounded-full"
                  style={{
                    left:  sub.sentiment >= 0 ? '50%' : `${(sub.sentiment + 1) / 2 * 100}%`,
                    width: `${Math.abs(sub.sentiment) * 50}%`,
                    background: sentimentColor(sub.sentiment),
                  }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Trending posts */}
      <div className="p-4 rounded-2xl"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <p className="text-[10px] font-bold text-muted-foreground uppercase mb-3">
          <TrendingUp className="inline h-3 w-3 mr-1" />Trending Posts
        </p>
        <div className="space-y-2">
          {data.trendingPosts.map((post, i) => (
            <div key={i} className="flex items-start gap-3 py-2 border-b border-white/4 last:border-0">
              <span className="text-[10px] text-muted-foreground/40 mt-0.5 w-4 shrink-0">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-foreground leading-snug">"{post.title}"</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-[10px] text-muted-foreground">▲ {fmtVolume(post.upvotes)} upvotes</span>
                  <span className={cn('text-[10px] font-bold',
                    post.direction === 'bullish' ? 'text-emerald-400' :
                    post.direction === 'bearish' ? 'text-red-400' : 'text-muted-foreground')}>
                    {post.direction === 'bullish' ? '📈' : post.direction === 'bearish' ? '📉' : '→'} {post.sentiment}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Telegram panel ────────────────────────────────────────────────────────────

function TelegramPanel({ data }: { data: TelegramData }) {
  return (
    <div className="p-4 rounded-2xl"
      style={{ background: 'rgba(42,171,238,0.06)', border: '1px solid rgba(42,171,238,0.15)' }}>
      <p className="text-[10px] font-bold text-muted-foreground uppercase mb-3">
        ✈️ Top Groups
      </p>
      <div className="space-y-3">
        {data.groups.map(g => (
          <div key={g.name} className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-foreground">{g.name}</p>
              <p className="text-[10px] text-muted-foreground">{g.members} members</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-bold" style={{ color: sentimentColor(g.sentiment) }}>
                {g.sentiment >= 0 ? '+' : ''}{g.sentiment.toFixed(1)}
              </p>
              <p className="text-[9px]" style={{ color: sentimentColor(g.sentiment) }}>
                {fmtSentiment(g.sentiment)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Volume bar chart (all platforms) ─────────────────────────────────────────

function VolumeChart({ data }: { data: TwitterData }) {
  const bars = [
    { label: 'Twitter', value: data.volume24h, color: '#1d9bf0' },
    { label: 'Reddit',  value: Math.round(data.volume24h * 0.35), color: '#ff4500' },
    { label: 'Telegram',value: Math.round(data.volume24h * 0.18), color: '#2aabee' },
    { label: 'News',    value: Math.round(data.volume24h * 0.08), color: '#6366f1' },
  ];
  return (
    <div className="p-4 rounded-2xl"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <p className="text-[10px] font-bold text-muted-foreground uppercase mb-3">Mention Volume by Platform (24h)</p>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={bars} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={fmtVolume} />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [fmtVolume(v), 'Mentions']} />
          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
            {bars.map((entry, i) => <Cell key={i} fill={entry.color} fillOpacity={0.85} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const PLATFORMS: { id: Platform; label: string; icon: string; color: string }[] = [
  { id: 'all',      label: 'All',      icon: '🌐', color: '#60a5fa' },
  { id: 'twitter',  label: 'Twitter',  icon: '𝕏',  color: '#1d9bf0' },
  { id: 'reddit',   label: 'Reddit',   icon: '🤖', color: '#ff4500' },
  { id: 'telegram', label: 'Telegram', icon: '✈️', color: '#2aabee' },
];

const SYMBOLS = ['ALL', ...TRACKED_SYMBOLS.slice(0, 8)];

export function SentimentSocial() {
  const { getAllAggregates } = useSentimentStore();
  const [platform, setPlatform] = useState<Platform>('all');
  const [symbol,   setSymbol]   = useState<SymbolFilter>('BTC');
  const [refreshing, setRefreshing] = useState(false);

  const allAggs = getAllAggregates();
  const agg     = allAggs.find(a => a.symbol === symbol) ?? null;

  const socialData = useMemo(() => buildSocialData(symbol, agg), [symbol, agg?.latest.overallSentiment]);

  function handleRefresh() {
    setRefreshing(true);
    setTimeout(() => { setRefreshing(false); toast.success('Social data refreshed'); }, 800);
  }

  const activePlatform = PLATFORMS.find(p => p.id === platform)!;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-black text-lg text-foreground">📱 Social Media Sentiment</h2>
        <button onClick={handleRefresh} disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border border-white/10 text-muted-foreground hover:text-foreground transition-all disabled:opacity-50">
          <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 p-4 rounded-2xl"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold text-muted-foreground uppercase">Platform:</span>
          {PLATFORMS.map(p => (
            <button key={p.id} onClick={() => setPlatform(p.id)}
              className={cn(
                'px-3 py-1.5 rounded-xl text-xs font-bold transition-all',
                platform === p.id
                  ? 'text-white border'
                  : 'text-muted-foreground border border-white/8 hover:border-white/20',
              )}
              style={platform === p.id ? { background: `${p.color}18`, borderColor: `${p.color}40`, color: p.color } : {}}>
              {p.icon} {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold text-muted-foreground uppercase">Symbol:</span>
          {SYMBOLS.map(s => (
            <button key={s} onClick={() => setSymbol(s)}
              className={cn(
                'px-3 py-1.5 rounded-xl text-xs font-bold transition-all',
                symbol === s
                  ? 'bg-primary/15 text-primary border border-primary/30'
                  : 'text-muted-foreground border border-white/8 hover:border-white/20',
              )}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* All platforms: volume comparison + aggregated sentiment */}
      {platform === 'all' && (
        <>
          <VolumeChart data={socialData.twitter} />
          <div className="grid sm:grid-cols-2 gap-5">
            <div>
              <p className="text-xs font-black text-[#1d9bf0] mb-2">𝕏 Twitter Analytics</p>
              <TwitterPanel data={socialData.twitter} />
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-xs font-black text-[#ff4500] mb-2">🤖 Reddit Analytics</p>
                <RedditPanel data={socialData.reddit} />
              </div>
              <div>
                <p className="text-xs font-black text-[#2aabee] mb-2">✈️ Telegram Analytics</p>
                <TelegramPanel data={socialData.telegram} />
              </div>
            </div>
          </div>
        </>
      )}

      {/* Individual platforms */}
      {platform === 'twitter' && (
        <>
          <p className="text-sm font-black" style={{ color: '#1d9bf0' }}>𝕏 Twitter Analytics — {symbol}</p>
          <TwitterPanel data={socialData.twitter} />
        </>
      )}
      {platform === 'reddit' && (
        <>
          <p className="text-sm font-black" style={{ color: '#ff4500' }}>🤖 Reddit Analytics — {symbol}</p>
          <RedditPanel data={socialData.reddit} />
        </>
      )}
      {platform === 'telegram' && (
        <>
          <p className="text-sm font-black" style={{ color: '#2aabee' }}>✈️ Telegram Analytics — {symbol}</p>
          <TelegramPanel data={socialData.telegram} />
        </>
      )}
    </div>
  );
}
