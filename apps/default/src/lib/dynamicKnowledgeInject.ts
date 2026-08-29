/**
 * dynamicKnowledgeInject.ts — Dynamic Knowledge Injection
 * Injects live platform knowledge into Brain Fusion and Agent prompts.
 * Replaces static prompts with auto-updating knowledge context.
 * Priority 18. Integrates with LiveKnowledge + BrainFusion.
 */

import type { OrchestratorContext, EngineContract } from './lynxOrchestrator';
import { liveKnowledge } from './liveKnowledge';
import { personalityEngine } from './personalityEngine';
import { emotionalEngine } from './emotionalEngine';
import { identityEngine } from './identityEngine';
import { permissionEngine } from './permissionEngine';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface KnowledgeContext {
  platformKnowledge: string;       // Live platform stats
  personalityPrompt: string;       // Personality-driven prompt modifier
  emotionPrompt: string;           // Emotion-driven prompt modifier
  permissionContext: string;        // User's permission scope
  sections: string[];              // Accessible sections
  canView: (section: string) => boolean;
  canEdit: (section: string) => boolean;
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DynamicKnowledgeInject
// ═══════════════════════════════════════════════════════════════════════════════

class DynamicKnowledgeInject {
  private registered = false;

  /** Build a complete knowledge context for a user */
  buildContext(userId: string, query?: string): KnowledgeContext {
    // Get live platform knowledge
    const platformKnowledge = liveKnowledge.getKnowledgeSummary();

    // Get personality-driven prompt modifier
    const personalityPrompt = personalityEngine.buildSystemPrompt(userId);

    // Get emotion-driven prompt modifier
    const emotionPrompt = emotionalEngine.adaptConversation(userId);

    // Get permission context
    const identity = identityEngine.getIdentity(userId);
    const sections = identity?.capabilities || [];
    const permissionContext = identity
      ? `User role: ${identity.level}. Subscription: ${identity.subscription}. Access: ${sections.length} capabilities.`
      : 'Guest user — limited access.';

    // Permission gate functions
    const canView = (section: string) => permissionEngine.canView(userId, section);
    const canEdit = (section: string) => permissionEngine.canEdit(userId, section);

    return {
      platformKnowledge,
      personalityPrompt,
      emotionPrompt,
      permissionContext,
      sections: sections.map(c => c.toString()),
      canView,
      canEdit,
      timestamp: Date.now(),
    };
  }

  /** Generate a complete system prompt for Brain Fusion that includes all dynamic context */
  buildSystemPrompt(userId: string, additionalContext?: string): string {
    const ctx = this.buildContext(userId);
    const parts: string[] = [];

    parts.push('You are Lynx AI, the AI Operating System of CryptoVerseHQ.');
    parts.push('');

    // Personality layer
    parts.push('[Personality] ' + ctx.personalityPrompt);
    parts.push('');

    // Emotion adaptation layer
    parts.push('[Emotion] ' + ctx.emotionPrompt);
    parts.push('');

    // Permission context
    parts.push('[Permissions] ' + ctx.permissionContext);
    parts.push('');

    // Live platform data
    parts.push('[Live Platform Knowledge]');
    parts.push(ctx.platformKnowledge);
    parts.push('');

    // Additional context
    if (additionalContext) {
      parts.push('[Additional Context] ' + additionalContext);
      parts.push('');
    }

    parts.push('Use ONLY the information above to answer. Do not fabricate data. If you do not know, say so.');

    return parts.join('\n');
  }

  /** Build a complete dynamic prompt for AI responses */
  async buildPrompt(
    userId: string,
    query: string,
    context?: {
      currentSection?: string;
      conversationHistory?: string[];
      personality?: string;
      emotion?: string;
      permissions?: any;
    }
  ): Promise<string> {
    // 1. Get the base system prompt
    const systemPrompt = this.buildSystemPrompt(userId);

    // 2. Get live knowledge
    let knowledge = '';
    try {
      const live = liveKnowledge.getKnowledgeSummary();
      knowledge = live || 'Live knowledge temporarily unavailable.';
    } catch {
      knowledge = 'Live knowledge temporarily unavailable.';
    }

    // 3. Build context section
    let contextSection = '';
    if (context) {
      contextSection = `
## Context Information:
- Current Section: ${context.currentSection || 'Unknown'}
- Personality Mode: ${context.personality || 'Default'}
- Emotional State: ${context.emotion || 'Neutral'}
${context.conversationHistory ? `- Recent Conversation: ${context.conversationHistory.slice(-3).join('\n  ')}` : ''}
`;
    }

    // 4. Build the complete prompt
    return `
${systemPrompt}

## Live Platform Data:
${knowledge}

${contextSection}

## User Query:
${query}

## Instructions:
1. Be concise and helpful
2. Use the user's detected language
3. Only show data the user has permission to see
4. If you don't know something, say so clearly
5. Provide actionable, practical guidance
6. Keep responses under 200 words when possible
`;
  }

  /** Generate a condensed prompt inject for quick agent queries */
  buildQuickInject(userId: string): string {
    const ctx = this.buildContext(userId);
    return [
      ctx.permissionContext,
      liveKnowledge.getPromptInject(),
      ctx.personalityPrompt,
    ].join(' | ');
  }

  /** Update knowledge on demand */
  refresh(): void {
    liveKnowledge.updateAll();
  }

  /** Get knowledge for a specific section */
  getSectionKnowledge(section: string): any {
    return liveKnowledge.getKnowledge(section);
  }

  // ── Orchestrator ───────────────────────────────────────────────────────

  async execute(context: OrchestratorContext): Promise<void> {
    // Keep knowledge fresh — auto-refresh every 60s
    liveKnowledge.updateAll();
  }

  getOrchestratorContract(): EngineContract {
    return {
      name: 'dynamicKnowledgeInject',
      priority: 18,
      dependencies: [
        'liveKnowledge', 'personalityEngine', 'emotionalEngine',
        'identityEngine', 'permissionEngine', 'brainFusion',
        'contextEngine', 'universalMemory',
      ],
      initialize: async () => { this.registered = true; },
      execute: (ctx) => this.execute(ctx),
      shutdown: async () => { this.registered = false; },
      health: () => ({
        status: this.registered ? 'healthy' : 'degraded',
        lastRun: null, lastDuration: 0, errorCount: 0, totalRuns: 0, avgDuration: 0,
      }),
    };
  }
}

export const dynamicKnowledgeInject = new DynamicKnowledgeInject();
