/**
 * referralStore.ts — Referral bonus system.
 * Each user gets a unique referral code. When someone signs up with it,
 * both referrer and referee get 500 CP.
 */
import { useCpCoinsStore } from './cpCoinsStore';
import { cloudRecordStore } from './cloudData';

const REFERRAL_KEY = 'cryptoverse_referrals_v1';
const CODE_MAP_KEY = 'cryptoverse_referral_codes_v1';
const BONUS_CP = 500;

export interface ReferralRecord {
  id: string;
  referrerId: string;
  refereeId: string;
  refereeName: string;
  claimedAt: string;
  bonusCP: number;
}

interface ReferralState {
  code: string | null;
  referredBy: string | null;
  referrals: ReferralRecord[];
}

function generateCode(userId: string): string {
  const hash = userId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return `CRYPTO${hash.toString(36).toUpperCase().slice(0, 6)}`;
}

// Global code → userId mapping for cross-user lookup
function loadCodeMap(): Record<string, string> {
  return cloudRecordStore.get<Record<string, string>>('referrals', CODE_MAP_KEY, {});
}
function saveCodeMap(map: Record<string, string>) {
  cloudRecordStore.set('referrals', CODE_MAP_KEY, map);
}

function loadReferrals(): ReferralState {
  return cloudRecordStore.get<ReferralState>('referrals', REFERRAL_KEY, { code: null, referredBy: null, referrals: [] });
}

function saveReferrals(state: ReferralState) {
  cloudRecordStore.set('referrals', REFERRAL_KEY, state);
}

export function getReferralCode(userId: string): string {
  const state = loadReferrals();
  if (!state.code) {
    state.code = generateCode(userId);
    saveReferrals(state);
    // Register in global code map
    const map = loadCodeMap();
    map[state.code] = userId;
    saveCodeMap(map);
  }
  return state.code;
}

export function getReferralLink(userId: string): string {
  const code = getReferralCode(userId);
  return `${window.location.origin}?ref=${code}`;
}

/** Look up a userId from a referral code */
export function lookupReferralCode(code: string): string | null {
  return loadCodeMap()[code] ?? null;
}

export function getReferralCount(userId: string): number {
  const state = loadReferrals();
  return state.referrals.filter(r => r.referrerId === userId).length;
}

export function getTotalReferralBonus(userId: string): number {
  const state = loadReferrals();
  return state.referrals
    .filter(r => r.referrerId === userId)
    .reduce((sum, r) => sum + r.bonusCP, 0);
}

export function getReferrals(userId: string): ReferralRecord[] {
  return loadReferrals().referrals.filter(r => r.referrerId === userId);
}

export function claimReferralBonus(userId: string, refereeId: string, refereeName: string): { ok: boolean; error?: string } {
  const state = loadReferrals();

  // Prevent self-referral
  if (userId === refereeId) {
    return { ok: false, error: 'Cannot refer yourself' };
  }

  // Prevent claiming twice for same referee
  const alreadyClaimed = state.referrals.some(r => r.refereeId === refereeId);
  if (alreadyClaimed) {
    return { ok: false, error: 'Referral already claimed for this user' };
  }

  const record: ReferralRecord = {
    id: `ref_${Date.now()}`,
    referrerId: userId,
    refereeId,
    refereeName,
    claimedAt: new Date().toISOString(),
    bonusCP: BONUS_CP,
  };

  state.referrals.push(record);

  // Also track who referred the referee
  state.referredBy = userId;
  saveReferrals(state);

  // Credit CP to both referrer and referee
  const cpStore = useCpCoinsStore.getState();
  cpStore.credit({
    userId,
    amount: BONUS_CP,
    type: 'achievement_reward',
    description: `Referral bonus — ${refereeName} joined!`,
    referenceId: record.id,
  });
  cpStore.credit({
    userId: refereeId,
    amount: BONUS_CP,
    type: 'achievement_reward',
    description: 'Welcome bonus — referred by a friend!',
    referenceId: record.id,
  });

  return { ok: true };
}

export function hasBeenReferred(): boolean {
  return loadReferrals().referredBy !== null;
}

export function getReferredBy(): string | null {
  return loadReferrals().referredBy;
}
