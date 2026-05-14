-- Schedule redesign Step 15: org_holidays + subcontractor_unavailability
-- Per docs/SCHEDULE_TARGET_MODEL.md §5.3 + §8 + §10 step 15.

BEGIN;

CREATE TABLE public.org_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  date date NOT NULL,
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users,
  UNIQUE (organization_id, date)
);

CREATE INDEX idx_org_holidays_org_date
  ON public.org_holidays (organization_id, date);

ALTER TABLE public.org_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active users can view org holidays"
  ON public.org_holidays FOR SELECT
  USING (organization_id = public.current_user_organization_id() AND public.is_user_active());

CREATE POLICY "Active users can create org holidays"
  ON public.org_holidays FOR INSERT
  WITH CHECK (organization_id = public.current_user_organization_id() AND public.is_user_active());

CREATE POLICY "Active users can update org holidays"
  ON public.org_holidays FOR UPDATE
  USING (organization_id = public.current_user_organization_id() AND public.is_user_active())
  WITH CHECK (organization_id = public.current_user_organization_id() AND public.is_user_active());

CREATE POLICY "Active users can delete org holidays"
  ON public.org_holidays FOR DELETE
  USING (organization_id = public.current_user_organization_id() AND public.is_user_active());

CREATE TABLE public.subcontractor_unavailability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subcontractor_id uuid NOT NULL REFERENCES public.subcontractors(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users,
  CHECK (end_date >= start_date)
);

CREATE INDEX idx_sub_unavailability_sub_range
  ON public.subcontractor_unavailability (subcontractor_id, start_date, end_date);

CREATE INDEX idx_sub_unavailability_org_range
  ON public.subcontractor_unavailability (organization_id, start_date, end_date);

ALTER TABLE public.subcontractor_unavailability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active users can view sub unavailability"
  ON public.subcontractor_unavailability FOR SELECT
  USING (organization_id = public.current_user_organization_id() AND public.is_user_active());

CREATE POLICY "Active users can create sub unavailability"
  ON public.subcontractor_unavailability FOR INSERT
  WITH CHECK (organization_id = public.current_user_organization_id() AND public.is_user_active());

CREATE POLICY "Active users can update sub unavailability"
  ON public.subcontractor_unavailability FOR UPDATE
  USING (organization_id = public.current_user_organization_id() AND public.is_user_active())
  WITH CHECK (organization_id = public.current_user_organization_id() AND public.is_user_active());

CREATE POLICY "Active users can delete sub unavailability"
  ON public.subcontractor_unavailability FOR DELETE
  USING (organization_id = public.current_user_organization_id() AND public.is_user_active());

COMMIT;
