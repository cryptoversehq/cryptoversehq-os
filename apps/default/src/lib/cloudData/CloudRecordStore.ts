import { useAuthStore } from '../authStore';
import { cloudDataLayer } from './index';
import { cacheEngine } from './CacheEngine';

const memory = new Map<string, unknown>();

function scope(objectType: string, key: string): string {
  return `${objectType}:${key}`;
}

function userId(): string | undefined {
  return useAuthStore.getState().user?.email;
}

export const cloudRecordStore = {
  get<T>(objectType: string, key: string, fallback: T): T {
    const memoryValue = memory.get(scope(objectType, key)) as T | undefined;
    if (memoryValue !== undefined) return memoryValue;
    const cached = cacheEngine.get<T>(objectType, key, 'persistent');
    if (cached?.data !== undefined) {
      memory.set(scope(objectType, key), cached.data);
      return cached.data;
    }
    return fallback;
  },
  set<T>(objectType: string, key: string, value: T): void {
    memory.set(scope(objectType, key), value);
    void cloudDataLayer.save(objectType, key, value, 'persistent', userId());
  },
  async hydrate<T>(objectType: string, key: string, fallback: T): Promise<T> {
    const value = await cloudDataLayer.get<T>(objectType, key, 'persistent', userId());
    const resolved = value ?? fallback;
    memory.set(scope(objectType, key), resolved);
    return resolved;
  },
  clear(objectType: string, key: string): void {
    memory.delete(scope(objectType, key));
    void cloudDataLayer.delete(objectType, key, 'persistent', userId());
  },
};
