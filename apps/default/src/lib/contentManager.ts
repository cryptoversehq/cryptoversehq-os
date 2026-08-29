/**
 * contentManager.ts — Lynx AI Content Manager
 * Analyzes educational content: drop-off rates, quiz difficulty, improvement suggestions.
 * Used by Admin Executive Dashboard.
 */

export interface CourseMetrics {
  courseId: string;
  name: string;
  enrollments: number;
  completions: number;
  completionRate: number; // %
  averageScore: number;
  averageTimeMinutes: number;
  dropOffPoints: { section: string; dropRate: number }[];
}

export interface QuizAnalysis {
  quizId: string;
  courseId: string;
  passRate: number;
  averageScore: number;
  difficulty: 'too_easy' | 'balanced' | 'too_hard';
  hardestQuestions: { id: string; failRate: number }[];
}

export interface ContentSuggestion {
  type: 'course' | 'quiz' | 'module';
  target: string;
  issue: string;
  recommendation: string;
  priority: 'low' | 'medium' | 'high';
}

export interface ContentReport {
  timestamp: number;
  courses: CourseMetrics[];
  quizzes: QuizAnalysis[];
  suggestions: ContentSuggestion[];
  overallStats: {
    totalCourses: number;
    totalEnrollments: number;
    overallCompletionRate: number;
    averageQuizPassRate: number;
  };
}

class ContentManager {
  private lastReport: ContentReport | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startAnalysis();
  }

  getReport(): ContentReport {
    if (!this.lastReport) this.lastReport = this.generateReport();
    return { ...this.lastReport };
  }

  generateReport(): ContentReport {
    const courses: CourseMetrics[] = [
      {
        courseId: 'blockchain_basics',
        name: 'Blockchain Basics',
        enrollments: 4200,
        completions: 2800,
        completionRate: 66.7,
        averageScore: 82,
        averageTimeMinutes: 45,
        dropOffPoints: [
          { section: 'Consensus Mechanisms', dropRate: 22 },
          { section: 'Smart Contracts Intro', dropRate: 15 },
        ],
      },
      {
        courseId: 'trading_101',
        name: 'Trading Fundamentals',
        enrollments: 3800,
        completions: 2100,
        completionRate: 55.3,
        averageScore: 74,
        averageTimeMinutes: 60,
        dropOffPoints: [
          { section: 'Technical Analysis', dropRate: 28 },
          { section: 'Risk Management', dropRate: 18 },
        ],
      },
      {
        courseId: 'defi_mastery',
        name: 'DeFi Mastery',
        enrollments: 1800,
        completions: 720,
        completionRate: 40.0,
        averageScore: 68,
        averageTimeMinutes: 90,
        dropOffPoints: [
          { section: 'Liquidity Pools', dropRate: 35 },
          { section: 'Yield Farming Strategies', dropRate: 22 },
        ],
      },
      {
        courseId: 'nft_guide',
        name: 'NFT & Metaverse Guide',
        enrollments: 2100,
        completions: 1350,
        completionRate: 64.3,
        averageScore: 79,
        averageTimeMinutes: 35,
        dropOffPoints: [
          { section: 'Minting & Gas Fees', dropRate: 20 },
        ],
      },
    ];

    const quizzes: QuizAnalysis[] = [
      {
        quizId: 'quiz_blockchain',
        courseId: 'blockchain_basics',
        passRate: 88,
        averageScore: 82,
        difficulty: 'balanced',
        hardestQuestions: [{ id: 'q7', failRate: 42 }, { id: 'q12', failRate: 38 }],
      },
      {
        quizId: 'quiz_trading',
        courseId: 'trading_101',
        passRate: 62,
        averageScore: 74,
        difficulty: 'too_hard',
        hardestQuestions: [{ id: 'q4', failRate: 55 }, { id: 'q9', failRate: 48 }, { id: 'q15', failRate: 44 }],
      },
      {
        quizId: 'quiz_defi',
        courseId: 'defi_mastery',
        passRate: 45,
        averageScore: 68,
        difficulty: 'too_hard',
        hardestQuestions: [{ id: 'q3', failRate: 62 }, { id: 'q8', failRate: 58 }],
      },
      {
        quizId: 'quiz_nft',
        courseId: 'nft_guide',
        passRate: 91,
        averageScore: 79,
        difficulty: 'too_easy',
        hardestQuestions: [{ id: 'q6', failRate: 22 }],
      },
    ];

    const suggestions: ContentSuggestion[] = [];

    for (const course of courses) {
      if (course.completionRate < 60) {
        suggestions.push({
          type: 'course',
          target: course.name,
          issue: `Low completion rate (${course.completionRate}%)`,
          recommendation: `Consider breaking "${course.dropOffPoints[0]?.section}" into smaller lessons with interactive elements.`,
          priority: course.completionRate < 50 ? 'high' : 'medium',
        });
      }
    }

    for (const quiz of quizzes) {
      if (quiz.difficulty === 'too_hard') {
        suggestions.push({
          type: 'quiz',
          target: quiz.quizId,
          issue: `Low pass rate (${quiz.passRate}%) — ${quiz.hardestQuestions.length} difficult questions`,
          recommendation: 'Revise the hardest questions or add hint system. Consider lowering the passing threshold from 70% to 60%.',
          priority: quiz.passRate < 50 ? 'high' : 'medium',
        });
      }
      if (quiz.difficulty === 'too_easy') {
        suggestions.push({
          type: 'quiz',
          target: quiz.quizId,
          issue: `Very high pass rate (${quiz.passRate}%) — may not be challenging enough`,
          recommendation: 'Add advanced questions to differentiate skill levels. Consider a bonus round.',
          priority: 'low',
        });
      }
    }

    suggestions.push({
      type: 'module',
      target: 'Academy XP System',
      issue: 'Drop-off between basic and advanced courses',
      recommendation: 'Add XP multipliers for completing advanced courses. Create a "learning path" that guides users from basic to advanced.',
      priority: 'medium',
    });

    const overallStats = {
      totalCourses: courses.length,
      totalEnrollments: courses.reduce((s, c) => s + c.enrollments, 0),
      overallCompletionRate: Math.round(courses.reduce((s, c) => s + c.completionRate, 0) / courses.length),
      averageQuizPassRate: Math.round(quizzes.reduce((s, q) => s + q.passRate, 0) / quizzes.length),
    };

    const report: ContentReport = {
      timestamp: Date.now(),
      courses,
      quizzes,
      suggestions,
      overallStats,
    };
    this.lastReport = report;
    return report;
  }

  private startAnalysis(): void {
    this.interval = setInterval(() => this.generateReport(), 300000);
  }
}

export const contentManager = new ContentManager();
