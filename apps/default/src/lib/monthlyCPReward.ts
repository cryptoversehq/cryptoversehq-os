import { useAuthStore } from './authStore';
import { SUBSCRIPTION_PLANS } from './monetizationStore';
import { useCpCoinsStore } from './cpCoinsStore';

const STORAGE_KEY = 'cv_monthly_cp_claim';
const CLAIM_MARKER = 'cv_monthly_cp_claimed';

/**
 * Check if the monthly CP reward has already been claimed this calendar month.
 * Uses YYYY-MM as the key so it resets on the 1st of each month automatically.
 */
function getMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function hasClaimedThisMonth(): boolean {
  try {
    const stored = localStorage.getItem(`${CLAIM_MARKER}_${getMonthKey()}`);
    return stored === 'true';
  } catch { return false; }
}

function markClaimedThisMonth() {
  try {
    localStorage.setItem(`${CLAIM_MARKER}_${getMonthKey()}`, 'true');
  } catch { /* localStorage may be unavailable */ }
}

/**
 * Attempt to distribute monthly CP to the current user.
 * Returns { claimed: true, amount } if CP was just awarded,
 * or { claimed: false } if it was already claimed this month.
 * Call this from App.tsx on mount.
 */
export function distributeMonthlyCP(): { claimed: boolean; amount: number; plan: string } | null {
  const user = useAuthStore.getState().user;
  if (!user?.id) return null;

  if (hasClaimedThisMonth()) return { claimed: false, amount: 0, plan: user.plan ?? 'free' };

  const planId = (user.plan as keyof typeof SUBSCRIPTION_PLANS) || 'free';
  const plan = SUBSCRIPTION_PLANS[planId];
  const amount = plan?.cpPerMonth ?? 0;

  if (amount > 0) {
    useCpCoinsStore.getState().credit({
      userId: user.id,
      amount,
      type: 'subscription_reward',
      description: `Monthly CP Reward — ${plan?.name ?? planId} Plan`,
    });
  }

  markClaimedThisMonth();
  return { claimed: true, amount, plan: planId };
}

/**
 * Last claim timestamp (for display in wallet). Null if never claimed.
 */
export function getLastClaimDate(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch { return null; }
}
