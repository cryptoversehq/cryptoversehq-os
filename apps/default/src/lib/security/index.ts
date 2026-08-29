export { rateLimiter } from './rateLimiter';
export { createSession, refreshActivity, invalidateSession, destroySession, validateSession, loadAuthSession, saveAuthSession, startSessionValidation, stopSessionValidation, getDeviceFingerprint } from './sessionManager';
export { onAuthEvent, onAnyAuthEvent, emitAuthEvent, hasAuthEventListeners } from './authEvents';
export { recordAuthAudit, getAuthAuditLog, clearAuthAuditLog } from './authAudit';
export type { RateLimiter, RateLimitResult, AuthSession, AuthEvent, AuthEventType, AuthEventListener, AuthAuditEntry, SessionMetadata } from './authTypes';
export { SESSION_METADATA_VERSION, ABSOLUTE_MAX_AGE_MS, IDLE_TIMEOUT_MS } from './authTypes';
