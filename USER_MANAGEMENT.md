# User Management & Role-Based Access Control

Complete guide to managing users and permissions in the HSH GC Platform.

## Overview

The platform now supports **multi-user shared access** with role-based permissions. All users in an organization share the same projects and data, but have different levels of access based on their assigned role.

## Roles

### 🔴 Admin
**Full platform access** - Can do everything
- Create, edit, and delete projects
- Manage estimates, actuals, schedules, and change orders
- Invite and manage users
- Assign roles to other users
- Remove users from organization
- Export/import data

### 🔵 Editor
**Can create and modify** - Full project access
- Create, edit, and delete projects
- Manage estimates, actuals, schedules, and change orders
- View all data
- **Cannot** manage users or change permissions

### 🟢 Viewer
**Read-only access** - Can only view
- View all projects and data
- View estimates, actuals, schedules, and change orders
- **Cannot** create or edit anything
- **Cannot** manage users

## Getting Started

### First User Setup
When you first run the migration `002_multi_user_shared_access.sql`:
1. The **first user** to sign up is automatically promoted to **Admin**
2. Subsequent users need to be invited by an Admin

### Creating Your Organization
Your organization is created automatically when the first admin signs up. All subsequent invited users will join this organization.

## Inviting Users

### As an Admin:

1. **Click your email** in the top-right corner
2. Click **"Manage Users"**
3. Go to the **"Invitations"** tab
4. Click **"Invite User"**
5. Enter:
   - Email address
   - Role (Admin, Editor, or Viewer)
6. Click **"Send Invitation"**

**Note:** Invitations expire in **7 days**. You can resend expired invitations.

### What Happens Next:
1. The invited user will receive an email (when email service is configured)
2. They can sign up using the invited email address
3. They'll automatically join your organization with the assigned role
4. They'll immediately see all shared projects

## Managing Users

### Viewing All Users
1. Open **User Management** from the user menu
2. View the **"Users"** tab
3. See all organization members with their roles

### Changing User Roles
1. Open **User Management**
2. Click the **edit icon** (✏️) next to a user
3. Select a new role from the dropdown
4. Click the **checkmark** (✓) to save

### Removing Users
1. Open **User Management**
2. Click the **trash icon** (🗑️) next to a user
3. Confirm the removal

**Important:** 
- You cannot remove yourself
- Removed users lose access to the organization but their auth account remains

### Managing Invitations
In the **"Invitations"** tab:
- **Resend**: Click the send icon (📤) to extend expiration by 7 days
- **Cancel**: Click the X icon to cancel a pending invitation

## Role Badge

Your current role is displayed as a colored badge in the user menu:
- **🟣 Purple** = Admin
- **🔵 Blue** = Editor
- **⚪ Gray** = Viewer

## Permission Matrix

| Feature | Admin | Editor | Viewer |
|---------|-------|--------|--------|
| View Projects | ✅ | ✅ | ✅ |
| Create Projects | ✅ | ✅ | ❌ |
| Edit Projects | ✅ | ✅ | ❌ |
| Delete Projects | ✅ | ✅ | ❌ |
| Manage Estimates | ✅ | ✅ | ❌ |
| Manage Actuals | ✅ | ✅ | ❌ |
| Manage Schedules | ✅ | ✅ | ❌ |
| Manage Change Orders | ✅ | ✅ | ❌ |
| View Plans Library | ✅ | ✅ | ✅ |
| Edit Plans | ✅ | ✅ | ❌ |
| Invite Users | ✅ | ❌ | ❌ |
| Manage User Roles | ✅ | ❌ | ❌ |
| Remove Users | ✅ | ❌ | ❌ |

## Database Structure

### Tables
- **profiles** - User profile with role and organization
- **user_invitations** - Pending invitations

### Organization Model
- Each user belongs to one organization
- All data is scoped by `organization_id`
- Users can only see/edit data from their organization

### Row Level Security (RLS)
All tables enforce RLS policies:
- **SELECT**: All users can view organization data
- **INSERT/UPDATE**: Only Admins and Editors can modify
- **DELETE**: Only Admins and Editors can delete
- **Special**: Only Admins can invite/manage users

## API Functions

### User Service (`src/services/userService.ts`)

```typescript
// Get all users in organization
getOrganizationUsers(): Promise<UserProfile[]>

// Get current user's profile
getCurrentUserProfile(): Promise<UserProfile | null>

// Update a user's role (admin only)
updateUserRole(userId: string, newRole: UserRole): Promise<void>

// Invite a new user (admin only)
inviteUser(email: string, role: UserRole): Promise<UserInvitation>

// Get pending invitations
getPendingInvitations(): Promise<UserInvitation[]>

// Cancel an invitation (admin only)
cancelInvitation(invitationId: string): Promise<void>

// Resend an invitation (admin only)
resendInvitation(invitationId: string): Promise<void>

// Remove user from organization (admin only)
removeUserFromOrganization(userId: string): Promise<void>
```

### Permissions Hook (`src/hooks/usePermissions.ts`)

```typescript
const {
  userProfile,      // Current user's profile
  role,             // Current user's role
  loading,          // Loading state
  isAdmin,          // true if admin
  isEditor,         // true if editor or admin
  isViewer,         // true if viewer
  canCreate,        // true if can create
  canEdit,          // true if can edit
  canDelete,        // true if can delete
  canManageUsers,   // true if can manage users
  canInviteUsers,   // true if can invite users
} = usePermissions()
```

## Best Practices

### Role Assignment
- **Admin**: Give to owners, senior managers who need full control
- **Editor**: Give to project managers, estimators who create/edit projects
- **Viewer**: Give to clients, accountants, or others who only need to view data

### Security
- Regularly review your user list and remove inactive users
- Cancel unused invitations after a few days
- Assign the minimum role needed for each user's responsibilities
- Keep at least 2 admins in your organization

### Workflows

#### Onboarding a Project Manager:
1. Invite as **Editor**
2. They can immediately create/edit projects
3. They cannot change permissions or invite others

#### Onboarding a Client:
1. Invite as **Viewer**
2. They can view all project details and reports
3. They cannot modify anything

#### Promoting a User:
1. Go to User Management
2. Edit their role from Viewer → Editor or Editor → Admin
3. Changes take effect immediately

## Troubleshooting

### User Can't See Shared Data
- Ensure they signed up with the invited email
- Check they're in the same organization (visible in User Management)
- Verify RLS policies are enabled in Supabase

### Invitation Not Working
- Check invitation hasn't expired (7 days max)
- Verify email is correct
- Resend the invitation
- Check Supabase logs for errors

### Permission Denied Errors
- Verify user's role is correct
- Check they're logged in with the right account
- Ensure RLS policies are properly set up

### Can't Manage Users
- Only Admins can access User Management
- Verify you're an Admin by checking your role badge
- If you're the first user, run the migration again

## Offline Mode

When running in **offline mode** (no Supabase):
- All users have **Admin** permissions
- User management features are hidden
- Data is stored locally in localStorage
- No multi-user access (single user only)

## Future Enhancements

Planned features:
- [ ] Email notifications for invitations
- [ ] Activity logs and audit trail
- [ ] Custom roles and granular permissions
- [ ] Project-level permissions
- [ ] User groups and teams
- [ ] SSO/OAuth integration

## Support

For help with user management:
1. Check the role permissions matrix above
2. Review troubleshooting section
3. Check browser console for errors
4. Verify Supabase configuration in `.env`

---

**Last Updated:** October 15, 2025  
**Version:** 1.0.0

