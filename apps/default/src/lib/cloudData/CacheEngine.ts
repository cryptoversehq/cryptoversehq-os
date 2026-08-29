import type { CachePolicy, CloudEntity } from './types';
import { cloudEventBus } from './CloudEventBus';

const PREFIX = 'cv_cloud_cache_';

function storageFor(policy: CachePolicy): Storage | null {
  if (policy === 'memory') return null;
  try {
    return policy === 'session' ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

export class CacheEngine {
  private memory = new Map<string, CloudEntity>();

  private key(objectType: string, key: string): string {
    return `${PREFIX}${objectType}_${key}`;
  }

  get<T>(objectType: string, key: string, policy: CachePolicy): CloudEntity<T> | null {
    const cacheKey = this.key(objectType, key);
    const raw = policy === 'memory' ? this.memory.get(cacheKey) : storageFor(policy)?.getItem(cacheKey);
    if (!raw) return null;
    try {
      return (typeof raw === 'string' ? JSON.parse(raw) : raw) as CloudEntity<T>;
    } catch {
      return null;
    }
  }

  set<T>(entity: CloudEntity<T>, policy: CachePolicy): void {
    const cacheKey = this.key(entity.objectType, entity.key);
    if (policy === 'memory') this.memory.set(cacheKey, entity as CloudEntity);
    else {
      try { storageFor(policy)?.setItem(cacheKey, JSON.stringify(entity)); } catch { /* cache is optional */ }
    }
    cloudEventBus.emit('CloudCacheUpdated', { objectType: entity.objectType, key: entity.key, policy });
  }

  delete(objectType: string, key: string, policy: CachePolicy): void {
    const cacheKey = this.key(objectType, key);
    this.memory.delete(cacheKey);
    try { storageFor(policy)?.removeItem(cacheKey); } catch { /* cache is optional */ }
  }

  clear(policy?: CachePolicy): void {
    this.memory.clear();
    if (!policy || policy === 'memory') return;
    try {
      const storage = storageFor(policy);
      if (!storage) return;
      for (let index = storage.length - 1; index >= 0; index -= 1) {
        const key = storage.key(index);
        if (key?.startsWith(PREFIX)) storage.removeItem(key);
      }
    } catch { /* cache is optional */ }
  }
}

export const cacheEngine = new CacheEngine();
