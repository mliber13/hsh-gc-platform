-- P0-DATA-2 / P1-HR-1: one guarded pay_periods write path.
-- locked lives in payload->>'locked' (not a column). Compare that on the STORED
-- row; the only exception is this call unlocking (incoming locked = false).
-- expected updated_at is the page-held timestamptz, never a client-generated now().
-- Banked-hours deltas apply in the same transaction via jsonb_set on the member.

BEGIN;

CREATE OR REPLACE FUNCTION public.pay_period_entry_hours(elem jsonb)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN COALESCE(hour_sum, 0) > 0 THEN hour_sum
    ELSE COALESCE(NULLIF(elem->>'hours', '')::numeric, 0)
  END
  FROM (
    SELECT SUM(COALESCE(NULLIF(h->>'hours', '')::numeric, 0)) AS hour_sum
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(elem->'hourEntries') = 'array' THEN elem->'hourEntries'
        ELSE '[]'::jsonb
      END
    ) h
  ) s;
$$;

CREATE OR REPLACE FUNCTION public.pay_period_entry_contribution(elem jsonb)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT LEAST(
      COALESCE(NULLIF(elem->>'hoursToBank', '')::numeric, 0),
      public.pay_period_entry_hours(elem)
    )
    - COALESCE(NULLIF(elem->>'bankedHoursUsed', '')::numeric, 0);
$$;

CREATE OR REPLACE FUNCTION public.pay_period_contributions(p_payload jsonb)
RETURNS TABLE(person_key text, amount numeric)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    CASE
      WHEN COALESCE(elem->>'personType', '') = 'w2' THEN 'w2-' || COALESCE(elem->>'personId', '')
      ELSE 'c-' || COALESCE(elem->>'personId', '')
    END AS person_key,
    SUM(public.pay_period_entry_contribution(elem)) AS amount
  FROM jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(p_payload->'entries') = 'array' THEN p_payload->'entries'
      ELSE '[]'::jsonb
    END
  ) elem
  WHERE COALESCE(elem->>'personId', '') <> ''
  GROUP BY 1;
$$;

CREATE OR REPLACE FUNCTION public.org_team_apply_banked_hours(
  p_org uuid,
  p_array text,
  p_person_id text,
  p_delta numeric,
  OUT before_hours numeric,
  OUT applied_delta numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
  v_idx int;
  v_elem jsonb;
  v_after numeric;
BEGIN
  before_hours := NULL;
  applied_delta := 0;
  IF p_delta = 0 OR p_array NOT IN ('employees', 'contractors1099') THEN
    RETURN;
  END IF;

  SELECT payload INTO v_payload
  FROM public.org_team
  WHERE organization_id = p_org
  FOR UPDATE;

  IF v_payload IS NULL THEN
    RAISE EXCEPTION 'pay_period_team_missing: org_team row not found'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT (pos - 1), elem
  INTO v_idx, v_elem
  FROM jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(v_payload->p_array) = 'array' THEN v_payload->p_array
      ELSE '[]'::jsonb
    END
  ) WITH ORDINALITY AS t(elem, pos)
  WHERE elem->>'id' = p_person_id
  LIMIT 1;

  IF v_idx IS NULL THEN
    RETURN;
  END IF;

  before_hours := COALESCE(NULLIF(v_elem->>'bankedHours', '')::numeric, 0);
  v_after := GREATEST(0, before_hours + p_delta);
  applied_delta := v_after - before_hours;

  UPDATE public.org_team
  SET
    payload = jsonb_set(
      payload,
      ARRAY[p_array, v_idx::text, 'bankedHours'],
      to_jsonb(v_after),
      true
    ),
    updated_at = now()
  WHERE organization_id = p_org;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_pay_period(
  p_id text,
  p_payload jsonb,
  p_expected_updated_at timestamptz
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_existing_org uuid;
  v_existing_updated_at timestamptz;
  v_existing_payload jsonb;
  v_exists boolean := false;
  v_stored_locked boolean := false;
  v_incoming_unlock boolean := false;
  v_payload jsonb;
  v_ledger jsonb := '{}'::jsonb;
  v_new_updated_at timestamptz;
  r record;
  v_array text;
  v_person_id text;
  v_before numeric;
  v_applied numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_user_active() OR NOT public.user_can_run_payroll() THEN
    RAISE EXCEPTION 'pay_period_forbidden: not allowed to save payroll'
      USING ERRCODE = '42501';
  END IF;

  v_org := public.get_user_organization_uuid();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'pay_period_forbidden: not allowed to save payroll'
      USING ERRCODE = '42501';
  END IF;

  IF p_id IS NULL OR btrim(p_id) = '' OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'pay_period_invalid: id and payload are required'
      USING ERRCODE = '22023';
  END IF;

  SELECT pp.organization_id, pp.updated_at, pp.payload
  INTO v_existing_org, v_existing_updated_at, v_existing_payload
  FROM public.pay_periods pp
  WHERE pp.id = p_id
  FOR UPDATE;

  v_exists := FOUND;

  IF v_exists AND v_existing_org IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'pay_period_forbidden: not allowed to save payroll'
      USING ERRCODE = '42501';
  END IF;

  IF v_exists AND p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'pay_period_exists: this payroll run already exists. Reload and try again.'
      USING ERRCODE = 'P0001';
  END IF;

  IF (NOT v_exists) AND p_expected_updated_at IS NOT NULL THEN
    RAISE EXCEPTION 'pay_period_stale: this payroll run changed somewhere else. Reload and try again.'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_exists AND v_existing_updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'pay_period_stale: this payroll run changed somewhere else. Reload and try again.'
      USING ERRCODE = 'P0001';
  END IF;

  v_stored_locked := COALESCE(v_existing_payload->>'locked', 'false') IN ('true', 't');
  v_incoming_unlock := (p_payload->>'locked') = 'false';

  IF v_exists AND v_stored_locked AND NOT v_incoming_unlock THEN
    RAISE EXCEPTION 'pay_period_locked: this payroll run is locked. Unlock it before saving.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Apply banked-hours delta (incoming vs stored) with jsonb_set on the member.
  FOR r IN
    SELECT
      COALESCE(n.person_key, p.person_key) AS person_key,
      COALESCE(n.amount, 0) - COALESCE(p.amount, 0) AS delta
    FROM public.pay_period_contributions(p_payload) n
    FULL OUTER JOIN public.pay_period_contributions(COALESCE(v_existing_payload, '{}'::jsonb)) p
      ON n.person_key = p.person_key
    WHERE COALESCE(n.amount, 0) - COALESCE(p.amount, 0) <> 0
  LOOP
    IF r.person_key LIKE 'w2-%' THEN
      v_array := 'employees';
      v_person_id := substr(r.person_key, 4);
    ELSIF r.person_key LIKE 'c-%' THEN
      v_array := 'contractors1099';
      v_person_id := substr(r.person_key, 3);
    ELSE
      CONTINUE;
    END IF;

    SELECT before_hours, applied_delta
    INTO v_before, v_applied
    FROM public.org_team_apply_banked_hours(v_org, v_array, v_person_id, r.delta);

    v_ledger := v_ledger || jsonb_build_object(
      r.person_key,
      jsonb_build_object(
        'before', v_before,
        'delta', r.delta,
        'applied', COALESCE(v_applied, 0)
      )
    );
  END LOOP;

  v_payload := p_payload
    || jsonb_build_object('id', p_id);
  v_payload := v_payload - 'updated_at';
  IF v_ledger <> '{}'::jsonb THEN
    v_payload := v_payload || jsonb_build_object('bankedHoursLedger', v_ledger);
  END IF;

  INSERT INTO public.pay_periods (id, organization_id, payload, updated_at)
  VALUES (p_id, v_org, v_payload, now())
  ON CONFLICT (id) DO UPDATE
    SET payload = EXCLUDED.payload,
        updated_at = now()
    WHERE public.pay_periods.organization_id = v_org
  RETURNING updated_at INTO v_new_updated_at;

  IF v_new_updated_at IS NULL THEN
    RAISE EXCEPTION 'pay_period_forbidden: not allowed to save payroll'
      USING ERRCODE = '42501';
  END IF;

  RETURN v_new_updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.pay_period_entry_hours(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pay_period_entry_contribution(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pay_period_contributions(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.org_team_apply_banked_hours(uuid, text, text, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_pay_period(text, jsonb, timestamptz) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.save_pay_period(text, jsonb, timestamptz) TO authenticated;

COMMIT;
