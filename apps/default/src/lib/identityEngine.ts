import { useAuthStore, type UserProfile, type UserRole } from './authStore';
import type { OrchestratorContext, EngineContract } from './lynxOrchestrator';

export type IdentityLevel = 'guest' | 'user' | 'vip' | 'moderator' | 'admin' | 'senior_admin' | 'super_admin' | 'founder' | 'developer';
export type IdentityCapability =
  | 'can_trade' | 'can_use_academy' | 'can_access_admin_panel' | 'can_view_analytics'
  | 'can_manage_users' | 'can_modify_brain' | 'can_shutdown_ai' | 'can_rollback_evolution'
  | 'can_export_platform' | 'can_manage_ai' | 'can_read_universal_memory' | 'can_read_reasoning_logs'
  | 'can_view_revenue' | 'can_manage_billing' | 'can_manage_payments' | 'can_create_agents'
  | 'can_access_founder_mode';

export interface IdentityRecord {
  id: string;
  level: IdentityLevel;
  role: UserRole;
  status: 'active' | 'suspended' | 'banned' | 'unknown';
  subscription: string;
  language: string;
  country: string;
  isOnline: boolean;
  deviceIds: string[];
  capabilities: IdentityCapability[];
}

const ROLE_LEVEL: Record<UserRole, IdentityLevel> = {
  user: 'user',
  vip: 'vip',
  admin: 'admin',
  senior_admin: 'senior_admin',
  super_admin: 'super_admin',
  founder: 'founder',
};

function capabilitiesFor(_profile: UserProfile, level: IdentityLevel): IdentityCapability[] {
  const base: IdentityCapability[] = ['can_trade', 'can_use_academy'];
  if (level === 'admin' || level === 'senior_admin' || level === 'super_admin' || level === 'founder' || level === 'developer') base.push('can_access_admin_panel', 'can_view_analytics', 'can_manage_users', 'can_view_revenue');
  if (level === 'senior_admin' || level === 'super_admin' || level === 'founder' || level === 'developer') base.push('can_modify_brain', 'can_shutdown_ai', 'can_rollback_evolution', 'can_manage_ai', 'can_read_universal_memory', 'can_read_reasoning_logs', 'can_manage_billing', 'can_manage_payments', 'can_create_agents');
  if (level === 'super_admin' || level === 'founder') base.push('can_export_platform');
  if (level === 'founder') base.push('can_access_founder_mode');
  return [...new Set(base)].filter(Boolean) as IdentityCapability[];
}

class IdentityEngine {
  getIdentity(userId: string): IdentityRecord | null {
    const profile = useAuthStore.getState().user;
    if (!profile || !useAuthStore.getState().isAuthenticated || profile.id !== userId) return null;
    const level = ROLE_LEVEL[profile.role];
    return {
      id: profile.id,
      level,
      role: profile.role,
      status: 'active',
      subscription: profile.plan,
      language: profile.language,
      country: (profile as UserProfile & { country?: string }).country || 'unknown',
      isOnline: true,
      deviceIds: [],
      capabilities: capabilitiesFor(profile, level),
    };
  }

  isAdmin(userId: string): boolean {
    const identity = this.getIdentity(userId);
    return identity?.level === 'admin' || identity?.level === 'senior_admin' || identity?.level === 'super_admin' || identity?.level === 'founder' || identity?.level === 'developer';
  }

  isSuperAdmin(userId: string): boolean {
    return this.getIdentity(userId)?.level === 'super_admin' || this.isFounder(userId);
  }

  isFounder(userId: string): boolean {
    return this.getIdentity(userId)?.level === 'founder';
  }

  private registered = false;

  async execute(_context: OrchestratorContext): Promise<void> {}
  getOrchestratorContract(): EngineContract {
    return {
      name: 'identityEngine', priority: 24, dependencies: [],
      initialize: async () => { this.registered = true; },
      execute: (ctx) => this.execute(ctx),
      shutdown: async () => { this.registered = false; },
      health: () => ({ status: this.registered ? 'healthy' : 'degraded', lastRun: null, lastDuration: 0, errorCount: 0, totalRuns: 0, avgDuration: 0 }),
    };
  }
}

export const identityEngine = new IdentityEngine();
