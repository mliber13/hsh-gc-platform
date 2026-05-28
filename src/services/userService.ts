/**
 * User Management Service
 * Simplified version - user management is handled in Supabase Dashboard
 */

import { supabase } from '../lib/supabase';

export type UserRole = 'admin' | 'editor' | 'viewer';
export type RbacRole =
  | 'owner'
  | 'office_gc'
  | 'office_drywall'
  | 'field_gc'
  | 'field_drywall'
  | 'viewer';

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
  return {
    ...row,
    roles,
    is_meeting_operator: isMeetingOperator,
    can_admin_qb: canAdminQb,
    can_run_payroll: canRunPayroll,
    hr_person_id: hrPersonId,
    hr_person_type: hrPersonType,
    isMeetingOperator,
    canAdminQb,
    canRunPayroll,
    hrPersonId,
    hrPersonType,
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