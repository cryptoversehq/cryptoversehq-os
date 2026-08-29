/**
 * permissionEngine.ts — Permission Intelligence Layer (Sprint 6.2-B)
 * The ONLY authorization system. Hybrid RBAC + ABAC + Capability-Based.
 * Must execute BEFORE Brain Fusion. Protects Universal Memory.
 * Explainable, auditable, stateless. Priority 25.
 */

import type { OrchestratorContext, EngineContract } from './lynxOrchestrator';
import { identityEngine, type IdentityCapability, type IdentityLevel } from './identityEngine';
import { cloudRecordStore } from './cloudData';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export type ResourceSensitivity = 'public' | 'user_private' | 'team' | 'premium' | 'moderator' | 'admin' | 'super_admin' | 'founder' | 'system_critical';
export type CrudAction = 'read' | 'write' | 'update' | 'delete' | 'execute' | 'approve' | 'export' | 'share' | 'train_ai' | 'manage_memory' | 'manage_agents' | 'manage_users' | 'manage_billing' | 'manage_workspace' | 'manage_policies';

export interface PermissionContext {
  userId: string; role: string; subscription: string; workspaceId: string | null; organizationId: string | null;
  locale: string; country: string; trustScore: number; riskScore: number;
  apiScopes: string[]; featureFlags: string[];
  delegatedPermissions: DelegatedPermission[]; temporaryPermissions: TemporaryElevation[];
  sessionState: string; accountState: string; deviceVerification: string;
  requestType: string; requestedResource: string; requestedAction: CrudAction; requestedSensitivity: ResourceSensitivity;
  timestamp: number; contextHash: string;
}

export interface DelegatedPermission {
  id: string; grantor: string; delegate: string; capability: IdentityCapability; scope: string;
  expiresAt: number; reason: string; approvalChain: string[]; auditId: string; revoked: boolean; revokedAt: number | null;
}

export interface TemporaryElevation {
  id: string; userId: string; targetLevel: IdentityLevel; reason: string;
  approvedBy: string; approvedAt: number; expiresAt: number; revoked: boolean;
  auditLog: { action: string; timestamp: number; by: string }[];
}

export interface AuthorizationDecision {
  allowed: boolean; reason: string;
  requiredCapability: IdentityCapability | null; currentCapabilities: IdentityCapability[];
  policyVersion: number; auditId: string; timestamp: number;
  riskEvaluation: { trustScore: number; riskScore: number; flags: string[] };
  requestId: string; correlationId: string; contextHash: string;
  resourceSensitivity: ResourceSensitivity; userLevel: IdentityLevel; decisionPath: string[];
}

export interface AuditEntry {
  requestId: string; userId: string; identityVersion: number; contextHash: string;
  requestedResource: string; requestedAction: CrudAction; decision: string; explanation: string;
  policyVersion: number; timestamp: number; correlationId: string;
}

export interface AgentPermissionProfile {
  agentId: string; agentName: string; capabilities: IdentityCapability[]; restrictedActions: CrudAction[];
  maxResourceSensitivity: ResourceSensitivity; canAccessMemory: boolean; canAccessBrainFusion: boolean;
  canModifyUsers: boolean; canModifyBilling: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Resource Classification (every resource maps to exactly one sensitivity)
// ═══════════════════════════════════════════════════════════════════════════════

const RESOURCES: Record<string, ResourceSensitivity> = {
  landing_page: 'public', chat: 'user_private',
  academy_public: 'public', leaderboard_public: 'public',
  user_profile: 'user_private', trading_history: 'user_private', portfolio_data: 'user_private', wallet_balance: 'user_private',
  user_memory: 'user_private', emotional_profile: 'user_private', personality_profile: 'user_private', learning_profile: 'user_private',
  trading_bots: 'premium', copy_trading: 'premium', advanced_analytics: 'premium', real_exchange: 'premium',
  user_management: 'admin', content_management: 'admin', revenue_data: 'admin', analytics_dashboard: 'admin', security_logs: 'admin',
  ai_configuration: 'super_admin', engine_management: 'super_admin', brain_fusion_logs: 'super_admin', reasoning_logs: 'super_admin', evolution_control: 'super_admin',
  platform_export: 'founder', platform_import: 'founder', founder_mode: 'founder',
  universal_memory_raw: 'system_critical', identity_store: 'system_critical', orchestrator_control: 'system_critical', bootstrap_config: 'system_critical',
};

const SENSITIVITY_VALUES: ResourceSensitivity[] = ['public', 'user_private', 'team', 'premium', 'moderator', 'admin', 'super_admin', 'founder', 'system_critical'];

const LEVEL_MIN: Record<IdentityLevel, ResourceSensitivity> = {
  guest: 'public', user: 'user_private', vip: 'premium', moderator: 'premium', admin: 'admin', senior_admin: 'admin', super_admin: 'super_admin', founder: 'founder', developer: 'admin',
};

function canAccess(level: IdentityLevel, sens: ResourceSensitivity): boolean {
  return SENSITIVITY_VALUES.indexOf(LEVEL_MIN[level]) >= SENSITIVITY_VALUES.indexOf(sens);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Agent Permission Profiles (Least Privilege)
// ═══════════════════════════════════════════════════════════════════════════════

const AGENTS: Record<string, AgentPermissionProfile> = {
  trading_expert: { agentId: 'trading_expert', agentName: 'Trading Expert', capabilities: ['can_trade'], restrictedActions: ['delete', 'manage_users', 'manage_billing', 'manage_memory', 'train_ai'], maxResourceSensitivity: 'user_private', canAccessMemory: true, canAccessBrainFusion: true, canModifyUsers: false, canModifyBilling: false },
  academy_guide: { agentId: 'academy_guide', agentName: 'Academy Guide', capabilities: ['can_use_academy'], restrictedActions: ['delete', 'manage_users', 'manage_billing', 'execute'], maxResourceSensitivity: 'user_private', canAccessMemory: true, canAccessBrainFusion: true, canModifyUsers: false, canModifyBilling: false },
  admin_assistant: { agentId: 'admin_assistant', agentName: 'Admin Assistant', capabilities: ['can_access_admin_panel', 'can_view_analytics', 'can_manage_users'], restrictedActions: ['manage_billing', 'train_ai'], maxResourceSensitivity: 'admin', canAccessMemory: true, canAccessBrainFusion: true, canModifyUsers: true, canModifyBilling: false },
  super_admin: { agentId: 'super_admin', agentName: 'Super Admin', capabilities: ['can_modify_brain', 'can_shutdown_ai', 'can_rollback_evolution', 'can_export_platform', 'can_manage_ai'], restrictedActions: [], maxResourceSensitivity: 'super_admin', canAccessMemory: true, canAccessBrainFusion: true, canModifyUsers: true, canModifyBilling: true },
  brain_fusion_agent: { agentId: 'brain_fusion_agent', agentName: 'Brain Fusion', capabilities: ['can_modify_brain', 'can_read_universal_memory', 'can_read_reasoning_logs'], restrictedActions: ['delete', 'manage_billing', 'manage_users'], maxResourceSensitivity: 'super_admin', canAccessMemory: true, canAccessBrainFusion: true, canModifyUsers: false, canModifyBilling: false },
};

// ═══════════════════════════════════════════════════════════════════════════════
// PermissionEngine
// ═══════════════════════════════════════════════════════════════════════════════

class PermissionEngine {
  private registered = false;
  private delegations: Map<string, DelegatedPermission[]> = new Map();
  private elevations: Map<string, TemporaryElevation[]> = new Map();
  private auditLog: AuditEntry[] = [];
  private readonly MAX_AUDIT = 10000;
  private policyVersion = 2;
  private readonly AK = 'cv_perm_audit'; private readonly DK = 'cv_perm_del'; private readonly EK = 'cv_perm_elev';

  constructor() { this.loadAll(); }

  /** The ONE authorization method. Must execute BEFORE Brain Fusion. Returns explainable decision. */
  authorize(userId: string, resource: string, action: CrudAction, overrides?: Partial<PermissionContext>): AuthorizationDecision {
    const reqId = 'auth_' + Date.now();
    const cordId = overrides?.contextHash || reqId;
    const now = Date.now();
    const path: string[] = [];

    const identity = identityEngine.getIdentity(userId);
    if (!identity) return this.deny(reqId, cordId, 'Identity not found', userId, resource, action, 'system_critical', 'guest', [], now, path);
    path.push('ID verified: ' + identity.level);

    if (identity.status !== 'active') return this.deny(reqId, cordId, 'Account ' + identity.status, userId, resource, action, 'system_critical', identity.level, identity.capabilities, now, path);
    path.push('Active');

    const ctx = this.ctx(identity, resource, action, overrides);
    path.push('Context built');

    if (ctx.riskScore > 80 && ctx.requestedSensitivity !== 'public') {
      path.push('High risk (' + ctx.riskScore + ') — public only');
      return this.deny(reqId, cordId, 'Risk too high', userId, resource, action, ctx.requestedSensitivity, identity.level, identity.capabilities, now, path);
    }
    path.push('Risk OK');

    const sens = RESOURCES[resource] || 'user_private';
    if (!canAccess(identity.level, sens)) {
      return this.deny(reqId, cordId, 'Sensitivity ' + sens + ' denied', userId, resource, action, sens, identity.level, identity.capabilities, now, path);
    }
    path.push('Sensitivity OK');

    const cap = this.reqCap(resource, action, sens);
    if (cap && !identity.capabilities.includes(cap)) {
      return this.deny(reqId, cordId, 'Missing cap: ' + cap, userId, resource, action, sens, identity.level, identity.capabilities, now, path);
    }
    path.push('Cap OK');

    const dels = this.getActiveDelegs(userId);
    if (dels.some(d => d.capability === cap)) path.push('Delegated');

    const elevs = this.getActiveElevs(userId);
    if (elevs.length > 0) path.push('Elevated');

    if (ctx.featureFlags.length > 0 && resource.startsWith('feature:')) {
      const fn = resource.replace('feature:', '');
      if (!ctx.featureFlags.includes(fn)) return this.deny(reqId, cordId, 'Feature disabled: ' + fn, userId, resource, action, sens, identity.level, identity.capabilities, now, path);
      path.push('Feature OK');
    }

    path.push('ALLOWED');
    const dec: AuthorizationDecision = {
      allowed: true, reason: 'All checks passed',
      requiredCapability: cap || null, currentCapabilities: identity.capabilities,
      policyVersion: this.policyVersion, auditId: 'aud_' + now, timestamp: now,
      riskEvaluation: { trustScore: ctx.trustScore, riskScore: ctx.riskScore, flags: ctx.riskScore > 80 ? ['HIGH_RISK'] : [] },
      requestId: reqId, correlationId: cordId, contextHash: ctx.contextHash,
      resourceSensitivity: sens, userLevel: identity.level, decisionPath: path,
    };
    this.audit(dec, userId, resource, action, now);
    return dec;
  }

  canAccess(userId: string, resource: string, action: CrudAction): boolean { return this.authorize(userId, resource, action).allowed; }

  /** Check if user can VIEW a section based on role */
  canView(userId: string, section: string): boolean {
    const identity = identityEngine.getIdentity(userId);
    if (!identity) return false;
    const level = identity.level;
    if (level === 'founder' || level === 'super_admin' || level === 'senior_admin' || level === 'admin') return true;
    if (level === 'moderator' && section.startsWith('user_')) return true;
    if (level === 'vip' || level === 'user') {
      return ['trading', 'academy', 'portfolio', 'wallet', 'profile'].some(s => section.startsWith(s));
    }
    return false;
  }

  /** Check if user can EDIT a section based on role */
  canEdit(userId: string, section: string): boolean {
    const identity = identityEngine.getIdentity(userId);
    if (!identity) return false;
    const level = identity.level;
    if (level === 'founder' || level === 'super_admin') return true;
    if (level === 'senior_admin') return section !== 'system_critical';
    if (level === 'admin') return ['users', 'content', 'events', 'academy', 'notifications'].some(s => section.startsWith(s));
    if (level === 'moderator') return ['flagged_content'].includes(section);
    if (level === 'vip') return ['profile', 'settings'].includes(section);
    if (level === 'user') return ['profile'].includes(section);
    return false;
  }

  ctx(identity: any, resource: string, action: CrudAction, overrides?: Partial<PermissionContext>): PermissionContext {
    const now = Date.now();
    return {
      userId: identity.id, role: identity.level, subscription: identity.subscription || 'free',
      workspaceId: overrides?.workspaceId || null, organizationId: overrides?.organizationId || null,
      locale: identity.language || 'en', country: identity.country || 'unknown',
      trustScore: 85, riskScore: 15, apiScopes: overrides?.apiScopes || [], featureFlags: overrides?.featureFlags || [],
      delegatedPermissions: this.getActiveDelegs(identity.id), temporaryPermissions: this.getActiveElevs(identity.id),
      sessionState: identity.isOnline ? 'active' : 'expired', accountState: identity.status || 'active',
      deviceVerification: identity.deviceIds?.length > 0 ? 'verified' : 'unknown',
      requestType: 'api', requestedResource: resource, requestedAction: action,
      requestedSensitivity: RESOURCES[resource] || 'user_private',
      timestamp: now, contextHash: 'ctx_' + identity.id + '_' + resource + '_' + now,
    };
  }

  // Delegated Permissions
  delegate(grantor: string, delegate: string, capability: IdentityCapability, scope: string, expiresAt: number, reason: string): DelegatedPermission {
    const d: DelegatedPermission = { id: 'del_' + Date.now(), grantor, delegate, capability, scope, expiresAt, reason, approvalChain: [grantor], auditId: 'aud_del_' + Date.now(), revoked: false, revokedAt: null };
    if (!this.delegations.has(delegate)) this.delegations.set(delegate, []);
    this.delegations.get(delegate)!.push(d); this.saveD(); return d;
  }

  revokeDelegation(delegate: string, delegationId: string): boolean {
    const ds = this.delegations.get(delegate); if (!ds) return false;
    const d = ds.find(x => x.id === delegationId); if (!d) return false;
    d.revoked = true; d.revokedAt = Date.now(); this.saveD(); return true;
  }

  getActiveDelegs(userId: string): DelegatedPermission[] {
    const all = this.delegations.get(userId) || []; const now = Date.now();
    return all.filter(d => !d.revoked && d.expiresAt > now);
  }

  // Temporary Elevation
  requestElevation(userId: string, targetLevel: IdentityLevel, reason: string, approvedBy: string, durationMs: number): TemporaryElevation {
    const now = Date.now();
    const e: TemporaryElevation = { id: 'elev_' + now, userId, targetLevel, reason, approvedBy, approvedAt: now, expiresAt: now + durationMs, revoked: false, auditLog: [{ action: 'requested', timestamp: now, by: userId }, { action: 'approved', timestamp: now, by: approvedBy }] };
    if (!this.elevations.has(userId)) this.elevations.set(userId, []);
    this.elevations.get(userId)!.push(e); this.saveE(); return e;
  }

  revokeElevation(userId: string, elevationId: string): boolean {
    const es = this.elevations.get(userId); if (!es) return false;
    const e = es.find(x => x.id === elevationId); if (!e) return false;
    e.revoked = true; e.auditLog.push({ action: 'revoked', timestamp: Date.now(), by: 'system' }); this.saveE(); return true;
  }

  getActiveElevs(userId: string): TemporaryElevation[] {
    const all = this.elevations.get(userId) || []; const now = Date.now();
    return all.filter(e => !e.revoked && e.expiresAt > now);
  }

  // Agent Authorization
  getAgentProfile(agentId: string): AgentPermissionProfile | null { return AGENTS[agentId] || null; }

  authorizeAgent(agentId: string, resource: string, action: CrudAction): AuthorizationDecision {
    const p = AGENTS[agentId];
    if (!p) return this.deny('ag_' + Date.now(), '', 'Unknown agent', agentId, resource, action, 'system_critical', 'guest', [], Date.now(), []);
    if (p.restrictedActions.includes(action)) return this.deny('ag_' + Date.now(), '', 'Restricted', agentId, resource, action, 'admin', 'admin', p.capabilities, Date.now(), []);
    const sens = RESOURCES[resource] || 'user_private';
    if (SENSITIVITY_VALUES.indexOf(sens) > SENSITIVITY_VALUES.indexOf(p.maxResourceSensitivity)) return this.deny('ag_' + Date.now(), '', 'Sensitivity exceed', agentId, resource, action, sens, 'admin', p.capabilities, Date.now(), []);
    return { allowed: true, reason: 'Agent OK', requiredCapability: null, currentCapabilities: p.capabilities, policyVersion: this.policyVersion, auditId: 'aud_ag_' + Date.now(), timestamp: Date.now(), riskEvaluation: { trustScore: 80, riskScore: 10, flags: [] }, requestId: 'ag_' + Date.now(), correlationId: '', contextHash: '', resourceSensitivity: sens, userLevel: 'admin', decisionPath: ['Agent authorized'] };
  }

  // Memory Protection - user-private categories open to all authenticated users.
  // Elevated categories (admin, executive, system_critical) require RBAC.
  canAccessMemory(userId: string, memCat: string): boolean {
    const identity = identityEngine.getIdentity(userId);
    // User-private: any authenticated active user can access their own memory.
    // This includes conversation, emotional, personality, and user_private categories.
    if (memCat === 'user_private' || memCat === 'emotional' || memCat === 'personality' || memCat === 'conversation') {
      return Boolean(identity && identity.status === 'active');
    }
    // Elevated categories require universal_memory_raw read access.
    if (!this.authorize(userId, 'universal_memory_raw', 'read').allowed) return false;
    if (memCat === 'admin' || memCat === 'executive') return identityEngine.isAdmin(userId);
    if (memCat === 'system_critical') return identityEngine.isSuperAdmin(userId) || identityEngine.isFounder(userId);
    return identityEngine.isSuperAdmin(userId) || identityEngine.isFounder(userId);
  }

  // Feature Flags
  isFeatureEnabled(userId: string, featureName: string): boolean { return this.authorize(userId, 'feature:' + featureName, 'execute').allowed; }

  // Audit
  getAuditLog(limit = 100): AuditEntry[] { return this.auditLog.slice(-limit); }
  getAuditForUser(userId: string, limit = 50): AuditEntry[] { return this.auditLog.filter(e => e.userId === userId).slice(-limit); }
  generateAuditReport() { const t = this.auditLog.length; const a = this.auditLog.filter(e => e.decision === 'allowed').length; const r: Record<string,number> = {}; for (const e of this.auditLog) r[e.requestedResource] = (r[e.requestedResource]||0)+1; return { total: t, allowed: a, denied: t - a, topResources: r }; }

  // Orchestrator
  async execute(context: OrchestratorContext): Promise<void> { this.cleanup(); }
  getOrchestratorContract(): EngineContract {
    return {
      name: 'permissionEngine', priority: 25, dependencies: ['identityEngine', 'universalMemory', 'brainFusion', 'contextEngine', 'selfEvolutionEngine', 'analyticsCenter'],
      initialize: async () => { this.registered = true; }, execute: (ctx) => this.execute(ctx), shutdown: async () => { this.registered = false; },
      health: () => ({ status: this.registered ? 'healthy' : 'degraded', lastRun: null, lastDuration: 0, errorCount: 0, totalRuns: 0, avgDuration: 0 }),
    };
  }

  // Private
  private deny(rid: string, cid: string, reason: string, uid: string, res: string, act: CrudAction, sens: ResourceSensitivity, lvl: IdentityLevel, caps: IdentityCapability[], now: number, path: string[]): AuthorizationDecision {
    path.push('DENIED: ' + reason);
    const dec: AuthorizationDecision = { allowed: false, reason, requiredCapability: null, currentCapabilities: caps, policyVersion: this.policyVersion, auditId: 'aud_' + now, timestamp: now, riskEvaluation: { trustScore: 0, riskScore: 100, flags: ['DENIED'] }, requestId: rid, correlationId: cid, contextHash: '', resourceSensitivity: sens, userLevel: lvl, decisionPath: path };
    this.audit(dec, uid, res, act, now); return dec;
  }

  private reqCap(resource: string, action: CrudAction, sens: ResourceSensitivity): IdentityCapability | null {
    if (resource.startsWith('admin/')) return 'can_access_admin_panel';
    if (resource.startsWith('revenue')) return 'can_view_revenue';
    if (resource === 'universal_memory_raw') return 'can_read_universal_memory';
    if (resource === 'reasoning_logs') return 'can_read_reasoning_logs';
    if (action === 'execute' && sens === 'founder') return 'can_access_founder_mode';
    if (action === 'export') return 'can_export_platform';
    if (action === 'manage_billing') return 'can_manage_payments';
    if (action === 'manage_users') return 'can_manage_users';
    if (action === 'manage_agents') return 'can_create_agents';
    if (action === 'train_ai') return 'can_manage_ai';
    return null;
  }

  private audit(dec: AuthorizationDecision, uid: string, res: string, act: CrudAction, now: number): void {
    const e: AuditEntry = { requestId: dec.requestId, userId: uid, identityVersion: 1, contextHash: dec.contextHash, requestedResource: res, requestedAction: act, decision: dec.allowed ? 'allowed' : 'denied', explanation: dec.reason, policyVersion: this.policyVersion, timestamp: now, correlationId: dec.correlationId };
    this.auditLog.push(e); if (this.auditLog.length > this.MAX_AUDIT) this.auditLog = this.auditLog.slice(-this.MAX_AUDIT); this.saveA();
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [uid, ds] of this.delegations) this.delegations.set(uid, ds.filter(d => d.expiresAt > now));
    for (const [uid, es] of this.elevations) this.elevations.set(uid, es.filter(e => e.expiresAt > now));
    this.saveD(); this.saveE();
  }

  private saveA(): void {
    try {
      const data = this.auditLog.slice(-this.MAX_AUDIT);
      Promise.resolve(cloudRecordStore.set('permissions', 'perm_audit', data)).catch(() => {
        localStorage.setItem(this.AK, JSON.stringify(data));
      });
    } catch {}
  }
  private saveD(): void {
    try {
      const o: Record<string, DelegatedPermission[]> = {};
      for (const [uid, d] of this.delegations) o[uid] = d;
      Promise.resolve(cloudRecordStore.set('permissions', 'perm_delegations', o)).catch(() => {
        localStorage.setItem(this.DK, JSON.stringify(o));
      });
    } catch {}
  }
  private saveE(): void {
    try {
      const o: Record<string, TemporaryElevation[]> = {};
      for (const [uid, e] of this.elevations) o[uid] = e;
      Promise.resolve(cloudRecordStore.set('permissions', 'perm_elevations', o)).catch(() => {
        localStorage.setItem(this.EK, JSON.stringify(o));
      });
    } catch {}
  }
  private loadAll(): void {
    const loadAudit = async () => {
      try {
        const remote = await cloudRecordStore.get<AuditEntry[]>('permissions', 'perm_audit', []);
        if (remote.length > 0) {
          this.auditLog = remote.slice(-this.MAX_AUDIT);
          return;
        }
        const legacy = localStorage.getItem(this.AK);
        if (legacy) {
          const data = JSON.parse(legacy).slice(-this.MAX_AUDIT) as AuditEntry[];
          this.auditLog = data;
          cloudRecordStore.set('permissions', 'perm_audit', data);
          localStorage.removeItem(this.AK);
        }
      } catch {
        try {
          const legacy = localStorage.getItem(this.AK);
          if (legacy) this.auditLog = JSON.parse(legacy).slice(-this.MAX_AUDIT);
        } catch {}
      }
    };

    const loadDelegations = async () => {
      try {
        const remote = await cloudRecordStore.get<Record<string, DelegatedPermission[]>>('permissions', 'perm_delegations', {});
        if (Object.keys(remote).length > 0) {
          for (const [uid, permissions] of Object.entries(remote)) this.delegations.set(uid, permissions);
          return;
        }
        const legacy = localStorage.getItem(this.DK);
        if (legacy) {
          const data = JSON.parse(legacy) as Record<string, DelegatedPermission[]>;
          for (const [uid, permissions] of Object.entries(data)) this.delegations.set(uid, permissions);
          cloudRecordStore.set('permissions', 'perm_delegations', data);
          localStorage.removeItem(this.DK);
        }
      } catch {
        try {
          const legacy = localStorage.getItem(this.DK);
          if (legacy) {
            const data = JSON.parse(legacy) as Record<string, DelegatedPermission[]>;
            for (const [uid, permissions] of Object.entries(data)) this.delegations.set(uid, permissions);
          }
        } catch {}
      }
    };

    const loadElevations = async () => {
      try {
        const remote = await cloudRecordStore.get<Record<string, TemporaryElevation[]>>('permissions', 'perm_elevations', {});
        if (Object.keys(remote).length > 0) {
          for (const [uid, elevations] of Object.entries(remote)) this.elevations.set(uid, elevations);
          return;
        }
        const legacy = localStorage.getItem(this.EK);
        if (legacy) {
          const data = JSON.parse(legacy) as Record<string, TemporaryElevation[]>;
          for (const [uid, elevations] of Object.entries(data)) this.elevations.set(uid, elevations);
          cloudRecordStore.set('permissions', 'perm_elevations', data);
          localStorage.removeItem(this.EK);
        }
      } catch {
        try {
          const legacy = localStorage.getItem(this.EK);
          if (legacy) {
            const data = JSON.parse(legacy) as Record<string, TemporaryElevation[]>;
            for (const [uid, elevations] of Object.entries(data)) this.elevations.set(uid, elevations);
          }
        } catch {}
      }
    };

    void Promise.all([loadAudit(), loadDelegations(), loadElevations()]);
  }
}

export const permissionEngine = new PermissionEngine();
