/**
 * personalityEngine.ts - Lynx AI Personality Engine (Sprint 5.2 Complete)
 * 20 modes, 25 params. Per-user, per-device, per-language. Auto-adapts.
 * Integrates with Universal Memory, Learning Engine, Orchestrator.
 */

import type { OrchestratorContext, EngineContract } from './lynxOrchestrator';
import { memoryAccessGateway } from './memoryAccessGateway';
import { learningEngine } from './learningEngine';

export type PersonalityMode = 'coach' | 'teacher' | 'analyst' | 'friendly' | 'strict_mentor' | 'calm_advisor' | 'motivational' | 'business_consultant' | 'executive_advisor' | 'tournament_commentator' | 'academy_tutor' | 'support_assistant' | 'psychologist' | 'productivity_coach' | 'career_mentor' | 'investor_mentor' | 'risk_manager' | 'news_reporter' | 'crypto_journalist' | 'community_moderator';

export interface PersonalityParameters {
  friendliness: number; professionalism: number; humor: number; empathy: number; patience: number;
  strictness: number; confidence: number; curiosity: number; motivation: number; optimism: number;
  formality: number; emojiUsage: number; speakingSpeed: number; explanationDepth: number;
  creativity: number; analyticalThinking: number;
  teachingStyle: string; conversationStyle: string; leadershipStyle: string; decisionStyle: string;
  riskTolerance: number; energyLevel: number; responseLength: number; vocabularyComplexity: number; technicalDepth: number;
}

export interface PersonalityMemory {
  favoriteTone: string; favoriteTeachingStyle: string; favoriteCoachStyle: string;
  favoriteAnalystStyle: string; favoriteHumorLevel: number; favoriteResponseLength: number;
  favoriteExplanationDepth: number; favoriteEmojiUsage: number; favoriteConversationSpeed: number;
  favoriteLanguageStyle: string; favoriteMotivationStyle: string; favoritePersonalityProfile: PersonalityMode;
}

export interface PersonalityProfile {
  userId: string; mode: PersonalityMode; params: PersonalityParameters; memory: PersonalityMemory;
  language?: string; device?: string; workspace?: string; sessionId?: string;
  adaptCount: number; lastAdapted: number; confidence: number;
  history: { mode: PersonalityMode; timestamp: number; reason: string }[];
  blendedFrom?: PersonalityMode[]; createdAt: number; updatedAt: number;
}

export interface PersonalityReport {
  userId: string; timestamp: number; currentMode: PersonalityMode; params: PersonalityParameters;
  evolution: { date: string; mode: PersonalityMode }[];
  statistics: { mostUsedMode: PersonalityMode; averageConfidence: number; totalAdaptations: number; preferredTeachingStyle: string; preferredConversationStyle: string };
  recommendation: PersonalityMode; recommendationReason: string;
}

// 20 personality templates
const T: Record<PersonalityMode, PersonalityParameters> = {} as any;

T.coach = { friendliness:60, professionalism:40, humor:40, empathy:55, patience:65, strictness:35, confidence:75, curiosity:50, motivation:85, optimism:70, formality:30, emojiUsage:60, speakingSpeed:50, explanationDepth:60, creativity:45, analyticalThinking:55, teachingStyle:'practice', conversationStyle:'brief', leadershipStyle:'coaching', decisionStyle:'decisive', riskTolerance:50, energyLevel:80, responseLength:40, vocabularyComplexity:40, technicalDepth:50 };
T.teacher = { friendliness:50, professionalism:70, humor:20, empathy:60, patience:80, strictness:40, confidence:70, curiosity:75, motivation:70, optimism:60, formality:60, emojiUsage:30, speakingSpeed:35, explanationDepth:95, creativity:50, analyticalThinking:70, teachingStyle:'socratic', conversationStyle:'detailed', leadershipStyle:'directive', decisionStyle:'analytical', riskTolerance:30, energyLevel:60, responseLength:80, vocabularyComplexity:65, technicalDepth:80 };
T.analyst = { friendliness:30, professionalism:90, humor:10, empathy:25, patience:50, strictness:60, confidence:80, curiosity:60, motivation:55, optimism:40, formality:85, emojiUsage:5, speakingSpeed:55, explanationDepth:85, creativity:30, analyticalThinking:95, teachingStyle:'direct', conversationStyle:'data_driven', leadershipStyle:'directive', decisionStyle:'analytical', riskTolerance:40, energyLevel:50, responseLength:60, vocabularyComplexity:85, technicalDepth:90 };
T.friendly = { friendliness:95, professionalism:15, humor:80, empathy:85, patience:75, strictness:5, confidence:65, curiosity:55, motivation:70, optimism:85, formality:10, emojiUsage:90, speakingSpeed:70, explanationDepth:35, creativity:70, analyticalThinking:20, teachingStyle:'adaptive', conversationStyle:'storytelling', leadershipStyle:'supportive', decisionStyle:'collaborative', riskTolerance:50, energyLevel:75, responseLength:35, vocabularyComplexity:25, technicalDepth:20 };
T.strict_mentor = { friendliness:15, professionalism:95, humor:5, empathy:20, patience:30, strictness:90, confidence:75, curiosity:25, motivation:60, optimism:35, formality:90, emojiUsage:3, speakingSpeed:40, explanationDepth:70, creativity:10, analyticalThinking:75, teachingStyle:'direct', conversationStyle:'brief', leadershipStyle:'directive', decisionStyle:'decisive', riskTolerance:20, energyLevel:55, responseLength:35, vocabularyComplexity:70, technicalDepth:70 };
T.calm_advisor = { friendliness:70, professionalism:55, humor:25, empathy:75, patience:90, strictness:20, confidence:65, curiosity:45, motivation:55, optimism:65, formality:45, emojiUsage:30, speakingSpeed:25, explanationDepth:65, creativity:35, analyticalThinking:50, teachingStyle:'socratic', conversationStyle:'detailed', leadershipStyle:'supportive', decisionStyle:'collaborative', riskTolerance:55, energyLevel:35, responseLength:55, vocabularyComplexity:50, technicalDepth:50 };
T.motivational = { friendliness:80, professionalism:30, humor:55, empathy:65, patience:60, strictness:15, confidence:85, curiosity:50, motivation:100, optimism:90, formality:25, emojiUsage:80, speakingSpeed:70, explanationDepth:45, creativity:65, analyticalThinking:30, teachingStyle:'practice', conversationStyle:'storytelling', leadershipStyle:'coaching', decisionStyle:'intuitive', riskTolerance:65, energyLevel:95, responseLength:45, vocabularyComplexity:35, technicalDepth:30 };
T.business_consultant = { friendliness:40, professionalism:85, humor:15, empathy:35, patience:55, strictness:50, confidence:80, curiosity:55, motivation:65, optimism:55, formality:80, emojiUsage:10, speakingSpeed:55, explanationDepth:80, creativity:40, analyticalThinking:85, teachingStyle:'direct', conversationStyle:'data_driven', leadershipStyle:'delegative', decisionStyle:'analytical', riskTolerance:45, energyLevel:60, responseLength:65, vocabularyComplexity:80, technicalDepth:75 };
T.executive_advisor = { friendliness:35, professionalism:95, humor:10, empathy:30, patience:50, strictness:65, confidence:90, curiosity:40, motivation:60, optimism:50, formality:95, emojiUsage:5, speakingSpeed:50, explanationDepth:75, creativity:25, analyticalThinking:90, teachingStyle:'direct', conversationStyle:'brief', leadershipStyle:'directive', decisionStyle:'analytical', riskTolerance:35, energyLevel:55, responseLength:40, vocabularyComplexity:85, technicalDepth:80 };
T.tournament_commentator = { friendliness:75, professionalism:25, humor:70, empathy:45, patience:40, strictness:10, confidence:80, curiosity:40, motivation:75, optimism:80, formality:15, emojiUsage:90, speakingSpeed:90, explanationDepth:25, creativity:85, analyticalThinking:20, teachingStyle:'adaptive', conversationStyle:'storytelling', leadershipStyle:'coaching', decisionStyle:'intuitive', riskTolerance:60, energyLevel:95, responseLength:30, vocabularyComplexity:30, technicalDepth:20 };
T.academy_tutor = { friendliness:60, professionalism:65, humor:30, empathy:65, patience:85, strictness:35, confidence:70, curiosity:80, motivation:75, optimism:65, formality:50, emojiUsage:45, speakingSpeed:35, explanationDepth:95, creativity:45, analyticalThinking:60, teachingStyle:'visual', conversationStyle:'detailed', leadershipStyle:'coaching', decisionStyle:'analytical', riskTolerance:25, energyLevel:60, responseLength:75, vocabularyComplexity:65, technicalDepth:75 };
T.support_assistant = { friendliness:85, professionalism:30, humor:50, empathy:90, patience:90, strictness:5, confidence:60, curiosity:45, motivation:65, optimism:70, formality:20, emojiUsage:60, speakingSpeed:60, explanationDepth:45, creativity:40, analyticalThinking:25, teachingStyle:'adaptive', conversationStyle:'brief', leadershipStyle:'supportive', decisionStyle:'collaborative', riskTolerance:50, energyLevel:60, responseLength:40, vocabularyComplexity:30, technicalDepth:25 };
T.psychologist = { friendliness:75, professionalism:60, humor:15, empathy:100, patience:95, strictness:10, confidence:55, curiosity:65, motivation:60, optimism:60, formality:40, emojiUsage:25, speakingSpeed:20, explanationDepth:80, creativity:40, analyticalThinking:55, teachingStyle:'socratic', conversationStyle:'detailed', leadershipStyle:'supportive', decisionStyle:'collaborative', riskTolerance:45, energyLevel:30, responseLength:70, vocabularyComplexity:55, technicalDepth:40 };
T.productivity_coach = { friendliness:55, professionalism:60, humor:35, empathy:50, patience:55, strictness:55, confidence:75, curiosity:45, motivation:85, optimism:70, formality:35, emojiUsage:45, speakingSpeed:55, explanationDepth:55, creativity:55, analyticalThinking:60, teachingStyle:'practice', conversationStyle:'brief', leadershipStyle:'coaching', decisionStyle:'decisive', riskTolerance:50, energyLevel:80, responseLength:45, vocabularyComplexity:45, technicalDepth:45 };
T.career_mentor = { friendliness:60, professionalism:70, humor:25, empathy:60, patience:70, strictness:35, confidence:75, curiosity:55, motivation:75, optimism:70, formality:55, emojiUsage:35, speakingSpeed:45, explanationDepth:70, creativity:40, analyticalThinking:60, teachingStyle:'socratic', conversationStyle:'detailed', leadershipStyle:'coaching', decisionStyle:'analytical', riskTolerance:40, energyLevel:65, responseLength:60, vocabularyComplexity:60, technicalDepth:55 };
T.investor_mentor = { friendliness:40, professionalism:80, humor:15, empathy:35, patience:60, strictness:50, confidence:80, curiosity:50, motivation:65, optimism:55, formality:75, emojiUsage:10, speakingSpeed:45, explanationDepth:80, creativity:25, analyticalThinking:90, teachingStyle:'direct', conversationStyle:'data_driven', leadershipStyle:'directive', decisionStyle:'analytical', riskTolerance:35, energyLevel:50, responseLength:55, vocabularyComplexity:80, technicalDepth:85 };
T.risk_manager = { friendliness:25, professionalism:90, humor:5, empathy:20, patience:55, strictness:80, confidence:70, curiosity:35, motivation:50, optimism:35, formality:90, emojiUsage:3, speakingSpeed:45, explanationDepth:75, creativity:15, analyticalThinking:95, teachingStyle:'direct', conversationStyle:'brief', leadershipStyle:'directive', decisionStyle:'analytical', riskTolerance:10, energyLevel:45, responseLength:40, vocabularyComplexity:85, technicalDepth:85 };
T.news_reporter = { friendliness:50, professionalism:55, humor:30, empathy:35, patience:45, strictness:25, confidence:70, curiosity:85, motivation:60, optimism:55, formality:40, emojiUsage:40, speakingSpeed:75, explanationDepth:40, creativity:60, analyticalThinking:45, teachingStyle:'adaptive', conversationStyle:'storytelling', leadershipStyle:'delegative', decisionStyle:'intuitive', riskTolerance:50, energyLevel:75, responseLength:40, vocabularyComplexity:45, technicalDepth:35 };
T.crypto_journalist = { friendliness:55, professionalism:55, humor:35, empathy:40, patience:50, strictness:20, confidence:70, curiosity:85, motivation:65, optimism:60, formality:35, emojiUsage:50, speakingSpeed:70, explanationDepth:55, creativity:70, analyticalThinking:55, teachingStyle:'adaptive', conversationStyle:'storytelling', leadershipStyle:'delegative', decisionStyle:'intuitive', riskTolerance:55, energyLevel:75, responseLength:50, vocabularyComplexity:55, technicalDepth:50 };
T.community_moderator = { friendliness:80, professionalism:40, humor:50, empathy:75, patience:80, strictness:40, confidence:65, curiosity:45, motivation:60, optimism:70, formality:25, emojiUsage:65, speakingSpeed:60, explanationDepth:45, creativity:45, analyticalThinking:35, teachingStyle:'adaptive', conversationStyle:'brief', leadershipStyle:'supportive', decisionStyle:'collaborative', riskTolerance:50, energyLevel:65, responseLength:35, vocabularyComplexity:35, technicalDepth:25 };

class PersonalityEngine {
  private profiles: Map<string, PersonalityProfile[]> = new Map();
  private registered = false;
  private readonly KEY = 'cv_persona2_';

  constructor() { this.loadAll(); }

  // ── Core APIs ──────────────────────────────────────────────────────────

  setPersonality(uid: string, mode: PersonalityMode, opts?: { language?: string; device?: string; workspace?: string; sessionId?: string }): PersonalityProfile {
    const profiles = this.getProfiles(uid);
    const ex = this.findProfile(uid, opts?.language, opts?.device, opts?.workspace, opts?.sessionId);
    if (ex) {
      ex.mode = mode; ex.params = { ...T[mode] }; ex.updatedAt = Date.now(); ex.adaptCount++;
      ex.history.push({ mode, timestamp: Date.now(), reason: 'manual' }); this.save(uid); return ex;
    }
    const p: PersonalityProfile = {
      userId: uid, mode, params: { ...T[mode] }, memory: this.defMem(mode),
      language: opts?.language, device: opts?.device, workspace: opts?.workspace, sessionId: opts?.sessionId,
      adaptCount: 0, lastAdapted: 0, confidence: 90,
      history: [{ mode, timestamp: Date.now(), reason: 'init' }], createdAt: Date.now(), updatedAt: Date.now(),
    };
    profiles.push(p); this.save(uid);
    memoryAccessGateway.remember(uid, uid, 'preferences', { personality: mode }, { level: 'permanent', importance: 90, tags: ['personality', mode] });
    return p;
  }

  getPersonality(uid: string, opts?: { language?: string; device?: string; workspace?: string; sessionId?: string }): PersonalityProfile {
    return this.findProfile(uid, opts?.language, opts?.device, opts?.workspace, opts?.sessionId) || this.setPersonality(uid, 'friendly');
  }

  adapt(uid: string): PersonalityProfile {
    const p = this.getPersonality(uid);
    const lp = learningEngine.getProfile(uid);
    let m: PersonalityMode = p.mode;
    if (lp.favoriteCoins.length > 5 && lp.successfulPatterns.length > 3) m = 'analyst';
    else if (lp.favoriteCoins.length > 2) m = 'coach';
    const bc = lp.emotionalBiases.filter((b: any) => b.score > 50).length;
    if (bc >= 3) m = 'psychologist'; else if (bc >= 2) m = 'calm_advisor';
    if (lp.learningScore > 60 && lp.favoriteCoins.length <= 2) m = 'academy_tutor';
    if (lp.confidenceScore > 70) m = 'motivational';
    const av = lp.riskHabits?.find((h: any) => h.label === 'Avg Leverage')?.value || 1;
    if (av > 10) m = 'risk_manager';
    const ms = lp.commonMistakes.reduce((s: number, t: any) => s + t.occurrences, 0);
    if (ms > 8) m = 'strict_mentor';
    p.mode = m; p.params = { ...T[m] }; p.adaptCount++; p.lastAdapted = Date.now();
    p.confidence = Math.min(100, 40 + Math.min(8, lp.successfulPatterns.length) * 7);
    p.history.push({ mode: m, timestamp: Date.now(), reason: 'auto' }); p.updatedAt = Date.now();
    this.save(uid);
    memoryAccessGateway.remember(uid, uid, 'behavior', { adaptedTo: m }, { level: 'medium', importance: 65, tags: ['adaptation', m] });
    return p;
  }

  blend(uid: string, modes: PersonalityMode[], weights?: number[]): PersonalityProfile {
    if (modes.length === 0) return this.getPersonality(uid);
    if (modes.length === 1) return this.setPersonality(uid, modes[0]);
    const ws = weights || modes.map(() => 1); const tw = ws.reduce((a, b) => a + b, 0);
    const nw = ws.map(w => w / tw);
    const bp: PersonalityParameters = { ...T[modes[0]] };
    const keys = Object.keys(bp) as (keyof PersonalityParameters)[];
    for (const key of keys) {
      if (typeof bp[key] === 'number') {
        let wv = 0;
        for (let i = 0; i < modes.length; i++) wv += (T[modes[i]][key] as number) * nw[i];
        (bp as any)[key] = Math.round(wv);
      }
    }
    const dom = modes[nw.indexOf(Math.max(...nw))];
    bp.teachingStyle = T[dom].teachingStyle; bp.conversationStyle = T[dom].conversationStyle;
    bp.leadershipStyle = T[dom].leadershipStyle; bp.decisionStyle = T[dom].decisionStyle;
    const p: PersonalityProfile = {
      userId: uid, mode: ('blend' as PersonalityMode), params: bp, memory: this.defMem(dom),
      adaptCount: 0, lastAdapted: Date.now(), confidence: 70,
      history: [{ mode: modes[0], timestamp: Date.now(), reason: 'blend' }],
      blendedFrom: modes, createdAt: Date.now(), updatedAt: Date.now(),
    };
    this.getProfiles(uid).push(p); this.save(uid);
    return p;
  }

  learn(uid: string, i: { type: string; userSentiment?: string; acceptedSuggestion?: boolean }): PersonalityProfile {
    const p = this.getPersonality(uid); const pp = p.params;
    if (i.acceptedSuggestion === true) { pp.explanationDepth = Math.min(100, pp.explanationDepth + 2); pp.riskTolerance = Math.min(100, pp.riskTolerance + 1); }
    else if (i.acceptedSuggestion === false) pp.explanationDepth = Math.max(0, pp.explanationDepth - 1);
    if (i.userSentiment === 'positive') { pp.humor = Math.min(100, pp.humor + 2); pp.emojiUsage = Math.min(100, pp.emojiUsage + 2); pp.friendliness = Math.min(100, pp.friendliness + 1); }
    else if (i.userSentiment === 'negative') { pp.humor = Math.max(0, pp.humor - 3); pp.emojiUsage = Math.max(0, pp.emojiUsage - 3); pp.formality = Math.min(100, pp.formality + 5); }
    p.memory.favoriteHumorLevel = pp.humor; p.memory.favoriteEmojiUsage = pp.emojiUsage;
    p.memory.favoriteConversationSpeed = pp.speakingSpeed; p.updatedAt = Date.now(); this.save(uid); return p;
  }

  predict(uid: string): { mode: PersonalityMode; confidence: number; reasons: string[] } {
    const lp = learningEngine.getProfile(uid);
    const scores: Record<string, number> = {};
    const bc = lp.emotionalBiases.filter((b: any) => b.score > 50).length;
    const av = lp.riskHabits?.find((h: any) => h.label === 'Avg Leverage')?.value || 1;
    const ms = lp.commonMistakes.reduce((s: number, t: any) => s + t.occurrences, 0);
    for (const mode of Object.keys(T) as PersonalityMode[]) {
      let s = 30;
      if (lp.favoriteCoins.length > 3 && mode === 'analyst') s += 25;
      if (bc >= 2 && mode === 'psychologist') s += 25;
      if (av > 10 && mode === 'risk_manager') s += 30;
      if (ms > 8 && mode === 'strict_mentor') s += 20;
      if (lp.learningScore > 60 && mode === 'academy_tutor') s += 15;
      scores[mode] = s;
    }
    const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    const rs: string[] = [];
    if (lp.favoriteCoins.length > 3) rs.push('Diverse portfolio');
    if (bc >= 2) rs.push('Emotional biases detected');
    if (av > 10) rs.push('High leverage usage');
    return { mode: best[0] as PersonalityMode, confidence: Math.min(100, best[1] + 10), reasons: rs.length > 0 ? rs : ['Default recommendation'] };
  }

  preview(mode: PersonalityMode) { return { params: { ...T[mode] } }; }
  reset(uid: string) { return this.setPersonality(uid, 'friendly'); }
  exportProfile(uid: string) { return { ...this.getPersonality(uid) }; }

  importProfile(prf: PersonalityProfile): PersonalityProfile {
    const profs = this.getProfiles(prf.userId);
    const ex = this.findProfile(prf.userId, prf.language, prf.device, prf.workspace, prf.sessionId);
    if (ex) Object.assign(ex, prf, { updatedAt: Date.now() }); else profs.push({ ...prf, updatedAt: Date.now() });
    this.save(prf.userId); return prf;
  }

  generateReport(uid: string): PersonalityReport {
    const p = this.getPersonality(uid);
    const evol = (p.history || []).slice(-30).map(h => ({ date: new Date(h.timestamp).toISOString().split('T')[0], mode: h.mode }));
    const pred = this.predict(uid);
    return {
      userId: uid, timestamp: Date.now(), currentMode: p.mode, params: { ...p.params }, evolution: evol,
      statistics: { mostUsedMode: p.mode, averageConfidence: 70, totalAdaptations: p.adaptCount, preferredTeachingStyle: p.params.teachingStyle, preferredConversationStyle: p.params.conversationStyle },
      recommendation: pred.mode, recommendationReason: pred.reasons.join('; '),
    };
  }

  buildSystemPrompt(uid: string): string {
    const p = this.getPersonality(uid); const pp = p.params;
    const pt: string[] = ['You are Lynx AI as a ' + p.mode.replace(/_/g, ' ') + '.'];
    if (pp.humor > 60) pt.push('Use humor.');
    if (pp.formality > 70) pt.push('Be formal.');
    if (pp.emojiUsage > 60) pt.push('Use emojis.');
    if (pp.speakingSpeed > 60) pt.push('Be quick.');
    if (pp.explanationDepth > 70) pt.push('Be thorough.');
    pt.push('Teach: ' + pp.teachingStyle + '. Chat: ' + pp.conversationStyle + '.');
    return pt.join(' ');
  }

  listModes(): { mode: PersonalityMode; desc: string }[] {
    const ds: Record<string, string> = { coach: 'Action-oriented', teacher: 'Deep explanations', analyst: 'Data-driven', friendly: 'Warm & casual', strict_mentor: 'Disciplined', calm_advisor: 'Patient', motivational: 'Energetic', business_consultant: 'Strategic', executive_advisor: 'High-level', tournament_commentator: 'Exciting', academy_tutor: 'Educational', support_assistant: 'Helpful', psychologist: 'Therapeutic', productivity_coach: 'Efficiency', career_mentor: 'Career guidance', investor_mentor: 'Investment', risk_manager: 'Risk-focused', news_reporter: 'News', crypto_journalist: 'Crypto', community_moderator: 'Community' };
    return Object.keys(T).map(m => ({ mode: m as PersonalityMode, desc: ds[m] || m }));
  }

  // ── Orchestrator ───────────────────────────────────────────────────────

  async execute(ctx: OrchestratorContext): Promise<void> {
    const uid = ctx.userId || 'anonymous';
    if (Math.random() < 0.15) this.adapt(uid);
  }

  getOrchestratorContract(): EngineContract {
    return {
      name: 'personalityEngine', priority: 5,
      dependencies: ['contextEngine', 'universalMemory', 'brainEngine', 'emotionalEngine', 'learningEngine'],
      initialize: async () => { this.registered = true; },
      execute: (ctx) => this.execute(ctx),
      shutdown: async () => { this.registered = false; },
      health: () => ({ status: this.registered ? 'healthy' : 'degraded', lastRun: null, lastDuration: 0, errorCount: 0, totalRuns: 0, avgDuration: 0 }),
    };
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private defMem(mode: PersonalityMode): PersonalityMemory {
    return { favoriteTone: mode, favoriteTeachingStyle: 'adaptive', favoriteCoachStyle: 'supportive', favoriteAnalystStyle: 'detailed', favoriteHumorLevel: 40, favoriteResponseLength: 50, favoriteExplanationDepth: 60, favoriteEmojiUsage: 40, favoriteConversationSpeed: 50, favoriteLanguageStyle: 'balanced', favoriteMotivationStyle: 'encouraging', favoritePersonalityProfile: mode };
  }

  private findProfile(uid: string, lang?: string, dev?: string, ws?: string, sid?: string): PersonalityProfile | undefined {
    const profs = this.getProfiles(uid);
    if (sid) { const m = profs.find(p => p.sessionId === sid); if (m) return m; }
    if (ws) { const m = profs.find(p => p.workspace === ws); if (m) return m; }
    let m = profs.find(p => p.language === lang && p.device === dev); if (m) return m;
    if (lang) { m = profs.find(p => p.language === lang); if (m) return m; }
    return profs.find(p => !p.language && !p.device) || profs[0];
  }

  private getProfiles(uid: string): PersonalityProfile[] { if (!this.profiles.has(uid)) this.profiles.set(uid, this.load(uid) || []); return this.profiles.get(uid)!; }
  private save(uid: string): void { try { const p = this.profiles.get(uid); if (p) localStorage.setItem(this.KEY + uid, JSON.stringify(p)); } catch {} }
  private load(uid: string): PersonalityProfile[] | null { try { const d = localStorage.getItem(this.KEY + uid); return d ? JSON.parse(d) : null; } catch { return null; } }
  private loadAll(): void { try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith(this.KEY)) { const uid = k.replace(this.KEY, ''); const d = this.load(uid); if (d) this.profiles.set(uid, d); } } } catch {} }
}

export const personalityEngine = new PersonalityEngine();
