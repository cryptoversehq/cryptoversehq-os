import { create } from 'zustand';
import { registerNotifyHandler } from './tradingStore';
import { registerBotNotifyHandler } from './botStore';
import { registerBacktestNotifyHandler } from './backtestStore';
import { registerCopyNotifyHandler } from './copyTradingStore';
import { registerOnChainNotifyHandler } from './onChainStore';
import { registerSentimentNotifyHandler } from './sentimentStore';
import { registerNftNotifyHandler } from './nftStore';
import { registerEventNotifyHandler } from './liveEventStore';
import { registerExchangeNotifyHandler } from './exchangeStore';
import { registerRecommenderNotifyHandler } from './aiRecommenderStore';

export type Theme = 'dark' | 'light';

export interface AppNotification {
  id: string;
  type: 'trade' | 'liquidation' | 'achievement' | 'system';
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
}

interface AppState {
  // Theme
  theme: Theme;
  toggleTheme: () => void;

  // Nation selection (P4-B)
  selectedNationId: string | null;
  joinNation: (nationId: string) => void;
  leaveNation: () => void;

  // Notification system (P5-D)
  notifications: AppNotification[];
  addNotification: (n: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => void;
  markAllRead: () => void;
  clearNotifications: () => void;
}

function getStoredTheme(): Theme {
  try { return (localStorage.getItem('cv_theme') as Theme) || 'light'; } catch { return 'light'; }
}

function saveTheme(theme: Theme): void {
  try { localStorage.setItem('cv_theme', theme); } catch {}
}

export const useAppStore = create<AppState>((set, get) => ({
  theme: getStoredTheme(),
  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    set({ theme: next });
    saveTheme(next);
    document.documentElement.classList.toggle('dark', next === 'dark');
  },

  selectedNationId: null,
  joinNation: (nationId) => set({ selectedNationId: nationId }),
  leaveNation: () => set({ selectedNationId: null }),

  notifications: [],
  addNotification: (n) =>
    set(state => ({
      notifications: [
        {
          ...n,
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          timestamp: Date.now(),
          read: false,
        },
        ...state.notifications,
      ].slice(0, 50),
    })),
  markAllRead: () =>
    set(state => ({
      notifications: state.notifications.map(n => ({ ...n, read: true })),
    })),
  clearNotifications: () => set({ notifications: [] }),
}));

// Wire tradingStore → appStore notification bridge (one direction, no cycle)
registerNotifyHandler((n) => useAppStore.getState().addNotification(n));

// Wire botStore → appStore notification bridge (one direction, no cycle)
registerBotNotifyHandler((n) => useAppStore.getState().addNotification(n));

// Wire backtestStore → appStore notification bridge (one direction, no cycle)
registerBacktestNotifyHandler((n) => useAppStore.getState().addNotification(n));

// Wire copyTradingStore → appStore notification bridge (one direction, no cycle)
registerCopyNotifyHandler((n) => useAppStore.getState().addNotification(n));

// Wire onChainStore → appStore notification bridge (one direction, no cycle)
registerOnChainNotifyHandler((n) => useAppStore.getState().addNotification(n));

// Wire sentimentStore → appStore notification bridge (one direction, no cycle)
registerSentimentNotifyHandler((n) => useAppStore.getState().addNotification(n));

// Wire nftStore → appStore notification bridge (one direction, no cycle)
registerNftNotifyHandler((n) => useAppStore.getState().addNotification(n));

// Wire liveEventStore → appStore notification bridge (one direction, no cycle)
registerEventNotifyHandler((n) => useAppStore.getState().addNotification(n));

// Wire exchangeStore → appStore notification bridge (one direction, no cycle)
registerExchangeNotifyHandler((n) => useAppStore.getState().addNotification(n));

// Wire aiRecommenderStore → appStore notification bridge (one direction, no cycle)
registerRecommenderNotifyHandler((n) => useAppStore.getState().addNotification(n));
