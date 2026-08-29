/**
 * referralService.ts — CryptoVerse HQ Referral System
 *
 * Tracks referrals, generates referral links, rewards referrers and referees.
 * Persists to localStorage under cv_referrals_v1.
 */

import { useCpCoinsStore } from './cpCoinsStore';

export interface Referral {
  id: string;
  referrerId: string;
  refereeId: string;
  createdAt: number;
  status: 'pending' | 'active' | 'completed';
}

export interface ReferralStats {
  totalReferrals: number;
  activeReferrals: number;
  totalEarnings: number;
}

class ReferralService {
  private storageKey = 'cv_referrals_v1';
  private referrals: Referral[] = [];

  constructor() {
    this.loadFromStorage();
  }

  /** Generate a shareable referral link for a user. */
  generateReferralLink(userId: string): string {
    const code = btoa(userId).replace(/[^a-zA-Z0-9]/g, '');
    return `${window.location.origin}/signup?ref=${code}`;
  }

  /** Decode a referral code from the URL params back to a userId. */
  decodeReferralCode(code: string): string | null {
    try {
      return atob(code);
    } catch {
      return null;
    }
  }

  /** Register a new referral when someone signs up via a referral link. */
  registerReferral(referrerId: string, refereeId: string): void {
    // Prevent self-referral
    if (referrerId === refereeId) return;
    // Prevent duplicate referrals
    const exists = this.referrals.some(r => r.refereeId === refereeId);
    if (exists) return;

    const referral: Referral = {
      id: `ref_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      referrerId,
      refereeId,
      createdAt: Date.now(),
      status: 'pending',
    };
    this.referrals.push(referral);
    this.saveToStorage();
  }

  /** Confirm a referral after the referee completes onboarding/verification. */
  confirmReferral(refereeId: string): void {
    const referral = this.referrals.find(r => r.refereeId === refereeId);
    if (!referral || referral.status !== 'pending') return;

    referral.status = 'active';
    this.saveToStorage();

    // Reward the referrer (50 CP)
    this.rewardReferrer(referral.referrerId);
    // Reward the referee (20 CP)
    this.rewardReferee(refereeId);
  }

  /** Get referral statistics for a user. */
  getReferralStats(userId: string): ReferralStats {
    const userReferrals = this.referrals.filter(r => r.referrerId === userId);
    const active = userReferrals.filter(r => r.status === 'active');
    return {
      totalReferrals: userReferrals.length,
      activeReferrals: active.length,
      totalEarnings: active.length * 50,
    };
  }

  /** Get all referrals made by a user. */
  getReferrals(userId: string): Referral[] {
    return this.referrals.filter(r => r.referrerId === userId);
  }

  private rewardReferrer(userId: string): void {
    useCpCoinsStore.getState().credit({
      userId,
      amount: 50,
      type: 'referral_bonus' as any,
      description: 'Referral reward — you invited a friend! 🎉',
    });
  }

  private rewardReferee(userId: string): void {
    useCpCoinsStore.getState().credit({
      userId,
      amount: 20,
      type: 'referral_bonus' as any,
      description: 'Welcome bonus — signed up with a referral link! 🎉',
    });
  }

  private loadFromStorage(): void {
    try {
      const data = localStorage.getItem(this.storageKey);
      if (data) this.referrals = JSON.parse(data);
    } catch { /* ignore */ }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.referrals));
    } catch { /* ignore */ }
  }
}

export const referralService = new ReferralService();
