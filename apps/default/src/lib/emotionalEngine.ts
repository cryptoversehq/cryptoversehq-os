/**
 * emotionalEngine.ts — Lynx AI Emotional Intelligence Engine (Sprint 5.3)
 * Detects, remembers, predicts and reacts to 16 user emotions.
 * Sources: trading, academy, chat, missions, goals, learning, portfolio, AI conversations.
 * Integrates with Universal Memory, Coach, Prediction, Learning, Notification, Mission engines.
 * No business logic changes.
 */

import type { OrchestratorContext, EngineContract } from './lynxOrchestrator';
import { memoryAccessGateway } from './memoryAccessGateway';
import { learningEngine } from './learningEngine';
import { predictionEngine } from './predictionEngine';
import { realDataConnector } from './realDataConnector';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export type EmotionType =
  | 'confidence' | 'fear' | 'greed' | 'stress'
  | 'excitement' | 'frustration' | 'confusion' | 'motivation'
  | 'disappointment' | 'overconfidence' | 'burnout' | 'curiosity'
  | 'focus' | 'fatigue' | 'patience' | 'impulsiveness';

export interface EmotionReading {
  type: EmotionType;
  score: number;        // 0-100 intensity
  confidence: number;   // 0-100 how sure Lynx is about this reading
  source: string;       // what triggered this reading
  context: Record<string, any>;
  timestamp: number;
}

export interface EmotionProfile {
  userId: string;
  currentEmotions: EmotionReading[];
  dominantEmotion: EmotionType;
  secondaryEmotion: EmotionType;
  overallMood: 'positive' | 'neutral' | 'negative' | 'stressed' | 'excited';
  emotionHistory: EmotionReading[];
  dailyScores: { date: string; dominantEmotion: EmotionType; intensity: number }[];
  weeklyScores: { week: string; dominantEmotion: EmotionType; intensity: number }[];
  monthlyReport: string;
  trends: { emotion: EmotionType; trend: 'rising' | 'falling' | 'stable'; changePercent: number }[];
  lastUpdated: number;
}

export interface EmotionPrediction {
  type: EmotionType;
  predictedScore: number;
  confidence: number;
  reason: string;
  timeframe: 'short' | 'medium' | 'long'; // hours, days, weeks
  timestamp: number;
}

export interface EmotionSummary {
  userId: string;
  period: 'daily' | 'weekly' | 'monthly';
  dominantEmotion: EmotionType;
  secondaryEmotion: EmotionType;
  stressLevel: number;
  motivationLevel: number;
  burnoutRisk: number;
  recoveryScore: number; // 0-100, higher = recovering well
  recommendations: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Emotion Sources & Detection Rules
// ═══════════════════════════════════════════════════════════════════════════════

interface EmotionSource {
  source: string;
  check: (ctx: any) => EmotionReading | null;
}

const EMOTION_SOURCES: EmotionSource[] = [
  // ── Trading Behavior ──────────────────────────────────────────────────
  {
    source: 'trading_win_rate',
    check: (ctx) => {
      const wr = ctx.appData?.trading?.avgWinRate || 0;
      if (wr > 70) return { type: 'confidence', score: 80, confidence: 85, source: 'trading_win_rate', context: { winRate: wr }, timestamp: Date.now() };
      if (wr > 60) return { type: 'confidence', score: 60, confidence: 80, source: 'trading_win_rate', context: { winRate: wr }, timestamp: Date.now() };
      if (wr < 30) return { type: 'frustration', score: 70, confidence: 75, source: 'trading_win_rate', context: { winRate: wr }, timestamp: Date.now() };
      return null;
    },
  },
  {
    source: 'trading_leverage',
    check: (ctx) => {
      const lev = ctx.profile?.riskHabits?.find((h: any) => h.label === 'Avg Leverage');
      if (lev && lev.value > 15) return { type: 'greed', score: 80, confidence: 80, source: 'trading_leverage', context: { leverage: lev.value }, timestamp: Date.now() };
      if (lev && lev.value > 10) return { type: 'greed', score: 55, confidence: 70, source: 'trading_leverage', context: { leverage: lev.value }, timestamp: Date.now() };
      if (lev && lev.value <= 2) return { type: 'patience', score: 65, confidence: 70, source: 'trading_leverage', context: { leverage: lev.value }, timestamp: Date.now() };
      return null;
    },
  },
  {
    source: 'trading_positions',
    check: (ctx) => {
      const pos = ctx.appData?.trading?.openPositions || 0;
      if (pos > 10) return { type: 'overconfidence', score: 75, confidence: 75, source: 'trading_positions', context: { positions: pos }, timestamp: Date.now() };
      if (pos > 5) return { type: 'excitement', score: 60, confidence: 65, source: 'trading_positions', context: { positions: pos }, timestamp: Date.now() };
      return null;
    },
  },

  // ── Academy Behavior ──────────────────────────────────────────────────
  {
    source: 'academy_progress',
    check: (ctx) => {
      const ac = ctx.appData?.academy;
      if (!ac) return null;
      const pct = ac.totalLessons > 0 ? (ac.completedLessons / ac.totalLessons) * 100 : 0;
      if (pct > 80) return { type: 'motivation', score: 85, confidence: 80, source: 'academy_progress', context: { progress: pct }, timestamp: Date.now() };
      if (pct > 50) return { type: 'motivation', score: 60, confidence: 75, source: 'academy_progress', context: { progress: pct }, timestamp: Date.now() };
      if (pct < 10) return { type: 'curiosity', score: 40, confidence: 60, source: 'academy_progress', context: { progress: pct }, timestamp: Date.now() };
      return null;
    },
  },
  {
    source: 'academy_speed',
    check: (ctx) => {
      const ac = ctx.appData?.academy;
      if (!ac || ac.completedLessons === 0) return null;
      if (ac.completedLessons >= 10 && ac.avgLevel >= 5) return { type: 'focus', score: 75, confidence: 70, source: 'academy_speed', context: { lessons: ac.completedLessons }, timestamp: Date.now() };
      return null;
    },
  },

  // ── Learning Patterns ─────────────────────────────────────────────────
  {
    source: 'learning_score',
    check: (ctx) => {
      const ls = ctx.profile?.learningScore || 0;
      if (ls > 70) return { type: 'motivation', score: 75, confidence: 80, source: 'learning_score', context: { score: ls }, timestamp: Date.now() };
      if (ls < 20) return { type: 'disappointment', score: 60, confidence: 70, source: 'learning_score', context: { score: ls }, timestamp: Date.now() };
      return null;
    },
  },
  {
    source: 'emotional_biases',
    check: (ctx) => {
      const biases = ctx.profile?.emotionalBiases || [];
      const fearBias = biases.find((b: any) => b.type === 'fear_of_loss');
      if (fearBias && fearBias.score > 50) return { type: 'fear', score: fearBias.score, confidence: 80, source: 'emotional_biases', context: { biasType: 'fear_of_loss' }, timestamp: Date.now() };
      const overconfBias = biases.find((b: any) => b.type === 'overconfidence');
      if (overconfBias && overconfBias.score > 50) return { type: 'overconfidence', score: overconfBias.score, confidence: 80, source: 'emotional_biases', context: { biasType: 'overconfidence' }, timestamp: Date.now() };
      const highBiasCount = biases.filter((b: any) => b.score > 50).length;
      if (highBiasCount >= 3) return { type: 'impulsiveness', score: 70, confidence: 75, source: 'emotional_biases', context: { biasCount: highBiasCount }, timestamp: Date.now() };
      return null;
    },
  },

  // ── Burnout Detection ─────────────────────────────────────────────────
  {
    source: 'burnout_check',
    check: (ctx) => {
      const preds = ctx.preds;
      const burnout = preds?.predictions?.find((p: any) => p.type === 'burnout');
      if (burnout && burnout.probability > 70) return { type: 'burnout', score: burnout.probability, confidence: 85, source: 'burnout_check', context: { prediction: burnout }, timestamp: Date.now() };
      if (burnout && burnout.probability > 50) return { type: 'fatigue', score: burnout.probability, confidence: 75, source: 'burnout_check', context: { prediction: burnout }, timestamp: Date.now() };
      return null;
    },
  },

  // ── Stress Detection ──────────────────────────────────────────────────
  {
    source: 'stress_check',
    check: (ctx) => {
      const preds = ctx.preds;
      const stress = preds?.predictions?.find((p: any) => p.type === 'high_stress');
      if (stress && stress.probability > 60) return { type: 'stress', score: stress.probability, confidence: 85, source: 'stress_check', context: { prediction: stress }, timestamp: Date.now() };
      return null;
    },
  },

  // ── Confusion Detection ───────────────────────────────────────────────
  {
    source: 'confusion_check',
    check: (ctx) => {
      const profile = ctx.profile;
      const mistakes = profile?.commonMistakes?.reduce((s: number, m: any) => s + m.occurrences, 0) || 0;
      const failedPatterns = profile?.failedPatterns?.length || 0;
      if (mistakes > 15 && failedPatterns > 5) return { type: 'confusion', score: 75, confidence: 70, source: 'confusion_check', context: { mistakes, failedPatterns }, timestamp: Date.now() };
      if (mistakes > 8) return { type: 'confusion', score: 45, confidence: 60, source: 'confusion_check', context: { mistakes }, timestamp: Date.now() };
      return null;
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// EmotionalEngine
// ═══════════════════════════════════════════════════════════════════════════════

class EmotionalEngine {
  private profiles: Map<string, EmotionProfile> = new Map();
  private registered = false;
  private readonly KEY = 'cv_emotion_';

  constructor() { this.loadAll(); }

  // ── Public APIs ─────────────────────────────────────────────────────────

  /** Detect current emotions from all sources */
  detectEmotion(userId: string): EmotionReading[] {
    const appData = realDataConnector.getAppData();
    const profile = learningEngine.getProfile(userId);
    const preds = predictionEngine.predictAll(userId);
    const ctx = { appData, profile, preds };

    const readings: EmotionReading[] = [];
    for (const source of EMOTION_SOURCES) {
      try {
        const reading = source.check(ctx);
        if (reading) readings.push(reading);
      } catch { /* skip failed source */ }
    }

    // Store the readings
    this.storeEmotion(userId, readings);
    return readings;
  }

  /** Predict future emotional state */
  predictEmotion(userId: string): EmotionPrediction[] {
    const profile = this.getProfile(userId);
    const history = profile.emotionHistory;
    const predictions: EmotionPrediction[] = [];

    // Analyze trends from history
    if (history.length < 2) {
      predictions.push({ type: 'curiosity', predictedScore: 50, confidence: 40, reason: 'Insufficient data for prediction', timeframe: 'short', timestamp: Date.now() });
      return predictions;
    }

    // Check for burnout trajectory
    const burnoutReadings = history.filter(r => r.type === 'burnout' || r.type === 'fatigue');
    if (burnoutReadings.length >= 3) {
      const recent = burnoutReadings.slice(-3);
      const trend = recent[recent.length - 1].score - recent[0].score;
      predictions.push({
        type: 'burnout',
        predictedScore: Math.min(100, Math.max(0, recent[recent.length - 1].score + trend)),
        confidence: 75,
        reason: trend > 10 ? 'Burnout indicators rising' : 'Burnout stabilizing',
        timeframe: 'medium',
        timestamp: Date.now(),
      });
    }

    // Check for stress trajectory
    const stressReadings = history.filter(r => r.type === 'stress');
    if (stressReadings.length >= 3) {
      const recent = stressReadings.slice(-3);
      const trend = recent[recent.length - 1].score - recent[0].score;
      predictions.push({
        type: 'stress',
        predictedScore: Math.min(100, Math.max(0, recent[recent.length - 1].score + trend)),
        confidence: 80,
        reason: trend > 10 ? 'Stress is increasing — intervention recommended' : 'Stress is manageable',
        timeframe: 'short',
        timestamp: Date.now(),
      });
    }

    // Default to stable prediction
    if (predictions.length === 0) {
      predictions.push({ type: 'confidence', predictedScore: 50, confidence: 50, reason: 'No significant emotional patterns detected', timeframe: 'medium', timestamp: Date.now() });
    }

    return predictions;
  }

  /** Store emotion readings into the profile and Universal Memory */
  storeEmotion(userId: string, readings: EmotionReading[]): void {
    if (readings.length === 0) return;

    const profile = this.getProfile(userId);
    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];
    const week = this.getWeekKey();

    // Add to history
    profile.emotionHistory.push(...readings);
    if (profile.emotionHistory.length > 500) {
      profile.emotionHistory = profile.emotionHistory.slice(-500);
    }

    // Update current emotions (last reading per type)
    const latest: Map<EmotionType, EmotionReading> = new Map();
    for (const r of readings) latest.set(r.type, r);
    profile.currentEmotions = Array.from(latest.values());

    // Determine dominant & secondary
    const sorted = [...profile.currentEmotions].sort((a, b) => b.score - a.score);
    profile.dominantEmotion = sorted[0]?.type || 'curiosity';
    profile.secondaryEmotion = sorted[1]?.type || 'curiosity';

    // Overall mood
    const positiveEmotions: EmotionType[] = ['confidence', 'motivation', 'excitement', 'curiosity', 'focus'];
    const negativeEmotions: EmotionType[] = ['fear', 'frustration', 'disappointment', 'stress', 'burnout'];
    const posScore = sorted.filter(r => positiveEmotions.includes(r.type)).reduce((s, r) => s + r.score, 0);
    const negScore = sorted.filter(r => negativeEmotions.includes(r.type)).reduce((s, r) => s + r.score, 0);
    if (profile.dominantEmotion === 'stress' || profile.dominantEmotion === 'burnout') profile.overallMood = 'stressed';
    else if (profile.dominantEmotion === 'excitement') profile.overallMood = 'excited';
    else if (posScore > negScore * 1.5) profile.overallMood = 'positive';
    else if (negScore > posScore * 1.5) profile.overallMood = 'negative';
    else profile.overallMood = 'neutral';

    // Update daily scores
    const existingDaily = profile.dailyScores.find(d => d.date === today);
    if (existingDaily) {
      existingDaily.dominantEmotion = profile.dominantEmotion;
      existingDaily.intensity = Math.max(existingDaily.intensity, sorted[0]?.score || 0);
    } else {
      profile.dailyScores.push({ date: today, dominantEmotion: profile.dominantEmotion, intensity: sorted[0]?.score || 50 });
      if (profile.dailyScores.length > 90) profile.dailyScores.splice(0, 1);
    }

    // Update weekly scores
    const existingWeekly = profile.weeklyScores.find(w => w.week === week);
    if (existingWeekly) {
      existingWeekly.dominantEmotion = profile.dominantEmotion;
      existingWeekly.intensity = Math.max(existingWeekly.intensity, sorted[0]?.score || 0);
    } else {
      profile.weeklyScores.push({ week, dominantEmotion: profile.dominantEmotion, intensity: sorted[0]?.score || 50 });
      if (profile.weeklyScores.length > 52) profile.weeklyScores.splice(0, 1);
    }

    profile.lastUpdated = now;
    this.save(userId);

    // Store in Universal Memory
    memoryAccessGateway.remember(userId, userId, 'emotional', {
      dominant: profile.dominantEmotion,
      mood: profile.overallMood,
      readings: readings.slice(0, 5),
    }, { level: 'medium', importance: 70, tags: ['emotion', profile.dominantEmotion, profile.overallMood] });
  }

  /** Get full emotion history */
  emotionHistory(userId: string, limit = 100): EmotionReading[] {
    const profile = this.getProfile(userId);
    return profile.emotionHistory.slice(-limit);
  }

  /** Generate emotion summary for a period */
  emotionSummary(userId: string, period: 'daily' | 'weekly' | 'monthly' = 'daily'): EmotionSummary {
    const profile = this.getProfile(userId);
    const history = profile.emotionHistory;

    const stressLevel = history.filter(r => r.type === 'stress' || r.type === 'burnout')
      .reduce((s, r) => s + r.score, 0) / Math.max(1, history.filter(r => r.type === 'stress' || r.type === 'burnout').length);
    const motivationLevel = history.filter(r => r.type === 'motivation' || r.type === 'confidence')
      .reduce((s, r) => s + r.score, 0) / Math.max(1, history.filter(r => r.type === 'motivation' || r.type === 'confidence').length);
    const burnoutRisk = history.filter(r => r.type === 'burnout')
      .reduce((s, r) => s + r.score, 0) / Math.max(1, history.filter(r => r.type === 'burnout').length);
    const recoveryScore = 100 - Math.round(stressLevel);

    const recommendations: string[] = [];
    if (stressLevel > 60) recommendations.push('High stress detected. Consider suggesting a break or calming activity.');
    if (motivationLevel < 30) recommendations.push('Motivation is low. Send an encouraging message or recommend an easy win task.');
    if (burnoutRisk > 50) recommendations.push('Burnout risk is elevated. Reduce notifications and suggest self-care.');
    if (profile.dominantEmotion === 'confusion') recommendations.push('User appears confused. Offer clearer guidance or tutorial links.');
    if (profile.dominantEmotion === 'excitement') recommendations.push('User is excited! Capitalize with tournament invitations or challenges.');

    return {
      userId, period,
      dominantEmotion: profile.dominantEmotion,
      secondaryEmotion: profile.secondaryEmotion,
      stressLevel: Math.round(stressLevel),
      motivationLevel: Math.round(motivationLevel),
      burnoutRisk: Math.round(burnoutRisk),
      recoveryScore: Math.round(recoveryScore),
      recommendations,
    };
  }

  /** Check emotional recovery trajectory */
  emotionRecovery(userId: string): { recovering: boolean; speed: number; daysToRecover: number | null } {
    const history = this.emotionHistory(userId, 30);
    const stressReadings = history.filter(r => r.type === 'stress' || r.type === 'burnout' || r.type === 'fatigue');
    if (stressReadings.length < 2) return { recovering: true, speed: 100, daysToRecover: null };

    const recent = stressReadings.slice(-5);
    const firstAvg = stressReadings.slice(0, 3).reduce((s, r) => s + r.score, 0) / Math.min(3, stressReadings.slice(0, 3).length);
    const lastAvg = recent.reduce((s, r) => s + r.score, 0) / recent.length;
    const recovering = lastAvg < firstAvg;
    const speed = firstAvg > 0 ? Math.round(((firstAvg - lastAvg) / firstAvg) * 100) : 0;
    const daysToRecover = recovering && speed > 0 ? Math.ceil(lastAvg / (speed / 100 * 10)) : null;

    return { recovering, speed, daysToRecover };
  }

  /** Generate an adaptation modifier for AI conversations based on emotion */
  adaptConversation(userId: string): string {
    const profile = this.getProfile(userId);
    const modifiers: string[] = [];

    switch (profile.dominantEmotion) {
      case 'stress': modifiers.push('Be gentle and reassuring. Keep messages short and supportive.'); break;
      case 'frustration': modifiers.push('Acknowledge feelings. Offer concrete solutions, not sympathy.'); break;
      case 'excitement': modifiers.push('Match their energy. Be enthusiastic and encouraging.'); break;
      case 'confusion': modifiers.push('Explain clearly. Break complex topics into simple steps.'); break;
      case 'confidence': modifiers.push('Be direct and professional. They can handle complex info.'); break;
      case 'fear': modifiers.push('Be reassuring. Emphasize safety and risk management.'); break;
      case 'burnout': modifiers.push('Be caring. Suggest rest and self-care. Go at their pace.'); break;
      case 'motivation': modifiers.push('Channel their energy. Set challenging but achievable goals.'); break;
      case 'curiosity': modifiers.push('Be educational. Offer deep dives and fascinating facts.'); break;
      case 'impulsiveness': modifiers.push('Slow them down. Encourage reflection before action.'); break;
      default: modifiers.push('Be balanced and adaptive.'); break;
    }

    if (profile.overallMood === 'negative') modifiers.push('Use a warm tone to lift mood.');
    if (profile.overallMood === 'stressed') modifiers.push('Prioritize calm and supportive language.');

    return modifiers.join(' ');
  }

  // ── Orchestrator Integration ────────────────────────────────────────────

  async execute(context: OrchestratorContext): Promise<void> {
    const userId = context.userId || 'anonymous';
    this.detectEmotion(userId);
    // Auto-store emotion context
    const profile = this.getProfile(userId);
    if (profile.emotionHistory.length % 20 === 0) {
      // Every 20 readings, generate a summary
      const summary = this.emotionSummary(userId, 'daily');
      memoryAccessGateway.remember(userId, userId, 'daily_summary', summary, { level: 'long', importance: 65, tags: ['emotion_summary', 'daily'] });
    }
  }

  getOrchestratorContract(): EngineContract {
    return {
      name: 'emotionalEngine',
      priority: 6,
      dependencies: ['contextEngine', 'universalMemory', 'brainEngine', 'learningEngine', 'predictionEngine'],
      initialize: async () => { this.registered = true; },
      execute: (ctx) => this.execute(ctx),
      shutdown: async () => { this.registered = false; },
      health: () => ({
        status: this.registered ? 'healthy' : 'degraded',
        lastRun: null, lastDuration: 0, errorCount: 0, totalRuns: 0, avgDuration: 0,
      }),
    };
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private getProfile(userId: string): EmotionProfile {
    if (!this.profiles.has(userId)) {
      this.profiles.set(userId, this.load(userId) || this.createDefault(userId));
    }
    return this.profiles.get(userId)!;
  }

  private createDefault(userId: string): EmotionProfile {
    return {
      userId,
      currentEmotions: [{ type: 'curiosity', score: 50, confidence: 80, source: 'default', context: {}, timestamp: Date.now() }],
      dominantEmotion: 'curiosity',
      secondaryEmotion: 'curiosity',
      overallMood: 'neutral',
      emotionHistory: [],
      dailyScores: [],
      weeklyScores: [],
      monthlyReport: '',
      trends: [],
      lastUpdated: Date.now(),
    };
  }

  private getWeekKey(): string {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const weekNum = Math.ceil(((now.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
    return `${now.getFullYear()}-W${weekNum}`;
  }

  private save(userId: string): void {
    try {
      const profile = this.profiles.get(userId);
      if (profile) localStorage.setItem(this.KEY + userId, JSON.stringify(profile));
    } catch {}
  }

  private load(userId: string): EmotionProfile | null {
    try {
      const d = localStorage.getItem(this.KEY + userId);
      return d ? JSON.parse(d) : null;
    } catch { return null; }
  }

  private loadAll(): void {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(this.KEY)) {
          const uid = key.replace(this.KEY, '');
          const data = this.load(uid);
          if (data) this.profiles.set(uid, data);
        }
      }
    } catch {}
  }
}

export const emotionalEngine = new EmotionalEngine();
