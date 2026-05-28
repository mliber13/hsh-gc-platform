/**
 * usePermissions — RBAC consumer (Phase 2b).
 *
 * Owner short-circuit: roles.includes('owner') forces every capability-flag
 * check to true (is_meeting_operator, can_admin_qb, future flags).
 */

import { useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import type { UserProfile, UserRole } from '@/services/userService'
import type { Workspace } from '@/hooks/useActiveWorkspace'
import {
  type RbacRole,
  canAccessWorkspace as rbacCanAccessWorkspace,
  canWriteWorkspace as rbacCanWriteWorkspace,
  canAccessQuickBooksAdmin as rbacCanAccessQuickBooksAdmin,
  canManageMeetingPrompts as rbacCanManageMeetingPrompts,
  deriveEffectiveRole,
  isOwnerRole,
} from '@/lib/rbac'

export type { RbacRole }

export function usePermissions() {
  const { profile, profileLoading: rawProfileLoading, isOnline, user } = useAuth()

  const offlineProfile: UserProfile = useMemo(
    () => ({
      id: 'offline',
      email: 'offline@local',
      full_name: 'Offline User',
      organization_id: 'offline',
      role: 'admin',
      roles: ['owner'],
      is_meeting_operator: true,
      can_admin_qb: true,
      isMeetingOperator: true,
      canAdminQb: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    [],
  )

  const userProfile = !isOnline ? offlineProfile : profile
  // A profile is expected whenever we have a user. Until we have one, treat as loading.
  // This handles the render gap between user-state populating and the profile-fetch
  // effect firing (effects run after render commit, so there's at least one render
  // where user is set but profileLoading hasn't flipped back to true yet).
  const profileLoading = rawProfileLoading || (isOnline && !!user && !profile)
  const loading = isOnline ? profileLoading : false
  const effectiveRole: RbacRole = deriveEffectiveRole(userProfile)
  const legacyRole: UserRole = userProfile?.role ?? 'viewer'

  const isOwner = isOwnerRole(effectiveRole)

  const isMeetingOperator = rbacCanManageMeetingPrompts(userProfile, effectiveRole)
  const canAdminQb = rbacCanAccessQuickBooksAdmin(userProfile, effectiveRole)

  const isAdmin = isOwner
  const isEditor = ['owner', 'office_gc', 'office_drywall'].includes(effectiveRole)
  const isViewer = effectiveRole === 'viewer'
  const canCreate = ['owner', 'office_gc'].includes(effectiveRole)
  const canEdit = ['owner', 'office_gc', 'office_drywall'].includes(effectiveRole)
  const canDelete = ['owner', 'office_gc'].includes(effectiveRole)
  const canManageUsers = isOwner
  const canInviteUsers = isOwner

  const canAccessWorkspace = (ws: Workspace) =>
    rbacCanAccessWorkspace(effectiveRole, ws)

  const canWriteWorkspace = (ws: Workspace) =>
    rbacCanWriteWorkspace(effectiveRole, ws)

  const canAccessQuickBooksAdmin = rbacCanAccessQuickBooksAdmin(
    userProfile,
    effectiveRole,
  )

  const canManageMeetingPrompts = rbacCanManageMeetingPrompts(
    userProfile,
    effectiveRole,
  )

  const canRunPayroll =
    isOwner || Boolean(userProfile?.can_run_payroll ?? userProfile?.canRunPayroll)

  return {
    userProfile,
    profile: userProfile,
    role: legacyRole,
    effectiveRole,
    loading,
    isOwner,
    isAdmin,
    isEditor,
    isViewer,
    canCreate,
    canEdit,
    canDelete,
    canManageUsers,
    canInviteUsers,
    flags: {
      isMeetingOperator,
      canAdminQb,
    },
    canAccessWorkspace,
    canWriteWorkspace,
    canAccessQuickBooksAdmin,
    canManageMeetingPrompts,
    canRunPayroll,
  }
}
