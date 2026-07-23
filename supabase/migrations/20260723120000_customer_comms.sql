BEGIN;

-- Customer comms (CC.1): SMS coordination with the customer / GC superintendent.
-- Person-centric threads (keyed by phone) whose messages are tagged to a project; the office
-- resolves multi-job routing (one person's cell can be on several open jobs).

-- Consistent 10-digit phone key (mirrors receive-sms normalizePhone: strip non-digits, last 10).
CREATE OR REPLACE FUNCTION public.normalize_phone_10(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT RIGHT(regexp_replace(COALESCE(raw, ''), '\D', '', 'g'), 10);
$$;

-- 1. The customer/super contact on a job (one primary per project). The same phone appearing on
--    multiple rows = that person's open jobs, used to resolve inbound routing in CC.2.
CREATE TABLE IF NOT EXISTS public.customer_project_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  contact_name text,
  contact_phone text NOT NULL, -- normalized 10-digit
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_project_contacts_phone
  ON public.customer_project_contacts(organization_id, contact_phone);

ALTER TABLE public.customer_project_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Editors manage customer contacts" ON public.customer_project_contacts;
CREATE POLICY "Editors manage customer contacts" ON public.customer_project_contacts
  FOR ALL
  USING (organization_id = public.get_user_organization_uuid() AND public.user_can_edit())
  WITH CHECK (organization_id = public.get_user_organization_uuid() AND public.user_can_edit());

COMMENT ON TABLE public.customer_project_contacts IS
  'CC.1: The customer/superintendent contact (name + cell) on a job. Same phone across rows = that person''s open jobs.';

-- 2. The SMS thread — one row per message, person-keyed by phone, each tagged to a project.
CREATE TABLE IF NOT EXISTS public.customer_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_phone text NOT NULL, -- normalized 10-digit
  contact_name text,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body text NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL, -- tagged job (nullable until tagged)
  twilio_sid text,
  status text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_messages_thread
  ON public.customer_messages(organization_id, contact_phone, created_at);
CREATE INDEX IF NOT EXISTS idx_customer_messages_project
  ON public.customer_messages(project_id, created_at);

ALTER TABLE public.customer_messages ENABLE ROW LEVEL SECURITY;

-- Office reads/writes their org's threads. Inbound rows (CC.2) are written by the receive-sms
-- webhook via the service role, which bypasses RLS.
DROP POLICY IF EXISTS "Editors manage customer messages" ON public.customer_messages;
CREATE POLICY "Editors manage customer messages" ON public.customer_messages
  FOR ALL
  USING (organization_id = public.get_user_organization_uuid() AND public.user_can_edit())
  WITH CHECK (organization_id = public.get_user_organization_uuid() AND public.user_can_edit());

COMMENT ON TABLE public.customer_messages IS
  'CC.1: Customer/superintendent SMS thread (person-keyed by phone); each message tagged to a project. Office resolves multi-job routing.';

COMMIT;
