/**
 * tradingExpertGen2.ts - CryptoVerse HQ Trading Expert Gen2 (Sprint 6.1-B)
 * Upgraded from isolated AI to Brain Fusion advisor.
 * Every recommendation: confidence, risk score, reasoning, evidence, alternatives.
 * Priority 22. No business logic changes.
 */

import type { OrchestratorContext, EngineContract } from './lynxOrchestrator';
import { realDataConnector } from './realDataConnector';
import { memoryAccessGateway } from './memoryAccessGateway';
import { selfEvolutionEngine } from './selfEvolutionEngine';
import { learningEngine } from './learningEngine';
import { predictionEngine } from './predictionEngine';

export interface TradeAnalysis {
  userId: string; timestamp: number;
  experienceLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  totalTrades: number; winRate: number; avgPnL: number;
  repeatedMistakes: { pattern: string; count: number; lastSeen: number; suggestion: string }[];
  repeatedSuccesses: { pattern: string; count: number; lastSeen: number }[];
  favoriteCoins: { symbol: string; trades: number; avgProfit: number; winRate: number }[];
  riskProfile: 'low' | 'medium' | 'high' | 'extreme';
  avgLeverage: number;
  emotionalBiases: { type: string; score: number; impact: string }[];
  openPositions: number; exposurePercent: number;
  portfolioHealth: 'healthy' | 'concentrated' | 'risky' | 'critical';
  learningProgress: number; academyLessons: number;
  marketRegime: 'bull' | 'bear' | 'sideways' | 'volatile';
  overallScore: number; summary: string;
}

export interface TradeRecommendation {
  id: string; userId: string; timestamp: number;
  action: 'buy' | 'sell' | 'hold' | 'reduce_position' | 'add_position' | 'wait' | 'set_stop_loss' | 'take_profit' | 'reduce_leverage' | 'close_position';
  symbol?: string; confidence: number; riskScore: number;
  reasoning: string; evidence: string[];
  alternativeScenario: string; worstCase: string; bestCase: string; probability: number;
  learningOpportunity: string; mentorNotes: string;
  sourceEngines: string[]; stored: boolean; evolved: boolean;
}

export interface TraderReport {
  userId: string; timestamp: number; period: string;
  tradesOpened: number; tradesClosed: number; netPnL: number; winRate: number;
  bestTrade: { symbol: string; pnl: number }; worstTrade: { symbol: string; pnl: number };
  improvements: string[]; risks: string[]; mentorAdvice: string;
  overallGrade: 'A' | 'B' | 'C' | 'D' | 'F';
}

class TradingExpertGen2 {
  private registered = false;

  analyzeTrade(userId: string): TradeAnalysis {
    const appData = realDataConnector.getAppData();
    const lp = learningEngine.getProfile(userId);
    const preds = predictionEngine.predictAll(userId);
    const trading = appData.trading || {};
    const totalTrades = trading.totalTrades || 0;
    const winRate = trading.avgWinRate || 0;
    const successfulPatterns = lp.successfulPatterns?.length || 0;
    let experience: TradeAnalysis['experienceLevel'] = 'beginner';
    if (totalTrades > 100 && winRate > 55) experience = 'advanced';
    else if (totalTrades > 100) experience = 'expert';
    else if (totalTrades > 30) experience = 'intermediate';
    else if (totalTrades > 5) experience = 'beginner';

    const repeatedMistakes = (lp.commonMistakes || []).map((m: any) => ({
      pattern: m.pattern, count: m.occurrences, lastSeen: m.lastOccurrence || Date.now(),
      suggestion: m.pattern === 'Excessive Leverage' ? 'Reduce leverage to 5x or below'
        : m.pattern === 'Large Loss' ? 'Set tighter stop-losses'
        : 'Review this pattern and adjust your strategy',
    }));

    const repeatedSuccesses = (lp.successfulPatterns || []).slice(0, 5).map((p: any) => ({
      pattern: p.description || p.conditions?.patternKey || 'unknown',
      count: p.occurrences, lastSeen: Date.now(),
    }));

    const favoriteCoins = (lp.favoriteCoins || []).slice(0, 5).map((c: any) => ({
      symbol: c.symbol, trades: c.trades,
      avgProfit: Math.round(c.avgProfit * 100) / 100, winRate: Math.round(c.winRate),
    }));

    const avgLev = lp.riskHabits?.find((h: any) => h.label === 'Avg Leverage')?.value || 1;
    let riskProfile: TradeAnalysis['riskProfile'] = 'low';
    if (avgLev > 15) riskProfile = 'extreme';
    else if (avgLev > 8) riskProfile = 'high';
    else if (avgLev > 3) riskProfile = 'medium';

    const emotionalBiases = (lp.emotionalBiases || []).filter((b: any) => b.score > 30).map((b: any) => ({
      type: b.type, score: b.score,
      impact: b.score > 60 ? 'Significant' : b.score > 40 ? 'Moderate' : 'Mild',
    }));

    const positions = Array.isArray(trading.positions) ? trading.positions : [];
    const exposure = positions.reduce((s: number, p: any) => s + (p.costBasis || 0), 0);
    const balance = trading.balance || 100000;
    const exposurePct = balance > 0 ? (exposure / balance) * 100 : 0;
    let portfolioHealth: TradeAnalysis['portfolioHealth'] = 'healthy';
    if (exposurePct > 75) portfolioHealth = 'critical';
    else if (exposurePct > 50 || positions.length > 10) portfolioHealth = 'risky';
    else if (positions.length > 5) portfolioHealth = 'concentrated';

    const liqPred = preds.predictions?.find((p: any) => p.type === 'liquidation');
    let marketRegime: TradeAnalysis['marketRegime'] = 'sideways';
    if (winRate > 60) marketRegime = 'bull';
    else if (winRate < 35) marketRegime = 'bear';
    else if (liqPred && liqPred.probability > 50) marketRegime = 'volatile';

    const failedCount = lp.failedPatterns?.length || 0;
    const overallScore = Math.round(
      winRate * 0.3 + (successfulPatterns / Math.max(1, successfulPatterns + failedCount)) * 100 * 0.25 +
      (100 - Math.min(exposurePct * 2, 100)) * 0.25 + (100 - Math.min(avgLev * 5, 80)) * 0.2
    );

    return {
      userId, timestamp: Date.now(), experienceLevel: experience, totalTrades, winRate,
      avgPnL: lp.successfulPatterns?.reduce((s: number, p: any) => s + (p.avgResult || 0), 0) || 0,
      repeatedMistakes, repeatedSuccesses,
      favoriteCoins, riskProfile, avgLeverage: Math.round(avgLev * 10) / 10,
      emotionalBiases,
      openPositions: positions.length, exposurePercent: Math.round(exposurePct),
      portfolioHealth,
      learningProgress: lp.learningScore || 0,
      academyLessons: appData.academy?.completedLessons || 0,
      marketRegime, overallScore,
      summary: `${experience} trader. ${winRate.toFixed(0)}% WR. Risk: ${riskProfile}.`,
    };
  }

  generateRecommendation(userId: string, symbol?: string): TradeRecommendation {
    const a = this.analyzeTrade(userId);
    const preds = predictionEngine.predictAll(userId);
    const liqPred = preds.predictions?.find((p: any) => p.type === 'liquidation');
    const winProbPred = preds.predictions?.find((p: any) => p.type === 'win_prob');
    let action: TradeRecommendation['action'] = 'hold';
    let confidence = 65;
    const evidence: string[] = [];

    if (a.riskProfile === 'extreme' || a.avgLeverage > 10) {
      action = 'reduce_leverage'; confidence = 85;
      evidence.push(`Leverage ${a.avgLeverage}x — high risk`);
    } else if (a.portfolioHealth === 'critical' || a.portfolioHealth === 'risky') {
      action = 'reduce_position'; confidence = 75;
      evidence.push(`Exposure ${a.exposurePercent}% — ${a.portfolioHealth}`);
    } else if (a.winRate > 55 && a.riskProfile === 'low') {
      action = 'add_position'; confidence = 70;
      evidence.push(`WR ${a.winRate.toFixed(0)}% with low risk`);
    } else if (a.winRate < 35) {
      action = 'wait'; confidence = 60;
      evidence.push('Win rate below 35%');
    } else if (liqPred && liqPred.probability > 50) {
      action = 'set_stop_loss'; confidence = 80;
      evidence.push(`Liquidation risk ${liqPred.probability}%`);
    } else if (a.openPositions === 0 && a.winRate > 50) {
      action = 'buy'; confidence = 68;
      evidence.push('No positions + good WR — entry opportunity');
    }

    const altAction = action === 'buy' ? 'wait' : action === 'sell' ? 'hold' : 'buy';
    const rec: TradeRecommendation = {
      id: 'rec_' + Date.now(), userId, timestamp: Date.now(), action, symbol,
      confidence,
      riskScore: a.riskProfile === 'extreme' ? 85 : a.riskProfile === 'high' ? 60 : a.riskProfile === 'medium' ? 30 : 15,
      reasoning: evidence.join('; ') || 'Analysis based on trading history',
      evidence,
      alternativeScenario: 'Alternative: ' + altAction + '. Consider if market conditions shift.',
      worstCase: 'Market moves against position — mitigate with stop-loss.',
      bestCase: 'Market moves in favor — capture gains with take-profit.',
      probability: winProbPred?.probability || 50,
      learningOpportunity: a.winRate < 50 ? 'Review losing trades. Take Risk Management course.' : 'Document your winning strategy.',
      mentorNotes: a.overallScore > 70 ? 'Strong trader — keep refining.' : a.overallScore > 40 ? 'Steady progress — reduce mistakes.' : 'Focus on basics and risk reduction.',
      sourceEngines: ['tradingExpert', 'predictionEngine', 'learningEngine', 'universalMemory'],
      stored: false, evolved: false,
    };

    memoryAccessGateway.remember(userId, userId, 'trading', { type: 'recommendation', action, confidence, symbol }, { level: 'long', importance: 75, tags: ['trading', 'recommendation', action] });
    rec.stored = true;

    selfEvolutionEngine.recordInteraction(userId, {
      personality: 'analyst', emotion: 'neutral', mentorStyle: 'direct', coachStyle: 'trading', learningStyle: 'practice',
      responseLength: 0, confidence,
      userReaction: 'accepted', timeSpent: 0,
      goalCompleted: false, missionCompleted: false,
      tradeImproved: action === 'reduce_leverage' || action === 'set_stop_loss',
      academyImproved: false, portfolioImproved: action === 'reduce_position',
      notes: 'Trading rec: ' + action,
    });
    rec.evolved = true;
    return rec;
  }

  reviewPortfolio(userId: string) {
    const a = this.analyzeTrade(userId);
    const issues: string[] = [];
    const suggestions: string[] = [];
    if (a.portfolioHealth === 'critical' || a.portfolioHealth === 'risky') {
      issues.push('Portfolio overexposed');
      suggestions.push('Reduce positions or add stop-losses');
    }
    if (a.avgLeverage > 5) {
      issues.push('High leverage: ' + a.avgLeverage + 'x');
      suggestions.push('Reduce to 3x or below');
    }
    const score = Math.max(0, 100 - a.exposurePercent * 0.8 - a.avgLeverage * 5 - issues.length * 10);
    return {
      health: a.portfolioHealth,
      score: Math.round(score),
      issues: issues.length > 0 ? issues : ['Portfolio healthy'],
      suggestions: suggestions.length > 0 ? suggestions : ['Maintain current discipline'],
    };
  }

  detectMistakes(userId: string) {
    const a = this.analyzeTrade(userId);
    const total = a.repeatedMistakes.reduce((s, m) => s + m.count, 0);
    const mc = a.repeatedMistakes[0];
    const fixes = a.repeatedMistakes.slice(0, 3).map(m => m.suggestion);
    return {
      totalDetected: total,
      mostCommon: mc ? mc.pattern + ' (' + mc.count + 'x)' : 'None',
      severity: total > 10 ? 'high' : total > 5 ? 'medium' : 'low',
      fixes: fixes.length > 0 ? fixes : ['No fixes needed'],
    };
  }

  generateLearningAdvice(userId: string) {
    const a = this.analyzeTrade(userId);
    const courses: string[] = [];
    const resources: string[] = [];
    if (a.winRate < 40) { courses.push('Trading Fundamentals', 'Risk Management'); resources.push('Stop-loss strategies'); }
    if (a.riskProfile === 'extreme' || a.riskProfile === 'high') { courses.push('Risk Management'); resources.push('Leverage explained'); }
    if (a.emotionalBiases.length > 2) { courses.push('Trading Psychology'); resources.push('Emotion journal'); }
    const priority = a.overallScore < 30 ? 'high' : a.overallScore < 50 ? 'medium' : 'low';
    return { priority, courses: courses.length > 0 ? courses : ['Continue learning'], resources: resources.length > 0 ? resources : ['Trading journal'] };
  }

  coachTrader(userId: string) {
    const a = this.analyzeTrade(userId);
    let theme = 'Balanced Trading';
    let message = '';
    if (a.overallScore > 70) { theme = 'Peak Performance'; message = 'Trading at a high level. Scale responsibly.'; }
    else if (a.overallScore > 40) { theme = 'Steady Progress'; message = 'Building solid foundations.'; }
    else { theme = 'Foundation Building'; message = 'Focus on basics: risk management, small sizes, learning.'; }
    const steps: string[] = [];
    if (a.riskProfile === 'extreme' || a.riskProfile === 'high') { steps.push('Reduce leverage to 5x or below'); steps.push('Set stop-loss on every position'); }
    if (a.winRate < 40) { steps.push('Review last 10 losing trades'); steps.push('Complete Risk Management course'); }
    if (a.exposurePercent > 50) steps.push('Close 1-2 positions to reduce exposure');
    if (steps.length === 0) { steps.push('Continue current strategy'); steps.push('Consider advanced academy courses'); }
    return { theme, message, score: a.overallScore, actionableSteps: steps };
  }

  generateReport(userId: string, period: 'daily' | 'weekly' | 'monthly' = 'weekly'): TraderReport {
    const a = this.analyzeTrade(userId);
    const appData = realDataConnector.getAppData();
    const trading = appData.trading || {};
    const positions = Array.isArray(trading.positions) ? trading.positions : [];
    let grade: TraderReport['overallGrade'] = 'C';
    if (a.overallScore > 80) grade = 'A';
    else if (a.overallScore > 65) grade = 'B';
    else if (a.overallScore > 40) grade = 'C';
    else if (a.overallScore > 20) grade = 'D';
    else grade = 'F';
    const improvements: string[] = [];
    const risks: string[] = [];
    if (a.winRate < 40) improvements.push('Win rate needs improvement');
    if (a.avgLeverage > 5) risks.push('High leverage: ' + a.avgLeverage + 'x');
    if (a.repeatedMistakes.length > 3) improvements.push('Reduce repeated mistakes');

    const report: TraderReport = {
      userId, timestamp: Date.now(), period,
      tradesOpened: trading.totalTrades || 0,
      tradesClosed: (trading.totalTrades || 0) - positions.length,
      netPnL: a.avgPnL, winRate: a.winRate,
      bestTrade: a.favoriteCoins.length > 0
        ? { symbol: a.favoriteCoins[0].symbol, pnl: a.favoriteCoins[0].avgProfit }
        : { symbol: 'N/A', pnl: 0 },
      worstTrade: { symbol: a.repeatedMistakes[0]?.pattern || 'N/A', pnl: -50 },
      improvements: improvements.length > 0 ? improvements : ['No major issues'],
      risks: risks.length > 0 ? risks : ['No significant risks'],
      mentorAdvice: a.overallScore > 50 ? 'Keep refining your edge.' : 'Focus on risk management and learning.',
      overallGrade: grade,
    };
    memoryAccessGateway.remember(userId, userId, 'trading', report, { level: 'long', importance: 80, tags: ['trader_report', period] });
    return report;
  }

  async execute(context: OrchestratorContext): Promise<void> {
    const userId = context.userId || 'anonymous';
    const appData = realDataConnector.getAppData();
    if ((appData.trading?.totalTrades || 0) > 0) this.analyzeTrade(userId);
  }

  getOrchestratorContract(): EngineContract {
    return {
      name: 'tradingExpertGen2', priority: 22,
      dependencies: ['brainFusion', 'universalMemory', 'personalityEngine', 'emotionalEngine', 'mentorEngine', 'adaptiveLearning', 'predictionEngine', 'businessAnalyst', 'executiveIntelligence', 'analyticsCenter', 'selfEvolutionEngine', 'riskManager', 'digitalTwin', 'learningEngine', 'goalEngine', 'missionEngine', 'contextEngine'],
      initialize: async () => { this.registered = true; },
      execute: (ctx) => this.execute(ctx),
      shutdown: async () => { this.registered = false; },
      health: () => ({ status: this.registered ? 'healthy' : 'degraded', lastRun: null, lastDuration: 0, errorCount: 0, totalRuns: 0, avgDuration: 0 }),
    };
  }
}

export const tradingExpertGen2 = new TradingExpertGen2();
