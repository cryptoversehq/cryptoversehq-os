import { useMemo } from 'react';
import { useAuthStore } from '@/lib/authStore';
import { isTrialActive, getTrialDaysLeft } from '@/lib/trialStore';
import { hasPreviewed } from '@/lib/featurePreviewStore';
import type { PlanId } from '@/lib/monetizationStore';

const LEVEL_MAP: Record<PlanId, number> = { free: 0, pro: 1, pro_plus: 2 };
const PLAN_NAMES: Record<PlanId, string> = { free: 'Free', pro: 'Pro ($20/mo)', pro_plus: 'Pro+ ($40/mo)' };

export function useSubscriptionAccess(requiredLevel: PlanId) {
  const user     = useAuthStore(s => s.user);
  const userPlan = (user?.plan as PlanId) || 'free';

  const trialActive = isTrialActive();
  const daysLeft    = getTrialDaysLeft();

  // Trial grants pro-level access
  const effectivePlan: PlanId = trialActive ? 'pro' : userPlan;

  const hasAccess = useMemo(() => {
    return (LEVEL_MAP[effectivePlan] ?? 0) >= (LEVEL_MAP[requiredLevel] ?? 0);
  }, [effectivePlan, requiredLevel]);

  const getUpgradeMessage = () => {
    const requiredName = PLAN_NAMES[requiredLevel] ?? requiredLevel;
    if (requiredLevel === 'free') return 'This feature is completely free!';
    if (trialActive) {
      return `Trial active — ${daysLeft} day${daysLeft !== 1 ? 's' : ''} left. Upgrade to keep access after trial ends.`;
    }
    return `This feature requires ${requiredName} subscription. Upgrade now to unlock all premium features.`;
  };

  const getUpgradeAction = (): string | null => {
    if (requiredLevel === 'free') return null;
    return `/subscription?plan=${requiredLevel}`;
  };

  return { hasAccess, requiredLevel, userPlan, effectivePlan, trialActive, daysLeft, getUpgradeMessage, getUpgradeAction };
}

/**
 * Check if a free user can preview a feature (one free try).
 * Returns { canPreview, previewUsed }.
 */
export function useFeaturePreview(featureKey: string) {
  const user     = useAuthStore(s => s.user);
  const userPlan = (user?.plan as PlanId) || 'free';
  const trialActive = isTrialActive();

  // Pro+ and Pro (or trial) users don't need preview
  if (userPlan !== 'free' || trialActive) {
    return { canPreview: false, previewUsed: false };
  }

  const previewUsed = hasPreviewed(featureKey);
  return { canPreview: !previewUsed, previewUsed };
}
