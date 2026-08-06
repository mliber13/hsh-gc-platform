-- Crew/team-member time off (vacation/PTO) shown on the drywall + crew schedule.
-- Distinct from subcontractor_unavailability (GC subs): keyed to the TEXT org_team
-- member id used in schedule_items.assigned_persons. Display-only for now.

BEGIN;

CREATE TABLE IF NOT EXISTS public.person_unavailability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  person_id text NOT NULL,
  person_name text,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users,
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_person_unavail_org_range
  ON public.person_unavailability (organization_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_person_unavail_person
  ON public.person_unavailability (person_id);

ALTER TABLE public.person_unavailability ENABLE ROW LEVEL SECURITY;

-- Any active org member (incl. crew) can view — the crew calendar reads this.
DROP POLICY IF EXISTS "view person unavailability" ON public.person_unavailability;
CREATE POLICY "view person unavailability"
  ON public.person_unavailability FOR SELECT
  USING (organization_id = public.get_user_organization_uuid() AND public.is_user_active());

-- Operators manage it.
DROP POLICY IF EXISTS "insert person unavailability" ON public.person_unavailability;
CREATE POLICY "insert person unavailability"
  ON public.person_unavailability FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization_uuid() AND public.user_can_edit());

DROP POLICY IF EXISTS "update person unavailability" ON public.person_unavailability;
CREATE POLICY "update person unavailability"
  ON public.person_unavailability FOR UPDATE
  USING (organization_id = public.get_user_organization_uuid() AND public.user_can_edit())
  WITH CHECK (organization_id = public.get_user_organization_uuid() AND public.user_can_edit());

DROP POLICY IF EXISTS "delete person unavailability" ON public.person_unavailability;
CREATE POLICY "delete person unavailability"
  ON public.person_unavailability FOR DELETE
  USING (organization_id = public.get_user_organization_uuid() AND public.user_can_edit());

COMMIT;
