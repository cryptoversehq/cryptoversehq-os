import { cloudDataLayer } from './cloudData';

// OTP issuance and verification are owned by authApi.ts. This compatibility
// module deliberately never accepts, generates, or stores a browser OTP.
const MAX_ATTEMPTS = 3;
const LOCKOUT_MS = 15 * 60 * 1_000;

interface AttemptRecord {
  count: number;
  lockedUntil: number | null;
}

const attemptStore: Record<string, AttemptRecord> = {};

function getAttemptRecord(email: string): AttemptRecord {
  const key = email.toLowerCase().trim();
  if (!attemptStore[key]) attemptStore[key] = { count: 0, lockedUntil: null };
  return attemptStore[key];
}

export function getLockoutStatus(email: string): { locked: boolean; remainingMs: number } {
  const record = getAttemptRecord(email);
  if (record.lockedUntil !== null && Date.now() < record.lockedUntil) {
    return { locked: true, remainingMs: record.lockedUntil - Date.now() };
  }
  if (record.lockedUntil !== null) {
    record.count = 0;
    record.lockedUntil = null;
  }
  return { locked: false, remainingMs: 0 };
}

export function recordFailedAttempt(email: string): { locked: boolean; attemptsLeft: number } {
  const record = getAttemptRecord(email);
  record.count += 1;
  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOCKOUT_MS;
    return { locked: true, attemptsLeft: 0 };
  }
  return { locked: false, attemptsLeft: MAX_ATTEMPTS - record.count };
}

export function clearAttempts(email: string): void {
  delete attemptStore[email.toLowerCase().trim()];
}

export type OtpPurpose = 'verification' | 'reset';

/**
 * @deprecated Use authApi.createPendingUser/updateUserOtp plus authApi.sendOtpEmail.
 * Keeping this function prevents silent callers from treating a client-generated
 * OTP as valid. It never invokes an email flow with a code supplied by the browser.
 */
export async function sendVerificationEmail(
  _email: string,
  _purpose: OtpPurpose = 'verification',
  _displayName = '',
): Promise<{ ok: boolean; error?: string }> {
  return {
    ok: false,
    error: 'Legacy browser OTP is disabled. Use the server-backed authentication flow.',
  };
}

/**
 * @deprecated Verification must be performed by authApi.verifyOtp against the
 * server-backed user record. No browser-held OTP can be accepted here.
 */
export function verifyOtp(
  _email: string,
  _enteredCode: string,
  _purpose: OtpPurpose = 'verification',
): { valid: boolean; reason?: string; locked?: boolean; remainingMs?: number } {
  return {
    valid: false,
    reason: 'Legacy browser OTP verification is disabled. Use the server-backed authentication flow.',
  };
}

const RESET_CONF_FLOW_ID = '01KJE0M7X4SYEF7XYXB9DSEMK7';

export async function sendPasswordChangedEmail(email: string, displayName = ''): Promise<void> {
  try {
    await cloudDataLayer.invokeWebhook(RESET_CONF_FLOW_ID, { email, displayName });
  } catch {
    // Confirmation delivery is non-critical to the password update.
  }
}

/** @deprecated OTP codes are intentionally never exposed to callers. */
export function getLastSentCode(): string | null {
  return null;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
