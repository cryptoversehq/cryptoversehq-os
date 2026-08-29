/**
 * platformExport.ts — Enterprise Platform Export v6.5-A
 * 
 * Production-grade export pipeline:
 *   - Complete data snapshot (users, roles, permissions, marketplace, revenue,
 *     analytics, trading, wallet, academy, seasons, leaderboards, AI memory,
 *     knowledge graph, relationships, evolution, learning, configs, policies,
 *     governance, observability, notifications)
 *   - JSON output + Blob download
 *   - Integrity checksum (SHA-256)
 *   - Audit logging with timestamp and actor
 *   - Permission enforcement
 *   - Password/secret redaction
 */

import { useAuthStore } from './authStore';
import { getPlatformSnapshot } from './platformData';
import { useStrategyStore } from './strategyStore';
import { useBotStore } from './botStore';
import { useTradingStore } from './tradingStore';
import { useAcademyStore } from './academyStore';
import { useOnChainStore } from './onChainStore';
import { insightGraph } from './insightGraph';
import { relationshipEngine } from './relationshipEngine';
import { selfEvolutionEngine } from './selfEvolutionEngine';
import { aiGovernance } from './aiGovernance';
import { aiObservability } from './aiObservability';
import { permissionEngine } from './permissionEngine';
import { memoryAccessGateway } from './memoryAccessGateway';
import { lynxOrchestrator } from './lynxOrchestrator';

export interface EnterprisePlatformExport {
  metadata: {
    version: string;
    exportedAt: string;
    actorId: string;
    checksum: string;
    recordCount: number;
  };
  users: unknown[];
  roles: unknown;
  permissions: unknown;
  marketplace: unknown;
  revenue: unknown;
  analytics: unknown;
  trading: unknown;
  wallet: unknown;
  academy: unknown;
  seasons: unknown;
  leaderboards: unknown;
  aiMemories: unknown;
  knowledgeGraph: unknown;
  relationships: unknown;
  evolutionHistory: unknown;
  learningHistory: unknown;
  configurations: unknown;
  runtimeSettings: unknown;
  aiPolicies: unknown;
  aiGovernance: unknown;
  observability: unknown;
  notifications: unknown;
  auditLog: ExportAuditEntry[];
}

export interface ExportAuditEntry {
  timestamp: string;
  actorId: string;
  action: 'export_created' | 'export_downloaded' | 'export_failed';
  checksum: string;
  recordCount: number;
  ipHash: string;
}

export interface ExportDownloadResult {
  success: boolean;
  url?: string;
  filename?: string;
  checksum?: string;
  sizeBytes?: number;
  recordCount?: number;
  error?: string;
}

const AUDIT_STORAGE_KEY = 'cv_platform_export_audit';
const EXPORT_CACHE_KEY = 'cv_platform_export_cache';

const SENSITIVE_KEY_PATTERNS = ['password', 'secret', 'key', 'token', 'phrase', 'hash', 'seed', 'mnemonic', 'pin', 'private', 'credit', 'cvv', 'ssn', 'tax'];

function clone(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  try { return JSON.parse(JSON.stringify(value)); } catch { return null; }
}

function isSensitive(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some(p => lower.includes(p)) && !lower.includes('public');
}

function redact(obj: unknown, depth = 0): unknown {
  if (depth > 50) return '[MAX_DEPTH]';
  if (obj === undefined || obj === null) return obj;
  if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') return obj;
  if (Array.isArray(obj)) {
    return (obj as unknown[]).map(item => redact(item, depth + 1));
  }
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      result[key] = isSensitive(key)
        ? '[REDACTED]'
        : redact((obj as Record<string, unknown>)[key], depth + 1);
    }
    return result;
  }
  return obj;
}

function readJsonKeys(prefixes: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (typeof localStorage === 'undefined') return result;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !prefixes.some(prefix => key.startsWith(prefix))) continue;
    try {
      const raw = localStorage.getItem(key);
      result[key] = raw ? JSON.parse(raw) : null;
    } catch {
      result[key] = localStorage.getItem(key);
    }
  }
  return redact(result) as Record<string, unknown>;
}

function readUsers(): unknown[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem('cryptoverse_users') || '{}') as Record<string, Record<string, unknown>>;
    return Object.values(raw).map(entry => redact({ ...entry }) as Record<string, unknown>);
  } catch { return []; }
}

function readAuditLog(): ExportAuditEntry[] {
  try {
    const raw = localStorage.getItem(AUDIT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function appendAuditLog(entry: ExportAuditEntry): void {
  try {
    const logs = readAuditLog();
    logs.push(entry);
    if (logs.length > 1000) logs.splice(0, logs.length - 1000);
    localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(logs));
  } catch { /* quota */ }
}

function getTotalRecordCount(data: Record<string, unknown>): number {
  let count = 0;
  for (const val of Object.values(data)) {
    if (Array.isArray(val)) count += val.length;
    else if (val && typeof val === 'object') count++;
  }
  return count;
}

async function computeChecksum(json: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(json);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    let hash = 5381;
    for (let i = 0; i < json.length; i++) {
      hash = ((hash << 5) + hash + json.charCodeAt(i)) & 0xFFFFFFFF;
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }
}

export async function createEnterprisePlatformExport(actorId: string): Promise<EnterprisePlatformExport | null> {
  const decision = permissionEngine.authorize(actorId, 'platform_export', 'export');
  if (!decision.allowed) {
    appendAuditLog({
      timestamp: new Date().toISOString(),
      actorId,
      action: 'export_failed',
      checksum: 'N/A',
      recordCount: 0,
      ipHash: 'permission_denied',
    });
    return null;
  }

  const auth = useAuthStore.getState();
  const trading = useTradingStore.getState();
  const academy = useAcademyStore.getState();
  const marketplace = clone(useStrategyStore.getState());
  const bots = clone(useBotStore.getState());
  const wallet = clone(useOnChainStore.getState());
  const graph = insightGraph.generateReport();
  const memory = memoryAccessGateway.export(actorId, actorId);
  const orchestratorDiagnostics = lynxOrchestrator.getDiagnostics();

  // Build optional store snapshots with error isolation
  let optionalStores: Record<string, unknown> = {};
  try {
    const { useNationsStore } = await import('./nationsStore');
    optionalStores.nations = clone(useNationsStore.getState());
  } catch { /* optional */ }
  try {
    const { useSentimentStore } = await import('./sentimentStore');
    optionalStores.sentiment = clone(useSentimentStore.getState());
  } catch { /* optional */ }
  try {
    const { useCopyTradingStore } = await import('./copyTradingStore');
    optionalStores.copyTrading = clone(useCopyTradingStore.getState());
  } catch { /* optional */ }
  try {
    const { useExchangeStore } = await import('./exchangeStore');
    optionalStores.exchange = clone(useExchangeStore.getState());
  } catch { /* optional */ }
  try {
    const { useNftStore } = await import('./nftStore');
    optionalStores.nft = clone(useNftStore.getState());
  } catch { /* optional */ }
  try {
    const { useLiveEventStore } = await import('./liveEventStore');
    optionalStores.liveEvents = clone(useLiveEventStore.getState());
  } catch { /* optional */ }
  try {
    const { useNotificationStore } = await import('./notificationStore');
    optionalStores.notifications = clone(useNotificationStore.getState());
  } catch { /* optional */ }

  const data: Record<string, unknown> = {
    version: '6.5-A',
    exportedAt: new Date().toISOString(),
    actorId,
    users: readUsers(),
    roles: { supported: ['founder', 'super_admin', 'senior_admin', 'admin', 'vip', 'user', 'guest'], active: auth.user?.role || null },
    permissions: { policy: clone(permissionEngine.generateAuditReport()), audit: clone(permissionEngine.getAuditLog()) },
    marketplace: { strategies: redact(marketplace), bots: redact(bots) },
    revenue: readJsonKeys(['cv_revenue', 'cv_payment', 'nowpayments', 'cv_monetization']),
    analytics: redact(getPlatformSnapshot()),
    trading: redact(trading),
    wallet: redact(wallet),
    academy: redact(academy),
    seasons: readJsonKeys(['cv_season', 'cv_competition', 'cv_nations']),
    leaderboards: readJsonKeys(['cv_leaderboard', 'cv_twin_league']),
    aiMemories: redact(memory),
    knowledgeGraph: redact(graph),
    relationships: clone(relationshipEngine.getAll()),
    evolutionHistory: clone(selfEvolutionEngine.exportEvolution()),
    learningHistory: readJsonKeys(['cv_learning_']),
    configurations: readJsonKeys(['cv_config', 'cv_settings', 'cryptoverse_config']),
    runtimeSettings: {
      orchestrator: 'enterprise',
      auth: redact(auth.user ? { id: auth.user.id, role: auth.user.role } : null),
      orchestratorDiagnostics: redact(orchestratorDiagnostics),
    },
    aiPolicies: redact(aiGovernance.generateReport()),
    aiGovernance: redact(aiGovernance.generateReport()),
    observability: redact(aiObservability.getPerformanceReport('day')),
    ...optionalStores,
    auditLog: readAuditLog(),
  };

  return data as unknown as EnterprisePlatformExport;
}

export async function downloadEnterpriseExport(actorId: string): Promise<ExportDownloadResult> {
  try {
    const exportData = await createEnterprisePlatformExport(actorId);
    if (!exportData) {
      return { success: false, error: 'Permission denied.' };
    }

    const recordCount = getTotalRecordCount(exportData as unknown as Record<string, unknown>);
    const exportJson = JSON.stringify(exportData, null, 2);
    const checksum = await computeChecksum(exportJson);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `cryptoverse-enterprise-export-${timestamp}.json`;

    const blob = new Blob([exportJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    try {
      localStorage.setItem(EXPORT_CACHE_KEY, JSON.stringify({
        checksum, timestamp: new Date().toISOString(), recordCount, actorId,
      }));
    } catch { /* */ }

    appendAuditLog({
      timestamp: new Date().toISOString(), actorId,
      action: 'export_downloaded', checksum, recordCount, ipHash: 'client',
    });

    return { success: true, url, filename, checksum, sizeBytes: blob.size, recordCount };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    appendAuditLog({
      timestamp: new Date().toISOString(), actorId,
      action: 'export_failed', checksum: 'N/A', recordCount: 0, ipHash: 'error',
    });
    return { success: false, error: message };
  }
}

export async function verifyExportIntegrity(json: string, expectedChecksum: string): Promise<boolean> {
  const actual = await computeChecksum(json);
  return actual === expectedChecksum;
}

export function getExportAuditLog(): ExportAuditEntry[] {
  return readAuditLog();
}

export function clearExportAuditLog(actorId: string): void {
  const decision = permissionEngine.authorize(actorId, 'platform_export', 'admin');
  if (decision.allowed) {
    try { localStorage.removeItem(AUDIT_STORAGE_KEY); } catch { /* */ }
  }
}
