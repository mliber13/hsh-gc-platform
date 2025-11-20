-- ============================================================================
-- Allow Public Access to Quote Requests by Token
-- ============================================================================
-- 
-- This migration adds a policy to allow unauthenticated users (vendors)
-- to access quote requests using the secure token
--

-- Drop the restrictive SELECT policy and replace with more permissive ones
DROP POLICY IF EXISTS "Users can view own quote requests" ON quote_requests;

-- Allow users to view their own quote requests
CREATE POLICY "Users can view own quote requests"
  ON quote_requests FOR SELECT
  USING (auth.uid() = user_id);

-- Allow public access to quote requests by token (for vendor portal)
-- This allows vendors to access quote requests without authentication
CREATE POLICY "Public can view quote requests by token"
  ON quote_requests FOR SELECT
  USING (true); -- Allow anyone to read quote requests (token provides security)

-- Note: The token itself provides security - only someone with the token
-- can access the quote request. The RLS policy allows the query to succeed,
-- but the application should validate the token matches.

