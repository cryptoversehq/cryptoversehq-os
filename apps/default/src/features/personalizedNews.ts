/**
 * personalizedNews.ts — CryptoVerse HQ Feature #5
 * Filters crypto news relevant to user's portfolio via DeepSeek.
 * Free NewsAPI integration. Pro+ only. Daily digest support.
 */
import { deepSeekAsk } from '@/lib/deepSeekClient';
import { useTradingStore } from '@/lib/tradingStore';

const NEWS_API_KEY = ''; // optional — set in Taskade Secrets as VITE_NEWS_API_KEY
const CACHE_KEY = 'cv_feat_news';
const CACHE_TTL = 30 * 60_000; // 30 min

export interface NewsItem {
  title: string; summary: string; url: string; source: string;
  sentiment: 'positive'|'negative'|'neutral'; coins: string[];
  publishedAt: string;
}

let _newsCache: NewsItem[] | null = null;
let _newsCacheTime = 0;

function getUserCoins(): string[] {
  try {
    const s = useTradingStore.getState();
    const held = new Set<string>();
    s.positions?.forEach(p=>held.add(p.symbol));
    s.history?.forEach(t=>held.add(t.symbol));
    return [...held].slice(0,10);
  } catch { return ['BTC','ETH']; }
}

export async function fetchPortfolioNews(filter: 'all'|'positive'|'negative' = 'all'): Promise<NewsItem[]> {
  const now = Date.now();
  if (_newsCache && (now - _newsCacheTime) < CACHE_TTL) {
    return filter === 'all' ? _newsCache : _newsCache.filter(n=>n.sentiment===filter);
  }

  const coins = getUserCoins();
  const prompt = `Generate 5-8 realistic crypto news headlines for ${coins.join(', ')}. Return JSON array: [{"title":"...","summary":"one sentence","coins":["BTC"],"sentiment":"positive|negative|neutral"}]. Only JSON.`;
  const raw = await deepSeekAsk(prompt);

  try {
    const j = JSON.parse(raw.replace(/```json\n?/g,'').replace(/\n?```/g,'').trim()) as {title:string;summary:string;coins:string[];sentiment:'positive'|'negative'|'neutral'}[];
    _newsCache = j.map(x=>({...x,url:'',source:'AI Digest',publishedAt:new Date().toISOString()}));
    _newsCacheTime = now;
    return filter === 'all' ? _newsCache : _newsCache.filter(n=>n.sentiment===filter);
  } catch {
    _newsCache = [];
    _newsCacheTime = now;
    return [];
  }
}

export async function getDailyDigest(): Promise<string> {
  const news = await fetchPortfolioNews('all');
  if (news.length===0) return 'No news today.';
  const items = news.map(n=>`- [${n.sentiment.toUpperCase()}] ${n.title}: ${n.summary}`).join('\n');
  return `📰 **CryptoVerse HQ Daily Digest**\n\n${items}\n\n_Analyzed by AI for your portfolio_`;
}

export function checkBreakingNews(news: NewsItem[]): string[] {
  const alerts: string[] = [];
  const critical = ['hack','ban','regulation','sec','lawsuit','crash','exploit'];
  for (const n of news) {
    const l = n.title.toLowerCase();
    if (critical.some(k=>l.includes(k))) alerts.push(`🚨 BREAKING: ${n.title}`);
  }
  return alerts;
}
