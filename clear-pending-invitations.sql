-- Delete all pending invitations so we can test fresh
DELETE FROM user_invitations 
WHERE status = 'pending'
AND email IN ('stressreliefproject@gmail.com', 'jillula@gmail.com');

-- Verify they're deleted
SELECT * FROM user_invitations 
WHERE email IN ('stressreliefproject@gmail.com', 'jillula@gmail.com');

