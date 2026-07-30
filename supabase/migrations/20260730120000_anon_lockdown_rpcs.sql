-- ============================================================================
-- Security batch (P0-4 / P0-5) — Part A: additive RPCs + view hardening
-- ============================================================================
-- Replaces three anon-facing `USING (true)` table reads/writes with
-- SECURITY DEFINER RPCs keyed by the caller's secret token, so the tables
-- can be locked down in Part B without an enumeration surface.
--
-- This migration is ADDITIVE and safe to apply on its own: it breaks no
-- existing flow. The `USING (true)` policies are dropped only in Part B,
-- AFTER the app is live on these RPCs.
--
-- Reuses the token-behind-a-definer-RPC pattern already used by the
-- supplier / customer share-link migrations.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. crew_invite_tokens — read one ACTIVE invite by exact token (signup page)
--    Replaces the `USING (true)` SELECT that let anon enumerate every token
--    (token + PII → account takeover). Returns only unconsumed, unexpired rows.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_crew_invite_by_token(p_token text)
RETURNS TABLE (
  id                    uuid,
  token                 text,
  linked_employee_id    text,
  linked_contractor_id  text,
  invited_email         text,
  created_at            timestamptz,
  expires_at            timestamptz,
  consumed_at           timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id, t.token, t.linked_employee_id, t.linked_contractor_id,
    t.invited_email, t.created_at, t.expires_at, t.consumed_at
  FROM public.crew_invite_tokens t
  WHERE t.token = p_token
    AND t.consumed_at IS NULL
    AND t.expires_at > now()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_crew_invite_by_token(text) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. quote_requests — read one request by token + mark viewed (vendor portal)
--    Replaces the `USING (true)` SELECT + the client-side viewed_at UPDATE.
--    Returns the full row (caller already holds the token).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_quote_request_by_token(p_token text)
RETURNS SETOF public.quote_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.quote_requests WHERE token = p_token LIMIT 1;
  IF v_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.quote_requests
     SET viewed_at = COALESCE(viewed_at, now()),
         status    = CASE WHEN status = 'sent' THEN 'viewed' ELSE status END
   WHERE id = v_id;

  RETURN QUERY SELECT * FROM public.quote_requests WHERE id = v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_quote_request_by_token(text) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. submitted_quotes — insert a vendor submission by token (vendor portal)
--    Replaces the `WITH CHECK (true)` INSERT + the client-side request status
--    UPDATE. Validates the token maps to a real request before inserting.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_vendor_quote(
  p_token              text,
  p_vendor_name        text,
  p_vendor_email       text,
  p_vendor_company     text,
  p_vendor_phone       text,
  p_line_items         jsonb,
  p_total_amount       numeric,
  p_valid_until        timestamptz,
  p_notes              text,
  p_quote_document_url text
)
RETURNS public.submitted_quotes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.quote_requests%ROWTYPE;
  v_row public.submitted_quotes;
BEGIN
  SELECT * INTO v_req FROM public.quote_requests WHERE token = p_token LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid quote request token';
  END IF;

  INSERT INTO public.submitted_quotes (
    quote_request_id, vendor_name, vendor_email, vendor_company, vendor_phone,
    line_items, total_amount, valid_until, notes, quote_document_url, status
  )
  VALUES (
    v_req.id, p_vendor_name, p_vendor_email, p_vendor_company, p_vendor_phone,
    COALESCE(p_line_items, '[]'::jsonb), p_total_amount, p_valid_until,
    p_notes, p_quote_document_url, 'pending'
  )
  RETURNING * INTO v_row;

  UPDATE public.quote_requests SET status = 'submitted' WHERE id = v_req.id;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_vendor_quote(
  text, text, text, text, text, jsonb, numeric, timestamptz, text, text
) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. v_meetings_summary (P0-5) — recreate with security_invoker so the
--    querying user's RLS on the underlying meeting tables applies. Without
--    this, the view runs with owner rights and leaks cross-org meeting data.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_meetings_summary
WITH (security_invoker = on) AS
SELECT
  m.id,
  m.meeting_date,
  m.week_of,
  m.notes,
  m.created_at,
  COALESCE(s.submission_count, 0)::int AS submission_count,
  COALESCE(a.total_count, 0)::int AS action_item_count,
  COALESCE(a.open_count, 0)::int AS open_action_item_count
FROM public.meetings m
LEFT JOIN (
  SELECT week_of, COUNT(*) AS submission_count
  FROM public.meeting_submissions
  GROUP BY week_of
) s ON s.week_of = m.week_of
LEFT JOIN (
  SELECT
    meeting_id,
    COUNT(*) AS total_count,
    COUNT(*) FILTER (WHERE status IN ('Open', 'In Progress')) AS open_count
  FROM public.meeting_action_items
  WHERE meeting_id IS NOT NULL
  GROUP BY meeting_id
) a ON a.meeting_id = m.id;

GRANT SELECT ON public.v_meetings_summary TO authenticated;

COMMIT;
