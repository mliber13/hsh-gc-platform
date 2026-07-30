-- HR Phase A revision: tighten pay_periods SELECT to operator-or-read-own only.
-- Scope: pay_periods_hr_select + aligned helpers. org_team / time_entries unchanged.

BEGIN;

-- App-level "can open payroll / see org-wide runs" = operator only (read-own is row-level in RLS).
CREATE OR REPLACE FUNCTION public.user_can_read_org_payroll(uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_can_run_payroll(uid);
$$;

-- Read-own: any payroll run whose payload.entries[] contains requester's linked personId.
CREATE OR REPLACE FUNCTION public.pay_period_includes_linked_person(run_payload jsonb, uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.user_hr_person_id(uid) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(run_payload -> 'entries') = 'array' THEN run_payload -> 'entries'
          ELSE '[]'::jsonb
        END
      ) AS e(elem)
      WHERE (elem ->> 'personId') = public.user_hr_person_id(uid)
    );
$$;

DROP POLICY IF EXISTS pay_periods_hr_select ON public.pay_periods;

CREATE POLICY pay_periods_hr_select ON public.pay_periods
  FOR SELECT
  USING (
    organization_id = public.get_user_organization_uuid()
    AND public.is_user_active()
    AND (
      public.user_can_run_payroll()
      OR public.pay_period_includes_linked_person(payload)
    )
  );

COMMIT;
