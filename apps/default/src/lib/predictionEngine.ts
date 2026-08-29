/**
 * predictionEngine.ts — Lynx AI Prediction Engine
 * Predicts 10 user outcomes with confidence, reason, data, and evidence.
 */

import type { OrchestratorContext, EngineContract } from './lynxOrchestrator';
import { learningEngine } from './learningEngine';
import { realDataConnector } from './realDataConnector';

export interface Prediction {
  id: string; type: string; probability: number; confidence: number;
  reason: string; supportingData: Record<string, any>; historicalEvidence: string[];
  timestamp: number; recommendation: string;
}
export interface PredictionReport {
  userId: string; timestamp: number; predictions: Prediction[];
  overallRisk: 'low' | 'moderate' | 'high' | 'critical'; topConcern: string;
}

class PredictionEngine {
  private predictionCache: Map<string, Prediction[]> = new Map();
  private registered = false;
  private readonly KEY = 'cv_lynx_preds_';

  predictAll(userId: string): PredictionReport {
    const predictions: Prediction[] = [
      this.predictChurn(userId), this.predictSubscription(userId),
      this.predictAcademy(userId), this.predictTournament(userId),
      this.predictLiquidation(userId), this.predictBurnout(userId),
      this.predictHighStress(userId), this.predictWinProb(userId),
      this.predictReturning(userId), this.predictGrowth(userId),
    ];
    this.predictionCache.set(userId, predictions);
    this.persist(userId);
    const highCount = predictions.filter(p => p.probability > 60 && ['churn','liquidation','burnout','high_stress'].includes(p.type)).length;
    const risk = highCount >= 3 ? 'critical' : highCount >= 2 ? 'high' : highCount >= 1 ? 'moderate' : 'low';
    const sorted = [...predictions].sort((a, b) => b.probability - a.probability);
    return { userId, timestamp: Date.now(), predictions, overallRisk: risk, topConcern: sorted[0]?.type || 'none' };
  }

  // 1. Churn
  predictChurn(userId: string): Prediction {
    const profile = learningEngine.getProfile(userId);
    const appData = realDataConnector.getAppData();
    const daysOff = profile.favoriteCoins.length > 0 ? Math.max(0, Math.floor((Date.now() - (profile.favoriteCoins[0]?.lastTraded || 0)) / 86400000)) : 30;
    const evidence: string[] = []; let prob = 0;
    if (daysOff > 14) { prob += 40; evidence.push(`Last trade ${daysOff}d ago`); }
    else if (daysOff > 7) { prob += 25; evidence.push(`Last trade ${daysOff}d ago`); }
    else if (daysOff > 3) { prob += 10; evidence.push(`Last trade ${daysOff}d ago`); }
    if (profile.learningScore < 30) { prob += 20; evidence.push(`Learning score ${profile.learningScore}`); }
    if (appData.academy.completedLessons === 0) { prob += 10; evidence.push('No lessons'); }
    return this.pred('churn', 'User Churn Risk', prob, { daysOff }, evidence, 'Send re-engagement notification with welcome-back bonus.');
  }

  // 2. Subscription
  predictSubscription(userId: string): Prediction {
    const p = learningEngine.getProfile(userId);
    const d = realDataConnector.getAppData();
    const evidence: string[] = []; let prob = 20;
    if (p.learningScore > 60) { prob += 25; evidence.push(`Learning ${p.learningScore}`); }
    if (d.trading.totalTrades > 20) { prob += 20; evidence.push(`${d.trading.totalTrades} trades`); }
    if (p.coachAccuracy > 50) { prob += 15; evidence.push('Follows coaching'); }
    if (d.trading.avgWinRate > 55) { prob += 10; evidence.push(`${d.trading.avgWinRate.toFixed(0)}% WR`); }
    return this.pred('subscription', 'Upgrade Likelihood', prob, { totalTrades: d.trading.totalTrades }, evidence, 'Offer personalized Pro trial.');
  }

  // 3. Academy
  predictAcademy(userId: string): Prediction {
    const d = realDataConnector.getAppData();
    const evidence: string[] = [];
    const pct = d.academy.totalLessons > 0 ? (d.academy.completedLessons / d.academy.totalLessons) * 100 : 0;
    let prob = pct;
    if (d.academy.completedLessons >= 5) evidence.push(`${d.academy.completedLessons} lessons done`);
    if (d.academy.completedLessons === 0) { prob = 5; evidence.push('Not started'); }
    return this.pred('academy', 'Academy Completion', prob, { pct }, evidence, 'Suggest Blockchain Basics to start.');
  }

  // 4. Tournament
  predictTournament(userId: string): Prediction {
    const d = realDataConnector.getAppData();
    const p = learningEngine.getProfile(userId);
    const evidence: string[] = []; let prob = 15;
    if (d.trading.avgWinRate > 60) { prob += 30; evidence.push(`${d.trading.avgWinRate.toFixed(0)}% WR`); }
    if (d.trading.totalTrades > 50) { prob += 25; evidence.push(`${d.trading.totalTrades} trades`); }
    if (p.successfulPatterns.length > 3) { prob += 20; evidence.push(`${p.successfulPatterns.length} patterns`); }
    return this.pred('tournament', 'Tournament Success', prob, { winRate: d.trading.avgWinRate }, evidence, 'Join next tournament!');
  }

  // 5. Liquidation
  predictLiquidation(userId: string): Prediction {
    const p = learningEngine.getProfile(userId);
    const d = realDataConnector.getAppData();
    const evidence: string[] = []; let prob = 10;
    const avgLev = p.riskHabits.find(h => h.label === 'Avg Leverage');
    if (avgLev && avgLev.value > 10) { prob += 40; evidence.push(`Avg leverage ${avgLev.value.toFixed(1)}x`); }
    else if (avgLev && avgLev.value > 5) { prob += 25; evidence.push(`Avg leverage ${avgLev.value.toFixed(1)}x`); }
    if (d.trading.openPositions > 5) { prob += 15; evidence.push(`${d.trading.openPositions} open`); }
    return this.pred('liquidation', 'Liquidation Risk', prob, { avgLeverage: avgLev?.value }, evidence, prob > 50 ? 'URGENT: Reduce leverage!' : 'Maintain discipline.');
  }

  // 6. Burnout
  predictBurnout(userId: string): Prediction {
    const p = learningEngine.getProfile(userId);
    const evidence: string[] = []; let prob = 5;
    const mistakes = p.commonMistakes.reduce((s, m) => s + m.occurrences, 0);
    const biasTypes = p.emotionalBiases.filter(b => b.score > 50).length;
    if (p.failedPatterns.length > 5 && mistakes > 10) { prob += 35; evidence.push(`${p.failedPatterns.length} failed patterns`); }
    if (biasTypes >= 2) { prob += 25; evidence.push(`${biasTypes} bias types`); }
    if (p.learningScore < 20) { prob += 15; evidence.push('Low learning score'); }
    return this.pred('burnout', 'User Burnout', prob, { failedPatterns: p.failedPatterns.length, biasTypes }, evidence, 'Suggest a break and stress resources.');
  }

  // 7. High Stress
  predictHighStress(userId: string): Prediction {
    const p = learningEngine.getProfile(userId);
    const evidence: string[] = []; let prob = 10;
    const stressBiases = p.emotionalBiases.filter(b => ['revenge_trading','fear_of_loss','overtrading'].includes(b.type));
    const avgScore = stressBiases.length > 0 ? stressBiases.reduce((s, b) => s + b.score, 0) / stressBiases.length : 0;
    if (avgScore > 60) { prob += 40; evidence.push(`Stress score ${avgScore.toFixed(0)}`); }
    else if (avgScore > 30) { prob += 25; evidence.push(`Stress score ${avgScore.toFixed(0)}`); }
    return this.pred('high_stress', 'High Stress', prob, { avgStressScore: avgScore }, evidence, 'Recommend trading break + psychology course.');
  }

  // 8. Win Probability
  predictWinProb(userId: string): Prediction {
    const d = realDataConnector.getAppData();
    const p = learningEngine.getProfile(userId);
    const evidence: string[] = []; let prob = d.trading.avgWinRate;
    if (p.successfulPatterns.length > 5) { prob += 10; evidence.push(`${p.successfulPatterns.length} patterns`); }
    const biasSum = p.emotionalBiases.reduce((s, b) => s + b.score, 0);
    if (biasSum > 200) { prob -= 15; evidence.push('High emotional bias'); }
    return this.pred('win_prob', 'Win Probability', prob, { currentWR: d.trading.avgWinRate }, evidence, 'Use 1-2x leverage and set SL.');
  }

  // 9. Returning
  predictReturning(userId: string): Prediction {
    const d = realDataConnector.getAppData();
    const evidence: string[] = []; let prob = 70;
    if (d.trading.totalTrades > 10) { prob += 15; evidence.push(`${d.trading.totalTrades} trades`); }
    if (d.academy.completedLessons > 3) { prob += 10; evidence.push(`${d.academy.completedLessons} lessons`); }
    if (d.trading.avgWinRate < 30) { prob -= 20; evidence.push('Low WR'); }
    if (d.academy.completedLessons === 0 && d.trading.totalTrades === 0) { prob = 25; evidence.push('No engagement'); }
    return this.pred('returning', 'Return Probability', prob, { totalTrades: d.trading.totalTrades }, evidence, prob < 40 ? 'Send notification with offer.' : 'User likely to return.');
  }

  // 10. Portfolio Growth
  predictGrowth(userId: string): Prediction {
    const d = realDataConnector.getAppData();
    const p = learningEngine.getProfile(userId);
    const evidence: string[] = []; let prob = 50;
    const projected = d.trading.avgWinRate > 0 ? ((d.trading.avgWinRate / 100) * 0.02 * 30 * 100) : 0;
    if (d.trading.avgWinRate > 55) { prob += 20; evidence.push('Above-avg WR'); }
    else if (d.trading.avgWinRate < 40) { prob -= 20; evidence.push('Below-avg WR'); }
    if (p.successfulPatterns.length > 5) { prob += 15; evidence.push(`${p.successfulPatterns.length} patterns`); }
    return this.pred('growth', 'Portfolio Growth (30d)', prob, { projectedPct: projected.toFixed(1) }, evidence, `Projected: ~${projected.toFixed(1)}% growth.`);
  }

  // Orchestrator
  async execute(context: OrchestratorContext): Promise<void> {
    this.predictAll(context.userId || 'anonymous');
  }

  getOrchestratorContract(): EngineContract {
    return {
      name: 'predictionEngine', priority: 11,
      dependencies: ['contextEngine', 'memoryEngine', 'brainEngine', 'learningEngine'],
      initialize: async () => { this.registered = true; },
      execute: (ctx) => this.execute(ctx),
      shutdown: async () => { this.registered = false; },
      health: () => ({ status: this.registered ? 'healthy' : 'degraded', lastRun: null, lastDuration: 0, errorCount: 0, totalRuns: 0, avgDuration: 0 }),
    };
  }

  // Helpers
  private pred(id: string, type: string, prob: number, data: Record<string, any>, evidence: string[], rec: string): Prediction {
    return {
      id, type, probability: Math.min(100, Math.round(prob)), confidence: Math.min(100, 30 + evidence.length * 15),
      reason: evidence.join('; ') || 'Insufficient data', supportingData: data, historicalEvidence: evidence,
      timestamp: Date.now(), recommendation: rec,
    };
  }

  private persist(userId: string): void {
    try { const p = this.predictionCache.get(userId); if (p) localStorage.setItem(this.KEY + userId, JSON.stringify(p)); } catch {}
  }
}

export const predictionEngine = new PredictionEngine();
