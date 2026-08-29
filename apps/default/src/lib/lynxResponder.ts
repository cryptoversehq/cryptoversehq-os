/**
 * lynxResponder.ts — Lynx AI Intelligent Response System (Unified Router)
 * THE single routing system for all Lynx AI queries.
 * Merged: 12 intent blocks (local) + 17-agent keyword classification (agentRouter).
 * Detects question topic, retrieves real personal & system data, generates AI-powered answers.
 * Role-aware: recognizes super_admin, admin, and regular user roles; blocks admin queries from regular users.
 * Practical guidance: provides step-by-step instructions for every response.
 */

import type { LynxResponse } from './lynxResponseContract';
import { useAuthStore } from './authStore';
import { lynxMemory } from './memoryEngine';
import { memoryAccessGateway } from './memoryAccessGateway';
import { identityEngine } from './identityEngine';
import { permissionEngine } from './permissionEngine';
import { knowledgePipeline } from './knowledgePipeline';
import type { AgentKey, RouteDetection } from './lynxTypes';

export type { AgentKey, RouteDetection } from './lynxTypes';

/** Detect if input text contains Persian/Arabic script characters */
function isPersianText(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Agent Definitions (merged from agentRouter)
// ═══════════════════════════════════════════════════════════════════════════════

export const AGENTS = {
  router:        { id: '01KW2C1K3R6DNRP86PVX81EZKZ', name: 'CryptoVerse HQ Router',  emoji: '🤖' },
  trading:       { id: '01KW2BMZWB2VD152NK1ZEB4VPW', name: 'Trading Expert',              emoji: '📈' },
  academy:       { id: '01KW2C1KWEHV9K4HA9AJRP7231', name: 'Academy Guide',               emoji: '🎓' },
  onchain:       { id: '01KW2C5ZDWNWXNTH98VM321BWW', name: 'On-Chain Analyst',       emoji: '⛓' },
  nft:           { id: '01KW2CB4QRRJTJC08Q0M30PFJ3', name: 'NFT & Metaverse Expert',  emoji: '🖼' },
  bot:           { id: '01KW2CEWRPF8QGXEWAFBVAAAM6', name: 'Bot Engineer',             emoji: '🤖' },
  events:        { id: '01KW2CKDG7SYEAZQX6JW3AZ7Z7', name: 'Events Director',          emoji: '🏆' },
  admin:         { id: '01KW2CSZKY8HYFJ5SZPXF7CKVA', name: 'Admin Assistant',          emoji: '🛡' },
  superAdmin:    { id: '01KW2D1YK1MAYEC8W90GSV3G8E', name: 'Super Admin',              emoji: '👑' },
  nationsOracle: { id: '01KXRAZEEG5NR4296RVFD3DE2B', name: 'Nations Oracle',          emoji: '🌍' },
  compliance:    { id: 'gen2_compliance', name: 'Compliance Officer',        emoji: '⚖️' },
  support:       { id: 'gen2_support',    name: 'Support Specialist',       emoji: '🎫' },
  marketplace:   { id: 'gen2_marketplace',name: 'Marketplace Advisor',      emoji: '🏪' },
  tournament:    { id: 'gen2_tournament', name: 'Tournament Host',          emoji: '🏟️' },
  wallet:        { id: 'gen2_wallet',     name: 'Wallet Assistant',         emoji: '👛' },
  business:      { id: 'gen2_business',   name: 'Business Intelligence',    emoji: '💼' },
  mentor:        { id: 'gen2_mentor',     name: 'AI Mentor',                emoji: '🦊' },
  brainFusion:   { id: 'gen2_brain',      name: 'Brain Fusion',             emoji: '🧠' },
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// Intent-to-Agent Mapping (merged from agentRouter INTENT_RULES)
// Maps lynxResponder block patterns to primary agent + collaboration info
// ═══════════════════════════════════════════════════════════════════════════════

interface IntentToAgent {
  blockId: string;
  agentKey: AgentKey;
  fallbackAgent: AgentKey;
  collaboratives?: AgentKey[];
  needsBrainFusion?: boolean;
  needsMemory?: boolean;
  needsPrediction?: boolean;
  needsAnalytics?: boolean;
  needsSecurity?: boolean;
}

// Maps each lynxResponder block to its primary agent (from agentRouter)
const BLOCK_TO_AGENT: IntentToAgent[] = [
  { blockId: 'identity_self',  agentKey: 'mentor',     fallbackAgent: 'router' },
  { blockId: 'identity_user',  agentKey: 'mentor',     fallbackAgent: 'router' },
  { blockId: 'section_detect', agentKey: 'router',     fallbackAgent: 'mentor' },
  { blockId: 'admin_telemetry', agentKey: 'admin',     fallbackAgent: 'superAdmin', needsSecurity: true, needsAnalytics: true },
  { blockId: 'academy_xp',     agentKey: 'academy',    fallbackAgent: 'mentor', needsMemory: true },
  { blockId: 'balance_cp',     agentKey: 'wallet',      fallbackAgent: 'support', needsMemory: true },
  { blockId: 'bots',           agentKey: 'bot',        fallbackAgent: 'trading', needsPrediction: true },
  { blockId: 'copy_trading',   agentKey: 'trading',    fallbackAgent: 'mentor', needsMemory: true },
  { blockId: 'trading_orders', agentKey: 'trading',    fallbackAgent: 'mentor', needsPrediction: true, collaboratives: ['trading', 'mentor'] },
  { blockId: 'subscription',   agentKey: 'wallet',      fallbackAgent: 'support' },
  { blockId: 'market_prices',  agentKey: 'trading',    fallbackAgent: 'onchain', needsAnalytics: true },
  { blockId: 'profit_loss',    agentKey: 'trading',    fallbackAgent: 'business', needsPrediction: true },
  { blockId: 'activity',       agentKey: 'trading',    fallbackAgent: 'mentor', needsMemory: true },
  { blockId: 'fallback',       agentKey: 'mentor',     fallbackAgent: 'router', needsBrainFusion: true },
];

// Keyword-based agent routing (from agentRouter INTENT_RULES, for queries without a specific block)
const KEYWORD_AGENT_MAP: { keywords: string[]; agentKey: AgentKey; fallback: AgentKey }[] = [
  { keywords: ['chain', 'blockchain', 'wallet address', 'transaction', 'gas', 'solidity'], agentKey: 'onchain', fallback: 'trading' },
  { keywords: ['nft', 'mint', 'metaverse', 'collectible', 'digital art', 'opensea'], agentKey: 'nft', fallback: 'marketplace' },
  { keywords: ['marketplace item', 'marketplace items'], agentKey: 'marketplace', fallback: 'bot' },
  { keywords: ['event', 'tournament', 'compete', 'arena', 'leaderboard', 'rank'], agentKey: 'tournament', fallback: 'events' },
  { keywords: ['nation', 'country', 'region', 'national'], agentKey: 'nationsOracle', fallback: 'business' },
  { keywords: ['compliance', 'regulation', 'kyc', 'aml', 'legal', 'policy'], agentKey: 'compliance', fallback: 'admin' },
  { keywords: ['help', 'support', 'issue', 'bug', 'ticket', 'contact'], agentKey: 'support', fallback: 'router' },
  { keywords: ['revenue', 'growth', 'report', 'kpi', 'metric', 'forecast'], agentKey: 'business', fallback: 'admin' },
  { keywords: ['coach', 'mentor', 'guide', 'advice', 'what should', 'how do i'], agentKey: 'mentor', fallback: 'router' },
  { keywords: ['grid', 'backtest', 'strategy backtest'], agentKey: 'bot', fallback: 'trading' },
  { keywords: ['copy trading', 'copied', 'follow trader'], agentKey: 'trading', fallback: 'mentor' },
  { keywords: ['reward', 'rewards', 'competition'], agentKey: 'events', fallback: 'mentor' },
  { keywords: ['admin', 'super admin', 'manage', 'moderate', 'ban', 'suspend', 'approve', 'system'], agentKey: 'admin', fallback: 'superAdmin' },
];

const TOPIC_KEYWORDS: Record<string, string[]> = {
  trading: ['trade', 'position', 'buy', 'sell', 'leverage', 'pnl', 'profit', 'loss', 'price', 'chart', 'order', 'market', 'معامله', 'معاملات', 'خرید', 'فروش', 'پوزیشن', 'سود', 'ضرر', 'سفارش'],
  academy: ['lesson', 'quiz', 'module', 'learn', 'study', 'course', 'xp', 'level', 'certificate', 'education', 'academy', 'درس', 'آموزش', 'یادگیری', 'سطح', 'گواهی', 'آکادمی', 'امتیاز'],
  portfolio: ['portfolio', 'balance', 'asset', 'holding', 'allocation', 'diversify', 'worth', 'value', 'equity', 'پورتفولیو', 'موجودی', 'دارایی', 'سبد', 'سرمایه'],
  cp: ['cp', 'credit', 'coin', 'token', 'cryptoverse coin', 'سکه', 'توکن', 'اعتبار'],
  subscription: ['plan', 'upgrade', 'premium', 'subscription', 'pro', 'pricing', 'اشتراک', 'طرح', 'ارتقا', 'پرمیوم'],
  users: ['user', 'account', 'active', 'inactive', 'online', 'signup', 'register', 'member', 'growth', 'how many', 'کاربر', 'کاربران', 'حساب', 'عضو', 'فعال'],
  revenue: ['revenue', 'income', 'payment', 'purchase', 'earn', 'earning', 'sales', 'money', 'درآمد', 'پرداخت', 'خرید', 'فروش', 'پول'],
  security: ['security', 'threat', 'suspicious', 'hack', 'attack', 'breach', 'vulnerability', 'safety', 'امنیت', 'حمله', 'هک', 'نفوذ', 'تهدید'],
  system: ['system', 'health', 'status', 'api', 'server', 'uptime', 'downtime', 'monitor', 'سیستم', 'وضعیت', 'سرور', 'سلامت'],
  bots: ['bot', 'auto', 'automated', 'algorithm', 'strategy bot', 'ربات', 'خودکار', 'الگوریتم', 'استراتژی'],
  exchange: ['exchange', 'binance', 'connect', 'real trade', 'api key', 'صرافی', 'بایننس', 'اتصال', 'کلید'],
  nft: ['nft', 'mint', 'metaverse', 'collectible', 'digital art', 'متاورس', 'کلکسیون', 'هنر دیجیتال'],
};

// ═══════════════════════════════════════════════════════════════════════════════
// Route Detection Result — defined in ./lynxTypes (RouteDetection)
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// LynxResponder — Unified Router
// ═══════════════════════════════════════════════════════════════════════════════

class LynxResponder {
  private buildResponse(
    content: string,
    sources: string[] = ['lynxResponder'],
    permissionLevel = 'user',
    isFallback = false,
    agentKey: AgentKey = 'mentor',
    confidence = 1.0
  ): LynxResponse {
    return {
      status: 'answered',
      content,
      source: sources.join(', '),
      confidence,
      reasoningPath: sources,
      agent: agentKey,
      permissionLevel,
      memoryReference: null,
      intent: 'question',
      timestamp: Date.now(),
      answer: content,
      isFallback,
    } as LynxResponse & { answer: string; isFallback: boolean };
  }

  isAdminQuestion(question: string): boolean {
    return /\b(users?|members?|revenue|income|security|system|admin|payments?)\b/i.test(question);
  }

  detectPersonalQuestion(question: string): boolean {
    if (isPersianText(question)) return true;
    return /\b(my|mine|i have|i own|xp|level|balance|cp)\b/i.test(question);
  }

  detectMarketQuery(question: string): boolean {
    return /\b(market|btc|eth|sol|price|trend|bitcoin|ethereum|solana|crypto)\b/i.test(question);
  }

  detectSection(question: string): string {
    return this.detectTopic(question);
  }

  async answerWithAI(question: string, userId: string): Promise<LynxResponse> {
    return this.answerQuestion(question, userId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DETECT AGENT — Unified routing for pipeline
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Detect which agent should handle this query.
   * Combines lynxResponder's 12 intent blocks + agentRouter's keyword mappings.
   * Returns a unified RouteDetection for the pipeline.
   */
  detectRoute(question: string, page?: string, role?: string): RouteDetection {
    const lower = question.toLowerCase().trim();
    const isPersian = isPersianText(question);

    // Check lynxResponder blocks (same order as answerQuestion)
    // Block 0a: AI Identity — "Your Name"
    if (isPersian ? /(اسم شما|نام شما|اسمت|نامت|اسم تو|نام تو)/i.test(question)
      : /\b(your name|what is your name|what's your name|what are you called|who are you)\b/i.test(lower)) {
      return {
        matchedBlock: 'Block 0a — AI Identity',
        matchedBlockId: 'identity_self',
        primaryAgent: 'mentor',
        fallbackAgent: 'router',
        confidence: 95,
        needsBrainFusion: false,
        needsMemory: false,
        needsPrediction: false,
        collaborativeAgents: [],
        reason: 'Query about AI identity ("your name")',
      };
    }

    // Block 0b: Personal Identity — "My Name"
    if (isPersian ? /(اسم من|نام من|من کیم|من کیستم|اسمم چیه|اسمم)/i.test(question)
      : /\b(my name|who am i|what is my name|what's my name|what do you call me|tell me my name)\b/i.test(lower)) {
      return {
        matchedBlock: 'Block 0b — User Identity',
        matchedBlockId: 'identity_user',
        primaryAgent: 'mentor',
        fallbackAgent: 'router',
        confidence: 95,
        needsBrainFusion: false,
        needsMemory: false,
        needsPrediction: false,
        collaborativeAgents: [],
        reason: 'Query about user identity ("my name")',
      };
    }

    // Block 0c: Section Detection
    if (/(کدام بخش|کجا هستم|current section|where am i|what section|کدوم بخش|بخش فعلی)/i.test(question)) {
      return {
        matchedBlock: 'Block 0c — Section Detection',
        matchedBlockId: 'section_detect',
        primaryAgent: 'router',
        fallbackAgent: 'mentor',
        confidence: 95,
        needsBrainFusion: false,
        needsMemory: false,
        needsPrediction: false,
        collaborativeAgents: [],
        reason: 'Query about current section',
      };
    }

    // Block 1: Admin Telemetry
    if (this.isAdminQuestion(lower)) {
      return {
        matchedBlock: 'Block 1 — Admin Telemetry',
        matchedBlockId: 'admin_telemetry',
        primaryAgent: 'admin',
        fallbackAgent: 'superAdmin',
        confidence: 90,
        needsBrainFusion: false,
        needsMemory: false,
        needsPrediction: false,
        collaborativeAgents: [],
        needsSecurity: true,
        needsAnalytics: true,
        reason: 'Admin/user/revenue query',
      } as RouteDetection & { needsSecurity: boolean; needsAnalytics: boolean };
    }

    // Block 2: Academy / XP
    if (isPersian && /(سطح|xp|تجربه|آکادمی|درس|دوره|پیشرفت|رتبه|کلاس|دروس|امتیاز|یادگیری|آموزش|آزمون|ماژول)/i.test(question)) {
      return {
        matchedBlock: 'Block 2 — Academy/XP (Persian)',
        matchedBlockId: 'academy_xp',
        primaryAgent: 'academy',
        fallbackAgent: 'mentor',
        confidence: 90,
        needsBrainFusion: false,
        needsMemory: true,
        needsPrediction: false,
        collaborativeAgents: [],
        reason: 'Academy/XP query (Persian)',
      };
    }
    if (/\b(level|xp|experience|academy|lesson|lessons|course|courses|quiz|progress|grade|rank|learn|learning)\b/i.test(lower)) {
      return {
        matchedBlock: 'Block 2 — Academy/XP (English)',
        matchedBlockId: 'academy_xp',
        primaryAgent: 'academy',
        fallbackAgent: 'mentor',
        confidence: 90,
        needsBrainFusion: false,
        needsMemory: true,
        needsPrediction: false,
        collaborativeAgents: [],
        reason: 'Academy/XP query (English)',
      };
    }

    // Block 3: Balance
    if (isPersian && /(موجودی|cp|کیف پول|سکه|اعتبار|پول|دارایی|ثروت|شبیه ساز|شبیه‌ساز|سیم|حساب|پورتفولیو)/i.test(question)) {
      return {
        matchedBlock: 'Block 3 — Balance (Persian)',
        matchedBlockId: 'balance_cp',
        primaryAgent: 'wallet',
        fallbackAgent: 'support',
        confidence: 90,
        needsBrainFusion: false,
        needsMemory: true,
        needsPrediction: false,
        collaborativeAgents: [],
        reason: 'Balance/wallet query (Persian)',
      };
    }
    if (/\b(balance|cp|wallet|coins?|credit|credits|funds|money|wealth|simulator|sim|worth|portfolio)\b/i.test(lower)) {
      return {
        matchedBlock: 'Block 3 — Balance (English)',
        matchedBlockId: 'balance_cp',
        primaryAgent: 'wallet',
        fallbackAgent: 'support',
        confidence: 90,
        needsBrainFusion: false,
        needsMemory: true,
        needsPrediction: false,
        collaborativeAgents: [],
        reason: 'Balance/wallet query (English)',
      };
    }

    // Block 4: Bots
    if (/\b(bots?|auto|automated|algorithm|strategy bot|explain the bot build)\b/i.test(lower)) {
      return {
        matchedBlock: 'Block 4 — Bots',
        matchedBlockId: 'bots',
        primaryAgent: 'bot',
        fallbackAgent: 'trading',
        confidence: 85,
        needsBrainFusion: false,
        needsMemory: false,
        needsPrediction: true,
        collaborativeAgents: [],
        reason: 'Bot/automation query',
      };
    }

    // Block 5: Copy Trading
    if (/\b(copy trading|copy trade|social trading|follow trader)\b/i.test(lower)) {
      return {
        matchedBlock: 'Block 5 — Copy Trading',
        matchedBlockId: 'copy_trading',
        primaryAgent: 'trading',
        fallbackAgent: 'mentor',
        confidence: 85,
        needsBrainFusion: false,
        needsMemory: true,
        needsPrediction: false,
        collaborativeAgents: [],
        reason: 'Copy trading query',
      };
    }

    // Block 6: Trading/Orders
    if (isPersian && /(معامله|معاملات|سفارش|خرید|فروش|پوزیشن|لیمیت|استاپ|معاوضه|صرافی|سیگنال|ورود|خروج|حجم|قیمت|چارت|شمع|روند|اهرم|سود|ضرر)/i.test(question)) {
      return {
        matchedBlock: 'Block 6 — Trading (Persian)',
        matchedBlockId: 'trading_orders',
        primaryAgent: 'trading',
        fallbackAgent: 'mentor',
        confidence: 85,
        needsBrainFusion: false,
        needsMemory: false,
        needsPrediction: true,
        collaborativeAgents: ['trading', 'mentor'],
        reason: 'Trading/order query (Persian)',
      };
    }
    if (/\b(trade|trades|order|buy|sell|reverse|position|leverage|margin|pnl|market|limit|stop|swap|exchange|signal|entry|exit|volume|price|chart|candle|trend|profit|loss)\b/i.test(lower)) {
      return {
        matchedBlock: 'Block 6 — Trading (English)',
        matchedBlockId: 'trading_orders',
        primaryAgent: 'trading',
        fallbackAgent: 'mentor',
        confidence: 85,
        needsBrainFusion: false,
        needsMemory: false,
        needsPrediction: true,
        collaborativeAgents: ['trading', 'mentor'],
        reason: 'Trading/order query (English)',
      };
    }

    // Block 7: Subscription
    if (/\b(subscription|plan|upgrade|pro|pro\+|premium|pricing|trial)\b/i.test(lower)) {
      return {
        matchedBlock: 'Block 7 — Subscription',
        matchedBlockId: 'subscription',
        primaryAgent: 'wallet',
        fallbackAgent: 'support',
        confidence: 85,
        needsBrainFusion: false,
        needsMemory: false,
        needsPrediction: false,
        collaborativeAgents: [],
        reason: 'Subscription/plan query',
      };
    }

    // Block 8: Market Prices
    if (this.detectMarketQuery(lower)) {
      return {
        matchedBlock: 'Block 8 — Market Prices',
        matchedBlockId: 'market_prices',
        primaryAgent: 'trading',
        fallbackAgent: 'onchain',
        confidence: 80,
        needsBrainFusion: false,
        needsMemory: false,
        needsPrediction: false,
        collaborativeAgents: [],
        needsAnalytics: true,
        reason: 'Market price query',
      } as RouteDetection & { needsAnalytics: boolean };
    }

    // Block 9: Profit/Loss
    if (isPersian ? /(\u0633\u0648\u062F|\u0632\u06CC\u0627\u0646|\u0636\u0631\u0631|\u0628\u0627\u0632\u062F\u0647|\u0639\u0645\u0644\u06A9\u0631\u062F|\u0628\u0631\u062F|pnl|p\/l)/i.test(question)
      : /\b(profit|pnl|p&l|gain|loss|performance|win rate|roi|return|earning|p\/l|how much did i make|did i make)\b/i.test(lower)) {
      return {
        matchedBlock: 'Block 9 — Profit/Loss',
        matchedBlockId: 'profit_loss',
        primaryAgent: 'trading',
        fallbackAgent: 'business',
        confidence: 85,
        needsBrainFusion: false,
        needsMemory: false,
        needsPrediction: true,
        collaborativeAgents: [],
        reason: 'Profit/loss query',
      };
    }

    // Block 10: Activity/Last Trade
    if (isPersian ? /(\u0622\u062E\u0631\u06CC\u0646|\u0627\u062E\u06CC\u0631|\u062A\u0627\u0631\u06CC\u062E\u0686\u0647|\u0641\u0639\u0627\u0644\u06CC\u062A|\u06A9\u06CC|\u0686\u0647 \u0632\u0645\u0627\u0646|\u0622\u062E\u0631\u06CC\u0646 \u0628\u0627\u0631)/i.test(question)
      : /\b(last|recent|activity|history|what did|when did|my last|latest|previous|lately)\b/i.test(lower)) {
      return {
        matchedBlock: 'Block 10 — Activity',
        matchedBlockId: 'activity',
        primaryAgent: 'trading',
        fallbackAgent: 'mentor',
        confidence: 85,
        needsBrainFusion: false,
        needsMemory: true,
        needsPrediction: false,
        collaborativeAgents: [],
        reason: 'Activity/history query',
      };
    }

    // Keyword-based agent routing (from agentRouter, for non-block queries)
    const cleanLower = lower;
    let bestKeywordScore = 0;
    let bestKeywordMatch: typeof KEYWORD_AGENT_MAP[0] | null = null;

    for (const rule of KEYWORD_AGENT_MAP) {
      const score = rule.keywords.filter(kw => cleanLower.includes(kw)).length;
      if (score > bestKeywordScore) {
        bestKeywordScore = score;
        bestKeywordMatch = rule;
      }
    }

    if (bestKeywordMatch && bestKeywordScore > 0) {
      return {
        matchedBlock: null,
        matchedBlockId: null,
        primaryAgent: bestKeywordMatch.agentKey,
        fallbackAgent: bestKeywordMatch.fallback,
        confidence: Math.min(80, 30 + bestKeywordScore * 15),
        needsBrainFusion: bestKeywordScore < 2,
        needsMemory: false,
        needsPrediction: false,
        collaborativeAgents: [],
        reason: `Keyword match (${bestKeywordScore} keywords to agent "${bestKeywordMatch.agentKey}")`,
      };
    }

    // Page-based override
    if (page) {
      if (page.startsWith('/trading') || page.startsWith('/exchange')) {
        return {
          matchedBlock: null, matchedBlockId: null,
          primaryAgent: 'trading', fallbackAgent: 'mentor',
          confidence: 70, needsBrainFusion: false, needsMemory: true,
          needsPrediction: true, collaborativeAgents: [],
          reason: 'Page context: trading/exchange',
        };
      }
      if (page.startsWith('/academy')) {
        return {
          matchedBlock: null, matchedBlockId: null,
          primaryAgent: 'academy', fallbackAgent: 'mentor',
          confidence: 70, needsBrainFusion: false, needsMemory: true,
          needsPrediction: false, collaborativeAgents: [],
          reason: 'Page context: academy',
        };
      }
      if (page.startsWith('/admin')) {
        return {
          matchedBlock: null, matchedBlockId: null,
          primaryAgent: 'admin', fallbackAgent: 'superAdmin',
          confidence: 70, needsBrainFusion: false, needsMemory: false,
          needsPrediction: false, collaborativeAgents: [],
          reason: 'Page context: admin',
        };
      }
      if (page.startsWith('/nft')) {
        return {
          matchedBlock: null, matchedBlockId: null,
          primaryAgent: 'nft', fallbackAgent: 'marketplace',
          confidence: 70, needsBrainFusion: false, needsMemory: false,
          needsPrediction: false, collaborativeAgents: [],
          reason: 'Page context: nft',
        };
      }
    }

    // Default fallback
    return {
      matchedBlock: null,
      matchedBlockId: null,
      primaryAgent: 'mentor',
      fallbackAgent: 'router',
      confidence: 30,
      needsBrainFusion: true,
      needsMemory: false,
      needsPrediction: false,
      collaborativeAgents: [],
      reason: 'No match — defaulting to mentor agent',
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ANSWER QUESTION — Main entry point (preserved, enhanced with agent info)
  // ═══════════════════════════════════════════════════════════════════════════

  async answerQuestion(question: string, userId?: string, contextSection?: string): Promise<LynxResponse> {
    const user = useAuthStore.getState().user;
    const activeUserId = userId || user?.id || 'demo_user';
    const identity = identityEngine.getIdentity(activeUserId);
    if (!identity) {
      return this.buildResponse('⛔ شناسایی کاربر امکان‌پذیر نیست.', ['identityEngine'], 'guest', false, 'access');
    }

    const auth = permissionEngine.authorize(activeUserId, 'chat', 'read');
    if (!auth.allowed) {
      return this.buildResponse('⛔ شما دسترسی به این بخش را ندارید.', ['permissionEngine'], identity.level, false, 'access');
    }

    const role = identity.level;
    const isAdmin = ['admin', 'senior_admin', 'super_admin', 'founder'].includes(role);
    const personalData = knowledgePipeline.getPersonalKnowledge(activeUserId);
    const lower = question.toLowerCase().trim();
    const isPersian = isPersianText(question);

    // ── Memory Context — Query session memory for follow-up awareness ─
    let memoryContext: string | null = null;
    let lastTopic: string | null = null;
    try {
      const sessionEvents = lynxMemory.getSessionEvents();
      // Find recent chat messages to build context
      const recentMessages = sessionEvents
        .filter((e: any) => e.type === 'CHAT_MESSAGE')
        .slice(-6); // last 3 exchanges (user+assistant pairs)

      if (recentMessages.length > 0) {
        // Build a brief memory summary
        const lastUser = recentMessages.filter((m: any) => m.role === 'user').pop();
        const lastAssistant = recentMessages.filter((m: any) => m.role === 'assistant').pop();

        if (lastUser && (lastUser as any).content) {
          memoryContext = 'Previous user question: ' + (lastUser as any).content;
          lastTopic = (lastUser as any).content;
        }
        if (lastAssistant && (lastAssistant as any).content) {
          memoryContext += ' | Previous response: ' + (lastAssistant as any).content.substring(0, 200);
        }
      }

      // Detect follow-up pronouns: "it", "آن", "این", "اون"
      const isFollowUp = /\b(it|its|it's|this|that|آن|این|اون|همون|همان)\b/i.test(question)
        && question.length < 60
        && !lastTopic;

      if (isFollowUp && lastTopic) {
        // This is a follow-up — enrich with memory context
        memoryContext = lastTopic + ' | FOLLOW-UP: ' + question;
      }
    } catch (_e) {
      // Memory unavailable, continue without context
    }

    // ── 0a. AI Identity — "Your Name" (what is YOUR name?) ────────────
    if (isPersian ? /(اسم شما|نام شما|اسمت|نامت|اسم تو|نام تو)/i.test(question)
      : /\b(your name|what is your name|what's your name|what are you called|who are you)\b/i.test(lower)) {
      const msg = isPersian
        ? `اسم من **Lynx AI** است. 🦊`
        : `My name is **Lynx AI**. 🦊`;
      return this.buildResponse(msg, ['lynxAI'], role, false, 'mentor');
    }

    // ── 0b. Personal Identity — "My Name" (what is MY name?) ──────────
    if (isPersian ? /(اسم من|نام من|من کیم|من کیستم|اسمم چیه|اسمم)/i.test(question)
      : /\b(my name|who am i|what is my name|what's my name|what do you call me|tell me my name)\b/i.test(lower)) {
      const nm = user?.displayName || 'unknown';
      const msg = isPersian
        ? `اسم شما **${nm}** است. 👋`
        : `Your name is **${nm}**. 👋`;
      return this.buildResponse(msg, ['authStore'], role, false, 'mentor');
    }

    // ── 0c. Current Section Detection ──────────────────────────────────
    if (/(کدام بخش|کجا هستم|current section|where am i|what section|کدوم بخش|بخش فعلی)/i.test(question)) {
      const section = contextSection || 'dashboard';
      const sectionNames: Record<string, string> = {
        'dashboard': 'داشبورد اصلی',
        'trading': 'شبیه‌ساز معاملات',
        'academy': 'آکادمی',
        'portfolio': 'پورتفوی',
        'wallet': 'کیف پول',
        'admin': 'پنل مدیریت',
        'bots': 'ربات‌ها',
        'nft': 'بازار NFT',
        'strategy': 'بازار استراتژی'
      };

      const name = isPersian ? sectionNames[section] || section : section;
      return this.buildResponse(
        isPersian
          ? `شما در بخش **${name}** هستید.`
          : `You are in the **${name}** section.`,
        ['router'],
        role,
        false,
        'router'
      );
    }

    // ── 1. Admin / Telemetry Queries (Persian + English) ──────────────────
    const isAdminPersian = /(مدیر|ادمین|گزارش کاربران|کاربران|تنظیمات سیستم|لاگ|امنیت|نظارت|کنترل پنل)/i.test(question);
    if (this.isAdminQuestion(lower) || isAdminPersian) {
      if (!isAdmin) {
        const denyMsg = isPersian
          ? `🔒 دسترسی ادمین لازم است: فقط مدیران پلتفرم می‌توانند اطلاعات کاربران، درآمد و امنیت را مشاهده کنند. شما در حال حاضر به عنوان یک کاربر عادی (${role}) وارد شده‌اید.\n\n💡 راهنما:\n• اگر عضو تیم هستید، از صفحه ورود ادمین وارد شوید.\n• برای مشاهده آمار شخصی خود، درباره XP، موجودی یا پورتفوی خود بپرسید!`
          : `🔒 Admin Access Required: Only platform administrators can view global user, revenue, and security telemetry. You are currently signed in as a regular user (${role}).\n\n💡 Practical Guide:\n• If you are a staff member, sign in via the Admin Login screen.\n• To view your own personal statistics, ask me about your XP, balance, or portfolio!`;
        return this.buildResponse(denyMsg, ['accessControl'], role, false, 'admin');
      }
      const appData = knowledgePipeline.getSystemKnowledge();
      const isUserQuery = /\b(users?|members?|active|growth|how many|کاربر|کاربران|فعال|رشد|چند نفر)\b/i.test(lower);
      if (isUserQuery) {
        const userMsg = isPersian
          ? `👥 آمار کاربران پلتفرم:\n- کل کاربران ثبت‌نام شده: **${appData.users.total}**\n- کاربران فعال (۷ روز): **${appData.users.active7d}**\n- اعضای فعال (۳۰ روز): **${appData.users.active30d}**\n- تفکیک طرح: رایگان (**${appData.users.plans.free}**)، پرو (**${appData.users.plans.pro}**)، پرو+ (**${appData.users.plans.pro_plus}**)\n\n💡 راهنما:\n۱. برای مدیریت نقش کاربران، **پنل ادمین → مدیریت کاربران** را باز کنید.\n۲. برای بررسی فعالیت‌های امنیتی، **گزارشات حسابرسی** را چک کنید.`
          : `👥 Platform User Telemetry:\n- Total Registered Users: **${appData.users.total}**\n- Currently Active Users (7d): **${appData.users.active7d}**\n- 30d Active Members: **${appData.users.active30d}**\n- Plan Breakdown: Free (**${appData.users.plans.free}**), Pro (**${appData.users.plans.pro}**), Pro+ (**${appData.users.plans.pro_plus}**)\n\n💡 Practical Guide:\n1. To manage user roles or promote staff members, open **Admin Portal → User Management** desk.\n2. To inspect security activity, check **Audit Logs**.`;
        return this.buildResponse(userMsg, ['knowledgePipeline.realDataConnector'], role, false, 'admin');
      }
      const isRevenueQuery = /\b(revenue|income|earnings?|sales?|money|درآمد|فروش|پرداخت|سود پلتفرم)\b/i.test(lower);
      if (isRevenueQuery) {
        const revFrag = knowledgePipeline.getRevenueKnowledge(activeUserId);
        const rev = revFrag.data;
        const revNote = revFrag.provenance.authority === 'synthetic'
          ? (isPersian ? ' (بر اساس داده‌های آزمایشی/دمو پلتفرم)' : ' (based on platform demo/seed data)')
          : '';
        const revMsg = isPersian
          ? `💰 درآمد پلتفرم (۳۰ روز):\n- کل درآمد جمع‌آوری شده: **${rev?.toLocaleString() ?? 'N/A'} CP**${revNote}\n- فروش بازار استراتژی: ۲۰٪ سهم پلتفرم فعال\n- درخواست‌های برداشت: در لحظه پایش می‌شود\n\n💡 راهنما:\n۱. برای خروجی گزارش درآمد، به **پنل ادمین → میز عملیات** بروید.\n۲. برداشت‌های در انتظار سازندگان را در **درخواست‌های پرداخت** بررسی کنید.`
          : `💰 Platform Revenue Telemetry (30d):\n- Total Revenue Collected: **${rev?.toLocaleString() ?? 'N/A'} CP**${revNote}\n- Strategy Marketplace Sales: 20% platform share active\n- Payout Requests: Monitored in real-time\n\n💡 Practical Guide:\n1. To export revenue reports or approve creator payouts, navigate to **Admin Portal → Operations Desk**.\n2. Review pending creator withdrawals under **Payout Requests**.`;
        return this.buildResponse(revMsg, ['knowledgePipeline.monetizationStore'], role, false, 'admin');
      }
    }

    // ── 2. Personal XP & Academy ──
    if (isPersian && /(سطح|xp|تجربه|آکادمی|درس|دوره|پیشرفت|رتبه|کلاس|دروس|امتیاز|یادگیری|آموزش|آزمون|ماژول)/i.test(question)) {
      const xp = personalData?.totalXP;
      const lvl = personalData?.level;
      const completedLessons = personalData?.completedLessons;
      const totalLessons = personalData?.totalLessons;
      if (xp == null || lvl == null || !Array.isArray(completedLessons) || totalLessons == null) {
        return this.buildResponse('⚠️ پیشرفت آکادمی در دسترس نیست.', ['academyStore'], role, false, 'academy');
      }
      const completedCount = completedLessons.length;

      return this.buildResponse(`شما در سطح ${lvl} هستید با ${xp.toLocaleString()} XP و ${completedCount} از ${totalLessons} درس را کامل کرده‌اید.`, ['academyStore'], role, false, 'academy');
    }

    if (/\b(level|xp|experience|academy|lesson|lessons|course|courses|quiz|progress|grade|rank|learn|learning)\b/i.test(lower)) {
      const xp = personalData?.totalXP;
      const lvl = personalData?.level;
      const completedLessons = personalData?.completedLessons;
      const totalLessons = personalData?.totalLessons;
      if (xp == null || lvl == null || !Array.isArray(completedLessons) || totalLessons == null) {
        return this.buildResponse('⚠️ Academy progress is not available.', ['academyStore'], role, false, 'academy');
      }
      const completedCount = completedLessons.length;

      return this.buildResponse(`You're at Level ${lvl} with ${xp.toLocaleString()} XP and ${completedCount} of ${totalLessons} lessons completed.`, ['academyStore'], role, false, 'academy');
    }

    // ── 3. Personal Balance & CP Coins ───────────────────────────────────────
    if (isPersian && /(موجودی|cp|کیف پول|سکه|اعتبار|پول|دارایی|ثروت|شبیه ساز|شبیه‌ساز|سیم|حساب|پورتفولیو)/i.test(question)) {
      const cpBal = personalData?.balance;
      const simBal = personalData?.simulator?.balance;
      if (cpBal == null || simBal == null) {
        return this.buildResponse('⚠️ موجودی حساب در دسترس نیست.', ['cpCoinsStore', 'tradingStore'], role, false, 'wallet');
      }

      return this.buildResponse(`موجودی شما: ${cpBal.toLocaleString()} CP و $${simBal.toLocaleString()} در شبیه‌ساز.`, ['cpCoinsStore', 'tradingStore'], role, false, 'wallet');
    }

    if (/\b(balance|cp|wallet|coins?|credit|credits|funds|money|wealth|simulator|sim|worth|portfolio)\b/i.test(lower)) {
      const cpBal = personalData?.balance;
      const simBal = personalData?.simulator?.balance;
      if (cpBal == null || simBal == null) {
        return this.buildResponse('⚠️ Account balance is not available.', ['cpCoinsStore', 'tradingStore'], role, false, 'wallet');
      }

      return this.buildResponse(`Your balance: ${cpBal.toLocaleString()} CP and $${simBal.toLocaleString()} in simulator.`, ['cpCoinsStore', 'tradingStore'], role, false, 'wallet');
    }

    // ── 4. Trading Bots & Algorithms (Persian + English) ───────────────────
    const isBotsPersian = /(ربات|ربات‌ها|اتوماتیک|خودکار|گرید|dca|مارتینگل|arbitrage|استراتژی خودکار)/i.test(question);
    const isBotEng = /\b(bots?|auto|automated|algorithm|strategy bot|explain the bot build)\b/i.test(lower);
    if (isBotEng || isBotsPersian) {
      const botCount = (personalData?.bots || []).length;
      const msg = isPersian
        ? `ربات‌های هوش مصنوعی CryptoVerse HQ به شما امکان اجرای استراتژی‌های کمی را به صورت ۲۴/۷ می‌دهند. شما در حال حاضر **${botCount} ربات فعال** دارید.\n\n💡 راهنمای عملی — چگونه یک ربات بسازیم:\n۱. از منوی بالا به بخش **ربات‌ها** بروید.\n۲. روی **ساخت ربات** کلیک کنید یا یک استراتژی آماده از **بازار** انتخاب کنید.\n۳. سرمایه اولیه مجازی و کنترل ریسک حد ضرر را تنظیم کنید.\n۴. **شروع ربات** را فعال کنید تا معاملات شبیه‌سازی خودکار شروع شود!`
        : `Automated AI Trading Bots in CryptoVerse HQ allow you to execute quantitative strategies 24/7. You currently have **${botCount} active bots deployed**.\n\n💡 Practical Guide — How to build and deploy a bot:\n1. Navigate to **Bots** from the top menu.\n2. Click **Create Bot** or pick a battle-tested strategy from the **Marketplace**.\n3. Configure your initial virtual capital allocation and stop-loss risk controls.\n4. Toggle **Start Bot** to activate automated live simulation trading!`;
      return this.buildResponse(msg, ['botStore', 'strategyStore'], role, false, 'bot');
    }

    // ── 5. Copy Trading (Persian + English) ─────────────────────────────────
    const isCopyPersian = /(کپی ترید|کپی کردن|کپی معاملات|دنبال کردن تریدر|کپی تریدینگ|استراتژی کپی)/i.test(question);
    const isCopyEng = /\b(copy trading|copy trade|social trading|follow trader)\b/i.test(lower);
    if (isCopyEng || isCopyPersian) {
      const followCount = (personalData?.copyTrading || []).length;
      const msg = isPersian
        ? `کپی تریدینگ به شما امکان می‌دهد معاملات تریدرهای برتر CryptoVerse HQ را به صورت خودکار تکرار کنید. شما در حال حاضر **${followCount} تریدر** را دنبال می‌کنید.\n\n💡 راهنمای عملی — چگونه کپی تریدینگ را شروع کنیم:\n۱. از منوی بالا به بخش **کپی تریدینگ** بروید.\n۲. تریدرهای تأییدشده را بر اساس نرخ برد، درصد بازدهی و نسبت شارپ بررسی کنید.\n۳. روی **کپی** در کارت پروفایل تریدر کلیک کنید.\n۴. حداکثر تخصیص مجازی (مثال: $۱,۰۰۰ شبیه‌ساز) و محافظت حد ضرر را تنظیم کنید تا شروع شود!`
        : `Social Copy Trading lets you automatically replicate the positions of top-ranking traders on CryptoVerse HQ. You are currently following **${followCount} traders**.\n\n💡 Practical Guide — How to start copy trading:\n1. Go to **Copy Trading** in the top navigation.\n2. Browse verified traders ranked by Win Rate, Return %, and Sharpe Ratio.\n3. Click **Copy** on a trader's profile card.\n4. Set your maximum virtual allocation (e.g., $1,000 Sim) and stop-loss protection to begin!`;
      return this.buildResponse(msg, ['copyTradingStore'], role, false, 'trading');
    }

    // ── 6. Trading & Order Execution ──────────────────────────────────────────
    if (isPersian && /(معامله|معاملات|سفارش|خرید|فروش|پوزیشن|لیمیت|استاپ|معاوضه|صرافی|سیگنال|ورود|خروج|حجم|قیمت|چارت|شمع|روند|اهرم|سود|ضرر)/i.test(question)) {
      const openPositions = personalData?.openPositions;
      const tradesCount = personalData?.totalTrades;
      if (!Array.isArray(openPositions) || tradesCount == null) {
        return this.buildResponse('⚠️ اطلاعات معاملات شما در دسترس نیست.', ['tradingStore', 'orderEngine'], role, false, 'trading');
      }
      const posCount = openPositions.length;

      if (tradesCount === 0) {
        return this.buildResponse(
          `📊 شما هنوز معامله‌ای انجام نداده‌اید. برای شروع، از نوار کناری **ترمینال معاملات** را باز کنید.`,
          ['tradingStore', 'orderEngine'],
          role,
          false,
          'trading'
        );
      }

      const winRate = personalData?.winRate;
      if (winRate == null) {
        return this.buildResponse('⚠️ نرخ برد معاملات در دسترس نیست.', ['tradingStore', 'orderEngine'], role, false, 'trading');
      }
      return this.buildResponse(`کل معاملات: ${tradesCount}، پوزیشن‌های باز: ${posCount}، نرخ برد: ${winRate}%.`, ['tradingStore', 'orderEngine'], role, false, 'trading');
    }

    if (/\b(trade|trades|order|buy|sell|reverse|position|leverage|margin|pnl|market|limit|stop|swap|exchange|signal|entry|exit|volume|price|chart|candle|trend|profit|loss)\b/i.test(lower)) {
      const openPositions = personalData?.openPositions;
      const tradesCount = personalData?.totalTrades;
      if (!Array.isArray(openPositions) || tradesCount == null) {
        return this.buildResponse('⚠️ Trading information is not available.', ['tradingStore', 'orderEngine'], role, false, 'trading');
      }
      const posCount = openPositions.length;

      if (tradesCount === 0) {
        return this.buildResponse(
          `📊 You haven't made any trades yet. Open the **Trading Terminal** from the sidebar to start.`,
          ['tradingStore', 'orderEngine'],
          role,
          false,
          'trading'
        );
      }

      const winRate = personalData?.winRate;
      if (winRate == null) {
        return this.buildResponse('⚠️ Trading win rate is not available.', ['tradingStore', 'orderEngine'], role, false, 'trading');
      }
      return this.buildResponse(`Total Trades: ${tradesCount}, Open Positions: ${posCount}, Win Rate: ${winRate}%.`, ['tradingStore', 'orderEngine'], role, false, 'trading');
    }

    // ── 7. Subscription Plans & Upgrades (Persian + English) ────────────────
    const isSubPersian = /(اشتراک|پلن|طرح|رایگان|پرو|پرومکس|پرمیوم|خرید اشتراک|تمدید|آزمایشی|ارتقا)/i.test(question);
    const isSubEng = /\b(subscription|plan|upgrade|pro|pro\+|premium|pricing|trial)\b/i.test(lower);
    if (isSubEng || isSubPersian) {
      const planName = user?.plan === 'free' ? (isPersian ? 'رایگان' : 'Free') : user?.plan === 'pro' ? 'Pro' : user?.plan === 'pro_plus' ? 'Pro+' : (user?.plan || 'Free');
      const msg = isPersian
        ? `شما در حال حاضر از طرح **"${planName}"** استفاده می‌کنید.\n\n💡 راهنمای عملی — چگونه اشتراک خود را ارتقا دهیم:\n۱. روی آیکون پروفایل در بالای صفحه کلیک کنید و **اشتراک** را انتخاب کنید.\n۲. طرح **Pro** ($۲۰/ماه یا ۲,۰۰۰ CP) یا **Pro+** ($۴۰/ماه یا ۴,۰۰۰ CP) را انتخاب کنید.\n۳. می‌توانید **۷ روز آزمایشی رایگان** را فعال کنید یا با موجودی CP یا ارز دیجیتال (NOWPayments) پرداخت کنید!`
        : `You are currently on the **"${planName}" plan**.\n\n💡 Practical Guide — How to upgrade your subscription:\n1. Click your profile icon in the top-right header and select **Subscription**.\n2. Choose **Pro** ($20/mo or 2,000 CP) or **Pro+** ($40/mo or 4,000 CP).\n3. You can activate a **7-day Free Trial** or pay instantly using your CP Coin balance or crypto (NOWPayments)!`;
      return this.buildResponse(msg, ['subscriptionStore', 'authStore'], role, false, 'wallet');
    }

    // ── 8. Live Market Prices & Analysis (Persian + English) ────────────────
    const isMarketPersian = /(قیمت|بازار|بیت‌کوین|بیت کوین|اتریوم|سولانا|کاردانو|رمزارز|ارز دیجیتال|قیمت بازار|قیمت لحظه‌ای|تحلیل بازار|ارزش|نرخ)/i.test(question);
    if (this.detectMarketQuery(lower) || isMarketPersian) {
      const btc = knowledgePipeline.getMarketPrice('bitcoin');
      const eth = knowledgePipeline.getMarketPrice('ethereum');
      const sol = knowledgePipeline.getMarketPrice('solana');
      const marketAvailable = btc !== null || eth !== null || sol !== null;
      if (!marketAvailable) {
        const unavailMsg = isPersian
          ? `📈 قیمت‌های لحظه‌ای بازار در حال حاضر در دسترس نیست.`
          : `📈 Live market prices are currently unavailable. Please check the Trading Terminal later.`;
        return this.buildResponse(unavailMsg, ['knowledgePipeline.globalPriceEngine'], role, false, 'trading');
      }
      const btcStr = btc !== null ? `$${btc.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'N/A';
      const ethStr = eth !== null ? `$${eth.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'N/A';
      const solStr = sol !== null ? `$${sol.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'N/A';

      const msg = isPersian
        ? `📈 قیمت‌های لحظه‌ای بازار:\n- **بیت‌کوین (BTC):** ${btcStr}\n- **اتریوم (ETH):** ${ethStr}\n- **سولانا (SOL):** ${solStr}\n\n💡 راهنما:\n۱. برای نمودارهای شمعی و عمق بازار، **ترمینال معاملات** را باز کنید.\n۲. برای شاخص احساسات بازار و ترس و طمع، به **تحلیل احساسات** مراجعه کنید.`
        : `📈 Live Crypto Market Pulse:\n- **Bitcoin (BTC):** ${btcStr}\n- **Ethereum (ETH):** ${ethStr}\n- **Solana (SOL):** ${solStr}\n\n💡 Practical Guide:\n1. For detailed candlestick charts and order book depth, open the **Trading Terminal**.\n2. To check real-time market sentiment and Fear & Greed index, visit **Sentiment Analysis**.`;
      return this.buildResponse(msg, ['knowledgePipeline.globalPriceEngine'], role, false, 'trading');
    }

    // ── 9. Profit / Loss & Performance ───────────────────────────────
    if (isPersian ? /(\u0633\u0648\u062F|\u0632\u06CC\u0627\u0646|\u0636\u0631\u0631|\u0628\u0627\u0632\u062F\u0647|\u0639\u0645\u0644\u06A9\u0631\u062F|\u0628\u0631\u062F|pnl|p\/l)/i.test(question)
      : /\b(profit|pnl|p&l|gain|loss|performance|win rate|roi|return|earning|p\/l|how much did i make|did i make)\b/i.test(lower)) {
      const winRate = personalData?.winRate;
      const totalTrades = personalData?.totalTrades;
      const history = personalData?.simulator?.history;
      if (winRate == null || totalTrades == null || !Array.isArray(history)) {
        return this.buildResponse(isPersian ? '⚠️ اطلاعات سود و زیان در دسترس نیست.' : '⚠️ Profit and loss data is not available.', ['tradingStore'], role, false, 'trading');
      }

      if (totalTrades === 0) {
        const msg = isPersian
          ? `📊 شما هنوز معامله‌ای انجام نداده‌اید. برای شروع، از نوار کناری **ترمینال معاملات** را باز کنید.`
          : `📊 You haven't made any trades yet. Open the **Trading Terminal** from the sidebar to start.`;
        return this.buildResponse(msg, ['tradingStore'], role, false, 'trading');
      }

      if (history.length === 0 || history.some((trade: { pnl?: number }) => typeof trade.pnl !== 'number')) {
        return this.buildResponse(isPersian ? '⚠️ اطلاعات سود و زیان در دسترس نیست.' : '⚠️ Profit and loss data is not available.', ['tradingStore'], role, false, 'trading');
      }
      const pnl = history.reduce((sum: number, trade: { pnl: number }) => sum + trade.pnl, 0);

      const emoji = pnl >= 0 ? '📈' : '📉';
      const pnlLabel = pnl >= 0 ? (isPersian ? 'سود' : 'Profit') : (isPersian ? 'زیان' : 'Loss');
      const msg = isPersian
        ? `${emoji} **${pnlLabel}:** $${Math.abs(pnl).toLocaleString(undefined, { minimumFractionDigits: 2 })}\n🎯 نرخ برد: **${winRate}%**\n📊 کل معاملات: **${totalTrades}**`
        : `${emoji} **${pnlLabel}:** $${Math.abs(pnl).toLocaleString(undefined, { minimumFractionDigits: 2 })}\n🎯 Win Rate: **${winRate}%**\n📊 Total Trades: **${totalTrades}**`;

      return this.buildResponse(msg, ['tradingStore'], role, false, 'trading');
    }

    // ── 10. Activity & Last Trade ───────────────────────────────────
    if (isPersian ? /(\u0622\u062E\u0631\u06CC\u0646|\u0627\u062E\u06CC\u0631|\u062A\u0627\u0631\u06CC\u062E\u0686\u0647|\u0641\u0639\u0627\u0644\u06CC\u062A|\u06A9\u06CC|\u0686\u0647 \u0632\u0645\u0627\u0646|\u0622\u062E\u0631\u06CC\u0646 \u0628\u0627\u0631)/i.test(question)
      : /\b(last|recent|activity|history|what did|when did|my last|latest|previous|lately)\b/i.test(lower)) {
      const history = (personalData?.simulator?.history || []) as Array<{ action?: string; symbol?: string; pnl?: number; quantity?: number; price?: number; timestamp?: string; openedAt?: string }>;
      const lastTrade = history.length > 0 ? history[history.length - 1] : null;

      if (!lastTrade) {
        const msg = isPersian
          ? `📋 شما هنوز هیچ فعالیت معاملاتی ثبت‌شده‌ای ندارید. برای شروع، از نوار کناری **ترمینال معاملات** را باز کنید.`
          : `📋 You have no recorded trading activity. Open the **Trading Terminal** from the sidebar to start.`;
        return this.buildResponse(msg, ['tradingStore'], role, false, 'trading');
      }

      if (typeof lastTrade.quantity !== 'number' || typeof lastTrade.price !== 'number' || typeof lastTrade.pnl !== 'number' || !lastTrade.symbol) {
        return this.buildResponse(isPersian ? '⚠️ جزئیات آخرین فعالیت معاملاتی در دسترس نیست.' : '⚠️ Last trade details are not available.', ['tradingStore'], role, false, 'trading');
      }

      const action = lastTrade.action === 'close' ? (isPersian ? 'بسته‌شده' : 'Closed') : (isPersian ? 'بازشده' : 'Opened');
      const symbol = lastTrade.symbol;
      const qty = lastTrade.quantity.toFixed(4);
      const price = lastTrade.price.toFixed(2);
      const pnl = lastTrade.pnl;
      const pnlStr = lastTrade.action === 'close' ? ` | ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}` : '';

      const msg = isPersian
        ? `📋 **آخرین فعالیت شما:**\n🔄 ${action}: ${qty} ${symbol} @ $${price}${pnlStr}\n📊 کل معاملات: **${history.length}**`
        : `📋 **Your Last Activity:**\n🔄 ${action}: ${qty} ${symbol} @ $${price}${pnlStr}\n📊 Total Trades: **${history.length}**`;

      return this.buildResponse(msg, ['tradingStore'], role, false, 'trading');
    }

    // ── 11. Intelligent Default Response (Fallback) ──────────────────
    const name = user?.displayName || 'Trader';
    const plan = user?.plan || 'free';
    const bal = personalData?.balance == null ? (isPersian ? 'در دسترس نیست' : 'unavailable') : `${personalData.balance.toLocaleString()} CP`;
    const xp = personalData?.totalXP == null ? (isPersian ? 'در دسترس نیست' : 'unavailable') : personalData.totalXP.toLocaleString();
    const dmsg = isPersian
      ? `سلام ${name}! من **Lynx AI** هستم، مربی هوشمند CryptoVerse HQ. من مستقیماً به حساب شما متصل هستم (**طرح:** ${plan} | **موجودی CP:** ${bal} | **XP:** ${xp} XP).\n\n💡 راهنما:\n• **برای تمرین معامله:** از نوار کناری **ترمینال معاملات** را باز کنید.\n• **برای ارتقای سطح:** به **آکادمی** برای درس‌ها و آزمون‌های تعاملی بروید.\n• **برای خودکارسازی استراتژی:** **بازار استراتژی** و **ربات‌ها** را کاوش کنید.\n• **برای مدیریت سرمایه:** **کیف پول** خود را بررسی کنید.`
      : `Hello ${name}! I am **Lynx AI**, your CryptoVerse HQ smart coach. I am connected directly to your account state (**Plan:** ${plan} | **CP Balance:** ${bal} | **XP:** ${xp} XP).\n\n💡 Practical Guide — Where to go next:\n• **To practice trading:** Open the **Trading Terminal** from the sidebar.\n• **To level up:** Visit **Academy** for interactive lessons and quizzes.\n• **To automate strategies:** Explore the **Strategy Marketplace** and **Bots**.\n• **To manage funds:** Check your **Wallet** from the header.`;

    // Record in memory (async, fire-and-forget)
    this.recordToMemory(activeUserId, question, dmsg, 'fallback').catch(() => {});

    return this.buildResponse(dmsg, ['lynxResponder'], role, true, 'mentor', 0.3);
  }

  /** Record a question-answer pair via the canonical memory gateway (async, non-blocking) */
  private async recordToMemory(userId: string, query: string, response: string, source: string): Promise<void> {
    try {
      // Private memory writes go through memoryAccessGateway — no direct
      // universalMemory / memoryEngine write; identity + isolation + permission
      // are enforced at the gateway boundary.
      memoryAccessGateway.remember(userId, userId, 'conversation', {
        question: query,
        answer: response,
        source,
      }, { level: 'short', importance: 40, tags: ['chat', source] });
    } catch {
      // Non-critical: memory recording failure should not break chat
    }
  }

  detectTopic(question: string): string {
    const lower = question.toLowerCase();
    for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
      if (keywords.some(kw => lower.includes(kw))) return topic;
    }
    return 'general';
  }
}

export const lynxResponder = new LynxResponder();

// ═══════════════════════════════════════════════════════════════════════════════
// Re-export for backward compatibility with agentRouter consumers
// ═══════════════════════════════════════════════════════════════════════════════

export function detectRoute(question: string, page?: string, role?: string): RouteDetection {
  return lynxResponder.detectRoute(question, page, role);
}
