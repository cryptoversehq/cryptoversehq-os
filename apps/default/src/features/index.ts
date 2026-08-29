/**
 * features/index.ts — CryptoVerse HQ Features Barrel
 * Pro+ users only. All features integrate with DeepSeek API & Taskade Agents.
 */

export {
  fetchSentimentSnapshot,
  checkSentimentAlerts,
  getMoodWidgetData,
} from './socialSentimentEngine';
export type { CoinSentiment, SentimentSnapshot } from './socialSentimentEngine';

export {
  analyzeTradeInReplay,
  REPLAY_SPEEDS,
} from './tradeReplay';
export type { TradeAnalysis, ReplaySpeed } from './tradeReplay';

export {
  getDailyChallenge,
  submitPrediction,
  resolveDay,
  getLeaderboard,
} from './predictionGame';
export type { DailyChallenge } from './predictionGame';

export {
  isVoiceSupported,
  startListening,
  speak,
  parseVoiceCommand,
  voiceChat,
} from './voiceAssistant';

export {
  fetchPortfolioNews,
  getDailyDigest,
  checkBreakingNews,
} from './personalizedNews';
export type { NewsItem } from './personalizedNews';

export {
  publishPost,
  getFeed,
  likePost,
  followUser,
  getFollowing,
  getTopTraderOfWeek,
} from './socialTradingFeed';
export type { FeedPost } from './socialTradingFeed';

export {
  analyzeMood,
  analyzeTradingBehavior,
  saveMoodEntry,
  getMoodHistory,
  generatePsychologyReport,
  getCurrentMoodMeter,
} from './emotionalDetection';
export type { Mood, MoodEntry } from './emotionalDetection';

export {
  runStrategyBattle,
  addToHallOfFame,
  getHallOfFame,
  PREMADE_STRATEGIES,
} from './strategyBattle';
export type { BattleStrategy, BattleResult, HallEntry } from './strategyBattle';

export {
  journalTrade,
  addPersonalNote,
  generateMonthlyReport,
  exportJournalCSV,
  getJournalStats,
} from './autoJournal';
export type { JournalEntry } from './autoJournal';

export {
  runDebate,
  quickDebate,
  getPersonaKeys,
  PERSONAS,
} from './multiAgentDebate';
export type { DebateTurn, DebateResult } from './multiAgentDebate';
