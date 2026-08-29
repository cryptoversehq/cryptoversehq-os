/**
 * guidanceEngine.ts - Determines if Lynx AI should show proactive guidance.
 * Based on user context, settings, and behavior patterns.
 */

import type { LynxContext } from '@/hooks/useLynxContext';

export interface LynxGuidanceSettings {
  proactiveGuidance: boolean;
  guidanceLevel: 'low' | 'medium' | 'high';
  sections: {
    trading: boolean;
    academy: boolean;
    portfolio: boolean;
  };
}

const GUIDANCE_COOLDOWNS: Record<string, number> = {};
const COOLDOWN_MS = 60000; // 1 minute between guidance messages

function getSettings(): LynxGuidanceSettings {
  try {
    const saved = localStorage.getItem('lynx_ai_settings_v1');
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        proactiveGuidance: parsed.proactiveSuggestions ?? true,
        guidanceLevel: parsed.helpLevel ?? 'medium',
        sections: parsed.guidanceSections ?? { trading: true, academy: true, portfolio: true },
      };
    }
  } catch {}
  return {
    proactiveGuidance: true,
    guidanceLevel: 'medium',
    sections: { trading: true, academy: true, portfolio: true },
  };
}

export function shouldShowGuidance(context: LynxContext): boolean {
  const settings = getSettings();

  // User disabled guidance entirely
  if (!settings.proactiveGuidance) return false;

  // Check section allowed
  if (context.page.startsWith('/trading') && !settings.sections.trading) return false;
  if (context.page.startsWith('/academy') && !settings.sections.academy) return false;
  if (context.page.startsWith('/portfolio') && !settings.sections.portfolio) return false;

  // Cooldown check
  const sectionKey = getSectionKey(context.page);
  const lastShown = GUIDANCE_COOLDOWNS[sectionKey] || 0;
  if (Date.now() - lastShown < COOLDOWN_MS) return false;

  // High guidance level — always show
  if (settings.guidanceLevel === 'high') return true;

  // Pro users with low guidance — skip
  if (context.userLevel > 10 && settings.guidanceLevel === 'low') return false;

  // Beginners always get guidance
  if (context.isBeginner) return true;

  // Behavior triggers
  if (context.winRate < 40 && context.openPositions > 0) return true;
  if (context.openPositions === 0 && context.lastTradeDaysAgo !== null && context.lastTradeDaysAgo > 7) return true;
  if (context.sessionTime > 300) return true; // Spent 5+ minutes on page

  // Medium level — occasional guidance
  if (settings.guidanceLevel === 'medium') {
    // Show about 30% of the time on medium
    return Math.random() < 0.3;
  }

  return false;
}

export function markGuidanceShown(page: string): void {
  GUIDANCE_COOLDOWNS[getSectionKey(page)] = Date.now();
}

function getSectionKey(page: string): string {
  if (page.startsWith('/trading')) return 'trading';
  if (page.startsWith('/academy')) return 'academy';
  if (page.startsWith('/portfolio')) return 'portfolio';
  if (page.startsWith('/dashboard')) return 'dashboard';
  return 'general';
}
