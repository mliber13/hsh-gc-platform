/**
 * User Management Service
 * Simplified version - user management is handled in Supabase Dashboard
 */

import { supabase } from '../lib/supabase';
import type { CrewProfileLink } from '@/types/crew';

export type UserRole = 'admin' | 'editor' | 'viewer';
export type RbacRole =
  | 'owner'
  | 'office_gc'
  | 'office_drywall'
  | 'field_gc'
  | 'field_drywall'
  | 'viewer'
  | 'crew';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  organization_id: string;
  role: UserRole;
  roles?: string[];
  is_meeting_operator?: boolean;
  can_admin_qb?: boolean;
  can_run_payroll?: boolean;
  hr_person_id?: string | null;
  hr_person_type?: string | null;
  isMeetingOperator?: boolean;
  canAdminQb?: boolean;
  canRunPayroll?: boolean;
  hrPersonId?: string | null;
  hrPersonType?: string | null;
  linked_employee_id?: string | null;
  linked_contractor_id?: string | null;
  linkedEmployeeId?: string | null;
  linkedContractorId?: string | null;
  is_active?: boolean;
  created_at: string;
  updated_at: string;
}

function normalizeUserProfile(row: any): UserProfile {
  const roles = Array.isArray(row?.roles)
    ? row.roles.filter((v: unknown): v is string => typeof v === 'string')
    : [];
  const isMeetingOperator = Boolean(row?.is_meeting_operator);
  const canAdminQb = Boolean(row?.can_admin_qb);
  const canRunPayroll = Boolean(row?.can_run_payroll);
  const hrPersonId =
    typeof row?.hr_person_id === 'string' ? row.hr_person_id : row?.hr_person_id ?? null;
  const hrPersonType =
    typeof row?.hr_person_type === 'string' ? row.hr_person_type : row?.hr_person_type ?? null;
  const linkedEmployeeId =
    typeof row?.linked_employee_id === 'string'
      ? row.linked_employee_id
      : row?.linked_employee_id ?? null;
  const linkedContractorId =
    typeof row?.linked_contractor_id === 'string'
      ? row.linked_contractor_id
      : row?.linked_contractor_id ?? null;
  return {
    ...row,
    roles,
    is_meeting_operator: isMeetingOperator,
    can_admin_qb: canAdminQb,
    can_run_payroll: canRunPayroll,
    hr_person_id: hrPersonId,
    hr_person_type: hrPersonType,
    linked_employee_id: linkedEmployeeId,
    linked_contractor_id: linkedContractorId,
    isMeetingOperator,
    canAdminQb,
    canRunPayroll,
    hrPersonId,
    hrPersonType,
    linkedEmployeeId,
    linkedContractorId,
  } as UserProfile;
}

/**
 * Get all users in the current organization
 */
export async function getOrganizationUsers(): Promise<UserProfile[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Get current user's profile to find organization_id
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (profileError) throw profileError;

  // Get all users in the same organization
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('organization_id', profile.organization_id)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(normalizeUserProfile);
}

/**
 * Get org users keyed by email (lowercase) for matching contacts to app users.
 */
export async function getOrganizationUsersByEmail(): Promise<Map<string, UserProfile>> {
  const users = await getOrganizationUsers();
  const map = new Map<string, UserProfile>();
  for (const u of users) {
    if (u.email) map.set(u.email.toLowerCase().trim(), u);
  }
  return map;
}

/**
 * Set user active/inactive (revoke or restore app access). Admin only.
 */
export async function setUserActive(userId: string, isActive: boolean): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) throw error;
}

/**
 * Get current user's profile
 */
export async function getCurrentUserProfile(): Promise<UserProfile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }

  return normalizeUserProfile(data);
}

/**
 * Resolve the current authenticated user's organization_id, or throw.
 *
 * Use this when WRITING org-scoped data. It guarantees a non-null org id and
 * eliminates the need for `'default-org'` fallbacks scattered across services.
 * If a write path is reached without an org id, that's a bug worth surfacing
 * rather than a fallback that papers over auth/RLS state.
 *
 * Returns whatever value `profiles.organization_id` currently holds — text
 * (`'default-org'` or a UUID-as-text) until A5-e completes the in-place type
 * conversion to uuid; pure uuid afterwards. Callers should not assume UUID
 * format yet.
 *
 * Use `getCurrentUserProfile()` directly when reading org id is allowed to
 * fail silently (e.g., offline or read-only paths).
 *
 * @throws Error if no authenticated user / no profile row / profile has no organization_id
 */
export async function requireUserOrgId(): Promise<string> {
  const profile = await getCurrentUserProfile();
  if (!profile) {
    throw new Error('requireUserOrgId: no authenticated user profile');
  }
  if (!profile.organization_id) {
    throw new Error('requireUserOrgId: profile has no organization_id (invite-first user without an org cannot write org-scoped data)');
  }
  return profile.organization_id;
}

/**
 * Update a user's role (admin only)
 */
export async function updateUserRole(userId: string, newRole: UserRole): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ role: newRole, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) throw error;
}

export async function updateUserHrPersonLink(
  userId: string,
  hrPersonId: string | null,
  hrPersonType: 'w2' | '1099' | null,
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({
      hr_person_id: hrPersonId,
      hr_person_type: hrPersonType,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)

  if (error) throw error
}

/**
 * Crew-role profiles linked to org_team members (D.6.1 admin surface).
 */
export async function fetchCrewProfileLinks(): Promise<CrewProfileLink[]> {
  const { fetchTeam } = await import('./hrTeamService')
  const organizationId = await requireUserOrgId()

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, linked_employee_id, linked_contractor_id, roles, updated_at')
    .eq('organization_id', organizationId)
    .contains('roles', ['crew'])

  if (error) throw error

  const team = await fetchTeam()
  const employeeNameById = new Map(team.employees.map((e) => [e.id, e.name]))
  const contractorNameById = new Map(team.contractors1099.map((c) => [c.id, c.name]))

  const links: CrewProfileLink[] = []
  for (const row of data ?? []) {
    const employeeId =
      typeof row.linked_employee_id === 'string' ? row.linked_employee_id : null
    const contractorId =
      typeof row.linked_contractor_id === 'string' ? row.linked_contractor_id : null
    if (employeeId) {
      links.push({
        userId: row.id,
        personType: 'employee',
        personId: employeeId,
        personName: employeeNameById.get(employeeId) ?? 'Employee',
        email: row.email ?? '',
        updatedAt: row.updated_at ?? new Date().toISOString(),
      })
    } else if (contractorId) {
      links.push({
        userId: row.id,
        personType: 'contractor',
        personId: contractorId,
        personName: contractorNameById.get(contractorId) ?? 'Contractor',
        email: row.email ?? '',
        updatedAt: row.updated_at ?? new Date().toISOString(),
      })
    }
  }
  return links
}