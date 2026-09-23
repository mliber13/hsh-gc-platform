-- Addendum to Part 1: guarded pay_periods delete.
-- Mirrors save_pay_period org / stored payload->>'locked' / page-held updated_at.
-- No unlock exception — a locked run is not deletable.
-- Reverse banked-hours delta is in the same transaction via jsonb_set on the member.
-- save_pay_period keeps a per-person `baseline` so a clamped overdraw can round-trip.

BEGIN;

CREATE OR REPLACE FUNCTION public.org_team_set_banked_hours(
  p_org uuid,
  p_array text,
  p_person_id text,
  p_value numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
  v_idx int;
BEGIN
  IF p_array NOT IN ('employees', 'contractors1099') OR p_person_id IS NULL OR btrim(p_person_id) = '' THEN
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

  SELECT (pos - 1)
  INTO v_idx
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

  UPDATE public.org_team
  SET
    payload = jsonb_set(
      payload,
      ARRAY[p_array, v_idx::text, 'bankedHours'],
      to_jsonb(GREATEST(0, p_value)),
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
  v_prev_ledger jsonb := '{}'::jsonb;
  v_merged jsonb := '{}'::jsonb;
  v_new_updated_at timestamptz;
  r record;
  v_array text;
  v_person_id text;
  v_before numeric;
  v_applied numeric;
  v_baseline numeric;
  k text;
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

  v_prev_ledger := COALESCE(v_existing_payload->'bankedHoursLedger', '{}'::jsonb);
  IF jsonb_typeof(v_prev_ledger) <> 'object' THEN
    v_prev_ledger := '{}'::jsonb;
  END IF;
  v_merged := v_prev_ledger;
  FOR k IN SELECT jsonb_object_keys(v_ledger)
  LOOP
    v_baseline := COALESCE(
      NULLIF(v_prev_ledger->k->>'baseline', '')::numeric,
      NULLIF(v_prev_ledger->k->>'before', '')::numeric,
      NULLIF(v_ledger->k->>'before', '')::numeric
    );
    v_merged := v_merged || jsonb_build_object(
      k,
      COALESCE(v_ledger->k, '{}'::jsonb) || jsonb_build_object('baseline', to_jsonb(v_baseline))
    );
  END LOOP;

  v_payload := (p_payload || jsonb_build_object('id', p_id))
    - 'updated_at'
    - 'bankedHoursLedger';
  IF v_merged <> '{}'::jsonb THEN
    v_payload := v_payload || jsonb_build_object('bankedHoursLedger', v_merged);
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

CREATE OR REPLACE FUNCTION public.delete_pay_period(
  p_id text,
  p_expected_updated_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_existing_org uuid;
  v_existing_updated_at timestamptz;
  v_existing_payload jsonb;
  v_stored_locked boolean := false;
  v_ledger jsonb := '{}'::jsonb;
  v_done text[] := '{}';
  r record;
  v_array text;
  v_person_id text;
  v_target numeric;
  v_applied numeric;
  k text;
  v_entry jsonb;
  v_deleted_id text;
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

  IF p_id IS NULL OR btrim(p_id) = '' THEN
    RAISE EXCEPTION 'pay_period_invalid: id is required'
      USING ERRCODE = '22023';
  END IF;

  SELECT pp.organization_id, pp.updated_at, pp.payload
  INTO v_existing_org, v_existing_updated_at, v_existing_payload
  FROM public.pay_periods pp
  WHERE pp.id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'pay_period_stale: this payroll run changed somewhere else. Reload and try again.'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_existing_org IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'pay_period_forbidden: not allowed to save payroll'
      USING ERRCODE = '42501';
  END IF;

  IF p_expected_updated_at IS NULL OR v_existing_updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'pay_period_stale: this payroll run changed somewhere else. Reload and try again.'
      USING ERRCODE = 'P0001';
  END IF;

  v_stored_locked := COALESCE(v_existing_payload->>'locked', 'false') IN ('true', 't');
  IF v_stored_locked THEN
    RAISE EXCEPTION 'pay_period_locked: this payroll run is locked. Unlock it before saving.'
      USING ERRCODE = 'P0001';
  END IF;

  v_ledger := COALESCE(v_existing_payload->'bankedHoursLedger', '{}'::jsonb);
  IF jsonb_typeof(v_ledger) <> 'object' THEN
    v_ledger := '{}'::jsonb;
  END IF;

  -- Prefer restoring the pre-run baseline (invertible through clamp). Fallback: -applied, then -contribution.
  FOR k IN SELECT jsonb_object_keys(v_ledger)
  LOOP
    v_entry := v_ledger->k;
    IF k LIKE 'w2-%' THEN
      v_array := 'employees';
      v_person_id := substr(k, 4);
    ELSIF k LIKE 'c-%' THEN
      v_array := 'contractors1099';
      v_person_id := substr(k, 3);
    ELSE
      CONTINUE;
    END IF;

    v_target := COALESCE(
      NULLIF(v_entry->>'baseline', '')::numeric,
      NULLIF(v_entry->>'before', '')::numeric
    );
    IF v_target IS NOT NULL THEN
      PERFORM public.org_team_set_banked_hours(v_org, v_array, v_person_id, v_target);
    ELSE
      v_applied := COALESCE(NULLIF(v_entry->>'applied', '')::numeric, 0);
      PERFORM public.org_team_apply_banked_hours(v_org, v_array, v_person_id, -v_applied);
    END IF;
    v_done := array_append(v_done, k);
  END LOOP;

  FOR r IN
    SELECT person_key, amount
    FROM public.pay_period_contributions(COALESCE(v_existing_payload, '{}'::jsonb))
    WHERE amount <> 0
  LOOP
    IF r.person_key = ANY (v_done) THEN
      CONTINUE;
    END IF;
    IF r.person_key LIKE 'w2-%' THEN
      v_array := 'employees';
      v_person_id := substr(r.person_key, 4);
    ELSIF r.person_key LIKE 'c-%' THEN
      v_array := 'contractors1099';
      v_person_id := substr(r.person_key, 3);
    ELSE
      CONTINUE;
    END IF;
    PERFORM public.org_team_apply_banked_hours(v_org, v_array, v_person_id, -r.amount);
  END LOOP;

  DELETE FROM public.pay_periods
  WHERE id = p_id
    AND organization_id = v_org
  RETURNING id INTO v_deleted_id;

  IF v_deleted_id IS NULL THEN
    RAISE EXCEPTION 'pay_period_forbidden: not allowed to save payroll'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.org_team_set_banked_hours(uuid, text, text, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_pay_period(text, timestamptz) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.delete_pay_period(text, timestamptz) TO authenticated;

COMMIT;
