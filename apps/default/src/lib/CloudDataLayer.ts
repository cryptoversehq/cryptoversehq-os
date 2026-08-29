/**
 * CloudDataLayer.ts — Enterprise Single Source of Truth (Sprint 6.6.2)
 *
 * THE ONLY storage interface for business data.
 * No store may access localStorage, sessionStorage, or Taskade API directly.
 *
 * Pattern:
 *   Store → CloudDataLayer.get/set → CloudSyncManager → Taskade Cloud → Browser Cache
 *
 * Architecture:
 *   Taskade Cloud = Enterprise Source of Truth (Taskade project node attributes)
 *   localStorage   = Enterprise Cache (transparent read-through / write-through)
 *   sessionStorage = Never used for business data
 *
 * Every object stored through this layer MUST include:
 *   - version (number, incremented on every write)
 *   - updatedAt (ISO timestamp)
 *   - checksum (SHA-256 of JSON content, for integrity verification)
 */

import { cloudDataLayer } from './cloudData';
import { enterpriseDeepMerge } from './cloudData/ConflictEngine';

// ── Types ─────────────────────────────────────────────────────────────────

export interface CloudEntity {
  id: string;
  version: number;
  updatedAt: string;
  updatedBy: string;
  checksum: string;
  [key: string]: unknown;
}

export interface SyncAuditEntry {
  id: string;
  objectType: string;
  objectId: string;
  timestamp: string;
  device: string;
  action: 'read' | 'write' | 'delete' | 'conflict' | 'merge' | 'retry';
  durationMs: number;
  conflict: boolean;
  result: 'ok' | 'error' | 'skipped' | 'merged';
  detail: string;
}

export interface SyncResult {
  ok: boolean;
  version: number;
  checksum: string;
  conflict: boolean;
  merged: boolean;
  remoteVersion: number | null;
}

export interface QueueEntry {
  id: string;
  objectType: string;
  key: string;
  data: unknown;
  version: number;
  queuedAt: string;
  retries: number;
  maxRetries: number;
}

// ── Configuration ─────────────────────────────────────────────────────────

export const USERS_PROJECT_ID = '3dMq65zUi1A7ayiC';
export const CACHE_PREFIX = 'cv_cloud_';
const SYNC_DEBOUNCE_MS = 1000;
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 2000;
const OFFLINE_QUEUE_KEY = 'cv_offline_queue';
const AUDIT_LOG_KEY = 'cv_sync_audit';

export const DEVICE_ID = (() => {
  try {
    let id = localStorage.getItem('cv_device_id');
    if (!id) { id = 'dev_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8); localStorage.setItem('cv_device_id', id); }
    return id;
  } catch { return 'dev_unknown'; }
})();

export const BUSINESS_STORE_KEYS = [
  'trading', 'academy', 'bots', 'strategies', 'marketplace', 'copy_trading',
  'nft', 'onchain', 'sentiment', 'exchange', 'nations', 'twin_league',
  'balance', 'subscription', 'auth', 'cp', 'backtest', 'referral',
  'notifications', 'events', 'ai_memory', 'knowledge_graph', 'relationships',
  'evolution', 'i18n', 'features', 'watchlist', 'leaderboard'
] as const;

export type BusinessStoreKey = typeof BUSINESS_STORE_KEYS[number];

// ── Checksum ─────────────────────────────────────────────────────────────

async function computeChecksum(data: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const buf = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    let hash = 5381;
    for (let i = 0; i < data.length; i++) hash = ((hash << 5) + hash + data.charCodeAt(i)) & 0xFFFFFFFF;
    return (hash >>> 0).toString(16).padStart(8, '0');
  }
}

// ── CloudDataLayer compatibility transport ───────────────────────────────

async function taskadeApi(path: string, opts?: RequestInit): Promise<Record<string, unknown>> {
  const segments = path.split('/').filter(Boolean);
  const nodeId = segments[0] === 'nodes' ? segments[1] : undefined;
  const method = opts?.method?.toUpperCase() ?? 'GET';
  if (method === 'GET') {
    return { payload: { nodes: await cloudDataLayer.projectNodes(USERS_PROJECT_ID) } };
  }
  const body = JSON.parse(String(opts?.body ?? '{}')) as Record<string, unknown>;
  if (method === 'POST') {
    return cloudDataLayer.createProjectNode(USERS_PROJECT_ID, body);
  }
  if (method === 'PATCH' && nodeId) {
    return cloudDataLayer.updateProjectNode(USERS_PROJECT_ID, nodeId, body);
  }
  throw new Error(`Unsupported cloud operation: ${method} ${path}`);
}

async function findUserSyncNode(email: string): Promise<{ nodeId: string; data: Record<string, unknown> } | null> {
  try {
    const data = await taskadeApi('/nodes');
    const nodes = (data?.payload as Record<string, unknown>)?.nodes as Array<Record<string, unknown>> || [];
    for (const node of nodes) {
      const fields = node.fieldValues as Record<string, string> | undefined;
      if (fields?.['/attributes/@cv_email']?.toLowerCase() === email.toLowerCase()) {
        const raw = fields?.['/attributes/@cv_data'] || '{}';
        return { nodeId: node.id as string, data: JSON.parse(raw as string) as Record<string, unknown> };
      }
    }
    return null;
  } catch { return null; }
}

// ── Audit Log ────────────────────────────────────────────────────────────

function readAuditLog(): SyncAuditEntry[] {
  try { return JSON.parse(localStorage.getItem(AUDIT_LOG_KEY) || '[]'); } catch { return []; }
}

function appendAudit(entry: SyncAuditEntry): void {
  try {
    const logs = readAuditLog();
    logs.push(entry);
    if (logs.length > 500) logs.splice(0, logs.length - 500);
    localStorage.setItem(AUDIT_LOG_KEY, JSON.stringify(logs));
  } catch { /* quota */ }
}

export function getSyncAuditLog(): SyncAuditEntry[] { return readAuditLog(); }
export function clearSyncAuditLog(): void { try { localStorage.removeItem(AUDIT_LOG_KEY); } catch {} }

// ── Offline Queue ────────────────────────────────────────────────────────

function getOfflineQueue(): QueueEntry[] {
  try { return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]'); } catch { return []; }
}

function saveOfflineQueue(q: QueueEntry[]): void {
  try { localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q)); } catch {}
}

export function getOfflineQueueSize(): number { return getOfflineQueue().length; }

async function replayOfflineQueue(): Promise<number> {
  const queue = getOfflineQueue();
  if (queue.length === 0) return 0;
  let replayed = 0;
  const remaining: QueueEntry[] = [];
  for (const entry of queue) {
    try {
      await setCloud(entry.objectType as BusinessStoreKey, entry.key, entry.data, entry.version);
      replayed++;
      appendAudit({
        id: entry.id, objectType: entry.objectType, objectId: entry.key,
        timestamp: new Date().toISOString(), device: DEVICE_ID, action: 'retry',
        durationMs: 0, conflict: false, result: 'ok',
        detail: `Offline queue replay: ${entry.objectType}/${entry.key}`,
      });
    } catch {
      if (entry.retries < entry.maxRetries) {
        remaining.push({ ...entry, retries: entry.retries + 1 });
      }
    }
  }
  saveOfflineQueue(remaining);
  return replayed;
}

function enqueueForOffline(objectType: string, key: string, data: unknown, version: number): void {
  const entry: QueueEntry = {
    id: 'q_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    objectType, key, data, version,
    queuedAt: new Date().toISOString(),
    retries: 0, maxRetries: MAX_RETRIES,
  };
  const queue = getOfflineQueue();
  queue.push(entry);
  saveOfflineQueue(queue);
}

// ── Core Cloud Data Layer: GET ───────────────────────────────────────────

export async function getCloud<T = unknown>(objectType: BusinessStoreKey | string, key: string): Promise<T | null> {
  // 1. Read from local cache FIRST (fast path)
  const cacheKey = `${CACHE_PREFIX}${objectType}_${key}`;
  const cached = localStorage.getItem(cacheKey);
  let cachedData: T | null = null;
  if (cached) {
    try { cachedData = JSON.parse(cached) as T; } catch {}
  }

  // 2. Background: fetch from Taskade Cloud if we have an email
  try {
    const email = localStorage.getItem('cv_active_user_email');
    if (email) {
      const node = await findUserSyncNode(email);
      if (node?.data) {
        const remoteValue = node.data[`${objectType}_${key}`];
        if (remoteValue) {
          const remote = remoteValue as Record<string, unknown>;
          const remoteVersion = (remote.version as number) || 0;
          const cachedVersion = (cachedData as Record<string, unknown> | null)?.version as number || 0;
          // Use remote if newer
          if (remoteVersion > cachedVersion) {
            localStorage.setItem(cacheKey, JSON.stringify(remote));
            return remote as unknown as T;
          }
        }
      }
    }
  } catch { /* offline — use cache */ }

  return cachedData;
}

// ── Core Cloud Data Layer: SET ───────────────────────────────────────────

export async function setCloud(objectType: BusinessStoreKey | string, key: string, data: unknown, forceVersion?: number): Promise<SyncResult> {
  const start = Date.now();
  const version = forceVersion ?? (((data as Record<string, unknown>)?.version as number) || 0) + 1;
  const now = new Date().toISOString();

  // Build cloud entity with versioning
  const entity: CloudEntity = {
    id: `${objectType}_${key}`,
    version,
    updatedAt: now,
    updatedBy: DEVICE_ID,
    checksum: '',
    ...(data as Record<string, unknown>),
  };

  // Compute checksum
  const checksumPayload = JSON.stringify({ ...entity, checksum: '' });
  entity.checksum = await computeChecksum(checksumPayload);

  // 1. Write-through to local cache immediately
  const cacheKey = `${CACHE_PREFIX}${objectType}_${key}`;
  try { localStorage.setItem(cacheKey, JSON.stringify(entity)); } catch {}

  // 2. Sync to Taskade Cloud
  try {
    const email = localStorage.getItem('cv_active_user_email');
    if (!email) {
      appendAudit({ id: 'a_' + now, objectType, objectId: key, timestamp: now, device: DEVICE_ID, action: 'write', durationMs: Date.now() - start, conflict: false, result: 'skipped', detail: 'No active user email — cache only' });
      return { ok: true, version, checksum: entity.checksum, conflict: false, merged: false, remoteVersion: null };
    }

    const existingNode = await findUserSyncNode(email);
    const allData = existingNode?.data || {};

    // Check for version conflict
    const remoteCurrent = allData[`${objectType}_${key}`] as Record<string, unknown> | undefined;
    const remoteVersion = (remoteCurrent?.version as number) || 0;

    if (remoteVersion !== 0 && remoteVersion >= version) {
      // Conflict: remote is same version or newer — merge
      const merged = deepMerge(entity as unknown as Record<string, unknown>, remoteCurrent as Record<string, unknown> || {});
      merged.version = remoteVersion + 1;
      merged.updatedAt = now;
      merged.updatedBy = DEVICE_ID;
      const mergePayload = JSON.stringify({ ...merged, checksum: '' });
      merged.checksum = await computeChecksum(mergePayload);
      allData[`${objectType}_${key}`] = merged;

      await saveUserCloudNode(email, allData, existingNode?.nodeId || null);

      appendAudit({ id: 'a_' + now, objectType, objectId: key, timestamp: now, device: DEVICE_ID, action: 'merge', durationMs: Date.now() - start, conflict: true, result: 'merged', detail: `Merged: local v${version} → remote v${remoteVersion}` });
      return { ok: true, version: merged.version as number, checksum: merged.checksum as string, conflict: true, merged: true, remoteVersion };
    }

    // No conflict — write
    allData[`${objectType}_${key}`] = entity;
    await saveUserCloudNode(email, allData, existingNode?.nodeId || null);

    appendAudit({ id: 'a_' + now, objectType, objectId: key, timestamp: now, device: DEVICE_ID, action: 'write', durationMs: Date.now() - start, conflict: false, result: 'ok', detail: `Written v${version}` });
    return { ok: true, version, checksum: entity.checksum, conflict: false, merged: false, remoteVersion };
  } catch (err) {
    // Offline — enqueue for later replay
    enqueueForOffline(objectType, key, entity, version);
    appendAudit({ id: 'a_' + now, objectType, objectId: key, timestamp: now, device: DEVICE_ID, action: 'write', durationMs: Date.now() - start, conflict: false, result: 'error', detail: `Offline — queued: ${(err as Error)?.message || 'unknown'}` });
    return { ok: false, version, checksum: entity.checksum, conflict: false, merged: false, remoteVersion: null };
  }
}

// ── Cloud Data Layer: DELETE ─────────────────────────────────────────────

export async function deleteCloud(objectType: BusinessStoreKey | string, key: string): Promise<void> {
  const cacheKey = `${CACHE_PREFIX}${objectType}_${key}`;
  localStorage.removeItem(cacheKey);

  try {
    const email = localStorage.getItem('cv_active_user_email');
    if (email) {
      const existingNode = await findUserSyncNode(email);
      if (existingNode?.data) {
        delete existingNode.data[`${objectType}_${key}`];
        await saveUserCloudNode(email, existingNode.data, existingNode.nodeId);
      }
    }
  } catch { /* offline — cache already cleared */ }

  appendAudit({ id: 'a_' + Date.now(), objectType, objectId: key, timestamp: new Date().toISOString(), device: DEVICE_ID, action: 'delete', durationMs: 0, conflict: false, result: 'ok', detail: 'Deleted' });
}

// ── Helpers ──────────────────────────────────────────────────────────────

async function saveUserCloudNode(email: string, data: Record<string, unknown>, existingNodeId: string | null): Promise<void> {
  const fields: Record<string, unknown> = {
    '/attributes/@cv_email': email,
    '/attributes/@cv_data': JSON.stringify(data),
    '/attributes/@cv_updated': new Date().toISOString(),
  };
  if (existingNodeId) {
    await taskadeApi(`/nodes/${existingNodeId}`, { method: 'PATCH', body: JSON.stringify(fields) });
  } else {
    await taskadeApi('/nodes', { method: 'POST', body: JSON.stringify({ content: email, ...fields }) });
  }
}

function deepMerge(local: Record<string, unknown>, remote: Record<string, unknown>): Record<string, unknown> {
  const localTime = Date.parse(String(local.updatedAt || '')) || Date.now();
  const remoteTime = Date.parse(String(remote.updatedAt || '')) || Date.now();
  return enterpriseDeepMerge(local, remote, localTime, remoteTime) as Record<string, unknown>;
}

// ── Cloud Sync Manager (login/logout/background) ─────────────────────────

export async function cloudSyncLogin(email: string): Promise<number> {
  const start = Date.now();
  localStorage.setItem('cv_active_user_email', email);
  let loaded = 0;

  try {
    // Replay any offline queue first
    const replayed = await replayOfflineQueue();
    if (replayed > 0) console.log(`[CloudSync] Replayed ${replayed} offline entries`);

    // Load ALL business data from Taskade Cloud
    const node = await findUserSyncNode(email);
    if (node?.data) {
      for (const [key, value] of Object.entries(node.data)) {
        if (!value) continue;
        const [objectType, ...rest] = key.split('_');
        const storeKey = rest.join('_');
        if (!storeKey) continue;

        // Cache locally
        const cacheKey = `${CACHE_PREFIX}${key}`;
        try { localStorage.setItem(cacheKey, JSON.stringify(value)); } catch {}
        loaded++;
      }
    }
  } catch {
    console.warn('[CloudSync] Login sync failed — using cache');
  }

  appendAudit({ id: 'a_login_' + start, objectType: 'system', objectId: email, timestamp: new Date().toISOString(), device: DEVICE_ID, action: 'read', durationMs: Date.now() - start, conflict: false, result: 'ok', detail: `Login sync: ${loaded} objects loaded` });
  return loaded;
}

export async function cloudSyncLogout(email: string): Promise<number> {
  const start = Date.now();
  // Flush offline queue
  let flushed = 0;
  try { flushed = await replayOfflineQueue(); } catch {}

  // Clear sensitive cache but keep non-sensitive
  const sensitivePrefixes = ['auth', 'balance', 'cp', 'subscription'];
  for (const prefix of sensitivePrefixes) {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(`${CACHE_PREFIX}${prefix}_`)) localStorage.removeItem(k);
    }
  }

  localStorage.removeItem('cv_active_user_email');

  appendAudit({ id: 'a_logout_' + start, objectType: 'system', objectId: email, timestamp: new Date().toISOString(), device: DEVICE_ID, action: 'write', durationMs: Date.now() - start, conflict: false, result: 'ok', detail: `Logout: ${flushed} queued entries flushed` });
  return flushed;
}

// ── Background Sync Worker ───────────────────────────────────────────────

let _bgSyncTimer: ReturnType<typeof setInterval> | null = null;

export function startBackgroundSync(intervalMs = 30_000): void {
  if (_bgSyncTimer) return;
  _bgSyncTimer = setInterval(() => {
    const email = localStorage.getItem('cv_active_user_email');
    if (!email) return;
    // Replay offline queue periodically
    replayOfflineQueue().catch(() => {});
  }, intervalMs);
}

export function stopBackgroundSync(): void {
  if (_bgSyncTimer) { clearInterval(_bgSyncTimer); _bgSyncTimer = null; }
}

// ── Integrity Verification ───────────────────────────────────────────────

export async function verifyCloudIntegrity(email: string): Promise<{ ok: boolean; total: number; verified: number; failed: string[] }> {
  const failed: string[] = [];
  let total = 0;
  let verified = 0;

  try {
    const node = await findUserSyncNode(email);
    if (!node?.data) return { ok: false, total: 0, verified: 0, failed: ['No cloud data found'] };

    for (const [key, value] of Object.entries(node.data)) {
      if (!value || typeof value !== 'object') continue;
      total++;
      const entity = value as Record<string, unknown>;
      const storedChecksum = entity.checksum as string;
      if (!storedChecksum) { verified++; continue; }

      const payload = JSON.stringify({ ...entity, checksum: '' });
      const actualChecksum = await computeChecksum(payload);
      if (actualChecksum === storedChecksum) {
        verified++;
      } else {
        failed.push(key);
      }
    }
  } catch {
    return { ok: false, total, verified, failed: ['Network error'] };
  }

  return { ok: failed.length === 0, total, verified, failed };
}

// ─── Public cloud cache helpers (for store hydration) ────────────────────

export function getCloudCacheKey(objectType: string, key: string): string {
  return `${CACHE_PREFIX}${objectType}_${key}`;
}

export function readCache<T = unknown>(objectType: string, key: string): T | null {
  try {
    const raw = localStorage.getItem(getCloudCacheKey(objectType, key));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
}

export function getActiveUserEmail(): string | null {
  return localStorage.getItem('cv_active_user_email');
}
