/**
 * sentimentAnalyzer.ts - Analyze user sentiment from chat tone and trading behavior.
 * Used by Lynx AI to provide empathetic responses.
 */

export type UserSentiment = 'stressed' | 'confident' | 'neutral' | 'curious' | 'frustrated';

interface Trade {
  pnl: number;
  side: string;
}

/**
 * Analyze chat sentiment based on message tone.
 */
export function analyzeChatSentiment(messages: string[]): 'positive' | 'negative' | 'neutral' {
  const positiveWords = ['great', 'awesome', 'thanks', 'perfect', 'amazing', 'love', 'good', 'profit', 'won', 'gain'];
  const negativeWords = ['bad', 'loss', 'lost', 'terrible', 'worst', 'problem', 'issue', 'stuck', 'confused', 'help', 'fail', 'broke'];

  let positiveScore = 0;
  let negativeScore = 0;

  for (const msg of messages) {
    const lower = msg.toLowerCase();
    for (const word of positiveWords) {
      if (lower.includes(word)) positiveScore++;
    }
    for (const word of negativeWords) {
      if (lower.includes(word)) negativeScore++;
    }
  }

  if (negativeScore > positiveScore * 1.5) return 'negative';
  if (positiveScore > negativeScore * 1.5) return 'positive';
  return 'neutral';
}

/**
 * Analyze trading behavior sentiment.
 */
export function analyzeTradeBehavior(trades: Trade[]): 'profitable' | 'risky' | 'neutral' {
  if (trades.length === 0) return 'neutral';

  const winCount = trades.filter((t) => t.pnl > 0).length;
  const lossCount = trades.filter((t) => t.pnl < 0).length;
  const totalPnL = trades.reduce((sum, t) => sum + t.pnl, 0);

  if (lossCount > winCount * 2 || totalPnL < -100) return 'risky';
  if (winCount > lossCount && totalPnL > 0) return 'profitable';
  return 'neutral';
}

/**
 * Combine chat + trade sentiment into overall user sentiment.
 */
export function analyzeUserSentiment(
  messages: string[],
  trades: Trade[],
  sessionTime: number
): UserSentiment {
  const chatSentiment = analyzeChatSentiment(messages);
  const tradeSentiment = analyzeTradeBehavior(trades);

  if (chatSentiment === 'negative' || tradeSentiment === 'risky') {
    return 'stressed';
  }
  if (chatSentiment === 'positive' && tradeSentiment === 'profitable') {
    return 'confident';
  }
  if (sessionTime > 600 && trades.length === 0) {
    return 'curious';
  }
  return 'neutral';
}

/**
 * Get empathetic response prefix based on sentiment.
 */
export function getSentimentResponse(sentiment: UserSentiment): string | null {
  switch (sentiment) {
    case 'stressed':
      return 'I notice you might be feeling a bit stressed. Take a deep breath — I\'m here to help. ';
    case 'confident':
      return 'You\'re doing great! Keep that momentum going. ';
    case 'curious':
      return 'Great to see you exploring! Let me help you get started. ';
    case 'frustrated':
      return 'I understand it can be frustrating. Let me try to help you work through this. ';
    default:
      return null;
  }
}
