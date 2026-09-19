/**
 * adminPaymentStore.ts
 *
 * Admin-side view of ALL payment records across all users.
 *
 * DATA SOURCES (Batch D5)
 *   • payment records — the CLOUD record store (objectType 'subscription'), because there is
 *     still no payments table on the server. SUB_KEY below is that cloud key, not a mirror.
 *   • user email / display name / plan — the SERVER roster (GET /api/admin/users), fetched by
 *     refresh(). Nothing is read from cryptoverse_users.
 *   • approve side effects — written by the API: POST /api/admin/subscriptions/grant for a
 *     plan, POST /api/admin/users/:id/balance for a virtual-balance credit. The old behaviour
 *     of patching localStorage + a session copy is gone, so an approval can no longer be
 *     recorded locally while the server never granted it.
 *   • the admin action log (LOG_KEY) is still local — a D7 candidate.
 */

import { create } from 'zustand';
import {
  PaymentRecord,
  PaymentStatus,
  PLAN_DURATION_DAYS,
  VIRTUAL_PKG_PRICE_USDT,
} from './subscriptionStore';
// Batch D5: `UserProfile` and the cryptoverse_users / cryptoverse_session mirrors are gone.
// The email, display name and plan shown beside a payment now come from the SERVER roster,
// and the approval side effects are written by the API instead of into browser storage.
import { fetchAllAdminUsers } from './adminUsersApi';
import { apiPost } from './adminApi';
import { cloudRecordStore } from './cloudData';

// ── Shared keys ───────────────────────────────────────────────────────────────
// SUB_KEY is a CLOUD record key (cloudRecordStore), NOT a localStorage mirror. There is no
// payments table on the server yet, so the records themselves still live in the cloud store;
// what changed in D5 is that no USER data is read from or written to the browser.
const SUB_KEY = 'cryptoverse_subscriptions_v2';

// ── Helpers ───────────────────────────────────────────────────────────────────
function loadAllPayments(): Record<string, PaymentRecord[]> {
  return cloudRecordStore.get<Record<string, PaymentRecord[]>>('subscription', SUB_KEY, {});
}
function saveAllPayments(data: Record<string, PaymentRecord[]>) {
  cloudRecordStore.set('subscription', SUB_KEY, data);
}

/**
 * SERVER roster cache — id (and email) → { email, displayName, plan }.
 *
 * Batch D5: this replaced `loadUsers()`, which read the cryptoverse_users localStorage
 * mirror that nothing writes any more — so every row rendered as "Unknown"/"free". It is
 * filled by refresh() from GET /api/admin/users; until that lands, rows fall back to the id.
 */
const rosterCache = new Map<string, { email: string; displayName: string; plan: string }>();

async function refreshRosterCache(): Promise<void> {
  try {
    const users = await fetchAllAdminUsers();
    rosterCache.clear();
    for (const u of users) {
      const entry = {
        email:       u.email,
        displayName: u.display_name || u.email.split('@')[0],
        plan:        u.plan || 'free',
      };
      rosterCache.set(u.id, entry);
      // Also index by email: older payment records were keyed by id OR email.
      rosterCache.set(u.email.toLowerCase(), entry);
    }
  } catch { /* offline — rows keep their fallbacks rather than showing nothing */ }
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

  /** Pull the latest state from the cloud store + the server roster */
  refresh: () => void;

  /**
   * Approve a payment. ASYNC since Batch D5: the plan / balance side effects are written by
   * the API (POST /api/admin/subscriptions/grant, POST /api/admin/users/:id/balance), so the
   * caller must await the server's answer before reporting success.
   */
  adminApprove: (paymentId: string, adminId: string) => Promise<{ ok: boolean; error?: string }>;

  /**
   * Reject a payment — marks it rejected with a human-readable reason.
   */
  adminReject: (paymentId: string, adminId: string, reason: string) => { ok: boolean; error?: string };
}

// ── Build enriched rows ───────────────────────────────────────────────────────
function buildRows(): AdminPaymentRow[] {
  const payments = loadAllPayments();

  const rows: AdminPaymentRow[] = [];
  for (const [userId, records] of Object.entries(payments)) {
    const profile = rosterCache.get(userId) ?? rosterCache.get(userId.toLowerCase());
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
    // Batch D5: the roster now comes from the SERVER, so fetch it first and rebuild the rows
    // once it lands; the small tick still lets the loading state paint.
    void refreshRosterCache().then(() => {
      setTimeout(() => {
        set({ rows: buildRows(), log: loadLog(), loading: false });
      }, 50);
    });
  },

  adminApprove: async (paymentId, adminId) => {
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

    const now = new Date();

    // ── SERVER side effects FIRST (Batch D5) ────────────────────────────────
    // The old code wrote the plan / balance into the cryptoverse_users mirror and patched a
    // cryptoverse_session copy. Neither exists any more, and neither was authoritative — the
    // API is. These are the same endpoints Admin → Users uses, so requireAdminWrite enforces
    // authorization and the change is real server state.
    try {
      if (rec.kind === 'subscription' && rec.planId) {
        const durDays = PLAN_DURATION_DAYS[rec.planId] ?? 30;
        await apiPost(
          '/api/admin/subscriptions/grant',
          {
            target_user_id: targetUserId,
            plan_id:        rec.planId,
            duration_days:  durDays,
            note:           `Payment ${paymentId} approved by ${adminId}`,
          },
          { 'Idempotency-Key': `pay-approve-${paymentId}` },
        );
        rec.expiresAt = new Date(now.getTime() + durDays * 86_400_000).toISOString();
      } else if (rec.kind === 'virtual_balance' && rec.pkgLabel) {
        // Credit virtual balance — same shape Admin → Users uses (delta + reason).
        const creditAmount = VIRTUAL_PKG_PRICE_USDT[rec.pkgLabel]
          ? virtualPkgToUsd(rec.pkgLabel)
          : rec.amount * 1000; // fallback: 1 USDT → $1,000 virtual
        await apiPost(
          `/api/admin/users/${encodeURIComponent(targetUserId)}/balance`,
          { delta: creditAmount, reason: `Virtual package ${rec.pkgLabel} — payment ${paymentId} approved by ${adminId}` },
          { 'Idempotency-Key': `pay-approve-${paymentId}` },
        );
      }
    } catch (error) {
      // Nothing is marked approved when the server refuses: the record stays pending so the
      // admin can retry, instead of a local flag claiming a plan the API never granted.
      return { ok: false, error: error instanceof Error ? error.message : 'The server refused the approval.' };
    }

    // ── Record + audit locally (payment records have no server table yet) ────
    rec.status      = 'verified';
    rec.verifiedAt  = now.toISOString();
    rec.activatedAt = now.toISOString();
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

// ── Initial SERVER roster load (Batch D5) ─────────────────────────────────────
// The store is created with `rows: buildRows()` built synchronously from the cloud record —
// but the user info those rows need now comes from the API. Nothing in the admin UI calls
// refresh() on mount, so without this kick the table would render raw user ids where emails
// belong until something else happened to refresh it. Load once here, then rebuild the rows.
void refreshRosterCache().then(() => {
  useAdminPaymentStore.setState({ rows: buildRows() });
});

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
