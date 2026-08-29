import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { toast } from 'sonner';

export type ModAction = 'mute_24h' | 'mute_7d' | 'ban';
export type ModFilter = 'auto' | 'manual' | 'hybrid';

export interface ChatModConfig {
  filter: ModFilter; bannedWords: string[]; maxWarnings: number;
  warningAction: ModAction; reportSystem: boolean; admins: string[];
}

export interface UserWarning { userId: string; count: number; lastWarningAt: string; mutedUntil: string | null; banned: boolean; }

export const DEFAULT_MOD_CONFIG: ChatModConfig = {
  filter: 'hybrid',
  bannedWords: ['scam', 'phishing', 'hack', 'malware'],
  maxWarnings: 3,
  warningAction: 'mute_24h',
  reportSystem: true,
  admins: [],
};

interface State {
  configs: Record<string, ChatModConfig>; warnings: Record<string, UserWarning>;
  setConfig: (nationId: string, config: Partial<ChatModConfig>) => void;
  warnUser: (nationId: string, userId: string) => { muted: boolean; banned: boolean };
  isMuted: (nationId: string, userId: string) => boolean;
  isBanned: (nationId: string, userId: string) => boolean;
  reportMessage: (nationId: string, userId: string, message: string) => void;
  addAdmin: (nationId: string, userId: string) => void;
}

export const useNationsChatModeration = create<State>()(persist((set, get) => ({
  configs: {}, warnings: {},

  setConfig: (nationId, config) => set(s => ({
    configs: { ...s.configs, [nationId]: { ...(s.configs[nationId] ?? DEFAULT_MOD_CONFIG), ...config } },
  })),

  warnUser: (nationId, userId) => {
    const key = `${nationId}_${userId}`;
    const existing = get().warnings[key] ?? { userId, count: 0, lastWarningAt: '', mutedUntil: null, banned: false };
    if (existing.banned) return { muted: true, banned: true };

    const cfg = get().configs[nationId] ?? DEFAULT_MOD_CONFIG;
    const newCount = existing.count + 1;
    const muted = newCount >= cfg.maxWarnings;
    const mutedUntil = muted ? new Date(Date.now() + (cfg.warningAction === 'mute_24h' ? 86400000 : 604800000)).toISOString() : null;
    const banned = cfg.warningAction === 'ban' && newCount >= cfg.maxWarnings;

    const updated: UserWarning = { userId, count: newCount, lastWarningAt: new Date().toISOString(), mutedUntil, banned };
    set(s => ({ warnings: { ...s.warnings, [key]: updated } }));

    if (banned) toast.error(`🚫 User ${userId} banned from nation chat.`, { duration: 4000 });
    else if (muted) toast.warning(`🔇 User ${userId} muted (warning ${newCount}/${cfg.maxWarnings}).`, { duration: 3000 });
    else toast.info(`⚠️ User ${userId} warned (${newCount}/${cfg.maxWarnings}).`, { duration: 2000 });

    return { muted: !!mutedUntil, banned };
  },

  isMuted: (nationId, userId) => {
    const w = get().warnings[`${nationId}_${userId}`];
    if (!w?.mutedUntil) return false;
    return new Date(w.mutedUntil) > new Date();
  },

  isBanned: (nationId, userId) => {
    return get().warnings[`${nationId}_${userId}`]?.banned ?? false;
  },

  reportMessage: (nationId, userId, message) => {
    const cfg = get().configs[nationId] ?? DEFAULT_MOD_CONFIG;
    if (!cfg.reportSystem) return;
    const hasBannedWord = cfg.bannedWords.some(w => message.toLowerCase().includes(w));
    if (hasBannedWord) {
      const { muted } = get().warnUser(nationId, userId);
      toast.warning(`⚠️ Message flagged: contains prohibited content.${muted ? ' User muted.' : ''}`, { duration: 3000 });
    }
  },

  addAdmin: (nationId, userId) => set(s => ({
    configs: { ...s.configs, [nationId]: { ...(s.configs[nationId] ?? DEFAULT_MOD_CONFIG), admins: [...(s.configs[nationId]?.admins ?? []), userId] } },
  })),
}), { name: 'cv_nations_chat_mod' }));

export default useNationsChatModeration;
