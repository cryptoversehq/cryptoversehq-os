/**
 * SentimentNews.tsx — §3.4 News Analytics Page
 * Route: /sentiment/news
 *
 * • News volume + delta
 * • Top headlines table with sentiment score
 * • News sentiment trend chart
 * • Sentiment by category (Regulation, Adoption, Price, Tech, Macro)
 */
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { RefreshCw, TrendingUp, TrendingDown, Wifi, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import { useSentimentStore } from '../../lib/sentimentStore';
import { NewsCollector, type NewsArticle } from '../../lib/sentimentEngine';
import { isApiEnabled } from '../../lib/apiStatusService';
import {
  fmtSentiment, sentimentColor, fmtVolume, buildSourceChartData,
} from './sentimentUtils';
import { cn } from '@/lib/utils';

// ── Static + dynamic news pool ────────────────────────────────────────────────

interface NewsItem {
  sentiment:  number;
  headline:   string;
  source:     string;
  category:   Category;
  timeAgo:    string;
}

type Category = 'Regulation' | 'Adoption' | 'Price' | 'Tech' | 'Macro';

const NEWS_POOL: NewsItem[] = [
  { sentiment: 0.8,  headline: 'Bitcoin ETF Inflows Reach Record High as Institutional Demand Surges',  source: 'CoinDesk',  category: 'Adoption',   timeAgo: '2h' },
  { sentiment: -0.6, headline: 'Regulatory Concerns Mount in Europe — MiCA Implementation Struggles',   source: 'Reuters',   category: 'Regulation', timeAgo: '3h' },
  { sentiment: 0.5,  headline: 'MicroStrategy Buys Another 10,000 BTC — Now Holds Over 200,000 Coins',  source: 'Bloomberg', category: 'Adoption',   timeAgo: '5h' },
  { sentiment: 0.0,  headline: 'Ethereum Dencun Upgrade Scheduled for Next Quarter — Details Emerge',    source: 'CoinDesk',  category: 'Tech',       timeAgo: '6h' },
  { sentiment: -0.7, headline: 'Exchange Outflows Signal Investor Fear as Market Correction Deepens',    source: 'Decrypt',   category: 'Price',      timeAgo: '8h' },
  { sentiment: 0.6,  headline: 'Solana NFT Volume Hits All-Time High — Ecosystem Shows Strength',        source: 'CoinGecko', category: 'Adoption',   timeAgo: '10h' },
  { sentiment: -0.3, headline: 'Fed Minutes: Rate Cuts Unlikely Before Mid-Year — Crypto Markets Dip',   source: 'WSJ',       category: 'Macro',      timeAgo: '12h' },
  { sentiment: 0.4,  headline: 'Layer 2 Adoption Accelerates: Base and Arbitrum Hit New TVL Records',    source: 'The Block', category: 'Tech',       timeAgo: '14h' },
  { sentiment: -0.5, headline: 'SEC Delays Spot Ethereum ETF Decision — Industry Expresses Frustration', source: 'CoinDesk',  category: 'Regulation', timeAgo: '16h' },
  { sentiment: 0.7,  headline: 'Major Bank Launches Crypto Custody Service for Institutional Clients',    source: 'FT',        category: 'Adoption',   timeAgo: '18h' },
  { sentiment: -0.4, headline: 'Stablecoin Regulatory Framework Still Unclear — Tether Under Scrutiny',  source: 'Reuters',   category: 'Regulation', timeAgo: '20h' },
  { sentiment: 0.3,  headline: 'Bitcoin Mining Difficulty Hits All-Time High as Hashrate Soars',         source: 'Decrypt',   category: 'Tech',       timeAgo: '22h' },
];

/** Best-effort keyword categorizer for live NewsAPI articles (no category field upstream). */
function categorizeArticle(text: string): Category {
  const t = text.toLowerCase();
  if (/regulat|\bsec\b|lawsuit|sued|\bban\b|banned|compliance|mica|legal/.test(t)) return 'Regulation';
  if (/\betf\b|institution|adopt|partner|custody|launch/.test(t)) return 'Adoption';
  if (/upgrade|protocol|layer\s?2|mainnet|network|blockchain tech|smart contract/.test(t)) return 'Tech';
  if (/\bfed\b|rate cut|rate hike|inflation|macro|economy|interest rate/.test(t)) return 'Macro';
  return 'Price';
}

/** Format a Date as a compact "Xh" / "Xd" relative-time string. */
function timeAgoLabel(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const hours  = Math.max(1, Math.round(diffMs / 3_600_000));
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

/** Map a real NewsArticle (from NewsCollector) into the table's NewsItem shape. */
function articleToNewsItem(a: NewsArticle): NewsItem {
  return {
    sentiment: a.sentiment,
    headline:  a.title,
    source:    a.source,
    category:  categorizeArticle(`${a.title} ${a.description}`),
    timeAgo:   timeAgoLabel(a.publishedAt),
  };
}

const _newsCollector = new NewsCollector();

const CATEGORIES: { id: Category; icon: string; sentiment: number }[] = [
  { id: 'Regulation', icon: '⚖️', sentiment: -0.6 },
  { id: 'Adoption',   icon: '🚀', sentiment: 0.7  },
  { id: 'Price',      icon: '💰', sentiment: 0.2  },
  { id: 'Tech',       icon: '🔧', sentiment: 0.4  },
  { id: 'Macro',      icon: '🌍', sentiment: -0.3 },
];

const TOOLTIP_STYLE = {
  background: '#0d1424', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 10, fontSize: 11, color: '#e2e8f0',
};

// ── Top Headlines Table ───────────────────────────────────────────────────────

function HeadlinesTable({ items, filter }: { items: NewsItem[]; filter: Category | 'All' }) {
  const filtered = filter === 'All' ? items : items.filter(i => i.category === filter);
  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="px-5 py-4 border-b border-white/5">
        <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Top Headlines</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[600px]">
          <thead style={{ background: 'rgba(0,0,0,0.15)' }}>
            <tr className="text-[10px] text-muted-foreground uppercase tracking-wider">
              <th className="px-5 py-3 text-left w-24">Sentiment</th>
              <th className="px-4 py-3 text-left">Headline</th>
              <th className="px-4 py-3 text-left">Source</th>
              <th className="px-4 py-3 text-left">Category</th>
              <th className="px-4 py-3 text-right">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/4">
            {filtered.map((item, i) => {
              const col  = sentimentColor(item.sentiment);
              const sign = item.sentiment >= 0 ? '+' : '';
              const emoji = item.sentiment >= 0.4 ? '🟢' : item.sentiment <= -0.4 ? '🔴' : '⚪';
              return (
                <tr key={i} className="hover:bg-white/2 transition-colors">
                  <td className="px-5 py-3">
                    <span className="font-bold text-xs" style={{ color: col }}>
                      {emoji} {sign}{item.sentiment.toFixed(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-foreground leading-snug max-w-xs">{item.headline}</td>
                  <td className="px-4 py-3 text-muted-foreground">{item.source}</td>
                  <td className="px-4 py-3">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/6 text-muted-foreground">
                      {item.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground/60">{item.timeAgo} ago</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Sentiment trend chart ─────────────────────────────────────────────────────

function NewsTrendChart({ snapshots }: { snapshots: any[] }) {
  const data = buildSourceChartData(snapshots, 30).map(d => ({
    time:  d.time,
    news:  ((d.news - 50) / 50).toFixed(2),  // re-scale back to -1..1
  }));

  return (
    <div className="rounded-2xl overflow-hidden p-5"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <p className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-4">News Sentiment Trend</p>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false}
            interval="preserveStartEnd" />
          <YAxis domain={[-1, 1]} tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false}
            tickFormatter={v => v.toFixed(1)} />
          <Tooltip contentStyle={TOOLTIP_STYLE}
            formatter={(v: string) => [v, 'News Sentiment']} />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />
          <ReferenceLine y={0.5}  stroke="rgba(34,197,94,0.2)"  strokeDasharray="2 2" />
          <ReferenceLine y={-0.5} stroke="rgba(239,68,68,0.2)"  strokeDasharray="2 2" />
          <Line type="monotone" dataKey="news" stroke="#6366f1" strokeWidth={2}
            dot={false} activeDot={{ r: 4, fill: '#6366f1' }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Category breakdown ────────────────────────────────────────────────────────

function CategoryBreakdown({ overallSentiment }: { overallSentiment: number }) {
  return (
    <div className="rounded-2xl p-5"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <p className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-4">Sentiment by Category</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {CATEGORIES.map(cat => {
          // Modulate slightly by overall market sentiment
          const adj    = Math.max(-1, Math.min(1, cat.sentiment + overallSentiment * 0.2));
          const col    = sentimentColor(adj);
          const label  = fmtSentiment(adj);
          const sign   = adj >= 0 ? '+' : '';
          const emoji  = adj >= 0.3 ? '🟢' : adj <= -0.3 ? '🔴' : '🟡';
          return (
            <div key={cat.id} className="rounded-2xl p-4 text-center"
              style={{ background: `${col}08`, border: `1px solid ${col}20` }}>
              <p className="text-2xl mb-1">{cat.icon}</p>
              <p className="text-[10px] font-black text-muted-foreground uppercase">{cat.id}</p>
              <p className="font-black text-lg mt-1" style={{ color: col }}>{emoji} {sign}{adj.toFixed(1)}</p>
              <p className="text-[9px] mt-0.5" style={{ color: col }}>{label}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const ALL_CATEGORIES: (Category | 'All')[] = ['All', 'Regulation', 'Adoption', 'Price', 'Tech', 'Macro'];

export function SentimentNews() {
  const { getAggregate, getLatestSnapshots } = useSentimentStore();
  const [catFilter, setCatFilter] = useState<Category | 'All'>('All');
  const [refreshing, setRefreshing] = useState(false);
  const [liveItems, setLiveItems] = useState<NewsItem[] | null>(null);
  const [liveStatus, setLiveStatus] = useState<'live' | 'simulated' | 'loading'>('loading');

  const agg      = getAggregate('BTC');
  const snapshots = getLatestSnapshots('MARKET', 30);

  const items        = liveItems ?? NEWS_POOL;
  const volume24h    = liveItems ? liveItems.length : 234;
  const volumeDelta  = -8;
  const overallSent  = agg?.latest.overallSentiment ?? 0;

  const loadNews = useCallback(async () => {
    if (!isApiEnabled('newsapi')) {
      setLiveItems(null);
      setLiveStatus('simulated');
      return;
    }
    try {
      const articles = await _newsCollector.collectCryptoNews('cryptocurrency OR bitcoin OR ethereum', 2);
      if (articles.length > 0) {
        setLiveItems(articles.map(articleToNewsItem));
        setLiveStatus('live');
      } else {
        setLiveItems(null);
        setLiveStatus('simulated');
      }
    } catch (err) {
      console.warn('[SentimentNews] Live NewsAPI fetch failed, falling back to simulated headlines:', err);
      setLiveItems(null);
      setLiveStatus('simulated');
    }
  }, []);

  useEffect(() => { loadNews(); }, [loadNews]);

  function handleRefresh() {
    setRefreshing(true);
    loadNews().finally(() => {
      setRefreshing(false);
      toast.success(liveStatus === 'live' ? 'Live news refreshed' : 'News data refreshed');
    });
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="font-black text-lg text-foreground">📰 Crypto News Sentiment</h2>
          {liveStatus === 'live' ? (
            <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(34,197,94,0.10)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)' }}>
              <Wifi className="h-2.5 w-2.5" /> Live NewsAPI
            </span>
          ) : liveStatus === 'simulated' ? (
            <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(251,191,36,0.10)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.25)' }}>
              <WifiOff className="h-2.5 w-2.5" /> Simulated
            </span>
          ) : null}
        </div>
        <button onClick={handleRefresh} disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border border-white/10 text-muted-foreground hover:text-foreground transition-all disabled:opacity-50">
          <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Volume banner */}
      <div className="flex flex-wrap items-center gap-4 px-5 py-4 rounded-2xl"
        style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase">News Volume (24h)</p>
          <p className="font-black text-2xl text-[#6366f1]">{volume24h} articles</p>
        </div>
        <div className={cn('flex items-center gap-1 font-bold text-sm', volumeDelta >= 0 ? 'text-emerald-400' : 'text-red-400')}>
          {volumeDelta >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          {volumeDelta >= 0 ? '+' : ''}{volumeDelta}% vs yesterday
        </div>

        {/* Category filter */}
        <div className="ml-auto flex flex-wrap gap-1">
          {ALL_CATEGORIES.map(cat => (
            <button key={cat} onClick={() => setCatFilter(cat)}
              className={cn(
                'px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all',
                catFilter === cat
                  ? 'bg-primary/15 text-primary border border-primary/25'
                  : 'text-muted-foreground hover:text-foreground border border-transparent hover:border-white/15',
              )}>
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Headlines */}
      <HeadlinesTable items={items} filter={catFilter} />

      {/* Trend chart */}
      <NewsTrendChart snapshots={snapshots} />

      {/* Category breakdown */}
      <CategoryBreakdown overallSentiment={overallSent} />
    </div>
  );
}
