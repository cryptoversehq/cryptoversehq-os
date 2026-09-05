import type { CachePolicy, CloudEntity, CloudProvider, CloudMetrics, IntegrityReport, CloudEventMap } from './types';
import { CacheEngine, cacheEngine } from './CacheEngine';
import { ConflictEngine, conflictEngine } from './ConflictEngine';
import { CloudEventBus, cloudEventBus } from './CloudEventBus';
import { OfflineQueue, offlineQueue } from './OfflineQueue';
import { TaskadeCloudProvider } from './TaskadeCloudProvider';

export * from './types';
export { CacheEngine, cacheEngine } from './CacheEngine';
export { ConflictEngine, conflictEngine } from './ConflictEngine';
export { CloudEventBus, cloudEventBus } from './CloudEventBus';
export { OfflineQueue, offlineQueue } from './OfflineQueue';
export { TaskadeCloudProvider } from './TaskadeCloudProvider';
export { createCloudStorage } from './createCloudStorage';
export { createCloudStoreAdapter } from './CloudStoreAdapter';
export type { CloudStoreAdapter } from './CloudStoreAdapter';
export { cloudRecordStore } from './CloudRecordStore';
export { CloudDashboard } from './CloudDashboard';

export const DEFAULT_CACHE_POLICIES: Record<string, CachePolicy> = {
  trading: 'persistent', academy: 'persistent', wallet: 'persistent', theme: 'persistent',
  universal_memory: 'persistent', trial: 'persistent', sentiment: 'persistent', exchange_portfolio: 'persistent', on_chain: 'persistent', feedback: 'persistent', mentor_chat: 'persistent', login_history: 'persistent', localization: 'persistent', referrals: 'persistent', bot_marketplace: 'persistent', ai_recommender: 'persistent', copy_trading: 'persistent', bot_templates: 'persistent', background_jobs: 'persistent', feature_previews: 'persistent', monetization: 'persistent', live_prices: 'temporary', notifications: 'session', ai_conversation: 'persistent', market_feed: 'memory',
};

function emptyMetrics(): CloudMetrics {
  return { cacheHits: 0, cacheMisses: 0, cloudLatencyMs: null, syncDurationMs: null, queueLength: 0, failedWrites: 0, retries: 0, conflicts: 0, rollbackCount: 0, integrityStatus: 'unknown', deadLetters: 0 };
}

export class CloudDataLayer {
  private readonly provider: CloudProvider;
  private readonly cache: CacheEngine;
  private readonly conflicts: ConflictEngine;
  private readonly events: CloudEventBus;
  private readonly queue: OfflineQueue;
  private readonly activeWrites = new Map<string, Promise<CloudEntity<unknown>>>();
  private metrics: CloudMetrics = emptyMetrics();

  constructor(
    provider: CloudProvider,
    cache: CacheEngine = cacheEngine,
    conflicts: ConflictEngine = conflictEngine,
    events: CloudEventBus = cloudEventBus,
    queue: OfflineQueue = offlineQueue,
  ) {
    this.provider = provider;
    this.cache = cache;
    this.conflicts = conflicts;
    this.events = events;
    this.queue = queue;
  }

  on<K extends keyof CloudEventMap>(name: K, listener: (payload: CloudEventMap[K]) => void): () => void {
    return this.events.on(name, listener);
  }

  async get<T>(objectType: string, key: string, policy: CachePolicy = this.policyFor(objectType), userId?: string): Promise<T | null> {
    const started = Date.now();
    const remote = await this.provider.read<T>({ objectType, key, userId }).catch(() => null);
    this.metrics.cloudLatencyMs = Date.now() - started;
    if (remote) {
      this.cache.set(remote, policy);
      this.events.emit('CloudCacheUpdated', { objectType, key, policy });
      return remote.data;
    }
    return this.cache.get<T>(objectType, key, policy)?.data ?? null;
  }

  async save<T>(objectType: string, key: string, data: T, policy: CachePolicy = this.policyFor(objectType), userId?: string): Promise<CloudEntity<T>> {
    const writeKey = `${objectType}:${key}:${userId ?? ''}`;
    const active = this.activeWrites.get(writeKey);
    if (active) return active as Promise<CloudEntity<T>>;

    const write = (async (): Promise<CloudEntity<T>> => {
      const previous = this.cache.get<T>(objectType, key, policy);
      const entity = await this.prepare(objectType, key, data, previous?.version ?? 0, userId);
      this.events.emit('CloudSyncStarted', { objectType, key });
      try {
        const saved = await this.provider.write({ objectType, key, entity, userId });
        this.cache.set(saved, policy);
        this.events.emit('CloudCacheUpdated', { objectType, key, policy });
        this.events.emit('CloudSyncFinished', { objectType, key, ok: true });
        return saved;
      } catch (error) {
        this.queue.enqueue({ priority: 5, operation: 'write', payload: { objectType, key, entity, userId }, maxAttempts: 5 });
        this.events.emit('CloudOffline', { reason: error instanceof Error ? error.message : 'Cloud write failed' });
        this.events.emit('CloudSyncFinished', { objectType, key, ok: false });
        return entity;
      }
    })();

    this.activeWrites.set(writeKey, write as Promise<CloudEntity<unknown>>);
    try {
      return await write;
    } finally {
      if (this.activeWrites.get(writeKey) === write) this.activeWrites.delete(writeKey);
    }
  }

  async update<T>(objectType: string, key: string, data: T, policy?: CachePolicy, userId?: string): Promise<CloudEntity<T>> {
    const selectedPolicy = policy ?? this.policyFor(objectType);
    const entity = await this.prepare(objectType, key, data, this.cache.get<T>(objectType, key, selectedPolicy)?.version ?? 0, userId);
    const saved = await this.provider.update({ objectType, key, entity, userId });
    this.cache.set(saved, selectedPolicy);
    this.events.emit('CloudCacheUpdated', { objectType, key, policy: selectedPolicy });
    return saved;
  }

  async delete(objectType: string, key: string, policy: CachePolicy = this.policyFor(objectType), userId?: string): Promise<void> {
    await this.provider.delete({ objectType, key, userId });
    this.cache.delete(objectType, key, policy);
    this.events.emit('CloudCacheUpdated', { objectType, key, policy });
  }

  async sync(): Promise<{ completed: number; failed: number }> {
    return this.queue.drain(async entry => {
      const payload = entry.payload as { objectType: string; key: string; entity: CloudEntity; userId?: string };
      await this.provider.write(payload);
    });
  }

  async hydrate(userId?: string, policies: Record<string, CachePolicy> = DEFAULT_CACHE_POLICIES): Promise<{ objects: number; integrity: IntegrityReport }> {
    const health = await this.provider.health();
    if (!health.online) {
      this.events.emit('CloudOffline', { reason: health.detail });
      return { objects: 0, integrity: { ok: false, total: 0, verified: 0, missing: [], duplicated: [], failed: ['Cloud unavailable'] } };
    }
    this.events.emit('CloudSyncStarted', {});
    const objects = (await Promise.all(Object.keys(policies).map(objectType => this.provider.readAll({ objectType, userId })))).flat();
    let loaded = 0;
    for (const entity of objects) {
      loaded += 1;
      this.cache.set(entity, policies[entity.objectType] ?? 'memory');
    }
    const integrity = await this.verify(policies, userId);
    this.metrics.integrityStatus = integrity.ok ? 'verified' : 'failed';
    this.events.emit('CloudHydrated', { userId, objects: loaded, integrityOk: integrity.ok });
    this.events.emit('CloudSyncFinished', { ok: integrity.ok });
    return { objects: loaded, integrity };
  }

  async flush(): Promise<{ completed: number; failed: number }> { return this.sync(); }

  async projectNodes(projectId: string): Promise<Record<string, unknown>[]> {
    return this.provider.projectNodes(projectId);
  }

  async createProjectNode(projectId: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.provider.createProjectNode(projectId, body);
  }

  async updateProjectNode(projectId: string, nodeId: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.provider.updateProjectNode(projectId, nodeId, body);
  }

  async deleteProjectNode(projectId: string, nodeId: string): Promise<void> {
    return this.provider.deleteProjectNode(projectId, nodeId);
  }

  async invokeWebhook(flowId: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.provider.invokeWebhook(flowId, body);
  }

  async verify(policies: Record<string, CachePolicy> = DEFAULT_CACHE_POLICIES, userId?: string): Promise<IntegrityReport> {
    const failed: string[] = [];
    let verified = 0;
    let total = 0;
    for (const objectType of Object.keys(policies)) {
      const entity = await this.provider.read({ objectType, key: objectType, userId }).catch(() => null);
      if (!entity) continue;
      total += 1;
      const expected = await checksum({ ...entity, checksum: '' });
      if (expected === entity.checksum) verified += 1;
      else failed.push(`${objectType}/${entity.key}`);
    }
    return { ok: failed.length === 0, total, verified, missing: [], duplicated: [], failed };
  }

  getMetrics(): CloudMetrics {
    return { ...this.metrics, queueLength: this.queue.length, conflicts: this.conflicts.getAudit().length };
  }

  resetMetrics(): void {
    this.metrics = emptyMetrics();
  }

  private policyFor(objectType: string): CachePolicy { return DEFAULT_CACHE_POLICIES[objectType] ?? 'persistent'; }

  private async prepare<T>(objectType: string, key: string, data: T, version: number, _userId?: string): Promise<CloudEntity<T>> {
    const entity = { id: `${objectType}_${key}`, objectType, key, version: version + 1, updatedAt: new Date().toISOString(), updatedBy: 'current-user', checksum: '', data };
    entity.checksum = await checksum({ ...entity, checksum: '' });
    return entity;
  }
}

async function checksum(value: unknown): Promise<string> {
  const text = JSON.stringify(value);
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    let hash = 5381;
    for (const char of text) hash = ((hash << 5) + hash + char.charCodeAt(0)) | 0;
    return Math.abs(hash).toString(16);
  }
}

export const cloudDataLayer = new CloudDataLayer(new TaskadeCloudProvider());
