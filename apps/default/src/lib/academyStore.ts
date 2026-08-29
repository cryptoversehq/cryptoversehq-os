import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createCloudStorage, cloudDataLayer } from './cloudData';
import { useAuthStore } from './authStore';
import { useCpCoinsStore } from './cpCoinsStore';
import { toast } from 'sonner';

/**
 * academyStore.ts — CryptoVerse HQ
 *
 * Full XP & Level system with:
 *   - Zustand persist middleware backed by CloudDataLayer
 *   - Cross-device cloud hydration and sync
 *   - earnXP / spendXP / awardXP with full transaction history
 *   - Level computed as floor(availableXP / 1000) + 1, clamped 1-10
 *   - availableXP = totalXP - usedXP
 */

interface AcademyPersisted {
  totalXP: number;
  usedXP: number;
  completedLessons: string[];
  xpHistory: Array<{ id: string; amount: number; reason: string; type: 'earn' | 'spend'; timestamp: string }>;
  quizResults: Record<string, QuizResult>;
  certificates: Certificate[];
  updatedAt: string;
}

export interface QuizResult {
  lessonId: string;
  score: number;        // 0-100 percentage
  passed: boolean;      // ≥60% to pass
  attemptedAt: string;
}

export interface Certificate {
  id: string;
  moduleName: string;
  moduleId: string;
  score: number;        // average quiz score across module
  earnedAt: string;
}

export interface XPTransaction {
  id: string;
  amount: number;
  reason: string;
  type: 'earn' | 'spend';
  timestamp: string;
}

const LEVEL_THRESHOLDS: { name: string; min: number; max: number }[] = [
  { name: 'Novice',    min: 0,    max: 1000 },
  { name: 'Apprentice', min: 1000, max: 2500 },
  { name: 'Analyst',   min: 2500, max: 5000 },
  { name: 'Pro Trader', min: 5000, max: 10000 },
  { name: 'Elite',     min: 10000, max: 20000 },
  { name: 'Master',    min: 20000, max: 35000 },
  { name: 'Grandmaster', min: 35000, max: 55000 },
  { name: 'Legend',    min: 55000, max: 80000 },
  { name: 'Mythic',    min: 80000, max: 120000 },
  { name: 'Transcendent', min: 120000, max: Infinity },
];

export function getLevelInfo(totalXP: number) {
  const availableXP = totalXP;
  const level = Math.min(10, Math.max(1, Math.floor(availableXP / 1000) + 1));
  const tier = LEVEL_THRESHOLDS[level - 1];
  const progress = tier ? Math.min(100, Math.round(((availableXP - tier.min) / (tier.max - tier.min)) * 100)) : 0;
  return { level, name: tier?.name ?? 'Novice', progress, nextAt: tier?.max ?? 1000 };
}

interface AcademyState {
  totalXP: number;
  usedXP: number;
  completedLessons: string[];
  xpHistory: XPTransaction[];
  quizResults: Record<string, QuizResult>;
  certificates: Certificate[];

  earnXP: (amount: number, reason: string) => void;
  spendXP: (amount: number, reason: string) => boolean;
  awardXP: (lessonId: string, xp: number) => void;
  hydrate: (email: string) => Promise<void>;

  /** Record a quiz attempt. Returns true if passed (≥60%). */
  submitQuiz: (lessonId: string, score: number) => QuizResult;
  /** Check if a lesson's quiz has been passed. */
  hasPassedQuiz: (lessonId: string) => boolean;
  /** Generate a certificate for a completed module. Returns certificate or null if not all quizzes passed. */
  generateCertificate: (moduleId: string, moduleName: string, lessonIds: string[]) => Certificate | null;
  /** Check if user has earned a certificate for a module. */
  hasCertificate: (moduleId: string) => boolean;
}

/** Selector helpers — use these instead of getters for computed values */
export const selectLevel = (s: AcademyState) =>
  Math.min(10, Math.max(1, Math.floor((s.totalXP - s.usedXP) / 1000) + 1));

export const selectAvailableXP = (s: AcademyState) => s.totalXP - s.usedXP;

const DEFAULT_XP      = 1250;
const DEFAULT_LESSONS = ['l1', 'l4'];
const SYNC_KEY        = 'academy';
const STORE_KEY        = 'cv-academy-store';

function currentEmail(): string | null {
  try { return useAuthStore.getState().user?.email ?? null; } catch { return null; }
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function pushSync(state: Pick<AcademyState, 'totalXP' | 'usedXP' | 'completedLessons' | 'xpHistory' | 'quizResults' | 'certificates'>) {
  const email = currentEmail();
  if (!email) return;
  void cloudDataLayer.save('academy', SYNC_KEY, {
    totalXP:          state.totalXP,
    usedXP:           state.usedXP,
    completedLessons: state.completedLessons,
    xpHistory:        state.xpHistory,
    quizResults:      state.quizResults,
    certificates:     state.certificates,
    updatedAt:        new Date().toISOString(),
  } satisfies AcademyPersisted, 'persistent', email);
}

export const useAcademyStore = create<AcademyState>()(
  persist<AcademyState>(
    (set, get) => ({
      totalXP:          DEFAULT_XP,
      usedXP:           0,
      completedLessons: DEFAULT_LESSONS,
      xpHistory:        [],
      quizResults:      {},
      certificates:     [],

      earnXP: (amount, reason) => {
        const { totalXP, xpHistory } = get();
        const tx: XPTransaction = { id: uid(), amount, reason, type: 'earn', timestamp: new Date().toISOString() };
        const updated = { totalXP: totalXP + amount, xpHistory: [tx, ...xpHistory].slice(0, 200) };
        set(updated);
        pushSync({ ...get(), ...updated });
      },

      spendXP: (amount, reason) => {
        const { totalXP, usedXP, xpHistory } = get();
        if (totalXP - usedXP < amount) return false;
        const tx: XPTransaction = { id: uid(), amount, reason, type: 'spend', timestamp: new Date().toISOString() };
        const updated = { usedXP: usedXP + amount, xpHistory: [tx, ...xpHistory].slice(0, 200) };
        set(updated);
        pushSync({ ...get(), ...updated });
        return true;
      },

      awardXP: (lessonId, xp) => {
        const { completedLessons } = get();
        if (completedLessons.includes(lessonId)) return;

        const updatedLessons = [...completedLessons, lessonId];
        set({ completedLessons: updatedLessons });

        // Earn the XP via earnXP (which records history + syncs)
        get().earnXP(xp, `Completed lesson: ${lessonId}`);

        // CP rewards for lesson completion
        const userId = useAuthStore.getState().user?.id;
        const CP_REWARD_PER_LESSON = 10;
        if (userId && lessonId) {
          try {
            const cpStore = useCpCoinsStore.getState();
            cpStore.credit({
              userId,
              amount: CP_REWARD_PER_LESSON,
              type: 'achievement_reward' as any,
              description: `Academy reward: completed lesson ${lessonId}`,
            });
            toast.success(`🎉 +${CP_REWARD_PER_LESSON} CP earned for completing lesson!`, { duration: 3000 });
          } catch (e) {
            console.error('[Academy] Failed to credit CP:', e);
          }

          // Module and all-modules completion bonuses
          const allLessons = updatedLessons;
          const cpStore = useCpCoinsStore.getState();
          if (allLessons.length > 0 && allLessons.length % 5 === 0) {
            cpStore.credit({
              userId,
              amount: 50,
              type: 'achievement_reward' as any,
              description: `Academy module reward: completed ${allLessons.length} lessons 🎓`,
            });
            toast.success(`🎓 +50 CP module bonus! ${allLessons.length} lessons completed.`, { duration: 4000 });
          }
          if (allLessons.length >= 40) {
            cpStore.credit({
              userId,
              amount: 200,
              type: 'achievement_reward' as any,
              description: 'Academy final reward: all modules completed! 🏆',
            });
            toast.success('🏆 +200 CP grand prize! All Academy modules completed!', { duration: 6000 });
          }
        }

        pushSync(get());
      },

      hydrate: async (email) => {
        if (!email) return;
        const remote = await cloudDataLayer.get<AcademyPersisted>('academy', SYNC_KEY, 'persistent', email);
        if (remote) {
          const localUpdated = get().xpHistory[0]?.timestamp ?? '0';
          const remoteUpdated = remote.updatedAt ?? '0';
          // Merge: prefer remote if newer, but keep local lessons union
          if (remoteUpdated > localUpdated) {
            set({
              totalXP:          remote.totalXP ?? DEFAULT_XP,
              usedXP:           remote.usedXP ?? 0,
              completedLessons: remote.completedLessons ?? DEFAULT_LESSONS,
              xpHistory:        remote.xpHistory ?? [],
              quizResults:      remote.quizResults ?? {},
              certificates:     remote.certificates ?? [],
            });
          } else if (remote.completedLessons) {
            // At minimum merge lesson completion
            const merged = [...new Set([...get().completedLessons, ...remote.completedLessons])];
            set({ completedLessons: merged });
          }
        }
      },

      submitQuiz: (lessonId, score) => {
        const passed = score >= 60;
        const result: QuizResult = {
          lessonId,
          score,
          passed,
          attemptedAt: new Date().toISOString(),
        };

        // Keep the best score
        const existing = get().quizResults[lessonId];
        if (existing && existing.score >= score) return existing;

        const quizResults = { ...get().quizResults, [lessonId]: result };
        set({ quizResults });

        if (passed) {
          toast.success(`✅ Quiz passed! Score: ${score}%`, { duration: 3000 });
        } else {
          toast.error(`❌ Quiz failed. Score: ${score}% (need 60%). Try again!`, { duration: 4000 });
        }

        pushSync(get());
        return result;
      },

      hasPassedQuiz: (lessonId) => {
        return get().quizResults[lessonId]?.passed ?? false;
      },

      generateCertificate: (moduleId, moduleName, lessonIds) => {
        const { quizResults, certificates } = get();

        // All lessons in module must have been passed
        const allPassed = lessonIds.every(id => quizResults[id]?.passed);
        if (!allPassed) return null;

        // Already have this certificate
        if (certificates.some(c => c.moduleId === moduleId)) {
          return certificates.find(c => c.moduleId === moduleId) ?? null;
        }

        const scores = lessonIds.map(id => quizResults[id]?.score ?? 0);
        const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

        const cert: Certificate = {
          id: `cert-${moduleId}-${Date.now().toString(36)}`,
          moduleName,
          moduleId,
          score: avgScore,
          earnedAt: new Date().toISOString(),
        };

        const updatedCerts = [...certificates, cert];
        set({ certificates: updatedCerts });

        // Bonus XP for certificate
        const CERT_XP = 500;
        get().earnXP(CERT_XP, `Certificate earned: ${moduleName}`);

        // Bonus CP coins
        const userId = useAuthStore.getState().user?.id;
        if (userId) {
          try {
            useCpCoinsStore.getState().credit({
              userId,
              amount: 100,
              type: 'achievement_reward' as any,
              description: `Certificate: ${moduleName}`,
            });
          } catch (_) { /* ignore */ }
        }

        toast.success(`🎓 Certificate earned: ${moduleName}! +${CERT_XP} XP +100 CP`, { duration: 5000 });
        pushSync(get());
        return cert;
      },

      hasCertificate: (moduleId) => {
        return get().certificates.some(c => c.moduleId === moduleId);
      },
    }),
    {
      name: STORE_KEY,
      storage: createCloudStorage<AcademyState>({ objectType: 'academy', userId: currentEmail, cachePolicy: 'persistent' }),
      partialize: (state) => ({
        totalXP:          state.totalXP,
        usedXP:           state.usedXP,
        completedLessons: state.completedLessons,
        xpHistory:        state.xpHistory.slice(0, 200),
        quizResults:      state.quizResults,
        certificates:     state.certificates,
      }),
    },
  ),
);
