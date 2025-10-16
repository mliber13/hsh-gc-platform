/**
 * User Management Service
 * Handles user invitations, role management, and organization users
 */

import { supabase } from '../lib/supabase';

export type UserRole = 'admin' | 'editor' | 'viewer';
export type InvitationStatus = 'pending' | 'accepted' | 'expired';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  organization_id: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface UserInvitation {
  id: string;
  organization_id: string;
  email: string;
  role: UserRole;
  invited_by: string;
  status: InvitationStatus;
  created_at: string;
  expires_at: string;
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

/**
 * Send an invitation to a new user
 */
export async function inviteUser(email: string, role: UserRole): Promise<UserInvitation> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Get current user's profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('organization_id, role')
    .eq('id', user.id)
    .single();

  if (profileError) throw profileError;
  if (profile.role !== 'admin') throw new Error('Only admins can invite users');

  // Check if user already exists in the organization
  const { data: existingUser } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email.toLowerCase())
    .eq('organization_id', profile.organization_id)
    .single();

  if (existingUser) {
    throw new Error('User already exists in your organization');
  }

  // Check for existing pending invitation
  const { data: existingInvite } = await supabase
    .from('user_invitations')
    .select('*')
    .eq('email', email.toLowerCase())
    .eq('organization_id', profile.organization_id)
    .eq('status', 'pending')
    .single();

  if (existingInvite) {
    throw new Error('Invitation already sent to this email');
  }

  // Create invitation (expires in 7 days)
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const { data, error } = await supabase
    .from('user_invitations')
    .insert({
      organization_id: profile.organization_id,
      email: email.toLowerCase(),
      role,
      invited_by: user.id,
      status: 'pending',
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  
  // Call the Edge Function to send invitation email via Supabase Auth
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('No active session');

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-user`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.toLowerCase(),
          role,
          organizationId: profile.organization_id,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Edge Function error:', errorData);
      throw new Error(errorData.error || 'Failed to send invitation email');
    }

    const result = await response.json();
    console.log('✅ Invitation email sent successfully:', result);
  } catch (emailError) {
    console.error('❌ Error sending invitation email:', emailError);
    // Don't throw - the invitation is already created in the database
    // The admin can resend it later if needed
  }
  
  return data;
}

/**
 * Get all pending invitations for the organization
 */
export async function getPendingInvitations(): Promise<UserInvitation[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Get current user's profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (profileError) throw profileError;

  const { data, error } = await supabase
    .from('user_invitations')
    .select('*')
    .eq('organization_id', profile.organization_id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Cancel an invitation (admin only)
 */
export async function cancelInvitation(invitationId: string): Promise<void> {
  const { error } = await supabase
    .from('user_invitations')
    .update({ status: 'expired' })
    .eq('id', invitationId);

  if (error) throw error;
}

/**
 * Resend an invitation (admin only)
 */
export async function resendInvitation(invitationId: string): Promise<void> {
  // Get the invitation details
  const { data: invitation, error: fetchError } = await supabase
    .from('user_invitations')
    .select('*')
    .eq('id', invitationId)
    .single();

  if (fetchError) throw fetchError;
  if (!invitation) throw new Error('Invitation not found');

  // Extend expiration by 7 days
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const { error } = await supabase
    .from('user_invitations')
    .update({ 
      expires_at: expiresAt.toISOString(),
      status: 'pending' 
    })
    .eq('id', invitationId);

  if (error) throw error;
  
  // Call the Edge Function to resend invitation email
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('No active session');

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-user`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: invitation.email,
          role: invitation.role,
          organizationId: invitation.organization_id,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Edge Function error:', errorData);
      throw new Error(errorData.error || 'Failed to resend invitation email');
    }

    const result = await response.json();
    console.log('✅ Invitation email resent successfully:', result);
  } catch (emailError) {
    console.error('❌ Error resending invitation email:', emailError);
    // Don't throw - the invitation expiration is already extended
  }
}

/**
 * Remove a user from the organization (admin only)
 * Note: This doesn't delete the auth user, just removes them from the organization
 */
export async function removeUserFromOrganization(userId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Don't allow removing yourself
  if (user.id === userId) {
    throw new Error('Cannot remove yourself from the organization');
  }

  // Get current user's role
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError) throw profileError;
  if (profile.role !== 'admin') throw new Error('Only admins can remove users');

  // Delete the user's profile (cascade will handle related data)
  const { error } = await supabase
    .from('profiles')
    .delete()
    .eq('id', userId);

  if (error) throw error;
}

