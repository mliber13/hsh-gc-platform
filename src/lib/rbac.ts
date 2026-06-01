/**
 * RBAC helpers — workspace matrix + effective role derivation (Phase 2b).
 * Source: docs/RBAC_PLAN.md + docs/RBAC_PHASE2_MAPPING.md
 */

import type { RbacRole, UserProfile, UserRole } from '@/services/userService'
import type { Workspace } from '@/hooks/useActiveWorkspace'

export type { RbacRole }

const RBAC_ROLES: readonly RbacRole[] = [
  'owner',
  'office_gc',
  'office_drywall',
  'field_gc',
  'field_drywall',
  'viewer',
] as const

export type WorkspaceAccessLevel = 'none' | 'read' | 'write' | 'admin' | 'mixed'

/** Workspace visibility per role (Section 5 matrix). */
const WORKSPACE_ACCESS: Record<RbacRole, Record<Workspace, WorkspaceAccessLevel>> = {
  owner: {
    projects: 'admin',
    deals: 'admin',
    tenants: 'admin',
    meeting: 'admin',
    schedule: 'admin',
    hr: 'admin',
    drywall: 'admin',
  },
  office_gc: {
    projects: 'write',
    deals: 'write',
    tenants: 'write',
    meeting: 'write',
    schedule: 'write',
    hr: 'read',
    drywall: 'read',
  },
  office_drywall: {
    projects: 'read',
    deals: 'none',
    tenants: 'none',
    meeting: 'read',
    schedule: 'mixed',
    hr: 'read',
    drywall: 'admin',
  },
  field_gc: {
    projects: 'none',
    deals: 'none',
    tenants: 'none',
    meeting: 'none',
    schedule: 'read',
    hr: 'read',
    drywall: 'none',
  },
  field_drywall: {
    projects: 'none',
    deals: 'none',
    tenants: 'none',
    meeting: 'none',
    schedule: 'read',
    hr: 'read',
    drywall: 'none',
  },
  viewer: {
    projects: 'read',
    deals: 'read',
    tenants: 'read',
    meeting: 'read',
    schedule: 'read',
    hr: 'read',
    drywall: 'read',
  },
}

export function isRbacRole(value: string): value is RbacRole {
  return (RBAC_ROLES as readonly string[]).includes(value)
}

/** V1: first element of roles[] is the effective role. */
export function deriveEffectiveRole(profile: UserProfile | null | undefined): RbacRole {
  if (!profile) return 'viewer'
  const first = profile.roles?.[0]
  if (first && isRbacRole(first)) return first
  const legacy = profile.role as UserRole
  if (legacy === 'admin') return 'owner'
  if (legacy === 'editor') return 'office_gc'
  return 'viewer'
}

export function isOwnerRole(role: RbacRole): boolean {
  return role === 'owner'
}

export function rolesIncludeOwner(profile: UserProfile | null | undefined): boolean {
  if (!profile) return false
  if (profile.roles?.includes('owner')) return true
  return profile.role === 'admin'
}

export function getWorkspaceAccess(
  role: RbacRole,
  workspace: Workspace,
): WorkspaceAccessLevel {
  return WORKSPACE_ACCESS[role][workspace]
}

export function canAccessWorkspace(role: RbacRole, workspace: Workspace): boolean {
  return getWorkspaceAccess(role, workspace) !== 'none'
}

export function canWriteWorkspace(role: RbacRole, workspace: Workspace): boolean {
  const level = getWorkspaceAccess(role, workspace)
  return level === 'write' || level === 'admin' || level === 'mixed'
}

/** Owner short-circuit for capability flags (global policy). */
export function hasCapabilityFlag(
  profile: UserProfile | null | undefined,
  role: RbacRole,
  flag: 'is_meeting_operator' | 'can_admin_qb',
): boolean {
  if (rolesIncludeOwner(profile) || role === 'owner') return true
  if (flag === 'is_meeting_operator') {
    return Boolean(profile?.is_meeting_operator ?? profile?.isMeetingOperator)
  }
  return Boolean(profile?.can_admin_qb ?? profile?.canAdminQb)
}

export function canAccessQuickBooksAdmin(
  profile: UserProfile | null | undefined,
  role: RbacRole,
): boolean {
  return hasCapabilityFlag(profile, role, 'can_admin_qb')
}

export function canManageMeetingPrompts(
  profile: UserProfile | null | undefined,
  role: RbacRole,
): boolean {
  return hasCapabilityFlag(profile, role, 'is_meeting_operator')
}

export function isFeedbackOwner(
  profile:
    | UserProfile
    | Pick<UserProfile, 'role' | 'roles'>
    | { role?: string; roles?: string[] | null }
    | null
    | undefined,
): boolean {
  if (!profile) return false
  if (profile.roles?.includes('owner')) return true
  if (profile.role === 'admin') return true
  return deriveEffectiveRole(profile as UserProfile) === 'owner'
}

/** Settings sidebar items — parity with Section 5 nav matrix. */
export type SettingsNavKey =
  | 'item-library'
  | 'plan-library'
  | 'sow'
  | 'contacts'
  | 'holidays'
  | 'unavailability'
  | 'feedback'
  | 'quickbooks'

export function canSeeSettingsNavItem(role: RbacRole, key: SettingsNavKey): boolean {
  switch (key) {
    case 'item-library':
    case 'plan-library':
    case 'sow':
    case 'contacts':
      return ['owner', 'office_gc', 'office_drywall', 'viewer'].includes(role)
    case 'holidays':
    case 'unavailability':
      return role === 'owner' || role === 'office_gc'
    case 'feedback':
      return ['owner', 'office_gc', 'office_drywall', 'viewer'].includes(role)
    case 'quickbooks':
      return false // gated separately via canAccessQuickBooksAdmin
    default:
      return false
  }
}
