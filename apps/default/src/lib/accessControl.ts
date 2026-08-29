/**
 * @deprecated accessControl.ts is superseded by permissionEngine.ts, the
 * canonical authorization boundary for Lynx AI. This module is a legacy,
 * role-only section whitelist and will be removed in the next major version.
 *
 * Migration guide:
 *   1. Replace `import { canAccessSection } from './accessControl'` with
 *      `import { permissionEngine } from './permissionEngine'` and call
 *      `permissionEngine.canAccess(userId, section, 'read')`.
 *   2. Replace `getAccessLevel(role)` / `getDataScope(role)` with the
 *      identityEngine.level and permissionEngine resource scoping.
 *   3. Run the app's test suite after swapping imports.
 *
 * Removal target: next major version (no server-side authorization exists yet,
 * so this whitelist remains only as a client-side convenience).
 */

export enum AccessLevel {
  USER = 'user',
  ADMIN = 'admin',
  SUPER_ADMIN = 'super_admin',
}

export interface SectionPermissions {
  sections: string[];
  dataScope: 'personal' | 'section' | 'all';
}

export const ACCESS_PERMISSIONS: Record<AccessLevel, SectionPermissions> = {
  [AccessLevel.USER]: {
    sections: ['trading', 'academy', 'portfolio', 'cp', 'subscription'],
    dataScope: 'personal',
  },
  [AccessLevel.ADMIN]: {
    sections: ['trading', 'academy', 'portfolio', 'cp', 'subscription', 'users', 'reports', 'exchange', 'onChain', 'nft', 'sentiment', 'events', 'nations'],
    dataScope: 'section',
  },
  [AccessLevel.SUPER_ADMIN]: {
    sections: ['all'],
    dataScope: 'all',
  },
};

export function getAccessLevel(role: string): AccessLevel {
  if (role === 'super_admin') return AccessLevel.SUPER_ADMIN;
  if (role === 'admin') return AccessLevel.ADMIN;
  return AccessLevel.USER;
}

export function canAccessSection(role: string, section: string): boolean {
  const level = getAccessLevel(role);
  const permissions = ACCESS_PERMISSIONS[level];
  if (permissions.sections.includes('all')) return true;
  return permissions.sections.includes(section);
}

export function getDataScope(role: string): 'personal' | 'section' | 'all' {
  return ACCESS_PERMISSIONS[getAccessLevel(role)].dataScope;
}
