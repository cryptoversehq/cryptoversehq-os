/**
 * socialTradingFeed.ts — CryptoVerse HQ Feature #6
 * Social feed where users share trades, AI scores quality, follow system.
 * Pro+ only. Integrates with Lynx AI agent.
 */
import { deepSeekAsk } from '@/lib/deepSeekClient';

const FEED_KEY = 'cv_feat_feed';
const FOLLOW_KEY = 'cv_feat_follows';

export interface FeedPost {
  id: string; userId: string; userName: string;
  coin: string; trade: { side: string; entry: number; exit: number; pnl: number };
  description: string; qualityScore: number; likes: string[];
  createdAt: string;
}

// ─── Load / Save ───────────────────────────────────────────────────────────

function loadFeed(): FeedPost[] {
  try { return JSON.parse(localStorage.getItem(FEED_KEY)||'[]'); } catch { return []; }
}
function saveFeed(f: FeedPost[]) {
  try { localStorage.setItem(FEED_KEY,JSON.stringify(f)); } catch {}
}

// ─── AI Quality Scoring ────────────────────────────────────────────────────

export async function scorePost(description: string, pnl: number): Promise<number> {
  try {
    const r = await deepSeekAsk(`Rate this trading post quality 0-100 based on insight & clarity: "${description}". PnL: $${pnl}. Return only the number.`);
    return Math.min(100,Math.max(0,parseInt(r)||50));
  } catch { return 50; }
}

// ─── Public API ────────────────────────────────────────────────────────────

export async function publishPost(params: {
  userId: string; userName: string; coin: string;
  trade: FeedPost['trade']; description: string;
}): Promise<FeedPost> {
  const score = await scorePost(params.description, params.trade.pnl);
  const post: FeedPost = { id: `feed_${Date.now()}`, ...params, qualityScore: score, likes: [], createdAt: new Date().toISOString() };
  const feed = [post, ...loadFeed()].slice(0,200);
  saveFeed(feed);
  return post;
}

export function getFeed(filter?: { coin?: string; sort?: 'quality'|'recent' }): FeedPost[] {
  let feed = loadFeed();
  if (filter?.coin) feed = feed.filter(p => p.coin.toUpperCase() === filter.coin?.toUpperCase());
  if (filter?.sort === 'quality') feed.sort((a,b) => b.qualityScore - a.qualityScore);
  return feed;
}

export function likePost(postId: string, userId: string): void {
  const feed = loadFeed().map(p => p.id===postId && !p.likes.includes(userId) ? {...p,likes:[...p.likes,userId]} : p);
  saveFeed(feed);
}

export function followUser(followerId: string, targetId: string): void {
  try {
    const follows = JSON.parse(localStorage.getItem(FOLLOW_KEY)||'{}') as Record<string,string[]>;
    if (!follows[followerId]) follows[followerId] = [];
    if (!follows[followerId].includes(targetId)) follows[followerId].push(targetId);
    localStorage.setItem(FOLLOW_KEY,JSON.stringify(follows));
  } catch {}
}

export function getFollowing(userId: string): string[] {
  try { return JSON.parse(localStorage.getItem(FOLLOW_KEY)||'{}')[userId] || []; } catch { return []; }
}

export async function getTopTraderOfWeek(): Promise<string> {
  const feed = loadFeed();
  const lastWeek = Date.now() - 7*86400000;
  const recent = feed.filter(p => new Date(p.createdAt).getTime() > lastWeek);
  if (recent.length===0) return 'No traders this week.';
  const best = recent.reduce((a,b) => b.qualityScore > a.qualityScore ? b : a);
  return `🏆 Top Trader: **${best.userName}** — ${best.coin} trade with ${best.qualityScore} quality score`;
}
