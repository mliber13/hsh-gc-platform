-- Schedule redesign Step 5: communication_log_entries
-- The central entity for the schedule comms layer.
-- Reference: docs/SCHEDULE_TARGET_MODEL.md section 3.1, section 10 step 5.

CREATE TABLE public.communication_log_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  schedule_item_id uuid REFERENCES public.schedule_items(id) ON DELETE SET NULL,

  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound', 'system')),
  channel text NOT NULL CHECK (channel IN ('sms', 'email', 'in-app', 'phone', 'system')),

  author_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_company_id uuid REFERENCES public.subcontractors(id) ON DELETE SET NULL,
  author_label text,

  body text NOT NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_comm_log_project_id_created
  ON public.communication_log_entries (project_id, created_at DESC);

CREATE INDEX idx_comm_log_schedule_item_id_created
  ON public.communication_log_entries (schedule_item_id, created_at DESC)
  WHERE schedule_item_id IS NOT NULL;

CREATE INDEX idx_comm_log_org_created
  ON public.communication_log_entries (organization_id, created_at DESC);

ALTER TABLE public.communication_log_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comm_log_select_own_org"
  ON public.communication_log_entries FOR SELECT
  TO authenticated
  USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "comm_log_insert_own_org"
  ON public.communication_log_entries FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "comm_log_update_own_org"
  ON public.communication_log_entries FOR UPDATE
  TO authenticated
  USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "comm_log_delete_own_org"
  ON public.communication_log_entries FOR DELETE
  TO authenticated
  USING (organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
