-- ============================================================================
-- Security batch (P0-4) — Part B: drop the anon `USING (true)` policies
-- ============================================================================
-- APPLY ONLY AFTER Part A (20260730120000) is applied AND the RPC-based app
-- build is live and the vendor portal + crew signup have been smoke-tested.
-- Dropping these before the app is on the RPCs would break the vendor portal
-- and the crew signup page.
--
-- Operators are unaffected: the authenticated org-scoped policies from
-- migrations 003 (submitted_quotes join-through; quote_requests own-row) and
-- 20260616130000 ("Editors manage crew invites") remain in place.
-- ============================================================================

BEGIN;

-- crew_invite_tokens: anon now reads via get_crew_invite_by_token()
DROP POLICY IF EXISTS "Read by token (signup)" ON public.crew_invite_tokens;

-- quote_requests: anon now reads via get_quote_request_by_token()
DROP POLICY IF EXISTS "Public can view quote requests by token" ON public.quote_requests;

-- submitted_quotes: anon now inserts via submit_vendor_quote();
-- the anon SELECT was unused (portal uses the returned row; operators use the
-- 003 join-through SELECT policy).
DROP POLICY IF EXISTS "Vendors can submit quotes via token" ON public.submitted_quotes;
DROP POLICY IF EXISTS "Public can view own submitted quotes" ON public.submitted_quotes;

COMMIT;
