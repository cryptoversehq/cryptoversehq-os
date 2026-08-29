/**
 * brainEngine.ts — Lynx AI Brain Engine
 * Sentiment analysis, pattern recognition, and intelligent suggestions.
 * Uses contextEngine + memoryEngine for data, eventSystem for triggers.
 */

import { lynxContext } from './contextEngine';
import { lynxMemory } from './memoryEngine';
import { lynxEvents } from './eventSystem';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface SentimentAnalysis {
  overall: 'confident' | 'positive' | 'neutral' | 'negative' | 'stressed' | 'frustrated';
  score: number;
  confidence: number;
  factors: string[];
  timestamp: number;
}

export interface PatternDetection {
  type: 'scalper' | 'day_trader' | 'swing_trader' | 'holder' | 'risky' | 'conservative';
  description: string;
  confidence: number;
  evidence: string[];
}

export interface SmartSuggestion {
  id: string;
  type: 'guidance' | 'warning' | 'recommendation' | 'celebration';
  title: string;
  message: string;
  priority: 'low' | 'medium' | 'high';
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LynxBrainEngine
// ═══════════════════════════════════════════════════════════════════════════════

class LynxBrainEngine {
  private lastSentiment: SentimentAnalysis | null = null;
  private lastPatterns: PatternDetection[] = [];
  private suggestions: SmartSuggestion[] = [];
  private analysisInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startAnalysis();
  }

  // ── Public Getters ───────────────────────────────────────────────────────

  getSentiment(): SentimentAnalysis | null {
    return this.lastSentiment;
  }

  getPatterns(): PatternDetection[] {
    return [...this.lastPatterns];
  }

  getSuggestions(): SmartSuggestion[] {
    return [...this.suggestions];
  }

  getHighPrioritySuggestions(): SmartSuggestion[] {
    return this.suggestions.filter(s => s.priority === 'high');
  }

  // ── Sentiment Analysis ──────────────────────────────────────────────────

  analyzeSentiment(): SentimentAnalysis {
    const context = lynxContext.getContext();
    const events = lynxMemory.getSessionEvents();
    let score = 0;
    const factors: string[] = [];

    const trades = events.filter(e => e.type === 'TRADE_CLOSE') as any[];
    if (trades.length > 0) {
      const wins = trades.filter((t: any) => t.pnl > 0).length;
      const winRate = (wins / trades.length) * 100;
      if (winRate > 60) { score += 20; factors.push(`High Win Rate (${winRate.toFixed(0)}%)`); }
      else if (winRate < 40) { score -= 20; factors.push(`Low Win Rate (${winRate.toFixed(0)}%)`); }
    }

    const levEvents = events.filter(e => e.type === 'LEVERAGE_CHANGE') as any[];
    if (levEvents.length > 0) {
      const lastLev = levEvents[levEvents.length - 1].newValue;
      if (lastLev > 20) { score -= 15; factors.push(`High Leverage (${lastLev}x)`); }
    }

    const sessionTime = context.sessionTime || 0;
    if (sessionTime > 60) { score += 10; factors.push(`Long session (${Math.floor(sessionTime)} min)`); }

    const recent = events.slice(-20);
    const losses = recent.filter(e => e.type === 'TRADE_CLOSE' && (e as any).pnl < 0).length;
    if (losses > 3) { score -= 10; factors.push(`${losses} consecutive losses`); }

    let overall: SentimentAnalysis['overall'] = 'neutral';
    if (score > 30) overall = 'confident';
    else if (score > 10) overall = 'positive';
    else if (score < -30) overall = 'stressed';
    else if (score < -10) overall = 'negative';
    if (score < -40) overall = 'frustrated';

    const result: SentimentAnalysis = {
      overall,
      score: Math.max(-100, Math.min(100, score)),
      confidence: Math.min(100, Math.abs(score) + 30),
      factors,
      timestamp: Date.now(),
    };
    this.lastSentiment = result;

    // Push sentiment into contextEngine
    lynxContext.updateContext({
      sentiment: overall === 'frustrated' ? 'stressed' : overall,
      stressLevel: overall === 'stressed' ? 80 : overall === 'frustrated' ? 90 : Math.max(10, Math.abs(score)),
      confidenceScore: overall === 'confident' ? 80 : 50 + score / 2,
    });

    return result;
  }

  // ── Pattern Detection ───────────────────────────────────────────────────

  detectPatterns(): PatternDetection[] {
    const patterns: PatternDetection[] = [];
    const events = lynxMemory.getSessionEvents();
    const trades = events.filter(e => e.type === 'TRADE_OPEN') as any[];
    if (trades.length === 0) return patterns;

    // Scalper detection: trades with close in < 5 min
    const closes = events.filter(e => e.type === 'TRADE_CLOSE') as any[];
    const shortTrades = trades.filter((t: any) => {
      const close = closes.find((c: any) => c.symbol === t.symbol);
      if (!close) return false;
      return (close.timestamp - t.timestamp) < 300000;
    });
    if (shortTrades.length / trades.length > 0.5) {
      patterns.push({
        type: 'scalper',
        description: 'Short-term trades under 5 minutes',
        confidence: (shortTrades.length / trades.length) * 100,
        evidence: [`${shortTrades.length} of ${trades.length} trades`],
      });
    }

    // Risky detection: high leverage in >30% of trades
    const highLev = trades.filter((t: any) => t.leverage >= 10);
    if (highLev.length / trades.length > 0.3) {
      patterns.push({
        type: 'risky',
        description: 'High leverage used in >30% of trades',
        confidence: (highLev.length / trades.length) * 100,
        evidence: [`Leverage: ${highLev.map((t: any) => t.leverage + 'x').join(', ')}`],
      });
    }

    // Conservative: low leverage + few trades
    if (trades.filter((t: any) => t.leverage <= 2).length / trades.length > 0.8) {
      patterns.push({
        type: 'conservative',
        description: 'Conservative approach with low leverage',
        confidence: 80,
        evidence: ['Low leverage on most trades'],
      });
    }

    this.lastPatterns = patterns;
    return patterns;
  }

  // ── Smart Suggestions ───────────────────────────────────────────────────

  generateSuggestions(): SmartSuggestion[] {
    const suggestions: SmartSuggestion[] = [];
    const context = lynxContext.getContext();
    const sentiment = this.lastSentiment;
    const patterns = this.lastPatterns;

    // Stressed → calming
    if (sentiment?.overall === 'stressed' || sentiment?.overall === 'frustrated') {
      suggestions.push({
        id: 'stress_relief',
        type: 'guidance',
        title: '🧘 Take a Break',
        message: 'I notice some stress. Consider stepping away for a few minutes.',
        priority: 'high',
        timestamp: Date.now(),
      });
    }

    // Risky → warning
    if (patterns.some(p => p.type === 'risky')) {
      suggestions.push({
        id: 'risk_advice',
        type: 'warning',
        title: '⚠️ Risk Management',
        message: 'High leverage increases liquidation risk. Try reducing leverage.',
        priority: 'medium',
        timestamp: Date.now(),
      });
    }

    // Low win rate + few academy lessons
    if (context.winRate < 50 && context.completedLessons < 5) {
      suggestions.push({
        id: 'academy_lesson',
        type: 'recommendation',
        title: '📚 Academy Recommendation',
        message: 'Improve your skills — check Risk Management in the Academy.',
        priority: 'medium',
        timestamp: Date.now(),
      });
    }

    // Celebration
    if (context.winRate > 60 && context.totalTrades > 10) {
      suggestions.push({
        id: 'celebration',
        type: 'celebration',
        title: '🎉 Great Performance!',
        message: `Your win rate is ${context.winRate.toFixed(0)}%. Keep it up!`,
        priority: 'low',
        timestamp: Date.now(),
      });
    }

    this.suggestions = suggestions;
    return suggestions;
  }

  // ── Summary ──────────────────────────────────────────────────────────────

  getBrainSummary(): string {
    const s = this.lastSentiment;
    const p = this.lastPatterns;
    const suggs = this.suggestions.filter(s => s.priority === 'high');
    return [
      'Lynx AI Analysis:',
      `Sentiment: ${s?.overall || 'unknown'} (score: ${s?.score || 0})`,
      `Patterns: ${p.map(x => x.type).join(', ') || 'none'}`,
      `High-priority suggestions: ${suggs.length}`,
    ].join('\n');
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private startAnalysis(): void {
    // Run immediately
    this.analyzeSentiment();
    this.detectPatterns();
    this.generateSuggestions();
    // Then every 30s
    this.analysisInterval = setInterval(() => {
      this.analyzeSentiment();
      this.detectPatterns();
      this.generateSuggestions();
    }, 30000);
  }
}

export const lynxBrain = new LynxBrainEngine();
