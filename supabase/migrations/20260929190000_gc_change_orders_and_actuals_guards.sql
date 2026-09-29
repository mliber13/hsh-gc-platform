-- GC change orders get somewhere to land, and project_actuals stops being able to fork.
--
-- P0-GC-1: `ChangeOrders.tsx` imports `updateProject` from `@/services`, which is the
-- synchronous localStorage writer. Every GC change order ever entered went into
-- `localStorage['hsh_gc_projects']` and was invisible to the app the moment it reloaded
-- from Supabase. `change_orders` has 0 rows and no writer; the `ProjectActuals` change-order
-- rollup has therefore always been $0.
--
-- The plan sized this as "service only — RLS exists". RLS does exist and is correct (an
-- org-scoped SELECT plus a `user_can_edit()` FOR ALL, from 20260427000004). But the table
-- is missing five of the fields the app's `ChangeOrder` type carries, so a service alone
-- would have had to silently drop them:
--
--   changeOrderNumber  requestedBy  scheduleImpact  approvedBy  rejectionReason  actualCost
--
-- The table is empty, so there is nothing to backfill and nothing to break.
--
-- P1-MONEY-7: `project_actuals` has no UNIQUE on `project_id` — PK on `id`, plus a
-- NON-unique `idx_actuals_project_id` — and `getOrCreateActualsId` is a SELECT followed by
-- an INSERT. Two tabs opening the same project can each miss and each insert. Latent today:
-- 40 rows, 40 distinct `project_id`, zero duplicates. The index is prevention, and it is
-- what lets the read path become an upsert instead of a check-then-write.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. change_orders: the fields the app already models
-- ---------------------------------------------------------------------------
ALTER TABLE public.change_orders
  ADD COLUMN IF NOT EXISTS change_order_number  text,
  ADD COLUMN IF NOT EXISTS requested_by         text,
  ADD COLUMN IF NOT EXISTS schedule_impact_days integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS approved_by          text,
  ADD COLUMN IF NOT EXISTS rejection_reason     text,
  ADD COLUMN IF NOT EXISTS actual_cost          numeric;

COMMENT ON COLUMN public.change_orders.change_order_number IS
  'Operator-facing number such as CO-001. Unique per project.';
COMMENT ON COLUMN public.change_orders.schedule_impact_days IS
  'Days added or removed. Negative is a pull-in, so this is not constrained to be positive.';

-- `status` was TEXT DEFAULT 'pending' while the app has only ever written the five values
-- below — 'pending' was never one of them. Nothing stored to reconcile (0 rows), so the
-- constraint can be exact rather than permissive.
ALTER TABLE public.change_orders
  ALTER COLUMN status SET DEFAULT 'draft';

ALTER TABLE public.change_orders
  DROP CONSTRAINT IF EXISTS change_orders_status_check;
ALTER TABLE public.change_orders
  ADD CONSTRAINT change_orders_status_check
  CHECK (status IN ('draft', 'pending-approval', 'approved', 'rejected', 'implemented'));

-- Two COs on one project must not share a number: the rollup groups by it and an operator
-- reading "CO-002" twice cannot tell which cost impact is which. The form derives the next
-- number from a count, which repeats as soon as one is deleted.
CREATE UNIQUE INDEX IF NOT EXISTS change_orders_project_number_key
  ON public.change_orders (project_id, change_order_number)
  WHERE change_order_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS change_orders_project_id_idx
  ON public.change_orders (project_id);

-- ---------------------------------------------------------------------------
-- 2. project_actuals: one row per project, enforced
-- ---------------------------------------------------------------------------
-- Asserted before creating it so the migration fails loudly rather than half-applying if a
-- duplicate arrived between the audit and the apply.
DO $guard$
DECLARE
  v_dupes int;
BEGIN
  SELECT count(*) INTO v_dupes
  FROM (
    SELECT project_id
    FROM public.project_actuals
    GROUP BY project_id
    HAVING count(*) > 1
  ) d;

  IF v_dupes > 0 THEN
    RAISE EXCEPTION
      'project_actuals has % project_id(s) with more than one row — merge them before adding the unique index', v_dupes;
  END IF;
END
$guard$;

CREATE UNIQUE INDEX IF NOT EXISTS project_actuals_project_id_key
  ON public.project_actuals (project_id);

COMMIT;
