// build-nudge: 2026-07-06T redeploy trigger — see Task 45/46 verification
/**
 * userMigrationService.ts — CryptoVerse HQ
 *
 * Priority-1 migration: moves legacy localStorage user/admin data into the
 * shared Taskade Users project (3dMq65zUi1A7ayiC) so both the old
 * (email/password, authStore.ts) and new (OTP, authApi.ts) login systems
 * read from the same source of truth.
 *
 * Migrates:
 *   cryptoverse_users                      → user nodes (email, password hash, role)
 *   cryptoverse_super_admins               → node role = 'super_admin'
 *   cryptoverse_banned_users                → node @cv_status = 'banned'
 *   cryptoverse_suspended_users             → node @cv_status = 'suspended'
 *   cryptoverse_admin_section_permissions   → node @cv_sections
 *
 * Design:
 *   - The DB is the source of truth going forward. Every write path here
 *     also mirrors the change into the existing localStorage keys, which
 *     continue to act as a synchronous read cache AND the offline fallback
 *     if the Taskade API is unreachable (per the explicit fallback
 *     requirement — nothing here ever throws out of a public function).
 *   - Migration is idempotent: re-running it is safe. Users already present
 *     in the DB are left untouched (DB wins once a record exists there).
 *   - No component/store needs to change how it reads localStorage — this
 *     module only keeps that cache fresh from the DB in the background.
 */

import {
  findUserByEmail,
  fetchAllUsers,
  migrateLegacyUser,
  updateUserStatus,
  updateUserSections,
  updateUserRole,
  UserRecord,
  UserStatus,
} from './authApi';
import { hashPassword as hashPasswordPbkdf2 } from './passwordHash';

// ── Local storage keys (must match authStore.ts / adminPortalStore.ts) ───────
const USERS_KEY        = 'cryptoverse_users';
const SUPER_ADMINS_KEY = 'cryptoverse_super_admins';
const BANNED_KEY       = 'cryptoverse_banned_users';
const SUSPENDED_KEY    = 'cryptoverse_suspended_users';
const SECTIONS_KEY     = 'cryptoverse_admin_section_permissions';
/** Success flag for the bulk migration, per spec: cryptoverse_users_migrated: true */
const MIGRATED_FLAG_KEY = 'cryptoverse_users_migrated';

interface LegacyUserEntry {
  password: string;
  profile: {
    id: string;
    email: string;
    displayName: string;
    role?: 'user' | 'admin' | 'super_admin';
    isAdmin?: boolean;
    joinedAt?: string;
  };
}

function readJson<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function writeJson(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* quota — ignore, DB write already attempted */ }
}

function getLegacyUsers(): Record<string, LegacyUserEntry> {
  return readJson(USERS_KEY, {} as Record<string, LegacyUserEntry>);
}

/** Ensure a password value is hashed before it's written to the DB. */
async function ensureHashed(password: string): Promise<string> {
  // Preserve existing PBKDF2 hashes and legacy SHA-256 hex hashes unchanged;
  // upgrade anything else (plaintext) to PBKDF2-SHA256.
  const alreadyHashed = password.startsWith('pbkdf2$') || /^[0-9a-f]{64}$/.test(password);
  return alreadyHashed ? password : hashPasswordPbkdf2(password);
}

// ─────────────────────────────────────────────────────────────────────────────
// BULK MIGRATION — cryptoverse_users (+ super-admins / bans / suspensions /
// section permissions) → Taskade Users project
// ─────────────────────────────────────────────────────────────────────────────

export interface MigrationResult {
  migrated: number;
  skipped:  number;
  failed:   number;
}

/**
 * Reads every account in cryptoverse_users (localStorage), hashes any
 * still-plaintext password, and writes each one to the Taskade Database
 * (project 3dMq65zUi1A7ayiC) that authApi.ts reads from. Safe to call
 * repeatedly — already-migrated emails are skipped (DB wins once a record
 * exists there). Runs fully in the background; never throws.
 */
export async function migrateUsersToDatabase(): Promise<MigrationResult> {
  const result: MigrationResult = { migrated: 0, skipped: 0, failed: 0 };

  const legacyUsers = getLegacyUsers();
  const emails = Object.keys(legacyUsers);
  if (emails.length === 0) return result;

  const bans      = new Set(readJson<string[]>(BANNED_KEY, []));
  const suspended = new Set(readJson<string[]>(SUSPENDED_KEY, []));
  const supers    = new Set(readJson<string[]>(SUPER_ADMINS_KEY, []));
  const sectionsList = readJson<Array<{ email: string; sections: string[] }>>(SECTIONS_KEY, []);
  const sectionsByEmail = new Map(sectionsList.map(s => [s.email, s.sections]));

  // Pull the current DB roster once so we don't issue one GET per user.
  let dbUsers: UserRecord[] = [];
  try { dbUsers = await fetchAllUsers(); } catch { /* DB unreachable — everything stays local-only for now */ }
  const dbEmails = new Set(dbUsers.map(u => u.email.toLowerCase()));

  for (const email of emails) {
    const key = email.toLowerCase();
    try {
      if (dbEmails.has(key)) { result.skipped++; continue; }

      const entry = legacyUsers[email];
      const profile = entry.profile;
      const role: 'user' | 'admin' | 'super_admin' =
        supers.has(email) ? 'super_admin' : (profile.role ?? (profile.isAdmin ? 'admin' : 'user'));
      const status: UserStatus = bans.has(email) ? 'banned' : suspended.has(email) ? 'suspended' : 'active';
      const sections = sectionsByEmail.get(email) ?? [];
      const passwordHash = await ensureHashed(entry.password || '');

      await migrateLegacyUser({
        email:        profile.email || email,
        passwordHash,
        fullName:     profile.displayName || email.split('@')[0],
        role,
        status,
        sections,
        createdAt:    profile.joinedAt || new Date().toISOString(),
      });
      result.migrated++;
    } catch {
      result.failed++;
    }
  }

  return result;
}

/** Runs the bulk migration exactly once per browser (flag in localStorage), fire-and-forget. */
export function runBulkMigrationOnce(): void {
  try {
    if (localStorage.getItem(MIGRATED_FLAG_KEY) === 'true') return;
  } catch { return; }

  migrateUsersToDatabase()
    .then(res => {
      try { localStorage.setItem(MIGRATED_FLAG_KEY, 'true'); } catch { /* ignore */ }
      if (res.migrated > 0) {
        console.log(`✅ [userMigrationService] Migrated ${res.migrated} legacy user(s) to the shared database (${res.skipped} already present, ${res.failed} failed).`);
      }
    })
    .catch(() => { /* leave the flag unset so it retries next load */ });
}

/** Whether the bulk migration has completed successfully on this browser. */
export function isUsersMigrated(): boolean {
  try { return localStorage.getItem(MIGRATED_FLAG_KEY) === 'true'; } catch { return false; }
}

/** @deprecated use migrateUsersToDatabase — kept as an alias for any older callers. */
export const migrateAllLegacyUsers = migrateUsersToDatabase;

/**
 * Ensures a single email exists in the DB — called right after a successful
 * legacy (localStorage) login, so that account's very next login goes
 * through the modern OTP-backed path instead of the fallback.
 */
export async function ensureUserMigrated(email: string, plainOrHashedPassword: string): Promise<void> {
  try {
    const key = email.toLowerCase().trim();
    const existing = await findUserByEmail(key);
    if (existing) return; // already migrated

    const legacyUsers = getLegacyUsers();
    const entry = legacyUsers[key];
    if (!entry) return;

    const bans      = new Set(readJson<string[]>(BANNED_KEY, []));
    const suspended = new Set(readJson<string[]>(SUSPENDED_KEY, []));
    const supers    = new Set(readJson<string[]>(SUPER_ADMINS_KEY, []));
    const sectionsList = readJson<Array<{ email: string; sections: string[] }>>(SECTIONS_KEY, []);
    const sectionsByEmail = new Map(sectionsList.map(s => [s.email, s.sections]));

    const profile = entry.profile;
    const role: 'user' | 'admin' | 'super_admin' =
      supers.has(key) ? 'super_admin' : (profile.role ?? (profile.isAdmin ? 'admin' : 'user'));
    const status: UserStatus = bans.has(key) ? 'banned' : suspended.has(key) ? 'suspended' : 'active';

    await migrateLegacyUser({
      email:        profile.email || key,
      passwordHash: await ensureHashed(plainOrHashedPassword),
      fullName:     profile.displayName || key.split('@')[0],
      role,
      status,
      sections:     sectionsByEmail.get(key) ?? [],
      createdAt:    profile.joinedAt || new Date().toISOString(),
    });
  } catch {
    // DB unreachable — the account still works fine via the localStorage fallback.
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN CACHE REFRESH — pulls role/status/sections from the DB and mirrors
// them into the localStorage keys that the (synchronous) admin UI reads:
// cryptoverse_super_admins, cryptoverse_banned_users, cryptoverse_suspended_users,
// cryptoverse_admin_section_permissions.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Refreshes the local admin-data cache from the DB. Call this whenever the
 * admin user list is loaded (adminPortalStore.loadUsers already fetches the
 * full roster, so this is cheap to piggy-back on). Never throws — if the DB
 * is unreachable, existing localStorage values are left exactly as they are.
 */
export async function refreshAdminCacheFromDb(dbUsersIn?: UserRecord[]): Promise<void> {
  try {
    const dbUsers = dbUsersIn ?? await fetchAllUsers();
    if (dbUsers.length === 0) return;

    const supers    = new Set(readJson<string[]>(SUPER_ADMINS_KEY, []));
    const bans      = new Set(readJson<string[]>(BANNED_KEY, []));
    const suspended = new Set(readJson<string[]>(SUSPENDED_KEY, []));
    const sectionsList = readJson<Array<{ email: string; sections: string[] }>>(SECTIONS_KEY, []);
    const sectionsMap = new Map(sectionsList.map(s => [s.email, s.sections]));

    for (const u of dbUsers) {
      const email = u.email.toLowerCase();
      if (u.role === 'super_admin') supers.add(email); else supers.delete(email);
      if (u.status === 'banned') bans.add(email); else bans.delete(email);
      if (u.status === 'suspended') suspended.add(email); else suspended.delete(email);
      if (u.sections && u.sections.length > 0) sectionsMap.set(email, u.sections);
    }

    writeJson(SUPER_ADMINS_KEY, [...supers]);
    writeJson(BANNED_KEY, [...bans]);
    writeJson(SUSPENDED_KEY, [...suspended]);
    writeJson(SECTIONS_KEY, [...sectionsMap.entries()].map(([email, sections]) => ({ email, sections })));
  } catch {
    // DB unreachable — localStorage cache stays as the fallback, untouched.
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WRITE-THROUGH HELPERS — used by adminPortalStore.ts so every admin action
// updates the DB (best-effort) in addition to the existing localStorage write.
// ─────────────────────────────────────────────────────────────────────────────

export async function setSuperAdminInDb(email: string, isSuper: boolean): Promise<void> {
  try { await updateUserRole(email, isSuper ? 'super_admin' : 'admin'); } catch { /* fallback already applied locally */ }
}

export async function setUserStatusInDb(email: string, status: UserStatus): Promise<void> {
  try { await updateUserStatus(email, status); } catch { /* fallback already applied locally */ }
}

export async function setAdminSectionsInDb(email: string, sections: string[]): Promise<void> {
  try { await updateUserSections(email, sections); } catch { /* fallback already applied locally */ }
}
