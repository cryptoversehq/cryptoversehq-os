/**
 * useSectionAccess.ts
 * Section access control based on Academy XP Level.
 * Level = floor(availableXP / 1000) + 1, clamped to 1-10.
 * Uses useXPSystem() for level calculation.
 */
import { useXPSystem } from './useXPSystem';

export type SectionId = 'trading' | 'copyTrading' | 'bots' | 'marketplace' | 'events' | 'nft' | 'onChain' | 'sentiment' | 'realExchange';

export const SECTION_REQUIREMENTS: Record<SectionId, number> = {
  trading:      1,
  copyTrading:  3,
  bots:         5,
  marketplace:  5,
  events:       6,
  nft:          6,
  onChain:      7,
  sentiment:    8,
  realExchange: 10,
};

export const SECTION_LABELS: Record<SectionId, string> = {
  trading:      'Trading Simulator',
  copyTrading:  'Copy Trading',
  bots:         'Bots',
  marketplace:  'Marketplace',
  events:       'Events',
  nft:          'NFT',
  onChain:      'On-Chain Analysis',
  sentiment:    'Sentiment Analysis',
  realExchange: 'Real Exchange',
};

/** Level → XP required */
export const LEVEL_XP: Record<number, number> = {
  1: 0, 2: 1000, 3: 2000, 4: 3000, 5: 4000,
  6: 5000, 7: 6000, 8: 7000, 9: 8000, 10: 9000,
};

/** Level → unlocked features */
export const LEVEL_FEATURES: Record<number, string[]> = {
  1: ['Trading Simulator', 'Academy', 'Dashboard'],
  2: ['Copy Trading preview'],
  3: ['Copy Trading full', 'Copy history'],
  4: ['Basic bots'],
  5: ['Advanced bots', 'Marketplace', 'Strategy creator'],
  6: ['Events', 'NFT trading', 'NFT metaverse'],
  7: ['On-Chain Analysis', 'Whale tracking'],
  8: ['Sentiment Analysis', 'F&G index alerts'],
  9: ['Live Events', 'Team battles', 'Webinars'],
  10: ['Real Exchange', 'All features unlocked'],
};

export function useSectionAccess(section: SectionId): {
  allowed: boolean;
  currentLevel: number;
  requiredLevel: number;
  label: string;
  xpRequired: number;
  currentXP: number;
  progress: number;
} {
  const { level, availableXP } = useXPSystem();
  const requiredLevel = SECTION_REQUIREMENTS[section];
  const label = SECTION_LABELS[section];
  const xpRequired = LEVEL_XP[requiredLevel] ?? 0;
  const currentXP = availableXP;
  const progress = xpRequired > 0 ? Math.min(100, Math.round((currentXP / xpRequired) * 100)) : 100;

  return {
    allowed: level >= requiredLevel,
    currentLevel: level,
    requiredLevel,
    label,
    xpRequired,
    currentXP,
    progress,
  };
}

export default useSectionAccess;
