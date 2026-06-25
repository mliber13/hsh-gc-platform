// ============================================================================
// Route-level RBAC guards (Phase 2b)
// ============================================================================

import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { usePermissions } from '@/hooks/usePermissions'
import { WORKSPACE_HOME, type Workspace } from '@/hooks/useActiveWorkspace'
import {
  canAccessWorkspace,
  canAccessCrewWorkspace,
  deriveEffectiveRole,
  isOwnerRole,
  type RbacRole,
} from '@/lib/rbac'
import type { UserProfile } from '@/services/userService'

function GuardLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
      <div className="inline-block size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
    </div>
  )
}

const WORKSPACE_FALLBACK_ORDER: Workspace[] = [
  'projects',
  'schedule',
  'meeting',
  'drywall',
  'deals',
  'tenants',
  'hr',
]

function firstAccessibleHome(
  canAccessWorkspace: (ws: Workspace) => boolean,
  role?: RbacRole | null,
): string {
  if (role === 'crew') return '/crew'
  for (const ws of WORKSPACE_FALLBACK_ORDER) {
    if (canAccessWorkspace(ws)) return WORKSPACE_HOME[ws]
  }
  return '/'
}

export function RequireWorkspaceAccess({
  workspace,
  children,
}: {
  workspace: Workspace
  children: ReactNode
}) {
  const { loading, canAccessWorkspace, effectiveRole } = usePermissions()
  if (loading) return <GuardLoading />
  if (!canAccessWorkspace(workspace)) {
    return <Navigate to={firstAccessibleHome(canAccessWorkspace, effectiveRole)} replace />
  }
  return <>{children}</>
}

export function RequireQuickBooksAdmin({ children }: { children: ReactNode }) {
  const { loading, canAccessQuickBooksAdmin, canAccessWorkspace, effectiveRole } =
    usePermissions()
  if (loading) return <GuardLoading />
  if (!canAccessQuickBooksAdmin) {
    return <Navigate to={firstAccessibleHome(canAccessWorkspace, effectiveRole)} replace />
  }
  return <>{children}</>
}

export function RequireMeetingAdmin({ children }: { children: ReactNode }) {
  const { loading, canManageMeetingPrompts, canAccessWorkspace, effectiveRole } =
    usePermissions()
  if (loading) return <GuardLoading />
  if (!canManageMeetingPrompts) {
    return <Navigate to={firstAccessibleHome(canAccessWorkspace, effectiveRole)} replace />
  }
  return <>{children}</>
}

export function RequireCanCreateProjects({ children }: { children: ReactNode }) {
  const { loading, canCreate, canAccessWorkspace, effectiveRole } = usePermissions()
  if (loading) return <GuardLoading />
  if (!canCreate) {
    return <Navigate to={firstAccessibleHome(canAccessWorkspace, effectiveRole)} replace />
  }
  return <>{children}</>
}

/** HR Team page (Phase B) — docs/HR_PORT_PLAN.md §4 */
export function canAccessHrTeamPage(role: RbacRole): boolean {
  return [
    'owner',
    'office_gc',
    'office_drywall',
    'field_gc',
    'field_drywall',
    'viewer',
  ].includes(role)
}

/** Crew Accounts admin — operators who can provision crew logins (D.6.1) */
export function canAccessHrCrewAccountsPage(role: RbacRole): boolean {
  return canWriteHrTeam(role)
}

export function canWriteHrTeam(role: RbacRole): boolean {
  return ['owner', 'office_gc', 'office_drywall'].includes(role)
}

export function RequireHrTeamAccess({ children }: { children: ReactNode }) {
  const { loading, userProfile, canAccessWorkspace } = usePermissions()
  if (loading) return <GuardLoading />
  const role = deriveEffectiveRole(userProfile)
  if (!canAccessHrTeamPage(role)) {
    return <Navigate to={firstAccessibleHome(canAccessWorkspace, role)} replace />
  }
  return <>{children}</>
}

export function RequireHrCrewAccountsAccess({ children }: { children: ReactNode }) {
  const { loading, userProfile, canAccessWorkspace } = usePermissions()
  if (loading) return <GuardLoading />
  const role = deriveEffectiveRole(userProfile)
  if (!canAccessHrCrewAccountsPage(role)) {
    return <Navigate to={firstAccessibleHome(canAccessWorkspace, role)} replace />
  }
  return <>{children}</>
}

/** Payroll operator — owner or profiles.can_run_payroll (docs/HR_PORT_PLAN.md §4) */
export function canRunPayroll(
  profile: UserProfile | null | undefined,
  role: RbacRole,
): boolean {
  if (isOwnerRole(role)) return true
  return Boolean(profile?.can_run_payroll ?? profile?.canRunPayroll)
}

export function canAccessHrPayrollPage(
  profile: UserProfile | null | undefined,
  role: RbacRole,
): boolean {
  return canRunPayroll(profile, role)
}

export function RequireCanRunPayroll({ children }: { children: ReactNode }) {
  const { loading, userProfile, canAccessWorkspace, effectiveRole } = usePermissions()
  if (loading) return <GuardLoading />
  if (!canAccessHrPayrollPage(userProfile, effectiveRole)) {
    return <Navigate to={firstAccessibleHome(canAccessWorkspace, effectiveRole)} replace />
  }
  return <>{children}</>
}

/** Time Clock page visibility (docs/HR_PORT_PLAN.md §4 matrix). */
export function canAccessHrTimeClockPage(role: RbacRole): boolean {
  return [
    'owner',
    'office_gc',
    'office_drywall',
    'field_gc',
    'field_drywall',
    'viewer',
  ].includes(role)
}

export function RequireHrTimeClockAccess({ children }: { children: ReactNode }) {
  const { loading, userProfile, canAccessWorkspace } = usePermissions()
  if (loading) return <GuardLoading />
  const role = deriveEffectiveRole(userProfile)
  if (!canAccessHrTimeClockPage(role)) {
    return <Navigate to={firstAccessibleHome(canAccessWorkspace, role)} replace />
  }
  return <>{children}</>
}

/** Drywall workspace routes — docs/DRYWALL_PORT_PLAN.md §7 + rbac WORKSPACE_ACCESS.drywall */
export function canAccessDrywallWorkspace(role: RbacRole): boolean {
  return canAccessWorkspace(role, 'drywall')
}

export function canWriteDrywallProject(role: RbacRole): boolean {
  return ['owner', 'office_drywall'].includes(role)
}

/** Field measurement + photo uploads — matches drywall-field-photos storage RLS */
export function canWriteDrywallField(role: RbacRole): boolean {
  return ['owner', 'office_gc', 'office_drywall'].includes(role)
}

/** Drywall org catalogs — owner + office_drywall write (Phase Q.A) */
export function canEditDrywallCatalogs(role: RbacRole): boolean {
  return ['owner', 'office_drywall'].includes(role)
}

export function canReadDrywallCatalogs(role: RbacRole): boolean {
  return canAccessDrywallWorkspace(role)
}

export function RequireCrewWorkspaceAccess({ children }: { children: ReactNode }) {
  const { loading, userProfile, canAccessWorkspace } = usePermissions()
  if (loading) return <GuardLoading />
  const role = deriveEffectiveRole(userProfile)
  if (!canAccessCrewWorkspace(role)) {
    return <Navigate to={firstAccessibleHome(canAccessWorkspace, role)} replace />
  }
  return <>{children}</>
}

export function RequireDrywallCatalogsAccess({ children }: { children: ReactNode }) {
  const { loading, canAccessWorkspace: canAccessWs, effectiveRole } = usePermissions()
  if (loading) return <GuardLoading />
  if (!canAccessWs('drywall')) {
    return <Navigate to={firstAccessibleHome(canAccessWs, effectiveRole)} replace />
  }
  return <>{children}</>
}

export function RequireDrywallWorkspaceAccess({ children }: { children: ReactNode }) {
  const { loading, canAccessWorkspace: canAccessWs, effectiveRole } = usePermissions()
  if (loading) return <GuardLoading />
  if (!canAccessWs('drywall')) {
    return <Navigate to={firstAccessibleHome(canAccessWs, effectiveRole)} replace />
  }
  return <>{children}</>
}
