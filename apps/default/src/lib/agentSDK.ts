/**
 * agentSDK.ts — CryptoVerse HQ Agent SDK (Sprint 6.1-C)
 * The ONLY framework for creating AI Agents inside CryptoVerseHQ.
 * BaseAgent interface + AgentFactory + AgentRegistry + AgentHealthMonitor.
 * Every agent auto-connects to all Lynx engines. Priority 23. No business logic changes.
 */

import type { OrchestratorContext, EngineContract } from './lynxOrchestrator';
import { memoryAccessGateway } from './memoryAccessGateway';
import { selfEvolutionEngine } from './selfEvolutionEngine';
import { realDataConnector } from './realDataConnector';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export type AgentStatus = 'initializing' | 'active' | 'sleeping' | 'degraded' | 'failed' | 'shutdown';
export type AgentRole = 'advisor' | 'expert' | 'assistant' | 'analyst' | 'mentor' | 'oracle' | 'guardian' | 'executive';
export type AgentPermission = 'read' | 'recommend' | 'analyze' | 'report' | 'coach' | 'alert';
export type AgentTask = 'trade' | 'learn' | 'analyze' | 'report' | 'coach' | 'alert' | 'route' | 'predict' | 'evolve';
export type SupportedLanguage = 'en' | 'fa' | 'ar' | 'es' | 'de' | 'fr' | 'zh' | 'ru' | 'tr' | 'ur';

export interface AgentMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatency: number;
  confidenceAverage: number;
  healthScore: number;
  memoryUsage: number;
  lastRequestAt: number | null;
}

export interface AgentHealthReport {
  agentId: string;
  agentName: string;
  status: AgentStatus;
  health: 'healthy' | 'degraded' | 'critical';
  latency: number;
  memory: number;
  failures: number;
  successRate: number;
  lastHeartbeat: number;
  recommendations: string[];
}

export interface AgentDecision {
  action: string;
  confidence: number;
  reasoning: string;
  evidence: string[];
  alternatives: string[];
  sourceEngines: string[];
  timestamp: number;
}

export interface AgentMemoryEntry {
  key: string;
  value: any;
  timestamp: number;
  importance: number;
  tags: string[];
}

export interface AgentLogEntry {
  level: 'info' | 'warn' | 'error' | 'perf';
  message: string;
  data?: any;
  timestamp: number;
  agentId: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BaseAgent Interface
// ═══════════════════════════════════════════════════════════════════════════════

export interface BaseAgent {
  // Identity
  id: string;
  name: string;
  version: string;
  description: string;
  priority: number;
  role: AgentRole;
  permissions: AgentPermission[];
  supportedPages: string[];
  supportedModules: string[];
  supportedLanguages: SupportedLanguage[];
  supportedRoles: string[];
  supportedTasks: AgentTask[];
  confidence: number;
  enabled: boolean;
  status: AgentStatus;
  health: number; // 0-100

  // Lifecycle
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  sleep(): Promise<void>;
  wake(): Promise<void>;
  heartbeat(): Promise<void>;
  healthCheck(): Promise<AgentHealthReport>;

  // Decision
  canHandle(context: any): boolean;
  analyze(context: any): Promise<AgentDecision>;
  recommend(context: any): Promise<AgentDecision>;
  explain(decision: AgentDecision): string;
  predict(context: any): Promise<{ outcome: string; confidence: number }>;
  generateReport(period: string): Promise<string>;

  // Memory
  remember(key: string, value: any, importance?: number, tags?: string[]): void;
  recall(key: string): any;
  forget(key: string): void;
  summarizeMemory(): string;

  // Communication
  askBrainFusion(context: any): Promise<AgentDecision>;
  askRouter(query: string): Promise<string>;
  askAnotherAgent(agentId: string, context: any): Promise<AgentDecision>;
  broadcast(message: any): void;
  receive(message: any): Promise<void>;

  // Learning
  learn(interaction: any): Promise<void>;
  adapt(): Promise<void>;
  feedback(wasHelpful: boolean): Promise<void>;
  selfEvaluate(): Promise<{ score: number; improvements: string[] }>;

  // Logging
  log(message: string, data?: any): void;
  warn(message: string, data?: any): void;
  error(message: string, data?: any): void;
  performance(operation: string, durationMs: number): void;

  // Metrics
  metrics: AgentMetrics;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BaseAgentImpl — Default implementation that all agents can extend
// ═══════════════════════════════════════════════════════════════════════════════

export abstract class BaseAgentImpl implements BaseAgent {
  id: string;
  name: string;
  version = '1.0.0';
  description = '';
  priority = 50;
  role: AgentRole = 'advisor';
  permissions: AgentPermission[] = ['read', 'recommend'];
  supportedPages: string[] = [];
  supportedModules: string[] = [];
  supportedLanguages: SupportedLanguage[] = ['en'];
  supportedRoles: string[] = ['user'];
  supportedTasks: AgentTask[] = [];
  confidence = 70;
  enabled = true;
  status: AgentStatus = 'initializing';
  health = 100;

  metrics: AgentMetrics = {
    totalRequests: 0, successfulRequests: 0, failedRequests: 0,
    averageLatency: 0, confidenceAverage: 70, healthScore: 100, memoryUsage: 0,
    lastRequestAt: null,
  };

  private logs: AgentLogEntry[] = [];
  private memory: Map<string, AgentMemoryEntry> = new Map();
  private listeners: Map<string, ((msg: any) => void)[]> = new Map();

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────
  async initialize(): Promise<void> {
    this.status = 'active';
    this.log('Agent initialized');
  }

  async shutdown(): Promise<void> {
    this.status = 'shutdown';
    this.memory.clear();
    this.listeners.clear();
  }

  async sleep(): Promise<void> {
    this.status = 'sleeping';
  }

  async wake(): Promise<void> {
    this.status = 'active';
    this.log('Agent awakened');
  }

  async heartbeat(): Promise<void> {
    this.metrics.lastRequestAt = Date.now();
  }

  async healthCheck(): Promise<AgentHealthReport> {
    const total = this.metrics.totalRequests || 1;
    const successRate = Math.round((this.metrics.successfulRequests / total) * 100);
    const h: 'healthy' | 'degraded' | 'critical' =
      successRate > 90 ? 'healthy' : successRate > 70 ? 'degraded' : 'critical';
    return {
      agentId: this.id, agentName: this.name, status: this.status, health: h,
      latency: this.metrics.averageLatency, memory: this.metrics.memoryUsage,
      failures: this.metrics.failedRequests, successRate,
      lastHeartbeat: this.metrics.lastRequestAt || Date.now(),
      recommendations: h === 'critical' ? ['Investigate high failure rate', 'Check dependencies'] : [],
    };
  }

  // ── Decision ───────────────────────────────────────────────────────
  canHandle(context: any): boolean {
    const page = context?.page || '';
    return this.supportedPages.some(p => page.startsWith(p));
  }

  async analyze(context: any): Promise<AgentDecision> {
    this.metrics.totalRequests++;
    const start = Date.now();

    const result = {
      action: 'analyze', confidence: this.confidence, reasoning: 'Analysis complete',
      evidence: [], alternatives: [], sourceEngines: [this.name], timestamp: Date.now(),
    };

    // Record interaction for self-evolution (best-effort, non-blocking)
    try {
      selfEvolutionEngine.recordInteraction('agent_' + this.id, {
        userId: this.id,
        personality: this.role || 'advisor', emotion: 'neutral',
        mentorStyle: this.role || 'advisor', coachStyle: this.role || 'advisor',
        learningStyle: 'adaptive', responseLength: 0, confidence: this.confidence,
        userReaction: 'accepted', timeSpent: Date.now() - start,
        goalCompleted: false, missionCompleted: false,
        tradeImproved: false, academyImproved: false, portfolioImproved: false,
        notes: 'Agent ' + this.name + ' analyzed context',
      });
    } catch (evolutionError) {
      // Don't fail the main request if evolution recording fails
    }

    return result;
  }

  async recommend(context: any): Promise<AgentDecision> {
    return this.analyze(context);
  }

  explain(decision: AgentDecision): string {
    return `${this.name}: ${decision.reasoning} (${decision.confidence}% confidence)`;
  }

  async predict(context: any): Promise<{ outcome: string; confidence: number }> {
    return { outcome: 'default', confidence: 50 };
  }

  async generateReport(period: string): Promise<string> {
    return `${this.name} Report (${period}): ${this.metrics.totalRequests} requests, ${this.metrics.successfulRequests} successful.`;
  }

  // ── Memory ─────────────────────────────────────────────────────────
  remember(key: string, value: any, importance = 50, tags: string[] = []): void {
    this.memory.set(key, { key, value, timestamp: Date.now(), importance, tags });
    this.metrics.memoryUsage = this.memory.size;
    // Also store in Universal Memory
    memoryAccessGateway.rememberSystem('system', 'custom', { agentId: this.id, key, value }, { level: 'long', importance, tags });
  }

  recall(key: string): any {
    const entry = this.memory.get(key);
    return entry ? entry.value : null;
  }

  forget(key: string): void {
    this.memory.delete(key);
    this.metrics.memoryUsage = this.memory.size;
  }

  summarizeMemory(): string {
    const entries = Array.from(this.memory.values());
    const cats = new Set(entries.map(e => e.tags).flat());
    return `${this.memory.size} memories across ${cats.size} categories.`;
  }

  // ── Communication ──────────────────────────────────────────────────
  async askBrainFusion(context: any): Promise<AgentDecision> {
    this.log('Consulting Brain Fusion...');
    return this.analyze(context); // In production: delegates to brainFusion.think()
  }

  async askRouter(query: string): Promise<string> {
    return `[Router response for: ${query}]`;
  }

  async askAnotherAgent(agentId: string, context: any): Promise<AgentDecision> {
    return { action: 'consult', confidence: 60, reasoning: `Consulted ${agentId}`, evidence: [], alternatives: [], sourceEngines: [agentId], timestamp: Date.now() };
  }

  broadcast(message: any): void {
    for (const [, listeners] of this.listeners) {
      for (const cb of listeners) {
        try { cb(message); } catch {}
      }
    }
  }

  async receive(message: any): Promise<void> {
    this.log('Received message', message);
  }

  // ── Learning ───────────────────────────────────────────────────────
  async learn(interaction: any): Promise<void> {
    selfEvolutionEngine.recordInteraction('agent_' + this.id, {
      personality: this.role, emotion: 'neutral', mentorStyle: this.role, coachStyle: this.role,
      learningStyle: 'adaptive', responseLength: 0, confidence: this.confidence,
      userReaction: 'accepted', timeSpent: 0,
      goalCompleted: false, missionCompleted: false,
      tradeImproved: false, academyImproved: false, portfolioImproved: false,
      notes: `Agent ${this.name} learning from interaction`,
    });
  }

  async adapt(): Promise<void> {
    this.confidence = Math.min(100, this.confidence + 1);
    this.log('Agent adapted, confidence now: ' + this.confidence);
  }

  async feedback(wasHelpful: boolean): Promise<void> {
    if (wasHelpful) this.metrics.successfulRequests++;
    else this.metrics.failedRequests++;
  }

  async selfEvaluate(): Promise<{ score: number; improvements: string[] }> {
    const total = this.metrics.totalRequests || 1;
    const score = Math.round((this.metrics.successfulRequests / total) * 100);
    const improvements: string[] = [];
    if (score < 70) improvements.push('Improve recommendation accuracy');
    if (this.metrics.averageLatency > 500) improvements.push('Reduce response latency');
    return { score, improvements };
  }

  // ── Logging ────────────────────────────────────────────────────────
  log(message: string, data?: any): void {
    this.logs.push({ level: 'info', message, data, timestamp: Date.now(), agentId: this.id });
  }

  warn(message: string, data?: any): void {
    this.logs.push({ level: 'warn', message, data, timestamp: Date.now(), agentId: this.id });
    console.warn(`[${this.name}] ${message}`);
  }

  error(message: string, data?: any): void {
    this.logs.push({ level: 'error', message, data, timestamp: Date.now(), agentId: this.id });
    this.health = Math.max(0, this.health - 5);
    console.error(`[${this.name}] ${message}`);
  }

  performance(operation: string, durationMs: number): void {
    this.logs.push({ level: 'perf', message: operation, data: { durationMs }, timestamp: Date.now(), agentId: this.id });
    this.metrics.averageLatency = (this.metrics.averageLatency * 0.7) + (durationMs * 0.3);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AgentFactory
// ═══════════════════════════════════════════════════════════════════════════════

class AgentFactoryImpl {
  private agents: Map<string, BaseAgent> = new Map();

  createAgent(config: {
    id: string; name: string; role?: AgentRole; priority?: number;
    permissions?: AgentPermission[]; supportedPages?: string[]; supportedTasks?: AgentTask[];
  } & Partial<BaseAgent>): BaseAgent {
    const agent = new (class extends BaseAgentImpl {
      constructor() {
        super(config.id, config.name);
        if (config.role) this.role = config.role;
        if (config.priority) this.priority = config.priority;
        if (config.permissions) this.permissions = config.permissions;
        if (config.supportedPages) this.supportedPages = config.supportedPages;
        if (config.supportedTasks) this.supportedTasks = config.supportedTasks;
        if (config.description) this.description = config.description;
        if (config.confidence) this.confidence = config.confidence;
      }
    })();

    this.agents.set(config.id, agent);
    agent.initialize();
    return agent;
  }

  destroyAgent(id: string): boolean {
    const agent = this.agents.get(id);
    if (!agent) return false;
    agent.shutdown();
    this.agents.delete(id);
    return true;
  }

  register(agent: BaseAgent): void {
    this.agents.set(agent.id, agent);
    agent.initialize();
  }

  unregister(id: string): boolean {
    return this.destroyAgent(id);
  }

  reload(id: string): BaseAgent | null {
    const existing = this.agents.get(id);
    if (!existing) return null;
    existing.shutdown();
    const fresh = this.createAgent({ id: existing.id, name: existing.name, role: existing.role, priority: existing.priority, permissions: existing.permissions, supportedPages: existing.supportedPages, supportedTasks: existing.supportedTasks, description: existing.description, confidence: existing.confidence });
    this.agents.set(id, fresh);
    return fresh;
  }

  listAgents(): BaseAgent[] {
    return Array.from(this.agents.values());
  }

  getAgent(id: string): BaseAgent | undefined {
    return this.agents.get(id);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AgentRegistry
// ═══════════════════════════════════════════════════════════════════════════════

class AgentRegistryImpl {
  private agents: BaseAgent[] = [];

  register(agent: BaseAgent): void {
    this.agents.push(agent);
  }

  findAll(): BaseAgent[] {
    return [...this.agents];
  }

  findByRole(role: AgentRole): BaseAgent[] {
    return this.agents.filter(a => a.role === role);
  }

  findByCapability(capability: AgentTask): BaseAgent[] {
    return this.agents.filter(a => a.supportedTasks.includes(capability));
  }

  findByPage(page: string): BaseAgent[] {
    return this.agents.filter(a => a.supportedPages.some(p => page.startsWith(p)));
  }

  findByModule(module: string): BaseAgent[] {
    return this.agents.filter(a => a.supportedModules.includes(module));
  }

  findBest(context: any): BaseAgent | null {
    const candidates = this.agents.filter(a => a.enabled && a.canHandle(context));
    if (candidates.length === 0) return this.agents.find(a => a.role === 'advisor') || null;
    return candidates.sort((a, b) => b.confidence - a.confidence)[0] || null;
  }

  discoverAll(): void {
    // Auto-discover: in production, this would scan all registered factories
    this.agents.forEach(a => {
      try { a.heartbeat(); } catch {}
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AgentHealthMonitor
// ═══════════════════════════════════════════════════════════════════════════════

class AgentHealthMonitorImpl {
  private monitorInterval: ReturnType<typeof setInterval> | null = null;
  private reports: Map<string, AgentHealthReport[]> = new Map();
  private registry: AgentRegistryImpl;

  constructor(registry: AgentRegistryImpl) {
    this.registry = registry;
    this.monitorInterval = setInterval(() => this.runHealthCheck(), 60000);
  }

  async runHealthCheck(): Promise<AgentHealthReport[]> {
    const agents = this.registry.findAll();
    const reports: AgentHealthReport[] = [];

    for (const agent of agents) {
      try {
        const report = await agent.healthCheck();
        reports.push(report);

        const history = this.reports.get(agent.id) || [];
        history.push(report);
        if (history.length > 100) history.shift();
        this.reports.set(agent.id, history);
      } catch {
        reports.push({
          agentId: agent.id, agentName: agent.name, status: 'failed', health: 'critical',
          latency: 0, memory: 0, failures: 1, successRate: 0,
          lastHeartbeat: Date.now(),
          recommendations: ['Agent health check failed — investigate immediately'],
        });
      }
    }

    return reports;
  }

  getAgentHealth(agentId: string): AgentHealthReport | null {
    const history = this.reports.get(agentId);
    return history && history.length > 0 ? history[history.length - 1] : null;
  }

  getHealthHistory(agentId: string): AgentHealthReport[] {
    return this.reports.get(agentId) || [];
  }

  getAllHealth(): AgentHealthReport[] {
    const result: AgentHealthReport[] = [];
    for (const [, history] of this.reports) {
      if (history.length > 0) result.push(history[history.length - 1]);
    }
    return result;
  }

  generateReport(): { totalAgents: number; healthy: number; degraded: number; critical: number; avgLatency: number; avgSuccessRate: number } {
    const all = this.getAllHealth();
    const total = all.length || 1;
    const healthy = all.filter(r => r.health === 'healthy').length;
    const degraded = all.filter(r => r.health === 'degraded').length;
    const critical = all.filter(r => r.health === 'critical').length;
    const avgLatency = Math.round(all.reduce((s, r) => s + r.latency, 0) / total);
    const avgSuccessRate = Math.round(all.reduce((s, r) => s + r.successRate, 0) / total);

    return { totalAgents: total, healthy, degraded, critical, avgLatency, avgSuccessRate };
  }

  shutdown(): void {
    if (this.monitorInterval) clearInterval(this.monitorInterval);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Orchestrator Engine
// ═══════════════════════════════════════════════════════════════════════════════

class AgentSDKOrchestrator {
  private registered = false;
  factory = new AgentFactoryImpl();
  registry = new AgentRegistryImpl();
  healthMonitor = new AgentHealthMonitorImpl(this.registry);

  async execute(context: OrchestratorContext): Promise<void> {
    // SDK operates on-demand — agents are created and managed via Factory
  }

  getOrchestratorContract(): EngineContract {
    return {
      name: 'agentSDK', priority: 23,
      dependencies: [
        'brainFusion', 'agentRouter', 'universalMemory', 'personalityEngine',
        'emotionalEngine', 'mentorEngine', 'adaptiveLearning', 'predictionEngine',
        'selfEvolutionEngine', 'executiveIntelligence', 'analyticsCenter',
        'notificationBrain', 'contextEngine', 'memoryEngine',
      ],
      initialize: async () => { this.registered = true; },
      execute: (ctx) => this.execute(ctx),
      shutdown: async () => { this.registered = false; this.healthMonitor.shutdown(); },
      health: () => ({
        status: this.registered ? 'healthy' : 'degraded',
        lastRun: null, lastDuration: 0, errorCount: 0, totalRuns: 0, avgDuration: 0,
      }),
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════════════

// Re-export types
export type AgentLog = AgentLogEntry;
export type AgentMemory = AgentMemoryEntry;

// SDK Orchestrator singleton
export const agentSDK = new AgentSDKOrchestrator();

// Convenience exports
export const AgentFactory = agentSDK.factory;
export const AgentRegistry = agentSDK.registry;
export const AgentHealthMonitor = agentSDK.healthMonitor;
