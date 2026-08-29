import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createCloudStorage } from './cloudData';
import { useAuthStore } from './authStore';

export interface TwinMatch {
  id: string; opponent: string; opponentRank: number; stake: number;
  outcome: 'win' | 'loss' | 'draw'; yourScore: number; opponentScore: number;
  pnl: number; prizeEarned: number; keyFactor: string; narrative: string;
  simulatedAt: string;
}

export interface TwinConfig {
  riskLevel: 'low' | 'medium' | 'high'; preferredAssets: string[];
  strategyStyle: 'aggressive' | 'balanced' | 'conservative';
}

export const DEFAULT_TWIN_CONFIG: TwinConfig = {
  riskLevel: 'medium', preferredAssets: ['BTC', 'ETH', 'SOL'], strategyStyle: 'balanced',
};

interface State {
  matches: TwinMatch[]; eloRating: number; twinConfig: TwinConfig;
  totalWins: number; totalLosses: number; totalDraws: number; totalCPEarned: number;
  recordMatch: (match: TwinMatch) => void;
  updateConfig: (config: Partial<TwinConfig>) => void;
  getStats: () => { wins: number; losses: number; draws: number; elo: number; cp: number; winRate: number };
}

function calculateEloChange(current: number, opponent: number, outcome: 'win' | 'loss' | 'draw'): number {
  const expected = 1 / (1 + Math.pow(10, (opponent - current) / 400));
  const actual = outcome === 'win' ? 1 : outcome === 'loss' ? 0 : 0.5;
  const K = 32;
  return Math.round(K * (actual - expected));
}

export const useTwinLeagueStore = create<State>()(persist((set, get) => ({
  matches: [], eloRating: 1200, twinConfig: DEFAULT_TWIN_CONFIG,
  totalWins: 0, totalLosses: 0, totalDraws: 0, totalCPEarned: 0,

  recordMatch: (match) => {
    const { eloRating, totalWins, totalLosses, totalDraws, totalCPEarned } = get();
    const oppElo = 1000 + match.opponentRank * 5;
    const eloChange = calculateEloChange(eloRating, oppElo, match.outcome);
    
    set(s => ({
      matches: [match, ...s.matches].slice(0, 50),
      eloRating: s.eloRating + eloChange,
      totalWins: s.totalWins + (match.outcome === 'win' ? 1 : 0),
      totalLosses: s.totalLosses + (match.outcome === 'loss' ? 1 : 0),
      totalDraws: s.totalDraws + (match.outcome === 'draw' ? 1 : 0),
      totalCPEarned: s.totalCPEarned + Math.max(0, match.prizeEarned),
    }));
  },

  updateConfig: (config) => set(s => ({ twinConfig: { ...s.twinConfig, ...config } })),

  getStats: () => {
    const { totalWins, totalLosses, totalDraws, eloRating, totalCPEarned } = get();
    const total = totalWins + totalLosses + totalDraws;
    return { wins: totalWins, losses: totalLosses, draws: totalDraws, elo: eloRating, cp: totalCPEarned, winRate: total > 0 ? Math.round((totalWins / total) * 100) : 0 };
  },
}), { name: 'cv_twin_league', storage: createCloudStorage<State>({ objectType: 'twin_league', userId: () => useAuthStore.getState().user?.email ?? null, cachePolicy: 'persistent' }) }));

export default useTwinLeagueStore;
