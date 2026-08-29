/**
 * useXPSystem.ts
 * XP system hook: delegates to academyStore for all persistence and logic.
 */
import { useMemo, useCallback } from 'react';
import { useAcademyStore, selectLevel, selectAvailableXP, getLevelInfo } from './academyStore';

export interface XPTransaction {
  id: string;
  amount: number;
  reason: string;
  type: 'earn' | 'spend';
  timestamp: string;
}

export function useXPSystem() {
  const totalXP     = useAcademyStore(s => s.totalXP);
  const usedXP      = useAcademyStore(s => s.usedXP);
  const xpHistory   = useAcademyStore(s => s.xpHistory);
  const availableXP = useAcademyStore(selectAvailableXP);
  const level       = useAcademyStore(selectLevel);

  const spendXP = useCallback((amount: number, reason: string): boolean => {
    return useAcademyStore.getState().spendXP(amount, reason);
  }, []);

  const earnXP = useCallback((amount: number, reason: string) => {
    useAcademyStore.getState().earnXP(amount, reason);
  }, []);

  const getHistory = useCallback((filter?: 'earn' | 'spend'): XPTransaction[] => {
    const history = useAcademyStore.getState().xpHistory;
    return filter ? history.filter(h => h.type === filter) : history;
  }, []);

  const SPEND_OPTIONS = {
    moduleBadge:    { cost: 500,  label: 'Module Badge',       benefit: 'Show off your achievement' },
    eventEntry:     { cost: 200,  label: 'Special Event Entry', benefit: 'Join premium competitions' },
    botTest:        { cost: 300,  label: 'Bot Test',           benefit: 'Test a bot without CP' },
    aiMentorSession:{ cost: 100,  label: 'Lynx AI Session',  benefit: 'Get advanced trading advice' },
  };

  return {
    totalXP,
    usedXP,
    availableXP,
    level,
    spendXP,
    earnXP,
    getHistory,
    SPEND_OPTIONS,
    xpHistory,
  };
}

export default useXPSystem;
