/** rateLimiter.ts — Rate limiting + brute force protection. Abstracted behind RateLimiter interface for future server-side swap. */
import type { RateLimitResult, RateLimiter } from './authTypes';
const STORE_KEY = 'cv_rate_limits';
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;
const COOLDOWN_BASE = 30_000;
const COOLDOWN_MULT = 2;
const MAX_COOLDOWNS = 4;
const LOCKOUT_MS = 15 * 60_000;

interface TrackedAttempt { action: string; identifier: string; timestamps: number[]; cooldowns: number; lockedUntil: number; }

const memoryStore = new Map<string, TrackedAttempt>();
function load(): Record<string, TrackedAttempt> {
  const obj: Record<string, TrackedAttempt> = {};
  for (const [k, v] of memoryStore.entries()) {
    obj[k] = v;
  }
  return obj;
}
function save(d: Record<string, TrackedAttempt>) {
  for (const [k, v] of Object.entries(d)) {
    memoryStore.set(k, v);
  }
}
function key(action: string, identifier: string): string { return `${action}:${identifier}`; }

function sha256Email(email: string): string {
  let hash = 0; for (let i = 0; i < email.length; i++) { hash = ((hash << 5) - hash) + email.charCodeAt(i); hash |= 0; }
  return Math.abs(hash).toString(36);
}

export const rateLimiter: RateLimiter = {
  checkRateLimit(action: string, identifier: string): RateLimitResult {
    const k = key(action, sha256Email(identifier));
    const store = load(); const entry = store[k] || { action, identifier, timestamps: [], cooldowns: 0, lockedUntil: 0 };
    const now = Date.now();
    entry.timestamps = entry.timestamps.filter(t => now - t < WINDOW_MS);
    if (entry.lockedUntil > now) { return { allowed: false, message: `Account temporarily locked. Try again in ${Math.ceil((entry.lockedUntil - now) / 60_000)} minutes.`, retryAfterMs: entry.lockedUntil - now }; }
    if (entry.timestamps.length >= MAX_ATTEMPTS) {
      const cd = COOLDOWN_BASE * Math.pow(COOLDOWN_MULT, entry.cooldowns);
      entry.cooldowns = Math.min(entry.cooldowns + 1, MAX_COOLDOWNS);
      if (entry.cooldowns >= MAX_COOLDOWNS) { entry.lockedUntil = now + LOCKOUT_MS; entry.cooldowns = 0; entry.timestamps = []; save(store);
        return { allowed: false, message: `Too many failed attempts. Account locked for ${LOCKOUT_MS / 60_000} minutes.`, retryAfterMs: LOCKOUT_MS }; }
      const last = entry.timestamps[entry.timestamps.length - 1];
      const retry = Math.max(0, cd - (now - last));
      save(store);
      return { allowed: false, message: `Too many attempts. Please wait ${Math.ceil(retry / 1000)} seconds.`, retryAfterMs: retry };
    }
    return { allowed: true };
  },
  recordFailedAttempt(action: string, identifier: string): void {
    const k = key(action, sha256Email(identifier));
    const store = load(); const entry = store[k] || { action, identifier, timestamps: [], cooldowns: 0, lockedUntil: 0 };
    entry.timestamps.push(Date.now()); store[k] = entry; save(store);
  },
  resetRateLimit(action: string, identifier: string): void {
    const k = key(action, sha256Email(identifier));
    const store = load(); delete store[k]; save(store);
  },
  isLockedOut(identifier: string): { locked: boolean; unlockAt?: number; message?: string } {
    const k = key('login', sha256Email(identifier));
    const store = load(); const entry = store[k];
    if (entry && entry.lockedUntil > Date.now()) { return { locked: true, unlockAt: entry.lockedUntil, message: 'Account is temporarily locked.' }; }
    return { locked: false };
  },
};
