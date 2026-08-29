import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createCloudStorage } from './cloudData';
import { useAuthStore } from './authStore';

export type TradingLevel = 'simple' | 'pro' | 'proplus';

interface TradingLevelState {
  level: TradingLevel;
  setLevel: (l: TradingLevel) => void;
  selectedTimeframe: string;
  setTimeframe: (tf: string) => void;
  indicators: string[];
  toggleIndicator: (id: string) => void;
  schoolOpen: boolean;
  setSchoolOpen: (v: boolean) => void;
  schoolDismissed: boolean;
  setSchoolDismissed: (v: boolean) => void;
  watchlist: string[];
  toggleWatchlist: (id: string) => void;
}

export const useTradingLevelStore = create<TradingLevelState>()(
  persist(
    (set, get) => ({
      level: 'pro' as TradingLevel,
      setLevel: (level) => set({ level }),
      selectedTimeframe: '1h',
      setTimeframe: (selectedTimeframe) => set({ selectedTimeframe }),
      indicators: ['SMA20', 'Volume'],
      toggleIndicator: (id) => {
        const cur = get().indicators;
        set({ indicators: cur.includes(id) ? cur.filter(i => i !== id) : [...cur, id] });
      },
      schoolOpen: true,
      setSchoolOpen: (schoolOpen) => set({ schoolOpen }),
      schoolDismissed: false,
      setSchoolDismissed: (schoolDismissed) => set({ schoolDismissed }),
      watchlist: ['bitcoin', 'ethereum', 'solana', 'binancecoin'],
      toggleWatchlist: (id) => {
        const cur = get().watchlist;
        set({ watchlist: cur.includes(id) ? cur.filter(w => w !== id) : [...cur, id] });
      },
    }),
    {
      name: 'cv_trading_settings_v2',
      storage: createCloudStorage<TradingLevelState>({
        objectType: 'trading_settings',
        userId: () => useAuthStore.getState().user?.email ?? null,
        cachePolicy: 'persistent',
      }),
    },
  ),
);
