import type { AuthAuditEntry } from './authTypes';
const AUDIT_KEY = 'cryptoverse_auth_audit';
const MAX = 500;
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
export function recordAuthAudit(entry: Omit<AuthAuditEntry, 'id'>): void {
  const e: AuthAuditEntry = { ...entry, id: uid() };
  try { const log = getAuthAuditLog(); log.unshift(e); if (log.length > MAX) log.length = MAX; localStorage.setItem(AUDIT_KEY, JSON.stringify(log)); } catch {}
}
export function getAuthAuditLog(): AuthAuditEntry[] {
  try { return JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]'); } catch { return []; }
}
export function clearAuthAuditLog(): void { localStorage.removeItem(AUDIT_KEY); }
