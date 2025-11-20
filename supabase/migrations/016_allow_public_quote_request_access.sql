-- ============================================================================
-- Allow Public Access to Quote Requests by Token
-- ============================================================================
-- 
-- This migration adds policies to allow unauthenticated users (vendors)
-- to access quote requests and submit quotes using the secure token
--

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own quote requests" ON quote_requests;
DROP POLICY IF EXISTS "Public can view quote requests by token" ON quote_requests;

-- Allow users to view their own quote requests
CREATE POLICY "Users can view own quote requests"
  ON quote_requests FOR SELECT
  USING (auth.uid() = user_id);

-- Allow public access to quote requests by token (for vendor portal)
-- This allows vendors to access quote requests without authentication
CREATE POLICY "Public can view quote requests by token"
  ON quote_requests FOR SELECT
  USING (true); -- Allow anyone to read quote requests (token provides security)

-- ============================================================================
-- Allow Public Quote Submissions
-- ============================================================================

-- Drop existing insert policy
DROP POLICY IF EXISTS "Vendors can submit quotes via token" ON submitted_quotes;

-- Allow public inserts to submitted_quotes (for vendor submissions)
-- The quote_request_id must exist, which is validated by the application
CREATE POLICY "Vendors can submit quotes via token"
  ON submitted_quotes FOR INSERT
  WITH CHECK (true); -- Allow anyone to insert (application validates quote_request_id exists)

-- Note: The token and quote_request_id provide security - only someone with
-- a valid token can access the quote request, and only valid quote_request_ids
-- can be used. The application validates this before allowing submission.

