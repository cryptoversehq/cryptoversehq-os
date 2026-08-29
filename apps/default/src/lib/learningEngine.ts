/**
 * learningEngine.ts — Lynx AI Learning Engine
 * Continuously learns user behavior patterns.
 * Detects favorites, mistakes, biases, patterns. Updates user profile continuously.
 * Integrates with Orchestrator and Memory Engine.
 */

import type { OrchestratorContext, EngineContract } from './lynxOrchestrator';
import { lynxEvents } from './eventSystem';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface FavoriteCoin {
  symbol: string;
  trades: number;
  lastTraded: number;
  avgProfit: number;
  winRate: number;
}

export interface TradeTime {
  hour: number;
  trades: number;
  winRate: number;
}

export interface CommonMistake {
  pattern: string;
  description: string;
  occurrences: number;
  lastOccurrence: number;
  severity: 'low' | 'medium' | 'high';
}

export interface EmotionalBias {
  type: 'overtrading' | 'fear_of_loss' | 'revenge_trading' | 'fomo' | 'overconfidence' | 'hesitation';
  score: number; // 0-100, higher = more biased
  detected: number; // times detected
  lastDetected: number;
}

export interface RiskHabit {
  label: string;
  value: number;
  trend: 'improving' | 'stable' | 'worsening';
  lastUpdate: number;
}

export interface BehaviorPattern {
  type: 'successful' | 'failed';
  description: string;
  conditions: Record<string, any>;
  occurrences: number;
  avgResult: number;
  confidence: number;
}

export interface LearningProfile {
  userId: string;
  // Favorites
  favoriteCoins: FavoriteCoin[];
  favoriteTimes: TradeTime[];
  favoriteIndicators: string[];
  // Mistakes & Biases
  commonMistakes: CommonMistake[];
  emotionalBiases: EmotionalBias[];
  riskHabits: RiskHabit[];
  // Patterns
  successfulPatterns: BehaviorPattern[];
  failedPatterns: BehaviorPattern[];
  // Scores
  learningScore: number; // 0-100
  confidenceScore: number; // 0-100
  recommendationAccuracy: number; // %
  coachAccuracy: number; // %
  // Tracking
  totalRecommendations: number;
  acceptedRecommendations: number;
  totalCoachSuggestions: number;
  followedCoachSuggestions: number;
  lastUpdated: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LearningEngine
// ═══════════════════════════════════════════════════════════════════════════════

class LearningEngine {
  private profiles: Map<string, LearningProfile> = new Map();
  private registered = false;
  private enabled = true;
  private readonly KEY_PREFIX = 'cv_lynx_learning_';

  constructor() {
    this.listenToEvents();
  }

  // ── Public API ──────────────────────────────────────────────────────────

  enable(): void { this.enabled = true; }
  disable(): void { this.enabled = false; }
  isEnabled(): boolean { return this.enabled; }

  /** Get or create a learning profile */
  getProfile(userId: string): LearningProfile {
    if (!this.profiles.has(userId)) {
      this.profiles.set(userId, this.load(userId) || this.createDefault(userId));
    }
    return this.profiles.get(userId)!;
  }

  /** Track a trade to learn from it */
  trackTrade(userId: string, data: {
    symbol: string;
    side: 'long' | 'short';
    leverage: number;
    pnl: number;
    timestamp: number;
    indicators?: string[];
  }): void {
    const profile = this.getProfile(userId);
    const isWin = data.pnl > 0;
    const hour = new Date(data.timestamp).getHours();

    // Learn favorite coins
    this.updateFavoriteCoin(profile, data.symbol, isWin, data.pnl, data.timestamp);

    // Learn favorite times
    this.updateFavoriteTime(profile, hour, isWin);

    // Learn favorite indicators
    if (data.indicators) {
      for (const ind of data.indicators) {
        this.updateFavoriteIndicator(profile, ind);
      }
    }

    // Detect common mistakes
    this.detectMistakes(profile, data);

    // Detect emotional biases
    this.detectEmotionalBias(profile, data);

    // Detect risk habits
    this.detectRiskHabits(profile, data);

    // Update patterns
    this.updatePatterns(profile, data);

    // Update scores
    this.updateScores(profile);

    profile.lastUpdated = Date.now();
    this.persist(userId);
  }

  /** Track a recommendation acceptance/rejection */
  trackRecommendation(userId: string, accepted: boolean): void {
    const profile = this.getProfile(userId);
    profile.totalRecommendations++;
    if (accepted) profile.acceptedRecommendations++;
    profile.recommendationAccuracy = profile.totalRecommendations > 0
      ? (profile.acceptedRecommendations / profile.totalRecommendations) * 100
      : 0;
    profile.lastUpdated = Date.now();
    this.persist(userId);
  }

  /** Track a coaching suggestion follow-up */
  trackCoaching(userId: string, followed: boolean): void {
    const profile = this.getProfile(userId);
    profile.totalCoachSuggestions++;
    if (followed) profile.followedCoachSuggestions++;
    profile.coachAccuracy = profile.totalCoachSuggestions > 0
      ? (profile.followedCoachSuggestions / profile.totalCoachSuggestions) * 100
      : 0;
    profile.lastUpdated = Date.now();
    this.persist(userId);
  }

  /** Get user insights for AI prompting */
  getInsights(userId: string): string {
    const p = this.getProfile(userId);
    const lines: string[] = ['User Behavior Insights:'];

    if (p.favoriteCoins.length > 0) {
      const top = p.favoriteCoins.sort((a, b) => b.trades - a.trades).slice(0, 3);
      lines.push(`- Top coins: ${top.map(c => `${c.symbol}(${c.trades})`).join(', ')}`);
    }
    if (p.favoriteTimes.length > 0) {
      const peak = p.favoriteTimes.sort((a, b) => b.trades - a.trades)[0];
      lines.push(`- Peak trading hour: ${peak.hour}:00 (${peak.trades} trades, ${peak.winRate.toFixed(1)}% WR)`);
    }
    if (p.commonMistakes.length > 0) {
      const worst = p.commonMistakes.sort((a, b) => b.occurrences - a.occurrences)[0];
      lines.push(`- Top mistake: ${worst.pattern} (${worst.occurrences}x)`);
    }
    if (p.emotionalBiases.length > 0) {
      const biased = p.emotionalBiases.filter(b => b.score > 50).sort((a, b) => b.score - a.score);
      if (biased.length > 0) lines.push(`- Emotional bias: ${biased[0].type} (${biased[0].score}/100)`);
    }
    lines.push(`- Learning Score: ${p.learningScore}/100`);
    lines.push(`- Coach Accuracy: ${p.coachAccuracy.toFixed(1)}%`);

    return lines.join('\n');
  }

  // ── Orchestrator Integration ────────────────────────────────────────────

  async execute(context: OrchestratorContext): Promise<void> {
    const userId = context.userId || 'anonymous';
    this.getProfile(userId);

    if (context.event?.type === 'TRADE_OPEN' || context.event?.type === 'TRADE_CLOSE') {
      const e = context.event as any;
      if (e.type === 'TRADE_CLOSE') {
        this.trackTrade(userId, {
          symbol: e.symbol,
          side: e.side || 'long',
          leverage: e.leverage || 1,
          pnl: e.pnl || 0,
          timestamp: e.timestamp || Date.now(),
        });
      }
    }
  }

  getOrchestratorContract(): EngineContract {
    return {
      name: 'learningEngine',
      priority: 10,
      dependencies: ['contextEngine', 'memoryEngine', 'brainEngine'],
      initialize: async () => { this.registered = true; },
      execute: (ctx) => this.execute(ctx),
      shutdown: async () => { this.registered = false; },
      health: () => ({
        status: this.registered ? 'healthy' : 'degraded',
        lastRun: null, lastDuration: 0, errorCount: 0, totalRuns: 0, avgDuration: 0,
      }),
    };
  }

  // ── Private: Learning Methods ───────────────────────────────────────────

  private updateFavoriteCoin(p: LearningProfile, symbol: string, isWin: boolean, pnl: number, ts: number): void {
    let coin = p.favoriteCoins.find(c => c.symbol === symbol);
    if (!coin) {
      coin = { symbol, trades: 0, lastTraded: ts, avgProfit: 0, winRate: 0 };
      p.favoriteCoins.push(coin);
    }
    coin.trades++;
    coin.lastTraded = ts;
    coin.avgProfit = ((coin.avgProfit * (coin.trades - 1)) + pnl) / coin.trades;
    const wins = isWin ? 1 : 0;
    coin.winRate = ((coin.winRate * (coin.trades - 1)) + (wins * 100)) / coin.trades;
    // Keep top 10
    p.favoriteCoins.sort((a, b) => b.trades - a.trades);
    if (p.favoriteCoins.length > 10) p.favoriteCoins = p.favoriteCoins.slice(0, 10);
  }

  private updateFavoriteTime(p: LearningProfile, hour: number, isWin: boolean): void {
    let time = p.favoriteTimes.find(t => t.hour === hour);
    if (!time) {
      time = { hour, trades: 0, winRate: 0 };
      p.favoriteTimes.push(time);
    }
    time.trades++;
    time.winRate = ((time.winRate * (time.trades - 1)) + (isWin ? 100 : 0)) / time.trades;
  }

  private updateFavoriteIndicator(p: LearningProfile, indicator: string): void {
    if (!p.favoriteIndicators.includes(indicator)) {
      p.favoriteIndicators.push(indicator);
      if (p.favoriteIndicators.length > 10) p.favoriteIndicators.shift();
    }
  }

  private detectMistakes(p: LearningProfile, data: { leverage: number; pnl: number; symbol: string }): void {
    const mistakes: { pattern: string; desc: string; severity: CommonMistake['severity'] }[] = [];

    if (data.leverage > 10) {
      mistakes.push({ pattern: 'Excessive Leverage', desc: `Used ${data.leverage}x leverage`, severity: 'high' });
    }
    if (data.pnl < -100) {
      mistakes.push({ pattern: 'Large Loss', desc: `Lost $${Math.abs(data.pnl).toFixed(0)} on ${data.symbol}`, severity: 'high' });
    }
    if (data.pnl < -25 && data.leverage >= 5) {
      mistakes.push({ pattern: 'High Leverage Loss', desc: 'Loss with high leverage — compounded risk', severity: 'medium' });
    }

    for (const m of mistakes) {
      const existing = p.commonMistakes.find(e => e.pattern === m.pattern);
      if (existing) {
        existing.occurrences++;
        existing.lastOccurrence = Date.now();
      } else {
        p.commonMistakes.push({
          pattern: m.pattern,
          description: m.desc,
          occurrences: 1,
          lastOccurrence: Date.now(),
          severity: m.severity,
        });
      }
    }
  }

  private detectEmotionalBias(p: LearningProfile, data: { side: string; leverage: number; pnl: number }): void {
    const biases: EmotionalBias['type'][] = [];

    if (data.leverage > 20) biases.push('overconfidence');
    if (data.pnl < -50 && data.leverage > 10) biases.push('revenge_trading');
    if (data.pnl < -20) biases.push('overtrading');
    if (data.leverage > 15 && data.pnl > 0) biases.push('overconfidence');

    for (const type of biases) {
      let bias = p.emotionalBiases.find(b => b.type === type);
      if (!bias) {
        bias = { type, score: 20, detected: 0, lastDetected: Date.now() };
        p.emotionalBiases.push(bias);
      }
      bias.detected++;
      bias.score = Math.min(100, bias.score + 15);
      bias.lastDetected = Date.now();
    }

    // Decay biases over time (24h)
    const dayAgo = Date.now() - 86400000;
    for (const bias of p.emotionalBiases) {
      if (bias.lastDetected < dayAgo) {
        bias.score = Math.max(0, bias.score - 5);
      }
    }
  }

  private detectRiskHabits(p: LearningProfile, data: { leverage: number }): void {
    const habits: RiskHabit[] = [
      { label: 'Avg Leverage', value: data.leverage, trend: data.leverage > 5 ? 'worsening' : 'stable', lastUpdate: Date.now() },
    ];

    for (const h of habits) {
      const existing = p.riskHabits.find(e => e.label === h.label);
      if (existing) {
        existing.value = (existing.value * 0.7) + (h.value * 0.3); // Exponential moving average
        existing.lastUpdate = Date.now();
        existing.trend = h.trend;
      } else {
        p.riskHabits.push(h);
      }
    }
  }

  private updatePatterns(p: LearningProfile, data: { symbol: string; side: string; leverage: number; pnl: number }): void {
    const isWin = data.pnl > 0;
    const patternType: 'successful' | 'failed' = isWin ? 'successful' : 'failed';
    const list = isWin ? p.successfulPatterns : p.failedPatterns;

    // Look for existing similar pattern
    const key = `${data.symbol}_${data.side}_${data.leverage <= 2 ? 'low' : data.leverage <= 5 ? 'med' : 'high'}`;
    const existing = list.find(pat => pat.conditions.patternKey === key);

    if (existing) {
      existing.occurrences++;
      existing.avgResult = ((existing.avgResult * (existing.occurrences - 1)) + data.pnl) / existing.occurrences;
      existing.confidence = Math.min(100, existing.confidence + 5);
    } else {
      list.push({
        type: patternType,
        description: `${data.symbol} ${data.side} with ${data.leverage}x → ${isWin ? 'Profit' : 'Loss'}`,
        conditions: { patternKey: key, symbol: data.symbol, side: data.side, leverage: data.leverage },
        occurrences: 1,
        avgResult: data.pnl,
        confidence: 20,
      });
    }

    // Keep top 20
    if (list.length > 20) list.splice(0, list.length - 20);
  }

  private updateScores(p: LearningProfile): void {
    const totalTrades = p.successfulPatterns.reduce((s, pt) => s + pt.occurrences, 0) +
                         p.failedPatterns.reduce((s, pt) => s + pt.occurrences, 0);
    const mistakesCount = p.commonMistakes.reduce((s, m) => s + m.occurrences, 0);
    const biasSum = p.emotionalBiases.reduce((s, b) => s + b.score, 0) / Math.max(1, p.emotionalBiases.length);

    if (totalTrades > 0) {
      p.learningScore = Math.min(100, Math.round((totalTrades / (totalTrades + mistakesCount + 5)) * 100));
    }
    p.confidenceScore = Math.min(100, Math.max(10, 100 - biasSum));
  }

  // ── Private: Persistence ─────────────────────────────────────────────────

  private createDefault(userId: string): LearningProfile {
    return {
      userId,
      favoriteCoins: [],
      favoriteTimes: [],
      favoriteIndicators: [],
      commonMistakes: [],
      emotionalBiases: [],
      riskHabits: [{ label: 'Avg Leverage', value: 1, trend: 'stable', lastUpdate: Date.now() }],
      successfulPatterns: [],
      failedPatterns: [],
      learningScore: 0,
      confidenceScore: 50,
      recommendationAccuracy: 0,
      coachAccuracy: 0,
      totalRecommendations: 0,
      acceptedRecommendations: 0,
      totalCoachSuggestions: 0,
      followedCoachSuggestions: 0,
      lastUpdated: Date.now(),
    };
  }

  private listenToEvents(): void {
    lynxEvents.subscribe((event) => {
      if (event.type === 'TRADE_CLOSE') {
        const e = event as any;
        this.trackTrade(this.getCurrentUser(), {
          symbol: e.symbol,
          side: e.side || 'long',
          leverage: e.leverage || 1,
          pnl: e.pnl || 0,
          timestamp: e.timestamp || Date.now(),
        });
      }
    });
  }

  private getCurrentUser(): string {
    try { return localStorage.getItem('cv_lynx_current_user') || 'anonymous'; } catch { return 'anonymous'; }
  }

  private persist(userId: string): void {
    try {
      const profile = this.profiles.get(userId);
      if (profile) localStorage.setItem(this.KEY_PREFIX + userId, JSON.stringify(profile));
    } catch {}
  }

  private load(userId: string): LearningProfile | null {
    try {
      const d = localStorage.getItem(this.KEY_PREFIX + userId);
      return d ? JSON.parse(d) : null;
    } catch { return null; }
  }
}

export const learningEngine = new LearningEngine();
