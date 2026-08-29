/**
 * journeyManager.ts — Lynx AI Journey Manager
 * Tracks the complete user journey. Remembers every last interaction.
 * When user returns: resume exactly where they stopped.
 * Generates: Welcome Back, Resume Suggestions, Interrupted Tasks, Recovery Coaching.
 */

import type { OrchestratorContext, EngineContract } from './lynxOrchestrator';
import { lynxEvents } from './eventSystem';

// Types
export interface JourneyStep { section: string; page: string; action: string; data: Record<string, any>; timestamp: number; }
export interface InterruptedTask { id: string; type: 'lesson' | 'trade' | 'quiz' | 'tournament' | 'wallet'; description: string; resumePath: string; progress: number; interruptedAt: number; }
export interface IncompleteMission { id: string; name: string; description: string; progress: number; totalSteps: number; completedSteps: number; nextAction: string; startedAt: number; }
export interface ResumeSuggestion { icon: string; title: string; description: string; path: string; priority: 'high' | 'medium' | 'low'; }
export interface WelcomeBackReport { greeting: string; timeAway: string; resumeSuggestions: ResumeSuggestion[]; interruptedTasks: InterruptedTask[]; incompleteMissions: IncompleteMission[]; recoveryCoaching: string | null; }
export interface UserJourney {
  userId: string; sessionCount: number; lastSeen: number; firstSeen: number;
  lastLesson: JourneyStep | null; lastTrade: JourneyStep | null; lastAcademyPage: JourneyStep | null;
  lastChart: JourneyStep | null; lastSearch: JourneyStep | null; lastWalletOp: JourneyStep | null; lastTournament: JourneyStep | null;
  lastPage: string; interruptedTasks: InterruptedTask[]; incompleteMissions: IncompleteMission[]; recentSteps: JourneyStep[];
}

class JourneyManager {
  private journeys: Map<string, UserJourney> = new Map();
  private registered = false;
  private readonly KEY = 'cv_lynx_journey_';

  constructor() { this.listen(); }

  getJourney(userId: string): UserJourney {
    if (!this.journeys.has(userId)) {
      this.journeys.set(userId, this.load(userId) || this.createDefault(userId));
    }
    return this.journeys.get(userId)!;
  }

  /** Record a step in the user journey */
  recordStep(userId: string, step: Omit<JourneyStep, 'timestamp'>): void {
    const j = this.getJourney(userId);
    const s: JourneyStep = { ...step, timestamp: Date.now() };
    if (step.section === 'academy') {
      if (step.action === 'lesson_view') j.lastLesson = s;
      j.lastAcademyPage = s;
    } else if (step.section === 'trading') {
      if (step.action === 'trade_open' || step.action === 'trade_close') j.lastTrade = s;
      if (step.action === 'chart_view') j.lastChart = s;
      if (step.action === 'coin_search') j.lastSearch = s;
    } else if (step.section === 'wallet') {
      j.lastWalletOp = s;
    } else if (step.section === 'tournament') {
      j.lastTournament = s;
    }
    if (step.page) j.lastPage = step.page;
    j.recentSteps.push(s);
    if (j.recentSteps.length > 100) j.recentSteps = j.recentSteps.slice(-100);
    this.persist(userId);
  }

  trackInterruptedTask(userId: string, task: Omit<InterruptedTask, 'interruptedAt'>): void {
    const j = this.getJourney(userId);
    j.interruptedTasks = j.interruptedTasks.filter(t => t.type !== task.type);
    j.interruptedTasks.push({ ...task, interruptedAt: Date.now() });
    if (j.interruptedTasks.length > 10) j.interruptedTasks = j.interruptedTasks.slice(-10);
    this.persist(userId);
  }

  trackMission(userId: string, mission: IncompleteMission): void {
    const j = this.getJourney(userId);
    const idx = j.incompleteMissions.findIndex(m => m.id === mission.id);
    if (idx >= 0) j.incompleteMissions[idx] = mission; else j.incompleteMissions.push(mission);
    this.persist(userId);
  }

  completeTask(userId: string, taskId: string): void {
    const j = this.getJourney(userId);
    j.interruptedTasks = j.interruptedTasks.filter(t => t.id !== taskId);
    j.incompleteMissions = j.incompleteMissions.filter(m => m.id !== taskId);
    this.persist(userId);
  }

  /** Generate Welcome Back report when user returns */
  generateWelcomeBack(userId: string, userName?: string): WelcomeBackReport {
    const j = this.getJourney(userId);
    const name = userName || 'Trader';
    const away = this.fmtAway(j.lastSeen);
    j.lastSeen = Date.now(); j.sessionCount++;
    this.persist(userId);

    const hour = new Date().getHours();
    const greeting = `${hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}, ${name}!`;

    const suggestions: ResumeSuggestion[] = [];
    if (j.lastLesson && j.lastLesson.timestamp > Date.now() - 7 * 86400000) {
      suggestions.push({ icon: '📚', title: 'Continue Learning', description: `Resume: ${j.lastLesson.data?.lessonName || 'Academy'}`, path: j.lastLesson.page || '/academy', priority: 'high' });
    }
    if (j.lastTrade && j.lastTrade.timestamp > Date.now() - 3 * 86400000) {
      suggestions.push({ icon: '📈', title: 'Continue Trading', description: `Resume trading ${j.lastTrade.data?.symbol || ''}`, path: '/trading', priority: 'high' });
    }
    if (j.lastChart) {
      suggestions.push({ icon: '📊', title: 'Check Markets', description: `Review ${j.lastChart.data?.symbol || 'markets'}`, path: '/trading', priority: 'medium' });
    }
    if (j.lastAcademyPage && !j.lastLesson) {
      suggestions.push({ icon: '🎓', title: 'Back to Academy', description: 'Pick up where you left off', path: j.lastAcademyPage.page || '/academy', priority: 'medium' });
    }

    let coaching: string | null = null;
    if (away.includes('day') && j.interruptedTasks.length > 0) {
      coaching = `You've been away for ${away}. You have ${j.interruptedTasks.length} interrupted task(s). Let me help you resume.`;
    } else if (j.sessionCount === 1) {
      coaching = 'Welcome aboard! Start with the Academy to learn the basics, then try the Trading Simulator.';
    }

    return { greeting, timeAway: away, resumeSuggestions: suggestions, interruptedTasks: j.interruptedTasks, incompleteMissions: j.incompleteMissions, recoveryCoaching: coaching };
  }

  getResumePath(userId: string): string | null {
    const j = this.getJourney(userId);
    if (j.interruptedTasks.length > 0) return j.interruptedTasks[0].resumePath;
    if (j.lastTrade && j.lastTrade.timestamp > Date.now() - 86400000) return '/trading';
    if (j.lastLesson && j.lastLesson.timestamp > Date.now() - 7 * 86400000) return j.lastLesson.page || '/academy';
    return j.lastPage || '/dashboard';
  }

  // Orchestrator
  async execute(context: OrchestratorContext): Promise<void> {
    const userId = context.userId || this.uid();
    this.getJourney(userId);
    if (context.event) {
      const section = this.section(context.event.type);
      this.recordStep(userId, { section, page: context.page || '/', action: context.event.type, data: context.event });
      if (context.event.type === 'PAGE_LEAVE' && section === 'academy') {
        const d = context.event as any;
        if (d.lessonId && d.progress < 100) {
          this.trackInterruptedTask(userId, { id: `lesson_${d.lessonId}`, type: 'lesson', description: d.lessonName || d.lessonId, resumePath: `/academy?lesson=${d.lessonId}`, progress: d.progress || 0 });
        }
      }
    }
  }

  getOrchestratorContract(): EngineContract {
    return {
      name: 'journeyManager', priority: 6, dependencies: ['contextEngine', 'memoryEngine'],
      initialize: async () => { this.registered = true; },
      execute: (ctx) => this.execute(ctx),
      shutdown: async () => { this.registered = false; },
      health: () => ({ status: this.registered ? 'healthy' : 'degraded', lastRun: null, lastDuration: 0, errorCount: 0, totalRuns: 0, avgDuration: 0 }),
    };
  }

  // Private
  private createDefault(userId: string): UserJourney {
    return { userId, sessionCount: 0, lastSeen: Date.now(), firstSeen: Date.now(), lastLesson: null, lastTrade: null, lastAcademyPage: null, lastChart: null, lastSearch: null, lastWalletOp: null, lastTournament: null, lastPage: '/dashboard', interruptedTasks: [], incompleteMissions: [], recentSteps: [] };
  }

  private section(type: string): string {
    if (type.includes('ACADEMY') || type.includes('LESSON') || type.includes('QUIZ')) return 'academy';
    if (type.includes('TRADE') || type.includes('CHART') || type.includes('COIN')) return 'trading';
    if (type.includes('WALLET')) return 'wallet';
    if (type.includes('TOURNAMENT') || type.includes('EVENT')) return 'tournament';
    return 'general';
  }

  private fmtAway(lastSeen: number): string {
    const d = Math.floor((Date.now() - lastSeen) / 86400000);
    const h = Math.floor((Date.now() - lastSeen) / 3600000);
    const m = Math.floor((Date.now() - lastSeen) / 60000);
    if (d > 0) return `${d} day${d > 1 ? 's' : ''}`;
    if (h > 0) return `${h} hour${h > 1 ? 's' : ''}`;
    if (m > 1) return `${m} minutes`;
    return 'just now';
  }

  private listen(): void {
    lynxEvents.subscribe((event) => {
      if (event.type === 'PAGE_VIEW' || event.type === 'PAGE_LEAVE') {
        const e = event as any;
        this.recordStep(this.uid(), { section: this.section(event.type), page: e.page || '/', action: event.type, data: e });
      }
    });
  }

  private uid(): string {
    try { return localStorage.getItem('cv_lynx_journey_user') || 'anonymous'; } catch { return 'anonymous'; }
  }

  private persist(userId: string): void {
    try { const j = this.journeys.get(userId); if (j) localStorage.setItem(this.KEY + userId, JSON.stringify(j)); } catch {}
  }

  private load(userId: string): UserJourney | null {
    try { const d = localStorage.getItem(this.KEY + userId); return d ? JSON.parse(d) : null; } catch { return null; }
  }
}

export const journeyManager = new JourneyManager();
