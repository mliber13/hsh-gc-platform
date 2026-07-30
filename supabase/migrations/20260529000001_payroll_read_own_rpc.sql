-- Phase C: read-own paystub RPCs — return only the caller's entry(ies), not full run payload.
-- Operators (can_run_payroll) continue to SELECT pay_periods directly.

BEGIN;

CREATE OR REPLACE FUNCTION public.filter_paystub_entries_for_person(
  run_payload jsonb,
  linked_person_id text
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    jsonb_agg(elem ORDER BY ord),
    '[]'::jsonb
  )
  FROM (
    SELECT elem, ord
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(run_payload -> 'entries') = 'array' THEN run_payload -> 'entries'
        ELSE '[]'::jsonb
      END
    ) WITH ORDINALITY AS t(elem, ord)
    WHERE (elem ->> 'personId') = linked_person_id
  ) sub;
$$;

CREATE OR REPLACE FUNCTION public.get_my_paystub_entries(p_period_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_person_id text;
  v_payload jsonb;
BEGIN
  IF NOT public.is_user_active() THEN
    RETURN '[]'::jsonb;
  END IF;

  v_person_id := public.user_hr_person_id();
  IF v_person_id IS NULL OR p_period_id IS NULL OR btrim(p_period_id) = '' THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT pp.payload
  INTO v_payload
  FROM public.pay_periods pp
  WHERE pp.id = p_period_id
    AND pp.organization_id = public.get_user_organization_uuid()
    AND public.pay_period_includes_linked_person(pp.payload);

  IF v_payload IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN public.filter_paystub_entries_for_person(v_payload, v_person_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_my_paystubs()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_person_id text;
  v_result jsonb;
BEGIN
  IF NOT public.is_user_active() THEN
    RETURN '[]'::jsonb;
  END IF;

  v_person_id := public.user_hr_person_id();
  IF v_person_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'period_id', pp.id,
        'period_label',
          COALESCE(pp.payload ->> 'startDate', '') || ' – ' || COALESCE(pp.payload ->> 'endDate', ''),
        'entries', public.filter_paystub_entries_for_person(pp.payload, v_person_id)
      )
      ORDER BY pp.updated_at DESC NULLS LAST
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM public.pay_periods pp
  WHERE pp.organization_id = public.get_user_organization_uuid()
    AND public.pay_period_includes_linked_person(pp.payload);

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.filter_paystub_entries_for_person(jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_paystub_entries(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_paystubs() TO authenticated;

-- ---------------------------------------------------------------------------
-- Verification (sanity probe — does not mutate data)
-- ---------------------------------------------------------------------------
DO $verify$
DECLARE
  v_period_id text;
  v_sample_person_id text;
  v_mark_uid uuid := '7507f8ea-f694-453b-960e-3f0ea6337864'::uuid;
  v_payload jsonb;
  v_mark_entries jsonb;
  v_sim_entries jsonb;
  v_sim_count int;
BEGIN
  SELECT pp.id, e.elem ->> 'personId'
  INTO v_period_id, v_sample_person_id
  FROM public.pay_periods pp
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(pp.payload -> 'entries') = 'array' THEN pp.payload -> 'entries' ELSE '[]'::jsonb END
  ) AS e(elem)
  WHERE (e.elem ->> 'personId') IS NOT NULL
  ORDER BY pp.updated_at DESC
  LIMIT 1;

  IF v_period_id IS NULL THEN
    RAISE NOTICE 'payroll_rpc_verify: no pay periods with entries — skipping entry-level probe';
    RETURN;
  END IF;

  -- Mark (owner): hr_person_id null
  IF public.user_hr_person_id(v_mark_uid) IS NOT NULL THEN
    RAISE EXCEPTION 'payroll_rpc_verify: Mark should have null hr_person_id before probe';
  END IF;

  SELECT pp.payload INTO v_payload FROM public.pay_periods pp WHERE pp.id = v_period_id;
  v_mark_entries := public.filter_paystub_entries_for_person(v_payload, public.user_hr_person_id(v_mark_uid));
  IF v_mark_entries IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'payroll_rpc_verify: null person_id filter should return []';
  END IF;

  -- Simulated linked user (profile link only — RPC uses auth.uid() at runtime)
  UPDATE public.profiles SET hr_person_id = v_sample_person_id WHERE id = v_mark_uid;

  v_sim_entries := public.filter_paystub_entries_for_person(
    v_payload,
    public.user_hr_person_id(v_mark_uid)
  );
  SELECT count(*) INTO v_sim_count FROM jsonb_array_elements(v_sim_entries);
  IF v_sim_count < 1 THEN
    RAISE EXCEPTION 'payroll_rpc_verify: simulated hr_person_id=% expected >=1 entry, got %', v_sample_person_id, v_sim_entries;
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_sim_entries) e
    WHERE (e ->> 'personId') IS DISTINCT FROM v_sample_person_id
  ) THEN
    RAISE EXCEPTION 'payroll_rpc_verify: leaked other person entries in get_my_paystub_entries';
  END IF;

  UPDATE public.profiles SET hr_person_id = NULL WHERE id = v_mark_uid;

  RAISE NOTICE 'payroll_rpc_verify: OK period=% person=%', v_period_id, v_sample_person_id;
END
$verify$;

COMMIT;
