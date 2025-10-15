# 👥 User Roles & Permissions

## User Roles

### 🔴 **Admin** (Full Access)
- ✅ View all projects
- ✅ Create/Edit/Delete projects
- ✅ Create/Edit/Delete estimates and actuals
- ✅ Manage schedules and change orders
- ✅ **Invite new users**
- ✅ **Manage user roles**
- ✅ **Delete users**
- ✅ Manage company-wide templates
- ✅ Export/Import data

### 🟡 **Editor** (Can Edit, Cannot Manage Users)
- ✅ View all projects
- ✅ Create/Edit projects
- ✅ Create/Edit/Delete estimates and actuals
- ✅ Manage schedules and change orders
- ✅ Use templates
- ❌ Cannot invite users
- ❌ Cannot delete projects
- ❌ Cannot manage other users

### 🟢 **Viewer** (Read-Only)
- ✅ View all projects
- ✅ View estimates and actuals
- ✅ View schedules and change orders
- ✅ Export PDFs
- ❌ Cannot create or edit anything
- ❌ Cannot delete anything
- ❌ Cannot manage users

## How It Works

### **Shared Access**
- All users in your company see ALL projects
- No data isolation between users
- Perfect for team collaboration

### **Role-Based Security**
- Permissions enforced at database level
- Viewers physically cannot edit (database blocks it)
- UI shows/hides buttons based on role

### **First User = Admin**
- The first person to sign up becomes Admin automatically
- Admins can then invite others with specific roles

## Inviting Users

### **As an Admin:**

1. Go to **Settings** (coming soon in UI)
2. Click **"Invite User"**
3. Enter their email
4. Select their role (Admin/Editor/Viewer)
5. Click **"Send Invite"**
6. They receive an email with invite link
7. They click link, set password, and gain access

### **Via Supabase Dashboard (Current Method):**

1. Go to Supabase Dashboard → **Authentication** → **Users**
2. Click **"Invite user"**
3. Enter their email
4. In the database, update their role in the `profiles` table:
   ```sql
   UPDATE profiles 
   SET role = 'editor'  -- or 'admin' or 'viewer'
   WHERE email = 'newuser@company.com';
   ```

## Current Status

### ✅ **Completed:**
- Database schema with roles
- Organization-based data sharing
- RLS policies for role-based permissions
- First user auto-promoted to admin

### 🔄 **In Progress:**
- User invitation UI
- Role management UI
- User list/management screen

### ⏳ **Coming Soon:**
- In-app user invitations
- Role assignment UI
- User deactivation

## Database Changes

The migration (`002_multi_user_shared_access.sql`) added:
- `role` column to profiles (admin/editor/viewer)
- `organization_id` to all tables
- `created_by`, `entered_by`, `invited_by` tracking
- `is_active` flag for user management
- `user_invitations` table
- Updated RLS policies for shared access

## Testing Roles

1. **Sign in as your admin account**
2. **Create a project** (should work)
3. **Create a second account** via Supabase
4. **Set that account to "viewer" role** in database
5. **Sign in as viewer** - you'll see projects but can't edit

Your admin account email: `{your-email-here}`

