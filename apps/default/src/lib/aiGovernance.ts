/**
 * aiGovernance.ts — AI Governance (Enterprise)
 * Agent permission management. Complements permissionEngine (user auth) + agentSDK (agent profiles).
 * No duplicate logic. Priority 19.
 */

import type { OrchestratorContext, EngineContract } from './lynxOrchestrator';
import { permissionEngine, type AgentPermissionProfile } from './permissionEngine';

export interface AgentPermission {
  agentId: string;
  agentName: string;
  canAccess: string[];
  canModify: string[];
  canExecute: string[];
  maxResourceLevel: string;
  restrictedActions: string[];
  grantedAt: number;
  updatedAt: number;
  grantedBy: string;
  version: number;
}

export interface GovernanceReport {
  totalAgents: number;
  activeAgents: number;
  restrictedAgents: number;
  permissionsSummary: { agentId: string; accessCount: number; modifyCount: number; executeCount: number }[];
  recentChanges: { agentId: string; change: string; timestamp: number; by: string }[];
  recommendations: string[];
  /** Provenance: this scan runs client-side over local agent configuration. */
  source: string;
  /** Client-side scan is NOT a trusted authority (no server-side audit yet). */
  isAuthoritative: boolean;
}

class AIGovernance {
  private permissions: Map<string, AgentPermission> = new Map();
  private changes: { agentId: string; change: string; timestamp: number; by: string }[] = [];
  private registered = false;
  private readonly KEY = 'cv_ai_governance';

  constructor() { this.load(); }

  /** Set or update an agent's permissions */
  setAgentPermission(agentId: string, agentName: string, permissions: Partial<AgentPermission>, grantedBy: string = 'system'): AgentPermission {
    const now = Date.now();
    const existing = this.permissions.get(agentId);

    const perm: AgentPermission = existing
      ? { ...existing, ...permissions, agentName: permissions.agentName || existing.agentName, updatedAt: now, version: existing.version + 1 }
      : {
          agentId, agentName,
          canAccess: permissions.canAccess || ['public'],
          canModify: permissions.canModify || [],
          canExecute: permissions.canExecute || ['read'],
          maxResourceLevel: permissions.maxResourceLevel || 'user_private',
          restrictedActions: permissions.restrictedActions || ['delete', 'manage_billing'],
          grantedAt: now, updatedAt: now,
          grantedBy, version: 1,
        };

    this.permissions.set(agentId, perm);
    this.changes.push({ agentId, change: `Permissions updated (v${perm.version})`, timestamp: now, by: grantedBy });
    if (this.changes.length > 500) this.changes = this.changes.slice(-500);
    this.save();
    return perm;
  }

  /** Set agent permissions from an AgentPermissionProfile (imported from agentSDK) */
  setFromProfile(profile: AgentPermissionProfile, grantedBy: string = 'system'): AgentPermission {
    return this.setAgentPermission(profile.agentId, profile.agentName, {
      canAccess: profile.capabilities.map(c => c.toString()),
      canModify: profile.canModifyUsers ? ['users', 'content', 'events'] : ['profile'],
      canExecute: profile.restrictedActions.length === 0 ? ['read', 'write', 'execute', 'analyze'] : ['read', 'analyze'],
      maxResourceLevel: profile.maxResourceSensitivity,
      restrictedActions: profile.restrictedActions.map(a => a.toString()),
    }, grantedBy);
  }

  /** Check if an agent can access a resource */
  canAccess(agentId: string, resource: string): boolean {
    const perm = this.permissions.get(agentId);
    if (!perm) return false;
    if (perm.canAccess.includes('*')) return true;
    return perm.canAccess.some(r => resource.startsWith(r) || r === resource);
  }

  /** Check if an agent can modify a resource */
  canModify(agentId: string, resource: string): boolean {
    const perm = this.permissions.get(agentId);
    if (!perm) return false;
    if (perm.canModify.includes('*')) return true;
    return perm.canModify.some(r => resource.startsWith(r) || r === resource);
  }

  /** Check if an agent can execute an action */
  canExecute(agentId: string, action: string): boolean {
    const perm = this.permissions.get(agentId);
    if (!perm) return false;
    if (perm.canExecute.includes('*')) return true;
    // Cannot execute restricted actions
    if (perm.restrictedActions.includes(action)) return false;
    return perm.canExecute.some(a => a === action || a === '*');
  }

  /** Get an agent's permissions */
  getAgentPermission(agentId: string): AgentPermission | null {
    return this.permissions.get(agentId) || null;
  }

  /** Revoke an agent's permissions */
  revokeAgent(agentId: string, revokedBy: string = 'system'): boolean {
    const existed = this.permissions.has(agentId);
    if (existed) {
      this.permissions.delete(agentId);
      this.changes.push({ agentId, change: 'Permissions revoked', timestamp: Date.now(), by: revokedBy });
      this.save();
    }
    return existed;
  }

  /** Generate a governance report */
  generateReport(): GovernanceReport {
    const all = Array.from(this.permissions.values());
    const recs: string[] = [];

    for (const perm of all) {
      if (perm.canModify.includes('*')) recs.push(`${perm.agentId}: has wildcard modify — review for least privilege`);
      if (perm.version > 10) recs.push(`${perm.agentId}: has been updated ${perm.version} times — consider auditing`);
    }

    if (recs.length === 0) recs.push('No governance violations detected in the current client-side scan.');

    return {
      totalAgents: all.length,
      activeAgents: all.filter(p => p.restrictedActions.length < 5).length,
      restrictedAgents: all.filter(p => p.restrictedActions.length >= 5).length,
      permissionsSummary: all.map(p => ({
        agentId: p.agentId,
        accessCount: p.canAccess.length,
        modifyCount: p.canModify.length,
        executeCount: p.canExecute.length,
      })),
      recentChanges: this.changes.slice(-20),
      recommendations: recs,
      source: 'aiGovernance',
      isAuthoritative: false,
    };
  }

  /** Batch import agent permissions from agentMigration profiles */
  importFromSDK(profiles: AgentPermissionProfile[]): number {
    let count = 0;
    for (const profile of profiles) {
      this.setFromProfile(profile);
      count++;
    }
    return count;
  }

  // Orchestrator
  async execute(context: OrchestratorContext): Promise<void> {
    // Governance operates on-demand — permissions are queried per-request
  }

  getOrchestratorContract(): EngineContract {
    return {
      name: 'aiGovernance', priority: 19,
      dependencies: ['permissionEngine', 'contextEngine', 'identityEngine'],
      initialize: async () => { this.registered = true; },
      execute: (ctx) => this.execute(ctx),
      shutdown: async () => { this.registered = false; },
      health: () => ({ status: this.registered ? 'healthy' : 'degraded', lastRun: null, lastDuration: 0, errorCount: 0, totalRuns: 0, avgDuration: 0 }),
    };
  }

  private save(): void {
    try {
      const perms = Array.from(this.permissions.entries()).reduce((obj, [k, v]) => { (obj as any)[k] = v; return obj; }, {});
      localStorage.setItem(this.KEY, JSON.stringify({ permissions: perms, changes: this.changes.slice(-500) }));
    } catch {}
  }

  private load(): void {
    try {
      const d = localStorage.getItem(this.KEY);
      if (d) {
        const obj = JSON.parse(d);
        if (obj.permissions) { for (const [k, v] of Object.entries(obj.permissions)) this.permissions.set(k, v as AgentPermission); }
        if (obj.changes) this.changes = obj.changes;
      }
    } catch {}
  }
}

export const aiGovernance = new AIGovernance();
