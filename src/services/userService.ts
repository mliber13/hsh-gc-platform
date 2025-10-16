/**
 * User Management Service
 * Simplified version - user management is handled in Supabase Dashboard
 */

import { supabase } from '../lib/supabase';

export type UserRole = 'admin' | 'editor' | 'viewer';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  organization_id: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
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
  return data || [];
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
  
  return data;
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