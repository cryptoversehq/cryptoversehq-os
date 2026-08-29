export type CachePolicy = 'persistent' | 'session' | 'temporary' | 'memory';

export interface CloudMetrics {
  cacheHits: number;
  cacheMisses: number;
  cloudLatencyMs: number | null;
  syncDurationMs: number | null;
  queueLength: number;
  failedWrites: number;
  retries: number;
  conflicts: number;
  rollbackCount: number;
  integrityStatus: 'unknown' | 'verified' | 'failed';
  deadLetters: number;
}

export interface CloudEntity<T = unknown> {
  id: string;
  objectType: string;
  key: string;
  version: number;
  updatedAt: string;
  updatedBy: string;
  checksum: string;
  data: T;
}

export interface CloudRecord<T = unknown> {
  entity: CloudEntity<T>;
  cachePolicy: CachePolicy;
}

export interface CloudReadQuery {
  objectType: string;
  key?: string;
  userId?: string;
}

export interface CloudWriteRequest<T = unknown> {
  objectType: string;
  key: string;
  entity: CloudEntity<T>;
  userId?: string;
}

export interface CloudHealth {
  online: boolean;
  provider: string;
  latencyMs: number | null;
  checkedAt: string;
  detail?: string;
}

export interface CloudProvider {
  connect(): Promise<void>;
  read<T = unknown>(query: CloudReadQuery): Promise<CloudEntity<T> | null>;
  write<T = unknown>(request: CloudWriteRequest<T>): Promise<CloudEntity<T>>;
  update<T = unknown>(request: CloudWriteRequest<T>): Promise<CloudEntity<T>>;
  delete(query: CloudReadQuery): Promise<void>;
  batchRead<T = unknown>(queries: CloudReadQuery[]): Promise<Array<CloudEntity<T> | null>>;
  readAll<T = unknown>(query: CloudReadQuery): Promise<CloudEntity<T>[]>;
  batchWrite<T = unknown>(requests: CloudWriteRequest<T>[]): Promise<CloudEntity<T>[]>;
  projectNodes(projectId: string): Promise<Record<string, unknown>[]>;
  createProjectNode(projectId: string, body: Record<string, unknown>): Promise<Record<string, unknown>>;
  updateProjectNode(projectId: string, nodeId: string, body: Record<string, unknown>): Promise<Record<string, unknown>>;
  deleteProjectNode(projectId: string, nodeId: string): Promise<void>;
  invokeWebhook(flowId: string, body: Record<string, unknown>): Promise<Record<string, unknown>>;
  health(): Promise<CloudHealth>;
  disconnect(): Promise<void>;
}

export interface ConflictRecord<T = unknown> {
  objectType: string;
  key: string;
  local: CloudEntity<T>;
  remote: CloudEntity<T>;
  detectedAt: string;
  resolution: 'last_writer_wins' | 'manual_merge' | 'rollback';
  resolved: boolean;
}

export interface CloudEventMap {
  CloudConnected: { provider: string };
  CloudDisconnected: { provider: string };
  CloudSyncStarted: { objectType?: string; key?: string };
  CloudSyncFinished: { objectType?: string; key?: string; ok: boolean };
  CloudConflictDetected: ConflictRecord;
  CloudConflictResolved: ConflictRecord;
  CloudHydrated: { userId?: string; objects: number; integrityOk: boolean };
  CloudCacheUpdated: { objectType: string; key: string; policy: CachePolicy };
  CloudOffline: { reason?: string };
  CloudOnline: { latencyMs: number | null };
}

export type CloudEventName = keyof CloudEventMap;

export interface IntegrityReport {
  ok: boolean;
  total: number;
  verified: number;
  missing: string[];
  duplicated: string[];
  failed: string[];
}
