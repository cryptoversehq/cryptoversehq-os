/**
 * authTypes.ts — Enterprise authentication type definitions.
 *
 * Separates session/security concerns from user profile data.
 * UserProfile stays focused on user identity; AuthSession carries
 * ephemeral authentication state.
 *
 * @version 1.0.0 — Sprint 1B Enterprise Auth
 */

// ── Session Metadata ──────────────────────────────────────────────────────────

export interface SessionMetadata {
  /** Schema version — incremented when shape changes for future migrations. */
  version: number;
  /** Unique session identifier — rotated on every login. */
  sessionId: string;
  /** Opaque device fingerprint hash — for session listing, not identification. */
  deviceId: string;
  /** Human-readable device name: "Chrome on Windows", "Safari on iPhone". */
  deviceName: string;
  /** Date.now() when session was created. */
  createdAt: number;
  /** Updated on user activity (throttled to once per minute). */
  lastActivityAt: number;
  /** createdAt + ABSOLUTE_MAX_AGE. Hard expiry regardless of activity. */
  expiresAt: number;
  /** Whether the session has been explicitly invalidated. */
  invalidated: boolean;
}

export const SESSION_METADATA_VERSION = 1;
export const ABSOLUTE_MAX_AGE_MS = 24 * 60 * 60 * 1000;    // 24 hours
export const IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000;           // 2 hours
export const ACTIVITY_THROTTLE_MS = 60 * 1000;                // 1 minute
export const IDLE_WARNING_MS = 5 * 60 * 1000;                // Warn 5 min before idle timeout

// ── Authentication Session (ephemeral state, separate from UserProfile) ──────

export interface AuthSession {
  /** Session lifecycle metadata. */
  metadata: SessionMetadata;
  /** The email of the authenticated user (denormalised for fast lookup). */
  email: string;
  /** Timestamp of the most recent successful login for this account. */
  lastLoginAt: number;
  /** Number of consecutive failed login attempts since last success. */
  failedAttempts: number;
  /** Timestamp until which login is blocked (0 = not blocked). */
  lockedUntil: number;
}

// ── Auth Events ───────────────────────────────────────────────────────────────

export type AuthEventType =
  | 'SESSION_CREATED'
  | 'SESSION_VALIDATED'
  | 'SESSION_EXPIRED'
  | 'SESSION_IDLE_WARNING'
  | 'SESSION_INVALIDATED'
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'ACCOUNT_LOCKED'
  | 'RATE_LIMITED'
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_RESET_COMPLETED';

export interface AuthEvent {
  type: AuthEventType;
  timestamp: number;
  sessionId?: string;
  email?: string;
  deviceId?: string;
  metadata?: Record<string, unknown>;
}

export type AuthEventListener = (event: AuthEvent) => void;

// ── Rate Limiter Interface (abstraction for future server-side swap) ──────────

export interface RateLimitResult {
  allowed: boolean;
  message?: string;
  retryAfterMs?: number;
}

export interface RateLimiter {
  /** Check if an action is allowed for the given identifier. */
  checkRateLimit(action: string, identifier: string): RateLimitResult;
  /** Record a failed attempt (increment counter, may trigger cooldown). */
  recordFailedAttempt(action: string, identifier: string): void;
  /** Reset the rate limit for an identifier (called on success). */
  resetRateLimit(action: string, identifier: string): void;
  /** Check if an identifier is currently locked out. */
  isLockedOut(identifier: string): { locked: boolean; unlockAt?: number; message?: string };
}

// ── Auth Audit Entry ──────────────────────────────────────────────────────────

export interface AuthAuditEntry {
  id: string;
  event: AuthEventType;
  timestamp: number;
  email?: string;
  sessionId?: string;
  deviceId?: string;
  deviceName?: string;
  ipAddress?: string;
  success: boolean;
  reason?: string;
  metadata?: Record<string, unknown>;
}
