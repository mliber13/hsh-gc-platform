-- A crew member is never shown an unapproved payroll draft as their pay.
--
-- list_my_paystubs returned every period the person appears in, locked or not. That was
-- harmless while nothing called it — nothing has, since it was written in May. The crew
-- pay view calls it, and an open draft is a number Mark is still editing: showing it and
-- then paying something else hands the software a grievance it did not need to create
-- (CREW_TIME_CLOCK_PLAN §6.2).
--
-- Locked is the approval signal in this system. It lives inside the JSONB payload rather
-- than as a column, the same as it does for save_pay_period's guard.
--
-- Also returns start_date and end_date separately. The client had only period_label, a
-- concatenated string, so it could not sort or group by week without parsing it back.

BEGIN;

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
  v_person_id := public.user_hr_person_id();

  IF v_person_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  IF NOT public.is_user_active() THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'period_id', pp.id,
        'period_label',
          COALESCE(pp.payload ->> 'startDate', '') || ' – ' || COALESCE(pp.payload ->> 'endDate', ''),
        'start_date', pp.payload ->> 'startDate',
        'end_date', pp.payload ->> 'endDate',
        'entries', public.filter_paystub_entries_for_person(pp.payload, v_person_id)
      )
      ORDER BY pp.payload ->> 'startDate' DESC NULLS LAST
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM public.pay_periods pp
  WHERE pp.organization_id = public.get_user_organization_uuid()
    AND COALESCE(pp.payload ->> 'locked', 'false') IN ('true', 't')
    AND public.pay_period_includes_linked_person(pp.payload);

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.list_my_paystubs() IS
  'The caller''s own entries from LOCKED pay periods only. An open draft is still being '
  'edited and must never be shown to the person it concerns.';

GRANT EXECUTE ON FUNCTION public.list_my_paystubs() TO authenticated;

COMMIT;
