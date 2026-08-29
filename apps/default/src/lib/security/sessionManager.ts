/** sessionManager.ts — Enterprise session lifecycle with event-driven validation. */
import type { AuthSession, SessionMetadata, SessionValidationResult } from './authTypes';
import { SESSION_METADATA_VERSION, ABSOLUTE_MAX_AGE_MS, IDLE_TIMEOUT_MS, ACTIVITY_THROTTLE_MS, IDLE_WARNING_MS } from './authTypes';
import { emitAuthEvent } from './authEvents';
import { recordAuthAudit } from './authAudit';

const KEY = 'cryptoverse_auth_session';

export function loadAuthSession(): AuthSession | null { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } }
export function saveAuthSession(s: AuthSession | null): void { if (s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} } else { try { localStorage.removeItem(KEY); } catch {} } }

function h(s: string): string { let hash = 0; for (let i = 0; i < s.length; i++) { hash = ((hash << 5) - hash) + s.charCodeAt(i); hash |= 0; } return Math.abs(hash).toString(36).padStart(8, '0'); }
function browser(): string { const u = navigator.userAgent; if (u.includes('Firefox')) return 'Firefox'; if (u.includes('Edg')) return 'Edge'; if (u.includes('Chrome')) return 'Chrome'; if (u.includes('Safari')) return 'Safari'; return 'Browser'; }
function os(): string { const u = navigator.userAgent; if (u.includes('Windows')) return 'Windows'; if (u.includes('Mac')) return 'macOS'; if (u.includes('iPhone')||u.includes('iPad')) return 'iOS'; if (u.includes('Android')) return 'Android'; if (u.includes('Linux')) return 'Linux'; return 'Unknown'; }
export function getDeviceFingerprint(): { id: string; name: string } { const c = [navigator.userAgent, screen.width+'x'+screen.height, Intl.DateTimeFormat().resolvedOptions().timeZone, navigator.language]; return { id: h(c.join('|')), name: browser() + ' on ' + os() }; }

export function createSession(email: string): AuthSession {
  const now = Date.now(); const { id: deviceId, name: deviceName } = getDeviceFingerprint();
  const meta: SessionMetadata = { version: SESSION_METADATA_VERSION, sessionId: now.toString(36)+'-'+Math.random().toString(36).slice(2,8), deviceId, deviceName, createdAt: now, lastActivityAt: now, expiresAt: now + ABSOLUTE_MAX_AGE_MS, invalidated: false };
  const session: AuthSession = { metadata: meta, email, lastLoginAt: now, failedAttempts: 0, lockedUntil: 0 };
  saveAuthSession(session);
  emitAuthEvent({ type: 'SESSION_CREATED', timestamp: now, sessionId: meta.sessionId, email, deviceId });
  recordAuthAudit({ event: 'SESSION_CREATED', timestamp: now, email, sessionId: meta.sessionId, deviceId, deviceName, success: true });
  recordAuthAudit({ event: 'LOGIN_SUCCESS', timestamp: now, email, sessionId: meta.sessionId, deviceId, deviceName, success: true });
  return session;
}

export function refreshActivity(session: AuthSession): AuthSession { const now = Date.now(); if (now - session.metadata.lastActivityAt < ACTIVITY_THROTTLE_MS) return session; session.metadata.lastActivityAt = now; saveAuthSession(session); return session; }

export function invalidateSession(session: AuthSession, reason: string = 'manual'): void { session.metadata.invalidated = true; saveAuthSession(session); emitAuthEvent({ type: 'SESSION_INVALIDATED', timestamp: Date.now(), sessionId: session.metadata.sessionId, email: session.email, metadata: { reason } }); recordAuthAudit({ event: 'SESSION_INVALIDATED', timestamp: Date.now(), email: session.email, sessionId: session.metadata.sessionId, success: true, reason }); }

export function destroySession(): void { const session = loadAuthSession(); if (session) { emitAuthEvent({ type: 'LOGOUT', timestamp: Date.now(), sessionId: session.metadata.sessionId, email: session.email }); recordAuthAudit({ event: 'LOGOUT', timestamp: Date.now(), email: session.email, sessionId: session.metadata.sessionId, success: true }); } saveAuthSession(null); }

export function validateSession(session: AuthSession | null): SessionValidationResult {
  if (!session) return { valid: false, expired: true, idle: false, idleWarning: false, reason: 'No session' };
  if (session.metadata.invalidated) return { valid: false, expired: true, idle: false, idleWarning: false, reason: 'Session invalidated' };
  const now = Date.now();
  if (now >= session.metadata.expiresAt) { emitAuthEvent({ type: 'SESSION_EXPIRED', timestamp: now, sessionId: session.metadata.sessionId, email: session.email, metadata: { reason: 'absolute_expiry' } }); recordAuthAudit({ event: 'SESSION_EXPIRED', timestamp: now, email: session.email, sessionId: session.metadata.sessionId, success: true, reason: 'absolute_expiry' }); return { valid: false, expired: true, idle: false, idleWarning: false, reason: 'Session expired' }; }
  const idleDuration = now - session.metadata.lastActivityAt;
  if (idleDuration >= IDLE_TIMEOUT_MS) return { valid: false, expired: false, idle: true, idleWarning: false, reason: 'Session idle timeout' };
  if (idleDuration >= IDLE_TIMEOUT_MS - IDLE_WARNING_MS) return { valid: true, expired: false, idle: false, idleWarning: true };
  return { valid: true, expired: false, idle: false, idleWarning: false };
}

let vi: ReturnType<typeof setInterval> | null = null;
export function startSessionValidation(onExpired?: () => void, onIdleWarning?: () => void): void {
  const v = () => { const s = loadAuthSession(); const r = validateSession(s); if (r.expired || r.idle) { onExpired?.(); destroySession(); return; } if (r.idleWarning) onIdleWarning?.(); };
  v(); if (vi) clearInterval(vi); vi = setInterval(v, 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') v(); });
  window.addEventListener('focus', v);
  window.addEventListener('storage', (e: StorageEvent) => { if (e.key === KEY) v(); });
  window.addEventListener('online', v);
}
export function stopSessionValidation(): void { if (vi) { clearInterval(vi); vi = null; } }
export type { SessionValidationResult };
