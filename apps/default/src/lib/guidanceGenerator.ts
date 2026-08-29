/**
 * guidanceGenerator.ts - Generate context-aware guidance messages.
 * Uses templates from guidanceMessages, prioritized by trigger condition.
 */

import type { LynxContext } from '@/hooks/useLynxContext';
import { shouldShowGuidance, markGuidanceShown } from './guidanceEngine';
import { GUIDANCE_MESSAGES, pickMessage, type GuidanceMessage } from './guidanceMessages';

export type { GuidanceMessage } from './guidanceMessages';

export function generateGuidance(context: LynxContext): GuidanceMessage | null {
  if (!shouldShowGuidance(context)) return null;

  const section = getSection(context.page);
  const msgs = GUIDANCE_MESSAGES[section];
  if (!msgs) return null;

  // Priority order: beginner > afterLoss > afterWin > inactive > beforeTrade > entry
  if (msgs.beginner && context.isBeginner && Math.random() < 0.4) {
    markGuidanceShown(context.page);
    return pickMessage(msgs.beginner);
  }

  // After a loss (win rate < 40%)
  if (msgs.afterLoss && context.winRate < 40 && context.openPositions > 0 && Math.random() < 0.5) {
    markGuidanceShown(context.page);
    return pickMessage(msgs.afterLoss);
  }

  // After wins (win rate > 60%)
  if (msgs.afterWin && context.winRate > 60 && Math.random() < 0.5) {
    markGuidanceShown(context.page);
    return pickMessage(msgs.afterWin);
  }

  // Inactive trader (no positions, last trade > 7 days)
  if (msgs.inactive && context.openPositions === 0 && context.lastTradeDaysAgo !== null && context.lastTradeDaysAgo > 7 && Math.random() < 0.5) {
    markGuidanceShown(context.page);
    return pickMessage(msgs.inactive);
  }

  // Before trade suggestion
  if (msgs.beforeTrade && context.openPositions === 0 && Math.random() < 0.3) {
    markGuidanceShown(context.page);
    return pickMessage(msgs.beforeTrade);
  }

  // Default entry message
  markGuidanceShown(context.page);
  return pickMessage(msgs.entry);
}

function getSection(page: string): string {
  if (page.startsWith('/trading')) return 'trading';
  if (page.startsWith('/academy')) return 'academy';
  if (page.startsWith('/portfolio')) return 'portfolio';
  if (page.startsWith('/dashboard')) return 'dashboard';
  return 'dashboard';
}
