-- Per-assignee "Show job info" for crew workspace.
-- When a person is in show_job_info_person_ids they see sqft/pay/materials on /crew.
-- Helpers / pointup assignees are left out by the operator when scheduling.

ALTER TABLE public.schedule_items
  ADD COLUMN IF NOT EXISTS show_job_info_person_ids text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.schedule_items.show_job_info_person_ids IS
  'Subset of assigned_persons who may see job size, pay rates, and materials in the crew workspace.';

CREATE INDEX IF NOT EXISTS idx_schedule_items_show_job_info_person_ids
  ON public.schedule_items USING GIN (show_job_info_person_ids);

-- Preserve current crew visibility for existing assignments (operator can turn off later).
UPDATE public.schedule_items
SET show_job_info_person_ids = assigned_persons
WHERE coalesce(array_length(assigned_persons, 1), 0) > 0
  AND coalesce(array_length(show_job_info_person_ids, 1), 0) = 0;
