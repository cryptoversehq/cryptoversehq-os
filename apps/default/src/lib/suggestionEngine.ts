/**
 * suggestionEngine.ts - Generate contextual suggestions for Lynx AI.
 * Based on current page, user data, and behavior patterns.
 */

import type { User } from '@/lib/authStore';

export interface Suggestion {
  icon: string;
  title: string;
  description: string;
  action: (navigate: (path: string) => void) => void;
}

/**
 * Generate smart suggestions based on the current page and user state.
 */
export function generateSuggestions(page: string, user: User): Suggestion[] {
  const suggestions: Suggestion[] = [];

  // Trading page suggestions
  if (page.startsWith('/trading')) {
    if (user.plan === 'free') {
      suggestions.push({
        icon: '⭐',
        title: 'Unlock Pro Features',
        description: 'Get advanced trading tools, bots, and higher limits.',
        action: (nav) => nav('/subscription'),
      });
    }
    suggestions.push({
      icon: '📊',
      title: 'New to trading?',
      description: 'Start with the Academy basics to learn safely.',
      action: (nav) => nav('/academy'),
    });
  }

  // Academy page suggestions
  if (page.startsWith('/academy')) {
    suggestions.push({
      icon: '🎯',
      title: 'Earn XP & level up!',
      description: 'Complete courses to unlock rewards and features.',
      action: (nav) => nav('/academy'),
    });
    suggestions.push({
      icon: '📈',
      title: 'Practice what you learn',
      description: 'Head to the trading simulator to apply your skills.',
      action: (nav) => nav('/trading'),
    });
  }

  // Portfolio page suggestions
  if (page.startsWith('/portfolio')) {
    suggestions.push({
      icon: '📉',
      title: 'Portfolio analysis',
      description: 'Review your performance and adjust your strategy.',
      action: (nav) => nav('/trading'),
    });
    if (user.plan === 'free') {
      suggestions.push({
        icon: '💎',
        title: 'Limited to simulator',
        description: 'Upgrade to Pro for real exchange integration.',
        action: (nav) => nav('/subscription'),
      });
    }
  }

  // Dashboard page suggestions
  if (page === '/' || page.startsWith('/dashboard')) {
    suggestions.push({
      icon: '',
      title: 'Ask Lynx AI anything!',
      description: 'I can help with trading, academy, bots, and more.',
      action: (_nav) => {
        // Open chat
        document.querySelector<HTMLButtonElement>('.lynx-button')?.click();
      },
    });
    if (user.plan === 'free') {
      suggestions.push({
        icon: '🚀',
        title: 'Ready to go Pro?',
        description: 'Unlock AI bots, copy trading, and advanced analytics.',
        action: (nav) => nav('/subscription'),
      });
    }
  }

  // Bots page suggestions
  if (page.startsWith('/bots')) {
    suggestions.push({
      icon: '🤖',
      title: 'Create your first bot',
      description: 'AI-powered trading bots work 24/7 for you.',
      action: (nav) => nav('/bots'),
    });
  }

  // Leaderboard / nations suggestions
  if (page.startsWith('/leaderboard') || page.startsWith('/nations')) {
    suggestions.push({
      icon: '🏆',
      title: 'Climb the ranks!',
      description: 'Trade more to increase your standing.',
      action: (nav) => nav('/trading'),
    });
  }

  return suggestions;
}
