-- Check all pending invitations in the database
SELECT 
  id,
  email,
  role,
  status,
  created_at,
  expires_at
FROM user_invitations 
WHERE status = 'pending'
ORDER BY created_at DESC;

-- Check if users were created in auth.users
SELECT 
  id,
  email,
  invited_at,
  confirmation_sent_at,
  email_confirmed_at,
  created_at
FROM auth.users 
WHERE email IN ('stressreliefproject@gmail.com', 'jillula@gmail.com')
ORDER BY created_at DESC;

