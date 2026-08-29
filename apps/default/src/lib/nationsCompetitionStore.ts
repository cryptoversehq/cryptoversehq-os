import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { toast } from 'sonner';
import { createCloudStorage } from './cloudData';
import { useAuthStore } from './authStore';

export interface NationCompetition {
  id: string; name: string; startDate: string; endDate: string;
  entryFee: number; prizePool: number;
  status: 'upcoming' | 'active' | 'completed';
  participants: { nationId: string; score: number; pnl: number; volume: number; wins: number }[];
  winner: string | null; prizeDistributed: boolean;
}

type NationId = 'alpha' | 'bull' | 'sigma' | 'bear';
const NATION_NAMES: Record<string, string> = { alpha: 'Alpha Republic', bull: 'Bull Empire', sigma: 'Sigma Order', bear: 'Bear Collective' };

interface State {
  competitions: NationCompetition[]; currentWeek: NationCompetition | null;
  generateWeekly: () => NationCompetition;
  updateScores: (id: NationId, pnl: number, volume: number, wins: number) => void;
  complete: (compId: string) => void; distributePrizes: (compId: string) => void;
  getActive: () => NationCompetition | null; getHistory: () => NationCompetition[];
}

function weekId(): string { const d = new Date(); return `c_${d.getFullYear()}w${Math.ceil(d.getDate()/7)}`; }

export const useNationsCompetitionStore = create<State>()(persist((set, get) => ({
  competitions: [], currentWeek: null,
  generateWeekly: () => {
    const now = new Date(); const end = new Date(now); end.setDate(end.getDate()+7);
    const c: NationCompetition = { id: weekId(), name: `Weekly War #${Math.ceil(now.getDate()/7)}`, startDate: now.toISOString(), endDate: end.toISOString(), entryFee: 0, prizePool: 1500, status: 'active', participants: [{ nationId: 'alpha', score:0,pnl:0,volume:0,wins:0 },{ nationId: 'bull', score:0,pnl:0,volume:0,wins:0 },{ nationId: 'sigma', score:0,pnl:0,volume:0,wins:0 },{ nationId: 'bear', score:0,pnl:0,volume:0,wins:0 }], winner: null, prizeDistributed: false };
    set(s => ({ competitions: [...s.competitions, c], currentWeek: c }));
    toast.success(`🏆 ${c.name} started!`, { duration: 4000 });
    return c;
  },
  updateScores: (id, pnl, volume, wins) => {
    const w = get().currentWeek; if (!w || w.status !== 'active') return;
    const p = w.participants.map(x => x.nationId === id ? { ...x, pnl: x.pnl+pnl, volume: x.volume+volume, wins: x.wins+wins, score: (x.pnl+pnl)*0.5 + (x.volume+volume)/100000*0.3 + (x.wins+wins)*0.2 } : x);
    const u = { ...w, participants: p };
    set(s => ({ currentWeek: u, competitions: s.competitions.map(c => c.id===u.id?u:c) }));
  },
  complete: (id) => {
    const c = get().competitions.find(x => x.id===id); if (!c || c.status !== 'active') return;
    const sorted = [...c.participants].sort((a,b) => b.score - a.score);
    const winner = sorted[0]?.nationId ?? null;
    const u: NationCompetition = { ...c, status: 'completed', winner };
    set(s => ({ currentWeek: s.currentWeek?.id===id ? null : s.currentWeek, competitions: s.competitions.map(x => x.id===id?u:x) }));
    if (winner) toast.success(`🏆 ${NATION_NAMES[winner] ?? winner} wins!`, { duration: 5000 });
  },
  distributePrizes: (id) => {
    const c = get().competitions.find(x => x.id===id); if (!c || c.prizeDistributed) return;
    const sorted = [...c.participants].sort((a,b) => b.score - a.score);
    set(s => ({ competitions: s.competitions.map(x => x.id===id ? { ...x, prizeDistributed: true } : x) }));
    toast.success(`💰 Prizes: 1st ${NATION_NAMES[sorted[0]?.nationId] ?? ''} 1000 CP, 2nd ${NATION_NAMES[sorted[1]?.nationId] ?? ''} 600 CP, 3rd ${NATION_NAMES[sorted[2]?.nationId] ?? ''} 400 CP`, { duration: 7000 });
  },
  getActive: () => get().currentWeek, getHistory: () => get().competitions.filter(c => c.status==='completed'),
}), {
  name: 'cv_nations_comp',
  storage: createCloudStorage<State>({
    objectType: 'nations_competitions',
    userId: () => useAuthStore.getState().user?.email ?? null,
    cachePolicy: 'persistent',
  }),
}));

export default useNationsCompetitionStore;
