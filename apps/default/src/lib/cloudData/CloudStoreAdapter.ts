import { useAuthStore } from '../authStore';
import { cloudDataLayer } from './index';

export interface CloudStoreAdapter<T = unknown> {
  get(key: string, fallback: T): T;
  set(key: string, value: T): void;
  update(key: string, value: Partial<T>): void;
  delete(key: string): void;
  sync(): Promise<{ completed: number; failed: number }>;
  hydrate(key: string): Promise<T | null>;
}

export function createCloudStoreAdapter<T extends Record<string, unknown> = Record<string, unknown>>(objectType: string): CloudStoreAdapter<T> {
  const memory = new Map<string, T>();
  const userId = () => useAuthStore.getState().user?.email ?? undefined;
  return {
    get(key, fallback) {
      return memory.get(key) ?? fallback;
    },
    set(key, value) {
      memory.set(key, value);
      void cloudDataLayer.save(objectType, key, value, 'persistent', userId());
    },
    update(key, value) {
      const next = { ...(memory.get(key) ?? {}), ...value } as T;
      memory.set(key, next);
      void cloudDataLayer.update(objectType, key, next, 'persistent', userId());
    },
    delete(key) {
      memory.delete(key);
      void cloudDataLayer.delete(objectType, key, 'persistent', userId());
    },
    sync() {
      return cloudDataLayer.sync();
    },
    async hydrate(key) {
      const value = await cloudDataLayer.get<T>(objectType, key, 'persistent', userId());
      if (value !== null) memory.set(key, value);
      return value;
    },
  };
}
