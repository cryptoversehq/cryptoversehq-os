import { create } from 'zustand';
import { UserProfile } from './authStore';
// Batch C2.5 · Task 2: the admin roster is SERVER data (public.users). This store
// no longer owns a member list — it caches what GET /api/admin/users returns and
// writes through POST /api/admin/users/:id/role and /:id/status.
import {
  fetchAllAdminUsers, findAdminUserByEmail, setAdminUserRole, setAdminUserStatus,
  type AdminUserRecord,
} from './adminUsersApi';

// ── Keys ──────────────────────────────────────────────────────────────────────
// There is deliberately no ADMIN_MEMBERS_KEY: `cryptoverse_admin_members` is no
// longer read or written anywhere in the app.
const ADMIN_REQUESTS_KEY     = 'cryptoverse_admin_requests';
const ADMIN_ACTIVITY_KEY     = 'cryptoverse_admin_activity';
const ADMIN_AUDIT_RICH_KEY   = 'cryptoverse_admin_audit_rich';
const ADMIN_NOTIFS_KEY       = 'cryptoverse_admin_notifs';
const ADMIN_PROFILES_KEY     = 'cryptoverse_admin_profiles';
const ADMIN_ALERTS_KEY       = 'cryptoverse_admin_alerts';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AdminLevel = 1 | 2 | 3 | 4 | 5 | 6;

export const ADMIN_LEVEL_META: Record<AdminLevel, {
  label: string;
  role: string;
  color: string;
  bg: string;
  border: string;
  icon: string;
  description: string;
  canRequest: boolean;
}> = {
  1: { label: 'Level 1', role: 'Content Admin',      color: '#60a5fa', bg: 'rgba(96,165,250,0.12)', border: 'rgba(96,165,250,0.3)',  icon: '📚', description: 'Manages learning content, quizzes, and Academy levels.',       canRequest: true  },
  2: { label: 'Level 2', role: 'Community Admin',    color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.3)', icon: '💬', description: 'Moderates chat, reviews reports, manages community health.',   canRequest: true  },
  3: { label: 'Level 3', role: 'Support Admin',      color: '#34d399', bg: 'rgba(52,211,153,0.12)',  border: 'rgba(52,211,153,0.3)',  icon: '🎧', description: 'Handles user support tickets and dispute resolution.',         canRequest: true  },
  4: { label: 'Level 4', role: 'Competition Admin',  color: '#fb923c', bg: 'rgba(251,146,60,0.12)',  border: 'rgba(251,146,60,0.3)',  icon: '🏆', description: 'Manages trading competitions, brackets, and prize pools.',     canRequest: true  },
  5: { label: 'Level 5', role: 'Economy Admin',      color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)',  icon: '💰', description: 'Oversees financial health, virtual economy, and payouts.',     canRequest: true  },
  6: { label: 'Level 6', role: 'Technical Admin',    color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)',   icon: '⚙️', description: 'System-level access. Assigned by Super Admin only.',          canRequest: false },
};

export const LEVEL_REQUIREMENTS: Record<AdminLevel, {
  label: string;
  checks: { key: string; label: string; threshold: number; unit: string }[];
}> = {
  1: {
    label: 'Content Admin',
    checks: [
      { key: 'academyLevel',    label: 'Academy Level',         threshold: 5,   unit: '' },
      { key: 'daysActive',      label: 'Days Active',           threshold: 30,  unit: 'd' },
      { key: 'quizAvg',         label: 'Quiz Score Average',    threshold: 90,  unit: '%' },
      { key: 'violations',      label: 'Policy Violations (max)',threshold: 0,   unit: '' },
    ],
  },
  2: {
    label: 'Community Admin',
    checks: [
      { key: 'chatMessages',    label: 'Chat Messages',         threshold: 100, unit: '' },
      { key: 'reportsReviewed', label: 'Reports Reviewed',      threshold: 10,  unit: '' },
      { key: 'reputation',      label: 'Reputation Score',      threshold: 80,  unit: '%' },
      { key: 'sentimentScore',  label: 'Positive Sentiment',    threshold: 75,  unit: '%' },
    ],
  },
  3: {
    label: 'Support Admin',
    checks: [
      { key: 'ticketsHandled',  label: 'Support Tickets',       threshold: 50,  unit: '' },
      { key: 'starRating',      label: 'Average Star Rating',   threshold: 4.5, unit: '★' },
      { key: 'resolutionRate',  label: 'Resolution Rate',       threshold: 95,  unit: '%' },
      { key: 'daysActive',      label: 'Days Active',           threshold: 60,  unit: 'd' },
    ],
  },
  4: {
    label: 'Competition Admin',
    checks: [
      { key: 'top10Finishes',   label: 'Top 10% Finishes',      threshold: 3,   unit: '' },
      { key: 'totalTrades',     label: 'Total Trades',          threshold: 500, unit: '' },
      { key: 'noCheatFlags',    label: 'Cheat Flags (max)',      threshold: 0,   unit: '' },
      { key: 'daysActive',      label: 'Days Active',           threshold: 90,  unit: 'd' },
    ],
  },
  5: {
    label: 'Economy Admin',
    checks: [
      { key: 'totalTrades',     label: 'Total Trades',          threshold: 1000, unit: '' },
      { key: 'winRate',         label: 'Win Rate',              threshold: 60,   unit: '%' },
      { key: 'daysActive',      label: 'Days Active',           threshold: 180,  unit: 'd' },
      { key: 'profitFactor',    label: 'Profit Factor',         threshold: 1.5,  unit: 'x' },
    ],
  },
  6: {
    label: 'Technical Admin',
    checks: [],
  },
};

export interface AdminMember {
  id: string;
  userId: string;
  email: string;
  displayName: string;
  avatarSeed: string;
  level: AdminLevel;
  department: string;
  status: 'active' | 'suspended';
  createdAt: string;
  lastActiveAt: string;
  permissions: string[];
  actionsLog: AdminActivityEntry[];
}

export interface AdminActivityEntry {
  id: string;
  adminId: string;
  adminName: string;
  action: string;
  targetLabel: string;
  timestamp: string;
}

// ── Rich Audit Log ─────────────────────────────────────────────────────────────
export type AuditActionType =
  | 'create_admin' | 'delete_admin' | 'suspend_admin' | 'activate_admin'
  | 'approve_request' | 'reject_request'
  | 'ban_user' | 'unban_user' | 'grant_admin' | 'revoke_admin' | 'adjust_plan'
  | 'promote_super_admin' | 'demote_super_admin' | 'change_role'
  | 'approve_payment' | 'reject_payment'
  | 'delete_lesson' | 'edit_lesson' | 'publish_lesson'
  | 'delete_message' | 'warn_user' | 'resolve_report'
  | 'close_ticket' | 'escalate_ticket'
  | 'start_competition' | 'end_competition' | 'disqualify_trader'
  | 'freeze_account' | 'adjust_balance'
  | 'system_config' | 'export_data'
  | 'revert_action';

export interface RichAuditEntry {
  id:         string;
  adminId:    string;
  adminLevel: number;
  adminName:  string;
  action:     AuditActionType;
  targetId:   string;
  targetLabel: string;
  timestamp:  string;
  ipAddress:  string;
  reason:     string;
  status:     'completed' | 'failed' | 'reverted' | 'pending';
  metadata?:  Record<string, unknown>;
  revertable: boolean;
  revertedAt?: string;
  revertedBy?: string;
}

// ── Admin Notifications ────────────────────────────────────────────────────────
export type AdminNotifType =
  | 'admin_request'   // Super Admin only
  | 'system_error'    // Technical Admin
  | 'fraud_alert'     // Economy Admin
  | 'user_report'     // Community Admin
  | 'support_escalation' // Support Admin
  | 'competition_dispute' // Competition Admin
  | 'content_flag';   // Content Admin

export interface AdminNotification {
  id:        string;
  type:      AdminNotifType;
  title:     string;
  message:   string;
  severity:  'info' | 'warning' | 'critical';
  forLevels: number[];   // which admin levels receive this
  read:      boolean;
  timestamp: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
}

// ── Suspicious Pattern Alerts ─────────────────────────────────────────────────
export interface SuspiciousAlert {
  id:          string;
  pattern:     string;
  description: string;
  adminId:     string;
  adminName:   string;
  count:       number;
  firstSeen:   string;
  lastSeen:    string;
  severity:    'low' | 'medium' | 'high';
  dismissed:   boolean;
}

// ── Admin Profile (extended) ──────────────────────────────────────────────────
export interface AdminProfile {
  adminId:              string;
  bio:                  string;
  photoUrl?:            string;
  expertiseTags:        string[];
  twoFaEnabled:         boolean;
  twoFaMethod:          'sms' | 'authenticator' | null;
  twoFaVerified:        boolean;
  weeklySummaryEmail:   boolean;
  notifPreferences:     Record<AdminNotifType, boolean>;
  performanceStats: {
    totalActions:       number;
    avgResponseTimeMin: number;
    resolvedTickets:    number;
    approvedRequests:   number;
    rejectedRequests:   number;
    lastWeekActions:    number;
  };
  joinedAt:  string;
  lastLogin: string;
}

export interface AdminRequest {
  id: string;
  userId: string;
  userEmail: string;
  userDisplayName: string;
  userAvatarSeed: string;
  requestedLevel: AdminLevel;
  status: 'pending' | 'ai_approved' | 'ai_rejected' | 'super_approved' | 'super_rejected';
  aiReport: AiEvaluationReport | null;
  submittedAt: string;
  reviewedAt?: string;
  superAdminNote?: string;
}

export interface AiCheckResult {
  key: string;
  label: string;
  userValue: number;
  threshold: number;
  unit: string;
  passed: boolean;
}

export interface AiEvaluationReport {
  requestedLevel: AdminLevel;
  userId: string;
  checks: AiCheckResult[];
  passed: boolean;
  score: number; // 0-100
  summary: string;
  missingItems: string[];
  evaluatedAt: string;
}

// ── Server roster → AdminMember ───────────────────────────────────────────────
// The six display levels this UI has always used, mapped onto the server's role
// vocabulary. Levels 1, 2 and 4 (Content / Community / Competition) have no
// server role, so nothing can map into them any more — a row can only appear in
// this list if public.users says the account is an admin.
const ROLE_TO_LEVEL: Record<string, AdminLevel> = {
  support_admin:      3,   // Level 3 — Support Admin
  subscription_admin: 5,   // Level 5 — Economy Admin
  super_admin:        6,   // Level 6 — Technical Admin
  founder:            6,
  developer:          6,
};

/** The inverse, for writes: only these levels have a server role to grant. */
const LEVEL_TO_ROLE: Partial<Record<AdminLevel, string>> = {
  3: 'support_admin',
  5: 'subscription_admin',
  6: 'super_admin',
};

/** A server row → the shape this UI renders. `null` when the role is not an admin role. */
function toAdminMember(u: AdminUserRecord): AdminMember | null {
  const level = ROLE_TO_LEVEL[u.role];
  if (!level) return null;
  return {
    id:           u.id,
    userId:       u.id,
    email:        u.email,
    displayName:  u.display_name || u.email.split('@')[0],
    avatarSeed:   u.email,
    level,
    department:   ADMIN_LEVEL_META[level].role,
    // The server's third status ('banned') cannot be expressed by AdminMember,
    // whose union is 'active' | 'suspended'. Both non-active states are "not
    // usable", so banned rows display as suspended rather than as active.
    status:       u.status === 'active' ? 'active' : 'suspended',
    createdAt:    u.created_at,
    lastActiveAt: u.last_seen_at || u.created_at,
    permissions:  [],
    actionsLog:   [],
  };
}

function loadRequests(): AdminRequest[] {
  try { return JSON.parse(localStorage.getItem(ADMIN_REQUESTS_KEY) || '[]'); } catch { return []; }
}
function saveRequests(r: AdminRequest[]) {
  localStorage.setItem(ADMIN_REQUESTS_KEY, JSON.stringify(r));
}
function loadActivity(): AdminActivityEntry[] {
  try { return JSON.parse(localStorage.getItem(ADMIN_ACTIVITY_KEY) || '[]'); } catch { return []; }
}
function saveActivity(a: AdminActivityEntry[]) {
  localStorage.setItem(ADMIN_ACTIVITY_KEY, JSON.stringify(a.slice(0, 1000)));
}
function loadRichAudit(): RichAuditEntry[] {
  try { return JSON.parse(localStorage.getItem(ADMIN_AUDIT_RICH_KEY) || '[]'); } catch { return []; }
}
function saveRichAudit(a: RichAuditEntry[]) {
  localStorage.setItem(ADMIN_AUDIT_RICH_KEY, JSON.stringify(a.slice(0, 2000)));
}
function loadNotifications(): AdminNotification[] {
  try { return JSON.parse(localStorage.getItem(ADMIN_NOTIFS_KEY) || '[]'); } catch { return []; }
}
function saveNotifications(n: AdminNotification[]) {
  localStorage.setItem(ADMIN_NOTIFS_KEY, JSON.stringify(n.slice(0, 500)));
}
function loadAdminProfiles(): Record<string, AdminProfile> {
  try { return JSON.parse(localStorage.getItem(ADMIN_PROFILES_KEY) || '{}'); } catch { return {}; }
}
function saveAdminProfiles(p: Record<string, AdminProfile>) {
  localStorage.setItem(ADMIN_PROFILES_KEY, JSON.stringify(p));
}
function loadAlerts(): SuspiciousAlert[] {
  try { return JSON.parse(localStorage.getItem(ADMIN_ALERTS_KEY) || '[]'); } catch { return []; }
}
function saveAlerts(a: SuspiciousAlert[]) {
  localStorage.setItem(ADMIN_ALERTS_KEY, JSON.stringify(a.slice(0, 200)));
}

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ── Real client IP lookup (cached; falls back to 'unknown' if offline) ────────
let _cachedIp: string | null = null;
function primeIpCache(): void {
  if (_cachedIp) return;
  fetch('https://api.ipify.org?format=json')
    .then(r => r.json())
    .then(d => { if (d?.ip) _cachedIp = d.ip; })
    .catch(() => { /* leave as unknown */ });
}
primeIpCache();
function currentIp(): string {
  return _cachedIp ?? 'unknown';
}

// ── Suspicious pattern detector ───────────────────────────────────────────────
function detectSuspiciousPatterns(entries: RichAuditEntry[]): SuspiciousAlert[] {
  const alerts: SuspiciousAlert[] = loadAlerts();
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour window
  const recent = entries.filter(e => now - new Date(e.timestamp).getTime() < windowMs);

  // Pattern 1: Rapid actions (>10 actions in 1 hour by same admin)
  const byAdmin = new Map<string, RichAuditEntry[]>();
  for (const e of recent) {
    if (!byAdmin.has(e.adminId)) byAdmin.set(e.adminId, []);
    byAdmin.get(e.adminId)!.push(e);
  }
  for (const [adminId, acts] of byAdmin.entries()) {
    if (acts.length > 10) {
      const existing = alerts.find(a => a.pattern === 'rapid_actions' && a.adminId === adminId && !a.dismissed);
      if (!existing) {
        alerts.unshift({
          id:          makeId('alrt'),
          pattern:     'rapid_actions',
          description: `${acts[0].adminName} performed ${acts.length} actions in the last hour`,
          adminId,
          adminName:   acts[0].adminName,
          count:       acts.length,
          firstSeen:   acts[acts.length - 1].timestamp,
          lastSeen:    acts[0].timestamp,
          severity:    acts.length > 20 ? 'high' : 'medium',
          dismissed:   false,
        });
      }
    }
  }

  // Pattern 2: Multiple ban actions
  const banActions = recent.filter(e => e.action === 'ban_user');
  if (banActions.length > 3) {
    const existing = alerts.find(a => a.pattern === 'mass_ban' && !a.dismissed);
    if (!existing) {
      alerts.unshift({
        id:          makeId('alrt'),
        pattern:     'mass_ban',
        description: `${banActions.length} users banned in the last hour`,
        adminId:     banActions[0].adminId,
        adminName:   banActions[0].adminName,
        count:       banActions.length,
        firstSeen:   banActions[banActions.length - 1].timestamp,
        lastSeen:    banActions[0].timestamp,
        severity:    'high',
        dismissed:   false,
      });
    }
  }

  // Pattern 3: Multiple payment rejections
  const rejectPayments = recent.filter(e => e.action === 'reject_payment');
  if (rejectPayments.length > 5) {
    const existing = alerts.find(a => a.pattern === 'mass_payment_reject' && !a.dismissed);
    if (!existing) {
      alerts.unshift({
        id:          makeId('alrt'),
        pattern:     'mass_payment_reject',
        description: `${rejectPayments.length} payments rejected in the last hour`,
        adminId:     rejectPayments[0].adminId,
        adminName:   rejectPayments[0].adminName,
        count:       rejectPayments.length,
        firstSeen:   rejectPayments[rejectPayments.length - 1].timestamp,
        lastSeen:    rejectPayments[0].timestamp,
        severity:    'medium',
        dismissed:   false,
      });
    }
  }

  saveAlerts(alerts);
  return alerts;
}

// ── AI Evaluation Engine ──────────────────────────────────────────────────────
function collectUserStats(userId: string, profile: UserProfile) {
  const daysActive = Math.floor(
    (Date.now() - new Date(profile.joinedAt).getTime()) / 86_400_000,
  );

  // Pull trading data from localStorage
  const tradingRaw = localStorage.getItem('trading_store') || '{}';
  let tradingData: Record<string, unknown> = {};
  try { tradingData = JSON.parse(tradingRaw); } catch { /* ignore */ }

  const history = (tradingData.history as Array<{ action: string; pnl: number }>) ?? [];
  const closedTrades = history.filter(r => r.action === 'close');
  const winners = closedTrades.filter(r => r.pnl > 0);
  const totalTrades = closedTrades.length;
  const winRate = totalTrades > 0 ? (winners.length / totalTrades) * 100 : 0;

  // Profit factor
  const grossProfit = winners.reduce((s, r) => s + r.pnl, 0);
  const grossLoss   = Math.abs(closedTrades.filter(r => r.pnl < 0).reduce((s, r) => s + r.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 2.0 : 0);

  // Academy data
  const academyRaw = localStorage.getItem('academy_store') || '{}';
  let academyData: Record<string, unknown> = {};
  try { academyData = JSON.parse(academyRaw); } catch { /* ignore */ }
  const completedLessons = (academyData.completedLessons as string[] | undefined)?.length ?? 0;
  const academyLevel = Math.floor(completedLessons / 5) + 1;

  // ── Fields without a dedicated real-data store yet ────────────────────────
  // These previously returned flattering fabricated numbers derived from a
  // pseudo-random seed, which meant admin-promotion decisions could be based
  // on invented activity. Until Nations Chat, Reports, Tickets and
  // Competitions expose real per-user aggregates, these honestly report 0 /
  // neutral values so nobody is approved based on fake stats.
  const quizAvg         = 0;
  const violations      = 0;
  const chatMessages    = 0;
  const reportsReviewed = 0;
  const reputation      = 0;
  const sentimentScore  = 0;
  const ticketsHandled  = 0;
  const starRating      = 0;
  const resolutionRate  = 0;
  const top10Finishes   = 0;
  const noCheatFlags    = 0;

  return {
    daysActive,
    academyLevel,
    quizAvg,
    violations,
    chatMessages,
    reportsReviewed,
    reputation,
    sentimentScore,
    ticketsHandled,
    starRating,
    resolutionRate,
    top10Finishes,
    totalTrades,
    noCheatFlags,
    winRate,
    profitFactor,
  } as Record<string, number>;
}

export function runAiEvaluation(
  userId: string,
  profile: UserProfile,
  requestedLevel: AdminLevel,
): AiEvaluationReport {
  const requirements = LEVEL_REQUIREMENTS[requestedLevel];
  const stats = collectUserStats(userId, profile);

  const checks: AiCheckResult[] = requirements.checks.map(req => {
    const userValue = stats[req.key] ?? 0;
    // For "max" checks (violations, cheatFlags), pass if value <= threshold
    const isMaxCheck = req.label.includes('max') || req.key === 'violations' || req.key === 'noCheatFlags';
    const passed = isMaxCheck ? userValue <= req.threshold : userValue >= req.threshold;
    return {
      key:       req.key,
      label:     req.label,
      userValue,
      threshold: req.threshold,
      unit:      req.unit,
      passed,
    };
  });

  const passedCount = checks.filter(c => c.passed).length;
  const totalChecks = checks.length;
  const score       = totalChecks === 0 ? 0 : Math.round((passedCount / totalChecks) * 100);
  const passed      = passedCount === totalChecks && totalChecks > 0;

  const missingItems = checks
    .filter(c => !c.passed)
    .map(c => {
      const isMaxCheck = c.key === 'violations' || c.key === 'noCheatFlags';
      if (isMaxCheck) return `${c.label}: has ${c.userValue} (must be 0)`;
      return `${c.label}: ${c.userValue.toFixed(c.unit === '%' || c.unit === '★' || c.unit === 'x' ? 1 : 0)}${c.unit} (need ${c.threshold}${c.unit})`;
    });

  const meta = ADMIN_LEVEL_META[requestedLevel];
  const summary = passed
    ? `AI evaluation complete. ${profile.displayName} meets all ${totalChecks} requirements for ${meta.role}. Score: ${score}/100. Pre-approved — awaiting Super Admin confirmation.`
    : `AI evaluation complete. ${profile.displayName} meets ${passedCount}/${totalChecks} requirements for ${meta.role}. Score: ${score}/100. ${missingItems.length} item(s) need improvement.`;

  return {
    requestedLevel,
    userId,
    checks,
    passed,
    score,
    summary,
    missingItems,
    evaluatedAt: new Date().toISOString(),
  };
}

// ── Store ─────────────────────────────────────────────────────────────────────
interface AdminManagementState {
  /** Cached server roster — admin roles only. Hydrated by refreshMembers(). */
  members:        AdminMember[];
  requests:       AdminRequest[];
  activity:       AdminActivityEntry[];
  richAudit:      RichAuditEntry[];
  notifications:  AdminNotification[];
  adminProfiles:  Record<string, AdminProfile>;
  alerts:         SuspiciousAlert[];

  // Admin member actions — each one WRITES THROUGH to the server and then
  // re-reads the roster, so the UI can never display a change the API refused.
  refreshMembers: () => Promise<void>;
  createAdmin:    (data: Omit<AdminMember, 'id' | 'createdAt' | 'lastActiveAt' | 'actionsLog'>) => Promise<AdminMember | null>;
  suspendAdmin:   (memberId: string, byAdmin: UserProfile) => Promise<void>;
  activateAdmin:  (memberId: string, byAdmin: UserProfile) => Promise<void>;
  deleteAdmin:    (memberId: string, byAdmin: UserProfile) => Promise<void>;
  /** Local display overlay only — the server row is the source of truth. */
  updateAdmin:    (memberId: string, changes: Partial<AdminMember>) => void;

  // Admin request actions
  submitRequest:  (user: UserProfile, requestedLevel: AdminLevel) => Promise<AdminRequest>;
  approveRequest: (requestId: string, byAdmin: UserProfile) => Promise<void>;
  rejectRequest:  (requestId: string, byAdmin: UserProfile, note: string) => void;

  // Rich audit
  logAction:      (entry: Omit<RichAuditEntry, 'id' | 'ipAddress'>) => void;
  revertAction:   (auditId: string, byAdmin: UserProfile) => void;
  exportAudit:    (format: 'csv' | 'json') => void;

  // Notifications
  pushNotification:   (notif: Omit<AdminNotification, 'id' | 'timestamp' | 'read'>) => void;
  markNotifRead:      (notifId: string) => void;
  markAllNotifsRead:  (adminLevel: number) => void;
  getMyNotifications: (adminLevel: number) => AdminNotification[];

  // Admin profiles
  upsertAdminProfile: (adminId: string, changes: Partial<AdminProfile>) => void;
  getAdminProfile:    (adminId: string) => AdminProfile | null;

  // Alerts
  dismissAlert:  (alertId: string) => void;
  detectAlerts:  () => void;

  // Refresh
  refresh: () => void;
}

export const useAdminManagementStore = create<AdminManagementState>((set, get) => ({
  // Empty until refreshMembers() runs: there is no localStorage copy to load.
  members:       [],
  requests:      loadRequests(),

  refreshMembers: async () => {
    try {
      const all = await fetchAllAdminUsers();
      set({ members: all.map(toAdminMember).filter((m): m is AdminMember => m !== null) });
    } catch (err) {
      console.warn('[adminManagementStore] roster refresh failed', err);
    }
  },
  activity:      loadActivity(),
  richAudit:     loadRichAudit(),
  notifications: loadNotifications(),
  adminProfiles: loadAdminProfiles(),
  alerts:        loadAlerts(),

  // Granting admin access is a SERVER write. The email is the only handle the
  // legacy invite form collects, so it is resolved to a real account first — an
  // invented address can no longer materialise a phantom admin, and the API's own
  // requireAdminWrite check decides whether the change happens at all.
  createAdmin: async ({ email, level }) => {
    const role = LEVEL_TO_ROLE[level];
    if (!role) {
      console.warn(`[adminManagementStore] Level ${level} (${ADMIN_LEVEL_META[level].role}) has no server role — nothing granted.`);
      return null;
    }
    const target = await findAdminUserByEmail(email);
    if (!target) {
      console.warn(`[adminManagementStore] no server account for ${email} — nothing granted.`);
      return null;
    }
    await setAdminUserRole(target.id, role);
    await get().refreshMembers();
    return get().members.find(m => m.id === target.id) ?? null;
  },

  // Suspension is the SERVER column authenticate() enforces. Flipping a local
  // mirror could show "suspended" for an account that could still sign in.
  suspendAdmin: async (memberId, byAdmin) => {
    const target = get().members.find(m => m.id === memberId);
    await setAdminUserStatus(memberId, 'suspended');
    await get().refreshMembers();
    const entry: AdminActivityEntry = {
      id:          makeId('act'),
      adminId:     byAdmin.id,
      adminName:   byAdmin.displayName,
      action:      'Suspended admin account',
      targetLabel: target?.displayName ?? memberId,
      timestamp:   new Date().toISOString(),
    };
    const activity = [entry, ...get().activity];
    saveActivity(activity);
    set({ activity });
  },

  activateAdmin: async (memberId, byAdmin) => {
    const target = get().members.find(m => m.id === memberId);
    await setAdminUserStatus(memberId, 'active');
    await get().refreshMembers();
    const entry: AdminActivityEntry = {
      id:          makeId('act'),
      adminId:     byAdmin.id,
      adminName:   byAdmin.displayName,
      action:      'Activated admin account',
      targetLabel: target?.displayName ?? memberId,
      timestamp:   new Date().toISOString(),
    };
    const activity = [entry, ...get().activity];
    saveActivity(activity);
    set({ activity });
  },

  // "Remove admin" is a ROLE change (→ user), not a row deletion: the account and
  // its history stay, and the API's role check is what actually revokes access.
  deleteAdmin: async (memberId, byAdmin) => {
    const target = get().members.find(m => m.id === memberId);
    await setAdminUserRole(memberId, 'user');
    await get().refreshMembers();
    const entry: AdminActivityEntry = {
      id:          makeId('act'),
      adminId:     byAdmin.id,
      adminName:   byAdmin.displayName,
      action:      'Removed admin access (role → user)',
      targetLabel: target?.displayName ?? memberId,
      timestamp:   new Date().toISOString(),
    };
    const activity = [entry, ...get().activity];
    saveActivity(activity);
    set({ activity });
  },

  // Display-only overlay: nothing is persisted, because the server row it overlays
  // is re-read on every refreshMembers().
  updateAdmin: (memberId, changes) => {
    set({
      members: get().members.map(m => (m.id === memberId ? { ...m, ...changes } : m)),
    });
  },

  submitRequest: async (user, requestedLevel) => {
    // Create a pending request immediately
    const req: AdminRequest = {
      id:               makeId('req'),
      userId:           user.id,
      userEmail:        user.email,
      userDisplayName:  user.displayName,
      userAvatarSeed:   user.avatarSeed,
      requestedLevel,
      status:           'pending',
      aiReport:         null,
      submittedAt:      new Date().toISOString(),
    };
    const requests = [req, ...get().requests];
    saveRequests(requests);
    set({ requests });

    // Simulate AI evaluation delay (2-4 seconds)
    await new Promise(res => setTimeout(res, 2500 + Math.random() * 1500));

    const report = runAiEvaluation(user.id, user, requestedLevel);
    const status = report.passed ? 'ai_approved' : 'ai_rejected';

    const updatedReq = { ...req, status, aiReport: report, reviewedAt: new Date().toISOString() };
    const updatedRequests = get().requests.map(r => r.id === req.id ? updatedReq : r);
    saveRequests(updatedRequests);
    set({ requests: updatedRequests });

    return updatedReq;
  },

  approveRequest: async (requestId, byAdmin) => {
    const req = get().requests.find(r => r.id === requestId);
    if (!req) return;

    const updated = get().requests.map(r =>
      r.id === requestId
        ? { ...r, status: 'super_approved' as const, reviewedAt: new Date().toISOString(), superAdminNote: `Approved by ${byAdmin.displayName}` }
        : r,
    );
    saveRequests(updated);

    // Promotion is a SERVER write (Batch C2.5 · Task 2). The local "promote the
    // user in the admin members list" step is gone: the roster is read back from
    // public.users, so an approval that the API refuses cannot appear as a member.
    const role = LEVEL_TO_ROLE[req.requestedLevel];
    if (!role) {
      console.warn(`[adminManagementStore] Level ${req.requestedLevel} has no server role — request ${requestId} recorded but no access granted.`);
    } else {
      try {
        const target = await findAdminUserByEmail(req.userEmail);
        if (!target) {
          console.warn(`[adminManagementStore] no server account for ${req.userEmail} — no access granted.`);
        } else {
          await setAdminUserRole(target.id, role);
          await get().refreshMembers();
        }
      } catch (err) {
        console.warn('[adminManagementStore] server promotion failed', err);
      }
    }

    const entry: AdminActivityEntry = {
      id:          makeId('act'),
      adminId:     byAdmin.id,
      adminName:   byAdmin.displayName,
      action:      `Approved Level ${req.requestedLevel} admin request`,
      targetLabel: req.userDisplayName,
      timestamp:   new Date().toISOString(),
    };
    const activity = [entry, ...get().activity];
    saveActivity(activity);
    set({ requests: updated, activity });
  },

  rejectRequest: (requestId, byAdmin, note) => {
    const updated = get().requests.map(r =>
      r.id === requestId
        ? { ...r, status: 'super_rejected' as const, reviewedAt: new Date().toISOString(), superAdminNote: note }
        : r,
    );
    saveRequests(updated);
    const req = get().requests.find(r => r.id === requestId);
    const entry: AdminActivityEntry = {
      id:          makeId('act'),
      adminId:     byAdmin.id,
      adminName:   byAdmin.displayName,
      action:      `Rejected Level ${req?.requestedLevel ?? '?'} admin request`,
      targetLabel: req?.userDisplayName ?? requestId,
      timestamp:   new Date().toISOString(),
    };
    const activity = [entry, ...get().activity];
    saveActivity(activity);
    set({ requests: updated, activity });
  },

  logAction: (entry) => {
    const full: RichAuditEntry = { ...entry, id: makeId('aud'), ipAddress: currentIp() };
    const richAudit = [full, ...get().richAudit];
    saveRichAudit(richAudit);
    set({ richAudit });
  },

  revertAction: (auditId, byAdmin) => {
    const richAudit = get().richAudit.map(e =>
      e.id === auditId ? { ...e, status: 'reverted' as const, revertedAt: new Date().toISOString(), revertedBy: byAdmin.displayName } : e,
    );
    saveRichAudit(richAudit);
    const entry: AdminActivityEntry = {
      id: makeId('act'), adminId: byAdmin.id, adminName: byAdmin.displayName,
      action: 'Reverted action', targetLabel: get().richAudit.find(e => e.id === auditId)?.targetLabel ?? auditId,
      timestamp: new Date().toISOString(),
    };
    const activity = [entry, ...get().activity];
    saveActivity(activity);
    set({ richAudit, activity });
  },

  exportAudit: (_format) => { /* handled in UI */ },

  pushNotification: (notif) => {
    const full: AdminNotification = { ...notif, id: makeId('notif'), timestamp: new Date().toISOString(), read: false };
    const notifications = [full, ...get().notifications];
    saveNotifications(notifications);
    set({ notifications });
  },

  markNotifRead: (notifId) => {
    const notifications = get().notifications.map(n => n.id === notifId ? { ...n, read: true } : n);
    saveNotifications(notifications);
    set({ notifications });
  },

  markAllNotifsRead: (adminLevel) => {
    const notifications = get().notifications.map(n =>
      n.forLevels.includes(adminLevel) ? { ...n, read: true } : n,
    );
    saveNotifications(notifications);
    set({ notifications });
  },

  getMyNotifications: (adminLevel) => {
    return get().notifications.filter(n => n.forLevels.includes(adminLevel));
  },

  upsertAdminProfile: (adminId, changes) => {
    const existing = get().adminProfiles[adminId];
    const updated  = { ...(existing ?? {}), ...changes, adminId } as AdminProfile;
    const adminProfiles = { ...get().adminProfiles, [adminId]: updated };
    saveAdminProfiles(adminProfiles);
    set({ adminProfiles });
  },

  getAdminProfile: (adminId) => {
    return get().adminProfiles[adminId] ?? null;
  },

  dismissAlert: (alertId) => {
    const alerts = get().alerts.map(a => a.id === alertId ? { ...a, dismissed: true } : a);
    saveAlerts(alerts);
    set({ alerts });
  },

  detectAlerts: () => {
    const alerts = detectSuspiciousPatterns(get().richAudit);
    set({ alerts });
  },

  refresh: () => {
    // The roster comes from the server now; everything else is still local state.
    void get().refreshMembers();
    set({
      requests:      loadRequests(),
      activity:      loadActivity(),
      richAudit:     loadRichAudit(),
      notifications: loadNotifications(),
      adminProfiles: loadAdminProfiles(),
      alerts:        loadAlerts(),
    });
  },
}));
