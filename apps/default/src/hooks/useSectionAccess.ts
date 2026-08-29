import { useAcademyStore, selectLevel, selectAvailableXP } from '@/lib/academyStore';

const SECTION_LEVELS: Record<string, number> = {
  'copy-trading':     3,  // Level 3+
  'backtest':         2,  // Level 2+
  'marketplace':      2,  // Level 2+
  'bots':             4,  // Level 4+
  'on-chain':         5,  // Level 5+
  'sentiment':        3,  // Level 3+
  'nft':              2,  // Level 2+
  'events':           3,  // Level 3+
  'exchange':         7,  // Level 7+ — real funds
  'defi-advanced':    5,  // Level 5+
  'risk-management':  3,  // Level 3+
  'leverage-5x':      4,  // Level 4+
  'leverage-10x':     6,  // Level 6+
  'leverage-20x':     8,  // Level 8+
};

export function useSectionAccess(section: string) {
  const level       = useAcademyStore(selectLevel);
  const availableXP = useAcademyStore(selectAvailableXP);
  const requiredLevel = SECTION_LEVELS[section] ?? 1;
  const allowed       = level >= requiredLevel;

  const nextTierXP = (requiredLevel - 1) * 1000;
  const progress   = Math.min(100, Math.round((availableXP / Math.max(1, nextTierXP)) * 100));

  return { allowed, currentLevel: level, requiredLevel, progress };
}

export { SECTION_LEVELS };
