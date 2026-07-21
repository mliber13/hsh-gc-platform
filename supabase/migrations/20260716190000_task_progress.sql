-- Crew time clock / job progress — Phase 2: crew logs task progress.
--
-- task_progress = cumulative % complete per (schedule-item task, person). One row per
-- person's contribution to a task (multi-crew jobs sum in later analytics/pay). Checkbox
-- (progress-only) tasks store 0 or 100. Crew write ONLY via the SECURITY DEFINER RPC below;
-- operators/crew read their org's progress. See docs/CREW_TIME_CLOCK_PLAN.md.

CREATE TABLE IF NOT EXISTS public.task_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  schedule_item_id uuid NOT NULL REFERENCES public.schedule_items(id) ON DELETE CASCADE,
  project_id uuid,
  task_id text NOT NULL,
  person_id text NOT NULL,
  pct numeric NOT NULL DEFAULT 0 CHECK (pct >= 0 AND pct <= 100),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (schedule_item_id, task_id, person_id)
);

CREATE INDEX IF NOT EXISTS task_progress_project_idx ON public.task_progress (project_id);
CREATE INDEX IF NOT EXISTS task_progress_schedule_item_idx ON public.task_progress (schedule_item_id);

ALTER TABLE public.task_progress ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated member of the org (operators + crew) sees their org's progress.
DROP POLICY IF EXISTS "Read task progress in org" ON public.task_progress;
CREATE POLICY "Read task progress in org" ON public.task_progress
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_uuid());

-- No direct INSERT/UPDATE/DELETE policy — writes go through crew_update_task_progress().

CREATE OR REPLACE FUNCTION public.crew_update_task_progress(
  p_schedule_item_id uuid,
  p_task_id text,
  p_pct numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_person text;
  v_project uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_pct IS NULL OR p_pct < 0 OR p_pct > 100 THEN
    RAISE EXCEPTION 'pct must be between 0 and 100';
  END IF;

  v_org := public.get_user_organization_uuid();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'no organization';
  END IF;

  IF NOT public.user_has_crew_role(v_uid) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT COALESCE(p.linked_employee_id, p.linked_contractor_id)
    INTO v_person
    FROM public.profiles p
    WHERE p.id = v_uid;
  IF v_person IS NULL OR v_person = '' THEN
    RAISE EXCEPTION 'crew account not linked to a team member';
  END IF;

  -- Caller must be assigned to this schedule item (in their org) and the task must exist on it.
  SELECT si.project_id
    INTO v_project
    FROM public.schedule_items si
    WHERE si.id = p_schedule_item_id
      AND si.organization_id = v_org
      AND v_person = ANY(si.assigned_persons)
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(si.tasks) t
        WHERE t->>'id' = p_task_id
      );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not authorized to update this task';
  END IF;

  INSERT INTO public.task_progress
    (organization_id, schedule_item_id, project_id, task_id, person_id, pct, updated_at)
  VALUES (v_org, p_schedule_item_id, v_project, p_task_id, v_person, p_pct, now())
  ON CONFLICT (schedule_item_id, task_id, person_id)
  DO UPDATE SET pct = EXCLUDED.pct, updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.crew_update_task_progress(uuid, text, numeric) TO authenticated;
