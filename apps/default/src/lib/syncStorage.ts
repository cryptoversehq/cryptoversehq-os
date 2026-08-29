/**
 * syncStorage.ts — CryptoVerse HQ (Enterprise Compatibility Wrapper)
 *
 * Sprint 6.6.2-H: Converted to thin compatibility layer over CloudDataLayer.
 * ALL public APIs preserved — no callers need changes.
 * Internal implementation now delegates to CloudDataLayer → TaskadeCloudProvider.
 * TaskadeCloudProvider is the ONLY code that calls fetch() to Taskade API.
 *
 * Architecture:
 *   syncStorage → CloudDataLayer → TaskadeCloudProvider → Taskade API
 *
 * Kept for backward compatibility with authStore.ts and tradingMigrationService.ts.
 */

import { cloudDataLayer } from './cloudData';

type SyncData = Record<string, unknown>;

// Compatibility reads stay in memory only. Durable state is delegated below.
const compatibilityCache = new Map<string, unknown>();
const cacheKey = (email: string, key: string) => `${email}:${key}`;

export const localCache = {
  get<T = SyncData>(email: string, key: string): T | null {
    return (compatibilityCache.get(cacheKey(email, key)) as T | undefined) ?? null;
  },

  set<T = SyncData>(email: string, key: string, data: T): void {
    compatibilityCache.set(cacheKey(email, key), data);
  },

  remove(email: string, key: string): void {
    compatibilityCache.delete(cacheKey(email, key));
  },
};

// ─── Save user data — now delegates to CloudDataLayer ──────────────────

export async function saveUserData(email: string, data: SyncData): Promise<void> {
  try {
    await cloudDataLayer.save('sync_user', email, data, 'persistent');
  } catch {
    console.warn('[syncStorage] Save failed — CloudDataLayer queued or rejected the write');
  }
}

// ─── Load user data — now delegates to CloudDataLayer ──────────────────

export async function loadUserData(email: string): Promise<SyncData | null> {
  try {
    return await cloudDataLayer.get<SyncData>('sync_user', email, 'persistent');
  } catch {
    return null;
  }
}

// ─── Sync a specific key (debounced via CloudDataLayer) ────────────────

export function syncKey(email: string, key: string, data: SyncData): void {
  localCache.set(email, key, data); // immediate local cache for fast reads
  // Fire-and-forget cloud save — CloudDataLayer handles queue/debounce internally
  cloudDataLayer.save<SyncData>('sync_user', `${email}_${key}`, data, 'persistent').catch(() => {});
}

// ─── Login sync — load all data from CloudDataLayer into local cache ───

export async function syncOnLogin(email: string): Promise<void> {
  try {
    const remote = await loadUserData(email);
    if (remote) {
      for (const [key, value] of Object.entries(remote)) {
        const local = localCache.get(email, key);
        if (!local || (value as SyncData)?.['updatedAt'] > (local as SyncData)?.['updatedAt']) {
          localCache.set(email, key, value);
        }
      }
    }
  } catch {
    console.warn('[syncStorage] Login sync failed — using local cache only');
  }
}

// ─── Logout sync — flush pending (CloudDataLayer handles internally) ───

export async function syncOnLogout(_email: string): Promise<void> {
  // CloudDataLayer handles flush internally via OfflineQueue
  // No-op at this layer — queue persists until next online connection
}

// ─── Clear all cached data for a user ──────────────────────────────────

export function clearLocalCache(email: string): void {
  const prefix = `${email}:`;
  for (const key of compatibilityCache.keys()) {
    if (key.startsWith(prefix)) compatibilityCache.delete(key);
  }
}
