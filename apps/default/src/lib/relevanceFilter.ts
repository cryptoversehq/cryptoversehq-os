// relevanceFilter.ts — Off-topic guard for the Lynx AI chat.
//
// Keeps the assistant scoped to crypto / markets / the CryptoVerse HQ app.
// Unrelated questions are politely refused before any pipeline processing.
// (Role-based DATA access is enforced separately by permissionEngine +
// memoryAccessGateway; this module only decides topical relevance.)

const CRYPTO_TERMS = [
  'bitcoin', 'btc', 'ethereum', 'eth', 'solana', 'sol',
  'crypto', 'trading', 'trade', 'market', 'price', 'chart', 'candle',
  'wallet', 'balance', 'portfolio', 'investment', 'leverage', 'margin',
  'blockchain', 'defi', 'nft', 'token', 'coin', 'position', 'pnl', 'stop loss', 'take profit',
];

const APP_TERMS = [
  'academy', 'lesson', 'quiz', 'xp', 'level',
  'bot', 'strategy', 'copy trading', 'backtest',
  'admin', 'manage', 'settings', 'config',
  'support', 'help', 'ticket', 'payment', 'subscription', 'plan',
  'account', 'referral', 'nation', 'leaderboard', 'competition', 'event',
];

const GREETINGS = [
  'hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening',
  'thanks', 'thank you',
];

/** True when the query is crypto/market/app-related (or a simple greeting). */
export function isRelevantQuestion(query: string): boolean {
  const lower = (query || '').trim().toLowerCase();
  if (!lower) return false;

  // Allow simple greetings / thanks so the assistant can respond politely.
  if (GREETINGS.some((g) => lower === g || lower.startsWith(g + ' ') || lower.endsWith(' ' + g))) {
    return true;
  }

  const isCrypto = CRYPTO_TERMS.some((t) => lower.includes(t));
  const isApp = APP_TERMS.some((t) => lower.includes(t));
  return isCrypto || isApp;
}
