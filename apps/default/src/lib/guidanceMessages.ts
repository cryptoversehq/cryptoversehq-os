/**
 * guidanceMessages.ts - Context-aware guidance message templates.
 * Organized by page section and trigger condition.
 */

export interface GuidanceMessage {
  icon: string;
  text: string;
}

interface SectionMessages {
  entry: GuidanceMessage[];
  beforeTrade?: GuidanceMessage[];
  afterLoss?: GuidanceMessage[];
  afterWin?: GuidanceMessage[];
  inactive?: GuidanceMessage[];
  beginner?: GuidanceMessage[];
}

export const GUIDANCE_MESSAGES: Record<string, SectionMessages> = {
  trading: {
    entry: [
      { icon: '📊', text: 'The market can be volatile. Always set a stop loss before entering.' },
      { icon: '💡', text: 'Check the 1-hour and 4-hour timeframes before making a decision.' },
      { icon: '🦊', text: 'Lynx tip: Start with small positions to learn the market dynamics.' },
    ],
    beginner: [
      { icon: '🎓', text: 'New to trading? The Academy has a great beginner course to get you started.' },
      { icon: '⚠️', text: 'Start with 1-2x leverage until you build confidence. Low risk = longer learning.' },
      { icon: '💡', text: 'Try the demo trading first — same experience, zero risk.' },
    ],
    beforeTrade: [
      { icon: '⚠️', text: 'Remember: set your take profit and stop loss levels before entering.' },
      { icon: '🎯', text: 'A good risk-to-reward ratio is at least 1:2.' },
    ],
    afterLoss: [
      { icon: '🧘', text: 'Losses happen. Take a moment to review what went wrong.' },
      { icon: '📖', text: 'Want me to analyze your recent trades? Ask me in the chat.' },
      { icon: '💪', text: 'Every professional trader started with losses. Keep going!' },
    ],
    afterWin: [
      { icon: '🎉', text: 'Great trade! Consider documenting your strategy for next time.' },
      { icon: '📈', text: 'Your win rate is improving. Consistency is key.' },
    ],
    inactive: [
      { icon: '📚', text: 'You haven\'t traded in a while. A quick Academy refresher might help.' },
      { icon: '🔥', text: 'Markets are active right now. Ready for a practice trade?' },
      { icon: '💤', text: 'Your simulator is waiting. A 5-minute trade can teach you a lot.' },
    ],
  },

  academy: {
    entry: [
      { icon: '📚', text: 'Learning consistently is the fastest path to becoming a profitable trader.' },
      { icon: '🎯', text: 'Complete a course today to earn XP and unlock new features.' },
      { icon: '⭐', text: 'Each completed quiz brings you closer to the next level.' },
    ],
    beginner: [
      { icon: '🚀', text: 'Start with Blockchain Basics — it\'s the foundation for everything else.' },
      { icon: '🎮', text: 'The interactive lessons make learning fun. Give it a try!' },
    ],
  },

  portfolio: {
    entry: [
      { icon: '📊', text: 'Regular portfolio reviews help you spot patterns and improve.' },
      { icon: '💡', text: 'Diversification reduces risk. Consider spreading across different assets.' },
    ],
    beginner: [
      { icon: '🌱', text: 'Your portfolio is just starting. Focus on learning before growing.' },
      { icon: '📈', text: 'Small, consistent gains beat risky big bets over time.' },
    ],
  },

  dashboard: {
    entry: [
      { icon: '🦊', text: 'Welcome back! Need any help navigating CryptoVerse HQ?' },
      { icon: '📊', text: 'The trading simulator is the best place to practice without risk.' },
      { icon: '🎓', text: 'A few minutes in the Academy every day can transform your trading.' },
    ],
  },
};

/** Pick a random message from a list */
export function pickMessage(messages: GuidanceMessage[]): GuidanceMessage {
  return messages[Math.floor(Math.random() * messages.length)];
}
