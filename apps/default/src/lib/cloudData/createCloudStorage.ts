import type { PersistStorage, StorageValue } from 'zustand/middleware';
import type { CachePolicy } from './types';
import { cloudDataLayer } from './index';

export interface CloudStorageOptions {
  objectType: string;
  userId: string | (() => string | null);
  cachePolicy?: CachePolicy;
}

function resolveUserId(userId: CloudStorageOptions['userId']): string | undefined {
  const value = typeof userId === 'function' ? userId() : userId;
  return value ?? undefined;
}

export function createCloudStorage<T>(options: CloudStorageOptions): PersistStorage<T> {
  const policy: CachePolicy = options.cachePolicy ?? 'persistent';
  return {
    getItem: async (name) => {
      const data = await cloudDataLayer.get<StorageValue<T>>(options.objectType, name, policy, resolveUserId(options.userId));
      return data;
    },
    setItem: async (name, value) => {
      await cloudDataLayer.save(options.objectType, name, value, policy, resolveUserId(options.userId));
    },
    removeItem: async (name) => {
      await cloudDataLayer.delete(options.objectType, name, policy, resolveUserId(options.userId));
    },
  };
}
