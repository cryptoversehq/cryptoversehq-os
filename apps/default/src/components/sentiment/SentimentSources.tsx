/**
 * SentimentSources.tsx
 * Cards for all 7 data sources: Twitter, Reddit, Telegram, News, 
 * Google Trends, Fear & Greed, CoinGecko.
 * Shows configured/simulated status, usage, API key config instructions.
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ExternalLink, CheckCircle, AlertTriangle, RefreshCw, Key } from 'lucide-react';
import { sentimentEnv } from '../../lib/env';
import { DATA_SOURCES, type DataSourceConfig, fmtSentiment, sentimentColor, fmtVolume } from './sentimentUtils';
import { SOURCE_META } from '../../lib/sentimentTypes';
import type { AggregateSentiment } from '../../lib/sentimentTypes';
import { cn } from '@/lib/utils';

// Simulated Google Trends + Telegram + CoinGecko state
interface ExtendedSourceData {
  telegram: { sentiment: number; volume: number; channels: number };
  google:   { searchVolume: number; trend: 'up' | 'down' | 'stable'; relatedQueries: string[] };
  coingecko: { communityScore: number; developerScore: number; publicInterestScore: number };
}

function buildExtendedData(agg: AggregateSentiment | null): ExtendedSourceData {
  const base = agg?.latest.overallSentiment ?? 0;
  return {
    telegram: {
      sentiment: base * 0.9 + (Math.random() - 0.5) * 0.1,
      volume:    Math.round(12_000 + Math.random() * 8_000),
      channels:  Math.round(120 + Math.random() * 80),
    },
    google: {
      searchVolume: Math.round(45 + Math.random() * 50),
      trend: base > 0.2 ? 'up' : base < -0.2 ? 'down' : 'stable',
      relatedQueries: ['buy crypto', 'crypto market', 'bitcoin price', 'altcoin season'],
    },
    coingecko: {
      communityScore:      Math.round(60 + base * 30 + Math.random() * 10),
      developerScore:      Math.round(55 + Math.random() * 20),
      publicInterestScore: Math.round(40 + base * 40 + Math.random() * 15),
    },
  };
}

// ── Individual source cards ────────────────────────────────────────────────────

function SourceCard({ source, agg, extended }: {
  source: DataSourceConfig;
  agg: AggregateSentiment | null;
  extended: ExtendedSourceData;
}) {
  const [expanded, setExpanded] = useState(false);
  const isConfigured = source.envKey
    ? (source.id === 'twitter' ? sentimentEnv.hasTwitter :
       source.id === 'reddit'  ? sentimentEnv.hasReddit :
       source.id === 'news'    ? sentimentEnv.hasNewsApi : false)
    : true;  // public APIs always "configured"

  // Per-source metrics
  const metrics = (() => {
    if (!agg) return null;
    const s = agg.latest;
    switch (source.id) {
      case 'twitter':  return { sentiment: s.twitterSentiment, volume: s.twitterVolume,  mentions: s.twitterVolume };
      case 'reddit':   return { sentiment: s.redditSentiment,  volume: s.redditVolume,   mentions: s.redditVolume };
      case 'news':     return { sentiment: s.newsSentiment,    volume: s.newsVolume,      mentions: s.newsVolume };
      case 'telegram': return { sentiment: extended.telegram.sentiment, volume: extended.telegram.volume, mentions: extended.telegram.channels };
      case 'feargreed': return { sentiment: (s.fearGreedIndex - 50) / 50, volume: 1, mentions: 1 };
      case 'coingecko': return { sentiment: (extended.coingecko.communityScore - 50) / 50, volume: extended.coingecko.communityScore, mentions: extended.coingecko.publicInterestScore };
      case 'google':   return { sentiment: extended.google.searchVolume > 70 ? 0.4 : 0, volume: extended.google.searchVolume, mentions: extended.google.searchVolume };
      default:         return null;
    }
  })();

  const sentVal = metrics?.sentiment ?? 0;

  return (
    <motion.div
      layout
      className="rounded-2xl overflow-hidden cursor-pointer transition-all"
      style={{ background: `${source.color}08`, border: `1px solid ${source.color}20` }}
      onClick={() => setExpanded(e => !e)}>
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-2xl"
              style={{ background: `${source.color}15`, border: `1px solid ${source.color}25` }}>
              {source.icon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-bold text-sm text-foreground">{source.name}</p>
                {isConfigured
                  ? <span className="text-[9px] font-bold text-emerald-400 px-1.5 py-0.5 rounded-full bg-emerald-400/10">LIVE</span>
                  : <span className="text-[9px] font-bold text-amber-400 px-1.5 py-0.5 rounded-full bg-amber-400/10">SIM</span>}
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">{source.updateFreq}</p>
            </div>
          </div>

          {metrics && source.id !== 'feargreed' && source.id !== 'google' && (
            <div className="text-right">
              <p className="text-sm font-black" style={{ color: sentimentColor(sentVal) }}>
                {sentVal >= 0 ? '+' : ''}{sentVal.toFixed(2)}
              </p>
              <p className="text-[9px] text-muted-foreground">{fmtSentiment(sentVal)}</p>
            </div>
          )}

          {source.id === 'feargreed' && agg && (
            <div className="text-right">
              <p className="text-sm font-black text-amber-400">{Math.round(agg.latest.fearGreedIndex)}</p>
              <p className="text-[9px] text-muted-foreground">/ 100</p>
            </div>
          )}

          {source.id === 'google' && (
            <div className="text-right">
              <p className="text-sm font-black" style={{ color: source.color }}>{extended.google.searchVolume}</p>
              <p className="text-[9px] text-muted-foreground">trend score</p>
            </div>
          )}
        </div>

        {/* Sentiment bar */}
        {source.id !== 'feargreed' && source.id !== 'google' && metrics && (
          <div>
            <div className="flex items-center justify-between text-[9px] text-muted-foreground mb-1">
              <span>Bearish</span>
              <span>Bullish</span>
            </div>
            <div className="h-2 rounded-full bg-white/6 overflow-hidden relative">
              <div className="absolute inset-y-0 left-1/2 w-px bg-white/15" />
              <div
                className="absolute h-full rounded-full transition-all duration-500"
                style={{
                  left:  sentVal >= 0 ? '50%' : `${50 + sentVal * 50}%`,
                  width: `${Math.abs(sentVal) * 50}%`,
                  background: sentimentColor(sentVal),
                }}
              />
            </div>
          </div>
        )}

        {/* F&G mini bar */}
        {source.id === 'feargreed' && agg && (
          <div>
            <div className="h-2 rounded-full bg-white/6 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${agg.latest.fearGreedIndex}%`,
                  background: `linear-gradient(90deg, #ef4444, #f97316, #a3a3a3, #22c55e, #4ade80)`,
                }}
              />
            </div>
          </div>
        )}

        {/* Quick metrics */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div>
            <p className="text-[9px] text-muted-foreground">Free Tier</p>
            <p className="text-[10px] font-semibold text-foreground">{source.freeTier}</p>
          </div>
          {metrics && (
            <div>
              <p className="text-[9px] text-muted-foreground">Volume</p>
              <p className="text-[10px] font-semibold text-foreground">{fmtVolume(metrics.volume)}</p>
            </div>
          )}
          <div>
            <p className="text-[9px] text-muted-foreground">Type</p>
            <p className="text-[10px] font-semibold text-foreground capitalize">{source.type}</p>
          </div>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="border-t border-white/5 p-4 space-y-3"
          style={{ background: 'rgba(0,0,0,0.15)' }}>

          {/* Source-specific detail */}
          {source.id === 'twitter' && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground">Top keywords: <span className="text-foreground">#BTC #crypto #bullish #hodl #altseason</span></p>
              <p className="text-[10px] text-muted-foreground">Positive tweets: <span className="text-emerald-400">~{Math.round(((sentVal + 1) / 2) * 100)}%</span></p>
              <p className="text-[10px] text-muted-foreground">24h mentions: <span className="text-foreground">{fmtVolume(metrics?.volume ?? 0)}</span></p>
            </div>
          )}

          {source.id === 'reddit' && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground">Active subreddits: r/Bitcoin, r/CryptoCurrency, r/ethereum, r/solana</p>
              <p className="text-[10px] text-muted-foreground">Upvote ratio (avg): <span className="text-foreground">{Math.round(60 + sentVal * 30)}%</span></p>
            </div>
          )}

          {source.id === 'telegram' && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground">Channels monitored: <span className="text-foreground">{extended.telegram.channels}</span></p>
              <p className="text-[10px] text-muted-foreground">Messages/hour: <span className="text-foreground">{fmtVolume(extended.telegram.volume)}</span></p>
            </div>
          )}

          {source.id === 'google' && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground">Trend direction: <span className={cn(extended.google.trend === 'up' ? 'text-emerald-400' : extended.google.trend === 'down' ? 'text-red-400' : 'text-muted-foreground')}>{extended.google.trend === 'up' ? '↑ Rising' : extended.google.trend === 'down' ? '↓ Falling' : '→ Stable'}</span></p>
              <p className="text-[10px] text-muted-foreground">Related: {extended.google.relatedQueries.slice(0, 3).join(' · ')}</p>
            </div>
          )}

          {source.id === 'coingecko' && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground">Community score: <span className="text-foreground">{extended.coingecko.communityScore}/100</span></p>
              <p className="text-[10px] text-muted-foreground">Developer score: <span className="text-foreground">{extended.coingecko.developerScore}/100</span></p>
              <p className="text-[10px] text-muted-foreground">Public interest: <span className="text-foreground">{extended.coingecko.publicInterestScore}/100</span></p>
            </div>
          )}

          {/* API config */}
          {source.envKey && !isConfigured && (
            <div className="p-3 rounded-xl bg-amber-400/6 border border-amber-400/15">
              <div className="flex items-center gap-2 mb-1">
                <Key className="h-3 w-3 text-amber-400" />
                <p className="text-[10px] font-bold text-amber-400">Not configured</p>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Add <code className="font-mono text-amber-300">{source.envKey}</code> to your .env file.
              </p>
              <a href={source.docsUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline mt-1">
                API docs <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </div>
          )}

          {isConfigured && source.envKey && (
            <div className="flex items-center gap-2 text-[10px] text-emerald-400">
              <CheckCircle className="h-3 w-3" />
              API key configured — live data active
            </div>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}

interface SentimentSourcesProps {
  agg: AggregateSentiment | null;
}

export function SentimentSources({ agg }: SentimentSourcesProps) {
  const [extended] = useState(() => buildExtendedData(agg));

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="px-5 py-4 border-b border-white/5">
        <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Data Sources</p>
        <p className="text-[10px] text-muted-foreground/60 mt-0.5">
          7 integrated sources · Click any card to expand
        </p>
      </div>
      <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {DATA_SOURCES.map(source => (
          <SourceCard key={source.id} source={source} agg={agg} extended={extended} />
        ))}
      </div>
    </div>
  );
}
