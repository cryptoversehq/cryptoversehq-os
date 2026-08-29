import type { CloudEntity, ConflictRecord } from './types';

// ── Enterprise Recursive Deep Merge Engine (Sprint 6.6.2-M) ────────────────

function getPrimaryKey(item: unknown): string | undefined {
  if (!item || typeof item !== 'object') return undefined;
  const obj = item as Record<string, unknown>;
  const val = obj.id ?? obj._id ?? obj.key ?? obj.uuid ?? obj.hash ?? obj.symbol ?? obj.code ?? obj.purchaseId;
  return typeof val === 'string' || typeof val === 'number' ? String(val) : undefined;
}

function isTombstone(item: unknown): boolean {
  if (!item || typeof item !== 'object') return false;
  const obj = item as Record<string, unknown>;
  return obj._deleted === true || obj.deleted === true || typeof obj.deletedAt === 'string';
}

function getTimestamp(item: unknown, defaultTime: number): number {
  if (!item || typeof item !== 'object') return defaultTime;
  const obj = item as Record<string, unknown>;
  const ts = obj.updatedAt ?? obj.lastSoldAt ?? obj.timestamp ?? obj.createdAt ?? obj.deletedAt;
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'string') {
    const parsed = Date.parse(ts);
    if (!isNaN(parsed)) return parsed;
  }
  return defaultTime;
}

export function enterpriseDeepMerge(local: unknown, remote: unknown, localTime: number, remoteTime: number): unknown {
  if (local === undefined) return remote;
  if (remote === undefined) return local;
  if (local === null || remote === null) {
    return localTime >= remoteTime ? local : remote;
  }

  // Arrays: Merge by Primary Key (id, _id, etc.). Never overwrite entire array, never duplicate IDs.
  if (Array.isArray(local) && Array.isArray(remote)) {
    const map = new Map<string, unknown>();
    const unkeyedRemote: unknown[] = [];
    const unkeyedLocal: unknown[] = [];

    for (const rItem of remote) {
      const pk = getPrimaryKey(rItem);
      if (pk !== undefined) {
        map.set(pk, rItem);
      } else {
        unkeyedRemote.push(rItem);
      }
    }

    for (const lItem of local) {
      const pk = getPrimaryKey(lItem);
      if (pk !== undefined) {
        if (map.has(pk)) {
          const rItem = map.get(pk);
          const rTime = getTimestamp(rItem, remoteTime);
          const lTime = getTimestamp(lItem, localTime);
          const lTomb = isTombstone(lItem);
          const rTomb = isTombstone(rItem);
          if (lTomb && !rTomb) {
            map.set(pk, lTime >= rTime ? lItem : rItem);
          } else if (!lTomb && rTomb) {
            map.set(pk, rTime > lTime ? rItem : lItem);
          } else {
            map.set(pk, enterpriseDeepMerge(lItem, rItem, lTime, rTime));
          }
        } else {
          map.set(pk, lItem);
        }
      } else {
        const lStr = JSON.stringify(lItem);
        if (!unkeyedRemote.some(r => JSON.stringify(r) === lStr)) {
          unkeyedLocal.push(lItem);
        }
      }
    }

    const combined = [...map.values(), ...unkeyedRemote, ...unkeyedLocal];
    return combined.filter(item => !isTombstone(item));
  }

  // Plain Objects: Recursive deep merge across unlimited nesting levels.
  if (typeof local === 'object' && !Array.isArray(local) && typeof remote === 'object' && !Array.isArray(remote)) {
    const lObj = local as Record<string, unknown>;
    const rObj = remote as Record<string, unknown>;
    const lTomb = isTombstone(lObj);
    const rTomb = isTombstone(rObj);
    if (lTomb && !rTomb) return localTime >= remoteTime ? lObj : rObj;
    if (!lTomb && rTomb) return remoteTime > localTime ? rObj : lObj;

    const merged: Record<string, unknown> = { ...rObj };
    const allKeys = new Set([...Object.keys(lObj), ...Object.keys(rObj)]);

    for (const key of allKeys) {
      if (key === 'version' || key === 'updatedAt' || key === 'updatedBy' || key === 'checksum') continue;
      if (key in lObj && key in rObj) {
        merged[key] = enterpriseDeepMerge(lObj[key], rObj[key], localTime, remoteTime);
      } else if (key in lObj) {
        merged[key] = lObj[key];
      } else {
        merged[key] = rObj[key];
      }
    }
    return merged;
  }

  // Scalars: Deterministic timestamp-based resolution.
  return localTime >= remoteTime ? local : remote;
}

export class ConflictEngine {
  private audit: ConflictRecord[] = [];

  compare<T>(local: CloudEntity<T>, remote: CloudEntity<T>): 'local' | 'remote' | 'conflict' {
    if (local.checksum === remote.checksum) return 'remote';
    if (local.version > remote.version) return 'local';
    if (remote.version > local.version) return 'remote';
    if (local.updatedAt > remote.updatedAt) return 'local';
    if (remote.updatedAt > local.updatedAt) return 'remote';
    return 'conflict';
  }

  resolveLastWriterWins<T>(local: CloudEntity<T>, remote: CloudEntity<T>): CloudEntity<T> {
    const winner = this.compare(local, remote) === 'local' ? local : remote;
    this.record(local, remote, 'last_writer_wins', true);
    return winner;
  }

  merge<T extends Record<string, unknown>>(local: CloudEntity<T>, remote: CloudEntity<T>): CloudEntity<T> {
    const localTime = Date.parse(local.updatedAt) || Date.now();
    const remoteTime = Date.parse(remote.updatedAt) || Date.now();
    const mergedData = enterpriseDeepMerge(local.data, remote.data, localTime, remoteTime) as T;
    const result: CloudEntity<T> = {
      ...local,
      data: mergedData,
      version: Math.max(local.version, remote.version) + 1,
      updatedAt: new Date().toISOString(),
    };
    this.record(local, remote, 'manual_merge', true);
    return result;
  }

  rollback<T>(target: CloudEntity<T>): CloudEntity<T> {
    return { ...target, version: target.version + 1, updatedAt: new Date().toISOString() };
  }

  record<T>(local: CloudEntity<T>, remote: CloudEntity<T>, resolution: ConflictRecord['resolution'], resolved: boolean): void {
    this.audit.push({ objectType: local.objectType, key: local.key, local, remote, detectedAt: new Date().toISOString(), resolution, resolved });
    if (this.audit.length > 500) this.audit.splice(0, this.audit.length - 500);
  }

  getAudit(): ConflictRecord[] {
    return [...this.audit];
  }
}

export const conflictEngine = new ConflictEngine();
