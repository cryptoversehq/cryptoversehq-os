/**
 * sentimentUtils.ts
 * Shared formatting + chart-data helpers for the Sentiment UI.
 */

import type { SentimentSnapshot, FearGreedZone, SentimentTrend } from '../../lib/sentimentTypes';
import { FEAR_GREED_META } from '../../lib/sentimentTypes';

// ── Formatters ────────────────────────────────────────────────────────────────

export function fmtSentiment(v: number): string {
  if (v >= 0.6)  return 'Very Bullish';
  if (v >= 0.2)  return 'Bullish';
  if (v >= -0.2) return 'Neutral';
  if (v >= -0.6) return 'Bearish';
  return 'Very Bearish';
}

export function sentimentColor(v: number): string {
  if (v >= 0.5)  return '#22c55e';
  if (v >= 0.15) return '#86efac';
  if (v >= -0.15)return '#a3a3a3';
  if (v >= -0.5) return '#fb923c';
  return '#ef4444';
}

export function fmtVolume(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export function fmtDelta(d: number | null, unit = 'pts'): string {
  if (d === null) return '—';
  const sign = d >= 0 ? '+' : '';
  return `${sign}${d.toFixed(1)}${unit}`;
}

export function fmtPercent(v: number): string {
  return `${(v * 100).toFixed(0)}%`;
}

export function trendIcon(t: SentimentTrend | null): string {
  if (t === 'rising')  return '↑';
  if (t === 'falling') return '↓';
  return '→';
}

export function trendColor(t: SentimentTrend | null): string {
  if (t === 'rising')  return '#22c55e';
  if (t === 'falling') return '#ef4444';
  return '#a3a3a3';
}

export function timeAgoSentiment(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  if (diff < 60_000)      return 'just now';
  if (diff < 3_600_000)   return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)  return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

// ── Chart data builders ────────────────────────────────────────────────────────

export interface FearGreedChartPoint {
  time:  string;         // HH:MM or MM-DD
  value: number;         // 0-100
  zone:  FearGreedZone;
  color: string;
}

export function buildFearGreedChartData(
  snapshots: SentimentSnapshot[],
  n = 48,
): FearGreedChartPoint[] {
  return snapshots
    .slice(0, n)
    .reverse()
    .map(s => ({
      time:  new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      value: s.fearGreedIndex,
      zone:  s.fearGreedZone,
      color: FEAR_GREED_META[s.fearGreedZone].color,
    }));
}

export interface SourceChartPoint {
  time:    string;
  twitter: number;   // -1..1 → scaled to 0..100
  reddit:  number;
  news:    number;
  overall: number;
}

export function buildSourceChartData(
  snapshots: SentimentSnapshot[],
  n = 48,
): SourceChartPoint[] {
  return snapshots
    .slice(0, n)
    .reverse()
    .map(s => ({
      time:    new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      twitter: Math.round((s.twitterSentiment + 1) / 2 * 100),
      reddit:  Math.round((s.redditSentiment  + 1) / 2 * 100),
      news:    Math.round((s.newsSentiment    + 1) / 2 * 100),
      overall: Math.round((s.overallSentiment + 1) / 2 * 100),
    }));
}

export interface VolumeChartPoint {
  time:    string;
  twitter: number;
  reddit:  number;
  news:    number;
}

export function buildVolumeChartData(
  snapshots: SentimentSnapshot[],
  n = 24,
): VolumeChartPoint[] {
  return snapshots
    .slice(0, n)
    .reverse()
    .map(s => ({
      time:    new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      twitter: s.twitterVolume,
      reddit:  s.redditVolume,
      news:    s.newsVolume,
    }));
}

// ── Heatmap helpers ────────────────────────────────────────────────────────────

export function heatmapColor(overall: number): string {
  // -1..1 → red to green
  if (overall >= 0.5)  return 'rgba(34,197,94,0.25)';
  if (overall >= 0.2)  return 'rgba(134,239,172,0.18)';
  if (overall >= -0.2) return 'rgba(163,163,163,0.12)';
  if (overall >= -0.5) return 'rgba(251,146,60,0.18)';
  return 'rgba(239,68,68,0.22)';
}

export function heatmapBorder(overall: number): string {
  if (overall >= 0.5)  return 'rgba(34,197,94,0.4)';
  if (overall >= 0.2)  return 'rgba(134,239,172,0.3)';
  if (overall >= -0.2) return 'rgba(163,163,163,0.2)';
  if (overall >= -0.5) return 'rgba(251,146,60,0.3)';
  return 'rgba(239,68,68,0.4)';
}

// ── Gauge math ─────────────────────────────────────────────────────────────────

/**
 * Map a 0-100 fear/greed value to a rotation angle for the needle.
 * Range: -135° (extreme fear) → +135° (extreme greed)
 */
export function fearGreedToAngle(value: number): number {
  const clamped = Math.max(0, Math.min(100, value));
  return -135 + (clamped / 100) * 270;
}

// ── API source configuration ───────────────────────────────────────────────────

export interface DataSourceConfig {
  id:         string;
  name:       string;
  icon:       string;
  color:      string;
  type:       'social' | 'index' | 'market' | 'search' | 'news';
  freeTier:   string;
  updateFreq: string;
  envKey?:    string;
  docsUrl:    string;
  status:     'live' | 'simulated';
}

export const DATA_SOURCES: DataSourceConfig[] = [
  {
    id: 'twitter', name: 'X / Twitter', icon: '𝕏', color: '#1d9bf0',
    type: 'social', freeTier: '100 req/month', updateFreq: 'Real-time (streaming)',
    envKey: 'VITE_TWITTER_BEARER_TOKEN', docsUrl: 'https://developer.twitter.com',
    status: 'simulated',
  },
  {
    id: 'reddit', name: 'Reddit API', icon: '🤖', color: '#ff4500',
    type: 'social', freeTier: '100 req/min', updateFreq: 'Every 5 minutes',
    envKey: 'VITE_REDDIT_CLIENT_ID', docsUrl: 'https://www.reddit.com/dev/api',
    status: 'simulated',
  },
  {
    id: 'telegram', name: 'Telegram', icon: '✈️', color: '#2aabee',
    type: 'social', freeTier: 'Unlimited', updateFreq: 'Real-time',
    docsUrl: 'https://core.telegram.org/bots/api', status: 'simulated',
  },
  {
    id: 'news', name: 'Crypto News', icon: '📰', color: '#6366f1',
    type: 'news', freeTier: '50 req/day', updateFreq: 'Every 15 minutes',
    envKey: 'VITE_NEWS_API_KEY', docsUrl: 'https://newsapi.org', status: 'simulated',
  },
  {
    id: 'google', name: 'Google Trends', icon: '🔍', color: '#4285f4',
    type: 'search', freeTier: 'Unlimited (unofficial)', updateFreq: 'Daily',
    docsUrl: 'https://trends.google.com', status: 'simulated',
  },
  {
    id: 'feargreed', name: 'Fear & Greed Index', icon: '😱', color: '#f59e0b',
    type: 'index', freeTier: 'Unlimited', updateFreq: 'Daily',
    docsUrl: 'https://alternative.me/crypto/fear-and-greed-index/', status: 'simulated',
  },
  {
    id: 'coingecko', name: 'CoinGecko Sentiment', icon: '🦎', color: '#8dc63f',
    type: 'market', freeTier: '50 calls/min', updateFreq: 'Every 5 minutes',
    docsUrl: 'https://www.coingecko.com/en/api', status: 'simulated',
  },
];
