/**
 * apiManagementService.ts — Secret CRUD + audit log for the API Management page.
 *
 * Wraps taskadeSecretsService.set/delete/list with:
 *  - An audit log (persisted to localStorage) that records who did what
 *  - Result formatting for the AdminApiManagement UI
 *
 * All keys stay server-side — this module only manages alias names and values
 * without ever exposing the raw key in the browser after it's written.
 */
import {
  setSecret,
  deleteSecret,
  listSecretAliases,
  secretExists,
} from './taskadeSecretsService';

// ─── Audit log ────────────────────────────────────────────────────────────────

export type AuditAction = 'add' | 'edit' | 'delete' | 'rotate';

export interface AuditLogEntry {
  id:         string;
  timestamp:  string;   // ISO
  actor:      string;
  action:     AuditAction;
  alias:      string;
  result:     'success' | 'failure';
  error?:     string;
}

const AUDIT_KEY = 'cryptoverse_api_mgmt_audit_v1';
const MAX_AUDIT = 100;

function auditId() {
  return 'audit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

function loadAuditLog(): AuditLogEntry[] {
  try { return JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]'); } catch { return []; }
}

function saveAuditLog(entries: AuditLogEntry[]) {
  try {
    localStorage.setItem(AUDIT_KEY, JSON.stringify(entries.slice(0, MAX_AUDIT)));
  } catch { /* full */ }
}

function addAuditEntry(
  action: AuditAction, alias: string, actor: string,
  result: 'success' | 'failure', error?: string,
): AuditLogEntry {
  const entry: AuditLogEntry = {
    id: auditId(), timestamp: new Date().toISOString(),
    actor, action, alias, result, error,
  };
  const log = [entry, ...loadAuditLog()];
  saveAuditLog(log);
  return entry;
}

// ─── Public CRUD API ──────────────────────────────────────────────────────────

export interface SecretOpResult {
  ok:      boolean;
  alias:   string;
  action:  AuditAction;
  auditId: string;
  error?:  string;
}

/** Add a brand-new secret alias with its value. */
export async function addSecret(alias: string, value: string, actor: string): Promise<SecretOpResult> {
  const ok = await setSecret(alias, value);
  const entry = addAuditEntry('add', alias, actor, ok ? 'success' : 'failure', ok ? undefined : 'setSecret returned false');
  return { ok, alias, action: 'add', auditId: entry.id, error: entry.error };
}

/** Edit (overwrite) the value for an existing secret alias. */
export async function editSecret(alias: string, value: string, actor: string): Promise<SecretOpResult> {
  const ok = await setSecret(alias, value);
  const entry = addAuditEntry('edit', alias, actor, ok ? 'success' : 'failure', ok ? undefined : 'setSecret returned false');
  return { ok, alias, action: 'edit', auditId: entry.id, error: entry.error };
}

/** Rotate (replace) the value for an existing secret alias (semantically same as edit). */
export async function rotateSecret(alias: string, value: string, actor: string): Promise<SecretOpResult> {
  const ok = await setSecret(alias, value);
  const entry = addAuditEntry('rotate', alias, actor, ok ? 'success' : 'failure', ok ? undefined : 'setSecret returned false');
  return { ok, alias, action: 'rotate', auditId: entry.id, error: entry.error };
}

/** Delete a secret alias from Space Settings. */
export async function removeSecret(alias: string, actor: string): Promise<SecretOpResult> {
  const ok = await deleteSecret(alias);
  const entry = addAuditEntry('delete', alias, actor, ok ? 'success' : 'failure', ok ? undefined : 'deleteSecret returned false');
  return { ok, alias, action: 'delete', auditId: entry.id, error: entry.error };
}

/** Check what aliases exist server-side. */
export async function fetchExistingAliases(): Promise<string[]> {
  return listSecretAliases();
}

/** Check whether a secret alias exists server-side. */
export async function aliasExists(alias: string): Promise<boolean> {
  return secretExists(alias);
}

// ─── Audit log read API ───────────────────────────────────────────────────────

/** Get the most recent N audit log entries (newest first). */
export function getRecentAuditLog(limit = 5): AuditLogEntry[] {
  return loadAuditLog().slice(0, limit);
}

/** Get ALL audit log entries (newest first). */
export function getAllAuditLog(): AuditLogEntry[] {
  return loadAuditLog();
}

/** Clear the audit log. */
export function clearAuditLog(): void {
  saveAuditLog([]);
}
