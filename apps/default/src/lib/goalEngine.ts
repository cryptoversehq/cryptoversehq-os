/**
 * goalEngine.ts — Lynx AI Goal Engine
 * Tracks every user's goals permanently. Filters all recommendations through active goals.
 * Goals auto-adapt based on behavior patterns. Stored in Memory Engine.
 */

import type { OrchestratorContext } from './lynxOrchestrator';
import type { EngineContract } from './lynxOrchestrator';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export type GoalId =
  | 'become_pro_trader'
  | 'learn_crypto'
  | 'complete_academy'
  | 'reach_level'
  | 'win_tournament'
  | 'earn_cp'
  | 'improve_win_rate'
  | 'reduce_risk'
  | 'long_term_investor'
  | 'short_term_scalper'
  | 'passive_learner'
  | 'aggressive_trader';

export interface Goal {
  id: GoalId;
  name: string;
  emoji: string;
  description: string;
  priority: number; // 0-100
  progress: number; // 0-100%
  difficulty: 'easy' | 'medium' | 'hard' | 'expert';
  estimatedCompletion: number; // timestamp
  dependencies: GoalId[];
  rewards: string[];
  active: boolean;
  autoAdjustable: boolean;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
}

export interface GoalReport {
  userId: string;
  activeGoals: Goal[];
  completedGoals: Goal[];
  suggestedGoals: Goal[];
  overallProgress: number; // 0-100
  nextMilestone: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Goal Definitions
// ═══════════════════════════════════════════════════════════════════════════════

const GOAL_DEFINITIONS: Record<GoalId, Omit<Goal, 'progress' | 'active' | 'createdAt' | 'updatedAt' | 'completedAt' | 'estimatedCompletion'>> = {
  become_pro_trader: {
    id: 'become_pro_trader', name: 'Become Professional Trader', emoji: '🏆',
    description: 'Master trading strategies and achieve consistent profitability',
    priority: 90, difficulty: 'expert', dependencies: ['improve_win_rate', 'complete_academy'],
    rewards: ['Pro Trader Badge', 'Unlock Advanced Strategies', 'Access to VIP Signals'],
    autoAdjustable: false,
  },
  learn_crypto: {
    id: 'learn_crypto', name: 'Learn Crypto', emoji: '📚',
    description: 'Understand blockchain fundamentals and crypto markets',
    priority: 80, difficulty: 'easy', dependencies: [],
    rewards: ['Crypto Basics Certificate', 'Unlock Academy Courses'],
    autoAdjustable: true,
  },
  complete_academy: {
    id: 'complete_academy', name: 'Complete Academy', emoji: '🎓',
    description: 'Finish all academy lessons and earn the graduation badge',
    priority: 75, difficulty: 'medium', dependencies: ['learn_crypto'],
    rewards: ['Academy Graduate Badge', 'Bonus XP', 'Unlock All Courses'],
    autoAdjustable: false,
  },
  reach_level: {
    id: 'reach_level', name: 'Reach Level X', emoji: '⭐',
    description: 'Achieve a specific academy level',
    priority: 60, difficulty: 'medium', dependencies: ['complete_academy'],
    rewards: ['Level Badge', 'Unlock Premium Features'],
    autoAdjustable: true,
  },
  win_tournament: {
    id: 'win_tournament', name: 'Win Tournament', emoji: '🏆',
    description: 'Win at least one trading tournament',
    priority: 70, difficulty: 'hard', dependencies: ['become_pro_trader'],
    rewards: ['Tournament Champion Badge', 'CP Bonus', 'Leaderboard Recognition'],
    autoAdjustable: false,
  },
  earn_cp: {
    id: 'earn_cp', name: 'Earn CP', emoji: '💰',
    description: 'Accumulate CryptoVerse Points through trading and learning',
    priority: 55, difficulty: 'medium', dependencies: [],
    rewards: ['CP Balance Growth', 'Purchase Premium Items'],
    autoAdjustable: true,
  },
  improve_win_rate: {
    id: 'improve_win_rate', name: 'Improve Win Rate', emoji: '📈',
    description: 'Achieve and maintain a win rate above 60%',
    priority: 65, difficulty: 'hard', dependencies: ['learn_crypto'],
    rewards: ['Consistent Profit', 'Trader Reputation Boost'],
    autoAdjustable: true,
  },
  reduce_risk: {
    id: 'reduce_risk', name: 'Reduce Risk', emoji: '🛡️',
    description: 'Lower your risk exposure and trade more conservatively',
    priority: 50, difficulty: 'easy', dependencies: [],
    rewards: ['Safer Portfolio', 'Lower Stress Trading'],
    autoAdjustable: true,
  },
  long_term_investor: {
    id: 'long_term_investor', name: 'Long-term Investor', emoji: '🐢',
    description: 'Build a portfolio for long-term growth',
    priority: 40, difficulty: 'easy', dependencies: ['learn_crypto'],
    rewards: ['Portfolio Growth', 'Passive Income'],
    autoAdjustable: true,
  },
  short_term_scalper: {
    id: 'short_term_scalper', name: 'Short-term Scalper', emoji: '🐇',
    description: 'Master quick, short-term trades for fast profits',
    priority: 45, difficulty: 'hard', dependencies: ['learn_crypto'],
    rewards: ['Fast Profits', 'Quick Decision Skills'],
    autoAdjustable: true,
  },
  passive_learner: {
    id: 'passive_learner', name: 'Passive Learner', emoji: '📖',
    description: 'Learn at your own pace without pressure',
    priority: 30, difficulty: 'easy', dependencies: [],
    rewards: ['Stress-free Learning', 'Solid Foundations'],
    autoAdjustable: true,
  },
  aggressive_trader: {
    id: 'aggressive_trader', name: 'Aggressive Trader', emoji: '🔥',
    description: 'Maximize returns through high-risk/high-reward strategies',
    priority: 35, difficulty: 'hard', dependencies: ['become_pro_trader'],
    rewards: ['Maximum Returns', 'Elite Trader Status'],
    autoAdjustable: true,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// GoalEngine
// ═══════════════════════════════════════════════════════════════════════════════

class GoalEngine {
  private userGoals: Map<string, Goal[]> = new Map(); // userId → goals
  private registered = false;

  // ── Public API ──────────────────────────────────────────────────────────

  /** Get all goals for a user (creates defaults if none exist) */
  getGoals(userId: string): Goal[] {
    if (!this.userGoals.has(userId)) {
      this.userGoals.set(userId, this.createDefaultGoals());
    }
    return this.userGoals.get(userId)!;
  }

  /** Get active goals only */
  getActiveGoals(userId: string): Goal[] {
    return this.getGoals(userId).filter((g) => g.active);
  }

  /** Get completed goals */
  getCompletedGoals(userId: string): Goal[] {
    return this.getGoals(userId).filter((g) => g.completedAt !== null);
  }

  /** Activate a goal */
  activateGoal(userId: string, goalId: GoalId): void {
    const goals = this.getGoals(userId);
    const goal = goals.find((g) => g.id === goalId);
    if (goal) {
      goal.active = true;
      goal.updatedAt = Date.now();
      // Auto-activate dependencies
      for (const depId of goal.dependencies) {
        const dep = goals.find((g) => g.id === depId);
        if (dep && !dep.active) {
          dep.active = true;
          dep.updatedAt = Date.now();
        }
      }
      this.persist(userId);
    }
  }

  /** Complete a goal */
  completeGoal(userId: string, goalId: GoalId): void {
    const goals = this.getGoals(userId);
    const goal = goals.find((g) => g.id === goalId);
    if (goal && goal.active) {
      goal.active = false;
      goal.progress = 100;
      goal.completedAt = Date.now();
      goal.updatedAt = Date.now();
      this.persist(userId);
    }
  }

  /** Update goal progress (0-100) */
  updateProgress(userId: string, goalId: GoalId, progress: number): void {
    const goals = this.getGoals(userId);
    const goal = goals.find((g) => g.id === goalId);
    if (goal) {
      goal.progress = Math.min(100, Math.max(0, progress));
      goal.updatedAt = Date.now();
      if (goal.progress >= 100) {
        this.completeGoal(userId, goalId);
      }
      this.persist(userId);
    }
  }

  /** Generate a full report for a user */
  getReport(userId: string): GoalReport {
    const allGoals = this.getGoals(userId);
    const active = allGoals.filter((g) => g.active);
    const completed = allGoals.filter((g) => g.completedAt !== null);
    const suggested = allGoals.filter((g) => !g.active && g.completedAt === null && g.autoAdjustable);
    const overall = allGoals.length > 0
      ? Math.round(allGoals.reduce((s, g) => s + g.progress, 0) / allGoals.length)
      : 0;

    return {
      userId,
      activeGoals: active,
      completedGoals: completed,
      suggestedGoals: suggested.slice(0, 3),
      overallProgress: overall,
      nextMilestone: active.length > 0
        ? this.getNextMilestone(active[0])
        : 'No active goals. Activate a goal to start!',
    };
  }

  /** Get the next milestone description for a goal */
  private getNextMilestone(goal: Goal): string {
    if (goal.progress < 25) return `${goal.emoji} Getting started with "${goal.name}" — complete the first 25%!`;
    if (goal.progress < 50) return `${goal.emoji} Making progress on "${goal.name}" — halfway there at 50%!`;
    if (goal.progress < 75) return `${goal.emoji} Great progress on "${goal.name}" — almost there at 75%!`;
    return `${goal.emoji} Finishing "${goal.name}" — final push to complete!`;
  }

  /** Auto-adjust goals based on user behavior patterns */
  autoAdjust(userId: string, context: { tradingStyle?: string; riskLevel?: string; academyLevel?: number; winRate?: number }): void {
    const goals = this.getGoals(userId);

    // Detect trading style and adjust goals
    if (context.tradingStyle === 'scalper') {
      this.ensureGoalActive(goals, 'short_term_scalper');
      this.ensureGoalInactive(goals, 'long_term_investor');
    } else if (context.tradingStyle === 'swing_trader' || context.tradingStyle === 'holder') {
      this.ensureGoalActive(goals, 'long_term_investor');
      this.ensureGoalInactive(goals, 'short_term_scalper');
    }

    // High risk → suggest reduce_risk
    if (context.riskLevel === 'high' || context.riskLevel === 'extreme') {
      this.ensureGoalActive(goals, 'reduce_risk');
      this.ensureGoalInactive(goals, 'aggressive_trader');
    }

    // Low risk → suggest aggressive growth
    if (context.riskLevel === 'low') {
      this.ensureGoalInactive(goals, 'reduce_risk');
    }

    // Academy progress
    if (context.academyLevel && context.academyLevel >= 5) {
      this.ensureGoalActive(goals, 'become_pro_trader');
    }

    // Win rate tracking
    if (context.winRate && context.winRate < 50) {
      this.ensureGoalActive(goals, 'improve_win_rate');
    } else if (context.winRate && context.winRate >= 60) {
      this.updateProgress(userId, 'improve_win_rate', 80);
    }

    this.persist(userId);
  }

  /** Filter recommendations through active goals */
  filterRecommendations(userId: string, recommendations: string[]): string[] {
    const activeGoals = this.getActiveGoals(userId);
    if (activeGoals.length === 0) return recommendations;

    const goalNames = new Set(activeGoals.map((g) => g.name.toLowerCase()));
    const goalKeywords = new Set(activeGoals.flatMap((g) => g.name.toLowerCase().split(/[\s_]+/)));

    // Score each recommendation by relevance to active goals
    const scored = recommendations.map((rec) => {
      const lower = rec.toLowerCase();
      let score = 0;
      for (const kw of goalKeywords) {
        if (lower.includes(kw)) score += 2;
      }
      for (const name of goalNames) {
        if (lower.includes(name)) score += 5;
      }
      return { rec, score };
    });

    // Sort by relevance, keep only those with score > 0
    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((s) => s.rec);
  }

  // ── Orchestrator Integration ────────────────────────────────────────────

  /** Execute as part of the orchestrator pipeline */
  async execute(context: OrchestratorContext): Promise<void> {
    const userId = context.userId || 'anonymous';

    // Ensure goals exist
    this.getGoals(userId);

    // Auto-adjust based on snapshot data
    const snapshot = context.snapshot;
    this.autoAdjust(userId, {
      tradingStyle: snapshot.memoryEngine?.tradingStyle,
      riskLevel: snapshot.brainEngine?.riskLevel,
      academyLevel: snapshot.contextEngine?.level,
      winRate: snapshot.contextEngine?.winRate,
    });
  }

  /** Create the orchestrator engine contract */
  getOrchestratorContract(): EngineContract {
    return {
      name: 'goalEngine',
      priority: 9, // Runs after brain but before business
      dependencies: ['contextEngine', 'memoryEngine', 'brainEngine'],
      initialize: async () => { this.registered = true; },
      execute: (ctx: OrchestratorContext) => this.execute(ctx),
      shutdown: async () => { this.registered = false; },
      health: () => ({
        status: this.registered ? 'healthy' : 'degraded',
        lastRun: null,
        lastDuration: 0,
        errorCount: 0,
        totalRuns: 0,
        avgDuration: 0,
      }),
    };
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private createDefaultGoals(): Goal[] {
    return Object.values(GOAL_DEFINITIONS).map((def) => ({
      ...def,
      progress: 0,
      active: def.id === 'learn_crypto' || def.id === 'passive_learner', // Start with beginner goals
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completedAt: null,
      estimatedCompletion: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days from now
    }));
  }

  private ensureGoalActive(goals: Goal[], goalId: GoalId): void {
    const goal = goals.find((g) => g.id === goalId);
    if (goal && !goal.active && goal.autoAdjustable) {
      goal.active = true;
      goal.updatedAt = Date.now();
    }
  }

  private ensureGoalInactive(goals: Goal[], goalId: GoalId): void {
    const goal = goals.find((g) => g.id === goalId);
    if (goal && goal.active && goal.autoAdjustable) {
      goal.active = false;
      goal.updatedAt = Date.now();
    }
  }

  private persist(userId: string): void {
    try {
      const goals = this.userGoals.get(userId);
      if (goals) {
        localStorage.setItem(`cv_lynx_goals_${userId}`, JSON.stringify(goals));
      }
    } catch {}
  }

  /** Load persisted goals */
  load(userId: string): void {
    try {
      const data = localStorage.getItem(`cv_lynx_goals_${userId}`);
      if (data) {
        this.userGoals.set(userId, JSON.parse(data));
      }
    } catch {}
  }
}

export const goalEngine = new GoalEngine();
