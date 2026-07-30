-- ============================================================
-- Schedule redesign Step 1: promote schedule items to a real table
-- ============================================================
-- Per docs/SCHEDULE_TARGET_MODEL.md §10 step 1. Each existing
-- schedules.items JSONB array element becomes one schedule_items
-- row. Subsequent steps (assigned_company_id, multi-predecessor
-- with lag, confirmation state, comms-log linkage) extend this
-- table in-place. The schedules.items column is kept as fallback
-- for one release; a follow-up migration drops it once read paths
-- are verified migrated.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.schedule_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id uuid NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,

  -- What
  type text NOT NULL CHECK (type IN ('field', 'office')),
  name text NOT NULL,
  description text,
  trade text,
  estimate_trade_id uuid,

  -- When
  start_date date NOT NULL,
  end_date date NOT NULL,
  duration integer NOT NULL,

  -- Dependencies (Step 1 keeps the simple array shape; Step 3 reshapes to multi+lag)
  predecessor_ids uuid[] NOT NULL DEFAULT '{}',

  -- Progress
  status text NOT NULL DEFAULT 'not-started'
    CHECK (status IN ('not-started', 'in-progress', 'complete', 'delayed')),
  percent_complete integer NOT NULL DEFAULT 0
    CHECK (percent_complete BETWEEN 0 AND 100),
  actual_start_date date,
  actual_end_date date,

  -- Resources / Notes
  assigned_to text[] NOT NULL DEFAULT '{}',
  notes text,

  -- Standard metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedule_items_schedule_id ON public.schedule_items(schedule_id);
CREATE INDEX IF NOT EXISTS idx_schedule_items_project_id ON public.schedule_items(project_id);
CREATE INDEX IF NOT EXISTS idx_schedule_items_organization_id ON public.schedule_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_schedule_items_start_date ON public.schedule_items(start_date);

DROP TRIGGER IF EXISTS update_schedule_items_updated_at ON public.schedule_items;
CREATE TRIGGER update_schedule_items_updated_at
  BEFORE UPDATE ON public.schedule_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- RLS — mirror the existing schedules policies
-- ============================================================
ALTER TABLE public.schedule_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view organization schedule items" ON public.schedule_items;
CREATE POLICY "Users can view organization schedule items"
  ON public.schedule_items
  FOR SELECT
  USING (organization_id = public.get_user_organization_uuid() AND public.is_user_active());

DROP POLICY IF EXISTS "Editors and admins can manage schedule items" ON public.schedule_items;
CREATE POLICY "Editors and admins can manage schedule items"
  ON public.schedule_items
  FOR ALL
  USING (organization_id = public.get_user_organization_uuid() AND public.user_can_edit())
  WITH CHECK (organization_id = public.get_user_organization_uuid() AND public.user_can_edit());

-- ============================================================
-- Backfill — extract each schedules.items[] element to a row
-- ============================================================
-- Idempotent: skip schedules that already have rows in schedule_items.
INSERT INTO public.schedule_items (
  id, schedule_id, project_id, organization_id,
  type, name, description, trade, estimate_trade_id,
  start_date, end_date, duration,
  predecessor_ids,
  status, percent_complete, actual_start_date, actual_end_date,
  assigned_to, notes,
  created_at, updated_at
)
SELECT
  COALESCE((item->>'id')::uuid, uuid_generate_v4()),
  s.id,
  s.project_id,
  s.organization_id,
  COALESCE(item->>'type', 'field'),
  COALESCE(item->>'name', '(unnamed)'),
  item->>'description',
  item->>'trade',
  CASE
    WHEN item->>'estimateTradeId' IS NOT NULL AND item->>'estimateTradeId' != ''
    THEN (item->>'estimateTradeId')::uuid
    ELSE NULL
  END,
  COALESCE((item->>'startDate')::date, s.start_date::date, CURRENT_DATE),
  COALESCE((item->>'endDate')::date, s.end_date::date, COALESCE((item->>'startDate')::date, s.start_date::date, CURRENT_DATE)),
  COALESCE((item->>'duration')::int, 1),
  COALESCE(
    (SELECT array_agg(value::uuid) FROM jsonb_array_elements_text(item->'predecessorIds') AS value WHERE value IS NOT NULL),
    '{}'::uuid[]
  ),
  COALESCE(item->>'status', 'not-started'),
  COALESCE((item->>'percentComplete')::int, 0),
  CASE
    WHEN item->>'actualStartDate' IS NOT NULL AND item->>'actualStartDate' != ''
    THEN (item->>'actualStartDate')::date
    ELSE NULL
  END,
  CASE
    WHEN item->>'actualEndDate' IS NOT NULL AND item->>'actualEndDate' != ''
    THEN (item->>'actualEndDate')::date
    ELSE NULL
  END,
  COALESCE(
    (SELECT array_agg(value) FROM jsonb_array_elements_text(item->'assignedTo') AS value WHERE value IS NOT NULL),
    '{}'::text[]
  ),
  item->>'notes',
  COALESCE((item->>'createdAt')::timestamptz, s.created_at),
  COALESCE((item->>'updatedAt')::timestamptz, s.updated_at)
FROM public.schedules s,
     LATERAL jsonb_array_elements(s.items) AS item
WHERE s.items IS NOT NULL
  AND jsonb_typeof(s.items) = 'array'
  AND NOT EXISTS (
    SELECT 1 FROM public.schedule_items si WHERE si.schedule_id = s.id
  );

COMMIT;
