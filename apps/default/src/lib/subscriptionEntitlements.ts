/**
 * subscriptionEntitlements.ts — Admin manual subscription (Pro / Pro+) engine.
 *
 * WHO CAN USE THIS
 *   • The Developer / project owner (UserRole 'developer' or Profile.isDeveloper).
 *   • The "Super Admin – Subscriptions" role, modelled in this app as an admin
 *     who has been explicitly granted the `subscriptions` section
 *     (Admin → Users → permissions). No other admin may use it — a Level 6
 *     "Technical Admin" is NOT auto-allowed; access requires the explicit grant.
 *
 * SECURITY
 *   Authorization is resolved from the trusted auth stores by ONE function
 *   (`isSubscriptionManager`) that every write path re-checks. A component can
 *   render the UI, but it cannot grant or revoke without passing this check,
 *   so the boundary cannot be bypassed by calling the store directly.
 *   Every attempt — allowed or denied — is appended to an audit trail carrying
 *   the actor id, target user id, plan id, action and timestamp.
 *
 * PERSISTENCE
 *   Entitlement rows use the `subscription_entitlements` shape
 *   (plan_id / status / starts_at / ends_at / granted_by). NOTE: this Taskade
 *   Genesis deployment has no SQL/Supabase layer (see
 *   artifacts/database-integrity.txt), so rows are persisted through the app's
 *   cloud record store plus a localStorage mirror, and the plan is applied to
 *   the target user's profile. To move enforcement to a real server, replace
 *   `saveEntitlements()` and `applyPlanToUser()` with a Render-API call that
 *   writes the `subscription_entitlements` table; the authorization + audit
 *   contract below stays identical.
 */
import { create } from 'zustand';
import { useAuthStore } from './authStore';
import { useAdminAuthStore } from './adminAuthStore';
import { getAdminSections } from './adminPortalStore';
import { cloudRecordStore } from './cloudData';
import { PLAN_DURATION_DAYS } from './subscriptionStore';

// ── Constants ─────────────────────────────────────────────────────────────────
/** Section id that models the "Super Admin – Subscriptions" role. */
export const SUBSCRIPTION_ADMIN_SECTION = 'subscriptions';

/** Cloud objectType used by the shared cloud record store. */
const ENTITLEMENTS_OBJECT_TYPE = 'subscription';
const ENTITLEMENTS_KEY = 'subscription_entitlements_v1';

/** localStorage mirror keys (kept alive even when the cloud write is offline). */
const ENTITLEMENTS_STORAGE_KEY = 'cryptoverse_subscription_entitlements_v1';
const AUDIT_STORAGE_KEY        = 'cryptoverse_subscription_entitlement_audit_v1';
const MAX_AUDIT = 500;

/** Profile / session keys the plan is written back into (match adminPaymentStore). */
const USERS_KEY   = 'cryptoverse_users';
const SESSION_KEY = 'cryptoverse_session';

// ── Types ─────────────────────────────────────────────────────────────────────
export type EntitlementPlanId = 'pro' | 'pro_plus';
export type EntitlementStatus = 'active' | 'revoked' | 'expired';
export type EntitlementSource = 'admin_grant' | 'payment' | 'trial';

/** Mirrors a row of the (planned) `subscription_entitlements` table. */
export interface SubscriptionEntitlement {
  id:            string;
  user_id:       string;              // target user's profile id (email fallback)
  user_email:    string;
  plan_id:       EntitlementPlanId;
  status:        EntitlementStatus;
  starts_at:     string;              // ISO — plan start
  ends_at:       string;              // ISO — plan end
  granted_by:    string;              // actor id (email fallback)
  granted_at:    string;              // ISO
  revoked_by?:   string;
  revoked_at?:   string;
  source:        EntitlementSource;
  note?:         string;
}

export interface EntitlementAuditEntry {
  id:               string;
  actor_id:         string;
  actor_email:      string;
  actor_role:       string;
  target_user_id:   string;
  target_user_email: string;
  plan_id:          EntitlementPlanId;
  action:           'grant' | 'revoke';
  result:           'success' | 'failure';
  timestamp:        string;           // ISO
  ip_address:       string;
  starts_at?:       string;
  ends_at?:         string;
  note?:            string;
  error?:           string;
}

export interface SubscriptionActor {
  id:          string;
  email:       string;
  displayName: string;
  role:        string;
  isDeveloper: boolean;
  level:       number;
}

export interface EntitlementMutationResult {
  ok:           boolean;
  error?:       string;
  entitlement?: SubscriptionEntitlement;
}

export interface GrantParams {
  targetUserId:    string;
  targetUserEmail: string;
  planId:          EntitlementPlanId;
  /** Days the plan stays active. Defaults to the plan's standard 30 days. */
  durationDays?:   number;
  note?:           string;
}

export interface RevokeParams {
  targetUserId:    string;
  targetUserEmail: string;
  /** Revoke a specific plan only; omit to revoke the user's active plan. */
  planId?:         EntitlementPlanId;
  reason?:         string;
}

export const PLAN_LABELS: Record<EntitlementPlanId, string> = {
  pro:      'Pro',
  pro_plus: 'Pro+',
};

// ── Real client IP (cached; 'unknown' when offline) ───────────────────────────
let _cachedIp: string | null = null;
let _ipPrimed = false;
function currentIp(): string {
  if (!_ipPrimed) {
    _ipPrimed = true;
    fetch('https://api.ipify.org?format=json')
      .then(r => r.json())
      .then((d: { ip?: string }) => { if (d?.ip) _cachedIp = d.ip; })
      .catch(() => { /* offline — fall back to 'unknown' */ });
  }
  return _cachedIp ?? 'unknown';
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function readLocal<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : fallback; } catch { return fallback; }
}
function writeLocal(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota — cloud mirror still attempted */ }
}

// ── Actor resolution (trusted stores only) ────────────────────────────────────
export function resolveSubscriptionActor(): SubscriptionActor {
  const appUser = useAuthStore.getState().user;
  const session = useAdminAuthStore.getState().session;
  const email   = (session?.email ?? appUser?.email ?? '').toLowerCase();
  const role    = appUser?.role ?? 'user';
  return {
    id:          session?.adminId ?? appUser?.id ?? email,
    email,
    displayName: session?.displayName ?? appUser?.displayName ?? email,
    role,
    isDeveloper: role === 'developer' || appUser?.isDeveloper === true,
    level:       session?.level ?? 0,
  };
}

/**
 * The single authorization boundary. True only for the Developer, or an admin
 * who was explicitly granted the `subscriptions` section. Level alone never
 * qualifies — this is what keeps Level 6 admins out unless granted the role.
 */
export function isSubscriptionManager(actor: SubscriptionActor = resolveSubscriptionActor()): boolean {
  if (actor.isDeveloper || actor.role === 'developer') return true;
  if (!actor.email) return false;
  try {
    return getAdminSections(actor.email).includes(SUBSCRIPTION_ADMIN_SECTION);
  } catch {
    return false;
  }
}

// ── Persistence ───────────────────────────────────────────────────────────────
function loadEntitlements(): SubscriptionEntitlement[] {
  const local = readLocal<SubscriptionEntitlement[]>(ENTITLEMENTS_STORAGE_KEY, []);
  if (local.length > 0) return local;
  return cloudRecordStore.get<SubscriptionEntitlement[]>(ENTITLEMENTS_OBJECT_TYPE, ENTITLEMENTS_KEY, []);
}
function saveEntitlements(list: SubscriptionEntitlement[]): void {
  writeLocal(ENTITLEMENTS_STORAGE_KEY, list);
  cloudRecordStore.set(ENTITLEMENTS_OBJECT_TYPE, ENTITLEMENTS_KEY, list);
}
function loadAudit(): EntitlementAuditEntry[] {
  return readLocal<EntitlementAuditEntry[]>(AUDIT_STORAGE_KEY, []);
}
function appendAudit(entry: EntitlementAuditEntry): void {
  writeLocal(AUDIT_STORAGE_KEY, [entry, ...loadAudit()].slice(0, MAX_AUDIT));
}

/** True when an entitlement row refers to the given user (id or email). */
export function entitlementMatchesUser(
  entitlement: SubscriptionEntitlement,
  userId: string,
  userEmail: string,
): boolean {
  const id    = (userId ?? '').toLowerCase();
  const email = (userEmail ?? '').toLowerCase();
  return (
    (!!id && (entitlement.user_id.toLowerCase() === id || entitlement.user_id.toLowerCase() === email)) ||
    (!!email && entitlement.user_email.toLowerCase() === email)
  );
}

/**
 * Applies (or clears) the plan on the target user's profile. Mirrors
 * adminPaymentStore.adminApprove: writes the localStorage roster, patches the
 * live session when the target is the signed-in user, and updates the in-memory
 * auth store so gated features re-evaluate immediately.
 */
function applyPlanToUser(targetUserId: string, plan: EntitlementPlanId | 'free', planExpiry?: string): void {
  const key = (targetUserId ?? '').toLowerCase();

  // 1. localStorage roster
  const users = readLocal<Record<string, { password?: string; profile?: Record<string, unknown> }>>(USERS_KEY, {});
  let changed = false;
  for (const entry of Object.values(users)) {
    const profile = entry?.profile;
    if (!profile) continue;
    const matches = String(profile.id ?? '').toLowerCase() === key || String(profile.email ?? '').toLowerCase() === key;
    if (!matches) continue;
    profile.plan = plan;
    profile.planExpiry = planExpiry;
    changed = true;
  }
  if (changed) writeLocal(USERS_KEY, users);

  // 2. live session (this device)
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      const profile = JSON.parse(raw) as Record<string, unknown>;
      const matches = String(profile.id ?? '').toLowerCase() === key || String(profile.email ?? '').toLowerCase() === key;
      if (matches) sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...profile, plan, planExpiry }));
    }
  } catch { /* ignore */ }

  // 3. in-memory auth store
  const current = useAuthStore.getState().user;
  if (current && (current.id.toLowerCase() === key || current.email.toLowerCase() === key)) {
    useAuthStore.getState().updateProfile({ plan, planExpiry });
  }
}

function buildAudit(
  actor: SubscriptionActor,
  params: {
    targetUserId: string; targetUserEmail: string; planId: EntitlementPlanId;
    action: 'grant' | 'revoke'; result: 'success' | 'failure';
    starts_at?: string; ends_at?: string; note?: string; error?: string;
  },
): EntitlementAuditEntry {
  return {
    id:                makeId('eaud'),
    actor_id:          actor.id,
    actor_email:       actor.email,
    actor_role:        actor.isDeveloper ? 'developer' : actor.role,
    target_user_id:    params.targetUserId || params.targetUserEmail,
    target_user_email: (params.targetUserEmail || params.targetUserId).toLowerCase(),
    plan_id:           params.planId,
    action:            params.action,
    result:            params.result,
    timestamp:         new Date().toISOString(),
    ip_address:        currentIp(),
    starts_at:         params.starts_at,
    ends_at:           params.ends_at,
    note:              params.note,
    error:             params.error,
  };
}

const NOT_AUTHORIZED =
  'Not authorized. Only the Developer or a Super Admin granted the Subscriptions role can manage subscriptions.';

// ── Store ─────────────────────────────────────────────────────────────────────
interface SubscriptionEntitlementState {
  entitlements: SubscriptionEntitlement[];
  auditLog:     EntitlementAuditEntry[];

  refresh:                  () => void;
  grant:                    (params: GrantParams) => EntitlementMutationResult;
  revoke:                   (params: RevokeParams) => EntitlementMutationResult;
  getEntitlementsForUser:   (userId: string, userEmail: string) => SubscriptionEntitlement[];
  getActiveEntitlementForUser: (userId: string, userEmail: string) => SubscriptionEntitlement | null;
}

export const useSubscriptionEntitlementStore = create<SubscriptionEntitlementState>((set, get) => ({
  entitlements: loadEntitlements(),
  auditLog:     loadAudit(),

  refresh: () => set({ entitlements: loadEntitlements(), auditLog: loadAudit() }),

  grant: ({ targetUserId, targetUserEmail, planId, durationDays, note }) => {
    const actor   = resolveSubscriptionActor();
    const plan    = planId === 'pro_plus' ? 'pro_plus' : planId === 'pro' ? 'pro' : null;
    const failure = (error: string): EntitlementMutationResult => {
      appendAudit(buildAudit(actor, { targetUserId, targetUserEmail, planId: (plan ?? 'pro') as EntitlementPlanId, action: 'grant', result: 'failure', error }));
      set({ auditLog: loadAudit() });
      return { ok: false, error };
    };

    // ── Authorization chokepoint — re-checked on every call ──────────────────
    if (!isSubscriptionManager(actor)) return failure(NOT_AUTHORIZED);
    if (!plan) return failure('Unsupported plan. Choose Pro or Pro+.');
    if (!targetUserId && !targetUserEmail) return failure('A target user is required.');

    const now      = new Date().toISOString();
    const days     = typeof durationDays === 'number' && Number.isFinite(durationDays) && durationDays > 0
      ? Math.floor(durationDays)
      : (PLAN_DURATION_DAYS[plan] ?? 30);
    const endsAt   = new Date(Date.now() + days * 86_400_000).toISOString();

    const entitlement: SubscriptionEntitlement = {
      id:         makeId('ent'),
      user_id:    targetUserId || targetUserEmail,
      user_email: (targetUserEmail || targetUserId).toLowerCase(),
      plan_id:    plan,
      status:     'active',
      starts_at:  now,
      ends_at:    endsAt,
      granted_by: actor.id || actor.email,
      granted_at: now,
      source:     'admin_grant',
      note,
    };

    // One active plan per user: supersede the user's other active rows.
    const next = [
      entitlement,
      ...loadEntitlements().map(e =>
        e.status === 'active' && entitlementMatchesUser(e, entitlement.user_id, entitlement.user_email)
          ? { ...e, status: 'revoked' as const, revoked_at: now, revoked_by: actor.email || actor.id }
          : e,
      ),
    ];
    saveEntitlements(next);
    applyPlanToUser(entitlement.user_id, plan, endsAt);

    appendAudit(buildAudit(actor, {
      targetUserId, targetUserEmail, planId: plan, action: 'grant', result: 'success',
      starts_at: now, ends_at: endsAt, note,
    }));
    set({ entitlements: next, auditLog: loadAudit() });
    return { ok: true, entitlement };
  },

  revoke: ({ targetUserId, targetUserEmail, planId, reason }) => {
    const actor = resolveSubscriptionActor();
    const auditPlan = (planId ?? 'pro') as EntitlementPlanId;
    const failure = (error: string): EntitlementMutationResult => {
      appendAudit(buildAudit(actor, { targetUserId, targetUserEmail, planId: auditPlan, action: 'revoke', result: 'failure', error, note: reason }));
      set({ auditLog: loadAudit() });
      return { ok: false, error };
    };

    // ── Authorization chokepoint — re-checked on every call ──────────────────
    if (!isSubscriptionManager(actor)) return failure(NOT_AUTHORIZED);
    if (!targetUserId && !targetUserEmail) return failure('A target user is required.');

    const now = new Date().toISOString();
    let revoked: SubscriptionEntitlement | null = null;

    const next = loadEntitlements().map(e => {
      if (e.status !== 'active') return e;
      if (planId && e.plan_id !== planId) return e;
      if (!entitlementMatchesUser(e, targetUserId, targetUserEmail)) return e;
      const updated: SubscriptionEntitlement = {
        ...e, status: 'revoked', revoked_at: now, revoked_by: actor.email || actor.id,
      };
      revoked = updated;
      return updated;
    });

    if (!revoked) return failure('No active entitlement matched this user.');

    saveEntitlements(next);
    applyPlanToUser(targetUserId || targetUserEmail, 'free', undefined);

    appendAudit(buildAudit(actor, {
      targetUserId, targetUserEmail,
      planId: (revoked as SubscriptionEntitlement).plan_id,
      action: 'revoke', result: 'success', note: reason,
      starts_at: (revoked as SubscriptionEntitlement).starts_at,
      ends_at:   (revoked as SubscriptionEntitlement).ends_at,
    }));
    set({ entitlements: next, auditLog: loadAudit() });
    return { ok: true, entitlement: revoked };
  },

  getEntitlementsForUser: (userId, userEmail) =>
    get().entitlements
      .filter(e => entitlementMatchesUser(e, userId, userEmail))
      .sort((a, b) => new Date(b.granted_at).getTime() - new Date(a.granted_at).getTime()),

  getActiveEntitlementForUser: (userId, userEmail) =>
    get().getEntitlementsForUser(userId, userEmail).find(e => e.status === 'active') ?? null,
}));
