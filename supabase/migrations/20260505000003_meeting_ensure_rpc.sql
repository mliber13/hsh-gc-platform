-- ============================================================
-- Meeting workflow: ensure_meeting RPC for idempotent row creation
-- ============================================================
-- meetings has RLS enabled and no client INSERT policy. This RPC allows an
-- active meeting lead to create-or-resolve a meeting row for a date.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.ensure_meeting(p_meeting_date date)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_week_of date;
BEGIN
  IF NOT public.is_active_meeting_lead(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_week_of := (date_trunc('week', p_meeting_date::timestamp))::date;

  INSERT INTO public.meetings (meeting_date, week_of)
  VALUES (p_meeting_date, v_week_of)
  ON CONFLICT (meeting_date) DO NOTHING;

  SELECT id INTO v_id
  FROM public.meetings
  WHERE meeting_date = p_meeting_date;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.ensure_meeting(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_meeting(date) TO authenticated;

COMMIT;
