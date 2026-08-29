import { useEffect } from 'react';
import { useAuthStore }         from './authStore';
import { useAppStore }          from './appStore';
import { useSubscriptionStore } from './subscriptionStore';
import { lynxOrchestrator } from './lynxOrchestrator';

const CHECK_INTERVAL_MS = 60_000; // check every 60 seconds
const GRACE_PERIOD_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

const isExpired = (expiresAt: number | string) => {
  const timeMs = typeof expiresAt === 'string' ? new Date(expiresAt).getTime() : expiresAt;
  return Date.now() > timeMs + GRACE_PERIOD_MS;
};

/**
 * Warning milestones — each fires exactly once per subscription cycle.
 * Add new entries here to add more thresholds; no other file needs changing.
 */
const MILESTONES = [
  {
    key:      '5d' as const,
    daysLeft: 5,
    title:    (planLabel: string) => `🔔 ${planLabel} Plan Expiring Soon`,
    message:  (daysLeft: number, planLabel: string) =>
      `Your ${planLabel} plan expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}. ` +
      `Renew now to keep your premium access and avoid interruption.`,
  },
  {
    key:      '3d' as const,
    daysLeft: 3,
    title:    (planLabel: string) => `⏰ Last Chance — ${planLabel} Expires in 3 Days`,
    message:  (_daysLeft: number, planLabel: string) =>
      `Your ${planLabel} subscription ends in just 3 days. ` +
      `Head to your Profile → Subscription Plans and renew before you lose access.`,
  },
] as const;

/**
 * Mount this once in App.tsx (inside the authenticated branch).
 * It monitors the active user's subscription and:
 *  1. Downgrades to "free" when subscription expires
 *  2. Fires a 5-day renewal warning (once per cycle)
 *  3. Fires a 3-day urgent warning (once per cycle, independent of the 5-day one)
 */
export function useSubscriptionMonitor() {
  const user          = useAuthStore(s => s.user);
  const updateProfile = useAuthStore(s => s.updateProfile);
  const addNotification = useAppStore(s => s.addNotification);
  const { getActiveSubscription, markWarningSent, hasWarningSent } =
    useSubscriptionStore();

  useEffect(() => {
    if (!user) return;

    const check = () => {
      const userId = user.id;
      const sub    = getActiveSubscription(userId);

      // ── 1. Expiry: auto-downgrade to free (with 3-day grace period) ─────
      if (sub && isExpired(sub.expiresAt) && user.plan !== 'free') {
        updateProfile({ plan: 'free', planExpiry: undefined });
        addNotification({
          type:    'system',
          title:   '⚠️ Subscription Expired',
          message: `Your ${sub.planId} plan and 3-day grace period have expired. You've been moved to the free plan. Renew anytime to restore your access.`,
        });
        return;
      }

      if (!sub || isExpired(sub.expiresAt)) return;

      // ── 2. Milestone warnings — each fires independently, exactly once ──
      const planLabel = sub.planId.charAt(0).toUpperCase() + sub.planId.slice(1);

      for (const milestone of MILESTONES) {
        if (
          sub.daysLeft <= milestone.daysLeft &&
          !hasWarningSent(userId, milestone.key)
        ) {
          markWarningSent(userId, milestone.key);
          addNotification({
            type:    'system',
            title:   milestone.title(planLabel),
            message: milestone.message(sub.daysLeft, planLabel),
          });
        }
      }
    };

    // Run immediately on mount, then poll every minute via orchestrator
    check();
    lynxOrchestrator.registerScheduledTask('subscription-monitor-check', CHECK_INTERVAL_MS, check);
    return () => {
      lynxOrchestrator.releaseScheduledTask('subscription-monitor-check');
    };
  }, [user?.id, user?.plan]);
}
