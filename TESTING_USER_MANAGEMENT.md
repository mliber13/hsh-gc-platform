# Testing User Management

Step-by-step guide to test the multi-user and role-based permission features.

## Prerequisites

1. ✅ Supabase project set up
2. ✅ Migration `001_initial_schema.sql` completed
3. ✅ Migration `002_multi_user_shared_access.sql` completed
4. ✅ `.env` file configured with Supabase credentials
5. ✅ Dev server running (`npm run dev`)

## Test Plan

### Phase 1: First Admin Setup

**Objective:** Verify first user becomes admin automatically

1. **Clear existing data**
   ```sql
   -- In Supabase SQL Editor
   DELETE FROM profiles;
   DELETE FROM user_invitations;
   -- Also delete auth users from Authentication > Users
   ```

2. **Sign up as first user**
   - Go to http://localhost:5173
   - Click "Sign up"
   - Email: `admin@test.com`
   - Password: `Test1234!`
   - Full Name: `Admin User`
   - Click "Sign Up"

3. **Verify admin role**
   - Click your email in top-right
   - Should see **purple "Admin" badge**
   - Should see **"Manage Users" button**

4. **Check database**
   ```sql
   SELECT email, role, organization_id FROM profiles;
   -- Should show admin@test.com with role='admin'
   ```

✅ **Expected:** First user automatically promoted to admin

---

### Phase 2: User Invitations

**Objective:** Test admin can invite users with different roles

#### 2.1: Invite an Editor

1. **As admin@test.com:**
   - Click email → "Manage Users"
   - Click "Invite User"
   - Email: `editor@test.com`
   - Role: **Editor**
   - Click "Send Invitation"

2. **Verify invitation created:**
   - Go to "Invitations" tab
   - Should see `editor@test.com` with blue "Editor" badge
   - Status should be "pending"
   - See creation and expiration dates

3. **Check database:**
   ```sql
   SELECT email, role, status FROM user_invitations;
   -- Should show editor@test.com
   ```

✅ **Expected:** Invitation appears in list and database

#### 2.2: Invite a Viewer

1. **Repeat above steps** but:
   - Email: `viewer@test.com`
   - Role: **Viewer**

✅ **Expected:** Second invitation created successfully

---

### Phase 3: Accepting Invitations

**Objective:** Verify invited users join the organization with correct roles

#### 3.1: Editor Signs Up

1. **Sign out** (if logged in as admin)

2. **Sign up as editor:**
   - Email: `editor@test.com` (MUST match invitation)
   - Password: `Test1234!`
   - Full Name: `Editor User`
   - Click "Sign Up"

3. **Verify role:**
   - Click email in top-right
   - Should see **blue "Editor" badge**
   - Should **NOT** see "Manage Users" button

4. **Check permissions:**
   - Should see dashboard
   - Should see "Create Project" button ✅
   - Create a test project to verify permissions work

5. **Check database:**
   ```sql
   SELECT email, role, organization_id FROM profiles;
   -- Should show both admin and editor with SAME organization_id
   ```

✅ **Expected:** Editor can create/edit but cannot manage users

#### 3.2: Viewer Signs Up

1. **Sign out**

2. **Sign up as viewer:**
   - Email: `viewer@test.com`
   - Password: `Test1234!`
   - Full Name: `Viewer User`

3. **Verify role:**
   - Should see **gray "Viewer" badge**
   - Should **NOT** see "Manage Users"

4. **Check permissions:**
   - Should see dashboard
   - Should **NOT** see "Create Project" button ❌
   - Should see "You have view-only access" message
   - Click on existing project (created by editor)
   - Should see project details ✅
   - Should **NOT** see edit buttons ❌

✅ **Expected:** Viewer can only view, no edit buttons

---

### Phase 4: Shared Data Access

**Objective:** Verify all users see the same projects

1. **As Editor** (`editor@test.com`):
   - Create a project called "Test Project A"
   - Add some estimate items
   - Sign out

2. **As Admin** (`admin@test.com`):
   - Go to dashboard
   - Should see "Test Project A" ✅
   - Open it and verify you can edit it ✅
   - Create another project "Test Project B"
   - Sign out

3. **As Viewer** (`viewer@test.com`):
   - Go to dashboard
   - Should see **both** "Test Project A" and "Test Project B" ✅
   - Open each one ✅
   - Try to edit (should not see edit buttons) ❌

✅ **Expected:** All users see all organization projects

---

### Phase 5: User Management Features

**Objective:** Test admin-only user management

#### 5.1: View All Users

1. **As Admin:**
   - Open "Manage Users"
   - Should see all 3 users:
     - admin@test.com (Admin) - purple
     - editor@test.com (Editor) - blue
     - viewer@test.com (Viewer) - gray

✅ **Expected:** All users visible with correct roles

#### 5.2: Change User Role

1. **Promote Viewer to Editor:**
   - Click edit icon (✏️) next to viewer@test.com
   - Select "Editor" from dropdown
   - Click checkmark (✓)
   - Should see role badge change to blue

2. **Verify change:**
   - Sign out
   - Sign in as `viewer@test.com`
   - Should now see **blue "Editor" badge**
   - Should now see "Create Project" button ✅

✅ **Expected:** Role change takes effect immediately

#### 5.3: Invitation Management

1. **As Admin:**
   - Open "Manage Users" → "Invitations" tab
   - Create a new invitation: `test@test.com` as Viewer

2. **Resend invitation:**
   - Click send icon (📤) next to the invitation
   - Should see success message
   - Check database - expiration should be extended

3. **Cancel invitation:**
   - Click X icon next to the invitation
   - Should be removed from list
   - Check database - status should be 'expired'

✅ **Expected:** Can manage invitations successfully

#### 5.4: Remove User

1. **As Admin:**
   - Try to remove yourself
   - Should see error: "Cannot remove yourself"

2. **Remove another user:**
   - Click trash icon (🗑️) next to editor@test.com
   - Confirm removal
   - User should disappear from list

3. **Verify removal:**
   - Check database - profile should be deleted
   - Sign in as `editor@test.com`
   - Should get authentication error or no access

✅ **Expected:** Can remove other users but not yourself

---

### Phase 6: Permission Enforcement

**Objective:** Verify RLS policies work correctly

#### 6.1: Editor Permissions

1. **As Editor:**
   - Create a project ✅
   - Edit an estimate ✅
   - Add actuals ✅
   - Manage schedule ✅
   - Try to access "Manage Users" (button shouldn't exist) ❌

✅ **Expected:** Editor can do everything except manage users

#### 6.2: Viewer Permissions

1. **As Viewer:**
   - View all projects ✅
   - Open project details ✅
   - View estimates ✅
   - Look for edit/delete buttons (should not exist) ❌
   - Try to create project (button shouldn't exist) ❌

✅ **Expected:** Viewer has read-only access everywhere

#### 6.3: Database-Level Security

Test that users can't bypass UI restrictions:

```sql
-- In Supabase SQL Editor
-- First, get viewer's user ID
SELECT id, email, role FROM profiles WHERE email = 'viewer@test.com';

-- Try to create a project as viewer (should fail)
INSERT INTO projects (id, name, type, status, organization_id, created_by)
VALUES (gen_random_uuid(), 'Hacker Project', 'custom', 'estimating', 
        (SELECT organization_id FROM profiles WHERE email = 'viewer@test.com'),
        (SELECT id FROM profiles WHERE email = 'viewer@test.com'));
-- Should get: "permission denied for table projects"

-- Try to update another user's role (should fail unless admin)
UPDATE profiles 
SET role = 'admin' 
WHERE email = 'viewer@test.com';
-- Should fail for non-admins
```

✅ **Expected:** Database rejects unauthorized operations

---

### Phase 7: Edge Cases

**Objective:** Test error handling and edge cases

#### 7.1: Duplicate Invitation

1. **As Admin:**
   - Invite `duplicate@test.com` as Editor
   - Try to invite `duplicate@test.com` again
   - Should see error: "Invitation already sent to this email"

✅ **Expected:** Cannot send duplicate invitations

#### 7.2: Sign Up Without Invitation

1. **Sign out**
2. **Sign up with email not invited:**
   - Email: `uninvited@test.com`
   - Password: `Test1234!`
   - Should create account but in a NEW organization
   - Should be promoted to Admin (first in new org)
   - Should NOT see projects from other organization

✅ **Expected:** New organization created for uninvited users

#### 7.3: Expired Invitation

1. **Manually expire an invitation:**
   ```sql
   UPDATE user_invitations 
   SET expires_at = NOW() - INTERVAL '1 day'
   WHERE email = 'expired@test.com';
   ```

2. **Try to sign up:**
   - Sign up with `expired@test.com`
   - Should still work but in new organization
   - Old invitation should be ignored

✅ **Expected:** Expired invitations don't block signup

---

### Phase 8: Offline Mode

**Objective:** Verify offline mode still works

1. **Stop Supabase or modify `.env`:**
   ```
   VITE_SUPABASE_URL=your_supabase_project_url_here
   VITE_SUPABASE_ANON_KEY=your_anon_public_key_here
   ```

2. **Restart dev server**

3. **Verify:**
   - No login screen (goes directly to dashboard)
   - User menu not visible
   - All features work with localStorage
   - Can create/edit projects
   - No user management features

✅ **Expected:** App works offline without Supabase

---

## Test Results Checklist

- [ ] First user automatically becomes admin
- [ ] Admin can invite users with different roles
- [ ] Invited users join with correct roles
- [ ] All users see shared organization data
- [ ] Role badges display correctly
- [ ] Viewer cannot create/edit (UI hidden)
- [ ] Editor can create/edit but not manage users
- [ ] Admin can manage all users
- [ ] Role changes take effect immediately
- [ ] Can resend/cancel invitations
- [ ] Cannot remove yourself
- [ ] RLS policies prevent unauthorized database access
- [ ] Duplicate invitations are blocked
- [ ] Offline mode works without auth
- [ ] Data is properly isolated by organization

## Common Issues

### Issue: User doesn't see shared data
**Fix:** Check `organization_id` matches in database:
```sql
SELECT email, organization_id FROM profiles;
```

### Issue: Permission denied errors
**Fix:** Verify RLS policies are enabled:
```sql
SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public';
```

### Issue: Can't access User Management
**Fix:** Verify you're an admin:
```sql
UPDATE profiles SET role = 'admin' WHERE email = 'your@email.com';
```

### Issue: Invitation not found
**Fix:** Check invitation exists and isn't expired:
```sql
SELECT * FROM user_invitations WHERE status = 'pending';
```

---

**Testing Complete!** 🎉

If all checks pass, your user management system is working correctly.

