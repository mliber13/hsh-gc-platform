/**
 * usePermissions Hook
 * Centralized role-based permissions logic
 */

import { useState, useEffect } from 'react';
import { getCurrentUserProfile, UserProfile, UserRole } from '../services/userService';
import { useAuth } from '../contexts/AuthContext';

export function usePermissions() {
  const { user, isOnline } = useAuth();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOnline && user) {
      getCurrentUserProfile()
        .then(profile => {
          setUserProfile(profile);
          setLoading(false);
        })
        .catch(error => {
          console.error('Error loading user profile:', error);
          setLoading(false);
        });
    } else {
      // Offline mode - grant all permissions
      setUserProfile({
        id: 'offline',
        email: 'offline@local',
        full_name: 'Offline User',
        organization_id: 'offline',
        role: 'admin',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      setLoading(false);
    }
  }, [isOnline, user]);

  const role: UserRole = userProfile?.role || 'viewer';

  return {
    userProfile,
    role,
    loading,
    isAdmin: role === 'admin',
    isEditor: role === 'editor' || role === 'admin',
    isViewer: role === 'viewer',
    canCreate: role === 'admin' || role === 'editor',
    canEdit: role === 'admin' || role === 'editor',
    canDelete: role === 'admin' || role === 'editor',
    canManageUsers: role === 'admin',
    canInviteUsers: role === 'admin',
  };
}

