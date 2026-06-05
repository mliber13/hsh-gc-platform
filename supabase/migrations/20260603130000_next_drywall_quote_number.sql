-- Drywall quote numbers: DW-YYYY-NNN (parallel to client_quotes Q-YYYY-NNN)
-- Stored on projects.metadata.legacy.quote.quoteNumber

CREATE OR REPLACE FUNCTION public.next_drywall_quote_number(p_org uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year int := EXTRACT(YEAR FROM now())::int;
  v_next int;
  v_lock_key bigint;
BEGIN
  v_lock_key := hashtextextended('drywall:' || p_org::text || ':' || v_year::text, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT COALESCE(MAX(
    NULLIF(
      regexp_replace(
        metadata->'legacy'->'quote'->>'quoteNumber',
        '^DW-' || v_year::text || '-',
        ''
      ),
      ''
    )::int
  ), 0) + 1
    INTO v_next
    FROM public.projects
    WHERE organization_id = p_org
      AND metadata->'legacy'->'quote'->>'quoteNumber' LIKE 'DW-' || v_year::text || '-%';

  RETURN 'DW-' || v_year::text || '-' || lpad(v_next::text, 3, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_drywall_quote_number(uuid) TO authenticated;
