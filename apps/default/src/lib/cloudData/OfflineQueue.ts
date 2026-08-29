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

export class OfflineQueue<T = unknown> {
  private entries: OfflineQueueEntry<T>[] = this.load(QUEUE_KEY);
  private deadLetters: OfflineQueueEntry<T>[] = this.load(DEAD_KEY);

  enqueue(entry: Omit<OfflineQueueEntry<T>, 'id' | 'queuedAt' | 'attempts' | 'nextAttemptAt'>): string {
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
      } catch {
        entry.attempts += 1;
        failed += 1;
        if (entry.attempts >= entry.maxAttempts) {
          this.entries = this.entries.filter(item => item.id !== entry.id);
          this.deadLetters.push(entry);
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
