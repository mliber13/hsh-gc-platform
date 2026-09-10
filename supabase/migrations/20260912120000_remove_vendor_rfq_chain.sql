-- Batch 1C — remove the vendor RFQ chain (P0-SEC-3).
-- See docs/briefs/BATCH_1C_VENDOR_RFQ_REMOVAL.md. Follows 1A and 1B.
--
-- The client half of the chain went in the four commits before this one:
-- VendorQuotePortal, QuoteReviewDashboard, QuoteRequestForm, the two public
-- token routes and their vercel rewrites, quoteService, types/quote, the eight
-- _Hybrid wrappers, and the send-quote-email edge function.
--
-- These two RPCs were the anon-facing half. Both are SECURITY DEFINER with
-- EXECUTE granted to anon, which is how an unauthenticated caller reached
-- quote_requests and submitted_quotes at all -- the RLS policies on both tables
-- are auth.uid() = user_id and never admitted anon on their own.
--
--   get_quote_request_by_token  no expires_at check, and it performed an
--                               UPDATE side effect (marking the request viewed)
--                               on an anonymous read.
--   submit_vendor_quote         no expiry and no status guard, so one leaked
--                               token allowed unlimited resubmits with an
--                               unbounded p_line_items payload.
--
-- With no UI and no service left to call them there is nothing to guard, so
-- they are dropped rather than fixed.
--
-- Signatures below are the live ones from pg_proc, not the ones in the brief:
-- submit_vendor_quote takes ten scalar arguments, not (text, jsonb).

BEGIN;

DROP FUNCTION IF EXISTS public.get_quote_request_by_token(text);

DROP FUNCTION IF EXISTS public.submit_vendor_quote(
  text,        -- p_token
  text,        -- p_vendor_name
  text,        -- p_vendor_email
  text,        -- p_vendor_company
  text,        -- p_vendor_phone
  jsonb,       -- p_line_items
  numeric,     -- p_total_amount
  timestamptz, -- p_valid_until
  text,        -- p_notes
  text         -- p_quote_document_url
);

-- Deliberately not dropped:
--
-- public.quote_requests (5 rows, newest 2026-02-11) and public.submitted_quotes
-- (2 rows, newest 2026-01-10). They keep their four and two policies, all of
-- which are auth.uid() = user_id -- none was anon-facing, so there is nothing
-- to revoke here. backupService.ts:158-159 still includes both tables in the
-- org backup, which is the one remaining reader and a reason to keep them.
-- Dropping tables is irreversible and is a cleanup question rather than a
-- security one; with the RPCs gone nothing anonymous can reach them.
--
-- The quote-attachments bucket also stays: it holds 15 objects (77 MB) of
-- historical RFQ drawings and attachments. Its contents are RFQ-only by both
-- code trace and timeline, but deleting stored files is not reversible, so that
-- is Mark's call rather than this batch's.

COMMIT;
