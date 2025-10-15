/**
 * User Management Component
 * Allows admins to invite users, manage roles, and view team members
 */

import React, { useState, useEffect } from 'react';
import { 
  UserPlus, 
  Users, 
  Mail, 
  Shield, 
  Edit2, 
  Trash2, 
  Send,
  X,
  Crown,
  Eye,
  Pencil,
  Clock,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog } from './ui/dialog';
import { Select } from './ui/select';
import {
  UserProfile,
  UserInvitation,
  UserRole,
  getOrganizationUsers,
  getCurrentUserProfile,
  inviteUser,
  getPendingInvitations,
  updateUserRole,
  cancelInvitation,
  resendInvitation,
  removeUserFromOrganization,
} from '../services/userService';

interface UserManagementProps {
  onClose: () => void;
}

type Tab = 'users' | 'invitations';

const roleIcons: Record<UserRole, React.ReactNode> = {
  admin: <Crown className="w-4 h-4" />,
  editor: <Pencil className="w-4 h-4" />,
  viewer: <Eye className="w-4 h-4" />,
};

const roleColors: Record<UserRole, string> = {
  admin: 'bg-purple-100 text-purple-800 border-purple-200',
  editor: 'bg-blue-100 text-blue-800 border-blue-200',
  viewer: 'bg-gray-100 text-gray-800 border-gray-200',
};

const roleLabels: Record<UserRole, string> = {
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
};

export function UserManagement({ onClose }: UserManagementProps) {
  const [activeTab, setActiveTab] = useState<Tab>('users');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [invitations, setInvitations] = useState<UserInvitation[]>([]);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('viewer');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<UserRole>('viewer');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [usersData, invitationsData, profileData] = await Promise.all([
        getOrganizationUsers(),
        getPendingInvitations(),
        getCurrentUserProfile(),
      ]);
      setUsers(usersData);
      setInvitations(invitationsData);
      setCurrentUserProfile(profileData);
    } catch (error) {
      console.error('Error loading user data:', error);
      alert('Failed to load user data');
    } finally {
      setLoading(false);
    }
  };

  const handleInviteUser = async () => {
    if (!inviteEmail.trim()) {
      alert('Please enter an email address');
      return;
    }

    try {
      await inviteUser(inviteEmail, inviteRole);
      setInviteEmail('');
      setInviteRole('viewer');
      setShowInviteDialog(false);
      await loadData();
      alert(`Invitation sent to ${inviteEmail}!`);
    } catch (error: any) {
      console.error('Error inviting user:', error);
      alert(error.message || 'Failed to send invitation');
    }
  };

  const handleUpdateRole = async (userId: string, newRole: UserRole) => {
    try {
      await updateUserRole(userId, newRole);
      setEditingUserId(null);
      await loadData();
      alert('User role updated successfully');
    } catch (error) {
      console.error('Error updating role:', error);
      alert('Failed to update user role');
    }
  };

  const handleRemoveUser = async (userId: string, userName: string) => {
    if (!confirm(`Are you sure you want to remove ${userName} from your organization?`)) {
      return;
    }

    try {
      await removeUserFromOrganization(userId);
      await loadData();
      alert('User removed successfully');
    } catch (error: any) {
      console.error('Error removing user:', error);
      alert(error.message || 'Failed to remove user');
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    try {
      await cancelInvitation(invitationId);
      await loadData();
      alert('Invitation cancelled');
    } catch (error) {
      console.error('Error cancelling invitation:', error);
      alert('Failed to cancel invitation');
    }
  };

  const handleResendInvitation = async (invitationId: string) => {
    try {
      await resendInvitation(invitationId);
      alert('Invitation resent successfully');
    } catch (error) {
      console.error('Error resending invitation:', error);
      alert('Failed to resend invitation');
    }
  };

  const isAdmin = currentUserProfile?.role === 'admin';

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">
          <div className="text-center">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b">
            <div>
              <h2 className="text-2xl font-bold">User Management</h2>
              <p className="text-sm text-gray-600 mt-1">
                Manage your team members and invitations
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b px-6">
            <button
              onClick={() => setActiveTab('users')}
              className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                activeTab === 'users'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                Users ({users.length})
              </div>
            </button>
            <button
              onClick={() => setActiveTab('invitations')}
              className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                activeTab === 'invitations'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Invitations ({invitations.length})
              </div>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'users' && (
              <div className="space-y-4">
                {/* Invite Button */}
                {isAdmin && (
                  <div className="flex justify-end">
                    <Button
                      onClick={() => setShowInviteDialog(true)}
                      className="flex items-center gap-2"
                    >
                      <UserPlus className="w-4 h-4" />
                      Invite User
                    </Button>
                  </div>
                )}

                {/* Users List */}
                <div className="space-y-3">
                  {users.map((user) => (
                    <div
                      key={user.id}
                      className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold">
                              {user.full_name?.[0]?.toUpperCase() || user.email[0].toUpperCase()}
                            </div>
                            <div>
                              <div className="font-medium">
                                {user.full_name || 'Unnamed User'}
                                {user.id === currentUserProfile?.id && (
                                  <span className="ml-2 text-sm text-gray-500">(You)</span>
                                )}
                              </div>
                              <div className="text-sm text-gray-600">{user.email}</div>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {/* Role Badge/Selector */}
                          {editingUserId === user.id && isAdmin ? (
                            <div className="flex items-center gap-2">
                              <select
                                value={editRole}
                                onChange={(e) => setEditRole(e.target.value as UserRole)}
                                className="px-3 py-1 border rounded-md text-sm"
                              >
                                <option value="admin">Admin</option>
                                <option value="editor">Editor</option>
                                <option value="viewer">Viewer</option>
                              </select>
                              <Button
                                onClick={() => handleUpdateRole(user.id, editRole)}
                                size="sm"
                                className="px-2"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </Button>
                              <Button
                                onClick={() => setEditingUserId(null)}
                                variant="outline"
                                size="sm"
                                className="px-2"
                              >
                                <XCircle className="w-4 h-4" />
                              </Button>
                            </div>
                          ) : (
                            <div
                              className={`flex items-center gap-2 px-3 py-1 rounded-full border text-sm font-medium ${
                                roleColors[user.role]
                              }`}
                            >
                              {roleIcons[user.role]}
                              {roleLabels[user.role]}
                            </div>
                          )}

                          {/* Actions */}
                          {isAdmin && user.id !== currentUserProfile?.id && editingUserId !== user.id && (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  setEditingUserId(user.id);
                                  setEditRole(user.role);
                                }}
                                className="text-blue-600 hover:text-blue-800"
                                title="Edit role"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleRemoveUser(user.id, user.full_name || user.email)}
                                className="text-red-600 hover:text-red-800"
                                title="Remove user"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {users.length === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No users found</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'invitations' && (
              <div className="space-y-3">
                {invitations.map((invitation) => (
                  <div
                    key={invitation.id}
                    className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                            <Mail className="w-5 h-5 text-gray-500" />
                          </div>
                          <div>
                            <div className="font-medium">{invitation.email}</div>
                            <div className="text-sm text-gray-600 flex items-center gap-2">
                              <Clock className="w-3 h-3" />
                              Invited {new Date(invitation.created_at).toLocaleDateString()}
                              {' • '}
                              Expires {new Date(invitation.expires_at).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {/* Role Badge */}
                        <div
                          className={`flex items-center gap-2 px-3 py-1 rounded-full border text-sm font-medium ${
                            roleColors[invitation.role]
                          }`}
                        >
                          {roleIcons[invitation.role]}
                          {roleLabels[invitation.role]}
                        </div>

                        {/* Actions */}
                        {isAdmin && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleResendInvitation(invitation.id)}
                              className="text-blue-600 hover:text-blue-800"
                              title="Resend invitation"
                            >
                              <Send className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleCancelInvitation(invitation.id)}
                              className="text-red-600 hover:text-red-800"
                              title="Cancel invitation"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {invitations.length === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    <Mail className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No pending invitations</p>
                    {isAdmin && (
                      <Button
                        onClick={() => setShowInviteDialog(true)}
                        className="mt-4"
                      >
                        <UserPlus className="w-4 h-4 mr-2" />
                        Invite Your First User
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t p-6 flex justify-end">
            <Button onClick={onClose} variant="outline">
              Close
            </Button>
          </div>
        </div>
      </div>

      {/* Invite User Dialog */}
      {showInviteDialog && (
        <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
              <div className="p-6">
                <h3 className="text-lg font-semibold mb-4">Invite New User</h3>
                
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="invite-email">Email Address</Label>
                    <Input
                      id="invite-email"
                      type="email"
                      placeholder="user@example.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="invite-role">Role</Label>
                    <select
                      id="invite-role"
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as UserRole)}
                      className="mt-1 w-full px-3 py-2 border rounded-md"
                    >
                      <option value="viewer">Viewer - Can only view data</option>
                      <option value="editor">Editor - Can edit and create</option>
                      <option value="admin">Admin - Full access</option>
                    </select>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-sm text-blue-800">
                    <Shield className="w-4 h-4 inline mr-1" />
                    Invitations expire in 7 days
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <Button
                    onClick={() => setShowInviteDialog(false)}
                    variant="outline"
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleInviteUser}>
                    <Send className="w-4 h-4 mr-2" />
                    Send Invitation
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}

