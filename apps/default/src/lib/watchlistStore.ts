import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createCloudStorage } from './cloudData';
import { useAuthStore } from './authStore';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WatchedCoin {
  coinId:      string;
  coinSymbol:  string;
  coinName:    string;
  coinColor:   string;
  basePrice:   number;     // opening price used for 24h change calc
  currentPrice:number;
  prevPrice:   number;
  change24h:   number;     // percent
  high24h:     number;
  low24h:      number;
  vol24h:      number;
  sparkline:   number[];   // last 40 prices for mini chart
}

interface WatchlistState {
  coins:       WatchedCoin[];
  collapsed:   boolean;

  addCoin:     (coin: Omit<WatchedCoin, 'prevPrice' | 'sparkline'>) => void;
  removeCoin:  (coinId: string) => void;
  hasCoin:     (coinId: string) => boolean;
  toggleCoin:  (coin: Omit<WatchedCoin, 'prevPrice' | 'sparkline'>) => void;
  moveCoin:    (coinId: string, direction: 'up' | 'down') => void;
  toggleCollapse: () => void;

  // Called every tick from Dashboard for each watched coin
  updateTick:  (coinId: string, price: number) => void;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_COINS: string[] = [
  'bitcoin', 'ethereum', 'binancecoin', 'solana', 'ripple',
];

const MAX_WATCHLIST_SIZE = 50;

// ─── Store ────────────────────────────────────────────────────────────────────

export const useWatchlistStore = create<WatchlistState>()(
  persist(
    (set, get) => ({
  coins:     [],
  collapsed: false,

  addCoin: (coin) => {
    if (get().hasCoin(coin.coinId)) return;
    if (get().coins.length >= 50) return;
    const entry: WatchedCoin = {
      ...coin,
      prevPrice: coin.currentPrice,
      sparkline: Array.from({ length: 30 }, () =>
        coin.currentPrice * (0.995 + Math.random() * 0.01),
      ),
    };
    set(s => ({ coins: [...s.coins, entry] }));
  },

  removeCoin: (coinId) => set(s => ({
    coins: s.coins.filter(c => c.coinId !== coinId),
  })),

  hasCoin: (coinId) => get().coins.some(c => c.coinId === coinId),

  toggleCoin: (coin) => {
    if (get().hasCoin(coin.coinId)) {
      get().removeCoin(coin.coinId);
    } else {
      get().addCoin(coin);
    }
  },

  moveCoin: (coinId, direction) => {
    const coins = [...get().coins];
    const idx   = coins.findIndex(c => c.coinId === coinId);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= coins.length) return;
    [coins[idx], coins[swapIdx]] = [coins[swapIdx], coins[idx]];
    set({ coins });
  },

  toggleCollapse: () => set(s => ({ collapsed: !s.collapsed })),

  updateTick: (coinId, price) => set(s => ({
    coins: s.coins.map(c => {
      if (c.coinId !== coinId) return c;
      const sparkline = [...c.sparkline.slice(-39), price];
      const change24h = ((price - c.basePrice) / c.basePrice) * 100;
      return {
        ...c,
        prevPrice:    c.currentPrice,
        currentPrice: price,
        high24h:      Math.max(c.high24h, price),
        low24h:       Math.min(c.low24h,  price),
        vol24h:       c.vol24h + price * (Math.random() * 2),
        change24h,
        sparkline,
      };
    }),
  })),
  }),
  {
    name: 'cv_watchlist_v1',
    storage: createCloudStorage<Partial<WatchlistState>>({
      objectType: 'watchlist',
      userId: () => useAuthStore.getState().user?.email ?? null,
      cachePolicy: 'persistent',
    }),
    partialize: ((state) => ({
      coins: state.coins.map(c => ({
        coinId: c.coinId,
        coinSymbol: c.coinSymbol,
        coinName: c.coinName,
        coinColor: c.coinColor,
        basePrice: c.basePrice,
        currentPrice: c.basePrice,
        prevPrice: c.basePrice,
        change24h: 0,
        high24h: c.basePrice,
        low24h: c.basePrice,
        vol24h: 0,
        sparkline: [],
      })),
      collapsed: state.collapsed,
    }) as Partial<WatchlistState>),
  },
));

// ─── Seed helper (called once from Dashboard) ─────────────────────────────────

export function seedWatchlist(
  getBasePrice: (id: string) => number,
  allCoins: { id: string; symbol: string; name: string; color: string }[],
  ids: string[] = DEFAULT_COINS,
) {
  const store = useWatchlistStore.getState();
  ids.forEach(id => {
    if (store.hasCoin(id)) return;
    const meta  = allCoins.find(c => c.id === id);
    if (!meta) return;
    const base  = getBasePrice(id);
    store.addCoin({
      coinId:       meta.id,
      coinSymbol:   meta.symbol,
      coinName:     meta.name,
      coinColor:    meta.color,
      basePrice:    base,
      currentPrice: base,
      change24h:    (Math.random() - 0.48) * 8,
      high24h:      base * 1.035,
      low24h:       base * 0.962,
      vol24h:       base * 10_000,
    });
  });
}
