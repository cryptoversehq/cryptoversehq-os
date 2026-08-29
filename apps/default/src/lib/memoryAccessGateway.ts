import { identityEngine, type IdentityRecord } from './identityEngine';
import { permissionEngine } from './permissionEngine';
import { universalMemory, type MemoryCategory, type MemoryEntry, type MemoryLevel, type MemorySearchResult, type MemorySnapshot } from './universalMemory';

// ═══════════════════════════════════════════════════════════════════════════════
// Canonical Memory Access Gateway
//
// SOLE authorized boundary for private / long-term memory.
//
//   Caller (User | Engine)
//     → memoryAccessGateway   (identity + isolation + authorization enforced here)
//     → universalMemory       (canonical private-memory store, cloud-backed)
//
// Hard guarantees:
//   - Canonical immutable subject identity only (auth profile id). No email.
//   - No localStorage / anonymous / 'default_user' identity is ever accepted.
//   - Cross-user access (read/write/delete/export) is rejected.
//   - Invalid / missing / inactive / forged / mutated identity is rejected.
//   - Authorization failure is EXPLICIT (throws). It never silently continues.
//   - Private memory never falls back to local / anonymous storage.
// ═══════════════════════════════════════════════════════════════════════════════

export type MemoryAccessAction = 'read' | 'write' | 'delete' | 'export';

export class MemoryAccessDeniedError extends Error {
  public readonly code: string;
  public readonly actorId: string;
  public readonly subjectId: string;
  constructor(code: string, actorId: string, subjectId: string, reason: string) {
    super(`[memoryAccessGateway] ${code}: ${reason} (actor=${actorId}, subject=${subjectId})`);
    this.name = 'MemoryAccessDeniedError';
    this.code = code;
    this.actorId = actorId;
    this.subjectId = subjectId;
  }
}

export interface MemoryAuditRecord {
  id: string;
  userId: string;
  actorId: string;
  action: string;
  category?: string;
  allowed: boolean;
  timestamp: number;
  reason: string;
  /** Trust provenance: audit entries are generated client-side. */
  source: 'client' | 'server';
  /** Whether this entry has been verified by an authoritative (server) source. */
  verified: boolean;
}

// System/engine subject is a special canonical subject (not a user).
const SYSTEM_SUBJECT = 'system';

class MemoryAccessGateway {
  private readonly auditKey = 'cv_memory_access_audit';
  private readonly auditLimit = 2000;

  // ── Public API ─────────────────────────────────────────────────────────

  remember(actorId: string, userId: string, category: MemoryCategory, content: unknown, opts?: { level?: MemoryLevel; importance?: number; confidence?: number; tags?: string[]; pinned?: boolean; parentId?: string | null; relatedIds?: string[] }): MemoryEntry {
    this.assertAuthorized(actorId, userId, category, 'write');
    return universalMemory.executeOperation(userId, 'remember', { category, content, opts });
  }

  rememberSystem(actorId: string, category: MemoryCategory, content: unknown, opts?: { level?: MemoryLevel; importance?: number; confidence?: number; tags?: string[]; pinned?: boolean; parentId?: string | null; relatedIds?: string[] }): MemoryEntry {
    // System/engine writes require an active admin/founder identity.
    const actor = identityEngine.getIdentity(actorId);
    if (!actor) throw new MemoryAccessDeniedError('INVALID_IDENTITY', actorId, SYSTEM_SUBJECT, 'System memory requires an authenticated identity');
    if (actor.status !== 'active') throw new MemoryAccessDeniedError('IDENTITY_INACTIVE', actorId, SYSTEM_SUBJECT, 'System memory identity is ' + actor.status);
    if (!(identityEngine.isAdmin(actorId))) throw new MemoryAccessDeniedError('SYSTEM_WRITE_FORBIDDEN', actorId, SYSTEM_SUBJECT, 'System memory requires admin identity');
    if (!permissionEngine.canAccessMemory(actorId, 'system_critical')) throw new MemoryAccessDeniedError('PERMISSION_DENIED', actorId, SYSTEM_SUBJECT, 'Missing system_critical memory permission');
    this.record(actorId, SYSTEM_SUBJECT, 'remember', category, true, 'authorized system engine write');
    return universalMemory.executeOperation(SYSTEM_SUBJECT, 'remember', { category, content, opts });
  }

  search(actorId: string, userId: string, query: string, filters?: { category?: MemoryCategory; level?: MemoryLevel; tags?: string[]; minImportance?: number }): MemorySearchResult[] {
    this.assertAuthorized(actorId, userId, filters?.category, 'read');
    return universalMemory.executeOperation(userId, 'search', { query, filters });
  }

  delete(actorId: string, userId: string, idOrCategory: string): boolean {
    this.assertAuthorized(actorId, userId, undefined, 'delete');
    return universalMemory.executeOperation(userId, 'forget', { idOrCategory });
  }

  summarize(actorId: string, userId: string, category?: MemoryCategory): string {
    this.assertAuthorized(actorId, userId, category, 'read');
    return universalMemory.executeOperation(userId, 'summarize', { category });
  }

  export(actorId: string, userId: string): MemorySnapshot | null {
    this.assertAuthorized(actorId, userId, 'system_critical', 'export');
    return universalMemory.executeOperation(userId, 'export', {});
  }

  importSnapshot(actorId: string, snapshot: MemorySnapshot): number {
    this.assertAuthorized(actorId, snapshot.userId, 'user_private', 'write');
    return universalMemory.executeOperation(snapshot.userId, 'import', { snapshot });
  }

  restoreSnapshot(actorId: string, snapshot: MemorySnapshot): boolean {
    this.assertAuthorized(actorId, snapshot.userId, 'system_critical', 'write');
    return universalMemory.executeOperation(snapshot.userId, 'restore', { snapshot });
  }

  getAudit(limit = 100): MemoryAuditRecord[] {
    try {
      const parsed = JSON.parse(localStorage.getItem(this.auditKey) || '[]');
      return Array.isArray(parsed) ? parsed.slice(-limit) : [];
    } catch {
      return [];
    }
  }

  // ── Authorization core (explicit, fail-closed) ─────────────────────────

  private assertAuthorized(actorId: string, userId: string, category: MemoryCategory | string | undefined, action: MemoryAccessAction): IdentityRecord {
    // 1. Actor identity must exist, be authenticated and active.
    const actor = identityEngine.getIdentity(actorId);
    if (!actor) {
      this.record(actorId, userId, action, category, false, 'INVALID_IDENTITY: actor identity not found or not authenticated');
      throw new MemoryAccessDeniedError('INVALID_IDENTITY', actorId, userId, 'Actor identity not found or not authenticated');
    }
    if (actor.status !== 'active') {
      this.record(actorId, userId, action, category, false, 'IDENTITY_INACTIVE: actor identity is ' + actor.status);
      throw new MemoryAccessDeniedError('IDENTITY_INACTIVE', actorId, userId, 'Actor identity is ' + actor.status);
    }

    // 2. Subject identity must be canonical (no email / anonymous / local defaults).
    const subject = this.validateSubject(userId);

    // 3. Isolation: an actor may only touch its own private memory (never another user's).
    if (subject !== SYSTEM_SUBJECT && actorId !== userId) {
      this.record(actorId, userId, action, category, false, 'CROSS_USER_DENIED: actor attempted access to another user\'s private memory');
      throw new MemoryAccessDeniedError('CROSS_USER_DENIED', actorId, userId, 'Actor cannot access another user\'s private memory');
    }

    // 4. Category-driven permission.
    const categoryClass = category === 'admin' || category === 'executive' || category === 'system_critical' ? category : 'user_private';
    if (!permissionEngine.canAccessMemory(actorId, categoryClass)) {
      this.record(actorId, userId, action, category, false, 'PERMISSION_DENIED: missing memory permission for ' + categoryClass);
      throw new MemoryAccessDeniedError('PERMISSION_DENIED', actorId, userId, 'Missing memory permission for ' + categoryClass);
    }

    // 5. Export is restricted to super admin / founder.
    if (action === 'export' && !(identityEngine.isSuperAdmin(actorId) || identityEngine.isFounder(actorId))) {
      this.record(actorId, userId, action, category, false, 'EXPORT_FORBIDDEN: export requires super admin or founder');
      throw new MemoryAccessDeniedError('EXPORT_FORBIDDEN', actorId, userId, 'Export requires super admin or founder');
    }

    this.record(actorId, userId, action, category, true, 'authorized');
    return actor;
  }

  /** Rejects any subject identity that is not the canonical immutable user id. */
  private validateSubject(userId: string): string {
    if (userId === SYSTEM_SUBJECT) return SYSTEM_SUBJECT;
    if (!userId || typeof userId !== 'string') {
      throw new MemoryAccessDeniedError('INVALID_SUBJECT', String(userId), String(userId), 'Subject identity is missing or invalid');
    }
    if (userId.includes('@')) {
      throw new MemoryAccessDeniedError('EMAIL_IDENTITY_REJECTED', userId, userId, 'Email-based identity is not permitted for private memory');
    }
    if (userId === 'anonymous' || userId === 'default_user' || userId === 'guest' || userId.startsWith('local_') || userId.startsWith('cv_')) {
      throw new MemoryAccessDeniedError('ANONYMOUS_IDENTITY_REJECTED', userId, userId, 'Anonymous / local default identity is not permitted for private memory');
    }
    return userId;
  }

  // ── Audit (security trail only — NOT private memory content) ───────────

  private record(actorId: string, userId: string, action: string, category: string | undefined, allowed: boolean, reason: string): void {
    try {
      const current = this.getAudit(this.auditLimit);
      let rnd: string;
      try {
        rnd = (crypto as any).randomUUID ? (crypto as any).randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
      } catch {
        rnd = Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
      }
      current.push({
        id: 'mem_audit_' + rnd,
        userId,
        actorId,
        action,
        category,
        allowed,
        timestamp: Date.now(),
        reason,
        // Audit entries are generated client-side and are therefore untrusted
        // sequencing/tamper-resistance metadata (no server timestamp).
        source: 'client' as const,
        verified: false,
      });
      localStorage.setItem(this.auditKey, JSON.stringify(current.slice(-this.auditLimit)));
    } catch (err) {
      // Storage quota / serialization failures are logged, not silently dropped.
      console.warn('[memoryAccessGateway] audit write failed:', err instanceof Error ? err.message : err);
    }
  }
}

export const memoryAccessGateway = new MemoryAccessGateway();
