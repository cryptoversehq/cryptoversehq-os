/**
 * adminPaymentStore.ts
 *
 * Admin-side view of ALL payment records across all users.
 * Reads from and writes back to the exact same localStorage keys that
 * subscriptionStore and authStore use, so changes are immediately
 * reflected in every user-facing view without any extra sync step.
 */

import { create } from 'zustand';
import {
  PaymentRecord,
  PaymentStatus,
  PLAN_DURATION_DAYS,
  VIRTUAL_PKG_PRICE_USDT,
} from './subscriptionStore';
import { UserProfile } from './authStore';

// ── Shared localStorage keys (must match subscriptionStore / authStore) ───────
const SUB_KEY     = 'cryptoverse_subscriptions_v2';
const USERS_KEY   = 'cryptoverse_users';
const SESSION_KEY = 'cryptoverse_session';

// ── Helpers ───────────────────────────────────────────────────────────────────
function loadAllPayments(): Record<string, PaymentRecord[]> {
  try { return JSON.parse(localStorage.getItem(SUB_KEY) || '{}'); } catch { return {}; }
}
function saveAllPayments(data: Record<string, PaymentRecord[]>) {
  localStorage.setItem(SUB_KEY, JSON.stringify(data));
}

function loadUsers(): Record<string, { password: string; profile: UserProfile }> {
  try { return JSON.parse(localStorage.getItem(USERS_KEY) || '{}'); } catch { return {}; }
}
function saveUsers(u: Record<string, { password: string; profile: UserProfile }>) {
  localStorage.setItem(USERS_KEY, JSON.stringify(u));
}

/** Patch the active session if it belongs to the affected user */
function patchSessionIfNeeded(userId: string, partial: Partial<UserProfile>) {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return;
    const profile: UserProfile = JSON.parse(raw);
    if (profile.id !== userId) return;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...profile, ...partial }));
  } catch { /* ignore */ }
}

// ── Flat record type with user display info ───────────────────────────────────
export interface AdminPaymentRow extends PaymentRecord {
  userEmail:       string;
  userDisplayName: string;
  userPlan:        string;
}

// ── Admin action log ──────────────────────────────────────────────────────────
export interface AdminActionLog {
  id:          string;
  adminId:     string;
  paymentId:   string;
  userId:      string;
  action:      'approved' | 'rejected';
  reason?:     string;
  performedAt: string; // ISO
}

const LOG_KEY = 'cryptoverse_admin_log';
function loadLog(): AdminActionLog[] {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch { return []; }
}
function saveLog(log: AdminActionLog[]) {
  localStorage.setItem(LOG_KEY, JSON.stringify(log));
}

// ── Store state ───────────────────────────────────────────────────────────────
interface AdminPaymentState {
  /** Whether the store is currently refreshing from localStorage */
  loading: boolean;
  /** All payment rows across all users, enriched with user info */
  rows: AdminPaymentRow[];
  /** Admin action audit log */
  log: AdminActionLog[];

  /** Pull the latest state from localStorage */
  refresh: () => void;

  /**
   * Approve a payment — activates subscription or tops up virtual balance,
   * then updates the user's stored profile + session.
   */
  adminApprove: (paymentId: string, adminId: string) => { ok: boolean; error?: string };

  /**
   * Reject a payment — marks it rejected with a human-readable reason.
   */
  adminReject: (paymentId: string, adminId: string, reason: string) => { ok: boolean; error?: string };
}

// ── Build enriched rows ───────────────────────────────────────────────────────
function buildRows(): AdminPaymentRow[] {
  const payments = loadAllPayments();
  const users    = loadUsers();

  // Build a userId → profile index
  const profileIndex: Record<string, UserProfile> = {};
  for (const entry of Object.values(users)) {
    profileIndex[entry.profile.id] = entry.profile;
  }

  const rows: AdminPaymentRow[] = [];
  for (const [userId, records] of Object.entries(payments)) {
    const profile = profileIndex[userId];
    for (const rec of records) {
      rows.push({
        ...rec,
        userEmail:       profile?.email       ?? userId,
        userDisplayName: profile?.displayName ?? 'Unknown',
        userPlan:        profile?.plan        ?? 'free',
      });
    }
  }

  // Newest first
  rows.sort((a, b) =>
    new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
  );
  return rows;
}

// ── Store ─────────────────────────────────────────────────────────────────────
export const useAdminPaymentStore = create<AdminPaymentState>((set, get) => ({
  loading: false,
  rows:    buildRows(),
  log:     loadLog(),

  refresh: () => {
    set({ loading: true });
    // Small tick so the loading state renders before the potentially
    // heavy localStorage scan on large datasets
    setTimeout(() => {
      set({ rows: buildRows(), log: loadLog(), loading: false });
    }, 50);
  },

  adminApprove: (paymentId, adminId) => {
    const allPayments = loadAllPayments();

    // Locate the payment across all users
    let targetUserId: string | null = null;
    let targetIdx:    number        = -1;

    for (const [uid, records] of Object.entries(allPayments)) {
      const idx = records.findIndex(r => r.id === paymentId);
      if (idx !== -1) { targetUserId = uid; targetIdx = idx; break; }
    }

    if (!targetUserId || targetIdx === -1) {
      return { ok: false, error: 'Payment record not found.' };
    }

    const rec = { ...allPayments[targetUserId][targetIdx] };
    if (rec.status !== 'pending') {
      return { ok: false, error: `Cannot approve a payment with status "${rec.status}".` };
    }

    // ── Activate ────────────────────────────────────────────────────────────
    const now = new Date();
    rec.status      = 'verified';
    rec.verifiedAt  = now.toISOString();
    rec.activatedAt = now.toISOString();

    const users   = loadUsers();
    const userEntry = Object.values(users).find(u => u.profile.id === targetUserId);
    const profile   = userEntry?.profile;

    if (rec.kind === 'subscription' && rec.planId) {
      const durDays = PLAN_DURATION_DAYS[rec.planId] ?? 30;
      const expiry  = new Date(now.getTime() + durDays * 86_400_000).toISOString();
      rec.expiresAt = expiry;

      // Update user profile plan
      if (profile && userEntry) {
        const updated = {
          ...profile,
          plan: rec.planId as UserProfile['plan'],
          planExpiry: expiry,
        };
        userEntry.profile = updated;
        saveUsers(users);
        patchSessionIfNeeded(targetUserId, { plan: updated.plan, planExpiry: expiry });
      }
    } else if (rec.kind === 'virtual_balance' && rec.pkgLabel) {
      // Credit virtual balance
      const creditAmount = VIRTUAL_PKG_PRICE_USDT[rec.pkgLabel]
        ? virtualPkgToUsd(rec.pkgLabel)
        : rec.amount * 1000; // fallback: 1 USDT → $1,000 virtual

      if (profile && userEntry) {
        const updated = {
          ...profile,
          virtualBalance: (profile.virtualBalance || 0) + creditAmount,
        };
        userEntry.profile = updated;
        saveUsers(users);
        patchSessionIfNeeded(targetUserId, { virtualBalance: updated.virtualBalance });
      }
    }

    // Persist payment
    allPayments[targetUserId][targetIdx] = rec;
    saveAllPayments(allPayments);

    // Audit log
    const log = loadLog();
    log.unshift({
      id:          `log_${Date.now()}`,
      adminId,
      paymentId,
      userId:      targetUserId,
      action:      'approved',
      performedAt: now.toISOString(),
    });
    saveLog(log);

    set({ rows: buildRows(), log });
    return { ok: true };
  },

  adminReject: (paymentId, adminId, reason) => {
    const allPayments = loadAllPayments();

    let targetUserId: string | null = null;
    let targetIdx:    number        = -1;

    for (const [uid, records] of Object.entries(allPayments)) {
      const idx = records.findIndex(r => r.id === paymentId);
      if (idx !== -1) { targetUserId = uid; targetIdx = idx; break; }
    }

    if (!targetUserId || targetIdx === -1) {
      return { ok: false, error: 'Payment record not found.' };
    }

    const rec = { ...allPayments[targetUserId][targetIdx] };
    if (rec.status !== 'pending') {
      return { ok: false, error: `Cannot reject a payment with status "${rec.status}".` };
    }

    rec.status          = 'rejected';
    rec.rejectionReason = reason.trim() || 'Rejected by admin.';
    allPayments[targetUserId][targetIdx] = rec;
    saveAllPayments(allPayments);

    // Audit log
    const now = new Date();
    const log = loadLog();
    log.unshift({
      id:          `log_${Date.now()}`,
      adminId,
      paymentId,
      userId:      targetUserId,
      action:      'rejected',
      reason:      rec.rejectionReason,
      performedAt: now.toISOString(),
    });
    saveLog(log);

    set({ rows: buildRows(), log });
    return { ok: true };
  },
}));

// ── Virtual package label → USD credit amount ─────────────────────────────────
function virtualPkgToUsd(label: string): number {
  const map: Record<string, number> = {
    '$10K':  10_000,
    '$50K':  50_000,
    '$200K': 200_000,
    '$1M':   1_000_000,
  };
  return map[label] ?? 10_000;
}

// ── Status helpers ────────────────────────────────────────────────────────────
export function statusColor(status: PaymentStatus): string {
  switch (status) {
    case 'pending':  return '#f59e0b';
    case 'verified': return '#22c55e';
    case 'rejected': return '#ef4444';
    case 'expired':  return '#6b7280';
    default:         return '#6b7280';
  }
}

export function statusLabel(status: PaymentStatus): string {
  switch (status) {
    case 'pending':  return 'Pending';
    case 'verified': return 'Verified';
    case 'rejected': return 'Rejected';
    case 'expired':  return 'Expired';
    default:         return status;
  }
}
