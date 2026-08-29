import { cloudDataLayer } from './cloudData';

// ─── Email Verification — Real Email via Taskade Automation ───────────────────
// OTPs are generated here in the browser, stored in memory (5 min TTL),
// and delivered to the user's inbox by the CryptoVerse HQ Taskade automation
// flows which call Gmail's API under the hood.

const OTP_LENGTH  = 6;
const OTP_TTL_MS  = 5 * 60 * 1_000; // 5 minutes

// ─── Rate-limit / lockout store ───────────────────────────────────────────────
// Tracks failed OTP attempts per email to lock out after 3 consecutive failures.
const MAX_ATTEMPTS  = 3;
const LOCKOUT_MS    = 15 * 60 * 1_000; // 15 minutes

interface AttemptRecord {
  count:      number;
  lockedUntil: number | null; // epoch ms, or null if not locked
}
const attemptStore: Record<string, AttemptRecord> = {};

function getAttemptRecord(email: string): AttemptRecord {
  const key = email.toLowerCase().trim();
  if (!attemptStore[key]) attemptStore[key] = { count: 0, lockedUntil: null };
  return attemptStore[key];
}

/** Returns true if the email is currently locked out, and the remaining ms. */
export function getLockoutStatus(email: string): { locked: boolean; remainingMs: number } {
  const rec = getAttemptRecord(email);
  if (rec.lockedUntil && Date.now() < rec.lockedUntil) {
    return { locked: true, remainingMs: rec.lockedUntil - Date.now() };
  }
  // Auto-reset after lockout expires
  if (rec.lockedUntil && Date.now() >= rec.lockedUntil) {
    rec.count      = 0;
    rec.lockedUntil = null;
  }
  return { locked: false, remainingMs: 0 };
}

/** Record a failed attempt; locks out after MAX_ATTEMPTS. Returns updated status. */
export function recordFailedAttempt(email: string): { locked: boolean; attemptsLeft: number } {
  const rec   = getAttemptRecord(email);
  rec.count  += 1;
  if (rec.count >= MAX_ATTEMPTS) {
    rec.lockedUntil = Date.now() + LOCKOUT_MS;
    return { locked: true, attemptsLeft: 0 };
  }
  return { locked: false, attemptsLeft: MAX_ATTEMPTS - rec.count };
}

/** Clear attempt counter after a successful verification. */
export function clearAttempts(email: string): void {
  const key = email.toLowerCase().trim();
  delete attemptStore[key];
}

// Webhook endpoints (CryptoVerse HQ automation flows)
// CryptoVerse — Send OTP Email (verification + reset combined)
const SEND_OTP_FLOW_ID = '01KJE0M3TJC8FJSZM6DJ2JPFRY';
// CryptoVerse HQ - Verify Email (dedicated sign-up / social verification)
const VERIFY_EMAIL_FLOW_ID = '01KS9X7T33YQVVGYNJ98F3KMS6';
// CryptoVerse - Password Reset Confirmation
const RESET_CONF_FLOW_ID = '01KJE0M7X4SYEF7XYXB9DSEMK7';

export type OtpPurpose = 'verification' | 'reset';

interface OtpRecord {
  code:      string;
  email:     string;
  purpose:   OtpPurpose;
  expiresAt: number;
}

// Per-purpose in-memory stores (cleared on page reload — acceptable for SPA)
const otpStore: Partial<Record<OtpPurpose, OtpRecord>> = {};

/** Generate a random N-digit OTP string */
function generateCode(length: number): string {
  return Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');
}

/**
 * Send a real OTP email via the Taskade automation webhook.
 * The webhook calls Gmail and delivers a branded HTML email to the user.
 */
export async function sendVerificationEmail(
  email: string,
  purpose: OtpPurpose = 'verification',
  displayName = '',
): Promise<{ ok: boolean; error?: string }> {
  const code = generateCode(OTP_LENGTH);

  // Store locally for later verification
  otpStore[purpose] = {
    code,
    email:     email.toLowerCase().trim(),
    purpose,
    expiresAt: Date.now() + OTP_TTL_MS,
  };

  // Route verification emails through the dedicated Verify Email flow,
  // and password-reset OTPs through the combined Send OTP flow.
  const flowId = purpose === 'verification' ? VERIFY_EMAIL_FLOW_ID : SEND_OTP_FLOW_ID;

  try {
    await cloudDataLayer.invokeWebhook(flowId, { email, code, purpose, displayName });
    return { ok: true };
  } catch (err) {
    console.error('[OTP] Network error', err);
    return { ok: false, error: 'Network error. Please check your connection.' };
  }
}

/** Validate an OTP entered by the user. Enforces lockout after 3 wrong attempts. */
export function verifyOtp(
  email:       string,
  enteredCode: string,
  purpose:     OtpPurpose = 'verification',
): { valid: boolean; reason?: string; locked?: boolean; remainingMs?: number } {
  // Check lockout first
  const lockout = getLockoutStatus(email);
  if (lockout.locked) {
    const mins = Math.ceil(lockout.remainingMs / 60_000);
    return {
      valid:       false,
      locked:      true,
      remainingMs: lockout.remainingMs,
      reason:      `Too many failed attempts. Try again in ${mins} minute${mins !== 1 ? 's' : ''}.`,
    };
  }

  const record = otpStore[purpose];

  if (!record) {
    return { valid: false, reason: 'No code was sent. Please request a new one.' };
  }
  if (record.email !== email.toLowerCase().trim()) {
    return { valid: false, reason: 'Code was sent to a different email address.' };
  }
  if (Date.now() > record.expiresAt) {
    delete otpStore[purpose];
    return { valid: false, reason: 'Code has expired. Please request a new one.' };
  }
  if (enteredCode.trim() !== record.code) {
    const { locked, attemptsLeft } = recordFailedAttempt(email);
    if (locked) {
      return {
        valid:  false,
        locked: true,
        remainingMs: LOCKOUT_MS,
        reason: 'Too many failed attempts. Your account is locked for 15 minutes.',
      };
    }
    return {
      valid:  false,
      reason: `Invalid code. ${attemptsLeft} attempt${attemptsLeft !== 1 ? 's' : ''} remaining.`,
    };
  }

  delete otpStore[purpose]; // invalidate after use
  clearAttempts(email);     // reset counter on success
  return { valid: true };
}

/**
 * Send a "password changed successfully" confirmation email.
 * Called after the password is updated in the store.
 */
export async function sendPasswordChangedEmail(
  email:       string,
  displayName = '',
): Promise<void> {
  try {
    await cloudDataLayer.invokeWebhook(RESET_CONF_FLOW_ID, { email, displayName });
  } catch {
    // Fire-and-forget — non-critical
  }
}

/** @deprecated kept for backward-compatibility with any remaining callers */
export function getLastSentCode(): string | null {
  return null;
}

/** Validate email format: must contain @ and at least one dot after @ */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
