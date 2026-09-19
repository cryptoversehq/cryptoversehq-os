export interface OfflineQueueEntry<T = unknown> {
  id: string;
  priority: number;
  operation: 'write' | 'update' | 'delete';
  payload: T;
  queuedAt: string;
  attempts: number;
  nextAttemptAt: number;
  maxAttempts: number;
}

const QUEUE_KEY = 'cv_cloud_offline_queue_v2';
const DEAD_KEY = 'cv_cloud_dead_letters_v2';

/**
 * True when retrying the same entry cannot possibly succeed.
 *
 * `PermanentCloudWriteError` is thrown by TaskadeCloudProvider for an oversized body;
 * the status pattern covers raw transport failures, whose message carries the HTTP
 * status (platformTransport reports "…failed: 413 <path>"). Only 400/404/413/422 are
 * treated as permanent — 401/403 stay retryable because a session refresh genuinely
 * fixes those.
 */
function isPermanentWriteFailure(error: unknown): boolean {
  if ((error as { name?: string })?.name === 'PermanentCloudWriteError') return true;
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /\b(400|404|413|422)\b/.test(message);
}

export class OfflineQueue<T = unknown> {
  private entries: OfflineQueueEntry<T>[] = this.load(QUEUE_KEY);
  private deadLetters: OfflineQueueEntry<T>[] = this.load(DEAD_KEY);

  enqueue(entry: Omit<OfflineQueueEntry<T>, 'id' | 'queuedAt' | 'attempts' | 'nextAttemptAt'>): string {
    const signature = JSON.stringify({ operation: entry.operation, payload: entry.payload });
    const existing = this.entries.find(item => JSON.stringify({ operation: item.operation, payload: item.payload }) === signature);
    if (existing) {
      existing.priority = Math.max(existing.priority, entry.priority);
      existing.nextAttemptAt = Date.now();
      this.persist();
      return existing.id;
    }
    const item: OfflineQueueEntry<T> = { ...entry, id: crypto.randomUUID(), queuedAt: new Date().toISOString(), attempts: 0, nextAttemptAt: Date.now() };
    this.entries.push(item);
    this.persist();
    return item.id;
  }

  async drain(handler: (entry: OfflineQueueEntry<T>) => Promise<void>): Promise<{ completed: number; failed: number }> {
    const ready = this.entries.filter(entry => entry.nextAttemptAt <= Date.now()).sort((a, b) => b.priority - a.priority || a.queuedAt.localeCompare(b.queuedAt));
    let completed = 0;
    let failed = 0;
    for (const entry of ready) {
      try {
        await handler(entry);
        this.entries = this.entries.filter(item => item.id !== entry.id);
        completed += 1;
      } catch (error) {
        entry.attempts += 1;
        failed += 1;
        // P0 — permanent failures are not retried. A payload the server refuses on
        // size (413), or a malformed/missing write (400/404/422), can never succeed
        // by trying again; retrying it forever is what produced the request storm.
        if (isPermanentWriteFailure(error) || entry.attempts >= entry.maxAttempts) {
          this.entries = this.entries.filter(item => item.id !== entry.id);
          this.deadLetters.push(entry);
          // Bounded: dead letters are persisted to localStorage as well, and an
          // unbounded list would eventually exhaust the storage quota.
          if (this.deadLetters.length > 50) this.deadLetters = this.deadLetters.slice(-50);
        } else {
          entry.nextAttemptAt = Date.now() + Math.min(300_000, 1000 * 2 ** entry.attempts);
        }
      }
    }
    this.persist();
    return { completed, failed };
  }

  recover(): OfflineQueueEntry<T>[] {
    return [...this.entries];
  }

  get length(): number { return this.entries.length; }
  get deadLetterCount(): number { return this.deadLetters.length; }
  getDeadLetters(): OfflineQueueEntry<T>[] { return [...this.deadLetters]; }

  private load(key: string): OfflineQueueEntry<T>[] {
    try { return JSON.parse(localStorage.getItem(key) || '[]') as OfflineQueueEntry<T>[]; } catch { return []; }
  }
  private persist(): void {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(this.entries));
      localStorage.setItem(DEAD_KEY, JSON.stringify(this.deadLetters));
    } catch { /* queue persistence is best effort */ }
  }
}

export const offlineQueue = new OfflineQueue();
