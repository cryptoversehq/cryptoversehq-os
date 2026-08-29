/**
 * missionEngine.ts — Lynx AI Mission Engine
 * Generates daily/weekly missions across all categories.
 * Adaptive difficulty based on user level. Dynamic rewards (CP, XP, Badges, Coaching).
 * Integrates with Coach Engine and Orchestrator.
 */

import type { OrchestratorContext, EngineContract } from './lynxOrchestrator';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export type MissionCategory = 'learning' | 'trading' | 'risk' | 'tournament' | 'reward';
export type MissionDifficulty = 'easy' | 'medium' | 'hard';
export type MissionPeriod = 'daily' | 'weekly';
export type MissionStatus = 'active' | 'completed' | 'failed' | 'expired';
export type RewardType = 'cp' | 'xp' | 'badge' | 'coaching';

export interface MissionReward {
  type: RewardType;
  amount: number;
  label: string;
  claimed: boolean;
}

export interface Mission {
  id: string;
  category: MissionCategory;
  period: MissionPeriod;
  difficulty: MissionDifficulty;
  title: string;
  description: string;
  icon: string;
  target: number; // e.g., "complete 3 trades"
  progress: number;
  status: MissionStatus;
  rewards: MissionReward[];
  expiresAt: number;
  createdAt: number;
  completedAt: number | null;
  coachingBonus: string | null; // AI coaching message on completion
}

export interface MissionReport {
  userId: string;
  active: Mission[];
  completed: Mission[];
  successRate: number;
  totalEarned: { cp: number; xp: number; badges: string[] };
  streak: number; // days with at least one completed mission
  history: MissionHistory[];
}

export interface MissionHistory {
  date: string;
  completed: number;
  total: number;
  earned: { cp: number; xp: number };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Mission Templates
// ═══════════════════════════════════════════════════════════════════════════════

interface MissionTemplate {
  category: MissionCategory;
  period: MissionPeriod;
  difficulty: MissionDifficulty;
  title: string;
  desc: string;
  icon: string;
  target: number;
  rewards: MissionReward[];
  coaching: string;
}

const TEMPLATES: MissionTemplate[] = [
  // ── Learning Missions ──────────────────────────────────────────────────
  { category: 'learning', period: 'daily', difficulty: 'easy', title: 'Read One Lesson', desc: 'Complete one academy lesson today', icon: '📖', target: 1, rewards: [{ type: 'xp', amount: 50, label: '+50 XP', claimed: false }, { type: 'cp', amount: 10, label: '+10 CP', claimed: false }], coaching: 'Great start! Consistent learning builds strong foundations. 📚' },
  { category: 'learning', period: 'daily', difficulty: 'medium', title: 'Quiz Master', desc: 'Pass a quiz with 80%+ score', icon: '✍️', target: 1, rewards: [{ type: 'xp', amount: 100, label: '+100 XP', claimed: false }, { type: 'cp', amount: 25, label: '+25 CP', claimed: false }], coaching: 'Excellent quiz performance! You are mastering the material. 🎓' },
  { category: 'learning', period: 'daily', difficulty: 'hard', title: 'Complete Module', desc: 'Finish an entire module in one day', icon: '🎯', target: 1, rewards: [{ type: 'xp', amount: 200, label: '+200 XP', claimed: false }, { type: 'cp', amount: 50, label: '+50 CP', claimed: false }, { type: 'badge', amount: 1, label: 'Speed Learner Badge', claimed: false }], coaching: 'Incredible dedication! You completed a full module in one day. 🏆' },
  { category: 'learning', period: 'weekly', difficulty: 'medium', title: 'Weekly Scholar', desc: 'Complete 5 lessons this week', icon: '📚', target: 5, rewards: [{ type: 'xp', amount: 300, label: '+300 XP', claimed: false }, { type: 'cp', amount: 80, label: '+80 CP', claimed: false }], coaching: 'Five lessons in one week! Your knowledge is growing fast. 🌱' },
  { category: 'learning', period: 'weekly', difficulty: 'hard', title: 'Academy Graduate', desc: 'Complete 10 lessons and pass 3 quizzes', icon: '🎓', target: 3, rewards: [{ type: 'xp', amount: 500, label: '+500 XP', claimed: false }, { type: 'cp', amount: 150, label: '+150 CP', claimed: false }, { type: 'badge', amount: 1, label: 'Academy Star Badge', claimed: false }], coaching: 'Outstanding academic achievement! You are on the path to mastery. ⭐' },

  // ── Trading Missions ───────────────────────────────────────────────────
  { category: 'trading', period: 'daily', difficulty: 'easy', title: 'First Trade', desc: 'Open one trade in the simulator', icon: '📈', target: 1, rewards: [{ type: 'xp', amount: 30, label: '+30 XP', claimed: false }, { type: 'cp', amount: 15, label: '+15 CP', claimed: false }], coaching: 'First trade of the day! Practice makes perfect. 💪' },
  { category: 'trading', period: 'daily', difficulty: 'medium', title: 'Active Trader', desc: 'Complete 3 trades with profit', icon: '💹', target: 3, rewards: [{ type: 'xp', amount: 100, label: '+100 XP', claimed: false }, { type: 'cp', amount: 40, label: '+40 CP', claimed: false }], coaching: 'Three profitable trades! Your trading skills are improving. 📊' },
  { category: 'trading', period: 'daily', difficulty: 'hard', title: 'Day Trader Pro', desc: 'Close 5 trades with 60%+ win rate', icon: '🔥', target: 5, rewards: [{ type: 'xp', amount: 250, label: '+250 XP', claimed: false }, { type: 'cp', amount: 100, label: '+100 CP', claimed: false }, { type: 'badge', amount: 1, label: 'Day Trader Badge', claimed: false }], coaching: 'Pro-level trading today! 60%+ win rate is impressive. 🔥' },
  { category: 'trading', period: 'weekly', difficulty: 'medium', title: 'Weekly Trader', desc: 'Complete 10 trades this week', icon: '📊', target: 10, rewards: [{ type: 'xp', amount: 200, label: '+200 XP', claimed: false }, { type: 'cp', amount: 75, label: '+75 CP', claimed: false }], coaching: 'Consistent trading builds skill. Great work this week! 🎯' },
  { category: 'trading', period: 'weekly', difficulty: 'hard', title: 'Profit Hunter', desc: 'Achieve $500+ total profit this week', icon: '💰', target: 500, rewards: [{ type: 'xp', amount: 400, label: '+400 XP', claimed: false }, { type: 'cp', amount: 200, label: '+200 CP', claimed: false }, { type: 'badge', amount: 1, label: 'Profit Hunter Badge', claimed: false }], coaching: '$500+ profit this week! You are a profit machine. 💰' },

  // ── Risk Missions ──────────────────────────────────────────────────────
  { category: 'risk', period: 'daily', difficulty: 'easy', title: 'Safe Trader', desc: 'Keep leverage at 2x or below for all trades', icon: '🛡️', target: 1, rewards: [{ type: 'xp', amount: 40, label: '+40 XP', claimed: false }, { type: 'cp', amount: 20, label: '+20 CP', claimed: false }], coaching: 'Smart risk management! Low leverage protects your capital. 🛡️' },
  { category: 'risk', period: 'daily', difficulty: 'medium', title: 'Stop Loss Guardian', desc: 'Set stop-loss on all open positions', icon: '⛔', target: 1, rewards: [{ type: 'xp', amount: 60, label: '+60 XP', claimed: false }, { type: 'cp', amount: 30, label: '+30 CP', claimed: false }], coaching: 'Every stop-loss set is a shield against unexpected moves. Good discipline! ⛔' },
  { category: 'risk', period: 'weekly', difficulty: 'hard', title: 'Risk Master', desc: 'Maintain <20% portfolio exposure all week', icon: '🎛️', target: 1, rewards: [{ type: 'xp', amount: 300, label: '+300 XP', claimed: false }, { type: 'cp', amount: 100, label: '+100 CP', claimed: false }, { type: 'badge', amount: 1, label: 'Risk Master Badge', claimed: false }], coaching: 'Master-level risk control! Under 20% exposure is professional-grade. 🎖️' },

  // ── Tournament Missions ────────────────────────────────────────────────
  { category: 'tournament', period: 'daily', difficulty: 'easy', title: 'Tournament Check-in', desc: 'View the tournament leaderboard', icon: '🏆', target: 1, rewards: [{ type: 'xp', amount: 20, label: '+20 XP', claimed: false }, { type: 'cp', amount: 10, label: '+10 CP', claimed: false }], coaching: 'Staying informed about the competition keeps you motivated! 🏆' },
  { category: 'tournament', period: 'weekly', difficulty: 'medium', title: 'Competitor', desc: 'Participate in a tournament event', icon: '⚔️', target: 1, rewards: [{ type: 'xp', amount: 150, label: '+150 XP', claimed: false }, { type: 'cp', amount: 60, label: '+60 CP', claimed: false }], coaching: 'Competition sharpens your skills. Well fought! ⚔️' },
  { category: 'tournament', period: 'weekly', difficulty: 'hard', title: 'Top 10 Finish', desc: 'Finish in the top 10 of a tournament', icon: '🥇', target: 1, rewards: [{ type: 'xp', amount: 500, label: '+500 XP', claimed: false }, { type: 'cp', amount: 250, label: '+250 CP', claimed: false }, { type: 'badge', amount: 1, label: 'Elite Competitor Badge', claimed: false }], coaching: 'Top 10! You are among the elite traders. 🥇' },

  // ── Reward Missions ────────────────────────────────────────────────────
  { category: 'reward', period: 'daily', difficulty: 'easy', title: 'Daily Login', desc: 'Log in and check your dashboard', icon: '👋', target: 1, rewards: [{ type: 'cp', amount: 5, label: '+5 CP', claimed: false }], coaching: 'Consistency is key! Every day logged in is progress. 👋' },
  { category: 'reward', period: 'daily', difficulty: 'medium', title: 'Social Sharer', desc: 'Share your trading results', icon: '📢', target: 1, rewards: [{ type: 'xp', amount: 50, label: '+50 XP', claimed: false }, { type: 'cp', amount: 20, label: '+20 CP', claimed: false }], coaching: 'Sharing results builds community and accountability. 📢' },
  { category: 'reward', period: 'weekly', difficulty: 'medium', title: 'Weekly Streak', desc: 'Complete at least one mission every day this week', icon: '🔥', target: 7, rewards: [{ type: 'xp', amount: 200, label: '+200 XP', claimed: false }, { type: 'cp', amount: 100, label: '+100 CP', claimed: false }, { type: 'badge', amount: 1, label: 'Weekly Streak Badge', claimed: false }], coaching: '7-day streak! Your dedication is inspiring. 🔥' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// MissionEngine
// ═══════════════════════════════════════════════════════════════════════════════

class MissionEngine {
  private userMissions: Map<string, Mission[]> = new Map();
  private missionHistory: Map<string, MissionHistory[]> = new Map();
  private registered = false;
  private readonly KEY = 'cv_lynx_missions_';
  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.refreshInterval = setInterval(() => this.refreshAll(), 3600000); // Refresh every hour
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /** Get or generate missions for a user */
  getMissions(userId: string): Mission[] {
    if (!this.userMissions.has(userId)) {
      this.userMissions.set(userId, this.load(userId) || this.generateMissions(userId, 5));
    }
    return this.userMissions.get(userId)!;
  }

  /** Generate new missions based on user context */
  generateMissions(userId: string, count: number, context?: { level?: number; tradingStyle?: string; riskLevel?: string }): Mission[] {
    const level = context?.level || 1;
    const existing = this.userMissions.get(userId) || [];
    const completedIds = new Set(existing.filter(m => m.status !== 'active').map(m => m.id));

    // Determine difficulty distribution based on level
    const diffWeights = level < 3
      ? { easy: 60, medium: 30, hard: 10 }
      : level < 7
        ? { easy: 30, medium: 50, hard: 20 }
        : { easy: 10, medium: 40, hard: 50 };

    // Filter templates: skip already-completed, respect period
    const now = Date.now();
    const available = TEMPLATES.filter(t => {
      const id = this.missionId(t);
      if (completedIds.has(id)) return false;
      // Respect difficulty distribution
      return true;
    });

    // Pick missions based on weighted difficulty
    const newMissions: Mission[] = [];
    const shuffled = [...available].sort(() => Math.random() - 0.5);

    // Ensure category diversity
    const cats = new Set<string>();
    for (const tpl of shuffled) {
      if (newMissions.length >= count) break;
      if (cats.size < 3 && cats.has(tpl.category)) continue; // Diversity first
      
      const diff = this.pickDifficulty(diffWeights);
      const match = shuffled.find(t => t.category === tpl.category && t.difficulty === diff);
      if (!match && newMissions.length < 3) {
        // Fallback to any difficulty for this category
        const fallback = shuffled.find(t => t.category === tpl.category);
        if (fallback) {
          newMissions.push(this.templateToMission(fallback, now));
          cats.add(fallback.category);
        }
        continue;
      }
      if (match) {
        newMissions.push(this.templateToMission(match, now));
        cats.add(match.category);
      }
    }

    // Merge with existing active missions
    const active = existing.filter(m => m.status === 'active' && m.expiresAt > now);
    const merged = [...active, ...newMissions];

    // Cap at 10 active missions
    const result = merged.slice(0, 10);
    this.userMissions.set(userId, result);
    this.persist(userId);
    return result;
  }

  /** Update progress on a mission */
  updateProgress(userId: string, missionId: string, progress: number): Mission | null {
    const missions = this.getMissions(userId);
    const mission = missions.find(m => m.id === missionId);
    if (!mission || mission.status !== 'active') return null;

    mission.progress = Math.min(mission.target, progress);
    if (mission.progress >= mission.target) {
      mission.status = 'completed';
      mission.completedAt = Date.now();
      this.recordCompletion(userId, mission);
    }
    this.persist(userId);
    return mission;
  }

  /** Claim mission rewards */
  claimRewards(userId: string, missionId: string): MissionReward[] | null {
    const missions = this.getMissions(userId);
    const mission = missions.find(m => m.id === missionId);
    if (!mission || mission.status !== 'completed') return null;

    const unclaimed = mission.rewards.filter(r => !r.claimed);
    for (const r of unclaimed) r.claimed = true;
    this.persist(userId);
    return unclaimed;
  }

  /** Get mission report */
  getReport(userId: string): MissionReport {
    const missions = this.getMissions(userId);
    const active = missions.filter(m => m.status === 'active' && m.expiresAt > Date.now());
    const completed = missions.filter(m => m.status === 'completed');
    const totalAttempted = missions.filter(m => m.status !== 'active');
    const successRate = totalAttempted.length > 0
      ? Math.round((completed.length / totalAttempted.length) * 100)
      : 0;

    const totalEarned = {
      cp: completed.reduce((s, m) => s + m.rewards.filter(r => r.claimed && r.type === 'cp').reduce((a, r) => a + r.amount, 0), 0),
      xp: completed.reduce((s, m) => s + m.rewards.filter(r => r.claimed && r.type === 'xp').reduce((a, r) => a + r.amount, 0), 0),
      badges: completed
        .filter(m => m.rewards.some(r => r.claimed && r.type === 'badge'))
        .flatMap(m => m.rewards.filter(r => r.claimed && r.type === 'badge').map(r => r.label)),
    };

    const streak = this.calculateStreak(userId);

    return {
      userId,
      active,
      completed: completed.slice(-20),
      successRate,
      totalEarned,
      streak,
      history: this.missionHistory.get(userId) || [],
    };
  }

  // ── Orchestrator Integration ────────────────────────────────────────────

  async execute(context: OrchestratorContext): Promise<void> {
    const userId = context.userId || 'anonymous';
    const missions = this.getMissions(userId);

    // Check for auto-completion triggers based on events
    if (context.event) {
      const event = context.event;
      for (const mission of missions) {
        if (mission.status !== 'active') continue;

        // Auto-track progress based on event type
        if (mission.category === 'learning' && (event.type.includes('ACADEMY') || event.type.includes('LESSON') || event.type.includes('QUIZ'))) {
          this.updateProgress(userId, mission.id, mission.progress + 1);
        } else if (mission.category === 'trading' && event.type === 'TRADE_OPEN') {
          this.updateProgress(userId, mission.id, mission.progress + 1);
        } else if (mission.category === 'reward' && mission.title.includes('Login') && event.type === 'PAGE_VIEW') {
          this.updateProgress(userId, mission.id, mission.target);
        }
      }

      // Generate new missions if all are completed
      const activeCount = missions.filter(m => m.status === 'active').length;
      if (activeCount < 3) {
        this.generateMissions(userId, 5 - activeCount, {
          level: (context.event as any)?.level || 1,
        });
      }
    }
  }

  getOrchestratorContract(): EngineContract {
    return {
      name: 'missionEngine',
      priority: 8,
      dependencies: ['contextEngine', 'brainEngine', 'coachEngine'],
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

  private pickDifficulty(weights: Record<string, number>): MissionDifficulty {
    const roll = Math.random() * 100;
    if (roll < weights.easy) return 'easy';
    if (roll < weights.easy + weights.medium) return 'medium';
    return 'hard';
  }

  private missionId(tpl: MissionTemplate): string {
    return `${tpl.category}_${tpl.period}_${tpl.difficulty}_${tpl.title.replace(/\s+/g, '_').toLowerCase()}`;
  }

  private templateToMission(tpl: MissionTemplate, now: number): Mission {
    const expiresMs = tpl.period === 'daily' ? 86400000 : 7 * 86400000;
    return {
      id: this.missionId(tpl),
      category: tpl.category,
      period: tpl.period,
      difficulty: tpl.difficulty,
      title: tpl.title,
      description: tpl.desc,
      icon: tpl.icon,
      target: tpl.target,
      progress: 0,
      status: 'active',
      rewards: tpl.rewards.map(r => ({ ...r })),
      expiresAt: now + expiresMs,
      createdAt: now,
      completedAt: null,
      coachingBonus: tpl.coaching,
    };
  }

  private recordCompletion(userId: string, mission: Mission): void {
    if (!this.missionHistory.has(userId)) this.missionHistory.set(userId, []);
    const history = this.missionHistory.get(userId)!;
    const today = new Date().toISOString().split('T')[0];
    const entry = history.find(h => h.date === today);
    if (entry) {
      entry.completed++;
      entry.total++;
      entry.earned.cp += mission.rewards.filter(r => r.type === 'cp').reduce((s, r) => s + r.amount, 0);
      entry.earned.xp += mission.rewards.filter(r => r.type === 'xp').reduce((s, r) => s + r.amount, 0);
    } else {
      history.push({
        date: today,
        completed: 1,
        total: 1,
        earned: {
          cp: mission.rewards.filter(r => r.type === 'cp').reduce((s, r) => s + r.amount, 0),
          xp: mission.rewards.filter(r => r.type === 'xp').reduce((s, r) => s + r.amount, 0),
        },
      });
    }
    if (history.length > 90) history.splice(0, history.length - 90);
  }

  private calculateStreak(userId: string): number {
    const history = this.missionHistory.get(userId) || [];
    if (history.length === 0) return 0;
    const sorted = [...history].sort((a, b) => b.date.localeCompare(a.date));
    let streak = 0;
    const today = new Date();
    for (const entry of sorted) {
      const entryDate = new Date(entry.date);
      const daysDiff = Math.floor((today.getTime() - entryDate.getTime()) / 86400000);
      if (daysDiff === streak && entry.completed > 0) {
        streak++;
      } else if (daysDiff > streak) break;
    }
    return streak;
  }

  private refreshAll(): void {
    const now = Date.now();
    for (const [userId, missions] of this.userMissions) {
      const updated = missions.map(m => {
        if (m.status === 'active' && m.expiresAt < now) {
          return { ...m, status: 'expired' as MissionStatus };
        }
        return m;
      });
      this.userMissions.set(userId, updated);
      this.persist(userId);
    }
  }

  private persist(userId: string): void {
    try {
      const missions = this.userMissions.get(userId);
      if (missions) localStorage.setItem(this.KEY + userId, JSON.stringify(missions));
    } catch {}
  }

  private load(userId: string): Mission[] | null {
    try {
      const d = localStorage.getItem(this.KEY + userId);
      return d ? JSON.parse(d) : null;
    } catch { return null; }
  }
}

export const missionEngine = new MissionEngine();
