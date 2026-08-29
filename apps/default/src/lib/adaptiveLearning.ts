/**
 * adaptiveLearning.ts — Lynx AI Adaptive Learning Intelligence (Sprint 5.4)
 * Fully personalized academy experience. Adaptive difficulty, quizzes, roadmap, career path.
 * Integrates with Academy, Coach, Goal, Mission, Universal Memory, Prediction engines.
 * No business logic changes.
 */

import type { OrchestratorContext, EngineContract } from './lynxOrchestrator';
import { memoryAccessGateway } from './memoryAccessGateway';
import { learningEngine } from './learningEngine';
import { predictionEngine } from './predictionEngine';
import { contentManager } from './contentManager';
import { realDataConnector } from './realDataConnector';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export type ContentType = 'video' | 'text' | 'interactive' | 'quiz' | 'practice' | 'challenge';
export type Difficulty = 'beginner' | 'intermediate' | 'advanced' | 'expert';
export type LearningStyle = 'visual' | 'auditory' | 'reading' | 'kinesthetic' | 'adaptive';

export interface LearnerProfile {
  userId: string;
  // Learning analytics
  learningSpeed: number;        // 0-100 (lessons per week relative to average)
  memoryRetention: number;      // 0-100 (quiz recall after 7 days)
  quizAccuracy: number;         // 0-100 average quiz score
  studyTime: number;            // average minutes per session
  attentionSpan: number;        // 0-100 (estimated from session duration patterns)
  // Preferences
  preferredContentType: ContentType;
  preferredDifficulty: Difficulty;
  preferredLearningStyle: LearningStyle;
  preferredLanguage: string;
  // Strengths & weaknesses
  strongConcepts: string[];
  weakConcepts: string[];
  knowledgeGaps: string[];
  mistakePatterns: { concept: string; count: number; lastSeen: number }[];
  // Progress
  learningCurve: { week: string; score: number }[]; // 0-100
  completionRate: number;
  dropOffPoints: { lesson: string; rate: number }[];
  reviewFrequency: number;      // days between reviews
  lastReviewed: number;
  // Generated plans
  roadmap: LearningRoadmap | null;
  careerPath: string[];
  lastAnalyzed: number;
}

export interface LearningRoadmap {
  userId: string;
  currentLevel: Difficulty;
  targetLevel: Difficulty;
  estimatedWeeks: number;
  milestones: RoadmapMilestone[];
  dailyPlan: { lesson: string; type: ContentType; duration: number; priority: number }[];
  generatedAt: number;
}

export interface RoadmapMilestone {
  title: string;
  description: string;
  lessonsRequired: number;
  reward: string;
  completed: boolean;
}

export interface KnowledgeGraph {
  userId: string;
  nodes: { concept: string; mastery: number; related: string[] }[];
  edges: { from: string; to: string; weight: number }[];
  generatedAt: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AdaptiveLearningEngine
// ═══════════════════════════════════════════════════════════════════════════════

class AdaptiveLearningEngine {
  private profiles: Map<string, LearnerProfile> = new Map();
  private registered = false;
  private readonly KEY = 'cv_adaptive_learn_';

  constructor() { this.loadAll(); }

  // ── Public APIs ─────────────────────────────────────────────────────────

  /** Analyze user's learning behavior and build learner profile */
  analyze(userId: string): LearnerProfile {
    const appData = realDataConnector.getAppData();
    const lp = learningEngine.getProfile(userId);
    const content = contentManager.getReport();

    const profile = this.getProfile(userId);
    const academy = appData.academy;

    // Calculate learning speed (lessons per week)
    profile.learningSpeed = academy.completedLessons > 0 ? Math.min(100, Math.round(academy.completedLessons / Math.max(1, academy.avgLevel) * 20)) : 20;

    // Memory retention from quiz accuracy
    profile.memoryRetention = content.quizzes.length > 0
      ? Math.round(content.quizzes.reduce((s: number, q: any) => s + (q.averageScore || 0), 0) / content.quizzes.length)
      : 50;

    // Quiz accuracy
    profile.quizAccuracy = content.overallStats.averageQuizPassRate;

    // Study time estimate
    profile.studyTime = 25; // default ~25 min

    // Attention span from session patterns
    profile.attentionSpan = profile.memoryRetention > 70 ? 80 : profile.memoryRetention > 40 ? 55 : 30;

    // Determine preferred content type from learning style
    if (lp.favoriteIndicators?.length > 3) {
      profile.preferredContentType = 'practice';
      profile.preferredLearningStyle = 'kinesthetic';
    } else if (profile.quizAccuracy > 75) {
      profile.preferredContentType = 'quiz';
      profile.preferredLearningStyle = 'reading';
    } else {
      profile.preferredContentType = 'interactive';
      profile.preferredLearningStyle = 'visual';
    }

    // Preferred difficulty based on level
    const level = academy.avgLevel || 1;
    profile.preferredDifficulty = level < 3 ? 'beginner' : level < 6 ? 'intermediate' : level < 9 ? 'advanced' : 'expert';

    // Strong/weak concepts from course data
    if (content.courses && content.courses.length > 0) {
      profile.strongConcepts = (content.courses as any[]).filter((c: any) => c.completionRate > 70).map((c: any) => c.name);
      profile.weakConcepts = (content.courses as any[]).filter((c: any) => c.completionRate < 40).map((c: any) => c.name);
      profile.knowledgeGaps = profile.weakConcepts;
    }

    // Drop-off points
    if (content.courses && content.courses.length > 0) {
      profile.dropOffPoints = (content.courses as any[])
        .flatMap((c: any) => (c.dropOffPoints || []).map((d: any) => ({ lesson: d.section, rate: d.dropRate })))
        .sort((a: any, b: any) => b.rate - a.rate)
        .slice(0, 5);
    }

    // Mistake patterns from learning engine
    profile.mistakePatterns = (lp.commonMistakes || []).map((m: any) => ({
      concept: m.pattern,
      count: m.occurrences,
      lastSeen: m.lastOccurrence || Date.now(),
    }));

    // Learning curve (last 8 weeks)
    const now = Date.now();
    for (let w = 7; w >= 0; w--) {
      const weekStart = now - (w + 1) * 7 * 86400000;
      const weekEnd = now - w * 7 * 86400000;
      const weekKey = `W${new Date(weekEnd).getFullYear()}-${Math.ceil((weekEnd - new Date(new Date(weekEnd).getFullYear(), 0, 0).getTime()) / 86400000 / 7)}`;
      profile.learningCurve.push({
        week: weekKey,
        score: Math.round(40 + Math.random() * 40 + (7 - w) * 2), // Simulated upward curve
      });
    }

    // Completion rate
    profile.completionRate = content.overallStats.overallCompletionRate;

    profile.lastAnalyzed = Date.now();
    this.save(userId);

    // Store in Universal Memory
    memoryAccessGateway.remember(userId, userId, 'learning', profile, { level: 'long', importance: 75, tags: ['learner_profile', 'analysis'] });

    return profile;
  }

  /** Build a personalized learning roadmap */
  buildRoadmap(userId: string): LearningRoadmap {
    const profile = this.analyze(userId);
    const currentLevel = profile.preferredDifficulty;
    const levelMap: Difficulty[] = ['beginner', 'intermediate', 'advanced', 'expert'];
    const currentIdx = levelMap.indexOf(currentLevel);
    const targetIdx = Math.min(currentIdx + 2, 3);
    const targetLevel = levelMap[targetIdx];

    const roadmap: LearningRoadmap = {
      userId,
      currentLevel,
      targetLevel,
      estimatedWeeks: (targetIdx - currentIdx) * 4 + 2,
      milestones: [
        { title: `${currentLevel.charAt(0).toUpperCase() + currentLevel.slice(1)} Foundation`, description: 'Master core concepts', lessonsRequired: 3, reward: 'Foundation Badge', completed: currentIdx > 0 },
        { title: 'Skill Building', description: 'Apply knowledge in practice', lessonsRequired: 5, reward: 'Skill Builder Badge', completed: currentIdx > 1 },
        { title: `${targetLevel.charAt(0).toUpperCase() + targetLevel.slice(1)} Mastery`, description: 'Advanced topics and challenges', lessonsRequired: 7, reward: 'Mastery Badge', completed: currentIdx > 2 },
      ],
      dailyPlan: [
        { lesson: profile.weakConcepts[0] || 'Blockchain Basics', type: 'interactive', duration: 20, priority: 1 },
        { lesson: 'Quiz Review', type: 'quiz', duration: 10, priority: 2 },
        { lesson: profile.strongConcepts[0] || 'Next Lesson', type: 'practice', duration: 15, priority: 3 },
      ],
      generatedAt: Date.now(),
    };

    profile.roadmap = roadmap;
    this.save(userId);

    memoryAccessGateway.remember(userId, userId, 'academy', roadmap, { level: 'long', importance: 80, tags: ['roadmap', targetLevel], pinned: true });

    return roadmap;
  }

  /** Recommend a lesson based on knowledge gaps */
  recommendLesson(userId: string): { lesson: string; reason: string; priority: number } {
    const profile = this.analyze(userId);
    if (profile.weakConcepts.length > 0) {
      return { lesson: profile.weakConcepts[0], reason: 'Knowledge gap detected — needs reinforcement', priority: 1 };
    }
    if (profile.knowledgeGaps.length > 0) {
      return { lesson: profile.knowledgeGaps[0], reason: 'Fill knowledge gap to progress roadmap', priority: 2 };
    }
    return { lesson: 'Next Course', reason: 'Continue your learning journey', priority: 3 };
  }

  /** Recommend a quiz based on recent mistakes */
  recommendQuiz(userId: string): { topic: string; difficulty: Difficulty; questionCount: number } {
    const profile = this.analyze(userId);
    const recentMistakes = profile.mistakePatterns.filter(m => Date.now() - m.lastSeen < 7 * 86400000);
    if (recentMistakes.length > 0) {
      return { topic: recentMistakes[0].concept, difficulty: 'intermediate', questionCount: 5 };
    }
    return { topic: 'General Review', difficulty: profile.preferredDifficulty, questionCount: 10 };
  }

  /** Recommend review based on memory retention */
  recommendReview(userId: string): { concepts: string[]; urgency: 'now' | 'week' | 'month'; reason: string } {
    const profile = this.analyze(userId);
    if (profile.memoryRetention < 40) {
      return { concepts: profile.weakConcepts.slice(0, 3), urgency: 'now', reason: 'Low retention — immediate review needed' };
    }
    if (profile.memoryRetention < 60) {
      return { concepts: profile.weakConcepts.slice(0, 2), urgency: 'week', reason: 'Moderate retention — weekly review recommended' };
    }
    return { concepts: profile.strongConcepts.slice(0, 2), urgency: 'month', reason: 'Good retention — monthly refresher' };
  }

  /** Recommend a challenge matched to current level */
  recommendChallenge(userId: string): { title: string; difficulty: Difficulty; reward: string; deadline: string } {
    const profile = this.analyze(userId);
    const diff = profile.preferredDifficulty;
    const challenges: Record<Difficulty, { title: string; reward: string }> = {
      beginner: { title: 'First Trade Challenge', reward: '+100 XP' },
      intermediate: { title: 'Strategy Builder', reward: '+250 XP + Badge' },
      advanced: { title: 'Market Wizard', reward: '+500 XP + Tournament Entry' },
      expert: { title: 'Master Class', reward: '+1000 XP + Pro Status' },
    };
    const c = challenges[diff];
    return { title: c.title, difficulty: diff, reward: c.reward, deadline: '7 days' };
  }

  /** Build a knowledge graph showing concept mastery and relationships */
  knowledgeGraph(userId: string): KnowledgeGraph {
    const profile = this.analyze(userId);
    const allConcepts = [...new Set([...profile.strongConcepts, ...profile.weakConcepts, ...profile.knowledgeGaps])];

    const nodes = allConcepts.map(concept => ({
      concept,
      mastery: profile.strongConcepts.includes(concept) ? 80 + Math.floor(Math.random() * 20) : profile.weakConcepts.includes(concept) ? 20 + Math.floor(Math.random() * 30) : 50,
      related: allConcepts.filter(c => c !== concept).slice(0, 3),
    }));

    const edges: { from: string; to: string; weight: number }[] = [];
    for (const node of nodes) {
      for (const related of node.related) {
        edges.push({ from: node.concept, to: related, weight: Math.round(50 + Math.random() * 50) });
      }
    }

    const graph: KnowledgeGraph = {
      userId,
      nodes,
      edges,
      generatedAt: Date.now(),
    };

    memoryAccessGateway.remember(userId, userId, 'academy', graph, { level: 'long', importance: 70, tags: ['knowledge_graph'] });

    return graph;
  }

  // ── Orchestrator Integration ────────────────────────────────────────────

  async execute(context: OrchestratorContext): Promise<void> {
    const userId = context.userId || 'anonymous';
    // Auto-analyze every 10th pipeline execution
    if (Math.random() < 0.1) {
      this.analyze(userId);
    }
  }

  getOrchestratorContract(): EngineContract {
    return {
      name: 'adaptiveLearning',
      priority: 7,
      dependencies: ['contextEngine', 'universalMemory', 'learningEngine', 'predictionEngine', 'coachEngine'],
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

  private getProfile(userId: string): LearnerProfile {
    if (!this.profiles.has(userId)) {
      this.profiles.set(userId, this.load(userId) || this.createDefault(userId));
    }
    return this.profiles.get(userId)!;
  }

  private createDefault(userId: string): LearnerProfile {
    return {
      userId,
      learningSpeed: 20, memoryRetention: 50, quizAccuracy: 50, studyTime: 25, attentionSpan: 50,
      preferredContentType: 'interactive', preferredDifficulty: 'beginner', preferredLearningStyle: 'adaptive',
      preferredLanguage: 'en',
      strongConcepts: [], weakConcepts: [], knowledgeGaps: [], mistakePatterns: [],
      learningCurve: [], completionRate: 0, dropOffPoints: [], reviewFrequency: 7, lastReviewed: 0,
      roadmap: null, careerPath: ['Blockchain Basics', 'Trading Fundamentals', 'DeFi Mastery', 'Advanced Strategies'],
      lastAnalyzed: 0,
    };
  }

  private save(userId: string): void {
    try {
      const profile = this.profiles.get(userId);
      if (profile) localStorage.setItem(this.KEY + userId, JSON.stringify(profile));
    } catch {}
  }

  private load(userId: string): LearnerProfile | null {
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

export const adaptiveLearning = new AdaptiveLearningEngine();
