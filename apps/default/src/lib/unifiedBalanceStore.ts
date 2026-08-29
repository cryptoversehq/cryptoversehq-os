/**
 * unifiedBalanceStore.ts — CryptoVerse HQ Unified Balance
 *
 * Combines CP Coins, sim balance, and exchange portfolio value into
 * a single unified balance object for display in the global header.
 *
 * CP → USD conversion rate: 100 CP = $1 (0.01 per CP, matching the
 * monetizationStore rate where $10 = 1,000 CP).
 */

import { create } from 'zustand';
import { useAuthStore } from './authStore';
import { useCpCoinsStore } from './cpCoinsStore';
import { useTradingStore } from './tradingStore';
import { useExchangeStore } from './exchangeStore';

const CP_TO_USD_RATE = 0.01;  // 100 CP = $1

export interface UnifiedBalance {
  cpBalance: number;
  simBalance: number;
  exchangeBalance: number;
  totalUsd: number;
  formatted: string;
}

interface UnifiedBalanceState {
  balance: UnifiedBalance;
  refresh: () => void;
}

export const useUnifiedBalanceStore = create<UnifiedBalanceState>((set) => ({
  balance: { cpBalance: 0, simBalance: 0, exchangeBalance: 0, totalUsd: 0, formatted: '$0' },

  refresh: () => {
    const userId = useAuthStore.getState().user?.id;
    if (!userId) {
      set({
        balance: { cpBalance: 0, simBalance: 0, exchangeBalance: 0, totalUsd: 0, formatted: '$0' },
      });
      return;
    }

    try {
      const cp = useCpCoinsStore.getState().getBalance(userId) ?? 0;
      const sim = useTradingStore.getState().balance ?? 0;
      const exchange = useExchangeStore.getState().getTotalRealBalance() ?? 0;
      const cpUsd = cp * CP_TO_USD_RATE;
      const totalUsd = cpUsd + sim + exchange;

      const formatted =
        totalUsd >= 1_000_000
          ? `$${(totalUsd / 1_000_000).toFixed(2)}M`
          : totalUsd >= 1_000
            ? `$${(totalUsd / 1_000).toFixed(1)}K`
            : `$${totalUsd.toFixed(0)}`;

      set({
        balance: { cpBalance: cp, simBalance: sim, exchangeBalance: exchange, totalUsd, formatted },
      });
    } catch {
      // silent fail — store may not be hydrated yet
    }
  },
}));

export default useUnifiedBalanceStore;
