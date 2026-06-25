BEGIN;

-- assigned_persons holds org_team payload member ids (text) — matches profiles.linked_employee_id / linked_contractor_id format
ALTER TABLE public.schedule_items
  ADD COLUMN IF NOT EXISTS assigned_persons text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_schedule_items_assigned_persons
  ON public.schedule_items USING GIN (assigned_persons);

COMMENT ON COLUMN public.schedule_items.assigned_persons IS
  'D.6.2: Org_team payload member ids of specific persons assigned to this schedule item. Used by crew app for per-person project visibility. Complementary to assigned_company_id (company) — both can be set.';

COMMIT;
