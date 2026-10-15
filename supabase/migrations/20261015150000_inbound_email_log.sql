-- Every email forwarded to a job address (files.hshdrywall.com), and what became of it
-- (Mark, 2026-10-15). Written only by the receive-job-email edge function with the service
-- role; the office can read it. Also the idempotency key: Resend retries a webhook, and a
-- retried email must not file its attachments twice.

CREATE TABLE IF NOT EXISTS public.inbound_email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  resend_email_id text NOT NULL UNIQUE,
  received_at timestamptz NOT NULL DEFAULT now(),
  from_address text,
  to_addresses text[] NOT NULL DEFAULT '{}',
  subject text,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN (
    'filed',
    'partly_filed',
    'unknown_sender',
    'unknown_job',
    'no_attachments',
    'failed'
  )),
  files_filed integer NOT NULL DEFAULT 0,
  detail text
);

CREATE INDEX IF NOT EXISTS idx_inbound_email_log_project
  ON public.inbound_email_log (project_id, received_at DESC);

ALTER TABLE public.inbound_email_log ENABLE ROW LEVEL SECURITY;

-- No INSERT / UPDATE / DELETE policy: only the service role writes.
DROP POLICY IF EXISTS "Office reads inbound email log" ON public.inbound_email_log;
CREATE POLICY "Office reads inbound email log" ON public.inbound_email_log
  FOR SELECT
  USING (organization_id = public.get_user_organization_uuid() AND public.user_can_edit());

REVOKE ALL ON public.inbound_email_log FROM anon;

COMMENT ON TABLE public.inbound_email_log IS
  'Emails forwarded to a job address at files.hshdrywall.com and their outcome. Service-role writes only (receive-job-email).';
