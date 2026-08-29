/**
 * sentimentEngine.ts
 *
 * Implements the business logic from Part 4 of the Sentiment Analysis spec:
 *
 *   4.1 SentimentScoringEngine  — VADER-style word-list scoring
 *   4.2 FearGreedIndexCalculator — 5-component weighted F&G calculator
 *   4.3 SocialMediaCollector    — typed interfaces + fetch helpers for live data
 *   4.4 NewsCollector           — typed interfaces + fetch helper
 *   4.5 SentimentAlertTrigger  — combined-condition evaluation engine
 */

import { isApiEnabled, markApiUsed } from './apiStatusService';
import { proxySecretFetch } from './taskadeSecretsService';

// ─────────────────────────────────────────────────────────────────────────────
// 4.1  SENTIMENT SCORING ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export interface BatchSentimentResult {
  averageScore:        number;
  positivePercentage:  number;
  negativePercentage:  number;
  neutralPercentage:   number;
  classification:      'strong_bullish' | 'bullish' | 'neutral' | 'bearish' | 'strong_bearish';
}

export class SentimentScoringEngine {
  private readonly POSITIVE_WORDS = [
    // Core bullish
    'bullish', 'moon', 'mooning', 'pump', 'pumping', 'buy', 'buying',
    'hodl', 'hold', 'holding', 'bull', 'up', 'green', 'bullrun',
    // Gains & value
    'profit', 'profitable', 'gain', 'gains', 'surge', 'surging',
    'rocket', 'ripping', 'lambo', 'gem', 'gems', 'undervalued',
    'cheap', 'steal', 'opportunity', 'opportunities',
    // Actions
    'accumulate', 'accumulating', 'dca', 'rally', 'rallying',
    'breakout', 'breaking', 'bounce', 'bouncing', 'recovery',
    'recovering', 'support',
    // Fundamentals
    'adoption', 'institutional', 'partnership', 'partnerships',
    'launch', 'launched', 'launching', 'upgrade', 'upgraded',
    'mainnet', 'milestone', 'integration',
    // Sentiment adjectives
    'positive', 'strong', 'strength', 'good', 'great', 'excellent',
    'amazing', 'incredible', 'huge', 'massive', 'epic', 'legendary',
    'optimistic', 'confident', 'excited', 'love', 'loving', 'best',
    // ATH / price levels
    'ath', 'highs', 'alltime', 'record', 'new',
    // Emoji-adjacent terms
    'fire', 'lit', 'gem', 'gold', 'win', 'winning',
  ];

  private readonly NEGATIVE_WORDS = [
    // Core bearish
    'bearish', 'bear', 'down', 'red', 'dump', 'dumping', 'crash',
    'crashing', 'crashed', 'sell', 'selling',
    // Death / collapse
    'dead', 'dying', 'die', 'death', 'killed', 'killing', 'over',
    'worthless', 'useless', 'garbage', 'trash', 'junk', 'gone',
    'finished', 'end', 'done', 'collapse', 'collapsing', 'collapsed',
    // Fear & panic
    'panic', 'fear', 'scared', 'worried', 'worry', 'concerning',
    'dangerous', 'danger', 'warning', 'warn', 'alert', 'careful',
    // Losses
    'loss', 'losing', 'lose', 'losses', 'rekt', 'liquidation',
    'liquidated', 'margin', 'wiped', 'wipeout', 'bloodbath',
    'correction', 'correcting', 'dip', 'drop', 'dropping', 'plunge',
    'plunging', 'decline', 'declining', 'decline', 'falling', 'fall',
    // Scams / manipulation
    'fud', 'scam', 'scammer', 'rug', 'rugpull', 'exploit',
    'hack', 'hacked', 'hacker', 'fraud', 'fraudulent', 'fake',
    'manipulation', 'manipulated', 'whale', 'whales', 'ponzi', 'pyramid',
    // Regulation
    'ban', 'banned', 'banning', 'regulation', 'sec', 'lawsuit', 'sued',
    'illegal', 'shutdown', 'crackdown',
    // Overvalued
    'bubble', 'overvalued', 'oversold', 'overbought',
    // Negative adjectives
    'bad', 'terrible', 'horrible', 'awful', 'worst', 'negative',
    'weak', 'broken', 'failed', 'failure', 'disaster', 'catastrophe',
    'exit', 'short', 'shorting',
  ];

  /**
   * Score a single text string.
   * Returns a value in the range [-1, +1].
   *
   * Algorithm:
   *   1. Tokenise & strip punctuation
   *   2. Count positive/negative keyword hits
   *   3. Compute raw score = (pos - neg) / (pos + neg) — normalised ratio
   *      so even a single unambiguous word ("moon", "dead") produces a
   *      clear directional signal rather than a borderline ±0.1 value.
   *   4. Scale so a pure-positive text → ~+0.8 max, pure-negative → ~-0.8
   *   5. Clamp to [-1, +1]
   */
  calculateTextSentiment(text: string): number {
    let positiveCount = 0;
    let negativeCount = 0;

    const words = text.toLowerCase().split(/\s+/);

    for (const word of words) {
      // Strip common punctuation for cleaner matching
      const clean = word.replace(/[^a-z]/g, '');
      if (this.POSITIVE_WORDS.includes(clean)) positiveCount++;
      if (this.NEGATIVE_WORDS.includes(clean)) negativeCount++;
    }

    const total = positiveCount + negativeCount;
    if (total === 0) return 0; // Truly neutral — no sentiment keywords

    // Ratio-based score: single positive word → +1.0 ratio
    // Scale by 0.8 so there's headroom for multi-keyword boosts
    const ratio = (positiveCount - negativeCount) / total;

    // Boost: more total sentiment words → more confident signal
    const confidenceBoost = Math.min(0.2, (total - 1) * 0.05);
    const direction = ratio >= 0 ? 1 : -1;

    const raw = ratio + direction * confidenceBoost;
    return Math.max(-1, Math.min(1, raw));
  }

  /**
   * Score an array of texts, returning aggregated statistics.
   */
  calculateBatchSentiment(texts: string[]): BatchSentimentResult {
    if (texts.length === 0) {
      return {
        averageScore: 0,
        positivePercentage: 0,
        negativePercentage: 0,
        neutralPercentage: 100,
        classification: 'neutral',
      };
    }

    let totalScore     = 0;
    let positiveCount  = 0;
    let negativeCount  = 0;
    let neutralCount   = 0;

    for (const text of texts) {
      const score = this.calculateTextSentiment(text);
      totalScore += score;

      if (score > 0.2)       positiveCount++;
      else if (score < -0.2) negativeCount++;
      else                   neutralCount++;
    }

    const averageScore = totalScore / texts.length;

    return {
      averageScore,
      positivePercentage: (positiveCount / texts.length) * 100,
      negativePercentage: (negativeCount / texts.length) * 100,
      neutralPercentage:  (neutralCount  / texts.length) * 100,
      classification:     this.getClassification(averageScore),
    };
  }

  private getClassification(score: number): BatchSentimentResult['classification'] {
    if (score > 0.5)  return 'strong_bullish';
    if (score > 0.2)  return 'bullish';
    if (score > -0.2) return 'neutral';
    if (score > -0.5) return 'bearish';
    return 'strong_bearish';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4.2  FEAR & GREED INDEX CALCULATOR
// ─────────────────────────────────────────────────────────────────────────────

export interface FearGreedComponents {
  volatility:     number;   // 0–100
  momentum:       number;   // 0–100
  socialMedia:    number;   // 0–100
  dominance:      number;   // 0–100
  trends:         number;   // 0–100
  composite:      number;   // 0–100 weighted average
}

export class FearGreedIndexCalculator {
  /** Component weights matching Alternative.me methodology */
  private readonly WEIGHTS = {
    volatility:  0.25,
    momentum:    0.25,
    socialMedia: 0.15,
    dominance:   0.15,
    trends:      0.20,
  };

  /**
   * Calculate the composite Fear & Greed index from raw inputs.
   * All inputs are optional; defaults to neutral (50) when unknown.
   */
  calculate(params: {
    currentVolatility?: number;    // 0–1 (daily stddev as fraction of price)
    avgVolatility30d?:  number;
    priceChange7d?:     number;    // percent
    priceChange30d?:    number;
    twitterSentiment?:  number;    // -1..1
    btcDominance?:      number;    // 0–100
    googleTrends?:      number;    // 0–100
  }): FearGreedComponents {
    const vol     = this.volatilityScore(params.currentVolatility, params.avgVolatility30d);
    const mom     = this.momentumScore(params.priceChange7d, params.priceChange30d);
    const social  = this.socialScore(params.twitterSentiment);
    const dom     = this.dominanceScore(params.btcDominance);
    const trends  = this.trendsScore(params.googleTrends);

    const composite = Math.round(
      vol     * this.WEIGHTS.volatility  +
      mom     * this.WEIGHTS.momentum    +
      social  * this.WEIGHTS.socialMedia +
      dom     * this.WEIGHTS.dominance   +
      trends  * this.WEIGHTS.trends,
    );

    return {
      volatility:  vol,
      momentum:    mom,
      socialMedia: social,
      dominance:   dom,
      trends,
      composite:   Math.max(0, Math.min(100, composite)),
    };
  }

  private volatilityScore(current?: number, avg?: number): number {
    if (current === undefined || avg === undefined || avg === 0) return 50;
    const ratio = current / avg;
    if (ratio > 1.5) return 25;  // High volatility = Fear
    if (ratio > 1.2) return 40;
    if (ratio < 0.7) return 75;  // Low volatility = Greed
    if (ratio < 0.8) return 60;
    return 50;
  }

  private momentumScore(change7d?: number, change30d?: number): number {
    let score = 50;
    const c7  = change7d  ?? 0;
    const c30 = change30d ?? 0;

    if (c7 > 20)       score += 25;
    else if (c7 > 10)  score += 15;
    else if (c7 > 5)   score += 5;
    else if (c7 < -20) score -= 25;
    else if (c7 < -10) score -= 15;
    else if (c7 < -5)  score -= 5;

    // 30-day secondary signal (half weight)
    if (c30 > 20)       score += 12;
    else if (c30 > 10)  score += 7;
    else if (c30 < -20) score -= 12;
    else if (c30 < -10) score -= 7;

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private socialScore(twitterSentiment?: number): number {
    if (twitterSentiment === undefined) return 50;
    // Convert -1..1 → 0..100
    return Math.round((twitterSentiment + 1) * 50);
  }

  private dominanceScore(btcDominance?: number): number {
    if (btcDominance === undefined) return 50;
    // High dominance = Fear (flee to safety)
    if (btcDominance > 60) return 30;
    if (btcDominance > 55) return 40;
    if (btcDominance > 45) return 50;
    if (btcDominance > 40) return 60;
    return 70;
  }

  private trendsScore(searchInterest?: number): number {
    if (searchInterest === undefined) return 45;
    // Extremely high interest = Greed (FOMO)
    if (searchInterest > 80) return 75;
    if (searchInterest > 60) return 60;
    if (searchInterest > 40) return 50;
    if (searchInterest > 20) return 40;
    return 30;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4.3  SOCIAL MEDIA COLLECTOR  (types + fetch implementations)
// ─────────────────────────────────────────────────────────────────────────────

export interface SentimentData {
  id:          string;
  text:        string;
  sentiment:   number;    // -1..1
  author:      string;
  timestamp:   Date;
  platform:    'twitter' | 'reddit' | 'telegram';
  symbol?:     string;
  subreddit?:  string;
  channelId?:  string;
  score?:      number;
  upvoteRatio?: number;
}

export class SocialMediaCollector {
  private twitterBearerToken: string;
  private redditClientId:     string;
  private redditSecret:       string;
  private telegramBotToken:   string;

  private engine = new SentimentScoringEngine();

  constructor(config: {
    twitterBearerToken?: string;
    redditClientId?:     string;
    redditSecret?:       string;
    telegramBotToken?:   string;
  }) {
    this.twitterBearerToken = config.twitterBearerToken ?? '';
    this.redditClientId     = config.redditClientId     ?? '';
    this.redditSecret       = config.redditSecret       ?? '';
    this.telegramBotToken   = config.telegramBotToken   ?? '';
  }

  /**
   * Fetch recent tweets for a crypto symbol and score them.
   * Requires: VITE_TWITTER_BEARER_TOKEN
   */
  async collectTwitterSentiment(
    symbol:  string,
    count:   number = 100,
  ): Promise<SentimentData[]> {
    if (!this.twitterBearerToken) {
      console.warn('[SocialMediaCollector] No Twitter bearer token — returning empty');
      return [];
    }

    const query = `${symbol} crypto lang:en -is:retweet`;
    const url   = `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(query)}&max_results=${Math.min(count, 100)}&tweet.fields=created_at,author_id`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.twitterBearerToken}` },
    });

    if (!response.ok) {
      throw new Error(`Twitter API error: ${response.status} ${await response.text()}`);
    }

    const data = await response.json() as {
      data?: { id: string; text: string; created_at: string; author_id: string }[];
    };

    return (data.data ?? []).map(tweet => ({
      id:        tweet.id,
      text:      tweet.text,
      sentiment: this.engine.calculateTextSentiment(tweet.text),
      author:    tweet.author_id,
      timestamp: new Date(tweet.created_at),
      platform:  'twitter' as const,
      symbol,
    }));
  }

  /**
   * Fetch posts from a subreddit and score them.
   * Uses public Reddit JSON endpoint (no auth required for public subs).
   */
  async collectRedditSentiment(
    subreddit: string,
    limit:     number = 100,
  ): Promise<SentimentData[]> {
    const url = `https://www.reddit.com/r/${subreddit}/new.json?limit=${Math.min(limit, 100)}`;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'CryptoVerseAI/1.0' },
    });

    if (!response.ok) {
      throw new Error(`Reddit API error: ${response.status}`);
    }

    const data = await response.json() as {
      data: { children: { data: {
        id: string; title: string; selftext: string;
        author: string; created_utc: number;
        score: number; upvote_ratio: number;
      } }[] };
    };

    return data.data.children.map(child => {
      const p    = child.data;
      const text = `${p.title} ${p.selftext ?? ''}`.trim();
      return {
        id:          p.id,
        text,
        sentiment:   this.engine.calculateTextSentiment(text),
        author:      p.author,
        timestamp:   new Date(p.created_utc * 1000),
        platform:    'reddit'   as const,
        subreddit,
        score:       p.score,
        upvoteRatio: p.upvote_ratio,
      };
    });
  }

  /**
   * Fetch messages from a Telegram bot's update queue.
   * Requires: VITE_TELEGRAM_BOT_TOKEN
   */
  async collectTelegramSentiment(
    channelId: string,
    limit:     number = 100,
  ): Promise<SentimentData[]> {
    if (!this.telegramBotToken) {
      console.warn('[SocialMediaCollector] No Telegram bot token — returning empty');
      return [];
    }

    const url = `https://api.telegram.org/bot${this.telegramBotToken}/getUpdates?offset=-${limit}&limit=${limit}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Telegram API error: ${response.status}`);
    }

    const data = await response.json() as {
      result: {
        update_id: number;
        message?: {
          text?: string;
          from: { username?: string; id: number };
          date: number;
        };
      }[];
    };

    const results: SentimentData[] = [];

    for (const update of data.result) {
      if (!update.message?.text) continue;
      const text = update.message.text;
      results.push({
        id:        String(update.update_id),
        text,
        sentiment: this.engine.calculateTextSentiment(text),
        author:    update.message.from.username ?? String(update.message.from.id),
        timestamp: new Date(update.message.date * 1000),
        platform:  'telegram' as const,
        channelId,
      });
    }

    return results;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4.4  NEWS COLLECTOR
// ─────────────────────────────────────────────────────────────────────────────

export interface NewsArticle {
  id:          string;
  title:       string;
  description: string;
  sentiment:   number;   // -1..1
  source:      string;
  url:         string;
  publishedAt: Date;
  symbol:      string;
}

export class NewsCollector {
  private engine = new SentimentScoringEngine();

  /** @deprecated kept for backward-compat with any existing call sites — the
   *  key is no longer read from here. It now travels server-side via the
   *  "newsapi" Space Secret alias (see taskadeSecretsService.ts). */
  constructor(_config?: { newsApiKey?: string }) {}

  /**
   * Fetch crypto news from NewsAPI (via the server-side secret proxy) and
   * score each article. The raw key NEVER enters the browser — Taskade's
   * proxy substitutes the "newsapi" Space Secret server-side, matching the
   * same mechanism used by Admin → API Management's health check.
   */
  async collectCryptoNews(
    query: string = 'cryptocurrency',
    days:  number = 2,
  ): Promise<NewsArticle[]> {
    // Admin kill switch (Super Admin → API Management)
    if (!isApiEnabled('newsapi')) {
      console.warn('[NewsCollector] NewsAPI disabled by administrator — returning empty');
      return [];
    }

    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);
    const from = fromDate.toISOString().split('T')[0];

    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&from=${from}&sortBy=publishedAt&language=en&pageSize=20`;

    const response = await proxySecretFetch('newsapi', {
      url,
      method:  'GET',
      headers: { 'X-Api-Key': '{{secret}}' },
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`NewsAPI error: ${response.status} ${detail}`);
    }

    markApiUsed('newsapi');

    const data = await response.json() as {
      articles: {
        url: string; title: string; description?: string;
        source: { name: string }; publishedAt: string;
      }[];
    };

    return data.articles.map(article => {
      const fullText = `${article.title} ${article.description ?? ''}`;
      return {
        id:          article.url,
        title:       article.title,
        description: article.description ?? '',
        sentiment:   this.engine.calculateTextSentiment(fullText),
        source:      article.source.name,
        url:         article.url,
        publishedAt: new Date(article.publishedAt),
        symbol:      query,
      };
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4.5  SENTIMENT ALERT TRIGGER SYSTEM
// ─────────────────────────────────────────────────────────────────────────────

export type AlertType = 'fear_greed' | 'social' | 'news' | 'combined';
export type AlertConditionOp = 'above' | 'below';

export interface AlertDefinition {
  id:                  string;
  userId:              string;
  name:                string;
  type:                AlertType;
  condition:           AlertConditionOp;
  threshold:           number;
  /** For combined alerts */
  fearGreedThreshold?: number;
  socialThreshold?:    number;
  newsThreshold?:      number;
}

export interface AlertEvaluationInput {
  currentFearGreed:   number;
  socialSentiment:    number;
  newsSentiment:      number;
}

export interface AlertEvent {
  alertId:          string;
  alertName:        string;
  triggeredAt:      Date;
  input:            AlertEvaluationInput;
  message:          string;
}

/**
 * Pure evaluation engine matching §4.5 spec logic.
 * Can be used both in a polling loop and in unit tests.
 */
export class SentimentAlertTrigger {
  /**
   * Evaluate one alert definition against current market conditions.
   * Returns an AlertEvent if triggered, or null if not.
   */
  evaluate(
    alert: AlertDefinition,
    input: AlertEvaluationInput,
  ): AlertEvent | null {
    const { currentFearGreed, socialSentiment, newsSentiment } = input;
    let triggered = false;

    switch (alert.type) {
      case 'fear_greed':
        if (alert.condition === 'below' && currentFearGreed < alert.threshold) triggered = true;
        if (alert.condition === 'above' && currentFearGreed > alert.threshold) triggered = true;
        break;

      case 'social':
        if (alert.condition === 'below' && socialSentiment < alert.threshold) triggered = true;
        if (alert.condition === 'above' && socialSentiment > alert.threshold) triggered = true;
        break;

      case 'news':
        if (alert.condition === 'below' && newsSentiment < alert.threshold) triggered = true;
        if (alert.condition === 'above' && newsSentiment > alert.threshold) triggered = true;
        break;

      case 'combined': {
        const fgThr  = alert.fearGreedThreshold ?? 25;
        const socThr = alert.socialThreshold    ?? -0.5;
        const newsThr = alert.newsThreshold     ?? -0.4;
        if (
          currentFearGreed < fgThr &&
          socialSentiment  < socThr &&
          newsSentiment    < newsThr
        ) {
          triggered = true;
        }
        break;
      }
    }

    if (!triggered) return null;

    return {
      alertId:     alert.id,
      alertName:   alert.name,
      triggeredAt: new Date(),
      input,
      message:     this.generateAlertMessage(alert, input),
    };
  }

  /**
   * Evaluate a batch of alerts and return all that fired.
   */
  evaluateBatch(
    alerts: AlertDefinition[],
    input:  AlertEvaluationInput,
  ): AlertEvent[] {
    return alerts
      .map(a => this.evaluate(a, input))
      .filter((e): e is AlertEvent => e !== null);
  }

  private generateAlertMessage(
    alert: AlertDefinition,
    input: AlertEvaluationInput,
  ): string {
    switch (alert.type) {
      case 'fear_greed':
        return `Fear & Greed Index is ${Math.round(input.currentFearGreed)} (threshold: ${alert.condition} ${alert.threshold})`;
      case 'social':
        return `Social sentiment is ${input.socialSentiment.toFixed(2)} (threshold: ${alert.condition} ${alert.threshold})`;
      case 'news':
        return `News sentiment is ${input.newsSentiment.toFixed(2)} (threshold: ${alert.condition} ${alert.threshold})`;
      case 'combined':
        return `Combined panic signal: F&G ${Math.round(input.currentFearGreed)} · Social ${input.socialSentiment.toFixed(2)} · News ${input.newsSentiment.toFixed(2)}`;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MARKET REGIME CLASSIFIER
// ─────────────────────────────────────────────────────────────────────────────

export type MarketRegime =
  | 'extreme_fear'
  | 'fear'
  | 'neutral'
  | 'greed'
  | 'extreme_greed';

export interface RegimeAnalysis {
  regime:              MarketRegime;
  fearGreedIndex:      number;
  recommendation:      string;
  positionSize:        string;
  riskLevel:           'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
  dcaAdvised:          boolean;
  action:              string;
  color:               string;
  emoji:               string;
}

/**
 * Classify the current market regime from the Fear & Greed index
 * and produce the §3.6 "Current Market Regime" panel data.
 */
export function classifyMarketRegime(fearGreedIndex: number): RegimeAnalysis {
  const fg = Math.round(fearGreedIndex);

  if (fg <= 24) {
    return {
      regime:         'extreme_fear',
      fearGreedIndex: fg,
      recommendation: 'Aggressive accumulation — historically the best buying opportunity',
      positionSize:   '100% of normal (or more via DCA)',
      riskLevel:      'LOW',
      dcaAdvised:     true,
      action:         'BUY aggressively · Warren Buffett: "Be greedy when others are fearful"',
      color:          '#ef4444',
      emoji:          '😱',
    };
  }
  if (fg <= 44) {
    return {
      regime:         'fear',
      fearGreedIndex: fg,
      recommendation: 'DCA (Dollar Cost Average) into strong projects',
      positionSize:   '50% of normal',
      riskLevel:      'MEDIUM',
      dcaAdvised:     true,
      action:         'Accumulate on dips · Wait for confirmation signals',
      color:          '#f97316',
      emoji:          '😟',
    };
  }
  if (fg <= 55) {
    return {
      regime:         'neutral',
      fearGreedIndex: fg,
      recommendation: 'Hold existing positions · Wait for clearer direction',
      positionSize:   '50% of normal',
      riskLevel:      'MEDIUM',
      dcaAdvised:     false,
      action:         'HOLD · Monitor for breakout above 55 or breakdown below 45',
      color:          '#a3a3a3',
      emoji:          '😐',
    };
  }
  if (fg <= 74) {
    return {
      regime:         'greed',
      fearGreedIndex: fg,
      recommendation: 'Consider taking partial profits · Tighten stop-losses',
      positionSize:   '25% of normal',
      riskLevel:      'HIGH',
      dcaAdvised:     false,
      action:         'REDUCE exposure · Set trailing stop-loss at 10%',
      color:          '#22c55e',
      emoji:          '🤑',
    };
  }
  return {
    regime:         'extreme_greed',
    fearGreedIndex: fg,
    recommendation: 'Exit most positions · Extreme risk of correction',
    positionSize:   '0–10% of normal',
    riskLevel:      'VERY_HIGH',
    dcaAdvised:     false,
    action:         'SELL · Warren Buffett: "Be fearful when others are greedy"',
    color:          '#4ade80',
    emoji:          '🚀',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ASSET SIGNAL TABLE ROW
// ─────────────────────────────────────────────────────────────────────────────

export type AssetSignal = 'BUY' | 'HOLD' | 'SELL';

export interface AssetSignalRow {
  symbol:          string;
  sentimentIndex:  number;      // 0–100 (F&G style per coin)
  sentimentLabel:  string;
  signal:          AssetSignal;
  signalColor:     string;
  confidence:      number;      // 0–100
  action:          string;
  socialSentiment: number;      // -1..1
  newsSentiment:   number;      // -1..1
  onChainScore:    number;      // -1..1  (simulated)
}

/**
 * Compute a per-asset signal row matching the §3.6 table layout.
 */
export function computeAssetSignalRow(
  symbol:         string,
  fearGreed:      number,
  social:         number,
  news:           number,
  marketFG:       number,
): AssetSignalRow {
  // Per-coin F&G is a blend of market-wide + coin-specific sentiment
  const coinFG = Math.round(Math.max(0, Math.min(100, fearGreed)));

  // Contrarian signal from F&G
  const fgScore     = (coinFG - 50) / 50;     // -1..1
  const contraFG    = -fgScore * 0.55;
  const socialW     = social  * 0.28;
  const newsW       = news    * 0.17;
  const composite   = contraFG + socialW + newsW;

  let signal: AssetSignal;
  let signalColor: string;
  let action: string;

  if (composite >= 0.25) {
    signal = 'BUY'; signalColor = '#22c55e';
    action = coinFG <= 30 ? 'Aggressive accumulation' : 'Accumulate on dips';
  } else if (composite <= -0.25) {
    signal = 'SELL'; signalColor = '#ef4444';
    action = coinFG >= 70 ? 'Exit position — extreme greed' : 'Take profits';
  } else {
    signal = 'HOLD'; signalColor = '#f59e0b';
    action = 'Wait for confirmation';
  }

  // Confidence: factor alignment
  const aligned = [contraFG, social, news].filter(x => Math.sign(x) === Math.sign(composite)).length;
  const confidence = Math.round(40 + (aligned / 3) * 40 + Math.abs(composite) * 20);

  const sentimentLabel =
    coinFG <= 24 ? 'Extreme Fear' :
    coinFG <= 44 ? 'Fear' :
    coinFG <= 55 ? 'Neutral' :
    coinFG <= 74 ? 'Greed' : 'Extreme Greed';

  // Simulated on-chain score
  const onChainScore = Math.max(-1, Math.min(1, composite * 0.8 + (Math.random() - 0.5) * 0.2));

  return {
    symbol,
    sentimentIndex:  coinFG,
    sentimentLabel,
    signal,
    signalColor,
    confidence:      Math.min(95, Math.max(40, confidence)),
    action,
    socialSentiment: social,
    newsSentiment:   news,
    onChainScore,
  };
}
