/**
 * mentorEngine.ts - Lynx AI Mentor System (Sprint 5.5)
 * Transforms Lynx from assistant into a real AI Mentor.
 * Daily/weekly/monthly coaching, 6 mentor scores, challenges.
 */

import type { OrchestratorContext, EngineContract } from './lynxOrchestrator';
import { memoryAccessGateway } from './memoryAccessGateway';
import { learningEngine } from './learningEngine';
import { realDataConnector } from './realDataConnector';

export type MentorSessionType = 'daily' | 'weekly' | 'monthly';
export interface MentorScore { success: number; discipline: number; consistency: number; growth: number; risk: number; learning: number; }
export interface MentorNote { id: string; type: MentorSessionType; content: string; importance: string; createdAt: number; relatedGoals: string[]; actionItems: string[]; }
export interface MentorChallenge { id: string; title: string; description: string; difficulty: string; category: string; reward: string; deadline: number; completed: boolean; createdAt: number; }
export interface MentorSession { id: string; type: MentorSessionType; userId: string; timestamp: number; summary: string; insights: string[]; recommendations: string[]; challenges: MentorChallenge[]; notes: MentorNote[]; scores: MentorScore; nextSessionAt: number | null; }
export interface MentorReport { userId: string; period: string; timestamp: number; scores: MentorScore; highlights: string[]; improvements: string[]; nextSteps: string[]; coachFeedback: string; }

class MentorEngine {
  private registered = false;
  private sessions: Map<string, MentorSession[]> = new Map();
  private notes: Map<string, MentorNote[]> = new Map();
  private readonly SKEY = 'cv_mentor_sessions_';
  private readonly NKEY = 'cv_mentor_notes_';

  constructor() { this.loadAll(); }

  mentorSession(userId: string, type: MentorSessionType): MentorSession {
    const appData = realDataConnector.getAppData();
    const lp = learningEngine.getProfile(userId);
    const scores = this.calcScores(appData, lp);
    const insights = this.genInsights(scores, appData);
    const recs = this.genRecs(scores, appData);
    const challenges = this.genChallenges(scores);
    const session: MentorSession = {
      id: 'ses_' + Date.now() + '_' + type,
      type, userId, timestamp: Date.now(),
      summary: this.genSummary(type, scores),
      insights, recommendations: recs, challenges,
      notes: this.getNotes(userId).slice(-5), scores,
      nextSessionAt: type === 'daily' ? Date.now() + 86400000 : type === 'weekly' ? Date.now() + 604800000 : Date.now() + 2592000000,
    };
    if (!this.sessions.has(userId)) this.sessions.set(userId, []);
    this.sessions.get(userId)!.push(session);
    if (this.sessions.get(userId)!.length > 100) this.sessions.get(userId)!.shift();
    this.save(userId);
    memoryAccessGateway.remember(userId, userId, 'coaching', { type, scores, summary: session.summary }, { level: 'long', importance: 75, tags: ['mentor', type] });
    return session;
  }

  dailyReview(userId: string): MentorSession { return this.mentorSession(userId, 'daily'); }
  weeklyReview(userId: string): MentorSession { return this.mentorSession(userId, 'weekly'); }
  monthlyReview(userId: string): MentorSession { return this.mentorSession(userId, 'monthly'); }

  mentorReport(userId: string, period: 'daily' | 'weekly' | 'monthly'): MentorReport {
    const appData = realDataConnector.getAppData();
    const lp = learningEngine.getProfile(userId);
    const scores = this.calcScores(appData, lp);
    const h: string[] = []; const im: string[] = []; const ns: string[] = [];
    if (scores.success > 70) h.push('Strong achievement!'); else im.push('Focus on completing goals.');
    if (scores.discipline > 70) h.push('Excellent discipline.'); else im.push('Build daily habits.');
    if (scores.learning > 60) h.push('Learning is strong.'); else { im.push('More academy time needed.'); ns.push('Complete one lesson today.'); }
    if (appData.trading.openPositions > 5) { im.push('High positions - consider consolidation.'); ns.push('Review risk.'); }
    ns.push('Check active goals and missions.');
    const report: MentorReport = {
      userId, period, timestamp: Date.now(), scores,
      highlights: h.length > 0 ? h : ['Steady progress.'],
      improvements: im.length > 0 ? im : ['No major issues.'],
      nextSteps: ns,
      coachFeedback: this.genFeedback(scores),
    };
    memoryAccessGateway.remember(userId, userId, 'coaching', report, { level: 'long', importance: 80, tags: ['mentor_report', period] });
    return report;
  }

  mentorSuggestions(userId: string): string[] {
    const appData = realDataConnector.getAppData();
    const lp = learningEngine.getProfile(userId);
    const s: string[] = [];
    if (appData.academy.completedLessons === 0) s.push('Start your first academy lesson.');
    if (appData.trading.totalTrades === 0) s.push('Try a practice trade in the simulator.');
    if (appData.trading.openPositions > 5) s.push('Review your risk exposure.');
    if (lp.learningScore < 30) s.push('Your learning score is low. Let me recommend a lesson.');
    if (s.length === 0) s.push('You are on track. Keep up the great work!');
    return s;
  }

  mentorChallenges(userId: string): MentorChallenge[] {
    const appData = realDataConnector.getAppData();
    const lp = learningEngine.getProfile(userId);
    return this.genChallenges(this.calcScores(appData, lp));
  }

  getNotes(userId: string): MentorNote[] { return this.notes.get(userId) || []; }

  addNote(userId: string, note: Omit<MentorNote, 'id' | 'createdAt'>): MentorNote {
    const n: MentorNote = { ...note, id: 'n_' + Date.now(), createdAt: Date.now() };
    if (!this.notes.has(userId)) this.notes.set(userId, []);
    this.notes.get(userId)!.push(n);
    if (this.notes.get(userId)!.length > 200) this.notes.get(userId)!.shift();
    this.saveNotes(userId);
    return n;
  }

  async execute(context: OrchestratorContext): Promise<void> {
    const userId = context.userId || 'anonymous';
    const h = new Date().getHours();
    if (h === 9) {
      const today = new Date().toDateString();
      if (localStorage.getItem('cv_mentor_d_' + userId) !== today) {
        this.dailyReview(userId);
        localStorage.setItem('cv_mentor_d_' + userId, today);
      }
    }
  }

  getOrchestratorContract(): EngineContract {
    return {
      name: 'mentorEngine', priority: 6,
      dependencies: ['contextEngine', 'universalMemory', 'learningEngine', 'emotionalEngine', 'goalEngine', 'coachEngine'],
      initialize: async () => { this.registered = true; },
      execute: (ctx) => this.execute(ctx),
      shutdown: async () => { this.registered = false; },
      health: () => ({ status: this.registered ? 'healthy' : 'degraded', lastRun: null, lastDuration: 0, errorCount: 0, totalRuns: 0, avgDuration: 0 }),
    };
  }

  private calcScores(appData: any, lp: any): MentorScore {
    const t = appData.trading.totalTrades || 0;
    const wr = appData.trading.avgWinRate || 0;
    const l = appData.academy.completedLessons || 0;
    const tl = appData.academy.totalLessons || 20;
    const p = appData.trading.openPositions || 0;
    return {
      success: Math.round(wr * 0.5 + (l / Math.max(1, tl)) * 30 + Math.min(t, 50) / 50 * 20),
      discipline: Math.round((lp.confidenceScore || 50) * 0.4 + (p <= 5 ? 60 : 20) * 0.3 + (lp.learningScore || 0) * 0.3),
      consistency: Math.round(Math.min(t, 20) / 20 * 50 + Math.min(l, 10) / 10 * 50),
      growth: Math.round((lp.learningScore || 0) * 0.6 + wr * 0.4),
      risk: Math.round(100 - ((p > 10 ? 80 : p > 5 ? 50 : p > 0 ? 20 : 0) * 0.5 + ((lp.riskHabits?.find((h: any) => h.label === 'Avg Leverage')?.value || 1) > 10 ? 50 : 0) * 0.5)),
      learning: Math.round(l / Math.max(1, tl) * 100),
    };
  }

  private genInsights(scores: MentorScore, appData: any): string[] {
    const i: string[] = [];
    if (scores.success > 70) i.push('Success score is strong.');
    if (scores.discipline < 40) i.push('Discipline needs improvement.');
    if (scores.consistency > 70) i.push('Excellent consistency!');
    if (scores.growth > 60) i.push('Growth trending upward.');
    if (scores.risk < 40) i.push('Risk management needs attention.');
    if (appData.trading.totalTrades === 0) i.push('You have not started trading yet.');
    if (i.length === 0) i.push('Balanced trajectory. Keep it up!');
    return i.slice(0, 5);
  }

  private genRecs(scores: MentorScore, appData: any): string[] {
    const r: string[] = [];
    if (scores.discipline < 40) r.push('Set a daily 15-minute engagement reminder.');
    if (scores.risk < 40) r.push('Use stop-losses on all positions.');
    if (scores.learning < 40) r.push('Dedicate 20 minutes to an academy lesson.');
    r.push('Review your active goals and missions.');
    return r.slice(0, 4);
  }

  private genChallenges(scores: MentorScore): MentorChallenge[] {
    const c: MentorChallenge[] = [];
    const now = Date.now();
    if (scores.learning < 50) c.push({ id: 'ch_l_' + now, title: 'Learning Sprint', description: 'Complete 3 academy lessons this week', difficulty: 'easy', category: 'learning', reward: '+100 XP', deadline: now + 604800000, completed: false, createdAt: now });
    if (scores.discipline < 50) c.push({ id: 'ch_d_' + now, title: 'Discipline Builder', description: 'Log in daily for 5 days', difficulty: 'medium', category: 'discipline', reward: '+150 XP', deadline: now + 432000000, completed: false, createdAt: now });
    if (scores.risk < 50) c.push({ id: 'ch_r_' + now, title: 'Risk Guardian', description: 'Set stop-loss on all positions, keep leverage under 5x', difficulty: 'medium', category: 'risk', reward: '+200 XP', deadline: now + 604800000, completed: false, createdAt: now });
    if (scores.success > 60) c.push({ id: 'ch_s_' + now, title: 'Achievement Hunter', description: 'Complete 3 missions this week', difficulty: 'hard', category: 'achievement', reward: '+300 XP', deadline: now + 604800000, completed: false, createdAt: now });
    return c.slice(0, 3);
  }

  private genSummary(type: MentorSessionType, scores: MentorScore): string {
    const g = scores.success > 70 ? 'A' : scores.success > 50 ? 'B' : scores.success > 30 ? 'C' : 'D';
    return type.charAt(0).toUpperCase() + type.slice(1) + ' Mentor - Grade: ' + g + '. Success: ' + scores.success + ', Learning: ' + scores.learning + ', Risk: ' + scores.risk + '.';
  }

  private genFeedback(scores: MentorScore): string {
    const p: string[] = ['Mentor Feedback:'];
    if (scores.success > 70) p.push('You are excelling!');
    else if (scores.success > 40) p.push('Steady progress. Small improvements compound.');
    else p.push('You have untapped potential.');
    if (scores.risk < 40) p.push('Risk management is your biggest opportunity.');
    if (scores.learning < 40) p.push('Knowledge is power - invest in learning.');
    return p.join(' ');
  }

  private save(userId: string): void { try { const s = this.sessions.get(userId); if (s) localStorage.setItem(this.SKEY + userId, JSON.stringify(s.slice(-50))); } catch {} }
  private saveNotes(userId: string): void { try { const n = this.notes.get(userId); if (n) localStorage.setItem(this.NKEY + userId, JSON.stringify(n.slice(-100))); } catch {} }
  private loadAll(): void {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(this.SKEY)) { const uid = key.replace(this.SKEY, ''); const d = localStorage.getItem(key); if (d) this.sessions.set(uid, JSON.parse(d)); }
        if (key?.startsWith(this.NKEY)) { const uid = key.replace(this.NKEY, ''); const d = localStorage.getItem(key); if (d) this.notes.set(uid, JSON.parse(d)); }
      }
    } catch {}
  }
}

export const mentorEngine = new MentorEngine();
