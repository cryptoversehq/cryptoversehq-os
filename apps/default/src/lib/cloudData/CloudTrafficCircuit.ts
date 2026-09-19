/**
 * CloudTrafficCircuit.ts — P0.1b: stop hammering a rate-limited / unreachable cloud.
 *
 * WHY: after the payload guard landed, the remaining failures were transport-level
 * (`ERR_CONNECTION_TIMED_OUT`, `ERR_CONNECTION_RESET`). Those are genuinely transient,
 * so the offline queue retries them with backoff — which is correct — but when the
 * proxy is throttling us, retrying every store write keeps the throttle alive and
 * burns the user's data allowance for nothing.
 *
 * This is a standard circuit breaker, kept deliberately small and PURE so it can be
 * unit-tested with an injected clock (no timers, no globals, no I/O):
 *
 *   closed    → writes flow. Success resets the failure count.
 *   open      → writes are refused locally for `openMs` and the caller gets a
 *               RETRYABLE error, so queued entries stay queued and come back after
 *               the pause instead of being dead-lettered.
 *   half-open → the window elapsed, the next write is let through to test the water;
 *               success closes the circuit, failure re-opens it immediately.
 *
 * The refusal message deliberately contains no 4xx status, so
 * OfflineQueue.isPermanentWriteFailure() does NOT dead-letter those entries.
 */

export interface CloudTrafficCircuitOptions {
  /** Consecutive transport failures that open the circuit. Default 3. */
  failureThreshold?: number;
  /** How long to stay open. Default 5 minutes. */
  openMs?: number;
  /** Clock injection for tests. Defaults to Date.now. */
  now?: () => number;
}

export class CloudTrafficCircuit {
  private readonly failureThreshold: number;
  private readonly openMs: number;
  private readonly now: () => number;

  private failures = 0;
  /**
   * When the window opened. `null` means "no window" — deliberately NOT 0, because 0
   * is a legitimate clock value (and a real sentinel collision silently disabled the
   * breaker in the first version of this class; the unit test caught it).
   */
  private openedAt: number | null = null;

  constructor(options: CloudTrafficCircuitOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 3;
    this.openMs = options.openMs ?? 300_000;
    this.now = options.now ?? (() => Date.now());
  }

  /** True while writes are refused locally. */
  get isOpen(): boolean {
    if (this.openedAt === null) return false;
    // Window elapsed → half-open. `openedAt` is intentionally NOT cleared, so a
    // failure from the trial write re-opens at once instead of after N more failures.
    return this.now() - this.openedAt < this.openMs;
  }

  /** Milliseconds left in the pause (0 when closed/half-open). */
  remainingMs(): number {
    if (this.openedAt === null) return 0;
    return Math.max(0, this.openMs - (this.now() - this.openedAt));
  }

  /** A write completed — the endpoint is healthy again. */
  recordSuccess(): void {
    this.failures = 0;
    this.openedAt = null;
  }

  /** A transport failure (not a 4xx the server actually answered with). */
  recordFailure(): void {
    this.failures += 1;
    if (this.failures >= this.failureThreshold) {
      this.openedAt = this.now();
    }
  }

  /** Diagnostics for logging. */
  snapshot(): { failures: number; open: boolean; remainingMs: number } {
    return { failures: this.failures, open: this.isOpen, remainingMs: this.remainingMs() };
  }
}

/**
 * The message used when the circuit refuses a write. Kept retryable on purpose: no
 * 4xx status, so the offline queue backs off and retries after the pause instead of
 * dead-lettering the entry.
 */
export function circuitPauseMessage(account: string, msRemaining: number): string {
  const seconds = Math.ceil(msRemaining / 1000);
  return `Cloud sync paused for ${account} — the Taskade API failed repeatedly, retrying in ~${seconds}s (circuit breaker, not a permanent error).`;
}
