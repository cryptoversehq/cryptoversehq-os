/**
 * lynxPipeline.ts — Lynx AI Full Pipeline
 * The ONE entry point for all Lynx AI queries.
 * Flow: lynxResponder (fast) → Identity → Permissions → AgentRouter
 *       → BrainFusion → DeepSeek → Memory → SelfEvolution → KnowledgeGraph
 */

import { useAuthStore } from './authStore';
import { identityEngine } from './identityEngine';
import { permissionEngine } from './permissionEngine';
import { realDataConnector } from './realDataConnector';
import { businessAnalyst } from './businessAnalyst';
import { healthMonitor } from './healthMonitor';
import { dynamicKnowledgeInject } from './dynamicKnowledgeInject';
import { agentRouterGen2 } from './agentRouter';
import { brainFusion } from './brainFusion';
import { deepSeekChat, type DSMessage } from './deepSeekClient';
import { memoryAccessGateway } from './memoryAccessGateway';
import { selfEvolutionEngine } from './selfEvolutionEngine';
import { relationshipEngine } from './relationshipEngine';
import { livingKnowledgeGraph } from './insightGraph';
import { createLynxResponse, type LynxResponse } from './lynxResponseContract';
import type { PipelineQuery, PipelineResponse } from './lynxTypes';

export type { PipelineQuery, PipelineResponse } from './lynxTypes';

const PERSONAL = /\b(my|mine|i have|i own|my account|my profile)\b/i;
const ADMIN = /\b(users?|revenue|security|system|admin|payments?)\b/i;
const MARKET = /\b(market|btc|eth|sol|price|trend|bitcoin|ethereum|solana|crypto)\b/i;

// ═══════════════════════════════════════════════════════════════════════════════
// Pipeline Query/Response Types — defined in ./lynxTypes (PipelineQuery, PipelineResponse)
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// Internal helpers (preserved from original)
// ═══════════════════════════════════════════════════════════════════════════════

function intent(query: string): string {
  if (MARKET.test(query) && !PERSONAL.test(query)) return 'market';
  return realDataConnector.detectDataType(query) || 'general';
}

function resource(type: string): string {
  if (['portfolio','assets','holdings','simulator','inventory','rewards','bots','copy_trading'].includes(type)) return 'portfolio_data';
  if (type === 'wallet') return 'wallet_balance';
  if (type === 'marketplace') return 'trading_bots';
  if (type === 'competitions') return 'leaderboard_public';
  if (type === 'revenue') return 'revenue_data';
  if (['users','platform_health'].includes(type)) return 'analytics_dashboard';
  return 'landing_page';
}

// ── Real-time data accessors (consolidated from realTimeTruthEngine.ts) ──

interface RealUserData { total: number; active: number; inactive: number; newToday: number; byPlan: { free: number; pro: number; pro_plus: number }; }
interface RealRevenueData { total: number; today: number; week: number; month: number; currency: string; }
interface RealTradeData { totalTrades: number; openPositions: number; closedToday: number; avgWinRate: number; volume24h: number; }
interface RealAcademyData { totalLessons: number; completedLessons: number; completionRate: number; activeUsers: number; avgLevel: number; }

function getPersonalDomainData(_query: string, key: string): any | null {
  const currentUser = realDataConnector.getAllData().auth?.user;
  if (!currentUser?.id) return null;
  const personal = realDataConnector.getUserPersonalData(currentUser.id);
  if (!personal) return null;
  const value = personal[key];
  if (Array.isArray(value)) return value.length > 0 ? value : null;
  if (value && typeof value === 'object') return value;
  return value === undefined || value === null ? null : value;
}

function getRealUserData(): RealUserData {
  const appData = realDataConnector.getAppData();
  const planData = appData.users?.plans;
  const total = appData.users?.total ?? 0;
  const active = appData.users?.active7d ?? 0;
  return {
    total, active, inactive: Math.max(0, total - active),
    newToday: 0,
    byPlan: { free: planData?.free ?? 0, pro: planData?.pro ?? 0, pro_plus: planData?.pro_plus ?? 0 },
  };
}

function getRealRevenueData(): RealRevenueData {
  const biz = businessAnalyst.getReport();
  return {
    total: biz.salesMetrics.totalRevenue ?? 0,
    today: biz.salesMetrics.dailyRevenue ?? 0,
    week: biz.salesMetrics.weeklyRevenue ?? 0,
    month: biz.salesMetrics.monthlyRevenue ?? 0,
    currency: 'USD',
  };
}

function getRealTradeData(): RealTradeData {
  const appData = realDataConnector.getAppData();
  const trading = appData.trading || {};
  return {
    totalTrades: trading.totalTrades || 0,
    openPositions: trading.openPositions || 0,
    closedToday: Math.floor((trading.totalTrades || 0) * 0.05),
    avgWinRate: trading.avgWinRate || 0,
    volume24h: trading.volume24h || 0,
  };
}

function getRealAcademyData(): RealAcademyData {
  const appData = realDataConnector.getAppData();
  const academy = appData.academy || {};
  const total = academy.totalLessons ?? 0;
  const completed = academy.completedLessons ?? 0;
  return {
    totalLessons: total, completedLessons: completed,
    completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    activeUsers: appData.users?.active7d ?? 0, avgLevel: academy.avgLevel ?? 0,
  };
}

function getRealSubscriptionData(): { plans: { free: number; pro: number; pro_plus: number }; conversionRate: number } {
  const appData = realDataConnector.getAppData();
  const plans = appData.users?.plans ?? { free: 0, pro: 0, pro_plus: 0 };
  const total = plans.free + plans.pro + plans.pro_plus;
  return {
    plans,
    conversionRate: total > 0 ? Math.round(((plans.pro + plans.pro_plus) / total) * 100) : 0,
  };
}

function getRealWalletData(): { cpBalance: number; cpPrice: number; circulatingSupply: number } {
  const appData = realDataConnector.getAppData();
  return { cpBalance: appData.cp?.balance ?? 0, cpPrice: appData.cp?.price ?? 0, circulatingSupply: appData.cp?.circulatingSupply ?? 0 };
}

function getRealPlatformHealth(): { services: { name: string; status: string; latency: number }[]; overallStatus: string } {
  const health = healthMonitor.getReport();
  const services = Object.values(health.services) as any[];
  return {
    services: services.map((s: any) => ({ name: s.name, status: s.status, latency: Math.round(s.latency) })),
    overallStatus: health.overallStatus,
  };
}

async function getRealData(query: string): Promise<any> {
  const dataType = realDataConnector.detectDataType(query);
  if (!dataType) return null;
  switch (dataType) {
    case 'users': return getRealUserData();
    case 'revenue': return getRealRevenueData();
    case 'trades': return getRealTradeData();
    case 'academy': return getRealAcademyData();
    case 'subscription': return getRealSubscriptionData();
    case 'wallet': return getRealWalletData();
    case 'platform_health': return getRealPlatformHealth();
    case 'simulator': return getPersonalDomainData(query, 'simulator');
    case 'inventory': return getPersonalDomainData(query, 'inventory');
    case 'portfolio': return getPersonalDomainData(query, 'portfolio');
    case 'assets': return getPersonalDomainData(query, 'marketplaceAssets');
    case 'holdings': return getPersonalDomainData(query, 'portfolio');
    case 'bots': return getPersonalDomainData(query, 'bots');
    case 'rewards': return getPersonalDomainData(query, 'rewards');
    case 'copy_trading': return getPersonalDomainData(query, 'copyTrading');
    case 'marketplace': return realDataConnector.getAllData().marketplace?.getAllBots?.() || null;
    case 'competitions': return realDataConnector.getAllData().competitions?.getActive?.() || null;
    default: return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Pipeline — processQuery (NEW — wired to UI)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Process a user query through the complete Lynx AI pipeline.
 * This is the method called by LynxChat UI.
 *
 * Flow:
 * 1. Try lynxResponder (fast local, 0ms)
 * 2. If local has a real answer → return immediately + record memory
 * 3. If local is fallback → full pipeline:
 *    a. Identity verification
 *    b. Permission check
 *    c. Agent routing
 *    d. Brain Fusion
 *    e. DeepSeek API
 *    f. Memory recording
 *    g. Self-evolution (async)
 *    h. Knowledge graph update
 */
export async function processQuery(request: PipelineQuery): Promise<PipelineResponse> {
  const startTime = Date.now();
  const enginesConsulted: string[] = [];

  // ── Step 0 (route detection only) ──────────────────────────────────────
  // lynxResponder is NOT used to produce final answers here — its fast local
  // path previously bypassed Brain Fusion. Route detection for agent selection
  // happens in Step 3 via agentRouterGen2 (which delegates the keyword/routing
  // logic to lynxResponder.detectRoute). Every final answer now flows through:
  //   Identity → Permission → Agent Routing → Brain Fusion → DeepSeek.

  // ── Step 1: Identity Verification ────────────────────────────────────
  try {
    enginesConsulted.push('identityEngine');
    const identity = identityEngine.getIdentity(request.userId);
    const auth = useAuthStore.getState();

    if (!identity || !auth.isAuthenticated) {
      return {
        content: auth.isAuthenticated
          ? '⚠️ Unable to verify your identity. Please sign in again.'
          : '🔒 Please sign in so I can help you.',
        source: 'error',
        confidence: 1,
        metadata: {
          identityVerified: false,
          permissionsGranted: false,
          memoryUsed: false,
          enginesConsulted,
          processingTimeMs: Date.now() - startTime,
        },
      };
    }
  } catch (err) {
    // FAIL CLOSED: identity verification errors must not downgrade to a
    // partially-authorized run. Explicitly deny and stop.
    console.error('[LynxPipeline] Identity verification failed:', err instanceof Error ? err.message : err);
    return {
      content: '🔒 Unable to verify your identity. Please sign in again.',
      source: 'error',
      confidence: 1,
      metadata: {
        identityVerified: false,
        permissionsGranted: false,
        memoryUsed: false,
        enginesConsulted,
        processingTimeMs: Date.now() - startTime,
      },
    };
  }

  // ── Step 2: Permission Check ─────────────────────────────────────────
  const kind = intent(request.query);
  enginesConsulted.push('permissionEngine');

  try {
    if (ADMIN.test(request.query) && identityLevel(request.userId) === 'user') {
      return {
        content: '🔒 Admin access is required for this information.',
        source: 'error',
        confidence: 1,
        metadata: {
          identityVerified: true,
          permissionsGranted: false,
          memoryUsed: false,
          enginesConsulted,
          processingTimeMs: Date.now() - startTime,
        },
      };
    }

    const permission = permissionEngine.authorize(request.userId, resource(kind), 'read');
    if (!permission.allowed) {
      return {
        content: '🔒 You do not have permission to access this information.',
        source: 'error',
        confidence: 1,
        metadata: {
          identityVerified: true,
          permissionsGranted: false,
          memoryUsed: false,
          enginesConsulted,
          processingTimeMs: Date.now() - startTime,
        },
      };
    }
  } catch (err) {
    // FAIL CLOSED: permission-check errors must not downgrade to an
    // unauthorized run.
    console.error('[LynxPipeline] Permission check failed:', err instanceof Error ? err.message : err);
    return {
      content: '🔒 Authorization could not be verified. Please try again.',
      source: 'error',
      confidence: 1,
      metadata: {
        identityVerified: true,
        permissionsGranted: false,
        memoryUsed: false,
        enginesConsulted,
        processingTimeMs: Date.now() - startTime,
      },
    };
  }

  // ── Step 3: Agent Routing ────────────────────────────────────────────
  enginesConsulted.push('agentRouter');
  let primaryAgent = 'mentor';
  try {
    const decision = agentRouterGen2.route({
      userId: request.userId,
      query: request.query,
      role: identityLevel(request.userId),
      page: request.context?.page || request.context?.currentSection || '/',
      timestamp: Date.now(),
    });
    primaryAgent = decision.primaryAgent || 'mentor';
  } catch {
    // Use default
  }

  // ── Step 4: Brain Fusion ─────────────────────────────────────────────
  enginesConsulted.push('brainFusion');
  let fusionAnswer = '';
  let fusionConfidence: number | null = null;
  try {
    const fusion = await brainFusion.think({
      userId: request.userId,
      query: request.query,
      page: request.context?.page || '/',
      personality: 'friendly',
      emotion: 'neutral',
      timestamp: Date.now(),
    });
    fusionAnswer = fusion.answer || '';
    fusionConfidence = typeof fusion.confidence === 'number' ? fusion.confidence : null;
  } catch {
    // Continue without fusion
  }

  // ── Step 5: Data + DeepSeek ──────────────────────────────────────────
  enginesConsulted.push('deepSeek');
  let finalContent = '';

  try {
    // Gather truth data
    const personal = PERSONAL.test(request.query) ||
      ['portfolio','assets','holdings','simulator','inventory','rewards','bots','copy_trading'].includes(kind);

    let truth: any = null;
    if (personal) truth = realDataConnector.getUserPersonalData(request.userId);
    else if (kind === 'market') truth = await realDataConnector.getMarketData();
    else if (kind !== 'general') truth = await getRealData(request.query);

    // Build knowledge prompt
    const knowledge = dynamicKnowledgeInject.buildSystemPrompt(
      request.userId,
      'Intent: ' + kind + '\nQuestion: ' + request.query
    );

    // Call DeepSeek
    const messages: DSMessage[] = [
      {
        role: 'system',
        content: knowledge +
          '\nUse only the supplied truth data. If no data exists, say No data available.',
      },
      {
        role: 'user',
        content:
          'Question: ' + request.query +
          '\nTruth: ' + JSON.stringify(truth || realDataConnector.getAppData()).slice(0, 8000) +
          (fusionAnswer ? '\nFusion: ' + fusionAnswer : ''),
      },
    ];

    const agent = await deepSeekChat(messages);
    finalContent = agent.content || fusionAnswer ||
      'I apologize, but I could not generate a response. Please try again.';
  } catch (dsErr) {
    console.warn('[LynxPipeline] DeepSeek failed:', dsErr);
    // Use fusion answer as fallback
    finalContent = fusionAnswer ||
      '⚠️ AI service is temporarily unavailable. Please try again in a moment.';
    if (!fusionAnswer) {
      enginesConsulted.push('error');
    }
  }

  // ── Step 6: Memory Recording ────────────────────────────────────────
  enginesConsulted.push('memoryAccessGateway');
  let memoryUsed = false;
  try {
    await memoryAccessGateway.remember(
      request.userId,
      request.userId,
      'conversation',
      {
        question: request.query,
        answer: finalContent,
        intent: kind,
        status: 'answered',
      },
      { level: 'short', importance: 45, confidence: 85, tags: ['lynx_response', kind] }
    );
    memoryUsed = true;
  } catch {
    // Memory recording is non-critical
  }

  // ── Step 7: Self-Evolution + Knowledge Graph (async, fire-and-forget) ─
  enginesConsulted.push('selfEvolution');
  enginesConsulted.push('knowledgeGraph');

  // Fire and forget — don't block the response
  Promise.resolve().then(async () => {
    try {
      await selfEvolutionEngine.recordInteraction(request.userId, {
        personality: 'friendly',
        emotion: 'neutral',
        mentorStyle: 'coaching',
        coachStyle: '',
        learningStyle: 'adaptive',
        responseLength: finalContent.length,
        confidence: 85,
        userReaction: 'accepted',
        timeSpent: 0,
        goalCompleted: false,
        missionCompleted: false,
        tradeImproved: false,
        academyImproved: false,
        portfolioImproved: false,
        notes: 'Pipeline query: ' + request.query.substring(0, 100),
      });
    } catch {}

    try {
      const node = livingKnowledgeGraph.addNode(
        request.userId,
        'reasoning',
        request.query,
        { intent: kind, source: 'LynxPipeline' },
        { importance: 45 }
      );
      livingKnowledgeGraph.autoConnect(request.userId);
      relationshipEngine.discover();
    } catch {}
  }).catch(() => {});

  // ── Return final response ────────────────────────────────────────────
  // Confidence is evidence-derived from Brain Fusion (0-100 → 0-1). No
  // hardcoded fallback confidence is reported.
  const confidence = fusionConfidence != null
    ? Math.max(0, Math.min(1, fusionConfidence / 100))
    : 0;
  return {
    content: finalContent,
    source: 'deepseek',
    confidence,
    metadata: {
      identityVerified: true,
      permissionsGranted: true,
      memoryUsed,
      enginesConsulted,
      processingTimeMs: Date.now() - startTime,
      intent: kind,
      agent: primaryAgent,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Internal helpers
// ═══════════════════════════════════════════════════════════════════════════════

function identityLevel(userId: string): string {
  try {
    const identity = identityEngine.getIdentity(userId);
    return identity?.level || 'user';
  } catch {
    return 'user';
  }
}

async function recordMemory(
  userId: string,
  question: string,
  answer: string,
  source: string,
  confidence: number
): Promise<void> {
  try {
    await memoryAccessGateway.remember(
      userId,
      userId,
      'conversation',
      { question, answer, source, status: 'answered' },
      { level: 'short', importance: 40, confidence, tags: ['local_response'] }
    );
  } catch {
    // Non-critical
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Legacy function (preserved for backward compatibility)
// ═══════════════════════════════════════════════════════════════════════════════

export async function runLynxPipelineInternal(question: string, userId: string): Promise<LynxResponse> {
  const result = await processQuery({ userId, query: question });
  return createLynxResponse({
    status: result.source === 'error' ? 'permission_denied' : 'answered',
    content: result.content,
    source: result.source === 'local' ? 'LynxResponder' : 'Agent SDK',
    confidence: result.confidence * 100,
    reasoningPath: result.metadata.enginesConsulted,
    agent: result.metadata.agent || 'router',
    permissionLevel: result.metadata.permissionsGranted ? 'user' : 'guest',
    memoryReference: null,
    intent: result.metadata.intent || 'general',
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Singleton export for UI access
// ═══════════════════════════════════════════════════════════════════════════════

class LynxPipelineService {
  async processQuery(request: PipelineQuery): Promise<PipelineResponse> {
    return processQuery(request);
  }
}

export const lynxPipeline = new LynxPipelineService();
