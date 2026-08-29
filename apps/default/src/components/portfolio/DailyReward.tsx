import React, { useState, useEffect } from 'react';
import { Gift, Star, Zap, Calendar, Clock, CheckCircle2, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCpCoinsStore } from '@/lib/cpCoinsStore';
import { useAuthStore } from '@/lib/authStore';
import { toast } from 'sonner';

// ── Reward structure ──────────────────────────────────────────────────────────

const DAILY_REWARDS = [
  { day: 1, reward: 5,   emoji: '🌱' },
  { day: 2, reward: 10,  emoji: '🌟' },
  { day: 3, reward: 15,  emoji: '⭐' },
  { day: 4, reward: 20,  emoji: '💫' },
  { day: 5, reward: 25,  emoji: '🔥' },
  { day: 6, reward: 30,  emoji: '⚡' },
  { day: 7, reward: 50,  emoji: '🎉' }, // 7th day special reward
];

const STORAGE_KEY_LAST  = 'cv_daily_reward_last';
const STORAGE_KEY_STREAK = 'cv_daily_reward_streak';

interface DailyRewardProps {
  className?: string;
}

export function DailyReward({ className }: DailyRewardProps) {
  const { user } = useAuthStore();
  const credit = useCpCoinsStore(s => s.credit);
  const [streak, setStreak] = useState(() => {
    try { return parseInt(localStorage.getItem(STORAGE_KEY_STREAK) || '0', 10); } catch { return 0; }
  });
  const [lastClaim, setLastClaim] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY_LAST) || ''; } catch { return ''; }
  });
  const [justClaimed, setJustClaimed] = useState(false);

  const today = new Date().toDateString();
  const alreadyClaimedToday = lastClaim === today;

  // Check if streak is still valid (missed a day)
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  const streakBroken = !alreadyClaimedToday && lastClaim !== '' && lastClaim !== yesterday;

  // If streak broken, reset on next claim (handled in claim function)

  const canClaim = !alreadyClaimedToday;
  const nextDayIndex = streakBroken ? 0 : (streak % 7);
  const rewardIndex = Math.min(nextDayIndex, 6);
  const currentReward = DAILY_REWARDS[rewardIndex];

  const handleClaim = () => {
    if (!canClaim || !user) {
      toast.error(alreadyClaimedToday ? "You've already received your reward today!" : 'Please log in first.');
      return;
    }

    // Determine new streak
    const isConsecutive = lastClaim && new Date(lastClaim).toDateString() === yesterday;
    const newStreak = streakBroken ? 1 : (isConsecutive ? streak + 1 : 1);

    // Calculate reward
    const claimRewardIndex = Math.min(newStreak - 1, 6);
    const reward = DAILY_REWARDS[claimRewardIndex].reward;

    // Credit CP
    credit({
      userId: user.id,
      amount: reward,
      type: 'daily_reward' as any,
      description: `Daily reward — day ${newStreak}`,
    });

    // Persist
    localStorage.setItem(STORAGE_KEY_LAST, today);
    localStorage.setItem(STORAGE_KEY_STREAK, newStreak.toString());

    setStreak(newStreak);
    setLastClaim(today);
    setJustClaimed(true);
    setTimeout(() => setJustClaimed(false), 3000);

    toast.success(`🎉 You received ${reward} CP! (day ${newStreak})`);
  };

  return (
    <div className={cn('bg-card border border-white/5 rounded-2xl p-5 shadow-lg', className)}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Gift className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Daily Reward</h3>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3" />
          Streak: <span className="font-bold text-amber-400">{streakBroken ? 0 : streak} day{streak !== 1 ? 's' : ''}</span>
        </span>
      </div>

      {/* Reward grid */}
      <div className="grid grid-cols-7 gap-1.5 mb-4">
        {DAILY_REWARDS.map((r, idx) => {
          const isActive = idx === (streakBroken ? 0 : (streak % 7)) && canClaim;
          const isPast = idx < (streakBroken ? 0 : (streak % 7)) || (alreadyClaimedToday && idx <= ((streak - 1) % 7));
          const isCurrentDay = idx === (streakBroken ? 0 : (streak % 7));
          return (
            <div
              key={r.day}
              className={cn(
                'flex flex-col items-center gap-1 py-2 px-1 rounded-xl text-center transition-all',
                isPast && !alreadyClaimedToday && 'opacity-30',
                alreadyClaimedToday && isPast && 'opacity-40',
                alreadyClaimedToday && isCurrentDay && 'border border-green-500/30 bg-green-500/10',
                isActive && 'border border-amber-500/30 bg-amber-500/10 animate-pulse',
                !isActive && !isPast && !alreadyClaimedToday && 'border border-white/5 bg-secondary/20',
                alreadyClaimedToday && !isPast && 'border border-white/5 bg-secondary/20',
              )}
            >
              <span className="text-lg">{r.emoji}</span>
              <span className="text-[10px] font-bold font-mono">+{r.reward}</span>
              <span className="text-[9px] text-muted-foreground">D{r.day}</span>
            </div>
          );
        })}
      </div>

      {/* Claim button */}
      <button
        onClick={handleClaim}
        disabled={!canClaim || !user}
        className={cn(
          'w-full py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2',
          justClaimed
            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
            : canClaim && user
              ? 'bg-amber-500/15 text-amber-400 border border-amber-500/25 hover:bg-amber-500/25'
              : 'bg-secondary/30 text-muted-foreground border border-white/5 cursor-not-allowed',
        )}
      >
        {justClaimed ? (
          <><CheckCircle2 className="h-4 w-4" /> Claimed! +{currentReward?.reward ?? 0} CP</>
        ) : alreadyClaimedToday ? (
          <><Lock className="h-4 w-4" /> Claimed — come back tomorrow</>
        ) : (
          <><Gift className="h-4 w-4" /> Claim {currentReward?.reward ?? 0} CP</>
        )}
      </button>
    </div>
  );
}

export default DailyReward;
